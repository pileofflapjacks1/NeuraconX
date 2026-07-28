# NeuraConnect (NeuraconX)

**Intention-native catalog browser and download/launcher connector** for the [Neurabeach](https://neurabeach.com) hub.

This is a **computer-side research and accessibility prototype**. It is **not** a medical device, **not** implant software, and **not affiliated with Neuralink**.

## What it does (v1)

1. Browse a placeholder catalog of Neurabeach suite tools, research apps, and example games  
2. Navigate and highlight items with high-level **intentions** (or keyboard/mouse simulator)  
3. **Select** an item  
4. Complete a **multi-step confirmation** flow (2 steps standard, 3 in strict mode)  
5. Run a **simulated** download or launch with progress feedback and a local history log  

## Quick start

Serve the folder over HTTP (ES modules + `fetch` for catalog JSON):

```bash
cd /Users/joe/Projects/NeuraconX
npx --yes serve .
# or: python3 -m http.server 5173
```

Open the URL shown (e.g. `http://localhost:3000`).

### Simulator controls

| Input | Intention |
|--------|-----------|
| `↑` `↓` `←` `→` | `move_up` / `move_down` / `move_left` / `move_right` |
| `Enter` / `Space` | `select` (also advances confirmation) |
| `Y` | `confirm` |
| `Esc` / `N` / `Backspace` | `cancel` / `back` |
| Click card | highlight + select |

## Project layout

```
NeuraconX/
├── index.html          # Shell UI
├── css/styles.css      # Dark research-hub theme
├── data/catalog.json   # Placeholder catalog (swap for live Neurabeach data)
├── js/
│   ├── app.js          # Orchestrator: catalog → confirm → action
│   ├── intentions.js   # Modular intention bus + keyboard simulator
│   ├── catalog.js      # Load / filter helpers
│   ├── confirmation.js # Multi-step safety copy + state machine
│   ├── actions.js      # Simulated download/launch
│   ├── settings.js     # localStorage settings
│   └── history.js      # Recent actions log
└── README.md
```

## Intention layer

High-level discrete intentions (easy to map from a future NeuralBridge stream):

- `move_up` · `move_down` · `move_left` · `move_right`
- `select` · `confirm` · `cancel` · `back`

Core API (`js/intentions.js`):

```js
import { createIntentionBus } from './js/intentions.js';

const bus = createIntentionBus({ sensitivityMs: 140 });
bus.attachKeyboardSimulator(window);
bus.on('select', (e) => { /* ... */ });
bus.emit({ type: 'move_right', confidence: 1, source: 'external' });

// Future external adapter sketch:
// bus.connectExternal({
//   connect(emit) {
//     const ws = new WebSocket('ws://127.0.0.1:7711');
//     ws.onmessage = (m) => {
//       const data = JSON.parse(m.data);
//       if (data.type) emit({ ...data, source: 'neuralbridge' });
//     };
//     return () => ws.close();
//   }
// });
```

In the running app, the bus is also exposed as `window.NeuraConnect.bus` for console experiments.

## Settings

- **Navigation sensitivity** — debounce for directional intentions  
- **Confirmation strictness** — standard (2 steps) or strict (3 steps)  
- **Intention flash** · **reduce motion** · **reset defaults**  
- Category filter and grid/list view  

Settings and history persist in `localStorage` on this origin.

## Safety stance

- Confirmation language is explicit and multi-step **before** any action runs  
- Downloads/launches are **local simulations** only (no remote package install)  
- Persistent banner + first-load modal restate research/simulator limits  

## Roadmap (not in v1)

- Live Neurabeach API catalog  
- Real NeuralBridge WebSocket backend  
- Actual local package open/download paths  
- Account systems / multi-user features  

## License

Prototype for personal / open-source iteration. Add a license file when you publish.
