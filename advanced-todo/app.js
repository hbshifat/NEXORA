(() => {
  'use strict';

  const Todos = typeof module !== 'undefined' ? require('./todos.js') : globalThis.AdvancedTodo;

  const ERROR_MESSAGES = {
    'blank': "Task title can't be blank.",
    'title-too-long': `Task title must be ${Todos.TITLE_MAX} characters or fewer.`,
    'notes-too-long': `Notes must be ${Todos.NOTES_MAX} characters or fewer.`,
    'invalid-due': 'Enter a valid due date or leave it empty.',
  };
  // Which field each error belongs to.
  const ERROR_FIELDS = {
    'blank': 'title',
    'title-too-long': 'title',
    'notes-too-long': 'notes',
    'invalid-due': 'due',
  };
  const STORAGE_MESSAGE = "Couldn't use this browser's storage. Changes may not be saved and may be lost when you close this page.";
  const CONFIRM_DELETE = (title) => `Delete “${title}”? This can't be undone.`;
  const CONFIRM_CLEAR = (count) =>
    `Delete ${count} completed ${count === 1 ? 'task' : 'tasks'}? This can't be undone.`;
  const EMPTY_MESSAGE = 'No tasks yet. Add your first task above.';
  const FILTER_EMPTY_MESSAGES = {
    active: 'No active tasks. Everything is done.',
    completed: 'No completed tasks yet.',
  };
  const SEARCH_EMPTY_MESSAGE = (query) => `No tasks match “${query}”.`;
  const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
  const MARK_ALL_COMPLETE = 'Mark all complete';
  const MARK_ALL_ACTIVE = 'Mark all active';

  const countsText = ({ total, active, completed, overdue }) =>
    `${total} total, ${active} active, ${completed} completed, ${overdue} overdue`;
  const plural = (count) => `${count} ${count === 1 ? 'task' : 'tasks'}`;

  const dueText = (status, due) => {
    if (status === 'overdue') return `Overdue (due ${due})`;
    if (status === 'today') return 'Due today';
    return `Due ${due}`;
  };

  const start = ({ document, storage, confirm, now = () => Date.now() }) => {
    const byId = (id) => document.getElementById(id);
    const addForm = byId('add-form');
    const addFields = {
      title: byId('add-title'),
      notes: byId('add-notes'),
      priority: byId('add-priority'),
      due: byId('add-due'),
    };
    const addError = byId('add-error');
    const addButton = byId('add-submit');
    const searchInput = byId('search');
    const sortSelect = byId('sort');
    const filterButtons = Array.from(byId('filters').children);
    const toggleAllButton = byId('toggle-all');
    const clearButton = byId('clear-completed');
    const countsElement = byId('counts');
    const listArea = byId('list-area');
    const statusRegion = byId('status');
    const storageWarning = byId('storage-warning');

    let tasks = [];
    let filter = Todos.DEFAULT_PREFS.filter;
    let sort = Todos.DEFAULT_PREFS.sort;
    let editingId = null;
    let checkboxes = new Map();
    let editButtons = new Map();

    const today = () => Todos.toDateString(now());

    const create = (tag, className) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      return element;
    };

    const createButton = (label, className, onClick) => {
      const button = create('button', className);
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    };

    const createMessage = (text) => {
      const message = create('p', 'message');
      message.textContent = text;
      return message;
    };

    // A new node each time, so a repeated message is announced again.
    const announce = (message) => {
      const node = create('span');
      node.textContent = message;
      statusRegion.replaceChildren(node);
    };

    // Tasks and prefs fail independently; the warning shows while either is failing.
    const storageFailures = { tasks: false, prefs: false };
    const setStorageFailed = (key, failed) => {
      storageFailures[key] = failed;
      const anyFailed = storageFailures.tasks || storageFailures.prefs;
      if (anyFailed === !storageWarning.hidden) return;
      storageWarning.hidden = !anyFailed;
      storageWarning.textContent = anyFailed ? STORAGE_MESSAGE : '';
    };

    // One write of the full list per change.
    const persist = () => setStorageFailed('tasks', !Todos.saveTasks(storage, tasks));
    const persistPrefs = () => setStorageFailed('prefs', !Todos.savePrefs(storage, { filter, sort }));

    const readFields = (fields) => ({
      title: fields.title.value,
      notes: fields.notes.value,
      priority: fields.priority.value,
      due: fields.due.value || null,
    });

    const clearErrors = (fields, error) => {
      error.textContent = '';
      error.hidden = true;
      for (const field of Object.values(fields)) {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-describedby');
      }
    };

    const showError = (fields, error, code) => {
      clearErrors(fields, error);
      const field = fields[ERROR_FIELDS[code]];
      error.textContent = ERROR_MESSAGES[code];
      error.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
      field.focus();
    };

    const visible = () => Todos.visibleTasks(tasks, { filter, search: searchInput.value, sort });

    // Focus the task after `id` in `before`, else the one before it, else `fallback`.
    const focusNeighbor = (before, id, fallback) => {
      const index = before.findIndex((task) => task.id === id);
      const after = before.slice(index + 1).find((task) => checkboxes.has(task.id));
      const previous = before.slice(0, Math.max(index, 0)).reverse().find((task) => checkboxes.has(task.id));
      const neighbor = after || previous;
      (neighbor ? checkboxes.get(neighbor.id) : fallback).focus();
    };

    const setFilter = (next, button) => {
      filter = next;
      persistPrefs();
      render();
      button.focus();
    };

    const setSort = (next) => {
      sort = Todos.SORTS.includes(next) ? next : Todos.DEFAULT_PREFS.sort;
      persistPrefs();
      render();
    };

    const toggle = (id) => {
      const before = visible();
      tasks = Todos.toggleTask(tasks, id);
      const task = tasks.find((item) => item.id === id);
      persist();
      render();
      announce(task.completed ? `“${task.title}” marked complete.` : `“${task.title}” marked active.`);
      if (checkboxes.has(id)) checkboxes.get(id).focus();
      else focusNeighbor(before, id, addFields.title);
    };

    const beginEdit = (id) => {
      editingId = id;
      render();
      byId('edit-title').focus();
    };

    const endEdit = () => {
      const id = editingId;
      const before = visible();
      editingId = null;
      render();
      if (editButtons.has(id)) editButtons.get(id).focus();
      else focusNeighbor(before, id, addFields.title);
    };

    const saveEdit = (fields, error) => {
      const result = Todos.editTask(tasks, editingId, readFields(fields));
      if (result.error) {
        showError(fields, error, result.error);
        return;
      }
      tasks = result.tasks;
      persist();
      endEdit();
      announce('Task updated.');
    };

    const removeTask = (task, deleteButton) => {
      if (!confirm(CONFIRM_DELETE(task.title))) {
        deleteButton.focus();
        return;
      }
      const before = visible();
      tasks = Todos.deleteTask(tasks, task.id);
      persist();
      render();
      announce(`“${task.title}” deleted.`);
      focusNeighbor(before, task.id, addFields.title);
    };

    const toggleAll = () => {
      const completed = !Todos.allCompleted(tasks);
      tasks = Todos.setAllCompleted(tasks, completed);
      persist();
      render();
      announce(completed ? `All ${plural(tasks.length)} marked complete.` : `All ${plural(tasks.length)} marked active.`);
      toggleAllButton.focus();
    };

    const clearAllCompleted = () => {
      const count = Todos.countTasks(tasks, today()).completed;
      if (count === 0) return;
      if (!confirm(CONFIRM_CLEAR(count))) {
        clearButton.focus();
        return;
      }
      tasks = Todos.clearCompleted(tasks);
      persist();
      render();
      announce(`Cleared ${plural(count)}.`);
      (toggleAllButton.disabled ? addFields.title : toggleAllButton).focus();
    };

    const createSelect = (id, value) => {
      const select = create('select');
      select.id = id;
      for (const priority of ['high', 'medium', 'low']) {
        const option = create('option');
        option.value = priority;
        option.textContent = PRIORITY_LABELS[priority];
        select.append(option);
      }
      select.value = value;
      return select;
    };

    const createField = (labelText, control) => {
      const wrapper = create('div', 'field');
      const label = create('label');
      label.htmlFor = control.id;
      label.textContent = labelText;
      wrapper.append(label, control);
      return wrapper;
    };

    const renderTask = (task, todayString) => {
      const editing = editingId !== null;
      const status = Todos.dueStatus(task, todayString);
      const classes = ['task', `priority-${task.priority}`];
      if (task.completed) classes.push('completed');
      if (status === 'overdue') classes.push('overdue');
      const item = create('li', classes.join(' '));

      const label = create('label', 'task-label');
      const checkbox = create('input', 'task-toggle');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = editing;
      checkbox.addEventListener('change', () => toggle(task.id));
      const title = create('span', 'task-title');
      title.textContent = task.title;
      label.append(checkbox, title);
      checkboxes.set(task.id, checkbox);

      const meta = create('p', 'task-meta');
      const priority = create('span', `badge task-priority priority-${task.priority}`);
      priority.textContent = `${PRIORITY_LABELS[task.priority]} priority`;
      meta.append(priority);
      if (status !== 'none') {
        const due = create('span', `badge task-due due-${status}`);
        due.textContent = dueText(status, task.due);
        meta.append(due);
      }
      if (task.completed) {
        const done = create('span', 'badge task-done');
        done.textContent = 'Done';
        meta.append(done);
      }

      const body = create('div', 'task-body');
      body.append(label, meta);
      if (task.notes !== '') {
        const notes = create('p', 'task-notes');
        notes.textContent = task.notes;
        body.append(notes);
      }

      const actions = create('div', 'task-actions');
      const editButton = createButton('Edit', 'edit', () => beginEdit(task.id));
      editButton.setAttribute('aria-label', `Edit “${task.title}”`);
      const deleteButton = createButton('Delete', 'danger delete', () => removeTask(task, deleteButton));
      deleteButton.setAttribute('aria-label', `Delete “${task.title}”`);
      editButton.disabled = editing;
      deleteButton.disabled = editing;
      actions.append(editButton, deleteButton);
      editButtons.set(task.id, editButton);

      item.append(body, actions);
      return item;
    };

    const renderEditor = (task) => {
      const item = create('li', task.completed ? 'task editing completed' : 'task editing');
      const form = create('form', 'edit-form');
      form.setAttribute('novalidate', '');
      form.setAttribute('aria-label', `Edit “${task.title}”`);

      const titleField = create('input');
      titleField.type = 'text';
      titleField.id = 'edit-title';
      titleField.setAttribute('autocomplete', 'off');
      titleField.setAttribute('maxlength', String(Todos.TITLE_MAX));
      titleField.value = task.title;

      const notesField = create('textarea');
      notesField.id = 'edit-notes';
      notesField.rows = 3;
      notesField.setAttribute('maxlength', String(Todos.NOTES_MAX));
      notesField.value = task.notes;

      const priorityField = createSelect('edit-priority', task.priority);

      const dueField = create('input');
      dueField.type = 'date';
      dueField.id = 'edit-due';
      dueField.value = task.due || '';

      const fields = { title: titleField, notes: notesField, priority: priorityField, due: dueField };

      const error = create('p', 'field-error');
      error.id = 'edit-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const row = create('div', 'add-row');
      row.append(createField('Priority', priorityField), createField('Due date (optional)', dueField));

      const actions = create('div', 'task-actions');
      const saveButton = create('button', 'primary save');
      saveButton.type = 'submit';
      saveButton.textContent = 'Save';
      actions.append(saveButton, createButton('Cancel', 'cancel', endEdit));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEdit(fields, error);
      });
      form.addEventListener('input', () => clearErrors(fields, error));
      form.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.isComposing) return;
        event.preventDefault();
        endEdit();
      });

      form.append(
        createField('Title', titleField),
        createField('Notes (optional)', notesField),
        row,
        error,
        actions,
      );
      item.append(form);
      return item;
    };

    const renderList = (todayString) => {
      const shown = visible();
      if (tasks.length === 0) {
        listArea.replaceChildren(createMessage(EMPTY_MESSAGE));
      } else if (Todos.filterTasks(tasks, filter).length === 0) {
        listArea.replaceChildren(createMessage(FILTER_EMPTY_MESSAGES[filter]));
      } else if (shown.length === 0) {
        listArea.replaceChildren(createMessage(SEARCH_EMPTY_MESSAGE(searchInput.value.trim())));
      } else {
        const list = create('ul', 'tasks');
        list.append(...shown.map((task) => (task.id === editingId ? renderEditor(task) : renderTask(task, todayString))));
        listArea.replaceChildren(list);
      }
    };

    const render = () => {
      const todayString = today();
      const editing = editingId !== null;
      const counts = Todos.countTasks(tasks, todayString);

      for (const field of Object.values(addFields)) field.disabled = editing;
      addButton.disabled = editing;
      searchInput.disabled = editing;
      sortSelect.disabled = editing;
      sortSelect.value = sort;
      for (const button of filterButtons) {
        button.disabled = editing;
        button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === filter));
      }
      toggleAllButton.textContent = Todos.allCompleted(tasks) ? MARK_ALL_ACTIVE : MARK_ALL_COMPLETE;
      toggleAllButton.disabled = editing || counts.total === 0;
      clearButton.disabled = editing || counts.completed === 0;
      countsElement.textContent = countsText(counts);

      checkboxes = new Map();
      editButtons = new Map();
      renderList(todayString);
    };

    const resetAddForm = () => {
      addFields.title.value = '';
      addFields.notes.value = '';
      addFields.priority.value = Todos.DEFAULT_PRIORITY;
      addFields.due.value = '';
      clearErrors(addFields, addError);
    };

    const submitAdd = () => {
      const result = Todos.addTask(tasks, readFields(addFields), now());
      if (result.error) {
        showError(addFields, addError, result.error);
        return;
      }
      tasks = result.tasks;
      if (filter === 'completed') {
        filter = 'all';
        persistPrefs();
      }
      resetAddForm();
      persist();
      render();
      const hidden = !Todos.matchesSearch(result.task, searchInput.value);
      announce(hidden ? `Task “${result.task.title}” added. It is hidden by the current search.` : `Task “${result.task.title}” added.`);
      addFields.title.focus();
    };

    addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAdd();
    });
    addForm.addEventListener('input', () => clearErrors(addFields, addError));
    searchInput.addEventListener('input', () => render());
    sortSelect.addEventListener('change', () => setSort(sortSelect.value));
    for (const button of filterButtons) {
      button.addEventListener('click', () => setFilter(button.getAttribute('data-filter'), button));
    }
    toggleAllButton.addEventListener('click', toggleAll);
    clearButton.addEventListener('click', clearAllCompleted);

    const loaded = Todos.loadTasks(storage);
    const loadedPrefs = Todos.loadPrefs(storage);
    tasks = loaded.tasks;
    filter = loadedPrefs.prefs.filter;
    sort = loadedPrefs.prefs.sort;
    searchInput.value = '';
    setStorageFailed('tasks', !loaded.ok);
    setStorageFailed('prefs', !loadedPrefs.ok);
    render();
  };

  const api = { start };

  globalThis.AdvancedTodoApp = api;
  if (typeof module !== 'undefined') {
    module.exports = api;
  } else {
    // Reading window.localStorage throws when storage is disabled.
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    start({ document, storage, confirm: (message) => window.confirm(message), now: () => Date.now() });
  }
})();
