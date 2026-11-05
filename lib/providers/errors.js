/**
 * Shared error shaping for the provider modules.
 *
 * The overlay has to tell "this model is gone" apart from every other failure
 * so it can offer the one action that helps. Provider modules tag that case
 * here instead of every caller guessing from a message.
 */

/**
 * Build an Error, tagging it when the provider says the model itself is gone.
 *
 * A vendor's generation endpoint is a constant, so a 404 there can only mean
 * the model. A gateway's endpoint is the user's own URL, where a 404 most often
 * means a wrong path, so a gateway is tagged only when its body names the
 * missing model.
 * @param {string} message
 * @param {{ status?: number, body?: any, fixedEndpoint?: boolean }} [context]
 * @returns {Error & { code?: string }}
 */
export function providerError(message, { status, body, fixedEndpoint = true } = {}) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  const detail = body?.error || {};
  const marker = String(detail.code || detail.type || detail.status || "");
  const saysModel =
    /model_not_found/i.test(marker) || /\bmodel\b/i.test(String(detail.message || ""));

  const gone = fixedEndpoint
    ? status === 404 || /model_not_found|not_found_error|not[_ ]?found/i.test(marker)
    : saysModel && (status === 404 || /not[_ ]?found/i.test(marker));
  if (gone) error.code = "model_not_found";

  return error;
}
