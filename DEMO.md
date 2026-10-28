# Five-minute portfolio walkthrough

This guide demonstrates the completed local exercise honestly. It does not rerun migration over the retained destination.

## 1. Explain the goal

“I simulated moving an inventory app between isolated environments. I focused on preserving data, verifying the destination, and returning to the source safely.” Show the diagram in `CASE-STUDY.md`.

## 2. Show the application

Open http://localhost:8000/docs. Execute `GET /items` and show the synthetic record. Explain that PostgreSQL persists it in a Docker volume, separate from the application container.

To demonstrate the application checks again, run:

```powershell
node smoke-test.mjs
```

This adds a new synthetic record and briefly restarts both source containers. It changes the current dataset, so the earlier migration report remains evidence of the earlier one-record run, not the new state.

## 3. Show isolation and configuration

```powershell
docker compose -p cloud-source ps
docker compose --env-file .env.destination -p cloud-destination ps -a
```

The source should be running; the retained destination should be stopped. Show `compose.yaml` and `.gitignore`. Do not display `.env`, `.env.destination`, or commands that expand their contents.

## 4. Explain the migration evidence

Open `migration-evidence.json` and `MIGRATION.md`. Walk through stopping source writes, saving a native backup, restoring into a fresh volume, comparing rows and the sequence, validating the destination, switching port 8000, and rolling back. Point out the measured downtime and the one-record dataset.

This section reviews a recorded successful run. To show a live rerun, first prepare a new, isolated destination workflow; the existing script intentionally refuses the retained destination. Do not delete the volumes just to make a recording.

## 5. Explain what comes next

“This proves a local migration rehearsal. A cloud deployment would add identity and permissions, networking, cost controls, remote backups, and new validation. Keeping the destination read-only made this rollback safe; after accepting writes, rollback would require reconciling them.”

Practice answering: Why stop writes? Why compare more than counts? Why preserve the source? What happens if restore fails? What changes when the destination accepts writes?
