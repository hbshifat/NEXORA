(() => {
  'use strict';

  const STORAGE_KEY = 'todo-list:v1';
  const FILTERS = ['all', 'active', 'completed'];

  let idCounter = 0;

  const makeId = (takenIds, now) => {
    let id;
    do {
      idCounter += 1;
      id = `${now.toString(36)}-${idCounter.toString(36)}`;
    } while (takenIds.has(id));
    return id;
  };

  const isBlank = (title) => typeof title !== 'string' || title.trim() === '';

  // Returns the new list, or null when the title is blank.
  const addTask = (tasks, title, now = Date.now()) => {
    if (isBlank(title)) return null;
    const id = makeId(new Set(tasks.map((task) => task.id)), now);
    return [...tasks, { id, title: title.trim(), completed: false, createdAt: now }];
  };

  // Returns the new list, or null when the title is blank.
  const editTask = (tasks, id, title) => {
    if (isBlank(title)) return null;
    return tasks.map((task) => (task.id === id ? { ...task, title: title.trim() } : task));
  };

  const toggleTask = (tasks, id) =>
    tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));

  const deleteTask = (tasks, id) => tasks.filter((task) => task.id !== id);

  const matchesFilter = (task, filter) => {
    if (filter === 'active') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  };

  const filterTasks = (tasks, filter) => tasks.filter((task) => matchesFilter(task, filter));

  const countTasks = (tasks) => ({
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
  });

  const isValidEntry = (entry) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry) &&
    typeof entry.id === 'string' && !isBlank(entry.title);

  // Keeps the first entry for each id and only the known fields.
  const normalize = (entries) => {
    const seen = new Set();
    const tasks = [];
    for (const entry of entries) {
      if (!isValidEntry(entry) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      tasks.push({
        id: entry.id,
        title: entry.title,
        completed: entry.completed === true,
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
      });
    }
    return tasks;
  };

  // `ok` is false only when storage itself failed. Missing or corrupt data is
  // an empty list, not a failure.
  const loadTasks = (storage) => {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return { tasks: [], ok: false };
    }
    if (raw === null || raw === undefined) return { tasks: [], ok: true };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { tasks: [], ok: true };
    }
    if (!Array.isArray(parsed)) return { tasks: [], ok: true };
    return { tasks: normalize(parsed), ok: true };
  };

  // Returns true when the list was written.
  const saveTasks = (storage, tasks) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      return true;
    } catch {
      return false;
    }
  };

  const api = {
    STORAGE_KEY,
    FILTERS,
    isBlank,
    addTask,
    editTask,
    toggleTask,
    deleteTask,
    matchesFilter,
    filterTasks,
    countTasks,
    loadTasks,
    saveTasks,
  };

  globalThis.TodoList = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
