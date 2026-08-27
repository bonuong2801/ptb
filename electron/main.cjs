const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');

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
  if (adminWindow) {
    return await adminWindow.webContents.getPrintersAsync();
  }
  return [];
});

ipcMain.handle('get-saved-printer', () => customConfig.savedPrinter || null);

ipcMain.handle('save-printer', (event, printerName) => {
  saveConfig('savedPrinter', printerName);
  return true;
});

ipcMain.handle('print-image', async (event, { imageBase64, copies, printerName }) => {
  try {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });
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

// -------------------------------------------------------------
// LOCAL PHOTO SERVER
// -------------------------------------------------------------
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
    const newDir = filePaths[0];
    saveConfig('saveDirectory', newDir);
    
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }
    
    photoServer._router.stack = photoServer._router.stack.filter(r => r.name !== 'serveStatic');
    photoServer.use('/session', express.static(newDir));
    
    return newDir;
  }
  return null;
});

function createWindow() {
  adminWindow = new BrowserWindow({
    width: 1200, height: 800,
    title: 'CGBOOTH - Admin',
    webPreferences: { 
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, 
      contextIsolation: true, 
      webSecurity: false 
    }
  });
  adminWindow.setMenuBarVisibility(false);
  adminWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'mode=admin' });
  adminWindow.on('closed', () => { 
    adminWindow = null;
    app.quit(); 
  });

  // Không mở customer window tự động nữa
}

ipcMain.on('open-customer-screen', () => {
  if (customerWindow) {
    customerWindow.focus();
    return;
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
      webSecurity: false 
    }
  });

  customerWindow.setMenuBarVisibility(false);
  customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'mode=camera' });
  customerWindow.webContents.on('did-finish-load', () => {
    customerWindow.show();
    customerWindow.focus();
  });
  customerWindow.on('closed', () => { customerWindow = null; });
});

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
