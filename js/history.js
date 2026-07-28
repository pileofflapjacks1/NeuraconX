/**
 * Recent actions log (session + optional localStorage).
 */

const STORAGE_KEY = "neuraconnect.history.v1";
const MAX_ENTRIES = 40;

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {number} timestamp
 * @property {'download'|'launch'|'cancel'|'error'} kind
 * @property {string} itemId
 * @property {string} itemName
 * @property {string} message
 * @property {'success'|'cancelled'|'failed'|'running'} status
 */

/** @returns {HistoryEntry[]} */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** @param {HistoryEntry[]} list */
function persist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

/**
 * @param {Omit<HistoryEntry, 'id'|'timestamp'> & { id?: string, timestamp?: number }} entry
 * @returns {HistoryEntry}
 */
export function addHistoryEntry(entry) {
  const full = {
    id: entry.id ?? `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: entry.timestamp ?? Date.now(),
    kind: entry.kind,
    itemId: entry.itemId,
    itemName: entry.itemName,
    message: entry.message,
    status: entry.status,
  };
  const list = [full, ...loadHistory()].slice(0, MAX_ENTRIES);
  persist(list);
  return full;
}

/**
 * @param {string} id
 * @param {Partial<HistoryEntry>} patch
 */
export function updateHistoryEntry(id, patch) {
  const list = loadHistory().map((e) => (e.id === id ? { ...e, ...patch } : e));
  persist(list);
  return list.find((e) => e.id === id) ?? null;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}
