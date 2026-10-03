from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse
from api.routes import router as ocr_router

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class _UploadSizeLimit(BaseHTTPMiddleware):
    """Reject requests that exceed the size limit or omit Content-Length.
    Requests without Content-Length are rejected to prevent unbounded reads."""
    async def dispatch(self, request: StarletteRequest, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            cl = request.headers.get("content-length")
            if cl is None:
                return JSONResponse(
                    status_code=411,
                    content={"detail": "Content-Length จำเป็นต้องระบุ"},
                )
            if int(cl) > MAX_UPLOAD_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"ไฟล์ใหญ่เกิน {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"},
                )
        return await call_next(request)


app = FastAPI(title="LabAssist OCR Service")
app.add_middleware(_UploadSizeLimit)

app.include_router(ocr_router, prefix="/api/ocr", tags=["OCR"])


@app.get("/")
def read_root():
    return {"status": "ok", "message": "OCR Service is running"}