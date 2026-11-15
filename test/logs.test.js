// What reaches `docker logs` at the default level (info): the lifecycle only.
// A normal cycle (reads, published states, events, polls) writes nothing at
// info, an outage logs one line, and its recovery one more.
//
// The SDK logger writes through console.log (debug, info) and console.error
// (warn, error), re-reading LOG_LEVEL on every call: the tests capture both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST, TOKEN, createLinkding } from './helpers/fakeLinkding.js';
import { createAll, createWorld } from './helpers/world.js';

function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const captured = [];
  const record = (...args) => captured.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    all: () => [...captured],
    lines: () =>
      captured.filter((line) => !line.includes('[DEBUG]') && line.includes('[linkding-')),
    reset: () => captured.splice(0),
  };
}

test('a normal cycle writes nothing at info: reads, states, events, polls', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const start = logs.lines();
  assert.deepEqual(start.length, 1, start.join('\n'));
  assert.match(start[0], /Connected to linkding 1\.47\.0 \(3 bookmarks\)/);
  logs.reset();
  for (let i = 0; i < 5; i += 1) {
    world.server.addBookmark({ url: `https://example.org/${i}` });
    await world.hub.refresh();
  }
  await world.fake.poll(world.fake.discoveredDevices[0]);
  await world.fake.widgetGet('bookmarks', { settings: {} });
  await world.fake.sceneAction('read_latest', {});
  assert.equal(world.fake.sceneEvents.length, 5, 'events were fired');
  assert.deepEqual(logs.lines(), [], 'nothing at info or above');
});

test('one line per save asked by the user', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld({ config: { url: HOST, api_token: TOKEN, allow_add: true } });
  t.after(() => world.app.stop());
  logs.reset();
  await world.fake.sceneAction('add_bookmark', {
    url: 'https://example.org/secret-plans',
    tags: 'a, b',
  });
  const lines = logs.lines();
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[INFO\].*Bookmark saved, 2 tag\(s\)/);
  assert.ok(!lines[0].includes('secret-plans'), 'the link is not logged');
});

test('linkding down: one warning, nothing per attempt, one line when it is back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  world.server.goDown();
  for (let i = 0; i < 4; i += 1) {
    await world.hub.refresh();
  }
  const down = logs.lines();
  assert.equal(down.length, 1, down.join('\n'));
  assert.match(down[0], /\[WARN\].*linkding unreachable \(ECONNREFUSED\)/);
  logs.reset();
  world.server.goUp();
  await world.hub.refresh();
  const back = logs.lines();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*linkding answers again \(3 bookmarks\)/);
});

test('the API token never reaches the logs', async (t) => {
  const logs = captureLogs(t);
  for (const token of ['s3cr3t-wrong-token', TOKEN]) {
    const world = await createWorld({
      server: createLinkding(),
      config: { url: HOST, api_token: token },
    });
    await world.hub.refresh();
    await world.app.stop();
  }
  const all = logs.all().join('\n');
  for (const secret of ['s3cr3t-wrong-token', TOKEN]) {
    assert.ok(!all.includes(secret), secret);
  }
});
