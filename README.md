# EHR Quick ## Configure

- Open the extension's **Options** page.
- Paste correct CSS selectors for your EHR in **Selectors**.
- (Optional) Adjust the `orderSearchItemContains` tag name in **Xpaths** if your dropdown uses a different element (e.g., `div` instead of `li`).
- Customize **Recipes** (labels + config). Save; refresh EHR tab.

## Recipe Management (Coming Soon)

### Organization
- Nested categories for better organization (e.g., "Imaging/Neuro")
- Drag-and-drop recipe ordering
- Quick search and filtering
- Collapsible category sections

### Recipe Creation
- Step-by-step creation wizard
- Predefined templates
- Live preview and validation
- Quick clone and modify
- Template variables support (Chrome MV3)

A small extension that injects a floating panel with buttons for one‑click repeating tasks in your EHR (e.g., Head CT for stroke). Buttons run scripted sequences that click the standard UI fields you use already.

## Install

1. **Edit Domain**: In `manifest.json`, change:
   - `host_permissions` → your real EHR domain (e.g. `https://esis.your-hospital.lt/*`)
   - `content_scripts[].matches` → same domain pattern
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
3. Open your EHR. The panel should appear bottom‑right.

## Configure

- Open the extension’s **Options** page.
- Paste correct CSS selectors for your EHR in **Selectors**.
- (Optional) Adjust the `orderSearchItemContains` tag name in **Xpaths** if your dropdown uses a different element (e.g., `div` instead of `li`).
- Customize **Recipes** (labels + config). Save; refresh EHR tab.

## Development

### Version Control

This project uses Git for version control. To start developing:

1. Clone the repository:
   ```bash
   git clone https://github.com/ruokas/ehr-quick-orders.git
   cd ehr-quick-orders
   ```

2. Make changes to the code

3. Commit your changes:
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

### Testing Changes

1. After making changes, reload the extension in Chrome:
   - Go to `chrome://extensions`
   - Find "EHR Quick Orders"
   - Click the refresh icon

2. Test the changes in your EHR system

## Notes

- No external calls; runs locally in your session.
- If your EHR changes HTML, just update selectors.
- Add more recipes by extending the JSON in Options.

Security tip: Narrow host permissions to the exact EHR domain and paths you need.
