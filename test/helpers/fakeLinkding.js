// -----------------------------------------------------------------------------
// A fake linkding behind a `fetch` function: it starts from the bodies recorded
// on a real linkding 1.47.0 (test/fixtures/linkding/1.47.0/), keeps its
// bookmarks in memory, and answers the errors the real server answers (JSON
// 401 and 400, an HTML 404 for an unknown route). Its search understands the
// subset the integration sends: words, `#tag` and `!unread`.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:9090';
export const TOKEN = '0123456789abcdef0123456789abcdef01234567';
// Shortly after the fixtures were recorded (2026-11-15 01:23 UTC).
export const NOW = Date.parse('2026-11-15T02:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/linkding/1.47.0/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function matches(bookmark, q) {
  for (const term of q.split(/\s+/).filter(Boolean)) {
    if (term === '!unread') {
      if (!bookmark.unread) return false;
    } else if (term.startsWith('#')) {
      if (!bookmark.tag_names.includes(term.slice(1))) return false;
    } else {
      const haystack = [bookmark.title, bookmark.description, bookmark.url, bookmark.notes]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term.toLowerCase())) return false;
    }
  }
  return true;
}

export function createLinkding() {
  const state = {
    profile: fixture('profile').body,
    // The recorded list (ids 1 and 2), the archived one (3), the created one (4).
    bookmarks: [
      ...fixture('bookmarks').body.results,
      ...fixture('archived').body.results,
      fixture('create').body,
    ].map((b) => structuredClone(b)),
    down: false,
    html: false,
    slow: false,
    requests: [],
    clock: Date.parse('2026-11-15T01:30:00.000Z'),
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(type === 'application/json' ? JSON.stringify(body) : body, {
      status,
      headers: { 'content-type': type },
    });
  const nextId = () => Math.max(0, ...state.bookmarks.map((b) => b.id)) + 1;

  /** Add a bookmark as a user would (web app, browser extension, import...). */
  function addBookmark({
    url = 'https://example.org/article',
    title = '',
    tags = [],
    unread = false,
    archived = false,
    added,
    description = '',
  } = {}) {
    state.clock += 60_000;
    const at = added ?? new Date(state.clock).toISOString();
    const bookmark = {
      ...structuredClone(fixture('create').body),
      id: nextId(),
      url,
      title,
      description,
      is_archived: archived,
      unread,
      tag_names: tags,
      date_added: at,
      date_modified: at,
    };
    state.bookmarks.push(bookmark);
    return bookmark;
  }

  function list(searchParams, archived) {
    const q = searchParams.get('q') ?? '';
    const limit = Number(searchParams.get('limit') ?? 100);
    const offset = Number(searchParams.get('offset') ?? 0);
    const found = state.bookmarks
      .filter((b) => b.is_archived === archived && matches(b, q))
      .sort((a, b) => Date.parse(b.date_added) - Date.parse(a.date_added));
    return {
      count: found.length,
      next: null,
      previous: null,
      results: found.slice(offset, offset + limit),
    };
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${pathname}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.slow) {
      await new Promise((resolve, reject) => {
        const hold = setTimeout(resolve, 10_000);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(hold);
          reject(init.signal.reason);
        });
      });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (init.headers?.Authorization !== `Token ${TOKEN}`) {
      return answer(401, fixture('unauthorized').body);
    }
    const body = init.body ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && pathname === '/api/user/profile/') {
      return answer(200, state.profile);
    }
    if (method === 'GET' && pathname === '/api/bookmarks/') {
      return answer(200, list(searchParams, false));
    }
    if (method === 'GET' && pathname === '/api/bookmarks/archived/') {
      return answer(200, list(searchParams, true));
    }
    if (method === 'GET' && pathname === '/api/bookmarks/check/') {
      const found = state.bookmarks.find((b) => b.url === searchParams.get('url'));
      return answer(200, { ...fixture('check-missing').body, bookmark: found ?? null });
    }
    if (method === 'POST' && pathname === '/api/bookmarks/') {
      if (!/^https?:\/\/\S+$/.test(body.url ?? '')) {
        return answer(400, fixture('create-bad').body);
      }
      const existing = state.bookmarks.find((b) => b.url === body.url);
      if (existing) {
        // What linkding does: the existing bookmark is overwritten.
        Object.assign(existing, { title: body.title, tag_names: body.tag_names });
        return answer(201, existing);
      }
      const bookmark = addBookmark({
        url: body.url,
        title: body.title || 'Example Domain',
        tags: body.tag_names ?? [],
        unread: body.unread === true,
      });
      return answer(201, bookmark);
    }
    return answer(404, fixture('not-found').body, 'text/html; charset=utf-8');
  }

  return {
    state,
    fetch,
    addBookmark,
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
