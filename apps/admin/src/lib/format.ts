export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

/** Unix seconds to a short local date and time. */
export const when = (seconds: number | null | undefined) =>
  seconds
    ? new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never'

/** G…/C… addresses and other long IDs, shortened for tables. */
export const short = (value: string | null | undefined, head = 4, tail = 4) =>
  !value ? '—' : value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`

export const usdc = (value: string | number) => `${value} USDC`

export const count = (value: number) => value.toLocaleString()

/** stellar.expert link for an address, contract or transaction on the API's network. */
export function explorer(network: string, kind: 'account' | 'contract' | 'tx', id: string) {
  const net = network === 'stellar-mainnet' ? 'public' : 'testnet'
  return `https://stellar.expert/explorer/${net}/${kind}/${id}`
}
