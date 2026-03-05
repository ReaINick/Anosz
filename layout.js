/* ── The Baseline System – UI Logic ── */

// ── Tab Switching ──────────────────────────────────────────
function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const btns     = container.querySelectorAll('.tab-btn');
  const contents = container.querySelectorAll('.tab-content');
  btns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      contents[i].classList.add('active');
    });
  });
}

// ── Modal ──────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── Toast ──────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

// ── Goal Check-Off ─────────────────────────────────────────
function initGoalChecks() {
  document.querySelectorAll('.goal-check').forEach(btn => {
    btn.addEventListener('click', function () {
      const wasDone = this.classList.contains('done');
      this.classList.toggle('done');
      this.innerHTML = wasDone ? '' : '✓';
      if (!wasDone) {
        this.classList.add('check-pop');
        this.addEventListener('animationend', () => this.classList.remove('check-pop'), { once: true });
        // Update XP bar
        updateXP(10);
        showToast('✅ +10 XP — Keep going!');
      }
      updateProgress();
    });
  });
}

// ── XP System ─────────────────────────────────────────────
let currentXP = 240;
const XP_PER_LEVEL = 500;

function updateXP(amount) {
  currentXP = Math.min(currentXP + amount, XP_PER_LEVEL);
  const fill = document.querySelector('.xp-fill');
  const txt  = document.querySelector('.xp-txt');
  if (fill) fill.style.width = (currentXP / XP_PER_LEVEL * 100) + '%';
  if (txt)  txt.textContent = currentXP + ' / ' + XP_PER_LEVEL + ' XP';
}

// ── Progress Bars ──────────────────────────────────────────
function updateProgress() {
  document.querySelectorAll('.goal-row').forEach(row => {
    const fill  = row.querySelector('.progress-fill');
    const check = row.querySelector('.goal-check');
    if (fill && check) {
      fill.style.width = check.classList.contains('done') ? '100%' : fill.dataset.base || '0%';
    }
  });
}

// ── 1-Minute Timer ────────────────────────────────────────
let timerInterval = null;

function initTimer() {
  const ring     = document.querySelector('.timer-ring');
  const inner    = document.querySelector('.timer-ring .inner');
  const startBtn = document.getElementById('timer-start');
  if (!ring || !startBtn) return;

  let seconds = 60;
  startBtn.addEventListener('click', () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; seconds = 60; inner.textContent = '60'; ring.style.background = 'conic-gradient(var(--action) 0%, var(--surface-2) 0%)'; startBtn.textContent = '▶ Start 1-Min'; return; }
    startBtn.textContent = '⏹ Reset';
    timerInterval = setInterval(() => {
      seconds--;
      inner.textContent = seconds;
      const pct = ((60 - seconds) / 60) * 100;
      ring.style.background = `conic-gradient(var(--action) ${pct}%, var(--surface-2) ${pct}%)`;
      if (seconds <= 0) {
        clearInterval(timerInterval); timerInterval = null;
        inner.textContent = '✓'; startBtn.textContent = '▶ Start 1-Min';
        updateXP(20); showToast('🔥 Minute complete! +20 XP');
        ring.style.background = `conic-gradient(var(--success) 100%, var(--surface-2) 0%)`;
      }
    }, 1000);
  });
}

// ── Streak Badge Pop ──────────────────────────────────────
function animateStreak() {
  document.querySelectorAll('.streak-badge').forEach(badge => {
    badge.classList.add('streak-pop');
    badge.addEventListener('animationend', () => badge.classList.remove('streak-pop'), { once: true });
  });
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs('.tab-container');
  initGoalChecks();
  initTimer();
  updateXP(0);
  setTimeout(animateStreak, 600);
});