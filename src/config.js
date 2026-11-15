// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The port linkding listens on out of the box (its Docker image exposes 9090).
export const DEFAULT_PORT = 9090;

export const REFRESH_MINUTES = ['5', '15', '30', '60'];

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  tag: '',
  search: '',
  refresh_minutes: '15',
  allow_add: false,
  language: 'fr',
};

/**
 * Turn what the user typed into the base URL of linkding, without `/api`:
 * - `192.0.2.10` or `linkding.local` (no scheme, no port): port 9090;
 * - `192.0.2.10:9091`: that port;
 * - `https://example.org/linkding/`: exactly that address (reverse proxy,
 *   LD_CONTEXT_PATH).
 * A pasted `/api` suffix is dropped (not `/bookmarks`: it may be the context
 * path). Null when not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  if (!hasScheme && url.port === '') {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '')
    .replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * The linkding search query of the filters: `<search> #<tag>`. A tag never
 * holds a space in linkding; a pasted `#` is dropped.
 */
export function filterQuery({ tag, search }) {
  const parts = [];
  if (search) {
    parts.push(search);
  }
  if (tag) {
    parts.push(`#${tag}`);
  }
  return parts.join(' ');
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = text(source.url);
  const url = normalizeUrl(typed);
  const refresh = String(source.refresh_minutes ?? '');
  const tag = text(source.tag).replace(/^#+/, '').split(' ')[0].slice(0, 64);
  const search = text(source.search).slice(0, 200);
  return {
    url,
    urlInvalid: typed !== '' && url === null,
    // A token pasted with its scheme ("Token 0123...") works as well.
    token: text(source.api_token).replace(/^(token|bearer)\s+/i, ''),
    tag,
    search,
    query: filterQuery({ tag, search }),
    refreshMinutes: Number(
      REFRESH_MINUTES.includes(refresh) ? refresh : DEFAULT_CONFIG.refresh_minutes,
    ),
    allowAdd: source.allow_add === true || source.allow_add === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
