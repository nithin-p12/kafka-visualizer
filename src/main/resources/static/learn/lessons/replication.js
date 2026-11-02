// Level 2 · Link 3: the replication flow, leader → followers. The fetch loop in detail: what a fetch carries, what
// the leader records about each follower, how followers learn the high watermark, and how a slow follower leaves
// and rejoins the ISR. Flows: the fetch loop, a slow follower, catching up and rejoining.
import { PARTITION_COLORS as PC } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, start, layers, frame, node, part, wire, along, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0];
const BLK = { w: 40, h: 30, size: 14 }, FBLK = { w: 38, h: 28, size: 13 };
// ---- layout (960 × 460) ----
const logX = off => 110 + (off - 98) * 46, LOG_Y = 180;
const FOL = [{ key: 'b2', name: 'B2', y: 135, req: 'M520,184 C492,184 498,390 470,390', res: 'M470,398 C504,398 494,198 520,198' },
  { key: 'b3', name: 'B3', y: 345, req: 'M520,394 C496,394 494,404 470,404', res: 'M470,412 C496,412 494,408 520,408' }];
const fX = off => -145 + (off - 98) * 44;              // follower log slot, relative to the follower frame (centre 725)
const TAB_Y = { B1: 248, B2: 276, B3: 304 };
const MAX_OFF = 105;

function scene(s) {
  const v = start(s, { parent: { log: 'b1', marks: 'b1', table: 'b1', isr: 'b1', hand: 'b1', b2f: 'b2', b3f: 'b3' } });
  v.leo = 100; v.hw = 100; v.clock = 0;

  // ---- producer and leader ----
  node(s, v, 'prod', 140, 66, 240, 44, 'producer', { sub: 'acks=all · writes to P0' });
  frame(s, v, 'b1', 250, 280, 470, 320, 'Broker B1');
  s.text(v.n.b1, -110, -142, '★ leader of orders-0', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: AMBER });
  const marks = part(s, v, 'marks');
  v.marksT = s.text(marks, 470, 138, 'LEO 100 · HW 100', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  const log = part(s, v, 'log');
  s.text(log, 30, LOG_Y, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.log = [98, 99].map(o => s.block(logX(o), LOG_Y, `${o}`, P0, { ...BLK, parent: log }));
  const table = part(s, v, 'table');
  s.text(table, 30, 220, 'B1\'s view of each replica', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED, 'font-weight': 600 });
  v.tab = {};
  for (const name of ['B1', 'B2', 'B3']) {
    s.text(table, 30, TAB_Y[name], name, { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    v.tab[name] = s.text(table, 76, TAB_Y[name], 'LEO 100', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO });
    if (name !== 'B1') v.tab[name + 'lag'] = s.text(table, 190, TAB_Y[name], 'caught up just now', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
  }
  const isr = part(s, v, 'isr');
  v.isrT = s.text(isr, 30, 340, 'ISR {B1, B2, B3}', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: '#3d4a55' });
  s.text(isr, 470, 340, 'replica.lag.time.max.ms = 30 s', { 'text-anchor': 'end', 'font-size': 13.5, 'font-family': MONO, fill: MUTED });
  node(s, v, 'hand', 250, 398, 440, 40, 'request handler', { size: 15 });
  v.n.hand.t.setAttribute('text-anchor', 'start'); v.n.hand.t.setAttribute('x', -206);
  v.handT = s.text(v.n.hand, 206, 0, '', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });

  // ---- followers ----
  v.fol = FOL.map(f => {
    const b = frame(s, v, f.key, 725, f.y, 441, 190, `Broker ${f.name}`);
    b.marksT = s.text(b, 206, -77, 'LEO 100 · HW 100', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.state = s.text(b, -206, -50, 'follower · in ISR', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
    s.text(b, -206, -10, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.blocks = [98, 99].map(o => s.block(fX(o), -10, `${o}`, P0, { ...FBLK, parent: b }));
    const fe = node(s, v, `${f.key}f`, 605, f.y + 55, 170, 40, 'replica fetcher', { sub: 'idle', size: 14 });
    fe.s.setAttribute('font-family', MONO);
    wire(v, `${f.key}-hand`, f.req);
    wire(v, `hand-${f.key}`, f.res);
    return Object.assign(b, f, { end: 100, hw: 100, view: 100, online: true, inIsr: true, caught: 0, fetcher: fe });
  });
  wire(v, 'prod-b1', 'M140,88 L140,120');
  wire(v, 'in', `M140,120 C140,150 ${logX(100)},150 ${logX(100)},${LOG_Y}`, { hidden: true });
  wire(v, 'read', `M${logX(100)},${LOG_Y} C${logX(100)},230 300,250 300,378`, { hidden: true });
  layers(s, v);
  return v;
}

// ---- state shown on the map ----
const isrList = v => ['B1', ...v.fol.filter(f => f.inIsr).map(f => f.name)];
const leaderMarks = (s, v) => swap(s, v.marksT, `LEO ${v.leo} · HW ${v.hw}`, BLUE);
const folMarks = (s, f) => swap(s, f.marksT, `LEO ${f.end} · HW ${f.hw}`, BLUE);
const lagText = (v, f) => !f.online && v.clock - f.caught > 0 ? `caught up ${v.clock - f.caught} s ago` : 'caught up just now';
async function table(s, v, f) {
  await swap(s, v.tab[f.name], `LEO ${f.view}`, BLUE);
  await swap(s, v.tab[f.name + 'lag'], lagText(v, f), !f.online && v.clock - f.caught >= 30 ? RED : MUTED);
}
// HW = the smallest LEO the leader knows of among the ISR.
async function moveHw(s, v) {
  const hw = Math.min(v.leo, ...v.fol.filter(f => f.inIsr).map(f => f.view));
  if (hw === v.hw) return false;
  v.hw = hw;
  hit(v, 'marks');
  await leaderMarks(s, v);
  return true;
}

// ---- motion ----
async function write(s, v, off) {
  await packet(s, v, 'prod-b1', `record ${off}`, MUTED, { ms: 500 });
  const b = s.block(140, 120, `${off}`, P0, { ...BLK, parent: v.packs });
  v.w.in.setAttribute('d', `M140,120 C140,150 ${logX(off)},150 ${logX(off)},${LOG_Y}`);
  await along(s, v, b, 'in', 650);
  b.remove();
  v.log.push(s.block(logX(off), LOG_Y, `${off}`, P0, { ...BLK, parent: v.n.log }));
  v.leo = off + 1;
  hit(v, 'log');
  await Promise.all([leaderMarks(s, v), swap(s, v.tab.B1, `LEO ${v.leo}`, BLUE)]);
}
// One fetch round for follower f: request (its LEO as fetch offset), leader updates its view, response with any new
// records and the leader's HW; the follower appends and sets HW = min(leader HW, own LEO).
async function fetchReq(s, v, f) {
  await swap(s, f.fetcher.s, `Fetch(${f.end}) sent`, BLUE);
  await packet(s, v, `${f.key}-hand`, `Fetch(${f.end})`, BLUE, { ms: 750 });
  hit(v, 'hand');
  f.view = f.end;
  if (f.end >= v.leo) f.caught = v.clock;
  await table(s, v, f);
}
async function fetchRes(s, v, f) {
  const from = f.end, to = v.leo - 1;
  const label = from > to ? `no new data · HW ${v.hw}` : `${from === to ? `record ${from}` : `records ${from}–${to}`} · HW ${v.hw}`;
  if (from <= to) {
    // B1 reads the records from its .log, then sends them.
    v.w.read.setAttribute('d', `M${logX(from)},${LOG_Y} C${logX(from)},230 300,250 300,378`);
    const c = s.block(logX(from), LOG_Y, `${from}`, P0, { ...FBLK, parent: v.packs });
    await along(s, v, c, 'read', 600);
    c.remove();
  }
  await packet(s, v, `hand-${f.key}`, label, GREEN, { ms: 800 });
  hit(v, `${f.key}f`);
  for (let o = from; o <= to; o++) {
    f.blocks.push(s.block(fX(o), -10, `${o}`, P0, { ...FBLK, parent: f }));
    f.end = o + 1;
  }
  f.hw = Math.min(v.hw, f.end);
  hit(v, f.key);
  await Promise.all([folMarks(s, f), swap(s, f.fetcher.s, 'idle', MUTED)]);
}
async function round(s, v, fs) {
  await Promise.all(fs.map(f => fetchReq(s, v, f)));
  await moveHw(s, v);
  await Promise.all(fs.map(f => fetchRes(s, v, f)));
}
async function setOnline(s, v, f, on) {
  f.online = on;
  f.rect.setAttribute('stroke', on ? '#c9ced2' : AMBER);
  f.rect.setAttribute('fill', on ? '#fff' : '#fffaf0');
  await swap(s, f.state, on ? `follower · ${f.inIsr ? 'in ISR' : 'catching up'}` : `⏸ not fetching · ${f.inIsr ? 'still in ISR' : 'out of ISR'}`, on ? MUTED : AMBER);
  hit(v, f.key);
}
async function tick(s, v, secs) {
  v.clock += secs;
  for (const f of v.fol) if (!f.online || f.end < v.leo) await swap(s, v.tab[f.name + 'lag'], lagText(v, f), !f.online && v.clock - f.caught >= 30 ? RED : MUTED);
}
async function shrink(s, v, f) {
  f.inIsr = false;
  await swap(s, f.state, '⏸ not fetching · out of ISR', RED);
  hit(v, 'isr');
  await swap(s, v.isrT, `ISR {${isrList(v).join(', ')}}`, AMBER);
}
async function expand(s, v, f) {
  f.inIsr = true;
  await swap(s, f.state, 'follower · in ISR', MUTED);
  hit(v, 'isr');
  await swap(s, v.isrT, `ISR {${isrList(v).join(', ')}}`, '#3d4a55');
}
const B = (v, k) => v.fol.find(f => f.key === k);

// ---- events: the fetch loop ----
const L = {
  write: {
    phase: 'New record', on: ['prod', 'log', 'marks', 'table'], wire: 'prod-b1',
    title: 'The leader gets a new record',
    text: 'A producer writes offset 100 to the leader of orders-0. B1 appends it and its LEO becomes 101. The followers do not know yet: nothing is pushed to them.',
    observe: 'Record 100 lands in B1\'s .log; B1 LEO 101, HW still 100.',
    async run(s, v) { await write(s, v, 100); },
  },
  req: {
    phase: 'Fetch round 1', on: ['b2f', 'hand'], wire: 'b2-hand',
    title: 'B2\'s fetcher asks: Fetch(100)',
    text: 'Each follower runs a replica fetcher thread that loops: "give me records from offset X". X is the follower\'s own LEO, so Fetch(100) also tells the leader "I have everything up to 99".',
    observe: 'Fetch(100) travels from B2\'s fetcher to B1.',
    async run(s, v) { await swap(s, B(v, 'b2').fetcher.s, 'Fetch(100) sent', BLUE); await packet(s, v, 'b2-hand', 'Fetch(100)', BLUE, { ms: 800 }); hit(v, 'hand'); },
  },
  view: {
    phase: 'Fetch round 1', on: ['hand', 'table'],
    title: 'B1 notes where B2 is',
    text: 'The fetch offset is how the leader tracks each follower: B2\'s LEO is 100, and it is caught up as of now. This table (LEO per replica, last caught-up time) is what the ISR and the high watermark are computed from.',
    observe: 'B1\'s table: B2 LEO 100, caught up just now.',
    async run(s, v) { const f = B(v, 'b2'); f.view = 100; f.caught = v.clock; await table(s, v, f); },
  },
  res: {
    phase: 'Fetch round 1', on: ['log', 'hand', 'b2f'], wires: ['read', 'hand-b2'],
    title: 'The response: record 100, plus the HW',
    text: 'B1 reads from offset 100 in its .log and sends it back. Every fetch response also carries the leader\'s current high watermark, here still 100. That is the only way followers learn the HW.',
    observe: 'A FetchResponse "record 100 · HW 100" travels to B2.',
    async run(s, v) { await fetchRes(s, v, B(v, 'b2')); },
  },
  append: {
    phase: 'Fetch round 1', on: ['b2'],
    title: 'B2 appends and sets its own HW',
    text: 'B2 appends record 100 to its own log (and its own index files), so its LEO is 101. Its HW is the smaller of the leader\'s HW and its own LEO: min(100, 101) = 100.',
    observe: 'B2 shows LEO 101 · HW 100.',
    async run(s, v) { const f = B(v, 'b2'); hit(v, 'b2'); await s.pulse(f.blocks.at(-1)); },
  },
  b3: {
    phase: 'Fetch round 1', on: ['b3', 'b3f', 'hand', 'table'], wires: ['b3-hand', 'hand-b3'],
    title: 'B3 does the same, in parallel',
    text: 'B3\'s fetcher runs its own loop at the same time: Fetch(100), B1 notes B3 at 100, the response brings record 100 and HW 100, and B3 appends it.',
    observe: 'B3 goes through the same round and ends at LEO 101 · HW 100.',
    async run(s, v) { const f = B(v, 'b3'); await fetchReq(s, v, f); await fetchRes(s, v, f); },
  },
  round2: {
    phase: 'Fetch round 2', on: ['b2f', 'b3f', 'hand', 'table'], wires: ['b2-hand', 'b3-hand'],
    title: 'The next fetches: Fetch(101)',
    text: 'Both fetchers loop straight back with Fetch(101). For the leader this means "we have offset 100 now". B1 updates its table: B2 at 101, B3 at 101.',
    observe: 'Fetch(101) from both; B1\'s table shows LEO 101 for every replica.',
    async run(s, v) { await Promise.all(v.fol.map(f => fetchReq(s, v, f))); },
  },
  hw: {
    phase: 'Fetch round 2', on: ['marks', 'table', 'isr'],
    title: 'B1 moves the high watermark to 101',
    text: 'The HW is the smallest LEO among the ISR. B1, B2 and B3 are all at 101, so the HW moves from 100 to 101. Offset 100 is committed: consumers may read it, and acks=all producers get their answer.',
    observe: 'B1: HW 100 → 101.',
    async run(s, v) { await moveHw(s, v); },
  },
  hwOut: {
    phase: 'Fetch round 2', on: ['hand', 'b2', 'b3'], wires: ['hand-b2', 'hand-b3'],
    title: 'The followers learn the new HW one round later',
    text: 'There is no new data, so the responses are empty, but they carry HW 101. The followers set their HW to 101. A follower\'s HW is always a little behind the leader\'s, which matters when a follower becomes leader.',
    observe: 'Empty responses "no new data · HW 101"; both followers show HW 101.',
    async run(s, v) { await Promise.all(v.fol.map(f => fetchRes(s, v, f))); },
  },
  idle: {
    phase: 'Fetch round 2', on: ['hand', 'b2f', 'b3f'], wires: ['b2-hand', 'b3-hand'],
    title: 'No new data: the fetch waits at the leader',
    text: 'The fetchers ask again with Fetch(101). With nothing new, the leader holds each request up to replica.fetch.wait.max.ms (500 ms) and answers as soon as data arrives. Followers do not spin, yet new records reach them almost at once.',
    observe: 'Both fetches are held at B1, shown on the handler.',
    async run(s, v) {
      await Promise.all(v.fol.map(f => packet(s, v, `${f.key}-hand`, 'Fetch(101)', BLUE, { ms: 700 })));
      await swap(s, v.handT, 'holding 2 fetches · up to 500 ms', AMBER);
      await Promise.all(v.fol.map(f => swap(s, f.fetcher.s, 'waiting at leader', AMBER)));
    },
  },
};

// ---- a slow follower ----
// Preset for the later flows: offset 100 already replicated everywhere, HW 101.
async function preset(s, v) {
  const was = s.clock.instant;
  s.clock.instant = true;
  await write(s, v, 100);
  await round(s, v, v.fol);
  await round(s, v, v.fol);
  s.clock.instant = was;
}
const S = {
  stall: {
    phase: 'B3 falls behind', on: ['b3', 'b3f'],
    title: 'B3 stops fetching',
    text: 'B3 hits a long garbage-collection pause, a slow disk or a network problem. Its fetcher stops asking. Nothing tells the leader directly; B1 only notices that B3 has not caught up for a while.',
    observe: 'B3 turns amber: not fetching, still in the ISR.',
    async run(s, v) { const f = B(v, 'b3'); await setOnline(s, v, f, false); await swap(s, f.fetcher.s, 'stalled', AMBER); },
  },
  writes: {
    phase: 'B3 falls behind', on: ['prod', 'log', 'b2', 'table'], wires: ['prod-b1', 'b2-hand', 'hand-b2'],
    title: 'Writes continue; B2 keeps up, B3 does not',
    text: 'The producer writes offsets 101 to 103. B2 fetches each one as usual. B3 stays at LEO 101, and B1\'s table shows it has not caught up for longer and longer.',
    observe: 'B1 and B2 reach LEO 104; B3 stays at 101, "caught up … s ago" grows.',
    async run(s, v) {
      for (const off of [101, 102, 103]) { await write(s, v, off); await round(s, v, [B(v, 'b2')]); await tick(s, v, 6); }
      await fetchReq(s, v, B(v, 'b2'));   // B2's next fetch tells B1 it has 103
    },
  },
  stuck: {
    phase: 'B3 falls behind', on: ['marks', 'table', 'isr'],
    title: 'The HW is stuck at 101',
    text: 'B3 is still in the ISR, so the HW cannot pass B3\'s LEO: it stays at 101 although B1 and B2 have up to 103. Consumers cannot read 101–103, and acks=all producers are kept waiting. One slow follower slows the partition.',
    observe: 'HW 101 while B1 and B2 are at LEO 104.',
    async run(s, v) { hit(v, 'marks'); await s.pulse(v.n.hand); await swap(s, v.handT, 'HW held at 101 by B3', RED); },
  },
  timeout: {
    phase: 'ISR shrinks', on: ['table', 'isr', 'b3'],
    title: '30 seconds pass: B3 is dropped from the ISR',
    text: 'Once a follower has not caught up to the leader\'s LEO for replica.lag.time.max.ms (30 s), the leader removes it from the ISR and records the new ISR in the cluster metadata. B3 is still a replica, just not an in-sync one.',
    observe: 'B3\'s "caught up" age passes 30 s; the ISR becomes {B1, B2}.',
    async run(s, v) { await tick(s, v, 14); await shrink(s, v, B(v, 'b3')); },
  },
  jump: {
    phase: 'ISR shrinks', on: ['marks', 'isr'],
    title: 'The HW jumps to 104',
    text: 'Now the HW only depends on B1 and B2, both at 104. It moves straight from 101 to 104, consumers can read again and waiting acks=all producers get their answers (min.insync.replicas = 2 is still met).',
    observe: 'HW 101 → 104.',
    async run(s, v) { await swap(s, v.handT, '', MUTED); await moveHw(s, v); },
  },
};
// ---- catching up and rejoining ----
async function presetSlow(s, v) {
  await preset(s, v);
  const was = s.clock.instant;
  s.clock.instant = true;
  for (const st of [S.stall, S.writes, S.timeout, S.jump]) await st.run(s, v);
  s.clock.instant = was;
}
const R = {
  back: {
    phase: 'Catching up', on: ['b3', 'b3f', 'hand'], wire: 'b3-hand',
    title: 'B3 recovers and fetches from 101',
    text: 'B3 comes back. Its fetcher starts from its own LEO and asks Fetch(101). (After a restart it would first check, using the leader epoch, whether it has records the leader does not, and cut them off.)',
    observe: 'Fetch(101) from B3; B1\'s table shows B3 at 101.',
    async run(s, v) { const f = B(v, 'b3'); await setOnline(s, v, f, true); await fetchReq(s, v, f); },
  },
  batch: {
    phase: 'Catching up', on: ['log', 'hand', 'b3', 'b3f'], wires: ['read', 'hand-b3'],
    title: 'One response carries everything it missed',
    text: 'The leader answers with records 101–103 in one response, up to replica.fetch.max.bytes (1 MB) per partition. A follower that is far behind catches up in big batches, not one record at a time.',
    observe: 'A response "records 101–103 · HW 104" fills B3\'s log to LEO 104.',
    async run(s, v) { await fetchRes(s, v, B(v, 'b3')); },
  },
  caught: {
    phase: 'Rejoining', on: ['b3f', 'hand', 'table'], wire: 'b3-hand',
    title: 'Its next fetch shows it has caught up',
    text: 'B3 sends Fetch(104). The leader sees that B3\'s LEO has reached the high watermark, which is the condition for being in sync again.',
    observe: 'B1\'s table: B3 LEO 104, caught up just now.',
    async run(s, v) { await fetchReq(s, v, B(v, 'b3')); },
  },
  rejoin: {
    phase: 'Rejoining', on: ['isr', 'b3'],
    title: 'B3 rejoins the ISR',
    text: 'The leader adds B3 back: the ISR is {B1, B2, B3} again and the partition can lose two brokers without losing data. From now on B3 holds the HW back again whenever it lags.',
    observe: 'ISR {B1, B2, B3}; B3 back to "follower · in ISR".',
    async run(s, v) { await expand(s, v, B(v, 'b3')); },
  },
};

const trackOf = (steps, pre) => {
  const t = { continuous: true, steps, enter, async build(s) { const v = scene(s); v.track = t; if (pre) await pre(s, v); return v; } };
  return t;
};
const flowLoop = trackOf([L.write, L.req, L.view, L.res, L.append, L.b3, L.round2, L.hw, L.hwOut, L.idle]);
const flowSlow = trackOf([S.stall, S.writes, S.stuck, S.timeout, S.jump], preset);
const flowRejoin = trackOf([R.back, R.batch, R.caught, R.rejoin], presetSlow);

export default {
  id: 'replication', n: 15, title: 'Replication flow', tagline: 'How followers stay in sync',
  docked: true,
  guide: {
    what: 'Followers copy the leader by pulling: a replica fetcher thread keeps sending FetchRequests from its own LEO. The fetch offsets tell the leader where each follower is, which decides the high watermark and who is in the ISR.',
    fits: 'Third link of Level 2: leader → followers. acks decided when the producer hears back; this is the machinery underneath. Next: leader election, when the leader itself fails. The full ISR and HW rules are a Level 4 deep dive.',
  },
  flows: [
    { id: 'loop', short: 'fetch loop', label: 'The fetch loop', about: 'Fetch, respond with records and the HW, append.', track: flowLoop },
    { id: 'slow', short: 'slow follower', label: 'A slow follower', about: 'How one lagging follower holds the HW, until it leaves the ISR.', track: flowSlow },
    { id: 'rejoin', short: 'rejoin', label: 'Catching up and rejoining', about: 'A recovered follower fetches what it missed and rejoins.', track: flowRejoin },
  ],
  watch: flowLoop,
  tryIt: {
    intro: 'Write records, pause and resume B3, and let time pass. Watch B1\'s table, the HW and the ISR.',
    observe: 'A paused follower that stays in the ISR holds the HW back; after 30 s it is dropped and the HW jumps; once it catches up to the HW it rejoins.',
    controls: [
      { type: 'button', label: 'Write a record', primary: true, run: 'write' },
      { type: 'button', label: 'Pause / resume B3', run: 'toggle' },
      { type: 'button', label: 'Let 15 s pass', run: 'wait' },
    ],
    build(s) {
      const v = scene(s);
      v.message = 'Press "Write a record". Then pause B3, write more, and let time pass.';
      return v;
    },
    async write(s, v) {
      unfocus(v);
      if (v.leo > MAX_OFF) { v.message = 'The sandbox log is full. Switch tabs and back to start again.'; return; }
      const off = v.leo;
      await write(s, v, off);
      const live = v.fol.filter(f => f.online);
      await round(s, v, live);
      await round(s, v, live);
      await tick(s, v, 3);
      const held = v.hw < v.leo;
      v.message = held ? `Offset ${off} is on B1 and ${live.map(f => f.name).join(', ') || 'no follower'}, but the HW is held at ${v.hw} by ${v.fol.filter(f => f.inIsr && f.view < v.leo).map(f => f.name).join(', ')}, still in the ISR.`
        : `Offset ${off} was fetched by ${live.map(f => f.name).join(' and ')}; the HW moved to ${v.hw}.`;
    },
    async toggle(s, v) {
      unfocus(v);
      const f = B(v, 'b3');
      if (f.online) { await setOnline(s, v, f, false); v.message = 'B3 stopped fetching. It stays in the ISR until it has not caught up for 30 s.'; return; }
      await setOnline(s, v, f, true);
      await fetchReq(s, v, f);
      await fetchRes(s, v, f);
      await fetchReq(s, v, f);
      if (!f.inIsr && f.view >= v.hw) await expand(s, v, f);
      await moveHw(s, v);
      await fetchRes(s, v, f);
      v.message = `B3 resumed, fetched up to ${f.end - 1} in one response${f.inIsr ? ' and is in the ISR' : ''}.`;
    },
    async wait(s, v) {
      unfocus(v);
      await tick(s, v, 15);
      const f = B(v, 'b3');
      if (f.inIsr && !f.online && v.clock - f.caught >= 30) {
        await shrink(s, v, f);
        const jumped = await moveHw(s, v);
        v.message = `B3 has not caught up for ${v.clock - f.caught} s (more than 30 s), so it left the ISR${jumped ? ` and the HW jumped to ${v.hw}` : ''}.`;
      } else v.message = f.online ? 'Time passed. B3 is fetching, so nothing changes.' : `B3 has not caught up for ${v.clock - f.caught} s. At 30 s it is dropped from the ISR.`;
    },
    readout: v => `B1 <b>LEO ${v.leo} · HW ${v.hw}</b> · B2 LEO ${v.fol[0].end} · B3 LEO ${v.fol[1].end} (${v.fol[1].online ? 'fetching' : 'paused'}) · <b>ISR {${isrList(v).join(', ')}}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Leader epochs and truncation, fetch settings, and reading from followers.',
    continuous: true,
    async build(s) { const v = scene(s); v.track = this; await preset(s, v); return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['b3', 'log'],
        title: 'Leader epochs: cutting off records the leader never had',
        text: 'Each new leader starts a new leader epoch. A follower that restarts asks the leader where its last epoch ended and truncates anything after that point, records that were never committed. This keeps every replica\'s log a copy of the leader\'s.',
        observe: 'B3\'s log is compared with B1\'s up to the last shared epoch.',
        async run(s, v) { await swap(s, B(v, 'b3').state, 'check epoch → truncate to 101', AMBER); },
      },
      {
        on: ['b2f', 'b3f'],
        title: 'Fetch settings',
        text: 'num.replica.fetchers (default 1) sets how many fetcher threads pull from each leader; more helps brokers with many partitions. replica.fetch.max.bytes caps each partition\'s data per response, replica.fetch.wait.max.ms the long-poll wait.',
        observe: 'Each follower\'s fetcher is one of these threads.',
        async run(s, v) { await Promise.all(v.fol.map(f => swap(s, f.fetcher.s, 'num.replica.fetchers=1', MUTED))); },
      },
      {
        on: ['b2', 'hand'],
        title: 'Consumers can read from a follower',
        text: 'With rack awareness (replica.selector.class plus client.rack, KIP-392), a consumer can fetch from a follower in its own zone to save cross-zone traffic. It still only sees records up to the HW that follower knows of, a little behind the leader.',
        observe: 'B2 can serve consumers in its rack, up to its own HW.',
        async run(s, v) { await swap(s, B(v, 'b2').state, 'follower · serves rack-local reads', GREEN); },
      },
      {
        on: ['isr', 'table'],
        title: 'Why lag is measured in time, not messages',
        text: 'Old Kafka also used replica.lag.max.messages, which kicked followers out during normal bursts. Since 0.9 only time counts: a follower is in sync if it has caught up to the leader\'s LEO within the last 30 s. The ISR and HW deep dive goes further.',
        observe: 'The "caught up … s ago" column is what the rule looks at.',
        async run(s, v) { hit(v, 'table'); await s.wait(600); },
      },
    ],
  },
  takeaway: 'Followers pull: Fetch(own LEO) tells the leader where each one is, and the response brings new records plus the leader\'s HW. The HW is the smallest LEO in the ISR; a follower that has not caught up for replica.lag.time.max.ms leaves the ISR, and rejoins once its LEO reaches the HW.',
  recap: {
    points: [
      'Replication is pull-based: each follower\'s fetcher sends Fetch(its LEO) in a loop.',
      'The fetch offset is how the leader knows each follower\'s LEO.',
      'Fetch responses carry new records and the leader\'s HW; followers set HW = min(leader HW, own LEO).',
      'Leader HW = smallest LEO among the ISR; a lagging ISR member holds it back.',
      'Not caught up for replica.lag.time.max.ms (30 s) → out of the ISR; LEO reaches HW → back in.',
      'Idle fetches are held up to replica.fetch.wait.max.ms (long polling).',
    ],
    interview: [
      { q: 'How does replication work in Kafka?', a: 'It is **pull-based**. Each follower runs **replica fetcher** threads that send **FetchRequests** to the leader starting at the follower\'s own **LEO**. The leader returns new records plus its **high watermark**. The fetch offset tells the leader each follower\'s progress, from which it computes the **HW** (smallest LEO in the ISR) and the **ISR**.' },
      { q: 'When is a follower removed from the ISR, and when does it come back?', a: 'When it has **not caught up to the leader\'s LEO for replica.lag.time.max.ms** (30 s by default), the leader shrinks the ISR. It rejoins once its **LEO reaches the leader\'s HW**. Lag is measured in **time**, not message count.' },
      { q: 'How do followers know the high watermark?', a: 'From the **fetch responses**: each carries the leader\'s current HW, and the follower sets its HW to **min(leader HW, own LEO)**. So a follower\'s HW is usually **one fetch round behind** the leader\'s.' },
      { q: 'Why is a slow follower a problem even before it is removed?', a: 'While it is **in the ISR**, the HW cannot pass its LEO, so **consumers cannot read** newer records and **acks=all producers wait**. Removing it after replica.lag.time.max.ms lets the HW move again.' },
    ],
  },
  quiz: {
    q: 'B1 (leader) and B2 are at LEO 104. B3 is at LEO 101, still in the ISR. What is the high watermark?',
    options: ['104, the leader\'s LEO', '101, the smallest LEO in the ISR', '102, the average', 'It depends on acks'],
    answer: 1,
    why: 'The HW is the smallest LEO among the ISR. While B3 stays in the ISR it holds the HW at 101; once it is dropped, the HW moves to 104.',
  },
  related: ['replica', 'acks', 'journey'],
};
