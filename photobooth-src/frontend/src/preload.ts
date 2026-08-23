import { contextBridge, ipcRenderer } from 'electron';

// Expose các hàm gọi từ Renderer sang Main an toàn
contextBridge.exposeInMainWorld('electronAPI', {
  // Có thể thêm các giao tiếp với Main Process ở đây nếu cần
});
