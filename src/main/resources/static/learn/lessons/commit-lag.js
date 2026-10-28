// Lesson 11: commit & lag, a group's bookmark per partition and how far behind it is.
import { el, place, PARTITION_COLORS as PC } from '../scene.js';
import { RED, GREEN, MUTED } from './kit.js';

const MONO = 'Consolas, monospace', BLUE = '#1677ff', ORANGE = '#c57416', PURPLE = '#9d4ccc', GREY = '#9aa3a9', SKIP = '#d3d8db';
const Y = 130, SLOT0 = 150, SLOT = 30, BLK = { w: 26, h: 26, size: 13 };
const slotX = i => SLOT0 + i * SLOT;

// A triangle marker with a label: above the lane pointing down (position) or below pointing up (committed).
function marker(s, x, y, above, color, label) {
  const g = s.g(x, y);
  el('path', { d: above ? 'M-8 -6H8L0 6Z' : 'M-8 6H8L0 -6Z', fill: color }, g);
  g.label = s.text(g, 0, above ? -18 : 18, label, { 'font-size': 13, 'font-weight': 650, fill: color });
  return g;
}
function consumerBox(s, x, y, name, sub, parent) {
  const c = s.box(x, y, 140, 64, name, { size: 16, sub, subSize: 13, parent });
  c.name = name;
  return c;
}
function setConsumer(c, state, sub) {
  const bad = state === 'down';
  c.rect.setAttribute('stroke', bad ? RED : '#babdbe');
  c.rect.setAttribute('fill', bad ? '#fff4f4' : '#fff');
  c.label.textContent = bad ? `✕ ${c.name.split(' ')[1] ?? ''} ${sub}`.replace('  ', ' ') : c.name;
  c.label.setAttribute('fill', bad ? RED : '#203347');
  if (!bad && sub) c.sub.textContent = sub;
}
function internalTopic(s, x, y, w, h) {
  const b = s.box(x, y, w, h, '', { stroke: GREEN, rx: 12 });
  s.text(b, 0, -h / 2 + 26, '__consumer_offsets', { 'font-size': 15, 'font-weight': 700, 'font-family': MONO, fill: GREEN });
  s.text(b, 0, -h / 2 + 48, 'internal topic', { 'font-size': 13, fill: MUTED });
  b.stored = s.text(b, 0, 12, 'no commit yet', { 'font-size': 15, 'font-weight': 650, 'font-family': MONO, fill: '#203347' });
  s.text(b, 0, h / 2 - 26, '(group, partition) → offset', { 'font-size': 13, fill: MUTED });
  return b;
}

// The shared scene: partition orders-0 with n records, position / committed markers and a metrics line.
function lane(s, v, n) {
  v.log = [];
  v.metrics = s.text(s.root, 343, 26, '', { 'font-size': 15, 'font-family': MONO, fill: '#614373' });
  v.lane = s.box(343, Y, 606, 56, '', { stroke: PC[0], rx: 8 });
  s.text(v.lane, -293, 0, 'orders-0', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': MONO, fill: PC[0] });
  for (let i = 0; i < n; i++) v.log.push(s.block(slotX(i), Y, `${i}`, PC[0], BLK));
  v.cursor = marker(s, slotX(0), Y - 42, true, BLUE, 'position');
  v.flag = marker(s, slotX(0), Y + 42, false, GREEN, 'committed');
  v.band = s.text(s.root, 343, 252, '', { 'font-size': 15, 'font-family': MONO, fill: '#3d4a55' });
}
function metrics(v) {
  const end = v.log.length;
  v.metrics.textContent = `log end ${end} · position ${v.position} · committed ${v.committed} · lag ${end - v.committed}`;
}
async function band(s, v, str, color = '#3d4a55') {
  v.band.textContent = str;
  v.band.setAttribute('fill', color);
  await s.show(v.band, 250);
}
async function produce(s, v, n) {
  for (let k = 0; k < n; k++) {
    const b = s.block(slotX(v.log.length), Y, `${v.log.length}`, PC[0], BLK);
    v.log.push(b);
    await s.pop(b, 170);
  }
  metrics(v);
}
// The owning consumer reads n records: each one flies down to it and the position moves on.
async function poll(s, v, n, color = PC[0]) {
  for (let k = 0; k < n; k++) {
    const i = v.position, c = v.owner;
    const [cx, cy] = [c._x + (c.parentNode._x ?? 0), c._y + (c.parentNode._y ?? 0)];
    const b = s.block(slotX(i), Y, `${i}`, color, BLK);
    await s.move(b, cx, cy, 400);
    b.remove();
    v.position++;
    await s.move(v.cursor, slotX(v.position), Y - 42, 150);
    metrics(v);
  }
}
async function commit(s, v, n, label = `commit ${n}`) {
  const c = v.owner, [cx, cy] = [c._x + (c.parentNode._x ?? 0), c._y + (c.parentNode._y ?? 0)];
  const p = s.box(cx, cy, 124, 28, label, { size: 13, fill: '#eef7e8', stroke: GREEN, color: GREEN, rx: 14 });
  await s.pop(p, 180);
  await s.move(p, v.internal._x, v.internal._y + 12, 600);
  p.remove();
  v.committed = n;
  v.internal.stored.textContent = `billing · orders-0 → ${n}`;
  await Promise.all([s.pulse(v.internal.stored), s.move(v.flag, slotX(n), Y + 42, 300)]);
  metrics(v);
}
async function crash(s, v) {
  const c = v.owner;
  setConsumer(c, 'down', 'crashed');
  await Promise.all([s.shake(c), s.fade(v.cursor, .15, 300)]);
  await s.wait(500);
  setConsumer(c, 'ok', 'restarted');
  v.position = v.committed;
  await Promise.all([s.fade(v.cursor, 1, 300), s.move(v.cursor, slotX(v.position), Y - 42, 450)]);
  metrics(v);
}

function watchScene(s) {
  const v = { position: 0, committed: 0 };
  lane(s, v, 8);
  v.group = s.box(210, 360, 340, 160, '', { stroke: '#d8b7e9', rx: 12, fill: '#fcfaff' });
  s.text(v.group, -158, -62, 'group billing', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: '#7a4aa3' });
  v.A = consumerBox(s, -85, 2, 'Consumer A', 'owns orders-0', v.group);
  v.B = consumerBox(s, 85, 2, 'Consumer B', 'idle', v.group);
  v.auto = s.text(v.group, 0, 58, '', { 'font-size': 13, 'font-weight': 650, fill: GREEN });
  v.internal = internalTopic(s, 515, 360, 230, 160);
  v.owner = v.A;
  v.metrics.textContent = 'log end 8 · nothing read yet';
  for (const n of [v.cursor, v.flag]) n.setAttribute('opacity', 0);
  return v;
}

// ---------- Try it ----------
const TY = 150, TX0 = 136, TD = 32, WIN = 23, PROD = [120, 370], CONS = [470, 370], STORE = [790, 370];
const tx = (v, i) => TX0 + Math.max(0, i - v.ws) * TD;

function tryScene(s) {
  const v = { logEnd: 6, position: 0, committed: 0, highest: 0, ws: 0, timer: 5, blocks: [], history: [] };
  v.lane = s.box(472, TY, 880, 56, '', { stroke: PC[0], rx: 8 });
  s.text(v.lane, -430, 0, 'orders-0', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': MONO, fill: PC[0] });
  s.note(472, 30, 'topic orders · partition 0 · group billing', { 'font-size': 16, 'font-weight': 650, fill: BLUE });
  for (let i = 0; i < v.logEnd; i++) v.blocks.push(Object.assign(s.block(tx(v, i), TY, `${i}`, PC[0], BLK), { i }));
  v.end = s.g(tx(v, v.logEnd), TY);
  el('rect', { x: -15, y: -15, width: 30, height: 30, rx: 3, fill: 'none', stroke: PURPLE, 'stroke-dasharray': '4 3' }, v.end);
  v.end.label = s.text(v.end, 0, -78, '', { 'font-size': 13, 'font-weight': 650, fill: PURPLE });
  v.cursor = marker(s, tx(v, 0), TY - 42, true, BLUE, '');
  v.flag = marker(s, tx(v, 0), TY + 42, false, GREEN, '');
  v.brace = el('path', { fill: 'none', stroke: PURPLE, 'stroke-width': 2 }, s.root);
  v.lagText = s.note(472, 256, '', { 'font-size': 17, 'font-weight': 700, fill: PURPLE });
  v.producer = s.box(...PROD, 180, 70, 'Producer', { size: 17, sub: 'writes', subSize: 13 });
  v.consumer = s.box(...CONS, 220, 70, 'Consumer', { size: 17, sub: 'group billing', subSize: 13 });
  v.consumer.name = 'Consumer';
  v.pill = s.note(CONS[0], 428, '', { 'font-size': 13, 'font-weight': 650, fill: GREEN });
  v.internal = internalTopic(s, ...STORE, 260, 130);
  v.internal.stored.textContent = 'billing · orders-0 → 0';
  labels(v);
  return v;
}
function labels(v) {
  const clip = i => (i < v.ws ? '‹ ' : '');
  v.cursor.label.textContent = `${clip(v.position)}position ${v.position}`;
  v.flag.label.textContent = `${clip(v.committed)}committed ${v.committed}`;
  v.end.label.textContent = `log end ${v.logEnd}`;
  const lag = v.logEnd - v.committed, x1 = tx(v, v.committed) - 14, x2 = tx(v, v.logEnd) - 18;
  v.brace.setAttribute('d', lag > 0 ? `M${x1} 222V230H${x2}V222` : '');
  v.lagText.textContent = `lag = log end − committed = ${v.logEnd} − ${v.committed} = ${lag}`;
}
// Slide the visible window so the newest records stay in view; markers follow.
function layout(s, v, ms = 300) {
  v.ws = Math.max(0, v.logEnd - WIN);
  const moves = [];
  v.blocks = v.blocks.filter(b => { if (b.i < v.ws) { b.remove(); return false; } return true; });
  for (const b of v.blocks) moves.push(s.move(b, tx(v, b.i), TY, ms));
  moves.push(s.move(v.end, tx(v, v.logEnd), TY, ms), s.move(v.cursor, tx(v, v.position), TY - 42, ms), s.move(v.flag, tx(v, v.committed), TY + 42, ms));
  labels(v);
  return Promise.all(moves).then(() => labels(v));
}
function pillText(v, input) {
  v.pill.textContent = input.auto === 'on' ? `auto-commit in ${v.timer} s` : 'auto-commit off';
  v.pill.setAttribute('fill', input.auto === 'on' ? GREEN : MUTED);
}
async function tryCommit(s, v, label) {
  const p = s.box(CONS[0], CONS[1], 140, 28, label, { size: 13, fill: '#eef7e8', stroke: GREEN, color: GREEN, rx: 14 });
  await s.pop(p, 150);
  await s.move(p, STORE[0], STORE[1] + 12, 450);
  p.remove();
  v.committed = v.position;
  v.internal.stored.textContent = `billing · orders-0 → ${v.committed}`;
  await layout(s, v, 250);
}
// One simulated second: the producer writes, the consumer reads, the auto-commit timer ticks.
async function tick(s, v, input) {
  const p = parseInt(input.prod, 10), c = parseInt(input.cons, 10), first = v.logEnd;
  v.logEnd += p;
  const shift = layout(s, v, 260);
  await Promise.all([shift, ...Array.from({ length: p }, async (_, k) => {
    await s.wait(k * 80);
    const b = Object.assign(s.block(PROD[0], PROD[1] - 36, `${first + k}`, GREY, BLK), { i: first + k });
    await s.move(b, tx(v, first + k), TY, 380);
    b.rect.setAttribute('fill', PC[0]);
    v.blocks.push(b);
  })]);
  const n = Math.min(c, v.logEnd - v.position), from = v.position;
  await Promise.all(Array.from({ length: n }, async (_, k) => {
    const i = from + k;
    await s.wait(k * 90);
    const b = s.block(tx(v, i), TY, `${i}`, i < v.highest ? ORANGE : PC[0], BLK);
    await s.move(b, CONS[0], CONS[1] - 30, 380);
    b.remove();
  }));
  v.position += n;
  v.highest = Math.max(v.highest, v.position);
  await layout(s, v, 180);
  if (input.auto === 'on') {
    v.timer--;
    if (v.timer === 0) { v.pill.textContent = 'auto-commit now'; await tryCommit(s, v, `auto-commit ${v.position}`); v.timer = 5; }
  }
  pillText(v, input);
}

// ---------- Go deeper ----------
function deeperScene(s) {
  const v = { position: 0, committed: 0 };
  lane(s, v, 12);
  v.owner = consumerBox(s, 130, 362, 'Consumer', 'group billing');
  v.internal = internalTopic(s, 500, 362, 240, 150);
  v.internal.stored.textContent = 'billing · orders-0 → 0';
  metrics(v);
  return v;
}
const CODE = [
  [0, 'try {'],
  [1, 'while (running) {'],
  [2, 'var records = consumer.poll(Duration.ofMillis(100));'],
  [2, 'process(records);'],
  [2, 'consumer.commitAsync();'],
  [1, '}'],
  [0, '} finally {'],
  [1, 'consumer.commitSync();'],
  [1, 'consumer.close();'],
  [0, '}'],
];

export default {
  id: 'commit-lag', n: 11, title: 'Commit & lag', tagline: 'Bookmarks and how far behind you are',
  guide: {
    what: 'A committed offset is a consumer group\'s bookmark in each partition: the next offset to read, saved inside Kafka. Lag is how far that bookmark is behind the newest record.',
    fits: 'Comes after consumer groups. Next: retention, when old records disappear (and what that means for a consumer that lags too far).',
  },
  watch: {
    build: watchScene,
    steps: [
      {
        title: 'A commit is the group\'s bookmark',
        text: 'Consumer A, in group billing, has read and processed offsets 0 to 4. It commits 5: the next offset to read. Kafka stores this bookmark in the internal topic __consumer_offsets, one entry per group and partition.',
        observe: 'The commit travels to __consumer_offsets and the green marker settles on 5.',
        focus: v => [v.flag, v.internal],
        async run(s, v) {
          await Promise.all([s.show(v.cursor, 250), s.show(v.flag, 250)]);
          metrics(v);
          await poll(s, v, 5);
          await commit(s, v, 5);
        },
      },
      {
        title: 'The bookmark outlives the consumer',
        text: 'Consumer A stops. The group hands orders-0 to Consumer B, which has never read it. B asks Kafka for the group\'s committed offset and starts at 5, so nothing is skipped. A restarted consumer does the same.',
        observe: 'B fetches 5 from __consumer_offsets and carries on from there.',
        focus: v => [v.B, v.cursor],
        async run(s, v) {
          setConsumer(v.A, 'down', 'stopped');
          v.A.sub.textContent = '';
          await Promise.all([s.shake(v.A), s.fade(v.cursor, .15, 300)]);
          v.B.sub.textContent = 'owns orders-0';
          await s.pulse(v.B);
          const p = s.box(v.internal._x, v.internal._y + 12, 124, 28, 'start at 5', { size: 13, fill: '#eef7e8', stroke: GREEN, color: GREEN, rx: 14 });
          await s.pop(p, 180);
          await s.move(p, v.group._x + v.B._x, v.group._y + v.B._y, 600);
          p.remove();
          v.owner = v.B;
          await s.fade(v.cursor, 1, 250);
          await poll(s, v, 2);
        },
      },
      {
        title: 'Auto-commit: on a timer',
        text: 'By default enable.auto.commit=true: the consumer commits its latest position for you, during poll(), every auto.commit.interval.ms (5000 ms). Easy, but it commits on a timer, not when your processing is done. Set it to false to commit yourself.',
        observe: 'The countdown reaches 0 and position 7 is committed with no code.',
        focus: v => [v.auto, v.flag],
        async run(s, v) {
          await band(s, v, 'enable.auto.commit=true · auto.commit.interval.ms=5000');
          v.auto.setAttribute('fill', GREEN);
          for (let t = 5; t > 0; t--) { v.auto.textContent = `auto-commit in ${t} s`; await s.wait(260); }
          v.auto.textContent = 'auto-commit now';
          await commit(s, v, 7, 'auto-commit 7');
          v.auto.textContent = 'auto-commit every 5 s';
        },
      },
      {
        title: 'Commit after processing: at-least-once',
        text: 'Now auto-commit is off and B calls commitSync() after processing each batch. B reads 7 to 9, processes them, and crashes just before the commit. It restarts at 7 and processes 7 to 9 again: nothing is lost, but some records repeat.',
        observe: 'After the crash the position jumps back to 7 and 7 to 9 are re-read in orange.',
        focus: v => [v.cursor, v.flag],
        async run(s, v) {
          v.auto.textContent = 'auto-commit off';
          v.auto.setAttribute('fill', MUTED);
          await band(s, v, 'process(records); consumer.commitSync();');
          await produce(s, v, 2);
          await poll(s, v, 3);
          await crash(s, v);
          await poll(s, v, 3, ORANGE);
          await commit(s, v, 10);
        },
      },
      {
        title: 'Commit before processing: at-most-once',
        text: 'Now B commits first, then processes. It reads 10 to 12, commits 13, and crashes while processing 10. It restarts at 13, so 11 and 12 are never processed: no repeats, but records can be lost. The Commit & restart lesson goes deeper.',
        observe: 'Records 11 and 12 turn grey: they were skipped.',
        focus: v => [v.skipped, v.log[11], v.log[12]],
        async run(s, v) {
          await band(s, v, 'consumer.commitSync(); process(records);');
          await produce(s, v, 3);
          await poll(s, v, 3);
          await commit(s, v, 13);
          await crash(s, v);
          for (const i of [11, 12]) v.log[i].rect.setAttribute('fill', SKIP);
          v.skipped = s.note(slotX(11.5), 222, '11, 12 skipped', { 'font-size': 14, 'font-weight': 700, fill: RED });
          await Promise.all([s.show(v.skipped, 300), s.shake(v.log[11]), s.shake(v.log[12])]);
        },
      },
      {
        title: 'Lag: how far behind the group is',
        text: 'Lag = log end offset − committed offset. The producer wrote up to 15, so the log end is 16, and the group committed 13: lag 3. Lag is per partition; add them up for the group. kafka-consumer-groups.sh --describe shows it.',
        observe: 'The purple brace spans the 3 records not yet committed; the table lists lag per partition.',
        focus: v => [v.lagText, v.table],
        async run(s, v) {
          await Promise.all([v.band, v.skipped, v.group, v.internal].map(n => s.fade(n, 0, 300)));
          await produce(s, v, 3);
          v.end = s.g(slotX(16), Y);
          el('rect', { x: -15, y: -15, width: 30, height: 30, rx: 3, fill: 'none', stroke: PURPLE, 'stroke-dasharray': '4 3' }, v.end);
          s.text(v.end, 15, -58, 'log end', { 'text-anchor': 'end', 'font-size': 13, 'font-weight': 650, fill: PURPLE });
          await s.show(v.end, 250);
          const brace = el('path', { d: `M${slotX(13) - 14} 204V212H${slotX(15) + 14}V204`, fill: 'none', stroke: PURPLE, 'stroke-width': 2 }, s.root);
          await s.draw(brace, 400);
          v.lagText = s.note(slotX(14), 232, 'lag = 16 − 13 = 3', { 'font-size': 16, 'font-weight': 700, fill: PURPLE });
          await s.show(v.lagText, 250);
          v.table = s.box(340, 362, 600, 150, '', { fill: '#1e2a35', stroke: '#1e2a35', rx: 10 });
          const t = (x, y, str, fill = '#d7e3ea', extra = {}) => s.text(v.table, x, y, str, { 'text-anchor': 'start', 'font-size': 13, 'font-family': MONO, fill, ...extra });
          t(-284, -50, '$ kafka-consumer-groups.sh --bootstrap-server … --describe --group billing', '#8fd18f');
          const cols = [-284, -200, -96, 44, 184];
          [['TOPIC', 'PARTITION', 'CURRENT-OFFSET', 'LOG-END-OFFSET', 'LAG'], ['orders', '0', '13', '16', '3'], ['orders', '1', '20', '21', '1']]
            .forEach((row, r) => row.forEach((c, k) => t(cols[k], -18 + r * 26, c, r === 0 ? '#9fb3c1' : k === 4 ? '#e0b3ff' : '#d7e3ea', r === 0 ? { 'font-weight': 700 } : {})));
          t(-284, 58, 'group billing, total lag = 3 + 1 = 4', '#e0b3ff', { 'font-weight': 700 });
          await s.show(v.table, 400);
        },
      },
      {
        title: 'Steady lag is fine, growing lag is not',
        text: 'Some lag is normal: records arrive, get read, get committed. If lag stays flat, the consumers keep up. If it keeps growing, they are slower than the producers. Fix it by processing faster, or add partitions and more consumers to the group.',
        observe: 'The green line stays low; the red line keeps climbing.',
        focus: v => [v.chart],
        async run(s, v) {
          await s.fade(v.table, 0, 300);
          v.chart = s.box(340, 362, 600, 150, '', { stroke: '#c9ced2', rx: 10 });
          const [ox, oy] = [-250, 50];
          s.line(ox, oy, 270, oy, { parent: v.chart, stroke: '#9aa3a9' });
          s.line(ox, oy, ox, -56, { parent: v.chart, stroke: '#9aa3a9' });
          s.text(v.chart, ox - 14, -42, 'lag', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
          s.text(v.chart, 262, 64, 'time', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
          const pts = f => Array.from({ length: 15 }, (_, k) => `${ox + 6 + k * 25},${f(k)}`).join(' ');
          const steady = el('polyline', { points: pts(k => 34 - (k % 2) * 12), fill: 'none', stroke: GREEN, 'stroke-width': 2.5 }, v.chart);
          const growing = el('polyline', { points: pts(k => 40 - k * 6.5 - (k % 2) * 6), fill: 'none', stroke: RED, 'stroke-width': 2.5 }, v.chart);
          await s.show(v.chart, 300);
          await Promise.all([s.draw(steady, 1200), s.draw(growing, 1200)]);
          s.text(v.chart, 116, 28, 'steady: keeping up', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 650, fill: GREEN });
          s.text(v.chart, 116, -54, 'growing: falling behind', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 650, fill: RED });
          await s.pulse(v.chart);
        },
      },
    ],
  },
  tryIt: {
    intro: 'One partition, one consumer. Pick how fast each side runs, run five seconds at a time, commit by hand or let auto-commit do it, and crash the consumer.',
    observe: 'Lag only falls when a commit happens. If the producer is faster than the consumer, lag grows after every run.',
    controls: [
      { type: 'choice', name: 'prod', label: 'Producer', options: ['2 per second', '4 per second'] },
      { type: 'choice', name: 'cons', label: 'Consumer', options: ['3 per second', '1 per second'] },
      { type: 'choice', name: 'auto', label: 'Auto-commit', options: ['on', 'off'] },
      { type: 'button', label: 'Run 5 seconds', primary: true, run: 'run' },
      { type: 'button', label: 'commitSync()', run: 'commit' },
      { type: 'button', label: 'Crash & restart', run: 'crash' },
    ],
    build(s, input) {
      const v = tryScene(s);
      v.producer.sub.textContent = `writes ${input.prod}`;
      pillText(v, input);
      v.message = 'Six records are waiting. Press Run 5 seconds.';
      return v;
    },
    async run(s, v, input) {
      v.producer.sub.textContent = `writes ${input.prod}`;
      v.consumer.sub.textContent = `group billing · reads ${input.cons}`;
      pillText(v, input);
      const before = v.history.at(-1), committed = v.committed;
      for (let t = 0; t < 5; t++) await tick(s, v, input);
      const lag = v.logEnd - v.committed;
      v.history.push(lag);
      const p = parseInt(input.prod, 10), c = parseInt(input.cons, 10);
      v.message = before === undefined ? `After 5 seconds the lag is ${lag}.`
        : lag > before ? `Lag grew from ${before} to ${lag}.` : lag < before ? `Lag fell from ${before} to ${lag}.` : `Lag held steady at ${lag}.`;
      v.message += c < p ? ` The consumer (${c}/s) is slower than the producer (${p}/s), so it falls further behind.`
        : lag < before ? ` The consumer (${c}/s) is faster than the producer (${p}/s), so it catches up.` : ' The consumer keeps up with the producer.';
      if (v.committed === committed) v.message += ' Nothing was committed this run: press commitSync() or turn auto-commit on.';
    },
    async commit(s, v, input) {
      pillText(v, input);
      if (v.position === v.committed) { v.message = `Already committed: the bookmark is at the position (${v.position}).`; return; }
      await tryCommit(s, v, `commitSync() → ${v.position}`);
      v.message = `Committed ${v.committed}. Lag is now ${v.logEnd - v.committed}: only records the consumer has not read yet.`;
    },
    async crash(s, v, input) {
      pillText(v, input);
      const was = v.position;
      v.consumer.rect.setAttribute('stroke', RED); v.consumer.rect.setAttribute('fill', '#fff4f4');
      v.consumer.label.textContent = '✕ crashed'; v.consumer.label.setAttribute('fill', RED);
      await Promise.all([s.shake(v.consumer), s.fade(v.cursor, .15, 300)]);
      await s.wait(500);
      v.consumer.rect.setAttribute('stroke', '#babdbe'); v.consumer.rect.setAttribute('fill', '#fff');
      v.consumer.label.textContent = 'Consumer'; v.consumer.label.setAttribute('fill', '#203347');
      v.position = v.committed;
      await Promise.all([s.fade(v.cursor, 1, 300), layout(s, v, 450)]);
      v.message = was > v.committed
        ? `Restarted from the committed offset ${v.committed}. Offsets ${v.committed} to ${was - 1} were read but not committed, so they will be read again (orange).`
        : `Restarted at ${v.committed}. Everything read was committed, so nothing is read twice.`;
    },
    readout: v => `<b>Log end</b> ${v.logEnd} · <b>Position</b> ${v.position} · <b>Committed</b> ${v.committed} · <b>Lag</b> ${v.logEnd - v.committed}`
      + (v.history.length ? ` · Lag after each run: ${v.history.slice(-6).join(' → ')}` : '') + `<br>${v.message}`,
  },
  deeper: {
    note: 'Which number to commit, why commitAsync() never retries, and committing on shutdown.',
    build: deeperScene,
    steps: [
      {
        title: 'Commit the next offset: last + 1',
        text: 'A commit names the next record to read, not the last one done. Having processed 4, you commit 5. Commit 4 by mistake and a restart processes record 4 twice. commitSync() with no arguments does this for you: it commits the current position.',
        observe: 'Record 4 was the last processed, and the bookmark goes to 5.',
        focus: v => [v.flag, v.formula],
        async run(s, v) {
          await poll(s, v, 5);
          v.formula = s.note(343, 226, 'last processed 4  →  commit 4 + 1 = 5', { 'font-size': 16, 'font-weight': 700, fill: PURPLE });
          await s.show(v.formula, 300);
          v.band.setAttribute('y', 258);
          v.band.setAttribute('font-size', 13);
          await band(s, v, 'commitSync(Map.of(tp, new OffsetAndMetadata(last.offset() + 1)))');
          await commit(s, v, 5);
        },
      },
      {
        title: 'Why commitAsync() does not retry',
        text: 'commitAsync() does not retry a failed commit. Here commit 8 fails, then commit 10 succeeds. If 8 were retried after that, it would overwrite 10 and pull the bookmark back, so 8 and 9 would be read twice. A newer commit covers it anyway.',
        observe: 'The late 8 would pull the green marker back to 8; it is dropped instead.',
        focus: v => [v.flag, v.internal, v.pill],
        async run(s, v) {
          await Promise.all([s.fade(v.formula, 0, 250), s.fade(v.band, 0, 250)]);
          await poll(s, v, 3);
          v.pill = s.box(v.owner._x, v.owner._y, 150, 28, 'commitAsync(8)', { size: 13, fill: '#eef7e8', stroke: GREEN, color: GREEN, rx: 14 });
          await s.pop(v.pill, 180);
          await s.move(v.pill, 292, 296, 450);
          v.pill.rect.setAttribute('stroke', RED); v.pill.rect.setAttribute('fill', '#fff4f4');
          v.pill.label.setAttribute('fill', RED); v.pill.label.textContent = 'commit 8 ✕ failed';
          await s.shake(v.pill);
          await poll(s, v, 2);
          await commit(s, v, 10, 'commitAsync(10)');
          // What a late retry would do: overwrite 10 with the older 8.
          v.pill.label.textContent = 'retry 8?';
          v.pill.rect.setAttribute('stroke-dasharray', '4 3');
          await s.move(v.pill, v.internal._x, v.internal._y + 12, 500);
          v.internal.stored.textContent = 'billing · orders-0 → 8 ✕';
          v.internal.stored.setAttribute('fill', RED);
          v.flag.label.setAttribute('fill', RED);
          await s.move(v.flag, slotX(8), Y + 42, 400);
          await s.shake(v.flag);
          await s.wait(500);
          v.internal.stored.textContent = 'billing · orders-0 → 10';
          v.internal.stored.setAttribute('fill', '#203347');
          v.flag.label.setAttribute('fill', GREEN);
          await Promise.all([s.move(v.flag, slotX(10), Y + 42, 400), s.move(v.pill, 292, 296, 500)]);
          v.pill.label.textContent = '8: not retried'; v.pill.label.setAttribute('fill', MUTED);
          v.pill.rect.setAttribute('stroke', '#babdbe'); v.pill.rect.setAttribute('fill', '#f4f6f7');
        },
      },
      {
        title: 'commitSync() when shutting down',
        text: 'A common pattern: commitAsync() in the poll loop because it is fast, then commitSync() in a finally block before close(). commitSync() retries until it succeeds or times out, so the last bookmark is saved even if an async commit failed.',
        observe: 'The failed async commit of 12 is saved by the final commitSync().',
        focus: v => [v.code],
        async run(s, v) {
          await Promise.all([v.owner, v.internal, v.pill].map(n => s.fade(n, 0, 300)));
          v.code = s.box(343, 330, 606, 220, '', { fill: '#f7f9fa', stroke: '#c9ced2', rx: 10 });
          const hl = s.g(0, 0, v.code);
          el('rect', { x: -296, y: -10, width: 592, height: 20, rx: 4, fill: '#e3efff' }, hl);
          const lineY = k => -92 + k * 20;
          place(hl, 0, lineY(2));
          CODE.forEach(([ind, str], k) => s.text(v.code, -276 + ind * 22, lineY(k), str, { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: '#203347' }));
          await s.show(v.code, 300);
          const at = (k, ms = 220) => s.move(hl, 0, lineY(k), ms);
          const badge = (k, str, color) => {
            const b = s.box(200, lineY(k), 170, 20, str, { parent: v.code, size: 13, fill: color === GREEN ? '#eef7e8' : '#fff4f4', stroke: color, color, rx: 10 });
            return s.pop(b, 200).then(() => b);
          };
          // Loop 1: read 10, commitAsync(11) succeeds.
          await at(2); await poll(s, v, 1); await at(3); await s.wait(200); await at(4);
          v.committed = 11; await s.move(v.flag, slotX(11), Y + 42, 300); metrics(v);
          const ok = await badge(4, 'commit 11 ✓', GREEN);
          // Loop 2: read 11, commitAsync(12) fails and is not retried.
          await at(2); await poll(s, v, 1); await at(3); await s.wait(200); await at(4);
          ok.remove();
          await badge(4, 'commit 12 ✕ failed', RED);
          // Shutdown: finally commitSync(12), then close().
          await at(6, 300); await at(7);
          v.committed = 12; await s.move(v.flag, slotX(12), Y + 42, 300); metrics(v);
          await badge(7, 'commit 12 ✓', GREEN);
          await at(8);
        },
      },
    ],
  },
  takeaway: 'A committed offset is a group\'s bookmark per partition (the next offset to read), stored in __consumer_offsets. Commit after processing for at-least-once. Lag = log end − committed: steady lag is fine, growing lag means consumers cannot keep up.',
  recap: {
    points: [
      'The committed offset is the group\'s bookmark per partition: the next offset to read.',
      'Kafka stores commits in the internal topic __consumer_offsets, so they survive restarts and follow a partition to its new owner.',
      'Auto-commit (enable.auto.commit=true) commits every auto.commit.interval.ms (5 s); manual commits use commitSync() or commitAsync().',
      'Commit after processing = at-least-once (repeats after a crash); commit before = at-most-once (possible loss).',
      'Lag = log end offset − committed offset, per partition. Steady is fine; growing means consumers are too slow.',
    ],
    interview: [
      { q: 'What is a committed offset, and where is it stored?', a: 'It is a **consumer group\'s bookmark** for one partition: the **next offset to read** (last processed + 1). Kafka stores it as a record in the internal topic **__consumer_offsets**, keyed by group, topic and partition, so it **survives restarts** and a new owner of the partition **resumes from it** after a rebalance.' },
      { q: 'Auto-commit or manual commit?', a: 'With **enable.auto.commit=true** (the default) poll() commits the latest position every **auto.commit.interval.ms** (5 s). It is simple, but it commits on a timer, not when your work is done. For control, set it to false and call **commitSync()** (blocks and retries) or **commitAsync()** (fast, no retry) **after processing**.' },
      { q: 'How does commit timing decide at-least-once vs at-most-once?', a: '**Commit after processing**: a crash before the commit means those records are **read again**, so **at-least-once** (make processing idempotent). **Commit before processing**: a crash after the commit **skips** the unprocessed records, so **at-most-once**. Exactly-once needs **transactions**.' },
      { q: 'What is consumer lag and what do you do when it grows?', a: '**Lag = log end offset − committed offset**, per partition, summed per group. See it with **kafka-consumer-groups.sh --describe --group <g>** (CURRENT-OFFSET, LOG-END-OFFSET, LAG) or a lag metric. Steady lag is normal; **growing lag** means consumers are slower than producers: **speed up processing**, or **add partitions and consumers** (more consumers than partitions do not help).' },
    ],
  },
  quiz: {
    q: 'Your consumer processes each batch and then calls commitSync(). It crashes after processing a batch but before the commit. What happens after it restarts?',
    options: ['It skips that batch', 'It reads and processes that batch again', 'Kafka saved its position anyway, so nothing repeats', 'The records in that batch are deleted'],
    answer: 1,
    why: 'The bookmark still points at the start of the batch, so the consumer resumes there and processes it again. That is at-least-once: nothing is lost, but records can repeat.',
  },
  related: ['consumer', 'group'],
};
