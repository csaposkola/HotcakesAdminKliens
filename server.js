// server.js
// VERY FIRST LINE FOR DEBUGGING:
console.log('[Server] server.js script execution started.'); // THIS IS CRITICAL

try { // Wrap almost everything to catch early synchronous errors
    const express = require('express');
    const cors = require('cors');
    const bodyParser = require('body-parser');
    const path = require('path');
    const fs = require('fs').promises; // Promises használata aszinkron fájlműveletekhez
    const net = require('net'); // net modul használata raw socketekhez

    const app = express();
    const PORT = 3000; // A helyi szerver portja

    // --- Middleware ---
    app.use(cors()); // Kérések engedélyezése a böngésző frontendről
    app.use(bodyParser.json()); // JSON kérés bodyk értelmezése

    // --- Fájl elérési utak ---
    const SETTINGS_PATH = path.join(__dirname, 'settings.json');
    const TEMPLATES_PATH = path.join(__dirname, 'templates.json');
    const INVENTORY_MAP_PATH = path.join(__dirname, 'inventoryMap.json');
    const PUBLIC_PATH = path.join(__dirname, 'public');

    console.log('[Server] __dirname:', __dirname);
    console.log('[Server] Settings path:', SETTINGS_PATH);
    console.log('[Server] Templates path:', TEMPLATES_PATH);
    console.log('[Server] Inventory map path:', INVENTORY_MAP_PATH);
    console.log('[Server] Public path:', PUBLIC_PATH);

    // Serve static files from the resolved path
    app.use(express.static(PUBLIC_PATH));

    // --- Segédfüggvények (Fájlkezelés) ---
    async function ensureDirectoryExists(filePath) {
        const dirname = path.dirname(filePath);
        try {
            await fs.mkdir(dirname, { recursive: true });
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                console.error('[Server] Error creating directory:', dirname, err);
                return false;
            }
            return true;
        }
    }

    async function getSettings() {
        try {
            if (!await fs.access(SETTINGS_PATH).then(() => true).catch(() => false)) {
                console.log('[Server] settings.json nem található, alapértelmezett értékek használata.');
                const defaultSettings = { apiKey: '', siteBaseUrl: '', defaultCategoryId: '' };
                await ensureDirectoryExists(SETTINGS_PATH);
                await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2));
                return defaultSettings;
            }
            const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[Server] Hiba a settings.json feldolgozása közben:', error);
            throw new Error('Nem sikerült beolvasni vagy értelmezni a beállításokat.');
        }
    }

    async function saveSettings(settings) {
        try {
            await ensureDirectoryExists(SETTINGS_PATH);
            await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('[Server] Hiba a settings.json írása közben:', error);
            throw new Error('Nem sikerült menteni a beállításokat.');
        }
    }

    async function getTemplates() {
        try {
            if (!await fs.access(TEMPLATES_PATH).then(() => true).catch(() => false)) {
                console.log('[Server] templates.json nem található, alapértelmezett létrehozása.');
                const defaultTemplates = [
                    { templateId: "TPL-EXAMPLE-1H", name: "Példa Sablon (1óra)", baseSku: "TPL-EX-1H", durationHours: 1, defaultDescription: "Példa leírás", defaultPrice: 10000, defaultInventoryMode: 100 }
                ];
                await ensureDirectoryExists(TEMPLATES_PATH);
                await fs.writeFile(TEMPLATES_PATH, JSON.stringify(defaultTemplates, null, 2));
                return defaultTemplates;
            }
            const data = await fs.readFile(TEMPLATES_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[Server] Hiba a templates.json feldolgozása közben:', error);
            throw new Error('Nem sikerült beolvasni vagy értelmezni a sablonokat.');
        }
    }

    async function getInventoryMap() {
        try {
            if (!await fs.access(INVENTORY_MAP_PATH).then(() => true).catch(() => false)) {
                console.log('[Server] inventoryMap.json nem található, üres objektummal tér vissza.');
                const emptyMap = {};
                await ensureDirectoryExists(INVENTORY_MAP_PATH);
                await fs.writeFile(INVENTORY_MAP_PATH, JSON.stringify(emptyMap, null, 2));
                return emptyMap;
            }
            const data = await fs.readFile(INVENTORY_MAP_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[Server] Hiba az inventoryMap.json feldolgozása közben:', error);
            return {};
        }
    }

    async function saveInventoryMap(map) {
        try {
            await ensureDirectoryExists(INVENTORY_MAP_PATH);
            await fs.writeFile(INVENTORY_MAP_PATH, JSON.stringify(map, null, 2));
        } catch (error) {
            console.error('[Server] !!! HIBA az inventoryMap.json írása közben:', error);
        }
    }

    async function findInventoryBvinForProduct(productBvin) {
        console.log(`[Server] Készlet(ek) keresése a ${productBvin} termékhez (szerver oldalon)...`);
        try {
            const inventories = await makeRawApiRequest(`/productinventory?byproduct=${productBvin}`, 'GET');
            let inventoryList = [];
            if (Array.isArray(inventories)) { inventoryList = inventories; }
            else if (inventories && Array.isArray(inventories.Content)) { inventoryList = inventories.Content; }
            else if (inventories && inventories.Bvin) { inventoryList = [inventories]; }
            console.log(`[Server] Talált készlet(ek) a ${productBvin} termékhez (szerver):`, inventoryList);
            if (inventoryList && inventoryList.length >= 1 && inventoryList[0].Bvin) {
                if(inventoryList.length > 1) console.warn(`[Server] Több készlet (${inventoryList.length}) található a ${productBvin} termékhez. Az első Bvin-t használjuk: ${inventoryList[0]?.Bvin}`);
                return inventoryList[0].Bvin;
            } else {
                console.warn(`[Server] Nem található készlet Bvin a ${productBvin} termékhez a lista lekérésével (szerver).`);
                return null;
            }
        } catch (error) {
            console.error(`[Server] Hiba a készlet(ek) lekérésekor a ${productBvin} termékhez (szerver):`, error);
            if (error.message?.includes('HTTP Hiba (404)')) { console.warn("[Server] A `/productinventory?byproduct=` végpont valószínűleg nem létezik vagy nem található."); }
            return null;
        }
    }

    const API_BASE_PATH = "/DesktopModules/Hotcakes/API/rest/v1";

    async function makeRawApiRequest(endpoint, method = 'GET', requestBody = null) {
        const settings = await getSettings();
        const { apiKey, siteBaseUrl } = settings;

        if (!apiKey || !siteBaseUrl) { throw new Error("API Kulcs vagy Alap URL nincs beállítva a settings.json fájlban."); }
        let url; try { url = new URL(siteBaseUrl); } catch (e) { throw new Error(`Érvénytelen Site Base URL: ${siteBaseUrl}`); }
        const HOST = url.hostname; const PORT_Num = url.port || (url.protocol === 'https:' ? 443 : 80);
        const pathWithKey = `${API_BASE_PATH}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${apiKey}`;
        let requestBodyString = ''; if (requestBody !== null && requestBody !== undefined) { try { requestBodyString = JSON.stringify(requestBody); } catch (e) { throw new Error('Nem sikerült a kérés törzsét stringgé alakítani'); } }
        let httpRequest = `${method.toUpperCase()} ${pathWithKey} HTTP/1.1\r\n`; httpRequest += `Host: ${HOST}${url.port ? ':' + url.port : ''}\r\n`; httpRequest += `Accept: application/json\r\n`; httpRequest += `User-Agent: Node/TCP-Client-App\r\n`; httpRequest += `Connection: close\r\n`; if (requestBodyString) { httpRequest += `Content-Type: application/json\r\n`; httpRequest += `Content-Length: ${Buffer.byteLength(requestBodyString)}\r\n`; } httpRequest += `\r\n`; if (requestBodyString) { httpRequest += requestBodyString; }
        console.log(`[Server] Raw Socket Kérés -> ${HOST}:${PORT_Num}${pathWithKey.split('?')[0]} [${method}]`);
        return new Promise((resolve, reject) => {
            const socket = new net.Socket(); let hP = false; let bB = Buffer.alloc(0); let sC = null; let sM = '';
            socket.connect(PORT_Num, HOST, () => { socket.write(httpRequest); });
            socket.on('data', (c) => { bB = Buffer.concat([bB, c]); if (!hP) { const hEI = bB.indexOf('\r\n\r\n'); if (hEI !== -1) { hP = true; const hPrt = bB.slice(0, hEI).toString(); const sL = hPrt.split('\r\n')[0]; const sMch = sL.match(/^HTTP\/1\.[01] (\d{3})\s?(.*)$/i); if (sMch) { sC = parseInt(sMch[1], 10); sM = sMch[2] || ''; console.log(`[Server] Parseolt Státusz: ${sC} ${sM}`); } else { console.error("[Server] Nem sikerült parseolni a státusz sort:", sL); socket.destroy(); return reject(new Error('Nem sikerült parseolni a HTTP státusz sort.')); } bB = bB.slice(hEI + 4); } } });
            socket.on('close', () => { console.log('[Server] Socket kapcsolat lezárva'); if (sC === null) { return reject(new Error('Kapcsolat lezárult a státusz sor fogadása előtt.')); } const rBS = bB.toString('utf-8'); if (sC >= 200 && sC < 300) { if (sC === 204 || rBS.length === 0) { resolve({ success: true }); } else { try { const res = JSON.parse(rBS); if (res.Errors && res.Errors.length > 0) { console.error("[Server] Hotcakes API Logikai Hibák (2xx válaszban):", res.Errors); reject(new Error(`Hotcakes API Logikai Hiba: ${res.Errors.map(e=>e.Description||e.Code).join('; ')}`)); } else { resolve(res.Content !== undefined ? res.Content : res); } } catch (e) { console.error(`[Server] Nem sikerült JSON-ként parseolni a választ. Státusz: ${sC}`); console.error('[Server] Nyers body:', rBS.substring(0,500)+'...'); reject(new Error(`Sikertelen JSON válaszfeldolgozás (Státusz: ${sC})`)); } } } else { console.error(`[Server] HTTP Hiba: ${sC} ${sM}`); console.error('[Server] Válasz body:', rBS.substring(0,500)+'...'); reject(new Error(`HTTP Hiba (${sC}): ${sM} - ${rBS.substring(0,200)}...`)); } });
            socket.on('error', (e) => { console.error('[Server] Socket hiba:', e); reject(e); }); socket.setTimeout(30000); socket.on('timeout', () => { console.error('[Server] Socket időtúllépés'); socket.destroy(); reject(new Error('Kapcsolat időtúllépés')); });
        });
    }

    app.use('/api/*', (req, res, next) => {
        res.setHeader('Content-Type', 'application/json');
        next();
    });

    app.get('/api/settings', async (req, res) => {
        try { const settings = await getSettings(); res.json(settings); }
        catch (error) { res.status(500).json({ error: error.message }); }
    });

    app.post('/api/settings', async (req, res) => {
        try { if (!req.body || typeof req.body.apiKey !== 'string' || typeof req.body.siteBaseUrl !== 'string') { return res.status(400).json({ error: 'Érvénytelen beállítás formátum.' }); } await saveSettings(req.body); res.json({ message: 'Beállítások sikeresen mentve.' }); }
        catch (error) { res.status(500).json({ error: error.message }); }
    });

    app.get('/api/categories', async (req, res) => {
        try { const categories = await makeRawApiRequest('/categories', 'GET'); res.json(Array.isArray(categories) ? categories : []); }
        catch (error) { console.error("[Server] Hiba a /api/categories végponton (raw):", error); res.status(500).json({ error: error.message }); }
    });

    app.get('/api/templates', async (req, res) => {
        try { const templates = await getTemplates(); res.json(templates); }
        catch (error) { console.error("[Server] Hiba a /api/templates végponton:", error); res.status(500).json({ error: error.message }); }
    });

    app.get('/api/courses', async (req, res) => {
        try { const settings = await getSettings(); const categoryId = settings.defaultCategoryId; if (!categoryId) { return res.status(400).json({ error: "Nincs alapértelmezett kategória beállítva." }); } const productsData = await makeRawApiRequest(`/products?bycategory=${categoryId}&page=1&pagesize=1000`, 'GET'); const products = Array.isArray(productsData) ? productsData : (productsData && Array.isArray(productsData.Products) ? productsData.Products : []); res.json(products); }
        catch (error) { console.error("[Server] Hiba a /api/courses végponton (raw):", error); res.status(500).json({ error: error.message }); }
    });

    app.get('/api/products/:bvin', async (req, res) => {
        const bvin = req.params.bvin;
        if (!bvin) { return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." }); }
        console.log(`[Server] Termék adatok lekérése (raw): bvin=${bvin}`);
        try {
            const productData = await makeRawApiRequest(`/products/${bvin}`, 'GET');
            if (productData && productData.Bvin) { res.json(productData); }
            else { console.warn(`[Server] Nem található termék vagy üres válasz a ${bvin} Bvin azonosítóhoz.`); return res.status(404).json({ error: `Termék nem található: ${bvin}` }); }
        } catch (error) {
            console.error(`[Server] Hiba a(z) ${bvin} termék adatainak lekérésekor:`, error);
            if (error.message?.includes('HTTP Hiba (404)')) { return res.status(404).json({ error: `Termék nem található: ${bvin} (Hotcakes 404)` }); }
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/courses', async (req, res) => {
        const { productData, inventoryData, associationData } = req.body;
        if (!productData || !inventoryData || !associationData) return res.status(400).json({ error: "Hiányzó adatok a tanfolyam létrehozásához." });
        let productBvin = null; let createdProductDataForResponse = null;
        try {
            console.log("[Server] 1. Lépés: Termék létrehozásának kísérlete (raw)...", productData.Sku);
            createdProductDataForResponse = productData;
            try {
                const createdProduct = await makeRawApiRequest('/products', 'POST', productData);
                if (!createdProduct || !createdProduct.Bvin) throw new Error("Termék létrehozva (2xx), de a válasz érvénytelen vagy hiányzik a Bvin.");
                productBvin = createdProduct.Bvin; createdProductDataForResponse = createdProduct;
                console.log("[Server] Termék sikeresen létrehozva (2xx), Bvin:", productBvin);
            } catch (creationError) {
                console.warn("[Server] Hiba a termék létrehozása során, ellenőrzés:", creationError.message);
                if (creationError.message?.includes('HTTP Hiba (500)') && creationError.message?.includes('UpdateJournalItem')) {
                    console.warn("[Server] !!! Speciális 500-as hiba észlelve (JournalItem). Feltételezzük, hogy a termék létrejöhetett. Ellenőrzés SKU alapján...");
                    try { await new Promise(resolve => setTimeout(resolve, 1500)); console.log(`[Server] Keresés SKU alapján: ${productData.Sku}`); const foundProduct = await makeRawApiRequest(`/products/ANY?bysku=${encodeURIComponent(productData.Sku)}`, 'GET'); if (foundProduct && foundProduct.Bvin) { productBvin = foundProduct.Bvin; createdProductDataForResponse = foundProduct; console.log(`[Server] Termék (${productData.Sku}) valójában létrejött és megtalálva, Bvin: ${productBvin}. Folytatás...`); } else { throw new Error(`Termék létrehozása sikertelen (500, de SKU nem található): ${productData.Sku}`); } }
                    catch (findError) { throw new Error(`Termék létrehozása sikertelen (500, és a SKU keresés is hibára futott): ${findError.message}`); }
                } else { throw creationError; }
            }
            if (!productBvin) throw new Error("Ismeretlen hiba: Nincs érvényes productBvin a létrehozás/ellenőrzés után.");
            inventoryData.ProductBvin = productBvin; console.log(`[Server] 2. Lépés: Készlet létrehozása (raw) a ${productBvin} termékhez...`);
            let createdInventoryBvin = null;
            try {
                const createdInventory = await makeRawApiRequest('/productinventory', 'POST', inventoryData);
                if (createdInventory && createdInventory.Bvin) {
                    createdInventoryBvin = createdInventory.Bvin; console.log(`[Server] Készlet létrehozva (${productBvin}), Bvin:`, createdInventoryBvin);
                    try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`[Server] Készlet leképezés frissítve: ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("[Server] !!! HIBA a készlet leképezés mentésekor:", mapError); }
                } else {
                    console.warn(`[Server] Készlet létrehozva (2xx), de a válasz hiányos (nincs Bvin). Megpróbáljuk lekérni...`);
                    createdInventoryBvin = await findInventoryBvinForProduct(productBvin);
                    if (createdInventoryBvin) { console.log(`[Server] Sikerült megtalálni a készlet Bvin-t (${createdInventoryBvin}) a termékhez tartozó lista lekérésével.`); try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`[Server] Készlet leképezés frissítve (lekérés után): ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("[Server] !!! HIBA a készlet leképezés mentésekor (lekérés után):", mapError); } }
                    else { console.error("[Server] Készlet létrehozva (2xx), de nem sikerült azonosítani az új inventoryBvin-t."); }
                }
            } catch(inventoryCreationError) {
                if (inventoryCreationError.message?.includes('HTTP Hiba (500)')) {
                    console.warn("[Server] !!! Készlet létrehozás 500-as hiba. Feltételezzük, hogy létrejött. Megpróbáljuk lekérni...");
                    createdInventoryBvin = await findInventoryBvinForProduct(productBvin);
                    if (createdInventoryBvin) { console.log(`[Server] Sikerült megtalálni a készlet Bvin-t (${createdInventoryBvin}) a termékhez tartozó lista lekérésével a hiba után.`); try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`[Server] Készlet leképezés frissítve (500-as hiba után): ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("[Server] !!! HIBA a készlet leképezés mentésekor (500-as hiba után):", mapError); } }
                    else { console.error("[Server] Készlet létrehozása 500-as hibát adott, és utána nem sikerült azonosítani az inventoryBvin-t."); }
                } else { console.error(`[Server] Valódi hiba a készlet létrehozásakor a ${productBvin} termékhez:`, inventoryCreationError); }
            }
            associationData.ProductId = productBvin; associationData.CategoryId = (await getSettings()).defaultCategoryId;
            if (!associationData.CategoryId) { console.warn(`[Server] Nincs alapértelmezett kategória ID beállítva a(z) ${productBvin} termék hozzárendeléséhez. Kihagyás.`); }
            else {
                console.log(`[Server] 3. Lépés: Kategória hozzárendelés létrehozása (raw) a ${productBvin} termékhez (${associationData.CategoryId})...`);
                try { await makeRawApiRequest('/categoryproductassociations', 'POST', associationData); console.log(`[Server] Kategória hozzárendelés létrehozva (${productBvin}).`); } catch (assocError) { console.error(`[Server] Hiba a kategória hozzárendelésekor a ${productBvin} termékhez:`, assocError); }
            }
            console.log(`[Server] Tanfolyam létrehozási folyamat befejezve a ${productBvin} termékhez.`);
            res.status(201).json(createdProductDataForResponse);
        } catch (error) {
            console.error("[Server] Végső hiba a tanfolyam létrehozási folyamatban (raw):", error);
            res.status(500).json({ error: `Tanfolyam létrehozása sikertelen: ${error.message}` });
        }
    });

    app.post('/api/products/:bvin', async (req, res) => {
        const bvin = req.params.bvin;
        const { SitePrice, StartDateTime } = req.body;
        if (!bvin) { return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." }); }
        if (SitePrice === undefined || typeof SitePrice !== 'number' || SitePrice < 0) { return res.status(400).json({ error: "Érvényes 'SitePrice' (szám, >= 0) megadása kötelező." }); }
        if (typeof StartDateTime !== 'string' || !StartDateTime) { return res.status(400).json({ error: "Érvényes 'StartDateTime' (string) megadása kötelező." }); }

        console.log(`[Server] Termék frissítésének kísérlete (raw): bvin=${bvin}, Új Ár=${SitePrice}, Új Időpont=${StartDateTime}`);
        let updateResultPayload = { message: `Frissítési kísérlet (${bvin}) elküldve.` };

        try {
            console.log(`[Server] Lekérés a frissítéshez: /products/${bvin}`);
            const currentProduct = await makeRawApiRequest(`/products/${bvin}`, 'GET');
            if (!currentProduct || !currentProduct.Bvin) { throw new Error(`Nem található termék a ${bvin} Bvin azonosítóval a frissítéshez.`); }

            const updatedProductData = { ...currentProduct };
            updatedProductData.SitePrice = SitePrice;
            const currentSku = currentProduct.Sku || ''; const skuParts = currentSku.split('-'); const datePartExists = skuParts.length > 1 && /^\d{8,12}$/.test(skuParts[skuParts.length - 1]); const baseSku = datePartExists ? skuParts.slice(0, -1).join('-') : currentSku;
            const newFormattedDateTime = StartDateTime.replace(/[-T:]/g, '').substring(0, 12);
            const newSku = `${baseSku}-${newFormattedDateTime}`;
            const newProductName = `${currentProduct.ProductName.split('(')[0].trim()} (${StartDateTime.replace('T', ' ')})`;
            updatedProductData.Sku = newSku; updatedProductData.ProductName = newProductName;
            delete updatedProductData.CreationDateUtc;

            console.log("[Server] Frissített termék payload küldése:", JSON.stringify(updatedProductData, null, 2));

            try {
                const updateResult = await makeRawApiRequest(`/products/${bvin}`, 'POST', updatedProductData);
                console.log("[Server] Termék frissítés API válasz (2xx):", updateResult);
                updateResultPayload = updateResult || { message: "Termék frissítés sikeres (2xx)." };
            } catch (updateError) {
                if (updateError.message?.includes('HTTP Hiba (500)') && updateError.message?.includes('UpdateJournalItem')) {
                    console.warn(`[Server] !!! Termék frissítés 500-as hiba (JournalItem). Feltételezzük, hogy sikeres volt.`);
                    updateResultPayload = updatedProductData;
                } else { throw updateError; }
            }
            res.json(updateResultPayload);

        } catch (error) {
            console.error(`[Server] Hiba a(z) ${bvin} termék frissítésekor (végső catch):`, error);
            res.status(500).json({ error: `Termék frissítése sikertelen: ${error.message}` });
        }
    });

    app.delete('/api/courses/:bvin', async (req, res) => {
        const bvin = req.params.bvin; if (!bvin) return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." });
        console.log(`[Server] Termék törlésének kísérlete (raw) (Bvin: ${bvin})`); let deleteSuccessful = false;
        try { const result = await makeRawApiRequest(`/products/${bvin}`, 'DELETE'); console.log("[Server] Törlés API hívás eredménye (raw):", result); if (result && result.success) { deleteSuccessful = true; res.json({ message: `Termék (${bvin}) sikeresen törölve (2xx válasz).` }); } else { console.warn(`[Server] Nem egyértelmű válasz törléskor (${bvin}):`, result); deleteSuccessful = true; res.json({ message: `Termék (${bvin}) törölve (válasz nem egyértelmű).` }); } }
        catch (error) { console.warn(`[Server] Hiba törléskor (${bvin}), ellenőrzés:`, error.message); if (error.message?.includes('HTTP Hiba (500)')) { console.warn(`[Server] !!! 500-as hiba törlésnél (${bvin}). Feltételezzük sikert.`); deleteSuccessful = true; res.json({ message: `Termék (${bvin}) törölve (500-as hiba ellenére).` }); } else { console.error(`[Server] Valódi hiba törléskor (${bvin}):`, error); res.status(500).json({ error: `Törlési hiba: ${error.message}` }); } }
        if (deleteSuccessful) { try { const invMap = await getInventoryMap(); if (invMap[bvin]) { delete invMap[bvin]; await saveInventoryMap(invMap); console.log(`[Server] Készlet leképezés törölve: ${bvin}`); } } catch (mapError) { console.error("[Server] Leképezés törlési hiba:", mapError); } }
    });

    app.get('/api/inventory/:productBvin', async (req, res) => {
        const productBvin = req.params.productBvin; if (!productBvin) return res.status(400).json({ error: "Termék Bvin paraméter kötelező." });
        try { const invMap = await getInventoryMap(); let inventoryBvin = invMap[productBvin];
            if (!inventoryBvin) { console.warn(`[Server] Nincs inventoryBvin ${productBvin}-hez. Lekérés...`); const foundInvBvin = await findInventoryBvinForProduct(productBvin); if (foundInvBvin) { console.log(`[Server] Megtalált inventoryBvin: ${foundInvBvin}`); inventoryBvin = foundInvBvin; try { const map = await getInventoryMap(); map[productBvin] = foundInvBvin; await saveInventoryMap(map); } catch(e){console.error("[Server] Talált inv Bvin mentési hiba:", e);} } else { console.error(`[Server] Nem sikerült inventoryBvin-t találni: ${productBvin}.`); return res.status(404).json({ error: `Nincs készlet info: ${productBvin}.`}); } }
            console.log(`[Server] Készlet lekérése: invBvin=${inventoryBvin} (prodBvin=${productBvin})`); const inventoryData = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'GET'); res.json(inventoryData || { QuantityOnHand: null });
        } catch (error) { console.error(`[Server] Készlet lekérési hiba (${productBvin}):`, error); res.status(500).json({ error: error.message }); }
    });

    app.post('/api/inventory/:inventoryBvin', async (req, res) => {
        const inventoryBvin = req.params.inventoryBvin; const { QuantityOnHand } = req.body; if (!inventoryBvin) { return res.status(400).json({ error: "Készlet Bvin paraméter kötelező." }); } if (QuantityOnHand === undefined || typeof QuantityOnHand !== 'number' || !Number.isInteger(QuantityOnHand) || QuantityOnHand < 0) { return res.status(400).json({ error: "Érvényes 'QuantityOnHand' (egész szám, >= 0) kötelező." }); }
        console.log(`[Server] Készlet frissítés (raw): invBvin=${inventoryBvin}, új Qty=${QuantityOnHand}`); let updateResultPayload = { message: `Frissítési kísérlet (${inventoryBvin}).` };
        try {
            console.log(`[Server] Lekérés frissítéshez: /productinventory/${inventoryBvin}`); const currentInventory = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'GET'); if (!currentInventory || !currentInventory.Bvin || !currentInventory.ProductBvin) { throw new Error(`Nem található készlet vagy hiányzik ProductBvin: ${inventoryBvin}.`); }
            const minimalUpdatePayload = { Bvin: currentInventory.Bvin, QuantityOnHand: QuantityOnHand, ProductBvin: currentInventory.ProductBvin }; console.log("[Server] Minimális payload küldése:", JSON.stringify(minimalUpdatePayload, null, 2));
            try { const updateResult = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'POST', minimalUpdatePayload); console.log("[Server] Készlet frissítés API válasz (2xx):", updateResult); updateResultPayload = updateResult || { message: "Frissítés sikeres (2xx)." }; }
            catch (updateError) { if (updateError.message?.includes('HTTP Hiba (500)') && updateError.message?.includes('UpdateJournalItem')) { console.warn(`[Server] !!! Készlet frissítés 500-as hiba (JournalItem). Feltételezzük sikert.`); updateResultPayload = { message: `Frissítés valószínűleg sikeres (szerver 500). Új mennyiség: ${QuantityOnHand}` }; } else { throw updateError; } }
            res.json(updateResultPayload);
        } catch (error) { console.error(`[Server] Hiba ${inventoryBvin} készlet frissítésekor:`, error); res.status(500).json({ error: `Készlet frissítése sikertelen: ${error.message}` }); }
    });

    app.post('/api/templates', async (req, res) => {
        const newTemplatesString = req.body.templates; if (typeof newTemplatesString !== 'string') { return res.status(400).json({ error: 'Érvénytelen kérés: hiányzó vagy nem string "templates" adat.' }); }
        try { JSON.parse(newTemplatesString); await fs.writeFile(TEMPLATES_PATH, newTemplatesString); console.log("[Server] templates.json sikeresen frissítve."); res.json({ message: "Sablonok sikeresen mentve." }); }
        catch (error) { if (error instanceof SyntaxError) { console.error("[Server] Sablon mentési hiba: Érvénytelen JSON.", error); res.status(400).json({ error: `Érvénytelen JSON formátum: ${error.message}` }); } else { console.error("[Server] templates.json írási hiba:", error); res.status(500).json({ error: `Nem sikerült menteni a sablonokat: ${error.message}` }); } }
    });

    app.get('*', (req, res, next) => {
        if (!req.path.startsWith('/api/')) {
            res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
        } else {
            next();
        }
    });

    app.use((err, req, res, next) => {
        console.error('[Server] Express error handler:', err);
        if (res.headersSent) {
            return next(err);
        }
        res.status(500).json({
            error: 'Szerver hiba történt',
            message: err.message || 'Ismeretlen hiba'
        });
    });

    const serverInstance = app.listen(PORT, () => { // Renamed 'server' to 'serverInstance' to avoid conflict
        console.log(`[Server] Express server running at http://localhost:${PORT}`);
        console.log('[Server] Static files served from:', PUBLIC_PATH);
        console.log(`Szerver fut a http://localhost:${PORT}`); // Explicitly log the expected string
    });

    process.on('SIGINT', () => {
        console.log('[Server] SIGINT received. Szerver leállítása...');
        serverInstance.close(() => { // Use serverInstance here
            console.log('[Server] Szerver leállítva');
            process.exit(0);
        });
    });

} catch (e) {
    console.error('[Server] FATAL INITIALIZATION ERROR in server.js:', e);
    process.exit(1);
}

process.on('uncaughtException', (error) => {
    console.error('[Server] Kezeletlen kivétel a szerverben (uncaughtException):', error);
    process.exit(1); // It's generally safer to exit on uncaught exceptions.
});