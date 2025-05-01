// server.js
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
app.use(express.static('public')); // Statikus fájlok (HTML, CSS, JS) kiszolgálása a 'public' mappából

// --- Fájl elérési utak ---
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const TEMPLATES_PATH = path.join(__dirname, 'templates.json');
const INVENTORY_MAP_PATH = path.join(__dirname, 'inventoryMap.json'); // Készlet leképezés fájl

// --- Segédfüggvények (Fájlkezelés) ---

// Beállítások olvasása
async function getSettings() {
    try {
        const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('settings.json nem található, alapértelmezett értékek használata.');
            return { apiKey: '', siteBaseUrl: '', defaultCategoryId: '' };
        }
        console.error('Hiba a settings.json olvasása közben:', error);
        throw new Error('Nem sikerült beolvasni a beállításokat.');
    }
}

// Beállítások mentése
async function saveSettings(settings) {
    try {
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Hiba a settings.json írása közben:', error);
        throw new Error('Nem sikerült menteni a beállításokat.');
    }
}

// Sablonok olvasása
async function getTemplates() {
    try {
        const data = await fs.readFile(TEMPLATES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('templates.json nem található, alapértelmezett létrehozása.');
            const defaultTemplates = [
                { templateId: "TPL-EXAMPLE-1H", name: "Példa Sablon (1óra)", baseSku: "TPL-EX-1H", durationHours: 1, defaultDescription: "Példa leírás", defaultPrice: 10000, defaultInventoryMode: 100 }
            ];
            await fs.writeFile(TEMPLATES_PATH, JSON.stringify(defaultTemplates, null, 2));
            return defaultTemplates;
        }
        console.error('Hiba a templates.json olvasása közben:', error);
        throw new Error('Nem sikerült beolvasni a sablonokat.');
    }
}

// Készlet térkép olvasása
async function getInventoryMap() {
    try {
        const data = await fs.readFile(INVENTORY_MAP_PATH, 'utf-8');
        return JSON.parse(data); // Formátum: { "productBvin1": "inventoryBvin1", ... }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('inventoryMap.json nem található, üres objektummal tér vissza.');
            return {};
        }
        console.error('Hiba az inventoryMap.json olvasása közben:', error);
        return {}; // Visszatérés üres objektummal hiba esetén is
    }
}

// Készlet térkép mentése
async function saveInventoryMap(map) {
    try {
        await fs.writeFile(INVENTORY_MAP_PATH, JSON.stringify(map, null, 2));
    } catch (error) {
        console.error('!!! HIBA az inventoryMap.json írása közben:', error);
        // Nem dobunk hibát tovább
    }
}

// === SEGÉDFÜGGVÉNY: Készlet Bvin keresése termékhez ===
async function findInventoryBvinForProduct(productBvin) {
    console.log(`Készlet(ek) keresése a ${productBvin} termékhez (szerver oldalon)...`);
    try {
        const inventories = await makeRawApiRequest(`/productinventory?byproduct=${productBvin}`, 'GET');
        let inventoryList = [];
        if (Array.isArray(inventories)) { inventoryList = inventories; }
        else if (inventories && Array.isArray(inventories.Content)) { inventoryList = inventories.Content; }
        else if (inventories && inventories.Bvin) { inventoryList = [inventories]; }
        console.log(`Talált készlet(ek) a ${productBvin} termékhez (szerver):`, inventoryList);
        if (inventoryList && inventoryList.length >= 1 && inventoryList[0].Bvin) {
            if(inventoryList.length > 1) console.warn(`Több készlet (${inventoryList.length}) található a ${productBvin} termékhez. Az első Bvin-t használjuk: ${inventoryList[0]?.Bvin}`);
            return inventoryList[0].Bvin;
        } else {
            console.warn(`Nem található készlet Bvin a ${productBvin} termékhez a lista lekérésével (szerver).`);
            return null;
        }
    } catch (error) {
        console.error(`Hiba a készlet(ek) lekérésekor a ${productBvin} termékhez (szerver):`, error);
        if (error.message?.includes('HTTP Hiba (404)')) { console.warn("A `/productinventory?byproduct=` végpont valószínűleg nem létezik vagy nem található."); }
        return null;
    }
}


// --- Raw Socket API Kérés Függvény (Workaround) ---
const API_BASE_PATH = "/DesktopModules/Hotcakes/API/rest/v1";

async function makeRawApiRequest(endpoint, method = 'GET', requestBody = null) {
    const settings = await getSettings();
    const { apiKey, siteBaseUrl } = settings;

    if (!apiKey || !siteBaseUrl) { throw new Error("API Kulcs vagy Alap URL nincs beállítva a settings.json fájlban."); }
    let url; try { url = new URL(siteBaseUrl); } catch (e) { throw new Error(`Érvénytelen Site Base URL: ${siteBaseUrl}`); }
    const HOST = url.hostname; const PORT = url.port || (url.protocol === 'https:' ? 443 : 80);
    const pathWithKey = `${API_BASE_PATH}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${apiKey}`;
    let requestBodyString = ''; if (requestBody !== null && requestBody !== undefined) { try { requestBodyString = JSON.stringify(requestBody); } catch (e) { throw new Error('Nem sikerült a kérés törzsét stringgé alakítani'); } }
    let httpRequest = `${method.toUpperCase()} ${pathWithKey} HTTP/1.1\r\n`; httpRequest += `Host: ${HOST}${url.port ? ':' + url.port : ''}\r\n`; httpRequest += `Accept: application/json\r\n`; httpRequest += `User-Agent: Node/TCP-Client-App\r\n`; httpRequest += `Connection: close\r\n`; if (requestBodyString) { httpRequest += `Content-Type: application/json\r\n`; httpRequest += `Content-Length: ${Buffer.byteLength(requestBodyString)}\r\n`; } httpRequest += `\r\n`; if (requestBodyString) { httpRequest += requestBodyString; }
    console.log(`Raw Socket Kérés -> ${HOST}:${PORT}${pathWithKey.split('?')[0]} [${method}]`);
    return new Promise((resolve, reject) => {
        const socket = new net.Socket(); let hP = false; let bB = Buffer.alloc(0); let sC = null; let sM = '';
        socket.connect(PORT, HOST, () => { socket.write(httpRequest); });
        socket.on('data', (c) => { bB = Buffer.concat([bB, c]); if (!hP) { const hEI = bB.indexOf('\r\n\r\n'); if (hEI !== -1) { hP = true; const hPrt = bB.slice(0, hEI).toString(); const sL = hPrt.split('\r\n')[0]; const sMch = sL.match(/^HTTP\/1\.[01] (\d{3})\s?(.*)$/i); if (sMch) { sC = parseInt(sMch[1], 10); sM = sMch[2] || ''; console.log(`Parseolt Státusz: ${sC} ${sM}`); } else { console.error("Nem sikerült parseolni a státusz sort:", sL); socket.destroy(); return reject(new Error('Nem sikerült parseolni a HTTP státusz sort.')); } bB = bB.slice(hEI + 4); } } });
        socket.on('close', () => { console.log('Socket kapcsolat lezárva'); if (sC === null) { return reject(new Error('Kapcsolat lezárult a státusz sor fogadása előtt.')); } const rBS = bB.toString('utf-8'); if (sC >= 200 && sC < 300) { if (sC === 204 || rBS.length === 0) { resolve({ success: true }); } else { try { const res = JSON.parse(rBS); if (res.Errors && res.Errors.length > 0) { console.error("Hotcakes API Logikai Hibák (2xx válaszban):", res.Errors); reject(new Error(`Hotcakes API Logikai Hiba: ${res.Errors.map(e=>e.Description||e.Code).join('; ')}`)); } else { resolve(res.Content !== undefined ? res.Content : res); } } catch (e) { console.error(`Nem sikerült JSON-ként parseolni a választ. Státusz: ${sC}`); console.error('Nyers body:', rBS.substring(0,500)+'...'); reject(new Error(`Sikertelen JSON válaszfeldolgozás (Státusz: ${sC})`)); } } } else { console.error(`HTTP Hiba: ${sC} ${sM}`); console.error('Válasz body:', rBS.substring(0,500)+'...'); reject(new Error(`HTTP Hiba (${sC}): ${sM} - ${rBS.substring(0,200)}...`)); } });
        socket.on('error', (e) => { console.error('Socket hiba:', e); reject(e); }); socket.setTimeout(30000); socket.on('timeout', () => { console.error('Socket időtúllépés'); socket.destroy(); reject(new Error('Kapcsolat időtúllépés')); });
    });
}

// --- Szerver Végpontok (API a Frontendünk számára) ---

// GET Beállítások
app.get('/api/settings', async (req, res) => {
    try { const settings = await getSettings(); res.json(settings); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

// POST Beállítások (Mentés)
app.post('/api/settings', async (req, res) => {
    try { if (!req.body || typeof req.body.apiKey !== 'string' || typeof req.body.siteBaseUrl !== 'string') { return res.status(400).json({ error: 'Érvénytelen beállítás formátum.' }); } await saveSettings(req.body); res.json({ message: 'Beállítások sikeresen mentve.' }); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

// GET Kategóriák (Hotcakes-től) - Raw Socket
app.get('/api/categories', async (req, res) => {
    try { const categories = await makeRawApiRequest('/categories', 'GET'); res.json(Array.isArray(categories) ? categories : []); }
    catch (error) { console.error("Hiba a /api/categories végponton (raw):", error); res.status(500).json({ error: error.message }); }
});

// GET Sablonok (helyi fájlból)
app.get('/api/templates', async (req, res) => {
    try { const templates = await getTemplates(); res.json(templates); }
    catch (error) { console.error("Hiba a /api/templates végponton:", error); res.status(500).json({ error: error.message }); }
});

// GET Tanfolyamok (Hotcakes kategóriából) - Raw Socket
app.get('/api/courses', async (req, res) => {
    try { const settings = await getSettings(); const categoryId = settings.defaultCategoryId; if (!categoryId) { return res.status(400).json({ error: "Nincs alapértelmezett kategória beállítva." }); } const productsData = await makeRawApiRequest(`/products?bycategory=${categoryId}&page=1&pagesize=1000`, 'GET'); const products = Array.isArray(productsData) ? productsData : (productsData && Array.isArray(productsData.Products) ? productsData.Products : []); res.json(products); }
    catch (error) { console.error("Hiba a /api/courses végponton (raw):", error); res.status(500).json({ error: error.message }); }
});

// GET Termék Adatok (Bvin alapján) - Raw Socket
app.get('/api/products/:bvin', async (req, res) => {
    const bvin = req.params.bvin;
    if (!bvin) { return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." }); }
    console.log(`Termék adatok lekérése (raw): bvin=${bvin}`);
    try {
        const productData = await makeRawApiRequest(`/products/${bvin}`, 'GET');
        if (productData && productData.Bvin) { res.json(productData); }
        else { console.warn(`Nem található termék vagy üres válasz a ${bvin} Bvin azonosítóhoz.`); return res.status(404).json({ error: `Termék nem található: ${bvin}` }); }
    } catch (error) {
        console.error(`Hiba a(z) ${bvin} termék adatainak lekérésekor:`, error);
        if (error.message?.includes('HTTP Hiba (404)')) { return res.status(404).json({ error: `Termék nem található: ${bvin} (Hotcakes 404)` }); }
        res.status(500).json({ error: error.message });
    }
});


// POST Tanfolyam (Új létrehozása) - Raw Socket - Hamis 500 hiba kezelése
app.post('/api/courses', async (req, res) => {
    const { productData, inventoryData, associationData } = req.body;
    if (!productData || !inventoryData || !associationData) return res.status(400).json({ error: "Hiányzó adatok a tanfolyam létrehozásához." });
    let productBvin = null; let createdProductDataForResponse = null;
    try {
        console.log("1. Lépés: Termék létrehozásának kísérlete (raw)...", productData.Sku);
        createdProductDataForResponse = productData;
        try {
            const createdProduct = await makeRawApiRequest('/products', 'POST', productData);
            if (!createdProduct || !createdProduct.Bvin) throw new Error("Termék létrehozva (2xx), de a válasz érvénytelen vagy hiányzik a Bvin.");
            productBvin = createdProduct.Bvin; createdProductDataForResponse = createdProduct;
            console.log("Termék sikeresen létrehozva (2xx), Bvin:", productBvin);
        } catch (creationError) {
            console.warn("Hiba a termék létrehozása során, ellenőrzés:", creationError.message);
            if (creationError.message?.includes('HTTP Hiba (500)') && creationError.message?.includes('UpdateJournalItem')) {
                console.warn("!!! Speciális 500-as hiba észlelve (JournalItem). Feltételezzük, hogy a termék létrejöhetett. Ellenőrzés SKU alapján...");
                try { await new Promise(resolve => setTimeout(resolve, 1500)); console.log(`Keresés SKU alapján: ${productData.Sku}`); const foundProduct = await makeRawApiRequest(`/products/ANY?bysku=${encodeURIComponent(productData.Sku)}`, 'GET'); if (foundProduct && foundProduct.Bvin) { productBvin = foundProduct.Bvin; createdProductDataForResponse = foundProduct; console.log(`Termék (${productData.Sku}) valójában létrejött és megtalálva, Bvin: ${productBvin}. Folytatás...`); } else { throw new Error(`Termék létrehozása sikertelen (500, de SKU nem található): ${productData.Sku}`); } }
                catch (findError) { throw new Error(`Termék létrehozása sikertelen (500, és a SKU keresés is hibára futott): ${findError.message}`); }
            } else { throw creationError; }
        }
        if (!productBvin) throw new Error("Ismeretlen hiba: Nincs érvényes productBvin a létrehozás/ellenőrzés után.");
        inventoryData.ProductBvin = productBvin; console.log(`2. Lépés: Készlet létrehozása (raw) a ${productBvin} termékhez...`);
        let createdInventoryBvin = null;
        try {
            const createdInventory = await makeRawApiRequest('/productinventory', 'POST', inventoryData);
            if (createdInventory && createdInventory.Bvin) {
                createdInventoryBvin = createdInventory.Bvin; console.log(`Készlet létrehozva (${productBvin}), Bvin:`, createdInventoryBvin);
                try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`Készlet leképezés frissítve: ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("!!! HIBA a készlet leképezés mentésekor:", mapError); }
            } else {
                console.warn(`Készlet létrehozva (2xx), de a válasz hiányos (nincs Bvin). Megpróbáljuk lekérni...`);
                createdInventoryBvin = await findInventoryBvinForProduct(productBvin);
                if (createdInventoryBvin) { console.log(`Sikerült megtalálni a készlet Bvin-t (${createdInventoryBvin}) a termékhez tartozó lista lekérésével.`); try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`Készlet leképezés frissítve (lekérés után): ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("!!! HIBA a készlet leképezés mentésekor (lekérés után):", mapError); } }
                else { console.error("Készlet létrehozva (2xx), de nem sikerült azonosítani az új inventoryBvin-t."); }
            }
        } catch(inventoryCreationError) {
            if (inventoryCreationError.message?.includes('HTTP Hiba (500)')) {
                console.warn("!!! Készlet létrehozás 500-as hiba. Feltételezzük, hogy létrejött. Megpróbáljuk lekérni...");
                createdInventoryBvin = await findInventoryBvinForProduct(productBvin);
                if (createdInventoryBvin) { console.log(`Sikerült megtalálni a készlet Bvin-t (${createdInventoryBvin}) a termékhez tartozó lista lekérésével a hiba után.`); try { const invMap = await getInventoryMap(); invMap[productBvin] = createdInventoryBvin; await saveInventoryMap(invMap); console.log(`Készlet leképezés frissítve (500-as hiba után): ${productBvin} -> ${createdInventoryBvin}`); } catch (mapError) { console.error("!!! HIBA a készlet leképezés mentésekor (500-as hiba után):", mapError); } }
                else { console.error("Készlet létrehozása 500-as hibát adott, és utána nem sikerült azonosítani az inventoryBvin-t."); }
            } else { console.error(`Valódi hiba a készlet létrehozásakor a ${productBvin} termékhez:`, inventoryCreationError); }
        }
        associationData.ProductId = productBvin; associationData.CategoryId = (await getSettings()).defaultCategoryId;
        if (!associationData.CategoryId) { console.warn(`Nincs alapértelmezett kategória ID beállítva a(z) ${productBvin} termék hozzárendeléséhez. Kihagyás.`); }
        else {
            console.log(`3. Lépés: Kategória hozzárendelés létrehozása (raw) a ${productBvin} termékhez (${associationData.CategoryId})...`);
            try { await makeRawApiRequest('/categoryproductassociations', 'POST', associationData); console.log(`Kategória hozzárendelés létrehozva (${productBvin}).`); } catch (assocError) { console.error(`Hiba a kategória hozzárendelésekor a ${productBvin} termékhez:`, assocError); }
        }
        console.log(`Tanfolyam létrehozási folyamat befejezve a ${productBvin} termékhez.`);
        res.status(201).json(createdProductDataForResponse);
    } catch (error) {
        console.error("Végső hiba a tanfolyam létrehozási folyamatban (raw):", error);
        res.status(500).json({ error: `Tanfolyam létrehozása sikertelen: ${error.message}` });
    }
});

// POST Termék Frissítése (Ár és Dátum/SKU) - Raw Socket - Hamis 500 Kezelés
app.post('/api/products/:bvin', async (req, res) => {
    const bvin = req.params.bvin;
    const { SitePrice, StartDateTime } = req.body;
    if (!bvin) { return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." }); }
    if (SitePrice === undefined || typeof SitePrice !== 'number' || SitePrice < 0) { return res.status(400).json({ error: "Érvényes 'SitePrice' (szám, >= 0) megadása kötelező." }); }
    if (typeof StartDateTime !== 'string' || !StartDateTime) { return res.status(400).json({ error: "Érvényes 'StartDateTime' (string) megadása kötelező." }); }

    console.log(`Termék frissítésének kísérlete (raw): bvin=${bvin}, Új Ár=${SitePrice}, Új Időpont=${StartDateTime}`);
    let updateResultPayload = { message: `Frissítési kísérlet (${bvin}) elküldve.` };

    try {
        // 1. Lépés: Aktuális termékadatok lekérése
        console.log(`Lekérés a frissítéshez: /products/${bvin}`);
        const currentProduct = await makeRawApiRequest(`/products/${bvin}`, 'GET');
        if (!currentProduct || !currentProduct.Bvin) { throw new Error(`Nem található termék a ${bvin} Bvin azonosítóval a frissítéshez.`); }

        // 2. Lépés: Adatok módosítása és ÚJ SKU generálása
        const updatedProductData = { ...currentProduct };
        updatedProductData.SitePrice = SitePrice;
        const currentSku = currentProduct.Sku || ''; const skuParts = currentSku.split('-'); const datePartExists = skuParts.length > 1 && /^\d{8,12}$/.test(skuParts[skuParts.length - 1]); const baseSku = datePartExists ? skuParts.slice(0, -1).join('-') : currentSku;
        const newFormattedDateTime = StartDateTime.replace(/[-T:]/g, '').substring(0, 12);
        const newSku = `${baseSku}-${newFormattedDateTime}`;
        const newProductName = `${currentProduct.ProductName.split('(')[0].trim()} (${StartDateTime.replace('T', ' ')})`;
        updatedProductData.Sku = newSku; updatedProductData.ProductName = newProductName;
        delete updatedProductData.CreationDateUtc; // Dátum mező törlése

        console.log("Frissített termék payload küldése:", JSON.stringify(updatedProductData, null, 2));

        // 3. Lépés: Frissített adatok visszaküldése POST metódussal
        try {
            const updateResult = await makeRawApiRequest(`/products/${bvin}`, 'POST', updatedProductData);
            console.log("Termék frissítés API válasz (2xx):", updateResult);
            updateResultPayload = updateResult || { message: "Termék frissítés sikeres (2xx)." };
        } catch (updateError) {
            if (updateError.message?.includes('HTTP Hiba (500)') && updateError.message?.includes('UpdateJournalItem')) {
                console.warn(`!!! Termék frissítés 500-as hiba (JournalItem). Feltételezzük, hogy sikeres volt.`);
                updateResultPayload = updatedProductData; // Visszaadjuk amit küldtünk, mert az a frissített
            } else { throw updateError; } // Más hiba továbbdobása
        }
        res.json(updateResultPayload); // Sikeres válasz küldése

    } catch (error) {
        console.error(`Hiba a(z) ${bvin} termék frissítésekor (végső catch):`, error);
        res.status(500).json({ error: `Termék frissítése sikertelen: ${error.message}` });
    }
});


// DELETE Tanfolyam - Raw Socket - Hamis 500 hiba kezelése
app.delete('/api/courses/:bvin', async (req, res) => {
    const bvin = req.params.bvin; if (!bvin) return res.status(400).json({ error: "Termék Bvin paraméter megadása kötelező." });
    console.log(`Termék törlésének kísérlete (raw) (Bvin: ${bvin})`); let deleteSuccessful = false;
    try { const result = await makeRawApiRequest(`/products/${bvin}`, 'DELETE'); console.log("Törlés API hívás eredménye (raw):", result); if (result && result.success) { deleteSuccessful = true; res.json({ message: `Termék (${bvin}) sikeresen törölve (2xx válasz).` }); } else { console.warn(`Nem egyértelmű válasz törléskor (${bvin}):`, result); deleteSuccessful = true; res.json({ message: `Termék (${bvin}) törölve (válasz nem egyértelmű).` }); } }
    catch (error) { console.warn(`Hiba törléskor (${bvin}), ellenőrzés:`, error.message); if (error.message?.includes('HTTP Hiba (500)')) { console.warn(`!!! 500-as hiba törlésnél (${bvin}). Feltételezzük sikert.`); deleteSuccessful = true; res.json({ message: `Termék (${bvin}) törölve (500-as hiba ellenére).` }); } else { console.error(`Valódi hiba törléskor (${bvin}):`, error); res.status(500).json({ error: `Törlési hiba: ${error.message}` }); } }
    if (deleteSuccessful) { try { const invMap = await getInventoryMap(); if (invMap[bvin]) { delete invMap[bvin]; await saveInventoryMap(invMap); console.log(`Készlet leképezés törölve: ${bvin}`); } } catch (mapError) { console.error("Leképezés törlési hiba:", mapError); } }
});

// GET Készlet Adatok (Termék Bvin alapján) - Raw Socket
app.get('/api/inventory/:productBvin', async (req, res) => {
    const productBvin = req.params.productBvin; if (!productBvin) return res.status(400).json({ error: "Termék Bvin paraméter kötelező." });
    try { const invMap = await getInventoryMap(); let inventoryBvin = invMap[productBvin];
        if (!inventoryBvin) { console.warn(`Nincs inventoryBvin ${productBvin}-hez. Lekérés...`); const foundInvBvin = await findInventoryBvinForProduct(productBvin); if (foundInvBvin) { console.log(`Megtalált inventoryBvin: ${foundInvBvin}`); inventoryBvin = foundInvBvin; try { const map = await getInventoryMap(); map[productBvin] = foundInvBvin; await saveInventoryMap(map); } catch(e){console.error("Talált inv Bvin mentési hiba:", e);} } else { console.error(`Nem sikerült inventoryBvin-t találni: ${productBvin}.`); return res.status(404).json({ error: `Nincs készlet info: ${productBvin}.`}); } }
        console.log(`Készlet lekérése: invBvin=${inventoryBvin} (prodBvin=${productBvin})`); const inventoryData = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'GET'); res.json(inventoryData || { QuantityOnHand: null });
    } catch (error) { console.error(`Készlet lekérési hiba (${productBvin}):`, error); res.status(500).json({ error: error.message }); }
});

// POST Készlet Frissítése (Inventory Bvin alapján) - Raw Socket - Hamis 500 Kezelés
app.post('/api/inventory/:inventoryBvin', async (req, res) => {
    const inventoryBvin = req.params.inventoryBvin; const { QuantityOnHand } = req.body; if (!inventoryBvin) { return res.status(400).json({ error: "Készlet Bvin paraméter kötelező." }); } if (QuantityOnHand === undefined || typeof QuantityOnHand !== 'number' || !Number.isInteger(QuantityOnHand) || QuantityOnHand < 0) { return res.status(400).json({ error: "Érvényes 'QuantityOnHand' (egész szám, >= 0) kötelező." }); }
    console.log(`Készlet frissítés (raw): invBvin=${inventoryBvin}, új Qty=${QuantityOnHand}`); let updateResultPayload = { message: `Frissítési kísérlet (${inventoryBvin}).` };
    try {
        console.log(`Lekérés frissítéshez: /productinventory/${inventoryBvin}`); const currentInventory = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'GET'); if (!currentInventory || !currentInventory.Bvin || !currentInventory.ProductBvin) { throw new Error(`Nem található készlet vagy hiányzik ProductBvin: ${inventoryBvin}.`); }
        const minimalUpdatePayload = { Bvin: currentInventory.Bvin, QuantityOnHand: QuantityOnHand, ProductBvin: currentInventory.ProductBvin }; console.log("Minimális payload küldése:", JSON.stringify(minimalUpdatePayload, null, 2));
        try { const updateResult = await makeRawApiRequest(`/productinventory/${inventoryBvin}`, 'POST', minimalUpdatePayload); console.log("Készlet frissítés API válasz (2xx):", updateResult); updateResultPayload = updateResult || { message: "Frissítés sikeres (2xx)." }; }
        catch (updateError) { if (updateError.message?.includes('HTTP Hiba (500)') && updateError.message?.includes('UpdateJournalItem')) { console.warn(`!!! Készlet frissítés 500-as hiba (JournalItem). Feltételezzük sikert.`); updateResultPayload = { message: `Frissítés valószínűleg sikeres (szerver 500). Új mennyiség: ${QuantityOnHand}` }; } else { throw updateError; } }
        res.json(updateResultPayload);
    } catch (error) { console.error(`Hiba ${inventoryBvin} készlet frissítésekor:`, error); res.status(500).json({ error: `Készlet frissítése sikertelen: ${error.message}` }); }
});

// POST Sablonok Mentése
app.post('/api/templates', async (req, res) => {
    const newTemplatesString = req.body.templates; if (typeof newTemplatesString !== 'string') { return res.status(400).json({ error: 'Érvénytelen kérés: hiányzó vagy nem string "templates" adat.' }); }
    try { JSON.parse(newTemplatesString); await fs.writeFile(TEMPLATES_PATH, newTemplatesString); console.log("templates.json sikeresen frissítve."); res.json({ message: "Sablonok sikeresen mentve." }); }
    catch (error) { if (error instanceof SyntaxError) { console.error("Sablon mentési hiba: Érvénytelen JSON.", error); res.status(400).json({ error: `Érvénytelen JSON formátum: ${error.message}` }); } else { console.error("templates.json írási hiba:", error); res.status(500).json({ error: `Nem sikerült menteni a sablonokat: ${error.message}` }); } }
});


// --- Szerver Indítása ---
app.listen(PORT, () => {
    console.log(`Szerver fut a http://localhost:${PORT} címen`);
    console.log('Statikus fájlok kiszolgálása a ./public mappából');
    console.log('Győződj meg róla, hogy van index.html a public mappában.');
});