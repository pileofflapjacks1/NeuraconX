# NeuraconX

**NeuraconX** is an **X-related**, intention-native catalog browser and connector for the [Neurabeach](https://neurabeach.com) hub (Joe’s Neura suite).

This is a **computer-side research and accessibility prototype**. It is **not** a medical device, **not** implant software, and **not affiliated with Neuralink**.

## What it does

1. Browse a **Neurabeach-aligned catalog** (live API when reachable, bundled fallback)  
2. Navigate with high-level **intentions** (keyboard simulator and optional **NeuralBridge**)  
3. **Select** an item  
4. Complete a **multi-step confirmation** flow (2 steps standard, 3 strict)  
5. **Connect for real**: open live demo, Neurabeach project page, GitHub, or copy install command  

## Quick start

```bash
cd /Users/joe/Projects/NeuraconX
npx --yes serve .
# or: python3 -m http.server 5173
```

Open the printed URL.

### Simulator controls

| Input | Intention |
|--------|-----------|
| `↑` `↓` `←` `→` | `move_up` / `move_down` / `move_left` / `move_right` |
| `Enter` / `Space` | `select` (also advances confirmation) |
| `Y` | `confirm` |
| `Esc` / `N` / `Backspace` | `cancel` / `back` |
| Click card | highlight + select |

## Features

### 1. Real connect outcomes
After confirmation, NeuraconX opens the item’s **primary target**:
- **Launch** items → live demo URL (new tab)
- **Download** items → GitHub (or Beach page)
- Secondary buttons: Open demo · Open on Neurabeach · Open GitHub · Copy install command

### 2. Live Neurabeach catalog
- Settings → **Prefer live Neurabeach catalog** (default on)
- Fetches `https://neurabeach.com/api/projects`
- On CORS/network failure → bundled `data/catalog.json` (suite URLs + example games)
- Status line shows `catalog:live`, `catalog:merged`, or `catalog:local`

### 3. Optional NeuralBridge intention source
- Settings → Intention source → **NeuralBridge**
- Default URL: `ws://127.0.0.1:7711`
- Connects as protocol v2 **observer**
- Maps bridge intentions (`click`, `select`, `confirm`, `scroll_up`, …) into NeuraconX
- Keyboard remains available as fallback

```bash
# In the neuralbridge package:
npx neuralbridge serve --port 7711
```

## Project layout

```
NeuraconX/
├── index.html
├── css/styles.css
├── data/catalog.json       # Offline fallback + local-only examples
├── js/
│   ├── app.js              # Orchestrator
│   ├── intentions.js       # Intention bus + keyboard simulator
│   ├── bridge.js           # NeuralBridge WebSocket adapter
│   ├── catalog.js          # Local + live load / merge / connect targets
│   ├── confirmation.js     # Multi-step safety copy
│   ├── actions.js          # Open / copy connect actions
│   ├── settings.js
│   └── history.js
└── README.md
```

## Intention layer

```js
// Console / external experiments
window.NeuraconX.bus.emit({ type: 'move_right', confidence: 1, source: 'external' });
window.NeuraconX.bridge.connect();
window.NeuraconX.reloadCatalog();
```

High-level intentions: `move_up` · `move_down` · `move_left` · `move_right` · `select` · `confirm` · `cancel` · `back`

## Safety stance

- Explicit multi-step confirmation **before** any open/copy  
- No silent remote package install  
- Persistent banner + first-load modal  
- Bridge path is local research middleware only — not Neuralink  

## License

Prototype for personal / open-source iteration. Add a license file when you publish.
