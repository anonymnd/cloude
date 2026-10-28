# Cloud migration lab

**Status: local rehearsal complete; real cloud migration pending.** No application or database has been moved to a cloud provider yet. GitHub stores the code and runs checks; it is not the application's cloud destination.

| Stage | Status |
| --- | --- |
| Local API and PostgreSQL | Complete |
| Local backup, restore, cutover, and rollback | Complete |
| Automated checks on GitHub | Passed |
| Migration to Render | Pending |

Build a small inventory application locally, then migrate its application and PostgreSQL data to a separate environment. Use synthetic data only. The local stages require no cloud account.

Start with the [portfolio case study and architecture diagram](CASE-STUDY.md), then use the [five-minute demo guide](DEMO.md) to explain the project. The current scope stays local and free; no cloud account or paid resources are required.

## Run the local lab

Requires Docker Desktop with its Linux engine running. Node.js is used only for the optional smoke test.

For a fresh checkout:

```powershell
git clone https://github.com/anonymnd/cloude.git
cd cloude
Copy-Item .env.example .env
```

Replace the password placeholder in `.env` with a random local password before starting. This existing local checkout already has an ignored `.env`; keep it rather than overwriting its credentials.

```powershell
docker compose -p cloud-source up -d --build --wait
```

Open http://localhost:8000/docs for the interactive API. Expand `POST /items`, select **Try it out**, submit `{"name":"Laptop","quantity":3}`, then use `GET /items` to see the saved record.

```powershell
node smoke-test.mjs
```

The smoke test adds a synthetic item, verifies invalid inputs leave no records, restarts both containers, and compares every record afterward. It fails on mismatches. Do not edit records concurrently during this check.

Stop the lab with `docker compose -p cloud-source stop`; restart it with the `up` command above. `docker compose -p cloud-source down` removes containers while preserving the database volume. **Do not add `-v` unless you intend to delete the lab data.**

The API intentionally has no login and is bound to localhost for this single-user exercise. Do not expose it publicly or store sensitive data. The database has no published port. Changing `.env` does not change an existing PostgreSQL volume's password; keep the existing password for restarts.

## Milestone 1: source system — complete

A small Python API and PostgreSQL database run through Docker Compose. The interface uses API requests so the exercise focuses on infrastructure and data.

The API adds and lists inventory items. Each item has an ID, a name, and a nonnegative whole-number quantity. Items survive container restarts. Database credentials stay outside Git, the API listens only on localhost, and the database has no published host port.

Verified creation, retrieval, persistence across restarts, and rejection of invalid input without saving records.

## Milestone 2: local migration — complete

The migration script creates a second environment with its own database volume. It stops the source app, backs up PostgreSQL, restores into the destination, compares every record and the identity sequence, tests cutover at the original URL, and rolls back. Destination API writes stay disabled throughout. The source data remains intact.

On a fresh destination, run `node migrate.mjs` with the source healthy. This checkout already has a retained destination, so another run will refuse to overwrite it. The script finishes with the source running and the destination stopped. See [the runbook](MIGRATION.md) before rerunning or recovering a failed attempt.

This is a local migration rehearsal. It does not yet demonstrate cloud networking, IAM, or a real cloud deployment.

## Milestone 3: migrate to Render — pending

Render is the selected cloud destination. No Render services have been deployed for this project yet.

1. Confirm that the account can create the required free services. [Free Render PostgreSQL databases expire after 30 days](https://render.com/docs/free).
2. Prepare cloud configuration, secure database connectivity, and access protection. The current unauthenticated local API is not ready for unrestricted public exposure.
3. Deploy the app, pause source writes, back up the local database, and restore into a fresh Render database.
4. Compare all records and the identity sequence, verify the hosted API, and save cloud migration evidence.
5. Test rollback while the destination remains read-only. New destination writes would need reconciliation before returning to the source.
6. Export data needed before database expiry and remove demo resources when finished.

The scripts currently target local Docker environments; they have not been adapted or tested against Render. Terraform and a recorded cloud demo are not included yet. Keep credentials and backups out of Git.

## Portfolio evidence

Keep the source code, architecture diagram, migration runbook, data verification results, rollback results, and an honest account of limitations in this repository. Add a short demonstration recording. Label the project as a simulated company migration.

## Verified locally on 2026-10-28

Milestone 1 passed against PostgreSQL 17 in Docker Desktop: both services became healthy; item creation and listing worked; six invalid input cases returned HTTP 422 without changing stored records; and every saved record survived a restart of both containers. The repeatable check is `node smoke-test.mjs`.

Milestone 2 also passed: PostgreSQL backup and restore, full row and identity-sequence comparison, a read-only cutover at the original URL, and rollback to the unchanged source. Measured cutover downtime was 26.054 seconds; rollback downtime was 9.286 seconds. This small run contained one synthetic record. See [the migration runbook](MIGRATION.md) and [recorded evidence](migration-evidence.json).

A later [application demo](DEMO-RESULTS.md) added a second record and confirmed both survived a restart. The retained destination and migration evidence still represent the earlier one-record snapshot. The [demo guide](DEMO.md) explains how to present these results.

Cloud deployment has not been performed. This remains a local simulation.

## Automated verification on GitHub

The workflow in `.github/workflows/verify.yml` builds the application on a disposable Linux runner, tests validation and restart persistence, and then performs the full migration and rollback rehearsal against fresh volumes. It runs on pushes, pull requests, or a manual Actions run. It saves migration JSON reports for seven days without uploading passwords or database dumps.

Its final cleanup deletes only the disposable runner's lab volumes. Do not copy that cleanup command to your local lab unless you intend to delete local data.

The [GitHub Actions run on 2026-10-28](https://github.com/anonymnd/cloude/actions/runs/40615762942) passed on a fresh Linux runner, including build, validation, persistence, migration, cutover, rollback, report upload, and cleanup. The repository is published; no cloud hosting resources have been provisioned. Review GitHub Actions eligibility and usage limits for your account; this project requires no paid runner.
