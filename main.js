const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
let serverProcess;
let mainWindow;

// Start Express server
function startServer() {
    serverProcess = spawn('node', ['server.js'], {
        stdio: 'inherit'
    });

    serverProcess.on('error', (error) => {
        console.error('Failed to start server process:', error);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'public/icon.png') // Add an icon file
    });

    // Wait a moment for the server to start before loading the URL
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');

        // Open DevTools in development mode
        // if (process.env.NODE_ENV === 'development') {
        //   mainWindow.webContents.openDevTools();
        // }
    }, 1000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', () => {
    startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess) {
            serverProcess.kill();
        }
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// When app is closing, ensure the server is shut down
app.on('will-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});