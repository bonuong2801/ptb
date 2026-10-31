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

    onSyncReceived: (callback) => {
      ipcRenderer.removeAllListeners('sync-received');
      ipcRenderer.on('sync-received', (_event, data) => callback(data));
    }
  }
);
