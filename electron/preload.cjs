const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    saveSession: (data) => ipcRenderer.invoke('save-session', data),
    openCustomerScreen: () => ipcRenderer.invoke('open-customer-screen'),
    broadcastSync: (data) => ipcRenderer.send('broadcast-sync', data),
    getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    
    // Printer APIs
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printImage: (data) => ipcRenderer.invoke('print-image', data),
    getSavedPrinter: () => ipcRenderer.invoke('get-saved-printer'),
    savePrinter: (printerName) => ipcRenderer.invoke('save-printer', printerName),

    // Accounting & Bookkeeping APIs
    saveAccountingBackup: (data) => ipcRenderer.invoke('save-accounting-backup', data),
    getAccountingBackup: () => ipcRenderer.invoke('get-accounting-backup'),

    // Tethered Camera Hot Folder APIs
    getHotFolder: () => ipcRenderer.invoke('get-hot-folder-path'),
    setHotFolder: (dir) => ipcRenderer.invoke('set-hot-folder-path', dir),
    selectHotFolder: () => ipcRenderer.invoke('select-hot-folder-dialog'),
    openHotFolder: () => ipcRenderer.invoke('open-hot-folder'),
    startTetherWatch: (dir) => ipcRenderer.invoke('start-tether-watch', dir),
    stopTetherWatch: () => ipcRenderer.invoke('stop-tether-watch'),
    clearTetherHistory: () => ipcRenderer.invoke('clear-tether-history'),
    onTetherPhoto: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('new-tether-photo', listener);
      return () => ipcRenderer.removeListener('new-tether-photo', listener);
    },

    onSyncReceived: (callback) => {
      ipcRenderer.removeAllListeners('sync-received');
      ipcRenderer.on('sync-received', (_event, data) => callback(data));
    }
  }
);
