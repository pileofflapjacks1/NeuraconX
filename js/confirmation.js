/**
 * NeuraconX — multi-step safety confirmation flow.
 *
 * Standard: 2 explicit steps before any connect/open is triggered.
 * Strict: 3 steps (adds a final safety gate).
 *
 * Language is deliberately verbose to reduce accidental activation.
 */

import { primaryConnectTarget } from "./catalog.js";

/**
 * @typedef {Object} ConfirmSession
 * @property {import('./catalog.js').CatalogItem} item
 * @property {number} step
 * @property {number} totalSteps
 * @property {'standard'|'strict'} strictness
 * @property {boolean} active
 */

/**
 * @param {'standard'|'strict'} strictness
 */
export function totalStepsFor(strictness) {
  return strictness === "strict" ? 3 : 2;
}

/**
 * @param {import('./catalog.js').CatalogItem} item
 * @param {'standard'|'strict'} strictness
 * @returns {ConfirmSession}
 */
export function startConfirmation(item, strictness = "standard") {
  return {
    item,
    step: 1,
    totalSteps: totalStepsFor(strictness),
    strictness,
    active: true,
  };
}

/**
 * @param {ConfirmSession} session
 */
export function advanceConfirmation(session) {
  if (!session.active) return { session, complete: false };
  if (session.step >= session.totalSteps) {
    return {
      session: { ...session, active: false },
      complete: true,
    };
  }
  return {
    session: { ...session, step: session.step + 1 },
    complete: false,
  };
}

/**
 * @param {ConfirmSession} session
 */
export function cancelConfirmation(session) {
  return { ...session, active: false };
}

/**
 * @param {ConfirmSession} session
 */
export function getStepContent(session) {
  const { item, step, totalSteps } = session;
  const primary = primaryConnectTarget(item);
  const name = item.name;
  const targetDesc =
    primary.kind === "open" && primary.url
      ? `${primary.label}:\n${primary.url}`
      : primary.kind === "copy"
        ? `${primary.label}:\n${item.installHint || "(command)"}`
        : primary.label;

  if (step === 1) {
    return {
      title: `Step 1 of ${totalSteps}: Review selection`,
      body: `You selected “${name}”.\n\nPrimary connect action after final confirm:\n${targetDesc}\n\nThis will open an external page or copy an install command in your browser. NeuraconX does not install software silently.\n\nIs “${name}” the item you intended to connect?`,
      primaryLabel: `Yes — I selected ${name}`,
      secondaryLabel: "No — cancel",
      tone: "review",
    };
  }

  if (step === 2) {
    return {
      title: `Step 2 of ${totalSteps}: Explicit connect confirmation`,
      body: `Confirm action:\n\nCONNECT “${name}” (${item.category} · ${item.version ?? "n/a"})\n\n${targetDesc}\n\nThis is your second confirmation. Accidental activation should stop here unless you intentionally confirm again.\n\nDo you want to ${primary.label.toLowerCase()} for “${name}” now?`,
      primaryLabel: `Confirm — ${primary.label}`,
      secondaryLabel: "Go back / cancel",
      tone: "confirm",
    };
  }

  return {
    title: `Step 3 of ${totalSteps}: Final safety gate (strict mode)`,
    body: `Strict confirmation is enabled.\n\nFinal check: you are authorizing NeuraconX to ${primary.label.toLowerCase()} for “${name}”.\n\nNeuraconX is a research/accessibility prototype only. It is not a medical device and is not affiliated with Neuralink.\n\nProceed?`,
    primaryLabel: `Final confirm — ${primary.label}`,
    secondaryLabel: "Abort",
    tone: "strict",
  };
}
