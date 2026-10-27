# @oryne/mcp

An MCP server that lets any MCP client (Claude, Cursor and others) pay for things from an Oryne wallet, in USDC on Stellar. The wallet's smart contract enforces the limits you set, so the model can't talk its way past them.

## Set up

Connect an agent in the [Oryne dashboard](https://oryne.org/app) and copy its secret key. Then add the server to your client, e.g. Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oryne": {
      "command": "npx",
      "args": ["-y", "@oryne/mcp"],
      "env": { "ORYNE_AGENT_SECRET": "S…" }
    }
  }
}
```

| Variable | |
|---|---|
| `ORYNE_AGENT_SECRET` | The agent's secret key (`S…`). Required. |
| `ORYNE_API_URL` | Oryne API. Defaults to `https://oryne.onrender.com` (Stellar testnet). |
| `ORYNE_MAX_PER_REQUEST` | Most it pays for one request, e.g. `1`. |

## Tools

| Tool | |
|---|---|
| `fetch_paid` | Fetch a URL. If it answers 402 Payment Required, pay it within the mandate and return the response. |
| `wallet_status` | The wallet, the agent's limits and what's left of its budget. |
| `request_approval` | Ask the owner to approve a payment over the limits, with a reason they'll read. |
| `find_service` | Search services that accept agent payments. |

Needs Node 20 or later.

## Links

- [Oryne](https://oryne.org)
- [@oryne/agent](https://www.npmjs.com/package/@oryne/agent): the same from code
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
