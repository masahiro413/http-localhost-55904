/* =========================================================
   app.js — 振る舞い（DOM 操作・localStorage・Undo）

   全体の流れ（一方向）:
     状態(tasks 配列) を変更 → save() で保存 → render() で描き直す
   この流れを守ると、画面と保存データが常に一致する。
   ========================================================= */

'use strict';

/* ---- 定数 ---- */
const STORAGE_KEY = 'simple-todo.tasks'; // localStorage のキー名（名前空間付き）
const UNDO_DURATION_MS = 5000;           // 「元に戻す」を出しておく時間（5秒）

/* ---- DOM 参照 ---- */
const form       = document.getElementById('add-form');
const input      = document.getElementById('new-task');
const listEl     = document.getElementById('task-list');
const emptyEl    = document.getElementById('empty-state');
const countEl    = document.getElementById('count');
const toastEl     = document.getElementById('toast');
const toastTextEl = toastEl.querySelector('.toast-text');
const undoBtn     = document.getElementById('undo-btn');

/* ---- 状態 ---- */
// タスク配列。1件は { id, text, createdAt }。完了フラグは持たない（完了＝配列から除く）。
let tasks = load();

// 完了の保留（Undo 用）。{ task, index, timerId } または null。
// 「完了 → 一覧から即消える → 数秒だけ取り消せる」を実現するための一時状態。
let pending = null;

/* =========================================================
   永続化（localStorage）
   ========================================================= */

// 保存：配列を文字列にして書き込む
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// 読み込み：起動時に復元。無い/壊れている場合は空配列にフォールバック。
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // JSON が壊れていても、アプリは必ず起動できるようにする
    console.warn('保存データを読めませんでした。空の状態で開始します。', e);
    return [];
  }
}

/* =========================================================
   描画
   ========================================================= */

// tasks 配列から画面を組み立て直す
function render() {
  // いったん中身を空にしてから作り直す（単純で分かりやすい方法）
  listEl.replaceChildren();

  for (const task of tasks) {
    listEl.appendChild(createTaskCard(task));
  }

  // 件数の更新
  countEl.textContent = `${tasks.length} 件`;

  // 空状態の出し分け
  emptyEl.hidden = tasks.length !== 0;
}

// 1件分のカード（<li>）を組み立てて返す
function createTaskCard(task) {
  const li = document.createElement('li');
  li.className = 'task-card';

  // 完了ボタン（丸いチェック）
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'task-check';
  check.setAttribute('aria-label', 'タスクを完了');
  check.addEventListener('click', () => completeTask(task.id));

  // 本文（ダブルクリックでその場編集に切り替わる）
  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text; // textContent なので HTML は無効化される（安全）
  text.tabIndex = 0; // キーボードでもフォーカスできるようにする
  text.setAttribute('role', 'button');
  text.setAttribute('aria-label', 'ダブルクリックまたは Enter で編集');
  text.addEventListener('dblclick', () => startEdit(task.id, li));
  text.addEventListener('keydown', (event) => {
    // フォーカス中に Enter でも編集を開始できるようにする（キーボード操作の救済）
    if (event.key === 'Enter') startEdit(task.id, li);
  });

  // 削除ボタン
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'task-delete';
  del.setAttribute('aria-label', 'タスクを削除');
  del.textContent = '🗑';
  del.addEventListener('click', () => deleteTask(task.id));

  li.append(check, text, del);
  return li;
}

/* =========================================================
   操作：インライン編集（発展課題）
   本文をダブルクリック（または Enter）すると、その場で
   入力欄に差し替わり、確定するまで tasks 配列は変更しない。
   ========================================================= */

// 編集モードへ切り替える：<span> を <input> に差し替える
function startEdit(id, li) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const textEl = li.querySelector('.task-text');
  if (!textEl || textEl.tagName === 'INPUT') return; // 既に編集中なら何もしない

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'task-text task-edit-input';
  editInput.value = task.text;

  textEl.replaceWith(editInput);
  editInput.focus();
  editInput.select();

  let finished = false; // blur と keydown の二重発火を防ぐ

  const commit = () => {
    if (finished) return;
    finished = true;
    const newText = editInput.value.trim();
    // 空文字での確定は無視する（元のテキストのまま render し直す）
    if (newText !== '' && newText !== task.text) {
      task.text = newText;
      save();
    }
    render();
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    render(); // 変更を反映せずに描き直す＝元のテキストに戻る
  };

  editInput.addEventListener('blur', commit);
  editInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editInput.blur(); // blur ハンドラの commit に処理を任せる
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });
}

/* =========================================================
   操作：追加
   ========================================================= */

form.addEventListener('submit', (event) => {
  event.preventDefault(); // ページ遷移を防ぐ

  const text = input.value.trim(); // 前後の空白を除去
  if (text === '') return;         // 空なら何もしない

  tasks.push({
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    text,
    createdAt: Date.now(),
  });

  save();
  render();

  // 連続入力しやすいよう、入力欄を空にしてフォーカスを戻す
  input.value = '';
  input.focus();
});

/* =========================================================
   操作：完了（即消え ＋ Undo トースト）
   ========================================================= */

function completeTask(id) {
  // すでに保留中の完了があれば、それを先に確定させる（猶予を打ち切る）
  finalizePending();

  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  // 配列から取り除いて即座に画面から消す
  const [removed] = tasks.splice(index, 1);
  save();
  render();

  // 5秒後に自動確定するタイマーをセットして保留に記録
  const timerId = setTimeout(finalizePending, UNDO_DURATION_MS);
  pending = { task: removed, index, timerId };

  showToast();
}

// 保留中の完了を確定する（＝もう戻せない）。データは既に消してあるので後片付けだけ。
function finalizePending() {
  if (!pending) return;
  clearTimeout(pending.timerId);
  pending = null;
  hideToast();
}

// 「元に戻す」：保留中のタスクを元の位置に戻す
function undoComplete() {
  if (!pending) return;
  clearTimeout(pending.timerId);

  // 元の位置に近い場所へ挿し戻す（末尾を超えないように補正）
  const index = Math.min(pending.index, tasks.length);
  tasks.splice(index, 0, pending.task);
  save();
  render();

  pending = null;
  hideToast();
}

undoBtn.addEventListener('click', undoComplete);

/* =========================================================
   操作：削除（確認を挟む）
   ========================================================= */

function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  // 削除は完了より慎重に：実行前に確認する
  const ok = window.confirm(`「${task.text}」を削除しますか？`);
  if (!ok) return;

  tasks = tasks.filter((t) => t.id !== id);
  save();
  render();
}

/* =========================================================
   トースト表示
   ========================================================= */

function showToast() {
  toastTextEl.textContent = 'タスクを完了しました';
  toastEl.hidden = false;
}

function hideToast() {
  toastEl.hidden = true;
}

/* =========================================================
   起動
   ========================================================= */

render();
input.focus();
