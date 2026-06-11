/**
 * Apply custom headers from a provider node/connection onto a headers object.
 *
 * customHeaders shape: [{ key: "Authorization", value: "Bearer $API_KEY" }, ...]
 *
 * Supported substitution variables (case-sensitive, $VAR syntax):
 *   $API_KEY      → credentials.apiKey || credentials.accessToken
 *   $ACCESS_TOKEN → credentials.accessToken
 *   $REFRESH_TOKEN → credentials.refreshToken
 *
 * Unknown variables are left as-is so the upstream's 401 surfaces the typo
 * rather than silently shipping `Bearer ` (empty token).
 *
 * @param {Record<string, string>} headers - Mutated in place.
 * @param {Array<{key: string, value: string}>} customHeaders
 * @param {{apiKey?: string, accessToken?: string, refreshToken?: string}} credentials
 * @returns {Record<string, string>} The same headers object.
 */
export function applyCustomHeaders(headers, customHeaders, credentials = {}) {
  if (!Array.isArray(customHeaders) || customHeaders.length === 0) return headers;

  const vars = {
    API_KEY: credentials.apiKey || credentials.accessToken || "",
    ACCESS_TOKEN: credentials.accessToken || "",
    REFRESH_TOKEN: credentials.refreshToken || "",
  };

  const substitute = (value) =>
    String(value).replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
    );

  for (const entry of customHeaders) {
    const key = typeof entry?.key === "string" ? entry.key.trim() : "";
    if (!key) continue;
    const value = entry?.value == null ? "" : substitute(entry.value);
    if (value === "") continue;

    // Custom headers win over defaults — strip case-variant keys first
    const lowerKey = key.toLowerCase();
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === lowerKey) delete headers[existing];
    }
    headers[key] = value;
  }

  return headers;
}
