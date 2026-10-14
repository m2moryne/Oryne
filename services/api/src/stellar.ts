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
}

function queue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}

async function exists(rpcServer: rpc.Server, publicKey: string) {
  try {
    await rpcServer.getAccount(publicKey)
    return true
  } catch {
    return false
  }
}

async function ensureFunded(network: NetworkConfig, rpcServer: rpc.Server, keypair: Keypair) {
  if (await exists(rpcServer, keypair.publicKey())) return
  if (!network.friendbotUrl) throw new Error(`Account ${keypair.publicKey()} does not exist on ${network.name}`)
  await fundWithFriendbot(network, keypair.publicKey())
}

function storedKeypair(db: Db, key: string, fromEnv?: string) {
  if (fromEnv) return Keypair.fromSecret(fromEnv)
  const stored = getKv(db, key)
  if (stored) return Keypair.fromSecret(stored)
  const fresh = Keypair.random()
  setKv(db, key, fresh.secret())
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

  const sponsor = storedKeypair(db, 'sponsor_secret', config.sponsorSecret)
  await ensureFunded(network, rpcServer, sponsor)

  // The token agents spend.
  let token = config.tokenId ?? network.token ?? getKv(db, 'token_id')
  let issuer: Keypair | undefined
  if (testnet && !config.tokenId) {
    issuer = storedKeypair(db, 'token_issuer_secret')
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
      setKv(db, 'token_id', token)
    }
  }
  if (!token) throw new Error('TOKEN_ID is required on this network')

  // The agent-wallet code every owner's wallet is deployed from.
  let wasmHashHex = config.walletWasmHash ?? getKv(db, 'wallet_wasm_hash')
  if (!wasmHashHex) {
    const wasm = await loadWasm(config.walletWasm)
    wasmHashHex = Buffer.from(hash(wasm)).toString('hex')
    await prepareSignSubmit(
      rpcServer,
      await buildTx(rpcServer, network, sponsor.publicKey(), Operation.uploadContractWasm({ wasm })),
      sponsor,
    )
    setKv(db, 'wallet_wasm_hash', wasmHashHex)
  }

  return {
    network: { ...network, token },
    rpc: rpcServer,
    sponsor,
    issuer,
    walletWasmHash: Buffer.from(wasmHashHex, 'hex'),
    serial: queue(),
  }
}

/** Read-only contract call, simulated from the sponsor account. */
export const readContract = <T>(chain: Chain, operation: Parameters<typeof read>[3]) =>
  read<T>(chain.rpc, chain.network, chain.sponsor.publicKey(), operation)
