# Security

Oryne moves money, so we take reports seriously and will credit you for them.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request.** Report it privately:

- **GitHub:** [Report a vulnerability](https://github.com/m2moryne/Oryne/security/advisories/new)
  (the *Security* tab of this repository). Only the maintainers can see it.
- Or through the [contact page](https://oryne.org/contact), asking for a private channel.

Include what you found, how to reproduce it (on **testnet**), and what an attacker could do with it.
Don't access other people's wallets or data, and don't test against mainnet funds.

We aim to reply within **3 working days**, and to keep you updated until it's fixed. Once it is, we'll
publish an advisory and credit you, unless you'd rather stay anonymous.

## What's in scope

- **The agent-wallet contract** (`contracts/agent-wallet`): any way to move funds outside an agent's
  mandate, bypass `__check_auth`, or act as the owner.
- **The API** (`services/api`): sign-in, sessions, the x402 facilitator, approvals, admin routes.
- **The SDKs** (`packages/*`): anything that leaks a key or signs more than it should.
- **The website and dashboard** (`apps/web`).

## Status

The contract has **not been independently audited yet**. Mainnet is open by invitation only, with
small amounts, until it is. See the [security page](https://oryne.org/security) for the design and
its limits.
