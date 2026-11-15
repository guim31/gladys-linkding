// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): save a bookmark in linkding — the
// link of a camera clip, a page sent from a voice scene — (off unless the
// configuration allows it), and read the newest bookmarks, to send them in a
// message or speak them.
// -----------------------------------------------------------------------------

// The text output of "Read the latest bookmarks": one line per bookmark.
export const lines = (bookmarks) =>
  bookmarks.map((b) => (b.url && b.url !== b.title ? `${b.title} — ${b.url}` : b.title));

export const SCENE_ACTIONS = {
  async add_bookmark(hub, { fields = {} }) {
    const saved = await hub.save({
      url: fields.url,
      title: fields.title,
      tags: fields.tags,
      unread: fields.unread,
    });
    return { bookmark_id: saved.id, title: saved.title, already_saved: saved.existed };
  },
  async read_latest(hub, { fields = {} }) {
    const bookmarks = await hub.readLatest({ list: fields.list, count: fields.count });
    return {
      count: bookmarks.length,
      bookmarks: lines(bookmarks).join('\n').slice(0, 10_000),
      latest_title: bookmarks[0]?.title ?? '',
      latest_url: bookmarks[0]?.url ?? '',
    };
  },
};
