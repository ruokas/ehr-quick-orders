# EHR Quick Orders (Chrome MV3)

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

## Notes

- No external calls; runs locally in your session.
- If your EHR changes HTML, just update selectors.
- Add more recipes by extending the JSON in Options.

Security tip: Narrow host permissions to the exact EHR domain and paths you need.
