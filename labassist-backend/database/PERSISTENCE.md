# Application persistence and recruitment rounds

`courses` stores the teaching slot. Its unique key is `(code, section,
semester, academic_year)`. Unmatched instructors use NULL.

`postings` stores recruitment settings and counters for each round. A functional
unique index permits only one active posting per course. Applications are unique
per `(student_id, posting_id)`; form reviews are unique per posting.

Deleting an instructor announcement archives its posting and creates a new draft.
Applications, grade proofs, reviews and staff documents retain their original
posting IDs. A course with any applications, application history, reviews or staff
documents cannot be hard-deleted. Bulk term deletion skips those courses.
Notifications for deletable empty courses retain their text but lose the course link.

## Upgrading existing databases

Startup still uses GORM AutoMigrate followed by explicit, repeatable migration
steps. It creates postings from the legacy course recruitment columns, backfills
child posting IDs, replaces old unique indexes, converts instructor ID 0 to NULL,
and adds foreign keys. Legacy columns remain for migration; the application reads
recruitment settings from postings after the upgrade. Restarting does not copy
stale legacy values over existing postings.

Before deployment, back up the database and stop older backend instances. Check
for duplicate teaching slots and orphan references; the new constraints reject
such data rather than silently deleting or merging it. MySQL DDL commits
independently, so the entire startup migration is not one rollbackable transaction.
A failed upgrade must be corrected and rerun before serving traffic.

```sql
SELECT code, section, semester, academic_year, COUNT(*) AS copies
FROM courses
GROUP BY code, section, semester, academic_year
HAVING COUNT(*) > 1;
```

Do not roll back to the older backend after new recruitment rounds are created:
that version reads legacy course fields and does not understand posting IDs.
Use a tested database backup together with the corresponding backend version.

## Integration tests

Use a disposable MySQL 8.4 server, never the application database. The migration
test creates and removes its own temporary database on that server; the configured
user therefore needs CREATE DATABASE and DROP DATABASE privileges.

```powershell
$env:LABASSIST_TEST_MYSQL_DSN='root:persistence-test@tcp(127.0.0.1:13308)/labassist_persistence_test?parseTime=true'
go test ./database -run 'TestPersistenceAcrossConnections|TestPostingMigration' -count=1 -v
```

Without the variable, integration tests are skipped. Tests cover legacy backfill,
repeat migration, retained proof bytes, round isolation, duplicate constraints,
foreign keys, notification ownership, persistence across connections, zero-value
updates, and deletion protection.
