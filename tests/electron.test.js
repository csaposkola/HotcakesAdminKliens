// Purpose: Selenium UI tests for the Electron application.

const { Builder, By, Key, until, Select } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const chromedriver = require('chromedriver'); // npm package
const path = require('path');
const fs = require('fs-extra'); // For easier file operations
const { startMockApiServer, stopMockApiServer, MOCK_API_PORT } = require('./mockApiServer');

// Path to the Electron app's root directory from the perspective of this test file
const APP_ROOT_DIR = path.resolve(__dirname, '..');
const ELECTRON_APP_PATH = path.join(APP_ROOT_DIR, 'node_modules', '.bin', 'electron');
const MAIN_JS_ARG = APP_ROOT_DIR; // Electron will look for main.js in this directory

const ORIGINAL_SETTINGS_PATH = path.join(APP_ROOT_DIR, 'settings.json');
const TEMP_SETTINGS_BACKUP_PATH = path.join(__dirname, 'fixtures', 'settings.backup.json');

describe('HotCakes Admin Electron App UI Tests', () => {
    let driver;
    let mockApi;

    beforeAll(async () => {
        // ... (backup settings, modify settings, start mock API) ...

        // 4. Configure ChromeDriver service
        // chrome.setDefaultService(new chrome.ServiceBuilder(chromedriver.path).build()); // <--- MAKE SURE THIS IS COMMENTED OUT OR DELETED

        // 5. Build Selenium WebDriver for Electron
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(
                new chrome.Options()
                    .setChromeBinaryPath(ELECTRON_APP_PATH)
                    .addArguments([MAIN_JS_ARG])
            )
            .build();

        // ... rest of beforeAll
    }, 80000);
    // ...
});


// Helper function to wait for elements
const WAI_TIMEOUT = 15000; // Increased from 10s
async function waitForElement(driver, locator, timeout = WAI_TIMEOUT) {
    return driver.wait(until.elementLocated(locator), timeout);
}
async function waitForElementToBeVisible(driver, element, timeout = WAI_TIMEOUT) {
    return driver.wait(until.elementIsVisible(element), timeout);
}
async function findAndClick(driver, locator, timeout = WAI_TIMEOUT) {
    const element = await waitForElement(driver, locator, timeout);
    await element.click();
    return element;
}
async function findAndType(driver, locator, text, timeout = WAI_TIMEOUT) {
    const element = await waitForElement(driver, locator, timeout);
    await element.clear(); // Clear existing text
    await element.sendKeys(text);
    return element;
}
async function selectDropdownByValue(driver, locator, value, timeout = WAI_TIMEOUT) {
    const selectElement = await waitForElement(driver, locator, timeout);
    const select = new Select(selectElement);
    await select.selectByValue(value);
}
async function selectDropdownByVisibleText(driver, locator, text, timeout = WAI_TIMEOUT) {
    const selectElement = await waitForElement(driver, locator, timeout);
    const select = new Select(selectElement);
    await select.selectByVisibleText(text);
}

describe('HotCakes Admin Electron App UI Tests', () => {
    let driver;
    let mockApi;

    beforeAll(async () => {
        // 1. Backup original settings.json
        if (await fs.pathExists(ORIGINAL_SETTINGS_PATH)) {
            await fs.copy(ORIGINAL_SETTINGS_PATH, TEMP_SETTINGS_BACKUP_PATH);
        } else {
            // Create a dummy original settings if it doesn't exist, so restoration doesn't fail
            await fs.writeJson(TEMP_SETTINGS_BACKUP_PATH, {
                apiKey: "dummy_original_key",
                siteBaseUrl: "http://dummy.original.url",
                defaultCategoryId: "dummy_cat_id"
            });
        }

        // 2. Modify settings.json to point to our mock API
        const testSettings = {
            apiKey: "test-api-key", // Mock API server doesn't validate this strictly
            siteBaseUrl: `http://localhost:${MOCK_API_PORT}`, // Point to our mock API
            defaultCategoryId: "cat-default" // A category BVIN from mock-categories.json
        };
        await fs.writeJson(ORIGINAL_SETTINGS_PATH, testSettings, { spaces: 2 });
        console.log('[TestSetup] Modified settings.json to use mock API.');

        // 3. Start the mock API server
        mockApi = await startMockApiServer();

        // 4. Configure ChromeDriver service
        chrome.setDefaultService(new chrome.ServiceBuilder(chromedriver.path).build());

        // 5. Build Selenium WebDriver for Electron
        driver = await new Builder()
            .forBrowser('chrome') // Electron is based on Chromium
            .setChromeOptions(
                new chrome.Options()
                    .setChromeBinaryPath(ELECTRON_APP_PATH)
                    .addArguments([MAIN_JS_ARG]) // Argument to Electron: path to your app's root
                // .addArguments(['--remote-debugging-port=9223']) // Optional: for debugging Electron app
            )
            .build();

        // Wait for the initial loading screen to potentially pass, then for the main app UI
        try {
            await driver.wait(until.urlContains('index.html'), 20000); // Wait for main app page
        } catch (e) {
            console.warn("Initial URL did not become index.html, attempting to load it directly if on loading.html");
            const currentUrl = await driver.getCurrentUrl();
            if (currentUrl.includes("loading.html") || currentUrl.includes("error.html") || currentUrl.includes("data:text/html")) {
                await driver.get('http://localhost:3000/index.html'); // App's server.js serves this
                await driver.wait(until.titleIs('Hotcakes Tanfolyamkezelő'), WAI_TIMEOUT);
            } else {
                throw e; // Re-throw if it's not a known initial page
            }
        }
    }, 80000); // Increased timeout for beforeAll

    afterAll(async () => {
        if (driver) {
            await driver.quit();
        }
        if (mockApi) {
            await stopMockApiServer();
        }
        // Restore original settings.json
        if (await fs.pathExists(TEMP_SETTINGS_BACKUP_PATH)) {
            await fs.move(TEMP_SETTINGS_BACKUP_PATH, ORIGINAL_SETTINGS_PATH, { overwrite: true });
            console.log('[TestCleanup] Restored original settings.json.');
        }
    }, 30000);

    test('should load the application and display the correct title', async () => {
        await driver.wait(until.titleIs('Hotcakes Tanfolyamkezelő'), WAI_TIMEOUT);
        const title = await driver.getTitle();
        expect(title).toBe('Hotcakes Tanfolyamkezelő');
    });

    describe('Navigation', () => {
        const navigateTo = async (viewId, expectedTitleText) => {
            await findAndClick(driver, By.css(`.sidebar .nav-link[data-view="${viewId}"]`));
            const viewElement = await waitForElement(driver, By.id(viewId));
            await waitForElementToBeVisible(driver, viewElement);
            const titleElement = await waitForElement(driver, By.css(`#${viewId} h2`));
            expect(await titleElement.getText()).toContain(expectedTitleText);
        };

        test('should navigate to Courses view by default', async () => {
            const coursesView = await driver.findElement(By.id('courses-view'));
            expect(await coursesView.isDisplayed()).toBe(true);
            const titleElement = await driver.findElement(By.css('#courses-view h2'));
            expect(await titleElement.getText()).toContain('Ütemezett Tanfolyamok');
        });

        test('should navigate to Templates view', async () => {
            await navigateTo('templates-view', 'Tanfolyam Sablonok');
        });

        test('should navigate to Settings view', async () => {
            await navigateTo('settings-view', 'Beállítások');
        });

        // Navigate back to courses for subsequent tests if needed
        afterAll(async () => {
            await findAndClick(driver, By.css(`.sidebar .nav-link[data-view="courses-view"]`));
        });
    });

    describe('Settings View', () => {
        beforeAll(async () => {
            await findAndClick(driver, By.css(`.sidebar .nav-link[data-view="settings-view"]`));
            await waitForElement(driver, By.id('settings-view'));
        });

        test('should load and display API key and Base URL from (mocked) settings', async () => {
            // The test settings are written to settings.json, which server.js reads.
            // The UI's app.js then fetches /api/settings from server.js.
            const apiKeyInput = await waitForElement(driver, By.id('api-key'));
            const baseUrlInput = await waitForElement(driver, By.id('base-url'));

            // Wait for values to be populated by loadSettings() in app.js
            await driver.wait(async () => (await apiKeyInput.getAttribute('value')) === 'test-api-key', WAI_TIMEOUT);
            await driver.wait(async () => (await baseUrlInput.getAttribute('value')) === `http://localhost:${MOCK_API_PORT}`, WAI_TIMEOUT);

            expect(await apiKeyInput.getAttribute('value')).toBe('test-api-key');
            expect(await baseUrlInput.getAttribute('value')).toBe(`http://localhost:${MOCK_API_PORT}`);
        });

        test('should load categories when "Kategóriák Betöltése" is clicked', async () => {
            await findAndClick(driver, By.id('load-categories'));
            const categorySelect = await waitForElement(driver, By.id('category-select'));
            // Wait for options to be populated (mock API returns 3 categories)
            await driver.wait(async () => (await categorySelect.findElements(By.tagName('option'))).length >= 3, WAI_TIMEOUT);

            const options = await categorySelect.findElements(By.tagName('option'));
            expect(options.length).toBeGreaterThanOrEqual(3); // -- Válassz -- + mock categories

            const optionTexts = await Promise.all(options.map(opt => opt.getText()));
            expect(optionTexts).toContain('Mock Kategória 1');
            expect(optionTexts).toContain('Mock Alapértelmezett Kategória');

            const settingsStatus = await driver.findElement(By.id('settings-status'));
            await driver.wait(until.elementTextContains(settingsStatus, 'Betöltve'), WAI_TIMEOUT);
            expect(await settingsStatus.getText()).toContain('Betöltve 3 kategória.'); // Based on mock-categories.json
        });

        test('should save settings', async () => {
            await findAndType(driver, By.id('api-key'), 'new-test-api-key');
            await findAndType(driver, By.id('base-url'), `http://localhost:${MOCK_API_PORT}/new`);

            // Ensure categories are loaded to select one
            if ((await (await driver.findElement(By.id('category-select'))).findElements(By.tagName('option'))).length <= 1) {
                await findAndClick(driver, By.id('load-categories'));
                await driver.wait(async () => (await (await driver.findElement(By.id('category-select'))).findElements(By.tagName('option'))).length > 1, WAI_TIMEOUT);
            }
            await selectDropdownByValue(driver, By.id('category-select'), 'cat-1');

            await findAndClick(driver, By.css('#settings-form button[type="submit"]'));

            const settingsStatus = await driver.findElement(By.id('settings-status'));
            await driver.wait(until.elementTextContains(settingsStatus, 'Beállítások mentve'), WAI_TIMEOUT);
            expect(await settingsStatus.getText()).toBe('Beállítások mentve.');

            // Verify that the UI fetches and reflects the new settings (it does this on loadSettings)
            // For a more robust check, you'd inspect what server.js wrote to its settings.json
            // or what mockApiServer received if settings were fetched again by server.js (which they aren't post-save in this flow)
        });
    });

    describe('Courses View', () => {
        beforeAll(async () => {
            await findAndClick(driver, By.css(`.sidebar .nav-link[data-view="courses-view"]`));
            await waitForElement(driver, By.id('courses-view'));
        });

        test('should refresh and display courses from mock API', async () => {
            await findAndClick(driver, By.id('refresh-courses'));
            // Wait for table rows to appear (mock API returns 2 courses)
            await driver.wait(async () => (await driver.findElements(By.css('#course-list-body tr'))).length === 2, WAI_TIMEOUT);

            const rows = await driver.findElements(By.css('#course-list-body tr'));
            expect(rows.length).toBe(2);

            const firstRowCells = await rows[0].findElements(By.tagName('td'));
            expect(await firstRowCells[0].getText()).toBe('Mock Tanfolyam 1 (2024-01-01 10:00)');
            expect(await firstRowCells[1].getText()).toBe('MOCK-COURSE-01-202401011000');
            // Wait for inventory to load (mockInventories sets QOH to 10 for the first one)
            await driver.wait(until.elementTextIs(firstRowCells[3], '10'), WAI_TIMEOUT);
            expect(await firstRowCells[3].getText()).toBe('10');
        });

        test('should show and hide "Add Course" form', async () => {
            const addCourseForm = await driver.findElement(By.id('add-course-form'));
            expect(await addCourseForm.isDisplayed()).toBe(false);

            await findAndClick(driver, By.id('show-add-course-form'));
            expect(await addCourseForm.isDisplayed()).toBe(true);

            await findAndClick(driver, By.id('cancel-add-course'));
            expect(await addCourseForm.isDisplayed()).toBe(false);
        });

        test('should add a new course', async () => {
            await findAndClick(driver, By.id('show-add-course-form'));

            // Populate template select (app.js does this on showAddForm)
            // The templates are read by the app's server.js from the actual templates.json
            // The mock-templates.json is for the mock API if it were serving /api/templates
            const templateSelectEl = await waitForElement(driver, By.id('template-select'));
            await driver.wait(async () => (await templateSelectEl.findElements(By.css('option:not([disabled])'))).length > 0, WAI_TIMEOUT);

            // Select the first available template (from the actual templates.json used by server.js)
            const options = await templateSelectEl.findElements(By.css('option:not([disabled])'));
            if (options.length > 0) {
                await new Select(templateSelectEl).selectByIndex(1); // Index 0 is "-- Válassz --"
            } else {
                throw new Error("No templates available in dropdown to select for adding course.");
            }


            const testDate = new Date();
            testDate.setDate(testDate.getDate() + 7); // One week from now
            testDate.setHours(15, 30, 0, 0);
            const year = testDate.getFullYear();
            const month = (testDate.getMonth() + 1).toString().padStart(2, '0');
            const day = testDate.getDate().toString().padStart(2, '0');
            const hours = testDate.getHours().toString().padStart(2, '0');
            const minutes = testDate.getMinutes().toString().padStart(2, '0');
            const dateTimeLocalString = `${year}-${month}-${day}T${hours}:${minutes}`;

            await findAndType(driver, By.id('start-date'), dateTimeLocalString);
            await findAndType(driver, By.id('initial-seats'), '5');

            await findAndClick(driver, By.css('#add-course-form button[type="submit"]'));

            const globalStatus = await waitForElement(driver, By.css('#status-container .alert-success'));
            await driver.wait(until.elementTextMatches(globalStatus, /sikeresen létrehozva/), WAI_TIMEOUT);
            expect(await globalStatus.getText()).toContain('sikeresen létrehozva');

            // Verify the new course appears in the list (mock API should now include it)
            // The list refreshes automatically after add
            await driver.wait(async () => (await driver.findElements(By.css('#course-list-body tr'))).length === 3, WAI_TIMEOUT);
            const rows = await driver.findElements(By.css('#course-list-body tr'));
            const newCourseRow = rows.find(async row => (await row.getText()).includes(hours + ":" + minutes)); //簡易チェック
            expect(newCourseRow).toBeDefined();
        });

        test('should open edit modal, load data, and save changes for a course', async () => {
            // Assuming the first course in the list is editable
            const firstRowEditButton = await waitForElement(driver, By.css('#course-list-body tr:first-child .btn-outline-primary'));
            await firstRowEditButton.click();

            await waitForElement(driver, By.id('editCourseModal'));
            await driver.wait(until.elementIsVisible(driver.findElement(By.id('editCourseModal'))), WAI_TIMEOUT);

            // Wait for modal to populate (mock API serves product and inventory details)
            const modalQuantityInput = await driver.findElement(By.id('modal-quantity'));
            await driver.wait(async () => (await modalQuantityInput.getAttribute('value')) !== '', WAI_TIMEOUT);
            expect(await modalQuantityInput.getAttribute('value')).toBe('10'); // From mockInventories

            const modalPriceInput = await driver.findElement(By.id('modal-price'));
            expect(await modalPriceInput.getAttribute('value')).toBe('15000'); // From mock-courses / mock-product-detail

            await findAndType(driver, By.id('modal-quantity'), '12');
            await findAndType(driver, By.id('modal-price'), '16000');

            await findAndClick(driver, By.id('save-course-btn'));

            const modalStatus = await driver.findElement(By.id('modal-status'));
            await driver.wait(until.elementTextIs(modalStatus, 'Változtatások sikeresen mentve!'), WAI_TIMEOUT);

            // Wait for modal to hide
            await driver.wait(until.stalenessOf(modalStatus), WAI_TIMEOUT);

            // Verify list updates
            const firstRowCells = await (await driver.findElement(By.css('#course-list-body tr:first-child'))).findElements(By.tagName('td'));
            await driver.wait(until.elementTextIs(firstRowCells[3], '12'), WAI_TIMEOUT); // Updated quantity
            expect(await firstRowCells[4].getText()).toMatch(/16\s*000\s*Ft/); // Updated price
        });


        test('should delete a course', async () => {
            const initialRowCount = (await driver.findElements(By.css('#course-list-body tr'))).length;
            expect(initialRowCount).toBeGreaterThan(0);

            // Delete the first course
            const firstRowDeleteButton = await driver.findElement(By.css('#course-list-body tr:first-child .btn-outline-danger'));

            // Handle the confirmation dialog
            driver.executeScript("window.confirm = function(){return true;};");
            await firstRowDeleteButton.click();

            const globalStatus = await waitForElement(driver, By.css('#status-container .alert-success'));
            await driver.wait(until.elementTextMatches(globalStatus, /sikeresen törölve/), WAI_TIMEOUT);

            // Verify the row is removed
            await driver.wait(async () => (await driver.findElements(By.css('#course-list-body tr'))).length === initialRowCount - 1, WAI_TIMEOUT);
        });
    });

    describe('Templates View', () => {
        beforeAll(async () => {
            await findAndClick(driver, By.css(`.sidebar .nav-link[data-view="templates-view"]`));
            await waitForElement(driver, By.id('templates-view'));
        });

        test('should refresh and display templates', async () => {
            await findAndClick(driver, By.id('refresh-templates'));
            // templates are read from the actual templates.json by the app's server.js
            // For this test, we assume the provided templates.json is valid.
            // The mock-templates.json is NOT directly used by this UI path.
            await driver.wait(async () => (await driver.findElements(By.css('#template-list li'))).length > 0, WAI_TIMEOUT);
            const listItems = await driver.findElements(By.css('#template-list li'));
            // Based on the provided templates.json
            expect(listItems.length).toBe(4);
            expect(await listItems[0].getText()).toContain('Alap Sörfőzés (4 óra)');
        });

        test('should allow editing templates with JSON editor', async () => {
            await findAndClick(driver, By.id('edit-templates-btn'));
            const editor = await waitForElement(driver, By.id('template-json-editor'));
            await waitForElementToBeVisible(driver, editor);

            let originalJson = await editor.getAttribute('value');
            const newTemplateEntry = { templateId: "TPL-JSON-NEW", name: "JSON Added Template", baseSku: "JSON-SKU", defaultPrice: 999 };
            let currentTemplates = JSON.parse(originalJson);
            currentTemplates.push(newTemplateEntry);

            await editor.clear();
            await editor.sendKeys(JSON.stringify(currentTemplates, null, 2));

            await findAndClick(driver, By.id('save-templates-btn'));

            const editorStatus = await driver.findElement(By.id('template-editor-status'));
            await driver.wait(until.elementTextIs(editorStatus, 'Sablonok sikeresen mentve!'), WAI_TIMEOUT);

            // List should refresh and include the new template
            await driver.wait(async () => (await driver.findElements(By.css('#template-list li'))).length === currentTemplates.length, WAI_TIMEOUT);
            const listItems = await driver.findElements(By.css('#template-list li'));
            const itemTexts = await Promise.all(listItems.map(item => item.getText()));
            expect(itemTexts.some(text => text.includes("JSON Added Template"))).toBe(true);
        });

        // Basic visual editor interaction test
        test('should open visual template editor and add a template (local state)', async () => {
            await findAndClick(driver, By.id('edit-templates-visual-btn'));
            const visualEditor = await waitForElement(driver, By.id('visual-template-editor'));
            await waitForElementToBeVisible(driver, visualEditor);

            await findAndClick(driver, By.id('add-template-btn'));

            // Fill the form for a new visual template
            const uniqueId = `TPL-VISUAL-${Date.now()}`;
            await findAndType(driver, By.id('template-form-id'), uniqueId);
            await findAndType(driver, By.id('template-form-name'), 'Visual Editor Temp');
            await findAndType(driver, By.id('template-form-sku'), 'VISUAL-SKU');
            await findAndType(driver, By.id('template-form-price'), '7777');

            await findAndClick(driver, By.css('#template-edit-form-inner button[type="submit"]'));

            const visualEditorStatus = await driver.findElement(By.id('visual-editor-status'));
            await driver.wait(until.elementTextContains(visualEditorStatus, 'sablon hozzáadva'), WAI_TIMEOUT);

            // Verify it appears in the visual list (which is local until "Save All")
            const visualListCards = await driver.findElements(By.css('#visual-template-list .card'));
            const cardTexts = await Promise.all(visualListCards.map(card => card.getText()));
            expect(cardTexts.some(text => text.includes('Visual Editor Temp') && text.includes(uniqueId))).toBe(true);

            // For a full test, click "Save All" and verify it hits the mock API
            // and then the main template list updates.
            // This part is left as an extension for brevity, as it's similar to JSON save.
            await findAndClick(driver, By.id('cancel-visual-editor-btn')); // Close visual editor
        });

    });
});
