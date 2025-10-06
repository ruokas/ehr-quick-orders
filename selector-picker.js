// Selector picker - injects UI for selecting elements and generating selectors
class SelectorPicker {
  constructor() {
    this.isActive = false;
    this.highlightedElement = null;
    this.overlay = null;
    this.tooltip = null;
    this.targetField = null;
    this.wasPicked = false;
  }

  cssEscape(value) {
    if (value === undefined || value === null) {
      return '';
    }
    const css = window.CSS;
    if (css && typeof css.escape === 'function') {
      return css.escape(String(value));
    }
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\]^`{|}~])/g, '\\$1');
  }

  toXPathLiteral(value) {
    const str = String(value);
    if (!str.includes("'")) {
      return '\'' + str + '\'';
    }
    if (!str.includes('"')) {
      return '"' + str + '"';
    }
    const parts = str.split("'");
    let literal = 'concat(';
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        literal += ", '\\'', ";
      }
      literal += '\'' + parts[i] + '\'';
    }
    literal += ')';
    return literal;
  }

  start(targetField) {
    if (this.isActive) return;
    this.isActive = true;
    this.targetField = targetField;
    this.wasPicked = false;
    
    this.injectUI();
    this.addEventListeners();
    
    document.body.style.cursor = 'crosshair';
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    const targetField = this.targetField;
    const wasPicked = this.wasPicked;

    this.removeHighlight();
    this.overlay?.remove();
    this.tooltip?.remove();

    this.overlay = null;
    this.tooltip = null;

    document.body.style.cursor = '';
    this.removeEventListeners();

    this.targetField = null;
    this.wasPicked = false;

    if (targetField && !wasPicked) {
      chrome.runtime.sendMessage({
        type: 'selector-picker-cancelled',
        data: { targetField }
      }, () => void chrome.runtime.lastError);
    }
  }
  injectUI() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'ehrqo-picker-overlay';
    document.body.appendChild(this.overlay);

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'ehrqo-picker-tooltip';
    document.body.appendChild(this.tooltip);

    // Add styles if not already present
    if (!document.querySelector('#ehrqo-picker-styles')) {
      const style = document.createElement('style');
      style.id = 'ehrqo-picker-styles';
      style.textContent = `
        .ehrqo-picker-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.1);
          pointer-events: none;
          z-index: 10000;
        }
        
        .ehrqo-picker-tooltip {
          position: fixed;
          background: #1e1e1e;
          color: #e0e0e0;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          pointer-events: none;
          z-index: 10001;
          max-width: 300px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .ehrqo-highlight {
          outline: 2px solid #0078d4 !important;
          outline-offset: 1px !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  generateSelector(el) {
    if (!el || !el.tagName) {
      return '';
    }

    const selectors = [];
    const seen = new Set();
    const addSelector = (candidate) => {
      if (!candidate) return;
      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      selectors.push(normalized);
    };

    if (el.id) {
      addSelector(`#${this.cssEscape(el.id)}`);
    }

    const nameAttr = el.getAttribute ? el.getAttribute('name') : null;
    if (nameAttr) {
      addSelector(`[name="${this.cssEscape(nameAttr)}"]`);
    }

    if (el.classList && el.classList.length) {
      const classSelectors = Array.from(el.classList)
        .filter((c) => c && !c.startsWith('ehrqo-'))
        .map((c) => `.${this.cssEscape(c)}`)
        .join('');
      if (classSelectors) {
        addSelector(`${el.tagName.toLowerCase()}${classSelectors}`);
      }
    }

    let ancestor = el;
    let steps = 0;
    const pathSegments = [el.tagName.toLowerCase()];
    while (ancestor && steps < 3) {
      ancestor = ancestor.parentElement;
      if (!ancestor) {
        break;
      }
      if (ancestor.id) {
        addSelector(`#${this.cssEscape(ancestor.id)} > ${pathSegments.join(' > ')}`);
        break;
      }
      pathSegments.unshift(ancestor.tagName.toLowerCase());
      steps += 1;
    }

    if (typeof el.getAttributeNames === 'function') {
      const attrs = el.getAttributeNames()
        .filter((attr) => !['class', 'style', 'id'].includes(attr))
        .map((attr) => {
          const value = el.getAttribute(attr);
          if (value === null || value === undefined || value === '') {
            return null;
          }
          return `[${attr}="${this.cssEscape(value)}"]`;
        })
        .filter(Boolean)
        .join('');
      if (attrs) {
        addSelector(`${el.tagName.toLowerCase()}${attrs}`);
      }
    }

    for (const selector of selectors) {
      try {
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1 && matches[0] === el) {
          return selector;
        }
      } catch (err) {
        continue;
      }
    }

    return selectors[0] || el.tagName.toLowerCase();
  }

  generateXPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const parts = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `[@id=${this.toXPathLiteral(current.id)}]`;
      } else if (current.classList && current.classList.length) {
        const className = current.classList[0];
        if (className) {
          selector += `[contains(@class, ${this.toXPathLiteral(className)})]`;
        }
      }

      let count = 0;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          count += 1;
        }
        sibling = sibling.previousElementSibling;
      }

      if (count > 0) {
        selector += `[${count + 1}]`;
      }

      parts.unshift(selector);

      if (current.id) {
        break;
      }

      current = current.parentElement;
    }

    return `//${parts.join('/')}`;
  }
  updateTooltip(e) {
    if (!this.tooltip) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === this.overlay || el === this.tooltip) return;

    if (this.highlightedElement !== el) {
      this.removeHighlight();
      el.classList.add('ehrqo-highlight');
      this.highlightedElement = el;
    }

    const cssSelector = this.generateSelector(el);
    const xpath = this.generateXPath(el);

    this.tooltip.textContent = '';

    const intro = document.createElement('div');
    intro.style.marginBottom = '4px';
    intro.textContent = 'Click to select this element:';

    const cssLine = document.createElement('div');
    cssLine.style.color = '#66d9ef';
    cssLine.textContent = `CSS: ${cssSelector}`;

    const xpathLine = document.createElement('div');
    xpathLine.style.color = '#a6e22e';
    xpathLine.textContent = `XPath: ${xpath}`;

    this.tooltip.append(intro, cssLine, xpathLine);

    const rect = this.tooltip.getBoundingClientRect();
    const x = Math.min(e.clientX + 10, window.innerWidth - rect.width - 10);
    const y = Math.min(e.clientY + 10, window.innerHeight - rect.height - 10);
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  removeHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('ehrqo-highlight');
      this.highlightedElement = null;
    }
  }

  handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === this.overlay || el === this.tooltip) return;

    const selector = this.generateSelector(el);
    const xpath = this.generateXPath(el);

    this.wasPicked = true;

    // Send message back to options page
    chrome.runtime.sendMessage({
      type: 'selector-picked',
      data: {
        css: selector,
        xpath: xpath,
        targetField: this.targetField
      }
    }, () => void chrome.runtime.lastError);

    this.stop();
  }

  addEventListeners() {
    this._onMouseMove = this.updateTooltip.bind(this);
    this._onClick = this.handleClick.bind(this);
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.stop();
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onKeyDown);
  }

  removeEventListeners() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}

// Start picker when receiving message from options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-picker' && message.data?.targetField) {
    const picker = new SelectorPicker();
    picker.start(message.data.targetField);
    sendResponse({ success: true });
  }
});





















