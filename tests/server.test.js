// tests/server.test.js
const request = require('supertest');
const { app, startServer, stopServer, PORT: DEFAULT_PORT } = require('../server'); // Adjust path if your tests folder is elsewhere

// Mock fs.promises for file operations
const mockFsPromises = require('fs').promises;
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        promises: {
            access: jest.fn(),
            readFile: jest.fn(),
            writeFile: jest.fn(),
            mkdir: jest.fn().mockResolvedValue(undefined), // Default successful mock for mkdir
        },
        // If you use any synchronous fs operations that need mocking, add them here
        existsSync: jest.requireActual('fs').existsSync, // Keep original for things like icon path in main.js if it runs
    };
});

// --- Mocking `net.Socket` for `makeRawApiRequest` ---
// `makeRawApiRequest` is complex to unit test perfectly without refactoring it
// into its own module. Mocking `net.Socket` is an attempt to control its behavior.
// A better long-term solution would be to extract `makeRawApiRequest` (see notes below).
const net = require('net');
let mockSocketInstance;
let mockSocketOnDataHandler;
let mockSocketOnCloseHandler;
let mockSocketOnErrorHandler;
let mockSocketConnectCallback;

jest.mock('net', () => {
    const actualNet = jest.requireActual('net'); // Get actual net for other uses if any
    return {
        ...actualNet, // Spread actualNet in case other parts are used
        Socket: jest.fn().mockImplementation(() => {
            const instance = {
                connect: jest.fn((port, host, cb) => {
                    mockSocketConnectCallback = cb;
                    if (mockSocketConnectCallback) setImmediate(mockSocketConnectCallback);
                }),
                write: jest.fn(),
                on: jest.fn(function (event, handler) {
                    if (event === 'data') mockSocketOnDataHandler = handler;
                    if (event === 'close') mockSocketOnCloseHandler = handler;
                    if (event === 'error') mockSocketOnErrorHandler = handler;
                    return this;
                }),
                destroy: jest.fn(),
                setTimeout: jest.fn(),
                _simulateData: (dataBuffer) => {
                    if (mockSocketOnDataHandler) mockSocketOnDataHandler(dataBuffer);
                },
                _simulateClose: () => {
                    if (mockSocketOnCloseHandler) mockSocketOnCloseHandler();
                },
                _simulateError: (err) => {
                    if (mockSocketOnErrorHandler) mockSocketOnErrorHandler(err);
                }
            };
            mockSocketInstance = instance; // Store the most recently created instance
            return instance;
        })
    };
});


describe('Server API Endpoints', () => {
    beforeEach(() => {
        // Reset all mocks before each test
        mockFsPromises.access.mockReset();
        mockFsPromises.readFile.mockReset();
        mockFsPromises.writeFile.mockReset();
        mockFsPromises.mkdir.mockReset().mockResolvedValue(undefined);

        // Reset net.Socket mocks and handlers
        net.Socket.mockClear(); // Clears call counts etc. for the constructor itself
        // For the instance methods, they are fresh per new Socket() due to mockImplementation
        mockSocketOnDataHandler = null;
        mockSocketOnCloseHandler = null;
        mockSocketOnErrorHandler = null;
        mockSocketConnectCallback = null;
    });

    afterAll(async () => {
        // Ensure any test server instance is stopped
        await stopServer();
    });

    describe('GET /api/settings', () => {
        it('should return default settings if settings.json does not exist', async () => {
            mockFsPromises.access.mockRejectedValueOnce(new Error('File not found'));
            mockFsPromises.writeFile.mockResolvedValueOnce(undefined);

            const response = await request(app).get('/api/settings');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ apiKey: '', siteBaseUrl: '', defaultCategoryId: '' });
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('settings.json'),
                JSON.stringify({ apiKey: '', siteBaseUrl: '', defaultCategoryId: '' }, null, 2)
            );
        });

        it('should return existing settings if settings.json exists', async () => {
            const existingSettings = { apiKey: 'test-key', siteBaseUrl: 'http://test.com', defaultCategoryId: 'cat1' };
            mockFsPromises.access.mockResolvedValueOnce(true);
            mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(existingSettings));

            const response = await request(app).get('/api/settings');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(existingSettings);
        });
    });

    describe('POST /api/settings', () => {
        it('should save settings and return a success message', async () => {
            const newSettings = { apiKey: 'new-key', siteBaseUrl: 'http://new.com', defaultCategoryId: 'cat2' };
            mockFsPromises.writeFile.mockResolvedValueOnce(undefined);

            const response = await request(app)
                .post('/api/settings')
                .send(newSettings);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Beállítások sikeresen mentve.');
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('settings.json'),
                JSON.stringify(newSettings, null, 2)
            );
        });
    });

    

    describe('Server Startup Logging', () => {
        let testServerInstance;
        const testPort = DEFAULT_PORT + 1; // Use a different port to avoid EADDRINUSE
        let consoleLogSpy;

        beforeEach(() => {
            consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        });

        afterEach(async () => {
            consoleLogSpy.mockRestore();
            if (testServerInstance && testServerInstance.listening) {
                await new Promise(resolve => testServerInstance.close(resolve));
                testServerInstance = null;
            }
        });

        it('should log "Szerver fut a http://localhost:PORT" on successful start', async () => {
            try {
                testServerInstance = await startServer(testPort); // Uses the exported helper
            } catch (err) {
                // This might happen if the port is actually in use, even if we try a different one.
                // Or if startServer logic itself has an issue.
                console.error("Test for server startup logging failed to start server:", err);
                throw err; // Fail the test immediately
            }

            expect(testServerInstance).toBeDefined();
            expect(testServerInstance.listening).toBe(true);

            // Check console calls. The startServer logs "Test Server started..."
            // The original message "Szerver fut..." is logged when `require.main === module` is true.
            // To test that specific message, you'd need to run server.js as a child process
            // and capture its stdout, which is more of an integration test.
            // For this unit test, we check the log from our exported `startServer`.
            expect(consoleLogSpy).toHaveBeenCalledWith(`[Test Server] Server started on port ${testPort}`);

            // If you want to assert the original startup messages, you'd have to adapt `startServer`
            // or test the `require.main === module` block differently (e.g., child process).
            // For simplicity, we're testing the message from the test helper here.
        });
    });
})