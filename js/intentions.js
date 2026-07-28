/**
 * NeuraConnect — Intention layer
 *
 * High-level discrete intentions only. Keyboard/mouse simulator maps into
 * this bus today; a future NeuralBridge (or other) stream can emit the same
 * IntentionEvent shapes without changing the rest of the app.
 *
 * This is a research / accessibility prototype interface.
 * It does not decode neural signals and is not affiliated with Neuralink.
 */

/** @typedef {'move_up'|'move_down'|'move_left'|'move_right'|'select'|'confirm'|'cancel'|'back'} IntentionType */

/**
 * @typedef {Object} IntentionEvent
 * @property {IntentionType | string} type
 * @property {number} confidence  // 0–1
 * @property {number} timestamp   // epoch ms
 * @property {string} [source]    // 'keyboard' | 'mouse' | 'external' | …
 * @property {Record<string, unknown>} [payload]
 */

const INTENTIONS = Object.freeze({
  MOVE_UP: "move_up",
  MOVE_DOWN: "move_down",
  MOVE_LEFT: "move_left",
  MOVE_RIGHT: "move_right",
  SELECT: "select",
  CONFIRM: "confirm",
  CANCEL: "cancel",
  BACK: "back",
});

const DIRECTIONAL = new Set([
  INTENTIONS.MOVE_UP,
  INTENTIONS.MOVE_DOWN,
  INTENTIONS.MOVE_LEFT,
  INTENTIONS.MOVE_RIGHT,
]);

/**
 * Creates an intention bus with subscribe / emit / external adapter hooks.
 * @param {{ sensitivityMs?: number, minConfidence?: number }} [options]
 */
export function createIntentionBus(options = {}) {
  let sensitivityMs = options.sensitivityMs ?? 140;
  let minConfidence = options.minConfidence ?? 0.5;

  /** @type {Map<string, Set<(e: IntentionEvent) => void>>} */
  const listeners = new Map();
  /** @type {Set<(e: IntentionEvent) => void>} */
  const anyListeners = new Set();

  /** Last accepted emission per type (for debounce / sensitivity). */
  /** @type {Map<string, number>} */
  const lastAccepted = new Map();

  /** Optional external source (WebSocket, EventSource, NeuralBridge, …). */
  /** @type {null | { disconnect: () => void }} */
  let externalSource = null;

  /**
   * @param {string} type
   * @param {(e: IntentionEvent) => void} handler
   * @returns {() => void} unsubscribe
   */
  function on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  }

  /**
   * @param {(e: IntentionEvent) => void} handler
   * @returns {() => void}
   */
  function onAny(handler) {
    anyListeners.add(handler);
    return () => anyListeners.delete(handler);
  }

  /**
   * Emit a high-level intention. Debounces directional intents by sensitivityMs.
   * Discrete intents (select/confirm/cancel/back) always pass when confident.
   * @param {Partial<IntentionEvent> & { type: string }} raw
   * @returns {boolean} whether the intention was accepted
   */
  function emit(raw) {
    const type = raw.type;
    if (!type) return false;

    const confidence = typeof raw.confidence === "number" ? raw.confidence : 1;
    if (confidence < minConfidence) return false;

    const now = raw.timestamp ?? Date.now();
    const isDirectional = DIRECTIONAL.has(type);

    if (isDirectional) {
      const prev = lastAccepted.get(type) ?? 0;
      // Also gate against any directional move to avoid diagonal chatter
      const lastAnyDir = Math.max(
        lastAccepted.get(INTENTIONS.MOVE_UP) ?? 0,
        lastAccepted.get(INTENTIONS.MOVE_DOWN) ?? 0,
        lastAccepted.get(INTENTIONS.MOVE_LEFT) ?? 0,
        lastAccepted.get(INTENTIONS.MOVE_RIGHT) ?? 0
      );
      if (now - lastAnyDir < sensitivityMs) return false;
      lastAccepted.set(type, now);
    } else {
      // Light debounce on discrete actions to prevent double-fire
      const prev = lastAccepted.get(type) ?? 0;
      if (now - prev < Math.min(80, sensitivityMs)) return false;
      lastAccepted.set(type, now);
    }

    /** @type {IntentionEvent} */
    const event = {
      type,
      confidence,
      timestamp: now,
      source: raw.source ?? "unknown",
      payload: raw.payload,
    };

    anyListeners.forEach((h) => {
      try {
        h(event);
      } catch (err) {
        console.error("[intentions] listener error", err);
      }
    });

    const set = listeners.get(type);
    if (set) {
      set.forEach((h) => {
        try {
          h(event);
        } catch (err) {
          console.error("[intentions] listener error", err);
        }
      });
    }

    return true;
  }

  /**
   * Wire keyboard as the primary simulator source.
   * @param {Window | Document | HTMLElement} [target]
   * @returns {() => void} detach
   */
  function attachKeyboardSimulator(target = window) {
    /** @type {Record<string, string>} */
    const map = {
      ArrowUp: INTENTIONS.MOVE_UP,
      ArrowDown: INTENTIONS.MOVE_DOWN,
      ArrowLeft: INTENTIONS.MOVE_LEFT,
      ArrowRight: INTENTIONS.MOVE_RIGHT,
      Enter: INTENTIONS.SELECT,
      " ": INTENTIONS.SELECT,
      Space: INTENTIONS.SELECT,
      Escape: INTENTIONS.CANCEL,
      Backspace: INTENTIONS.BACK,
      // Optional explicit confirm (when confirmation dialog is open, SELECT also confirms)
      KeyY: INTENTIONS.CONFIRM,
      y: INTENTIONS.CONFIRM,
      KeyN: INTENTIONS.CANCEL,
      n: INTENTIONS.CANCEL,
    };

    /**
     * @param {KeyboardEvent} e
     */
    function onKeyDown(e) {
      // Don't steal typing in inputs
      const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/** @type {HTMLElement} */ (e.target)?.isContentEditable) return;

      const key = e.key === " " ? " " : e.key;
      const code = e.code;
      const intention =
        map[key] || map[code] || (key.length === 1 ? map[key.toLowerCase()] : null);

      if (!intention) return;

      // Space/Enter default scroll prevention when we handle them
      if (
        intention === INTENTIONS.SELECT ||
        intention === INTENTIONS.MOVE_UP ||
        intention === INTENTIONS.MOVE_DOWN ||
        intention === INTENTIONS.MOVE_LEFT ||
        intention === INTENTIONS.MOVE_RIGHT ||
        intention === INTENTIONS.CANCEL ||
        intention === INTENTIONS.BACK
      ) {
        e.preventDefault();
      }

      emit({
        type: intention,
        confidence: 1,
        source: "keyboard",
        payload: { key: e.key, code: e.code },
      });
    }

    target.addEventListener("keydown", onKeyDown);
    return () => target.removeEventListener("keydown", onKeyDown);
  }

  /**
   * Future hook: attach an external intention stream.
   * The adapter should call `emit` with IntentionEvent-compatible objects.
   *
   * Example:
   *   bus.connectExternal({
   *     connect(emit) {
   *       const ws = new WebSocket('ws://127.0.0.1:7711');
   *       ws.onmessage = (m) => {
   *         const data = JSON.parse(m.data);
   *         if (data.type) emit({ ...data, source: 'neuralbridge' });
   *       };
   *       return () => ws.close();
   *     }
   *   });
   *
   * @param {{ connect: (emit: typeof emit) => () => void }} adapter
   */
  function connectExternal(adapter) {
    if (externalSource) {
      externalSource.disconnect();
      externalSource = null;
    }
    const disconnect = adapter.connect(emit);
    externalSource = { disconnect };
    return () => {
      disconnect?.();
      if (externalSource?.disconnect === disconnect) externalSource = null;
    };
  }

  function disconnectExternal() {
    externalSource?.disconnect();
    externalSource = null;
  }

  /**
   * @param {{ sensitivityMs?: number, minConfidence?: number }} next
   */
  function configure(next) {
    if (typeof next.sensitivityMs === "number") {
      sensitivityMs = Math.max(40, Math.min(600, next.sensitivityMs));
    }
    if (typeof next.minConfidence === "number") {
      minConfidence = Math.max(0, Math.min(1, next.minConfidence));
    }
  }

  function getConfig() {
    return { sensitivityMs, minConfidence };
  }

  return {
    INTENTIONS,
    on,
    onAny,
    emit,
    attachKeyboardSimulator,
    connectExternal,
    disconnectExternal,
    configure,
    getConfig,
  };
}

export { INTENTIONS };
