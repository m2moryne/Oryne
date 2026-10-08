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
//! The owner (any Stellar address: a passkey smart wallet, a G-account, a
//! multisig) manages agents and withdraws funds through ordinary contract
//! calls that require the owner's own authorization.

#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, token, Address, BytesN, Env, MuxedAddress, TryFromVal, Vec,
};

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

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
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
    pub fn __constructor(env: Env, owner: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    /// Hands the wallet to a new owner, e.g. to rotate a passkey.
    pub fn set_owner(env: Env, new_owner: Address) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Owner, &new_owner);
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
    type Signature = AgentSignature;
    type Error = Error;

    #[allow(non_snake_case)]
    fn __check_auth(
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
