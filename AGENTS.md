# AGENTS.md — NeuraconX

You are working on **NeuraconX only** unless the user asks to edit another suite repo.

## Product

Static browser **intention-native catalog browser / connector** for the NeuraBeach hub (X-related positioning). Browse suite (and fallback) catalog → select → multi-step confirm → open demo / Beach / GitHub / copy install.

- **Suite role:** `app`
- Research / accessibility **simulator** prototype
- **Not** medical · **not** implant software · **not** Neuralink-affiliated

## Boundaries

- Multi-step confirmation **required** before any real connect action (open URL / copy).
- Keyboard simulator must always work; Neurabridge is optional (`ws://127.0.0.1:7711`).
- Prefer live Beach catalog with offline `data/catalog.json` fallback — do not hard-fail on CORS.
- Keep stack simple: static HTML/CSS/JS (no forced Next/React rewrite unless asked).
- On version/demo change: update `LISTING.md` + `neurabeach-manifest.json`.

## Layout

```
index.html
css/styles.css
data/catalog.json
js/
  app.js intentions.js bridge.js catalog.js
  confirmation.js actions.js settings.js history.js
LISTING.md
neurabeach-manifest.json
vercel.json
```

## Commands

```bash
cd ~/Projects/NeuraconX
npx --yes serve .
# or: python3 -m http.server 5173
```

No package build required for the static prototype.

## Commits

Author: Joe \<pileofflapjacks1@gmail.com\>  
Repo: https://github.com/pileofflapjacks1/NeuraconX  
Demo: https://neuraconx.vercel.app
