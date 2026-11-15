// -----------------------------------------------------------------------------
// The "linkding" dashboard widget: the counters (bookmarks, unread) and the
// newest unread bookmarks — or the newest of all, as set in the widget —, from
// the last read. The filters of the configuration apply. Read only: no button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { domainOf } from './linkding/model.js';
import { NAMES, pick } from './texts.js';

export const MAX_ITEMS = 6;

export const TEXT = {
  unread: { en: 'Unread', fr: 'Non lu', de: 'Ungelesen', es: 'Sin leer' },
  open: { en: 'Open the link', fr: 'Ouvrir le lien', de: 'Link öffnen', es: 'Abrir el enlace' },
  empty_unread: {
    en: 'No unread bookmark: all caught up.',
    fr: 'Aucun favori non lu : tout est lu.',
    de: 'Kein ungelesenes Lesezeichen: Alles gelesen.',
    es: 'Ningún marcador sin leer: todo está leído.',
  },
  empty: {
    en: 'No bookmark to show yet.',
    fr: 'Aucun favori à afficher pour le moment.',
    de: 'Noch kein Lesezeichen anzuzeigen.',
    es: 'Todavía no hay ningún marcador que mostrar.',
  },
  unavailable: {
    en: 'linkding does not answer right now: the list may be out of date.',
    fr: 'linkding ne répond pas pour le moment : la liste peut être ancienne.',
    de: 'linkding antwortet gerade nicht: Die Liste ist vielleicht veraltet.',
    es: 'linkding no responde en este momento: puede que la lista no esté al día.',
  },
  waiting: {
    en: 'Waiting for linkding: check the configuration of the integration.',
    fr: "En attente de linkding : vérifiez la configuration de l'intégration.",
    de: 'Warte auf linkding: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a linkding: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url);

function shortDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(
    { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB',
    { day: 'numeric', month: 'short' },
  );
}

/** One row of the list; the unread badge only when the list mixes both. */
export function bookmarkItem(bookmark, language, showUnread) {
  const tags = bookmark.tags.map((t) => `#${t}`).join(' ');
  const parts = [domainOf(bookmark.url), shortDate(bookmark.added, language), tags];
  const item = {
    title: cut(bookmark.title || bookmark.url || '…', 60),
    subtitle: cut(parts.filter(Boolean).join(' · '), 60),
  };
  if (showUnread && bookmark.unread) {
    item.badge = { text: pick(TEXT.unread, language), color: WIDGET_COLORS.INFO };
  }
  if (bookmark.description) {
    item.description = cut(bookmark.description, 2000);
  }
  // The links of a card must be https.
  if (https(bookmark.url)) {
    item.links = [{ url: bookmark.url.slice(0, 2000), label: pick(TEXT.open, language) }];
  }
  return item;
}

export function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const all = settings?.list === 'all';
  const names = pick(NAMES, language);
  const components = [];
  if (settings?.show_counters !== false) {
    components.push(
      { type: 'value', label: names.unread, value: hub.counters.unread, icon: 'book-open' },
      { type: 'value', label: names.bookmarks, value: hub.counters.bookmarks, icon: 'bookmark' },
    );
  }
  if (hub.failure !== null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  }
  const bookmarks = (all ? hub.latest : hub.unread).slice(0, MAX_ITEMS);
  if (bookmarks.length === 0) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: pick(all ? TEXT.empty : TEXT.empty_unread, language),
    });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: bookmarks.map((b) => bookmarkItem(b, language, all)),
    });
  }
  // The hub nudges the widget after every read.
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
  },
};
