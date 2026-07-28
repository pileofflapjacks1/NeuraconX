/**
 * NeuraconX settings — persisted in localStorage.
 */

const STORAGE_KEY = "neuraconx.settings.v1";

/** @typedef {'standard'|'strict'} ConfirmStrictness */

/**
 * @typedef {Object} AppSettings
 * @property {number} sensitivityMs
 * @property {ConfirmStrictness} confirmStrictness
 * @property {boolean} reduceMotion
 * @property {boolean} showIntentFlash
 * @property {boolean} disclaimerAccepted
 * @property {'all'|'tool'|'game'|'research'} categoryFilter
 * @property {'grid'|'list'} viewMode
 */

/** @returns {AppSettings} */
export function defaultSettings() {
  return {
    sensitivityMs: 140,
    confirmStrictness: "standard",
    reduceMotion: false,
    showIntentFlash: true,
    disclaimerAccepted: false,
    categoryFilter: "all",
    viewMode: "grid",
  };
}

/** @returns {AppSettings} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

/** @param {Partial<AppSettings>} partial */
export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetSettings() {
  const defaults = defaultSettings();
  // Keep disclaimer accepted so we don't re-force modal on every reset of feel
  const prev = loadSettings();
  const next = {
    ...defaults,
    disclaimerAccepted: prev.disclaimerAccepted,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function acceptDisclaimer() {
  return saveSettings({ disclaimerAccepted: true });
}
