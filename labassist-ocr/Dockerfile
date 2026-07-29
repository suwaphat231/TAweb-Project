# ใช้ Python 3.11 slim version เพื่อให้ Image มีขนาดเล็ก
FROM python:3.11-slim

# ตั้งค่า Environment Variables เพื่อไม่ให้ Python เขียนไฟล์ .pyc และให้แสดง log ทันที
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# กำหนดโฟลเดอร์ทำงานภายใน Container
WORKDIR /app

# ติดตั้ง System dependencies พื้นฐานที่อาจจำเป็นสำหรับ EasyOCR และ PyTorch
RUN apt-get update && apt-get install -y \
    build-essential \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# คัดลอกไฟล์ requirements.txt มาก่อนเพื่อใช้ประโยชน์จาก Docker Cache
COPY requirements.txt .

# ติดตั้งไลบรารี Python
# (หมายเหตุ: EasyOCR จะติดตั้ง PyTorch มาให้โดยอัตโนมัติ ซึ่งอาจใช้เวลาโหลดสักพัก)
RUN pip install --no-cache-dir -r requirements.txt

# คัดลอกโค้ดทั้งหมดในโฟลเดอร์ labassist-ocr เข้าไปใน Container
COPY . .

# เปิด Port 8000 สำหรับให้ Go backend หรือวง Network ภายในเรียกใช้
EXPOSE 8000

# คำสั่งเริ่มต้นรัน FastAPI ด้วย Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]