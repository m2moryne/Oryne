# Oryne contracts

Soroban smart contracts for Oryne on Stellar.

## `agent-wallet`

A smart account that holds an owner's funds (e.g. USDC) and lets AI agents spend
from it **only inside an on-chain mandate**. Limits live in the contract's
`__check_auth`, so a leaked agent key, a prompt-injected agent, or a compromised
Oryne server still cannot move money outside the policy.

| Owner calls (owner's auth) | What it does |
|---|---|
| `add_agent(key, policy)` | Registers an agent's ed25519 session key with a policy |
| `set_policy(key, policy)` | Changes limits; spend so far in the window stays counted |
| `set_paused(key, bool)` | Freezes or resumes an agent |
| `remove_agent(key)` | Revokes the key permanently |
| `approve_once(key, payee, amount, expires_at)` | Answers an "ask me first" request: one payment beyond the policy |
| `withdraw(token, to, amount)` | Moves funds out |
| `set_owner(address)` | Rotates the owner (passkey wallet, G-account, multisig) |

A **policy** is: one token, a per-transfer cap, a budget per window, the window
length, an optional expiry, and an optional payee allowlist.

Agents can authorize exactly one thing: `transfer(from = wallet, to, amount)` on
the policy's token. That's what an x402 or MPP payment on Stellar is, so the
wallet works as the payer in those flows unchanged. Every authorized transfer
emits an `agent_spend` event (agent, payee, amount, approved_by_owner), which is
what Oryne indexes into receipts.

### Build and test

```sh
cd contracts
cargo test                 # unit tests, incl. __check_auth against every rule
stellar contract build     # -> target/wasm32v1-none/release/agent_wallet.wasm
```

### Deploy to testnet

```sh
stellar keys generate owner --network testnet --fund
stellar contract deploy --wasm target/wasm32v1-none/release/agent_wallet.wasm \
  --source owner --network testnet -- --owner owner
```

### Status and next steps

Scaffold, not audited. Before mainnet funds:

- Get an audit (ask SDF about its audit bank).
- Use rolling windows instead of fixed ones, if the product needs them.
- Add secp256r1/WebAuthn agent keys so hardware-backed keys work.
- Add per-payee and per-category sub-limits.
- Consider building on OpenZeppelin's Stellar smart-account policies.
