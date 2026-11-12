/**
 * Oryne's pricing, as shown on /pricing and in Billing. Kept in step with
 * services/api/src/pricing.ts, which computes what accounts actually owe.
 *
 * No subscription: agents' payments are free up to a monthly allowance, then a
 * small share of each payment, capped. Receiving payments is always free.
 */
export const pricing = {
  freeMonthly: 100,
  feeBps: 50,
  capPerPayment: 2,
  minimumBill: 1,
  volumeContact: 50_000,
}

export const feePercent = `${pricing.feeBps / 100}%`

/** The fee for a month's volume, assuming no single payment reaches the cap. */
export function monthlyFee(volume: number) {
  const fee = Math.max(0, volume - pricing.freeMonthly) * (pricing.feeBps / 10_000)
  return fee < pricing.minimumBill ? 0 : fee
}

export const dollars = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })
