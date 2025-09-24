// Import default categories and selectors from content.js
// Default categories structure
const DEFAULT_CATEGORIES = {
  'Imaging': {
    'Neuro': {},
    'Chest': {},
    'Abdomen': {},
    'MSK': {}
  },
  'Labs': {
    'Urgent': {},
    'Routine': {}
  },
  'Medications': {
    'Common': {},
    'Emergency': {}
  }
};

const DEFAULT_SELECTORS = {
  selectors: {
    ordersMenuBtn:    'button#orders',
    newOrderBtn:      'button#new-order',
    orderSearchInput: 'input[name="order-search"]',
    orderTextDropdown:'select#order-text',
    roomInput:        'input[name="room"]',
    emergencyCheckbox:'input[name="emergency"]',
    submitBtn:        'button[type="submit"].order-submit',
    modalRoot:        '#order-modal'
  },
  xpaths: {
    orderSearchItemContains: 'li'
  }
};

const DEFAULT_SELECTOR_KEYS = Object.keys(DEFAULT_SELECTORS.selectors);
const DEFAULT_XPATH_KEYS = Object.keys(DEFAULT_SELECTORS.xpaths);
const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

let selectorKeys = [...DEFAULT_SELECTOR_KEYS];
let xpathKeys = [...DEFAULT_XPATH_KEYS];
let selectorKeySet = new Set(selectorKeys);
let xpathKeySet = new Set(xpathKeys);
let currentSelectors = { ...DEFAULT_SELECTORS.selectors };
let currentXpaths = { ...DEFAULT_SELECTORS.xpaths };

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}




// Category management
let categories = {};
let selectedCategory = null;

function renderCategoryTree() {
  console.log('Rendering category tree, categories:', categories); // Debug log
  const treeEl = document.getElementById('categoryTree');
  treeEl.innerHTML = '';
  
  function renderNode(path, node, level = 0) {
    const div = document.createElement('div');
    div.className = 'tree-item' + (path === selectedCategory ? ' selected' : '');
    if (level > 0) div.classList.add('tree-item-indent');
    
    div.textContent = path.split('/').pop();
    div.dataset.path = path;
    
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCategory(path);
    });
    
    treeEl.appendChild(div);
    
    Object.keys(node).sort().forEach(key => {
      renderNode(path ? `${path}/${key}` : key, node[key], level + 1);
    });
  }
  
  Object.keys(categories).sort().forEach(key => {
    renderNode(key, categories[key]);
  });
  
  updateCategoryButtons();
}

function selectCategory(path) {
  const oldSelected = document.querySelector('.tree-item.selected');
  if (oldSelected) oldSelected.classList.remove('selected');
  
  if (path) {
    const newSelected = document.querySelector(`.tree-item[data-path="${path}"]`);
    if (newSelected) newSelected.classList.add('selected');
  }
  
  selectedCategory = path;
  updateCategoryEditor();
  updateCategoryButtons();
}

function updateCategoryEditor() {
  const nameEl = document.getElementById('categoryName');
  const pathEl = document.getElementById('categoryPath');
  const orderEl = document.getElementById('categoryOrder');
  
  if (!selectedCategory) {
    nameEl.value = '';
    pathEl.value = '';
    orderEl.value = '';
    nameEl.disabled = true;
    orderEl.disabled = true;
    return;
  }
  
  nameEl.disabled = false;
  orderEl.disabled = false;
  
  const parts = selectedCategory.split('/');
  nameEl.value = parts[parts.length - 1];
  pathEl.value = selectedCategory;
  // TODO: Implement order
  orderEl.value = '0';
}

const DEFAULT_RECIPES = [
  {
    id: 'ct_head_stroke',
    label: 'Galvos KT – insultas',
    category: 'Neurologija',
    config: { searchTerm: 'Galvos KT', dropdownText: 'Insulto protokolas galvos KT (be kontrasto)', emergency: true, room: '12' }
  },
];

const selEl = document.getElementById('selectors');
const xpEl  = document.getElementById('xpaths');
const recEl = document.getElementById('recipes');
const status = document.getElementById('status');
const customCssContainer = document.getElementById('customCssSelectors');
const customXpathContainer = document.getElementById('customXpathSelectors');
const addCustomCssButton = document.getElementById('addCustomCssSelector');
const addCustomXpathButton = document.getElementById('addCustomXpathSelector');
const defaultSelectorChips = document.getElementById('defaultSelectorChips');
const defaultXpathChips = document.getElementById('defaultXpathChips');
const themeToggle = document.getElementById('themeToggle');
const snackbar = document.getElementById('snackbar');
const searchInput = document.getElementById('recipeSearch');
const categoryFilter = document.getElementById('categoryFilter');
const recipesList = document.getElementById('recipesList');

let snackbarTimer = null;

function applyTheme(theme = 'light') {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', normalized);
  if (themeToggle) {
    themeToggle.checked = normalized === 'dark';
  }
}

function loadThemePreference() {
  try {
    chrome.storage.sync.get(['ehrqo_theme'], (data) => {
      if (data && data.ehrqo_theme) {
        applyTheme(data.ehrqo_theme);
      } else {
        applyTheme('light');
      }
    });
  } catch (error) {
    applyTheme('light');
  }
}

function showSnackbar(message, type = 'info', persistent = false) {
  if (!snackbar || !message) {
    return;
  }
  snackbar.textContent = message;
  snackbar.dataset.type = type;
  snackbar.classList.add('visible');
  clearTimeout(snackbarTimer);
  if (!persistent) {
    snackbarTimer = setTimeout(() => {
      snackbar.classList.remove('visible');
    }, 3200);
  }
}

function clearSnackbar() {
  if (snackbar) {
    snackbar.classList.remove('visible');
  }
  clearTimeout(snackbarTimer);
}

function setStatus(message, type = 'info', persistent = false) {
  if (status) {
    status.textContent = message || '';
  }
  if (!message) {
    clearSnackbar();
    return;
  }
  showSnackbar(message, type, persistent);
  if (!persistent && status) {
    const snapshot = message;
    setTimeout(() => {
      if (status.textContent === snapshot) {
        setStatus('');
      }
    }, 2800);
  }
}

if (addCustomCssButton) {
  addCustomCssButton.addEventListener('click', () => handleAddCustomSelector('css'));
}

if (addCustomXpathButton) {
  addCustomXpathButton.addEventListener('click', () => handleAddCustomSelector('xpath'));
}

if (themeToggle) {
  themeToggle.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    applyTheme(theme);
    try {
      chrome.storage.sync.set({ ehrqo_theme: theme });
    } catch (error) {
      // ignore storage errors in environments without chrome
    }
    setStatus(`${theme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'info');
  });
}

loadThemePreference();
function renderSelectorChipList(container, keys, source) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  keys.forEach((key) => {
    const value = source[key];
    const configured = typeof value === 'string' && value.trim().length > 0;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'selector-chip ' + (configured ? 'chip-configured' : 'chip-missing');
    const keySpan = document.createElement('span');
    keySpan.className = 'chip-key';
    keySpan.textContent = key;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'chip-status';
    statusSpan.textContent = configured ? 'configured' : 'missing';
    chip.append(keySpan, statusSpan);
    chip.title = configured ? value : 'Not configured';
    chip.addEventListener('click', () => {
      const input = document.getElementById('sel_' + key);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    container.appendChild(chip);
  });
}

function updateSelectorChips() {
  renderSelectorChipList(defaultSelectorChips, DEFAULT_SELECTOR_KEYS, currentSelectors);
  renderSelectorChipList(defaultXpathChips, DEFAULT_XPATH_KEYS, currentXpaths);
}

// Selector picker functionality
function initSelectorFields() {
  let selectorData = {};
  let xpathData = {};

  try {
    selectorData = JSON.parse(selEl.value || '{}');
  } catch (error) {
    console.error('Failed to parse selectors JSON', error);
  }

  try {
    xpathData = JSON.parse(xpEl.value || '{}');
  } catch (error) {
    console.error('Failed to parse XPath JSON', error);
  }

  currentSelectors = { ...DEFAULT_SELECTORS.selectors, ...selectorData };
  currentXpaths = { ...DEFAULT_SELECTORS.xpaths, ...xpathData };

  selectorKeys = Object.keys(currentSelectors);
  xpathKeys = Object.keys(currentXpaths);
  selectorKeySet = new Set(selectorKeys);
  xpathKeySet = new Set(xpathKeys);

  renderCustomSelectorRows('css');
  renderCustomSelectorRows('xpath');

  const inputs = document.querySelectorAll('input[data-key]');
  inputs.forEach((input) => {
    const key = input.dataset.key;
    if (!key) return;

    if (key in currentSelectors) {
      input.value = currentSelectors[key] ?? '';
    } else if (key in currentXpaths) {
      input.value = currentXpaths[key] ?? '';
    }

    if (!input.dataset.pickerChangeListener) {
      input.addEventListener('change', () => {
        if (selectorKeySet.has(key)) {
          updateSelectorsFromFields();
        }
        if (xpathKeySet.has(key)) {
          updateXpathsFromFields();
        }
      });
      input.dataset.pickerChangeListener = 'true';
    }
  });

  document.querySelectorAll('.pick-selector').forEach((button) => {
    if (button.dataset.pickerClickListener) return;
    const target = button.dataset.target || button.getAttribute('data-target');
    if (!target) return;
    button.addEventListener('click', () => startSelectorPicker(target));
    button.dataset.pickerClickListener = 'true';
  });

  updateSelectorsFromFields();
  updateXpathsFromFields();
  updateSelectorChips();
}

function renderCustomSelectorRows(type) {
  const container = type === 'css' ? customCssContainer : customXpathContainer;
  if (!container) return;

  const defaults = type === 'css' ? DEFAULT_SELECTOR_KEYS : DEFAULT_XPATH_KEYS;
  const data = type === 'css' ? currentSelectors : currentXpaths;
  const keys = Object.keys(data)
    .filter((key) => !defaults.includes(key))
    .sort((a, b) => a.localeCompare(b));

  container.innerHTML = '';

  if (!keys.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'muted custom-selector-empty';
    emptyState.textContent = 'No custom selectors yet.';
    container.appendChild(emptyState);
    return;
  }

  keys.forEach((key) => {
    container.appendChild(buildCustomSelectorRow(type, key, data[key] ?? ''));
  });
}

function buildCustomSelectorRow(type, key, value) {
  const row = document.createElement('div');
  row.className = 'selector-row custom-selector-row';

  const label = document.createElement('label');
  label.htmlFor = `sel_${key}`;
  label.textContent = key;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = `sel_${key}`;
  input.dataset.key = key;
  input.value = value ?? '';

  const actions = document.createElement('div');
  actions.className = 'selector-actions';

  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.className = 'small-btn pick-selector';
  pickButton.dataset.target = key;
  pickButton.textContent = 'Pick';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'small-btn danger remove-selector';
  removeButton.dataset.type = type;
  removeButton.dataset.key = key;
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => handleRemoveCustomSelector(type, key));

  actions.append(pickButton, removeButton);
  row.append(label, input, actions);

  return row;
}

function updateSelectorsFromFields() {
  selectorKeys.forEach((key) => {
    const input = document.getElementById('sel_' + key);
    if (input) {
      currentSelectors[key] = input.value;
    }
  });
  selEl.value = JSON.stringify(currentSelectors, null, 2);
  updateSelectorChips();
}

function updateXpathsFromFields() {
  xpathKeys.forEach((key) => {
    const input = document.getElementById('sel_' + key);
    if (input) {
      currentXpaths[key] = input.value;
    }
  });
  xpEl.value = JSON.stringify(currentXpaths, null, 2);
  updateSelectorChips();
}
function handleAddCustomSelector(type) {
  const promptText = type === 'css' ? 'Enter new selector key' : 'Enter new XPath key';
  const raw = prompt(promptText);
  if (raw === null) {
    return;
  }

  const key = raw.trim();
  if (!key) {
    return;
  }

  if (!KEY_PATTERN.test(key)) {
    alert('Key must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.');
    return;
  }

  const existsInSelectors = key in currentSelectors;
  const existsInXpaths = key in currentXpaths;

  if (type === 'css') {
    if (DEFAULT_SELECTOR_KEYS.includes(key) || existsInSelectors) {
      alert('Key already exists for CSS selectors.');
      return;
    }
  } else {
    if (DEFAULT_XPATH_KEYS.includes(key) || existsInXpaths) {
      alert('Key already exists for XPath selectors.');
      return;
    }
  }


  if (type === 'css') {
    currentSelectors[key] = '';
    selEl.value = JSON.stringify(currentSelectors, null, 2);
  } else {
    currentXpaths[key] = '';
    xpEl.value = JSON.stringify(currentXpaths, null, 2);
  }

  initSelectorFields();

  const input = document.getElementById('sel_' + key);
  if (input) {
    input.focus();
  }
}

function handleRemoveCustomSelector(type, key) {
  const defaults = type === 'css' ? DEFAULT_SELECTOR_KEYS : DEFAULT_XPATH_KEYS;
  if (defaults.includes(key)) {
    alert('Cannot remove a default selector.');
    return;
  }

  const label = type === 'css' ? 'selector' : 'XPath';
  if (!confirm('Remove custom ' + label + ' "' + key + '"?')) {
    return;
  }

  if (type === 'css') {
    if (!(key in currentSelectors)) {
      return;
    }
    delete currentSelectors[key];
    selEl.value = JSON.stringify(currentSelectors, null, 2);
  } else {
    if (!(key in currentXpaths)) {
      return;
    }
    delete currentXpaths[key];
    xpEl.value = JSON.stringify(currentXpaths, null, 2);
  }

  initSelectorFields();

  setStatus('Custom selector removed.', 'success');
  }


selEl.addEventListener('change', () => {
  try {
    const parsed = JSON.parse(selEl.value || '{}');
    currentSelectors = { ...DEFAULT_SELECTORS.selectors, ...parsed };
    selectorKeys = Object.keys(currentSelectors);
    selectorKeySet = new Set(selectorKeys);
    selEl.value = JSON.stringify(currentSelectors, null, 2);
    initSelectorFields();
  } catch (error) {
    alert('Invalid selectors JSON: ' + error.message);
    selEl.value = JSON.stringify(currentSelectors, null, 2);
  }
});

xpEl.addEventListener('change', () => {
  try {
    const parsed = JSON.parse(xpEl.value || '{}');
    currentXpaths = { ...DEFAULT_SELECTORS.xpaths, ...parsed };
    xpathKeys = Object.keys(currentXpaths);
    xpathKeySet = new Set(xpathKeys);
    xpEl.value = JSON.stringify(currentXpaths, null, 2);
    initSelectorFields();
  } catch (error) {
    alert('Invalid XPath JSON: ' + error.message);
    xpEl.value = JSON.stringify(currentXpaths, null, 2);
  }
});
async function startSelectorPicker(targetField) {
  const ehrTabs = await chrome.tabs.query({
    url: "https://esis.siauliuligonine.lt/*"
  });

  if (!ehrTabs.length) {
    alert('Please open the EHR page (https://esis.siauliuligonine.lt) first.');
    return;
  }

  const targetTab = ehrTabs.find(tab => tab.active) || ehrTabs[0];

  try {
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
  } catch (error) {
    console.warn('Unable to focus EHR tab for selector picker', error);
  }

  const input = document.querySelector(`#sel_${targetField}`);
  if (!input) {
    console.warn('Selector input element not found for field', targetField);
    return;
  }

  input.classList.add('picker-active');
  setStatus('Selector picker active. Switch to the EHR tab and click an element to capture its selector.', 'info', true);

  const message = {
    type: 'start-picker',
    data: { targetField }
  };

  const sendMessage = (tabId) => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });

  const handleFailure = (error) => {
    console.error('Failed to start selector picker', error);
    input.classList.remove('picker-active');
    setStatus('');
    alert('Could not start the selector picker. Please reload the EHR page and try again.');
  };

  try {
    await sendMessage(targetTab.id);
  } catch (error) {
    if (error.message.includes('Receiving end does not exist')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id, allFrames: true },
          files: ['selector-picker.js']
        });
        await sendMessage(targetTab.id);
        return;
      } catch (injectError) {
        handleFailure(injectError);
        return;
      }
    }

    handleFailure(error);
  }
}
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'selector-picked' && message.data) {
    const { css, targetField } = message.data;
    const input = document.querySelector(`#sel_${targetField}`);
    if (input) {
      input.value = css;
      input.classList.remove('picker-active');
    }

    setStatus('Selector captured. Saved to the form.', 'success');

    if (selectorKeySet.has(targetField)) {
      updateSelectorsFromFields();
    }
    if (xpathKeySet.has(targetField)) {
      updateXpathsFromFields();
    }
  } else if (message.type === 'selector-picker-cancelled' && message.data?.targetField) {
    const input = document.querySelector(`#sel_${message.data.targetField}`);
    input?.classList.remove('picker-active');

    setStatus('Selector picker cancelled.', 'info');
      }
});
function validateSelector(selector, name) {
  if (typeof selector !== 'string' || !selector.trim()) {
    throw new Error(`Neteisingas selektorius ${name}: turi būti ne tuščias tekstas`);
  }
  try {
    document.querySelector(selector); // Test if valid CSS selector
  } catch (e) {
    throw new Error(`Neteisingas CSS selektorius ${name}: ${selector}`);
  }
}

function validateSelectors(selectors) {
  if (!selectors || typeof selectors !== 'object') {
    throw new Error('Selektoriai turi būti objektas');
  }
  
  const required = ['ordersMenuBtn', 'newOrderBtn', 'orderSearchInput', 'orderTextDropdown', 
                   'roomInput', 'emergencyCheckbox', 'submitBtn'];
  
  for (const key of required) {
    if (!(key in selectors)) {
      throw new Error(`Trūksta privalomo selektoriaus: ${key}`);
    }
    validateSelector(selectors[key], key);
  }
}

// Recipe management
let editingRecipe = null;
const recipeModal = document.getElementById('recipeModal');
const recipeForm = document.getElementById('recipeForm');

function validateRecipe(recipe) {
  const errors = [];
  
  if (!recipe || typeof recipe !== 'object') {
    errors.push('Recipe must be an object');
  }
  
  if (!recipe.id || typeof recipe.id !== 'string') {
    errors.push('Recipe must have a string ID');
  } else if (!/^[a-z0-9_]+$/.test(recipe.id)) {
    errors.push('Recipe ID must contain only lowercase letters, numbers, and underscores');
  }
  
  if (recipe.hotkey !== undefined && typeof recipe.hotkey !== 'string') {
    errors.push('Recipe hotkey must be a string if provided');
  } else if (recipe.hotkey && !/^(Ctrl|Alt|Shift|\+|\w|\d)+$/.test(recipe.hotkey.replace(/\s+/g, ''))) {
    errors.push('Recipe hotkey format must be like "Ctrl+1" or "Alt+S"');
  }
  
  if (!recipe.label || typeof recipe.label !== 'string') {
    errors.push('Recipe must have a label');
  }
  
  if (!recipe.category) recipe.category = 'General';
  if (typeof recipe.category !== 'string') {
    errors.push('Recipe category must be a string');
  }
  
  if (!recipe.config || typeof recipe.config !== 'object') {
    errors.push(`Recipe ${recipe.id}: config must be an object`);
  } else {
    if (!recipe.config.searchTerm || typeof recipe.config.searchTerm !== 'string') {
      errors.push(`Recipe ${recipe.id}: searchTerm is required`);
    }
    
    if (recipe.config.dropdownText && typeof recipe.config.dropdownText !== 'string') {
      errors.push(`Recipe ${recipe.id}: dropdownText must be a string`);
    }
    
    if (recipe.config.room && typeof recipe.config.room !== 'string') {
      errors.push(`Recipe ${recipe.id}: room must be a string`);
    }
    
    if (recipe.config.emergency !== undefined && typeof recipe.config.emergency !== 'boolean') {
      errors.push(`Recipe ${recipe.id}: emergency must be a boolean`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  
  return recipe;
}

function populateCategorySelect() {
  const select = document.getElementById('recipeCategory');
  select.innerHTML = '<option value="General">General</option>';
  
  function addOptions(obj, prefix = '') {
    Object.keys(obj).sort().forEach(key => {
      const fullPath = prefix ? `${prefix}/${key}` : key;
      const option = document.createElement('option');
      option.value = fullPath;
      option.textContent = fullPath;
      select.appendChild(option);
      
      // Recursively add subcategories
      if (Object.keys(obj[key]).length > 0) {
        addOptions(obj[key], fullPath);
      }
    });
  }
  
  addOptions(categories);
}

function showRecipeModal(recipe = null) {
  editingRecipe = recipe;
  document.getElementById('recipeModalTitle').textContent = recipe ? 'Edit Recipe' : 'Add Recipe';
  
  // Populate form
  document.getElementById('recipeId').value = recipe ? recipe.id : '';
  document.getElementById('recipeId').disabled = !!recipe; // Disable ID field when editing
  document.getElementById('recipeLabel').value = recipe ? recipe.label : '';
  document.getElementById('recipeCategory').value = recipe ? recipe.category : 'General';
  document.getElementById('recipeSearchTerm').value = recipe ? recipe.config.searchTerm : '';
  document.getElementById('recipeDropdownText').value = recipe ? (recipe.config.dropdownText || '') : '';
  document.getElementById('recipeRoom').value = recipe ? (recipe.config.room || '') : '';
  document.getElementById('recipeEmergency').checked = recipe ? !!recipe.config.emergency : false;
  document.getElementById('recipeHotkey').value = recipe ? (recipe.hotkey || '') : '';
  
  // Show modal
  recipeModal.style.display = 'block';
  document.getElementById(recipe ? 'recipeLabel' : 'recipeId').focus();
}

function hideRecipeModal() {
  recipeModal.style.display = 'none';
  editingRecipe = null;
  recipeForm.reset();
}

function deleteRecipe(id) {
  if (!confirm('Are you sure you want to delete this recipe?')) return;

  try {
    const recipes = JSON.parse(recEl.value);
    const index = recipes.findIndex(r => r.id === id);

    if (index !== -1) {
      recipes.splice(index, 1);
      recEl.value = JSON.stringify(recipes, null, 2);
      updateRecipesList(recipes);
      initSelectorFields();

      setStatus('Recipe deleted successfully', 'success');
    }
  } catch (error) {
    alert(error.message);
  }
}

function saveRecipe(e) {
  e.preventDefault();
  
  try {
    const recipe = {
      id: document.getElementById('recipeId').value,
      label: document.getElementById('recipeLabel').value,
      category: document.getElementById('recipeCategory').value,
      config: {
        searchTerm: document.getElementById('recipeSearchTerm').value,
        dropdownText: document.getElementById('recipeDropdownText').value || undefined,
        room: document.getElementById('recipeRoom').value || undefined,
        emergency: document.getElementById('recipeEmergency').checked
      },
      hotkey: document.getElementById('recipeHotkey').value || undefined
    };
    
    // Validate recipe
    validateRecipe(recipe);
    
    // Get current recipes
    const recipes = JSON.parse(recEl.value);
    
    if (editingRecipe) {
      // Update existing recipe
      const index = recipes.findIndex(r => r.id === recipe.id);
      if (index !== -1) {
        recipes[index] = recipe;
      }
    } else {
      // Check for duplicate ID
      if (recipes.some(r => r.id === recipe.id)) {
        throw new Error(`Recipe with ID "${recipe.id}" already exists`);
      }
      recipes.push(recipe);
    }
    
    // Save to textarea
    recEl.value = JSON.stringify(recipes, null, 2);
    
    // Update recipe list
    updateRecipesList(recipes);
    
    // Hide modal
    hideRecipeModal();
    
    setStatus(`Recipe ${editingRecipe ? 'updated' : 'added'} successfully`, 'success');
  } catch (error) {
    alert(error.message);
  }
}

function save() {
  try {
    const selectors = JSON.parse(selEl.value);
    const xpaths    = JSON.parse(xpEl.value);
    const recipes   = JSON.parse(recEl.value);

    // Validate
    validateSelectors(selectors);
    if (!xpaths.orderSearchItemContains) {
      throw new Error('Trūksta privalomo xpath: orderSearchItemContains');
    }
    recipes.forEach(validateRecipe);

    chrome.storage.sync.set({
      ehrqo_selectors: { selectors, xpaths },
      ehrqo_recipes: recipes
    }, () => {
      setStatus('Issaugota. Perkraukite savo HIS skirtuka.', 'success');
    });
  } catch (e) {
    setStatus(e.message, 'error', true);
  }

}

function updateRecipesList(recipes) {
  const searchTerm = searchInput.value.toLowerCase();
  const category = categoryFilter.value;
  
  // Update categories dropdown
  const categories = ['', ...new Set(recipes.map(r => r.category || 'Bendri'))];
  categoryFilter.innerHTML = categories
    .map(c => `<option value="${c}">${c || 'Visos kategorijos'}</option>`)
    .join('');
  categoryFilter.value = category;
  
  // Filter and display recipes
  const filtered = recipes.filter(r => {
    if (category && r.category !== category) return false;
    if (searchTerm) {
      const text = `${r.label} ${r.category || ''} ${r.config.searchTerm}`.toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }
    return true;
  });
  
  recipesList.innerHTML = filtered.map(r => `
    <div class="recipe-card" data-recipe-id="${r.id}">
      <div class="recipe-header">
        <strong>${r.label}</strong>
        <span class="recipe-category">${r.category || 'Bendri'}</span>
      </div>
      <div class="recipe-content">
        <div class="muted">
          <div><strong>ID:</strong> ${r.id}</div>
          <div><strong>Search:</strong> ${r.config.searchTerm}</div>
          ${r.config.dropdownText ? `<div><strong>Tekstas:</strong> ${r.config.dropdownText}</div>` : ''}
          ${r.config.room ? `<div><strong>Kambarys:</strong> ${r.config.room}</div>` : ''}
          ${r.config.emergency ? '<div>⚡ Skubus</div>' : ''}
          ${r.hotkey ? `<div><strong>Hotkey:</strong> ${r.hotkey}</div>` : ''}
        </div>
      </div>
      <div class="recipe-actions">
        <button onclick="showRecipeModal(${JSON.stringify(r)})" class="small-btn">Edit</button>
        <button onclick="deleteRecipe('${r.id}')" class="small-btn danger">Delete</button>
      </div>
    </div>
  `).join('');
}

// Backup/restore
function backup() {
  chrome.storage.sync.get(['ehrqo_selectors','ehrqo_recipes'], (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ehr-quick-orders-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function restore(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      if (!data.ehrqo_selectors || !data.ehrqo_recipes) {
        throw new Error("Neteisingas atsargines kopijos failo formatas");
      }

      validateSelectors(data.ehrqo_selectors.selectors);
      data.ehrqo_recipes.forEach(validateRecipe);

      chrome.storage.sync.set(data, () => {
        setStatus("Settings restored. Reload your EHR tab.", "success");
        load();
      });
    } catch (err) {
      setStatus("Invalid backup file: " + err.message, "error", true);
    }
  };
  reader.readAsText(file);
}

// Load with recipe list
function load() {
  chrome.storage.sync.get(['ehrqo_selectors','ehrqo_recipes','ehrqo_categories'], (data) => {
    const selectors = data.ehrqo_selectors || DEFAULT_SELECTORS;
    const recipes = data.ehrqo_recipes || DEFAULT_RECIPES;
    categories = deepClone(data.ehrqo_categories || DEFAULT_CATEGORIES);
    selectedCategory = null;

    selEl.value = JSON.stringify(selectors.selectors, null, 2);
    xpEl.value = JSON.stringify(selectors.xpaths, null, 2);
    recEl.value = JSON.stringify(recipes, null, 2);

    renderCategoryTree();
    populateCategorySelect();
    updateCategoryEditor();
    updateRecipesList(recipes);
    initSelectorFields();
  });
}

function resetDefaults() {
  if (!confirm('Reset all settings to their defaults?')) return;

  const defaultSelectors = {
    selectors: { ...DEFAULT_SELECTORS.selectors },
    xpaths: { ...DEFAULT_SELECTORS.xpaths }
  };
  const defaultRecipes = deepClone(DEFAULT_RECIPES);
  const defaultCategories = deepClone(DEFAULT_CATEGORIES);

  chrome.storage.sync.set({
    ehrqo_selectors: defaultSelectors,
    ehrqo_recipes: defaultRecipes,
    ehrqo_categories: defaultCategories
  }, () => {
    categories = defaultCategories;
    selectedCategory = null;

    selEl.value = JSON.stringify(defaultSelectors.selectors, null, 2);
    xpEl.value = JSON.stringify(defaultSelectors.xpaths, null, 2);
    recEl.value = JSON.stringify(defaultRecipes, null, 2);

    renderCategoryTree();
    populateCategorySelect();
    updateCategoryEditor();
    updateRecipesList(defaultRecipes);
    initSelectorFields();
    setStatus('Defaults restored. Refresh your EHR tab.', 'success');
  });
}

function deleteCategory() {
  if (!selectedCategory || !confirm('Delete this category and all its subcategories?')) return;
  
  const parts = selectedCategory.split('/');
  const name = parts.pop();
  let current = categories;
  
  for (const part of parts) {
    current = current[part];
  }
  
  delete current[name];
  selectedCategory = null;
  renderCategoryTree();
  updateCategoryEditor();
  
  // Save categories to storage
  chrome.storage.sync.set({ ehrqo_categories: categories }, () => {
    setStatus('Category deleted. Refresh your EHR tab.', 'success');
  });
}

// All event listeners
document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', resetDefaults);
document.getElementById('backup').addEventListener('click', backup);
document.getElementById('restore').addEventListener('click', () => document.getElementById('restoreFile').click());
document.getElementById('restoreFile').addEventListener('change', restore);

// Category management event listeners
document.getElementById('addRootCategory').addEventListener('click', () => {
  console.log('Add root category clicked'); // Debug log
  addCategory();
});

document.getElementById('addSubCategory').addEventListener('click', () => {
  console.log('Add subcategory clicked, selectedCategory:', selectedCategory); // Debug log
  addCategory(selectedCategory);
});

document.getElementById('deleteCategory').addEventListener('click', deleteCategory);

document.getElementById('categoryName').addEventListener('change', (e) => {
  if (!selectedCategory) return;
  
  const newName = e.target.value.trim();
  const parts = selectedCategory.split('/');
  const oldName = parts.pop();
  let current = categories;
  
  for (const part of parts) {
    current = current[part];
  }
  
  if (newName && newName !== oldName) {
    if (current[newName]) {
      alert('Category name already exists!');
      e.target.value = oldName;
      return;
    }
    
    current[newName] = current[oldName];
    delete current[oldName];
    selectedCategory = parts.length ? `${parts.join('/')}/${newName}` : newName;
    renderCategoryTree();
    
    // Save categories to storage
    chrome.storage.sync.set({ ehrqo_categories: categories }, () => {
      setStatus('Category renamed. Refresh your EHR tab.', 'success');
    });
  }
});

searchInput.addEventListener('input', () => {
  const recipes = JSON.parse(recEl.value);
  updateRecipesList(recipes);
});

categoryFilter.addEventListener('change', () => {
  const recipes = JSON.parse(recEl.value);
  updateRecipesList(recipes);
});

// Handle tab switching
function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.tab;
      
      // Update button states
      buttons.forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      
      // Update panel visibility
      panels.forEach(panel => {
        if (panel.id === `${target}-panel`) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });
}

// Initialize with DEFAULT_CATEGORIES if none exist
function init() {
  console.log('Initializing options page...'); // Debug log
  initTabs(); // Initialize tab switching
  chrome.storage.sync.get(['ehrqo_selectors', 'ehrqo_recipes', 'ehrqo_categories'], (data) => {
    const selectors = data.ehrqo_selectors || DEFAULT_SELECTORS;
    const recipes = data.ehrqo_recipes || DEFAULT_RECIPES;
    categories = deepClone(data.ehrqo_categories || DEFAULT_CATEGORIES);
    selectedCategory = null;

    selEl.value = JSON.stringify(selectors.selectors, null, 2);
    xpEl.value = JSON.stringify(selectors.xpaths, null, 2);
    recEl.value = JSON.stringify(recipes, null, 2);
    
    renderCategoryTree();
    updateRecipesList(recipes);
    populateCategorySelect();
    initSelectorFields();
  });
  
  // Add recipe modal event listeners
  document.getElementById('addRecipe').addEventListener('click', () => showRecipeModal());
  document.getElementById('recipeCancel').addEventListener('click', hideRecipeModal);
  document.getElementById('recipeForm').addEventListener('submit', saveRecipe);
  
  // Handle clicking outside modal to close
  recipeModal.addEventListener('click', (e) => {
    if (e.target === recipeModal) {
      hideRecipeModal();
    }
  });
  
  // Recipe list double-click to edit
  document.getElementById('recipesList').addEventListener('dblclick', (e) => {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    
    const recipes = JSON.parse(recEl.value);
    const recipe = recipes.find(r => r.id === card.dataset.recipeId);
    if (recipe) {
      showRecipeModal(recipe);
    }
  });

  // Handle advanced mode toggle
  const advancedToggle = document.getElementById('advancedMode');
  if (advancedToggle) {
    advancedToggle.addEventListener('change', (e) => {
      document.body.classList.toggle('advanced-mode', e.target.checked);
    });
  }
}

initSelectorFields();
init();
























































