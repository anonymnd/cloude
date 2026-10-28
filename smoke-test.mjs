// Runs against the local lab, adds synthetic data, and restarts its containers.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const base = 'http://127.0.0.1:8000';
async function request(path, body) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await request('/health')).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Application did not become healthy');
}

await waitForHealth();
const before = await (await request('/items')).json();
const item = { name: `Learning laptop ${Date.now()}`, quantity: 3 };
const created = await request('/items', item);
assert.equal(created.status, 201);
const saved = await created.json();
assert.equal(saved.name, item.name);
assert.equal(saved.quantity, item.quantity);

for (const invalid of [
  { name: 'Invalid', quantity: -1 },
  { name: 'Invalid', quantity: 1.5 },
  { name: 'Invalid', quantity: true },
  { name: 'Invalid', quantity: 2147483648 },
  { name: '   ', quantity: 1 },
  { name: 'Invalid', quantity: 1, unexpected: true },
]) {
  assert.equal((await request('/items', invalid)).status, 422);
}
const expected = [...before, saved];
assert.deepEqual(await (await request('/items')).json(), expected);
console.log('PASS: create, list, and reject invalid input without saving it');

const restart = spawnSync('docker', ['compose', '-p', 'cloud-source', 'restart'], {
  stdio: 'inherit',
});
assert.equal(restart.status, 0, 'Container restart failed');
await waitForHealth();
assert.deepEqual(await (await request('/items')).json(), expected);
console.log(`PASS: all ${expected.length} records survived the application and database restart`);
