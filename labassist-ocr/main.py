from fastapi import FastAPI
from api.routes import router as ocr_router

app = FastAPI(title="LabAssist OCR Service")

# นำเอา router ที่สร้างไว้มาใช้งาน พร้อมกำหนด prefix URL
app.include_router(ocr_router, prefix="/api/ocr", tags=["OCR"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "OCR Service is running"}