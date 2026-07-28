/**
 * Simulated download / launch actions.
 * No real network downloads; progress is local and deterministic.
 */

import { addHistoryEntry, updateHistoryEntry } from "./history.js";

/**
 * @typedef {Object} ActionRun
 * @property {string} historyId
 * @property {import('./catalog.js').CatalogItem} item
 * @property {'download'|'launch'} kind
 * @property {number} progress // 0–100
 * @property {'running'|'success'|'failed'|'cancelled'} status
 * @property {string} message
 * @property {(() => void)|null} cancel
 */

/**
 * @param {import('./catalog.js').CatalogItem} item
 * @param {(run: ActionRun) => void} onUpdate
 * @returns {ActionRun}
 */
export function startSimulatedAction(item, onUpdate) {
  const kind = item.action === "launch" ? "launch" : "download";
  const history = addHistoryEntry({
    kind,
    itemId: item.id,
    itemName: item.name,
    message: `Simulated ${kind} started`,
    status: "running",
  });

  /** @type {ActionRun} */
  const run = {
    historyId: history.id,
    item,
    kind,
    progress: 0,
    status: "running",
    message:
      kind === "launch"
        ? `Preparing simulated launch of ${item.name}…`
        : `Starting simulated download of ${item.name}…`,
    cancel: null,
  };

  let cancelled = false;
  let timer = null;

  const durationMs = kind === "launch" ? 1800 : 3200;
  const tickMs = 80;
  const started = Date.now();

  run.cancel = () => {
    cancelled = true;
    if (timer) clearInterval(timer);
    run.status = "cancelled";
    run.message = `Simulated ${kind} cancelled`;
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
    // Ease-out progress for a calmer feel
    const eased = 1 - Math.pow(1 - t, 2.2);
    run.progress = Math.round(eased * 100);

    if (t < 0.35) {
      run.message =
        kind === "launch"
          ? `Checking local readiness for ${item.name}…`
          : `Fetching package metadata for ${item.name}…`;
    } else if (t < 0.75) {
      run.message =
        kind === "launch"
          ? `Spinning up simulated runtime…`
          : `Transferring package bytes (simulated)…`;
    } else if (t < 1) {
      run.message =
        kind === "launch"
          ? `Finalizing launch sequence…`
          : `Verifying checksum (simulated)…`;
    }

    if (t >= 1) {
      clearInterval(timer);
      run.progress = 100;
      run.status = "success";
      run.message =
        kind === "launch"
          ? `Simulated launch complete — “${item.name}” is ready (prototype).`
          : `Simulated download complete — “${item.name}” package ready (prototype).`;
      run.cancel = null;
      updateHistoryEntry(history.id, {
        status: "success",
        message: run.message,
      });
    }

    onUpdate({ ...run });
  }, tickMs);

  return run;
}
