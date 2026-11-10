(() => {
  'use strict';

  const Notes = typeof module !== 'undefined' ? require('./notes.js') : globalThis.QuickNotes;

  const BLANK_MESSAGE = "Note can't be blank. Type something first.";
  const CONFIRM_DELETE = "Delete this note? This can't be undone.";
  const EMPTY_MESSAGE = 'No notes yet. Write your first note above to get started.';
  const STORAGE_MESSAGE = "Couldn't save your notes in this browser. Changes may be lost when you close this page.";
  const noMatchMessage = (query) => `No notes match "${query}".`;

  const start = ({ document, storage, confirm }) => {
    const byId = (id) => document.getElementById(id);
    const addForm = byId('add-form');
    const addInput = byId('add-text');
    const addError = byId('add-error');
    const addButton = byId('add-submit');
    const searchInput = byId('search');
    const listArea = byId('list-area');
    const statusRegion = byId('status');
    const storageWarning = byId('storage-warning');

    let notes = [];
    let editingId = null;
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

    const persist = () => setStorageFailed(!Notes.saveNotes(storage, notes));

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

    const currentQuery = () => searchInput.value.trim();
    const visibleNotes = () => Notes.searchNotes(notes, currentQuery());

    const onCtrlEnter = (event, submit) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!event.repeat) submit();
    };

    const clearSearch = () => {
      searchInput.value = '';
      render();
      announce('');
      searchInput.focus();
    };

    const beginEdit = (id) => {
      editingId = id;
      render();
      byId('edit-text').focus();
    };

    const cancelEdit = () => {
      const id = editingId;
      editingId = null;
      render();
      editButtons.get(id).focus();
    };

    const saveEdit = (field, error) => {
      const updated = Notes.editNote(notes, editingId, field.value);
      if (!updated) {
        showBlankError(field, error);
        return;
      }
      const id = editingId;
      notes = updated;
      editingId = null;
      persist();
      render();
      announce('Note saved.');
      (editButtons.get(id) || searchInput).focus();
    };

    const removeNote = (id, deleteButton) => {
      if (!confirm(CONFIRM_DELETE)) {
        deleteButton.focus();
        return;
      }
      const visible = visibleNotes();
      const index = visible.findIndex((note) => note.id === id);
      const neighbor = visible[index + 1] || visible[index - 1];
      notes = Notes.deleteNote(notes, id);
      persist();
      render();
      announce('Note deleted.');
      (neighbor ? editButtons.get(neighbor.id) : addInput).focus();
    };

    const renderNote = (note) => {
      const item = create('li', 'note');
      const text = create('p', 'note-text');
      text.textContent = note.text;

      const actions = create('div', 'note-actions');
      const editButton = createButton('Edit', 'edit', () => beginEdit(note.id));
      const deleteButton = createButton('Delete', 'danger delete', () => removeNote(note.id, deleteButton));
      editButton.disabled = editingId !== null;
      deleteButton.disabled = editingId !== null;
      actions.append(editButton, deleteButton);
      editButtons.set(note.id, editButton);

      item.append(text, actions);
      return item;
    };

    const renderEditor = (note) => {
      const item = create('li', 'note');
      const form = create('form', 'edit-form');

      const label = create('label');
      label.htmlFor = 'edit-text';
      label.textContent = 'Edit note';

      const field = create('textarea');
      field.id = 'edit-text';
      field.rows = 4;
      field.value = note.text;

      const error = create('p', 'field-error');
      error.id = 'edit-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const actions = create('div', 'note-actions');
      const saveButton = create('button', 'primary save');
      saveButton.type = 'submit';
      saveButton.textContent = 'Save';
      actions.append(saveButton, createButton('Cancel', 'cancel', cancelEdit));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEdit(field, error);
      });
      field.addEventListener('input', () => clearFieldError(field, error));
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.isComposing) {
          event.preventDefault();
          cancelEdit();
          return;
        }
        onCtrlEnter(event, () => saveEdit(field, error));
      });

      form.append(label, field, error, actions);
      item.append(form);
      return item;
    };

    const render = () => {
      const editing = editingId !== null;
      addInput.disabled = editing;
      addButton.disabled = editing;
      searchInput.disabled = editing;
      editButtons = new Map();

      const visible = visibleNotes();
      if (notes.length === 0) {
        listArea.replaceChildren(createMessage(EMPTY_MESSAGE));
      } else if (visible.length === 0) {
        listArea.replaceChildren(
          createMessage(noMatchMessage(currentQuery())),
          createButton('Clear search', 'clear-search', clearSearch),
        );
      } else {
        const list = create('ul', 'notes');
        list.append(...visible.map((note) => (note.id === editingId ? renderEditor(note) : renderNote(note))));
        listArea.replaceChildren(list);
      }
    };

    const submitAdd = () => {
      const updated = Notes.addNote(notes, addInput.value);
      if (!updated) {
        showBlankError(addInput, addError);
        return;
      }
      notes = updated;
      addInput.value = '';
      searchInput.value = '';
      clearFieldError(addInput, addError);
      persist();
      render();
      announce('Note added.');
      addInput.focus();
    };

    addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAdd();
    });
    addInput.addEventListener('input', () => clearFieldError(addInput, addError));
    addInput.addEventListener('keydown', (event) => onCtrlEnter(event, submitAdd));
    searchInput.addEventListener('input', () => {
      render();
      const noMatch = notes.length > 0 && visibleNotes().length === 0;
      announce(noMatch ? noMatchMessage(currentQuery()) : '');
    });

    const loaded = Notes.loadNotes(storage);
    notes = loaded.notes;
    setStorageFailed(!loaded.ok);
    render();
  };

  const api = { start };

  globalThis.QuickNotesApp = api;
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
