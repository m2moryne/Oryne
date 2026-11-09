import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Keypair, scValToNative } from '@stellar/stellar-sdk'
import { fromBaseUnits, toBaseUnits } from './config.ts'
import { contractErrorName, policyScVal, struct, i128 } from './wallet.ts'

test('amounts convert to and from 7-decimal base units', () => {
  assert.equal(toBaseUnits('0.008'), 80_000n)
  assert.equal(toBaseUnits('25'), 250_000_000n)
  assert.equal(fromBaseUnits(80_000n), '0.008')
  assert.equal(fromBaseUnits(250_000_000n), '25')
  assert.throws(() => toBaseUnits('1.12345678'))
  assert.throws(() => toBaseUnits('-1'))
})

test('contract errors are named from host error text', () => {
  assert.equal(contractErrorName('HostError: Error(Contract, #7)'), 'OverPerTxLimit')
  assert.equal(contractErrorName('Error(Contract, #8) in __check_auth'), 'OverBudget')
  assert.equal(contractErrorName('something else'), undefined)
})

test("the token's errors are not mistaken for the wallet's", () => {
  const token = 'CCQDLMN53S2PGRPXKXHQIOULX37XYYB2GJLPPHRURSPLABKEOBLZZY3R'
  const wallet = 'CDQMO2CA23BQ7FDQ2N7LVYRPYZ6SCPFABRUOG2WUR5P7Z5KLJAXG7PPW'
  // As testnet returns it when a wallet holds less than the transfer.
  const insufficient = [
    'HostError: Error(Contract, #10)',
    '',
    'Event log (newest first):',
    `   0: [Diagnostic Event] contract:${token}, topics:[error, Error(Contract, #10)], data:["balance is not sufficient to spend", {amount: 49900000}, 300000000]`,
    `   1: [Diagnostic Event] topics:[fn_call, ${token}, transfer], data:[${wallet}, GBVW, 300000000]`,
  ].join('\n')
  assert.equal(contractErrorName(insufficient), 'InsufficientBalance')
  const overLimit = [
    'HostError: Error(Contract, #7)',
    `   0: [Diagnostic Event] contract:${wallet}, topics:[error, Error(Contract, #7)], data:"escalating error"`,
    `   1: [Diagnostic Event] topics:[fn_call, ${token}, transfer], data:[${wallet}, GBVW, 300000000]`,
  ].join('\n')
  assert.equal(contractErrorName(overLimit), 'OverPerTxLimit')
})

test('structs encode as maps with sorted symbol keys, as #[contracttype] expects', () => {
  const value = scValToNative(struct({ zeta: i128(1n), alpha: i128(2n) }))
  assert.deepEqual(Object.keys(value), ['alpha', 'zeta'])

  const token = Keypair.random().publicKey()
  const policy = scValToNative(
    policyScVal({ token, perTx: 1n, budget: 5n, windowSecs: 60, expiresAt: 0, payees: [] }),
  )
  assert.deepEqual(Object.keys(policy), ['budget', 'expires_at', 'payees', 'per_tx', 'token', 'window_secs'])
  assert.equal(policy.token, token)
})

test('passkey signatures convert from DER to low-S r||s', async () => {
  const { generateKeyPairSync, sign, verify } = await import('node:crypto')
  const { compactSignature, publicKeyFromSpki } = await import('./passkey.ts')
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const message = Buffer.from('oryne')
  for (let i = 0; i < 20; i++) {
    const der = sign('sha256', message, privateKey)
    const compact = compactSignature(der)
    assert.equal(compact.length, 64)
    // S is in the lower half of the order.
    assert.ok(compact[32] < 0x80)
    assert.ok(verify('sha256', message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, compact))
  }
  const spki = publicKey.export({ format: 'der', type: 'spki' })
  const raw = publicKeyFromSpki(new Uint8Array(spki))
  assert.equal(raw.length, 65)
  assert.equal(raw[0], 0x04)
})
