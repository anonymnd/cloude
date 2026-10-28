// Offline local migration rehearsal. Source data is never overwritten.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const source = ['compose', '-p', 'cloud-source'];
const destination = ['compose', '--env-file', '.env.destination', '-p', 'cloud-destination'];
const report = { startedAt: new Date().toISOString(), checks: [] };
let sourcePaused = false;
let destinationCreated = false;

function docker(args, { input, port, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 180000,
    env: { ...process.env, ...(port ? { APP_PORT: String(port) } : {}) },
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.toString()}`);
  }
  return result;
}

async function request(port, route, body) {
  return fetch(`http://127.0.0.1:${port}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
}

async function healthy(port) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { if ((await request(port, '/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Health check timed out on port ${port}`);
}

async function items(port) {
  const response = await request(port, '/items');
  assert.equal(response.status, 200);
  return response.json();
}

function snapshot(project) {
  const result = docker([...project, 'exec', '-T', 'db', 'psql', '-U', 'inventory', '-d', 'inventory', '-tAc',
    "SELECT json_build_object('items', (SELECT coalesce(json_agg(i ORDER BY id), '[]'::json) FROM items i), 'sequence', (SELECT json_build_object('last_value', last_value, 'is_called', is_called) FROM items_id_seq))"]);
  return JSON.parse(result.stdout.toString().trim());
}

function pass(message) {
  report.checks.push(message);
  console.log(`PASS: ${message}`);
}

// An exclusive lock protects against two copies of this script running together.
fs.mkdirSync('.migration.lock');
let reportFile;
try {
  assert.equal(process.env.APP_PORT, undefined, 'Unset APP_PORT before the rehearsal');
  assert.equal(process.env.READ_ONLY, undefined, 'Unset READ_ONLY before the rehearsal');
  assert.equal(process.env.POSTGRES_PASSWORD, undefined, 'Use the local env files, not a shell password override');
  await healthy(8000);
  const existing = docker(['volume', 'inspect', 'cloud-destination_inventory-data'], { allowFailure: true });
  assert.notEqual(existing.status, 0, 'Destination data already exists; refusing to overwrite it');
  assert.ok(!fs.existsSync('.env.destination'), 'Destination credentials already exist; inspect the previous run before repeating');
  // Build first, outside the source write pause. No destination data exists yet.
  docker([...source, 'build', 'app']);
  fs.writeFileSync('.env.destination', `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nAPP_PORT=8001\nREAD_ONLY=true\n`, { flag: 'wx' });
  fs.mkdirSync('backups', { recursive: true });
  const run = new Date().toISOString().replaceAll(':', '-');
  reportFile = path.join('backups', `${run}-report.json`);
  const backupFile = path.join('backups', `${run}-inventory.dump`);

  report.pauseStartedAt = new Date().toISOString();
  sourcePaused = true;
  docker([...source, 'stop', 'app']);
  const expected = snapshot(source);
  report.recordCount = expected.items.length;
  report.dataSha256 = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
  const backup = docker([...source, 'exec', '-T', 'db', 'pg_dump', '-U', 'inventory', '-d', 'inventory', '-Fc', '--no-owner', '--no-acl']).stdout;
  assert.ok(backup.length > 0);
  fs.writeFileSync(backupFile, backup, { flag: 'wx' });
  report.backup = backupFile;
  report.backupSha256 = createHash('sha256').update(backup).digest('hex');
  pass('Source app stopped; consistent PostgreSQL backup saved locally');

  destinationCreated = true;
  docker([...destination, 'up', '-d', '--wait', 'db']);
  docker([...destination, 'exec', '-T', 'db', 'pg_restore', '-U', 'inventory', '-d', 'inventory', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], { input: fs.readFileSync(backupFile) });
  assert.deepEqual(snapshot(destination), expected);
  pass('Backup restored into an isolated volume; every row and identity sequence matches');

  // Reuse the exact app image built for the source, rather than a second build.
  docker(['image', 'tag', 'cloud-source-app', 'cloud-destination-app']);
  docker([...destination, 'up', '-d', '--no-build', '--wait', 'app']);
  assert.deepEqual(await items(8001), expected.items);
  const denied = await request(8001, '/items', { name: 'Must not be stored', quantity: 1 });
  assert.equal(denied.status, 503);
  assert.deepEqual(snapshot(destination), expected);
  pass('Destination API serves matching records on port 8001 and rejects writes');

  // Rebind the destination to the original client URL: the local cutover.
  docker([...destination, 'up', '-d', '--no-build', '--wait', 'app'], { port: 8000 });
  assert.deepEqual(await items(8000), expected.items);
  assert.equal((await request(8000, '/items', { name: 'Still read only', quantity: 1 })).status, 503);
  assert.deepEqual(snapshot(destination), expected);
  report.cutoverAt = new Date().toISOString();
  report.cutoverDowntimeSeconds = (Date.parse(report.cutoverAt) - Date.parse(report.pauseStartedAt)) / 1000;
  pass('Original URL on port 8000 now serves the read-only destination');

  report.rollbackStartedAt = new Date().toISOString();
  docker([...destination, 'stop', 'app'], { port: 8000 });
  docker([...source, 'up', '-d', '--no-build', '--wait', 'app']);
  await healthy(8000);
  assert.deepEqual(await items(8000), expected.items);
  assert.deepEqual(snapshot(source), expected);
  sourcePaused = false;
  report.rollbackCompletedAt = new Date().toISOString();
  report.rollbackDowntimeSeconds = (Date.parse(report.rollbackCompletedAt) - Date.parse(report.rollbackStartedAt)) / 1000;
  pass('Rollback restored the original source URL with all original data intact');
  docker([...destination, 'stop'], { port: 8000 });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(error);
  process.exitCode = 1;
} finally {
  if (sourcePaused) {
    try {
      if (destinationCreated) docker([...destination, 'stop'], { port: 8000 });
      docker([...source, 'up', '-d', '--no-build', '--wait', 'app']);
      await healthy(8000);
      report.sourceRecoveredAfterFailure = true;
    } catch (error) {
      report.recoveryError = error.message;
      console.error('Recovery needs attention:', error.message);
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  fs.rmdirSync('.migration.lock');
}
