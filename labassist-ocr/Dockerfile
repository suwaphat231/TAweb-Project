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
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# คัดลอกไฟล์ requirements.txt มาก่อนเพื่อใช้ประโยชน์จาก Docker Cache
COPY requirements.txt .

# ติดตั้ง PyTorch ก่อน ค่าเริ่มต้นเป็น CPU-only (เล็กกว่า GPU version มาก)
# เครื่องที่มี NVIDIA GPU ใช้ docker-compose.gpu.yml ซึ่งส่ง TORCH_INDEX_URL เป็นเวอร์ชัน CUDA
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir torch torchvision --index-url ${TORCH_INDEX_URL}

# ติดตั้งไลบรารี Python ที่เหลือ
RUN pip install --no-cache-dir -r requirements.txt

# คัดลอกโค้ดทั้งหมดในโฟลเดอร์ labassist-ocr เข้าไปใน Container
COPY . .

# เปิด Port 8000 สำหรับให้ Go backend หรือวง Network ภายในเรียกใช้
EXPOSE 8000

# คำสั่งเริ่มต้นรัน FastAPI ด้วย Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]