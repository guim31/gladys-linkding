# linkding for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
[linkding](https://linkding.link), the self-hosted bookmark manager.

## Features

- One **linkding** device: server online, number of bookmarks, unread and
  archived bookmarks, title of the newest bookmark, linkding version.
- Optional **filters** (a tag, a search) applied to the counters, the widget,
  the trigger and the reading action.
- A dashboard **widget**: the counters and the newest unread bookmarks (or the
  newest of all).
- A scene trigger, **New bookmark**, with its title, link, description, tags
  and unread flag.
- Scene actions: **Add a bookmark to linkding** (off until allowed in the
  configuration; a link already saved is never changed) and **Read the latest
  linkding bookmarks**, to send them in a message.
- Texts in English, French, German and Spanish.

Tested against a real linkding 1.47.0 server (the official Docker image), not
yet on a real Gladys: feedback welcome.

## Requirements

- Gladys Assistant 5.1 or later.
- linkding, reachable from Gladys (port 9090 by default), and an API token
  (linkding → Settings → Integrations → REST API).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-linkding` (or find **linkding** in the
   catalog).
2. In **Configuration**, enter the address of linkding (`192.168.1.50`, port
   9090 by default) and the API token. Save.
3. Add the **linkding** device from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

linkding pushes nothing: the container reads it every 15 minutes by default (5
to 60) with four light requests of its REST API — the profile (version), the
50 newest bookmarks (`count` and new ones), the unread ones (`!unread`) and the
count of archived ones —, the filters being sent as the search query `q`. The
device is published with `should_poll: false`; only changed states are sent to
Gladys. A save first asks `GET /api/bookmarks/check/`: linkding's
`POST /api/bookmarks/` would otherwise overwrite an existing bookmark.

## Limitations

- One linkding user, the owner of the token.
- The trigger fires at the next read, not instantly; at most ten events per
  read, from the 50 newest bookmarks; imports are not announced.
- Nothing is ever deleted, changed or archived in linkding.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake linkding answering with
bodies recorded on a real linkding 1.47.0 server
(`test/fixtures/linkding/1.47.0/`).

## Credits

- [linkding](https://github.com/sissbruecker/linkding), by Sascha Ißbrücker
  and contributors (MIT): this integration only talks to its REST API and
  contains none of its code.
- The cover shows the linkding logo, taken from the
  [linkding repository](https://github.com/sissbruecker/linkding) (MIT).
- Built on the design of
  [gladys-linkwarden](https://github.com/guim31/gladys-linkwarden).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the linkding
project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
