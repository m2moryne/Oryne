import type { PaymentRequirements } from '@oryne/core'

/**
 * Checks the agent makes before it signs a payment.
 *
 * The wallet contract is the hard limit: it refuses anything outside the
 * mandate, whatever the agent signs. These checks sit in front of it and
 * decide whether the agent should agree to a 402 at all, for example because
 * the service asks to be paid at an address that isn't the one it's listed
 * with. A prompt-injected agent or a compromised service can't rely on the
 * contract alone to stop a payment that is inside the mandate but still wrong.
 */

/**
 * Who the agent may pay:
 * - `'any'`: whoever the service names (the wallet's on-chain payee list still applies);
 * - `'directory'`: only services listed in the Oryne directory, and only at the
 *   address their listing gives for that host;
 * - a list of Stellar addresses: only those.
 */
export type PayeeRule = 'any' | 'directory' | string[]

/** A payment the agent is about to sign. */
export type PaymentCheck = {
  /** The URL that answered 402, after any redirects. */
  url: string
  requirements: PaymentRequirements
  /** The amount in token units, e.g. "0.05". */
  amount: string
}

/** Return `true` to pay, or `false` or a reason to refuse. */
export type BeforePay = (payment: PaymentCheck) => boolean | string | Promise<boolean | string>

export type DirectoryListing = { url: string; payTo: string }

/** Looks up the directory listings for an origin, e.g. "https://api.example.com". */
export type DirectoryLookup = (origin: string) => Promise<DirectoryListing[]>

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`

const originOf = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

/** Why the agent should not pay `payTo` for `url` under `rule`, or undefined if it may. */
export async function payeeRefusal(
  rule: PayeeRule,
  url: string,
  payTo: string,
  directory: DirectoryLookup,
): Promise<string | undefined> {
  if (rule === 'any') return undefined
  if (Array.isArray(rule)) {
    return rule.includes(payTo) ? undefined : `Payee ${short(payTo)} is not in this agent's allowed payees`
  }

  const origin = originOf(url)
  if (!origin) return `Can't tell which service ${url} is`
  let listings: DirectoryListing[]
  try {
    listings = (await directory(origin)).filter((listing) => originOf(listing.url) === origin)
  } catch (error) {
    return `Could not check the Oryne directory: ${(error as Error).message}`
  }
  const host = new URL(origin).host
  if (listings.length === 0) return `${host} is not listed in the Oryne directory`
  if (listings.some((listing) => listing.payTo === payTo)) return undefined
  const listed = [...new Set(listings.map((listing) => short(listing.payTo)))].join(', ')
  return `${host} asks to be paid at ${short(payTo)}, but its directory listing pays ${listed}`
}

/** Runs a `beforePay` hook and turns its answer into a refusal reason, or undefined to pay. */
export async function hookRefusal(hook: BeforePay | undefined, payment: PaymentCheck): Promise<string | undefined> {
  if (!hook) return undefined
  const answer = await hook(payment)
  if (answer === true) return undefined
  return typeof answer === 'string' && answer ? answer : 'Refused by beforePay'
}

/** Reads the PayeeRule from text, as in an environment variable: "any", "directory" or "G…,G…". */
export function parsePayeeRule(value: string | undefined): PayeeRule | undefined {
  const text = value?.trim()
  if (!text) return undefined
  if (text === 'any' || text === 'directory') return text
  return text.split(',').map((address) => address.trim()).filter(Boolean)
}
