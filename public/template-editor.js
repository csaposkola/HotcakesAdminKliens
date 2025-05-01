// --- Template Visual Editor Functions ---

// State for visual template editor
let templatesData = []; // Array of template objects
let currentEditingTemplateId = null; // ID of currently editing template

// Initialize the visual template editor
function initVisualTemplateEditor() {
    const visualEditor = document.getElementById('visual-template-editor');
    const templateList = document.getElementById('visual-template-list');
    const addTemplateBtn = document.getElementById('add-template-btn');

    // Hide the visual editor initially
    visualEditor.style.display = 'none';

    // Setup event listeners
    addTemplateBtn.addEventListener('click', addNewTemplate);

    // Add these functions to be accessible from existing code
    window.showVisualTemplateEditor = showVisualTemplateEditor;
    window.hideVisualTemplateEditor = hideVisualTemplateEditor;
}

// Show visual template editor with current templates
function showVisualTemplateEditor() {
    // Set templatesData from the available templates
    templatesData = JSON.parse(JSON.stringify(availableTemplates || []));

    // Show visual editor, hide raw editor
    document.getElementById('visual-template-editor').style.display = 'block';
    document.getElementById('template-editor-container').style.display = 'none';

    // Refresh the template list
    refreshVisualTemplateList();

    // Update buttons state
    document.getElementById('edit-templates-btn').disabled = true;
    document.getElementById('edit-templates-visual-btn').disabled = true;
    document.getElementById('refresh-templates-btn').disabled = true;
}

// Hide visual template editor
function hideVisualTemplateEditor() {
    document.getElementById('visual-template-editor').style.display = 'none';
    document.getElementById('edit-templates-btn').disabled = false;
    document.getElementById('edit-templates-visual-btn').disabled = false;
    document.getElementById('refresh-templates-btn').disabled = false;

    // Clear edit form
    clearTemplateEditForm();
}

// Refresh the visual list of templates
function refreshVisualTemplateList() {
    const templateList = document.getElementById('visual-template-list');
    templateList.innerHTML = '';

    if (!templatesData || templatesData.length === 0) {
        templateList.innerHTML = '<div class="alert alert-info">Nincsenek sablonok. Kattints a "Új Sablon" gombra a létrehozáshoz.</div>';
        return;
    }

    templatesData.forEach((template, index) => {
        const card = document.createElement('div');
        card.className = 'card mb-3';
        card.dataset.templateId = template.templateId;

        card.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">${escapeHtml(template.name || 'Névtelen sablon')}</h5>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-template-btn" data-index="${index}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16">
              <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/>
              <path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/>
            </svg>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-template-btn" data-index="${index}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
              <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="row mb-2">
          <div class="col-md-6">
            <p><strong>Sablon azonosító:</strong> ${escapeHtml(template.templateId || '')}</p>
            <p><strong>Alap SKU:</strong> ${escapeHtml(template.baseSku || '')}</p>
          </div>
          <div class="col-md-6">
            <p><strong>Időtartam:</strong> ${template.durationHours || 'N/A'} óra</p>
            <p><strong>Alapár:</strong> ${template.defaultPrice != null ? template.defaultPrice.toLocaleString('hu-HU', {style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0}) : 'N/A'}</p>
          </div>
        </div>
        <p><strong>Leírás:</strong> ${escapeHtml(template.defaultDescription || '')}</p>
      </div>
    `;

        templateList.appendChild(card);

        // Add event listeners to the buttons
        card.querySelector('.edit-template-btn').addEventListener('click', () => editTemplate(index));
        card.querySelector('.delete-template-btn').addEventListener('click', () => deleteTemplate(index));
    });
}

// Add a new template
function addNewTemplate() {
    // Create a new template with default values
    const newTemplate = {
        templateId: generateTemplateId(),
        name: "Új tanfolyam",
        baseSku: "TANF-UJ",
        durationHours: 4,
        defaultDescription: "Új tanfolyam leírása",
        defaultPrice: 29990,
        defaultInventoryMode: 100
    };

    // Add to the templates array
    templatesData.push(newTemplate);

    // Refresh the list and edit the new template
    refreshVisualTemplateList();
    editTemplate(templatesData.length - 1);
}

// Generate a unique template ID
function generateTemplateId() {
    const prefix = "TPL-";
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const timestamp = Date.now().toString().substring(9, 13);
    return `${prefix}${randomPart}-${timestamp}`;
}

// Edit an existing template
function editTemplate(index) {
    // Get the template
    const template = templatesData[index];
    currentEditingTemplateId = template.templateId;

    // Fill the form
    document.getElementById('template-form-id').value = template.templateId || '';
    document.getElementById('template-form-name').value = template.name || '';
    document.getElementById('template-form-sku').value = template.baseSku || '';
    document.getElementById('template-form-duration').value = template.durationHours || '';
    document.getElementById('template-form-description').value = template.defaultDescription || '';
    document.getElementById('template-form-price').value = template.defaultPrice || '';
    document.getElementById('template-form-inventory-mode').value = template.defaultInventoryMode || 100;

    // Scroll to the form and highlight it
    document.getElementById('template-edit-form').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('template-edit-form').classList.add('highlight-form');
    setTimeout(() => {
        document.getElementById('template-edit-form').classList.remove('highlight-form');
    }, 1000);
}

// Delete a template
function deleteTemplate(index) {
    if (!confirm(`Biztosan törölni szeretnéd a(z) "${templatesData[index].name}" sablont?`)) {
        return;
    }

    // Remove the template
    templatesData.splice(index, 1);

    // Refresh the list
    refreshVisualTemplateList();
    clearTemplateEditForm();

    // Show confirmation
    displayStatus(document.getElementById('visual-editor-status'), "Sablon törölve.", 'success');
}

// Clear the template edit form
function clearTemplateEditForm() {
    document.getElementById('template-form-id').value = '';
    document.getElementById('template-form-name').value = '';
    document.getElementById('template-form-sku').value = '';
    document.getElementById('template-form-duration').value = '';
    document.getElementById('template-form-description').value = '';
    document.getElementById('template-form-price').value = '';
    document.getElementById('template-form-inventory-mode').value = 100;
    currentEditingTemplateId = null;
}

// Save template from form
function saveTemplateForm(event) {
    event.preventDefault();

    // Get form values
    const formId = document.getElementById('template-form-id').value.trim();
    const formName = document.getElementById('template-form-name').value.trim();
    const formSku = document.getElementById('template-form-sku').value.trim();
    const formDuration = parseInt(document.getElementById('template-form-duration').value) || 0;
    const formDescription = document.getElementById('template-form-description').value.trim();
    const formPrice = parseFloat(document.getElementById('template-form-price').value) || 0;
    const formInventoryMode = parseInt(document.getElementById('template-form-inventory-mode').value) || 100;

    // Validate
    if (!formId || !formName || !formSku) {
        displayStatus(document.getElementById('visual-editor-status'), "Azonosító, név és alap SKU kitöltése kötelező!", 'danger');
        return;
    }

// Find if we're editing an existing template or adding a new one
    const existingIndex = templatesData.findIndex(t => t.templateId === currentEditingTemplateId);

    // Check if ID is unique when adding a new template
    const idExists = templatesData.some((t, i) => t.templateId === formId && i !== existingIndex);
    if (idExists) {
        displayStatus(document.getElementById('visual-editor-status'), "Ez a sablon azonosító már használatban van!", 'danger');
        return;
    }

    // Create the updated template object
    const updatedTemplate = {
        templateId: formId,
        name: formName,
        baseSku: formSku,
        durationHours: formDuration,
        defaultDescription: formDescription,
        defaultPrice: formPrice,
        defaultInventoryMode: formInventoryMode
    };

    // Update or add the template
    if (existingIndex !== -1) {
        templatesData[existingIndex] = updatedTemplate;
        displayStatus(document.getElementById('visual-editor-status'), "Sablon frissítve.", 'success');
    } else {
        templatesData.push(updatedTemplate);
        displayStatus(document.getElementById('visual-editor-status'), "Új sablon hozzáadva.", 'success');
    }

    // Refresh the list
    refreshVisualTemplateList();
    clearTemplateEditForm();
}

// Save all templates from visual editor
async function saveAllTemplates() {
    try {
        // Validate templates
        if (!templatesData || !Array.isArray(templatesData) || templatesData.length === 0) {
            displayStatus(document.getElementById('visual-editor-status'), "Nincsenek menthető sablonok.", 'warning');
            return;
        }

        // Disable the save button and show loading
        const saveBtn = document.getElementById('save-visual-templates-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mentés...';

        // Prepare the templates string
        const templatesString = JSON.stringify(templatesData, null, 2);

        // Send to server
        await fetchApi('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates: templatesString })
        });

        // Success
        displayStatus(document.getElementById('visual-editor-status'), "Sablonok sikeresen mentve!", 'success');
        showGlobalStatus("Sablonok sikeresen frissítve.", 'success');

        // Update the currentTemplatesString and availableTemplates
        currentTemplatesString = templatesString;
        availableTemplates = JSON.parse(JSON.stringify(templatesData));

        // Hide the visual editor
        hideVisualTemplateEditor();

        // Refresh the template list in the main view
        handleRefreshTemplates();
    } catch (error) {
        displayStatus(document.getElementById('visual-editor-status'), `Hiba a mentés során: ${error.message}`, 'danger');
    } finally {
        // Re-enable the save button
        const saveBtn = document.getElementById('save-visual-templates-btn');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Összes Sablon Mentése';
    }
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize the visual editor when the page loads
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('visual-template-editor')) {
        initVisualTemplateEditor();
    }
});

// Update event listeners in the main code to include visual editor
function setupVisualEditorEventListeners() {
    // Add the visual editor button event listener
    const editTemplatesVisualBtn = document.getElementById('edit-templates-visual-btn');
    if (editTemplatesVisualBtn) {
        editTemplatesVisualBtn.addEventListener('click', showVisualTemplateEditor);
    }

    // Add template form submit event listener
    const templateForm = document.getElementById('template-edit-form');
    if (templateForm) {
        templateForm.addEventListener('submit', saveTemplateForm);
    }

    // Add save all templates button event listener
    const saveAllTemplatesBtn = document.getElementById('save-visual-templates-btn');
    if (saveAllTemplatesBtn) {
        saveAllTemplatesBtn.addEventListener('click', saveAllTemplates);
    }

    // Add cancel button event listener
    const cancelVisualEditorBtn = document.getElementById('cancel-visual-editor-btn');
    if (cancelVisualEditorBtn) {
        cancelVisualEditorBtn.addEventListener('click', hideVisualTemplateEditor);
    }
}

// Update the setupEventListeners function to include our new listeners
const originalSetupEventListeners = setupEventListeners;
setupEventListeners = function() {
    originalSetupEventListeners();
    setupVisualEditorEventListeners();
};