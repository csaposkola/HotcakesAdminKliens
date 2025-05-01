// public/app.js

// --- Constants ---
const API_BASE = '/api'; // Csak referencia, a hívásoknál teljes útvonal kell

// --- DOM Elements ---
// Navigation
const navButtons = document.querySelectorAll('nav .btn[data-view]');
const views = document.querySelectorAll('.view');
// Universal Status
const statusContainer = document.getElementById('status-container');
// Settings View
const settingsForm = document.getElementById('settings-form');
const apiKeyInput = document.getElementById('api-key');
const baseUrlInput = document.getElementById('base-url');
const categorySelect = document.getElementById('category-select');
const loadCategoriesBtn = document.getElementById('load-categories');
const settingsStatus = document.getElementById('settings-status');
// Courses View
const coursesView = document.getElementById('courses-view');
const refreshCoursesBtn = document.getElementById('refresh-courses');
const showAddCourseFormBtn = document.getElementById('show-add-course-form');
const courseListTableBody = document.getElementById('course-list-body');
// Add Course Form
const addCourseForm = document.getElementById('add-course-form');
const templateSelect = document.getElementById('template-select');
const startDateInput = document.getElementById('start-date');
const initialSeatsInput = document.getElementById('initial-seats');
const cancelAddCourseBtn = document.getElementById('cancel-add-course');
const addCourseStatus = document.getElementById('add-course-status');
// Templates View
const templatesView = document.getElementById('templates-view');
const refreshTemplatesBtn = document.getElementById('refresh-templates');
const templateList = document.getElementById('template-list');
const templatesStatus = document.getElementById('templates-status');
const editTemplatesBtn = document.getElementById('edit-templates-btn');
const templateEditorContainer = document.getElementById('template-editor-container');
const templateJsonEditor = document.getElementById('template-json-editor');
const saveTemplatesBtn = document.getElementById('save-templates-btn');
const cancelEditTemplatesBtn = document.getElementById('cancel-edit-templates-btn');
const templateEditorStatus = document.getElementById('template-editor-status');
// Edit Course Modal Elements (Korábban Inventory Modal)
const editCourseModalElement = document.getElementById('editCourseModal');
const editCourseModal = new bootstrap.Modal(editCourseModalElement);
const modalCourseName = document.getElementById('modal-course-name');
const modalCourseSku = document.getElementById('modal-course-sku');
const modalInventoryBvinInput = document.getElementById('modal-inventory-bvin'); // Készlet Bvin továbbra is kell
const modalProductBvinInput = document.getElementById('modal-product-bvin'); // Termék Bvin is kell
const modalQuantityInput = document.getElementById('modal-quantity'); // Készlet
const modalStartDateTimeInput = document.getElementById('modal-start-datetime'); // Új: Időpont
const modalPriceInput = document.getElementById('modal-price'); // Új: Ár
const saveCourseBtn = document.getElementById('save-course-btn'); // Átnevezett mentés gomb
const modalStatus = document.getElementById('modal-status');

// --- Global State ---
let currentSettings = {};
let availableTemplates = [];
let currentTemplatesString = '';


// --- Utility Functions ---

// Státusz üzenet megjelenítése adott elemen
function displayStatus(element, message, type = 'info') {
    if (!element) { console.warn("Kísérlet státusz megjelenítésére nem létező elemen."); return; }
    element.textContent = message; const existingClasses = element.className.split(' ').filter(c => c === 'alert' || c === 'mt-3').join(' ');
    element.className = `${existingClasses} alert-${type}`; element.setAttribute('role', 'alert'); element.style.display = 'block';
    if ((type === 'success' || type === 'info') && !element.id.includes('add-course') && !element.id.includes('modal-status') && !element.id.includes('template-editor-status')) { setTimeout(() => { if (element.textContent === message) { element.style.display = 'none'; } }, 5000); }
}

// Globális státusz üzenet megjelenítése
function showGlobalStatus(message, type = 'info') {
    const alertDiv = document.createElement('div'); alertDiv.className = `alert alert-${type} alert-dismissible fade show`; alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Bezárás"></button>`;
    statusContainer.innerHTML = ''; statusContainer.appendChild(alertDiv);
    if (type === 'success' || type === 'info') { setTimeout(() => { const bsAlert = typeof bootstrap !== 'undefined' ? bootstrap.Alert.getInstance(alertDiv) : null; if (bsAlert) { bsAlert.close(); } else { if (alertDiv.parentNode) { alertDiv.remove(); } } } , 5000); }
}

// Státusz elem törlése
function clearStatus(element) { if (element) { element.textContent = ''; element.style.display = 'none'; } }

// API hívás a helyi szerverhez (backend)
async function fetchApi(endpoint, options = {}) {
    const url = endpoint; // A hívó adja meg a teljes /api/... útvonalat
    if (!url || !url.startsWith('/api/')) { console.warn(`fetchApi hívás endpointja ('${url}') nem '/api/'-val kezdődik.`); } // Figyelmeztetés helytelen hívás esetén
    try {
        const response = await fetch(url, options); const isJson = response.headers.get('content-type')?.includes('application/json'); const responseBodyText = await response.text();
        if (response.ok && !responseBodyText) { return { success: true }; } // Üres 2xx válasz kezelése
        const data = isJson ? JSON.parse(responseBodyText) : responseBodyText; // Parseolás vagy szövegként visszaadás
        if (!response.ok) { const errorMessage = data?.error || (typeof data === 'string' ? data : response.statusText); throw new Error(`Szerverhiba (${response.status}): ${errorMessage}`); } // Hiba dobása nem 2xx esetén
        return data; // Sikeres válasz adatának visszaadása
    } catch (error) { console.error(`API hívás sikertelen: ${options.method || 'GET'} ${url}`, error); showGlobalStatus(`Hálózati vagy szerverhiba: ${error.message}`, 'danger'); throw error; }
}

// Dátum/Idő parseolása SKU-ból (YYYYMMDDHHMM vagy YYYYMMDD) -> YYYY-MM-DD HH:MM vagy YYYY-MM-DD (idő nélkül)
function parseDateTimeFromSku(sku) {
    if (!sku) return 'N/A'; const parts = sku.split('-'); if (parts.length < 2) return 'Formátum?'; const potentialDateTimePart = parts[parts.length - 1];
    if (potentialDateTimePart.length === 12 && /^\d+$/.test(potentialDateTimePart)) { const year = potentialDateTimePart.substring(0, 4); const month = potentialDateTimePart.substring(4, 6); const day = potentialDateTimePart.substring(6, 8); const hour = potentialDateTimePart.substring(8, 10); const minute = potentialDateTimePart.substring(10, 12); if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12 && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31 && parseInt(hour, 10) >= 0 && parseInt(hour, 10) <= 23 && parseInt(minute, 10) >= 0 && parseInt(minute, 10) <= 59) { return `${year}-${month}-${day} ${hour}:${minute}`; } }
    if (potentialDateTimePart.length === 8 && /^\d+$/.test(potentialDateTimePart)) { const year = potentialDateTimePart.substring(0, 4); const month = potentialDateTimePart.substring(4, 6); const day = potentialDateTimePart.substring(6, 8); if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12 && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) { return `${year}-${month}-${day} (idő nélkül)`; } }
    console.warn(`Nem sikerült dátumot/időt parseolni az SKU végződésből: '${potentialDateTimePart}' (SKU: '${sku}')`); return 'Ismeretlen';
}

// Formáz datetime-local input értéket (YYYY-MM-DDTHH:MM) -> YYYYMMDDHHMM
function formatDateTimeForSku(dateTimeLocalString) { if (!dateTimeLocalString) return ''; return dateTimeLocalString.replace(/[-T:]/g, '').substring(0, 12); }

// Formátum: YYYY-MM-DD HH:MM -> YYYY-MM-DDTHH:MM (datetime-local inputhoz)
function formatDateTimeForInput(dateTimeString) {
    if (!dateTimeString || dateTimeString.includes('idő nélkül') || dateTimeString === 'Ismeretlen' || dateTimeString === 'N/A') { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0); return `${tomorrow.getFullYear()}-${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}-${tomorrow.getDate().toString().padStart(2, '0')}T${tomorrow.getHours().toString().padStart(2, '0')}:${tomorrow.getMinutes().toString().padStart(2, '0')}`; }
    try { return dateTimeString.replace(' ', 'T'); }
    catch(e) { console.error("Hiba a dátum/idő formázásakor inputhoz:", e); return ""; }
}


// --- Navigation ---
function setActiveView(viewId) { console.log("Aktív nézet beállítása:", viewId); views.forEach(view => { if (view.id === viewId) { view.style.display = 'block'; view.classList.add('active'); } else { view.style.display = 'none'; view.classList.remove('active'); } }); navButtons.forEach(btn => { btn.classList.toggle('active', btn.dataset.view === viewId); }); statusContainer.innerHTML = ''; if (viewId !== 'courses-view' && addCourseForm) { addCourseForm.style.display = 'none'; } if (viewId !== 'templates-view' && templateEditorContainer) { templateEditorContainer.style.display = 'none'; } }
navButtons.forEach(button => { const viewId = button.dataset.view; if (viewId) { button.addEventListener('click', () => setActiveView(viewId)); } else { console.warn("Navigációs gomb hiányzó data-view attribútummal:", button); } });

// --- Settings Logic ---
async function loadSettings() { try { currentSettings = await fetchApi('/api/settings'); apiKeyInput.value = currentSettings.apiKey || ''; baseUrlInput.value = currentSettings.siteBaseUrl || ''; categorySelect.innerHTML = '<option value="">-- Először töltsd be a kategóriákat --</option>'; categorySelect.disabled = true; if (currentSettings.apiKey && currentSettings.siteBaseUrl) { const cL = await handleLoadCategories(true); if (cL && currentSettings.defaultCategoryId && categorySelect.options.length > 1) { categorySelect.value = currentSettings.defaultCategoryId; if (categorySelect.value !== currentSettings.defaultCategoryId) { showGlobalStatus("A mentett alapértelmezett kategória nem található.", 'warning'); currentSettings.defaultCategoryId = ''; categorySelect.value = ''; } } } } catch (e) { showGlobalStatus(`Beállítások betöltése sikertelen: ${e.message}`, 'danger'); } }
async function handleLoadCategories(silent = false) { if (!baseUrlInput.value || !apiKeyInput.value) { if (!silent) showGlobalStatus("Először add meg az Alap URL-t és az API Kulcsot!", 'warning'); return false; } loadCategoriesBtn.disabled = true; loadCategoriesBtn.textContent = 'Betöltés...'; categorySelect.disabled = true; if (!silent) clearStatus(settingsStatus); try { const cats = await fetchApi('/api/categories'); categorySelect.innerHTML = ''; if (!cats || cats.length === 0) { categorySelect.innerHTML = '<option value="">-- Nincs kategória --</option>'; if (!silent) displayStatus(settingsStatus, "Nem található kategória.", 'info'); } else { const p = new Option("-- Válassz kategóriát --", ""); p.disabled = true; p.selected = true; categorySelect.add(p); cats.forEach(c => { if (c.Bvin && c.Name) { categorySelect.add(new Option(c.Name, c.Bvin)); } }); if (currentSettings.defaultCategoryId) { categorySelect.value = currentSettings.defaultCategoryId; if (categorySelect.value === currentSettings.defaultCategoryId) { p.selected = false; } else { if (!silent) showGlobalStatus("Mentett kategória nem található.", "warning"); currentSettings.defaultCategoryId = ''; } } categorySelect.disabled = false; if (!silent) displayStatus(settingsStatus, `Betöltve ${cats.length} kategória.`, 'success'); return true; } } catch (e) { if (!silent) displayStatus(settingsStatus, `Hiba a kategóriák betöltésekor: ${e.message}`, 'danger'); categorySelect.innerHTML = '<option value="">-- Hiba --</option>'; } finally { loadCategoriesBtn.disabled = false; loadCategoriesBtn.textContent = 'Betöltés'; } return false; }
async function handleSaveSettings(event) { event.preventDefault(); clearStatus(settingsStatus); const nS = { apiKey: apiKeyInput.value.trim(), siteBaseUrl: baseUrlInput.value.trim(), defaultCategoryId: categorySelect.value }; if (!nS.apiKey || !nS.siteBaseUrl) { displayStatus(settingsStatus, "API Kulcs és Alap URL kötelező.", 'danger'); return; } if (!nS.defaultCategoryId && categorySelect.options.length > 1) { displayStatus(settingsStatus, "Figyelmeztetés: Nincs kategória kiválasztva.", 'warning'); } try { await fetchApi('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nS) }); currentSettings = nS; displayStatus(settingsStatus, "Beállítások mentve.", 'success');} catch (e) { displayStatus(settingsStatus, `Mentési hiba: ${e.message}`, 'danger'); } }

// --- Course Listing ---
async function handleRefreshCourses() {
    refreshCoursesBtn.disabled = true; refreshCoursesBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Frissítés...'; courseListTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Tanfolyamok betöltése...</td></tr>`;
    if (!currentSettings.defaultCategoryId) { showGlobalStatus("Nincs alapértelmezett kategória beállítva...", 'warning'); courseListTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Kérlek, állíts be kategóriát...</td></tr>`; refreshCoursesBtn.disabled = false; refreshCoursesBtn.textContent = 'Lista Frissítése'; return; }
    try {
        const products = await fetchApi('/api/courses'); courseListTableBody.innerHTML = '';
        if (!products || products.length === 0) { courseListTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Nincsenek tanfolyamok a kategóriában.</td></tr>`; }
        else {
            products.forEach(p => {
                const r = courseListTableBody.insertRow(); r.dataset.bvin = p.Bvin; r.dataset.sku = p.Sku;
                r.insertCell(0).textContent = p.ProductName || 'N/A'; r.insertCell(1).textContent = p.Sku || 'N/A'; r.insertCell(2).textContent = parseDateTimeFromSku(p.Sku);
                const iC = r.insertCell(3); iC.textContent = '...'; iC.classList.add('text-center'); iC.dataset.inventoryLoading = 'true';
                r.insertCell(4).textContent = p.SitePrice != null ? `${p.SitePrice.toLocaleString('hu-HU',{style:'currency',currency:'HUF',minimumFractionDigits:0,maximumFractionDigits:0})}` : 'N/A';
                const aC = r.insertCell(5); const eB = document.createElement('button'); eB.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z"/></svg>'; eB.title = "Tanfolyam szerkesztése"; eB.className = 'btn btn-outline-secondary btn-sm action-button'; eB.onclick = () => openEditCourseModal(p.Bvin, p.Sku, p.ProductName); aC.appendChild(eB);
                const dB = document.createElement('button'); dB.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>'; dB.title = "Tanfolyam törlése"; dB.className = 'btn btn-danger btn-sm action-button'; dB.onclick = () => handleDeleteCourse(p.Bvin, p.Sku, p.ProductName); aC.appendChild(dB);
            });
            fetchInventoryForAllProducts(products);
        }
    } catch (e) { courseListTableBody.innerHTML = `<tr class="text-danger"><td colspan="6" class="text-center">Hiba: ${e.message}</td></tr>`; }
    finally { refreshCoursesBtn.disabled = false; refreshCoursesBtn.textContent = 'Lista Frissítése'; }
}

async function fetchInventoryForAllProducts(products) {
    console.log(`Készletadatok lekérése ${products.length} termékhez...`);
    const promises = products.map(async (p) => { const r = courseListTableBody.querySelector(`tr[data-bvin="${p.Bvin}"]`); const iC = r ? r.cells[3] : null; if (!iC) return; try { const iD = await fetchApi(`/api/inventory/${p.Bvin}`); if (iD && iD.QuantityOnHand !== null && iD.QuantityOnHand !== undefined) { iC.textContent = iD.QuantityOnHand; iC.classList.remove('text-warning','text-danger'); if (iD.Bvin) { iC.dataset.inventoryBvin = iD.Bvin; r.dataset.inventoryBvin = iD.Bvin; } } else { iC.textContent = 'N/A'; iC.classList.add('text-warning'); } } catch (e) { console.error(`Hiba ${p.Bvin} készlet lekérésekor:`, e); iC.textContent = 'Hiba'; iC.classList.add('text-danger'); } finally { delete iC.dataset.inventoryLoading; } });
    await Promise.allSettled(promises); console.log("Készletadat lekérések befejeződtek.");
}

async function handleDeleteCourse(bvin, sku, name) {
    if (!confirm(`Biztosan törlöd?\n\n"${name}" (SKU: ${sku})`)) { return; } showGlobalStatus(`Törlés (${sku})...`, 'info');
    try { await fetchApi(`/api/courses/${bvin}`, { method: 'DELETE' }); showGlobalStatus(`"${sku}" törölve.`, 'success'); const rTR = courseListTableBody.querySelector(`tr[data-bvin="${bvin}"]`); if (rTR) rTR.remove(); if (courseListTableBody.rows.length === 0) { courseListTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nincsenek tanfolyamok.</td></tr>'; } }
    catch (e) { /* Globális hiba már megjelent */ }
}

// --- Add Course Form Logic ---
function showAddForm(show = true) { if (!addCourseForm) return; addCourseForm.style.display = show ? 'block' : 'none'; if (show) { if (templateSelect.options.length <= 1) { populateTemplateSelect(); } clearStatus(addCourseStatus); } }
async function populateTemplateSelect() { if (!availableTemplates || availableTemplates.length === 0) { try { availableTemplates = await fetchApi('/api/templates'); } catch (e) { displayStatus(addCourseStatus, `Sablon betöltési hiba: ${e.message}`, 'danger'); showAddForm(false); return; } } templateSelect.innerHTML = '<option value="" disabled selected>-- Válassz Sablont --</option>'; availableTemplates.forEach(t => { if(t.templateId && t.name) { templateSelect.add(new Option(t.name, t.templateId)); } }); }
async function handleAddCourse(event) { event.preventDefault(); clearStatus(addCourseStatus); const sTId = templateSelect.value; const sDT = startDateInput.value; const iS = parseInt(initialSeatsInput.value, 10); if (!sTId || !sDT || isNaN(iS) || iS < 0) { displayStatus(addCourseStatus, "Hiányos adatok!", 'warning'); return; } const tmpl = availableTemplates.find(t => t.templateId === sTId); if (!tmpl) { displayStatus(addCourseStatus, "Sablon nem található.", 'danger'); return; } if (!currentSettings.defaultCategoryId) { displayStatus(addCourseStatus, "Nincs alap kategória beállítva.", 'danger'); return; } const fDT = formatDateTimeForSku(sDT); const fSku = `${tmpl.baseSku || 'SKU'}-${fDT}`; const fDispDT = sDT.replace('T', ' '); const pName = `${tmpl.name || 'Tanfolyam'} (${fDispDT})`; const pP = { ProductName: pName, Sku: fSku, ShortDescription: tmpl.defaultDescription || '', SitePrice: tmpl.defaultPrice, InventoryMode: tmpl.defaultInventoryMode || 100, IsAvailableForSale: true, Status: 1 }; const iP = { QuantityOnHand: iS, LowStockPoint: Math.max(0, Math.floor(iS * 0.1)), OutOfStockPoint: 0 }; const aP = { CategoryId: currentSettings.defaultCategoryId }; addCourseForm.querySelectorAll('button, input, select').forEach(el => el.disabled = true); displayStatus(addCourseStatus, `Létrehozás (${fSku})...`, 'info'); try { const cRD = { productData: pP, inventoryData: iP, associationData: aP }; const cP = await fetchApi('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cRD) }); showGlobalStatus(`"${cP.ProductName}" létrehozva.`, 'success'); addCourseForm.reset(); showAddForm(false); handleRefreshCourses(); } catch (e) { displayStatus(addCourseStatus, `Létrehozási hiba: ${e.message}`, 'danger'); } finally { addCourseForm.querySelectorAll('button, input, select').forEach(el => el.disabled = false); } }

// --- Edit Course Modal Logic ---
async function openEditCourseModal(productBvin, sku, name) {
    clearStatus(modalStatus); modalCourseName.textContent = name; modalCourseSku.textContent = sku; modalProductBvinInput.value = productBvin; modalQuantityInput.value = ''; modalInventoryBvinInput.value = ''; modalStartDateTimeInput.value = ''; modalPriceInput.value = ''; saveCourseBtn.disabled = true; saveCourseBtn.innerHTML = 'Mentés';
    editCourseModal.show(); displayStatus(modalStatus, "Adatok betöltése...", "info");
    try {
        const productPromise = fetchApi(`/api/products/${productBvin}`); const inventoryPromise = fetchApi(`/api/inventory/${productBvin}`);
        const [productData, inventoryData] = await Promise.all([productPromise, inventoryPromise]);
        if (productData && productData.SitePrice !== undefined) { modalPriceInput.value = productData.SitePrice; const cDT = parseDateTimeFromSku(productData.Sku); modalStartDateTimeInput.value = formatDateTimeForInput(cDT); } else { throw new Error("Termékadatok lekérése sikertelen."); }
        if (inventoryData && inventoryData.QuantityOnHand !== null && inventoryData.QuantityOnHand !== undefined && inventoryData.Bvin) { modalQuantityInput.value = inventoryData.QuantityOnHand; modalInventoryBvinInput.value = inventoryData.Bvin; } else { throw new Error("Készletadatok lekérése sikertelen."); }
        clearStatus(modalStatus); saveCourseBtn.disabled = false;
    } catch (e) { displayStatus(modalStatus, `Betöltési hiba: ${e.message}`, 'danger'); }
}

async function handleSaveCourse() {
    const pBvin = modalProductBvinInput.value; const iBvin = modalInventoryBvinInput.value; const nQty = parseInt(modalQuantityInput.value, 10); const nPrice = parseFloat(modalPriceInput.value); const nSDT = modalStartDateTimeInput.value;
    if (!pBvin) { displayStatus(modalStatus, "Termék azonosító hiba.", "danger"); return; } if (isNaN(nQty) || nQty < 0) { displayStatus(modalStatus, "Érvénytelen férőhely.", "warning"); return; } if (isNaN(nPrice) || nPrice < 0) { displayStatus(modalStatus, "Érvénytelen ár.", "warning"); return; } if (!nSDT) { displayStatus(modalStatus, "Időpont kötelező.", "warning"); return; } if (!iBvin) { displayStatus(modalStatus, "Készlet azonosító hiba.", "danger"); return; }
    saveCourseBtn.disabled = true; saveCourseBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mentés...'; clearStatus(modalStatus);
    let invUpdSuc = false; let prdUpdSuc = false;
    try {
        console.log(`Készlet frissítése: ${iBvin} -> ${nQty}`); await fetchApi(`/api/inventory/${iBvin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ QuantityOnHand: nQty }) }); invUpdSuc = true; console.log("Készlet frissítve.");
        console.log(`Termék frissítése: ${pBvin} -> Ár: ${nPrice}, Idő: ${nSDT}`); await fetchApi(`/api/products/${pBvin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ SitePrice: nPrice, StartDateTime: nSDT }) }); prdUpdSuc = true; console.log("Termék frissítve.");
        displayStatus(modalStatus, "Változtatások mentve!", "success"); showGlobalStatus(`"${modalCourseName.textContent}" adatai frissítve.`, 'success');
        handleRefreshCourses(); // Teljes lista újratöltése
        setTimeout(() => { editCourseModal.hide(); }, 1500);
    } catch (e) { displayStatus(modalStatus, `Mentési hiba: ${e.message}`, 'danger'); if (invUpdSuc && !prdUpdSuc) { showGlobalStatus("Figyelem: Készlet frissült, termékadatok nem!", "warning"); } else if (!invUpdSuc && prdUpdSuc) { showGlobalStatus("Figyelem: Termékadatok frissültek, készlet nem!", "warning"); } }
    finally { saveCourseBtn.disabled = false; saveCourseBtn.textContent = 'Változtatások Mentése'; }
}

// --- Template Listing & Editing ---
async function handleRefreshTemplates() { refreshTemplatesBtn.disabled = true; refreshTemplatesBtn.textContent = 'Frissítés...'; templateList.innerHTML = '<li class="list-group-item">Betöltés...</li>'; clearStatus(templatesStatus); templateEditorContainer.style.display = 'none'; try { availableTemplates = await fetchApi('/api/templates'); currentTemplatesString = JSON.stringify(availableTemplates, null, 2); templateList.innerHTML = ''; if (!availableTemplates || availableTemplates.length === 0) { templateList.innerHTML = '<li class="list-group-item">Nincs sablon a templates.json-ben.</li>'; } else { availableTemplates.forEach(t => { const li = document.createElement('li'); li.className = 'list-group-item'; li.innerHTML = `<strong>${t.name||'Névtelen'}</strong> (ID: ${t.templateId})<br><small>Alap SKU: ${t.baseSku||'N/A'} | Ár: ${t.defaultPrice!=null?`${t.defaultPrice.toLocaleString('hu-HU',{style:'currency',currency:'HUF',minimumFractionDigits:0,maximumFractionDigits:0})}`:'N/A'} | Időtartam: ${t.durationHours||'N/A'} óra</small>`; templateList.appendChild(li); }); displayStatus(templatesStatus, `Megjelenítve ${availableTemplates.length} sablon.`, 'success'); } populateTemplateSelect(); } catch (e) { templateList.innerHTML = `<li class="list-group-item text-danger">Sablon betöltési hiba: ${e.message}</li>`; displayStatus(templatesStatus, `Sablon betöltési hiba: ${e.message}`, 'danger'); } finally { refreshTemplatesBtn.disabled = false; refreshTemplatesBtn.textContent = 'Lista Frissítése'; } }
function handleEditTemplates() { templateJsonEditor.value = currentTemplatesString; templateEditorContainer.style.display = 'block'; clearStatus(templateEditorStatus); editTemplatesBtn.disabled = true; refreshTemplatesBtn.disabled = true; }
function handleCancelEditTemplates() { templateEditorContainer.style.display = 'none'; clearStatus(templateEditorStatus); editTemplatesBtn.disabled = false; refreshTemplatesBtn.disabled = false; }
async function handleSaveTemplates() { const uTS = templateJsonEditor.value; clearStatus(templateEditorStatus); saveTemplatesBtn.disabled = true; saveTemplatesBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mentés...'; try { JSON.parse(uTS); await fetchApi('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templates: uTS }) }); displayStatus(templateEditorStatus, "Sablonok mentve!", "success"); showGlobalStatus("Sablonok elmentve.", "success"); currentTemplatesString = uTS; handleCancelEditTemplates(); await handleRefreshTemplates(); } catch (e) { if (e instanceof SyntaxError) { displayStatus(templateEditorStatus, `JSON Formátum Hiba: ${e.message}`, "danger"); } else { displayStatus(templateEditorStatus, `Mentési hiba: ${e.message}`, "danger"); } } finally { saveTemplatesBtn.disabled = false; saveTemplatesBtn.textContent = 'Mentés'; } }

// --- Event Listeners Setup ---
function setupEventListeners() {
    settingsForm.addEventListener('submit', handleSaveSettings); loadCategoriesBtn.addEventListener('click', () => handleLoadCategories(false));
    refreshCoursesBtn.addEventListener('click', handleRefreshCourses); showAddCourseFormBtn.addEventListener('click', () => showAddForm(true)); addCourseForm.addEventListener('submit', handleAddCourse); cancelAddCourseBtn.addEventListener('click', () => showAddForm(false));
    refreshTemplatesBtn.addEventListener('click', handleRefreshTemplates); editTemplatesBtn.addEventListener('click', handleEditTemplates); saveTemplatesBtn.addEventListener('click', handleSaveTemplates); cancelEditTemplatesBtn.addEventListener('click', handleCancelEditTemplates);
    saveCourseBtn.addEventListener('click', handleSaveCourse); // Mentés gomb a modalban
}

// --- Initialization ---
async function initialize() {
    console.log("App Initializing...");
    setupEventListeners(); setActiveView('courses-view');
    try { await loadSettings(); await handleRefreshCourses(); await handleRefreshTemplates(); }
    catch (initError) { console.error("Initialization error:", initError); showGlobalStatus("Alkalmazás indítási hiba.", "danger"); }
    if (!currentSettings.defaultCategoryId) { showGlobalStatus("Üdv! Állítsd be az API adatokat és a kategóriát a Beállításokban.", 'info'); }
    console.log("App Initialized.");
}

// --- Run Initialization ---
document.addEventListener('DOMContentLoaded', initialize);