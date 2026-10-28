# Cloud migration learning lab

**Status: local rehearsal complete; real cloud migration pending.** No application or database has been moved to a cloud provider yet. GitHub stores the code and runs checks; it is not the application's cloud destination.

Build a small inventory application locally, then migrate its application and PostgreSQL data to a separate environment. Use synthetic data only. The local stages require no cloud account.

Start with the [portfolio case study and architecture diagram](CASE-STUDY.md), then use the [five-minute demo guide](DEMO.md) to explain the project. The current scope stays local and free; no cloud account or paid resources are required.

## Run the local lab

Requires Docker Desktop with its Linux engine running. Node.js is used only for the optional smoke test.

An ignored `.env` with a randomly generated local database password was created during setup. For a fresh clone, copy `.env.example` to `.env` and replace the placeholder with a random password.

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

## Milestone 1: establish the source system

Create a small Python API with PostgreSQL, using Docker Compose. Keep the interface to API requests initially so we can focus on infrastructure and data.

The API will let us add and list inventory items. Each item has an ID, a name, and a nonnegative whole-number quantity. The database must preserve items after a container restart. Database credentials stay outside Git, the API listens only on localhost, and the database has no published host port.

Done when we can add an item, retrieve it, restart the services, and retrieve the same item again. Invalid quantities must be rejected without saving data.

## Milestone 2: rehearse migration locally

Create a second, isolated environment with its own database volume. Pause source writes, back up PostgreSQL, restore into the destination, compare every inventory record, and direct requests to the destination. Keep the source intact for rollback. Document the downtime and test rollback before allowing destination writes; writes after cutover require a separate reconciliation plan.

This is a local migration rehearsal. It does not yet demonstrate cloud networking, IAM, or a real cloud deployment.

## Milestone 3: demonstrate a real cloud migration

Choose Azure or AWS after the local rehearsal works. Check current account eligibility and service costs before provisioning. Define the infrastructure with Terraform, migrate the synthetic data, verify the application, record the demo, and remove the provisioned resources when finished. Inspect for remaining billable resources.

## Portfolio evidence

Keep the source code, architecture diagram, migration runbook, data verification results, rollback results, and an honest account of limitations in this repository. Add a short demonstration recording. Label the project as a simulated company migration.

## Verified locally on 2026-10-28

Milestone 1 passed against PostgreSQL 17 in Docker Desktop: both services became healthy; item creation and listing worked; six invalid input cases returned HTTP 422 without changing stored records; and every saved record survived a restart of both containers. The repeatable check is `node smoke-test.mjs`.

Milestone 2 also passed: PostgreSQL backup and restore, full row and identity-sequence comparison, a read-only cutover at the original URL, and rollback to the unchanged source. Measured cutover downtime was 26.054 seconds; rollback downtime was 9.286 seconds. This small run contained one synthetic record. See [the migration runbook](MIGRATION.md) and [recorded evidence](migration-evidence.json).

Cloud deployment has not been performed. This remains a local simulation.

## Automated verification on GitHub

The workflow in `.github/workflows/verify.yml` builds the application on a disposable Linux runner, tests validation and restart persistence, and then performs the full migration and rollback rehearsal against fresh volumes. It runs on pushes, pull requests, or a manual Actions run. It saves migration JSON reports for seven days without uploading passwords or database dumps.

Its final cleanup deletes only the disposable runner's lab volumes. Do not copy that cleanup command to your local lab unless you intend to delete local data.

The workflow is prepared but has not been executed on GitHub. The application and migration scripts have passed locally; a successful GitHub Actions run will provide separate evidence on Linux. No repository has been published and no cloud resources have been provisioned. Review GitHub Actions eligibility and usage limits for your account before enabling it; this project requires no paid runner.
