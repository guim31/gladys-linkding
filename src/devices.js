// -----------------------------------------------------------------------------
// linkding -> one Gladys device, `linkding:server`: server online, bookmarks,
// unread, archived (all three through the optional filters of the
// configuration), the title of the newest bookmark and the linkding version.
// One integration talks to one linkding: the device id does not depend on its
// address, so a new IP or a reverse proxy keeps the device and its history.
// Everything is read only: bookmarks are saved through the scene action.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, NONE, pick } from './texts.js';

export const DEVICE_TYPE = 'linkding';
export const PLATFORM_ID = 'server';
export const COUNTERS = ['bookmarks', 'unread', 'archived'];

const MAX_COUNT = 10_000_000;

export const deviceIds = (gladys) => gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);

const readOnly = { read_only: true, has_feedback: false };

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  ...readOnly,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

const textFeature = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.TEXT,
  type: TYPE.TEXT.TEXT,
  ...readOnly,
  min: 0,
  max: 0,
  keep_history: false,
});

/**
 * @param {object} gladys
 * @param {string} language
 * @param {string} url linkding base URL (a device param, shown in Gladys)
 * @param {string} filter the search query of the filters ('' when none)
 */
export function buildDevice(gladys, language, url, filter) {
  const names = pick(NAMES, language);
  const ids = deviceIds(gladys);
  return {
    name: 'linkding',
    external_id: ids.device,
    model: 'linkding',
    should_poll: false,
    features: [
      {
        name: names.online,
        external_id: ids.feature('online'),
        category: CAT.INPUT,
        type: TYPE.SENSOR.BINARY,
        ...readOnly,
        min: 0,
        max: 1,
        keep_history: true,
      },
      ...COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      textFeature(names.latest, ids.feature('latest')),
      textFeature(names.version, ids.feature('version')),
    ],
    params: [
      { name: 'LINKDING_URL', value: url },
      { name: 'LINKDING_FILTER', value: filter.slice(0, 200) },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {{ online: boolean, counters: object | null, latest: object | undefined, version: string }} snapshot
 * @param {string} language
 */
export function buildStates(gladys, { online, counters, latest, version }, language) {
  const ids = deviceIds(gladys);
  const states = [{ device_feature_external_id: ids.feature('online'), state: online ? 1 : 0 }];
  if (counters) {
    states.push(
      ...COUNTERS.map((key) => ({
        device_feature_external_id: ids.feature(key),
        state: counters[key],
      })),
      {
        device_feature_external_id: ids.feature('latest'),
        text: (latest?.title || pick(NONE, language)).slice(0, 200),
      },
    );
  }
  if (version) {
    states.push({ device_feature_external_id: ids.feature('version'), text: version.slice(0, 50) });
  }
  return states;
}

/** True when the external id is our device. */
export const isOurs = (gladys, externalId) => externalId === deviceIds(gladys).device;
