import { createTodoStore } from './store.js';

const store = createTodoStore();
let currentFilter = 'all';

const $list = document.getElementById('task-list');
const $empty = document.getElementById('empty-state');
const $form = document.getElementById('add-form');
const $input = document.getElementById('new-task-title');
const $stats = document.getElementById('stats-badge');
const $filters = document.getElementById('filters');
const $clearCompleted = document.getElementById('clear-completed');

function taskRow(task) {
  const li = document.createElement('li');
  li.className = `task-card${task.completed ? ' is-completed' : ''}`;
  li.dataset.id = task.id;

  li.innerHTML = `
    <input class="toggle" type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Toggle task completed">
    <span class="title"></span>
    <button class="remove" type="button" aria-label="Delete task">&times;</button>
  `;
  li.querySelector('.title').textContent = task.title;
  return li;
}

function render() {
  const tasks = store.filter(currentFilter);
  $list.replaceChildren(...tasks.map(taskRow));
  $empty.hidden = tasks.length > 0;
  $empty.textContent = 'No tasks found. Enjoy your day!';

  const stats = store.getStats();
  $stats.textContent = `${stats.active} remaining`;
  $clearCompleted.hidden = stats.completed === 0;

  for (const btn of $filters.querySelectorAll('button')) {
    btn.classList.toggle('is-active', btn.dataset.filter === currentFilter);
  }
}

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    store.add($input.value);
  } catch {
    return; // empty/whitespace title: silently ignore
  }
  $input.value = '';
  render();
});

$list.addEventListener('click', (e) => {
  const card = e.target.closest('.task-card');
  if (!card) return;
  const id = card.dataset.id;

  if (e.target.closest('.toggle')) {
    store.toggle(id);
    render();
  } else if (e.target.closest('.remove')) {
    store.remove(id);
    render();
  }
});

$filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  render();
});

$clearCompleted.addEventListener('click', () => {
  store.clearCompleted();
  render();
});

render();
