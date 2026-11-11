// In-memory task store. No localStorage, no database — state lives only
// for the lifetime of the store instance.

export function createTodoStore(initialItems = []) {
  let tasks = Array.isArray(initialItems) ? initialItems.slice() : [];

  function add(title) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new Error('title must be a non-empty string');
    }
    const task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    tasks.push(task);
    return task;
  }

  function toggle(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error(`no task with id ${id}`);
    }
    task.completed = !task.completed;
    return task;
  }

  function remove(id) {
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    tasks.splice(index, 1);
    return true;
  }

  function filter(status = 'all') {
    if (status === 'active') return tasks.filter((t) => !t.completed);
    if (status === 'completed') return tasks.filter((t) => t.completed);
    if (status === 'all') return tasks.slice();
    throw new Error(`unknown filter status: ${status}`);
  }

  function clearCompleted() {
    tasks = tasks.filter((t) => !t.completed);
  }

  function getStats() {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    return { total, active: total - completed, completed };
  }

  return { add, toggle, remove, filter, clearCompleted, getStats };
}
