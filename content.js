// Greiti veiksmai - content script
// Tip: Adjust host_permissions/matches in manifest.json to your EHR domain.
// Then update selectors below (Options page lets you edit too).

// ---------------- Defaults (overridable via chrome.storage) ----------------
const DEFAULT_SELECTORS = {
  ordersMenuBtn:    'button#orders',             // button that opens "Orders"
  newOrderBtn:      'button#new-order',          // "New order" button
  orderSearchInput: 'input[name="order-search"]',// input to type "Head CT"
  // XPath fragment function is handled separately
  orderTextDropdown:'select#order-text',         // dropdown for prefilled order text
  roomInput:        'input[name="room"]',        // room number input
  emergencyCheckbox:'input[name="emergency"]',   // checkbox
  submitBtn:        'button[type="submit"].order-submit', // final submit
  modalRoot:        '#order-modal'               // modal container (if applicable)
};
const DEFAULT_XPATHS = {
  orderSearchItemContains: 'li' // will match //li[contains(., "TEXT")]
};

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

// Example recipes - edit in Options page
const DEFAULT_RECIPES = [
  {
    id: 'ct_head_stroke',
    label: 'Head CT - stroke',
    category: 'Imaging/Neuro',
    config: { 
      searchTerm: 'Head CT',
      dropdownText: 'Stroke protocol head CT (non-contrast)',
      emergency: true,
      room: '12'
    },
    hotkey: 'Ctrl+1',
    order: 1
  },
  {
    id: 'ct_head_trauma',
    label: 'Head CT - trauma',
    category: 'Imaging/Neuro',
    config: {
      searchTerm: 'Head CT',
      dropdownText: 'Non-contrast head CT',
      emergency: true,
      room: '12'
    },
    order: 2
  },
  {
    id: 'cxr_pa_lat',
    label: 'Chest X-ray - PA/LAT',
    category: 'Imaging/Chest',
    config: {
      searchTerm: 'Chest X-ray',
      dropdownText: 'PA and lateral views',
      emergency: false,
      room: '12'
    },
    order: 1
  },
  {
    id: 'cxr_portable',
    label: 'Chest X-ray - portable',
    category: 'Imaging/Chest',
    config: {
      searchTerm: 'Chest X-ray',
      dropdownText: 'Portable AP view',
      emergency: false,
      room: '12'
    },
    order: 2
  }
];

// ---------------- Utilities ----------------
const $q = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ehrqoState = null;

function hasAdvancedSteps(recipe) {
  return Array.isArray(recipe?.steps) && recipe.steps.length > 0;
}

function deriveRecipeDisplayConfig(recipe) {
  const base = {
    searchTerm: '',
    dropdownText: '',
    room: '',
    emergency: undefined
  };

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
    for (const step of recipe.steps) {
      if (!step || typeof step !== 'object') continue;
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
    }
  }

  return base;
}

function ensureHighlightStyles() {
  if (document.getElementById('ehrqo-highlight-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'ehrqo-highlight-style';
  style.textContent = `
    .ehrqo-highlight {
      outline: 2px solid #22c55e !important;
      outline-offset: 1px !important;
      scroll-margin: 120px;
    }
  `;
  document.head.appendChild(style);
}
function highlightElement(el, duration = 1600) {
  if (!el) return;
  ensureHighlightStyles();
  el.classList.add('ehrqo-highlight');
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (_) {
    el.scrollIntoView();
  }
  setTimeout(() => {
    el.classList.remove('ehrqo-highlight');
  }, duration);
}

function resolveSelectorString(action, selectors) {
  if (!action) return '';
  const direct = (action.selector || '').trim();
  if (direct) return direct;
  const key = (action.selectorKey || '').trim();
  if (!key) return '';
  const value = selectors?.selectors?.[key];
  return typeof value === 'string' ? value : '';
}

function resolveXPathBase(action, selectors) {
  if (!action) return '';
  const direct = (action.xpath || '').trim();
  if (direct) return direct;
  const key = (action.xpathKey || '').trim();
  if (!key) return '';
  const value = selectors?.xpaths?.[key];
  return typeof value === 'string' ? value : '';
}

function isActionEffectivelyEmpty(action) {
  if (!action) return true;
  if (action.type === 'setValue' || action.type === 'selectOption') {
    return !(action.value && String(action.value).trim());
  }
  if (action.type === 'clickText') {
    return !(action.text && String(action.text).trim());
  }
  return false;
}

function normalizeTimeout(value, fallback = 8000) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function buildContainsXPath(base, text) {
  const fragment = (base || '').trim() || '*';
  const literal = String(text ?? '').replace(/"/g, '\"');
  const prefixed = fragment.startsWith('/') || fragment.startsWith('(') ? fragment : `//${fragment}`;
  if (prefixed.includes('contains(')) {
    return prefixed;
  }
  return `${prefixed}[contains(., "${literal}")]`;
}


async function executeAction(action, selectors, options = {}) {
  if (!action || typeof action !== 'object') {
    throw new Error('Invalid action definition');
  }

  const preview = options.preview === true;
  if (action.skipIfEmpty && isActionEffectivelyEmpty(action)) {
    return { skipped: true };
  }

  switch (action.type) {
    case 'status': {
      if (!preview) {
        await api.status(action.text || '');
      }
      return { matchedCount: 0 };
    }
    case 'delay': {
      if (!preview) {
        const delay = normalizeTimeout(action.timeout ?? action.delay ?? 0, 0);
        await sleep(delay);
      }
      return { matchedCount: 0 };
    }
    case 'waitFor': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('waitFor action requires a selector');
      }
      if (preview) {
        const matches = document.querySelectorAll(selector);
        if (!matches.length) {
          throw new Error(`Element not found for selector ${selector}`);
        }
        highlightElement(matches[0]);
        return { matchedCount: matches.length, selector };
      }
      await api.waitFor(selector, normalizeTimeout(action.timeout, 8000));
      return { matchedCount: 1, selector };
    }
    case 'click': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('click action requires a selector');
      }
      if (preview) {
        const matches = document.querySelectorAll(selector);
        if (!matches.length) {
          throw new Error(`Element not found for selector ${selector}`);
        }
        highlightElement(matches[0]);
        return { matchedCount: matches.length, selector };
      }
      await api.safeClick(selector);
      return { matchedCount: 1, selector };
    }
    case 'setValue': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('setValue action requires a selector');
      }
      const value = action.value != null ? String(action.value) : '';
      if (preview) {
        const matches = document.querySelectorAll(selector);
        if (!matches.length) {
          throw new Error(`Element not found for selector ${selector}`);
        }
        highlightElement(matches[0]);
        return { matchedCount: matches.length, selector, value };
      }
      await api.setValue(selector, value);
      return { matchedCount: 1, selector, value };
    }
    case 'selectOption': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('selectOption action requires a selector');
      }
      const value = action.value != null ? String(action.value) : '';
      const match = (action.optionMatch || 'text').toLowerCase();
      if (preview) {
        const el = document.querySelector(selector);
        if (!el) {
          throw new Error(`Element not found for selector ${selector}`);
        }
        highlightElement(el);
        return { matchedCount: el.options ? el.options.length : 0, selector, value };
      }
      const el = await api.waitFor(selector, normalizeTimeout(action.timeout, 8000));
      if (match === 'value') {
        const option = Array.from(el.options || []).find(o => o.value === value);
        if (!option) {
          throw new Error(`Option value '${value}' not found`);
        }
        el.value = option.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(100);
      } else {
        await api.selectByVisibleText(selector, value);
      }
      return { matchedCount: 1, selector, value };
    }
    case 'setChecked': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('setChecked action requires a selector');
      }
      const checked = !!action.checked;
      if (preview) {
        const el = document.querySelector(selector);
        if (!el) {
          throw new Error(`Element not found for selector ${selector}`);
        }
        highlightElement(el);
        return { matchedCount: 1, selector, checked, current: !!el.checked };
      }
      await api.setChecked(selector, checked);
      return { matchedCount: 1, selector, checked };
    }
    case 'clickText': {
      const base = resolveXPathBase(action, selectors) || selectors?.xpaths?.orderSearchItemContains;
      const textValue = action.text != null ? String(action.text) : '';
      if (!textValue.trim()) {
        throw new Error('clickText action requires the text to search');
      }
      if (preview) {
        const xpath = buildContainsXPath(base, textValue);
        const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const count = snapshot.snapshotLength;
        if (!count) {
          throw new Error(`XPath element not found for text '${textValue}'`);
        }
        highlightElement(snapshot.snapshotItem(0));
        return { matchedCount: count, xpath };
      }
      await api.clickXPathContains(textValue, { base, timeout: normalizeTimeout(action.timeout, 8000) });
      return { matchedCount: 1, text: textValue };
    }
    case 'highlight': {
      const selector = resolveSelectorString(action, selectors);
      if (!selector) {
        throw new Error('highlight action requires a selector');
      }
      const matches = document.querySelectorAll(selector);
      if (!matches.length) {
        throw new Error(`Element not found for selector ${selector}`);
      }
      highlightElement(matches[0]);
      return { matchedCount: matches.length, selector };
    }
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function runAdvancedRecipe(recipe, selectors) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  for (const action of steps) {
    try {
      await executeAction(action, selectors, { preview: false });
    } catch (error) {
      if (action && action.allowFailure) {
        console.warn('[ehrqo] Action failed but is marked optional', action, error);
        continue;
      }
      throw error;
    }
  }
}

async function runAdvancedRecipe(recipe, selectors) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  for (const action of steps) {
    try {
      await executeAction(action, selectors, { preview: false });
    } catch (error) {
      if (action && action.allowFailure) {
        console.warn('[ehrqo] Action failed but is marked optional', action, error);
        continue;
      }
      throw error;
    }
  }
}

function isVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const api = {
  selectors: { ...DEFAULT_SELECTORS },
  xpaths: { ...DEFAULT_XPATHS },
  statusEl: null,

  async status(msg) { if (this.statusEl) this.statusEl.textContent = msg; },
  async waitFor(sel, timeout = 8000) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const el = $q(sel);
      if (el && isVisible(el)) return el;
      await sleep(100);
    }
    throw new Error(`Baigesi laukimo laikas ${sel}`);
  },
  async waitForXPathContains(text, options = {}) {

    let timeout = 8000;

    let base = this.xpaths.orderSearchItemContains;

    if (typeof options === 'number') {

      timeout = options;

    } else if (options && typeof options === 'object') {

      timeout = options.timeout ?? timeout;

      if (options.base) {

        base = options.base;

      }

    }

    const xpath = buildContainsXPath(base, text);

    const start = performance.now();

    while (performance.now() - start < timeout) {

      const it = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);

      const el = it.singleNodeValue;

      if (el && isVisible(el)) return el;

      await sleep(100);

    }

    throw new Error(`Baigesi laukimo laikas ${text}`);

  },

  async clickXPathContains(text, options = {}) {

    const el = await this.waitForXPathContains(text, options);

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await sleep(100);

  },
  async setValue(sel, value) {
    const el = await this.waitFor(sel);
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
  },
  async setChecked(sel, checked) {
    const el = await this.waitFor(sel);
    if (el.checked !== checked) { el.click(); await sleep(80); }
  },
  async selectByVisibleText(sel, text) {
    const el = await this.waitFor(sel);
    const opt = Array.from(el.options).find(o => (o.textContent || '').trim() === text.trim());
    if (!opt) throw new Error(`Pasirinkimas nerastas: ${text}`);
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);
  }
};

// ---------------- Automation runner ----------------
async function runLegacyRecipe(recipe, selectors) {
  const { searchTerm, dropdownText, room, emergency } = recipe.config || {};
  api.selectors = selectors.selectors;
  api.xpaths = selectors.xpaths;

  await api.status('Atidaromi užsakymai...');
  await api.safeClick(api.selectors.ordersMenuBtn);
  await api.safeClick(api.selectors.newOrderBtn);
  // modal optional - ignore errors
  try { await api.waitFor(api.selectors.modalRoot, 6000); } catch (_) {}

  await api.status(`Pasirenkama ${searchTerm}...`);
  await api.setValue(api.selectors.orderSearchInput, searchTerm);
  await api.clickXPathContains(searchTerm);

  if (dropdownText) {
    await api.status('Nustatomas užsakymo tekstas...');
    await api.selectByVisibleText(api.selectors.orderTextDropdown, dropdownText);
  }
  if (room) {
    await api.status('Kambarys...');
    await api.setValue(api.selectors.roomInput, room);
  }
  if (typeof emergency === 'boolean') {
    await api.status('Prioritetas...');
    await api.setChecked(api.selectors.emergencyCheckbox, emergency);
  }

  await api.status('Pateikiama...');
  await api.safeClick(api.selectors.submitBtn);
  await api.status('Baigta.');
}


async function runRecipe(recipe, selectors) {

  api.selectors = selectors.selectors;

  api.xpaths = selectors.xpaths;

  if (hasAdvancedSteps(recipe)) {

    await runAdvancedRecipe(recipe, selectors);

  } else {

    await runLegacyRecipe(recipe, selectors);

  }

}
// ---------------- UI injection ----------------
function injectPanel(state) {
  if (document.getElementById('ehrqo-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ehrqo-panel';
  panel.innerHTML = `
    <style>
      #ehrqo-panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
      }
      #ehrqo-card {
        background: #1e1e1e;
        color: #e0e0e0;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        width: 280px;
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
      }
      #ehrqo-card header {
        padding: 8px 12px;
        border-bottom: 1px solid #333;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
      }
      #ehrqo-card header button {
        padding: 2px 6px;
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        opacity: 0.7;
      }
      #ehrqo-card header button:hover { 
        opacity: 1;
        color: #e0e0e0;
      }
      
      #ehrqo-list {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        max-height: 400px;
      }
      
      .ehrqo-search {
        width: 100%;
        padding: 4px 8px;
        border: 1px solid #444;
        border-radius: 4px;
        background: #252525;
        color: #e0e0e0;
        font-size: 13px;
        margin-bottom: 6px;
        pointer-events: auto;
        position: relative;
        z-index: 1;
      }
      
      .ehrqo-search:focus {
        outline: none;
        border-color: #0078d4;
      }
      
      .ehrqo-btn {
        padding: 6px 8px;
        border: 1px solid #333;
        border-radius: 4px;
        background: #252525;
        color: #e0e0e0;
        cursor: pointer;
        text-align: left;
        font-size: 13px;
        line-height: 1.2;
        transition: background 0.2s;
        width: 100%;
      }
      
      .ehrqo-btn:hover {
        background: #333;
      }
      
      .ehrqo-btn:active {
        background: #404040;
      }
      
      .ehrqo-btn.emergency {
        background: #331f1f;
      }
      
      .ehrqo-btn.emergency:hover {
        background: #402424;
      }
      
      .ehrqo-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .ehrqo-muted {
        padding: 6px 8px;
        color: #888;
        font-size: 11px;
        text-align: center;
      }
      
      .ehrqo-empty {
        text-align: center;
        color: #888;
        padding: 12px;
        font-size: 13px;
      }
      
      .ehrqo-btn:focus {
        outline: 1px solid #0078d4;
      }

      .ehrqo-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .ehrqo-hotkey {
        font-size: 11px;
        opacity: 0.7;
        background: #333;
        padding: 2px 4px;
        border-radius: 3px;
        margin-left: 8px;
      }
      
      @keyframes status-fade {
        0% { opacity: 0; transform: translateY(8px); }
        10% { opacity: 1; transform: translateY(0); }
        90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-8px); }
      }
      
      #ehrqo-status:not(:empty) {
        animation: status-fade 2.5s ease-in-out forwards;
      }
    </style>
    <div id="ehrqo-card" role="region" aria-label="EHR Quick Orders">
      <header>
        <span>Greiti veiksmai</span>
        <div>
          <button id="ehrqo-min" title="Minimize">–</button>
          <button id="ehrqo-close" title="Hide">×</button>
        </div>
      </header>
      <div id="ehrqo-list">
        <input type="text" class="ehrqo-search" placeholder="Ieškoti receptų..." id="ehrqo-search">
        <div id="ehrqo-content"></div>
      </div>
      <div id="ehrqo-status" class="ehrqo-muted"></div>
    </div>
  `;
  document.body.appendChild(panel);

  // Draggable (by card)
  const card = panel.querySelector('#ehrqo-card');
  let drag = { x: 0, y: 0, dx: 0, dy: 0, active: false };
  card.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    drag.active = true; drag.x = e.clientX; drag.y = e.clientY;
    const rect = panel.getBoundingClientRect(); drag.dx = rect.left; drag.dy = rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!drag.active) return;
    const nx = drag.dx + (e.clientX - drag.x);
    const ny = drag.dy + (e.clientY - drag.y);
    panel.style.left = `${Math.max(0, nx)}px`;
    panel.style.top  = `${Math.max(0, ny)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => drag.active = false);

  api.statusEl = panel.querySelector('#ehrqo-status');

  // Initialize UI elements
  const search = panel.querySelector('#ehrqo-search');
  const content = panel.querySelector('#ehrqo-content');
  
  function renderRecipes(searchFilter = '') {
    content.innerHTML = '';
    const lFilter = searchFilter.toLowerCase();

    let recipes = state.recipes;
    if (searchFilter) {
      recipes = recipes.filter(r => {
        const display = deriveRecipeDisplayConfig(r);
        const combined = `${r.label} ${r.category || ''} ${display.searchTerm || ''} ${display.dropdownText || ''}`.toLowerCase();
        return combined.includes(lFilter);
      });
    }

    if (recipes.length === 0) {
      content.innerHTML = `
        <div class="ehrqo-empty">
          ${searchFilter ? 'Receptu nerasta.' : 'Nera receptu.'}
        </div>
      `;
      return;
    }

    recipes.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'ehrqo-btn';
      const display = deriveRecipeDisplayConfig(r);
      if (display.emergency) btn.classList.add('emergency');
      btn.dataset.recipe = r.id;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = r.label;
      btn.appendChild(labelSpan);

      if (r.hotkey) {
        const hotkeySpan = document.createElement('span');
        hotkeySpan.className = 'ehrqo-hotkey';
        hotkeySpan.textContent = r.hotkey;
        btn.appendChild(hotkeySpan);
      }

      content.appendChild(btn);
    });
  }

  function renderRecipeGrid(recipes) {
    const grid = document.createElement('div');
    grid.className = 'ehrqo-grid';

    recipes.forEach(r => {
      const display = deriveRecipeDisplayConfig(r);
      const btn = document.createElement('button');
      btn.className = 'ehrqo-btn';
      btn.dataset.recipe = r.id;
      if (display.emergency) btn.classList.add('emergency');

      const searchText = (display.searchTerm || '').trim();
      const dropdownText = display.dropdownText || '';

      btn.innerHTML = `
        <div>${r.label}</div>
        <div class="ehrqo-details">
          ${searchText}
          ${dropdownText ? `<br>${dropdownText}` : ''}
        </div>
      `;

      grid.appendChild(btn);
    });

    content.appendChild(grid);
  }

  // Initial render
  renderRecipes();
  
  // Search handlers
  search.addEventListener('input', (e) => {
    renderRecipes(e.target.value);
  });
  
  search.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  search.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  
  // Click handler
  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('button.ehrqo-btn');
    if (!btn) return;
    const id = btn.dataset.recipe;
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    try {
      btn.disabled = true;
      await runRecipe(recipe, state.selectors);
    } catch (err) {
      console.error(err);
      api.status(`[!] ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });
  
  // Keyboard navigation
  panel.addEventListener('keydown', (e) => {
    if (e.key === '/' || e.key === 'f') {
      e.preventDefault();
      search.focus();
    } else if (e.target === search && e.key === 'Escape') {
      e.preventDefault();
      search.value = '';
      renderRecipes('');
    } else if (e.key === 'ArrowDown' && e.target === search) {
      e.preventDefault();
      const firstBtn = content.querySelector('button.ehrqo-btn');
      if (firstBtn) firstBtn.focus();
    } else if (e.key === 'Enter' && document.activeElement.matches('button.ehrqo-btn')) {
      e.preventDefault();
      document.activeElement.click();
    } else if (document.activeElement.matches('button.ehrqo-btn')) {
      const buttons = [...content.querySelectorAll('button.ehrqo-btn:not(:disabled)')];
      const currentIndex = buttons.indexOf(document.activeElement);
      let nextIndex;
      
      if (e.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (e.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else {
        return;
      }
      
      e.preventDefault();
      buttons[nextIndex].focus();
    }
  });

  panel.querySelector('#ehrqo-min').addEventListener('click', () => {
    const list = panel.querySelector('#ehrqo-list');
    list.style.display = list.style.display === 'none' ? 'grid' : 'none';
  });
  panel.querySelector('#ehrqo-close').addEventListener('click', () => panel.remove());
}

// ---------------- Hotkey handling ----------------
function parseHotkey(hotkeyStr) {
  if (!hotkeyStr) return null;
  const parts = hotkeyStr.split('+').map(p => p.trim().toLowerCase());
  return {
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    key: parts[parts.length - 1]
  };
}

function matchesHotkey(event, hotkey) {
  if (!hotkey) return false;
  const parsed = parseHotkey(hotkey);
  return event.ctrlKey === parsed.ctrl &&
         event.altKey === parsed.alt &&
         event.shiftKey === parsed.shift &&
         event.key.toLowerCase() === parsed.key;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'ehrqo-run-action') {
    const selectors = ehrqoState?.selectors || { selectors: DEFAULT_SELECTORS, xpaths: DEFAULT_XPATHS };
    (async () => {
      try {
        const result = await executeAction(message.action, selectors, { preview: !!message.preview });
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === 'ehrqo-run-actions') {
    const selectors = ehrqoState?.selectors || { selectors: DEFAULT_SELECTORS, xpaths: DEFAULT_XPATHS };
    const actions = Array.isArray(message.actions) ? message.actions : [];
    (async () => {
      try {
        for (const action of actions) {
          await executeAction(action, selectors, { preview: !!message.preview });
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  }
});

function setupHotkeyListener(recipes, selectors) {
  document.addEventListener('keydown', async (e) => {
    // Don't trigger hotkeys when typing in input fields
    if (e.target.matches('input, textarea')) return;
    
    const matchingRecipe = recipes.find(r => r.hotkey && matchesHotkey(e, r.hotkey));
    if (matchingRecipe) {
      e.preventDefault();
      try {
        await runRecipe(matchingRecipe, selectors);
      } catch (err) {
        console.error(err);
        api.status(`[!] ${err.message}`);
      }
    }
  });
}

// ---------------- Load settings then mount ----------------
async function loadState() {
  const key = ['ehrqo_selectors','ehrqo_recipes'];
  const p = new Promise(res => chrome.storage.sync.get(key, res));
  const data = await p;
  const selectors = data.ehrqo_selectors || { selectors: DEFAULT_SELECTORS, xpaths: DEFAULT_XPATHS };
  const recipes   = data.ehrqo_recipes   || DEFAULT_RECIPES;
  return { selectors, recipes };
}

(async function main(){
  try {
    const state = await loadState();
    ehrqoState = state;
    injectPanel(state);
    setupHotkeyListener(state.recipes, state.selectors);
    // Re-mount on SPA changes
    const obs = new MutationObserver(() => injectPanel(state));
    obs.observe(document.documentElement, { childList: true, subtree: true });
    console.log('[HIS greiti veiksmai] ikrautas');
  } catch (e) {
    console.error('[HIS greiti veiksmai] init error', e);
  }
})();






