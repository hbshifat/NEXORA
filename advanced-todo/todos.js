(() => {
  'use strict';

  // Pure task logic. No DOM access; every update returns a new array.

  const STORAGE_KEY = 'advanced-todo:v1';
  const PREFS_KEY = 'advanced-todo:prefs:v1';
  const FILTERS = ['all', 'active', 'completed'];
  const SORTS = ['created', 'due', 'priority'];
  const PRIORITIES = ['low', 'medium', 'high'];
  const DEFAULT_PRIORITY = 'medium';
  const DEFAULT_PREFS = { filter: 'all', sort: 'created' };
  const TITLE_MAX = 200;
  const NOTES_MAX = 1000;
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

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

  const isPriority = (value) => PRIORITIES.includes(value);

  // A real calendar date written as YYYY-MM-DD.
  const isValidDate = (value) => {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };

  const pad = (number) => String(number).padStart(2, '0');

  // The local calendar date of `now` (ms epoch or Date) as YYYY-MM-DD.
  const toDateString = (now) => {
    const date = new Date(now);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // Returns an error code for user input, or null when the fields are valid.
  const validateFields = ({ title, notes = '', due = null }) => {
    if (isBlank(title)) return 'blank';
    if (title.trim().length > TITLE_MAX) return 'title-too-long';
    if (typeof notes !== 'string' || notes.length > NOTES_MAX) return 'notes-too-long';
    if (due !== null && due !== '' && !isValidDate(due)) return 'invalid-due';
    return null;
  };

  const cleanFields = ({ title, notes = '', priority, due = null }) => ({
    title: title.trim(),
    notes,
    priority: isPriority(priority) ? priority : DEFAULT_PRIORITY,
    due: isValidDate(due) ? due : null,
  });

  // Returns { tasks } on success or { error } when the fields are invalid.
  const addTask = (tasks, fields, now = Date.now()) => {
    const error = validateFields(fields);
    if (error) return { error };
    const id = makeId(new Set(tasks.map((task) => task.id)), now);
    const task = { id, ...cleanFields(fields), completed: false, createdAt: now };
    return { tasks: [...tasks, task], task };
  };

  // Returns { tasks } on success or { error } when the fields are invalid.
  const editTask = (tasks, id, fields) => {
    const error = validateFields(fields);
    if (error) return { error };
    const clean = cleanFields(fields);
    return { tasks: tasks.map((task) => (task.id === id ? { ...task, ...clean } : task)) };
  };

  const toggleTask = (tasks, id) =>
    tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));

  const deleteTask = (tasks, id) => tasks.filter((task) => task.id !== id);

  const clearCompleted = (tasks) => tasks.filter((task) => !task.completed);

  const setAllCompleted = (tasks, completed) => tasks.map((task) => ({ ...task, completed }));

  const allCompleted = (tasks) => tasks.length > 0 && tasks.every((task) => task.completed);

  const matchesFilter = (task, filter) => {
    if (filter === 'active') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  };

  const filterTasks = (tasks, filter) => tasks.filter((task) => matchesFilter(task, filter));

  const matchesSearch = (task, search) => {
    const query = (search || '').trim().toLowerCase();
    if (query === '') return true;
    return task.title.toLowerCase().includes(query) || task.notes.toLowerCase().includes(query);
  };

  const searchTasks = (tasks, search) => tasks.filter((task) => matchesSearch(task, search));

  // Newest first: later createdAt first, then later position in the stored list.
  const byNewest = (a, b) => b.task.createdAt - a.task.createdAt || b.index - a.index;

  const byDue = (a, b) => {
    if (a.task.due === b.task.due) return byNewest(a, b);
    if (a.task.due === null) return 1;
    if (b.task.due === null) return -1;
    return a.task.due < b.task.due ? -1 : 1;
  };

  const byPriority = (a, b) =>
    PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] || byNewest(a, b);

  const COMPARATORS = { created: byNewest, due: byDue, priority: byPriority };

  // Returns a sorted copy; the input array is never reordered.
  const sortTasks = (tasks, sort) => {
    const compare = COMPARATORS[sort] || byNewest;
    return tasks
      .map((task, index) => ({ task, index }))
      .sort(compare)
      .map(({ task }) => task);
  };

  // The tasks to show, in display order.
  const visibleTasks = (tasks, { filter = 'all', search = '', sort = 'created' } = {}) =>
    sortTasks(searchTasks(filterTasks(tasks, filter), search), sort);

  // 'overdue', 'today', 'upcoming', or 'none'. Completed tasks are never overdue.
  const dueStatus = (task, today) => {
    if (task.due === null) return 'none';
    if (task.due === today) return 'today';
    if (task.due < today) return task.completed ? 'past' : 'overdue';
    return 'upcoming';
  };

  const isOverdue = (task, today) => dueStatus(task, today) === 'overdue';

  const countTasks = (tasks, today) => {
    const completed = tasks.filter((task) => task.completed).length;
    return {
      total: tasks.length,
      active: tasks.length - completed,
      completed,
      overdue: tasks.filter((task) => isOverdue(task, today)).length,
    };
  };

  const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

  const isValidEntry = (entry) => isPlainObject(entry) && typeof entry.id === 'string' && !isBlank(entry.title);

  // Stored data is untrusted. Keeps the first entry for each id and only known fields.
  const normalize = (entries) => {
    const seen = new Set();
    const tasks = [];
    for (const entry of entries) {
      if (!isValidEntry(entry) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      tasks.push({
        id: entry.id,
        title: entry.title.trim(),
        notes: typeof entry.notes === 'string' ? entry.notes : '',
        priority: isPriority(entry.priority) ? entry.priority : DEFAULT_PRIORITY,
        due: isValidDate(entry.due) ? entry.due : null,
        completed: typeof entry.completed === 'boolean' ? entry.completed : false,
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
      });
    }
    return tasks;
  };

  // Reads and parses a key. `ok` is false only when storage itself failed.
  const readJson = (storage, key) => {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return { value: undefined, ok: false };
    }
    if (raw === null || raw === undefined) return { value: undefined, ok: true };
    try {
      return { value: JSON.parse(raw), ok: true };
    } catch {
      return { value: undefined, ok: true };
    }
  };

  // Returns true when the value was written.
  const writeJson = (storage, key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  // Missing or corrupt data is an empty list, not a failure.
  const loadTasks = (storage) => {
    const { value, ok } = readJson(storage, STORAGE_KEY);
    return { tasks: Array.isArray(value) ? normalize(value) : [], ok };
  };

  const saveTasks = (storage, tasks) => writeJson(storage, STORAGE_KEY, tasks);

  const normalizePrefs = (value) => {
    const prefs = isPlainObject(value) ? value : {};
    return {
      filter: FILTERS.includes(prefs.filter) ? prefs.filter : DEFAULT_PREFS.filter,
      sort: SORTS.includes(prefs.sort) ? prefs.sort : DEFAULT_PREFS.sort,
    };
  };

  const loadPrefs = (storage) => {
    const { value, ok } = readJson(storage, PREFS_KEY);
    return { prefs: normalizePrefs(value), ok };
  };

  const savePrefs = (storage, prefs) => writeJson(storage, PREFS_KEY, normalizePrefs(prefs));

  const api = {
    STORAGE_KEY,
    PREFS_KEY,
    FILTERS,
    SORTS,
    PRIORITIES,
    DEFAULT_PRIORITY,
    DEFAULT_PREFS,
    TITLE_MAX,
    NOTES_MAX,
    isBlank,
    isValidDate,
    toDateString,
    validateFields,
    addTask,
    editTask,
    toggleTask,
    deleteTask,
    clearCompleted,
    setAllCompleted,
    allCompleted,
    matchesFilter,
    filterTasks,
    matchesSearch,
    searchTasks,
    sortTasks,
    visibleTasks,
    dueStatus,
    isOverdue,
    countTasks,
    normalize,
    loadTasks,
    saveTasks,
    normalizePrefs,
    loadPrefs,
    savePrefs,
  };

  globalThis.AdvancedTodo = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
