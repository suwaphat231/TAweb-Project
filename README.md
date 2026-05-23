# LabAssist — ระบบจัดการผู้ช่วยปฏิบัติการ
ภาควิชาคอมพิวเตอร์ มหาวิทยาลัยศิลปากร

## Tech Stack
- **Frontend**: React + Vite (port 5173)
- **Backend**: Express.js + Prisma ORM (port 3001)
- **Database**: MySQL

## การติดตั้ง

### 1. ตั้งค่า Backend

```bash
cd backend
cp .env.example .env
# แก้ไข .env ให้ตรงกับ MySQL ของคุณ
npx prisma migrate dev --name init
npm run db:seed       # สร้าง user ตัวอย่าง
npm run dev
```

### 2. ตั้งค่า Frontend

```bash
cd frontend
cp .env.example .env
# ใส่ VITE_GOOGLE_CLIENT_ID ของคุณ
npm run dev
```

## Default Accounts (หลัง seed)

| Username  | Password     | Role    |
|-----------|-------------|---------|
| admin     | admin1234   | Admin   |
| teacher1  | teacher1234 | Teacher |
| staff1    | staff1234   | Staff   |

## API Endpoints

| Method | Path                        | Auth          | Description               |
|--------|-----------------------------|---------------|---------------------------|
| POST   | /api/auth/login             | -             | Login ด้วย username/password |
| POST   | /api/auth/google            | -             | Login ด้วย Google OAuth    |
| GET    | /api/auth/me                | Any           | ดูข้อมูลตัวเอง             |
| GET    | /api/courses                | Any           | ดูรายวิชา                  |
| POST   | /api/courses                | Teacher/Admin | สร้างวิชา                  |
| PUT    | /api/courses/:id            | Teacher/Admin | แก้ไขวิชา                  |
| GET    | /api/courses/:id            | Any           | ดูวิชา + รายชื่อผู้สมัคร   |
| POST   | /api/applications           | Student       | สมัคร TA/Lab Boy           |
| GET    | /api/applications/my        | Student       | ดูการสมัครของตัวเอง        |
| PATCH  | /api/applications/:id/status| Teacher+      | เปลี่ยนสถานะผู้สมัคร       |
| DELETE | /api/applications/:id       | Student       | ยกเลิกการสมัคร             |
| GET    | /api/users                  | Admin/Staff   | ดูรายชื่อ users            |
| POST   | /api/users                  | Admin         | สร้าง user ใหม่            |