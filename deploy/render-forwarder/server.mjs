// Forwards every request to TARGET, unchanged. Runs on Render after the move to
// the server, in place of the API, so SDKs and integrations still using the
// old onrender.com address keep working. See deploy/README.md, "Cut over".
//
//   TARGET=https://testnet-apiv1.oryne.org node deploy/render-forwarder/server.mjs
//
// It holds no keys and runs nothing on Stellar, so it can never act as a
// second copy of the API.
import { createServer } from 'node:http'

const target = process.env.TARGET
if (!target) {
  console.error('Set TARGET to the API this forwards to, e.g. https://testnet-apiv1.oryne.org')
  process.exit(1)
}
const port = Number(process.env.PORT ?? 10000)

// Hop-by-hop and length headers: fetch and Node set their own.
const skipRequest = new Set(['host', 'connection', 'content-length', 'keep-alive', 'transfer-encoding', 'upgrade'])
const skipResponse = new Set(['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding', 'set-cookie'])

createServer(async (req, res) => {
  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined && !skipRequest.has(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const upstream = await fetch(new URL(req.url ?? '/', target), {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: 'half',
      redirect: 'manual',
    })
    const out = {}
    upstream.headers.forEach((value, name) => {
      if (!skipResponse.has(name)) out[name] = value
    })
    const cookies = upstream.headers.getSetCookie()
    if (cookies.length) out['set-cookie'] = cookies
    res.writeHead(upstream.status, out)
    if (upstream.body) for await (const chunk of upstream.body) res.write(chunk)
    res.end()
  } catch (error) {
    console.error(`${req.method} ${req.url}: ${error.message}`)
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'The Oryne API could not be reached. Try again shortly.' }))
  }
}).listen(port, () => console.log(`Forwarding :${port} → ${target}`))
