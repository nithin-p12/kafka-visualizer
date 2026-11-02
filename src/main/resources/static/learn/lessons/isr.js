// Level 4 · Deep dive: ISR & high watermark. What "committed" means on the broker: per-replica LEO, HW = smallest
// LEO in the ISR, what consumers and acks=all producers see, what happens to records above the HW when the leader
// changes, and how ISR changes go through the controller. Records below the HW are drawn solid, above it faded.
import { PARTITION_COLORS as PC } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, start, layers, frame, node, wire, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0];
const BLK = { w: 38, h: 30, size: 13 };
const BX = [170, 480, 790], BY = 205, NAMES = ['B1', 'B2', 'B3'];
const slot = off => -60 + (off - 100) * 44;

function scene(s, { ends = [104, 104, 102], hw = 102, isr = [0, 1, 2], leader = 0, epoch = 5 } = {}) {
  const v = start(s, { parent: {} });
  Object.assign(v, { hw, isr: [...isr], leader, epoch, alive: [true, true, true] });
  node(s, v, 'ctl', 480, 56, 400, 48, 'Controller · partition metadata', { sub: '' });
  v.n.ctl.s.setAttribute('font-family', MONO);
  v.b = NAMES.map((name, i) => {
    const b = frame(s, v, `b${i}`, BX[i], BY, 286, 170, `Broker ${name}`);
    b.roleT = s.text(b, 129, -67, '', { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700 });
    s.text(b, -129, -22, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.markT = s.text(b, -129, 30, '', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.epochT = s.text(b, 129, 58, '', { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, fill: MUTED });
    b.noteT = s.text(b, -129, 58, '', { 'text-anchor': 'start', 'font-size': 13.5, fill: MUTED });
    Object.assign(b, { i, name, end: ends[i], hw, blocks: [] });
    for (let o = 100; o < ends[i]; o++) b.blocks.push(s.block(slot(o), -22, `${o}`, P0, { ...BLK, parent: b }));
    return b;
  });
  node(s, v, 'cons', 250, 398, 300, 56, 'consumer · fetches from the leader', { sub: '', size: 14 });
  node(s, v, 'prod', 710, 398, 300, 56, 'producer · acks=all', { sub: '', size: 14 });
  for (const k of ['cons', 'prod']) v.n[k].s.setAttribute('font-family', MONO);

  wire(v, 'f1to0', 'M440,120 C440,96 220,96 220,120');
  wire(v, 'f2to0', 'M760,120 C760,88 240,88 240,120');
  wire(v, 'f2to1', 'M770,120 C770,98 520,98 520,120');
  wire(v, 'f0to1', 'M200,120 C200,100 440,100 450,120');
  wire(v, 'b0-ctl', 'M160,120 C160,86 250,56 280,56');
  wire(v, 'ctl-b0', 'M300,74 C250,80 186,92 186,120');
  wire(v, 'cons-b', 'M220,370 C220,330 160,326 160,290');
  wire(v, 'b-cons', 'M180,290 C180,330 260,332 260,370');
  wire(v, 'prod-b', 'M600,384 C420,384 236,340 210,290');
  wire(v, 'b-prod', 'M230,290 C260,350 430,396 560,398');
  layers(s, v);
  render(v);
  return v;
}

// ---- state → picture ----
const isrText = v => `{${v.isr.map(i => NAMES[i]).join(', ')}}`;
const ctlText = v => v.leader < 0 ? `orders-0 · no leader · ISR ${isrText(v)}` : `orders-0 · leader ${NAMES[v.leader]} · ISR ${isrText(v)} · epoch ${v.epoch}`;
const readable = v => v.hw > 100 ? `can read: 100–${v.hw - 1} (below HW ${v.hw})` : 'can read: nothing yet';
function role(v, b) {
  if (!v.alive[b.i]) return ['✕ down', RED];
  if (b.i === v.leader) return ['★ leader', AMBER];
  return v.isr.includes(b.i) ? ['follower · in ISR', MUTED] : ['follower · out of ISR', AMBER];
}
function render(v) {
  v.n.ctl.s.textContent = ctlText(v);
  for (const b of v.b) {
    const [t, c] = role(v, b);
    b.roleT.textContent = t; b.roleT.setAttribute('fill', c);
    b.markT.textContent = `LEO ${b.end} · HW ${b.i === v.leader ? v.hw : b.hw}`;
    b.epochT.textContent = `epoch ${v.epoch}`;
    b.rect.setAttribute('stroke', v.alive[b.i] ? '#c9ced2' : RED);
    b.rect.setAttribute('fill', v.alive[b.i] ? '#fff' : '#fff4f4');
    b.blocks.forEach((g, k) => { const committed = 100 + k < v.hw; g.setAttribute('opacity', committed ? 1 : .45); });
  }
  v.n.cons.s.textContent = readable(v);
}
async function show(s, v, ...bs) {
  await Promise.all(bs.map(async b => {
    const [t, c] = role(v, b);
    await Promise.all([swap(s, b.roleT, t, c), swap(s, b.markT, `LEO ${b.end} · HW ${b.i === v.leader ? v.hw : b.hw}`, BLUE), swap(s, b.epochT, `epoch ${v.epoch}`, MUTED)]);
    b.rect.setAttribute('stroke', v.alive[b.i] ? '#c9ced2' : RED);
    b.rect.setAttribute('fill', v.alive[b.i] ? '#fff' : '#fff4f4');
    hit(v, `b${b.i}`);
  }));
}
async function solidify(s, v) {
  await Promise.all(v.b.flatMap(b => b.blocks.map((g, k) => s.fade(g, 100 + k < v.hw ? 1 : .45, 400))));
  await swap(s, v.n.cons.s, readable(v), v.hw > 100 ? GREEN : MUTED);
}
async function grow(s, b, to) { while (b.end < to) { const g = s.block(slot(b.end), -22, `${b.end}`, P0, { ...BLK, parent: b }); g.setAttribute('opacity', .45); b.blocks.push(g); b.end++; await s.pop(g, 220); } }
async function cut(s, b, to) {
  const gone = b.blocks.splice(to - 100);
  for (const g of gone) g.rect.setAttribute('fill', RED);
  await Promise.all(gone.map(g => s.shake(g)));
  await Promise.all(gone.map(g => s.fade(g, 0, 300)));
  gone.forEach(g => g.remove());
  b.end = to;
}
const ctl = (s, v, color) => { hit(v, 'ctl'); return swap(s, v.n.ctl.s, ctlText(v), color); };
const newHw = v => Math.min(...v.isr.filter(i => v.alive[i]).map(i => v.b[i].end));

// ---- flow 1: what the HW means ----
const H = {
  leo: {
    phase: 'LEO and HW', on: ['b0', 'b1', 'b2'],
    title: 'Every replica has its own log end',
    text: 'The log end offset (LEO) is the next offset a replica will write. B1, the leader, and B2 have 100–103 (LEO 104); B3 is a little behind with 100–101 (LEO 102). All three are in the ISR.',
    observe: 'LEO 104, 104 and 102 on the three brokers.',
    async run(s, v) { hit(v, 'b2'); await s.wait(300); },
  },
  hw: {
    phase: 'LEO and HW', on: ['b0', 'b2', 'ctl'],
    title: 'HW = the smallest LEO in the ISR',
    text: 'The leader sets the high watermark to the smallest LEO among the in-sync replicas: min(104, 104, 102) = 102. Offsets below 102 are on every ISR member: they are committed. 102 and 103 exist but are not committed yet (drawn faded).',
    observe: 'B1 shows HW 102; blocks 102 and 103 are faded on B1 and B2.',
    async run(s, v) { await swap(s, v.b[0].noteT, 'HW held at 102 by B3', AMBER); hit(v, 'b0'); },
  },
  read: {
    phase: 'Who sees what', on: ['cons', 'b0'], wires: ['cons-b', 'b-cons'],
    title: 'Consumers only get records below the HW',
    text: 'A consumer fetching from offset 100 receives 100 and 101 and nothing more, even though the leader has 103. If it read 102 and the leader then failed, a new leader might not have 102: the consumer would have seen a record that "never happened".',
    observe: 'The fetch returns 100–101; the consumer says "can read: 100–101".',
    async run(s, v) {
      await packet(s, v, 'cons-b', 'Fetch(100)', BLUE, { ms: 800 });
      await packet(s, v, 'b-cons', '100–101 only', GREEN, { ms: 800 });
      await swap(s, v.n.cons.s, readable(v), AMBER);
    },
  },
  wait: {
    phase: 'Who sees what', on: ['prod', 'b0'], wire: 'prod-b',
    title: 'acks=all producers wait for the HW too',
    text: 'The producer that wrote 102 and 103 with acks=all has not been answered: its requests wait in the leader\'s purgatory until the HW passes them. Committed for the consumer and acknowledged for the producer are the same moment.',
    observe: 'The producer shows "waiting for 102, 103".',
    async run(s, v) { await swap(s, v.n.prod.s, 'waiting for 102, 103', AMBER); hit(v, 'prod'); },
  },
  catchup: {
    phase: 'The HW moves', on: ['b2', 'b0'], wire: 'f2to0',
    title: 'B3 fetches 102 and 103',
    text: 'B3\'s next fetch brings both records; its following Fetch(104) tells the leader its LEO is 104.',
    observe: 'B3 reaches LEO 104.',
    async run(s, v) { await packet(s, v, 'f2to0', 'Fetch(102)', BLUE, { ms: 800 }); await grow(s, v.b[2], 104); await packet(s, v, 'f2to0', 'Fetch(104)', BLUE, { ms: 700 }); await show(s, v, v.b[2]); },
  },
  moved: {
    phase: 'The HW moves', on: ['b0', 'cons', 'prod'], wires: ['b-cons', 'b-prod'],
    title: 'HW 104: 102 and 103 are committed',
    text: 'min(104, 104, 104) = 104, so the HW jumps to 104. The faded blocks turn solid, the consumer\'s next fetch gets 102–103, and the waiting producer requests are answered.',
    observe: 'All blocks solid; consumer "can read: 100–103"; producer "✓ 102, 103 acknowledged".',
    async run(s, v) {
      v.hw = 104;
      await Promise.all([show(s, v, v.b[0]), swap(s, v.b[0].noteT, '', MUTED)]);
      await solidify(s, v);
      await packet(s, v, 'b-prod', 'ProduceResponse', GREEN, { ms: 900 });
      await swap(s, v.n.prod.s, '✓ 102, 103 acknowledged', GREEN);
    },
  },
  lag: {
    phase: 'The HW moves', on: ['b1', 'b2'], wires: ['f1to0', 'f2to0'],
    title: 'Followers learn the HW one fetch later',
    text: 'The followers still show HW 102: they only learn the new HW from the leader\'s next fetch response. A follower\'s HW is always a little behind, which is why it is not used to decide what to keep after a leader change.',
    observe: 'Their next fetches bring HW 104 to B2 and B3.',
    async run(s, v) {
      await Promise.all([packet(s, v, 'f1to0', 'Fetch(104)', BLUE, { ms: 700 }), packet(s, v, 'f2to0', 'Fetch(104)', BLUE, { ms: 700 })]);
      v.b[1].hw = 104; v.b[2].hw = 104;
      await show(s, v, v.b[1], v.b[2]);
    },
  },
};
// B1 and B2 start with HW 102 known to the followers.
const preHw = v => { v.b[1].hw = 102; v.b[2].hw = 102; render(v); };

// ---- flow 2: records above the HW on a leader change ----
const L = {
  above: {
    phase: 'Not committed', on: ['b0', 'b1', 'b2'],
    title: 'Above the HW: written, not committed',
    text: 'Same start: B1 and B2 have 100–103, B3 has 100–101, HW 102. The acks=all producer of 102 and 103 is still waiting. Now the leader crashes.',
    observe: '102 and 103 are faded on B1 and B2.',
    async run(s, v) { await swap(s, v.n.prod.s, 'waiting for 102, 103', AMBER); },
  },
  crash: {
    phase: 'Leader change', on: ['b0'],
    title: 'B1 crashes',
    text: 'The leader disappears with 102 and 103 not yet committed. The controller fences B1 and must pick a new leader from the ISR {B2, B3}.',
    observe: 'B1 turns red.',
    async run(s, v) { v.alive[0] = false; v.isr = [1, 2]; await show(s, v, v.b[0]); await s.shake(v.b[0]); },
  },
  elect: {
    phase: 'Leader change', on: ['ctl', 'b1'],
    title: 'B2 becomes leader, and keeps 102 and 103',
    text: 'B2 is the first live ISR member, so it leads in epoch 6. A new leader keeps its whole log, including what was above the old HW. Its LEO (104) is the new truth for the partition.',
    observe: 'Controller: leader B2, ISR {B2, B3}, epoch 6.',
    async run(s, v) { v.leader = 1; v.epoch = 6; v.hw = 102; await ctl(s, v, AMBER); await show(s, v, v.b[1], v.b[2]); },
  },
  survive: {
    phase: 'Leader change', on: ['b2', 'b1', 'cons'], wire: 'f2to1',
    title: 'B3 copies them: they become committed after all',
    text: 'B3 fetches 102 and 103 from B2, the HW moves to 104 and the records are committed. The producer\'s retry (with idempotence) finds them already written. Records above the HW can survive a leader change, but nothing promised that.',
    observe: 'B3 reaches 104; everything turns solid.',
    async run(s, v) {
      await packet(s, v, 'f2to1', 'Fetch(102)', BLUE, { ms: 800 });
      await grow(s, v.b[2], 104);
      v.hw = 104; v.b[2].hw = 104;
      await show(s, v, v.b[1], v.b[2]);
      await solidify(s, v);
    },
  },
  rule: {
    phase: 'The other outcome', on: ['cons', 'prod'],
    title: 'The rule',
    text: 'Below the HW: on every ISR member, readable, acknowledged, and guaranteed to survive while one ISR member remains. Above the HW: may survive or be truncated, never read by consumers, never acknowledged to acks=all producers.',
    observe: 'What the consumer and the producer were told matches what is guaranteed.',
    async run(s, v) { hit(v, 'cons'); hit(v, 'prod'); await s.wait(400); },
  },
};
// ---- flow 3: the other outcome, truncation ----
const T = {
  above: { ...L.above, phase: 'Not committed' },
  both: {
    phase: 'Leader change', on: ['b0', 'b1'],
    title: 'B1 crashes while B2 is restarting',
    text: 'This time B2 is briefly down for a restart when B1 dies. The only live ISR member is B3, whose log ends at 101.',
    observe: 'B1 and B2 both red.',
    async run(s, v) { v.alive[0] = false; v.alive[1] = false; v.isr = [2]; await show(s, v, v.b[0], v.b[1]); },
  },
  elect: {
    phase: 'Leader change', on: ['ctl', 'b2'],
    title: 'B3 becomes leader: the log ends at 101',
    text: 'B3 leads in epoch 6. Its log is now the partition’s log: 102 and 103 never reached it, so for the partition they do not exist. The waiting producer was never acknowledged, so nothing it was promised is lost; it retries.',
    observe: 'Controller: leader B3, epoch 6; the producer retries.',
    async run(s, v) { v.leader = 2; v.epoch = 6; v.hw = 102; await ctl(s, v, AMBER); await show(s, v, v.b[2]); await swap(s, v.n.prod.s, 'retrying 102, 103 (never acked)', AMBER); },
  },
  ask: {
    phase: 'Truncation', on: ['b1', 'b2'],
    title: 'B2 returns and asks where epoch 5 ended',
    text: 'B2 comes back with 102 and 103 on disk. Before fetching it sends OffsetsForLeaderEpoch to B3: "my last epoch was 5, where did it end?" On B3, epoch 5 ends at 102.',
    observe: 'B2 is back, still holding 102 and 103.',
    async run(s, v) { v.alive[1] = true; await show(s, v, v.b[1]); await swap(s, v.b[1].noteT, 'epoch 5 ends at 102 on B3', AMBER); },
  },
  cut: {
    phase: 'Truncation', on: ['b1'],
    title: 'B2 truncates 102 and 103',
    text: 'B2 cuts its log back to 102 so it matches the leader, then fetches normally and rejoins the ISR. Before leader epochs (KIP-101) followers truncated to their own HW, which could lose committed data or leave replicas with different records at the same offset.',
    observe: 'B2’s 102 and 103 turn red and disappear.',
    async run(s, v) { await cut(s, v.b[1], 102); v.b[1].hw = 102; v.isr = [1, 2]; await Promise.all([show(s, v, v.b[1]), swap(s, v.b[1].noteT, '', MUTED), ctl(s, v, GREEN)]); },
  },
  rule: null,
};
// ---- flow 4: ISR changes go through the controller ----
const I = {
  stall: {
    phase: 'Shrink', on: ['b2'],
    title: 'B3 stops keeping up',
    text: 'Start from a healthy partition: everyone at 104, HW 104. The producer writes 104 and 105; B2 copies them, B3 does not fetch.',
    observe: 'B1 and B2 reach LEO 106; B3 stays at 104; HW stuck at 104.',
    async run(s, v) {
      await Promise.all([grow(s, v.b[0], 106), grow(s, v.b[1], 106)]);
      await show(s, v, v.b[0], v.b[1]);
      await swap(s, v.b[2].noteT, 'not fetching…', AMBER);
    },
  },
  alter: {
    phase: 'Shrink', on: ['b0', 'ctl'], wire: 'b0-ctl',
    title: 'The leader asks the controller to shrink the ISR',
    text: 'After replica.lag.time.max.ms (30 s) without B3 catching up, the leader does not change the ISR on its own: it sends AlterPartition(ISR {B1, B2}) to the controller.',
    observe: 'AlterPartition travels from B1 to the controller.',
    async run(s, v) { await packet(s, v, 'b0-ctl', 'AlterPartition {B1, B2}', BLUE, { ms: 900 }); hit(v, 'ctl'); },
  },
  commit: {
    phase: 'Shrink', on: ['ctl', 'b0'], wire: 'ctl-b0',
    title: 'The controller commits the new ISR',
    text: 'The controller writes the change to the metadata log, bumping the partition epoch, and replies. Only now does the leader act on the smaller ISR. Going through the controller means a later leader election always sees the true ISR.',
    observe: 'Controller: ISR {B1, B2}; the reply goes back to B1.',
    async run(s, v) { v.isr = [0, 1]; await ctl(s, v, AMBER); await packet(s, v, 'ctl-b0', 'ok · partition epoch +1', GREEN, { ms: 800 }); await show(s, v, v.b[2]); },
  },
  jump: {
    phase: 'Shrink', on: ['b0', 'cons'],
    title: 'The HW is free to move: 106',
    text: 'With B3 out of the ISR, the HW is min(106, 106) = 106. Consumers can read 104 and 105, and acks=all writes succeed with two copies (min.insync.replicas = 2 still holds).',
    observe: 'HW 104 → 106.',
    async run(s, v) { v.hw = 106; await show(s, v, v.b[0]); await solidify(s, v); },
  },
  back: {
    phase: 'Expand', on: ['b2', 'b0'], wire: 'f2to0',
    title: 'B3 catches up to the HW',
    text: 'B3 resumes and fetches 104 and 105. Once its LEO reaches the leader\'s HW it qualifies for the ISR again.',
    observe: 'B3 reaches LEO 106.',
    async run(s, v) { await swap(s, v.b[2].noteT, '', MUTED); await packet(s, v, 'f2to0', 'Fetch(104)', BLUE, { ms: 800 }); await grow(s, v.b[2], 106); v.b[2].hw = 106; await solidify(s, v); await show(s, v, v.b[2]); },
  },
  expand: {
    phase: 'Expand', on: ['b0', 'ctl', 'b2'], wires: ['b0-ctl', 'ctl-b0'],
    title: 'AlterPartition again: B3 rejoins',
    text: 'The leader sends AlterPartition(ISR {B1, B2, B3}); the controller commits it. Every ISR change, shrink or expand, takes this path.',
    observe: 'Controller: ISR {B1, B2, B3}.',
    async run(s, v) { await packet(s, v, 'b0-ctl', 'AlterPartition {B1, B2, B3}', BLUE, { ms: 900 }); v.isr = [0, 1, 2]; await ctl(s, v, GREEN); await packet(s, v, 'ctl-b0', 'ok', GREEN, { ms: 700 }); await show(s, v, v.b[2]); },
  },
};

const trackOf = (steps, opts, pre) => { const t = { continuous: true, steps, enter, build(s) { const v = scene(s, opts); v.track = t; pre?.(v); return v; } }; return t; };
const flowHw = trackOf(Object.values(H), undefined, preHw);
const flowLeader = trackOf(Object.values(L), undefined, preHw);
T.rule = L.rule;
const flowTrunc = trackOf(Object.values(T), undefined, preHw);
const flowIsr = trackOf(Object.values(I), { ends: [104, 104, 104], hw: 104 }, v => { v.b[1].hw = 104; v.b[2].hw = 104; render(v); });

// ---- try it ----
async function tryProduce(s, v) {
  if (v.leader < 0) return 'No leader: writes are refused.';
  const L0 = v.b[v.leader];
  if (L0.end >= 105) return 'The sandbox log is full. Switch tabs and back to start again.';
  await packet(s, v, 'prod-b', 'Produce', BLUE, { ms: 600 });
  await grow(s, L0, L0.end + 1);
  await show(s, v, L0);
  return `The leader wrote offset ${L0.end - 1}. It is above the HW (${v.hw}) until every ISR member has it.`;
}
async function tryFetch(s, v, i) {
  const b = v.b[i];
  if (!v.alive[i]) return `${b.name} is down.`;
  if (i === v.leader) return `${b.name} is the leader; followers fetch from it.`;
  if (v.leader < 0) return 'There is no leader to fetch from.';
  const L0 = v.b[v.leader];
  if (b.end > L0.end) { await cut(s, b, L0.end); }
  await grow(s, b, L0.end);
  if (!v.isr.includes(i) && b.end >= v.hw) { v.isr.push(i); v.isr.sort(); await ctl(s, v, GREEN); }
  const before = v.hw;
  v.hw = newHw(v); b.hw = v.hw;
  await show(s, v, b, L0);
  await solidify(s, v);
  return v.hw > before ? `${b.name} caught up; the HW moved ${before} → ${v.hw}: those offsets are now committed.` : `${b.name} caught up to ${b.end}. The HW (${v.hw}) still waits for ${v.isr.filter(x => v.alive[x] && v.b[x].end < L0.end).map(x => NAMES[x]).join(', ') || 'nobody'}.`;
}
async function tryCrash(s, v) {
  const old = v.leader;
  if (old < 0) {
    const back = v.b.find(b => !v.alive[b.i]);
    v.alive[back.i] = true; v.leader = back.i; v.epoch++; v.isr = [back.i]; v.hw = back.end;
    await ctl(s, v, GREEN); await show(s, v, ...v.b);
    return `${back.name} returned and leads again.`;
  }
  const lost = v.b[old].end - v.hw;
  v.alive[old] = false; v.isr = v.isr.filter(i => i !== old);
  const next = [0, 1, 2].find(i => v.alive[i] && v.isr.includes(i));
  if (next == null) { v.leader = -1; await ctl(s, v, RED); await show(s, v, v.b[old]); return 'The leader died and no ISR member is alive: the partition is offline.'; }
  v.leader = next; v.epoch++;
  const N = v.b[next];
  for (const b of v.b) if (v.alive[b.i] && b.i !== next && b.end > N.end) await cut(s, b, N.end);
  v.hw = Math.min(newHw(v), Math.max(v.hw, 100));
  await ctl(s, v, AMBER); await show(s, v, ...v.b); await solidify(s, v);
  const kept = N.end - v.hw;
  return `${v.b[old].name} crashed. ${N.name} leads (epoch ${v.epoch}).` + (lost ? ` Of the ${lost} uncommitted record${lost > 1 ? 's' : ''}, ${Math.min(kept, lost)} survive on ${N.name}; the rest are gone (never acknowledged).` : ' Nothing was above the HW.');
}

export default {
  id: 'isr', n: 22, title: 'ISR & high watermark', tagline: 'What "committed" means on the broker',
  docked: true,
  guide: {
    what: 'Each replica has a log end offset (LEO). The leader\'s high watermark is the smallest LEO among the in-sync replicas: everything below it is committed, readable by consumers and acknowledged to acks=all producers. Records above it may survive a leader change or be truncated.',
    fits: 'Deep dive after Level 2\'s acks, replication and election. It explains the one number those lessons kept pointing at.',
  },
  flows: [
    { id: 'hw', short: 'HW', label: 'What the HW means', about: 'LEO per replica, HW = min LEO in the ISR, who sees what.', track: flowHw },
    { id: 'leader', short: 'above the HW', label: 'Above the HW: they survive', about: 'The new leader has them, so they become committed.', track: flowLeader },
    { id: 'trunc', short: 'truncation', label: 'Above the HW: they vanish', about: 'The new leader lacks them; others truncate by epoch.', track: flowTrunc },
    { id: 'isr', short: 'ISR changes', label: 'ISR changes and the controller', about: 'AlterPartition shrinks and expands the ISR.', track: flowIsr },
  ],
  watch: flowHw,
  tryIt: {
    intro: 'Produce to the leader, let each follower fetch, and crash the leader. Committed records (below the HW) are solid, the rest faded.',
    observe: 'The HW only moves when every ISR member has a record; a leader change keeps what the new leader has and truncates the rest.',
    controls: [
      { type: 'button', label: 'Produce', primary: true, run: 'produce' },
      { type: 'button', label: 'B2 fetches', run: 'f1' },
      { type: 'button', label: 'B3 fetches', run: 'f2' },
      { type: 'button', label: 'Crash leader / bring back', run: 'crash' },
    ],
    build(s) { const v = scene(s, { ends: [102, 102, 102], hw: 102 }); v.b[1].hw = 102; v.b[2].hw = 102; render(v); v.message = 'Produce a record, then let only one follower fetch and see where the HW stays.'; return v; },
    async produce(s, v) { unfocus(v); v.message = await tryProduce(s, v); },
    async f1(s, v) { unfocus(v); v.message = await tryFetch(s, v, 1); },
    async f2(s, v) { unfocus(v); v.message = await tryFetch(s, v, 2); },
    async crash(s, v) { unfocus(v); v.message = await tryCrash(s, v); },
    readout: v => `<b>${ctlText(v)}</b> · HW <b>${v.hw}</b> · LEO ${v.b.map(b => `${b.name} ${v.alive[b.i] ? b.end : '✕'}`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Last stable offset, log start offset, and what consumers see on followers.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; preHw(v); return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['cons', 'b0'],
        title: 'The last stable offset (transactions)',
        text: 'With transactions, a read_committed consumer stops even earlier: at the last stable offset (LSO), the first offset of a transaction that is still open. LSO ≤ HW ≤ LEO.',
        observe: 'Three numbers per partition for a transactional consumer.',
        async run(s, v) { await swap(s, v.n.cons.s, 'read_committed: up to LSO ≤ HW', BLUE); },
      },
      {
        on: ['b0'],
        title: 'The log start offset',
        text: 'Retention moves the other end: the log start offset is the oldest offset still kept. A consumer can read between the log start offset and the HW; outside that, auto.offset.reset applies.',
        observe: 'Readable window: log start ≤ offset < HW.',
        async run(s, v) { await swap(s, v.b[0].noteT, 'log start 0 · HW 102 · LEO 104', BLUE); },
      },
      {
        on: ['b1', 'cons'],
        title: 'Reading from a follower',
        text: 'A consumer reading from a follower (KIP-392) is limited by that follower\'s HW, which lags the leader\'s by up to one fetch. If it asks for an offset the follower has not committed yet, it simply waits for it.',
        observe: 'B2\'s HW is the limit for a consumer reading from B2.',
        async run(s, v) { hit(v, 'b1'); await s.wait(500); },
      },
    ],
  },
  takeaway: 'HW = the smallest LEO among the ISR. Below it, records are committed: readable, acknowledged to acks=all producers, and kept through leader changes. Above it they may survive (if the new leader has them) or be truncated. ISR changes are proposed by the leader and committed by the controller (AlterPartition).',
  recap: {
    points: [
      'LEO: the next offset a replica will write; every replica has its own.',
      'HW (on the leader): smallest LEO among the ISR; below it = committed.',
      'Consumers read only below the HW; acks=all producers are answered when the HW passes their records.',
      'Followers learn the HW from fetch responses, one round late.',
      'On a leader change, the new leader\'s log wins; records above the old HW may survive or be truncated (leader epoch).',
      'ISR shrink/expand: leader sends AlterPartition, controller commits it.',
    ],
    interview: [
      { q: 'What is the high watermark?', a: 'The offset up to which a record is on **every in-sync replica**: the leader sets it to the **smallest LEO in the ISR**. Records **below** it are **committed**: consumers can read them and acks=all producers have been told success. Records **above** it are written but not yet safe.' },
      { q: 'Why can\'t consumers read up to the leader\'s LEO?', a: 'Records above the HW might **not survive a leader change**: the new leader may not have them, and they would be truncated. Limiting reads to the HW means a consumer never sees a record that later "disappears".' },
      { q: 'Can uncommitted records survive a leader failure?', a: 'Sometimes. The **new leader keeps its whole log**, so records it already had (above the old HW) become committed once followers copy them. Records it did not have are **truncated** on the other replicas via the **leader epoch**. Either way nothing **acknowledged** with acks=all is lost.' },
      { q: 'Who changes the ISR?', a: 'The **partition leader** decides a follower is out of sync (not caught up for **replica.lag.time.max.ms**) or back in sync (**LEO ≥ HW**), and proposes it with an **AlterPartition** request. The **controller** validates it, commits it to the metadata log and bumps the partition epoch.' },
    ],
  },
  quiz: {
    q: 'Leader LEO 110, ISR followers at LEO 108 and 105. A consumer fetches from offset 100. Which offsets can it get right now?',
    options: ['100–109', '100–107', '100–104', 'Only 100'],
    answer: 2,
    why: 'HW = min(110, 108, 105) = 105, so offsets 100–104 are committed and readable. 105 and later wait until the slowest ISR follower has them.',
  },
  related: ['replication', 'acks', 'election'],
};
