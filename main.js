// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs'); // Keep fs for existsSync

let serverProcess;
let mainWindow;
let serverReady = false;
let startupTimeout;

// Check if running in development or production
const isDev = !app.isPackaged;
console.log(`[Main] Running in ${isDev ? 'development' : 'production'} mode`);

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
    console.log(`[Main] Attempting to start server from: ${serverPath}`);

    if (!fs.existsSync(serverPath)) {
        console.error(`[Main] FATAL: Server file not found at: ${serverPath}`);
        // Error handling moved to app.on('ready') or where mainWindow is available
        return false; // Indicate failure
    }
    console.log(`[Main] Server file found at: ${serverPath}. Spawning process...`);

    const nodeExecutable = 'node'; // Assumes node is in PATH or Electron bundles it correctly
    console.log(`[Main] Spawning: ${nodeExecutable} ${serverPath}`);

    serverProcess = spawn(nodeExecutable, [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.log(`[Server STDOUT]: ${output}`);
        }
        if (output.includes('Szerver fut a http://localhost')) {
            console.log('[Main] Server is ready (detected ready message).');
            serverReady = true;
            if (mainWindow && !mainWindow.isDestroyed()) {
                loadApp();
            }
            if (startupTimeout) clearTimeout(startupTimeout);
        }
    });

    serverProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString().trim();
        if (errorOutput) {
            console.error(`[Server STDERR]: ${errorOutput}`);
        }
    });

    serverProcess.on('error', (error) => {
        console.error('[Main] Failed to start server process (spawn error):', error);
        // Error handling for spawn failure
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                `alert('Kritikus hiba a szerver indításakor: ${error.message.replace(/'/g, "\\'").replace(/"/g, '\\"')}. Az alkalmazás leáll.')`
            ).catch(console.error).finally(() => app.quit());
        } else {
            const { dialog } = require('electron'); // require dialog here as app might not be ready for it globally
            dialog.showErrorBox("Kritikus Indítási Hiba", `Hiba a szerver processz indításakor: ${error.message}. Az alkalmazás leáll.`);
            app.quit();
        }
    });

    serverProcess.on('close', (code, signal) => {
        console.log(`[Main] Server process exited with code ${code} and signal ${signal}`);
        serverReady = false;

        let isAppActuallyQuitting = false;
        try {
            // Use the correct API: app.isQuitting()
            if (typeof app.isQuitting === 'function') {
                isAppActuallyQuitting = app.isQuitting();
            } else {
                // This case is strange and suggests 'app' might not be the expected Electron app object
                // or the API is unavailable, which is highly unusual.
                console.warn('[Main] app.isQuitting() is not a function. This is unexpected. Assuming app might be quitting.');
                isAppActuallyQuitting = true; // Default to true to prevent dialog if app state is weird
            }
        } catch (e) {
            console.error('[Main] Error calling or checking app.isQuitting():', e);
            isAppActuallyQuitting = true; // If it errors, assume quitting to be safe
        }

        if (code !== 0 && code !== null && !isAppActuallyQuitting && mainWindow && !mainWindow.isDestroyed()) {
            console.error(`[Main] Server process stopped unexpectedly with code ${code}.`);
            mainWindow.webContents.executeJavaScript(
                `alert('A szerver váratlanul leállt. Kérjük indítsa újra az alkalmazást. (Hibakód: ${code})')`
            ).catch(jsErr => console.error('[Main] JS alert error (server close):', jsErr));
        }
    });

    startupTimeout = setTimeout(() => {
        if (!serverReady && mainWindow && !mainWindow.isDestroyed()) {
            console.log('[Main] Server startup timeout - attempting to load app (will likely show error in window).');
            loadApp(); // This will show the "Server Not Started" message
        }
    }, 10000); // Increased timeout slightly

    return true;
}

function loadApp() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.log('[Main] loadApp called but mainWindow is null or destroyed.');
        return;
    }
    if (!serverReady) {
        console.warn('[Main] loadApp called but server is not ready. Showing connection error in window.');
        mainWindow.webContents.executeJavaScript(`
            document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">'+
                '<h1 style="color: #187ABA;">Szerver Nem Indult El</h1>'+
                '<p style="color: #333;">A belső szerver nem indult el megfelelően, vagy nem vált elérhetővé időben. Kérjük, ellenőrizze a naplófájlokat és indítsa újra az alkalmazást.</p>'+
                '<button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer;" onclick="window.location.reload()">Újrapróbálkozás</button>'+
            '</div>';
        `).catch(jsError => console.error('[Main] Error executing JS for server not ready display:', jsError));
        return;
    }

    const appUrl = 'http://localhost:3000';
    console.log(`[Main] Loading app from: ${appUrl}`);

    mainWindow.loadURL(appUrl).then(() => {
        console.log('[Main] App URL loaded successfully.');
    }).catch(err => {
        console.error('[Main] Failed to load URL:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`
                document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">'+
                    '<h1 style="color: #187ABA;">Kapcsolódási Hiba</h1>'+
                    '<p style="color: #333;">Nem sikerült kapcsolódni a szerverhez. Kérjük indítsa újra az alkalmazást.</p>'+
                    '<p style="color: #666; font-size: 14px;">Hiba: ${err.message.replace(/'/g, "\\'").replace(/"/g, '\\"')}</p>'+
                    '<button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer;" onclick="window.location.reload()">Újrapróbálkozás</button>'+
                '</div>';
            `).catch(jsError => console.error('[Main] Error executing JS for load URL error display:', jsError));
        }
    });
}

function createWindow() {
    console.log('[Main] Creating application window...');
    const iconPath = path.join(__dirname, 'public/icon.png'); // Assumes icon is relative to main.js in dev, or packaged correctly
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: fs.existsSync(iconPath) ? iconPath : null,
        show: false
    });

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

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (serverReady) { // If server became ready before window was fully ready to show
        loadApp();
    }

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', () => {
    console.log('[Main] Electron app is ready.');
    const serverStarted = startServer(); // Attempt to start the server

    if (serverStarted) {
        createWindow(); // If server process spawning was initiated, create window
    } else {
        // This case means server.js file was not found.
        console.error('[Main] Server script not found. Application will quit.');
        const { dialog } = require('electron');
        const serverPath = getServerPath(); // Get path again for the message
        dialog.showErrorBox("Kritikus Hiba", `A szerverfájl nem található: ${serverPath}. Az alkalmazás leáll.`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess && !serverProcess.killed) {
            console.log('[Main] All windows closed. Killing server process.');
            serverProcess.kill();
        }
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) { // Only if no window exists
        console.log('[Main] App activated and no window exists.');
        // Check server status before creating window
        if (!serverProcess || serverProcess.killed || !serverReady) {
            console.log('[Main] Activate: Server not running or not ready. Attempting to (re)start server.');
            const serverStarted = startServer(); // Try to start server
            if (serverStarted) {
                createWindow(); // Then create window
            } else {
                // Server file not found, critical error
                const { dialog } = require('electron');
                const serverPath = getServerPath();
                dialog.showErrorBox("Kritikus Hiba", `A szerverfájl nem található: ${serverPath} (aktiváláskor). Az alkalmazás leáll.`);
                app.quit();
            }
        } else {
            console.log('[Main] Activate: Server seems to be running. Creating window.');
            createWindow();
        }
    }
});

// A flag to ensure 'will-quit' logic runs only once
let quitting = false;
app.on('will-quit', (event) => {
    console.log('[Main] App event: will-quit.');
    if (quitting) return;
    quitting = true;

    if (serverProcess && !serverProcess.killed) {
        console.log('[Main] will-quit: Attempting to kill server process (SIGTERM)...');
        const killed = serverProcess.kill('SIGTERM'); // Attempt graceful shutdown
        console.log(`[Main] serverProcess.kill('SIGTERM') returned: ${killed}`);

        // Give it a moment to shut down gracefully
        // Using a promise to manage timeout and prevent app from closing too early
        const quitTimeout = new Promise((resolve) => {
            setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    console.log('[Main] will-quit: Server process did not terminate via SIGTERM after 1s, sending SIGKILL.');
                    serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 1000); // 1 second timeout
        });

        // Prevent immediate quit if we are waiting for server process
        if (!event.defaultPrevented) {
            event.preventDefault(); // Prevent default quit behavior
            quitTimeout.then(() => {
                console.log('[Main] will-quit: Proceeding with app quit after server kill attempt.');
                app.quit(); // Now actually quit
            });
        }
    } else {
        console.log('[Main] will-quit: Server process already killed or never started.');
    }
});