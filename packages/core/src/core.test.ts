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
