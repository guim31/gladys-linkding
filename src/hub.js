// -----------------------------------------------------------------------------
// The hub: the link to one linkding server and everything Gladys sees of it —
// the device, its states, the connection status, the scene events, and the
// bookmarks saved or read from scenes.
//
// linkding pushes nothing: the container reads it every `refresh_minutes`
// (15 by default) on its own timer (should_poll: false). A read is four light
// requests: the profile (version, token check), the newest page of bookmarks
// (count + new ones), the unread ones (count + widget list) and the count of
// archived ones. The filters of the configuration apply to all of them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, buildStates, deviceIds, isOurs } from './devices.js';
import { LinkdingClient, LinkdingError } from './linkding/client.js';
import { asLink, parseTags, summarizeBookmark } from './linkding/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'linkding-hub' });

export const WIDGET_KEY = 'bookmarks';
export const TRIGGERS = { added: 'bookmark_added' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
};

// The newest bookmarks read at each pass: new ones past that many between
// two reads are counted but not announced.
export const PAGE_SIZE = 50;
export const LIST_SIZE = 20;
// A burst of saves can bring many bookmarks at once: past that many events in
// one read, the rest is recorded as seen without firing.
export const MAX_EVENTS_PER_READ = 10;
// An import (Netscape HTML) brings new ids with their old dates: a bookmark
// added more than a day before the read is never announced.
export const MAX_EVENT_AGE = 24 * 3_600_000;
// The bookmarks saved by the integration itself are never announced (a scene
// bound to "New bookmark" that saves one would loop).
const MAX_OWN = 200;
// Reads after which a bookmark whose event Gladys keeps refusing is given up.
export const MAX_TRIES = 3;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.token]);

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      token: '',
      tag: '',
      search: '',
      query: '',
      refreshMinutes: 15,
      allowAdd: false,
      language: 'fr',
    };
    this.client = null;
    /** { bookmarks, unread, archived } */
    this.counters = null;
    /** the newest bookmarks and the newest unread ones, summarized */
    this.latest = [];
    this.unread = [];
    this.version = '';
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the trigger already saw: { server, lastId } */
    this.seen = null;
    this.own = new Set();
    /** bookmark id -> reads at which Gladys refused its event */
    this.retries = new Map();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  get online() {
    return Boolean(this.client) && this.loaded && this.failure === null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      typeof saved.server === 'string' && Number.isInteger(saved.lastId) && saved.lastId >= 0
        ? { server: saved.server, lastId: saved.lastId }
        : null;
    // The bookmarks saved from Gladys but not read back yet: never announced,
    // even after a restart.
    if (Array.isArray(saved.own)) {
      this.own = new Set(saved.own.filter(Number.isInteger).slice(-MAX_OWN));
    }
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    const filterChanged = previous.query !== config.query;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.counters = null;
      this.latest = [];
      this.unread = [];
      this.version = '';
      this.failure = null;
      this.announced = false;
      if (config.url && config.token) {
        this.client = new LinkdingClient({
          url: config.url,
          token: config.token,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged || filterChanged) {
      await this.refresh();
    } else {
      // Language, interval or scene switch only: same data, new texts.
      this.gladys.forgetPublishedStates?.();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  // --- Reading linkding -----------------------------------------------------

  /** Read linkding (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    const q = this.config.query;
    let profile;
    let all;
    let unread;
    let archived;
    try {
      [profile, all, unread, archived] = await Promise.all([
        client.profile(),
        client.bookmarks({ q, limit: PAGE_SIZE }),
        client.bookmarks({ q: `${q} !unread`.trim(), limit: LIST_SIZE }),
        client.bookmarks({ q, limit: 1, archived: true }),
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.#update();
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped || q !== this.config.query) {
      return; // the configuration changed meanwhile: a new read is queued
    }
    const bookmarks = all.results.map(summarizeBookmark);
    this.version = typeof profile.version === 'string' ? profile.version.trim() : '';
    this.counters = { bookmarks: all.count, unread: unread.count, archived: archived.count };
    this.latest = bookmarks.slice(0, LIST_SIZE);
    this.unread = unread.results.map(summarizeBookmark);
    this.#recover();
    await this.#update();
    if (client !== this.client || this.stopped) {
      return;
    }
    await this.#announce(bookmarks);
    await this.updateConnectionStatus();
  }

  /** Device, states and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof LinkdingError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`linkding: ${err.message}`);
    } else {
      logger.debug(`linkding still failing: ${err.message}`);
    }
    this.failure = kind;
  }

  #recover() {
    const count = this.counters.bookmarks;
    if (this.failure !== null) {
      logger.info(`linkding answers again (${count} bookmarks)`);
    } else if (!this.announced) {
      logger.info(`Connected to linkding ${this.version} (${count} bookmarks)`.replace('  ', ' '));
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the bookmarks added since the last read, the oldest first. The first
   * read of a linkding server is a silent baseline: installing the
   * integration announces nothing already there. Bookmark ids only grow, so
   * the highest id seen is all there is to remember.
   * @param {object[]} bookmarks the newest bookmarks of the filters, summarized
   */
  async #announce(bookmarks) {
    const server = this.config.url;
    const known = this.seen?.server === server ? this.seen : null;
    const newest = bookmarks.reduce((max, b) => Math.max(max, b.id), known?.lastId ?? 0);
    let lastId = newest;
    if (known) {
      const now = this.now();
      const added = bookmarks
        .filter(
          (b) =>
            b.id > known.lastId &&
            !this.own.has(b.id) &&
            !(now - Date.parse(b.added) > MAX_EVENT_AGE),
        )
        .sort((a, b) => a.id - b.id);
      if (added.length > MAX_EVENTS_PER_READ) {
        logger.info(`${added.length} new bookmarks at once: ${MAX_EVENTS_PER_READ} announced`);
      }
      for (const bookmark of added.slice(0, MAX_EVENTS_PER_READ)) {
        logger.debug(`${TRIGGERS.added}: ${bookmark.id}`);
        try {
          await this.gladys.publishSceneEvent(TRIGGERS.added, this.#eventData(bookmark));
          if (this.eventFailing) {
            logger.info('Scene events accepted again');
          }
          this.eventFailing = false;
        } catch (err) {
          if (this.eventFailing) {
            logger.debug(`Cannot fire ${TRIGGERS.added}: ${err.message}`);
          } else {
            logger.warn(`Cannot fire ${TRIGGERS.added}: ${err.message}`);
          }
          this.eventFailing = true;
          // A refusal for good (4xx but 429) is not retried: it would be
          // refused at every read. Otherwise (Gladys restarting), this
          // bookmark and the next ones are fired again at the next read.
          const status = err?.status;
          const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
          const tries = (this.retries.get(bookmark.id) ?? 0) + 1;
          if (!final && tries < MAX_TRIES) {
            this.retries.set(bookmark.id, tries);
            lastId = bookmark.id - 1;
            break;
          }
          if (!final) {
            logger.warn(`Bookmark ${bookmark.id} not announced: Gladys refused it ${tries} times`);
          }
        }
        this.retries.delete(bookmark.id);
      }
    }
    for (const id of this.own) {
      if (id <= lastId) {
        this.own.delete(id);
      }
    }
    const next = { server, lastId, own: [...this.own] };
    if (JSON.stringify(next) !== JSON.stringify(this.seen)) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  #eventData(bookmark) {
    return {
      title: bookmark.title.slice(0, 1000),
      url: bookmark.url.slice(0, 1000),
      description: bookmark.description.slice(0, 1000),
      tags: bookmark.tags.join(', ').slice(0, 1000),
      unread: bookmark.unread,
      bookmark_id: bookmark.id,
    };
  }

  // --- Device and states ----------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    // Offered once linkding answered at least once with this address and token.
    if (!this.loaded) {
      return [];
    }
    return [buildDevice(this.gladys, this.language, this.config.url ?? '', this.config.query)];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the device, when the user added it (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (this.stopped || !this.client) {
      return;
    }
    const id = deviceIds(this.gladys).device;
    if (id !== justCreated && !this.#isCreated(id)) {
      return;
    }
    // Before the first answer or failure, nothing is known yet.
    if (!this.loaded && this.failure === null) {
      return;
    }
    const states = buildStates(
      this.gladys,
      {
        online: this.online,
        counters: this.counters,
        latest: this.latest[0],
        version: this.version,
      },
      this.language,
    );
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  /** The user added the device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!isOurs(this.gladys, device?.external_id)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the device is not polled: the container reads on its timer). */
  async poll(device) {
    if (isOurs(this.gladys, device?.external_id)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.token) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          http: 'error',
          rejected: 'error',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    return key ? this.#statusOf(key) : null;
  }

  #statusOf(key) {
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = this.online;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.loaded) {
      // The configuration changed during the test: nothing read yet.
      return this.#statusOf('unreachable');
    }
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.version, this.counters.bookmarks, this.counters.unread),
      ]),
    );
  }

  #clientOrFail() {
    if (!this.client) {
      throw new CommandError('unreachable', this.language);
    }
    return this.client;
  }

  /**
   * Save a bookmark (scene action, off unless the configuration allows it).
   * A link already saved is left untouched: linkding would overwrite its
   * title, tags and unread flag.
   * @param {{ url: unknown, title?: unknown, tags?: unknown, unread?: unknown }} request
   * @returns {Promise<{ id: number, title: string, existed: boolean }>}
   */
  async save({ url, title, tags, unread }) {
    const language = this.language;
    if (!this.config.allowAdd) {
      throw new CommandError('disabled', language);
    }
    const link = asLink(url);
    if (!link) {
      throw new CommandError('url', language);
    }
    const client = this.#clientOrFail();
    const tagNames = parseTags(tags);
    const cleanTitle = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
    let existing;
    let created;
    try {
      existing = await client.existing(link);
      if (!existing) {
        created = await client.create({
          url: link,
          title: cleanTitle.slice(0, 512),
          tags: tagNames,
          unread: unread === true || unread === 'true',
        });
      }
    } catch (err) {
      throw this.#commandError(err, 'http');
    }
    if (existing) {
      logger.info('Bookmark already saved: left as it is');
      const summary = summarizeBookmark(existing);
      return { id: summary.id, title: summary.title, existed: true };
    }
    this.#remember(created.id);
    const summary = summarizeBookmark(created);
    logger.info(`Bookmark saved${tagNames.length ? `, ${tagNames.length} tag(s)` : ''}`);
    // The counters and the widget follow without waiting for the timer.
    this.refresh().catch(() => {});
    return { id: created.id, title: summary.title, existed: false };
  }

  /**
   * The newest bookmarks of the filters (unread ones only by default), read now.
   * @param {{ list?: unknown, count?: unknown }} request
   */
  async readLatest({ list, count }) {
    const client = this.#clientOrFail();
    const wanted = Math.min(Math.max(Math.round(Number(count)) || 5, 1), LIST_SIZE);
    const q = list === 'all' ? this.config.query : `${this.config.query} !unread`.trim();
    try {
      const page = await client.bookmarks({ q, limit: wanted });
      return page.results.map(summarizeBookmark);
    } catch (err) {
      throw this.#commandError(err, 'read');
    }
  }

  #remember(id) {
    this.own.add(id);
    if (this.own.size > MAX_OWN) {
      this.own.delete(this.own.values().next().value);
    }
    // Kept on disk: a restart before the next read must not announce it.
    this.store.save({ ...this.seen, own: [...this.own] }).catch(() => {});
  }

  #commandError(err, fallback) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof LinkdingError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'rejected' && fallback === 'http') {
      return new CommandError('rejected', this.language, { detail });
    }
    if (kind === 'timeout' && fallback === 'http') {
      // The request may have reached linkding: the bookmark may exist.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable' || kind === 'timeout') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError(fallback, this.language, { detail });
  }
}
