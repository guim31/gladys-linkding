// -----------------------------------------------------------------------------
// The linkding client, the model and the configuration, on the bodies recorded
// on a real linkding 1.47.0: parsing, errors by kind, no credential in messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuery, normalizeConfig, normalizeUrl } from '../src/config.js';
import { LinkdingClient } from '../src/linkding/client.js';
import { asLink, parseTags, summarizeBookmark } from '../src/linkding/model.js';
import { fixture } from './helpers/fakeLinkding.js';

const TOKEN = 'f00dfeed0123456789abcdef0123456789abcdef';

/** A client whose fetch answers one recorded body. */
function clientAnswering(name, { type = 'application/json' } = {}) {
  const recorded = fixture(name);
  const calls = [];
  const client = new LinkdingClient({
    url: 'http://192.0.2.40:9090',
    token: TOKEN,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const body =
        typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);
      return new Response(body, { status: recorded.status, headers: { 'content-type': type } });
    },
  });
  return { client, calls };
}

const rejects = async (promise, kind, pattern) => {
  const err = await promise.then(
    () => assert.fail('should have failed'),
    (e) => e,
  );
  assert.equal(err.kind, kind);
  if (pattern) {
    assert.match(err.message, pattern);
  }
  assert.ok(!err.message.includes(TOKEN));
};

test('reads the profile and pages of bookmarks', async () => {
  const profile = clientAnswering('profile');
  assert.equal((await profile.client.profile()).version, '1.47.0');
  assert.equal(profile.calls[0].url, 'http://192.0.2.40:9090/api/user/profile/');
  assert.equal(profile.calls[0].init.headers.Authorization, `Token ${TOKEN}`);

  const list = clientAnswering('bookmarks');
  const page = await list.client.bookmarks({ q: 'lasagna #cooking', limit: 50 });
  assert.equal(page.count, 2);
  assert.equal(
    list.calls[0].url,
    'http://192.0.2.40:9090/api/bookmarks/?limit=50&sort=added_desc&q=lasagna+%23cooking',
  );
  assert.deepEqual(summarizeBookmark(page.results[1]), {
    id: 1,
    title: 'Lasagna recipe',
    url: 'https://example.org/recipes/lasagna',
    description: 'Classic',
    tags: ['cooking', 'italian'],
    unread: true,
    archived: false,
    added: '2026-11-15T01:21:21.823916Z',
  });

  const archived = clientAnswering('archived');
  assert.equal((await archived.client.bookmarks({ limit: 1, archived: true })).count, 1);
  assert.match(archived.calls[0].url, /\/api\/bookmarks\/archived\/\?limit=1&sort=added_desc$/);
});

test('check and create', async () => {
  const found = clientAnswering('check-existing');
  assert.equal((await found.client.existing('https://example.org/recipes/lasagna')).id, 1);
  assert.equal(
    found.calls[0].url,
    'http://192.0.2.40:9090/api/bookmarks/check/?url=https%3A%2F%2Fexample.org%2Frecipes%2Flasagna',
  );
  assert.equal(await clientAnswering('check-missing').client.existing('https://x.org'), null);

  const create = clientAnswering('create');
  const saved = await create.client.create({
    url: 'https://example.org/new-page',
    tags: ['gladys', 'later'],
    unread: true,
  });
  assert.equal(saved.id, 4);
  assert.deepEqual(JSON.parse(create.calls[0].init.body), {
    url: 'https://example.org/new-page',
    title: '',
    tag_names: ['gladys', 'later'],
    unread: true,
  });
  assert.equal(create.calls[0].init.method, 'POST');
});

test('errors by kind, in words, without the token', async () => {
  await rejects(
    clientAnswering('unauthorized').client.profile(),
    'unauthorized',
    /Invalid token\./,
  );
  await rejects(
    clientAnswering('create-bad').client.create({ url: 'not a url' }),
    'rejected',
    /url: Enter a valid URL\./,
  );
  await rejects(
    clientAnswering('not-found', { type: 'text/html' }).client.profile(),
    'not_found',
    /HTTP 404$/,
  );
  const html = new LinkdingClient({
    url: 'http://192.0.2.40:9090',
    token: TOKEN,
    fetch: async () => new Response('<html>login</html>', { status: 200 }),
  });
  await rejects(html.profile(), 'invalid', /not JSON/);
  const list = new LinkdingClient({
    url: 'http://192.0.2.40:9090',
    token: TOKEN,
    fetch: async () => new Response('{"results":"nope"}', { status: 200 }),
  });
  await rejects(list.bookmarks(), 'invalid');
  const down = new LinkdingClient({
    url: 'http://192.0.2.40:9090',
    token: TOKEN,
    fetch: async () => {
      throw new TypeError('fetch failed', { cause: { code: 'EHOSTUNREACH' } });
    },
  });
  await rejects(down.profile(), 'unreachable', /EHOSTUNREACH/);
  const slow = new LinkdingClient({
    url: 'http://192.0.2.40:9090',
    token: TOKEN,
    timeout: 1,
    fetch: async () => {
      throw new DOMException('timed out', 'TimeoutError');
    },
  });
  await rejects(slow.profile(), 'timeout');
});

test('a bookmark without a title shows the page title, else the domain', () => {
  assert.equal(
    summarizeBookmark({ url: 'https://www.example.org/a', website_title: 'Page' }).title,
    'Page',
  );
  assert.equal(
    summarizeBookmark({ url: 'https://www.example.org/a', title: '' }).title,
    'example.org',
  );
  assert.equal(summarizeBookmark({}).id, 0);
});

test('tags and links typed by users', () => {
  assert.deepEqual(parseTags('dinner, #italian; dinner\nlater  Dinner'), [
    'dinner',
    'italian',
    'later',
  ]);
  assert.deepEqual(parseTags(undefined), []);
  assert.equal(parseTags('x'.repeat(80))[0].length, 64);
  assert.equal(asLink(' www.example.org/a '), 'https://www.example.org/a');
  assert.equal(asLink('http://192.0.2.10/x'), 'http://192.0.2.10/x');
  assert.equal(asLink('ftp://example.org'), null);
  assert.equal(asLink('two words'), null);
  assert.equal(asLink(''), null);
});

test('addresses: default port, proxy path, pasted suffixes, credentials refused', () => {
  assert.equal(normalizeUrl('192.0.2.10'), 'http://192.0.2.10:9090');
  assert.equal(normalizeUrl('192.0.2.10:9091'), 'http://192.0.2.10:9091');
  assert.equal(normalizeUrl('https://example.org/linkding/'), 'https://example.org/linkding');
  assert.equal(normalizeUrl('https://example.org/linkding/api/'), 'https://example.org/linkding');
  assert.equal(
    normalizeUrl('http://192.0.2.10:9090/bookmarks'),
    'http://192.0.2.10:9090/bookmarks',
  );
  assert.equal(normalizeUrl('https://user:pw@example.org'), null);
  assert.equal(normalizeUrl('ftp://example.org'), null);
  assert.equal(normalizeUrl('   '), null);
});

test('configuration: defaults, token prefix, filters', () => {
  const config = normalizeConfig({});
  assert.equal(config.refreshMinutes, 15);
  assert.equal(config.language, 'fr');
  assert.equal(config.allowAdd, false);
  assert.equal(config.query, '');
  const typed = normalizeConfig({
    url: '192.0.2.10',
    api_token: ` Token ${TOKEN} `,
    tag: ' #to read ',
    search: '  dinner   ideas ',
    refresh_minutes: '60',
    allow_add: true,
    language: 'es',
  });
  assert.equal(typed.token, TOKEN);
  assert.equal(typed.tag, 'to');
  assert.equal(typed.query, 'dinner ideas #to');
  assert.equal(typed.refreshMinutes, 60);
  assert.equal(typed.allowAdd, true);
  assert.equal(normalizeConfig({ refresh_minutes: '7' }).refreshMinutes, 15);
  assert.equal(normalizeConfig({ url: 'ftp://x' }).urlInvalid, true);
  assert.equal(filterQuery({ tag: 'a', search: '' }), '#a');
});
