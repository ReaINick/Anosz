/* ============================================================
   THE BASELINE SYSTEM — layout.js — V2
   Covers: XP Engine · Timer Lock · Calibration · Auth Toggle
           Tab Switching · Modals · Toasts · Level-Up Alert
           Streak Logic · Skills Render · Page Init Router
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────
   1. CONSTANTS & localStorage KEYS
   ────────────────────────────────────────────────────────── */
const KEYS = {
  XP           : 'baseline_xp',
  LEVEL        : 'baseline_level',
  STREAK       : 'baseline_streak',
  LAST_DATE    : 'baseline_last_date',
  SHIELD_USED  : 'baseline_shield_used',
  TASKS_TODAY  : 'baseline_tasks_today',
  DAILY_GOAL   : 'baseline_daily_goal_minutes',
  SKILLS       : 'baseline_skills',
  USER_NAME    : 'baseline_username',
};

const MAX_LEVEL    = 99;
const BASE_XP_TASK = 10;   // flat XP granted per completed task

/* ──────────────────────────────────────────────────────────
   2. PAGE DETECTION
   ────────────────────────────────────────────────────────── */
const PAGE = (() => {
  const p = window.location.pathname.split('/').pop() || 'index.html';
  return p.replace('.html', '') || 'index';
})();

/* ──────────────────────────────────────────────────────────
   3. STORAGE HELPERS
   ────────────────────────────────────────────────────────── */
const Store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
};

/* ──────────────────────────────────────────────────────────
   4. XP & LEVELING ENGINE
   ────────────────────────────────────────────────────────── */

/**
 * Cumulative XP required to REACH level n (level 1 = 0 XP).
 * Formula: 10 * (n - 1)^2
 *   Level 1 → 0 XP  |  Level 2 → 10 XP
 *   Level 3 → 40 XP |  Level 4 → 90 XP  | Level 5 → 160 XP …
 */
function totalXPForLevel(n) {
  if (n <= 1) return 0;
  const capped = Math.min(n, MAX_LEVEL);
  return 10 * Math.pow(capped - 1, 2);
}

/**
 * XP required to advance FROM level n TO level n+1.
 * Additive formula: 10 + (n - 1) * 20
 *   L1→L2: 10 XP | L2→L3: 30 XP | L3→L4: 50 XP …
 */
function xpForNextLevel(n) {
  return 10 + (n - 1) * 20;
}

/**
 * Derive current level from raw total XP.
 * Inverse of totalXPForLevel: level = floor(1 + sqrt(xp / 10))
 * Capped at MAX_LEVEL.
 */
function levelFromXP(xp) {
  if (xp <= 0) return 1;
  const raw = Math.floor(1 + Math.sqrt(xp / 10));
  return Math.min(raw, MAX_LEVEL);
}

/**
 * XP the user has earned WITHIN their current level.
 */
function xpInCurrentLevel(xp) {
  const lvl = levelFromXP(xp);
  return xp - totalXPForLevel(lvl);
}

/**
 * XP needed to advance from current level to next.
 */
function xpNeededThisLevel(xp) {
  const lvl = levelFromXP(xp);
  if (lvl >= MAX_LEVEL) return 0;
  return xpForNextLevel(lvl);
}

/**
 * Add XP, persist, check for level-up, refresh all XP UI.
 * Returns { newXP, newLevel, leveledUp }.
 */
function addXP(amount) {
  const prevXP    = Store.get(KEYS.XP, 0);
  const prevLevel = levelFromXP(prevXP);

  const newXP     = prevXP + amount;
  const newLevel  = levelFromXP(newXP);
  const leveledUp = newLevel > prevLevel;

  Store.set(KEYS.XP, newXP);
  Store.set(KEYS.LEVEL, newLevel);

  renderXPBar(newXP, newLevel);
  spawnXPFloat(amount);

  if (leveledUp && newLevel <= MAX_LEVEL) {
    showLevelUp(newLevel);
  }

  return { newXP, newLevel, leveledUp };
}

/** Render every XP bar / level badge on the current page. */
function renderXPBar(xp, level) {
  xp    = xp    ?? Store.get(KEYS.XP, 0);
  level = level ?? levelFromXP(xp);

  const earned = xpInCurrentLevel(xp);
  const needed = xpNeededThisLevel(xp);
  const pct    = level >= MAX_LEVEL ? 100 : Math.min((earned / needed) * 100, 100);

  document.querySelectorAll('.xp-fill').forEach(el => {
    el.style.width = pct.toFixed(1) + '%';
  });
  document.querySelectorAll('.xp-txt').forEach(el => {
    el.textContent = level >= MAX_LEVEL
      ? 'MAX LEVEL'
      : `${earned} / ${needed} XP`;
  });
  document.querySelectorAll('.level-pill, .level-badge').forEach(el => {
    el.textContent = `LVL ${level}`;
  });
}

/* ──────────────────────────────────────────────────────────
   5. STREAK MANAGEMENT
   ────────────────────────────────────────────────────────── */

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Called once per session (page load).
 * Handles streak increment / break / Merciful Shield.
 */
function refreshStreak() {
  const lastDate   = Store.get(KEYS.LAST_DATE, null);
  let   streak     = Store.get(KEYS.STREAK, 0);
  let   shieldUsed = Store.get(KEYS.SHIELD_USED, false);
  const today      = todayStr();

  if (lastDate === today) {
    // Already logged today — nothing to do
  } else if (lastDate === yesterdayStr()) {
    // Consecutive day
    streak++;
    shieldUsed = false;
    Store.set(KEYS.SHIELD_USED, false);
    Store.set(KEYS.LAST_DATE, today);
    Store.set(KEYS.STREAK, streak);
  } else if (lastDate !== null && !shieldUsed) {
    // Missed one day — Merciful Shield absorbs the break
    shieldUsed = true;
    Store.set(KEYS.SHIELD_USED, true);
    Store.set(KEYS.LAST_DATE, today);
    // Streak preserved but not incremented
  } else {
    // Streak broken (missed 2+ days, or never started)
    streak = lastDate === null ? 0 : 0;
    shieldUsed = false;
    Store.set(KEYS.STREAK, streak);
    Store.set(KEYS.SHIELD_USED, false);
    Store.set(KEYS.LAST_DATE, today);
  }

  renderStreak(streak, shieldUsed);
  return { streak, shieldUsed };
}

function renderStreak(streak, shieldUsed) {
  streak     = streak     ?? Store.get(KEYS.STREAK, 0);
  shieldUsed = shieldUsed ?? Store.get(KEYS.SHIELD_USED, false);

  document.querySelectorAll('.streak-count').forEach(el => {
    el.textContent = streak;
  });
  document.querySelectorAll('.streak-badge').forEach(el => {
    el.textContent = `🔥 ${streak}-Day Streak`;
  });
  document.querySelectorAll('.shield-notice').forEach(el => {
    el.style.display = shieldUsed ? 'flex' : 'none';
  });
}

/* ──────────────────────────────────────────────────────────
   6. 60-SECOND TASK TIMER LOCK  (index.html)
   ────────────────────────────────────────────────────────── */

/**
 * Initialises a timer + complete button for a single task row.
 * Expected DOM structure per task:
 *   .task-row[data-task-id="reading"]
 *     .task-timer-btn   ← "Start Timer"
 *     .task-complete-btn ← "Complete" (disabled at start)
 *     .task-timer-display  ← shows countdown number
 *     .timer-ring          ← SVG <circle> for ring progress
 */
function initTaskTimers() {
  document.querySelectorAll('.task-row[data-task-id]').forEach(row => {
    const startBtn    = row.querySelector('.task-timer-btn');
    const completeBtn = row.querySelector('.task-complete-btn');
    const display     = row.querySelector('.task-timer-display');
    const ring        = row.querySelector('.timer-ring');
    if (!startBtn || !completeBtn) return;

    const DURATION   = 60; // seconds
    const CIRCUMF    = ring ? 2 * Math.PI * parseFloat(ring.getAttribute('r') || 26) : 0;
    let   countdown  = null;
    let   remaining  = DURATION;

    // Restore completed state
    const doneTasks = Store.get(KEYS.TASKS_TODAY, {});
    const taskId    = row.dataset.taskId;
    if (doneTasks[taskId]) {
      markTaskDone(row, completeBtn, startBtn);
      return;
    }

    // ── Start Timer ──
    startBtn.addEventListener('click', () => {
      if (countdown) return; // already running
      startBtn.disabled   = true;
      startBtn.textContent = '⏱ Running…';
      remaining = DURATION;

      if (ring) {
        ring.style.strokeDasharray  = CIRCUMF;
        ring.style.strokeDashoffset = CIRCUMF;
      }

      countdown = setInterval(() => {
        remaining--;
        if (display) display.textContent = remaining > 0 ? remaining : '✓';
        if (ring) {
          const filled = ((DURATION - remaining) / DURATION) * CIRCUMF;
          ring.style.strokeDashoffset = (CIRCUMF - filled).toFixed(2);
        }
        if (remaining <= 0) {
          clearInterval(countdown);
          countdown = null;
          unlockComplete(completeBtn, startBtn);
        }
      }, 1000);
    });

    // ── Unlock Complete ──
    function unlockComplete(btn, sBtn) {
      btn.disabled  = false;
      btn.setAttribute('aria-disabled', 'false');
      btn.classList.add('anim-pop-in');
      sBtn.textContent  = '✓ Done!';
      if (ring) ring.classList.add('done');
      showToast('⏱ Time\'s up — mark it complete!');
    }

    // ── Complete Task ──
    completeBtn.addEventListener('click', () => {
      if (completeBtn.disabled) return;
      const taskId = row.dataset.taskId;
      const done   = Store.get(KEYS.TASKS_TODAY, {});
      done[taskId] = true;
      Store.set(KEYS.TASKS_TODAY, done);

      const { newLevel } = addXP(BASE_XP_TASK);
      showToast(`✅ +${BASE_XP_TASK} XP — Level ${newLevel}`);
      markTaskDone(row, completeBtn, startBtn);
      checkAllTasksDone();
    });
  });
}

function markTaskDone(row, completeBtn, startBtn) {
  const check = row.querySelector('.task-check');
  if (check) {
    check.classList.add('done', 'anim-check-pop');
    check.textContent = '✓';
  }
  if (completeBtn) { completeBtn.disabled = true; completeBtn.textContent = '✓ Done'; }
  if (startBtn)    { startBtn.disabled    = true; }
  row.style.opacity = '0.6';
}

function checkAllTasksDone() {
  const rows  = document.querySelectorAll('.task-row[data-task-id]');
  const done  = Store.get(KEYS.TASKS_TODAY, {});
  const allDone = [...rows].every(r => done[r.dataset.taskId]);
  if (allDone) {
    showToast('🏆 All tasks complete today!', 3200);
    // Increment streak for today
    Store.set(KEYS.LAST_DATE, todayStr());
    const s = Store.get(KEYS.STREAK, 0) + 1;
    Store.set(KEYS.STREAK, s);
    renderStreak(s, false);
  }
}

/* ──────────────────────────────────────────────────────────
   7. CALIBRATION — SPACEBAR MECHANIC  (calibrate.html)
   ────────────────────────────────────────────────────────── */

function initCalibrate() {
  const startBtn    = document.getElementById('cal-start-btn');
  const timerNum    = document.getElementById('cal-timer-number');
  const resultCard  = document.querySelector('.calibrate-result');
  const resultNum   = document.getElementById('cal-result-number');
  const confirmBtn  = document.getElementById('cal-confirm-btn');
  const spaceHint   = document.querySelector('.spacebar-hint');
  const ring        = document.querySelector('.timer-calibrate .timer-ring');
  if (!startBtn) return;

  let startTime     = null;
  let displayTimer  = null;
  let running       = false;
  let goalMinutes   = 1;

  const CIRCUMF = ring
    ? 2 * Math.PI * parseFloat(ring.getAttribute('r') || 80)
    : 0;

  // Guard: spacebar only fires after timer started
  function handleSpacebar(e) {
    if (!running) return;
    if (e.code !== 'Space' && e.key !== ' ') return;
    e.preventDefault();
    stopCalibration();
  }

  startBtn.addEventListener('click', () => {
    if (running) return;
    running       = true;
    startTime     = Date.now();
    startBtn.disabled    = true;
    startBtn.textContent = '⏱ Running — press SPACE when distracted';
    if (spaceHint) spaceHint.style.display = 'flex';

    // Live display: mm:ss
    displayTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const s = Math.floor(elapsed % 60).toString().padStart(2, '0');
      if (timerNum) timerNum.textContent = `${m}:${s}`;

      // Animate ring — one full rotation per 10 minutes
      if (ring) {
        const pct = (elapsed % 600) / 600;
        ring.style.strokeDasharray  = CIRCUMF;
        ring.style.strokeDashoffset = (CIRCUMF - pct * CIRCUMF).toFixed(2);
      }
    }, 250);

    document.addEventListener('keydown', handleSpacebar);
  });

  function stopCalibration() {
    if (!running || !startTime) return;
    running = false;
    clearInterval(displayTimer);
    document.removeEventListener('keydown', handleSpacebar);

    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // 80% of elapsed time, rounded up to nearest whole minute, min 1 min
    goalMinutes = Math.max(1, Math.ceil((elapsedSeconds / 60) * 0.8));

    Store.set(KEYS.DAILY_GOAL, goalMinutes);

    if (resultNum)  resultNum.textContent = `${goalMinutes} min`;
    if (resultCard) resultCard.classList.add('show');
    if (startBtn)   startBtn.textContent = `⏹ Stopped at ${timerNum?.textContent}`;
    showToast(`🎯 Daily goal set: ${goalMinutes} minute${goalMinutes > 1 ? 's' : ''}`);
  }

  // Mobile fallback: tap-to-stop button
  const tapStop = document.getElementById('cal-tap-stop');
  if (tapStop) tapStop.addEventListener('click', stopCalibration);

  // Confirm → redirect to index
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
}

/* ──────────────────────────────────────────────────────────
   8. SKILLS INVENTORY  (skills.html)
   ────────────────────────────────────────────────────────── */

const DEFAULT_SKILLS = [
  { id: 'reading',    name: 'Daily Reading',    icon: '📖', xp: 0, category: 'Mind' },
  { id: 'meditation', name: 'Meditation',        icon: '🧘', xp: 0, category: 'Mind' },
  { id: 'cleaning',   name: 'Room Clean',        icon: '🧹', xp: 0, category: 'Home' },
  { id: 'walking',    name: 'Daily Walk',        icon: '🚶', xp: 0, category: 'Body' },
  { id: 'hydration',  name: 'Hydration',         icon: '💧', xp: 0, category: 'Body' },
  { id: 'budgeting',  name: 'Budget Tracker',    icon: '💰', xp: 0, category: 'Finance' },
  { id: 'journaling', name: 'Journaling',        icon: '📓', xp: 0, category: 'Mind' },
  { id: 'mealprep',   name: 'Meal Prep',         icon: '🥗', xp: 0, category: 'Body' },
];

function loadSkills() {
  return Store.get(KEYS.SKILLS, DEFAULT_SKILLS);
}

function saveSkills(skills) {
  Store.set(KEYS.SKILLS, skills);
}

function addSkillXP(skillId, amount) {
  const skills = loadSkills();
  const skill  = skills.find(s => s.id === skillId);
  if (skill) {
    skill.xp = (skill.xp || 0) + amount;
    saveSkills(skills);
  }
}

function renderSkillsPage() {
  const container = document.getElementById('skills-list');
  if (!container) return;

  const skills = loadSkills();
  container.innerHTML = '';

  skills.forEach(skill => {
    const xp      = skill.xp || 0;
    const level   = levelFromXP(xp);
    const earned  = xpInCurrentLevel(xp);
    const needed  = xpNeededThisLevel(xp);
    const pct     = level >= MAX_LEVEL ? 100 : Math.min((earned / needed) * 100, 100);

    const row = document.createElement('div');
    row.className = 'skill-inv-row anim-fade-in';
    row.innerHTML = `
      <div class="skill-inv-icon">${skill.icon}</div>
      <div class="skill-inv-info flex-1">
        <div class="skill-inv-name">${skill.name}</div>
        <div class="skill-inv-sub">${skill.category} · ${xp} total XP</div>
        <div class="progress-track" style="height:8px;">
          <div class="progress-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
      </div>
      <div class="skill-inv-xp">
        <div class="level-pill">LVL ${level}</div>
        ${level < MAX_LEVEL
          ? `<div class="text-xs text-muted mt-4">${earned}/${needed}</div>`
          : `<div class="text-xs text-action mt-4">MAX</div>`
        }
      </div>
    `;
    container.appendChild(row);
  });
}

/* ──────────────────────────────────────────────────────────
   9. AUTH PAGE TOGGLE  (auth.html)
   ────────────────────────────────────────────────────────── */

function initAuth() {
  const loginBtn    = document.getElementById('auth-login-btn');
  const registerBtn = document.getElementById('auth-register-btn');
  const loginForm   = document.getElementById('login-form');
  const registerForm= document.getElementById('register-form');
  if (!loginBtn || !registerBtn) return;

  function showLogin() {
    loginForm?.classList.remove('hidden');
    registerForm?.classList.add('hidden');
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  }
  function showRegister() {
    registerForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
    registerBtn.classList.add('active');
    loginBtn.classList.remove('active');
  }

  loginBtn.addEventListener('click', showLogin);
  registerBtn.addEventListener('click', showRegister);

  // ── Login submission → index.html ──
  loginForm?.addEventListener('submit', e => {
    e.preventDefault();
    const username = loginForm.querySelector('[name="username"]')?.value.trim();
    if (username) Store.set(KEYS.USER_NAME, username);
    window.location.href = 'index.html';
  });

  // ── Register submission → realize.html ──
  registerForm?.addEventListener('submit', e => {
    e.preventDefault();
    const username = registerForm.querySelector('[name="username"]')?.value.trim();
    const pw       = registerForm.querySelector('[name="password"]')?.value;
    const pwConf   = registerForm.querySelector('[name="password-confirm"]')?.value;

    if (pw !== pwConf) {
      showFieldError(registerForm, 'password-confirm', 'Passwords do not match.');
      return;
    }
    if (username) Store.set(KEYS.USER_NAME, username);
    // Fresh account — reset XP/streak for new user
    Store.set(KEYS.XP, 0);
    Store.set(KEYS.STREAK, 0);
    Store.remove(KEYS.LAST_DATE);
    Store.set(KEYS.SKILLS, DEFAULT_SKILLS);
    window.location.href = 'realize.html';
  });

  function showFieldError(form, fieldName, msg) {
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (!input) return;
    let err = input.parentElement.querySelector('.form-error');
    if (!err) {
      err = document.createElement('span');
      err.className = 'form-error';
      input.parentElement.appendChild(err);
    }
    err.textContent = msg;
    input.focus();
  }
}

/* ──────────────────────────────────────────────────────────
   10. TAB SWITCHING
   ────────────────────────────────────────────────────────── */

function initTabs(containerSelector) {
  const containers = typeof containerSelector === 'string'
    ? document.querySelectorAll(containerSelector)
    : [containerSelector];

  containers.forEach(container => {
    if (!container) return;
    const btns     = container.querySelectorAll('.tab-btn');
    const contents = container.querySelectorAll('.tab-content');

    btns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        btns.forEach(b     => b.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        if (contents[i]) contents[i].classList.add('active');
      });
    });
  });
}

/* ──────────────────────────────────────────────────────────
   11. MODALS
   ────────────────────────────────────────────────────────── */

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// Click outside modal sheet to close
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Wire up any [data-modal-open] and [data-modal-close] attributes
function initModalTriggers() {
  document.querySelectorAll('[data-modal-open]').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.modalOpen));
  });
  document.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.modalClose));
  });
}

/* ──────────────────────────────────────────────────────────
   12. TOAST NOTIFICATIONS
   ────────────────────────────────────────────────────────── */

let toastTimer = null;

function showToast(msg, duration = 2600) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ──────────────────────────────────────────────────────────
   13. LEVEL-UP ALERT
   ────────────────────────────────────────────────────────── */

function showLevelUp(newLevel) {
  let overlay = document.getElementById('levelup-overlay');

  // Create overlay if it doesn't exist in the HTML
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id        = 'levelup-overlay';
    overlay.className = 'levelup-overlay';
    overlay.innerHTML = `
      <div class="levelup-card">
        <div class="levelup-icon">⚡</div>
        <div class="levelup-label">Level Up!</div>
        <div class="levelup-number" id="levelup-num">${newLevel}</div>
        <p style="margin:12px 0 20px;font-size:.85rem;">
          You've reached <strong>Level ${newLevel}</strong>.<br/>
          Keep going — the next level is closer than you think.
        </p>
        <button class="btn btn-dark btn-block" id="levelup-dismiss">
          Let's Go ⚡
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    const numEl = overlay.querySelector('#levelup-num') || overlay.querySelector('.levelup-number');
    if (numEl) numEl.textContent = newLevel;
    overlay.querySelectorAll('p strong').forEach(el => el.textContent = `Level ${newLevel}`);
  }

  overlay.classList.add('open');

  const dismissBtn = overlay.querySelector('#levelup-dismiss');
  dismissBtn?.addEventListener('click', () => {
    overlay.classList.remove('open');
  }, { once: true });

  // Auto-close after 8 seconds
  setTimeout(() => overlay.classList.remove('open'), 8000);
}

/* ──────────────────────────────────────────────────────────
   14. XP FLOAT ANIMATION (+10 XP bubble)
   ────────────────────────────────────────────────────────── */

function spawnXPFloat(amount) {
  const float = document.createElement('div');
  float.textContent = `+${amount} XP`;
  Object.assign(float.style, {
    position  : 'fixed',
    bottom    : `calc(var(--nav-height, 66px) + 72px)`,
    right     : '20px',
    fontWeight: '900',
    fontSize  : '1rem',
    color     : 'var(--royal-blue)',
    pointerEvents: 'none',
    zIndex    : '450',
    animation : 'xpGain 1.2s cubic-bezier(.4,0,.2,1) forwards',
  });
  document.body.appendChild(float);
  float.addEventListener('animationend', () => float.remove());
}

/* ──────────────────────────────────────────────────────────
   15. STREAK BADGE ANIMATION
   ────────────────────────────────────────────────────────── */

function animateStreakBadges() {
  document.querySelectorAll('.streak-badge').forEach(badge => {
    badge.classList.add('anim-streak-pop');
    badge.addEventListener('animationend',
      () => badge.classList.remove('anim-streak-pop'),
      { once: true }
    );
  });
}

/* ──────────────────────────────────────────────────────────
   16. DAILY TASK RESET
   Clears today's task completion if the date has changed.
   ────────────────────────────────────────────────────────── */

function checkDailyReset() {
  const lastDate = Store.get(KEYS.LAST_DATE, null);
  const today    = todayStr();
  if (lastDate !== today) {
    // New day — wipe task completions so they reappear
    // (streak logic is handled separately in refreshStreak)
    const existing = Store.get(KEYS.TASKS_TODAY, {});
    if (Object.keys(existing).length > 0) {
      Store.set(KEYS.TASKS_TODAY, {});
    }
  }
}

/* ──────────────────────────────────────────────────────────
   17. UTILITY: hidden class toggle helper
   ────────────────────────────────────────────────────────── */

function toggle(el, force) {
  if (!el) return;
  if (force === true)  { el.classList.remove('hidden'); return; }
  if (force === false) { el.classList.add('hidden');    return; }
  el.classList.toggle('hidden');
}

/* ──────────────────────────────────────────────────────────
   18. PAGE INIT ROUTER
   ────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // ── Universal: run on every page ──
  renderXPBar();
  renderStreak();
  initModalTriggers();
  initTabs('.tab-container');

  // ── Route to page-specific logic ──
  switch (PAGE) {

    case 'auth':
      initAuth();
      break;

    case 'realize':
      // The final CTA button on realize.html routes to calibrate.html
      document.querySelectorAll('[data-goto="calibrate"]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.location.href = 'calibrate.html';
        });
      });
      break;

    case 'calibrate':
      initCalibrate();
      break;

    case 'index':
      checkDailyReset();
      refreshStreak();
      initTaskTimers();
      setTimeout(animateStreakBadges, 700);

      // Show saved daily goal in dashboard if set
      const goal = Store.get(KEYS.DAILY_GOAL, null);
      document.querySelectorAll('.daily-goal-display').forEach(el => {
        if (goal) el.textContent = `${goal} min`;
      });
      break;

    case 'skills':
      renderSkillsPage();
      break;

    case 'social':
      refreshStreak();
      setTimeout(animateStreakBadges, 700);
      break;

    case 'goals':
      // Mastery path card clicks handled via data-modal-open attributes
      break;
  }

  // ── Expose key functions globally for inline onclick use ──
  window.openModal   = openModal;
  window.closeModal  = closeModal;
  window.showToast   = showToast;
  window.showLevelUp = showLevelUp;
  window.addXP       = addXP;
});
