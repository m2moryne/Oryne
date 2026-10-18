import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDb } from './db.ts'
import { connect } from './stellar.ts'

const config = loadConfig()
const db = openDb(config.dataDir)

console.log(`Connecting to Stellar ${config.network.name}…`)
const chain = await connect(config, db)
console.log(`  sponsor  ${chain.sponsor.publicKey()}`)
console.log(`  token    ${chain.network.token}`)
console.log(`  wallet   wasm ${chain.walletWasmHash.toString('hex')}`)
console.log(`  browsers ${config.corsOrigins.join(', ')}`)

serve({ fetch: createApp(config, db, chain).fetch, port: config.port }, (info) => {
  console.log(`Oryne API on http://localhost:${info.port}`)
})
