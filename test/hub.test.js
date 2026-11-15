// -----------------------------------------------------------------------------
// The hub end to end, against the SDK's fake Gladys and a fake linkding
// answering the bodies of a real linkding 1.47.0: device and states, the scene
// trigger, scene actions, widget, connection status, persistence.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_TRIES } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { HOST, TOKEN, createLinkding, settle } from './helpers/fakeLinkding.js';
import { createAll, createWorld, mainDevice, mainFeature } from './helpers/world.js';

const events = (fake) => fake.sceneEvents.filter((event) => event.key === 'bookmark_added');
const ALLOW = { url: HOST, api_token: TOKEN, allow_add: true };

test('one linkding device, states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name, d.should_poll]),
    [[mainDevice, 'linkding', false]],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    [
      'Serveur joignable',
      'Favoris',
      'Favoris non lus',
      'Favoris archivés',
      'Dernier favori',
      'Version de linkding',
    ],
  );
  // Not added yet: nothing published.
  assert.equal(world.fake.states.length, 0);
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('online')), 1);
  assert.equal(world.fake.lastState(mainFeature('bookmarks')), 3);
  assert.equal(world.fake.lastState(mainFeature('unread')), 2);
  assert.equal(world.fake.lastState(mainFeature('archived')), 1);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Example Domain');
  assert.equal(world.fake.lastState(mainFeature('version')), '1.47.0');
  assert.ok(world.fake.widgetRefreshes.length > 0);
  assert.equal(world.fake.connectionStatus.connected, true);
  // onPoll (a Gladys that would poll anyway) republishes too.
  assert.equal((await world.fake.poll(devices[0])).success, true);
});

test('the container reads linkding on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, refresh_minutes: '5' },
  });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addBookmark({ url: 'https://example.org/read-me', title: 'Read me', unread: true });
  t.mock.timers.tick(5 * 60_000);
  await settle(20);
  assert.equal(world.fake.lastState(mainFeature('bookmarks')), 4);
  assert.equal(world.fake.lastState(mainFeature('unread')), 3);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Read me');
  assert.ok(!world.fake.requests.some((r) => r.path?.includes('poll')));
});

test('the filters of the configuration apply to the counters and the trigger', async (t) => {
  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, tag: '#cooking', search: 'lasagna' },
  });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('bookmarks')), 1);
  assert.equal(world.fake.lastState(mainFeature('unread')), 1);
  assert.equal(world.fake.lastState(mainFeature('archived')), 0);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Lasagna recipe');
  assert.ok(world.server.state.requests.some((r) => r.includes('q=lasagna+%23cooking')));
  assert.equal(world.fake.discoveredDevices[0].params[1].value, 'lasagna #cooking');
  world.server.addBookmark({ url: 'https://example.org/x', title: 'Other' });
  world.server.addBookmark({
    url: 'https://example.org/y',
    title: 'Lasagna again',
    tags: ['cooking'],
  });
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['Lasagna again'],
  );
});

test('new bookmark: silent baseline, one event per bookmark, oldest first, never twice', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');
  const a = world.server.addBookmark({
    url: 'https://example.org/a',
    title: 'Article A',
    tags: ['news', 'tech'],
    description: 'About A',
    unread: true,
  });
  world.server.addBookmark({ url: 'https://example.org/b' });
  // An import: a new id with an old date.
  world.server.addBookmark({ url: 'https://example.org/old', added: '2020-01-01T00:00:00Z' });
  await world.hub.refresh();
  await world.hub.refresh();
  const added = events(world.fake);
  assert.equal(added.length, 2, 'imports are not announced');
  assert.deepEqual(added[0].data, {
    title: 'Article A',
    url: 'https://example.org/a',
    description: 'About A',
    tags: 'news, tech',
    unread: true,
    bookmark_id: a.id,
  });
  // No title: the domain, as linkding shows the address.
  assert.equal(added[1].data.title, 'example.org');
});

test('a burst of new bookmarks: ten announced, the rest recorded as seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 12; i += 1) {
    world.server.addBookmark({ url: `https://example.org/${i}`, title: `Bookmark ${i}` });
  }
  await world.hub.refresh();
  const added = events(world.fake);
  assert.equal(added.length, 10);
  assert.equal(added[0].data.title, 'Bookmark 0');
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 10);
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addBookmark({ title: 'First', url: 'https://example.org/1' });
  world.server.addBookmark({ title: 'Second', url: 'https://example.org/2' });
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['First', 'Second'],
  );
});

test('a bookmark Gladys keeps refusing is given up, the next ones go through', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (key, data) => {
    if (data.title === 'Poison') {
      throw Object.assign(new Error('Internal error'), { status: 500 });
    }
    return publish(key, data);
  };
  world.server.addBookmark({ title: 'Poison', url: 'https://example.org/p' });
  world.server.addBookmark({ title: 'After', url: 'https://example.org/a' });
  for (let i = 0; i < MAX_TRIES; i += 1) {
    await world.hub.refresh();
  }
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['After'],
  );
});

test('the last bookmark seen survives a restart', async (t) => {
  const store = new MemoryStore();
  const server = createLinkding();
  const first = await createWorld({ server, store });
  await first.app.stop();
  assert.equal(store.data.key, JSON.stringify([HOST, '']));
  assert.equal(store.data.lastId, 4);
  server.addBookmark({ title: 'While stopped', url: 'https://example.org/w' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second.fake).map((e) => e.data.title),
    ['While stopped'],
  );
});

test('add_bookmark: off by default', async (t) => {
  const world = await createWorld({ config: { url: HOST, api_token: TOKEN, language: 'en' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('add_bookmark', { url: 'https://example.org/n' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Adding bookmarks from scenes is off/);
  assert.ok(!world.server.state.requests.some((r) => r.startsWith('POST')));
});

test('add_bookmark: saves with tags and unread, never announced', async (t) => {
  const world = await createWorld({ config: ALLOW });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const ack = await world.fake.sceneAction('add_bookmark', {
    url: 'www.example.org/soup',
    title: 'Soup',
    tags: 'dinner, #Soup; dinner later',
    unread: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { bookmark_id: 5, title: 'Soup', already_saved: false });
  const saved = world.server.state.bookmarks.at(-1);
  assert.equal(saved.url, 'https://www.example.org/soup');
  assert.deepEqual(saved.tag_names, ['dinner', 'Soup', 'later']);
  assert.equal(saved.unread, true);
  await settle(20);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0, 'no loop through the trigger');
  assert.equal(world.fake.lastState(mainFeature('unread')), 3);
  // A bookmark saved by hand afterwards is announced.
  world.server.addBookmark({ title: 'By hand', url: 'https://example.org/h' });
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['By hand'],
  );
});

test('add_bookmark: a link already saved is left untouched', async (t) => {
  const world = await createWorld({ config: ALLOW });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('add_bookmark', {
    url: 'https://example.org/recipes/lasagna',
    title: 'Overwritten?',
    tags: 'nope',
  });
  assert.deepEqual(ack.data.outputs, {
    bookmark_id: 1,
    title: 'Lasagna recipe',
    already_saved: true,
  });
  const lasagna = world.server.state.bookmarks.find((b) => b.id === 1);
  assert.equal(lasagna.title, 'Lasagna recipe');
  assert.deepEqual(lasagna.tag_names, ['cooking', 'italian']);
  assert.ok(!world.server.state.requests.some((r) => r.startsWith('POST')));
});

test('add_bookmark: errors in clear words', async (t) => {
  const world = await createWorld({ config: { ...ALLOW, language: 'en' } });
  t.after(() => world.app.stop());
  const fail = async (fields) => (await world.fake.sceneAction('add_bookmark', fields)).error;
  assert.match(await fail({ url: 'not a link' }), /http:\/\/ or https:\/\//);
  assert.match(await fail({ url: 'ftp://example.org' }), /http:\/\/ or https:\/\//);
  world.hub.client.fetch = async (url, init) =>
    init.method === 'POST'
      ? new Response('{"url":["Enter a valid URL."]}', { status: 400 })
      : world.server.fetch(url, init);
  assert.match(
    await fail({ url: 'https://example.org/z' }),
    /linkding refused the bookmark: url: Enter a valid URL\./,
  );
  world.hub.client.fetch = world.server.fetch;
  world.server.goDown();
  assert.match(await fail({ url: 'https://example.org/x' }), /does not answer/);
});

test('read_latest: the newest unread bookmarks, or all of them', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('read_latest', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    count: 2,
    bookmarks:
      'Example Domain — https://example.org/new-page\nLasagna recipe — https://example.org/recipes/lasagna',
    latest_title: 'Example Domain',
    latest_url: 'https://example.org/new-page',
  });
  ack = await world.fake.sceneAction('read_latest', { list: 'all', count: '3' });
  assert.equal(ack.data.outputs.count, 3);
  ack = await world.fake.sceneAction('read_latest', { list: 'all', count: '1' });
  assert.equal(ack.data.outputs.count, 1);
});

test('widget: counters and unread bookmarks, or the newest of all', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let content = (await world.fake.widgetGet('bookmarks', { language: 'fr', settings: {} })).data
    .content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components.slice(0, 2).map((c) => [c.label, c.value]),
    [
      ['Favoris non lus', 2],
      ['Favoris', 3],
    ],
  );
  const list = content.components[2];
  assert.deepEqual(
    list.items.map((i) => i.title),
    ['Example Domain', 'Lasagna recipe'],
  );
  assert.match(list.items[1].subtitle, /^example\.org · 15 nov\. · #cooking #italian$/);
  assert.equal(list.items[1].badge, undefined);
  assert.deepEqual(
    list.items[1].links.map((l) => l.url),
    ['https://example.org/recipes/lasagna'],
  );

  content = (
    await world.fake.widgetGet('bookmarks', {
      language: 'en',
      settings: { list: 'all', show_counters: false },
    })
  ).data.content;
  validateWidgetContent(content);
  assert.equal(content.components.length, 1);
  assert.equal(content.components[0].items.length, 3);
  assert.equal(content.components[0].items[0].badge.text, 'Unread');
  assert.equal(content.components[0].items[1].badge, undefined);
});

test('widget: nothing unread, nothing read yet', async (t) => {
  const server = createLinkding();
  server.state.bookmarks.forEach((b) => (b.unread = false));
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  const content = (await world.fake.widgetGet('bookmarks', { language: 'en', settings: {} })).data
    .content;
  assert.match(content.components.at(-1).text, /No unread bookmark/);
  const empty = await createWorld({ config: { url: '' } });
  t.after(() => empty.app.stop());
  const waiting = (await empty.fake.widgetGet('bookmarks', { language: 'en', settings: {} })).data
    .content;
  validateWidgetContent(waiting);
  assert.match(waiting.components[0].text, /Waiting for linkding/);
});

test('connection status: missing settings, refused token, down and back, not linkding', async (t) => {
  const world = await createWorld({ config: { url: '' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ url: 'ftp://x', api_token: TOKEN });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ url: HOST });
  assert.match(world.fake.connectionStatus.message.en, /API token/);
  await world.fake.configUpdated({ url: HOST, api_token: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refused the API token/);
  await world.fake.configUpdated({ url: HOST, api_token: `Token ${TOKEN}` });
  assert.equal(world.fake.connectionStatus.connected, true);
  await createAll(world.fake);
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(world.fake.lastState(mainFeature('online')), 0);
  assert.equal(world.fake.lastState(mainFeature('bookmarks')), 3, 'the last counts stay');
  const widget = (await world.fake.widgetGet('bookmarks', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.lastState(mainFeature('online')), 1);
  world.server.state.html = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer like linkding/);
});

test('a slow linkding is a timeout, not a hang', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.state.slow = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
});

test('test_connection: version and counts', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(ack.data.message.fr, 'Connecté à linkding 1.47.0 : 3 favori(s), 2 non lu(s).');
});

test('the language changes the names, not the device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: HOST, api_token: TOKEN, language: 'de' });
  const [main] = world.fake.discoveredDevices;
  assert.equal(main.external_id, mainDevice);
  assert.equal(main.features[1].name, 'Lesezeichen');
});

test('a bookmark saved from Gladys is not announced after a restart either', async (t) => {
  const store = new MemoryStore();
  const server = createLinkding();
  const first = await createWorld({ server, store, config: ALLOW });
  first.hub.refresh = async () => {}; // stopped before the next read
  await first.fake.sceneAction('add_bookmark', { url: 'https://example.org/own' });
  await first.app.stop();
  assert.equal(store.data.lastId, 4, 'the saved bookmark was not read back');
  assert.deepEqual(store.data.own, [5]);
  const second = await createWorld({ server, store, config: ALLOW });
  t.after(() => second.app.stop());
  assert.equal(events(second.fake).length, 0);
});

test('an error answer during a read is not called "does not answer"', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.hub.client.fetch = async () => new Response('{"detail":"boom"}', { status: 500 });
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /answered with an error/);
});

test('a filter change is a new silent baseline', async (t) => {
  const world = await createWorld({ config: { url: HOST, api_token: TOKEN, tag: 'cooking' } });
  t.after(() => world.app.stop());
  // Added while filtered out: it only starts matching when the filter goes.
  world.server.addBookmark({ title: 'Untagged', url: 'https://example.org/u' });
  await world.hub.refresh();
  await world.fake.configUpdated({ url: HOST, api_token: TOKEN });
  await settle(20);
  assert.equal(events(world.fake).length, 0);
  world.server.addBookmark({ title: 'Really new', url: 'https://example.org/n' });
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['Really new'],
  );
});

test('add_bookmark: a check that times out says nothing was saved', async (t) => {
  const world = await createWorld({ config: { ...ALLOW, language: 'en' } });
  t.after(() => world.app.stop());
  world.server.state.slow = true;
  const ack = await world.fake.sceneAction('add_bookmark', { url: 'https://example.org/slow' });
  assert.match(ack.error, /nothing was done/);
  assert.ok(!world.server.state.requests.some((r) => r.startsWith('POST')));
});
