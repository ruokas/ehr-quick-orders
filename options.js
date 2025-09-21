// Import default categories and selectors from content.js
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

// Category management
let categories = {};
let selectedCategory = null;

function renderCategoryTree() {
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

function load() {
  chrome.storage.sync.get(['ehrqo_selectors','ehrqo_recipes'], (data) => {
    const selectors = data.ehrqo_selectors || DEFAULT_SELECTORS;
    const recipes   = data.ehrqo_recipes   || DEFAULT_RECIPES;
    selEl.value = JSON.stringify(selectors.selectors, null, 2);
    xpEl.value  = JSON.stringify(selectors.xpaths, null, 2);
    recEl.value = JSON.stringify(recipes, null, 2);
  });
}

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

function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error('Receptas turi būti objektas');
  }
  
  if (!recipe.id || typeof recipe.id !== 'string') {
    throw new Error('Receptas turi turėti string id');
  }
  
  if (!recipe.label || typeof recipe.label !== 'string') {
    throw new Error('Receptas turi turėti string label');
  }
  
  if (!recipe.category) recipe.category = 'General';
  if (typeof recipe.category !== 'string') {
    throw new Error('Recepto kategorija turi būti string');
  }
  
  if (!recipe.config || typeof recipe.config !== 'object') {
    throw new Error(`Receptas ${recipe.id}: config turi būti objektas`);
  }
  
  if (!recipe.config.searchTerm || typeof recipe.config.searchTerm !== 'string') {
    throw new Error(`Receptas ${recipe.id}: searchTerm yra privalomas`);
  }
  
  return recipe;
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
      status.textContent = 'Išsaugota. Perkraukite savo HIS skirtuką.';
      setTimeout(() => status.textContent = '', 2500);
    });
  } catch (e) {
    status.textContent = e.message;
  }
}

function resetDefaults() {
  chrome.storage.sync.set({
    ehrqo_selectors: DEFAULT_SELECTORS,
    ehrqo_recipes: DEFAULT_RECIPES
  }, load);
}

// Search and filter
const searchInput = document.getElementById('recipeSearch');
const categoryFilter = document.getElementById('categoryFilter');
const recipesList = document.getElementById('recipesList');

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
    <div class="recipe-card">
      <div class="recipe-header">
        <strong>${r.label}</strong>
        <span class="recipe-category">${r.category || 'Bendri'}</span>
      </div>
      <div class="muted">
        Search: ${r.config.searchTerm}
        ${r.config.dropdownText ? `<br>Tekstas: ${r.config.dropdownText}` : ''}
        ${r.config.room ? `<br>Kambarys: ${r.config.room}` : ''}
        ${r.config.emergency ? '<br>⚡ Skubus' : ''}
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
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      // Validate
      if (!data.ehrqo_selectors || !data.ehrqo_recipes) {
        throw new Error('Neteisingas atsarginės kopijos failo formatas');
      }
      
      validateSelectors(data.ehrqo_selectors.selectors);
      data.ehrqo_recipes.forEach(validateRecipe);
      
      // Restore
      chrome.storage.sync.set(data, () => {
        status.textContent = 'Nustatymai atkurti. Perkraukite savo HIS skirtuką.';
        setTimeout(() => status.textContent = '', 2500);
        load();
      });
    } catch (err) {
      status.textContent = 'Neteisingas atsarginės kopijos failas: ' + err.message;
    }
  };
  reader.readAsText(file);
}

// Load with recipe list
function load() {
  chrome.storage.sync.get(['ehrqo_selectors','ehrqo_recipes'], (data) => {
    const selectors = data.ehrqo_selectors || DEFAULT_SELECTORS;
    const recipes   = data.ehrqo_recipes   || DEFAULT_RECIPES;
    selEl.value = JSON.stringify(selectors.selectors, null, 2);
    xpEl.value  = JSON.stringify(selectors.xpaths, null, 2);
    recEl.value = JSON.stringify(recipes, null, 2);
    updateRecipesList(recipes);
  });
}

// Event listeners
document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', resetDefaults);
document.getElementById('backup').addEventListener('click', backup);
document.getElementById('restore').addEventListener('click', () => document.getElementById('restoreFile').click());
document.getElementById('restoreFile').addEventListener('change', restore);
searchInput.addEventListener('input', () => {
  const recipes = JSON.parse(recEl.value);
  updateRecipesList(recipes);
});
categoryFilter.addEventListener('change', () => {
  const recipes = JSON.parse(recEl.value);
  updateRecipesList(recipes);
});

load();
