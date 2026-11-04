# 📸 CGBOOTH (NeoBooth v2.0)

> Phần mềm Photobooth studio chụp ảnh chuyên nghiệp trên nền tảng Desktop (Electron & React), hỗ trợ 2 màn hình độc lập, kết nối máy ảnh cơ Canon/Sony qua Tethering Hot Folder, thanh toán VietQR động và sắp xếp in ấn A4 chuẩn 300 DPI.

---

## ✨ Tính năng nổi bật

### 1. 🖥️ Kiến trúc 2 Màn hình độc lập (Dual-Screen Studio)
- **Màn hình Admin (Control Screen)**: 
  - Điều khiển toàn bộ phiên chụp, chọn dải frame, chỉnh sửa khung ảnh trực quan (Visual Editor).
  - Bố cục thông minh: Cột chức năng bên trái cuộn mượt mà độc lập, màn hình Live View và nút chụp chính bên phải luôn cố định trong tầm nhìn.
  - Sổ sách thu chi, đối chiếu cuối buổi và thiết lập máy in.
- **Màn hình Khách (Customer Screen)**:
  - Chiếu toàn màn hình cho khách đứng tạo dáng, đếm ngược đồng hồ quang học (Optical Countdown) với hiệu ứng Liquid Glass.
  - Tự động hiển thị mã thanh toán VietQR và hiệu ứng chúc mừng khi phiên chụp hoàn tất.
  - Đồng bộ thời gian thực siêu tốc qua IPC nội bộ & BroadcastChannel.

### 2. 📷 Đa dạng chế độ chụp ảnh (Multi-Source Capture)
- **Chế độ Live View (1080p)**: Chụp trực tiếp từ Webcam, USB Capture Card (Cam Link), OBS Virtual Camera, DroidCam.
- **Chế độ Máy Ảnh Cơ (24MP Gốc - Tethering Hot Folder)**:
  - Nhận ảnh gốc chất lượng cao từ cảm biến máy ảnh cơ Canon (qua Canon EOS Utility) hoặc Sony (qua Sony Imaging Edge Desktop).
  - Tự động lắng nghe và đưa ảnh vào dải photo strip trong 0.8 giây ngay sau khi máy ảnh chụp.
  - Có cơ chế dự phòng tự động chuyển về video canvas nếu cáp USB bị ngắt kết nối.

### 3. ✂️ Trình sắp xếp & In ấn A4 (A4 Print Arranger - 300 DPI)
- Render ảnh xuất xưởng ở độ phân giải in ấn chuẩn quốc tế 300 DPI (**2480 x 3508 px** cho khổ A4).
- Kéo thả tự do các dải ảnh (5x15 cm, 10x10 cm) lên trang giấy A4.
- Tự động xoay 90 độ, tự động căn chỉnh lề (Snap alignment).
- Tùy chọn hiển thị đường nét đứt và ký hiệu kéo cắt (`✂`) hỗ trợ nhân viên cắt ảnh nhanh chóng.

### 4. 🖨️ In ngầm tự động (Silent Printing)
- Tự động dò tìm danh sách máy in kết nối vào Windows qua RPC Print Spooler.
- Tự động in ảnh theo đúng số lượng khách đặt mà không hiện hộp thoại in của hệ điều hành.

### 5. 💳 Sổ sách Thu Chi & Thanh toán VietQR (Billing & Bookkeeping)
- Tính giá bậc thang tự động (1 frame: 45k, 2 frame: 85k, 3 frame: 120k...).
- Tạo mã VietQR động chuẩn quốc gia, tích hợp kèm mã đơn hàng rút gọn giúp khách chuyển khoản không bị nhầm lẫn.
- Quản lý doanh thu tiền mặt, chuyển khoản, đơn miễn phí và xuất file báo cáo Excel CSV (hỗ trợ hiển thị đúng tiếng Việt với UTF-8 BOM).

### 6. ⌨️ Điều khiển phím tắt & Bàn đạp chân (Pedal Trigger)
- Phím tắt `Space` (Phím cách) hoặc `Enter` để bắt đầu chụp / chụp ảnh tiếp theo.
- Tương thích 100% với remote chụp ảnh từ xa, bàn đạp chân USB (Foot Pedal) hoặc chuột không dây.

---

## 🛠️ Công nghệ sử dụng

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Desktop Engine**: [Electron 34](https://www.electronjs.org/)
- **Lưu trữ cục bộ**: IndexedDB (`syncDB`) xử lý ảnh độ phân giải cao vượt giới hạn LocalStorage
- **Icon Set**: [Lucide React](https://lucide.dev/)

---

## 🚀 Cài đặt & Chạy ứng dụng

### Yêu cầu hệ thống
- Hệ điều hành: Windows 10/11 (64-bit)
- [Node.js](https://nodejs.org/) phiên bản 18.x hoặc 20.x trở lên

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chế độ phát triển (Development)

- **Chạy bản Web trên trình duyệt**:
  ```bash
  npm run dev
  ```
  Truy cập: `http://localhost:3000` (Thêm `?mode=camera` để xem màn hình khách).

- **Chạy cả Electron Desktop và Web Dev**:
  ```bash
  npm run desktop
  ```

- **Chạy nhanh bằng file batch (Windows)**:
  Nhấp đúp chuột vào file `run.bat` tại thư mục gốc.

### 3. Đóng gói bộ cài đặt Desktop (.exe)
```bash
npm run package
```
Bộ cài đặt Windows NSIS (`.exe`) sẽ được tạo trong thư mục `release/`.

---

## 📸 Hướng dẫn kết nối Máy Ảnh Cơ (Canon / Sony)

### Dành cho máy ảnh CANON
1. Kết nối máy ảnh Canon với máy tính bằng cáp USB.
2. Cài đặt và mở phần mềm **Canon EOS Utility**.
3. Trong phần cài đặt **Preferences** $\rightarrow$ **Destination Folder**: Đặt thư mục lưu ảnh trỏ vào thư mục Hot Folder của CGBOOTH (mặc định: `Pictures\CGBOOTH\Tether_Watch`).
4. Trên CGBOOTH, chọn **[ 📷 Máy Cơ (24MP Gốc) ]**. Khi chụp, ảnh gốc sẽ tự động chuyển thẳng vào dải ảnh.

### Dành cho máy ảnh SONY
1. Trên máy ảnh Sony: Vào **Menu** $\rightarrow$ **Setup** $\rightarrow$ **USB Connection** $\rightarrow$ Chọn chế độ **PC Remote**.
2. Cắm cáp USB vào máy tính và mở phần mềm **Sony Imaging Edge (Remote)**.
3. Trong phần cài đặt lưu ảnh: Chọn thư mục lưu ảnh trỏ vào thư mục Hot Folder của CGBOOTH.
4. Bắt đầu chụp và trải nghiệm ảnh 24MP sắc nét từ cảm biến máy ảnh.

---

## 📁 Cấu trúc thư mục

```
ptb/
├── electron/
│   ├── main.cjs            # Electron main process (IPC, Hot Folder watcher, Window management, Silent print)
│   └── preload.cjs         # Context bridge an toàn giữa Electron và Renderer
├── src/
│   ├── components/
│   │   ├── ControlScreen.tsx           # Màn hình Admin quản lý & chụp ảnh
│   │   ├── CameraScreen.tsx            # Màn hình Khách (Customer live view & QR)
│   │   ├── VisualFrameEditor.tsx       # Trình kéo thả thiết kế Frame
│   │   ├── A4PrintArrangerModal.tsx    # Trình sắp xếp dải ảnh lên khổ giấy A4
│   │   └── ReconciliationModal.tsx     # Sổ sách đối chiếu doanh thu & cài đặt bảng giá
│   ├── types/
│   │   ├── booth.ts                    # Kiểu dữ liệu khung ảnh, phiên chụp, IPC
│   │   └── billing.ts                  # Kiểu dữ liệu giao dịch, đơn hàng, bảng giá
│   ├── utils/
│   │   ├── frameRenderer.ts            # Ghép khung ảnh, vẽ A4 300 DPI, IndexedDB caching
│   │   ├── billingService.ts           # Xử lý đơn giá, tạo URL VietQR, xuất CSV
│   │   └── syncService.ts              # Dịch vụ đồng bộ 2 màn hình
│   ├── App.tsx                         # Router chính (phân luồng mode=admin / mode=camera)
│   ├── main.tsx                        # Entry point của React
│   └── index.css                       # Design System Cyber Liquid Glass
├── package.json
├── run.bat
├── tsconfig.json
└── vite.config.ts
```

---

## 📄 Bản quyền
Phần mềm phát triển riêng cho Studio Photobooth **CGBOOTH**.
