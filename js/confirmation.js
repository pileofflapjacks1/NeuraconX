/**
 * NeuraconX — multi-step safety confirmation flow.
 *
 * Standard: 2 explicit steps before any download/launch is triggered.
 * Strict: 3 steps (adds a final “I understand this is irreversible in this session” gate).
 *
 * Language is deliberately verbose to reduce accidental activation.
 */

/**
 * @typedef {Object} ConfirmSession
 * @property {import('./catalog.js').CatalogItem} item
 * @property {number} step // 1-based
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
 * Advance one step. Returns { session, complete }.
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
 * Copy for each step — explicit and safety-first.
 * @param {ConfirmSession} session
 */
export function getStepContent(session) {
  const { item, step, totalSteps, strictness } = session;
  const actionVerb = item.action === "launch" ? "LAUNCH" : "DOWNLOAD";
  const actionNoun = item.action === "launch" ? "launch" : "download";
  const name = item.name;

  if (step === 1) {
    return {
      title: `Step 1 of ${totalSteps}: Review selection`,
      body: `You selected “${name}”.\n\nYou are about to begin a simulated ${actionNoun}. This does not install software on your system from a remote server in this prototype — it only runs a local simulation with progress feedback.\n\nIs “${name}” the item you intended to ${actionNoun}?`,
      primaryLabel: `Yes — I selected ${name}`,
      secondaryLabel: "No — cancel",
      tone: "review",
    };
  }

  if (step === 2) {
    return {
      title: `Step 2 of ${totalSteps}: Explicit ${actionNoun} confirmation`,
      body: `Confirm action:\n\n${actionVerb} “${name}” (${item.category} · ${item.version ?? "n/a"})\n\nThis is your second confirmation. Accidental activation should stop here unless you intentionally confirm again.\n\nDo you want to ${actionNoun} “${name}” now?`,
      primaryLabel: `Confirm ${actionNoun}`,
      secondaryLabel: "Go back / cancel",
      tone: "confirm",
    };
  }

  // Strict step 3
  return {
    title: `Step 3 of ${totalSteps}: Final safety gate (strict mode)`,
    body: `Strict confirmation is enabled.\n\nFinal check: you are authorizing a simulated ${actionNoun} of “${name}”.\n\nNeuraconX is a research/accessibility prototype only. It is not a medical device and is not affiliated with Neuralink.\n\nProceed with the simulated ${actionNoun}?`,
    primaryLabel: `Final confirm — ${actionVerb} ${name}`,
    secondaryLabel: "Abort",
    tone: "strict",
  };
}
