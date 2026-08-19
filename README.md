# Better Sidebar

A BB plugin that replaces the sidebar's thread list with one grouped by
project, gives every project an icon, and carries that icon into the browser
tab.

- **Threads grouped by project.** Collapsible project sections, pinned threads
  first, child threads nested under their parent, and BB's own status glyphs on
  each row.
- **Order the projects your way.** Last activity, alphabetical, newest, oldest,
  or manual — drag the project headers into the order you want.
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

## Ordering projects

The sort control sits above the list, and the same menu is on the plugin's
settings page:

| Mode                       | Order                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Last activity _(default)_  | The project whose thread most recently stopped and asked for you, first.    |
| Manual                     | Your own order — drag a project header, or use its right-click menu.         |
| Alphabetical               | By name, case-insensitive.                                                   |
| Newest project first        | By project creation date, newest first.                                      |
| Oldest project first        | By project creation date, oldest first.                                     |

**Opening something is not activity.** "Last activity" means the last time a
thread _stopped and notified you_ — a turn that ended, a question waiting, a run
that failed. Opening a project, reading a thread, or a background write leaves
the order alone, so browsing never reshuffles the list under your cursor, and no
mode reacts to the route you are on. The project you are viewing still always
shows its header, even with no threads of its own — it just keeps its place.

**Manual order is BB's own project order.** Dragging a project here calls BB's
`projects.reorder`, so BB's built-in sidebar shows the same order and there is
no second, drifting copy of it. Reordering never depends on drag alone — every
project header's right-click menu has **Move project up / down** — and the
personal project stays put, because BB keeps it outside that order.

Threads inside a group read by that same signal, newest first, with pinned
threads above; only the project order is configurable.

## Stacked threads

Off by default. When on, threads whose branches are cut from one another are
drawn the way a stacked pull request reads: the bottom of the stack keeps its
plain row, and everything built on top of it is numbered `2`, `3`, `4` and
nested one layer under it.

```text
▸ Add auth endpoints          ← the branch cut from main
    2  Hash passwords         ← based on feat/auth
    3  Add refresh tokens     ← based on feat/hash
    4  Rate-limit login       ← the second branch off feat/auth
```

**The signal is the branch, not the thread.** BB's thread parenting is
orchestration — a parent coordinates a child and gets its lifecycle events —
and it is chosen independently of `--base-branch`. Two threads can even share
one worktree, in which case neither is based on the other. So a stack is read
from the environment's base branch alone, and a branch cut from the default
branch starts a stack rather than joining one.

**A stack is always one layer deep.** A chain five branches long still reads as
one parent and four numbered rows, and a stack that forks flattens depth-first,
so the numbers follow the based-on chain. Threads sharing a branch share its
number. Threads that are not in a stack keep the nesting they always had.

## Settings

Each visual feature is a toggle on the plugin's settings page:

- **Project icons in the sidebar** — the icon on each project header.
- **Use the project icon as the browser tab favicon** — the tab icon.
- **Show each thread's branch or machine** — the trailing label on a row.
- **Show pull request status on threads** — off by default, because each row
  costs a git-host lookup.
- **Group threads whose branches are based on one another as a stack** — off by
  default, because each environment on screen costs a lookup. See below.

Settings apply live; there is no reload to run.

## `bb better-sidebar`

```sh
bb better-sidebar list                        # every project, its mode, origin, and any error
bb better-sidebar set bb --url https://…      # a project can be named instead of identified
bb better-sidebar set bb --auto               # back to the repository default
bb better-sidebar set bb --none               # no icon
bb better-sidebar refresh bb                  # re-fetch now
bb better-sidebar sort                        # show the modes, with the active one starred
bb better-sidebar sort manual                 # activity | manual | alphabetical | newest | oldest
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
requests. Thread sections are a BB-owned feature this list does not draw;
threads that live in a section appear in their project's group, and reordering
applies to projects rather than to individual threads.
Everything destructive still routes through BB — deleting a thread opens BB's
own confirmation.

Right-clicking a thread gives it the same actions BB's own rows have — open in
split, mark read or unread, pin, rename, archive, delete — with **Rename**
editing the title in the row itself: Enter saves, Escape leaves it alone.

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
`src/app/grouping.ts` is the list's grouping, sorting, and search,
`src/reorder.ts` turns a drop into BB's neighbour-based move, and
`src/app/favicon.ts` owns the tab icon.

## License

MIT
