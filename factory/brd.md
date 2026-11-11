# BRD-001: In-Memory Modern To-Do List Module

**Document ID:** BRD-NEXORA-001  
**Project:** NEXORA Software Factory  
**Target Module:** `todo/`  
**Status:** Approved for Orchestration  
**Persistence Model:** Ephemeral In-Memory (No External DB)  

---

## 1. Executive Summary & Objective
Build a lightweight, responsive, and visually modern **To-Do List application** inside the `todo/` directory of the repository. This module serves as an acceptance and verification workload for the **NEXORA Deterministic Go DAG Orchestrator**.

The application will operate entirely in-memory (using a structured JavaScript closure store) and must be accompanied by an automated unit test suite executed via Node.js native test runner (`node --test`).

---

## 2. Technical Scope & Architecture Invariants

- **Ecosystem:** Vanilla ECMAScript (ES2022+), Semantic HTML5, Modern CSS.
- **Dependencies:** **Zero external NPM packages**. All tests must run using Node.js built-in test runner (`node --test`).
- **Persistence:** In-memory state only. No SQLite, no PostgreSQL, and no `localStorage` coupling in the core store logic (pure deterministic state transitions).
- **Directory Structure:**
  ```text
  todo/
  ├── store.js             # Core domain logic & state management
  ├── app.js               # DOM manipulation & event wiring
  ├── index.html           # Semantic layout & entrypoint
  ├── styles.css           # Clean typography, card layout, dark/light accents
  └── test/
      └── store.test.js    # Automated unit tests using node:test & node:assert
  ```

---

## 3. Functional Requirements

### 3.1 Domain Model (`todo/store.js`)
Each task entity must conform to the following schema:
```json
{
  "id": "string (timestamp or nano uuid)",
  "title": "string (non-empty, trimmed)",
  "completed": false,
  "createdAt": 1731309125000
}
```

### 3.2 In-Memory Store Operations
The `createTodoStore(initialItems = [])` factory function must expose the following immutable or self-contained state operations:
1. **`add(title)`**: 
   - Validates that title is a non-empty string.
   - Prepends or appends a new active task to the in-memory array.
   - Returns the created task object.
2. **`toggle(id)`**:
   - Flips `completed` status (`true` $\leftrightarrow$ `false`).
   - Throws or returns an error if `id` does not exist.
3. **`remove(id)`**:
   - Removes task by `id`.
4. **`filter(status)`**:
   - Accepts `'all' | 'active' | 'completed'`.
   - Returns a filtered array of tasks.
5. **`clearCompleted()`**:
   - Removes all tasks where `completed === true`.
6. **`getStats()`**:
   - Returns `{ total: number, active: number, completed: number }`.

### 3.3 UI & Presentation (`todo/index.html`, `todo/styles.css`, `todo/app.js`)
- **Header**: Title, quick stats badge (e.g. "3 remaining").
- **Input Area**: Clean input field with an "Add" button and `Enter` key listener.
- **Filter Tabs**: Segmented control buttons: `[All]`, `[Active]`, `[Completed]`.
- **List Area**:
  - Empty state message: *"No tasks found. Enjoy your day!"* when list is empty.
  - Interactive checkboxes to toggle completion (with strike-through animation).
  - Delete button on hover/tap.
- **Design Aesthetic**: Minimalist, card-centered layout with modern sans-serif typography, subtle border radiuses (`8px-12px`), and contrast-checked color palettes.

---

## 4. Test & Verification Criteria (Deterministic Exit Codes)

The Go Macro-Orchestrator enforces quality gates via command exit codes. The implementation must pass these gates:

1. **Unit Test Gate**:
   ```bash
   node --test todo/test/store.test.js
   ```
   *Requirement:* All unit tests for `add`, `toggle`, `remove`, `filter`, and `clearCompleted` must pass with exit code `0`.

2. **UI & Asset Existence Gate**:
   ```bash
   test -f todo/index.html && test -f todo/styles.css && test -f todo/app.js && node --test todo/test/store.test.js
   ```
   *Requirement:* Files exist and tests remain green.

---

## 5. Suggested 2-Node DAG Specification

For execution by the Go Macro-Orchestrator:

- **Node 1 (`T1_todo_store`)**:
  - **Focus:** Domain logic and unit test suite.
  - **Writable Files:** `todo/store.js`, `todo/test/store.test.js`.
  - **Verify Command:** `node --test todo/test/store.test.js`.
  - **Dependencies:** `[]` (Root task).
  - **Branch:** `task/t1-todo-store`.

- **Node 2 (`T2_todo_ui`)**:
  - **Focus:** HTML, CSS, and DOM wiring.
  - **Writable Files:** `todo/index.html`, `todo/styles.css`, `todo/app.js`.
  - **Verify Command:** `test -f todo/index.html && test -f todo/styles.css && node --test todo/test/store.test.js`.
  - **Dependencies:** `["T1_todo_store"]` (Inherits Node 1's worktree branch).
  - **Branch:** `task/t2-todo-ui`.
