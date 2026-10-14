/**
 * Passkeys (WebAuthn) for wallet owners who sign in with Google or GitHub.
 * The private key is created and kept by the device (Face ID, Touch ID,
 * Windows Hello, a phone or a security key); Oryne only ever sees the public
 * key and signatures.
 */

export class PasskeyError extends Error {}

const toBase64url = (input: ArrayBuffer | Uint8Array) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64url = (text: string) => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

export const passkeysSupported = () =>
  typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials

const friendly = (error: unknown) => {
  const name = (error as Error)?.name
  if (name === 'NotAllowedError') return new PasskeyError('The passkey prompt was cancelled or timed out.')
  if (name === 'InvalidStateError') return new PasskeyError('This device already has a passkey for this account.')
  return new PasskeyError((error as Error)?.message || 'Passkey failed')
}

/** Creates the passkey that will own the wallet. Returns its public key (SPKI) and credential ID. */
export async function createPasskey(user: { name: string; displayName: string }) {
  if (!passkeysSupported()) throw new PasskeyError('This browser does not support passkeys.')
  let credential: PublicKeyCredential
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Oryne', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: user.name, displayName: user.displayName },
        // ES256 (P-256): the curve Soroban verifies natively.
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        attestation: 'none',
        timeout: 120_000,
      },
    })) as PublicKeyCredential
  } catch (error) {
    throw friendly(error)
  }
  const response = credential.response as AuthenticatorAttestationResponse
  if (response.getPublicKeyAlgorithm?.() !== -7) throw new PasskeyError('This authenticator did not create a P-256 key.')
  const spki = response.getPublicKey?.()
  if (!spki) throw new PasskeyError('This browser did not return the passkey public key.')
  return { publicKey: toBase64url(spki), credentialId: toBase64url(credential.rawId) }
}

/** Signs an owner action: the challenge is the Stellar authorization payload the wallet checks. */
export async function signWithPasskey(challenge: string, credentialIds: string[]) {
  let credential: PublicKeyCredential
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge: fromBase64url(challenge),
        rpId: location.hostname,
        allowCredentials: credentialIds.map((id) => ({ type: 'public-key' as const, id: fromBase64url(id) })),
        userVerification: 'preferred',
        timeout: 120_000,
      },
    })) as PublicKeyCredential
  } catch (error) {
    throw friendly(error)
  }
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    authenticatorData: toBase64url(response.authenticatorData),
    clientDataJSON: toBase64url(response.clientDataJSON),
    // DER; the API converts it to the 64-byte low-S form the contract needs.
    signature: toBase64url(response.signature),
  }
}
