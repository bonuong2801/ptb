const { app, BrowserWindow, ipcMain, screen, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Tắt hardware acceleration để tránh crash GPU trên Windows (exit_code=-1073741819)
app.disableHardwareAcceleration();

// Tắt Media Foundation để Chromium dùng DirectShow backend — bắt buộc đối với OBS Virtual Camera, EOS Utility & DroidCam
app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

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
  // Tự động cấp quyền truy cập Camera / Microphone cho các cửa sổ
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (['media', 'camera', 'microphone'].includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (['media', 'camera', 'microphone'].includes(permission)) {
        return true;
      }
      return false;
    });
  }

  const currentDir = getSaveDirectory();
  if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

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

ipcMain.handle('save-session', async (event, { sessionName, finalImage, rawImages, videoBase64, videoBuffer }) => {
  try {
    const safeSessionName = (sessionName || `Session_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetDir = path.join(getSaveDirectory(), safeSessionName);
    await fs.promises.mkdir(targetDir, { recursive: true });
    
    const writeTasks = [];

    if (finalImage) {
      const base64Final = finalImage.split(';base64,').pop();
      writeTasks.push(fs.promises.writeFile(path.join(targetDir, 'final_strip.jpg'), Buffer.from(base64Final, 'base64')));
    }
    if (rawImages && Array.isArray(rawImages)) {
      rawImages.forEach((img, index) => {
        if (img) {
          const base64Raw = img.split(';base64,').pop();
          writeTasks.push(fs.promises.writeFile(path.join(targetDir, `raw_photo_${index + 1}.jpg`), Buffer.from(base64Raw, 'base64')));
        }
      });
    }
    if (videoBuffer) {
      writeTasks.push(fs.promises.writeFile(path.join(targetDir, 'bts_video.webm'), Buffer.from(videoBuffer)));
    } else if (videoBase64) {
      const base64Video = videoBase64.split(';base64,').pop();
      writeTasks.push(fs.promises.writeFile(path.join(targetDir, 'bts_video.webm'), Buffer.from(base64Video, 'base64')));
    }

    await Promise.all(writeTasks);

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

// -------------------------------------------------------------
// ACCOUNTING & BOOKKEEPING BACKUP IPCs
// -------------------------------------------------------------
const getAccountingFilePath = () => path.join(getSaveDirectory(), 'accounting_records.json');

ipcMain.handle('save-accounting-backup', async (event, data) => {
  try {
    const filePath = getAccountingFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('[CGBOOTH] Lỗi khi lưu backup sổ sách:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-accounting-backup', async () => {
  try {
    const filePath = getAccountingFilePath();
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[CGBOOTH] Không thể đọc file backup sổ sách:', err.message);
  }
  return null;
});


// -------------------------------------------------------------
// TETHERED CAMERA HOT FOLDER ENGINE
// -------------------------------------------------------------
let tetherWatcher = null;
let currentTetherDir = null;
const processedTetherFiles = new Set();
let isTetherWatching = false;

function broadcastTetherPhoto(photoData) {
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.webContents.send('new-tether-photo', photoData);
  }
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('new-tether-photo', photoData);
  }
}

function waitForFileReady(filePath, maxWaitMs = 6000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastSize = -1;
    let stableCount = 0;

    const check = () => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          if (Date.now() - startTime > maxWaitMs) return reject(err);
          return setTimeout(check, 100);
        }
        if (stats.size > 0 && stats.size === lastSize) {
          stableCount++;
          if (stableCount >= 2) {
            fs.open(filePath, 'r', (openErr, fd) => {
              if (!openErr) {
                fs.close(fd, () => resolve(true));
                return;
              }
              if (Date.now() - startTime > maxWaitMs) return reject(openErr);
              setTimeout(check, 100);
            });
            return;
          }
        } else {
          lastSize = stats.size;
          stableCount = 0;
        }

        if (Date.now() - startTime > maxWaitMs) {
          return reject(new Error('Timeout chờ máy ảnh ghi file xong'));
        }
        setTimeout(check, 100);
      });
    };
    check();
  });
}

function startWatchingTetherFolder(targetDir) {
  if (tetherWatcher) {
    try { tetherWatcher.close(); } catch (e) {}
    tetherWatcher = null;
  }

  const watchDir = targetDir || getTetherDirectory();
  currentTetherDir = watchDir;
  if (!fs.existsSync(watchDir)) {
    try { fs.mkdirSync(watchDir, { recursive: true }); } catch (e) {}
  }

  // Ghi nhận các file đã có từ trước để chỉ bắt các ảnh chụp mới
  try {
    const existing = fs.readdirSync(watchDir);
    existing.forEach(f => processedTetherFiles.add(path.join(watchDir, f)));
  } catch (e) {}

  isTetherWatching = true;

  try {
    tetherWatcher = fs.watch(watchDir, async (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) return;

      const fullPath = path.join(watchDir, filename);
      if (processedTetherFiles.has(fullPath)) return;

      processedTetherFiles.add(fullPath);

      try {
        await waitForFileReady(fullPath);
        const fileBuffer = await fs.promises.readFile(fullPath);
        const base64 = fileBuffer.toString('base64');
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        console.log(`[CGBOOTH Tether] Nhận ảnh mới từ máy ảnh: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
        broadcastTetherPhoto({
          filename,
          fullPath,
          dataUrl,
          size: fileBuffer.length,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('[CGBOOTH Tether] Lỗi xử lý file:', err);
        processedTetherFiles.delete(fullPath);
      }
    });

    console.log('[CGBOOTH Tether] Hot Folder Watcher đang chạy tại:', watchDir);
  } catch (err) {
    console.error('[CGBOOTH Tether] Không thể khởi động Hot Folder Watcher:', err);
  }
}

function stopWatchingTetherFolder() {
  if (tetherWatcher) {
    try { tetherWatcher.close(); } catch (e) {}
    tetherWatcher = null;
  }
  isTetherWatching = false;
  console.log('[CGBOOTH Tether] Hot Folder Watcher đã dừng.');
}

ipcMain.handle('get-hot-folder-path', () => getTetherDirectory());

ipcMain.handle('set-hot-folder-path', (event, newPath) => {
  if (newPath) {
    saveConfig('tetherDirectory', newPath);
    startWatchingTetherFolder(newPath);
    return { success: true, path: newPath };
  }
  return { success: false };
});

ipcMain.handle('select-hot-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(adminWindow, {
    title: 'Chọn Thư Mục Nhận Ảnh Máy Ảnh (Hot Folder)',
    defaultPath: getTetherDirectory(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    saveConfig('tetherDirectory', selected);
    startWatchingTetherFolder(selected);
    return selected;
  }
  return null;
});

ipcMain.handle('open-hot-folder', async () => {
  const dir = getTetherDirectory();
  await shell.openPath(dir);
  return { success: true };
});

ipcMain.handle('start-tether-watch', (event, targetDir) => {
  startWatchingTetherFolder(targetDir);
  return { success: true, isWatching: isTetherWatching, path: currentTetherDir };
});

ipcMain.handle('stop-tether-watch', () => {
  stopWatchingTetherFolder();
  return { success: true, isWatching: false };
});

ipcMain.handle('clear-tether-history', () => {
  processedTetherFiles.clear();
  try {
    const existing = fs.readdirSync(getTetherDirectory());
    existing.forEach(f => processedTetherFiles.add(path.join(getTetherDirectory(), f)));
  } catch (e) {}
  return { success: true };
});
