# Better Sidebar

A BB plugin that replaces the sidebar's thread list with one grouped by
project, gives every project an icon, and carries that icon into the browser
tab.

- **Threads grouped by project.** Collapsible project sections, pinned threads
  first, child threads nested under their parent, and BB's own status glyphs on
  each row.
- **A project icon, resolved for you.** By default a project's icon comes from
  its repository: the GitHub account avatar, a GitLab project avatar, or the git
  host's favicon. No configuration, no token.
- **Your icon when you prefer one.** Override any project with an image URL or
  a file you upload. Uploads are resized to 128px in the browser before they are
  stored.
- **The project in your tab.** While you are inside a project, the browser tab's
  favicon is that project's icon. Leave the project and BB's own favicon comes
  back.

## Install

```sh
bb plugin install git:https://github.com/suiramdev/bb-plugin-better-sidebar.git@^0.1.0
```

The new list activates as soon as the plugin is installed. BB's own list is
always one click away under **Settings → Appearance → Sidebar**, and it returns
by itself if this plugin is disabled or ever crashes.

## Choosing an icon

Right-click a project header in the sidebar and pick **Set project icon…**, or
open **Extensions → Better Sidebar** for the same editor over every project.
Four sources:

| Source                | What it does                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| From the repository    | The default. Resolves from the project's `gitRemoteUrl` — GitHub account avatar, GitLab project avatar, or the host favicon. |
| From a URL             | The server fetches the image, so a private or VPN-only host works and CORS never applies.                        |
| Upload                 | Any image the browser can decode, resized to a 128px PNG before it is stored.                                    |
| No icon                | A monogram tile, and BB's favicon stays untouched in the tab.                                                     |

Resolution is lazy and cached: the first sidebar read of a project resolves it,
a success is trusted for a week, a failure is retried after six hours, and a
project whose git remote changed is resolved again. One nightly sweep keeps
long-lived icons honest. Nothing is ever fetched for a project with no remote.

## Settings

Each visual feature is a toggle on the plugin's settings page:

- **Project icons in the sidebar** — the icon on each project header.
- **Use the project icon as the browser tab favicon** — the tab icon.
- **Show each thread's branch or machine** — the trailing label on a row.
- **Show pull request status on threads** — off by default, because each row
  costs a git-host lookup.

Settings apply live; there is no reload to run.

## `bb better-sidebar`

```sh
bb better-sidebar list                        # every project, its mode, origin, and any error
bb better-sidebar set bb --url https://…      # a project can be named instead of identified
bb better-sidebar set bb --auto               # back to the repository default
bb better-sidebar set bb --none               # no icon
bb better-sidebar refresh bb                  # re-fetch now
```

Uploads are deliberately not in the CLI: the command runs on the server, so a
path argument would name a file on whichever machine typed it.

## Two things to know

**The tab favicon is exclusive.** BB tints its own favicon and puts an unread
dot on it. While a project icon is showing, this plugin owns those two
`<link rel="icon">` elements and reasserts its icon if something else writes
them, so BB's tint and unread dot are not visible on that tab. Both come back
the moment you leave the project, turn the toggle off, or disable the plugin —
the plugin restores exactly the hrefs it found.

**This list is not a clone of BB's.** It shows what a plugin sidebar can see:
projects, threads, pinning, unread state, status indicators, branches, and pull
requests. Thread sections and drag-to-reorder are BB-owned features this list
does not draw; threads that live in a section appear in their project's group.
Everything destructive still routes through BB — deleting a thread opens BB's
own confirmation.

## Development

```sh
npm install --include=dev
npm test          # 100+ unit tests; no bb server needed
npm run typecheck
bb plugin install .
bb plugin dev     # rebuild + reload on save
```

The test harness loads `better-sqlite3`, whose prebuilt binary targets Node 22.
Run the suite on Node 22 (`fnm use 22`) if your default is newer.

Layout: `server.ts` and `app.tsx` are wiring. The rules live in `src/` —
`git-remote.ts` and `icon-sources.ts` decide where to look, `resolve-icon.ts`
does the fetching, `icon-service.ts` holds the caching and freshness rules,
`src/app/grouping.ts` is the list's ordering and search, and
`src/app/favicon.ts` owns the tab icon.

## License

MIT
