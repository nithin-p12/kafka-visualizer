// Level 2 · Link 7: commit & restart. What a crash does to a consumer between processing and committing:
// redelivered duplicates (commit after), lost records (commit before), the auto-commit window, and the fix
// (idempotent processing). The map has the partition, the consumer's poll loop, __consumer_offsets and the
// database the consumer writes to, so duplicates and gaps are visible.
import { PARTITION_COLORS as PC, el, place } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, INK, start, layers, frame, node, part, wire, along, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0];
// ---- layout (960 × 460) ----
const bx = off => 82 + (off - 100) * 66, BY = 100, LAST = 107;
const ROW = i => [i < 6 ? 384 : 664, 222 + (i % 6) * 36];

function scene(s, { dedupe = false, auto = false } = {}) {
  const v = start(s, { parent: { poll: 'cons', proc: 'cons', commit: 'cons', marks: 'part', log: 'part' } });
  Object.assign(v, { committed: 100, position: 100, batch: [], done: new Set(), rows: [], dedupe, auto, alive: true });

  // ---- partition ----
  frame(s, v, 'part', 325, 95, 590, 110, 'orders-0', { color: MUTED });
  v.blocks = [];
  const log = part(s, v, 'log');
  for (let o = 100; o <= LAST; o++) v.blocks.push(s.block(bx(o), BY, `${o}`, P0, { w: 54, h: 30, size: 14, parent: log }));
  const marks = part(s, v, 'marks');
  const marker = (color, label, up) => {
    const g = s.g(bx(100), up ? 72 : 128, marks);
    el('path', { d: up ? 'M-7,-6 L7,-6 L0,4 Z' : 'M-7,6 L7,6 L0,-4 Z', fill: color }, g);
    g.t = s.text(g, 11, up ? -1 : 1, label, { 'text-anchor': 'start', 'font-size': 13.5, 'font-weight': 700, fill: color });
    return g;
  };
  v.posM = marker(AMBER, 'position 100', true);
  v.comM = marker(BLUE, 'committed 100', false);

  // ---- __consumer_offsets ----
  frame(s, v, 'offs', 797, 95, 290, 110, '__consumer_offsets');
  v.offT = s.text(v.n.offs, 0, 14, 'orders-app · orders-0 → 100', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.n.offs.querySelector('text').setAttribute('font-family', MONO);

  // ---- consumer ----
  frame(s, v, 'cons', 180, 305, 300, 270, 'Consumer · orders-app', { color: '#13968a', fill: '#f7fcfb', stroke: '#bfe4df' });
  v.stateT = s.text(v.n.cons, 136, -117, auto ? 'enable.auto.commit=true' : 'manual commit', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED, 'font-family': MONO });
  node(s, v, 'poll', 180, 232, 260, 46, 'poll()', { sub: 'max.poll.records = 3' });
  node(s, v, 'proc', 180, 312, 260, 56, 'process each record', { sub: 'batch: —' });
  node(s, v, 'commit', 180, 394, 260, 46, auto ? 'auto-commit (in poll)' : 'commitSync()', { sub: auto ? 'every 5 s' : '' });
  for (const k of ['poll', 'proc', 'commit']) v.n[k].s.setAttribute('font-family', MONO);

  // ---- database ----
  frame(s, v, 'db', 650, 305, 580, 270, dedupe ? 'orders DB · unique order id' : 'orders DB · what processing did', { color: INK });

  // ---- wires ----
  wire(v, 'p-req', 'M140,209 C140,172 250,178 250,150');
  wire(v, 'p-res', 'M290,150 C290,180 214,180 214,209');
  wire(v, 'c-off', 'M310,394 C350,394 344,160 420,160 L700,160 C722,160 730,156 730,150');
  wire(v, 'off-c', 'M760,150 C760,167 742,168 700,168 L432,168 C356,168 360,232 310,232');
  wire(v, 'proc-db', 'M310,312 L362,312');
  wire(v, 'to-row', 'M362,312 L384,222', { hidden: true });
  layers(s, v);
  return v;
}

// ---- state helpers ----
const batchText = v => v.batch.length ? `batch: ${v.batch.join(' ')}` : 'batch: —';
async function moveMark(s, m, off, label) {
  await Promise.all([s.move(m, bx(Math.min(off, LAST + 1)), m._y, 500), swap(s, m.t, label)]);
}
async function offsetFetch(s, v) {
  await packet(s, v, 'c-off', 'OffsetFetch', BLUE, { ms: 900 });
  await packet(s, v, 'off-c', `committed ${v.committed}`, GREEN, { ms: 900 });
  v.position = v.committed;
  await s.fade(v.posM, 1, 200);
  await moveMark(s, v.posM, v.position, `position ${v.position}`);
  hit(v, 'poll');
}
async function poll(s, v) {
  const from = v.position, recs = [];
  for (let o = from; o < from + 3 && o <= LAST; o++) recs.push(o);
  await packet(s, v, 'p-req', `Fetch(${from})`, BLUE, { ms: 700 });
  await Promise.all(recs.map(o => s.pulse(v.blocks[o - 100])));
  await packet(s, v, 'p-res', recs.length ? `records ${recs[0]}–${recs.at(-1)}` : 'no records', GREEN, { ms: 700 });
  v.batch = recs;
  v.position = from + recs.length;
  hit(v, 'poll');
  await Promise.all([swap(s, v.n.proc.s, batchText(v), INK), moveMark(s, v.posM, v.position, `position ${v.position}`)]);
  return recs;
}
async function processNext(s, v) {
  const off = v.batch.shift();
  if (off == null) return null;
  const dup = v.done.has(off), skip = dup && v.dedupe;
  await swap(s, v.n.proc.s, `→ ${off} · ${batchText(v).replace('batch: ', 'then ')}`, INK);
  hit(v, 'proc');
  await packet(s, v, 'proc-db', skip ? 'already done?' : `charge ${off}`, skip ? MUTED : P0, { ms: 450 });
  if (v.rows.length < 12) {
    const [x, y] = ROW(v.rows.length);
    const g = s.g(x, y);
    const color = skip ? MUTED : dup ? RED : GREEN;
    el('rect', { x: -4, y: -14, width: 262, height: 28, rx: 6, fill: skip ? '#f6f7fb' : dup ? '#fff4f4' : '#eef7e8', stroke: color }, g);
    s.text(g, 8, 0, skip ? `order ${off} · duplicate skipped` : dup ? `✕ order ${off} · charged AGAIN` : `✓ order ${off} · charged`, { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: color });
    v.n.db.append(g);
    place(g, x - 650, y - 305);
    v.rows.push(g);
    await s.pop(g, 300);
  }
  v.done.add(off);
  hit(v, 'db');
  await swap(s, v.n.proc.s, batchText(v), INK);
  return { off, dup, skip };
}
async function commit(s, v, off = v.position) {
  await packet(s, v, 'c-off', `OffsetCommit(${off})`, BLUE, { ms: 900 });
  v.committed = off;
  hit(v, 'offs');
  await Promise.all([swap(s, v.offT, `orders-app · orders-0 → ${off}`, BLUE), moveMark(s, v.comM, off, `committed ${off}`)]);
}
async function crash(s, v) {
  v.alive = false; v.batch = [];
  v.n.cons.rect.setAttribute('stroke', RED); v.n.cons.rect.setAttribute('fill', '#fff4f4');
  await swap(s, v.stateT, '✕ crashed', RED);
  await s.shake(v.n.cons);
  await Promise.all([s.fade(v.posM, .15, 300), swap(s, v.n.proc.s, 'batch: lost with the process', RED)]);
}
async function restart(s, v) {
  v.alive = true;
  v.n.cons.rect.setAttribute('stroke', '#bfe4df'); v.n.cons.rect.setAttribute('fill', '#f7fcfb');
  await swap(s, v.stateT, 'restarted', GREEN);
  await offsetFetch(s, v);
}

// ---- events ----
const ev = (phase, on, wires, title, text, observe, run) => ({ phase, on, wires, title, text, observe, run });
const startEv = ev('First run', ['poll', 'offs'], ['c-off', 'off-c'], 'The consumer starts: where was the group?',
  'Before its first poll, the consumer asks the group coordinator for orders-app\'s committed offset on orders-0 (OffsetFetch). It is 100, so its position, the next offset to fetch, starts at 100.',
  'OffsetFetch goes out, "committed 100" comes back; the position marker sits at 100.', async (s, v) => offsetFetch(s, v));
const pollEv = (phase, again) => ev(phase, ['poll', 'log', 'marks'], ['p-req', 'p-res'], again ? 'poll() returns the same records again' : 'poll() fetches a batch',
  again ? 'Starting from the committed 103, the fetch returns 103, 104 and 105: the same records the crashed consumer had already worked on.'
    : 'poll() fetches up to max.poll.records (here 3) from the position. The consumer\'s position moves past them at once, in memory; nothing is committed yet.',
  'Fetch, three records come back, and the position marker jumps ahead.', async (s, v) => poll(s, v));
const procEv = (phase, off, extra = '') => ev(phase, ['proc', 'db'], ['proc-db'], `Process ${off}`,
  `The application handles record ${off}: it charges order ${off} and writes that to its database.${extra}`,
  `A row "order ${off} · charged" appears in the database.`, async (s, v) => processNext(s, v));
const commitEv = (phase, off, text) => ev(phase, ['commit', 'offs', 'marks'], ['c-off'], `commitSync(${off})`, text,
  `OffsetCommit(${off}); __consumer_offsets and the committed marker move to ${off}.`, async (s, v) => commit(s, v, off));
const crashEv = (text) => ev('Crash', ['cons', 'marks'], [], 'The consumer crashes', text,
  'The consumer turns red; its in-memory position and batch are gone.', async (s, v) => crash(s, v));
const restartEv = (text, observe) => ev('Restart', ['poll', 'offs', 'marks'], ['c-off', 'off-c'], 'It restarts from the committed offset', text, observe, async (s, v) => restart(s, v));

const flowAfter = {
  steps: [
    startEv,
    pollEv('First run'),
    procEv('First run', 100), procEv('First run', 101), procEv('First run', 102),
    commitEv('First run', 103, 'After the whole batch is processed, the consumer commits 103: the next offset to read, not the last one processed.'),
    pollEv('Second batch'),
    procEv('Second batch', 103), procEv('Second batch', 104),
    crashEv('Before processing 105, and before any commit, the process dies. Orders 103 and 104 were already charged, but the group\'s bookmark still says 103.'),
    restartEv('The consumer (or another member, after a rebalance) asks for the committed offset: 103. Everything after the last commit will be read again.', 'OffsetFetch returns 103; the position goes back to 103.'),
    pollEv('Redelivery', true),
    procEv('Redelivery', 103, ' But order 103 was already charged before the crash.'),
    procEv('Redelivery', 104, ' Order 104 is charged a second time too.'),
    procEv('Redelivery', 105, ' 105 is new.'),
    commitEv('Redelivery', 106, 'The batch is done, so the consumer commits 106. The group has moved on, but two customers were charged twice.'),
    ev('Lesson', ['db', 'offs'], [], 'This is at-least-once delivery',
      'Committing after processing guarantees nothing is skipped, but anything processed after the last commit is processed again after a crash. Duplicates are normal, so make processing idempotent (see the last flow).',
      'Two red "charged AGAIN" rows, no gaps.', async (s, v) => { hit(v, 'db'); await s.wait(500); }),
  ],
};
const flowBefore = {
  steps: [
    startEv,
    pollEv('Commit first'),
    commitEv('Commit first', 103, 'This consumer commits as soon as poll() returns, before processing: commitSync(103) for a batch nobody has handled yet.'),
    procEv('Commit first', 100),
    crashEv('The process dies after order 100. Orders 101 and 102 were never processed, but the group\'s bookmark already says 103.'),
    restartEv('After the restart the consumer starts at the committed offset, 103.', 'OffsetFetch returns 103.'),
    pollEv('Records lost'),
    ev('Records lost', ['db', 'log'], [], '101 and 102 are skipped forever',
      'The consumer moves on from 103. Nothing will ever read 101 and 102 again for this group: that is at-most-once delivery. Only acceptable when losing records is cheaper than handling duplicates.',
      'Two amber "missing" rows in the database: 101 and 102.', async (s, v) => {
        for (const off of [101, 102]) {
          const [x, y] = ROW(v.rows.length), g = s.g(x - 650, y - 305, v.n.db);
          el('rect', { x: -4, y: -14, width: 262, height: 28, rx: 6, fill: '#fdf4e7', stroke: AMBER, 'stroke-dasharray': '4 3' }, g);
          s.text(g, 8, 0, `– order ${off} · never processed`, { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: AMBER });
          v.rows.push(g); await s.pop(g, 300);
        }
      }),
  ],
};
const flowAuto = {
  auto: true,
  steps: [
    startEv,
    pollEv('Auto-commit'),
    ev('Auto-commit', ['proc', 'db'], ['proc-db'], 'Process 100, 101 and 102',
      'With enable.auto.commit=true nothing commits while you process. The consumer only commits inside poll(), at most every auto.commit.interval.ms (5 s).',
      'Three rows appear; __consumer_offsets still says 100.', async (s, v) => { for (let k = 0; k < 3; k++) await processNext(s, v); }),
    ev('Auto-commit', ['poll', 'commit', 'offs', 'marks'], ['c-off', 'p-req', 'p-res'], 'The next poll() commits 103, then fetches',
      'More than 5 s have passed, so this poll() first commits the position from the previous poll (103), then returns 103–105. As long as you finish a batch before polling again, this is at-least-once.',
      'OffsetCommit(103) leaves from inside poll(), then records 103–105 arrive.', async (s, v) => { await commit(s, v, 103); await poll(s, v); }),
    ev('Auto-commit', ['proc', 'db'], ['proc-db'], 'Process 103 and 104', 'Two more orders are charged. The next automatic commit will only happen at a later poll().',
      'Rows for 103 and 104.', async (s, v) => { await processNext(s, v); await processNext(s, v); }),
    crashEv('A crash now loses everything since the last automatic commit: up to 5 s of work.'),
    restartEv('The restart begins at 103, the last automatic commit.', 'Position back to 103.'),
    pollEv('Redelivery', true),
    ev('Redelivery', ['proc', 'db'], ['proc-db'], '103 and 104 are charged again',
      'Same as manual commit-after-processing: duplicates after a crash. Worse cases: if you hand records to another thread and poll again, auto-commit can commit records that were never processed, and a crash loses them.',
      'Red "charged AGAIN" rows for 103 and 104.', async (s, v) => { await processNext(s, v); await processNext(s, v); }),
  ],
};
// Idempotent processing: preset to just after the crash, then replay with a unique key in the database.
const flowIdem = {
  dedupe: true,
  async pre(s, v) { for (const st of flowAfter.steps.slice(0, 10)) await st.run(s, v); },
  steps: [
    restartEv('Same crash as in the first flow: the consumer restarts at 103, and 103–105 will be delivered again.', 'OffsetFetch returns 103.'),
    pollEv('Redelivery', true),
    ev('Idempotent', ['proc', 'db'], ['proc-db'], 'Order 103 is recognised and skipped',
      'This time the database has a unique key on the order id (or the consumer keeps a table of processed ids). Writing order 103 again changes nothing.',
      'A grey "duplicate skipped" row for 103.', async (s, v) => processNext(s, v)),
    ev('Idempotent', ['proc', 'db'], ['proc-db'], '104 is skipped, 105 is processed', 'The duplicate 104 is ignored too; 105 is new and is charged once.',
      'A grey row for 104, a green one for 105.', async (s, v) => { await processNext(s, v); await processNext(s, v); }),
    commitEv('Idempotent', 106, 'Commit 106. Every order was charged exactly once, even though Kafka delivered two of them twice.'),
    ev('Idempotent', ['db'], [], 'At-least-once + idempotent = effectively once',
      'Kafka cannot know what your database did. Use a natural key (order id), an upsert, or a processed-ids table updated in the same transaction as the side effect. For Kafka-to-Kafka pipelines, transactions give exactly-once (see the deep dive).',
      'Each order appears once as charged.', async (s, v) => { hit(v, 'db'); await s.wait(500); }),
  ],
};
for (const f of [flowAfter, flowBefore, flowAuto, flowIdem]) {
  Object.assign(f, { continuous: true, enter, async build(s) { const v = scene(s, { dedupe: f.dedupe, auto: f.auto }); v.track = f; if (f.pre) await f.pre(s, v); return v; } });
  for (const st of f.steps) st.wires = st.wires ?? [];
}

export default {
  id: 'redelivery', n: 19, title: 'Commit & restart', tagline: 'At-least-once in action',
  docked: true,
  guide: {
    what: 'A consumer\'s position lives in memory; only the committed offset survives a crash. Whatever was processed after the last commit is read again on restart (duplicates); whatever was committed before it was processed is skipped (loss).',
    fits: 'Seventh link of Level 2: consumer ↔ __consumer_offsets across a restart. Commit & lag introduced commits; rebalance showed when partitions move; this is what both mean for your data. Next: multiple groups.',
  },
  flows: [
    { id: 'after', short: 'commit after', label: 'Commit after processing', about: 'Crash before the commit → duplicates.', track: flowAfter },
    { id: 'before', short: 'commit before', label: 'Commit before processing', about: 'Crash after the commit → lost records.', track: flowBefore },
    { id: 'auto', short: 'auto-commit', label: 'Auto-commit', about: 'Commits inside poll(), every 5 s.', track: flowAuto },
    { id: 'idem', short: 'idempotent', label: 'Idempotent processing', about: 'The fix: duplicates are recognised.', track: flowIdem },
  ],
  watch: flowAfter,
  tryIt: {
    intro: 'Run the poll loop yourself: poll, process, commit, and crash whenever you like. The database shows what processing did.',
    observe: 'Crash after processing but before committing → duplicates. Commit before processing, then crash → gaps. Turn on the unique key to make duplicates harmless.',
    controls: [
      { type: 'choice', name: 'dedupe', label: 'Unique order id', options: ['off', 'on'], rebuild: true },
      { type: 'button', label: 'poll()', primary: true, run: 'poll' },
      { type: 'button', label: 'process next', run: 'proc' },
      { type: 'button', label: 'commitSync()', run: 'commit' },
      { type: 'button', label: 'Crash & restart', run: 'crash' },
    ],
    build(s, input) {
      const v = scene(s, { dedupe: input?.dedupe === 'on' });
      v.started = false;
      v.message = 'Press poll(). The first poll asks for the committed offset first.';
      return v;
    },
    async poll(s, v) {
      unfocus(v);
      if (!v.started) { await offsetFetch(s, v); v.started = true; }
      if (v.batch.length) { v.message = `Still ${v.batch.length} unprocessed record${v.batch.length > 1 ? 's' : ''} in the batch. (A real poll() would return the next ones and these would be skipped unless processed.)`; return; }
      const recs = await poll(s, v);
      v.message = recs.length ? `Got ${recs.join(', ')}. Position ${v.position} (memory only); committed is still ${v.committed}.` : 'No more records in this sandbox partition.';
    },
    async proc(s, v) {
      unfocus(v);
      const r = await processNext(s, v);
      v.message = !r ? 'The batch is empty: poll() first.' : r.skip ? `Order ${r.off} was already processed; the unique key skipped it.` : r.dup ? `Order ${r.off} was processed before the crash and has now been charged twice.` : `Order ${r.off} charged.`;
    },
    async commit(s, v) {
      unfocus(v);
      if (!v.started) { v.message = 'Poll first.'; return; }
      const skipped = v.batch.length;
      await commit(s, v);
      v.message = `Committed ${v.position}.` + (skipped ? ` ${skipped} record${skipped > 1 ? 's' : ''} of the batch ${skipped > 1 ? 'are' : 'is'} not processed yet: a crash now would skip ${skipped > 1 ? 'them' : 'it'}.` : '');
    },
    async crash(s, v) {
      unfocus(v);
      const unsafe = [...v.done].filter(o => o >= v.committed).length, lost = v.batch.filter(o => o < v.committed).length;
      await crash(s, v);
      await restart(s, v);
      v.message = `Restarted at the committed offset ${v.committed}.` + (unsafe ? ` ${unsafe} processed record${unsafe > 1 ? 's' : ''} after it will be delivered again.` : '') + (lost ? ` ${lost} committed but unprocessed record${lost > 1 ? 's are' : ' is'} lost.` : '');
    },
    readout: v => `Committed <b>${v.committed}</b> · position <b>${v.position}</b>${v.alive ? '' : ' (lost)'} · batch <b>${v.batch.join(' ') || '—'}</b> · charged <b>${v.rows.filter(r => r.textContent.includes('charged')).length}</b>, twice <b>${v.rows.filter(r => r.textContent.includes('AGAIN')).length}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Exactly-once with transactions, where to store offsets, and commit timing.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['commit', 'offs'],
        title: 'Exactly-once inside Kafka: transactions',
        text: 'When the side effect is writing to another Kafka topic, a transactional producer can send the output and the consumer\'s offsets in one transaction (sendOffsetsToTransaction). Readers with isolation.level=read_committed see both or neither. See the idempotence & exactly-once deep dive.',
        observe: 'Commit and output become one atomic step.',
        async run(s, v) { await swap(s, v.n.commit.s, 'sendOffsetsToTransaction', BLUE); },
      },
      {
        on: ['db', 'offs'],
        title: 'Or store the offset with the data',
        text: 'For a database side effect, write the offset into the same database transaction as the result, and on start seek() to it instead of using the committed offset. Then result and position can never disagree.',
        observe: 'The DB itself becomes the bookmark.',
        async run(s, v) { await swap(s, v.n.db.querySelector('text'), 'orders DB · also stores orders-0 → 103', BLUE); },
      },
      {
        on: ['commit'],
        title: 'commitSync, commitAsync and batch size',
        text: 'Committing after every record is safest but slow; per batch is the usual choice. commitAsync() does not block but does not retry, so use commitSync() on shutdown and in onPartitionsRevoked. Smaller batches mean fewer duplicates after a crash.',
        observe: 'Commit timing is a trade-off between speed and how much is re-read.',
        async run(s, v) { await swap(s, v.n.commit.s, 'async per batch · sync on close', MUTED); },
      },
    ],
  },
  takeaway: 'Only the committed offset survives a crash. Commit after processing → at-least-once (duplicates after a crash); commit before → at-most-once (gaps). Auto-commit commits in poll() every 5 s and is at-least-once if you finish each batch first. Make processing idempotent, or use transactions for exactly-once.',
  recap: {
    points: [
      'The position is in memory; the committed offset in __consumer_offsets survives.',
      'Restart (or rebalance) → resume at the committed offset.',
      'Process, then commit: at-least-once; a crash in between re-delivers.',
      'Commit, then process: at-most-once; a crash in between skips records.',
      'Auto-commit commits the previous poll\'s position inside poll(), every auto.commit.interval.ms.',
      'Fix duplicates with idempotent processing (unique keys, upserts) or transactions.',
    ],
    interview: [
      { q: 'Why do consumers sometimes process the same message twice?', a: 'Because the **committed offset** lags behind the work. If the consumer **crashes** (or loses its partitions in a **rebalance**) after processing records but **before committing**, the next owner starts from the last commit and **re-reads** them. That is **at-least-once** delivery, the default trade-off.' },
      { q: 'At-most-once vs at-least-once vs exactly-once?', a: '**At-most-once**: commit before processing; a crash loses records. **At-least-once**: process then commit; a crash duplicates. **Exactly-once**: Kafka **transactions** (offsets committed in the same transaction as the output, readers on read_committed) for Kafka-to-Kafka, or **idempotent** side effects / offsets stored with the data for external systems.' },
      { q: 'Is enable.auto.commit safe?', a: 'It commits the **previous poll\'s position** during a later **poll()**, every **auto.commit.interval.ms** (5 s). If you fully process each batch before polling again, it is **at-least-once** with up to 5 s of re-reads after a crash. If you process **asynchronously** and keep polling, it can commit unprocessed records and **lose** them.' },
      { q: 'How do you make a consumer idempotent?', a: 'Give each record a **natural id** and make the side effect **safe to repeat**: a **unique key** or **upsert** in the database, or a **processed-ids table** written in the same transaction as the effect. Then redeliveries change nothing.' },
    ],
  },
  quiz: {
    q: 'A consumer processes records 103 and 104, then crashes before committing. The last commit was 103. What happens after the restart?',
    options: ['It continues at 105', 'It re-reads 103 and 104, then continues', 'Records 103 and 104 are lost', 'Kafka knows they were processed and skips them'],
    answer: 1,
    why: 'Only the committed offset survives: 103. The consumer fetches 103 and 104 again (at-least-once), so processing must tolerate duplicates.',
  },
  related: ['commit-lag', 'rebalance', 'consumer'],
};
