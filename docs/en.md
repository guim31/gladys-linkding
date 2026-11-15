# linkding

Connect Gladys to [linkding](https://linkding.link), the self-hosted bookmark
manager: follow your counters (bookmarks, unread, archived), see your unread
bookmarks on the dashboard, react when a bookmark is added, read the newest
ones in a message, and, if you allow it, save links from your scenes.
Everything stays on your local network: Gladys talks directly to your
linkding server.

Tested against a real linkding 1.47.0 server (the official Docker image).
Feedback welcome on the Gladys forum.

## Prerequisites

- Gladys Assistant 5.1 or later.
- linkding, reachable from the Gladys machine, on port 9090 by default, or
  through a reverse proxy.
- An API token: in linkding, open **Settings → Integrations**, and create a
  token in the **REST API** section. The integration sees the bookmarks of the
  user who owns the token.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **linkding address**, enter the IP address of the server, for example
   `192.168.1.50`: the integration then uses port 9090. Add a port if yours
   differs (`192.168.1.50:9091`). Behind a reverse proxy, enter the full
   address (`https://links.example.org`, with its path if linkding runs under
   one).
3. Paste the **API token**.
4. **Filters (optional)**: a **Tag** (`toread`) and/or a **Search** (words, as
   in the search field of linkding). The counters, the widget, the **New
   bookmark** trigger and **Read the latest linkding bookmarks** then only take
   the matching bookmarks into account. Leave both empty for all bookmarks.
5. **Read linkding every**: 5, 15 (default), 30 or 60 minutes.
6. **Allow scenes to add bookmarks**: off by default. Turn it on to use the
   **Add a bookmark to linkding** scene action.
7. **Language of names and messages** sets the feature names (fixed when the
   device is added) and the texts of the integration. French by default.
8. Save, then use **Test the connection**: it shows the linkding version and
   the number of bookmarks.
9. In the **Discovery** tab, add the **linkding** device.

## Devices

**linkding** (one device):

| Feature            | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| Server online      | 1 when linkding answers, 0 otherwise                    |
| Bookmarks          | number of bookmarks, archived ones excepted             |
| Unread bookmarks   | number of bookmarks marked unread                       |
| Archived bookmarks | number of archived bookmarks                            |
| Latest bookmark    | title of the newest bookmark (its domain without title) |
| linkding version   | version of the server, e.g. 1.47.0                      |

The filters of the configuration apply to the three counters and to the latest
bookmark. The counters keep their history: a chart shows how your reading
pile grows. When linkding does not answer, **Server online** goes to 0 and
the counters keep their last value.

## Dashboard widget

**linkding**: two tiles (unread, bookmarks) and the six newest unread
bookmarks, with their domain, date and tags. Tap a bookmark to read its
description and to open it (https links only). In the widget settings,
**List** shows the newest bookmarks instead (unread ones then carry an
**Unread** badge), and **Show the counters** hides the two tiles.

## Scene triggers

**New bookmark**: a bookmark matching the filters of the configuration is
added to linkding, from the web app, the browser extension or the API.
Imports (whose bookmarks keep their old dates) and the bookmarks saved by this
integration are not announced.

Variables: **Title**, **Link**, **Description**, **Tags** (separated by
commas), **Unread** and **Bookmark id**.

The first read after the installation is silent: the bookmarks already there
are not announced. At most ten events are fired per read; the rest is counted
as seen.

## Scene actions

- **Add a bookmark to linkding** (turn on **Allow scenes to add bookmarks**
  first): **Link** (required), and optionally **Title** (empty: linkding reads
  the title of the page), **Tags** (separated by spaces or commas; missing
  tags are created) and **Mark as unread**. A link already in linkding is
  left exactly as it is (linkding would otherwise replace its title and
  tags). Returns **Bookmark id**, **Title** and **Already saved**.
- **Read the latest linkding bookmarks**: **Bookmarks** (unread only, the
  default, or all) and **Number of bookmarks** (1, 3, 5 or 10). Returns
  **Number of bookmarks read**, **Bookmarks, one per line** (`title —
address`), **Title of the newest bookmark** and **Address of the newest
  bookmark**.

## Scene examples

- **New reading on your phone**: trigger **New bookmark** → send a message
  "To read: {{triggerEvent.data.title}} {{triggerEvent.data.url}}".
- **Sunday reading**: every Sunday at 10:00 → **Read the latest linkding
  bookmarks**, unread only, 5 bookmarks → send a message with the output
  **Bookmarks, one per line**.
- **Save the camera clip**: when another integration gives a clip address →
  **Add a bookmark to linkding** with that address, tag `doorbell`.
- **Reading pile**: every evening → continue only if **Unread bookmarks** is
  above 30 → send a message "Your reading pile has more than 30 bookmarks".
- **Server down**: **Server online** goes to 0 → send a message.

## Troubleshooting

- **"linkding refused the API token"**: the token was deleted or mistyped.
  Create a new one in linkding → Settings → Integrations.
- **"linkding does not answer"**: check the address and the port from the
  Gladys machine. The container uses a bridge network: `localhost` is the
  container itself, enter the IP address of the server instead.
- **"This address does not answer like linkding"**: a proxy login page answers
  instead of linkding, or the path is wrong. Enter the address of linkding
  itself.
- **"Adding bookmarks from scenes is off"**: turn on **Allow scenes to add
  bookmarks** in the configuration.
- To see more in the logs of the integration, set `LOG_LEVEL=debug`.

## Limits

- One linkding user: the owner of the token.
- The trigger fires at the next read (15 minutes by default), not instantly:
  linkding pushes nothing. It reads the 50 newest bookmarks: past 50 added
  between two reads, the oldest are not announced.
- A bookmark added already archived is counted but not announced.
- The integration never deletes, changes nor archives anything in linkding.
- Not affiliated with the linkding project.
