# @oryne/core

The Stellar side of Oryne, shared by [@oryne/agent](https://www.npmjs.com/package/@oryne/agent) and [@oryne/merchant](https://www.npmjs.com/package/@oryne/merchant): the agent-wallet contract client, payment authorization and the x402 payload format.

You usually don't install this directly; the agent and merchant packages depend on it.

```sh
npm install @oryne/core
```

## What's in it

- **Networks:** testnet and mainnet settings, and USDC amounts to and from base units (`toBaseUnits`, `fromBaseUnits`).
- **Payments:** building and signing the Soroban authorization an agent attaches to an x402 payment (`signPayment`), and the `X-PAYMENT` header format (`encodeHeader`, `decodeHeader`).
- **Wallet contract:** encoding mandates and signatures for the agent-wallet contract, and naming its errors (`contractErrorName`).

## Links

- [Oryne](https://oryne.org)
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
