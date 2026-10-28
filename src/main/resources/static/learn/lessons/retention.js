// Lesson 12: retention, how long records live and what happens to a consumer that falls behind.
import { place, PARTITION_COLORS as PC } from '../scene.js';
import { RED, GREEN, AMBER, MUTED } from './kit.js';

const BLUE = '#1677ff', CLOSED = '#8fa3b8';
const BLOCK = { w: 28, h: 26, size: 12 };

// ---------- shared drawing ----------
// A segment file: a rounded box with its name inside and its age above.
function segment(s, x, y, w, name) {
  const g = s.box(x, y, w, 72, '', { stroke: BLUE, rx: 8 });
  g.rect.setAttribute('stroke-width', 2.4);
  g.name = s.text(g, 0, -22, name, { 'font-size': 13, 'font-weight': 700, fill: '#3d4a55' });
  g.age = s.text(g, 0, -50, 'active', { 'font-size': 14, 'font-weight': 650, fill: BLUE });
  g.blocks = [];
  return g;
}
function closeSeg(g) {
  g.rect.setAttribute('stroke', CLOSED);
  g.rect.setAttribute('stroke-width', 1.6);
  g.age.setAttribute('fill', MUTED);
  g.age.setAttribute('font-weight', 400);
}
function setAge(g, days) { g.age.textContent = `${days} day${days === 1 ? '' : 's'} old`; }
async function deleteSeg(s, g) {
  g.rect.setAttribute('stroke', RED);
  g.rect.setAttribute('stroke-dasharray', '6 5');
  g.rect.setAttribute('fill', '#fff8f8');
  g.age.textContent = 'deleted';
  g.age.setAttribute('fill', RED);
  g.age.setAttribute('font-weight', 650);
  await s.shake(g);
  await Promise.all(g.blocks.map(b => s.fade(b, .12, 450)));
}
// An upward arrow with a label under it, marking an offset position under the log.
function marker(s, y0, color, label) {
  const g = s.g(0, 0);
  s.line(0, y0 + 48, 0, y0 + 4, { parent: g, stroke: color, width: 2 });
  g.label = s.text(g, 0, y0 + 62, label, { 'font-size': 14, 'font-weight': 700, fill: color });
  g.setAttribute('opacity', 0);
  return g;
}
// The consumer box sits below the log; its pointer line aims at the offset it will read next.
function consumer(s, x, y, ptrY) {
  const c = s.box(x, y, 170, 56, 'Consumer', { size: 16, sub: 'position 0', subSize: 13 });
  c.ptr = s.line(x, y - 30, x, ptrY, { stroke: AMBER, width: 2 });
  Object.assign(c, { ptrY, at: x });
  return c;
}
function aim(s, c, px, ms = 400) {
  const bx0 = c._x, bx1 = Math.max(100, Math.min(840, px)), p0 = c.at;
  c.at = px;
  return s.clock.tween(ms, t => {
    const bx = bx0 + (bx1 - bx0) * t;
    place(c, bx, c._y);
    c.ptr.setAttribute('x1', bx);
    c.ptr.setAttribute('x2', p0 + (px - p0) * t);
  });
}

// ---------- watch ----------
// Five segment slots for partition orders-0. Segment k is written on day k and holds offsets 3k..3k+2.
const SEG_X = k => 330 + 122 * k, SEG_Y = 175, MARK_Y = 200;
const recX = o => SEG_X(Math.floor(o / 3)) + (o % 3 - 1) * 34;

function scene(s) {
  const v = { segs: [], day: 0, start: 0, end: 0 };
  s.note(600, 40, 'partition orders-0 · retention.ms = 3 days in this demo', { 'font-size': 16, 'font-weight': 650, fill: BLUE });
  v.clock = s.box(140, 60, 170, 52, '⏱ Day 0', { size: 19, weight: 700, stroke: '#203347', rx: 10 });
  v.startM = marker(s, MARK_Y, AMBER, 'log start 0');
  v.endM = marker(s, MARK_Y, BLUE, 'log end 0');
  place(v.startM, recX(0), 0); place(v.endM, recX(0), 0);
  v.cons = consumer(s, 160, 390, 292);
  v.cons.setAttribute('opacity', 0); v.cons.ptr.setAttribute('opacity', 0);
  place(v.cons, 160, 390);
  v.cons.ptr.setAttribute('x1', 160); v.cons.ptr.setAttribute('x2', recX(0)); v.cons.at = recX(0);
  return v;
}
async function newSeg(s, v) {
  const k = v.segs.length;
  if (k) closeSeg(v.segs[k - 1]);
  const g = segment(s, SEG_X(k), SEG_Y, 112, `segment ${k + 1}`);
  g.day = v.day;
  v.segs.push(g);
  await s.show(g, 300);
  return g;
}
async function append(s, v, ms = 160) {
  const o = v.end, g = v.segs.at(-1);
  const b = s.block((o % 3 - 1) * 34, 12, `${o}`, PC[0], { parent: g, ...BLOCK });
  g.blocks.push(b);
  g.day = v.day;
  await s.pop(b, ms);
  v.end++;
  v.endM.label.textContent = `log end ${v.end}`;
  await s.move(v.endM, recX(v.end), 0, ms);
}
async function setDay(s, v, d) {
  v.day = d;
  v.clock.label.textContent = `⏱ Day ${d}`;
  await s.pulse(v.clock);
  for (const g of v.segs.slice(0, -1)) if (!g.deleted) setAge(g, d - g.day);
}
async function expire(s, v, k) {
  const g = v.segs[k];
  g.deleted = true;
  await deleteSeg(s, g);
  v.start = 3 * (k + 1);
  v.startM.label.textContent = `log start ${v.start}`;
  await s.move(v.startM, recX(v.start), 0, 500);
}
const setPos = (c, p) => { c.pos = p; c.sub.textContent = `position ${p}`; };

const watch = {
  build: scene,
  steps: [
    {
      title: 'A partition is stored as segment files',
      text: 'On disk, each partition is a series of files called segments. New records are only appended to the newest one, the active segment. When it gets big (segment.bytes, 1 GiB) or old (segment.ms, 7 days) it is closed and a new one starts. Here a new segment starts every day.',
      observe: 'Records 0 to 2 fill segment 1; on day 1 segment 2 becomes the active one.',
      focus: v => v.segs,
      async run(s, v) {
        await newSeg(s, v);
        await Promise.all([s.show(v.startM, 250), s.show(v.endM, 250)]);
        for (let i = 0; i < 3; i++) await append(s, v);
        await setDay(s, v, 1);
        await newSeg(s, v);
        setAge(v.segs[0], 1);
        for (let i = 0; i < 3; i++) await append(s, v);
      },
    },
    {
      title: 'Reading never deletes',
      text: 'A consumer reads records 0 to 2. They stay exactly where they were: reading only moves the consumer\'s position forward. This consumer is slow, and now it stops for a while.',
      observe: 'The consumer\'s position moves to 3, and records 0 to 2 are still stored.',
      focus: v => [v.cons, v.segs[0]],
      async run(s, v) {
        await Promise.all([s.show(v.cons, 300), s.show(v.cons.ptr, 300)]);
        setPos(v.cons, 0);
        for (let o = 0; o < 3; o++) {
          await s.pulse(v.segs[0].blocks[o]);
          setPos(v.cons, o + 1);
          await aim(s, v.cons, recX(o + 1), 300);
        }
      },
    },
    {
      title: 'Retention sets how long records live',
      text: 'Each topic has a retention time, retention.ms: 7 days by default, 3 days in this demo. There is also a size limit per partition, retention.bytes, which is unlimited (-1) by default. As days pass, new segments start and the closed ones get older.',
      observe: 'The clock moves to day 2, segment 3 starts, and the closed segments show their age.',
      focus: v => [v.clock, v.segs[0].age, v.segs[1].age],
      async run(s, v) {
        await setDay(s, v, 2);
        await newSeg(s, v);
        setAge(v.segs[1], 1);
        for (let i = 0; i < 3; i++) await append(s, v);
      },
    },
    {
      title: 'Old segments are deleted, whole',
      text: 'On day 3 segment 1 is 3 days old, so Kafka deletes the whole file. It deletes only closed segments, never the active one, and only once a segment\'s newest record has expired, so some records live a little longer than retention.ms.',
      observe: 'Segment 1 turns red and its records fade; log start moves from 0 to 3.',
      focus: v => [v.segs[0], v.startM],
      async run(s, v) {
        await setDay(s, v, 3);
        await newSeg(s, v);
        setAge(v.segs[2], 1);
        for (let i = 0; i < 3; i++) await append(s, v);
        await expire(s, v, 0);
      },
    },
    {
      title: 'Unread records are deleted too',
      text: 'On day 4 segment 2 expires as well. The consumer never read records 3 to 5, but retention does not care who has read what. The log start offset, the first offset still stored, moves forward to 6.',
      observe: 'Segment 2 is deleted although the consumer still points at offset 3.',
      focus: v => [v.segs[1], v.startM, v.cons],
      async run(s, v) {
        await setDay(s, v, 4);
        await newSeg(s, v);
        setAge(v.segs[3], 1);
        await expire(s, v, 1);
      },
    },
    {
      title: 'Offsets are never reused',
      text: 'New records keep counting up from the log end: 12, 13, 14. Deleting old segments never renumbers the records that are left, and offsets 0 to 5 are never handed out again.',
      observe: 'Records 12 to 14 go into the active segment; log end moves to 15.',
      focus: v => [v.segs[4], v.endM],
      async run(s, v) {
        for (let i = 0; i < 3; i++) await append(s, v, 220);
      },
    },
    {
      title: 'A slow consumer can fall off the start',
      text: 'The consumer wakes up and asks for offset 3, which no longer exists. Its position is out of range, so auto.offset.reset decides: latest (the default) jumps to the log end, earliest to the log start. Either way records 3 to 5 are lost to it.',
      observe: 'Offset 3 is out of range, so the consumer jumps to the log end (15).',
      focus: v => [v.cons, v.lost],
      async run(s, v) {
        v.cons.rect.setAttribute('stroke', RED);
        v.cons.sub.textContent = 'position 3 · out of range';
        v.cons.sub.setAttribute('fill', RED);
        await s.shake(v.cons);
        await s.wait(300);
        v.cons.rect.setAttribute('stroke', '#babdbe');
        v.cons.sub.setAttribute('fill', MUTED);
        setPos(v.cons, 15);
        v.cons.sub.textContent = 'position 15 · latest';
        await aim(s, v.cons, recX(15), 700);
        v.lost = s.note(500, 440, 'lost: 3 to 5 deleted · skipped: 6 to 14 (with latest)', { 'font-size': 15, 'font-weight': 650, fill: RED });
        await s.show(v.lost, 300);
      },
    },
  ],
};

// ---------- try it ----------
const T_X = i => 150 + 114 * i, T_Y = 190, T_MARK = 215, T_MAX = 7, PER_SEG = 3;
function tPos(v, o) {
  // Root x of offset o: a stored record, the next free slot, or (before the log start) left of the first segment.
  if (o < v.start) return 60;
  for (const [i, g] of v.segs.entries()) {
    const k = g.offs.indexOf(o);
    if (k >= 0) return T_X(i) + (k - 1) * 30;
  }
  const last = v.segs.at(-1);
  return last && last.offs.length < PER_SEG ? T_X(v.segs.length - 1) + (last.offs.length - 1) * 30 : T_X(v.segs.length) - 30;
}
function tLabels(v) {
  // Labels sit to either side of their arrows so neighbouring markers never collide; an empty log gets one label.
  const same = v.start === v.end;
  v.startM.label.textContent = same ? `log start = log end = ${v.end}` : `log start ${v.start}`;
  v.startM.label.setAttribute('text-anchor', same ? 'middle' : 'end');
  v.startM.label.setAttribute('x', same ? 0 : 8);
  v.endM.label.textContent = `log end ${v.end}`;
  v.endM.label.setAttribute('text-anchor', 'start');
  v.endM.label.setAttribute('x', -8);
  v.endM.label.setAttribute('opacity', same ? 0 : 1);
  v.cons.sub.textContent = `position ${v.pos}${v.pos < v.start ? ' · out of range' : ''}`;
  v.cons.sub.setAttribute('fill', v.pos < v.start ? RED : MUTED);
  v.cons.rect.setAttribute('stroke', v.pos < v.start ? RED : '#babdbe');
}
async function tMarks(s, v, ms = 250) {
  tLabels(v);
  await Promise.all([s.move(v.startM, v.segs.length ? tPos(v, v.start) : tPos(v, v.end), 0, ms), s.move(v.endM, tPos(v, v.end), 0, ms), aim(s, v.cons, tPos(v, v.pos), ms)]);
}
function tSeg(s, v) {
  if (v.segs.length) closeSeg(v.segs.at(-1));
  const g = segment(s, T_X(v.segs.length), T_Y, 104, `segment ${++v.made}`);
  Object.assign(g, { offs: [], day: v.day });
  v.segs.push(g);
  return g;
}

const tryIt = {
  intro: 'Produce records into orders-0 and move the clock a day at a time. A segment closes each day or when it holds 3 records. Let the consumer fall behind and see what it loses.',
  observe: 'Only closed segments are deleted, whole, once their newest record is older than retention. Offsets keep counting up. A consumer left before the log start is reset by auto.offset.reset.',
  controls: [
    { type: 'choice', name: 'ret', label: 'retention.ms', options: ['2 days', '4 days'], rebuild: true },
    { type: 'choice', name: 'reset', label: 'auto.offset.reset', options: ['latest', 'earliest'] },
    { type: 'button', label: 'Produce 2 records', primary: true, run: 'produce' },
    { type: 'button', label: '+1 day', run: 'day' },
    { type: 'button', label: 'Consumer reads 3', run: 'read' },
  ],
  build(s, input) {
    const v = { segs: [], day: 0, start: 0, end: 0, pos: 0, made: 0, ret: parseInt(input.ret, 10) };
    s.note(560, 40, `partition orders-0 · retention.ms = ${v.ret} days · segment rolls daily or at 3 records`, { 'font-size': 15, 'font-weight': 650, fill: BLUE });
    v.clock = s.box(100, 90, 150, 48, '⏱ Day 0', { size: 18, weight: 700, stroke: '#203347', rx: 10 });
    v.startM = marker(s, T_MARK, AMBER, 'log start 0');
    v.endM = marker(s, T_MARK, BLUE, 'log end 0');
    v.startM.setAttribute('opacity', 1); v.endM.setAttribute('opacity', 1);
    v.cons = consumer(s, 150, 380, 307);
    tSeg(s, v);
    for (const m of [v.startM, v.endM]) place(m, tPos(v, 0), 0);
    v.cons.at = tPos(v, 0); v.cons.ptr.setAttribute('x2', v.cons.at);
    tLabels(v);
    v.message = 'Press Produce, then +1 day a few times.';
    return v;
  },
  async produce(s, v) {
    for (let k = 0; k < 2; k++) {
      let g = v.segs.at(-1);
      if (g.offs.length >= PER_SEG) {
        if (v.segs.length >= T_MAX) { v.message = 'No room for another segment in this sandbox. Press +1 day so retention can delete old ones.'; await tMarks(s, v); return; }
        g = tSeg(s, v);
        await s.show(g, 200);
      }
      const o = v.end++;
      const b = s.block((g.offs.length - 1) * 30, 12, `${o}`, PC[0], { parent: g, ...BLOCK, w: 26 });
      g.offs.push(o); g.blocks.push(b); g.day = v.day;
      await s.pop(b, 160);
    }
    await tMarks(s, v);
    v.message = `Records ${v.end - 2} and ${v.end - 1} were appended to the active segment.`;
  },
  async day(s, v) {
    v.day++;
    v.clock.label.textContent = `⏱ Day ${v.day}`;
    await s.pulse(v.clock);
    // Retention check: delete closed segments whose newest record has reached the retention age.
    const gone = v.segs.slice(0, -1).filter(g => v.day - g.day >= v.ret);
    for (const g of gone) await deleteSeg(s, g);
    if (gone.length) {
      await Promise.all(gone.map(g => s.fade(g, 0, 300)));
      for (const g of gone) g.remove();
      v.segs = v.segs.filter(g => !gone.includes(g));
      v.start = v.segs.find(g => g.offs.length)?.offs[0] ?? v.end;
    }
    // Time-based roll: the active segment closes after a day if it holds records.
    let rolled = false;
    if (v.segs.at(-1).offs.length && v.segs.length < T_MAX) { const g = tSeg(s, v); rolled = true; g.setAttribute('opacity', 0); }
    for (const g of v.segs.slice(0, -1)) setAge(g, v.day - g.day);
    await Promise.all(v.segs.map((g, i) => s.move(g, T_X(i), T_Y, 350)));
    if (rolled) await s.show(v.segs.at(-1), 200);
    await tMarks(s, v, 350);
    const lostNow = v.pos < v.start;
    v.message = (gone.length ? `Day ${v.day}: ${gone.length} segment${gone.length > 1 ? 's' : ''} reached ${v.ret} days and ${gone.length > 1 ? 'were' : 'was'} deleted. Log start is now ${v.start}.` : `Day ${v.day}: nothing has reached ${v.ret} days yet.`)
      + (rolled ? ' The active segment closed and a new one started.' : '')
      + (lostNow ? ` The consumer's position ${v.pos} is now before the log start.` : '');
  },
  async read(s, v, input) {
    if (v.pos < v.start) {
      const from = v.pos;
      v.pos = input.reset === 'earliest' ? v.start : v.end;
      await s.shake(v.cons);
      await tMarks(s, v, 500);
      v.message = `Offset ${from} no longer exists, so auto.offset.reset = ${input.reset} moved the consumer to ${v.pos}. Records ${from} to ${v.start - 1} were deleted before it read them`
        + (input.reset === 'latest' && v.end > v.start ? `, and it skipped ${v.start} to ${v.end - 1} too.` : '.');
      return;
    }
    const n = Math.min(3, v.end - v.pos);
    if (!n) { v.message = 'The consumer is caught up: nothing new to read.'; return; }
    for (let k = 0; k < n; k++) {
      const g = v.segs.find(x => x.offs.includes(v.pos));
      await s.pulse(g.blocks[g.offs.indexOf(v.pos)]);
      v.pos++;
      await tMarks(s, v, 200);
    }
    v.message = `The consumer read ${n} record${n > 1 ? 's' : ''}. They are still stored: reading never deletes.`;
  },
  readout: v => `Day <b>${v.day}</b> · Log start <b style="color:${AMBER}">${v.start}</b> · Log end <b style="color:${BLUE}">${v.end}</b> · Consumer position <b style="color:${v.pos < v.start ? RED : '#203347'}">${v.pos}${v.pos < v.start ? ' (out of range)' : ''}</b> · Lag <b>${v.end - v.pos}</b><br>${v.message}`,
};

// ---------- go deeper: compaction ----------
const KEY_COLORS = { A: '#4f7bd9', B: '#d9962b', C: '#3aa58a', D: '#9e579e' };
const RECS = ['A:1', 'B:1', 'A:2', 'C:1', 'A:3', 'B:2', 'D:1', 'A:4'];
const C_X = o => 300 + 76 * o, C_Y = 200;
function crec(s, v, o, label, color) {
  const g = s.g(C_X(o), C_Y);
  g.block = s.block(0, 0, label, color, { parent: g, w: 54, h: 38, size: 14 });
  g.off = s.text(g, 0, -36, `${o}`, { 'font-size': 14, 'font-weight': 700, fill: MUTED });
  v.recs[o] = g;
  return g;
}
async function compactAway(s, g) {
  g.block.rect.setAttribute('fill', '#fff');
  g.block.rect.setAttribute('stroke', '#c9ced2');
  g.block.rect.setAttribute('stroke-dasharray', '4 4');
  await s.fade(g, .25, 450);
}
const deeper = {
  note: 'Compaction in more depth: latest value per key, tombstones, and gaps in offsets.',
  build(s) {
    const v = { recs: [] };
    s.note(600, 60, 'topic users · cleanup.policy = compact', { 'font-size': 17, 'font-weight': 650, fill: '#9d4ccc' });
    RECS.forEach((r, o) => crec(s, v, o, r, KEY_COLORS[r[0]]));
    v.read = s.note(600, 300, 'Read from offset 0: A:1 · B:1 · A:2 · C:1 · A:3 · B:2 · D:1 · A:4', { 'font-size': 15, 'font-family': 'Consolas, monospace', fill: '#3d4a55' });
    return v;
  },
  steps: [
    {
      title: 'Compaction keeps the latest value per key',
      text: 'A background cleaner rewrites closed segments, dropping any record whose key has a newer value later in the log. The survivors keep their original offsets, so the log now has gaps: offsets 0, 1, 2 and 4 are simply skipped by readers.',
      observe: 'Older A and B values fade; 3, 5, 6 and 7 survive with their offsets.',
      focus: v => [...[3, 5, 6, 7].map(o => v.recs[o]), v.read],
      async run(s, v) {
        await s.wait(300);
        await Promise.all([0, 1, 2, 4].map(o => compactAway(s, v.recs[o])));
        v.read.textContent = 'Read from offset 0: 3 C:1 · 5 B:2 · 6 D:1 · 7 A:4';
        await s.pulse(v.read);
      },
    },
    {
      title: 'A tombstone deletes a key',
      text: 'To delete a key from a compacted topic, produce a record with that key and a null value: a tombstone. Compaction then removes every older record for the key, but keeps the tombstone for a while so consumers learn that B was deleted.',
      observe: 'Tombstone B:null arrives at offset 8 and B:2 is compacted away.',
      focus: v => [v.recs[8], v.recs[5]],
      async run(s, v) {
        const t = crec(s, v, 8, 'B:null', '#65727a');
        t.block.rect.setAttribute('stroke', RED);
        t.block.rect.setAttribute('stroke-width', 2);
        await s.pop(t, 300);
        await s.wait(250);
        await compactAway(s, v.recs[5]);
        v.read.textContent = 'Read from offset 0: 3 C:1 · 6 D:1 · 7 A:4 · 8 B deleted';
        await s.pulse(v.read);
      },
    },
    {
      title: 'Tombstones go after delete.retention.ms',
      text: 'The tombstone itself is removed after delete.retention.ms (1 day by default). A consumer that reads the topic within that time sees the delete; one that is further behind may never see it and keep an old value for B.',
      observe: 'A day later the tombstone disappears too; key B is gone.',
      focus: v => [v.recs[8], v.clock],
      async run(s, v) {
        v.clock = s.note(860, 130, '⏱ 1 day later', { 'font-size': 15, 'font-weight': 650, fill: '#3d4a55' });
        await s.show(v.clock, 300);
        await compactAway(s, v.recs[8]);
        v.read.textContent = 'Read from offset 0: 3 C:1 · 6 D:1 · 7 A:4';
        await s.pulse(v.read);
      },
    },
  ],
};

export default {
  id: 'retention', n: 12, title: 'Retention', tagline: 'When old records disappear',
  guide: {
    what: 'Kafka does not keep records forever. Each topic deletes old data by age (retention.ms) or size (retention.bytes), a whole segment file at a time, whether or not anyone has read it.',
    fits: 'Last atom: once you know records, partitions, brokers, producers and consumers, retention explains how long data lives. Next level (coming soon): Links, how these pieces talk to each other.',
  },
  watch,
  tryIt,
  deeper,
  takeaway: 'Records are deleted by age or size, never by reading. Kafka drops whole closed segments, the log start offset moves forward, and offsets are never reused. A consumer that falls behind the log start loses what was deleted and restarts where auto.offset.reset says.',
  recap: {
    points: [
      'retention.ms (7 days by default) and retention.bytes (per partition, unlimited by default) decide how long records live.',
      'Reading never deletes: records expire whether or not anyone read them.',
      'A partition is stored as segment files; only closed segments are deleted, whole. The active segment is never deleted.',
      'Deleting moves the log start offset forward; offsets are never renumbered or reused.',
      'A consumer whose position is before the log start is reset by auto.offset.reset (latest by default, or earliest).',
    ],
    interview: [
      { q: 'When does Kafka delete a record?', a: 'Never because it was **read**. With **cleanup.policy=delete**, a closed segment is deleted once its newest record is older than **retention.ms** (7 days by default), or when the partition is larger than **retention.bytes** (unlimited, -1, by default). With **cleanup.policy=compact**, older values for a key are removed instead.' },
      { q: 'Why can records live longer than retention.ms?', a: 'Kafka deletes **whole segments**, not single records, and never the **active segment**. A segment goes only when its **newest** record has expired, so its older records outlive retention a little. A quiet partition can keep data in its active segment until it rolls (**segment.ms**, 7 days by default).' },
      { q: 'What happens to a consumer that is offline longer than the retention period?', a: 'Its committed offset may point to records that were deleted: it is **before the log start offset**, so it is **out of range**. Then **auto.offset.reset** applies: **latest** (the default) jumps to the end and skips everything in between, **earliest** restarts at the oldest record still stored, **none** throws an error. The deleted records are lost to it either way.' },
      { q: 'What is a tombstone in a compacted topic?', a: 'A record with a key and a **null value**. It tells compaction to remove all earlier records for that key. The tombstone itself is kept for **delete.retention.ms** (1 day by default) so consumers can see the delete, then it is removed too. Surviving records keep their **original offsets**, so a compacted log has gaps.' },
    ],
  },
  quiz: {
    q: 'A topic keeps data for 7 days. A consumer group was stopped for 10 days and its committed offset points to records that were deleted. What happens when it restarts?',
    options: ['It reads the deleted records from a backup on the broker', 'Its offset is out of range, so auto.offset.reset picks where it restarts and the deleted records are lost to it', 'Kafka renumbers the offsets so it continues where it left off', 'The broker refuses to delete records until every group has read them'],
    answer: 1,
    why: 'Retention deletes records whether or not anyone read them. The committed offset is now before the log start offset, so auto.offset.reset (latest by default, or earliest) decides the new position.',
  },
  related: ['topic', 'commit-lag'],
};
