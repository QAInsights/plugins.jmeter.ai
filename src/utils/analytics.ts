const GA4_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/i;
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,20}$/i;

const AI_REFERRER_HOSTS: ReadonlyArray<{ host: string; source: string }> = [
  { host: 'chatgpt.com', source: 'chatgpt' },
  { host: 'chat.openai.com', source: 'chatgpt' },
  { host: 'perplexity.ai', source: 'perplexity' },
  { host: 'claude.ai', source: 'claude' },
  { host: 'gemini.google.com', source: 'gemini' },
  { host: 'copilot.microsoft.com', source: 'copilot' },
  { host: 'you.com', source: 'you' },
  { host: 'phind.com', source: 'phind' },
  { host: 'meta.ai', source: 'meta_ai' },
];

/**
 * Validate and normalize a GA4 Measurement ID (e.g. `G-XXXXXXXXXX`).
 * Returns null when unset, empty, or malformed so invalid scripts are never emitted.
 */
export function resolveGaMeasurementId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  return GA4_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Validate and normalize a Google Tag Manager container ID (e.g. `GTM-W3LV2L26`).
 * Returns null when unset, `"none"`, or malformed.
 */
export function resolveGtmContainerId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  return GTM_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Normalize a Google Search Console HTML verification token.
 * Accepts either the raw token or a full `google-site-verification=<token>` string.
 */
export function resolveGscVerification(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^google-site-verification=/i, '');
  if (!trimmed || /\s/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Detect whether a document referrer originated from an AI answer engine.
 * Returns the normalized AI source name (e.g. `chatgpt`, `perplexity`) or null.
 */
export function detectAiReferrer(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    for (const entry of AI_REFERRER_HOSTS) {
      if (hostname === entry.host || hostname.endsWith(`.${entry.host}`)) {
        return entry.source;
      }
    }
    return null;
  } catch {
    return null;
  }
}
