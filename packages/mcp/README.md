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

Restart Claude Desktop after editing the file. The config file is at `%APPDATA%\Claude\claude_desktop_config.json` on Windows and `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS. If the server doesn't start on Windows, run `npx` through `cmd`:

```json
"command": "cmd",
"args": ["/c", "npx", "-y", "@oryne/mcp"]
```

Then ask Claude something like *"Check my Oryne wallet status"* or *"Fetch https://… and pay if it asks"*.

| Variable | |
|---|---|
| `ORYNE_AGENT_SECRET` | The agent's secret key (`S…`). Required. |
| `ORYNE_API_URL` | Oryne API. Defaults to `https://testnet-apiv1.oryne.org` (Stellar testnet). |
| `ORYNE_MAX_PER_REQUEST` | Most it pays for one request, e.g. `1`. |
| `ORYNE_PAYEES` | Who it may pay: `any` (default), `directory` (only services listed in the Oryne directory, at the address they're listed with) or comma-separated Stellar addresses. Checked before anything is signed. |

## Tools

| Tool | |
|---|---|
| `fetch_paid` | Fetch a URL. If it answers 402 Payment Required, pay it within the mandate and return the response. Takes an optional `maxPrice`: what the model expects the request to cost; a service asking more isn't paid. |
| `wallet_status` | The wallet, the agent's limits and what's left of its budget. |
| `request_approval` | Ask the owner to approve a payment over the limits, with a reason they'll read. |
| `find_service` | Search services that accept agent payments. |

Needs Node 20 or later.

## Links

- [Oryne](https://oryne.org)
- [@oryne/agent](https://www.npmjs.com/package/@oryne/agent): the same from code
- [Source](https://github.com/m2moryne/Oryne)

MIT licensed.
