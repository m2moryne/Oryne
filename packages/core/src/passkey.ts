/**
 * WebAuthn helpers shared by the API, the scripts and (copied) the browser.
 * Browsers return P-256 signatures DER-encoded; Soroban's secp256r1_verify
 * wants 64 bytes r||s with S in the lower half of the curve order.
 */

/** Order of the P-256 group. */
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
const HALF_N = N >> 1n

const toBigInt = (bytes: Uint8Array) => bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)

function to32(value: bigint) {
  const out = new Uint8Array(32)
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn)
    value >>= 8n
  }
  return out
}

/** DER ECDSA signature → 64-byte r||s, normalized to low S. Passes a 64-byte input through (normalizing S). */
export function compactSignature(signature: Uint8Array): Uint8Array {
  let r: bigint
  let s: bigint
  if (signature.length === 64) {
    r = toBigInt(signature.slice(0, 32))
    s = toBigInt(signature.slice(32))
  } else {
    // SEQUENCE { INTEGER r, INTEGER s }
    if (signature[0] !== 0x30) throw new Error('Not a DER signature')
    let offset = 2
    const read = () => {
      if (signature[offset] !== 0x02) throw new Error('Malformed DER signature')
      const length = signature[offset + 1]
      const value = signature.slice(offset + 2, offset + 2 + length)
      offset += 2 + length
      return toBigInt(value)
    }
    r = read()
    s = read()
  }
  if (s > HALF_N) s = N - s
  const out = new Uint8Array(64)
  out.set(to32(r), 0)
  out.set(to32(s), 32)
  return out
}

/** The 65-byte uncompressed public key at the end of a P-256 SubjectPublicKeyInfo (what getPublicKey() returns). */
export function publicKeyFromSpki(spki: Uint8Array): Uint8Array {
  const key = spki.slice(spki.length - 65)
  if (key[0] !== 0x04) throw new Error('Expected an uncompressed P-256 key')
  return key
}

export const base64url = {
  encode(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64url')
  },
  decode(text: string) {
    return new Uint8Array(Buffer.from(text, 'base64url'))
  },
}
