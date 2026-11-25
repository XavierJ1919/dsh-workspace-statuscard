# dsh-workspace-statuscard

**A workspace-sidebar enhancement plugin for DSH (DeepSeek Harness)**: it pins a persistent "Active Sessions" zone above the official workspace list, showing recently active sessions per conversation (not per project) and surfacing the ones that need your input first.

![License](https://img.shields.io/badge/License-MIT-green) ![Version](https://img.shields.io/badge/version-0.1.0-orange) ![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.2--rc.1-blue) ![Platform](https://img.shields.io/badge/platform-web-lightgrey)

English | [简体中文](./README.md)

## What is this

DSH's (DeepSeek Harness) web sidebar organizes sessions by workspace/project by default; this plugin turns the same slot into an **active-zone-first** layout: a pinned Active Sessions zone on top, and a workspace-grouped list below, rendered inside a single component.

- dsh-workspace-statuscard is an open-source (MIT) DSH bundle plugin. It is pure browser-side UI with no host/model-side changes.
- It claims the sidebar's `sidebar.workspaces` single slot with `priority: -1` and re-renders it; disabling the plugin in DSH restores the official WorkspaceBrowser automatically, leaving nothing behind.
- Session states, relative timestamps and message previews are read-only client-side projections (e.g. lazily loaded `turnOutline`); no session data is ever written.

## Features

### Active zone (top)

- **Filter**: only sessions with activity within the last N days (default 3, configurable in settings); archived / sub-agent / blank sessions are excluded.
- **Sorting**: Needs input → Running → Done ("recently done" grouped last), newest activity first within each group; merely opening a session does not refresh its activity time.
- **Cards**: session title, owning project (colored initial avatar + project name), state badge, relative time, unread dot on completion.
- **Hover expansion**: project path, absolute time of last activity, latest message preview (lazy `turnOutline` projection; blank if unavailable).
- **Header**: title + count badge + collapse; empty state keeps a placeholder; no search.

### Dual-zone relation (optional, in settings)

| Mode | Behavior |
|---|---|
| Show in both (default) | Sessions appear in both the active zone and the project zone |
| Return to project zone on open | Opening a session from the active zone removes it there (project zone keeps it) until it receives a new message; removals persist across refreshes and can be reset in settings |

### Project zone (bottom)

- Workspace-grouped list sorted by state priority (a workspace row takes its highest member state; sessions ordered Needs input → Running → Done).
- Ungrouped session row, search, group collapsing, capped "done" preview expansion, session/workspace archive & restore, workspace rename and add-by-path.

### Settings

A dedicated "Workspace status card" tab in settings:

- **Activity window**: only sessions active within the last N days enter the active zone (default 3).
- **Display mode**: show in both / return to project zone on open.
- **Reset active zone**: clears the "returned to project zone" removal records.
- **Font size**: base font size stepper (11–16 px); everything else scales proportionally.

## Screenshots

<!-- TODO: replace placeholders with real DSH screenshots; suggested 3: ① full sidebar (active + project zone) ② hover-expanded message preview card ③ the "Workspace status card" settings tab -->

## Install

### Option 1: clone and install (recommended)

```bash
git clone https://github.com/XavierJ1919/dsh-workspace-statuscard.git
cd ~/.dsh/profiles/desktop   # adjust to your actual profile path
npm install --save "file:/path/to/dsh-workspace-statuscard"
```

### Option 2: install from an existing local path

```bash
cd ~/.dsh/profiles/desktop
npm install --save "file:/Users/xavier/Documents/proj/dsh-workspace-statuscard"
```

### Register the bundle patch

Add to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: workspace-statuscard
      name: '@local/dsh-workspace-statuscard'
```

Restart DSH to take effect.

## Layout

| File | Purpose |
|---|---|
| `index.js` | Host-side empty `apply()` (browser UI only, no model surface) |
| `client.js` | Client core: slot claim, data derivation, active/project zone components, settings store |
| `cordis.patch.yml` | Bundle patch, a single insert registration |
| `locale/zh.json`, `locale/en.json` | Plugin detail page copy (runtime dictionary is inlined in client.js) |

## Relation to the old status-board

| Category | Items |
|---|---|
| Reused skeleton | Slot claim, state mapping, sorting, relative time, localStorage |
| Removed | Update popup, secret placeholder, same-state drag & auto-sort |
| Added | Active zone, dual display modes, settings tab, hover summaries, font size setting |

## FAQ

### Does it break the official workspace list?

No. The plugin only claims the `sidebar.workspaces` single slot and re-renders it; disabling the plugin in DSH restores the official WorkspaceBrowser.

### Is it purely front-end? Does it modify session data?

Yes, browser UI only. The host-side `index.js` is an empty `apply()`; session states and previews are read-only client-side derivations, never written back.

### Which DSH versions are supported?

`engines.dsh >= 0.2.2-rc.1` (see `package.json`).

### How do I make an opened session leave the active zone?

Switch the display mode to "Return to project zone on open" in settings; use "Reset active zone" to clear removal records.

### What counts as "needs input"?

A session with pending items (e.g. awaiting approval, plan review, question to answer) is marked as needing input and pinned to the top of the active zone.

## License

[MIT](./LICENSE)
