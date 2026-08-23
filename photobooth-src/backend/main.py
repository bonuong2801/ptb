import os
import base64
import subprocess
from datetime import datetime
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps

app = FastAPI()

# Cho phép Electron gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cấu hình
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "Exports")
FRAME_PATH = os.path.join(BASE_DIR, "frame.png")
CAMERA_CMD = r"C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe"

def process_image(raw_img_path: str, final_img_path: str) -> bool:
    try:
        # Mở ảnh gốc và frame
        raw_img = Image.open(raw_img_path)
        frame_img = Image.open(FRAME_PATH).convert("RGBA")
        
        # Resize và crop ảnh gốc cho vừa với frame
        target_size = frame_img.size
        processed_img = ImageOps.fit(raw_img, target_size, method=Image.Resampling.LANCZOS)
        
        # Tạo ảnh kết quả với kênh alpha (RGBA)
        result = processed_img.convert("RGBA")
        
        # Dán đè frame lên trên ảnh gốc (sử dụng mask là kênh alpha của frame)
        result.paste(frame_img, (0, 0), mask=frame_img)
        
        # Convert về RGB để lưu file JPG
        final_rgb = result.convert("RGB")
        final_rgb.save(final_img_path, "JPEG", quality=95)
        
        # Xóa file ảnh gốc raw để giải phóng bộ nhớ
        raw_img.close()
        os.remove(raw_img_path)
        
        return True
    except Exception as e:
        print(f"Lỗi xử lý ảnh: {e}")
        if os.path.exists(raw_img_path):
            os.remove(raw_img_path)
        return False

import asyncio

@app.post("/api/capture")
async def capture_photo():
    # 1. Tạo thư mục lưu trữ theo ngày hiện tại
    today_str = datetime.now().strftime("%Y-%m-%d")
    current_dir = os.path.join(SAVE_DIR, today_str)
    os.makedirs(current_dir, exist_ok=True)
    
    # 2. Tạo tên file tự động theo thời gian (Fix 5: Add microseconds)
    time_str = datetime.now().strftime("%H%M%S_%f")
    raw_filename = f"RAW_{time_str}.jpg"
    final_filename = f"IMG_{time_str}.jpg"
    
    raw_path = os.path.join(current_dir, raw_filename)
    final_path = os.path.abspath(os.path.join(current_dir, final_filename))
    
    # 3. Gọi CameraControlCmd.exe tải file ảnh gốc về
    cmd = [CAMERA_CMD, "/capture", "/filename", os.path.abspath(raw_path)]
    
    try:
        # Thực thi lệnh (Fix 4: Không block event loop)
        process = await asyncio.create_subprocess_exec(*cmd)
        await asyncio.wait_for(process.communicate(), timeout=15)
        
        if not os.path.exists(raw_path):
            raise FileNotFoundError("Không tìm thấy ảnh raw từ máy ảnh.")
            
        # 4 & 5. Xử lý ảnh (crop, dán frame) và lưu thành phẩm
        success = process_image(raw_path, final_path)
        if success:
            with open(final_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
            return JSONResponse(content={"status": "success", "image_base64": encoded_string})
        else:
            raise Exception("Xử lý ảnh thất bại.")
            
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

if __name__ == "__main__":
    import uvicorn
    # Chạy server ở localhost port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)
