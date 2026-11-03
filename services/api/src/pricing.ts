import type { Db } from './db.ts'

/**
 * Oryne's pricing: no subscription. Agents' payments are free up to a monthly
 * allowance; past it, a small share of each payment, capped per payment.
 * Receiving payments (merchants, listed services) is always free.
 *
 * Kept in step with apps/web/src/lib/pricing.ts, which shows it on the website.
 */
export const pricing = {
  /** Agent payments each calendar month (UTC) that carry no fee, in USDC. */
  freeMonthly: 100,
  /** Fee on agent payments past the allowance, in basis points (50 = 0.5%). */
  feeBps: 50,
  /** Most we charge on any one payment, in USDC. */
  capPerPayment: 2,
  /** A month whose fee comes to less than this isn't billed, in USDC. */
  minimumBill: 1,
  /** Above this monthly volume we offer lower rates, in USDC. */
  volumeContact: 50_000,
}

const DECIMALS = 7n
const UNIT = 10n ** DECIMALS

/** The calendar month (UTC) containing `at` (seconds): its start and end. */
export function monthOf(at: number) {
  const date = new Date(at * 1000)
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000
  return { start, end, label: date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

/**
 * The fee for a month of settled payments, oldest first: the allowance covers
 * the first `freeMonthly` USDC, then each payment's remainder pays feeBps,
 * capped per payment. Payments the owner approved beyond a mandate count too.
 */
export function feeFor(amounts: bigint[]) {
  const free = BigInt(pricing.freeMonthly) * UNIT
  const cap = BigInt(pricing.capPerPayment) * UNIT
  let volume = 0n
  let fee = 0n
  let billable = 0n
  for (const amount of amounts) {
    const before = volume
    volume += amount
    const charged = volume <= free ? 0n : before >= free ? amount : volume - free
    if (charged === 0n) continue
    billable += charged
    const due = (charged * BigInt(pricing.feeBps)) / 10_000n
    fee += due > cap ? cap : due
  }
  const minimum = BigInt(pricing.minimumBill) * UNIT
  return { volume, freeUsed: volume < free ? volume : free, billable, fee, due: fee >= minimum ? fee : 0n }
}

/** This month so far for one account: what its agents paid and what it would owe. */
export async function billing(db: Db, owner: string, at: number, money: (units: bigint) => string, live: boolean) {
  const month = monthOf(at)
  const rows = await db
    .prepare(
      `select p.amount from payments p join wallets w on w.id = p.wallet_id
       where w.owner = ? and p.status = 'settled' and p.created_at >= ? and p.created_at < ?
       order by p.created_at`,
    )
    .all<{ amount: string }>(owner, month.start, month.end)
  const result = feeFor(rows.map((row) => BigInt(row.amount)))
  return {
    plan: 'Pay as you go',
    /** False on testnet: nothing is charged, the figures show what mainnet would cost. */
    charged: live,
    month: { label: month.label, start: month.start, end: month.end },
    payments: rows.length,
    volume: money(result.volume),
    freeAllowance: money(BigInt(pricing.freeMonthly) * UNIT),
    freeUsed: money(result.freeUsed),
    billable: money(result.billable),
    fee: money(result.fee),
    due: money(result.due),
    pricing,
  }
}
