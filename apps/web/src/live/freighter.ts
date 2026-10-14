import {
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
} from '@stellar/freighter-api'
import { api, type Intent, type Session } from './api'

/**
 * Freighter is the owner's wallet in this first version: it signs the
 * sign-in message and every owner transaction. Keys never leave it.
 */

export class WalletError extends Error {}

const failIf = (error: unknown, fallback: string) => {
  if (!error) return
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback
  throw new WalletError(message || fallback)
}

export async function connectFreighter(): Promise<string> {
  const connected = await isConnected()
  if (!connected.isConnected) {
    throw new WalletError('Freighter is not installed. Add it from freighter.app, then reload this page.')
  }
  const access = await requestAccess()
  failIf(access.error, 'Freighter did not share an account')
  if (!access.address) throw new WalletError('Freighter did not share an account')
  return access.address
}

const toBase64 = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) {
    let binary = ''
    value.forEach((byte) => (binary += String.fromCharCode(byte)))
    return btoa(binary)
  }
  throw new WalletError('Freighter returned no signature')
}

/** Sign in: Freighter signs a one-time message (SEP-53); the API returns a session. */
export async function signIn(networkPassphrase: string): Promise<Session> {
  const address = await connectFreighter()
  const challenge = await api<{ nonce: string; message: string }>('/v1/auth/challenge', { body: { address } })
  const signed = await signMessage(challenge.message, { address, networkPassphrase })
  failIf(signed.error, 'Signing was cancelled')
  return api<Session>('/v1/auth/verify', {
    body: { nonce: challenge.nonce, signature: toBase64(signed.signedMessage) },
  })
}

/** Has Freighter sign an intent's transaction, then hands it back to the API to submit. */
export async function signAndSubmit(intent: Intent, session: Session) {
  if (intent.mode !== 'envelope') throw new WalletError('This wallet is owned by a passkey')
  const signed = await signTransaction(intent.xdr, {
    networkPassphrase: intent.networkPassphrase,
    address: session.address,
  })
  failIf(signed.error, 'Signing was cancelled')
  return api<{ hash: string; ledger: number }>(`/v1/intents/${intent.id}/submit`, {
    body: { signedXdr: signed.signedTxXdr },
    token: session.token,
  })
}
