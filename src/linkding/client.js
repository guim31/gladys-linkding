// -----------------------------------------------------------------------------
// The REST API of linkding (`<base>/api/...`), the few calls the integration
// needs, authenticated by an API token (`Authorization: Token <key>`).
//
// Facts checked on a real server, linkding 1.47.0 (sissbruecker/linkding),
// see test/fixtures/linkding/1.47.0/:
// - lists are `{ count, next, previous, results }`, newest first by default
//   (`sort=added_desc`), paged by `limit` and `offset`; `count` is the total
//   of the query, so `limit=1` is enough to count;
// - `q` takes the search syntax of the web app: words, `#tag`, `!unread`;
// - `GET /api/bookmarks/` leaves archived bookmarks out, `/archived/` lists them;
// - errors: 401 `{ detail: "Invalid token." }`, 400 `{ url: ["Enter a valid
//   URL."] }`, an HTML 404 page for an unknown route;
// - `POST /api/bookmarks/` with a URL already saved UPDATES that bookmark
//   (title, tags, unread replaced): the integration checks first
//   (`GET /api/bookmarks/check/?url=`) and never overwrites a bookmark.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 15_000;

export class LinkdingError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'LinkdingError';
    this.kind = kind;
    this.status = status;
  }
}

/** `{ url: ["Enter a valid URL."] }` -> `url: Enter a valid URL.` */
function reasonOf(data) {
  if (typeof data?.detail === 'string') {
    return data.detail;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${[value].flat().join(' ')}`)
      .join('; ');
  }
  return '';
}

export class LinkdingClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  async #send(method, path, body) {
    const headers = { Accept: 'application/json', Authorization: `Token ${this.token}` };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new LinkdingError('timeout', `No answer from linkding within ${this.timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new LinkdingError('unreachable', `linkding unreachable (${cause})`);
    }
    if (!response.ok) {
      throw LinkdingClient.#fail(path, response.status, raw);
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new LinkdingError('invalid', `${path}: the answer is not JSON (is this linkding?)`);
    }
  }

  static #fail(path, status, raw) {
    let detail = '';
    try {
      detail = reasonOf(JSON.parse(raw));
    } catch {
      // not JSON (an HTML error page)
    }
    detail = detail.trim() || `HTTP ${status}`;
    const kind =
      status === 401 || status === 403
        ? 'unauthorized'
        : status === 404
          ? 'not_found'
          : status === 400
            ? 'rejected'
            : 'http';
    return new LinkdingError(
      kind,
      `${path.split('?')[0]}: ${detail.replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  /** The preferences of the token owner; `version` since linkding 1.30 or so. */
  async profile() {
    const data = await this.#send('GET', '/api/user/profile/');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new LinkdingError('invalid', 'This address does not answer like linkding');
    }
    return data;
  }

  /**
   * One page of bookmarks, the newest first.
   * @param {{ q?: string, limit?: number, offset?: number, archived?: boolean }} [query]
   * @returns {Promise<{ count: number, results: object[] }>}
   */
  async bookmarks({ q = '', limit = 20, offset = 0, archived = false } = {}) {
    const params = new URLSearchParams({ limit: String(limit), sort: 'added_desc' });
    if (q) {
      params.set('q', q);
    }
    if (offset) {
      params.set('offset', String(offset));
    }
    const data = await this.#send('GET', `/api/bookmarks/${archived ? 'archived/' : ''}?${params}`);
    if (!Number.isInteger(data?.count) || !Array.isArray(data?.results)) {
      throw new LinkdingError('invalid', 'linkding did not answer its bookmarks');
    }
    return { count: data.count, results: data.results };
  }

  /** The bookmark already saved for that URL, or null. */
  async existing(url) {
    const data = await this.#send('GET', `/api/bookmarks/check/?${new URLSearchParams({ url })}`);
    if (!data || typeof data !== 'object' || !('bookmark' in data)) {
      throw new LinkdingError('invalid', 'linkding did not answer the check');
    }
    return data.bookmark && Number.isInteger(data.bookmark.id) ? data.bookmark : null;
  }

  /**
   * Save a new bookmark. Linkding reads the title of the page when none is
   * given.
   * @param {{ url: string, title?: string, tags?: string[], unread?: boolean }} bookmark
   */
  async create({ url, title = '', tags = [], unread = false }) {
    const data = await this.#send('POST', '/api/bookmarks/', {
      url,
      title,
      tag_names: tags,
      unread,
    });
    if (!data || !Number.isInteger(data.id)) {
      throw new LinkdingError('invalid', 'linkding did not answer the saved bookmark');
    }
    return data;
  }
}
