# Advanced Todo

A single-page todo app with priorities, due dates, notes, search, filters, and
sorting. Plain HTML, CSS, and JavaScript: no dependencies, no build step, and no
network requests. Tasks are saved in your browser's `localStorage`.

## Open the app

Open `advanced-todo/index.html` directly in a browser (double-click it, or use
File > Open). It works from `file://`. If you prefer a local server:

```bash
cd advanced-todo && python3 -m http.server 8000
```

Then visit <http://localhost:8000/>.

## Features

- Add tasks with a title, a priority (High, Medium, or Low; Medium by default), an optional due date, and optional notes. Press Enter in the title or click Add task.
- Edit a task in place: title, notes, priority, and due date. Enter or Save commits; Escape or Cancel discards.
- Mark tasks complete with the checkbox. Completed tasks are struck through and labelled Done.
- Delete a task after confirming.
- Filter by All, Active, or Completed, and search titles and notes (case-insensitive).
- Sort by Newest first, Due date (soonest first, undated last), or Priority (high to low, ties newest first).
- Overdue tasks are labelled "Overdue"; tasks due today are labelled "Due today".
- A counts line shows total, active, completed, and overdue tasks.
- Mark all complete (or Mark all active), and Clear completed after confirming how many will be removed.
- Keyboard accessible, with screen reader announcements, light and dark mode, and a layout that works at 320px wide.

Limits: titles up to 200 characters, notes up to 1000 characters.

## Data and storage

Everything stays on this device, in this browser. Nothing is sent anywhere. The
data is **unencrypted** in `localStorage`, so anyone with access to this browser
profile can read it. Clearing site data deletes your tasks.

Tasks are stored under the key `advanced-todo:v1` as a JSON array:

```json
[
  {
    "id": "mhb2x1c0-1",
    "title": "Write report",
    "notes": "Q4 numbers",
    "priority": "high",
    "due": "2026-11-20",
    "completed": false,
    "createdAt": 1762750000000
  }
]
```

- `priority` is `"low"`, `"medium"`, or `"high"`.
- `due` is a `"YYYY-MM-DD"` string or `null`.
- `createdAt` is milliseconds since the epoch.

The selected filter and sort are stored under `advanced-todo:prefs:v1` as
`{ "filter": "all" | "active" | "completed", "sort": "created" | "due" | "priority" }`.
The search text is not saved.

Stored data is treated as untrusted on load: invalid entries are skipped, duplicate
ids keep the first, and missing or invalid fields fall back to defaults. If storage
is unavailable or full, the app keeps working in memory and shows a warning that
changes may not be saved.

## Run the tests

From the repository root, with Node 18 or later and nothing installed:

```bash
node --test "advanced-todo/test/*.test.js"
```

## Files

- `index.html`: the page.
- `styles.css`: styles, including dark mode.
- `todos.js`: pure task logic (no DOM): add, edit, toggle, delete, filter, search, sort, counts, load, and save.
- `app.js`: rendering and event handling; `start({ document, storage, confirm, now })`.
- `test/todos.test.js`: logic tests.
- `test/app.test.js`: UI tests that drive the real `index.html` through a fake DOM.
- `test/fake-dom.js`: the small fake DOM used by the UI tests.
- `test/static.test.js`: HTML, CSS, and source checks.
