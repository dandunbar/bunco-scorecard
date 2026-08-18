/* Bunco Scorecard
 *
 * Four sets of six rounds — ones through sixes, four times through. You and
 * your partner share one score, so every roll that scores goes on the same
 * card. The one thing that is *not* shared is the Bunco count: three of the
 * number you are rolling for scores 21 either way, but it is only your Bunco
 * if you were the one holding the dice. That distinction is the whole reason
 * there are two 21 buttons.
 *
 * Everything lives in this phone's localStorage; nothing is sent anywhere.
 */

const APP_VERSION = '1.0.2';   // keep in step with CACHE in sw.js
const STATE_KEY = 'bunco.state.v1';
const HISTORY_KEY = 'bunco.history.v1';
const HISTORY_LIMIT = 24;

const SETS = 4;
const ROUNDS_PER_SET = 6;
const TOTAL_ROUNDS = SETS * ROUNDS_PER_SET;

const BUNCO_PTS = 21;
const MINI_PTS = 5;

const DEFAULTS = { gameName: 'Bunco Night' };

const NUMBER_WORDS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

/* Which of the nine cells in a 3x3 grid carry a pip, per die face. */
const PIP_MAP = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/* ---------- State ---------- */

let state = load();
let view = 'play';           // 'play' | 'card'
let toastTimer = null;
let confirmAction = null;

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function blankRounds() {
  return Array.from({ length: TOTAL_ROUNDS }, () => []);
}

function blankState() {
  return {
    gameName: DEFAULTS.gameName,
    gameDate: todayISO(),
    roundIndex: 0,
    rounds: blankRounds(),
  };
}

/* A saved card is trusted only as far as it can be checked. Anything short or
 * malformed is padded out rather than thrown away, so a half-written round
 * never costs the whole night's score. */
function normalizeRounds(raw) {
  const rounds = blankRounds();
  if (!Array.isArray(raw)) return rounds;
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const list = raw[i];
    if (!Array.isArray(list)) continue;
    rounds[i] = list
      .filter((e) => e && Number.isFinite(e.p))
      .map((e) => ({
        p: e.p,
        b: e.b === 'me' || e.b === 'partner' ? e.b : null,
        t: Number.isFinite(e.t) ? e.t : Date.now(),
      }));
  }
  return rounds;
}

function load() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    const base = blankState();
    return {
      gameName: typeof parsed.gameName === 'string' ? parsed.gameName : base.gameName,
      gameDate: typeof parsed.gameDate === 'string' ? parsed.gameDate : base.gameDate,
      roundIndex: clampRound(parsed.roundIndex),
      rounds: normalizeRounds(parsed.rounds),
    };
  } catch (err) {
    console.warn('Could not read the saved card, starting fresh.', err);
    return blankState();
  }
}

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save.', err);
    showToast('Could not save to this phone', null);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch (err) {
    console.error('Could not save history.', err);
  }
}

/* ---------- Derived values ---------- */

function clampRound(n) {
  const i = Number(n);
  if (!Number.isFinite(i)) return 0;
  return Math.min(TOTAL_ROUNDS - 1, Math.max(0, Math.trunc(i)));
}

const setOf = (i) => Math.floor(i / ROUNDS_PER_SET) + 1;      // 1..4
const targetOf = (i) => (i % ROUNDS_PER_SET) + 1;             // 1..6

const currentRolls = () => state.rounds[state.roundIndex];

const sumPts = (list) => list.reduce((n, e) => n + e.p, 0);

function roundTotal(i) {
  return sumPts(state.rounds[i]);
}

function setTotal(s) {
  let n = 0;
  for (let i = (s - 1) * ROUNDS_PER_SET; i < s * ROUNDS_PER_SET; i++) n += roundTotal(i);
  return n;
}

function grandTotal() {
  return state.rounds.reduce((n, list) => n + sumPts(list), 0);
}

function buncoCount(who) {
  return state.rounds.reduce(
    (n, list) => n + list.filter((e) => e.b === who).length,
    0,
  );
}

function hasAnyScore() {
  return state.rounds.some((list) => list.length > 0);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function dateText(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/* ---------- Elements ---------- */

const $ = (id) => document.getElementById(id);

const els = {
  gameBtn: $('gameBtn'), gameName: $('gameName'), gameDate: $('gameDate'),
  tabPlay: $('tabPlay'), tabCard: $('tabCard'), settingsBtn: $('settingsBtn'),

  tTotal: $('tTotal'), tTotalSub: $('tTotalSub'),
  tBunco: $('tBunco'), tBuncoSub: $('tBuncoSub'),
  tRound: $('tRound'), tRoundSub: $('tRoundSub'),
  tProgress: $('tProgress'), tProgressSub: $('tProgressSub'),

  playView: $('playView'), cardView: $('cardView'),

  prevRound: $('prevRound'), nextRound: $('nextRound'),
  targetEyebrow: $('targetEyebrow'), targetDie: $('targetDie'), targetWord: $('targetWord'),

  btn1: $('btn1'), btn2: $('btn2'), btn5: $('btn5'),
  sub1: $('sub1'), sub2: $('sub2'),
  btnBuncoMe: $('btnBuncoMe'), btnBuncoPartner: $('btnBuncoPartner'),

  undoBtn: $('undoBtn'), rolls: $('rolls'), rollsEmpty: $('rollsEmpty'),

  sets: $('sets'), cardTotal: $('cardTotal'),
  grandScore: $('grandScore'), grandBunco: $('grandBunco'), grandBuncoP: $('grandBuncoP'),

  toast: $('toast'), toastMsg: $('toastMsg'), toastAction: $('toastAction'),

  settingsOverlay: $('settingsOverlay'), settingsClose: $('settingsClose'),
  fGameName: $('fGameName'), fGameDate: $('fGameDate'),
  shareBtn: $('shareBtn'), endGameBtn: $('endGameBtn'),
  historyList: $('historyList'), historyEmpty: $('historyEmpty'),
  versionLine: $('versionLine'), offlineStatus: $('offlineStatus'),

  confirmOverlay: $('confirmOverlay'), confirmTitle: $('confirmTitle'),
  confirmBody: $('confirmBody'), confirmCancel: $('confirmCancel'), confirmOk: $('confirmOk'),
};

/* ---------- Dice ---------- */

function fillDie(el, face) {
  el.textContent = '';
  const cells = PIP_MAP[face] || [];
  for (let cell = 1; cell <= 9; cell++) {
    if (!cells.includes(cell)) continue;
    const pip = document.createElement('span');
    pip.className = 'pip';
    pip.style.gridArea = `${Math.ceil(cell / 3)} / ${((cell - 1) % 3) + 1}`;
    el.appendChild(pip);
  }
}

function dieEl(face, size = 'die-sm') {
  const el = document.createElement('span');
  el.className = `die ${size}`;
  el.setAttribute('aria-hidden', 'true');
  fillDie(el, face);
  return el;
}

/* ---------- Scoring ---------- */

function addRoll(pts, who = null) {
  currentRolls().push({ p: pts, b: who, t: Date.now() });
  save();
  renderAll();

  const label = who === 'me'
    ? 'BUNCO! 21 points — and one for you'
    : who === 'partner'
      ? 'Partner Bunco — 21 points, not your count'
      : `+${pts}`;
  showToast(label, undoLast);
}

function undoLast() {
  const list = currentRolls();
  if (!list.length) return;
  list.pop();
  save();
  renderAll();
  hideToast();
}

function goToRound(i) {
  state.roundIndex = clampRound(i);
  save();
  renderAll();
}

/* ---------- Render ---------- */

function renderHeader() {
  els.gameName.textContent = state.gameName || DEFAULTS.gameName;
  els.gameDate.textContent = dateText(state.gameDate);

  const mine = buncoCount('me');
  const theirs = buncoCount('partner');
  const rolls = currentRolls();

  els.tTotal.textContent = grandTotal();
  els.tTotalSub.textContent = 'you & your partner';

  els.tBunco.textContent = mine;
  els.tBuncoSub.textContent = `partner: ${theirs}`;

  els.tRound.textContent = sumPts(rolls);
  els.tRoundSub.textContent = rolls.length
    ? plural(rolls.length, 'roll scored', 'rolls scored')
    : 'no rolls scored yet';

  els.tProgress.innerHTML = `${state.roundIndex + 1}<span class="of">/${TOTAL_ROUNDS}</span>`;
  els.tProgressSub.textContent = `Set ${setOf(state.roundIndex)} of ${SETS}`;
}

function renderTarget() {
  const i = state.roundIndex;
  const target = targetOf(i);

  els.targetEyebrow.textContent = `Set ${setOf(i)} · Round ${target} of ${ROUNDS_PER_SET}`;
  fillDie(els.targetDie, target);
  els.targetWord.textContent = `Rolling for ${NUMBER_WORDS[target - 1]}`;

  els.sub1.textContent = `one ${target}`;
  els.sub2.textContent = `two ${NUMBER_WORDS[target - 1]}`;

  els.prevRound.disabled = i === 0;
  els.nextRound.disabled = i === TOTAL_ROUNDS - 1;
}

function renderRolls() {
  const list = currentRolls();
  els.rolls.textContent = '';
  els.rollsEmpty.hidden = list.length > 0;
  els.undoBtn.disabled = list.length === 0;

  for (const e of list) {
    const li = document.createElement('li');
    if (e.b === 'me') li.className = 'bme';
    else if (e.b === 'partner') li.className = 'bpartner';
    else if (e.p === MINI_PTS) li.className = 'p5';

    const pts = document.createElement('span');
    pts.textContent = `+${e.p}`;
    li.appendChild(pts);

    if (e.b) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = e.b === 'me' ? 'you' : 'partner';
      li.appendChild(who);
    }
    els.rolls.appendChild(li);
  }
}

function renderCard() {
  els.sets.textContent = '';

  for (let s = 1; s <= SETS; s++) {
    const block = document.createElement('div');
    block.className = 'setblock';

    const h = document.createElement('h3');
    h.textContent = `Set ${s}`;
    block.appendChild(h);

    const ul = document.createElement('ul');
    ul.className = 'setrows';

    for (let r = 0; r < ROUNDS_PER_SET; r++) {
      const i = (s - 1) * ROUNDS_PER_SET + r;
      const list = state.rounds[i];
      const pts = sumPts(list);

      const li = document.createElement('li');
      if (i === state.roundIndex) li.classList.add('current');

      const main = document.createElement('div');
      main.className = 'row-main';
      main.appendChild(dieEl(targetOf(i)));

      const marks = document.createElement('div');
      marks.className = 'row-marks';
      for (const e of list) {
        if (!e.b) continue;
        const m = document.createElement('span');
        m.className = `mark ${e.b}`;
        m.textContent = e.b === 'me' ? 'BUNCO' : '21';
        marks.appendChild(m);
      }
      main.appendChild(marks);
      li.appendChild(main);

      const p = document.createElement('span');
      p.className = pts ? 'row-pts' : 'row-pts zero';
      p.textContent = pts;
      li.appendChild(p);

      /* Jumping to a round from the card is quicker than arrowing across a
       * whole set when someone realises a round back was mis-tapped. */
      li.addEventListener('click', () => { goToRound(i); setView('play'); });

      ul.appendChild(li);
    }

    const sub = document.createElement('li');
    sub.className = 'subtotal';
    const subLabel = document.createElement('span');
    subLabel.textContent = `Set ${s} total`;
    const subVal = document.createElement('span');
    subVal.textContent = setTotal(s);
    sub.append(subLabel, subVal);
    ul.appendChild(sub);

    block.appendChild(ul);
    els.sets.appendChild(block);
  }

  els.cardTotal.textContent = grandTotal();
  els.grandScore.textContent = grandTotal();
  els.grandBunco.textContent = buncoCount('me');
  els.grandBuncoP.textContent = buncoCount('partner');
}

function setView(next) {
  view = next;
  els.playView.hidden = next !== 'play';
  els.cardView.hidden = next !== 'card';
  els.tabPlay.setAttribute('aria-selected', String(next === 'play'));
  els.tabCard.setAttribute('aria-selected', String(next === 'card'));
  if (next === 'card') renderCard();
}

function renderAll() {
  renderHeader();
  renderTarget();
  renderRolls();
  if (view === 'card') renderCard();
}

/* ---------- Toast ---------- */

function showToast(msg, action) {
  clearTimeout(toastTimer);
  els.toastMsg.textContent = msg;
  els.toastAction.hidden = !action;
  els.toastAction.onclick = action || null;
  els.toast.hidden = false;
  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
  els.toastAction.onclick = null;
}

/* ---------- Confirm ---------- */

function askConfirm(title, body, onOk) {
  els.confirmTitle.textContent = title;
  els.confirmBody.textContent = body;
  confirmAction = onOk;
  els.confirmOverlay.hidden = false;
}

function closeConfirm() {
  els.confirmOverlay.hidden = true;
  confirmAction = null;
}

/* ---------- Summary & sharing ---------- */

function summaryText(snapshot = state) {
  const rounds = snapshot.rounds;
  const total = rounds.reduce((n, l) => n + sumPts(l), 0);
  const mine = rounds.reduce((n, l) => n + l.filter((e) => e.b === 'me').length, 0);
  const theirs = rounds.reduce((n, l) => n + l.filter((e) => e.b === 'partner').length, 0);

  const lines = [
    `${snapshot.gameName || DEFAULTS.gameName} — ${dateText(snapshot.gameDate)}`,
    '',
    `Total score: ${total}`,
    `Your Buncos: ${mine}`,
    `Partner's 21s (not yours): ${theirs}`,
    '',
  ];

  for (let s = 1; s <= SETS; s++) {
    const per = [];
    let st = 0;
    for (let r = 0; r < ROUNDS_PER_SET; r++) {
      const pts = sumPts(rounds[(s - 1) * ROUNDS_PER_SET + r]);
      st += pts;
      per.push(String(pts).padStart(3));
    }
    lines.push(`Set ${s}:${per.join('')}   = ${st}`);
  }

  lines.push('', 'Rounds run 1-2-3-4-5-6 within each set.');
  return lines.join('\n');
}

async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // user tapped Cancel
      console.warn('Share failed, falling back to clipboard.', err);
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Summary copied to the clipboard', null);
  } catch {
    window.prompt('Copy the summary:', text);
  }
}

/* ---------- End of game ---------- */

function endGame() {
  if (hasAnyScore()) {
    const history = loadHistory();
    history.unshift({
      id: `${state.gameDate}-${Date.now()}`,
      archivedAt: Date.now(),
      gameName: state.gameName,
      gameDate: state.gameDate,
      rounds: state.rounds,
    });
    saveHistory(history);
  }

  const keptName = state.gameName;
  state = blankState();
  state.gameName = keptName;
  save();
  setView('play');
  renderAll();
  renderHistory();
  showToast('New card started', null);
}

function renderHistory() {
  const history = loadHistory();
  els.historyList.textContent = '';
  els.historyEmpty.hidden = history.length > 0;

  for (const game of history) {
    const rounds = normalizeRoundsOf(game);
    const total = rounds.reduce((n, l) => n + sumPts(l), 0);
    const mine = rounds.reduce((n, l) => n + l.filter((e) => e.b === 'me').length, 0);

    const li = document.createElement('li');

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.textContent = game.gameName || DEFAULTS.gameName;
    const when = document.createElement('div');
    when.className = 'h-when';
    when.textContent = dateText(game.gameDate);
    left.append(name, when);

    const stats = document.createElement('span');
    stats.className = 'h-stats';
    stats.textContent = `${total} pts · ${plural(mine, 'Bunco', 'Buncos')}`;

    li.append(left, stats);
    li.addEventListener('click', () => {
      shareText(
        `${game.gameName || DEFAULTS.gameName} — ${dateText(game.gameDate)}`,
        summaryText({ ...game, rounds }),
      );
    });

    els.historyList.appendChild(li);
  }
}

function normalizeRoundsOf(game) {
  return normalizeRounds(game && game.rounds);
}

/* ---------- Offline readiness ---------- */

/* Answers "will this work at the table if the wifi drops?" without having to
 * find out the hard way. Reports only what is actually in the cache now. */
const OFFLINE_ASSETS = ['index.html', 'styles.css', 'app.js'];

async function checkOffline() {
  const el = els.offlineStatus;
  el.className = 'offline';

  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    el.textContent = 'This browser can’t store the app for offline use. Add it to the Home Screen from Safari.';
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const cache = await caches.open(`bunco-v${APP_VERSION}`);
    const missing = [];
    for (const path of OFFLINE_ASSETS) {
      const hit = await cache.match(new URL(path, location.href).href);
      if (!hit) missing.push(path);
    }

    if (reg && reg.active && missing.length === 0) {
      el.textContent = 'Ready to work offline — no internet needed at the table.';
    } else {
      el.textContent = 'Not saved for offline use yet. Stay on wifi and reopen the app once.';
    }
  } catch (err) {
    console.warn('Could not check offline readiness.', err);
    el.textContent = 'Could not check offline readiness.';
  }
}

/* ---------- Settings ---------- */

function openSettings() {
  els.fGameName.value = state.gameName;
  els.fGameDate.value = state.gameDate;
  renderHistory();
  els.versionLine.textContent = `Version ${APP_VERSION}`;
  els.settingsOverlay.hidden = false;
  checkOffline();
}

function closeSettings() {
  const name = els.fGameName.value.trim();
  state.gameName = name || DEFAULTS.gameName;
  if (els.fGameDate.value) state.gameDate = els.fGameDate.value;
  save();
  renderAll();
  els.settingsOverlay.hidden = true;
}

/* ---------- Wiring ---------- */

els.btn1.addEventListener('click', () => addRoll(1));
els.btn2.addEventListener('click', () => addRoll(2));
els.btn5.addEventListener('click', () => addRoll(MINI_PTS));
els.btnBuncoMe.addEventListener('click', () => addRoll(BUNCO_PTS, 'me'));
els.btnBuncoPartner.addEventListener('click', () => addRoll(BUNCO_PTS, 'partner'));

els.undoBtn.addEventListener('click', undoLast);

els.prevRound.addEventListener('click', () => goToRound(state.roundIndex - 1));
els.nextRound.addEventListener('click', () => goToRound(state.roundIndex + 1));

els.tabPlay.addEventListener('click', () => setView('play'));
els.tabCard.addEventListener('click', () => setView('card'));

els.gameBtn.addEventListener('click', openSettings);
els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === els.settingsOverlay) closeSettings();
});

els.shareBtn.addEventListener('click', () => {
  shareText(`${state.gameName} — ${dateText(state.gameDate)}`, summaryText());
});

els.endGameBtn.addEventListener('click', () => {
  askConfirm(
    'End game and start fresh?',
    hasAnyScore()
      ? 'This card is saved to Past games first, then cleared back to Set 1, Round 1.'
      : 'Nothing has been scored yet, so this just resets to Set 1, Round 1.',
    () => { endGame(); els.settingsOverlay.hidden = true; },
  );
});

els.confirmCancel.addEventListener('click', closeConfirm);
els.confirmOk.addEventListener('click', () => {
  const action = confirmAction;
  closeConfirm();
  if (action) action();
});
els.confirmOverlay.addEventListener('click', (e) => {
  if (e.target === els.confirmOverlay) closeConfirm();
});

/* A card left open overnight should still show what was saved, and a second
 * tab or a Home Screen relaunch should not resurrect a stale copy. */
window.addEventListener('pageshow', () => { state = load(); renderAll(); });

setView('play');
renderAll();

/* An outgoing worker keeps answering requests while its replacement installs,
 * and writes what it answers into its own cache as it goes — so the old cache
 * can outlive the activate meant to delete it, and sit there for good. This
 * runs from the page instead, once the new worker is the one in charge and no
 * such writes are still in flight. */
async function sweepStaleCaches() {
  if (!('caches' in window)) return;
  const keep = `bunco-v${APP_VERSION}`;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('bunco-') && k !== keep).map((k) => caches.delete(k)),
    );
  } catch (err) {
    console.warn('Could not tidy old caches.', err);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      /* updateViaCache 'none' stops the browser serving sw.js out of its own
       * HTTP cache. GitHub Pages sets a max-age on it, which otherwise hides a
       * new version for as long as that lasts — the app looks updated on the
       * server and stays stale on the phone. */
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      reg.update().catch(() => {});
      await sweepStaleCaches();
    } catch (err) {
      console.warn('Offline support unavailable.', err);
    }
  });
}
