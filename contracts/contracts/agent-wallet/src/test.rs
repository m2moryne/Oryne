#![cfg(test)]

extern crate std;

use super::*;
use p256::ecdsa::{signature::hazmat::PrehashSigner, Signature as P256Signature, SigningKey as PasskeyKey};
use std::format;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::ContractContext,
    testutils::{Address as _, BytesN as _, Events as _, Ledger},
    Event as _,
    vec, Address, BytesN, Env, IntoVal, Val,
};

const USDC: i128 = 10_000_000; // 7 decimals
const DAY: u64 = 86_400;

struct Setup {
    env: Env,
    wallet: Address,
    client: AgentWalletClient<'static>,
    token: Address,
    agent: SigningKey,
    merchant: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let owner = Address::generate(&env);
    let wallet = env.register(AgentWallet, (Some(owner.clone()), None::<BytesN<65>>));
    let client = AgentWalletClient::new(&env, &wallet);

    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    token::StellarAssetClient::new(&env, &token).mint(&wallet, &(1_000 * USDC));

    let agent = SigningKey::from_bytes(&[7; 32]);
    let merchant = Address::generate(&env);
    client.add_agent(
        &public_key(&env, &agent),
        &Policy {
            token: token.clone(),
            per_tx: 25 * USDC,
            budget: 100 * USDC,
            window_secs: 30 * DAY,
            expires_at: 0,
            payees: vec![&env],
        },
    );

    Setup { env, wallet, client, token, agent, merchant }
}

fn public_key(env: &Env, key: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &key.verifying_key().to_bytes())
}

fn transfer(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) -> Context {
    let args: Vec<Val> = vec![env, from.into_val(env), to.into_val(env), amount.into_val(env)];
    Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name: symbol_short!("transfer"),
        args,
    })
}

/// Runs the wallet's `__check_auth` the way the network would.
fn check(s: &Setup, key: &SigningKey, contexts: Vec<Context>) -> Result<(), Error> {
    let payload = BytesN::<32>::random(&s.env);
    let signature = Signature::Agent(AgentSignature {
        public_key: public_key(&s.env, key),
        signature: BytesN::from_array(&s.env, &key.sign(&payload.to_array()).to_bytes()),
    });
    match s.env.try_invoke_contract_check_auth::<Error>(
        &s.wallet,
        &payload,
        signature.into_val(&s.env),
        &contexts,
    ) {
        Ok(()) => Ok(()),
        Err(Ok(error)) => Err(error),
        Err(Err(other)) => panic!("unexpected host error: {other:?}"),
    }
}

fn pay(s: &Setup, amount: i128) -> Result<(), Error> {
    let to = s.merchant.clone();
    check(s, &s.agent, vec![&s.env, transfer(&s.env, &s.token, &s.wallet, &to, amount)])
}

#[test]
fn pays_within_policy_and_tracks_budget() {
    let s = setup();
    assert_eq!(pay(&s, 20 * USDC), Ok(()));
    assert_eq!(s.client.remaining(&public_key(&s.env, &s.agent)), 80 * USDC);
}

#[test]
fn refuses_over_per_tx_limit() {
    let s = setup();
    assert_eq!(pay(&s, 26 * USDC), Err(Error::OverPerTxLimit));
}

#[test]
fn refuses_over_budget_then_resets_next_window() {
    let s = setup();
    for _ in 0..4 {
        assert_eq!(pay(&s, 25 * USDC), Ok(()));
    }
    assert_eq!(pay(&s, 1 * USDC), Err(Error::OverBudget));

    s.env.ledger().set_timestamp(1_000_000 + 30 * DAY);
    assert_eq!(pay(&s, 25 * USDC), Ok(()));
}

#[test]
fn refuses_unknown_paused_and_expired_agents() {
    let s = setup();
    let stranger = SigningKey::from_bytes(&[9; 32]);
    let ctx = vec![&s.env, transfer(&s.env, &s.token, &s.wallet, &s.merchant, USDC)];
    assert_eq!(check(&s, &stranger, ctx), Err(Error::UnknownAgent));

    let key = public_key(&s.env, &s.agent);
    s.client.set_paused(&key, &true);
    assert_eq!(pay(&s, USDC), Err(Error::AgentPaused));
    s.client.set_paused(&key, &false);

    let mut policy = s.client.agent(&key).unwrap().policy;
    policy.expires_at = 1_000_001;
    s.client.set_policy(&key, &policy);
    s.env.ledger().set_timestamp(1_000_001);
    assert_eq!(pay(&s, USDC), Err(Error::AgentExpired));
}

#[test]
fn refuses_anything_but_a_transfer_of_the_policy_token() {
    let s = setup();
    let other_token = s.env.register_stellar_asset_contract_v2(Address::generate(&s.env)).address();
    let ctx = vec![&s.env, transfer(&s.env, &other_token, &s.wallet, &s.merchant, USDC)];
    assert_eq!(check(&s, &s.agent, ctx), Err(Error::WrongToken));

    let approve = Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name: symbol_short!("approve"),
        args: vec![&s.env, s.wallet.into_val(&s.env)],
    });
    assert_eq!(check(&s, &s.agent, vec![&s.env, approve]), Err(Error::NotATransfer));
}

#[test]
fn enforces_payee_allowlist() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    let mut policy = s.client.agent(&key).unwrap().policy;
    policy.payees = vec![&s.env, Address::generate(&s.env)];
    s.client.set_policy(&key, &policy);
    assert_eq!(pay(&s, USDC), Err(Error::PayeeNotAllowed));
}

#[test]
fn owner_approval_covers_one_payment_once() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    s.client.approve_once(&key, &s.merchant, &(84 * USDC), &0);

    assert_eq!(pay(&s, 84 * USDC), Ok(()));
    // Approved payments don't use up the agent's own budget.
    assert_eq!(s.client.remaining(&key), 100 * USDC);
    // And the approval is gone once used.
    assert_eq!(pay(&s, 84 * USDC), Err(Error::OverPerTxLimit));
}

#[test]
fn revoked_agent_can_no_longer_pay() {
    let s = setup();
    s.client.remove_agent(&public_key(&s.env, &s.agent));
    assert_eq!(pay(&s, USDC), Err(Error::UnknownAgent));
}

#[test]
fn owner_can_withdraw() {
    let s = setup();
    let to = Address::generate(&s.env);
    s.client.withdraw(&s.token, &to, &(10 * USDC));
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&to), 10 * USDC);
}

#[test]
fn rejects_invalid_policy() {
    let s = setup();
    let other = BytesN::<32>::random(&s.env);
    let policy = Policy {
        token: s.token.clone(),
        per_tx: 0,
        budget: USDC,
        window_secs: DAY,
        expires_at: 0,
        payees: vec![&s.env],
    };
    assert_eq!(s.client.try_add_agent(&other, &policy), Err(Ok(Error::InvalidPolicy)));
}

#[test]
fn rejects_a_per_payment_limit_above_the_budget() {
    let s = setup();
    let policy = Policy {
        token: s.token.clone(),
        per_tx: 2 * USDC,
        budget: USDC,
        window_secs: DAY,
        expires_at: 0,
        payees: vec![&s.env],
    };
    let other = BytesN::<32>::random(&s.env);
    assert_eq!(s.client.try_add_agent(&other, &policy), Err(Ok(Error::InvalidPolicy)));
}

// ---------------------------------------------------------------- hardening

#[test]
fn approval_is_not_used_up_by_a_payment_the_policy_allows() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    s.client.approve_once(&key, &s.merchant, &(30 * USDC), &0);

    // A small payment to the same payee is within the policy: it uses the budget, not the approval.
    assert_eq!(pay(&s, USDC), Ok(()));
    assert_eq!(s.client.remaining(&key), 99 * USDC);
    // So the approval is still there for the payment it was meant for.
    assert_eq!(pay(&s, 30 * USDC), Ok(()));
    assert_eq!(s.client.remaining(&key), 99 * USDC);
}

#[test]
fn approval_cannot_already_be_expired_and_stops_working_when_it_expires() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    let now = s.env.ledger().timestamp();
    assert_eq!(
        s.client.try_approve_once(&key, &s.merchant, &(30 * USDC), &now),
        Err(Ok(Error::InvalidExpiry))
    );
    assert_eq!(
        s.client.try_approve_once(&key, &s.merchant, &(30 * USDC), &(now - 1)),
        Err(Ok(Error::InvalidExpiry))
    );

    s.client.approve_once(&key, &s.merchant, &(30 * USDC), &(now + 60));
    s.env.ledger().set_timestamp(now + 60);
    assert_eq!(pay(&s, 30 * USDC), Err(Error::OverPerTxLimit));
}

#[test]
fn approval_only_covers_its_amount_and_payee() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    s.client.approve_once(&key, &s.merchant, &(30 * USDC), &0);
    assert_eq!(pay(&s, 31 * USDC), Err(Error::OverPerTxLimit));

    let elsewhere = Address::generate(&s.env);
    let ctx = vec![&s.env, transfer(&s.env, &s.token, &s.wallet, &elsewhere, 30 * USDC)];
    assert_eq!(check(&s, &s.agent, ctx), Err(Error::OverPerTxLimit));
}

#[test]
fn removed_agent_cannot_be_added_back() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    // An approval the agent never used...
    s.client.approve_once(&key, &s.merchant, &(30 * USDC), &0);
    s.client.remove_agent(&key);
    // ...can't come back with the key.
    let policy = Policy {
        token: s.token.clone(),
        per_tx: 25 * USDC,
        budget: 100 * USDC,
        window_secs: 30 * DAY,
        expires_at: 0,
        payees: vec![&s.env],
    };
    assert_eq!(s.client.try_add_agent(&key, &policy), Err(Ok(Error::AgentRemoved)));
    assert_eq!(pay(&s, 30 * USDC), Err(Error::UnknownAgent));
}

#[test]
fn refuses_a_transfer_from_another_address() {
    let s = setup();
    let someone = Address::generate(&s.env);
    let ctx = vec![&s.env, transfer(&s.env, &s.token, &someone, &s.merchant, USDC)];
    assert_eq!(check(&s, &s.agent, ctx), Err(Error::NotATransfer));
}

#[test]
fn several_transfers_in_one_authorization_count_together() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    let t = |amount| transfer(&s.env, &s.token, &s.wallet, &s.merchant, amount);

    // 5 x 25 is over the 100 budget, though each one is within the per-payment limit.
    let over = vec![&s.env, t(25 * USDC), t(25 * USDC), t(25 * USDC), t(25 * USDC), t(25 * USDC)];
    assert_eq!(check(&s, &s.agent, over), Err(Error::OverBudget));
    // The refused authorization spent nothing.
    assert_eq!(s.client.remaining(&key), 100 * USDC);

    let within = vec![&s.env, t(25 * USDC), t(25 * USDC), t(10 * USDC)];
    assert_eq!(check(&s, &s.agent, within), Ok(()));
    assert_eq!(s.client.remaining(&key), 40 * USDC);
}

#[test]
fn owner_actions_are_recorded_on_chain() {
    let s = setup();
    let key = public_key(&s.env, &s.agent);
    let events = |s: &Setup| s.env.events().all().filter_by_contract(&s.wallet);

    let mut policy = s.client.agent(&key).unwrap().policy;
    policy.per_tx = 5 * USDC;
    s.client.set_policy(&key, &policy);
    assert_eq!(events(&s), [PolicyChanged { agent: key.clone(), policy }.to_xdr(&s.env, &s.wallet)]);

    s.client.set_paused(&key, &true);
    assert_eq!(events(&s), [PausedChanged { agent: key.clone(), paused: true }.to_xdr(&s.env, &s.wallet)]);

    s.client.approve_once(&key, &s.merchant, &(30 * USDC), &0);
    assert_eq!(
        events(&s),
        [ApprovalGranted { agent: key.clone(), payee: s.merchant.clone(), amount: 30 * USDC, expires_at: 0 }
            .to_xdr(&s.env, &s.wallet)]
    );

    let to = Address::generate(&s.env);
    s.client.withdraw(&s.token, &to, &USDC);
    assert_eq!(
        events(&s),
        [Withdrawn { token: s.token.clone(), to, amount: USDC }.to_xdr(&s.env, &s.wallet)]
    );

    let new_owner = Address::generate(&s.env);
    s.client.set_owner(&new_owner);
    assert_eq!(events(&s), [OwnerChanged { owner: new_owner, passkey: None }.to_xdr(&s.env, &s.wallet)]);
}

// ---------------------------------------------------------------- passkey owners

fn passkey_public_key(env: &Env, key: &PasskeyKey) -> BytesN<65> {
    let point = key.verifying_key().to_encoded_point(false);
    BytesN::from_array(env, point.as_bytes().try_into().unwrap())
}

/// Builds the assertion a browser returns from navigator.credentials.get()
/// with `challenge` as the challenge, signed by `key`.
fn passkey_assertion(env: &Env, key: &PasskeyKey, challenge: &BytesN<32>) -> Signature {
    let mut authenticator_data = [0u8; 37];
    authenticator_data[32] = 0x05; // user present + user verified

    let mut encoded = [0u8; 43];
    base64url(&challenge.to_array(), &mut encoded);
    let client_data = format!(
        r#"{{"type":"webauthn.get","challenge":"{}","origin":"http://localhost:5173","crossOrigin":false}}"#,
        core::str::from_utf8(&encoded).unwrap()
    );

    let client_data = Bytes::from_slice(env, client_data.as_bytes());
    let mut message = Bytes::from_slice(env, &authenticator_data);
    message.append(&Bytes::from(env.crypto().sha256(&client_data)));
    let digest = env.crypto().sha256(&message).to_array();

    let signature: P256Signature = key.sign_prehash(&digest).unwrap();
    let signature = signature.normalize_s().unwrap_or(signature);
    let (r, s) = signature.split_bytes();
    let mut bytes = [0u8; 64];
    bytes[..32].copy_from_slice(&r);
    bytes[32..].copy_from_slice(&s);

    Signature::Passkey(PasskeySignature {
        authenticator_data: Bytes::from_slice(env, &authenticator_data),
        client_data_json: client_data,
        signature: BytesN::from_array(env, &bytes),
    })
}

fn check_passkey(env: &Env, wallet: &Address, signature: Signature, payload: &BytesN<32>) -> Result<(), Error> {
    let contexts: Vec<Context> = vec![env];
    match env.try_invoke_contract_check_auth::<Error>(wallet, payload, signature.into_val(env), &contexts) {
        Ok(()) => Ok(()),
        Err(Ok(error)) => Err(error),
        Err(Err(other)) => panic!("host error: {other:?}"),
    }
}

fn passkey_wallet() -> (Env, Address, PasskeyKey) {
    let env = Env::default();
    let key = PasskeyKey::from_slice(&[3u8; 32]).unwrap();
    let wallet = env.register(AgentWallet, (None::<Address>, Some(passkey_public_key(&env, &key))));
    (env, wallet, key)
}

#[test]
fn passkey_wallet_owns_itself() {
    let (env, wallet, key) = passkey_wallet();
    let client = AgentWalletClient::new(&env, &wallet);
    assert_eq!(client.owner(), wallet);
    assert_eq!(client.passkey(), Some(passkey_public_key(&env, &key)));
}

#[test]
fn passkey_signature_for_this_payload_authorizes() {
    let (env, wallet, key) = passkey_wallet();
    let payload = BytesN::<32>::random(&env);
    assert_eq!(check_passkey(&env, &wallet, passkey_assertion(&env, &key, &payload), &payload), Ok(()));
}

#[test]
fn passkey_signature_for_another_payload_is_refused() {
    let (env, wallet, key) = passkey_wallet();
    let payload = BytesN::<32>::random(&env);
    let other = BytesN::<32>::random(&env);
    assert_eq!(
        check_passkey(&env, &wallet, passkey_assertion(&env, &key, &other), &payload),
        Err(Error::InvalidPasskeySignature)
    );
}

#[test]
fn another_passkey_cannot_sign() {
    let (env, wallet, _) = passkey_wallet();
    let stranger = PasskeyKey::from_slice(&[4u8; 32]).unwrap();
    let payload = BytesN::<32>::random(&env);
    let contexts: Vec<Context> = vec![&env];
    let result = env.try_invoke_contract_check_auth::<Error>(
        &wallet,
        &payload,
        passkey_assertion(&env, &stranger, &payload).into_val(&env),
        &contexts,
    );
    assert!(result.is_err());
}

#[test]
fn address_owned_wallet_rejects_passkey_signatures() {
    let s = setup();
    let key = PasskeyKey::from_slice(&[3u8; 32]).unwrap();
    let payload = BytesN::<32>::random(&s.env);
    assert_eq!(
        check_passkey(&s.env, &s.wallet, passkey_assertion(&s.env, &key, &payload), &payload),
        Err(Error::NoPasskey)
    );
}

#[test]
fn agents_still_pay_from_a_passkey_wallet() {
    let (env, wallet, _) = passkey_wallet();
    env.mock_all_auths();
    let client = AgentWalletClient::new(&env, &wallet);
    let token = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    let agent = SigningKey::from_bytes(&[7; 32]);
    client.add_agent(
        &public_key(&env, &agent),
        &Policy { token: token.clone(), per_tx: USDC, budget: 10 * USDC, window_secs: DAY, expires_at: 0, payees: vec![&env] },
    );

    let payload = BytesN::<32>::random(&env);
    let signature = Signature::Agent(AgentSignature {
        public_key: public_key(&env, &agent),
        signature: BytesN::from_array(&env, &agent.sign(&payload.to_array()).to_bytes()),
    });
    let merchant = Address::generate(&env);
    let contexts = vec![&env, transfer(&env, &token, &wallet, &merchant, USDC)];
    assert_eq!(
        env.try_invoke_contract_check_auth::<Error>(&wallet, &payload, signature.into_val(&env), &contexts),
        Ok(())
    );
}
