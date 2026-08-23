# Local Photobooth Source Code

Đây là mã nguồn cho ứng dụng Photobooth cục bộ bao gồm Frontend (Electron) và Backend (Python FastAPI) giao tiếp với máy ảnh Canon thông qua `digiCamControl`.

## Cấu trúc thư mục

- `backend/`: Mã nguồn Python xử lý hình ảnh và gọi `CameraControlCmd.exe`.
- `frontend/`: Mã nguồn Electron hiển thị giao diện UI đếm ngược.

## 1. Hướng dẫn chạy Backend (Python)

1. Cài đặt Python 3.10 trở lên.
2. Mở Terminal tại thư mục `backend/`.
3. Cài đặt các thư viện cần thiết:
   ```bash
   pip install -r requirements.txt
   ```
4. Đảm bảo phần mềm [digiCamControl](http://digicamcontrol.com/) đã được cài đặt ở thư mục mặc định `C:\Program Files (x86)\digiCamControl\`.
5. Đặt file `frame.png` (ảnh khung nền có vùng trong suốt alpha) vào thư mục `backend/`.
6. Chạy API Server:
   ```bash
   python main.py
   ```
7. Server sẽ chạy ngầm tại địa chỉ: `http://127.0.0.1:8000`

## 2. Hướng dẫn chạy Frontend (Electron)

1. Cài đặt [Node.js](https://nodejs.org/).
2. Mở Terminal tại thư mục `frontend/`.
3. Cài đặt các package cần thiết:
   ```bash
   npm install
   ```
4. Build mã TypeScript sang JavaScript:
   ```bash
   npm run build
   ```
5. Chạy ứng dụng Electron (UI máy tính cảm ứng):
   ```bash
   npm start
   ```

## Workflow

1. Khi khách hàng bấm "BẮT ĐẦU CHỤP" trên Electron UI, màn hình sẽ đếm ngược `3..2..1` và phát ra hiệu ứng Flash trắng.
2. Electron gửi API request tới Python (`POST /api/capture`).
3. Python kích hoạt `CameraControlCmd.exe /capture` để chụp và tải file raw về.
4. Python dùng `Pillow` kết hợp `ImageOps.fit` để crop ảnh vừa đúng kích thước của `frame.png`, dán khung đè lên (dùng alpha mask) và lưu lại.
5. Python xóa file raw cũ và trả đường dẫn file ảnh thành phẩm về Electron để hiển thị cho khách hàng.
