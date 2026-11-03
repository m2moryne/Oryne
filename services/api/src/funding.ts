import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { buildTx, fromBaseUnits, i128, prepareSignSubmit, toBaseUnits } from '@oryne/core'
import { Address, Keypair, Operation } from '@stellar/stellar-sdk'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import type { Chain } from './stellar.ts'
import { checkRequest, type WalletRequest, type Wallets } from './wallets.ts'

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
 *
 * Activation (mainnet, ACTIVATION_USDC): a new account's first wallet is paid
 * for before it exists. The owner pays a small top-up by card; once Paystack
 * confirms it, the wallet is deployed and the USDC sent into it. So Oryne only
 * spends XLM deploying wallets for people who have paid, and the money is
 * theirs, not a fee.
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

export type ActivationRow = {
  reference: string
  owner: string
  email: string
  request: string
  amount: string
  charge_amount: number
  charge_currency: string
  status: 'pending' | 'paid' | 'deploying' | 'completed' | 'failed' | 'review'
  wallet_id: string | null
  error: string | null
  claim: string | null
  created_at: number
  completed_at: number | null
}

type PaystackTransaction = { status: string; reference: string; amount: number; currency: string; gateway_response?: string }

export function createFunding(config: Config, db: Db, chain: Chain, wallets: Wallets) {
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

  // ── Activation ──────────────────────────────────────────────────────────────

  const activationUnits = toBaseUnits(config.activationUsdc, decimals)
  /** Whether a first wallet must be paid for before it is deployed. */
  const activationRequired = activationUnits > 0n

  const activationView = (row: ActivationRow) => ({
    reference: row.reference,
    status: row.status === 'deploying' || row.status === 'paid' ? 'pending' : row.status,
    paid: row.status !== 'pending' && row.status !== 'failed',
    amount: fromBaseUnits(BigInt(row.amount), decimals),
    charge: { amount: (Number(row.charge_amount) / 100).toFixed(2), currency: row.charge_currency },
    walletId: row.wallet_id,
    error: row.error,
    createdAt: row.created_at,
  })
  const activationByRef = (reference: string) =>
    db.prepare('select * from activations where reference = ?').get<ActivationRow>(reference)

  /** Opens a Paystack checkout for the activation top-up. The wallet is deployed once it's paid. */
  async function startActivation(input: { owner: string; email: string; request: WalletRequest }) {
    if (!activationRequired) throw new HTTPException(400, { message: 'Wallets on this server don’t need activation' })
    if (!cardEnabled) {
      throw new HTTPException(503, {
        message: 'Card payments aren’t set up yet, so live wallets can’t be activated. Try again soon.',
      })
    }
    if (!EMAIL.test(input.email)) throw new HTTPException(400, { message: 'A valid email is needed for the card receipt' })
    checkRequest(input.owner, input.request)
    await wallets.assertCanCreate(input.owner)

    const reference = `oryne-act-${randomBytes(12).toString('hex')}`
    const charge = chargeFor(activationUnits)
    const checkout = await paystackApi<{ authorization_url: string }>('/transaction/initialize', {
      method: 'POST',
      body: {
        email: input.email,
        amount: charge,
        currency: paystack!.currency,
        reference,
        callback_url: `${config.webUrl}/app`,
        metadata: {
          activation: true,
          usdc: config.activationUsdc,
          custom_fields: [{ display_name: 'Oryne', variable_name: 'purpose', value: 'Wallet activation top-up' }],
        },
      },
    })
    await db.prepare(
      `insert into activations (reference, owner, email, request, amount, charge_amount, charge_currency, status, created_at)
       values (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      reference,
      input.owner,
      input.email,
      JSON.stringify(input.request),
      activationUnits.toString(),
      charge,
      paystack!.currency,
      now(),
    )
    return { authorizationUrl: checkout.authorization_url, reference }
  }

  /** The owner's latest activation, so the dashboard can pick up where checkout left off. */
  async function latestActivation(owner: string) {
    const row = await db
      .prepare('select * from activations where owner = ? order by created_at desc limit 1')
      .get<ActivationRow>(owner)
    return row ? activationView(row) : null
  }

  /**
   * Checks an activation with Paystack and, once paid, deploys the wallet and
   * sends the USDC into it. Safe to call any number of times.
   */
  async function confirmActivation(reference: string) {
    const row = await activationByRef(reference)
    if (!row) throw new HTTPException(404, { message: 'No such activation' })
    if (row.status === 'pending') {
      const payment = await paystackApi<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
      if (payment.status !== 'success') {
        if (['failed', 'abandoned', 'reversed'].includes(payment.status)) {
          await db
            .prepare("update activations set status = 'failed', error = ? where reference = ? and status = 'pending'")
            .run(payment.gateway_response || `Card payment ${payment.status}`, reference)
        }
        return activationView((await activationByRef(reference))!)
      }
      if (payment.amount !== Number(row.charge_amount) || payment.currency !== row.charge_currency) {
        await db.prepare("update activations set status = 'review', error = ? where reference = ?").run(
          `Paystack reports ${payment.amount} ${payment.currency}, expected ${row.charge_amount} ${row.charge_currency}`,
          reference,
        )
        return activationView((await activationByRef(reference))!)
      }
      await db.prepare("update activations set status = 'paid' where reference = ? and status = 'pending'").run(reference)
    }
    const paid = (await activationByRef(reference))!
    if (paid.status !== 'paid') return activationView(paid)

    // Claim it so only one caller deploys.
    const claim = randomBytes(12).toString('hex')
    await db
      .prepare("update activations set status = 'deploying', claim = ? where reference = ? and status = 'paid'")
      .run(claim, reference)
    const claimed = (await activationByRef(reference))!
    if (claimed.claim !== claim) return activationView(claimed)

    let walletId: string
    try {
      walletId = (await wallets.deploy(row.owner, JSON.parse(row.request) as WalletRequest)).id
    } catch (error) {
      const message = String((error as Error).message ?? error)
      if (error instanceof HTTPException && error.status === 503) {
        // Refused before anything was sent (today's fee cap): still paid, safe to try again later.
        await db
          .prepare("update activations set status = 'paid', claim = null, error = ? where reference = ?")
          .run(message, reference)
      } else {
        // It may or may not have landed: a person has to look, never an automatic retry.
        console.error(`activation ${reference} was paid but deploying the wallet failed: ${message}`)
        await db.prepare("update activations set status = 'review', error = ? where reference = ?").run(
          `Paid, but creating the wallet failed. We'll sort it out: ${message}`.slice(0, 500),
          reference,
        )
      }
      return activationView((await activationByRef(reference))!)
    }
    await db.prepare('update activations set wallet_id = ?, error = null where reference = ?').run(walletId, reference)

    try {
      const txHash = await send(walletId, BigInt(row.amount))
      const at = now()
      await db.prepare(
        `insert into funds (id, wallet_id, owner, kind, amount, status, reference, charge_amount, charge_currency, tx_hash, created_at, completed_at)
         values (?, ?, ?, 'card', ?, 'completed', ?, ?, ?, ?, ?, ?)`,
      ).run(newId('fund'), walletId, row.owner, row.amount, reference, row.charge_amount, row.charge_currency, txHash, at, at)
      await db.prepare("update activations set status = 'completed', completed_at = ? where reference = ?").run(at, reference)
    } catch (error) {
      const message = String((error as Error).message ?? error)
      console.error(`activation ${reference}: wallet ${walletId} created but sending USDC failed: ${message}`)
      await db.prepare("update activations set status = 'review', error = ? where reference = ?").run(
        `Your wallet is ready, but sending the USDC failed. We'll sort it out: ${message}`.slice(0, 500),
        reference,
      )
    }
    return activationView((await activationByRef(reference))!)
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
    const reference = event.data?.reference
    if (event.event === 'charge.success' && reference?.startsWith('oryne-')) {
      await (reference.startsWith('oryne-act-') ? confirmActivation(reference) : confirm(reference)).catch((error) =>
        console.error('paystack webhook:', (error as Error).message),
      )
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
    activation: activationRequired ? { usdc: config.activationUsdc, available: cardEnabled } : null,
    startActivation,
    latestActivation,
    confirmActivation,
  }
}

export type Funding = ReturnType<typeof createFunding>
