# Local migration rehearsal

## Scope and ownership

The inventory API is the only application writer. Do not use SQL clients, smoke tests, or other scripts to write during migration. Both databases run on the same computer; this demonstrates migration mechanics, not cloud resilience or production capacity.

Source: Compose project `cloud-source`, private PostgreSQL database, volume `cloud-source_inventory-data`, application at http://localhost:8000/docs.

Destination: Compose project `cloud-destination`, a separate network and volume `cloud-destination_inventory-data`, separate random credentials in ignored `.env.destination`. It uses the same application image as the source. Application writes are disabled with `READ_ONLY=true`; this is an application guard, not a database security boundary.

## Forward path

From this directory, with Docker running and the source healthy:

```powershell
node migrate.mjs
```

The script first builds the app while the source is available. It then stops the source app, waits for the stop, captures ordered rows and the identity sequence state, and creates a PostgreSQL custom-format backup. Binary bytes are transferred directly through Node, avoiding PowerShell text redirection.

It creates an empty destination database, restores the backup in one transaction, and compares all rows and the identity sequence state. The destination app first serves port 8001 for validation. Valid POST requests must return HTTP 503 and leave the database unchanged.

For cutover, the destination app is recreated on port 8000, and the same client URL must return the matching records. Destination writes stay disabled throughout the rehearsal.

## Rollback and final state

The script stops the destination app, brings the source app back on port 8000, and verifies both API records and source database state. It then stops the destination database too. The source is active and writable under its normal configuration; the destination volume, backup, credentials, and report are retained.

This rollback is safe because no destination writes are accepted. After a real writable cutover, new writes would need reconciliation before returning to an older source. This script does not implement that workflow.

On failure after pausing the source, the script attempts to stop the destination and restore the source. Recovery failures are recorded and return a failing exit code. Check Docker state and the report before taking action; do not delete either volume to resolve an error.

## Evidence and reruns

The ignored `backups/` folder contains timestamped dumps and JSON reports with checksums, record counts, checks, timing, and failure details. `migration-evidence.json` is a copy of the successful run's report for the portfolio. The first run failed on a verification query and successfully recovered the source; the corrected run passed.

The script refuses to overwrite an existing destination volume or credentials, and uses an exclusive directory lock against concurrent copies. It intentionally does not retry a partial migration automatically. After this completed rehearsal, running it again will refuse the existing destination. Preserve the existing artifacts and plan a separate fresh destination for another run; no destructive reset is included.

If interrupted hard, `.migration.lock/` may remain. Confirm no migration process is running and inspect both projects before removing only the empty lock directory.

Inspect current services without printing credentials:

```powershell
docker compose -p cloud-source ps
docker compose --env-file .env.destination -p cloud-destination ps -a
```

To inspect the retained destination on port 8001, first ensure it is free:

```powershell
$env:APP_PORT = '8001'
docker compose --env-file .env.destination -p cloud-destination up -d --no-build --wait
Remove-Item Env:APP_PORT
```

Open http://localhost:8001/docs. Keep `READ_ONLY=true` in its env file. Stop it afterward with `docker compose --env-file .env.destination -p cloud-destination stop`. Keep credentials and database backups out of Git.
