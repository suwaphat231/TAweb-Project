# RESET_DB_ON_START Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม env flag `RESET_DB_ON_START` ที่เมื่อเป็น `true` backend จะ drop ทุกตารางใน database ตอน start แล้ว migrate + seed ใหม่ ได้ DB สะอาดด้วย `docker compose restart backend`

**Architecture:** `config.Load()` อ่าน flag และปฏิเสธถ้าเปิดโดยไม่มี `DEV_LOGIN=true` และ `SEED_DEMO_DATA=true` (สองตัวนี้เป็น flag เฉพาะ dev อยู่แล้ว ใช้เป็นตัวกันไม่ให้หลุดไป production — โปรเจกต์ไม่มี `APP_ENV`) จากนั้น `database.Connect()` เรียก `resetSchema(db)` ทันทีหลัง ping สำเร็จ ก่อน AutoMigrate ตัวแรก ที่เหลือ (migrate, seed classlist, seed demo) เป็น flow เดิมทั้งหมด

**Tech Stack:** Go, GORM + MySQL 8.4, Docker Compose

**Spec:** การตัดสินใจในแชท 2026-10-17 — "ทางเลือก A: env `RESET_DB_ON_START=true` ให้ drop ตาราง แล้ว migrate และ seed ใหม่ตอน backend start ... ค่าเริ่มต้นเป็น `false` และถ้าเป็น production ให้ปฏิเสธไม่ยอม start"

## Global Constraints

- ชื่อ env: `RESET_DB_ON_START`; ค่าที่รับ: `""`, `"false"` → ปิด, `"true"` → เปิด, ค่าอื่น → error `RESET_DB_ON_START must be true or false` (รูปแบบเดียวกับ `SEED_DEMO_DATA`/`DEV_LOGIN`)
- เปิดได้เฉพาะเมื่อ `DEV_LOGIN=true` และ `SEED_DEMO_DATA=true` ไม่งั้น `Load()` คืน error `RESET_DB_ON_START=true requires DEV_LOGIN=true and SEED_DEMO_DATA=true`
- Default ทุกที่ (`docker-compose.yml`, `.env.example` ทั้งสองไฟล์) = `false`; `setup-env.sh` **ไม่** เปิดให้อัตโนมัติ
- Drop เฉพาะตารางใน database ที่ต่ออยู่ (`DATABASE()`) เท่านั้น ห้าม `DROP DATABASE`
- ทำงานตอน start เท่านั้น ไม่มี endpoint ไม่ผูกกับ login
- ทำบน branch ใหม่ `feat/reset-db-on-start` แตกจาก `main`

## Review Focus

1. **ตารางที่มี foreign key อ้างกัน** — drop ต้องสำเร็จโดยไม่สนลำดับ (ปิด `FOREIGN_KEY_CHECKS` บน connection เดียวกัน) → test ใน Task 2 สร้างสองตารางที่มี FK
2. **Database ว่าง (start ครั้งแรก)** — `resetSchema` ต้องคืน `nil` ไม่ error → test ใน Task 2
3. **Restart ซ้ำหลายครั้ง** — Connect ด้วย reset สองรอบติดกันต้องสำเร็จ และข้อมูลที่เพิ่มระหว่างรอบต้องหาย ส่วน demo users กลับมา → test ใน Task 2
4. **`FOREIGN_KEY_CHECKS` ค้างเป็น 0 ใน connection pool** — ต้อง set กลับเป็น 1 แม้ drop ล้มเหลว (ใช้ `defer`) → test ใน Task 2 เช็ค `@@FOREIGN_KEY_CHECKS` หลัง reset
5. **เปิด flag ผิดสภาพแวดล้อม** (production `.env` ที่ไม่มี DEV_LOGIN) — ต้อง fail ตอน start ไม่ใช่ลบข้อมูล → test ใน Task 1

---

### Task 1: Config flag พร้อมตัวกัน production

**Files:**
- Modify: `labassist-backend/config/config.go` (struct `Config`, `Load()`)
- Test: `labassist-backend/config/config_test.go`

**Interfaces:**
- Produces: `config.Config.ResetDBOnStart bool`

- [ ] **Step 1: Write the failing test** `TestResetDBOnStartRequiresDevFlags` ใน `config_test.go` ตามรูปแบบ `TestDemoSeedingRequiresExplicitOptIn` (ตั้ง `JWT_SECRET` ที่ valid ก่อน) table-driven:

```go
for _, tc := range []struct {
	reset, devLogin, seed string
	enabled, invalid      bool
}{
	{"", "false", "false", false, false},
	{"false", "true", "true", false, false},
	{"true", "true", "true", true, false},
	{"true", "false", "true", false, true},  // production-like: no DEV_LOGIN
	{"true", "true", "false", false, true},  // no demo seed → empty DB, refuse
	{"1", "true", "true", false, true},
	{"TRUE", "true", "true", false, true},
}
```
แต่ละเคส `t.Setenv` ทั้งสามตัว; ถ้า `invalid` ต้อง `err != nil && cfg == nil`; ไม่งั้น `cfg.ResetDBOnStart == tc.enabled`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd labassist-backend && go test ./config -run TestResetDBOnStartRequiresDevFlags -v`
Expected: FAIL (compile error `cfg.ResetDBOnStart undefined`)

- [ ] **Step 3: Implement** — เพิ่ม field `ResetDBOnStart bool` ใต้ `DevLogin`; ใน `Load()` เพิ่ม switch แบบเดียวกับ `DEV_LOGIN` แล้วเช็คเงื่อนไข dev flags หลังจาก parse ครบทั้งสาม ใช้ข้อความ error ตาม Global Constraints

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd labassist-backend && go test ./config -v`
Expected: PASS ทั้งหมด (รวม test เดิม)

- [ ] **Step 5: Commit**

```bash
git add labassist-backend/config/config.go labassist-backend/config/config_test.go
git commit -m "config: add RESET_DB_ON_START flag guarded by dev-only flags"
```

---

### Task 2: `resetSchema` และเรียกใช้ใน `Connect`

**Files:**
- Create: `labassist-backend/database/reset.go`
- Modify: `labassist-backend/database/connection.go` (`Connect`, ระหว่าง retry loop กับ `db.AutoMigrate(&models.User{})`)
- Test: `labassist-backend/database/reset_test.go`

**Interfaces:**
- Consumes: `config.Config.ResetDBOnStart` (Task 1)
- Produces: `func resetSchema(db *gorm.DB) error` (package-private)

- [ ] **Step 1: Write the failing tests** ใน `reset_test.go` ข้ามด้วย `t.Skip` เมื่อไม่มี `LABASSIST_TEST_MYSQL_DSN` และสร้าง/ลบ database ชั่วคราวเองตามรูปแบบ `posting_migration_test.go:16-38` (ชื่อ `labassist_reset_test_%d`)

  - `TestResetSchemaDropsTablesWithForeignKeys`: สร้าง `parent(id INT PRIMARY KEY)` และ `child(id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES parent(id))` insert แถวละหนึ่ง → `resetSchema(db)` ต้องคืน `nil`; จากนั้น `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()` ต้องได้ `0`; และ `SELECT @@FOREIGN_KEY_CHECKS` ต้องได้ `1` (ใช้ `db` ที่ `SetMaxOpenConns(1)` เพื่อให้แน่ใจว่าเช็ค connection เดียวกัน)
  - `TestResetSchemaOnEmptyDatabase`: database ใหม่เปล่า → `resetSchema(db)` คืน `nil`
  - `TestConnectWithResetRebuildsDemoData`: สร้าง `*config.Config` จาก DSN ที่ parse แล้ว (`DBHost`/`DBPort` จาก `net.SplitHostPort(cfg.Addr)`, `DBUser`, `DBPassword`, `DBName` = database ชั่วคราว, `SeedDemoData: true`, `DevLogin: true`, `ResetDBOnStart: true`); เก็บ `old := DB` และ `t.Cleanup(func() { DB = old })` แบบ `persistence_test.go:21`
    1. `Connect(cfg)` → nil; จด `n1` = จำนวน users
    2. insert user ใหม่ `username = "reset_probe"` (ผ่าน `DB.Create(&models.User{...})` กรอก field ที่ NOT NULL ตาม model)
    3. `Connect(cfg)` อีกครั้ง → nil
    4. assert: ไม่มี user `reset_probe`, จำนวน users == `n1`, `n1 > 0`

- [ ] **Step 2: Run tests to verify they fail**

Run (MySQL ทดสอบตาม `database/PERSISTENCE.md`):
```powershell
$env:LABASSIST_TEST_MYSQL_DSN='root:persistence-test@tcp(127.0.0.1:13308)/labassist_persistence_test?parseTime=true'
go test ./database -run 'TestResetSchema|TestConnectWithReset' -count=1 -v
```
Expected: FAIL (compile error `undefined: resetSchema`)

- [ ] **Step 3: Implement `resetSchema(db *gorm.DB) error` ใน `reset.go`**

ใช้ `db.Connection(func(tx *gorm.DB) error {...})` เพื่อให้ทุกคำสั่งอยู่บน connection เดียว (session variable): `SET FOREIGN_KEY_CHECKS = 0` → `defer` set กลับเป็น `1` → ดึงชื่อจาก `information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'` → `DROP TABLE` ทีละตาราง quote ด้วย backtick → `log.Printf("RESET_DB_ON_START: dropped %d tables", n)` คืน error ห่อด้วย `fmt.Errorf("drop table %s: %w", ...)`

- [ ] **Step 4: Wire into `Connect`** — หลัง retry loop ก่อน `db.AutoMigrate(&models.User{})`:

```go
if cfg.ResetDBOnStart {
	log.Printf("RESET_DB_ON_START enabled: dropping all tables in %q", cfg.DBName)
	if err := resetSchema(db); err != nil {
		return fmt.Errorf("reset schema: %w", err)
	}
}
```
อัปเดต doc comment ของ `Connect` ให้กล่าวถึง reset

- [ ] **Step 5: Run tests to verify they pass**

Run: คำสั่งเดียวกับ Step 2 แล้วตามด้วย `go test ./... -count=1`
Expected: test ใหม่ PASS; ทั้ง suite PASS (เคสที่ต้องใช้ MySQL skip ถ้าไม่ได้ตั้ง DSN)

- [ ] **Step 6: Commit**

```bash
git add labassist-backend/database/reset.go labassist-backend/database/reset_test.go labassist-backend/database/connection.go
git commit -m "database: drop all tables on start when RESET_DB_ON_START is set"
```

---

### Task 3: Compose, docs และ smoke test ใน Docker

**Files:**
- Modify: `docker-compose.yml` (backend `environment`, ต่อจาก `DEV_LOGIN`)
- Modify: `.env.example`, `labassist-backend/.env.example`
- Modify: `labassist-backend/README.md` (ส่วนวิธีรัน dev)

**Interfaces:**
- Consumes: env `RESET_DB_ON_START` (Task 1)

- [ ] **Step 1: เพิ่ม config**
  - `docker-compose.yml`: `RESET_DB_ON_START: ${RESET_DB_ON_START:-false}`
  - ทั้งสอง `.env.example`: `RESET_DB_ON_START=false` พร้อม comment หนึ่งบรรทัด: `# true = drop all tables and reseed on every backend start (dev only; requires DEV_LOGIN=true and SEED_DEMO_DATA=true)`
  - `README.md` ของ backend: ย่อหน้าภาษาไทยสั้นๆ — ตั้ง `RESET_DB_ON_START=true` ใน `.env` แล้วใช้ `docker compose restart backend` เพื่อล้าง DB; ข้อมูลทั้งหมดรวมที่ทีมสร้างไว้จะหาย; ห้ามใช้กับ DB ที่มีข้อมูลจริง

- [ ] **Step 2: Smoke test — ปิด flag ข้อมูลต้องอยู่**

Run: `docker compose up -d --build backend` แล้ว insert แถวทดสอบ:
`docker compose exec mysql mysql -ulabassist -plabassist123 labassist -e "INSERT INTO notifications ..."` (หรือสมัครผ่าน UI หนึ่งรายการ) → `docker compose restart backend`
Expected: แถวยังอยู่

- [ ] **Step 3: Smoke test — เปิด flag ข้อมูลต้องหาย**

Run: ตั้ง `RESET_DB_ON_START=true` ใน `.env` → `docker compose up -d backend` → `docker compose logs backend | grep RESET_DB_ON_START`
Expected: log `RESET_DB_ON_START enabled` และ `dropped N tables`; แถวทดสอบหายไป; `POST /api/v1/auth/dev-login` ด้วย `demo_std01` ได้ 200

- [ ] **Step 4: Smoke test — guard**

Run: ตั้ง `RESET_DB_ON_START=true` และ `DEV_LOGIN=false` → `docker compose up -d backend` → `docker compose logs backend`
Expected: `invalid configuration: RESET_DB_ON_START=true requires DEV_LOGIN=true and SEED_DEMO_DATA=true` และ container ไม่ serve; คืนค่า `.env` หลังทดสอบ

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example labassist-backend/.env.example labassist-backend/README.md
git commit -m "docs: document RESET_DB_ON_START for local development"
```
