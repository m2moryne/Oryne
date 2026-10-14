/**
 * One-time local setup for the demo merchant on testnet:
 *   - creates a merchant address and funds it with friendbot
 *   - adds a trustline to the API's test USDC so it can be paid
 *   - writes examples/demo-merchant/.env
 *
 * Needs the API running (npm run dev:api). Usage: npm run setup
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

const api = process.env.ORYNE_API_URL ?? 'http://localhost:8787'
const envPath = fileURLToPath(new URL('../examples/demo-merchant/.env', import.meta.url))

const info = (await (await fetch(`${api}/v1/info`)).json()) as {
  network: string
  networkPassphrase: string
  tokenAsset: { code: string; issuer: string } | null
}
if (info.network !== 'stellar-testnet' || !info.tokenAsset) throw new Error('Setup is for testnet only')

let merchant: Keypair
const existing = existsSync(envPath) ? /MERCHANT_SECRET=(S\w+)/.exec(readFileSync(envPath, 'utf8'))?.[1] : undefined
merchant = existing ? Keypair.fromSecret(existing) : Keypair.random()

await fetch(`https://friendbot.stellar.org/?addr=${merchant.publicKey()}`)
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const account = await horizon.loadAccount(merchant.publicKey())
const asset = new Asset(info.tokenAsset.code, info.tokenAsset.issuer)
const trusted = account.balances.some(
  (balance) => 'asset_issuer' in balance && balance.asset_issuer === asset.getIssuer() && balance.asset_code === asset.getCode(),
)
if (!trusted) {
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: info.networkPassphrase })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build()
  tx.sign(merchant)
  await horizon.submitTransaction(tx)
}

writeFileSync(
  envPath,
  `MERCHANT_ADDRESS=${merchant.publicKey()}\nMERCHANT_SECRET=${merchant.secret()}\nFACILITATOR_URL=${api}/v1/x402\n`,
)
console.log(`Merchant ${merchant.publicKey()} is ready (trustline to ${asset.getCode()}).`)
console.log(`Wrote ${envPath}`)
