(() => {
  'use strict';

  const Todos = typeof module !== 'undefined' ? require('./todos.js') : globalThis.TodoList;

  const BLANK_MESSAGE = "Task title can't be blank.";
  const CONFIRM_DELETE = "Delete this task? This can't be undone.";
  const EMPTY_MESSAGE = 'No tasks yet. Add your first task above.';
  const STORAGE_MESSAGE = "Couldn't save your tasks in this browser. Changes may be lost when you close this page.";
  const FILTER_EMPTY_MESSAGES = {
    active: 'No active tasks.',
    completed: 'No completed tasks yet.',
  };
  const ADDED_MESSAGE = 'Task added.';
  const COMPLETED_MESSAGE = 'Task marked completed.';
  const PENDING_MESSAGE = 'Task marked pending.';
  const UPDATED_MESSAGE = 'Task updated.';
  const DELETED_MESSAGE = 'Task deleted.';
  const EDIT_LABEL = 'Edit task';
  const editName = (title) => `Edit “${title}”`;
  const deleteName = (title) => `Delete “${title}”`;
  const countsText = ({ total, completed }) => `${total} total, ${completed} completed`;

  const start = ({ document, storage, confirm }) => {
    const byId = (id) => document.getElementById(id);
    const addForm = byId('add-form');
    const addInput = byId('add-title');
    const addError = byId('add-error');
    const addButton = byId('add-submit');
    const filterButtons = byId('filters').children;
    const countsElement = byId('counts');
    const listArea = byId('list-area');
    const statusRegion = byId('status');
    const storageWarning = byId('storage-warning');

    let tasks = [];
    let filter = 'all';
    let editingId = null;
    let checkboxes = new Map();
    let editButtons = new Map();

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

    const setStorageFailed = (failed) => {
      if (failed === !storageWarning.hidden) return;
      storageWarning.hidden = !failed;
      storageWarning.textContent = failed ? STORAGE_MESSAGE : '';
    };

    const persist = () => setStorageFailed(!Todos.saveTasks(storage, tasks));

    const showBlankError = (field, error) => {
      error.textContent = BLANK_MESSAGE;
      error.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
      field.focus();
    };

    const clearFieldError = (field, error) => {
      error.textContent = '';
      error.hidden = true;
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    };

    const visibleTasks = () => Todos.filterTasks(tasks, filter);
    const pressedFilterButton = () =>
      Array.from(filterButtons).find((button) => button.getAttribute('data-filter') === filter);

    // Focus the task that followed `id` in `visible`, else the one before it.
    const focusNeighbor = (visible, id, fallback) => {
      const index = visible.findIndex((task) => task.id === id);
      const neighbor = [visible[index + 1], visible[index - 1]]
        .find((task) => task && checkboxes.has(task.id));
      (neighbor ? checkboxes.get(neighbor.id) : fallback).focus();
    };

    const setFilter = (next, button) => {
      filter = next;
      render();
      announce('');
      button.focus();
    };

    const toggle = (id) => {
      const visibleBefore = visibleTasks();
      tasks = Todos.toggleTask(tasks, id);
      const task = tasks.find((item) => item.id === id);
      persist();
      render();
      announce(task.completed ? COMPLETED_MESSAGE : PENDING_MESSAGE);
      if (checkboxes.has(id)) checkboxes.get(id).focus();
      else focusNeighbor(visibleBefore, id, pressedFilterButton());
    };

    const beginEdit = (id) => {
      editingId = id;
      render();
      byId('edit-title').focus();
    };

    const endEdit = () => {
      const id = editingId;
      editingId = null;
      render();
      (editButtons.get(id) || addInput).focus();
    };

    const saveEdit = (field, error) => {
      const updated = Todos.editTask(tasks, editingId, field.value);
      if (!updated) {
        showBlankError(field, error);
        return;
      }
      tasks = updated;
      persist();
      endEdit();
      announce(UPDATED_MESSAGE);
    };

    const removeTask = (id, deleteButton) => {
      if (!confirm(CONFIRM_DELETE)) {
        deleteButton.focus();
        return;
      }
      const visibleBefore = visibleTasks();
      tasks = Todos.deleteTask(tasks, id);
      persist();
      render();
      announce(DELETED_MESSAGE);
      focusNeighbor(visibleBefore, id, addInput);
    };

    const renderTask = (task) => {
      const item = create('li', task.completed ? 'task completed' : 'task');

      const label = create('label', 'task-label');
      const checkbox = create('input', 'task-toggle');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.disabled = editingId !== null;
      checkbox.addEventListener('change', () => toggle(task.id));
      const title = create('span', 'task-title');
      title.textContent = task.title;
      label.append(checkbox, title);
      checkboxes.set(task.id, checkbox);

      const actions = create('div', 'task-actions');
      const editButton = createButton('Edit', 'edit', () => beginEdit(task.id));
      editButton.setAttribute('aria-label', editName(task.title));
      const deleteButton = createButton('Delete', 'danger delete', () => removeTask(task.id, deleteButton));
      deleteButton.setAttribute('aria-label', deleteName(task.title));
      editButton.disabled = editingId !== null;
      deleteButton.disabled = editingId !== null;
      actions.append(editButton, deleteButton);
      editButtons.set(task.id, editButton);

      item.append(label, actions);
      return item;
    };

    const renderEditor = (task) => {
      const item = create('li', task.completed ? 'task editing completed' : 'task editing');
      const form = create('form', 'edit-form');

      const label = create('label');
      label.htmlFor = 'edit-title';
      label.textContent = EDIT_LABEL;

      const field = create('input');
      field.type = 'text';
      field.id = 'edit-title';
      field.autocomplete = 'off';
      field.value = task.title;

      const error = create('p', 'field-error');
      error.id = 'edit-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const actions = create('div', 'task-actions');
      const saveButton = create('button', 'primary save');
      saveButton.type = 'submit';
      saveButton.textContent = 'Save';
      actions.append(saveButton, createButton('Cancel', 'cancel', endEdit));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEdit(field, error);
      });
      field.addEventListener('input', () => clearFieldError(field, error));
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.isComposing) return;
        event.preventDefault();
        endEdit();
      });

      form.append(label, field, error, actions);
      item.append(form);
      return item;
    };

    const render = () => {
      const editing = editingId !== null;
      addInput.disabled = editing;
      addButton.disabled = editing;
      for (const button of Array.from(filterButtons)) {
        button.disabled = editing;
        button.setAttribute('aria-pressed', String(button.getAttribute('data-filter') === filter));
      }
      countsElement.textContent = countsText(Todos.countTasks(tasks));
      checkboxes = new Map();
      editButtons = new Map();

      const visible = visibleTasks();
      if (tasks.length === 0) {
        listArea.replaceChildren(createMessage(EMPTY_MESSAGE));
      } else if (visible.length === 0) {
        listArea.replaceChildren(createMessage(FILTER_EMPTY_MESSAGES[filter]));
      } else {
        const list = create('ul', 'tasks');
        list.append(...visible.map((task) => (task.id === editingId ? renderEditor(task) : renderTask(task))));
        listArea.replaceChildren(list);
      }
    };

    const submitAdd = () => {
      const updated = Todos.addTask(tasks, addInput.value);
      if (!updated) {
        showBlankError(addInput, addError);
        return;
      }
      tasks = updated;
      if (filter === 'completed') filter = 'all';
      addInput.value = '';
      clearFieldError(addInput, addError);
      persist();
      render();
      announce(ADDED_MESSAGE);
      addInput.focus();
    };

    addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAdd();
    });
    addInput.addEventListener('input', () => clearFieldError(addInput, addError));
    for (const button of Array.from(filterButtons)) {
      button.addEventListener('click', () => setFilter(button.getAttribute('data-filter'), button));
    }

    const loaded = Todos.loadTasks(storage);
    tasks = loaded.tasks;
    setStorageFailed(!loaded.ok);
    render();
  };

  const api = { start };

  globalThis.TodoListApp = api;
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
    start({ document, storage, confirm: (message) => window.confirm(message) });
  }
})();
