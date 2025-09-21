// Greiti veiksmai – content script
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

// Example recipes – edit in Options page
const DEFAULT_RECIPES = [
  {
    id: 'ct_head_stroke',
    label: 'Head CT – stroke',
    category: 'Imaging/Neuro',
    config: { 
      searchTerm: 'Head CT',
      dropdownText: 'Stroke protocol head CT (non-contrast)',
      emergency: true,
      room: '12'
    },
    order: 1
  },
  {
    id: 'ct_head_trauma',
    label: 'Head CT – trauma',
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
    label: 'Chest X‑ray – PA/LAT',
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
    label: 'Chest X-ray – portable',
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
    throw new Error(`Baigėsi laukimo laikas ${sel}`);
  },
  async waitForXPathContains(text, timeout = 8000) {
    const start = performance.now();
    const xpath = `//${this.xpaths.orderSearchItemContains}[contains(., "${text.replace(/"/g,'\\"')}")]`;
    while (performance.now() - start < timeout) {
      const it = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const el = it.singleNodeValue;
      if (el && isVisible(el)) return el;
      await sleep(100);
    }
    throw new Error(`Baigėsi laukimo laikas ${text}`);
  },
  async click(el) { el.click(); await sleep(120); },
  async safeClick(sel) { const el = await this.waitFor(sel); await this.click(el); },
  async clickXPathContains(text) {
    const el = await this.waitForXPathContains(text);
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
async function runRecipe(recipe, selectors) {
  const { searchTerm, dropdownText, room, emergency } = recipe.config || {};
  api.selectors = selectors.selectors;
  api.xpaths = selectors.xpaths;

  await api.status('Atidaromi užsakymai…');
  await api.safeClick(api.selectors.ordersMenuBtn);
  await api.safeClick(api.selectors.newOrderBtn);
  // modal optional – ignore errors
  try { await api.waitFor(api.selectors.modalRoot, 6000); } catch (_) {}

  await api.status(`Pasirenkama ${searchTerm}…`);
  await api.setValue(api.selectors.orderSearchInput, searchTerm);
  await api.clickXPathContains(searchTerm);

  if (dropdownText) {
    await api.status('Nustatomas užsakymo tekstas…');
    await api.selectByVisibleText(api.selectors.orderTextDropdown, dropdownText);
  }
  if (room) {
    await api.status('Kambarys…');
    await api.setValue(api.selectors.roomInput, room);
  }
  if (typeof emergency === 'boolean') {
    await api.status('Prioritetas…');
    await api.setChecked(api.selectors.emergencyCheckbox, emergency);
  }

  await api.status('Pateikiama…');
  await api.safeClick(api.selectors.submitBtn);
  await api.status('Baigta ✅');
}

// ---------------- UI injection ----------------
function injectPanel(state) {
  if (document.getElementById('ehrqo-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ehrqo-panel';
  panel.innerHTML = `
    <div id="ehrqo-card" role="region" aria-label="EHR Quick Orders">
      <header>
        <span>Greiti veiksmai</span>
        <div>
          <button id="ehrqo-min" title="Minimize">—</button>
          <button id="ehrqo-close" title="Hide">✕</button>
        </div>
      </header>
      <div id="ehrqo-list"></div>
      <div id="ehrqo-status" class="ehrqo-muted"></div>
    </div>
  `;
  document.body.appendChild(panel);

  // Draggable (by card)
  const card = panel.querySelector('#ehrqo-card');
  let drag = { x: 0, y: 0, dx: 0, dy: 0, active: false };
  card.addEventListener('mousedown', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest('button')) return;
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

  // Build buttons
  const list = panel.querySelector('#ehrqo-list');
  
  // Group by category
  const categories = {};
  state.recipes.forEach(r => {
    const cat = r.category || 'Bendri';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  });
  
  // Search input
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Ieškoti receptų...';
  search.className = 'ehrqo-search';
  list.appendChild(search);
  
  const content = document.createElement('div');
  content.className = 'ehrqo-content';
  list.appendChild(content);
  
  function renderRecipes(filter = '') {
    content.innerHTML = '';
    const lFilter = filter.toLowerCase();
    
    Object.entries(categories).forEach(([category, recipes]) => {
      // Filter recipes
      const filtered = recipes.filter(r => 
        !filter || 
        r.label.toLowerCase().includes(lFilter) ||
        r.config.searchTerm.toLowerCase().includes(lFilter)
      );
      
      if (filtered.length === 0) return;
      
      // Add category header
      const header = document.createElement('div');
      header.className = 'ehrqo-category';
      header.textContent = category;
      content.appendChild(header);
      
      // Add recipe buttons
      const grid = document.createElement('div');
      grid.className = 'ehrqo-grid';
      filtered.forEach(r => {
        const b = document.createElement('button');
        b.className = 'ehrqo-btn';
        b.textContent = r.label;
        b.dataset.recipe = r.id;
        if (r.config.emergency) b.classList.add('emergency');
        grid.appendChild(b);
      });
      content.appendChild(grid);
    });
  }
  
  // Initial render
  renderRecipes();
  
  // Search handler
  search.addEventListener('input', (e) => renderRecipes(e.target.value));

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
      api.status(`⚠️ ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  panel.querySelector('#ehrqo-min').addEventListener('click', () => {
    const list = panel.querySelector('#ehrqo-list');
    list.style.display = list.style.display === 'none' ? 'grid' : 'none';
  });
  panel.querySelector('#ehrqo-close').addEventListener('click', () => panel.remove());
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
    injectPanel(state);
    // Re-mount on SPA changes
    const obs = new MutationObserver(() => injectPanel(state));
    obs.observe(document.documentElement, { childList: true, subtree: true });
    console.log('[HIS greiti veiksmai] įkrautas');
  } catch (e) {
    console.error('[HIS greiti veiksmai] init error', e);
  }
})();
