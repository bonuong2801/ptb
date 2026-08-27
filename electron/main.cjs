const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');

let adminWindow = null;
let customerWindow = null;

// Quản lý thư mục lưu mặc định
const configPath = path.join(app.getPath('userData'), 'cgbooth_config.json');
let customSaveDir = null;
try {
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (cfg.saveDirectory) customSaveDir = cfg.saveDirectory;
  }
} catch (e) {}

function getSaveDirectory() {
  return customSaveDir || path.join(app.getPath('pictures'), 'CGBOOTH');
}

// ─── Local photo server ───────────────────────────────────────────────────────
const SERVER_PORT = 3001;
const photoServer = express();

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const net of ifaces) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

let localTunnelInstance = null;
let publicUrl = null;

// Serve tĩnh toàn bộ thư mục CGBOOTH
app.whenReady().then(async () => {
  const currentDir = getSaveDirectory();
  if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });
  
  photoServer.use('/session', express.static(currentDir));
  
  // CORS needed for the web app to fetch from localtunnel
  photoServer.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  photoServer.listen(SERVER_PORT, '0.0.0.0', async () => {
    console.log(`[CGBOOTH] Photo server running at http://${getLocalIP()}:${SERVER_PORT}`);
    try {
      const localtunnel = require('localtunnel');
      localTunnelInstance = await localtunnel({ port: SERVER_PORT });
      publicUrl = localTunnelInstance.url;
      console.log(`[CGBOOTH] Public Tunnel running at: ${publicUrl}`);
      
      localTunnelInstance.on('close', () => {
        console.log('[CGBOOTH] Tunnel closed');
      });
    } catch (e) {
      console.error('[CGBOOTH] Failed to start Localtunnel:', e);
    }
  });

  createWindow();
});

ipcMain.handle('get-save-directory', () => {
  return getSaveDirectory();
});

ipcMain.handle('select-directory', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(adminWindow, {
    title: 'Chọn thư mục lưu ảnh của CGBOOTH',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (!canceled && filePaths.length > 0) {
    customSaveDir = filePaths[0];
    fs.writeFileSync(configPath, JSON.stringify({ saveDirectory: customSaveDir }));
    
    // Khởi tạo thư mục nếu chưa có
    if (!fs.existsSync(customSaveDir)) {
      fs.mkdirSync(customSaveDir, { recursive: true });
    }
    
    // Chuyển hướng express static
    photoServer._router.stack = photoServer._router.stack.filter(r => r.name !== 'serveStatic');
    photoServer.use('/session', express.static(customSaveDir));
    
    return customSaveDir;
  }
  return null;
});

function createWindow() {
  adminWindow = new BrowserWindow({
    width: 1200, height: 800,
    title: 'CGBOOTH - Admin',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });
  adminWindow.setMenuBarVisibility(false);
  adminWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'mode=admin' });
  adminWindow.on('closed', () => { 
    adminWindow = null;
    app.quit(); 
  });

  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find(display => display.bounds.x !== 0 || display.bounds.y !== 0);

  customerWindow = new BrowserWindow({
    x: externalDisplay ? externalDisplay.bounds.x : 100,
    y: externalDisplay ? externalDisplay.bounds.y : 100,
    width: 1024, height: 768,
    title: 'CGBOOTH - Customer',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });

  customerWindow.setMenuBarVisibility(false);
  customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'mode=camera' });
  customerWindow.webContents.on('did-finish-load', () => {
    customerWindow.show();
    customerWindow.focus();
  });
  customerWindow.on('closed', () => { customerWindow = null; });
}

ipcMain.on('broadcast-sync', (event, data) => {
  if (adminWindow && event.sender !== adminWindow.webContents) adminWindow.webContents.send('sync-received', data);
  if (customerWindow && event.sender !== customerWindow.webContents) customerWindow.webContents.send('sync-received', data);
});

ipcMain.handle('get-server-url', () => `http://${getLocalIP()}:${SERVER_PORT}`);

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

    const downloadUrl = publicUrl 
        ? `${publicUrl}/session/${safeSessionName}/final_strip.jpg`
        : `http://${getLocalIP()}:${SERVER_PORT}/session/${safeSessionName}/final_strip.jpg`;
        
    return { 
        success: true, 
        folderPath: targetDir, 
        downloadUrl,
        publicTunnelUrl: publicUrl ? `${publicUrl}/session/${safeSessionName}` : null,
        sessionName: safeSessionName
    };
  } catch (error) {
    console.error('Lỗi khi lưu ảnh:', error);
    return { success: false, error: error.message };
  }
});
