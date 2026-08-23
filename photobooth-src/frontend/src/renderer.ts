// Lấy các elements từ DOM
const video = document.getElementById('videoElement') as HTMLVideoElement;
const captureBtn = document.getElementById('captureBtn') as HTMLButtonElement;
const countdownOverlay = document.getElementById('countdownOverlay') as HTMLDivElement;
const resultContainer = document.getElementById('resultContainer') as HTMLDivElement;
const resultImage = document.getElementById('resultImage') as HTMLImageElement;
const closeResultBtn = document.getElementById('closeResultBtn') as HTMLButtonElement;

// Khởi tạo luồng Camera cho webview (chỉ để khách hàng xem gương)
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 1280, height: 720 } 
    });
    video.srcObject = stream;
  } catch (err) {
    console.error("Lỗi truy cập camera:", err);
    alert("Không thể mở webcam để hiển thị gương.");
  }
}

initCamera();

// Gửi request tới Python Backend
async function triggerBackendCapture() {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Lỗi Server Backend");
    }

    const data = await response.json();
    if (data.status === "success") {
      // Vì ảnh lưu trên local (ví dụ C:\Exports\...), 
      // để hiển thị trong browser có thể cần dùng file:// protocol hoặc backend trả về base64.
      // Giải pháp tốt nhất là Python trả về Local File Path 
      // Cần cấu hình giao thức file:// trên Electron hoặc map path thông qua Custom Protocol.
      // Để demo, giả sử trả về file URL
      resultImage.src = `data:image/jpeg;base64,${data.image_base64}`;
      resultContainer.style.display = "flex";
    } else {
      alert("Lỗi chụp ảnh: " + data.message);
    }
  } catch (err) {
    console.error("Lỗi kết nối Backend:", err);
    alert("Không thể kết nối đến hệ thống chụp (Backend). Đảm bảo Python server đang chạy.");
  }
}

// Xử lý sự kiện nút Chụp
captureBtn.addEventListener('click', () => {
  captureBtn.disabled = true;
  countdownOverlay.style.display = "block";
  
  let count = 3;
  countdownOverlay.textContent = count.toString();
  
  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      countdownOverlay.textContent = count.toString();
    } else {
      clearInterval(timer);
      countdownOverlay.style.display = "none";
      countdownOverlay.textContent = "3";
      
      // Flash trắng màn hình
      const flash = document.createElement('div');
      flash.style.position = 'absolute';
      flash.style.top = '0'; flash.style.left = '0'; flash.style.right = '0'; flash.style.bottom = '0';
      flash.style.backgroundColor = 'white';
      flash.style.zIndex = '999';
      document.body.appendChild(flash);
      
      setTimeout(() => flash.remove(), 150);

      // Gọi Backend
      triggerBackendCapture().finally(() => {
        captureBtn.disabled = false;
      });
    }
  }, 1000);
});

// Đóng kết quả
closeResultBtn.addEventListener('click', () => {
  resultContainer.style.display = "none";
  resultImage.src = "";
});
