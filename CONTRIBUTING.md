# Contributing to Oryne

Thanks for helping. Oryne gives AI agents wallets with limits enforced on Stellar, so the bar for
anything that touches money is high, but most contributions are much smaller than that: a docs fix,
an example, a clearer error message. All of it is welcome.

## Ways to help

- **Try it and tell us what broke.** Run the [research agent example](examples/research-agent) on
  testnet and [open an issue](https://github.com/m2moryne/Oryne/issues/new/choose) for anything
  confusing. A clear bug report is a real contribution.
- **Pick up an issue.** Issues labelled
  [`good first issue`](https://github.com/m2moryne/Oryne/labels/good%20first%20issue) are small and
  well described. Comment on one to say you're taking it, so two people don't do the same work.
- **Add an example.** An agent in another language or framework, or a paid API built with
  `@oryne/merchant`. Put it in `examples/<name>/` with its own README, following
  [`examples/research-agent`](examples/research-agent).
- **Improve the docs.** The README, package READMEs and the site's `/docs` page.

For a bigger change (a new feature, a new API route, anything in the contract), **open an issue
first** and describe what you have in mind. It saves you building something we can't merge.

## Found a security problem?

**Don't open a public issue.** Read [SECURITY.md](SECURITY.md) and report it privately.

## Setting up

You need **Node.js 22.18+**. Rust is only needed if you change the contract.

```sh
git clone https://github.com/m2moryne/Oryne.git
cd Oryne
npm install
npm run dev:api      # the API on Stellar testnet, http://localhost:8787
npm run dev:web      # the website and dashboard, http://localhost:5173
```

The first API start creates its own testnet sponsor account and test USDC, stored in
`services/api/data/`. Everything runs on **testnet**: never put a mainnet key in a local `.env`.
More in [Running it locally](README.md#running-it-locally).

## Where things live

| Folder | What | Language |
|---|---|---|
| `contracts/` | The agent-wallet contract: enforces every limit | Rust (Soroban) |
| `services/api/` | Sign-in, wallets, agents, approvals, the x402 facilitator | TypeScript (Hono) |
| `packages/core` | Shared encoders and payment signing | TypeScript |
| `packages/agent` | `@oryne/agent`: `fetch()` that pays | TypeScript |
| `packages/merchant` | `@oryne/merchant`: charge agents per request | TypeScript |
| `packages/mcp` | `@oryne/mcp`: tools for Claude, Cursor and other MCP clients | TypeScript |
| `apps/web/` | Website, dashboard and developer console | React + Tailwind |
| `examples/` | Runnable examples | Any |

## Making a change

1. **Fork** the repo and create a branch from `master`: `git checkout -b fix-approval-timeout`.
2. Make your change. Keep a pull request to **one thing**; small PRs get reviewed fast.
3. **Check it** before you push:

   ```sh
   npm run typecheck          # every package
   npm test                   # unit tests
   npm run build              # the website builds
   npm run e2e                # the whole payment flow on testnet (needs dev:api and dev:merchant running)
   ```

   Changed the contract? Also `cd contracts && cargo test`.
4. **Open a pull request** and fill in the template: what changed, why, and how you checked it.
   CI runs the same checks.

### Style

- TypeScript, ES modules, no build step for the API (Node runs `.ts` directly).
- Match the code around you: Prettier-style formatting, 2-space indents, single quotes, no semicolons.
- Comments say **why**, not what. Error messages are for people: say what went wrong and what to do.
- Don't add a dependency for something a few lines can do.
- User-facing text is plain English: short sentences, no jargon where a common word works.

### Commits

Write the first line as what the change does, in plain words: *"Approvals: show the agent's
name instead of its key"*. Add a body when the reason isn't obvious.

## Changes that need extra care

- **The contract** (`contracts/`): every change needs tests, and a deployed contract can't be
  edited, so new wallets would run new code while old ones keep the old. Discuss in an issue first.
- **Anything that signs or submits transactions**, handles keys, sessions or money: describe in the
  PR what could go wrong and how you ruled it out.
- **The public SDKs** (`packages/*`): they're on npm. Don't break existing calls; if you must,
  say so in the PR so we can bump the version properly.

## Licence

Oryne is [MIT licensed](LICENSE). By opening a pull request you agree that your contribution is
released under the same licence.

## Code of conduct

Be kind and assume good intent. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
