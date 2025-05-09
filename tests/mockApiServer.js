// Purpose: A mock server to simulate the external Hotcakes API.
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const MOCK_API_PORT = 3001; // Port for this mock Hotcakes API
const app = express();

app.use(cors());
app.use(bodyParser.json());

const fixturesPath = path.join(__dirname, 'fixtures');
let mockCourses = [];
let mockInventories = {}; // Key: inventoryBvin, Value: inventory object
let mockProductToInventoryMap = {}; // Key: productBvin, Value: inventoryBvin

const HOTCAKES_API_BASE = "/DesktopModules/Hotcakes/API/rest/v1";

async function loadInitialData() {
    try {
        const coursesData = await fs.readFile(path.join(fixturesPath, 'mock-courses.json'), 'utf-8');
        mockCourses = JSON.parse(coursesData);

        // Initialize inventories based on courses
        mockCourses.forEach((course, index) => {
            const invBvin = `inv-bvin-${index + 1}`;
            mockProductToInventoryMap[course.Bvin] = invBvin;
            mockInventories[invBvin] = {
                Bvin: invBvin,
                ProductBvin: course.Bvin,
                QuantityOnHand: 10 + index, // Default quantity
                LowStockPoint: 2,
                OutOfStockPoint: 0,
                LastUpdated: new Date().toISOString()
            };
        });
        console.log('[MockAPI] Initial mock data loaded.');
    } catch (error) {
        console.error('[MockAPI] Error loading initial mock data:', error);
    }
}

// Log all requests to the mock API
app.use((req, res, next) => {
    console.log(`[MockAPI] Received request: ${req.method} ${req.originalUrl}`);
    if (Object.keys(req.body).length > 0) {
        console.log(`[MockAPI] Request body: ${JSON.stringify(req.body)}`);
    }
    next();
});

// --- Hotcakes API Endpoints Simulation ---

// GET Categories
app.get(`${HOTCAKES_API_BASE}/categories`, async (req, res) => {
    try {
        const categories = await fs.readFile(path.join(fixturesPath, 'mock-categories.json'), 'utf-8');
        res.json({ Content: JSON.parse(categories) }); // Hotcakes usually wraps in Content
    } catch (e) {
        res.status(500).json({ Errors: [{ Description: "Mock categories file not found or unreadable." }] });
    }
});

// GET Products (by category)
app.get(`${HOTCAKES_API_BASE}/products`, async (req, res) => {
    const categoryId = req.query.bycategory;
    if (!categoryId) {
        return res.status(400).json({ Errors: [{ Description: "bycategory query parameter is required." }] });
    }
    // For simplicity, returning all mock courses regardless of category for now
    // In a real scenario, you'd filter mockCourses by categoryId if needed
    res.json({ Content: { Products: mockCourses } });
});

// GET Product by BVIN or SKU
app.get(`${HOTCAKES_API_BASE}/products/:bvinOrAny`, async (req, res) => {
    const bvinOrAny = req.params.bvinOrAny;
    const bySku = req.query.bysku;

    let product;
    if (bvinOrAny !== 'ANY' && !bySku) {
        product = mockCourses.find(p => p.Bvin === bvinOrAny);
    } else if (bySku) {
        product = mockCourses.find(p => p.Sku === bySku);
    }

    if (product) {
        // Simulate the product detail structure if needed from a different fixture
        try {
            const detail = await fs.readFile(path.join(fixturesPath, 'mock-product-detail.json'), 'utf-8');
            let productDetail = JSON.parse(detail);
            // Merge with actual mock product data
            productDetail = { ...productDetail, ...product };
            res.json({ Content: productDetail });
        } catch (e) {
            res.json({ Content: product }); // Fallback to basic product data
        }
    } else {
        res.status(404).json({ Errors: [{ Description: "Product not found." }] });
    }
});

// POST Create Product
app.post(`${HOTCAKES_API_BASE}/products`, (req, res) => {
    const newProduct = req.body;
    if (!newProduct.Sku || !newProduct.ProductName) {
        return res.status(400).json({ Errors: [{ Description: "SKU and ProductName are required." }] });
    }
    newProduct.Bvin = `prod-bvin-${Date.now()}`; // Generate a unique BVIN
    newProduct.LastUpdated = new Date().toISOString();

    // Simulate 500 error for UpdateJournalItem to test specific error handling
    if (newProduct.Sku.includes("ERROR_JOURNAL")) {
        console.log("[MockAPI] Simulating 500 UpdateJournalItem error for product creation.");
        return res.status(500).json({
            Errors: [{ Code: "UpdateJournalItem", Description: "A mock error occurred while updating the journal item." }]
        });
    }

    mockCourses.push(newProduct);
    console.log(`[MockAPI] Created product: ${newProduct.Bvin}, SKU: ${newProduct.Sku}`);
    res.status(201).json({ Content: newProduct });
});

// POST Update Product
app.post(`${HOTCAKES_API_BASE}/products/:bvin`, (req, res) => {
    const bvin = req.params.bvin;
    const updatedData = req.body;
    const productIndex = mockCourses.findIndex(p => p.Bvin === bvin);

    if (productIndex > -1) {
        mockCourses[productIndex] = { ...mockCourses[productIndex], ...updatedData, LastUpdated: new Date().toISOString() };

        // Simulate 500 error for UpdateJournalItem
        if (updatedData.Sku && updatedData.Sku.includes("ERROR_JOURNAL_UPDATE")) {
            console.log("[MockAPI] Simulating 500 UpdateJournalItem error for product update.");
            return res.status(500).json({
                Errors: [{ Code: "UpdateJournalItem", Description: "A mock error occurred while updating the journal item during update." }]
            });
        }
        console.log(`[MockAPI] Updated product: ${bvin}`);
        res.json({ Content: mockCourses[productIndex] });
    } else {
        res.status(404).json({ Errors: [{ Description: "Product not found for update." }] });
    }
});

// DELETE Product
app.delete(`${HOTCAKES_API_BASE}/products/:bvin`, (req, res) => {
    const bvin = req.params.bvin;
    const initialLength = mockCourses.length;
    mockCourses = mockCourses.filter(p => p.Bvin !== bvin);

    if (mockCourses.length < initialLength) {
        // Also remove associated inventory
        const invBvin = mockProductToInventoryMap[bvin];
        if (invBvin) {
            delete mockInventories[invBvin];
            delete mockProductToInventoryMap[bvin];
            console.log(`[MockAPI] Deleted inventory associated with product ${bvin}`);
        }
        console.log(`[MockAPI] Deleted product: ${bvin}`);
        res.json({ Content: { success: true } }); // Simulate Hotcakes success
    } else {
        // Simulate 500 error for deletion to test specific error handling
        if (bvin.includes("ERROR_DELETE")) {
            console.log("[MockAPI] Simulating 500 error for product deletion.");
            return res.status(500).json({ Errors: [{ Description: "Mock 500 error during product deletion." }] });
        }
        res.status(404).json({ Errors: [{ Description: "Product not found for deletion." }] });
    }
});

// GET ProductInventory by ProductBvin
app.get(`${HOTCAKES_API_BASE}/productinventory`, (req, res) => {
    const productBvin = req.query.byproduct;
    if (!productBvin) {
        return res.status(400).json({ Errors: [{ Description: "byproduct query parameter is required." }] });
    }
    const inventoryBvin = mockProductToInventoryMap[productBvin];
    if (inventoryBvin && mockInventories[inventoryBvin]) {
        res.json({ Content: [mockInventories[inventoryBvin]] }); // Hotcakes returns an array
    } else {
        // Simulate 404 if product exists but inventory doesn't (should not happen if POST /products creates one)
        if (mockCourses.some(c => c.Bvin === productBvin)) {
            console.warn(`[MockAPI] No inventory found for existing product ${productBvin}. This might indicate an issue in mock setup or test logic.`);
            return res.status(404).json({ Errors: [{ Description: `Inventory not found for product ${productBvin}.` }] });
        }
        // If product itself is unknown
        res.status(404).json({ Errors: [{ Description: `Product or its inventory not found for ${productBvin}.` }] });
    }
});


// GET ProductInventory by InventoryBvin
app.get(`${HOTCAKES_API_BASE}/productinventory/:inventoryBvin`, (req, res) => {
    const inventoryBvin = req.params.inventoryBvin;
    const inventory = mockInventories[inventoryBvin];
    if (inventory) {
        res.json({ Content: inventory });
    } else {
        res.status(404).json({ Errors: [{ Description: "Inventory item not found." }] });
    }
});

// POST Create ProductInventory
app.post(`${HOTCAKES_API_BASE}/productinventory`, (req, res) => {
    const newInventory = req.body;
    if (!newInventory.ProductBvin || newInventory.QuantityOnHand === undefined) {
        return res.status(400).json({ Errors: [{ Description: "ProductBvin and QuantityOnHand are required." }] });
    }
    newInventory.Bvin = `inv-bvin-${Date.now()}`;
    newInventory.LastUpdated = new Date().toISOString();
    mockInventories[newInventory.Bvin] = newInventory;
    mockProductToInventoryMap[newInventory.ProductBvin] = newInventory.Bvin;
    console.log(`[MockAPI] Created inventory for product ${newInventory.ProductBvin}: ${newInventory.Bvin}`);
    res.status(201).json({ Content: newInventory });
});

// POST Update ProductInventory
app.post(`${HOTCAKES_API_BASE}/productinventory/:inventoryBvin`, (req, res) => {
    const inventoryBvin = req.params.inventoryBvin;
    const updatedData = req.body;
    if (mockInventories[inventoryBvin]) {
        mockInventories[inventoryBvin] = { ...mockInventories[inventoryBvin], ...updatedData, LastUpdated: new Date().toISOString() };

        // Simulate 500 error for UpdateJournalItem
        if (updatedData.ProductBvin && updatedData.ProductBvin.includes("ERROR_INV_JOURNAL")) {
            console.log("[MockAPI] Simulating 500 UpdateJournalItem error for inventory update.");
            return res.status(500).json({
                Errors: [{ Code: "UpdateJournalItem", Description: "A mock error occurred while updating the journal item for inventory." }]
            });
        }

        console.log(`[MockAPI] Updated inventory: ${inventoryBvin}`);
        res.json({ Content: mockInventories[inventoryBvin] });
    } else {
        res.status(404).json({ Errors: [{ Description: "Inventory item not found for update." }] });
    }
});

// POST CategoryProductAssociations
app.post(`${HOTCAKES_API_BASE}/categoryproductassociations`, (req, res) => {
    const assoc = req.body;
    if (!assoc.ProductId || !assoc.CategoryId) {
        return res.status(400).json({ Errors: [{ Description: "ProductId and CategoryId are required." }] });
    }
    // We don't store associations in this simple mock, just acknowledge
    console.log(`[MockAPI] Received category association for Product: ${assoc.ProductId} to Category: ${assoc.CategoryId}`);
    res.status(201).json({ Content: { ProductId: assoc.ProductId, CategoryId: assoc.CategoryId, SortOrder: 0 } });
});


let server;
async function startMockApiServer() {
    await loadInitialData();
    return new Promise((resolve) => {
        server = app.listen(MOCK_API_PORT, () => {
            console.log(`[MockAPI] Mock Hotcakes API server listening on http://localhost:${MOCK_API_PORT}`);
            resolve(server);
        });
    });
}

function stopMockApiServer() {
    return new Promise((resolve, reject) => {
        if (server) {
            server.close((err) => {
                if (err) {
                    console.error('[MockAPI] Error stopping mock API server:', err);
                    return reject(err);
                }
                console.log('[MockAPI] Mock Hotcakes API server stopped.');
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// Allow running this file directly to start the mock server for manual testing
if (require.main === module) {
    startMockApiServer().catch(err => {
        console.error("Failed to start mock API server directly:", err);
        process.exit(1);
    });
}

module.exports = { startMockApiServer, stopMockApiServer, MOCK_API_PORT };