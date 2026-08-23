const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');

let adminWindow = null;
let customerWindow = null;

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

// Serve tĩnh toàn bộ thư mục Pictures/NeoBooth
app.whenReady().then(() => {
  const neoboothDir = path.join(app.getPath('pictures'), 'NeoBooth');
  if (!fs.existsSync(neoboothDir)) fs.mkdirSync(neoboothDir, { recursive: true });
  photoServer.use('/session', express.static(neoboothDir));
  photoServer.listen(SERVER_PORT, '0.0.0.0', () => {
    console.log(`[NeoBooth] Photo server running at http://${getLocalIP()}:${SERVER_PORT}`);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  adminWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "NeoBooth Admin",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  adminWindow.setMenuBarVisibility(false);
  adminWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  
  adminWindow.on('closed', () => {
    adminWindow = null;
    if (customerWindow) customerWindow.close();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('open-customer-screen', () => {
  if (customerWindow) {
    customerWindow.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  customerWindow = new BrowserWindow({
    x: externalDisplay ? externalDisplay.bounds.x + 50 : undefined,
    y: externalDisplay ? externalDisplay.bounds.y + 50 : undefined,
    width: 1280,
    height: 720,
    title: "NeoBooth Customer",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  customerWindow.setMenuBarVisibility(false);
  customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'mode=camera' });

  customerWindow.webContents.on('did-finish-load', () => {
    customerWindow.show();
    customerWindow.focus();
  });

  customerWindow.on('closed', () => {
    customerWindow = null;
  });
});

ipcMain.on('broadcast-sync', (event, data) => {
  if (adminWindow && event.sender !== adminWindow.webContents) {
    adminWindow.webContents.send('sync-received', data);
  }
  if (customerWindow && event.sender !== customerWindow.webContents) {
    customerWindow.webContents.send('sync-received', data);
  }
});

ipcMain.handle('get-server-url', () => {
  return `http://${getLocalIP()}:${SERVER_PORT}`;
});

ipcMain.handle('save-session', async (event, { sessionName, finalImage, rawImages }) => {
  try {
    const safeSessionName = path.basename(sessionName);
    const targetDir = path.join(app.getPath('pictures'), 'NeoBooth', safeSessionName);
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

    const localIP = getLocalIP();
    const downloadUrl = `http://${localIP}:${SERVER_PORT}/session/${safeSessionName}/final_strip.jpg`;
    return { success: true, folderPath: targetDir, downloadUrl };
  } catch (error) {
    console.error('Lỗi khi lưu ảnh:', error);
    return { success: false, error: error.message };
  }
});
