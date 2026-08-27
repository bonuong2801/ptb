const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    saveSession: (data) => ipcRenderer.invoke('save-session', data),
    openCustomerScreen: () => ipcRenderer.send('open-customer-screen'),
    broadcastSync: (data) => ipcRenderer.send('broadcast-sync', data),
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    onSyncReceived: (callback) => {
      ipcRenderer.removeAllListeners('sync-received');
      ipcRenderer.on('sync-received', (event, data) => callback(data));
    }
  }
);
