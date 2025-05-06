// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let serverProcess;
let mainWindow;
let serverReady = false;
let startupTimeout;

// Check if running in development or production
const isDev = !app.isPackaged;
console.log(`Running in ${isDev ? 'development' : 'production'} mode`);

// Get the appropriate path for server.js
function getServerPath() {
    if (isDev) {
        return path.join(__dirname, 'server.js');
    } else {
        // In production, look for server.js in extraResources
        return path.join(process.resourcesPath, 'app', 'server.js');
    }
}

// Start Express server
function startServer() {
    const serverPath = getServerPath();
    console.log(`Starting server from: ${serverPath}`);

    // Check if server file exists
    if (!fs.existsSync(serverPath)) {
        console.error(`Server file not found at: ${serverPath}`);
        return false;
    }

    serverProcess = spawn('node', [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr
    });

    // Log server output
    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`Server: ${output}`);

        // When server is ready, set the flag and load the app
        if (output.includes('Szerver fut a http://localhost')) {
            console.log('Server is ready');
            serverReady = true;
            if (mainWindow) {
                loadApp();
            }
            clearTimeout(startupTimeout);
        }
    });

    // Log server errors
    serverProcess.stderr.on('data', (data) => {
        console.error(`Server error: ${data.toString()}`);
    });

    serverProcess.on('error', (error) => {
        console.error('Failed to start server process:', error);
        app.quit();
    });

    serverProcess.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
        if (code !== 0 && mainWindow) {
            mainWindow.webContents.executeJavaScript(
                `alert('A szerver leállt. Kérjük indítsa újra az alkalmazást. (Hibakód: ${code})')`
            ).catch(console.error);
        }
    });

    // Set a timeout for server startup
    startupTimeout = setTimeout(() => {
        console.log('Server startup timeout - trying to load app anyway');
        serverReady = true;
        if (mainWindow) {
            loadApp();
        }
    }, 5000); // 5 seconds timeout

    return true;
}

// Load the application in the window
function loadApp() {
    const appUrl = 'http://localhost:3000';
    console.log(`Loading app from: ${appUrl}`);

    mainWindow.loadURL(appUrl).catch(err => {
        console.error('Failed to load URL:', err);

        // Display error message directly in the window
        mainWindow.webContents.executeJavaScript(`
            document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">'+
                '<h1 style="color: #187ABA;">Kapcsolódási Hiba</h1>'+
                '<p style="color: #333;">Nem sikerült kapcsolódni a szerverhez. Kérjük indítsa újra az alkalmazást.</p>'+
                '<p style="color: #666; font-size: 14px;">Hiba: ${err.message}</p>'+
                '<button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer;" onclick="window.location.reload()">Újrapróbálkozás</button>'+
            '</div>';
        `).catch(console.error);
    });
}

// Create the main window
function createWindow() {
    console.log('Creating application window...');

    // Determine icon path based on environment
    const iconPath = path.join(__dirname, 'public/icon.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: fs.existsSync(iconPath) ? iconPath : null,
        show: false // Don't show until content is loaded
    });

    // Show a simple loading page
    mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa; }
                .loader { text-align: center; }
                h2 { color: #187ABA; }
                .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #187ABA; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="loader">
                <div class="spinner"></div>
                <h2>HotCakes Betöltése...</h2>
                <p>Kérjük várjon, amíg a rendszer elindul.</p>
            </div>
        </body>
        </html>
    `);

    // Show the window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load app once server is ready
    if (serverReady) {
        loadApp();
    }

    // Open DevTools in development mode
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App ready event
app.on('ready', () => {
    const serverStarted = startServer();

    if (serverStarted) {
        createWindow();
    } else {
        console.error('Failed to start server, quitting app');
        app.quit();
    }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess) {
            serverProcess.kill();
        }
        app.quit();
    }
});

// Re-create window on macOS when dock icon is clicked
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Ensure server is shutdown when app is quitting
app.on('will-quit', () => {
    if (serverProcess) {
        console.log('Stopping server...');
        serverProcess.kill();
    }
});