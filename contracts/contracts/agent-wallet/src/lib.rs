//! Oryne agent wallet.
//!
//! A Soroban smart account that holds funds for one owner and lets AI agents
//! spend from it, but only inside a mandate the owner sets. The limits are
//! enforced here, in `__check_auth`, not in Oryne's servers: an agent key that
//! leaks, or an agent that is prompt-injected, still cannot move more than its
//! policy allows, and neither can Oryne.
//!
//! How a payment works:
//! 1. The agent builds a token `transfer(from = this wallet, to, amount)` call,
//!    for example to answer an x402 `402 Payment Required` response.
//! 2. It signs the Soroban authorization payload with its ed25519 session key.
//! 3. The network calls this contract's `__check_auth`, which verifies the
//!    signature and checks the transfer against the agent's policy.
//!
//! The owner manages agents and withdraws funds through ordinary contract
//! calls that require the owner's authorization. The owner is either:
//! - any Stellar address (a G-account such as Freighter, a multisig, another
//!   contract), which authorizes the usual way; or
//! - a passkey (WebAuthn, secp256r1) stored in this wallet. The wallet is then
//!   its own owner and `__check_auth` verifies the passkey signature, so no
//!   browser extension or seed phrase is needed and fees can be sponsored.

#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, token, Address, Bytes, BytesN, Env, MuxedAddress, TryFromVal, Vec,
};

/// Longest WebAuthn clientDataJSON accepted. Real ones are around 150-250 bytes.
const MAX_CLIENT_DATA: usize = 1024;

/// About 30 days of ledgers at 5 seconds each.
const TTL_EXTEND_TO: u32 = 518_400;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - 17_280;

/// What an agent may do with the wallet's money.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    /// The one asset the agent may spend, e.g. the USDC Stellar Asset Contract.
    pub token: Address,
    /// Most the agent may send in a single transfer, in the token's base units.
    pub per_tx: i128,
    /// Most the agent may send in one budget window.
    pub budget: i128,
    /// Length of the budget window in seconds (e.g. 2_592_000 for 30 days).
    pub window_secs: u64,
    /// Ledger timestamp after which the agent can no longer spend. 0 = never.
    pub expires_at: u64,
    /// Payees the agent may pay. Empty means any payee.
    pub payees: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agent {
    pub policy: Policy,
    pub paused: bool,
}

/// What an agent has spent in its current budget window.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spend {
    pub window_start: u64,
    pub spent: i128,
}

/// A one-off approval from the owner for a payment the policy would refuse,
/// such as one over the per-transfer limit. Used up by the first matching
/// transfer to `payee` of at most `amount`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Allowance {
    pub amount: i128,
    pub expires_at: u64,
}

/// The signature an agent attaches to an authorization entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentSignature {
    pub public_key: BytesN<32>,
    pub signature: BytesN<64>,
}

/// A passkey (WebAuthn) assertion, as the browser returns it, with the
/// signature converted from DER to 64-byte r||s with a low S.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PasskeySignature {
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    pub signature: BytesN<64>,
}

/// What can sign for this wallet: an agent (limited by its policy) or the
/// owner's passkey (anything).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Signature {
    Agent(AgentSignature),
    Passkey(PasskeySignature),
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    /// Uncompressed secp256r1 public key, when a passkey owns the wallet.
    Passkey,
    Agent(BytesN<32>),
    Spend(BytesN<32>),
    Allowance(BytesN<32>, Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    UnknownAgent = 1,
    AgentPaused = 2,
    AgentExpired = 3,
    /// Agents may only authorize token transfers, nothing else.
    NotATransfer = 4,
    WrongToken = 5,
    PayeeNotAllowed = 6,
    OverPerTxLimit = 7,
    OverBudget = 8,
    InvalidAmount = 9,
    AgentExists = 10,
    InvalidPolicy = 11,
    /// A passkey signature, but this wallet has no passkey owner.
    NoPasskey = 12,
    /// The passkey assertion is malformed or not for this payload.
    InvalidPasskeySignature = 13,
}

#[contractevent(topics = ["agent_added"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentAdded {
    #[topic]
    pub agent: BytesN<32>,
    pub policy: Policy,
}

#[contractevent(topics = ["agent_removed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRemoved {
    #[topic]
    pub agent: BytesN<32>,
}

/// Emitted for every transfer an agent authorizes, so each payment can be
/// traced back to the mandate that allowed it.
#[contractevent(topics = ["agent_spend"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentSpend {
    #[topic]
    pub agent: BytesN<32>,
    #[topic]
    pub payee: Address,
    pub amount: i128,
    /// True when an owner approval, not the policy, covered this payment.
    pub approved_by_owner: bool,
}

#[contract]
pub struct AgentWallet;

#[contractimpl]
impl AgentWallet {
    /// Pass exactly one of `owner` (an address that will authorize owner
    /// calls) or `passkey` (an uncompressed secp256r1 key; the wallet then
    /// owns itself and checks the passkey in `__check_auth`).
    pub fn __constructor(env: Env, owner: Option<Address>, passkey: Option<BytesN<65>>) {
        match (owner, passkey) {
            (Some(owner), None) => env.storage().instance().set(&DataKey::Owner, &owner),
            (None, Some(passkey)) => {
                env.storage().instance().set(&DataKey::Owner, &env.current_contract_address());
                env.storage().instance().set(&DataKey::Passkey, &passkey);
            }
            _ => panic!("pass exactly one of owner or passkey"),
        }
    }

    /// The owner's passkey, if a passkey owns this wallet.
    pub fn passkey(env: Env) -> Option<BytesN<65>> {
        env.storage().instance().get(&DataKey::Passkey)
    }

    /// Moves ownership to a passkey, e.g. to add a new device or replace a lost one.
    pub fn set_passkey(env: Env, passkey: BytesN<65>) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Owner, &env.current_contract_address());
        env.storage().instance().set(&DataKey::Passkey, &passkey);
    }

    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    /// Hands the wallet to another address. Removes any passkey owner.
    pub fn set_owner(env: Env, new_owner: Address) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        env.storage().instance().remove(&DataKey::Passkey);
    }

    pub fn add_agent(env: Env, agent: BytesN<32>, policy: Policy) -> Result<(), Error> {
        require_owner(&env);
        let key = DataKey::Agent(agent.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AgentExists);
        }
        validate(&policy)?;
        env.storage().persistent().set(&key, &Agent { policy: policy.clone(), paused: false });
        bump(&env, &key);
        AgentAdded { agent, policy }.publish(&env);
        Ok(())
    }

    /// Replaces an agent's policy. What it has already spent this window stays counted.
    pub fn set_policy(env: Env, agent: BytesN<32>, policy: Policy) -> Result<(), Error> {
        require_owner(&env);
        validate(&policy)?;
        let mut record = load_agent(&env, &agent)?;
        record.policy = policy;
        save_agent(&env, &agent, &record);
        Ok(())
    }

    pub fn set_paused(env: Env, agent: BytesN<32>, paused: bool) -> Result<(), Error> {
        require_owner(&env);
        let mut record = load_agent(&env, &agent)?;
        record.paused = paused;
        save_agent(&env, &agent, &record);
        Ok(())
    }

    /// Revokes an agent immediately. Its key can never authorize anything again.
    pub fn remove_agent(env: Env, agent: BytesN<32>) {
        require_owner(&env);
        env.storage().persistent().remove(&DataKey::Agent(agent.clone()));
        env.storage().persistent().remove(&DataKey::Spend(agent.clone()));
        AgentRemoved { agent }.publish(&env);
    }

    /// Approves one payment the policy would otherwise refuse. This is how an
    /// "ask me first" request from an agent gets answered on-chain.
    pub fn approve_once(
        env: Env,
        agent: BytesN<32>,
        payee: Address,
        amount: i128,
        expires_at: u64,
    ) -> Result<(), Error> {
        require_owner(&env);
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        load_agent(&env, &agent)?;
        let key = DataKey::Allowance(agent, payee);
        env.storage().persistent().set(&key, &Allowance { amount, expires_at });
        bump(&env, &key);
        Ok(())
    }

    /// Moves funds out of the wallet. Only the owner can do this.
    pub fn withdraw(env: Env, token: Address, to: Address, amount: i128) {
        require_owner(&env);
        token::Client::new(&env, &token).transfer(&env.current_contract_address(), &to, &amount);
    }

    pub fn agent(env: Env, agent: BytesN<32>) -> Option<Agent> {
        env.storage().persistent().get(&DataKey::Agent(agent))
    }

    /// What the agent can still spend in its current window.
    pub fn remaining(env: Env, agent: BytesN<32>) -> Result<i128, Error> {
        let record = load_agent(&env, &agent)?;
        let spend = current_spend(&env, &agent, &record.policy);
        Ok(record.policy.budget - spend.spent)
    }
}

#[contractimpl]
impl CustomAccountInterface for AgentWallet {
    type Signature = Signature;
    type Error = Error;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: Signature,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        match signature {
            // The owner's passkey may authorize anything for this wallet.
            Signature::Passkey(passkey_signature) => {
                let passkey: BytesN<65> =
                    env.storage().instance().get(&DataKey::Passkey).ok_or(Error::NoPasskey)?;
                verify_passkey(&env, &signature_payload, &passkey, &passkey_signature)
            }
            Signature::Agent(agent_signature) => {
                check_agent(env, signature_payload, agent_signature, auth_contexts)
            }
        }
    }
}

/// An agent may only make token transfers, inside its policy.
fn check_agent(
    env: Env,
    signature_payload: Hash<32>,
    signature: AgentSignature,
    auth_contexts: Vec<Context>,
) -> Result<(), Error> {
    // Panics, and so rejects the authorization, on a bad signature.
    env.crypto().ed25519_verify(
        &signature.public_key,
        &signature_payload.into(),
        &signature.signature,
    );

    let key = signature.public_key;
    let record = load_agent(&env, &key)?;
    let policy = &record.policy;
    let now = env.ledger().timestamp();
    if record.paused {
        return Err(Error::AgentPaused);
    }
    if policy.expires_at != 0 && now >= policy.expires_at {
        return Err(Error::AgentExpired);
    }

    let mut spend = current_spend(&env, &key, policy);
    for context in auth_contexts.iter() {
        let (payee, amount) = transfer_args(&env, &context, policy)?;

        // An owner approval covers this payment outright.
        let allowance_key = DataKey::Allowance(key.clone(), payee.clone());
        let allowance: Option<Allowance> = env.storage().persistent().get(&allowance_key);
        if let Some(allowance) = allowance {
            let live = allowance.expires_at == 0 || now < allowance.expires_at;
            if live && amount <= allowance.amount {
                env.storage().persistent().remove(&allowance_key);
                AgentSpend { agent: key.clone(), payee, amount, approved_by_owner: true }
                    .publish(&env);
                continue;
            }
        }

        if !policy.payees.is_empty() && !policy.payees.contains(&payee) {
            return Err(Error::PayeeNotAllowed);
        }
        if amount > policy.per_tx {
            return Err(Error::OverPerTxLimit);
        }
        if spend.spent + amount > policy.budget {
            return Err(Error::OverBudget);
        }
        spend.spent += amount;
        AgentSpend { agent: key.clone(), payee, amount, approved_by_owner: false }.publish(&env);
    }

    let spend_key = DataKey::Spend(key.clone());
    env.storage().persistent().set(&spend_key, &spend);
    bump(&env, &spend_key);
    bump(&env, &DataKey::Agent(key));
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(())
}

/// Verifies a WebAuthn assertion: the challenge in clientDataJSON must be this
/// payload, the user must have been present, and the P-256 signature over
/// authenticatorData || sha256(clientDataJSON) must match the passkey.
fn verify_passkey(
    env: &Env,
    payload: &Hash<32>,
    passkey: &BytesN<65>,
    signature: &PasskeySignature,
) -> Result<(), Error> {
    let auth_data = &signature.authenticator_data;
    // 32-byte RP ID hash, 1 flags byte, 4-byte counter; flag bit 0 = user present.
    if auth_data.len() < 37 || auth_data.get(32).unwrap_or(0) & 0x01 == 0 {
        return Err(Error::InvalidPasskeySignature);
    }

    let client_data = &signature.client_data_json;
    let length = client_data.len() as usize;
    if length > MAX_CLIENT_DATA {
        return Err(Error::InvalidPasskeySignature);
    }
    let mut buffer = [0u8; MAX_CLIENT_DATA];
    client_data.copy_into_slice(&mut buffer[..length]);

    // "challenge":"<43 base64url characters>"
    let mut expected = [0u8; 13 + 43 + 1];
    expected[..13].copy_from_slice(b"\"challenge\":\"");
    base64url(&payload.to_array(), &mut expected[13..56]);
    expected[56] = b'"';
    if !contains(&buffer[..length], &expected) {
        return Err(Error::InvalidPasskeySignature);
    }

    let mut message = auth_data.clone();
    message.append(&Bytes::from(env.crypto().sha256(client_data)));
    let digest = env.crypto().sha256(&message);
    // Panics, and so rejects the authorization, on a bad signature.
    env.crypto().secp256r1_verify(passkey, &digest, &signature.signature);
    Ok(())
}

/// Base64url without padding: 32 bytes in, 43 characters out.
fn base64url(input: &[u8; 32], out: &mut [u8]) {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut o = 0;
    let mut i = 0;
    while i + 3 <= input.len() {
        let n = (input[i] as u32) << 16 | (input[i + 1] as u32) << 8 | input[i + 2] as u32;
        for shift in [18, 12, 6, 0] {
            out[o] = ALPHABET[(n >> shift & 63) as usize];
            o += 1;
        }
        i += 3;
    }
    // The last 2 bytes give 3 characters.
    let n = (input[30] as u32) << 16 | (input[31] as u32) << 8;
    for shift in [18, 12, 6] {
        out[o] = ALPHABET[(n >> shift & 63) as usize];
        o += 1;
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}

/// Accepts only `transfer(from, to, amount)` on the policy's token, and
/// returns the payee and amount.
fn transfer_args(env: &Env, context: &Context, policy: &Policy) -> Result<(Address, i128), Error> {
    let call = match context {
        Context::Contract(call) => call,
        _ => return Err(Error::NotATransfer),
    };
    if call.fn_name != symbol_short!("transfer") || call.args.len() != 3 {
        return Err(Error::NotATransfer);
    }
    if call.contract != policy.token {
        return Err(Error::WrongToken);
    }
    // Since protocol 23 the SAC takes a muxed destination; plain addresses convert too.
    let to = MuxedAddress::try_from_val(env, &call.args.get_unchecked(1))
        .map_err(|_| Error::NotATransfer)?;
    let amount =
        i128::try_from_val(env, &call.args.get_unchecked(2)).map_err(|_| Error::NotATransfer)?;
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    Ok((to.address(), amount))
}

fn require_owner(env: &Env) {
    let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
    owner.require_auth();
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn validate(policy: &Policy) -> Result<(), Error> {
    if policy.per_tx <= 0 || policy.budget <= 0 || policy.window_secs == 0 {
        return Err(Error::InvalidPolicy);
    }
    Ok(())
}

fn load_agent(env: &Env, agent: &BytesN<32>) -> Result<Agent, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Agent(agent.clone()))
        .ok_or(Error::UnknownAgent)
}

fn save_agent(env: &Env, agent: &BytesN<32>, record: &Agent) {
    let key = DataKey::Agent(agent.clone());
    env.storage().persistent().set(&key, record);
    bump(env, &key);
}

/// The agent's spend in its current window; a new window starts once the old one has run out.
fn current_spend(env: &Env, agent: &BytesN<32>, policy: &Policy) -> Spend {
    let now = env.ledger().timestamp();
    let stored: Option<Spend> = env.storage().persistent().get(&DataKey::Spend(agent.clone()));
    match stored {
        Some(spend) if now < spend.window_start.saturating_add(policy.window_secs) => spend,
        _ => Spend { window_start: now, spent: 0 },
    }
}

fn bump(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

mod test;
