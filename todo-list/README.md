# Todo List

A small, dependency-free todo list that runs entirely in your browser. No account,
no install, no build step. Tasks are saved in this browser's `localStorage`.

## Open the app

Either open `todo-list/index.html` directly in a browser (double-click it, or
drag it onto a browser window), or serve the folder and open it over HTTP:

```bash
cd todo-list
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Features

- Add a task by typing a title and pressing Enter or **Add task**. Blank titles are rejected.
- Mark tasks completed or pending with their checkbox.
- Edit a task's title (Enter or **Save** to keep it, Escape or **Cancel** to discard).
- Delete a task, after a confirmation prompt.
- Filter the list by **All**, **Active**, or **Completed**.
- See how many tasks there are in total and how many are completed.
- Tasks survive a page refresh. If the browser can't store them, a warning says so.
- Works with a keyboard alone and on phone-sized screens, in light and dark mode.
- Titles are always shown as plain text, never as HTML.

## Data

Tasks are stored unencrypted on this device under the `localStorage` key
`todo-list:v1`, as a JSON array of `{ id, title, completed, createdAt }`. Nothing is
sent over the network. The selected filter is not saved; it resets to **All** on
reload.

## Run the tests

The tests use only Node's built-in test runner (no dependencies). From the repo root:

```bash
node --test "todo-list/test/*.test.js"
```

Keep the quotes: a bare `node --test` from the repo root would also pick up other
folders.

## Files

- `index.html`, `styles.css`: the page and its styles.
- `todos.js`: task logic with no DOM (add, edit, toggle, delete, filter, counts, load, save).
- `app.js`: rendering and event handling.
- `test/`: `node:test` suites and a small fake DOM that parses the real `index.html`.
