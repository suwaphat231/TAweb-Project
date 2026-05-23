# LabAssist Backend — Go + MySQL

## Tech Stack
- **Go** 1.22+ with **Gin** framework
- **GORM** + MySQL driver
- **JWT** authentication (golang-jwt/jwt v5)
- **Google ID Token** verification (google.golang.org/api/idtoken)
- **bcrypt** password hashing

## Setup

### 1. ติดตั้ง dependencies
```bash
go mod download
```

### 2. ตั้งค่า MySQL
```sql
CREATE DATABASE labassist CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
จากนั้น run schema:
```bash
mysql -u root -p labassist < database/migrations/schema.sql
```

### 3. Generate bcrypt hash สำหรับ seed
```bash
# สร้าง tool สำหรับ hash password
go run tools/hash_password.go "password123"
# แล้วแทนที่ placeholder ใน seed.sql
mysql -u root -p labassist < database/migrations/seed.sql
```

### 4. ตั้งค่า .env
```bash
cp .env.example .env
# แก้ไข .env:
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
#   JWT_SECRET  (ต้องเปลี่ยนใน production)
#   GOOGLE_CLIENT_ID  (จาก Google Cloud Console)
#   CLIENT_URL  (URL ของ frontend)
```

### 5. Run
```bash
go run main.go
# หรือ dev mode ด้วย air
air
```

## API Endpoints

### Public (ไม่ต้อง JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/login | Login username+password |
| POST | /api/v1/auth/google | Login ด้วย Google ID token |
| GET  | /api/v1/courses | ดูรายวิชาทั้งหมด |
| GET  | /api/v1/courses/:id | ดูวิชาตาม ID |

### Authenticated (ต้องมี Bearer JWT)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | /api/v1/auth/me | any | ดูข้อมูลตัวเอง |
| POST | /api/v1/auth/logout | any | Logout |
| GET | /api/v1/student/dashboard | student | Dashboard นักศึกษา |
| GET | /api/v1/student/applications | student | การสมัครของตัวเอง |
| POST | /api/v1/student/applications | student | สมัคร TA/Lab Boy |
| PUT | /api/v1/student/applications/:id/withdraw | student | ถอนใบสมัคร |
| GET | /api/v1/student/profile | student | โปรไฟล์ |
| PUT | /api/v1/student/profile | student | แก้ไขโปรไฟล์ |
| GET | /api/v1/instructor/courses | instructor,admin | วิชาของอาจารย์ |
| POST | /api/v1/instructor/courses | instructor,admin | สร้างวิชา |
| PUT | /api/v1/instructor/courses/:id | instructor,admin | แก้ไขวิชา |
| PUT | /api/v1/instructor/courses/:id/status | instructor,admin | เปลี่ยนสถานะวิชา |
| GET | /api/v1/instructor/courses/:id/applicants | instructor,staff,admin | ดูผู้สมัคร |
| PUT | /api/v1/instructor/applications/:id/review | instructor,staff,admin | รับ/ไม่รับผู้สมัคร |
| PUT | /api/v1/instructor/applications/bulk-review | instructor,staff,admin | รับ/ไม่รับแบบกลุ่ม |
| GET | /api/v1/admin/stats | admin | สถิติระบบ |
| GET | /api/v1/admin/users | admin | รายชื่อผู้ใช้ |
| POST | /api/v1/admin/users | admin | สร้างผู้ใช้ |
| PUT | /api/v1/admin/users/:id/status | admin | เปิด/ระงับบัญชี |

## Default Accounts (หลัง seed)
| Username | Password | Role |
|----------|----------|------|
| admin | password123 | Admin |
| somchai | password123 | Instructor |
| malee | password123 | Instructor |
| thanakorn | password123 | Instructor |
| parinya | password123 | Staff |
