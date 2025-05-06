// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Listen for server errors
    onServerError: (callback) => {
        ipcRenderer.on('server-error', (event, message) => {
            callback(message);
        });
    }
});