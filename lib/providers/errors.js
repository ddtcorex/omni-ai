/**
 * Shared error shaping for the provider modules.
 *
 * The overlay has to tell "this model is gone" apart from every other failure
 * so it can offer the one action that helps. Provider modules tag that case
 * here instead of every caller guessing from a message.
 */

/**
 * Build an Error, tagging it when the provider says the model itself is gone.
 * @param {string} message
 * @param {{ status?: number, body?: any }} [context]
 * @returns {Error & { code?: string }}
 */
export function providerError(message, { status, body } = {}) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  const detail = body?.error || {};
  const marker = String(detail.code || detail.type || detail.status || "");

  const gone = status === 404 || /model_not_found|not_found_error|not[_ ]?found/i.test(marker);
  if (gone) error.code = "model_not_found";

  return error;
}
