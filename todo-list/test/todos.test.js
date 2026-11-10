const test = require('node:test');
const assert = require('node:assert/strict');
const Todos = require('../todos.js');

const memoryStorage = (value) => ({
  value,
  getItem() { return this.value === undefined ? null : this.value; },
  setItem(_, next) { this.value = next; },
});

const seed = (...titles) => titles.map((title, i) => ({ id: `id-${i}`, title, completed: false, createdAt: i }));

test('[C5] addTask stores a unique id, the trimmed title, completed false, and a creation time', () => {
  const [task] = Todos.addTask([], '  Buy milk \t', 1234);
  assert.deepEqual(Object.keys(task).sort(), ['completed', 'createdAt', 'id', 'title']);
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.completed, false);
  assert.equal(task.createdAt, 1234);
  assert.equal(typeof task.id, 'string');
  assert.notEqual(task.id, '');
});

test('[C5] ids stay unique when many tasks share one timestamp', () => {
  let tasks = [];
  for (let i = 0; i < 200; i += 1) tasks = Todos.addTask(tasks, `task ${i}`, 5000);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 200);
});

test('[C6] addTask appends to the end', () => {
  const tasks = Todos.addTask(seed('a', 'b'), 'c', 9);
  assert.deepEqual(tasks.map((task) => task.title), ['a', 'b', 'c']);
});

test('[C7] every character removed by trim counts as blank', () => {
  for (const title of ['', ' ', '\t', '\n', ' \t ', ' ', '﻿', ' ', '　']) {
    assert.equal(Todos.addTask([], title), null, JSON.stringify(title));
  }
});

test('[C10] toggleTask flips only that task, in both directions', () => {
  const tasks = seed('a', 'b');
  const once = Todos.toggleTask(tasks, 'id-1');
  assert.deepEqual(once.map((task) => task.completed), [false, true]);
  assert.deepEqual(Todos.toggleTask(once, 'id-1').map((task) => task.completed), [false, false]);
  assert.equal(tasks[1].completed, false);
});

test('[C13] editTask trims the title and keeps position, completed, and createdAt', () => {
  const tasks = [...seed('a'), { id: 'b', title: 'b', completed: true, createdAt: 7 }, ...seed('c').map((t) => ({ ...t, id: 'c' }))];
  const updated = Todos.editTask(tasks, 'b', '  bee  ');
  assert.deepEqual(updated[1], { id: 'b', title: 'bee', completed: true, createdAt: 7 });
  assert.deepEqual(updated.map((task) => task.id), ['id-0', 'b', 'c']);
});

test('[C14] editTask rejects a blank title', () => {
  const tasks = seed('keep');
  assert.equal(Todos.editTask(tasks, 'id-0', '  '), null);
  assert.equal(tasks[0].title, 'keep');
});

test('[C16] deleteTask removes only that task', () => {
  assert.deepEqual(Todos.deleteTask(seed('a', 'b', 'c'), 'id-1').map((task) => task.title), ['a', 'c']);
});

test('[C18] filterTasks keeps stored order for each filter', () => {
  const tasks = seed('a', 'b', 'c', 'd').map((task, i) => ({ ...task, completed: i % 2 === 1 }));
  const titles = (filter) => Todos.filterTasks(tasks, filter).map((task) => task.title);
  assert.deepEqual(titles('all'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(titles('active'), ['a', 'c']);
  assert.deepEqual(titles('completed'), ['b', 'd']);
});

test('[C19] countTasks counts every task, not a filtered view', () => {
  assert.deepEqual(Todos.countTasks([]), { total: 0, completed: 0 });
  const tasks = Todos.toggleTask(seed('a', 'b', 'c'), 'id-2');
  assert.deepEqual(Todos.countTasks(tasks), { total: 3, completed: 1 });
});

test('[C22] saveTasks writes JSON under todo-list:v1 and loadTasks reads it back', () => {
  assert.equal(Todos.STORAGE_KEY, 'todo-list:v1');
  const writes = [];
  const storage = { setItem: (key, value) => writes.push([key, value]) };
  const tasks = Todos.toggleTask(seed('a', 'b'), 'id-0');
  assert.equal(Todos.saveTasks(storage, tasks), true);
  assert.equal(writes[0][0], 'todo-list:v1');
  assert.deepEqual(JSON.parse(writes[0][1]), tasks);
  assert.deepEqual(Todos.loadTasks(memoryStorage(writes[0][1])), { tasks, ok: true });
});

test('[C23] missing, invalid, or non-array data loads as an empty list', () => {
  for (const raw of [null, undefined, '', 'not json', '{"a":1}', '"text"', '42', 'null', 'true']) {
    assert.deepEqual(Todos.loadTasks(memoryStorage(raw)), { tasks: [], ok: true }, String(raw));
  }
});

test('[C23] malformed entries are skipped, completed is coerced, duplicates keep the first', () => {
  const raw = JSON.stringify([
    null, 1, 'x', [], {},
    { id: 1, title: 'numeric id' },
    { id: 'no-title' },
    { id: 'blank', title: '   ' },
    { id: 'num-title', title: 5 },
    { id: 'a', title: 'first', completed: 'yes', createdAt: 3 },
    { id: 'a', title: 'duplicate', completed: true },
    { id: 'b', title: 'second', completed: true },
  ]);
  assert.deepEqual(Todos.loadTasks(memoryStorage(raw)).tasks, [
    { id: 'a', title: 'first', completed: false, createdAt: 3 },
    { id: 'b', title: 'second', completed: true, createdAt: 0 },
  ]);
});

test('[C24] storage failures are reported, not thrown', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(Todos.loadTasks(broken), { tasks: [], ok: false });
  assert.equal(Todos.saveTasks(broken, seed('a')), false);
  assert.deepEqual(Todos.loadTasks(null), { tasks: [], ok: false });
  assert.equal(Todos.saveTasks(null, []), false);
});
