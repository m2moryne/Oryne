import { readFile } from 'node:fs/promises'
import {
  buildTx,
  fundWithFriendbot,
  prepareSignSubmit,
  read,
  server,
  type NetworkConfig,
} from '@oryne/core'
import { Asset, hash, Keypair, Operation, rpc } from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { getKv, setKv, type Db } from './db.ts'

/**
 * The API's connection to Stellar: the sponsor account that pays fees and
 * deploys wallets, the token agents spend, and the uploaded wallet wasm.
 * On testnet all three are created on first start and remembered.
 */
export type Chain = {
  network: NetworkConfig & { token: string }
  rpc: rpc.Server
  sponsor: Keypair
  /** Testnet only: the test-USDC issuer, which can mint. */
  issuer?: Keypair
  walletWasmHash: Buffer
  /** Runs sponsor-signed submissions one at a time, so sequence numbers never clash. */
  serial: <T>(task: () => Promise<T>) => Promise<T>
  /** The sponsor's daily fee allowance (SPONSOR_DAILY_XLM). */
  budget: SponsorBudget
}

export type SponsorBudget = {
  /** Throws 503 when today's sponsored fees have reached the cap. Call before a sponsor-paid transaction. */
  check(): Promise<void>
  /** Adds a landed transaction's fee (stroops) to today's total. */
  spent(stroops: bigint | undefined): Promise<void>
  /** Today's total and the cap, in XLM; cap is null when there is none. */
  today(): Promise<{ day: string; spent: string; cap: string | null }>
}

const STROOPS = 10_000_000n
const xlm = (stroops: bigint) => (Number(stroops) / Number(STROOPS)).toFixed(7).replace(/\.?0+$/, '')

function sponsorBudget(db: Db, capXlm: number): SponsorBudget {
  const cap = capXlm > 0 ? BigInt(Math.round(capXlm * Number(STROOPS))) : null
  const day = () => new Date().toISOString().slice(0, 10)
  const key = () => `sponsor_fees:${day()}`
  const total = async () => BigInt((await getKv(db, key())) ?? '0')
  return {
    async check() {
      if (cap !== null && (await total()) >= cap) {
        throw new HTTPException(503, {
          message: 'Oryne has reached today’s limit for network fees it pays. Try again after midnight UTC.',
        })
      }
    },
    async spent(stroops) {
      if (!stroops) return
      await setKv(db, key(), ((await total()) + stroops).toString())
    },
    async today() {
      return { day: day(), spent: xlm(await total()), cap: cap === null ? null : xlm(cap) }
    },
  }
}

function queue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}

/**
 * Whether an account exists. Only a clear "not found" from the RPC counts as
 * missing: a timeout or an RPC hiccup is retried and then thrown, so a slow
 * network never looks like a missing account (which would ask friendbot for
 * XLM on testnet and stop the server on mainnet).
 */
async function exists(rpcServer: rpc.Server, publicKey: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await rpcServer.getAccount(publicKey)
      return true
    } catch (error) {
      if (/not found/i.test(String((error as Error)?.message ?? error))) return false
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
    }
  }
  throw new Error(`Couldn’t reach Stellar RPC to check ${publicKey}: ${(lastError as Error)?.message ?? lastError}`)
}

async function ensureFunded(network: NetworkConfig, rpcServer: rpc.Server, keypair: Keypair) {
  if (await exists(rpcServer, keypair.publicKey())) return
  if (!network.friendbotUrl) throw new Error(`Account ${keypair.publicKey()} does not exist on ${network.name}`)
  await fundWithFriendbot(network, keypair.publicKey())
}

async function storedKeypair(db: Db, key: string, fromEnv?: string) {
  if (fromEnv) return Keypair.fromSecret(fromEnv)
  const stored = await getKv(db, key)
  if (stored) return Keypair.fromSecret(stored)
  const fresh = Keypair.random()
  await setKv(db, key, fresh.secret())
  return fresh
}

async function loadWasm(source: string) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Could not download the wallet wasm from ${source}: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
  return readFile(source)
}

export async function connect(config: Config, db: Db): Promise<Chain> {
  const { network } = config
  const rpcServer = server(network)
  const testnet = network.name === 'testnet'
  if (!testnet && !config.sponsorSecret) throw new Error('SPONSOR_SECRET is required outside testnet')

  const sponsor = await storedKeypair(db, 'sponsor_secret', config.sponsorSecret)
  const budget = sponsorBudget(db, config.sponsorDailyXlm)
  await ensureFunded(network, rpcServer, sponsor)

  // The token agents spend.
  let token = config.tokenId ?? network.token ?? await getKv(db, 'token_id')
  let issuer: Keypair | undefined
  if (testnet && !config.tokenId) {
    issuer = await storedKeypair(db, 'token_issuer_secret', config.tokenIssuerSecret)
    await ensureFunded(network, rpcServer, issuer)
    if (!token) {
      const asset = new Asset('USDC', issuer.publicKey())
      token = asset.contractId(network.networkPassphrase)
      try {
        await prepareSignSubmit(
          rpcServer,
          await buildTx(rpcServer, network, issuer.publicKey(), Operation.createStellarAssetContract({ asset })),
          issuer,
        )
      } catch (error) {
        // Already deployed is fine.
        if (!String(error).includes('ExistingValue') && !String(error).includes('already exists')) throw error
      }
      await setKv(db, 'token_id', token)
    }
  }
  if (!token) throw new Error('TOKEN_ID is required on this network')

  // The agent-wallet code every new wallet is deployed from. Unless pinned with
  // WALLET_WASM_HASH, fetch the latest build and upload it when it has changed.
  // Outside testnet uploading costs real XLM and changes the code new wallets
  // run, so it happens once: later builds are only used once pinned.
  let wasmHashHex = config.walletWasmHash
  const knownWasm = wasmHashHex ? undefined : await getKv(db, 'wallet_wasm_hash')
  if (!wasmHashHex && knownWasm && !testnet) {
    wasmHashHex = knownWasm
  } else if (!wasmHashHex) {
    const known = knownWasm
    try {
      const wasm = await loadWasm(config.walletWasm)
      const latest = Buffer.from(hash(wasm)).toString('hex')
      if (latest !== known) {
        const uploaded = await prepareSignSubmit(
          rpcServer,
          await buildTx(rpcServer, network, sponsor.publicKey(), Operation.uploadContractWasm({ wasm })),
          sponsor,
        )
        await budget.spent(uploaded.feeCharged)
        await setKv(db, 'wallet_wasm_hash', latest)
      }
      wasmHashHex = latest
    } catch (error) {
      if (!known) throw error
      console.warn(`Could not refresh the wallet wasm (${(error as Error).message}); using ${known}`)
      wasmHashHex = known
    }
  }

  return {
    network: { ...network, token },
    rpc: rpcServer,
    sponsor,
    issuer,
    walletWasmHash: Buffer.from(wasmHashHex, 'hex'),
    serial: queue(),
    budget,
  }
}

/** Read-only contract call, simulated from the sponsor account. */
export const readContract = <T>(chain: Chain, operation: Parameters<typeof read>[3]) =>
  read<T>(chain.rpc, chain.network, chain.sponsor.publicKey(), operation)
