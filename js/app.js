/**
 * NeuraconX application orchestrator.
 * Catalog → navigate (intentions/simulator/bridge) → select → multi-step confirm → connect.
 */

import { createIntentionBus, INTENTIONS } from "./intentions.js";
import {
  loadCatalog,
  filterCatalog,
  gridColumnsForWidth,
  categoryLabel,
  statusLabel,
  actionLabel,
  isActionable,
  connectOptions,
} from "./catalog.js";
import {
  loadSettings,
  saveSettings,
  resetSettings,
  acceptDisclaimer,
} from "./settings.js";
import {
  startConfirmation,
  advanceConfirmation,
  cancelConfirmation,
  getStepContent,
} from "./confirmation.js";
import { startConnectAction, executeConnectOption } from "./actions.js";
import { loadHistory, clearHistory } from "./history.js";
import { createNeuralBridgeAdapter } from "./bridge.js";

/** @typedef {import('./catalog.js').CatalogItem} CatalogItem */
/** @typedef {import('./confirmation.js').ConfirmSession} ConfirmSession */
/** @typedef {import('./actions.js').ActionRun} ActionRun */
/** @typedef {import('./settings.js').AppSettings} AppSettings */

const state = {
  /** @type {CatalogItem[]} */
  allItems: [],
  /** @type {CatalogItem[]} */
  visibleItems: [],
  highlightIndex: 0,
  columns: 3,
  /** @type {AppSettings} */
  settings: loadSettings(),
  /** @type {ConfirmSession | null} */
  confirm: null,
  /** @type {ActionRun | null} */
  actionRun: null,
  /** @type {'catalog'|'settings'|'history'} */
  panel: "catalog",
  lastIntention: /** @type {string | null} */ (null),
  catalogSource: /** @type {string} */ ("—"),
  catalogDetail: "",
  bridgeStatus: /** @type {string} */ ("disconnected"),
  bridgeDetail: "",
};

const bus = createIntentionBus({
  sensitivityMs: state.settings.sensitivityMs,
});

const bridge = createNeuralBridgeAdapter({
  emit: (e) => bus.emit(e),
  url: state.settings.bridgeUrl,
  token: state.settings.bridgeToken,
  clientName: "NeuraconX",
  onStatus: (status, detail) => {
    state.bridgeStatus = status;
    state.bridgeDetail = detail || "";
    updateStatusPill();
  },
});

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const els = {
  catalogGrid: $("#catalog-grid"),
  filterBar: $("#filter-bar"),
  highlightMeta: $("#highlight-meta"),
  intentFlash: $("#intent-flash"),
  confirmOverlay: $("#confirm-overlay"),
  confirmDialog: $("#confirm-dialog"),
  confirmTitle: $("#confirm-title"),
  confirmBody: $("#confirm-body"),
  confirmPrimary: $("#confirm-primary"),
  confirmSecondary: $("#confirm-secondary"),
  confirmSteps: $("#confirm-steps"),
  actionPanel: $("#action-panel"),
  actionTitle: $("#action-title"),
  actionMessage: $("#action-message"),
  actionProgress: $("#action-progress"),
  actionBar: $("#action-bar"),
  actionCancel: $("#action-cancel"),
  actionLinks: $("#action-links"),
  historyList: $("#history-list"),
  settingsPanel: $("#settings-panel"),
  catalogPanel: $("#catalog-panel"),
  historyPanel: $("#history-panel"),
  disclaimerModal: $("#disclaimer-modal"),
  disclaimerAccept: $("#disclaimer-accept"),
  banner: $("#disclaimer-banner"),
  statusPill: $("#status-pill"),
  viewToggle: $("#view-toggle"),
  openSettings: $("#open-settings"),
  openHistory: $("#open-history"),
  closeSettings: $("#close-settings"),
  closeHistory: $("#close-history"),
  sensitivity: $("#setting-sensitivity"),
  sensitivityVal: $("#setting-sensitivity-val"),
  strictness: $("#setting-strictness"),
  showFlash: $("#setting-show-flash"),
  reduceMotion: $("#setting-reduce-motion"),
  preferLive: $("#setting-prefer-live"),
  autoOpen: $("#setting-auto-open"),
  intentionSource: $("#setting-intention-source"),
  bridgeUrl: $("#setting-bridge-url"),
  bridgeToken: $("#setting-bridge-token"),
  refreshCatalog: $("#refresh-catalog"),
  resetSettingsBtn: $("#reset-settings"),
  clearHistoryBtn: $("#clear-history"),
  emptyState: $("#empty-state"),
  helpKeys: $("#help-keys"),
  catalogSourceLabel: $("#catalog-source-label"),
};

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function init() {
  applyMotionPreference();
  bindChrome();
  bus.attachKeyboardSimulator(window);
  bus.onAny(handleIntention);
  bus.configure({ sensitivityMs: state.settings.sensitivityMs });

  window.addEventListener("resize", () => {
    state.columns = gridColumnsForWidth(window.innerWidth);
    renderCatalog();
  });
  state.columns = gridColumnsForWidth(window.innerWidth);

  showDisclaimerIfNeeded();
  await reloadCatalog();
  applyIntentionSource();
  renderHistory();
  syncSettingsForm();
  updateStatusPill();
}

async function reloadCatalog() {
  try {
    setStatus("Loading catalog…");
    const result = await loadCatalog({
      preferLive: state.settings.preferLiveCatalog,
      liveUrl: state.settings.liveCatalogUrl,
    });
    state.allItems = result.items;
    state.catalogSource = result.source;
    state.catalogDetail = result.detail || "";
    applyFilter(state.settings.categoryFilter);
    if (els.catalogSourceLabel) {
      els.catalogSourceLabel.textContent = `Catalog: ${result.source}${
        result.detail ? ` · ${result.detail}` : ""
      }`;
    }
    updateStatusPill();
  } catch (err) {
    console.error(err);
    setStatus("Catalog failed to load");
    if (els.catalogGrid) {
      els.catalogGrid.innerHTML = `<p class="error-block">Could not load catalog. Serve this folder over HTTP (e.g. <code>npx serve .</code>) so <code>data/catalog.json</code> can be fetched.</p>`;
    }
  }
}

function applyIntentionSource() {
  bridge.configure({
    url: state.settings.bridgeUrl,
    token: state.settings.bridgeToken,
  });
  if (state.settings.intentionSource === "neuralbridge") {
    bridge.connect();
  } else {
    bridge.disconnect();
  }
  updateStatusPill();
}

// ── Intention routing ─────────────────────────────────────────────────────

/**
 * @param {import('./intentions.js').IntentionEvent} event
 */
function handleIntention(event) {
  state.lastIntention = event.type;
  flashIntention(event);

  if (!state.settings.disclaimerAccepted) {
    if (
      event.type === INTENTIONS.SELECT ||
      event.type === INTENTIONS.CONFIRM
    ) {
      onAcceptDisclaimer();
    }
    return;
  }

  if (state.actionRun?.status === "running") {
    if (
      event.type === INTENTIONS.CANCEL ||
      event.type === INTENTIONS.BACK
    ) {
      state.actionRun.cancel?.();
    }
    return;
  }

  // When action panel is open with success options, select dismisses
  if (
    state.actionRun &&
    state.actionRun.status !== "running" &&
    els.actionPanel?.classList.contains("is-open")
  ) {
    if (
      event.type === INTENTIONS.CANCEL ||
      event.type === INTENTIONS.BACK ||
      event.type === INTENTIONS.SELECT
    ) {
      dismissActionPanel();
    }
    return;
  }

  if (state.confirm?.active) {
    routeConfirmIntention(event.type);
    return;
  }

  if (state.panel === "settings") {
    if (event.type === INTENTIONS.CANCEL || event.type === INTENTIONS.BACK) {
      showPanel("catalog");
    }
    return;
  }
  if (state.panel === "history") {
    if (event.type === INTENTIONS.CANCEL || event.type === INTENTIONS.BACK) {
      showPanel("catalog");
    }
    return;
  }

  switch (event.type) {
    case INTENTIONS.MOVE_UP:
      moveHighlight(0, -1);
      break;
    case INTENTIONS.MOVE_DOWN:
      moveHighlight(0, 1);
      break;
    case INTENTIONS.MOVE_LEFT:
      moveHighlight(-1, 0);
      break;
    case INTENTIONS.MOVE_RIGHT:
      moveHighlight(1, 0);
      break;
    case INTENTIONS.SELECT:
    case INTENTIONS.CONFIRM:
      trySelectHighlighted();
      break;
    case INTENTIONS.CANCEL:
    case INTENTIONS.BACK:
      break;
    default:
      break;
  }
}

/** @param {string} type */
function routeConfirmIntention(type) {
  if (type === INTENTIONS.CONFIRM || type === INTENTIONS.SELECT) {
    onConfirmPrimary();
  } else if (type === INTENTIONS.CANCEL || type === INTENTIONS.BACK) {
    onConfirmSecondary();
  }
}

// ── Navigation ────────────────────────────────────────────────────────────

/**
 * @param {number} dx
 * @param {number} dy
 */
function moveHighlight(dx, dy) {
  const n = state.visibleItems.length;
  if (n === 0) return;

  const cols =
    state.settings.viewMode === "list"
      ? 1
      : Math.max(1, state.columns);
  let idx = state.highlightIndex;
  const row = Math.floor(idx / cols);
  const col = idx % cols;

  let nextRow = row + dy;
  let nextCol = col + dx;

  if (dx !== 0) {
    nextCol = col + dx;
    if (nextCol < 0) {
      nextCol = cols - 1;
      nextRow = row - 1;
    } else if (nextCol >= cols) {
      nextCol = 0;
      nextRow = row + 1;
    }
  }

  let next = nextRow * cols + nextCol;
  if (next < 0) next = 0;
  if (next >= n) next = n - 1;
  state.highlightIndex = next;
  renderCatalog();
  scrollHighlightIntoView();
  updateHighlightMeta();
}

function trySelectHighlighted() {
  const item = state.visibleItems[state.highlightIndex];
  if (!item) return;
  if (!isActionable(item)) {
    setStatus(`“${item.name}” is not available yet`);
    pulseCard(state.highlightIndex, "warn");
    return;
  }
  openConfirmation(item);
}

/** @param {CatalogItem} item */
function openConfirmation(item) {
  state.confirm = startConfirmation(item, state.settings.confirmStrictness);
  renderConfirmation();
  els.confirmOverlay?.classList.add("is-open");
  els.confirmOverlay?.setAttribute("aria-hidden", "false");
  els.confirmPrimary?.focus();
  setStatus(`Confirmation open · ${item.name}`);
}

function closeConfirmation() {
  if (state.confirm) {
    state.confirm = cancelConfirmation(state.confirm);
  }
  state.confirm = null;
  els.confirmOverlay?.classList.remove("is-open");
  els.confirmOverlay?.setAttribute("aria-hidden", "true");
}

function onConfirmPrimary() {
  if (!state.confirm?.active) return;
  const { session, complete } = advanceConfirmation(state.confirm);
  state.confirm = session;
  if (complete) {
    const item = session.item;
    closeConfirmation();
    beginAction(item);
  } else {
    renderConfirmation();
  }
}

function onConfirmSecondary() {
  closeConfirmation();
  setStatus("Cancelled — no connect action was started");
}

function renderConfirmation() {
  if (!state.confirm) return;
  const content = getStepContent(state.confirm);
  if (els.confirmTitle) els.confirmTitle.textContent = content.title;
  if (els.confirmBody) els.confirmBody.textContent = content.body;
  if (els.confirmPrimary) els.confirmPrimary.textContent = content.primaryLabel;
  if (els.confirmSecondary)
    els.confirmSecondary.textContent = content.secondaryLabel;

  if (els.confirmSteps) {
    els.confirmSteps.innerHTML = "";
    for (let i = 1; i <= state.confirm.totalSteps; i++) {
      const dot = document.createElement("span");
      dot.className =
        "step-dot" +
        (i < state.confirm.step
          ? " is-done"
          : i === state.confirm.step
            ? " is-current"
            : "");
      dot.setAttribute("aria-label", `Step ${i}`);
      els.confirmSteps.appendChild(dot);
    }
  }

  els.confirmDialog?.setAttribute("data-tone", content.tone);
}

// ── Actions ───────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} */
let actionDismissTimer = null;

function dismissActionPanel() {
  if (actionDismissTimer) {
    clearTimeout(actionDismissTimer);
    actionDismissTimer = null;
  }
  els.actionPanel?.classList.remove("is-open");
  if (els.actionLinks) els.actionLinks.innerHTML = "";
}

/** @param {CatalogItem} item */
function beginAction(item) {
  if (actionDismissTimer) {
    clearTimeout(actionDismissTimer);
    actionDismissTimer = null;
  }
  els.actionPanel?.classList.add("is-open");
  if (els.actionLinks) els.actionLinks.innerHTML = "";

  state.actionRun = startConnectAction(
    item,
    (run) => {
      state.actionRun = run;
      renderAction(run);
      if (run.status !== "running") {
        renderHistory();
        renderActionLinks(run);
        if (run.status === "success") {
          setStatus(`Connected · ${item.name}`);
        } else if (run.status === "cancelled") {
          setStatus("Connect cancelled");
        } else if (run.status === "failed") {
          setStatus(`Connect failed · ${item.name}`);
        }
        // Keep panel open longer so user can use secondary links
        actionDismissTimer = setTimeout(() => {
          dismissActionPanel();
        }, run.status === "success" ? 12000 : 2200);
      }
    },
    { autoOpen: state.settings.autoOpenOnConnect }
  );
}

/** @param {ActionRun} run */
function renderAction(run) {
  if (!els.actionPanel) return;
  if (els.actionTitle) {
    els.actionTitle.textContent =
      run.status === "success"
        ? `Connected · ${run.item.name}`
        : `Connecting · ${run.item.name}`;
  }
  if (els.actionMessage) els.actionMessage.textContent = run.message;
  if (els.actionBar) {
    els.actionBar.style.width = `${run.progress}%`;
    els.actionBar.parentElement?.setAttribute(
      "aria-valuenow",
      String(run.progress)
    );
  }
  if (els.actionProgress) {
    els.actionProgress.textContent = `${run.progress}%`;
  }
  if (els.actionCancel) {
    els.actionCancel.hidden = run.status !== "running";
  }
  els.actionPanel.dataset.status = run.status;
}

/** @param {ActionRun} run */
function renderActionLinks(run) {
  if (!els.actionLinks) return;
  const options =
    run.options && run.options.length
      ? run.options
      : connectOptions(run.item);
  if (!options.length || run.status === "cancelled") {
    els.actionLinks.innerHTML = "";
    return;
  }
  els.actionLinks.innerHTML = options
    .map(
      (o) =>
        `<button type="button" class="btn btn-sm" data-connect-id="${escapeAttr(
          o.id
        )}">${escapeHtml(o.label)}</button>`
    )
    .join("");
}

// ── Catalog render ────────────────────────────────────────────────────────

/** @param {'all'|'tool'|'game'|'research'} filter */
function applyFilter(filter) {
  state.settings = saveSettings({ categoryFilter: filter });
  state.visibleItems = filterCatalog(state.allItems, filter);
  state.highlightIndex = Math.min(
    state.highlightIndex,
    Math.max(0, state.visibleItems.length - 1)
  );
  renderFilterBar();
  renderCatalog();
  updateHighlightMeta();
}

function renderFilterBar() {
  if (!els.filterBar) return;
  const filters = [
    ["all", "All"],
    ["tool", "Tools"],
    ["game", "Games"],
    ["research", "Research"],
  ];
  els.filterBar.innerHTML = filters
    .map(
      ([id, label]) =>
        `<button type="button" class="chip${
          state.settings.categoryFilter === id ? " is-active" : ""
        }" data-filter="${id}" aria-pressed="${
          state.settings.categoryFilter === id
        }">${label}</button>`
    )
    .join("");
}

function renderCatalog() {
  if (!els.catalogGrid) return;
  const items = state.visibleItems;
  els.catalogGrid.dataset.view = state.settings.viewMode;

  if (items.length === 0) {
    els.catalogGrid.innerHTML = "";
    els.emptyState && (els.emptyState.hidden = false);
    return;
  }
  els.emptyState && (els.emptyState.hidden = true);

  els.catalogGrid.innerHTML = items
    .map((item, i) => {
      const highlighted = i === state.highlightIndex;
      const actionable = isActionable(item);
      const links = [];
      if (item.demoUrl) links.push("demo");
      if (item.projectUrl) links.push("beach");
      if (item.githubUrl) links.push("repo");
      return `
        <article
          class="card${highlighted ? " is-highlighted" : ""}${
            !actionable ? " is-disabled" : ""
          }"
          data-index="${i}"
          data-id="${escapeAttr(item.id)}"
          tabindex="${highlighted ? 0 : -1}"
          role="option"
          aria-selected="${highlighted}"
          aria-label="${escapeAttr(item.name)}, ${categoryLabel(
            item.category
          )}, ${statusLabel(item.status)}"
        >
          <header class="card-header">
            <span class="card-category cat-${item.category}">${categoryLabel(
              item.category
            )}</span>
            <span class="card-status status-${item.status}">${statusLabel(
              item.status
            )}</span>
          </header>
          <h3 class="card-title">${escapeHtml(item.name)}</h3>
          <p class="card-desc">${escapeHtml(item.shortDescription)}</p>
          <footer class="card-footer">
            <span class="card-version">v${escapeHtml(
              item.version ?? "—"
            )}${
              links.length
                ? ` · <span class="card-links">${escapeHtml(
                    links.join(" · ")
                  )}</span>`
                : ""
            }</span>
            <span class="card-action">${actionLabel(item)}</span>
          </footer>
        </article>
      `;
    })
    .join("");
}

function updateHighlightMeta() {
  const item = state.visibleItems[state.highlightIndex];
  if (!els.highlightMeta) return;
  if (!item) {
    els.highlightMeta.textContent = "No items";
    return;
  }
  els.highlightMeta.innerHTML = `<strong>${escapeHtml(
    item.name
  )}</strong> · ${categoryLabel(item.category)} · ${statusLabel(
    item.status
  )} · <span class="muted">${escapeHtml(actionLabel(item))} · Enter to select</span>`;
}

function scrollHighlightIntoView() {
  const el = els.catalogGrid?.querySelector(
    `.card[data-index="${state.highlightIndex}"]`
  );
  el?.scrollIntoView({
    block: "nearest",
    behavior: state.settings.reduceMotion ? "auto" : "smooth",
  });
}

/**
 * @param {number} index
 * @param {string} kind
 */
function pulseCard(index, kind) {
  const el = els.catalogGrid?.querySelector(`.card[data-index="${index}"]`);
  if (!el) return;
  el.classList.remove("pulse-warn", "pulse-ok");
  void el.offsetWidth;
  el.classList.add(kind === "warn" ? "pulse-warn" : "pulse-ok");
}

// ── History / settings panels ─────────────────────────────────────────────

function renderHistory() {
  if (!els.historyList) return;
  const list = loadHistory();
  if (list.length === 0) {
    els.historyList.innerHTML =
      '<p class="muted empty-note">No actions yet. Select a catalog item and complete confirmation to connect (open demo, Beach page, or repo).</p>';
    return;
  }
  els.historyList.innerHTML = list
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleString();
      return `
        <li class="history-item status-${e.status}">
          <div class="history-main">
            <span class="history-kind">${escapeHtml(e.kind)}</span>
            <span class="history-name">${escapeHtml(e.itemName)}</span>
          </div>
          <div class="history-meta">
            <span class="history-status">${escapeHtml(e.status)}</span>
            <time datetime="${new Date(e.timestamp).toISOString()}">${escapeHtml(
              time
            )}</time>
          </div>
          <p class="history-msg">${escapeHtml(e.message)}</p>
        </li>
      `;
    })
    .join("");
}

function syncSettingsForm() {
  if (els.sensitivity) {
    els.sensitivity.value = String(state.settings.sensitivityMs);
  }
  if (els.sensitivityVal) {
    els.sensitivityVal.textContent = `${state.settings.sensitivityMs} ms`;
  }
  if (els.strictness) {
    els.strictness.value = state.settings.confirmStrictness;
  }
  if (els.showFlash) {
    els.showFlash.checked = state.settings.showIntentFlash;
  }
  if (els.reduceMotion) {
    els.reduceMotion.checked = state.settings.reduceMotion;
  }
  if (els.preferLive) {
    els.preferLive.checked = state.settings.preferLiveCatalog;
  }
  if (els.autoOpen) {
    els.autoOpen.checked = state.settings.autoOpenOnConnect;
  }
  if (els.intentionSource) {
    els.intentionSource.value = state.settings.intentionSource;
  }
  if (els.bridgeUrl) {
    els.bridgeUrl.value = state.settings.bridgeUrl;
  }
  if (els.bridgeToken) {
    els.bridgeToken.value = state.settings.bridgeToken;
  }
  if (els.viewToggle) {
    els.viewToggle.setAttribute(
      "aria-pressed",
      state.settings.viewMode === "list" ? "true" : "false"
    );
    els.viewToggle.textContent =
      state.settings.viewMode === "list" ? "Grid view" : "List view";
  }
  document.body.dataset.bridgeMode =
    state.settings.intentionSource === "neuralbridge" ? "on" : "off";
}

/** @param {'catalog'|'settings'|'history'} panel */
function showPanel(panel) {
  state.panel = panel;
  els.catalogPanel && (els.catalogPanel.hidden = panel !== "catalog");
  els.settingsPanel && (els.settingsPanel.hidden = panel !== "settings");
  els.historyPanel && (els.historyPanel.hidden = panel !== "history");
  if (panel === "history") renderHistory();
  if (panel === "settings") syncSettingsForm();
}

// ── Disclaimer ────────────────────────────────────────────────────────────

function showDisclaimerIfNeeded() {
  if (state.settings.disclaimerAccepted) {
    els.disclaimerModal?.classList.remove("is-open");
    els.disclaimerModal?.setAttribute("aria-hidden", "true");
    return;
  }
  els.disclaimerModal?.classList.add("is-open");
  els.disclaimerModal?.setAttribute("aria-hidden", "false");
  els.disclaimerAccept?.focus();
}

function onAcceptDisclaimer() {
  state.settings = acceptDisclaimer();
  showDisclaimerIfNeeded();
  updateStatusPill();
}

// ── Chrome bindings (mouse) ───────────────────────────────────────────────

function bindChrome() {
  els.filterBar?.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("[data-filter]");
    if (!btn) return;
    applyFilter(/** @type {any} */ (btn.getAttribute("data-filter")));
  });

  els.catalogGrid?.addEventListener("click", (e) => {
    const card = /** @type {HTMLElement} */ (e.target).closest(".card");
    if (!card) return;
    const index = Number(card.getAttribute("data-index"));
    if (Number.isNaN(index)) return;
    state.highlightIndex = index;
    renderCatalog();
    updateHighlightMeta();
    trySelectHighlighted();
  });

  els.catalogGrid?.addEventListener("dblclick", (e) => {
    e.preventDefault();
  });

  els.confirmPrimary?.addEventListener("click", () => onConfirmPrimary());
  els.confirmSecondary?.addEventListener("click", () => onConfirmSecondary());
  els.confirmOverlay?.addEventListener("click", (e) => {
    if (e.target === els.confirmOverlay) onConfirmSecondary();
  });

  els.actionCancel?.addEventListener("click", () => {
    state.actionRun?.cancel?.();
  });

  els.actionLinks?.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest(
      "[data-connect-id]"
    );
    if (!btn || !state.actionRun) return;
    const id = btn.getAttribute("data-connect-id");
    const options =
      state.actionRun.options || connectOptions(state.actionRun.item);
    const option = options.find((o) => o.id === id);
    if (!option) return;
    if (actionDismissTimer) {
      clearTimeout(actionDismissTimer);
      actionDismissTimer = setTimeout(() => dismissActionPanel(), 10000);
    }
    const result = await executeConnectOption(option);
    setStatus(result.message);
  });

  els.disclaimerAccept?.addEventListener("click", () => onAcceptDisclaimer());

  els.openSettings?.addEventListener("click", () => showPanel("settings"));
  els.openHistory?.addEventListener("click", () => showPanel("history"));
  els.closeSettings?.addEventListener("click", () => showPanel("catalog"));
  $("#done-settings")?.addEventListener("click", () => showPanel("catalog"));
  els.closeHistory?.addEventListener("click", () => showPanel("catalog"));

  els.viewToggle?.addEventListener("click", () => {
    const next = state.settings.viewMode === "grid" ? "list" : "grid";
    state.settings = saveSettings({ viewMode: next });
    syncSettingsForm();
    renderCatalog();
  });

  els.sensitivity?.addEventListener("input", () => {
    const v = Number(els.sensitivity.value);
    state.settings = saveSettings({ sensitivityMs: v });
    bus.configure({ sensitivityMs: v });
    if (els.sensitivityVal) els.sensitivityVal.textContent = `${v} ms`;
  });

  els.strictness?.addEventListener("change", () => {
    state.settings = saveSettings({
      confirmStrictness: /** @type {any} */ (els.strictness.value),
    });
  });

  els.showFlash?.addEventListener("change", () => {
    state.settings = saveSettings({ showIntentFlash: els.showFlash.checked });
  });

  els.reduceMotion?.addEventListener("change", () => {
    state.settings = saveSettings({ reduceMotion: els.reduceMotion.checked });
    applyMotionPreference();
  });

  els.preferLive?.addEventListener("change", async () => {
    state.settings = saveSettings({
      preferLiveCatalog: els.preferLive.checked,
    });
    await reloadCatalog();
  });

  els.autoOpen?.addEventListener("change", () => {
    state.settings = saveSettings({
      autoOpenOnConnect: els.autoOpen.checked,
    });
  });

  els.intentionSource?.addEventListener("change", () => {
    state.settings = saveSettings({
      intentionSource: /** @type {any} */ (els.intentionSource.value),
    });
    applyIntentionSource();
    syncSettingsForm();
  });

  els.bridgeUrl?.addEventListener("change", () => {
    state.settings = saveSettings({ bridgeUrl: els.bridgeUrl.value.trim() });
    applyIntentionSource();
  });

  els.bridgeToken?.addEventListener("change", () => {
    state.settings = saveSettings({ bridgeToken: els.bridgeToken.value });
    applyIntentionSource();
  });

  els.refreshCatalog?.addEventListener("click", async () => {
    await reloadCatalog();
    setStatus("Catalog refreshed");
  });

  els.resetSettingsBtn?.addEventListener("click", async () => {
    state.settings = resetSettings();
    bus.configure({ sensitivityMs: state.settings.sensitivityMs });
    applyMotionPreference();
    syncSettingsForm();
    applyIntentionSource();
    await reloadCatalog();
    setStatus("Settings reset to defaults");
  });

  els.clearHistoryBtn?.addEventListener("click", () => {
    clearHistory();
    renderHistory();
    setStatus("History cleared");
  });
}

function applyMotionPreference() {
  document.documentElement.classList.toggle(
    "reduce-motion",
    !!state.settings.reduceMotion
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────

/** @param {string} text */
function setStatus(text) {
  if (els.statusPill) els.statusPill.textContent = text;
}

function updateStatusPill() {
  if (!els.statusPill) return;
  const parts = [];
  if (state.settings.intentionSource === "neuralbridge") {
    const b =
      state.bridgeStatus === "connected"
        ? "Bridge connected"
        : state.bridgeStatus === "connecting"
          ? "Bridge connecting…"
          : state.bridgeStatus === "error"
            ? "Bridge error"
            : "Bridge off";
    parts.push(b);
  } else {
    parts.push("Simulator · keyboard");
  }
  if (state.catalogSource && state.catalogSource !== "—") {
    parts.push(`catalog:${state.catalogSource}`);
  }
  els.statusPill.textContent = parts.join(" · ");
  els.statusPill.dataset.bridge = state.bridgeStatus;
}

/**
 * @param {import('./intentions.js').IntentionEvent} event
 */
function flashIntention(event) {
  if (!els.intentFlash || !state.settings.showIntentFlash) return;
  els.intentFlash.textContent = event.type;
  els.intentFlash.dataset.source = event.source ?? "";
  els.intentFlash.classList.remove("is-on");
  void els.intentFlash.offsetWidth;
  els.intentFlash.classList.add("is-on");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

window.NeuraconX = {
  bus,
  bridge,
  INTENTIONS,
  reloadCatalog,
  getState: () => ({
    ...state,
    confirm: state.confirm,
    actionRun: state.actionRun,
  }),
};

init();
