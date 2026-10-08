#![cfg(test)]

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::ContractContext,
    testutils::{Address as _, BytesN as _, Ledger},
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
    let wallet = env.register(AgentWallet, (owner.clone(),));
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
    let signature = AgentSignature {
        public_key: public_key(&s.env, key),
        signature: BytesN::from_array(&s.env, &key.sign(&payload.to_array()).to_bytes()),
    };
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
