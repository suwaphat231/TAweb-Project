# Google OAuth Setup

## ขั้นตอนการตั้งค่า Google OAuth

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)

2. สร้าง Project ใหม่ (หรือเลือก Project ที่มีอยู่)

3. ไปที่ **APIs & Services → Credentials**

4. คลิก **Create Credentials → OAuth 2.0 Client ID**

5. เลือกประเภท **Web application**

6. ตั้งค่า:
   - **Authorized JavaScript origins**: `http://localhost:5173`
   - **Authorized redirect URIs**: (ไม่จำเป็นสำหรับ frontend-only flow)

7. คลิก **Create** แล้ว Copy **Client ID**

8. ใส่ Client ID ใน `.env.development`:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```

9. ใส่ Client ID เดียวกันใน `labassist-backend/.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```

> **หมายเหตุ:** ไม่ต้องใช้ Client Secret เพราะระบบใช้ frontend Google Sign-In (ID Token)  
> Backend ใช้ `idtoken.Validate()` ซึ่ง verify ด้วย Google public key โดยตรง
