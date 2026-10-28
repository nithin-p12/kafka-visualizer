import { Stage, Cancelled } from './scene.js';
import { Player } from './player.js';
import { LESSONS, LEVELS, lesson as lessonById, titleOf } from './lessons/index.js';

const $ = id => document.getElementById(id);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const esc = str => String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const progress = read('kafka-learn-progress', { done: [], quiz: {} });
progress.modes ??= {};
const MODE_NAMES = { watch: 'Watch', try: 'Try it', deeper: 'Go deeper' };
const ICONS = {
  watch: '<svg viewBox="0 0 16 16"><path d="M5 3.2v9.6l7.6-4.8z" fill="currentColor"/></svg>',
  try: '<svg viewBox="0 0 16 16"><path d="M4 2.2l8.6 5.3-3.7.9 2.2 4.2-1.7.9-2.2-4.2L4.4 12z" fill="currentColor"/></svg>',
  deeper: '<svg viewBox="0 0 16 16"><path d="M8 2.2l6 3-6 3-6-3zM2 8.2l6 3 6-3M2 11.2l6 3 6-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  recap: '<svg viewBox="0 0 16 16"><path d="M2.6 4.6l1.4 1.4 2.6-2.8M2.6 10.6l1.4 1.4 2.6-2.8M9 4.8h5M9 10.8h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const icon = name => `<i class="ico">${ICONS[name]}</i>`;
for (const i of document.querySelectorAll('[data-icon]')) i.innerHTML = ICONS[i.dataset.icon];
const stage = new Stage($('stage'));
let pausedByRecap = false, current = null, mode = 'watch', guideOn = read('kafka-learn-guide', true), tryState = null;

const player = new Player(stage, {
  step(i, step) { renderStep(i, step); },
  settled(i, step, v) { if (guideOn && step.focus) spotlight(step.focus(v)); },
  hold(t) { $('hold-bar').style.width = `${t * 100}%`; },
  state: renderPlayState,
  done() {
    if (mode === 'watch' && !progress.done.includes(current.id)) progress.done.push(current.id);
    markVisited(mode);
    showRecap(true);
  },
});

// ---------- guide ----------
// Spotlight rings in the SVG, plus the "watch for" callout placed beside them inside the stage.
function spotlight(nodes) {
  stage.spotlight(nodes);
  placeCallout();
}
function placeCallout() {
  const c = $('callout'), rings = [...stage.fx.children];
  if (!guideOn || !rings.length || !$('g-observe').textContent || !$('recap').hidden) { c.hidden = true; return; }
  c.hidden = false;
  const wrap = $('stage-wrap').getBoundingClientRect(), boxes = rings.map(r => r.getBoundingClientRect());
  const r = { left: Math.min(...boxes.map(b => b.left)) - wrap.left, top: Math.min(...boxes.map(b => b.top)) - wrap.top, right: Math.max(...boxes.map(b => b.right)) - wrap.left, bottom: Math.max(...boxes.map(b => b.bottom)) - wrap.top };
  const w = c.offsetWidth, h = c.offsetHeight, gap = 10, m = 8, top = 44, cx = (r.left + r.right - w) / 2, cy = (r.top + r.bottom - h) / 2;
  const clamp = ([x, y]) => [Math.max(m, Math.min(x, wrap.width - w - m)), Math.max(top, Math.min(y, wrap.height - h - m))];
  // Candidate spots around the spotlight, in order of preference; pick the one covering the least of the scene.
  const options = [[cx, r.bottom + gap], [cx, r.top - gap - h], [r.right + gap, cy], [r.left - gap - w, cy],
    [r.left, r.bottom + gap], [r.right - w, r.bottom + gap], [r.left, r.top - gap - h], [r.right - w, r.top - gap - h],
    [r.right + gap, r.top], [r.right + gap, r.bottom - h], [r.left - gap - w, r.top], [r.left - gap - w, r.bottom - h]].map(clamp);
  const content = [...stage.root.querySelectorAll('text, rect, line')].filter(n => +(n.closest('[opacity]')?.getAttribute('opacity') ?? 1) > .2)
    .map(n => { const b = n.getBoundingClientRect(); return { l: b.left - wrap.left, t: b.top - wrap.top, r: b.right - wrap.left, b: b.bottom - wrap.top, k: n.tagName === 'text' ? 4 : 1 }; });
  const overlap = (x, y, a) => Math.max(0, Math.min(x + w, a.r) - Math.max(x, a.l)) * Math.max(0, Math.min(y + h, a.b) - Math.max(y, a.t));
  const cost = ([x, y]) => content.reduce((sum, a) => sum + overlap(x, y, a) * a.k, 0) + overlap(x, y, { l: r.left, t: r.top, r: r.right, b: r.bottom }) * 4;
  let best = options[0], bestCost = Infinity;
  for (const o of options) { const k = cost(o); if (k < bestCost - 1) { best = o; bestCost = k; } }
  c.style.left = `${best[0]}px`; c.style.top = `${best[1]}px`;
}
new ResizeObserver(placeCallout).observe($('stage-wrap'));
function clearSpotlight() { stage.clearSpotlight(); $('callout').hidden = true; }

function setGuide(on) {
  guideOn = on; save('kafka-learn-guide', on);
  $('guide-toggle').checked = on;
  $('guide-btn').classList.toggle('selected', on);
  $('guide-btn').setAttribute('aria-pressed', on);
  document.body.classList.toggle('guide-off', !on);
  if (!on) clearSpotlight();
  else if (current && mode !== 'try' && player.phase !== 'running' && player.v) { const s = current[mode === 'deeper' ? 'deeper' : 'watch'].steps[player.i]; if (s?.focus) spotlight(s.focus(player.v)); }
}
$('guide-toggle').addEventListener('change', e => setGuide(e.target.checked));
$('guide-btn').addEventListener('click', () => setGuide(!guideOn));

// ---------- full screen (always in focus layout) ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('lesson-view').requestFullscreen?.().catch(() => {});
}
$('full-btn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle('focus', on);
  $('full-btn').textContent = on ? '✕ Exit full screen' : '⛶ Full screen';
  $('full-btn').title = on ? 'Exit full screen (Esc or F)' : 'Full screen (F)';
});

// ---------- map ----------
const LEVEL_TONE = { atoms: 'lv-atoms', links: 'lv-links', e2e: 'lv-e2e', deep: 'lv-deep' };
function renderMap() {
  const ready = new Set(LESSONS.map(l => l.id));
  const nextUp = LESSONS.find(l => !progress.done.includes(l.id));
  const doneCount = LESSONS.filter(l => progress.done.includes(l.id)).length;
  $('map-progress').textContent = `${doneCount} of ${LESSONS.length} available lessons watched`;
  $('map-bar').style.width = `${doneCount / LESSONS.length * 100}%`;
  renderContinue(nextUp);
  const levels = LEVELS.map(level => {
    const [chip, name] = level.title.split(' · ');
    const items = level.items.map(item => typeof item === 'string' ? lessonById(item) : item);
    return { ...level, chip, name, items, readyCount: items.filter(l => ready.has(l.id)).length };
  });
  $('level-nav').innerHTML = levels.map(lv => `<button class="level-pill ${LEVEL_TONE[lv.id]}" data-target="level-${lv.id}">${esc(lv.name)} <small>${lv.readyCount}/${lv.items.length}</small></button>`).join('');
  for (const b of $('level-nav').children) b.addEventListener('click', () => $(b.dataset.target).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  let n = 0;
  $('levels').innerHTML = levels.map(lv => `
    <section class="level ${LEVEL_TONE[lv.id]}" id="level-${lv.id}">
      <header><span class="lv-chip">${esc(lv.chip)}</span><h2>${esc(lv.name)}</h2><p>${esc(lv.blurb)}</p><span class="count">${lv.readyCount ? `${lv.readyCount} ready · ` : ''}${lv.items.length} lesson${lv.items.length === 1 ? '' : 's'}</span></header>
      <ol class="cards">${lv.items.map(l => {
        const isReady = ready.has(l.id), done = progress.done.includes(l.id), inProgress = !done && progress.last?.id === l.id;
        n++;
        const badge = done ? '<span class="badge done">✓ Watched</span>' : inProgress ? '<span class="badge progress">In progress</span>' : l === nextUp ? '<span class="badge next">Start here</span>' : isReady ? '<span class="badge">Ready</span>' : '<span class="badge soon">Coming soon</span>';
        const body = `<span class="num">${done ? '✓' : n}</span><strong>${esc(l.title)}</strong><span class="tag">${esc(l.tagline)}</span>${badge}`;
        return `<li>${isReady ? `<a class="card ${done ? 'is-done' : ''} ${l === nextUp ? 'is-next' : ''}" href="#/${l.id}" data-lesson="${l.id}">${body}</a>` : `<div class="card is-soon" aria-disabled="true">${body}</div>`}</li>`;
      }).join('')}</ol>
    </section>`).join('');
  document.documentElement.style.setProperty('--bar-h', `${document.querySelector('.learn-bar').offsetHeight}px`);
  markActiveLevel();
}
// "Continue where you left off": the last lesson, part and step you were on; otherwise the next lesson to start.
function renderContinue(nextUp) {
  const last = progress.last, l = last && lessonById(last.id), c = $('continue');
  if (l) {
    const track = last.mode === 'deeper' ? l.deeper : l.watch, total = track.steps.length, step = Math.min(last.step ?? 0, total - 1);
    const where = last.mode === 'try' ? 'Try it' : `${MODE_NAMES[last.mode] ?? 'Watch'} · step ${step + 1} of ${total}`;
    c.href = `#/${l.id}/${last.mode}/${last.mode === 'try' ? 0 : step}`;
    c.innerHTML = `<span class="eyebrow">Continue where you left off</span><strong>${l.n} · ${esc(l.title)}</strong><small>${esc(where)}</small>`
      + `<span class="bar"><span style="width:${last.mode === 'try' ? 100 : (step + 1) / total * 100}%"></span></span><span class="go">Continue →</span>`;
  } else {
    const start = nextUp ?? LESSONS[0];
    c.href = `#/${start.id}`;
    c.innerHTML = `<span class="eyebrow">${nextUp ? 'Start here' : 'All lessons watched'}</span><strong>${start.n} · ${esc(start.title)}</strong><small>${esc(start.tagline)}</small><span class="go">${nextUp ? 'Start →' : 'Replay →'}</span>`;
  }
}
function markActiveLevel() {
  if ($('map-view').hidden) return;
  const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 61) + 80;
  let active = null;
  for (const sec of document.querySelectorAll('.level')) if (sec.getBoundingClientRect().top <= line) active = sec.id;
  active ??= document.querySelector('.level')?.id;
  for (const b of $('level-nav').children) b.classList.toggle('active', b.dataset.target === active);
}
addEventListener('scroll', markActiveLevel, { passive: true });

// ---------- lesson ----------
function openLesson(l, resume = {}) {
  current = l;
  $('lesson-num').textContent = l.n;
  $('lesson-title').textContent = l.title;
  $('lesson-tagline').textContent = l.tagline;
  $('g-what').textContent = l.guide.what;
  $('g-fits').textContent = $('recap-fits').textContent = l.guide.fits;
  $('recap-title').textContent = `${l.n} · ${l.title}`;
  $('takeaway').textContent = l.takeaway;
  $('recap-points').innerHTML = (l.recap?.points ?? []).map(p => `<li>${esc(p)}</li>`).join('');
  $('interview-panel').hidden = !l.recap?.interview;
  $('recap-grid').classList.toggle('no-interview', !l.recap?.interview);
  $('interview').innerHTML = (l.recap?.interview ?? []).map((x, k) => `<details${k ? '' : ' open'}><summary>${esc(x.q)}</summary><div class="answer">${esc(x.a).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div></details>`).join('');
  for (const d of $('interview').children) d.addEventListener('toggle', () => { if (d.open) for (const o of $('interview').children) if (o !== d) o.open = false; });
  renderQuiz();
  const i = LESSONS.indexOf(l);
  $('related').innerHTML = l.related.map(id => lessonById(id) ? `<a href="#/${id}">${esc(titleOf(id))}</a>` : '').join('');
  arrow($('prev-lesson'), LESSONS[i - 1], 'Previous');
  arrow($('next-lesson'), LESSONS[i + 1], 'Next');
  setMode(['watch', 'try', 'deeper'].includes(resume.mode) ? resume.mode : 'watch', resume.step);
  document.title = `${l.title} · Learn Kafka`;
}
function arrow(a, l, dir) {
  a.classList.toggle('disabled', !l);
  a.href = l ? `#/${l.id}` : '#/';
  a.title = l ? `${dir} topic: ${l.n} · ${l.title} (Shift+${dir === 'Next' ? '→' : '←'})` : `No ${dir.toLowerCase()} topic yet`;
  a.setAttribute('aria-disabled', !l);
}
const visited = () => progress.modes[current.id] ?? [];
function markVisited(m) {
  if (!visited().includes(m)) progress.modes[current.id] = [...visited(), m];
  save('kafka-learn-progress', progress);
  renderTabs();
}
function renderTabs() {
  const recapOn = !$('recap').hidden;
  for (const b of document.querySelectorAll('.modes [data-mode]')) {
    const on = recapOn ? b.dataset.mode === 'recap' : b.dataset.mode === mode;
    b.classList.toggle('selected', on);
    b.classList.toggle('visited', visited().includes(b.dataset.mode));
    b.setAttribute('aria-current', on ? 'step' : 'false');
  }
}
function setMode(m, step = 0) {
  if (m === 'recap') return showRecap(true);
  mode = m;
  pausedByRecap = false;
  $('player-ui').hidden = m === 'try';
  $('try-panel').hidden = m !== 'try';
  $('deeper-note').hidden = m !== 'deeper';
  showRecap(false);
  renderPlayState();
  window.scrollTo(0, 0);
  if (m === 'try') return openTry();
  tryState = null;
  const track = m === 'deeper' ? current.deeper : current.watch;
  $('deeper-text').textContent = current.deeper.note;
  renderDots(track.steps);
  player.load(track);
  if (step > 0) player.seek(step);
}
for (const b of document.querySelectorAll('.modes [data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));

// The recap is the lesson's hub: takeaway, interview answers, quick check, and the path to every other part.
function showRecap(on) {
  $('recap').hidden = !on;
  $('lesson-view').classList.toggle('recap-open', on);
  $('recap-dot')?.classList.toggle('current', on);
  $('recap-back').textContent = MODE_NAMES[mode];
  renderTabs();
  if (on) { $('callout').hidden = true; renderPath(); if (mode !== 'try' && player.phase !== 'done' && !player.userPaused) { player.pause(); pausedByRecap = true; } }
  else { placeCallout(); if (pausedByRecap && mode !== 'try' && player.userPaused) player.play(); pausedByRecap = false; }
  renderPlayState();
}
// Suggested order: Watch › Try it › Go deeper › next topic. Every card works at any time.
function renderPath() {
  const seen = visited(), next = LESSONS[LESSONS.indexOf(current) + 1];
  const upNext = ['watch', 'try', 'deeper'].find(m => !seen.includes(m)) ?? 'next';
  const steps = [
    { go: 'watch', n: icon('watch'), title: 'Watch', sub: 'The animated walkthrough' },
    { go: 'try', n: icon('try'), title: 'Try it', sub: 'Same scene, you press the buttons' },
    { go: 'deeper', n: icon('deeper'), title: 'Go deeper', sub: `Optional · ${current.deeper.note}` },
    { go: 'next', n: next ? next.n : '✓', title: next ? `Next: ${next.title}` : 'Back to the map', sub: next ? next.tagline : 'More lessons are coming' },
  ];
  $('path').innerHTML = steps.map(st => {
    const done = seen.includes(st.go), cls = [`tone-${st.go}`, done && 'done', st.go === upNext && 'up-next', st.go === mode && 'current'].filter(Boolean).join(' ');
    const state = st.go === upNext ? 'Up next' : done ? (st.go === mode ? '✓ Just done' : '✓ Done') : '';
    const body = `<span class="n">${done ? '✓' : st.n}</span><b>${esc(st.title)}</b><small>${esc(st.sub)}</small>${state ? `<span class="state">${state}</span>` : ''}`;
    return st.go === 'next'
      ? `<a class="path-step ${cls}" id="go-next" href="#/${next?.id ?? ''}">${body}</a>`
      : `<button class="path-step ${cls}" id="go-${st.go}" data-go="${st.go}">${body}</button>`;
  }).join('');
  for (const b of $('path').querySelectorAll('[data-go]')) b.addEventListener('click', () => setMode(b.dataset.go));
}
$('recap-close').addEventListener('click', () => showRecap(false));
$('try-recap').addEventListener('click', () => showRecap(true));

function renderDots(steps) {
  $('dots').innerHTML = steps.map((s, i) => `<button class="dot" data-step="${i}" title="${esc(s.title)}" aria-label="Step ${i + 1}: ${esc(s.title)}"></button>`).join('')
    + '<button class="dot recap-dot" id="recap-dot" title="Recap and quick check" aria-label="Recap and quick check">✓ Recap</button>';
  for (const d of $('dots').querySelectorAll('[data-step]')) d.addEventListener('click', () => player.seek(+d.dataset.step));
  $('recap-dot').addEventListener('click', () => showRecap(true));
}
function renderStep(i, step) {
  const steps = player.track.steps;
  progress.last = { id: current.id, mode, step: i };
  save('kafka-learn-progress', progress);
  showRecap(false);
  clearSpotlight();
  $('step-count').textContent = `${mode === 'deeper' ? 'Deep dive · ' : ''}Step ${i + 1} of ${steps.length}`;
  $('step-title').textContent = step.title;
  $('step-text').textContent = step.text;
  $('g-observe').textContent = step.observe ?? '';
  $('g-next').textContent = steps[i + 1] ? steps[i + 1].title : 'Recap';
  $('hold-bar').style.width = '0';
  $('dots').querySelectorAll('[data-step]').forEach((d, k) => { d.classList.toggle('current', k === i); d.classList.toggle('seen', k < i); });
  $('prev-step').disabled = i === 0;
  $('next-step').disabled = i === steps.length - 1;
  renderPlayState();
}
function renderPlayState() {
  const b = $('play'), p = player.phase;
  b.textContent = p === 'done' ? '↻ Replay' : p === 'waiting' ? '▶ Continue' : player.userPaused ? '▶ Play' : '⏸ Pause';
  $('stage-wrap').classList.toggle('paused', mode !== 'try' && player.userPaused && p !== 'done' && $('recap').hidden);
}
$('play').addEventListener('click', () => player.toggle());
$('prev-step').addEventListener('click', () => player.prev());
$('next-step').addEventListener('click', () => player.next());
$('replay').addEventListener('click', () => player.seek(0));

const speed = read('kafka-learn-speed', 1);
function setSpeed(x) {
  player.setSpeed(x); save('kafka-learn-speed', x);
  for (const b of $('speed').children) b.classList.toggle('selected', +b.dataset.speed === x);
}
for (const b of $('speed').children) b.addEventListener('click', () => setSpeed(+b.dataset.speed));
setSpeed(speed);

// ---------- try it ----------
function openTry() {
  player.stop();
  progress.last = { id: current.id, mode: 'try', step: 0 };
  save('kafka-learn-progress', progress);
  clearSpotlight();
  const t = current.tryIt, input = {};
  for (const c of t.controls) if (c.type === 'choice') input[c.name] = c.options[0];
  $('g-observe').textContent = t.observe;
  $('try-intro').textContent = t.intro;
  $('try-controls').innerHTML = t.controls.map((c, i) => c.type === 'choice'
    ? `<div class="choice" role="group" aria-label="${esc(c.label)}"><span>${esc(c.label)}</span>${c.options.map(o => `<button data-choice="${i}" data-value="${esc(o)}" class="${o === input[c.name] ? 'selected' : ''}">${esc(o)}</button>`).join('')}</div>`
    : `<button data-action="${i}" class="${c.primary ? 'primary' : ''}">${esc(c.label)}</button>`).join('');
  tryState = { input, token: {}, busy: false };
  buildTry();
  for (const b of $('try-controls').querySelectorAll('[data-choice]')) b.addEventListener('click', () => {
    const c = t.controls[b.dataset.choice];
    input[c.name] = b.dataset.value;
    for (const o of b.parentElement.querySelectorAll('button')) o.classList.toggle('selected', o === b);
    if (c.rebuild) buildTry();
  });
  for (const b of $('try-controls').querySelectorAll('[data-action]')) b.addEventListener('click', () => runAction(t.controls[b.dataset.action], b));
}
function buildTry() {
  const t = current.tryIt;
  stage.reset();
  stage.clock.paused = false;
  tryState.token = {};
  tryState.v = t.build(stage, tryState.input);
  for (const b of $('try-controls').querySelectorAll('[data-action]')) b.disabled = false;
  $('try-readout').innerHTML = t.readout(tryState.v);
}
async function runAction(c, button) {
  if (tryState.busy) return;
  const { token, v } = tryState, t = current.tryIt;
  tryState.busy = true;
  const buttons = $('try-controls').querySelectorAll('[data-action]');
  buttons.forEach(b => b.disabled = true);
  markVisited('try');
  try { await t[c.run](stage, v, tryState.input); }
  catch (e) { if (!(e instanceof Cancelled)) throw e; }
  finally {
    if (tryState?.token === token) {
      tryState.busy = false;
      buttons.forEach(b => b.disabled = false);
      if (c.once) button.disabled = true;
      $('try-readout').innerHTML = t.readout(v);
    }
  }
}

// ---------- quiz ----------
function renderQuiz() {
  const q = current.quiz, prior = progress.quiz[current.id];
  $('quiz-q').textContent = q.q;
  $('quiz-why').hidden = true;
  $('quiz-options').innerHTML = q.options.map((o, i) => `<button data-option="${i}">${esc(o)}</button>`).join('');
  for (const b of $('quiz-options').children) b.addEventListener('click', () => answer(+b.dataset.option));
  if (prior != null) answer(prior, false);
}
function answer(i, record = true) {
  const q = current.quiz;
  [...$('quiz-options').children].forEach((b, k) => { b.classList.toggle('right', k === q.answer && i === q.answer); b.classList.toggle('wrong', k === i && i !== q.answer); });
  $('quiz-why').hidden = false;
  $('quiz-why').innerHTML = `<b>${i === q.answer ? '✓ Correct.' : '✕ Not quite.'}</b> ${esc(q.why)}`;
  if (i !== q.answer) $('quiz-why').innerHTML += ' <button id="quiz-retry">Try again</button>';
  $('quiz-retry')?.addEventListener('click', () => { delete progress.quiz[current.id]; save('kafka-learn-progress', progress); renderQuiz(); });
  if (record) { progress.quiz[current.id] = i; save('kafka-learn-progress', progress); }
}

// ---------- routing & keys ----------
function route() {
  // #/<lesson>[/<mode>/<step>] — the optional part resumes where you left off, then is dropped from the URL.
  const [id, resumeMode, resumeStep] = location.hash.replace(/^#\/?/, '').split('/'), l = lessonById(id);
  if (l && resumeMode) history.replaceState(null, '', `#/${id}`);
  $('map-view').hidden = !!l;
  $('lesson-view').hidden = !l;
  document.body.classList.toggle('lesson-mode', !!l);
  if (l) openLesson(l, { mode: resumeMode, step: +resumeStep || 0 });
  else { player.stop(); stage.reset(); current = null; renderMap(); document.title = 'Learn Kafka'; if (document.fullscreenElement) document.exitFullscreen(); }
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('keydown', e => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'f') return toggleFullscreen();
  if (k === 'g') return setGuide(!guideOn);
  if (k === 'r') return showRecap($('recap').hidden);
  if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const a = $(e.key === 'ArrowRight' ? 'next-lesson' : 'prev-lesson'); if (!a.classList.contains('disabled')) location.hash = a.getAttribute('href'); return; }
  if (e.key === 'Escape' && !document.fullscreenElement) { if (!$('recap').hidden) showRecap(false); return; }
  if (mode === 'try' || e.target.closest('button, a')) return;
  if (e.key === ' ') { e.preventDefault(); player.toggle(); }
  else if (e.key === 'ArrowRight') player.next();
  else if (e.key === 'ArrowLeft') player.prev();
});

setGuide(guideOn);
route();
window.kafkaLearn = { player, stage, progress, get mode() { return mode; }, get lesson() { return current?.id; }, get tryState() { return tryState; } };
