# LabAssist Frontend — React + TypeScript + Vite

## Tech Stack
- **React 18** + **TypeScript**
- **Vite** (bundler)
- **React Router v6** (routing)
- **Zustand** + localStorage persist (auth state)
- **TanStack Query v5** (server state / data fetching)
- **Axios** (HTTP client)
- **@react-oauth/google** (Google Sign-In button)
- **clsx** (conditional classNames)

## Setup

### 1. ติดตั้ง dependencies
```bash
npm install
```

### 2. ตั้งค่า .env
```bash
cp .env.example .env
# แก้ไข .env:
#   VITE_API_URL=http://localhost:8080/api/v1
#   VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

### 3. Run dev server
```bash
npm run dev
# → http://localhost:5173
```

### 4. Build production
```bash
npm run build
```

## โครงสร้างหน้า

| Path | Role | หน้า |
|------|------|------|
| /login | ทุก role | Login (Google + Username/Password) |
| /student | student | Dashboard สรุปการสมัคร |
| /student/apply | student | สมัคร TA/Lab Boy |
| /student/status | student | ติดตามสถานะ |
| /student/profile | student | ข้อมูลส่วนตัว |
| /instructor/announce | instructor,admin | จัดการวิชา |
| /instructor/select | instructor,staff,admin | คัดเลือกผู้สมัคร |
| /staff/docs | staff,admin | เอกสาร |
| /admin | admin | ภาพรวมระบบ + จัดการผู้ใช้ |
