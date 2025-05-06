// --- Template Visual Editor Functions ---

// State for visual template editor
let templatesData = []; // Array of template objects
let currentEditingTemplateId = null; // ID of currently editing template

// Initialize the visual template editor
function initVisualTemplateEditor() {
    const visualEditor = document.getElementById('visual-template-editor');
    const addTemplateBtn = document.getElementById('add-template-btn');

    // Hide the visual editor initially if it exists
    if (visualEditor) visualEditor.style.display = 'none';

    // Setup event listeners if elements exist
    if (addTemplateBtn) addTemplateBtn.addEventListener('click', addNewTemplate);

    // Make functions globally accessible on window object (as per original pattern)
    window.showVisualTemplateEditor = showVisualTemplateEditor;
    window.hideVisualTemplateEditor = hideVisualTemplateEditor;
    window.clearTemplateEditForm = clearTemplateEditForm; // Expose clear form for button onclick
}

// Show visual template editor with current templates
function showVisualTemplateEditor() {
    // Set templatesData from the available templates (deep copy)
    templatesData = JSON.parse(JSON.stringify(window.availableTemplates || []));

    const visualEditorEl = document.getElementById('visual-template-editor');
    const rawEditorEl = document.getElementById('template-editor-container');

    if (visualEditorEl) visualEditorEl.style.display = 'block';
    if (rawEditorEl) rawEditorEl.style.display = 'none';

    refreshVisualTemplateList();
    clearStatus(document.getElementById('visual-editor-status'));


    // Update buttons state
    const editBtn = document.getElementById('edit-templates-btn');
    const visualEditBtn = document.getElementById('edit-templates-visual-btn');
    const refreshBtn = document.getElementById('refresh-templates-btn');

    if (editBtn) editBtn.disabled = true;
    if (visualEditBtn) visualEditBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;

    if (visualEditorEl) visualEditorEl.scrollIntoView({ behavior: 'smooth' });
}

// Hide visual template editor
function hideVisualTemplateEditor() {
    const visualEditorEl = document.getElementById('visual-template-editor');
    if (visualEditorEl) visualEditorEl.style.display = 'none';

    const editBtn = document.getElementById('edit-templates-btn');
    const visualEditBtn = document.getElementById('edit-templates-visual-btn');
    const refreshBtn = document.getElementById('refresh-templates-btn');

    if (editBtn) editBtn.disabled = false;
    if (visualEditBtn) visualEditBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;

    clearTemplateEditForm();
    clearStatus(document.getElementById('visual-editor-status'));
}

// Refresh the visual list of templates
function refreshVisualTemplateList() {
    const templateListEl = document.getElementById('visual-template-list');
    if (!templateListEl) return;
    templateListEl.innerHTML = '';

    if (!templatesData || templatesData.length === 0) {
        templateListEl.innerHTML = '<div class="alert alert-info">Nincsenek sablonok. Kattints az "Új Sablon" gombra a létrehozáshoz.</div>';
        return;
    }

    templatesData.forEach((template, index) => {
        const card = document.createElement('div');
        card.className = 'card mb-3 shadow-sm'; // Added shadow-sm for depth
        card.dataset.templateId = template.templateId;

        card.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">${escapeHtml(template.name || 'Névtelen sablon')}</h5>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-template-btn action-button" data-index="${index}" title="Szerkesztés">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-template-btn action-button" data-index="${index}" title="Törlés">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="row mb-2">
          <div class="col-md-6">
            <p class="mb-1"><strong>Sablon azonosító:</strong> ${escapeHtml(template.templateId || '')}</p>
            <p class="mb-1"><strong>Alap SKU:</strong> ${escapeHtml(template.baseSku || '')}</p>
          </div>
          <div class="col-md-6">
            <p class="mb-1"><strong>Időtartam:</strong> ${template.durationHours || 'N/A'} óra</p>
            <p class="mb-1"><strong>Alapár:</strong> ${template.defaultPrice != null ? template.defaultPrice.toLocaleString('hu-HU', {style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0}) : 'N/A'}</p>
          </div>
        </div>
        <p class="mb-0 text-muted"><small><strong>Leírás:</strong> ${escapeHtml(template.defaultDescription || 'Nincs leírás.')}</small></p>
      </div>
    `;

        templateListEl.appendChild(card);

        card.querySelector('.edit-template-btn').addEventListener('click', () => editTemplate(index));
        card.querySelector('.delete-template-btn').addEventListener('click', () => deleteTemplate(index));
    });
}

// Add a new template
function addNewTemplate() {
    const newTemplate = {
        templateId: generateTemplateId(),
        name: "Új tanfolyam sablon",
        baseSku: "TANF-UJ-SABLON",
        durationHours: 4,
        defaultDescription: "Új tanfolyam sablon leírása.",
        defaultPrice: 19990,
        defaultInventoryMode: 100
    };

    templatesData.push(newTemplate);
    refreshVisualTemplateList();
    editTemplate(templatesData.length - 1); // Edit the newly added template
    displayStatus(document.getElementById('visual-editor-status'), "Új sablon űrlap előkészítve. Kérjük, töltse ki és mentse.", 'info');
}

// Generate a unique template ID
function generateTemplateId() {
    const prefix = "TPL-";
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const timestamp = Date.now().toString().slice(-4); // Shorter timestamp part
    return `${prefix}${randomPart}-${timestamp}`;
}

// Edit an existing template
function editTemplate(index) {
    const template = templatesData[index];
    if (!template) return;
    currentEditingTemplateId = template.templateId;

    document.getElementById('template-form-id').value = template.templateId || '';
    document.getElementById('template-form-name').value = template.name || '';
    document.getElementById('template-form-sku').value = template.baseSku || '';
    document.getElementById('template-form-duration').value = template.durationHours || '';
    document.getElementById('template-form-description').value = template.defaultDescription || '';
    document.getElementById('template-form-price').value = template.defaultPrice || '';
    document.getElementById('template-form-inventory-mode').value = template.defaultInventoryMode || 100;

    const formWrapper = document.getElementById('template-edit-form-wrapper');
    if (formWrapper) {
        formWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        formWrapper.classList.add('highlight-form');
        setTimeout(() => {
            formWrapper.classList.remove('highlight-form');
        }, 1000);
    }
    displayStatus(document.getElementById('visual-editor-status'), `"${template.name}" sablon szerkesztése.`, 'info');
}

// Delete a template
function deleteTemplate(index) {
    const templateName = templatesData[index] ? templatesData[index].name : "ismeretlen";
    if (!confirm(`Biztosan törölni szeretnéd a(z) "${templateName}" sablont?`)) {
        return;
    }

    templatesData.splice(index, 1);
    refreshVisualTemplateList();
    if (currentEditingTemplateId === (templatesData[index] && templatesData[index].templateId)) { // If deleted template was being edited
        clearTemplateEditForm();
    }
    displayStatus(document.getElementById('visual-editor-status'), `"${templateName}" sablon törölve.`, 'success');
}

// Clear the template edit form
function clearTemplateEditForm() {
    const form = document.getElementById('template-edit-form-inner'); // Target inner form for reset
    if (form) form.reset(); // Use form.reset() for native fields, then manually clear others if needed

    document.getElementById('template-form-id').value = ''; // Ensure ID is cleared
    document.getElementById('template-form-duration').value = '4'; // Reset to default
    document.getElementById('template-form-price').value = '29990'; // Reset to default
    document.getElementById('template-form-inventory-mode').value = 100; // Reset to default

    currentEditingTemplateId = null;
    clearStatus(document.getElementById('visual-editor-status'));
}

// Save template from form
function saveTemplateForm(event) {
    event.preventDefault();
    const visualEditorStatusEl = document.getElementById('visual-editor-status');

    const formId = document.getElementById('template-form-id').value.trim();
    const formName = document.getElementById('template-form-name').value.trim();
    const formSku = document.getElementById('template-form-sku').value.trim();
    const formDuration = parseInt(document.getElementById('template-form-duration').value) || 0;
    const formDescription = document.getElementById('template-form-description').value.trim();
    const formPrice = parseFloat(document.getElementById('template-form-price').value) || 0;
    const formInventoryMode = parseInt(document.getElementById('template-form-inventory-mode').value) || 100;

    if (!formId || !formName || !formSku) {
        displayStatus(visualEditorStatusEl, "Azonosító, név és alap SKU kitöltése kötelező!", 'danger');
        return;
    }

    const existingIndex = templatesData.findIndex(t => t.templateId === currentEditingTemplateId);
    const idIsBeingChanged = currentEditingTemplateId && currentEditingTemplateId !== formId;

    // Check if new ID is unique (if ID changed or it's a new template)
    if (idIsBeingChanged || existingIndex === -1) {
        const idExists = templatesData.some(t => t.templateId === formId);
        if (idExists) {
            displayStatus(visualEditorStatusEl, "Ez a sablon azonosító már használatban van!", 'danger');
            return;
        }
    }

    const updatedTemplate = {
        templateId: formId,
        name: formName,
        baseSku: formSku,
        durationHours: formDuration,
        defaultDescription: formDescription,
        defaultPrice: formPrice,
        defaultInventoryMode: formInventoryMode
    };

    if (existingIndex !== -1) { // Editing existing
        templatesData[existingIndex] = updatedTemplate;
        displayStatus(visualEditorStatusEl, `"${formName}" sablon frissítve. Ne felejtsd el menteni az összes változást!`, 'success');
    } else { // Adding new
        templatesData.push(updatedTemplate);
        displayStatus(visualEditorStatusEl, `"${formName}" új sablon hozzáadva a listához. Ne felejtsd el menteni az összes változást!`, 'success');
    }

    refreshVisualTemplateList();
    clearTemplateEditForm();
}

// Save all templates from visual editor
async function saveAllTemplates() {
    const visualEditorStatusEl = document.getElementById('visual-editor-status');
    const saveBtn = document.getElementById('save-visual-templates-btn');

    try {
        if (!templatesData || !Array.isArray(templatesData)) { // templatesData can be empty array, that's fine
            displayStatus(visualEditorStatusEl, "Nincsenek menthető sablonok.", 'warning');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mentés...';
        }

        const templatesString = JSON.stringify(templatesData, null, 2);

        // Using global fetchApi and showGlobalStatus from app.js
        await window.fetchApi('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates: templatesString })
        });

        displayStatus(visualEditorStatusEl, "Sablonok sikeresen mentve a szerverre!", 'success');
        window.showGlobalStatus("Sablonok sikeresen frissítve a szerveren.", 'success');

        window.currentTemplatesString = templatesString;
        window.availableTemplates = JSON.parse(JSON.stringify(templatesData));

        hideVisualTemplateEditor();

        // Refresh the template list in the main view (app.js)
        if (typeof window.handleRefreshTemplates === 'function') {
            await window.handleRefreshTemplates();
        }

    } catch (error) {
        displayStatus(visualEditorStatusEl, `Hiba a sablonok mentése során: ${error.message}`, 'danger');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Összes Sablon Mentése';
        }
    }
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str) // Ensure str is a string
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, "'");
}

// Initialize the visual editor when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check if the main container for visual editor exists before initializing
    if (document.getElementById('visual-template-editor')) {
        initVisualTemplateEditor();
    }
});


// This function will be called by the modified app.js setupEventListeners
function setupVisualEditorEventListeners() {
    const editTemplatesVisualBtn = document.getElementById('edit-templates-visual-btn');
    if (editTemplatesVisualBtn) {
        editTemplatesVisualBtn.addEventListener('click', showVisualTemplateEditor);
    }

    // Changed form ID in HTML to 'template-edit-form-inner'
    const templateFormInner = document.getElementById('template-edit-form-inner');
    if (templateFormInner) {
        templateFormInner.addEventListener('submit', saveTemplateForm);
    }

    const saveAllTemplatesBtn = document.getElementById('save-visual-templates-btn');
    if (saveAllTemplatesBtn) {
        saveAllTemplatesBtn.addEventListener('click', saveAllTemplates);
    }

    const cancelVisualEditorBtn = document.getElementById('cancel-visual-editor-btn');
    if (cancelVisualEditorBtn) {
        cancelVisualEditorBtn.addEventListener('click', hideVisualTemplateEditor);
    }
}
// The modification to app.js's setupEventListeners is done in app.js itself to call this.