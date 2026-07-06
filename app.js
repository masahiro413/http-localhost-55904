const STORAGE_KEY = "simple-todo.tasks";
const UNDO_DURATION_MS = 5000;

const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const taskCount = document.getElementById("task-count");
const undoToast = document.getElementById("undo-toast");
const undoMessage = document.getElementById("undo-message");
const undoButton = document.getElementById("undo-button");

let tasks = loadTasks();
let pendingCompletion = null;
let undoTimeoutId = null;

// 追加・完了・削除のたびに「保存して再描画する」流れを保つため、
// 状態変更をする関数は tasks を更新したあと saveTasks() と render() を呼ぶ。
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// 壊れたデータが入っていてもアプリが起動できるよう、
// 配列かどうか・要素の形が妥当かを確認してから使う。
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isTaskRecord);
  } catch (error) {
    return [];
  }
}

function isTaskRecord(task) {
  return (
    task &&
    typeof task.id === "string" &&
    typeof task.text === "string" &&
    typeof task.createdAt === "number"
  );
}

function createTask(text) {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    createdAt: Date.now(),
  };
}

function render() {
  taskList.innerHTML = "";

  tasks.forEach((task) => {
    taskList.appendChild(createTaskElement(task));
  });

  emptyState.hidden = tasks.length > 0;
  taskCount.textContent = `${tasks.length}件`;
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = "task-item";

  const completeButton = document.createElement("button");
  completeButton.type = "button";
  completeButton.className = "task-action task-complete";
  completeButton.textContent = "完了";
  completeButton.setAttribute("aria-label", `タスク「${task.text}」を完了`);
  completeButton.addEventListener("click", () => completeTask(task.id));

  const text = document.createElement("p");
  text.className = "task-text";
  text.textContent = task.text;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "task-action task-delete";
  deleteButton.textContent = "削除";
  deleteButton.setAttribute("aria-label", `タスク「${task.text}」を削除`);
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  item.append(completeButton, text, deleteButton);

  return item;
}

function addTask() {
  const text = taskInput.value.trim();

  if (!text) {
    taskInput.focus();
    return;
  }

  tasks.push(createTask(text));
  saveTasks();
  render();

  taskInput.value = "";
  taskInput.focus();
}

function completeTask(taskId) {
  finalizePendingCompletion();

  const originalIndex = tasks.findIndex((task) => task.id === taskId);

  if (originalIndex === -1) {
    return;
  }

  const [removedTask] = tasks.splice(originalIndex, 1);
  pendingCompletion = { task: removedTask, originalIndex };

  saveTasks();
  render();
  showUndoToast(removedTask);
}

// 完了したタスクはすでに tasks から外して保存済みなので、
// 「確定」は保留情報を捨てて Undo できなくするだけでよい。
function finalizePendingCompletion() {
  pendingCompletion = null;

  if (undoTimeoutId) {
    clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }

  hideUndoToast();
}

function showUndoToast(task) {
  undoMessage.textContent = `「${task.text}」を完了しました。`;
  undoToast.hidden = false;

  if (undoTimeoutId) {
    clearTimeout(undoTimeoutId);
  }

  undoTimeoutId = window.setTimeout(() => {
    finalizePendingCompletion();
  }, UNDO_DURATION_MS);
}

function hideUndoToast() {
  undoToast.hidden = true;
}

function restorePendingTask() {
  if (!pendingCompletion) {
    return;
  }

  const { task, originalIndex } = pendingCompletion;
  const insertIndex = Math.min(originalIndex, tasks.length);

  tasks.splice(insertIndex, 0, task);
  saveTasks();
  render();
  finalizePendingCompletion();
}

function deleteTask(taskId) {
  const targetTask = tasks.find((task) => task.id === taskId);

  if (!targetTask) {
    return;
  }

  const isConfirmed = window.confirm(`「${targetTask.text}」を削除しますか？`);

  if (!isConfirmed) {
    return;
  }

  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  render();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask();
});

undoButton.addEventListener("click", restorePendingTask);

render();
