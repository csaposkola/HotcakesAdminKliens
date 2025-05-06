// main.js
const { app, BrowserWindow, dialog } = require('electron'); // Added dialog here
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs'); // Keep fs for existsSync

let serverProcess;
let mainWindow;
let serverReady = false;
let startupTimeout;
let loadingStartTime; // To track loading screen display time
const MIN_LOADING_SCREEN_DURATION = 500;

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

// Get the appropriate path for files in the public directory
function getPublicFilePath(fileName) {
    if (isDev) {
        return path.join(__dirname, 'public', fileName);
    } else {
        // In production, public files are in 'app/public' within resourcesPath
        return path.join(process.resourcesPath, 'app', 'public', fileName);
    }
}


// Start Express server
function startServer() {
    const serverPath = getServerPath();
    console.log(`[Main] Attempting to start server from: ${serverPath}`);

    if (!fs.existsSync(serverPath)) {
        console.error(`[Main] FATAL: Server file not found at: ${serverPath}`);
        return false; // Indicate failure
    }
    console.log(`[Main] Server file found at: ${serverPath}. Spawning process...`);

    const nodeExecutable = 'node';
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
        const errorMessageContent = `
            document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif; background: #121212; color: #FFFFFF; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">'+
            '<h1 style="color: #D3086F;">Kritikus Hiba</h1>'+
            '<p style="color: #B3B3B3;">Hiba a szerver processz indításakor: ${error.message.replace(/'/g, "\\'").replace(/"/g, '\\"')}. Az alkalmazás leáll.</p>'+
            '</div>';`;

        const now = Date.now();
        const elapsedTime = loadingStartTime ? (now - loadingStartTime) : MIN_LOADING_SCREEN_DURATION;
        const remainingTime = MIN_LOADING_SCREEN_DURATION - elapsedTime;

        const showErrorAndQuit = () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(errorMessageContent)
                    .catch(console.error)
                    .finally(() => {
                        dialog.showErrorBox("Kritikus Indítási Hiba", `Hiba a szerver processz indításakor: ${error.message}. Az alkalmazás leáll.`);
                        app.quit();
                    });
            } else {
                dialog.showErrorBox("Kritikus Indítási Hiba", `Hiba a szerver processz indításakor: ${error.message}. Az alkalmazás leáll.`);
                app.quit();
            }
        };

        if (remainingTime > 0 && mainWindow && !mainWindow.isDestroyed()) { // Only delay if window exists
            console.log(`[Main] Delaying critical error display by ${remainingTime}ms for min loading time.`);
            setTimeout(showErrorAndQuit, remainingTime);
        } else {
            showErrorAndQuit();
        }
    });

    serverProcess.on('close', (code, signal) => {
        console.log(`[Main] Server process exited with code ${code} and signal ${signal}`);
        serverReady = false;

        let isAppActuallyQuitting = false;
        try {
            if (typeof app.isQuitting === 'function') {
                isAppActuallyQuitting = app.isQuitting();
            } else {
                console.warn('[Main] app.isQuitting() is not a function. Assuming app might be quitting.');
                isAppActuallyQuitting = true;
            }
        } catch (e) {
            console.error('[Main] Error calling or checking app.isQuitting():', e);
            isAppActuallyQuitting = true;
        }

        if (code !== 0 && code !== null && !isAppActuallyQuitting && mainWindow && !mainWindow.isDestroyed()) {
            console.error(`[Main] Server process stopped unexpectedly with code ${code}.`);
            const errorMessageContent = `
                document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif; background: #121212; color: #FFFFFF; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">'+
                '<h1 style="color: #D3086F;">Szerver Leállt</h1>'+
                '<p style="color: #B3B3B3;">A belső szerver váratlanul leállt (Hibakód: ${code}). Kérjük indítsa újra az alkalmazást.</p>'+
                '<button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer; border-radius: 4px;" onclick="window.location.reload()">Újraindítás</button>'+
                '</div>';`;

            const now = Date.now();
            const elapsedTime = loadingStartTime ? (now - loadingStartTime) : MIN_LOADING_SCREEN_DURATION;
            const remainingTime = MIN_LOADING_SCREEN_DURATION - elapsedTime;

            const showServerStoppedError = () => {
                mainWindow.webContents.executeJavaScript(errorMessageContent)
                    .catch(jsErr => console.error('[Main] JS alert error (server close):', jsErr));
            };

            if(remainingTime > 0) {
                console.log(`[Main] Delaying server stopped error display by ${remainingTime}ms for min loading time.`);
                setTimeout(showServerStoppedError, remainingTime);
            } else {
                showServerStoppedError();
            }
        }
    });

    startupTimeout = setTimeout(() => {
        if (!serverReady && mainWindow && !mainWindow.isDestroyed()) {
            console.log('[Main] Server startup timeout - attempting to load app (will likely show error in window).');
            loadApp();
        }
    }, 15000);

    return true;
}

function loadApp() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.log('[Main] loadApp called but mainWindow is null or destroyed.');
        return;
    }

    const performLoad = () => {
        if (!serverReady) {
            console.warn('[Main] loadApp (delayed or immediate): server is not ready. Showing connection error in window.');
            // Ensure we load the error page, not just execute JS on current loading.html
            const errorHtmlContent = `
                <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif; background: #121212; color: #FFFFFF; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <h1 style="color: #FA823C;">Szerver Nem Kész</h1>
                    <p style="color: #B3B3B3;">A belső szerver még nem áll készen a kérések fogadására. Kérjük, várjon egy kicsit, vagy próbálja újra.</p>
                    <button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer; border-radius: 4px;" onclick="window.location.reload()">Újrapróbálkozás</button>
                </div>`;
            mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtmlContent)}`)
                .catch(jsError => console.error('[Main] Error loading server not ready display:', jsError));
            return;
        }

        const appUrl = 'http://localhost:3000';
        console.log(`[Main] Loading app (delayed or immediate) from: ${appUrl}`);

        mainWindow.loadURL(appUrl).then(() => {
            console.log('[Main] App URL loaded successfully.');
        }).catch(err => {
            console.error('[Main] Failed to load URL:', err);
            if (mainWindow && !mainWindow.isDestroyed()) {
                const errorHtmlContent = `
                    <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif; background: #121212; color: #FFFFFF; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <h1 style="color: #D3086F;">Kapcsolódási Hiba</h1>
                        <p style="color: #B3B3B3;">Nem sikerült kapcsolódni a szerverhez (${appUrl}). Kérjük indítsa újra az alkalmazást.</p>
                        <p style="color: #888; font-size: 14px;">Hiba: ${err.message.replace(/'/g, "\\'").replace(/"/g, '\\"')}</p>
                        <button style="background: #187ABA; color: white; border: none; padding: 10px 20px; margin-top: 20px; cursor: pointer; border-radius: 4px;" onclick="window.location.reload()">Újrapróbálkozás</button>
                    </div>`;
                mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtmlContent)}`)
                    .catch(jsError => console.error('[Main] Error loading URL error display:', jsError));
            }
        });
    };

    const now = Date.now();
    const elapsedTime = (typeof loadingStartTime === 'number') ? (now - loadingStartTime) : MIN_LOADING_SCREEN_DURATION;
    const remainingTime = MIN_LOADING_SCREEN_DURATION - elapsedTime;

    if (remainingTime > 0) {
        console.log(`[Main] Delaying app/error load by ${remainingTime}ms to meet minimum loading screen time.`);
        setTimeout(performLoad, remainingTime);
    } else {
        performLoad();
    }
}

function createWindow() {
    console.log('[Main] Creating application window...');
    const iconPath = getPublicFilePath('icon.png');
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        show: false,
        backgroundColor: '#121212' // Dark background for window before content loads
    });

    loadingStartTime = Date.now();
    const loadingHtmlPath = getPublicFilePath('loading.html');
    console.log(`[Main] Loading initial screen from: ${loadingHtmlPath}`);
    mainWindow.loadFile(loadingHtmlPath)
        .then(() => console.log('[Main] loading.html loaded.'))
        .catch(err => {
            console.error('[Main] Failed to load loading.html:', err);
            // Fallback to an inline loading message if loading.html fails
            mainWindow.loadURL(`data:text/html;charset=utf-8,
                <html><body style="background:#121212;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h1>Betöltés...</h1></body></html>`
            );
        });


    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (serverReady) {
        loadApp();
    }

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', () => {
    console.log('[Main] Electron app is ready.');
    const serverStartedSuccessfully = startServer();

    if (serverStartedSuccessfully) {
        createWindow();
    } else {
        console.error('[Main] Server script not found. Application will quit.');
        const serverPathForError = getServerPath();
        dialog.showErrorBox("Kritikus Hiba", `A szerverfájl (${path.basename(serverPathForError)}) nem található a várt helyen: ${serverPathForError}. Az alkalmazás leáll.`);
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
    if (mainWindow === null) {
        console.log('[Main] App activated and no window exists.');
        if (!serverProcess || serverProcess.killed || !serverReady) {
            console.log('[Main] Activate: Server not running or not ready. Attempting to (re)start server.');
            const serverStartedOnActivate = startServer();
            if (serverStartedOnActivate) {
                createWindow();
            } else {
                const serverPathForError = getServerPath();
                dialog.showErrorBox("Kritikus Hiba", `A szerverfájl (${path.basename(serverPathForError)}) nem található aktiváláskor: ${serverPathForError}. Az alkalmazás leáll.`);
                app.quit();
            }
        } else {
            console.log('[Main] Activate: Server seems to be running. Creating window.');
            createWindow();
        }
    } else {
        if (!mainWindow.isVisible()) {
            mainWindow.show();
        }
        mainWindow.focus();
    }
});

let quitting = false;
app.on('will-quit', (event) => {
    console.log('[Main] App event: will-quit.');
    if (quitting) return;
    quitting = true;

    if (serverProcess && !serverProcess.killed) {
        console.log('[Main] will-quit: Attempting to kill server process (SIGTERM)...');
        const killed = serverProcess.kill('SIGTERM');
        console.log(`[Main] serverProcess.kill('SIGTERM') returned: ${killed}`);

        event.preventDefault();

        const quitPromise = new Promise((resolve) => {
            const killTimeout = setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    console.log('[Main] will-quit: Server process SIGTERM timeout. Sending SIGKILL.');
                    serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 1500);

            serverProcess.on('close', () => {
                clearTimeout(killTimeout);
                console.log('[Main] will-quit: Server process confirmed closed.');
                resolve();
            });
        });

        quitPromise.then(() => {
            console.log('[Main] will-quit: Proceeding with app quit.');
            app.quit();
        });

    } else {
        console.log('[Main] will-quit: Server process already killed or never started.');
    }
});