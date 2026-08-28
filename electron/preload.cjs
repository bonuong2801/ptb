const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    saveSession: (data) => ipcRenderer.invoke('save-session', data),
    openCustomerScreen: () => ipcRenderer.send('open-customer-screen'),
    broadcastSync: (data) => ipcRenderer.send('broadcast-sync', data),
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  getTunnelUrl: () => ipcRenderer.invoke('get-tunnel-url'),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    
    // Printer APIs
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printImage: (data) => ipcRenderer.invoke('print-image', data),
    getSavedPrinter: () => ipcRenderer.invoke('get-saved-printer'),
    savePrinter: (printerName) => ipcRenderer.invoke('save-printer', printerName),

    onSyncReceived: (callback) => {
      ipcRenderer.removeAllListeners('sync-received');
      ipcRenderer.on('sync-received', (event, data) => callback(data));
    }
  }
);
