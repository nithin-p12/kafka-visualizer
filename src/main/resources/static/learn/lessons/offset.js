// Lesson 4: the offset, a record's position number inside its partition.
import { el, place, PARTITION_COLORS as PC } from '../scene.js';

const GREY = '#9aa3a9', SLOT0 = 262, SLOT = 52, MAX = 12, Y = 150, CONSUMER = [550, 405];
const COMMIT = '#348747', RETRY = '#c57416', PURPLE = '#9d4ccc';
const slotX = i => SLOT0 + i * SLOT;

function scene(s, { consumer = false } = {}) {
  const v = { log: [], position: 0, committed: 0, start: 0 };
  v.producer = s.box(95, Y, 140, 56, 'Producer', { size: 13 });
  v.lane = s.box(555, Y, 700, 58, '', { stroke: PC[0] });
  s.text(v.lane, -332, 0, 'P0', { 'font-weight': 700, fill: PC[0] });
  s.text(v.lane, -350, -42, 'topic orders · partition 0', { 'text-anchor': 'start', 'font-size': 12, 'font-weight': 650, fill: '#1677ff' });
  v.metrics = s.text(s.root, 555, 30, '', { 'font-size': 13, 'font-family': 'Consolas, monospace', fill: '#614373' });
  v.consumer = s.box(...CONSUMER, 190, 60, 'Consumer', { sub: 'group: billing' });
  v.cursor = s.g(slotX(0), Y - 48);
  el('path', { d: 'M-8 -6H8L0 6Z', fill: '#1677ff' }, v.cursor);
  s.text(v.cursor, 0, -16, 'position', { 'font-size': 11, 'font-weight': 650, fill: '#1677ff' });
  v.flag = s.g(slotX(0), Y + 62);
  el('path', { d: 'M-8 6H8L0 -6Z', fill: COMMIT }, v.flag);
  v.flag.label = s.text(v.flag, 0, 18, 'committed', { 'font-size': 11, 'font-weight': 650, fill: COMMIT });
  if (!consumer) for (const n of [v.consumer, v.cursor, v.flag]) n.setAttribute('opacity', 0);
  return v;
}
function metrics(v, extra = '') {
  const end = v.log.length, lag = end - v.committed;
  v.metrics.textContent = `log-end offset ${end} · position ${v.position} · committed ${v.committed} · lag ${lag}${extra}`;
}
async function produce(s, v, { label = true } = {}) {
  const i = v.log.length;
  if (i >= MAX) return null;
  const b = s.block(v.producer._x + 62, Y, '', GREY);
  await s.move(b, slotX(i), Y, 520);
  b.rect.setAttribute('fill', PC[0]);
  b.offset = s.text(s.root, slotX(i), Y + 40, `${i}`, { 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace' });
  if (label) await s.pop(b.offset, 220);
  v.log.push(b);
  return b;
}
async function read(s, v, color = PC[0]) {
  const b = v.log[v.position];
  const c = s.block(b._x, b._y, `${v.position}`, color);
  await s.move(c, CONSUMER[0], CONSUMER[1] - 30, 560);
  c.remove();
  v.position++;
  await s.move(v.cursor, slotX(v.position), Y - 48, 280);
  metrics(v);
}
async function commit(s, v) {
  const c = s.block(CONSUMER[0], CONSUMER[1] - 30, `${v.position}`, COMMIT);
  await s.move(c, slotX(v.position), Y + 84, 520);
  c.remove();
  v.committed = v.position;
  await s.move(v.flag, slotX(v.committed), Y + 62, 300);
  metrics(v);
}
async function crashRestart(s, v) {
  v.consumer.rect.setAttribute('stroke', '#ce3434'); v.consumer.rect.setAttribute('fill', '#fff4f4');
  v.consumer.label.textContent = '✕ crashed';
  await Promise.all([s.shake(v.consumer), s.fade(v.cursor, .15, 300)]);
  await s.wait(700);
  v.consumer.rect.setAttribute('stroke', '#babdbe'); v.consumer.rect.setAttribute('fill', '#fff');
  v.consumer.label.textContent = 'Consumer (restarted)';
  v.position = v.committed;
  await Promise.all([s.fade(v.cursor, 1, 300), s.move(v.cursor, slotX(v.position), Y - 48, 500)]);
  metrics(v);
}

export default {
  id: 'offset', n: 4, title: 'Offset', tagline: 'A record\'s permanent position number in its partition',
  guide: {
    what: 'An offset is the sequence number a record gets when it is written to a partition: 0, 1, 2… Consumers use offsets to remember where they are.',
    fits: 'Partitions are ordered logs; offsets are the numbers along that log. Next: the server that stores all of this (broker).',
  },
  watch: {
    build(s) { return scene(s); },
    steps: [
      {
        title: 'Every record gets a number',
        text: 'When a record is appended to a partition, the broker gives it the next number: 0, 1, 2, 3… That number is its offset, its permanent position in this log.',
        observe: 'The number under each block appears the moment it is written.',
        focus: v => v.log.map(b => b.offset),
        async run(s, v) { for (let i = 0; i < 4; i++) await produce(s, v); },
      },
      {
        title: 'Offsets only ever go up',
        text: 'The producer never chooses offsets; the broker assigns them. They are never reused, never renumbered and never skipped backwards.',
        observe: 'Offsets 4 and 5 continue the sequence.',
        focus: v => v.log.slice(4).map(b => b.offset),
        async run(s, v) { await produce(s, v); await produce(s, v); },
      },
      {
        title: 'Offsets are per partition',
        text: 'Partition P1 has its own sequence starting at 0. Offset 2 in P0 and offset 2 in P1 are different records. A record\'s full address is (topic, partition, offset), for example orders-0 @ 2.',
        observe: 'Both highlighted records have offset 2, but they live in different partitions.',
        focus: v => [v.log[2], v.p1log[2]],
        async run(s, v) {
          v.p1 = s.box(555, 300, 700, 58, '', { stroke: PC[1] });
          s.text(v.p1, -332, 0, 'P1', { 'font-weight': 700, fill: PC[1] });
          await s.show(v.p1, 300);
          v.p1log = [];
          for (let i = 0; i < 3; i++) {
            const b = s.block(slotX(i), 300, '', PC[1]);
            s.text(v.p1, slotX(i) - 555, 40, `${i}`, { 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace' });
            await s.pop(b, 200);
            v.p1log.push(b);
          }
          const a0 = s.note(slotX(2) + 150, Y - 48, 'orders-0 @ 2', { 'font-weight': 700, fill: PC[0] });
          const a1 = s.note(slotX(2) + 150, 300 - 46, 'orders-1 @ 2', { 'font-weight': 700, fill: PC[1] });
          v.addresses = [a0, a1];
          await Promise.all([s.show(a0), s.show(a1), s.pulse(v.log[2]), s.pulse(v.p1log[2])]);
        },
      },
      {
        title: 'A consumer reads by offset',
        text: 'The consumer keeps a position: the offset of the next record it will read. It starts at 0, and after reading 0, 1 and 2 its position is 3.',
        observe: 'The blue "position" arrow moves forward after each record is read.',
        focus: v => [v.cursor, v.consumer],
        async run(s, v) {
          await Promise.all([s.fade(v.p1, 0, 300), ...v.p1log.map(b => s.fade(b, 0, 300)), ...v.addresses.map(a => s.fade(a, 0, 300))]);
          await Promise.all([s.show(v.consumer), s.show(v.cursor)]);
          metrics(v);
          for (let i = 0; i < 3; i++) await read(s, v);
        },
      },
      {
        title: 'Committing saves a bookmark',
        text: 'Every so often the consumer commits its position back to Kafka: "committed offset = 3". It means "everything before offset 3 is done". It is a bookmark that survives restarts.',
        observe: 'The green "committed" marker moves to offset 3.',
        focus: v => [v.flag],
        async run(s, v) { await s.show(v.flag, 200); await commit(s, v); },
      },
      {
        title: 'Crash and resume from the bookmark',
        text: 'The consumer reads 3 and 4 but crashes before committing. After restarting it resumes from the committed offset (3), not from where it was (5). Records 3 and 4 are read again. This is why Kafka is "at-least-once" by default.',
        observe: 'After the restart the position jumps back to the green marker, and offset 3 is re-read in orange.',
        focus: v => [v.cursor, v.flag],
        async run(s, v) {
          await read(s, v); await read(s, v);
          await crashRestart(s, v);
          await read(s, v, RETRY);
        },
      },
      {
        title: 'Log-end offset and lag',
        text: 'The log-end offset is the next offset to be written (6 here). Lag = log-end − committed: how many records are not yet confirmed done. When the consumer catches up and commits, lag drops to 0.',
        observe: 'Watch "lag" in the purple line at the top fall to 0.',
        focus: v => [v.metrics, v.end],
        async run(s, v) {
          v.end = s.g(slotX(v.log.length), Y);
          el('rect', { x: -17, y: -12, width: 34, height: 24, rx: 3, fill: 'none', stroke: PURPLE, 'stroke-dasharray': '4 3' }, v.end);
          s.text(v.end, 0, 40, 'log-end', { 'font-size': 11, 'font-weight': 650, fill: PURPLE });
          await s.show(v.end);
          await s.pulse(v.metrics);
          await read(s, v, RETRY); await read(s, v);
          await commit(s, v);
        },
      },
    ],
  },
  tryIt: {
    intro: 'You control both sides. Produce records, read them, commit, and crash the consumer. Keep an eye on the numbers at the top.',
    observe: 'Crash before committing and see which offset the consumer re-reads. Lag only falls when you commit.',
    controls: [
      { type: 'button', label: 'Produce record', run: 'produce' },
      { type: 'button', label: 'Read next', primary: true, run: 'read' },
      { type: 'button', label: 'Commit position', run: 'commit' },
      { type: 'button', label: 'Crash & restart', run: 'crash' },
    ],
    build(s) {
      const v = scene(s, { consumer: true });
      for (let i = 0; i < 4; i++) {
        const b = s.block(slotX(i), Y, '', PC[0]);
        b.offset = s.text(s.root, slotX(i), Y + 40, `${i}`, { 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace' });
        v.log.push(b);
      }
      v.message = 'The consumer starts at offset 0 with nothing committed yet.';
      metrics(v);
      return v;
    },
    async produce(s, v) { v.message = (await produce(s, v)) ? `Written at offset ${v.log.length - 1}. Log-end is now ${v.log.length}.` : 'The sandbox partition is full.'; metrics(v); },
    async read(s, v) {
      if (v.position >= v.log.length) { v.message = 'Nothing new to read. A real consumer\'s poll() would return empty and it would wait.'; return; }
      const again = v.position < v.highest;
      await read(s, v, again ? RETRY : PC[0]);
      v.highest = Math.max(v.highest ?? 0, v.position);
      v.message = again ? `Re-read offset ${v.position - 1}: it was processed before the crash but never committed.` : `Read offset ${v.position - 1}. Position is now ${v.position}, but nothing is saved until you commit.`;
    },
    async commit(s, v) { await commit(s, v); v.message = `Committed ${v.committed}: everything before offset ${v.committed} is done.`; },
    async crash(s, v) { await crashRestart(s, v); v.message = `Restarted from committed offset ${v.committed}.`; },
    readout: v => v.message,
  },
  deeper: {
    note: 'What happens when old offsets are deleted, and where commits are stored.',
    build(s) {
      const v = scene(s, { consumer: true });
      for (let i = 0; i < 6; i++) {
        const b = s.block(slotX(i), Y, '', PC[0]);
        b.offset = s.text(s.root, slotX(i), Y + 40, `${i}`, { 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace' });
        v.log.push(b);
      }
      v.committed = 1; v.position = 1;
      for (const n of [v.cursor, v.flag]) place(n, slotX(1), n._y);
      metrics(v);
      return v;
    },
    steps: [
      {
        title: 'Old records expire, offsets stay',
        text: 'Retention deletes the oldest records. The remaining records keep their numbers; the log just starts later now. The first available offset is called the log-start offset (3 here).',
        observe: 'Offsets 0 to 2 vanish; 3, 4 and 5 keep their numbers.',
        focus: v => [v.startLabel],
        async run(s, v) {
          await Promise.all(v.log.slice(0, 3).flatMap(b => [s.fade(b, 0, 600), s.fade(b.offset, .2, 600)]));
          v.startLabel = s.note(slotX(3), Y + 102, 'log-start offset = 3', { 'font-weight': 700, fill: PURPLE });
          await s.show(v.startLabel);
        },
      },
      {
        title: 'Asking for an offset that no longer exists',
        text: 'This consumer\'s committed offset is 1, which was deleted. Kafka responds "offset out of range", and the consumer\'s auto.offset.reset setting decides: earliest jumps to 3, latest jumps to the log end (6). A brand-new group with no commit follows the same rule.',
        observe: 'The cursor jumps to 3 (earliest). The ghost arrow at 6 shows where latest would go.',
        focus: v => [v.cursor, v.ghost],
        async run(s, v) {
          const err = s.note(slotX(1), Y - 96, 'OffsetOutOfRange', { 'font-weight': 700, fill: '#ce3434' });
          await s.show(err);
          await s.shake(v.cursor);
          await s.move(v.cursor, slotX(3), Y - 48, 600);
          v.position = 3; metrics(v, ' · reset=earliest');
          v.ghost = s.g(slotX(6), Y - 48, s.root, { opacity: .45 });
          el('path', { d: 'M-8 -6H8L0 6Z', fill: '#1677ff' }, v.ghost);
          s.text(v.ghost, 0, -16, 'latest', { 'font-size': 11, 'font-weight': 650, fill: '#1677ff' });
          await s.pop(v.ghost);
        },
      },
      {
        title: 'Commits are records too',
        text: 'Committed offsets are stored in an internal topic named __consumer_offsets, keyed by (group, topic, partition). That is how a restarted or replaced consumer finds its bookmark.',
        observe: 'The commit travels into the internal topic as an ordinary record.',
        focus: v => [v.internal],
        async run(s, v) {
          v.internal = s.box(820, 405, 250, 56, '__consumer_offsets', { size: 13, stroke: COMMIT, color: COMMIT, sub: 'internal topic' });
          await s.show(v.internal);
          const c = s.box(CONSUMER[0], CONSUMER[1], 210, 30, '(billing, orders-0) → 3', { size: 11, fill: '#eef7e8', stroke: COMMIT, rx: 4 });
          await s.pop(c, 250);
          await s.move(c, 820, 405, 800);
          await s.fade(c, 0, 250);
          v.committed = 3; metrics(v);
          await s.move(v.flag, slotX(3), Y + 62, 300);
        },
      },
    ],
  },
  takeaway: 'An offset is a record\'s number within its partition, assigned by the broker and always increasing. Position = next to read. Committed = saved bookmark. Lag = log-end − committed.',
  quiz: {
    q: 'A consumer committed offset 5 for partition 0 and then restarted. Which record does it read first?',
    options: ['Offset 4', 'Offset 5', 'Offset 6', 'Offset 0'],
    answer: 1,
    why: 'The committed offset is the next record to read, not the last one processed. Committing 5 means offsets 0 to 4 are done, so it resumes at 5.',
  },
  related: ['partition', 'broker'],
};
