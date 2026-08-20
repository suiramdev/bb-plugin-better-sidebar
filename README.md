# Better Sidebar

A BB plugin that replaces the sidebar's thread list with one grouped by
project, gives every project an icon, and carries that icon into the browser
tab.

- **Threads grouped by project.** Collapsible project sections, pinned threads
  first, child threads nested under their parent, and BB's own status glyphs on
  each row.
- **Threads that share a worktree fold under it.** BB's own worktree grouping,
  with its icon and its rules — and a stack level is itself a worktree, so the
  two compose instead of fighting.
- **Looks like BB, because it is BB's own design.** The rows, project headers,
  menus, spacing, and states are built from the same class vocabulary the
  built-in sidebar uses, so the list reads as part of the app rather than as a
  panel bolted into it.
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

## Worktrees

Sibling threads sitting in the same worktree fold under one header naming it —
BB's own sidebar behaviour, with its `FolderGit` glyph and its rules:

```text
▾ feat/parser              2   ← the worktree, and what it holds
    Wire the parser
    Cover the parser
  Bump the deps       chore/deps  ← alone in its worktree, so a plain row
```

**Two threads or it is not a group.** A lone thread in its own worktree is
already legible as itself; a header over it would add a row to say nothing.
Only real worktrees group, so threads running in the project checkout itself
stay where they are instead of collapsing into one meaningless pile.

**A group sits where its first thread sat**, so whichever sort you chose still
decides the order — the group inherits the place of the most relevant thread in
it. Grouping applies at every level, so a parent thread's children group too.

**A grouped row drops its branch label**, because the header above already says
it; the machine name shows through instead, which is the one piece of context
the header does not carry.

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
so the numbers follow the based-on chain. Threads that are not in a stack keep
the nesting they always had.

**A stack level is a worktree.** A stack is a chain of branches and a branch is
a checkout, so the two features are the same shape one level apart and compose
directly: a level holding one thread is a numbered row, and a level holding
several is a numbered worktree group.

```text
▸ Add auth endpoints          ← the branch cut from main
    2 ▾ feat/hash         2    ← two threads on this branch, so a group
          Hash passwords
          Fix the salt
    3   Add refresh tokens     ← one thread, so a plain numbered row
```

The number lives on the header, not on the rows under it, and those rows drop
the branch label too — without that, two threads on one stacked branch printed
the same number and the same branch twice, side by side, which read as a bug.
Grouping is keyed on the worktree *and* the position, so a header's number is
true of every row beneath it and two levels can never merge.

## Settings

Each visual feature is a toggle on the plugin's settings page:

- **Project icons in the sidebar** — the icon on each project header.
- **Use the project icon as the browser tab favicon** — the tab icon.
- **Show each thread's branch or machine** — the trailing label on a row.
- **Show pull request status on threads** — off by default, because each row
  costs a git-host lookup.
- **Group threads whose branches are based on one another as a stack** — off by
  default, because each environment on screen costs a lookup. See below.
- **Group threads that share a worktree under the worktree** — on by default.
  It costs nothing: the worktree is already on every thread BB hands a plugin.

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
editing the title in the row itself: Enter saves, Escape leaves it alone. The
same actions sit behind the **⋯** button that appears on a row when you hover
or tab to it, so they are reachable without a right-click.

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
`src/app/worktrees.ts` folds sibling threads sharing a worktree,
`src/reorder.ts` turns a drop into BB's neighbour-based move, and
`src/app/favicon.ts` owns the tab icon.

## License

MIT
