import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { buildTx, fromBaseUnits, i128, prepareSignSubmit, toBaseUnits } from '@oryne/core'
import { Address, Keypair, Operation } from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'

/**
 * Money into and out of wallets.
 *
 * Card top-ups: the owner picks an amount of USDC, pays the equivalent by card
 * on Paystack's checkout, and once Paystack confirms the charge the API sends
 * that USDC to the wallet. On testnet it's minted test USDC; on mainnet it
 * comes from the treasury account. A top-up is credited at most once: the
 * Paystack webhook and the owner returning from checkout both confirm it, and
 * whichever claims the row first sends the money.
 *
 * Test USDC from the faucet and withdrawals are recorded here too, so the
 * owner sees every movement in one place.
 */

export type FundRow = {
  id: string
  wallet_id: string
  owner: string
  kind: 'card' | 'test' | 'withdrawal'
  amount: string
  status: 'pending' | 'crediting' | 'completed' | 'failed' | 'review'
  reference: string | null
  charge_amount: number | null
  charge_currency: string | null
  counterparty: string | null
  tx_hash: string | null
  error: string | null
  claim: string | null
  created_at: number
  completed_at: number | null
}

const PAYSTACK = 'https://api.paystack.co'
/** Per card top-up, in USDC. */
const CARD_MIN = '1'
const CARD_MAX = '500'
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

type PaystackTransaction = { status: string; reference: string; amount: number; currency: string; gateway_response?: string }

export function createFunding(config: Config, db: Db, chain: Chain) {
  const decimals = chain.network.decimals
  const paystack = config.paystack
  const treasury = config.treasurySecret ? Keypair.fromSecret(config.treasurySecret) : undefined
  /** Where top-up USDC comes from: minted by the test issuer, or sent from the treasury. */
  const source = chain.issuer ?? treasury
  const cardEnabled = !!paystack && !!source

  // The funding account signs its own transactions; one at a time keeps its sequence numbers in order.
  let tail: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }

  /** Sends USDC to a wallet: minted on testnet, transferred from the treasury elsewhere. Returns the tx hash. */
  function send(to: string, units: bigint) {
    if (!source) throw new HTTPException(503, { message: 'Funding is not set up on this network' })
    const operation = chain.issuer
      ? Operation.invokeContractFunction({
          contract: chain.network.token,
          function: 'mint',
          args: [new Address(to).toScVal(), i128(units)],
        })
      : Operation.invokeContractFunction({
          contract: chain.network.token,
          function: 'transfer',
          args: [new Address(source.publicKey()).toScVal(), new Address(to).toScVal(), i128(units)],
        })
    return serial(async () => {
      const tx = await buildTx(chain.rpc, chain.network, source.publicKey(), operation)
      const result = await prepareSignSubmit(chain.rpc, tx, source)
      return result.hash
    })
  }

  const view = (row: FundRow) => ({
    id: row.id,
    kind: row.kind,
    amount: fromBaseUnits(BigInt(row.amount), decimals),
    status: row.status === 'crediting' ? 'pending' : row.status,
    charge:
      row.charge_amount !== null && row.charge_currency
        ? { amount: (Number(row.charge_amount) / 100).toFixed(2), currency: row.charge_currency }
        : null,
    counterparty: row.counterparty,
    reference: row.reference,
    txHash: row.tx_hash,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  })
  type FundView = ReturnType<typeof view>

  const byId = (id: string) => db.prepare('select * from funds where id = ?').get<FundRow>(id)

  /** Records a movement that has already happened (test USDC, a withdrawal). */
  async function record(input: { wallet: string; owner: string; kind: FundRow['kind']; units: bigint; txHash: string; counterparty?: string }) {
    const at = now()
    await db.prepare(
      `insert into funds (id, wallet_id, owner, kind, amount, status, counterparty, tx_hash, created_at, completed_at)
       values (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
    ).run(newId('fund'), input.wallet, input.owner, input.kind, input.units.toString(), input.counterparty ?? null, input.txHash, at, at)
  }

  async function list(wallet: string): Promise<FundView[]> {
    const rows = await db
      .prepare('select * from funds where wallet_id = ? order by created_at desc limit 200')
      .all(wallet) as FundRow[]
    return rows.map(view)
  }

  async function paystackApi<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
    if (!paystack) throw new HTTPException(503, { message: 'Card top-ups are not set up' })
    const response = await fetch(`${PAYSTACK}${path}`, {
      method: init?.method ?? 'GET',
      headers: { authorization: `Bearer ${paystack.secretKey}`, 'content-type': 'application/json' },
      body: init ? JSON.stringify(init.body) : undefined,
    })
    const data = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T }
    if (!response.ok || !data.status || !data.data) {
      throw new HTTPException(502, { message: `Paystack: ${data.message ?? `error ${response.status}`}` })
    }
    return data.data
  }

  /** What a top-up of `units` USDC costs, in the card currency's subunit (cents, kobo…). */
  const chargeFor = (units: bigint) => Math.round(Number(fromBaseUnits(units, decimals)) * paystack!.rate * 100)

  /** Opens a Paystack checkout for `units` USDC. The owner pays there and comes back to /app/funds. */
  async function startCard(input: { wallet: string; owner: string; units: bigint; email: string }) {
    if (!cardEnabled) throw new HTTPException(503, { message: 'Card top-ups are not available yet' })
    if (input.units < toBaseUnits(CARD_MIN, decimals) || input.units > toBaseUnits(CARD_MAX, decimals)) {
      throw new HTTPException(400, { message: `Top up between ${CARD_MIN} and ${CARD_MAX} USDC at a time` })
    }
    if (!EMAIL.test(input.email)) throw new HTTPException(400, { message: 'A valid email is needed for the card receipt' })

    const reference = `oryne-${randomBytes(12).toString('hex')}`
    const charge = chargeFor(input.units)
    const checkout = await paystackApi<{ authorization_url: string; reference: string }>('/transaction/initialize', {
      method: 'POST',
      body: {
        email: input.email,
        amount: charge,
        currency: paystack!.currency,
        reference,
        callback_url: `${config.webUrl}/app/funds`,
        metadata: {
          wallet: input.wallet,
          usdc: fromBaseUnits(input.units, decimals),
          custom_fields: [{ display_name: 'Oryne wallet', variable_name: 'wallet', value: input.wallet }],
        },
      },
    })
    await db.prepare(
      `insert into funds (id, wallet_id, owner, kind, amount, status, reference, charge_amount, charge_currency, created_at)
       values (?, ?, ?, 'card', ?, 'pending', ?, ?, ?, ?)`,
    ).run(newId('fund'), input.wallet, input.owner, input.units.toString(), reference, charge, paystack!.currency, now())
    return { authorizationUrl: checkout.authorization_url, reference }
  }

  /**
   * Checks a card top-up with Paystack and, if it was paid, sends the USDC.
   * Safe to call any number of times, from the webhook and from the owner.
   */
  async function confirm(reference: string): Promise<FundView> {
    const row = await db.prepare('select * from funds where reference = ?').get<FundRow>(reference)
    if (!row) throw new HTTPException(404, { message: 'No such top-up' })
    if (row.status !== 'pending') return view(row)

    const payment = await paystackApi<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
    if (payment.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(payment.status)) {
        await db.prepare("update funds set status = 'failed', error = ? where id = ? and status = 'pending'").run(
          payment.gateway_response || `Card payment ${payment.status}`,
          row.id,
        )
      }
      return view((await byId(row.id))!)
    }
    if (payment.amount !== Number(row.charge_amount) || payment.currency !== row.charge_currency) {
      await db.prepare("update funds set status = 'review', error = ? where id = ?").run(
        `Paystack reports ${payment.amount} ${payment.currency}, expected ${row.charge_amount} ${row.charge_currency}`,
        row.id,
      )
      return view((await byId(row.id))!)
    }

    // Claim the row so only one caller sends the money.
    const claim = randomBytes(12).toString('hex')
    await db.prepare("update funds set status = 'crediting', claim = ? where id = ? and status = 'pending'").run(claim, row.id)
    const claimed = (await byId(row.id))!
    if (claimed.claim !== claim) return view(claimed)

    try {
      const txHash = await send(row.wallet_id, BigInt(row.amount))
      await db.prepare("update funds set status = 'completed', tx_hash = ?, completed_at = ? where id = ?").run(txHash, now(), row.id)
    } catch (error) {
      // The card was charged but the USDC didn't go out: a person has to look, never an automatic retry.
      const message = String((error as Error).message ?? error)
      console.error(`top-up ${row.id} (${reference}) was paid but sending USDC failed: ${message}`)
      await db.prepare("update funds set status = 'review', error = ? where id = ?").run(
        `Paid, but sending the USDC failed. We'll sort it out: ${message}`.slice(0, 500),
        row.id,
      )
    }
    return view((await byId(row.id))!)
  }

  /** Paystack's webhook: signed with the secret key (HMAC-SHA512 of the raw body). */
  async function webhook(rawBody: string, signature: string | undefined) {
    if (!paystack) throw new HTTPException(404, { message: 'Not found' })
    const expected = createHmac('sha512', paystack.secretKey).update(rawBody).digest()
    const given = Buffer.from(signature ?? '', 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HTTPException(401, { message: 'Bad signature' })
    }
    const event = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } }
    if (event.event === 'charge.success' && event.data?.reference?.startsWith('oryne-')) {
      await confirm(event.data.reference).catch((error) => console.error('paystack webhook:', (error as Error).message))
    }
  }

  return {
    cardEnabled,
    card: cardEnabled ? { currency: paystack!.currency, rate: paystack!.rate, min: CARD_MIN, max: CARD_MAX } : null,
    send,
    record,
    list,
    startCard,
    confirm,
    webhook,
  }
}

export type Funding = ReturnType<typeof createFunding>
