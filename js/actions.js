/**
 * NeuraconX — connect actions after multi-step confirmation.
 * Opens real demo/repo/Beach URLs; copies install hints. Progress is brief feedback only.
 */

import { addHistoryEntry, updateHistoryEntry } from "./history.js";
import { primaryConnectTarget, connectOptions } from "./catalog.js";

/**
 * @typedef {Object} ActionRun
 * @property {string} historyId
 * @property {import('./catalog.js').CatalogItem} item
 * @property {'download'|'launch'|'connect'} kind
 * @property {number} progress
 * @property {'running'|'success'|'failed'|'cancelled'} status
 * @property {string} message
 * @property {string|null} [resultLabel]
 * @property {string|null} [resultUrl]
 * @property {ReturnType<typeof connectOptions>} [options]
 * @property {(() => void)|null} cancel
 */

/**
 * @param {import('./catalog.js').CatalogItem} item
 * @param {(run: ActionRun) => void} onUpdate
 * @param {{ autoOpen?: boolean }} [opts]
 * @returns {ActionRun}
 */
export function startConnectAction(item, onUpdate, opts = {}) {
  const autoOpen = opts.autoOpen !== false;
  const primary = primaryConnectTarget(item);
  const kind =
    item.action === "launch"
      ? "launch"
      : item.action === "download"
        ? "download"
        : "connect";

  const history = addHistoryEntry({
    kind,
    itemId: item.id,
    itemName: item.name,
    message: `Connect started · ${primary.label}`,
    status: "running",
  });

  /** @type {ActionRun} */
  const run = {
    historyId: history.id,
    item,
    kind,
    progress: 0,
    status: "running",
    message: `Preparing to ${primary.label.toLowerCase()} for “${item.name}”…`,
    resultLabel: null,
    resultUrl: null,
    options: connectOptions(item),
    cancel: null,
  };

  let cancelled = false;
  let timer = null;
  const durationMs = 900;
  const tickMs = 60;
  const started = Date.now();

  run.cancel = () => {
    cancelled = true;
    if (timer) clearInterval(timer);
    run.status = "cancelled";
    run.message = "Connect cancelled — no tab was opened";
    run.cancel = null;
    updateHistoryEntry(history.id, {
      status: "cancelled",
      message: run.message,
    });
    onUpdate({ ...run });
  };

  onUpdate({ ...run });

  timer = setInterval(() => {
    if (cancelled) return;
    const elapsed = Date.now() - started;
    const t = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - t, 2);
    run.progress = Math.round(eased * 100);

    if (t < 0.5) {
      run.message = `Confirming connect target for “${item.name}”…`;
    } else if (t < 1) {
      run.message =
        primary.kind === "copy"
          ? `Preparing install command…`
          : `Opening ${primary.label.toLowerCase()}…`;
    }

    if (t >= 1) {
      clearInterval(timer);
      run.progress = 100;
      run.cancel = null;
      finishConnect(run, primary, autoOpen, history.id, onUpdate);
      return;
    }

    onUpdate({ ...run });
  }, tickMs);

  return run;
}

/**
 * @param {ActionRun} run
 * @param {ReturnType<typeof primaryConnectTarget>} primary
 * @param {boolean} autoOpen
 * @param {string} historyId
 * @param {(run: ActionRun) => void} onUpdate
 */
function finishConnect(run, primary, autoOpen, historyId, onUpdate) {
  try {
    if (primary.kind === "none") {
      run.status = "failed";
      run.message = `No connect target for “${run.item.name}”.`;
      updateHistoryEntry(historyId, {
        status: "failed",
        message: run.message,
      });
      onUpdate({ ...run });
      return;
    }

    if (primary.kind === "open" && primary.url) {
      run.resultUrl = primary.url;
      run.resultLabel = primary.label;
      if (autoOpen) {
        const win = window.open(primary.url, "_blank", "noopener,noreferrer");
        if (!win) {
          run.status = "success";
          run.message = `Popup blocked. Use the buttons below to open “${run.item.name}”.`;
          updateHistoryEntry(historyId, {
            status: "success",
            message: run.message,
          });
          onUpdate({ ...run });
          return;
        }
      }
      run.status = "success";
      run.message = autoOpen
        ? `${primary.label} — “${run.item.name}” opened in a new tab.`
        : `${primary.label} ready for “${run.item.name}”.`;
    } else if (primary.kind === "copy" && primary.text) {
      run.resultLabel = primary.label;
      // Fire-and-forget copy; UI also offers button
      void copyText(primary.text).then((ok) => {
        run.status = "success";
        run.message = ok
          ? `Install command copied for “${run.item.name}”.`
          : `Could not copy automatically — use Copy install command below.`;
        updateHistoryEntry(historyId, {
          status: "success",
          message: run.message,
        });
        onUpdate({ ...run });
      });
      // Optimistic interim
      run.status = "success";
      run.message = `Install command ready for “${run.item.name}”.`;
    }

    updateHistoryEntry(historyId, {
      status: "success",
      message: run.message,
    });
    onUpdate({ ...run });
  } catch (err) {
    run.status = "failed";
    run.message =
      err instanceof Error ? err.message : "Connect action failed";
    updateHistoryEntry(historyId, {
      status: "failed",
      message: run.message,
    });
    onUpdate({ ...run });
  }
}

/**
 * Execute a secondary connect option (button click).
 * @param {{ kind: 'open'|'copy', url?: string, text?: string, label: string }} option
 */
export async function executeConnectOption(option) {
  if (option.kind === "open" && option.url) {
    window.open(option.url, "_blank", "noopener,noreferrer");
    return { ok: true, message: `${option.label} opened` };
  }
  if (option.kind === "copy" && option.text) {
    const ok = await copyText(option.text);
    return {
      ok,
      message: ok ? "Install command copied to clipboard" : "Copy failed",
    };
  }
  return { ok: false, message: "Unknown option" };
}

/** @param {string} text */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** @deprecated use startConnectAction */
export function startSimulatedAction(item, onUpdate) {
  return startConnectAction(item, onUpdate, { autoOpen: true });
}
