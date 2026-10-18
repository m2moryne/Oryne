/**
 * Prints the testnet keys the API generated in data/, as env lines to paste into
 * a host whose disk doesn't persist (Render's free plan). The test USDC's ID follows
 * from its issuer, so TOKEN_ID stays unset (setting it turns the faucet off).
 * Usage: npm run keys -w @oryne/api
 */
import { loadConfig } from './config.ts'
import { getKv, openDb } from './db.ts'

const db = openDb(loadConfig().dataDir)
for (const [name, key] of [
  ['SPONSOR_SECRET', 'sponsor_secret'],
  ['TOKEN_ISSUER_SECRET', 'token_issuer_secret'],
] as const) {
  const value = getKv(db, key)
  if (value) console.log(`${name}=${value}`)
}
