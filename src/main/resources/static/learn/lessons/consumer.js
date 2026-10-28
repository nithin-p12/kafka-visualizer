// Lesson 9: the consumer, what happens inside one consumer's poll loop.
import { el, place, PARTITION_COLORS as PC } from '../scene.js';
import { RED, GREEN, AMBER, MUTED } from './kit.js';

const BLUE = '#1677ff', GREY = '#9aa3a9', INK = '#203347';
const LANE_Y = [250, 308, 366], LANE_H = 50, MAX = 9;
const BLOCK = { w: 28, h: 26, size: 13 };
const slotX = i => 132 + i * 32;
const batchX = i => 592 + i * 32, BATCH_Y = 352;
const LOOP = { poll: [590, 282], process: [722, 282], commit: [854, 282] };
const PRODUCER = [90, 146];

// Broker with three partitions on the left, your app's KafkaConsumer on the right.
function scene(s, { counts = [3, 2, 3], reset = 'earliest' } = {}) {
  const v = { logs: [[], [], []], pos: [null, null, null], com: [null, null, null], seen: [0, 0, 0], batch: [] };
  v.producer = s.box(...PRODUCER, 130, 40, 'Producer', { size: 16 });
  v.producer.setAttribute('opacity', 0);

  v.broker = s.box(245, 312, 450, 286, '', { stroke: INK, rx: 12 });
  s.text(v.broker, -207, -125, 'Broker · topic orders', { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700 });
  s.text(v.broker, 24, -125, '▲ position', { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 650, fill: BLUE });
  s.text(v.broker, 207, -125, '▼ committed', { 'text-anchor': 'end', 'font-size': 13, 'font-weight': 650, fill: GREEN });
  v.lanes = LANE_Y.map((y, p) => {
    const l = s.box(245, y, 430, LANE_H, '', { stroke: PC[p], rx: 6 });
    l.rect.setAttribute('stroke-width', 1.6);
    s.text(l, -205, 0, `orders-${p}`, { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: PC[p] });
    // Markers sit at x = 0 and are moved with a transform, so s.move() can slide them.
    l.posMark = place(s.text(s.root, 0, 0, '▲', { 'font-size': 12, fill: BLUE, opacity: 0 }), slotX(0), y + 17);
    l.comMark = place(s.text(s.root, 0, 0, '▼', { 'font-size': 12, fill: GREEN, opacity: 0 }), slotX(0), y - 17);
    return l;
  });
  for (const [p, n] of counts.entries()) for (let i = 0; i < n; i++) addRecord(s, v, p);
  v.offsets = s.box(245, 424, 430, 40, '', { stroke: '#c9ced2', fill: '#f6f7fb', rx: 6 });
  s.text(v.offsets, -205, -10, '__consumer_offsets', { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: '#3d4a55' });
  v.offsetsT = s.text(v.offsets, -205, 10, 'group billing: nothing committed yet', { 'text-anchor': 'start', 'font-size': 13, fill: MUTED });

  v.app = s.box(722, 322, 445, 266, '', { stroke: '#d8b7e9', rx: 12, fill: '#fcfaff' });
  v.appT = s.text(v.app, -202, -112, 'Your app · KafkaConsumer', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: '#7a4aa3' });
  s.text(v.app, 202, -112, 'group.id = billing', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
  v.sub = s.g(0, 0);
  s.text(v.sub, 520, 236, 'subscribe("orders")', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: INK });
  v.resetT = s.text(v.sub, 924, 236, `auto.offset.reset = ${reset}`, { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
  v.poll = s.box(...LOOP.poll, 116, 40, 'poll()', { size: 16 });
  v.process = s.box(...LOOP.process, 116, 40, 'process', { size: 16 });
  v.commit = s.box(...LOOP.commit, 116, 40, 'commit()', { size: 16 });
  s.line(649, 282, 662, 282); s.line(781, 282, 794, 282);
  el('path', { d: 'M854 302 V316 H590 V306', fill: 'none', stroke: '#7b878f', 'stroke-width': 1.5, 'marker-end': 'url(#learn-arrow)' }, s.root);
  v.batchBox = s.box(722, BATCH_Y, 413, 38, '', { stroke: '#d9d9d9', rx: 6 });
  s.text(v.batchBox, -196, 0, 'batch', { 'text-anchor': 'start', 'font-size': 13, fill: MUTED });
  v.batchNote = s.text(v.batchBox, 30, 0, '', { 'font-size': 14, 'font-weight': 650, fill: GREEN });
  v.chips = [600, 722, 844].map((x, p) => {
    const c = s.box(x, 418, 112, 44, '', { stroke: PC[p], rx: 6 });
    s.text(c, 0, -10, `orders-${p}`, { 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: PC[p] });
    c.value = s.text(c, 0, 11, 'position –', { 'font-size': 14, 'font-weight': 650, fill: INK });
    return c;
  });
  return v;
}

function addRecord(s, v, p) {
  const b = s.block(slotX(v.logs[p].length), LANE_Y[p], `${v.logs[p].length}`, PC[p], BLOCK);
  v.logs[p].push(b);
  return b;
}
// A record written by the producer lands at the end of partition p.
async function produce(s, v, p, ms = 600) {
  const i = v.logs[p].length, f = s.block(PRODUCER[0], PRODUCER[1] + 20, `${i}`, PC[p], BLOCK);
  await s.move(f, slotX(i), LANE_Y[p], ms);
  f.remove();
  addRecord(s, v, p);
}
// Records before the position have been read: they are shown faded.
function shade(v, p) { v.logs[p].forEach((b, i) => b.setAttribute('opacity', v.pos[p] !== null && i < v.pos[p] ? .45 : 1)); }
async function setPos(s, v, p, n, ms = 350) {
  v.pos[p] = n;
  const m = v.lanes[p].posMark;
  if (n === null) { m.setAttribute('opacity', 0); v.chips[p].value.textContent = 'position –'; shade(v, p); return; }
  v.chips[p].value.textContent = `position ${n}`;
  shade(v, p);
  if (+m.getAttribute('opacity') < .5) { place(m, slotX(n), m._y); await s.show(m, 200); return; }
  await s.move(m, slotX(n), m._y, ms);
}
async function setCom(s, v, p, n, ms = 350) {
  v.com[p] = n;
  const m = v.lanes[p].comMark;
  if (+m.getAttribute('opacity') < .5) { place(m, slotX(n), m._y); await s.show(m, 200); return; }
  await s.move(m, slotX(n), m._y, ms);
}
function offsetsText(v) {
  v.offsetsT.textContent = v.com.every(c => c === null) ? 'group billing: nothing committed yet'
    : `group billing · ${v.com.map((c, p) => `orders-${p}: ${c ?? '–'}`).join(' · ')}`;
  v.offsetsT.setAttribute('fill', v.com.every(c => c === null) ? MUTED : '#3d4a55');
}
// poll(): ask the broker, then records from each partition's position come back into the batch.
async function poll(s, v, max = MAX) {
  v.batchNote.textContent = '';
  await s.pulse(v.poll);
  const req = s.block(...LOOP.poll, '', BLUE, { w: 12, h: 12 });
  await s.move(req, 478, 290, 450);
  req.remove();
  const got = [];
  for (let p = 0; p < 3; p++) for (let o = v.pos[p]; o < Math.min(v.logs[p].length, v.pos[p] + max); o++) got.push({ p, o, again: o < v.seen[p] });
  await Promise.all(got.map(async ({ p, o, again }, k) => {
    await s.wait(k * 70);
    const b = s.block(slotX(o), LANE_Y[p], `${o}`, again ? AMBER : PC[p], BLOCK);
    v.batch.push(b);
    await s.move(b, batchX(k), BATCH_Y, 600);
  }));
  for (let p = 0; p < 3; p++) await setPos(s, v, p, Math.min(v.logs[p].length, v.pos[p] + max), 300);
  return got;
}
// Your code handles the batch: each record goes through process and is done.
async function processBatch(s, v) {
  const batch = v.batch, n = batch.length;
  v.batch = [];
  await Promise.all(batch.map(async (b, k) => { await s.wait(k * 60); await s.move(b, ...LOOP.process, 420); b.remove(); }));
  await s.pulse(v.process);
  v.seen = v.seen.map((x, p) => Math.max(x, v.pos[p] ?? 0));
  if (n) v.batchNote.textContent = `✓ ${n} record${n > 1 ? 's' : ''} processed`;
}
async function commit(s, v) {
  await s.pulse(v.commit);
  const dot = s.block(...LOOP.commit, '', GREEN, { w: 14, h: 14 });
  await s.move(dot, 400, 424, 650);
  dot.remove();
  await Promise.all([0, 1, 2].map(p => v.pos[p] === null ? null : setCom(s, v, p, v.pos[p])));
  offsetsText(v);
  await s.pulse(v.offsets);
}
function setCrashed(v, on) {
  v.app.rect.setAttribute('stroke', on ? RED : '#d8b7e9');
  v.app.rect.setAttribute('fill', on ? '#fff4f4' : '#fcfaff');
  v.appT.textContent = on ? 'Your app ✕ crashed' : 'Your app · KafkaConsumer';
  v.appT.setAttribute('fill', on ? RED : '#7a4aa3');
}
async function crash(s, v) {
  for (const b of v.batch) b.remove();
  v.batch = [];
  v.batchNote.textContent = '';
  setCrashed(v, true);
  await s.shake(v.app);
  for (let p = 0; p < 3; p++) { await setPos(s, v, p, null); v.chips[p].value.textContent = 'position ?'; }
}
// On restart the consumer fetches its committed offsets; with none, auto.offset.reset picks the start.
async function restart(s, v, reset) {
  setCrashed(v, false);
  await s.pulse(v.app);
  const dot = s.block(722, 394, '', GREEN, { w: 14, h: 14 });
  await s.move(dot, 470, 424, 500);
  await s.move(dot, 722, 394, 500);
  dot.remove();
  await Promise.all([0, 1, 2].map(p => setPos(s, v, p, v.com[p] ?? (reset ? (reset === 'earliest' ? 0 : v.logs[p].length) : null))));
}

export default {
  id: 'consumer', n: 9, title: 'Consumer', tagline: 'The poll loop that reads records',
  guide: {
    what: 'The consumer is the Kafka client your application uses to read records. It subscribes to a topic and runs a loop: poll() pulls a batch of records, your code processes them, and the consumer saves how far it got (its position) to Kafka with a commit.',
    fits: 'The producer wrote records into partitions; the consumer reads them back. Next: consumer groups, where several consumers share the partitions.',
  },
  watch: {
    build(s) {
      const v = scene(s);
      v.sub.setAttribute('opacity', 0);
      return v;
    },
    steps: [
      {
        title: 'subscribe() to a topic',
        text: 'Your app creates a KafkaConsumer in group billing and calls subscribe("orders"). Alone in its group, it is assigned all three partitions (consumers in one group share them: next lesson). Nothing is committed yet, so auto.offset.reset = earliest starts it at offset 0.',
        observe: 'The consumer gets all three partitions, each starting at position 0.',
        focus: v => [v.sub, ...v.chips],
        async run(s, v) {
          await s.show(v.sub, 300);
          await Promise.all(v.lanes.map(l => s.pulse(l)));
          await Promise.all([0, 1, 2].map(p => setPos(s, v, p, 0)));
          await Promise.all(v.chips.map(c => s.pulse(c)));
        },
      },
      {
        title: 'poll() fetches a batch',
        text: 'Kafka does not push records. The consumer calls poll(), which asks the broker for records starting at its position in each partition. The position is the next offset to read. It lives in the consumer\'s memory and moves forward as records come back.',
        observe: 'Eight records come back into the batch, and each ▲ position moves past them.',
        focus: v => [v.poll, v.batchBox],
        async run(s, v) { await poll(s, v); },
      },
      {
        title: 'Your code processes the records',
        text: 'poll() hands the batch to your code, which handles each record: save the order, send an email. Then the loop calls poll() again. Kafka does not see what you processed; it only learns how far you got when you commit.',
        observe: 'The batch goes through process and the loop is ready for the next poll().',
        focus: v => [v.process, v.batchBox],
        async run(s, v) { await processBatch(s, v); },
      },
      {
        title: 'New records wait in the log',
        text: 'The producer writes three more records. Nothing is sent to the consumer: they wait in the partitions until the next poll(), which continues from the position. The consumer reads at its own pace; if it falls behind, records just wait longer (that gap is lag, lesson 11).',
        observe: 'Records 3, 2 and 3 arrive, wait, then the next poll() picks up exactly those.',
        focus: v => v.lanes,
        async run(s, v) {
          v.batchNote.textContent = '';
          await s.show(v.producer, 300);
          for (const p of [0, 1, 2]) await produce(s, v, p, 550);
          await s.wait(500);
          await poll(s, v);
          await processBatch(s, v);
        },
      },
      {
        title: 'commit() saves the position',
        text: 'The position exists only in memory. A commit saves it to Kafka, in the internal topic __consumer_offsets, under the group\'s name. By default (enable.auto.commit = true) the consumer commits for you every 5 seconds; lesson 11 covers commits.',
        observe: 'The positions 4, 3, 4 are written to __consumer_offsets and the ▼ marks appear.',
        focus: v => [v.commit, v.offsets],
        async run(s, v) { v.batchNote.textContent = ''; await commit(s, v); },
      },
      {
        title: 'A crash loses the position',
        text: 'Two more records arrive. The consumer polls and processes them, then crashes before it commits. Its positions were only in memory, so they are gone; the records and commits are safe in Kafka.',
        observe: 'The consumer turns red and its positions are lost; ▼ committed stays at 4, 3, 4.',
        focus: v => [v.appT, ...v.chips],
        async run(s, v) {
          for (const p of [0, 2]) await produce(s, v, p, 500);
          await poll(s, v);
          await processBatch(s, v);
          await s.wait(300);
          await crash(s, v);
        },
      },
      {
        title: 'A restart resumes from the commit',
        text: 'The restarted consumer reads its committed offsets and continues from there, not from 0. Offset 4 in orders-0 and orders-2 was processed after the last commit, so it is read again. With no commit at all, auto.offset.reset decides: latest (the default) or earliest.',
        observe: 'The ▲ positions jump back to the ▼ commits and two records come back a second time (amber).',
        focus: v => [v.batchBox, v.lanes[0], v.lanes[2]],
        async run(s, v) {
          await restart(s, v);
          await s.wait(300);
          await poll(s, v);
          v.batchNote.textContent = '';
          v.again = s.text(v.batchBox, 70, 0, '↺ read again', { 'font-size': 14, 'font-weight': 650, fill: AMBER });
          await s.show(v.again, 250);
        },
      },
    ],
  },
  tryIt: {
    intro: 'Produce records, poll() to read and process them, and commit() to save your place. Crash the consumer before or after a commit and see where it resumes.',
    observe: 'poll() continues from the ▲ position. After a restart, the consumer starts again from the ▼ commit, so records after it are read again (amber).',
    controls: [
      { type: 'choice', name: 'reset', label: 'auto.offset.reset', options: ['earliest', 'latest'], rebuild: true },
      { type: 'button', label: 'poll()', primary: true, run: 'doPoll' },
      { type: 'button', label: 'commit()', run: 'doCommit' },
      { type: 'button', label: 'Produce 3 records', run: 'doProduce' },
      { type: 'button', label: 'Crash & restart', run: 'doCrash' },
    ],
    build(s, input) {
      const v = scene(s, { reset: input.reset });
      v.producer.setAttribute('opacity', 1);
      v.next = 0;
      v.message = `Nothing is committed yet. The first poll() starts at ${input.reset === 'earliest' ? 'offset 0, the oldest record' : 'the end, so it only sees records produced after it'}.`;
      return v;
    },
    async doPoll(s, v, input) {
      const fresh = [];
      for (let p = 0; p < 3; p++) if (v.pos[p] === null) { fresh.push(p); await setPos(s, v, p, input.reset === 'earliest' ? 0 : v.logs[p].length); }
      const got = await poll(s, v, 3);
      const start = fresh.length ? ` No committed offset, so auto.offset.reset = ${input.reset} put the position at ${input.reset === 'earliest' ? 'the oldest record' : 'the end of each partition'}.` : '';
      if (!got.length) { v.message = `poll() returned no records: there is nothing after the position.${start} Produce some records.`; return; }
      await processBatch(s, v);
      const again = got.filter(r => r.again).length;
      const left = [0, 1, 2].reduce((n, p) => n + v.logs[p].length - v.pos[p], 0);
      v.message = `poll() returned ${got.length} record${got.length > 1 ? 's' : ''} (up to 3 per partition here) and your code processed them.${start}`
        + (again ? ` ${again} of them ${again > 1 ? 'were' : 'was'} read again (amber): processed before, but not committed.` : '')
        + (left ? ` ${left} more wait${left === 1 ? 's' : ''} for the next poll().` : '');
    },
    async doCommit(s, v) {
      if (v.pos.every(p => p === null)) { v.message = 'There is no position to commit yet. Call poll() first.'; return; }
      v.batchNote.textContent = '';
      await commit(s, v);
      v.message = `Committed ${v.com.map((c, p) => `orders-${p} = ${c ?? '–'}`).join(', ')} to __consumer_offsets. A restart will resume here.`;
    },
    async doProduce(s, v) {
      const targets = [0, 1, 2].map(k => (v.next + k) % 3);
      if (targets.some(p => v.logs[p].length >= MAX)) { v.message = 'The partitions are full in this sandbox. Click an auto.offset.reset option to start again.'; return; }
      for (const p of targets) await produce(s, v, p, 450);
      v.next = (v.next + 1) % 3;
      v.message = 'Three records were written, one to each partition. They wait in the partitions until the consumer calls poll().';
    },
    async doCrash(s, v, input) {
      const lost = [0, 1, 2].reduce((n, p) => n + Math.max(0, v.seen[p] - (v.com[p] ?? (input.reset === 'earliest' ? 0 : v.seen[p]))), 0);
      await crash(s, v);
      await s.wait(400);
      await restart(s, v, input.reset);
      const none = v.com.every(c => c === null);
      v.message = none ? `Crashed and restarted. Nothing was committed, so auto.offset.reset = ${input.reset} decides: the position is at ${input.reset === 'earliest' ? 'offset 0' : 'the end'}.`
        : `Crashed and restarted. The consumer resumed from its committed offsets, not from 0.`;
      if (lost) v.message += ` ${lost} processed record${lost > 1 ? 's were' : ' was'} not committed and will be read again on the next poll().`;
      else if (!none) v.message += ' Everything processed was committed, so nothing is read twice.';
    },
    readout: v => `Log end / position / committed: ${[0, 1, 2].map(p => `<b style="color:${PC[p]}">orders-${p}</b> <b>${v.logs[p].length} / ${v.pos[p] ?? '–'} / ${v.com[p] ?? '–'}</b>`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Keeping the poll loop alive, and why an empty poll waits.',
    build(s) {
      const v = {};
      v.loop = s.g(0, 0);
      v.loop.setAttribute('opacity', 0);
      s.text(v.loop, 60, 262, 'your poll loop', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700 });
      s.line(60, 310, 920, 310, { parent: v.loop, arrow: true, stroke: '#c9ced2', width: 2 });
      s.text(v.loop, 920, 334, 'time', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
      v.polls = [100, 230, 360].map(x => { const b = s.block(x, 310, 'poll()', BLUE, { parent: v.loop, w: 62, h: 28, size: 13 }); b.setAttribute('opacity', 0); return b; });
      v.limit = s.g(0, 0, v.loop);
      v.limit.setAttribute('opacity', 0);
      s.line(780, 280, 780, 344, { parent: v.limit, arrow: false, stroke: AMBER, width: 2, dash: '5 4' });
      s.text(v.limit, 780, 264, 'max.poll.interval.ms = 5 min', { 'font-size': 14, 'font-weight': 700, fill: AMBER });
      return v;
    },
    steps: [
      {
        title: 'Keep calling poll() in time',
        text: 'Each poll() also shows the group that this consumer is making progress. If your code takes longer than max.poll.interval.ms (5 minutes by default) between two polls, the consumer is treated as stuck: it leaves the group and its partitions move to another consumer.',
        observe: 'Processing runs past the 5-minute line without a poll(), so the consumer is removed from the group.',
        focus: v => [v.bar, v.limit],
        async run(s, v) {
          await s.show(v.loop, 300);
          for (const [k, p] of v.polls.entries()) {
            p.setAttribute('opacity', 1); await s.pop(p, 200);
            if (k < 2) { const w = s.block(p._x + 65, 310, '', GREY, { parent: v.loop, w: 60, h: 14 }); await s.show(w, 200); }
          }
          await s.show(v.limit, 300);
          v.bar = s.block(395, 310, '', GREY, { parent: v.loop, w: 10, h: 14 });
          v.bar.rect.setAttribute('x', 0);
          await s.clock.tween(1400, t => v.bar.rect.setAttribute('width', 10 + t * 470));
          v.bar.rect.setAttribute('fill', RED);
          v.out = s.box(600, 400, 560, 40, 'No poll() for 5 min: the consumer leaves the group and its partitions move', { parent: v.loop, size: 14, fill: '#fff4f4', stroke: RED, color: RED, rx: 20 });
          await s.pop(v.out, 300);
          await s.shake(v.out);
        },
      },
      {
        title: 'An empty poll waits for data',
        text: 'When there is nothing new, the broker does not reply at once with nothing. It holds the fetch until data arrives or fetch.max.wait.ms (500 ms by default) passes. So an idle consumer does not spin, and a new record is returned the moment it arrives.',
        observe: 'The first fetch waits 500 ms and returns empty. The second returns as soon as a record arrives.',
        focus: v => [v.brk, v.wait, v.log2],
        async run(s, v) {
          await s.fade(v.loop, 0, 300);
          v.loop.remove();
          v.cons = s.box(170, 300, 200, 72, 'Consumer', { sub: 'poll()', size: 18, subSize: 14, rx: 10 });
          v.brk = s.box(790, 300, 220, 72, 'Broker', { sub: 'orders-0', size: 18, subSize: 14, stroke: INK, rx: 10 });
          v.prod = s.box(790, 420, 150, 40, 'Producer', { size: 16 });
          await Promise.all([v.cons, v.brk, v.prod].map(n => s.show(n, 300)));
          s.line(272, 286, 678, 286); s.line(678, 314, 272, 314);
          s.text(s.root, 475, 270, 'fetch request', { 'font-size': 13, fill: MUTED });
          s.text(s.root, 475, 330, 'reply', { 'font-size': 13, fill: MUTED });
          v.wait = s.text(s.root, 790, 240, '', { 'font-size': 15, 'font-weight': 650, fill: AMBER });
          const log = async (k, str) => { const n = s.text(s.root, 80, 400 + k * 28, str, { 'text-anchor': 'start', 'font-size': 14, fill: '#3d4a55' }); await s.show(n, 250); return n; };
          const fetch = async () => { const r = s.block(300, 286, 'fetch', BLUE, { w: 56, h: 22, size: 12 }); await s.move(r, 650, 286, 550); r.remove(); };
          const reply = async (label, color) => { const r = s.block(650, 314, label, color, { w: label.length > 3 ? 64 : 30, h: 22, size: 12 }); await s.move(r, 300, 314, 550); r.remove(); await s.pulse(v.cons); };
          await fetch();
          await s.clock.tween(1200, t => { v.wait.textContent = `holding the fetch · ${Math.round(t * 500)} ms`; });
          v.wait.textContent = '500 ms passed · reply: no records';
          await reply('empty', GREY);
          await log(0, '1st fetch: nothing new, so an empty reply after 500 ms');
          await fetch();
          await s.clock.tween(500, t => { v.wait.textContent = `holding the fetch · ${Math.round(t * 200)} ms`; });
          const rec = s.block(790, 400, '5', PC[0], BLOCK);
          await s.move(rec, 790, 320, 350);
          rec.remove();
          v.wait.textContent = 'a record arrived at 200 ms · reply now';
          await reply('5', PC[0]);
          v.log2 = await log(1, '2nd fetch: record 5 arrived at 200 ms and was returned at once');
        },
      },
    ],
  },
  takeaway: 'A consumer subscribes to a topic and runs a poll loop: poll() pulls a batch from its position in each partition, your code processes it, and a commit saves the position to Kafka. After a restart it resumes from the committed offset, so work done after the last commit is read again.',
  recap: {
    points: [
      'subscribe() joins the consumer\'s group; alone in the group, it is assigned every partition.',
      'Kafka is pull-based: poll() fetches records from the consumer\'s position in each partition.',
      'The position (the next offset to read) is kept per partition, in memory.',
      'A commit saves the position to __consumer_offsets; by default it is auto-committed every 5 s.',
      'A restart resumes from the committed offset; with none, auto.offset.reset (latest by default) decides.',
    ],
    interview: [
      { q: 'Does Kafka push records to consumers?', a: '**No, consumers pull.** The consumer calls **poll()** in a loop and fetches from its **position** in each assigned partition. Pulling lets every consumer read at **its own pace** and in large batches; a slow consumer simply falls behind (**lag**) instead of being flooded.' },
      { q: 'What is the difference between the position and the committed offset?', a: 'The **position** is the next offset the consumer will read; it is kept **in memory** and moves forward with every poll(). The **committed offset** is a position saved in Kafka (**__consumer_offsets**) for the group. After a restart or a partition move, reading resumes from the **committed** offset.' },
      { q: 'A consumer crashes after processing records but before committing. What happens?', a: 'The records since the last commit are **delivered again** when reading resumes from the committed offset. That is **at-least-once** delivery, so processing should be **idempotent** (safe to repeat). Committing before processing would instead risk **losing** records.' },
      { q: 'What does auto.offset.reset do?', a: 'It decides where to start when the group has **no committed offset** for a partition, or the committed one no longer exists (for example, deleted by retention). **latest** (the default) starts at the end and reads only new records, **earliest** starts at the oldest record still kept, and **none** throws an error.' },
    ],
  },
  quiz: {
    q: 'A consumer has processed offsets 0 to 9 of a partition, but its last commit saved position 6. It crashes and restarts. Which offset does it read first?',
    options: ['0', '6', '10', 'None: it waits for new records only'],
    answer: 1,
    why: 'It resumes from the committed offset, 6, so offsets 6 to 9 are processed again. The in-memory position (10) was lost in the crash. auto.offset.reset only matters when there is no committed offset.',
  },
  related: ['producer', 'offset'],
};
