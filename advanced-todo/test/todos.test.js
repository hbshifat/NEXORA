'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Todos = require('../todos.js');

const TODAY = '2026-11-10';
const NOW = new Date(2026, 10, 10, 12, 0).getTime();

const task = (id, overrides = {}) => ({
  id,
  title: `Task ${id}`,
  notes: '',
  priority: 'medium',
  due: null,
  completed: false,
  createdAt: 0,
  ...overrides,
});

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
};

const throwingStorage = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
});

test('[C1] addTask creates a task with exactly the stored fields', () => {
  const { tasks, task: added } = Todos.addTask([], { title: '  Buy milk  ', notes: 'two', priority: 'high', due: '2026-12-01' }, NOW);
  assert.equal(tasks.length, 1);
  assert.deepEqual(Object.keys(added).sort(), ['completed', 'createdAt', 'due', 'id', 'notes', 'priority', 'title']);
  assert.equal(typeof added.id, 'string');
  assert.equal(added.title, 'Buy milk');
  assert.equal(added.notes, 'two');
  assert.equal(added.priority, 'high');
  assert.equal(added.due, '2026-12-01');
  assert.equal(added.completed, false);
  assert.equal(added.createdAt, NOW);
});

test('[C1] addTask gives unique ids even at the same instant', () => {
  let tasks = [];
  for (let i = 0; i < 50; i += 1) tasks = Todos.addTask(tasks, { title: `t${i}` }, NOW).tasks;
  assert.equal(new Set(tasks.map((item) => item.id)).size, 50);
});

test('[C1] addTask defaults priority to medium, notes to empty, and due to null', () => {
  const { task: added } = Todos.addTask([], { title: 'x', priority: 'urgent', due: '' }, NOW);
  assert.equal(added.priority, 'medium');
  assert.equal(added.notes, '');
  assert.equal(added.due, null);
});

test('[C1] saveTasks writes the JSON array under advanced-todo:v1', () => {
  const storage = memoryStorage();
  const tasks = [task('a')];
  assert.equal(Todos.STORAGE_KEY, 'advanced-todo:v1');
  assert.equal(Todos.saveTasks(storage, tasks), true);
  assert.deepEqual(JSON.parse(storage.data.get('advanced-todo:v1')), tasks);
});

test('[C2] saved tasks load back unchanged', () => {
  const storage = memoryStorage();
  const tasks = [
    task('a', { title: 'One', notes: 'n', priority: 'low', due: '2026-01-02', completed: true, createdAt: 5 }),
    task('b', { createdAt: 6 }),
  ];
  Todos.saveTasks(storage, tasks);
  assert.deepEqual(Todos.loadTasks(storage), { tasks, ok: true });
});

test('[C3] missing storage yields an empty list', () => {
  assert.deepEqual(Todos.loadTasks(memoryStorage()), { tasks: [], ok: true });
});

test('[C3] invalid JSON or a non-array value yields an empty list without throwing', () => {
  for (const raw of ['{not json', '42', '"text"', '{"a":1}', 'null', 'true']) {
    const storage = memoryStorage({ 'advanced-todo:v1': raw });
    assert.deepEqual(Todos.loadTasks(storage), { tasks: [], ok: true }, raw);
  }
});

test('[C3] invalid entries are skipped, duplicates keep the first, and fields are normalized', () => {
  const raw = JSON.stringify([
    null,
    'string',
    [1, 2],
    { title: 'no id' },
    { id: 7, title: 'numeric id' },
    { id: 'blank', title: '   ' },
    { id: 'no-title' },
    { id: 'a', title: '  First  ', extra: 'dropped', priority: 'urgent', due: '2026-02-30', completed: 'yes' },
    { id: 'a', title: 'Duplicate' },
    { id: 'b', title: 'Full', notes: 'n', priority: 'low', due: '2026-03-04', completed: true, createdAt: 9 },
    { id: 'c', title: 'Odd', notes: 5, due: 20260101, createdAt: 'x' },
  ]);
  const { tasks, ok } = Todos.loadTasks(memoryStorage({ 'advanced-todo:v1': raw }));
  assert.equal(ok, true);
  assert.deepEqual(tasks, [
    { id: 'a', title: 'First', notes: '', priority: 'medium', due: null, completed: false, createdAt: 0 },
    { id: 'b', title: 'Full', notes: 'n', priority: 'low', due: '2026-03-04', completed: true, createdAt: 9 },
    { id: 'c', title: 'Odd', notes: '', priority: 'medium', due: null, completed: false, createdAt: 0 },
  ]);
});

test('[C3] isValidDate accepts only real YYYY-MM-DD dates', () => {
  for (const good of ['2026-01-01', '2024-02-29', '1999-12-31']) assert.equal(Todos.isValidDate(good), true, good);
  for (const bad of ['2026-02-29', '2026-13-01', '2026-1-1', '26-01-01', '', null, 20260101, '2026-01-01T00:00']) {
    assert.equal(Todos.isValidDate(bad), false, String(bad));
  }
});

test('[C4] storage errors are reported, not thrown', () => {
  assert.deepEqual(Todos.loadTasks(throwingStorage()), { tasks: [], ok: false });
  assert.equal(Todos.saveTasks(throwingStorage(), [task('a')]), false);
  assert.deepEqual(Todos.loadPrefs(throwingStorage()), { prefs: { filter: 'all', sort: 'created' }, ok: false });
  assert.equal(Todos.savePrefs(throwingStorage(), { filter: 'all', sort: 'due' }), false);
  assert.deepEqual(Todos.loadTasks(null), { tasks: [], ok: false });
  assert.equal(Todos.saveTasks(null, []), false);
});

test('[C5] prefs save under advanced-todo:prefs:v1 and load back', () => {
  const storage = memoryStorage();
  assert.equal(Todos.PREFS_KEY, 'advanced-todo:prefs:v1');
  Todos.savePrefs(storage, { filter: 'active', sort: 'priority' });
  assert.deepEqual(JSON.parse(storage.data.get('advanced-todo:prefs:v1')), { filter: 'active', sort: 'priority' });
  assert.deepEqual(Todos.loadPrefs(storage), { prefs: { filter: 'active', sort: 'priority' }, ok: true });
});

test('[C5] missing or invalid prefs fall back to all and created', () => {
  const cases = [null, '{bad', '[]', '"x"', '{"filter":"done","sort":"alpha"}', '{"filter":"completed"}', '{"sort":"due"}'];
  const expected = [
    { filter: 'all', sort: 'created' },
    { filter: 'all', sort: 'created' },
    { filter: 'all', sort: 'created' },
    { filter: 'all', sort: 'created' },
    { filter: 'all', sort: 'created' },
    { filter: 'completed', sort: 'created' },
    { filter: 'all', sort: 'due' },
  ];
  cases.forEach((raw, i) => {
    const storage = memoryStorage(raw === null ? {} : { 'advanced-todo:prefs:v1': raw });
    assert.deepEqual(Todos.loadPrefs(storage).prefs, expected[i], String(raw));
  });
});

test('[C7] blank titles are rejected and titles are trimmed', () => {
  for (const title of ['', '   ', '\n\t', undefined, null, 5]) {
    assert.deepEqual(Todos.addTask([], { title }, NOW), { error: 'blank' }, String(title));
  }
  assert.equal(Todos.addTask([], { title: '  hi  ' }, NOW).task.title, 'hi');
});

test('[C7] titles over 200 characters and notes over 1000 are rejected', () => {
  assert.equal(Todos.addTask([], { title: 'a'.repeat(200) }, NOW).error, undefined);
  assert.deepEqual(Todos.addTask([], { title: 'a'.repeat(201) }, NOW), { error: 'title-too-long' });
  assert.equal(Todos.addTask([], { title: 'a', notes: 'n'.repeat(1000) }, NOW).error, undefined);
  assert.deepEqual(Todos.addTask([], { title: 'a', notes: 'n'.repeat(1001) }, NOW), { error: 'notes-too-long' });
  assert.deepEqual(Todos.addTask([], { title: 'a', due: '2026-02-31' }, NOW), { error: 'invalid-due' });
});

test('[C8] editTask updates title, notes, priority, and due without mutating', () => {
  const tasks = Object.freeze([Object.freeze(task('a')), Object.freeze(task('b'))]);
  const { tasks: next } = Todos.editTask(tasks, 'a', { title: ' New ', notes: 'more', priority: 'high', due: '2026-11-11' });
  assert.notEqual(next, tasks);
  assert.deepEqual(next[0], { ...task('a'), title: 'New', notes: 'more', priority: 'high', due: '2026-11-11' });
  assert.equal(next[1], tasks[1]);
  assert.equal(tasks[0].title, 'Task a');
});

test('[C8] editTask rejects a blank title', () => {
  assert.deepEqual(Todos.editTask([task('a')], 'a', { title: '  ' }), { error: 'blank' });
});

test('[C9] toggleTask flips completed immutably', () => {
  const tasks = Object.freeze([Object.freeze(task('a'))]);
  const once = Todos.toggleTask(tasks, 'a');
  assert.equal(once[0].completed, true);
  assert.equal(tasks[0].completed, false);
  assert.equal(Todos.toggleTask(once, 'a')[0].completed, false);
});

test('[C10] deleteTask removes only the matching task', () => {
  const tasks = Object.freeze([task('a'), task('b'), task('c')]);
  assert.deepEqual(Todos.deleteTask(tasks, 'b').map((item) => item.id), ['a', 'c']);
  assert.equal(tasks.length, 3);
});

test('[C11] filterTasks limits by status', () => {
  const tasks = [task('a'), task('b', { completed: true }), task('c')];
  assert.deepEqual(Todos.filterTasks(tasks, 'all').map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(Todos.filterTasks(tasks, 'active').map((item) => item.id), ['a', 'c']);
  assert.deepEqual(Todos.filterTasks(tasks, 'completed').map((item) => item.id), ['b']);
});

test('[C12] search matches title or notes case-insensitively and combines with the filter', () => {
  const tasks = [
    task('a', { title: 'Buy MILK' }),
    task('b', { title: 'Call mum', notes: 'about the milkman' }),
    task('c', { title: 'Milk the cow', completed: true }),
    task('d', { title: 'Other' }),
  ];
  assert.deepEqual(Todos.searchTasks(tasks, 'milk').map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(Todos.searchTasks(tasks, '  ').map((item) => item.id), ['a', 'b', 'c', 'd']);
  const shown = Todos.visibleTasks(tasks, { filter: 'active', search: 'MiLk', sort: 'created' });
  assert.deepEqual(shown.map((item) => item.id).sort(), ['a', 'b']);
});

test('[C13] sort by created is newest first', () => {
  const tasks = [task('a', { createdAt: 1 }), task('b', { createdAt: 3 }), task('c', { createdAt: 2 })];
  assert.deepEqual(Todos.sortTasks(tasks, 'created').map((item) => item.id), ['b', 'c', 'a']);
});

test('[C13] sort by due is soonest first with undated tasks last', () => {
  const tasks = [
    task('none-old', { createdAt: 1 }),
    task('late', { due: '2026-12-01', createdAt: 2 }),
    task('soon', { due: '2026-11-01', createdAt: 3 }),
    task('none-new', { createdAt: 4 }),
    task('soon-new', { due: '2026-11-01', createdAt: 5 }),
  ];
  assert.deepEqual(Todos.sortTasks(tasks, 'due').map((item) => item.id), ['soon-new', 'soon', 'late', 'none-new', 'none-old']);
});

test('[C13] sort by priority is high, medium, low with ties newest first', () => {
  const tasks = [
    task('low', { priority: 'low', createdAt: 1 }),
    task('high-old', { priority: 'high', createdAt: 2 }),
    task('med', { priority: 'medium', createdAt: 3 }),
    task('high-new', { priority: 'high', createdAt: 4 }),
  ];
  assert.deepEqual(Todos.sortTasks(tasks, 'priority').map((item) => item.id), ['high-new', 'high-old', 'med', 'low']);
});

test('[C13] sorting never mutates the input order', () => {
  const tasks = Object.freeze([task('a', { createdAt: 1 }), task('b', { createdAt: 2 })]);
  for (const sort of Todos.SORTS) Todos.sortTasks(tasks, sort);
  assert.deepEqual(tasks.map((item) => item.id), ['a', 'b']);
});

test('[C14] dueStatus uses the local date and never marks completed tasks overdue', () => {
  assert.equal(Todos.toDateString(NOW), TODAY);
  assert.equal(Todos.toDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(Todos.dueStatus(task('a', { due: '2026-11-09' }), TODAY), 'overdue');
  assert.equal(Todos.dueStatus(task('a', { due: '2026-11-09', completed: true }), TODAY), 'past');
  assert.equal(Todos.dueStatus(task('a', { due: TODAY }), TODAY), 'today');
  assert.equal(Todos.dueStatus(task('a', { due: '2026-11-11' }), TODAY), 'upcoming');
  assert.equal(Todos.dueStatus(task('a'), TODAY), 'none');
});

test('[C16] countTasks counts total, active, completed, and overdue', () => {
  const tasks = [
    task('a', { due: '2026-11-01' }),
    task('b', { due: '2026-11-01', completed: true }),
    task('c', { due: TODAY }),
    task('d', { completed: true }),
    task('e'),
  ];
  assert.deepEqual(Todos.countTasks(tasks, TODAY), { total: 5, active: 3, completed: 2, overdue: 1 });
  assert.deepEqual(Todos.countTasks([], TODAY), { total: 0, active: 0, completed: 0, overdue: 0 });
});

test('[C18] setAllCompleted and allCompleted', () => {
  const tasks = Object.freeze([task('a'), task('b', { completed: true })]);
  assert.equal(Todos.allCompleted(tasks), false);
  const done = Todos.setAllCompleted(tasks, true);
  assert.equal(Todos.allCompleted(done), true);
  assert.equal(Todos.setAllCompleted(done, false).some((item) => item.completed), false);
  assert.equal(Todos.allCompleted([]), false);
  assert.equal(tasks[0].completed, false);
});

test('[C19] clearCompleted removes only completed tasks', () => {
  const tasks = Object.freeze([task('a'), task('b', { completed: true }), task('c')]);
  assert.deepEqual(Todos.clearCompleted(tasks).map((item) => item.id), ['a', 'c']);
  assert.equal(tasks.length, 3);
});
