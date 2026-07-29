/**
 * NeuraconX — Neurabridge WebSocket adapter (optional).
 *
 * Connects as an observer to a local Neurabridge multi-client service
 * (default ws://127.0.0.1:7711) and maps intention events onto the
 * NeuraconX intention bus.
 *
 * Research / simulator path only. Not implant software. Not affiliated with Neuralink.
 */

import { INTENTIONS } from "./intentions.js";

/** @typedef {'disconnected'|'connecting'|'connected'|'error'} BridgeStatus */

/**
 * Map Neurabridge / suite intention types → NeuraconX high-level intentions.
 * @type {Record<string, string>}
 */
const INTENT_MAP = {
  // NeuraconX native
  move_up: INTENTIONS.MOVE_UP,
  move_down: INTENTIONS.MOVE_DOWN,
  move_left: INTENTIONS.MOVE_LEFT,
  move_right: INTENTIONS.MOVE_RIGHT,
  select: INTENTIONS.SELECT,
  confirm: INTENTIONS.CONFIRM,
  cancel: INTENTIONS.CANCEL,
  back: INTENTIONS.BACK,
  // Neurabridge built-ins
  click: INTENTIONS.SELECT,
  next: INTENTIONS.MOVE_RIGHT,
  scroll_up: INTENTIONS.MOVE_UP,
  scroll_down: INTENTIONS.MOVE_DOWN,
  focus: INTENTIONS.SELECT,
};

/**
 * @param {object} opts
 * @param {(event: { type: string, confidence: number, timestamp: number, source: string, payload?: object }) => boolean} opts.emit
 * @param {(status: BridgeStatus, detail?: string) => void} [opts.onStatus]
 * @param {string} [opts.url]
 * @param {string} [opts.clientName]
 * @param {string} [opts.token]
 */
export function createNeurabridgeAdapter(opts) {
  const emit = opts.emit;
  const onStatus = opts.onStatus || (() => {});
  let url = opts.url || "ws://127.0.0.1:7711";
  let token = opts.token || "";
  let clientName = opts.clientName || "NeuraconX";

  /** @type {WebSocket | null} */
  let ws = null;
  /** @type {BridgeStatus} */
  let status = "disconnected";
  let intentionalClose = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let enabled = false;

  function setStatus(next, detail) {
    status = next;
    onStatus(next, detail);
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (!enabled || intentionalClose) return;
    clearReconnect();
    const delay = Math.min(8000, 600 * Math.pow(1.6, reconnectAttempt));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      if (enabled) connect();
    }, delay);
  }

  /**
   * @param {MessageEvent} ev
   */
  function onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "welcome" || msg.type === "hello") {
      setStatus("connected", `Neurabridge · ${msg.role || "client"}`);
      reconnectAttempt = 0;
      return;
    }

    if (msg.type === "error") {
      setStatus("error", msg.message || msg.code || "bridge error");
      return;
    }

    // Protocol: { type: "event", event: "intention", data: IntentionEvent }
    if (msg.type === "event" && msg.event === "intention" && msg.data) {
      mapAndEmit(msg.data);
      return;
    }

    // Some clients may forward raw intention objects
    if (msg.type === "intention" && (msg.data || msg.intentionType || msg.intention)) {
      mapAndEmit(msg.data || msg);
      return;
    }
  }

  /**
   * @param {Record<string, unknown>} data
   */
  function mapAndEmit(data) {
    const rawType = String(
      data.type || data.intentionType || data.intention || ""
    ).toLowerCase();
    if (!rawType) return;

    let mapped = INTENT_MAP[rawType];

    // Continuous gesture-style move with dominant axis
    if (!mapped && rawType === "move" && data.vector) {
      const v = /** @type {{ x?: number, y?: number }} */ (data.vector);
      const ax = Math.abs(v.x || 0);
      const ay = Math.abs(v.y || 0);
      if (ax < 0.35 && ay < 0.35) return;
      if (ay >= ax) {
        mapped = (v.y || 0) < 0 ? INTENTIONS.MOVE_UP : INTENTIONS.MOVE_DOWN;
      } else {
        mapped = (v.x || 0) < 0 ? INTENTIONS.MOVE_LEFT : INTENTIONS.MOVE_RIGHT;
      }
    }

    if (!mapped) return;

    const confidence =
      typeof data.confidence === "number" ? data.confidence : 0.9;

    emit({
      type: mapped,
      confidence,
      timestamp:
        typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      source: "neurabridge",
      payload: {
        bridgeType: rawType,
        raw: data,
      },
    });
  }

  function connect() {
    enabled = true;
    intentionalClose = false;
    clearReconnect();

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus("connecting", url);

    try {
      ws = new WebSocket(url);
    } catch (err) {
      setStatus(
        "error",
        err instanceof Error ? err.message : "WebSocket create failed"
      );
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      const hello = {
        type: "hello",
        protocol: 2,
        clientId: `neuraconx-${Math.random().toString(36).slice(2, 8)}`,
        name: clientName,
        role: "observer",
      };
      if (token) hello.token = token;
      try {
        ws?.send(JSON.stringify(hello));
      } catch {
        /* ignore */
      }
      // Status may stay connecting until welcome; mark connected optimistically
      setStatus("connected", "Neurabridge handshake sent");
    };

    ws.onmessage = onMessage;

    ws.onerror = () => {
      setStatus("error", "WebSocket error — is neurabridge serve running?");
    };

    ws.onclose = () => {
      ws = null;
      if (intentionalClose) {
        setStatus("disconnected", "Bridge disconnected");
      } else {
        setStatus("disconnected", "Bridge closed — retrying…");
        scheduleReconnect();
      }
    };
  }

  function disconnect() {
    enabled = false;
    intentionalClose = true;
    clearReconnect();
    reconnectAttempt = 0;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }
    setStatus("disconnected", "Bridge off");
  }

  /**
   * @param {{ url?: string, token?: string, clientName?: string }} next
   */
  function configure(next) {
    if (typeof next.url === "string" && next.url.trim()) url = next.url.trim();
    if (typeof next.token === "string") token = next.token;
    if (typeof next.clientName === "string") clientName = next.clientName;
  }

  function getStatus() {
    return { status, url, enabled };
  }

  return {
    connect,
    disconnect,
    configure,
    getStatus,
    INTENT_MAP,
  };
}
