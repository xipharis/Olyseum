import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantAllowed } from '../src/lib/instant-calls.ts';
import { deploymentManifests, markets } from '../src/config/deployment.ts';

const vault = deploymentManifests[0].contracts.CollateralVault.address;
const token = deploymentManifests[0].contracts.CollateralToken.address;
const engine = markets[0].engine;
const stranger = '0x1111111111111111111111111111111111111111';

test('trading and funding a verified market can skip the confirmation screen', () => {
  for (const functionName of ['placeOrder', 'cancel', 'cancelAll']) assert.equal(instantAllowed({ address: engine, functionName }), true);
  assert.equal(instantAllowed({ address: vault, functionName: 'deposit', args: [1n] }), true);
  assert.equal(instantAllowed({ address: vault, functionName: 'allocate', args: [engine.toUpperCase().replace('0X', '0x'), 1n, false] }), true);
  assert.equal(instantAllowed({ address: token, functionName: 'approve', args: [vault, 1n] }), true);
});

test('custody exits, reserve funding and unknown targets still ask', () => {
  for (const functionName of ['withdraw', 'release', 'claim', 'transfer', 'transferFrom', 'mint']) {
    assert.equal(instantAllowed({ address: vault, functionName, args: [] }), false);
    assert.equal(instantAllowed({ address: engine, functionName, args: [] }), false);
  }
  assert.equal(instantAllowed({ address: stranger, functionName: 'placeOrder' }), false);
  assert.equal(instantAllowed({ address: vault, functionName: 'allocate', args: [engine, 1n, true] }), false);
  assert.equal(instantAllowed({ address: vault, functionName: 'allocate', args: [stranger, 1n, false] }), false);
  assert.equal(instantAllowed({ address: token, functionName: 'approve', args: [stranger, 1n] }), false);
  assert.equal(instantAllowed({ address: stranger, functionName: 'approve', args: [vault, 1n] }), false);
  assert.equal(instantAllowed({ address: stranger, functionName: 'deposit', args: [1n] }), false);
});
