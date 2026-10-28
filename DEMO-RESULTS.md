# Demo check results — 2026-10-28

Executed `node smoke-test.mjs` against the local source system.

- Created and retrieved an additional synthetic inventory item.
- Rejected all six invalid input cases without saving records.
- Restarted the application and PostgreSQL containers.
- Compared every record afterward: all **two records** survived.
- Confirmed the retained destination application and database are stopped.

The migration itself was not rerun during this demonstration. `migration-evidence.json` documents the earlier one-record migration and rollback, before this demo added another item. The destination therefore retains that earlier snapshot.

## Plain-language presentation

“I built a small inventory API and PostgreSQL database in Docker. First, I tested that valid records save correctly, invalid inputs are rejected, and records survive a restart.

“Then I rehearsed a migration into a separate database. I stopped the original app to prevent changes during the move, created a PostgreSQL backup, restored it, and compared every record and the identity sequence.

“I switched the original address to the destination and checked it. I kept destination writes disabled, so I could switch back without losing new records. Rollback succeeded, and I left the original app running.

“This is a local learning project. It demonstrates backup, restore, verification, cutover, and rollback. A real cloud deployment is a future stage.”

## Interview practice

**Why stop writes?** A record added after the backup would otherwise be missing at the destination. Stopping the only application writer avoids that gap in this lab.

**Why not just count rows?** Two databases can have the same number of rows with different values. This exercise compares every record and the identity sequence state.

**Why preserve the source?** It provides a working fallback while the destination is verified.

**What if restore fails?** The migration script reports the failure and attempts to bring the source back. Recovery errors require investigation; neither database volume is deleted automatically.

**What if the destination accepts new writes?** The source becomes stale. Returning to it safely requires reconciling those changes; the current rehearsal deliberately avoids that scenario.
