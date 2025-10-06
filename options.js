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

function updateCategoryButtons() {
  const hasSelection = !!selectedCategory;
  const addSubBtn = document.getElementById('addSubCategory');
  const deleteBtn = document.getElementById('deleteCategory');

  if (addSubBtn) addSubBtn.disabled = !hasSelection;
  if (deleteBtn) deleteBtn.disabled = !hasSelection;
}

function addCategory(parentPath = null) {
  const label = parentPath ? 'Iveskite subkategorijos pavadinima:' : 'Iveskite kategorijos pavadinima:';
  const rawName = prompt(label);
  if (rawName === null) {
    return;
  }

  const newName = rawName.trim();
  if (!newName) {
    return;
  }

  if (newName.includes('/')) {
    alert('Kategorijos pavadinimas negali tureti simbolio "/"');
    return;
  }

  let target = categories;
  if (parentPath) {
    const parts = parentPath.split('/');
    for (const part of parts) {
      if (!target[part]) {
        alert('Pasirinkta kategorija nerasta. Perkraukite puslapi ir bandykite dar karta.');
        return;
      }
      target = target[part];
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, newName)) {
    alert('Category name already exists!');
    return;
  }

  target[newName] = {};
  selectedCategory = parentPath ? `${parentPath}/${newName}` : newName;

  renderCategoryTree();
  updateCategoryEditor();
  populateCategorySelect();

  chrome.storage.sync.set({ ehrqo_categories: categories }, () => {
    setStatus('Category added. Refresh your EHR tab.', 'success');
  });
}

const DEFAULT_RECIPES = [
  {
    id: 'ct_head_stroke',
    label: 'Galvos KT - insultas',
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

let currentRecipeActions = [];
const EHR_URL_PATTERN = 'https://esis.siauliuligonine.lt/*';

const ACTION_TYPE_OPTIONS = [
  { value: 'status', label: 'Rodyti žinutę' },
  { value: 'waitFor', label: 'Laukti elemento' },
  { value: 'click', label: 'Paspausti elementą' },
  { value: 'setValue', label: 'Įrašyti reikšmę' },
  { value: 'selectOption', label: 'Pasirinkti iš sąrašo' },
  { value: 'setChecked', label: 'Varnelės būseną' },
  { value: 'clickText', label: 'Paspausti pagal tekstą' },
  { value: 'delay', label: 'Pauzė (ms)' }
];

const ACTION_ALLOWED_KEYS = {
  status: ['uid','type','text','allowFailure','note'],
  waitFor: ['uid','type','selectorKey','selector','timeout','allowFailure','note'],
  click: ['uid','type','selectorKey','selector','timeout','allowFailure','note'],
  setValue: ['uid','type','selectorKey','selector','value','skipIfEmpty','allowFailure','note'],
  selectOption: ['uid','type','selectorKey','selector','value','optionMatch','skipIfEmpty','allowFailure','note','timeout'],
  setChecked: ['uid','type','selectorKey','selector','checked','allowFailure','note'],
  clickText: ['uid','type','xpathKey','xpath','text','skipIfEmpty','allowFailure','note','timeout'],
  delay: ['uid','type','timeout','allowFailure','note']
};

const ACTIONS_NEED_SELECTOR = new Set(['waitFor','click','setValue','selectOption','setChecked']);
const ACTIONS_NEED_VALUE = new Set(['setValue','selectOption']);
const ACTIONS_SUPPORT_SKIP_IF_EMPTY = new Set(['setValue','selectOption','clickText']);

function sanitizeSelectorValue(value, kind = 'css') {
  if (typeof value !== 'string') {
    return value;
  }
  let result = value;
  if (kind === 'css') {
    result = result.replace(/\.ehrqo-highlight\b/g, '');
    result = result.replace(/\.ehrqo-picker-[\w-]+\b/g, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function generateActionUid() {
  return 'act_' + Math.random().toString(36).slice(2, 10);
}

function hasAdvancedSteps(recipe) {
  return Array.isArray(recipe?.steps) && recipe.steps.length > 0;
}

function createEmptyAction(type = 'click') {
  const uid = generateActionUid();
  switch (type) {
    case 'status':
      return { uid, type, text: '', allowFailure: false };
    case 'waitFor':
      return { uid, type, selectorKey: '', selector: '', timeout: 8000, allowFailure: false };
    case 'click':
      return { uid, type, selectorKey: '', selector: '', timeout: 8000, allowFailure: false };
    case 'setValue':
      return { uid, type, selectorKey: '', selector: '', value: '', skipIfEmpty: false, allowFailure: false };
    case 'selectOption':
      return { uid, type, selectorKey: '', selector: '', value: '', optionMatch: 'text', skipIfEmpty: true, allowFailure: false, timeout: 8000 };
    case 'setChecked':
      return { uid, type, selectorKey: '', selector: '', checked: true, allowFailure: false };
    case 'clickText':
      return { uid, type, xpathKey: 'orderSearchItemContains', xpath: '', text: '', skipIfEmpty: true, allowFailure: false, timeout: 8000 };
    case 'delay':
      return { uid, type, timeout: 500, allowFailure: false };
    default:
      return { uid, type, allowFailure: false };
  }
}

function prepareActionForUi(action, typeOverride) {
  const type = typeOverride || action?.type || 'click';
  const base = createEmptyAction(type);
  const merged = { ...base, ...(action || {}), type };
  merged.uid = action?.uid || base.uid;

  const allowed = ACTION_ALLOWED_KEYS[type] || [];
  Object.keys(merged).forEach((key) => {
    if (!allowed.includes(key)) {
      delete merged[key];
    }
  });

  if (typeof merged.selector === 'string') merged.selector = merged.selector.trim();
  if (typeof merged.selectorKey === 'string') merged.selectorKey = merged.selectorKey.trim();
  if (typeof merged.xpath === 'string') merged.xpath = merged.xpath.trim();
  if (typeof merged.xpathKey === 'string') merged.xpathKey = merged.xpathKey.trim();
  if (typeof merged.value === 'string') merged.value = merged.value.trim();
  if (typeof merged.text === 'string') merged.text = merged.text.trim();
  if (typeof merged.note === 'string') merged.note = merged.note.trim();

  if (merged.timeout !== undefined) {
    if (merged.timeout === '' || merged.timeout === null) {
      merged.timeout = type === 'delay' ? 500 : 8000;
    } else {
      const parsed = Number(merged.timeout);
      merged.timeout = Number.isFinite(parsed) && parsed >= 0 ? parsed : (type === 'delay' ? 500 : 8000);
    }
  }

  if (type === 'selectOption') {
    merged.optionMatch = (merged.optionMatch || 'text').toLowerCase() === 'value' ? 'value' : 'text';
  }

  if (type === 'setChecked') {
    merged.checked = merged.checked === undefined ? true : !!merged.checked;
  }

  if (ACTIONS_SUPPORT_SKIP_IF_EMPTY.has(type)) {
    merged.skipIfEmpty = merged.skipIfEmpty === true;
  } else {
    delete merged.skipIfEmpty;
  }

  merged.allowFailure = merged.allowFailure === true;

  return merged;
}

function serializeAction(action) {
  if (!action || typeof action !== 'object') {
    return null;
  }
  const prepared = prepareActionForUi(action);
  const allowed = ACTION_ALLOWED_KEYS[prepared.type] || [];
  const result = { type: prepared.type };

  for (const key of allowed) {
    if (key === 'uid' || key === 'type') continue;
    const value = prepared[key];
    if (value === undefined || value === null) continue;

    if (key === 'allowFailure' || key === 'skipIfEmpty') {
      if (value) result[key] = true;
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      result[key] = trimmed;
      continue;
    }

    result[key] = value;
  }

  if (ACTIONS_NEED_SELECTOR.has(prepared.type) && !result.selector && !result.selectorKey) {
    return null;
  }

  if (ACTIONS_NEED_VALUE.has(prepared.type) && !result.value && !prepared.skipIfEmpty) {
    return null;
  }

  if (prepared.type === 'clickText' && !result.text && !prepared.skipIfEmpty) {
    return null;
  }

  return result;
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  const sanitized = [];
  actions.forEach((action, index) => {
    const prepared = prepareActionForUi(action);
    const serialized = serializeAction(prepared);
    if (!serialized) {
      throw new Error(`Veiksmas #${index + 1} nėra užpildytas teisingai.`);
    }
    sanitized.push(serialized);
  });

  return sanitized;
}

function deriveConfigFromActions(actions) {
  const config = {};
  if (!Array.isArray(actions)) {
    return config;
  }

  actions.forEach((action) => {
    const prepared = prepareActionForUi(action);
    switch (prepared.type) {
      case 'setValue':
        if (prepared.selectorKey === 'orderSearchInput' && prepared.value) {
          config.searchTerm = prepared.value;
        } else if (prepared.selectorKey === 'roomInput' && prepared.value) {
          config.room = prepared.value;
        }
        break;
      case 'selectOption':
        if (prepared.selectorKey === 'orderTextDropdown' && prepared.value) {
          config.dropdownText = prepared.value;
        }
        break;
      case 'setChecked':
        if (prepared.selectorKey === 'emergencyCheckbox' && typeof prepared.checked === 'boolean') {
          config.emergency = prepared.checked;
        }
        break;
      case 'clickText':
        if (!config.dropdownText && prepared.text) {
          config.dropdownText = prepared.text;
        }
        break;
      default:
        break;
    }
  });

  return config;
}

function deriveRecipeDisplay(recipe) {
  const base = { searchTerm: '', dropdownText: '', room: '', emergency: undefined };
  if (!recipe || typeof recipe !== 'object') {
    return base;
  }

  if (recipe.config && typeof recipe.config === 'object') {
    if (typeof recipe.config.searchTerm === 'string') base.searchTerm = recipe.config.searchTerm;
    if (typeof recipe.config.dropdownText === 'string') base.dropdownText = recipe.config.dropdownText;
    if (typeof recipe.config.room === 'string') base.room = recipe.config.room;
    if (typeof recipe.config.emergency === 'boolean') base.emergency = recipe.config.emergency;
  }

  if (hasAdvancedSteps(recipe)) {
    recipe.steps.forEach((step) => {
      if (!step || typeof step !== 'object') return;
      const selectorKey = step.selectorKey || '';
      switch (step.type) {
        case 'setValue':
          if (selectorKey === 'orderSearchInput' && typeof step.value === 'string') {
            base.searchTerm = step.value;
          } else if (selectorKey === 'roomInput' && typeof step.value === 'string') {
            base.room = step.value;
          }
          break;
        case 'selectOption':
          if (selectorKey === 'orderTextDropdown' && typeof step.value === 'string') {
            base.dropdownText = step.value;
          }
          break;
        case 'setChecked':
          if (selectorKey === 'emergencyCheckbox' && typeof step.checked === 'boolean') {
            base.emergency = step.checked;
          }
          break;
        case 'clickText':
          if (!base.dropdownText && typeof step.text === 'string') {
            base.dropdownText = step.text;
          }
          break;
        default:
          break;
      }
    });
  }

  return base;
}

function buildDefaultActionFlow(config = {}) {
  const template = [
    { type: 'status', text: 'Atidaromi užsakymai...' },
    { type: 'click', selectorKey: 'ordersMenuBtn' },
    { type: 'click', selectorKey: 'newOrderBtn' },
    { type: 'waitFor', selectorKey: 'modalRoot', timeout: 6000, allowFailure: true },
    { type: 'status', text: 'Ieskoma...' },
    { type: 'setValue', selectorKey: 'orderSearchInput', value: config.searchTerm || '', skipIfEmpty: false },
    { type: 'clickText', xpathKey: 'orderSearchItemContains', text: config.searchTerm || '', skipIfEmpty: true },
    { type: 'selectOption', selectorKey: 'orderTextDropdown', value: config.dropdownText || '', skipIfEmpty: true, allowFailure: true },
    { type: 'setValue', selectorKey: 'roomInput', value: config.room || '', skipIfEmpty: true, allowFailure: true },
    { type: 'setChecked', selectorKey: 'emergencyCheckbox', checked: !!config.emergency, allowFailure: true },
    { type: 'status', text: 'Pateikiama...' },
    { type: 'click', selectorKey: 'submitBtn' },
    { type: 'status', text: 'Baigta.' }
  ];

  return template.map(step => prepareActionForUi(step));
}

function buildActionsForRecipe(recipe) {
  if (recipe && hasAdvancedSteps(recipe)) {
    return recipe.steps.map(step => prepareActionForUi(step));
  }
  const config = recipe?.config || {};
  return buildDefaultActionFlow(config);
}

function moveRecipeAction(uid, delta) {
  const index = currentRecipeActions.findIndex(action => action.uid === uid);
  if (index === -1) return;
  const target = index + delta;
  if (target < 0 || target >= currentRecipeActions.length) return;
  const [item] = currentRecipeActions.splice(index, 1);
  currentRecipeActions.splice(target, 0, item);
  renderRecipeActions();
}

function removeRecipeAction(uid) {
  const index = currentRecipeActions.findIndex(action => action.uid === uid);
  if (index === -1) return;
  currentRecipeActions.splice(index, 1);
  renderRecipeActions();
}

function addRecipeAction(type = 'click') {
  currentRecipeActions.push(createEmptyAction(type));
  renderRecipeActions();
}

function loadDefaultActionsFlow() {
  const draft = deriveConfigFromActions(currentRecipeActions);
  currentRecipeActions = buildDefaultActionFlow(draft);
  renderRecipeActions();
}

function renderRecipeActions() {
  const container = document.getElementById('recipeActionsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!currentRecipeActions.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'muted';
    emptyState.textContent = 'Nėra veiksmų. Pridėkite naują veiksmą.';
    container.appendChild(emptyState);
    return;
  }

  currentRecipeActions.forEach((action, index) => {
    container.appendChild(buildRecipeActionRow(action, index));
  });
}

function buildRecipeActionRow(action, index) {
  const prepared = prepareActionForUi(action);
  currentRecipeActions[index] = prepared;

  const row = document.createElement('div');
  row.className = 'recipe-action';
  row.dataset.uid = prepared.uid;

  const header = document.createElement('div');
  header.className = 'recipe-action-header';

  const title = document.createElement('div');
  title.className = 'recipe-action-title';

  const indexBadge = document.createElement('span');
  indexBadge.className = 'recipe-action-index';
  indexBadge.textContent = `#${index + 1}`;
  title.appendChild(indexBadge);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'action-type-select';
  ACTION_TYPE_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    typeSelect.appendChild(option);
  });
  typeSelect.value = prepared.type;
  typeSelect.addEventListener('change', (event) => {
    const updated = prepareActionForUi(prepared, event.target.value);
    currentRecipeActions[index] = updated;
    renderRecipeActions();
  });
  title.appendChild(typeSelect);

  header.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'recipe-action-controls';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'small-btn ghost';
  upBtn.textContent = '↑';
  upBtn.title = 'Perkelti aukštyn';
  if (index === 0) upBtn.disabled = true;
  upBtn.addEventListener('click', () => moveRecipeAction(prepared.uid, -1));
  controls.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'small-btn ghost';
  downBtn.textContent = '↓';
  downBtn.title = 'Perkelti žemyn';
  if (index === currentRecipeActions.length - 1) downBtn.disabled = true;
  downBtn.addEventListener('click', () => moveRecipeAction(prepared.uid, 1));
  controls.appendChild(downBtn);

  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.className = 'small-btn ghost';
  testBtn.textContent = 'Test';
  testBtn.title = 'Testuoti veiksmą EHR lange';
  if (['status','delay'].includes(prepared.type)) {
    testBtn.disabled = true;
  }
  testBtn.addEventListener('click', () => testAction(prepared));
  controls.appendChild(testBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'small-btn danger';
  removeBtn.textContent = 'Šalinti';
  removeBtn.addEventListener('click', () => removeRecipeAction(prepared.uid));
  controls.appendChild(removeBtn);

  header.appendChild(controls);
  row.appendChild(header);

  const body = document.createElement('div');
  body.className = 'recipe-action-body';
  row.appendChild(body);

  populateActionBody(body, prepared);

  return row;
}

function populateActionBody(container, action) {
  container.innerHTML = '';
  const type = action.type;

  if (ACTIONS_NEED_SELECTOR.has(type)) {
    container.appendChild(createSelectorInputs(action));
  }

  switch (type) {
    case 'status':
      container.appendChild(createTextareaField(action, 'text', 'Žinutė', 'Pvz.: Atidaromi užsakymai...'));
      break;
    case 'waitFor':
      container.appendChild(createNumberField(action, 'timeout', 'Laukimo trukmė (ms)', '8000'));
      break;
    case 'click':
      container.appendChild(createNumberField(action, 'timeout', 'Maksimali laukimo trukmė (ms)', '8000'));
      break;
    case 'setValue':
      container.appendChild(createTextField(action, 'value', 'Reikšmė', 'Įrašyti reikšmę'));
      break;
    case 'selectOption':
      container.appendChild(createTextField(action, 'value', 'Parinktis', 'Tekstas ar value reikšmę'));
      container.appendChild(createMatchField(action));
      container.appendChild(createNumberField(action, 'timeout', 'Maksimali laukimo trukmė (ms)', '8000'));
      break;
    case 'setChecked':
      container.appendChild(createCheckboxField(action, 'checked', 'Pažymėti (true) arba nuimti (false)'));
      break;
    case 'clickText':
      container.appendChild(createXpathInputs(action));
      container.appendChild(createTextField(action, 'text', 'Tekstas paieškai', 'Pvz.: Galvos KT'));
      container.appendChild(createNumberField(action, 'timeout', 'Maksimali laukimo trukmė (ms)', '8000'));
      break;
    case 'delay':
      container.appendChild(createNumberField(action, 'timeout', 'Pauzė (ms)', '500'));
      break;
    default:
      break;
  }

  const flags = buildActionFlags(action);
  if (flags) {
    container.appendChild(flags);
  }
}

function createSelectorInputs(action) {
  const field = document.createElement('div');
  field.className = 'action-field';

  const label = document.createElement('label');
  label.textContent = 'CSS selektorius';
  field.appendChild(label);

  const row = document.createElement('div');
  row.className = 'action-selector-row';

  const select = document.createElement('select');
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '-- Pasirinkti raktą --';
  select.appendChild(emptyOption);
  selectorKeys.slice().sort().forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    select.appendChild(option);
  });
  select.value = action.selectorKey || '';
  select.addEventListener('change', (event) => {
    action.selectorKey = event.target.value || '';
  });
  row.appendChild(select);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'CSS selektorius (nebūtina)';
  input.value = action.selector || '';
  input.addEventListener('input', (event) => {
    action.selector = event.target.value.trim();
  });
  row.appendChild(input);

  field.appendChild(row);
  return field;
}

function createXpathInputs(action) {
  const field = document.createElement('div');
  field.className = 'action-field';

  const label = document.createElement('label');
  label.textContent = 'XPath bazinis selektorius';
  field.appendChild(label);

  const row = document.createElement('div');
  row.className = 'action-selector-row';

  const select = document.createElement('select');
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '-- Pasirinkti raktą --';
  select.appendChild(emptyOption);
  Object.keys(currentXpaths || {}).sort().forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    select.appendChild(option);
  });
  select.value = action.xpathKey || '';
  select.addEventListener('change', (event) => {
    action.xpathKey = event.target.value || '';
  });
  row.appendChild(select);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'XPath (nebūtina, jei naudojamas raktas)';
  input.value = action.xpath || '';
  input.addEventListener('input', (event) => {
    action.xpath = event.target.value.trim();
  });
  row.appendChild(input);

  field.appendChild(row);
  return field;
}

function createTextField(action, key, label, placeholder = '') {
  const field = document.createElement('div');
  field.className = 'action-field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  field.appendChild(labelEl);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = action[key] || '';
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', (event) => {
    action[key] = event.target.value;
  });
  field.appendChild(input);
  return field;
}

function createTextareaField(action, key, label, placeholder = '') {
  const field = document.createElement('div');
  field.className = 'action-field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  field.appendChild(labelEl);
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.value = action[key] || '';
  if (placeholder) textarea.placeholder = placeholder;
  textarea.addEventListener('input', (event) => {
    action[key] = event.target.value;
  });
  field.appendChild(textarea);
  return field;
}

function createNumberField(action, key, label, placeholder = '') {
  const field = document.createElement('div');
  field.className = 'action-field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  field.appendChild(labelEl);
  const input = document.createElement('input');
  input.type = 'number';
  if (placeholder) input.placeholder = placeholder;
  if (action[key] !== undefined && action[key] !== null && action[key] !== '') {
    input.value = action[key];
  }
  input.addEventListener('input', (event) => {
    const raw = event.target.value;
    if (raw === '') {
      action[key] = '';
      return;
    }
    const parsed = Number(raw);
    action[key] = Number.isFinite(parsed) ? parsed : action[key];
  });
  field.appendChild(input);
  return field;
}

function createCheckboxField(action, key, label) {
  const field = document.createElement('div');
  field.className = 'action-field action-field-inline';
  const labelEl = document.createElement('label');
  labelEl.className = 'action-checkbox-label';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!action[key];
  input.addEventListener('change', (event) => {
    action[key] = event.target.checked;
  });
  labelEl.appendChild(input);
  labelEl.appendChild(document.createTextNode(label));
  field.appendChild(labelEl);
  return field;
}

function createMatchField(action) {
  const field = document.createElement('div');
  field.className = 'action-field';
  const label = document.createElement('label');
  label.textContent = 'Parinkties tipas';
  field.appendChild(label);
  const select = document.createElement('select');
  const options = [
    { value: 'text', label: 'Pagal teksta' },
    { value: 'value', label: 'Pagal value reiksme' }
  ];
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  select.value = action.optionMatch || 'text';
  select.addEventListener('change', (event) => {
    action.optionMatch = event.target.value === 'value' ? 'value' : 'text';
  });
  field.appendChild(select);
  return field;
}

function buildActionFlags(action) {
  const flags = document.createElement('div');
  flags.className = 'action-flags';

  const allowLabel = document.createElement('label');
  allowLabel.className = 'action-flag';
  const allowInput = document.createElement('input');
  allowInput.type = 'checkbox';
  allowInput.checked = !!action.allowFailure;
  allowInput.addEventListener('change', (event) => {
    action.allowFailure = event.target.checked;
  });
  allowLabel.appendChild(allowInput);
  allowLabel.appendChild(document.createTextNode('Ignoruoti klaidą'));
  flags.appendChild(allowLabel);

  if (ACTIONS_SUPPORT_SKIP_IF_EMPTY.has(action.type)) {
    const skipLabel = document.createElement('label');
    skipLabel.className = 'action-flag';
    const skipInput = document.createElement('input');
    skipInput.type = 'checkbox';
    skipInput.checked = !!action.skipIfEmpty;
    skipInput.addEventListener('change', (event) => {
      action.skipIfEmpty = event.target.checked;
    });
    skipLabel.appendChild(skipInput);
    skipLabel.appendChild(document.createTextNode('Praleisti, jei tuščia'));
    flags.appendChild(skipLabel);
  }

  return flags;
}

async function ensureEhrTab(options = {}) {
  const tabs = await chrome.tabs.query({ url: EHR_URL_PATTERN });
  if (!tabs.length) {
    throw new Error('Atidarykite EHR langą (https://esis.siauliuligonine.lt).');
  }
  const target = tabs.find(tab => tab.active) || tabs[0];
  if (options.focus) {
    try {
      await chrome.windows.update(target.windowId, { focused: true });
      await chrome.tabs.update(target.id, { active: true });
    } catch (error) {
      console.warn('Nepavyko aktyvuoti EHR lango', error);
    }
  }
  return target;
}

async function sendActionToEhr(action, { preview = false } = {}) {
  if (!action || typeof action !== 'object') {
    throw new Error('Veiksmo duomenys neteisingi.');
  }
  const tab = await ensureEhrTab();
  const message = { type: 'ehrqo-run-action', action, preview };
  return await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function testAction(action) {
  try {
    const serialized = serializeAction(action);
    if (!serialized) {
      throw new Error('Veiksmas turi buti uzpildytas pries testavima.');
    }
    const preview = await sendActionToEhr(serialized, { preview: true });
    if (!preview || preview.ok === false) {
      throw new Error((preview && preview.error) || 'Nepavyko testuoti veiksmo.');
    }
    const result = preview.result || {};
    const matchCount = result.matchedCount !== undefined ? result.matchedCount : 0;
    setStatus(`Veiksmo testas baigtas. Rasta ${matchCount} elementų.`, matchCount ? 'success' : 'info');

    if (matchCount && ['click','setValue','selectOption','setChecked','clickText'].includes(serialized.type)) {
      if (confirm('Vykdyti si veiksma dabar?')) {
        const execute = await sendActionToEhr(serialized, { preview: false });
        if (!execute || execute.ok === false) {
          throw new Error((execute && execute.error) || 'Veiksmo ivykdyti nepavyko.');
        }
        setStatus('Veiksmas įvykdytas.', 'success');
      }
    }
  } catch (error) {
    setStatus(error.message || String(error), 'error', true);
  }
}

async function runSelectorTest(targetKey, kind = 'css') {
  const input = document.getElementById(`sel_${targetKey}`);
  if (!input) {
    return;
  }
  const rawValue = (input.value || '').trim();
  const value = sanitizeSelectorValue(rawValue, kind === 'xpath' ? 'xpath' : 'css');
  if (value !== rawValue) {
    input.value = value;
  }
  if (!value) {
    alert('Pirmiausia įveskite selektoriaus reikšmę.');
    return;
  }

  try {
    if (kind === 'xpath') {
      const sample = prompt('Įveskite tekstą, pagal kurį ieškoti:');
      if (sample === null) {
        return;
      }
      const trimmed = sample.trim();
      if (!trimmed) {
        alert('Tekstas negali būti tuščias.');
        return;
      }
      const preview = await sendActionToEhr({ type: 'clickText', xpath: value, text: trimmed }, { preview: true });
      if (!preview || preview.ok === false) {
        throw new Error((preview && preview.error) || 'Nepavyko patikrinti xpath.');
      }
      const count = preview.result?.matchedCount ?? 0;
      setStatus(`Rasta ${count} elementų pagal įvestą tekstą.`, count ? 'success' : 'info');
      if (count && confirm('Paspausti pirmą atitikmenį?')) {
        const exec = await sendActionToEhr({ type: 'clickText', xpath: value, text: trimmed }, { preview: false });
        if (!exec || exec.ok === false) {
          throw new Error((exec && exec.error) || 'Veiksmo nepavyko ivykdyti.');
        }
        setStatus('Elementas paspaustas.', 'success');
      }
      return;
    }

    const preview = await sendActionToEhr({ type: 'highlight', selector: value, selectorKey: targetKey }, { preview: true });
    if (!preview || preview.ok === false) {
      throw new Error((preview && preview.error) || 'Nepavyko patikrinti selektoriaus.');
    }
    const count = preview.result?.matchedCount ?? 0;
    setStatus(`Rasta ${count} elementų su šiuo selektoriumi.`, count ? 'success' : 'info');
    if (count && confirm('Paspausti elementą dabar?')) {
      const exec = await sendActionToEhr({ type: 'click', selector: value, selectorKey: targetKey }, { preview: false });
      if (!exec || exec.ok === false) {
        throw new Error((exec && exec.error) || 'Veiksmo nepavyko ivykdyti.');
      }
      setStatus('Elementas paspaustas.', 'success');
    }
  } catch (error) {
    setStatus(error.message || String(error), 'error', true);
  }
}




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
  Object.keys(currentSelectors).forEach((key) => {
    currentSelectors[key] = sanitizeSelectorValue(currentSelectors[key], 'css');
  });
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

  document.querySelectorAll('.test-selector').forEach((button) => {
    if (button.dataset.testListener) return;
    const target = button.dataset.target || button.getAttribute('data-target');
    if (!target) return;
    const kind = button.dataset.kind || button.getAttribute('data-kind') || 'css';
    button.addEventListener('click', () => runSelectorTest(target, kind));
    button.dataset.testListener = 'true';
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

  const testButton = document.createElement('button');
  testButton.type = 'button';
  testButton.className = 'small-btn ghost test-selector';
  testButton.dataset.target = key;
  testButton.dataset.kind = type === 'css' ? 'css' : 'xpath';
  testButton.textContent = 'Test';

  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.className = 'small-btn pick-selector';
  pickButton.dataset.target = key;
  pickButton.textContent = 'Pasirinkti';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'small-btn danger remove-selector';
  removeButton.dataset.type = type;
  removeButton.dataset.key = key;
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => handleRemoveCustomSelector(type, key));

  actions.append(testButton, pickButton, removeButton);
  row.append(label, input, actions);

  return row;
}

function updateSelectorsFromFields() {
  selectorKeys.forEach((key) => {
    const input = document.getElementById('sel_' + key);
    if (input) {
      currentSelectors[key] = sanitizeSelectorValue(input.value, 'css');
      input.value = currentSelectors[key];
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
  let targetTab;
  try {
    targetTab = await ensureEhrTab({ focus: true });
  } catch (error) {
    alert(error.message);
    return;
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
    const response = await sendMessage(targetTab.id);
    if (response && response.success === false) {
      throw new Error(response.error || 'Nepavyko paleisti selektoriaus rinkiklio.');
    }
  } catch (error) {
    const missingReceiver = error.message.includes('Receiving end does not exist');
    const portClosed = error.message.includes('The message port closed before a response was received.');
    if (missingReceiver || portClosed) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id, allFrames: true },
          files: ['selector-picker.js']
        });
        const retryResponse = await sendMessage(targetTab.id);
        if (retryResponse && retryResponse.success === false) {
          throw new Error(retryResponse.error || 'Nepavyko paleisti selektoriaus rinkiklio.');
        }
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
      const sanitized = sanitizeSelectorValue(css, selectorKeySet.has(targetField) ? 'css' : undefined);
      input.value = sanitized;
      input.classList.remove('picker-active');
      if (selectorKeySet.has(targetField)) {
        currentSelectors[targetField] = sanitized;
      }
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

  if (!recipe?.id || typeof recipe.id !== 'string') {
    errors.push('Recipe must have a string ID');
  } else if (!/^[a-z0-9_]+$/.test(recipe.id)) {
    errors.push('Recipe ID must contain only lowercase letters, numbers, and underscores');
  }

  if (recipe?.hotkey !== undefined && typeof recipe.hotkey !== 'string') {
    errors.push('Recipe hotkey must be a string if provided');
  } else if (recipe?.hotkey && !/^(Ctrl|Alt|Shift|\+|\w|\d)+$/.test(recipe.hotkey.replace(/\s+/g, ''))) {
    errors.push('Recipe hotkey format must be like "Ctrl+1" or "Alt+S"');
  }

  if (!recipe?.label || typeof recipe.label !== 'string') {
    errors.push('Recipe must have a label');
  }

  if (!recipe.category) recipe.category = 'General';
  if (typeof recipe.category !== 'string') {
    errors.push('Recipe category must be a string');
  }

  const hasSteps = Array.isArray(recipe.steps) && recipe.steps.length > 0;

  if (hasSteps) {
    recipe.steps.forEach((step, index) => {
      if (!step || typeof step !== 'object') {
        errors.push(`Recipe ${recipe.id}: veiksmas #${index + 1} neteisingas`);
        return;
      }
      if (!step.type || typeof step.type !== 'string') {
        errors.push(`Recipe ${recipe.id}: veiksmas #${index + 1} neturi tipo`);
        return;
      }
      const prepared = prepareActionForUi(step);
      if (ACTIONS_NEED_SELECTOR.has(prepared.type) && !prepared.selector && !prepared.selectorKey) {
        errors.push(`Recipe ${recipe.id}: veiksmas #${index + 1} reikalauja selektoriaus`);
      }
      if (ACTIONS_NEED_VALUE.has(prepared.type) && !prepared.value && !prepared.skipIfEmpty) {
        errors.push(`Recipe ${recipe.id}: veiksmas #${index + 1} reikalauja reiksmes`);
      }
      if (prepared.type === 'clickText' && !prepared.text && !prepared.skipIfEmpty) {
        errors.push(`Recipe ${recipe.id}: veiksmas #${index + 1} reikalauja teksto`);
      }
    });
  } else {
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
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return recipe;
}


function populateCategorySelect() {
  const select = document.getElementById('recipeCategory');
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '<option value="General">General</option>';

  function addOptions(obj, prefix = '') {
    Object.keys(obj).sort().forEach(key => {
      const fullPath = prefix ? `${prefix}/${key}` : key;
      const option = document.createElement('option');
      option.value = fullPath;
      option.textContent = fullPath;
      select.appendChild(option);

      if (Object.keys(obj[key]).length > 0) {
        addOptions(obj[key], fullPath);
      }
    });
  }

  addOptions(categories);

  if (previousValue) {
    const hasMatch = Array.from(select.options).some(option => option.value === previousValue);
    if (hasMatch) {
      select.value = previousValue;
    }
  }
}


function showRecipeModal(recipe = null) {
  editingRecipe = recipe;
  populateCategorySelect();
  document.getElementById('recipeModalTitle').textContent = recipe ? 'Redaguoti šabloną' : 'Pridėti šabloną';

  const idInput = document.getElementById('recipeId');
  idInput.value = recipe ? recipe.id : '';
  idInput.disabled = !!recipe;

  document.getElementById('recipeLabel').value = recipe ? recipe.label : '';
  document.getElementById('recipeCategory').value = recipe ? recipe.category : 'General';
  document.getElementById('recipeHotkey').value = recipe ? (recipe.hotkey || '') : '';

  currentRecipeActions = buildActionsForRecipe(recipe);
  renderRecipeActions();

  recipeModal.style.display = 'block';
  document.getElementById(recipe ? 'recipeLabel' : 'recipeId').focus();
}

function hideRecipeModal() {
  recipeModal.style.display = 'none';
  editingRecipe = null;
  recipeForm.reset();
  currentRecipeActions = [];
  renderRecipeActions();
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
      id: document.getElementById('recipeId').value.trim(),
      label: document.getElementById('recipeLabel').value.trim(),
      category: document.getElementById('recipeCategory').value,
      hotkey: (document.getElementById('recipeHotkey').value || '').trim() || undefined
    };

    const actions = sanitizeActions(currentRecipeActions);
    if (!actions.length) {
      throw new Error('Pridėti bent vieną veiksmą šablonui.');
    }

    recipe.steps = actions;
    const derivedConfig = deriveConfigFromActions(actions);
    recipe.config = Object.keys(derivedConfig).length ? derivedConfig : {};

    const recipes = JSON.parse(recEl.value);

    if (editingRecipe) {
      const index = recipes.findIndex(r => r.id === recipe.id);
      if (index !== -1) {
        recipes[index] = { ...recipes[index], ...recipe };
      }
    } else {
      if (recipes.some(r => r.id === recipe.id)) {
        throw new Error(`Recipe with ID "${recipe.id}" already exists`);
      }
      recipes.push(recipe);
    }

    recEl.value = JSON.stringify(recipes, null, 2);
    updateRecipesList(recipes);
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
      setStatus('Išsaugota. Perkraukite savo HIS skirtuką.', 'success');
    });
  } catch (e) {
    setStatus(e.message, 'error', true);
  }

}

function updateRecipesList(recipes) {
  const searchTerm = searchInput.value.toLowerCase();
  const category = categoryFilter.value;

  const categories = ['', ...new Set(recipes.map(r => r.category || 'Bendri'))];
  categoryFilter.innerHTML = categories
    .map(c => `<option value="${c}">${c || 'Visos kategorijos'}</option>`)
    .join('');
  categoryFilter.value = category;

  const filtered = recipes.filter(r => {
    if (category && r.category !== category) return false;
    if (searchTerm) {
      const display = deriveRecipeDisplay(r);
      const haystack = `${r.label} ${r.category || ''} ${display.searchTerm || ''} ${display.dropdownText || ''}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  recipesList.innerHTML = filtered.map(r => {
    const display = deriveRecipeDisplay(r);
    const stepsCount = Array.isArray(r.steps) ? r.steps.length : 0;
    return `
    <div class="recipe-card" data-recipe-id="${r.id}">
      <div class="recipe-header">
        <strong>${r.label}</strong>
        <span class="recipe-category">${r.category || 'Bendri'}</span>
      </div>
      <div class="recipe-content">
        <div class="muted">
          <div><strong>ID:</strong> ${r.id}</div>
          <div><strong>Search:</strong> ${display.searchTerm || ''}</div>
          ${display.dropdownText ? `<div><strong>Tekstas:</strong> ${display.dropdownText}</div>` : ''}
          ${display.room ? `<div><strong>Kambarys:</strong> ${display.room}</div>` : ''}
          ${display.emergency ? '<div>⚡ Skubus</div>' : ''}
          ${r.hotkey ? `<div><strong>Hotkey:</strong> ${r.hotkey}</div>` : ''}
          ${stepsCount ? `<div><strong>Veiksmai:</strong> ${stepsCount}</div>` : ''}
        </div>
      </div>
      <div class="recipe-card-actions">
        <button onclick="showRecipeModal(${JSON.stringify(r)})" class="small-btn">Edit</button>
        <button onclick="deleteRecipe('${r.id}')" class="small-btn danger">Delete</button>
      </div>
    </div>
  `;
  }).join('');
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
        throw new Error("Neteisingas atsarginės kopijos failo formatas");
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
  populateCategorySelect();
  
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
    updateCategoryEditor();
    populateCategorySelect();
    
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
  document.getElementById('addRecipeAction').addEventListener('click', () => addRecipeAction());
  document.getElementById('addDefaultRecipeFlow').addEventListener('click', loadDefaultActionsFlow);
  
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




