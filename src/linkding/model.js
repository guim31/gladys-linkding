// -----------------------------------------------------------------------------
// linkding answers -> plain values: bookmark summaries, tags and links typed
// by the user. No I/O here.
// -----------------------------------------------------------------------------

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** `https://www.example.org/a` -> `example.org`; '' when not a URL. */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The few fields Gladys shows of a bookmark. Like linkding, the title typed
 * by the user, else the title read from the page, else the address (shown
 * here as its domain).
 * @param {object} bookmark a linkding bookmark
 */
export function summarizeBookmark(bookmark) {
  const url = typeof bookmark?.url === 'string' ? bookmark.url : '';
  const title = clean(bookmark?.title) || clean(bookmark?.website_title) || domainOf(url) || url;
  return {
    id: Number.isInteger(bookmark?.id) ? bookmark.id : 0,
    title,
    url,
    description: clean(bookmark?.description) || clean(bookmark?.website_description),
    tags: Array.isArray(bookmark?.tag_names) ? bookmark.tag_names.map(clean).filter(Boolean) : [],
    unread: bookmark?.unread === true,
    archived: bookmark?.is_archived === true,
    added: String(bookmark?.date_added ?? ''),
  };
}

// linkding stores tag names of 64 characters at most, without spaces.
export const MAX_TAG_LENGTH = 64;
export const MAX_TAGS = 20;

/** `"dinner, #italian; dinner later"` -> `['dinner', 'italian', 'later']` */
export function parseTags(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const tags = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const tag = part.replace(/^#+/, '').slice(0, MAX_TAG_LENGTH);
    const key = tag.toLocaleLowerCase();
    if (tag !== '' && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, MAX_TAGS);
}

/**
 * A link typed in a form or a scene: `https://...`, `http://...`, or
 * `www.example.org/...` (https assumed). Null when it is not one.
 */
export function asLink(raw) {
  const text = clean(raw);
  if (/\s/.test(text) || text === '' || text.length > 2048) {
    return null;
  }
  const candidate = /^www\./i.test(text) ? `https://${text}` : text;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? candidate : null;
  } catch {
    return null;
  }
}
