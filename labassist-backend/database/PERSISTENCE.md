# Application persistence

Backend startup migrates `applications`, `notifications`, and `activity_logs`
in the configured MySQL database before seeding demo data. Application reviews
and grade proofs are stored in the application row; proofs use `LONGBLOB`.
A unique student/course index prevents duplicate applications, including after
a restart. Existing demo applications are retained rather than overwritten.

The former backend kept these records only in process memory. Deploying this
change does not import records from an already-running old process. Export any
needed applications and proofs before stopping that process; records lost in
an earlier restart cannot be recovered by this migration. Keep the MySQL data
volume when recreating containers.

## Integration test

Use an empty, disposable MySQL database, never a production database. The test
creates users and courses and exercises application deletion/reset behavior.

```powershell
$env:LABASSIST_TEST_MYSQL_DSN='root:persistence-test@tcp(127.0.0.1:13308)/labassist_persistence_test?parseTime=true'
go test ./database -run TestPersistenceAcrossConnections -count=1 -v
```

Without this variable, the integration test is skipped. It verifies repeatable
migration, reviews, a 1 MB proof, notification read ownership/state, activity
logs, duplicate protection, and course reset after closing and reopening the
database connection.
