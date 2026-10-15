const { app, BrowserWindow, ipcMain, screen, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Tắt hardware acceleration để tránh crash GPU trên Windows (exit_code=-1073741819)
app.disableHardwareAcceleration();

let adminWindow = null;
let customerWindow = null;

// Quản lý cấu hình (Thư mục lưu & Máy in)
const configPath = path.join(app.getPath('userData'), 'cgbooth_config.json');
let customConfig = {};
try {
  if (fs.existsSync(configPath)) {
    customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {}

function saveConfig(key, value) {
  customConfig[key] = value;
  fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2));
}

function getSaveDirectory() {
  return customConfig.saveDirectory || path.join(app.getPath('pictures'), 'CGBOOTH');
}

// -------------------------------------------------------------
// PRINTER IPCs
// -------------------------------------------------------------
ipcMain.handle('get-printers', async () => {
  try {
    if (adminWindow) {
      return await adminWindow.webContents.getPrintersAsync();
    }
  } catch (err) {
    console.warn('[CGBOOTH] Không thể lấy danh sách máy in (RPC Server Spooler chưa bật):', err.message);
  }
  return [];
});

ipcMain.handle('get-saved-printer', () => customConfig.savedPrinter || null);

ipcMain.handle('save-printer', (event, printerName) => {
  saveConfig('savedPrinter', printerName);
  return true;
});

// Fix #15: Bỏ nodeIntegration: true ở printWindow
ipcMain.handle('print-image', async (event, { imageBase64, copies, printerName }) => {
  try {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    const htmlContent = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff; }
            img { max-height: 100vh; max-width: 100vw; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${imageBase64}" />
        </body>
      </html>
    `;
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // In ngầm
    for (let i = 0; i < copies; i++) {
      await new Promise((resolve) => {
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: printerName,
          color: true,
        }, (success, failureReason) => {
          if (!success) console.error("Lỗi in:", failureReason);
          resolve();
        });
      });
    }
    
    setTimeout(() => printWindow.destroy(), 1000);
    return { success: true };
  } catch (err) {
    console.error("Lỗi lệnh in:", err);
    return { success: false, error: err.message };
  }
});



// Serve tĩnh toàn bộ thư mục CGBOOTH
app.whenReady().then(async () => {
  const currentDir = getSaveDirectory();
  if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

  // Fix #2: Đăng ký custom protocol để serve file local thay vì webSecurity: false
  protocol.registerFileProtocol('cgbooth', (request, callback) => {
    const url = request.url.replace('cgbooth://', '');
    const filePath = path.normalize(decodeURIComponent(url));
    callback({ path: filePath });
  });

  createWindow();
});

ipcMain.handle('get-save-directory', () => {
  return getSaveDirectory();
});

ipcMain.handle('select-directory', async (event) => {
  // Fix #16: Guard null cho adminWindow
  const parentWindow = adminWindow || null;
  const options = {
    title: 'Chọn thư mục lưu ảnh của CGBOOTH',
    properties: ['openDirectory', 'createDirectory']
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  const { canceled, filePaths } = result;
  
  if (!canceled && filePaths.length > 0) {
    const newDir = filePaths[0];
    saveConfig('saveDirectory', newDir);
    
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }
    
    return newDir;
  }
  return null;
});

function createWindow() {
  const splashVideoPath = path.join(__dirname, 'splash.mp4');
  const hasSplash = fs.existsSync(splashVideoPath);

  // --- 1. Tạo Admin Window ---
  adminWindow = new BrowserWindow({
    width: 1200, height: 800,
    title: 'CGBOOTH - Admin',
    show: !hasSplash, // Nếu không có splash thì hiện cửa sổ Admin ngay lập tức!
    webPreferences: { 
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, 
      contextIsolation: true, 
      webSecurity: true
    }
  });

  adminWindow.setMenuBarVisibility(false);
  adminWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?mode=admin' });
  
  if (!hasSplash) {
    adminWindow.once('ready-to-show', () => {
      adminWindow.show();
      adminWindow.focus();
    });
  }

  adminWindow.on('closed', () => { 
    adminWindow = null;
    app.quit(); 
  });

  // --- 2. Nếu có file splash.mp4 thì mới hiển thị Splash ---
  if (hasSplash) {
    const splashWindow = new BrowserWindow({
      width: 800, height: 600,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      center: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    splashWindow.loadFile(path.join(__dirname, 'splash.html'));

    const finishSplash = () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      if (adminWindow && !adminWindow.isDestroyed()) {
        adminWindow.show();
        adminWindow.focus();
      }
    };

    ipcMain.once('splash-finished', finishSplash);

    // Timeout an toàn 4 giây: nếu splash bị treo/lỗi thì vẫn tự động mở Admin
    setTimeout(finishSplash, 4000);
  }
}

// Fix #9: Đổi ipcMain.on → ipcMain.handle để renderer có thể nhận lỗi
ipcMain.handle('open-customer-screen', async () => {
  try {
    if (customerWindow) {
      customerWindow.focus();
      return { success: true };
    }

    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find(display => display.bounds.x !== 0 || display.bounds.y !== 0);

    customerWindow = new BrowserWindow({
      x: externalDisplay ? externalDisplay.bounds.x : 100,
      y: externalDisplay ? externalDisplay.bounds.y : 100,
      width: 1024, height: 768,
      title: 'CGBOOTH - Customer',
      webPreferences: { 
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false, 
        contextIsolation: true, 
        webSecurity: true  // Fix #2: Bật lại webSecurity
      }
    });

    customerWindow.setMenuBarVisibility(false);
    customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: '?mode=camera' });
    customerWindow.webContents.on('did-finish-load', () => {
      customerWindow.show();
      customerWindow.focus();
    });
    customerWindow.on('closed', () => { customerWindow = null; });
    return { success: true };
  } catch (err) {
    console.error('[CGBOOTH] Failed to open customer screen:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('broadcast-sync', (event, data) => {
  if (adminWindow && event.sender !== adminWindow.webContents) adminWindow.webContents.send('sync-received', data);
  if (customerWindow && event.sender !== customerWindow.webContents) customerWindow.webContents.send('sync-received', data);
});

ipcMain.handle('save-session', async (event, { sessionName, finalImage, rawImages, videoBase64 }) => {
  try {
    const safeSessionName = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetDir = path.join(getSaveDirectory(), safeSessionName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    if (finalImage) {
      const base64Final = finalImage.split(';base64,').pop();
      fs.writeFileSync(path.join(targetDir, 'final_strip.jpg'), base64Final, { encoding: 'base64' });
    }
    if (rawImages && Array.isArray(rawImages)) {
      rawImages.forEach((img, index) => {
        if (img) {
          const base64Raw = img.split(';base64,').pop();
          fs.writeFileSync(path.join(targetDir, `raw_photo_${index + 1}.jpg`), base64Raw, { encoding: 'base64' });
        }
      });
    }
    if (videoBase64) {
      const base64Video = videoBase64.split(';base64,').pop();
      fs.writeFileSync(path.join(targetDir, 'bts_video.webm'), base64Video, { encoding: 'base64' });
    }

    return { 
        success: true, 
        folderPath: targetDir, 
        sessionName: safeSessionName
    };
  } catch (error) {
    console.error('Lỗi khi lưu ảnh:', error);
    return { success: false, error: error.message };
  }
});
