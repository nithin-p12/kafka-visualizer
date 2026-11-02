// Level 2 · Link 4: leader election. A broker dies; the controller notices, picks a new leader from the ISR with a
// new leader epoch, and clients move over. Flows: the leader crashes, the old leader returns, no in-sync replica left.
import { PARTITION_COLORS as PC } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, start, layers, frame, node, part, wire, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0];
const BLK = { w: 32, h: 26, size: 12 };
// ---- layout (960 × 460) ----
const BX = [170, 480, 790], BY = 220;
const slot = off => -72 + (off - 100) * 36;            // log slot relative to a broker frame
const NAMES = ['B1', 'B2', 'B3'];
const arc = (x1, x2, d) => `M${x1},290 C${x1},${290 + d} ${x2},${290 + d} ${x2},290`;

function scene(s, { logs = [105, 104, 104], isr = [0, 1, 2], leader = 0, hw = 104 } = {}) {
  const v = start(s, { parent: {} });
  v.epoch = 5; v.leader = leader; v.isr = [...isr]; v.hw = hw; v.unclean = false;

  node(s, v, 'ctl', 480, 66, 440, 58, 'Controller (KRaft quorum)', { sub: '' });
  v.n.ctl.s.setAttribute('font-family', MONO);
  v.b = NAMES.map((name, i) => {
    const b = frame(s, v, `b${i}`, BX[i], BY, 280, 140, `Broker ${name}`);
    b.roleT = s.text(b, 126, -52, '', { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700 });
    s.text(b, -126, -10, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.leoT = s.text(b, -126, 34, '', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.epochT = s.text(b, 126, 34, 'epoch 5', { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, fill: MUTED });
    Object.assign(b, { name, i, end: logs[i], alive: true, blocks: [] });
    for (let o = 100; o < logs[i]; o++) b.blocks.push(s.block(slot(o), -10, `${o}`, P0, { ...BLK, parent: b }));
    return b;
  });
  node(s, v, 'prod', 170, 400, 280, 60, 'Producer', { sub: 'metadata: P0 → B1' });
  node(s, v, 'clock', 480, 400, 260, 60, 'B1 heartbeats', { sub: 'every 2 s · last: just now' });
  node(s, v, 'cons', 790, 400, 280, 60, 'Consumer', { sub: 'P0 → B1 · position 104' });
  for (const k of ['prod', 'clock', 'cons']) v.n[k].s.setAttribute('font-family', MONO);

  // heartbeats up to the controller, metadata updates down
  wire(v, 'hb0', 'M160,150 C160,124 290,124 300,95'); wire(v, 'ctl0', 'M316,95 C316,128 186,126 186,150');
  wire(v, 'hb1', 'M470,150 L470,95'); wire(v, 'ctl1', 'M490,95 L490,150');
  wire(v, 'hb2', 'M800,150 C800,124 670,124 660,95'); wire(v, 'ctl2', 'M644,95 C644,128 774,126 774,150');
  // replication: follower → leader fetches (arcs under the brokers)
  wire(v, 'f1to0', arc(430, 230, 26)); wire(v, 'f2to0', arc(760, 250, 44));
  wire(v, 'f2to1', arc(740, 530, 26)); wire(v, 'f0to1', arc(210, 430, 44));
  // clients
  wire(v, 'p0', 'M150,370 L150,290'); wire(v, 'p1', 'M250,370 C250,336 400,336 410,290');
  wire(v, 'c0', 'M700,370 C700,340 280,340 270,290'); wire(v, 'c1', 'M730,370 C730,336 560,336 550,290');
  wire(v, 'p0b', 'M150,370 L150,290', { hidden: true });
  layers(s, v);
  render(v);
  return v;
}

// ---- state → text ----
const isrText = v => `{${v.isr.map(i => NAMES[i]).join(', ')}}`;
const ctlText = v => v.leader < 0 ? `orders-0 · NO LEADER · epoch ${v.epoch} · ISR ${isrText(v)}` : `orders-0 · leader ${NAMES[v.leader]} · epoch ${v.epoch} · ISR ${isrText(v)}`;
function roleOf(v, b) {
  if (!b.alive) return ['✕ down', RED];
  if (b.i === v.leader) return ['★ leader', AMBER];
  return v.isr.includes(b.i) ? ['follower · in ISR', MUTED] : ['follower · out of ISR', AMBER];
}
function render(v) {
  v.n.ctl.s.textContent = ctlText(v);
  for (const b of v.b) {
    const [t, c] = roleOf(v, b);
    b.roleT.textContent = t; b.roleT.setAttribute('fill', c);
    b.leoT.textContent = b.i === v.leader ? `LEO ${b.end} · HW ${v.hw}` : `LEO ${b.end}`;
    b.epochT.textContent = `epoch ${v.epoch}`;
    paint(b);
  }
}
function paint(b) {
  b.rect.setAttribute('stroke', b.alive ? '#c9ced2' : RED);
  b.rect.setAttribute('fill', b.alive ? '#fff' : '#fff4f4');
}
async function show(s, v, b) {
  const [t, c] = roleOf(v, b);
  paint(b);
  await Promise.all([swap(s, b.roleT, t, c), swap(s, b.leoT, b.i === v.leader ? `LEO ${b.end} · HW ${v.hw}` : `LEO ${b.end}`, BLUE), swap(s, b.epochT, `epoch ${v.epoch}`, MUTED)]);
  hit(v, `b${b.i}`);
}
const ctl = (s, v, color) => { hit(v, 'ctl'); return swap(s, v.n.ctl.s, ctlText(v), color); };
async function truncate(s, v, b, to) {
  const gone = b.blocks.splice(to - 100);
  for (const g of gone) g.rect.setAttribute('fill', RED);
  await Promise.all(gone.map(g => s.shake(g)));
  await Promise.all(gone.map(g => s.fade(g, 0, 300)));
  gone.forEach(g => g.remove());
  b.end = to;
}
async function append(s, b, off, color = P0) {
  const blk = s.block(slot(off), -10, `${off}`, color, { ...BLK, parent: b });
  b.blocks.push(blk);
  b.end = off + 1;
  await s.pop(blk, 250);
}
// The controller's election: the first live replica in the ISR (in assignment order) becomes leader; with none,
// only an unclean election (if enabled) may pick an out-of-sync replica.
function elect(v) {
  const clean = [0, 1, 2].filter(i => v.isr.includes(i) && v.b[i].alive);   // assignment order
  if (clean.length) return { leader: clean[0], clean: true };
  if (v.unclean) { const any = v.b.find(b => b.alive); if (any) return { leader: any.i, clean: false }; }
  return { leader: -1 };
}

// ---- flow 1: the leader crashes ----
const F = {
  normal: {
    phase: 'Before', on: ['ctl', 'b0', 'b1', 'b2'], wires: ['hb0', 'hb1', 'hb2', 'f1to0', 'f2to0'],
    title: 'A healthy partition',
    text: 'B1 leads orders-0 in leader epoch 5; B2 and B3 fetch from it. Every broker sends the controller a heartbeat every couple of seconds. B1 has just written offset 104 with acks=1; the followers have not fetched it yet.',
    observe: 'Heartbeats go up to the controller; fetch arcs run from B2 and B3 to B1. Only B1 has offset 104.',
    async run(s, v) {
      await Promise.all([0, 1, 2].map(i => packet(s, v, `hb${i}`, 'heartbeat', MUTED, { ms: 700 })));
      await Promise.all([packet(s, v, 'f1to0', 'Fetch(104)', BLUE, { ms: 800 }), packet(s, v, 'f2to0', 'Fetch(104)', BLUE, { ms: 900 })]);
      hit(v, 'b0');
    },
  },
  crash: {
    phase: 'Failure', on: ['b0'],
    title: 'B1 crashes',
    text: 'The machine running B1 loses power. There is no goodbye message: B1 simply stops answering. Its partitions, including orders-0, have no working leader now.',
    observe: 'B1 turns red: ✕ down.',
    async run(s, v) { v.b[0].alive = false; await show(s, v, v.b[0]); await s.shake(v.b[0]); },
  },
  missed: {
    phase: 'Detection', on: ['clock', 'ctl'], wire: 'hb0',
    title: 'The controller misses B1\'s heartbeats',
    text: 'The controller does not know about the crash yet. It waits for broker.session.timeout.ms (9 s by default in KRaft) without a heartbeat before it believes a broker is gone.',
    observe: 'The heartbeat clock counts up: 3 s, 6 s, 9 s since the last one.',
    async run(s, v) {
      for (const t of [3, 6, 9]) { await swap(s, v.n.clock.s, `last: ${t} s ago${t === 9 ? ' · timeout!' : ''}`, t === 9 ? RED : AMBER); await s.wait(250); }
      hit(v, 'clock');
    },
  },
  fence: {
    phase: 'Detection', on: ['ctl', 'b0'],
    title: 'B1 is fenced',
    text: 'The controller fences B1: it is marked offline in the cluster metadata, and every partition it led needs a new leader. This happens for all of B1\'s partitions at once, not one by one.',
    observe: 'The controller line still says leader B1, but B1 is out.',
    async run(s, v) { await swap(s, v.n.clock.s, 'B1 fenced (offline)', RED); hit(v, 'ctl'); },
  },
  pick: {
    phase: 'Election', on: ['ctl', 'b1', 'b2'],
    title: 'Pick the first live replica in the ISR',
    text: 'The replicas of orders-0 are [B1, B2, B3] and the ISR is {B1, B2, B3}. The controller takes the first one that is alive and in the ISR: B2. Only ISR members are eligible, because they have every committed record.',
    observe: 'The controller line: leader B2, ISR {B2, B3}.',
    async run(s, v) { v.isr = v.isr.filter(i => i !== 0); v.leader = 1; await ctl(s, v, AMBER); },
  },
  epoch: {
    phase: 'Election', on: ['ctl'],
    title: 'A new leader epoch: 6',
    text: 'Every leader change increments the leader epoch, here 5 → 6. Brokers and clients compare epochs, so a stale message from the old leader (or a zombie B1 that comes back) is recognised and refused.',
    observe: 'epoch 5 → 6 in the controller line.',
    async run(s, v) { v.epoch = 6; await ctl(s, v, AMBER); },
  },
  tell: {
    phase: 'Election', on: ['ctl', 'b1', 'b2'], wires: ['ctl1', 'ctl2'],
    title: 'The brokers learn the new leadership',
    text: 'The change is written to the controller\'s metadata log, and the brokers pick it up from there. B2 starts acting as leader of orders-0, B3 as a follower of B2, both in epoch 6.',
    observe: 'Metadata updates travel down to B2 and B3; B2 becomes ★ leader.',
    async run(s, v) {
      await Promise.all([1, 2].map(i => packet(s, v, `ctl${i}`, 'leader B2 · epoch 6', AMBER, { ms: 800 })));
      await Promise.all([show(s, v, v.b[1]), show(s, v, v.b[2])]);
    },
  },
  lost: {
    phase: 'New leader', on: ['b1', 'b0'],
    title: 'Offset 104 is gone',
    text: 'B2\'s log ends at 103, so the new leader\'s log ends at 103. Offset 104 existed only on B1. It was written with acks=1, so its producer was told "success", yet it is lost. With acks=all it would not have been acknowledged.',
    observe: 'B2 (leader) has 100–103; the 104 on dead B1 will never be read.',
    async run(s, v) { const g = v.b[0].blocks.at(-1); g.rect.setAttribute('fill', RED); await s.pulse(g); },
  },
  refollow: {
    phase: 'New leader', on: ['b2', 'b1'], wire: 'f2to1',
    title: 'B3 now fetches from B2',
    text: 'B3 switches its fetcher to the new leader and asks Fetch(104). B2 has nothing beyond 103, so the reply is empty. Replication carries on with two copies.',
    observe: 'A fetch arc now runs from B3 to B2.',
    async run(s, v) { await packet(s, v, 'f2to1', 'Fetch(104)', BLUE, { ms: 700 }); hit(v, 'b1'); },
  },
  clients: {
    phase: 'Clients move', on: ['prod', 'b0', 'b1'], wires: ['p0', 'p1'],
    title: 'The producer fails over',
    text: 'The producer\'s next send to B1 fails (connection refused or a timeout). It is retriable: the producer refreshes its metadata from a live broker, learns P0 → B2 in epoch 6 and retries there.',
    observe: 'A send to B1 bounces; the producer\'s metadata changes to P0 → B2; the retry goes to B2.',
    async run(s, v) {
      await packet(s, v, 'p0', 'Produce', RED, { ms: 600 });
      await s.shake(v.n.prod);
      await packet(s, v, 'p1', 'Metadata?', BLUE, { ms: 700 });
      await swap(s, v.n.prod.s, 'metadata: P0 → B2 (epoch 6)', AMBER);
      await packet(s, v, 'p1', 'Produce (retry)', BLUE, { ms: 700 });
      await append(s, v.b[1], 104, '#2f9e8f');
      await append(s, v.b[2], 104, '#2f9e8f');   // B3 fetches it from B2
      v.hw = 105; await Promise.all([show(s, v, v.b[1]), show(s, v, v.b[2])]);
    },
  },
  reused: {
    phase: 'Clients move', on: ['b1', 'b0'],
    title: 'Offset 104 now means a different record',
    text: 'The retried record is written on B2 as offset 104. B1\'s old 104 was a different record. Offsets are only stable for committed data (below the HW); anything above it on a failed leader can be replaced.',
    observe: 'A new 104 (teal) on B2 next to B1\'s red 104.',
    async run(s, v) { await s.pulse(v.b[1].blocks.at(-1)); },
  },
  consumer: {
    phase: 'Clients move', on: ['cons', 'b1'], wire: 'c1',
    title: 'The consumer fails over too, and lost nothing it had seen',
    text: 'The consumer\'s fetch to B1 fails, it refreshes metadata and continues from position 104 on B2. It never saw B1\'s 104: the HW was 104, so offset 104 was not committed and not readable.',
    observe: 'The consumer\'s metadata says P0 → B2; its fetch goes to B2.',
    async run(s, v) {
      await s.shake(v.n.cons);
      await swap(s, v.n.cons.s, 'P0 → B2 · position 104', AMBER);
      await packet(s, v, 'c1', 'Fetch(104)', BLUE, { ms: 800 });
      hit(v, 'b1');
    },
  },
};

// ---- flow 2: the old leader returns ----
async function presetFailover(s, v) {
  const was = s.clock.instant;
  s.clock.instant = true;
  for (const st of [F.crash, F.missed, F.fence, F.pick, F.epoch, F.tell, F.clients, F.consumer]) await st.run(s, v);
  s.clock.instant = was;
}
const RTN = {
  restart: {
    phase: 'B1 returns', on: ['b0', 'ctl'], wire: 'hb0',
    title: 'B1 restarts and registers',
    text: 'B1 comes back and heartbeats to the controller, which unfences it. It is now just a follower of orders-0: B2 leads in epoch 6. B1 still has its old offset 104 on disk.',
    observe: 'B1 is back as a follower, out of the ISR, still holding the old 104.',
    async run(s, v) {
      v.b[0].alive = true;
      await packet(s, v, 'hb0', 'heartbeat', MUTED, { ms: 700 });
      await swap(s, v.n.clock.s, 'B1 unfenced · follower', GREEN);
      await show(s, v, v.b[0]);
    },
  },
  ask: {
    phase: 'B1 returns', on: ['b0', 'b1'], wire: 'f0to1',
    title: 'B1 asks: where did epoch 5 end?',
    text: 'Before fetching, the returning replica checks its log against the leader using leader epochs: "my last epoch was 5; where does epoch 5 end on your log?" B2 answers: at offset 104.',
    observe: 'An OffsetsForLeaderEpoch request goes to B2 and the answer "epoch 5 ends at 104" comes back.',
    async run(s, v) { await packet(s, v, 'f0to1', 'epoch 5 ends?', BLUE, { ms: 800 }); await swap(s, v.b[0].leoT, 'epoch 5 ends at 104', AMBER); },
  },
  truncate: {
    phase: 'B1 returns', on: ['b0'],
    title: 'B1 cuts off its old 104',
    text: 'Everything B1 has from offset 104 on was never committed, so it truncates its log to 104. The record a producer was told "success" for (with acks=1) is now gone from every broker.',
    observe: 'B1\'s old 104 shakes, turns red and disappears.',
    async run(s, v) { await truncate(s, v, v.b[0], 104); await show(s, v, v.b[0]); },
  },
  catchup: {
    phase: 'B1 returns', on: ['b0', 'b1'], wire: 'f0to1',
    title: 'B1 fetches from B2 and rejoins the ISR',
    text: 'B1 now fetches like any follower: Fetch(104) brings B2\'s new 104. Its LEO reaches the HW, so B2 adds it back to the ISR: {B2, B3, B1}.',
    observe: 'B1 gets the teal 104 and shows "follower · in ISR".',
    async run(s, v) {
      await packet(s, v, 'f0to1', 'Fetch(104)', BLUE, { ms: 800 });
      await append(s, v.b[0], 104, '#2f9e8f');
      v.isr = [1, 2, 0];
      await Promise.all([show(s, v, v.b[0]), ctl(s, v, GREEN)]);
    },
  },
  preferred: {
    phase: 'Preferred leader', on: ['ctl', 'b0', 'b1'], wires: ['ctl0', 'ctl1'],
    title: 'Leadership moves back to the preferred replica',
    text: 'B1 is first in the replica list, the "preferred leader". With auto.leader.rebalance.enable=true the controller checks every 300 s and moves leadership back so it stays spread over the brokers: leader B1, epoch 7.',
    observe: 'The controller line: leader B1 · epoch 7; B1 is ★ leader again, B2 a follower.',
    async run(s, v) {
      v.leader = 0; v.epoch = 7; v.isr = [0, 1, 2];
      await ctl(s, v, AMBER);
      await Promise.all([0, 1].map(i => packet(s, v, `ctl${i}`, 'leader B1 · epoch 7', AMBER, { ms: 700 })));
      await Promise.all(v.b.map(b => show(s, v, b)));
    },
  },
  back: {
    phase: 'Preferred leader', on: ['prod', 'cons'],
    title: 'Clients follow, the same way',
    text: 'Producers and consumers get NOT_LEADER_OR_FOLLOWER from B2, refresh their metadata and go to B1. A planned move like this costs only a short pause, no data.',
    observe: 'Both clients now show P0 → B1 (epoch 7).',
    async run(s, v) { await Promise.all([swap(s, v.n.prod.s, 'metadata: P0 → B1 (epoch 7)', GREEN), swap(s, v.n.cons.s, 'P0 → B1 · position 105', GREEN)]); },
  },
};

// ---- flow 3: no in-sync replica left ----
const U = {
  alone: {
    phase: 'Before', on: ['b0', 'b1', 'b2', 'ctl'],
    title: 'The ISR has shrunk to the leader',
    text: 'B2 and B3 fell behind (they only have up to 101) and were dropped from the ISR: it is {B1}. With acks=1 producers, B1 kept accepting and committing writes alone, up to offset 104.',
    observe: 'ISR {B1}; B2 and B3 are "out of ISR" with logs ending at 101.',
    async run(s, v) { hit(v, 'ctl'); await s.pulse(v.n.ctl); },
  },
  crash: { ...F.crash, phase: 'Failure', text: 'Now B1 crashes. It was the only in-sync replica. B2 and B3 are alive, but both are missing committed records 102–104.' },
  offline: {
    phase: 'Clean choice (default)', on: ['ctl', 'b1', 'b2'],
    title: 'unclean.leader.election.enable=false: the partition goes offline',
    text: 'No live replica is in the ISR, and by default (false since 0.11) Kafka will not pick one that is out of sync. orders-0 has no leader: producers and consumers get errors until B1 comes back. Nothing is lost, but nothing works.',
    observe: 'The controller line: NO LEADER.',
    async run(s, v) { v.leader = -1; v.epoch = 6; await ctl(s, v, RED); await Promise.all([swap(s, v.n.prod.s, 'error: no leader for P0', RED), swap(s, v.n.cons.s, 'error: no leader for P0', RED)]); },
  },
  unclean: {
    phase: 'Unclean choice', on: ['ctl', 'b1'], wire: 'ctl1',
    title: 'unclean=true: an out-of-sync replica takes over',
    text: 'If the topic allows unclean leader election, the controller makes B2 leader anyway (epoch 7). The partition works again at once, but its log ends at 101.',
    observe: 'B2 becomes ★ leader with a log ending at 101.',
    async run(s, v) {
      v.leader = 1; v.epoch = 7; v.isr = [1]; v.hw = 102;
      await ctl(s, v, AMBER);
      await packet(s, v, 'ctl1', 'leader B2 · epoch 7', AMBER, { ms: 700 });
      await show(s, v, v.b[1]);
      await Promise.all([swap(s, v.n.prod.s, 'metadata: P0 → B2 (epoch 7)', AMBER), swap(s, v.n.cons.s, 'P0 → B2 · position 105?', RED)]);
    },
  },
  loss: {
    phase: 'Unclean choice', on: ['b0', 'b1', 'cons'],
    title: 'Committed records 102–104 are lost',
    text: 'Offsets 102–104 were committed and may already have been consumed, yet the new leader never had them. New writes will reuse those offsets for other records, and consumers can see offsets go backwards. Availability was bought with data loss.',
    observe: 'B1\'s 102–104 (red) exist nowhere else.',
    async run(s, v) { for (const g of v.b[0].blocks.slice(2)) { g.rect.setAttribute('fill', RED); } await Promise.all(v.b[0].blocks.slice(2).map(g => s.pulse(g))); },
  },
};

const trackOf = (steps, opts, pre) => {
  const t = { continuous: true, steps, enter, async build(s) { const v = scene(s, opts); v.track = t; if (pre) await pre(s, v); return v; } };
  return t;
};
const flowCrash = trackOf([F.normal, F.crash, F.missed, F.fence, F.pick, F.epoch, F.tell, F.lost, F.refollow, F.clients, F.reused, F.consumer]);
const flowReturn = trackOf([RTN.restart, RTN.ask, RTN.truncate, RTN.catchup, RTN.preferred, RTN.back], undefined, presetFailover);
const flowUnclean = trackOf([U.alone, U.crash, U.offline, U.unclean, U.loss], { logs: [105, 102, 102], isr: [0], hw: 105 });

// ---- try it: stop and start brokers, send records, with the real election rules ----
async function tryStop(s, v, i) {
  const b = v.b[i];
  b.alive = false;
  await show(s, v, b);
  if (v.isr.includes(i) && i !== v.leader) v.isr = v.isr.filter(x => x !== i);
  if (i !== v.leader) { await ctl(s, v, AMBER); return `${b.name} stopped. It was a follower, so the leader stays ${NAMES[v.leader] ?? 'none'}; it leaves the ISR.`; }
  await swap(s, v.n.clock.s, `${b.name}: no heartbeat 9 s → fenced`, RED);
  const was = v.isr; v.isr = v.isr.filter(x => x !== i);
  const r = elect(v);
  if (r.leader < 0) {
    v.isr = was;                                       // the last ISR member is kept so it can lead again on return
    v.leader = -1;
    await ctl(s, v, RED);
    return v.unclean && !v.b.some(x => x.alive) ? `${b.name} was the leader and no replica is alive at all, so orders-0 is offline even with unclean election on.`
      : `${b.name} was the leader and no in-sync replica is alive. With unclean election off, orders-0 is offline until an ISR member returns.`;
  }
  const nb = v.b[r.leader], lost = Math.max(0, b.end - nb.end);
  v.leader = r.leader; v.epoch++;
  if (!r.clean) v.isr = [r.leader];
  v.hw = Math.min(v.hw, nb.end);
  await ctl(s, v, r.clean ? AMBER : RED);
  await packet(s, v, `ctl${r.leader}`, `leader ${nb.name} · epoch ${v.epoch}`, AMBER, { ms: 600 });
  await Promise.all(v.b.map(x => show(s, v, x)));
  return r.clean ? `${b.name} (leader) stopped. The controller picked ${nb.name}, the first live ISR member; epoch ${v.epoch}.${lost ? ` ${lost} record${lost > 1 ? 's' : ''} only ${b.name} had will be cut off when it returns.` : ''}`
    : `Unclean election: ${nb.name} was out of sync but became leader (epoch ${v.epoch}). ${lost} committed record${lost === 1 ? '' : 's'} lost.`;
}
async function tryStart(s, v, i) {
  const b = v.b[i];
  b.alive = true;
  await packet(s, v, `hb${i}`, 'heartbeat', MUTED, { ms: 500 });
  if (v.leader < 0) {
    if (v.isr.includes(i)) {
      v.leader = i; v.epoch++;
      await ctl(s, v, GREEN);
      await Promise.all(v.b.map(x => show(s, v, x)));
      return `${b.name} was the last in-sync replica, so it leads again (epoch ${v.epoch}). orders-0 is back without losing data.`;
    }
    if (v.unclean) {
      const lost = Math.max(0, v.hw - b.end);
      v.leader = i; v.epoch++; v.isr = [i]; v.hw = b.end;
      await ctl(s, v, RED);
      await Promise.all(v.b.map(x => show(s, v, x)));
      return `Unclean election: ${b.name} was out of sync but became leader (epoch ${v.epoch}).${lost ? ` ${lost} committed record${lost > 1 ? 's' : ''} lost.` : ''}`;
    }
    await show(s, v, b);
    return `${b.name} is back but out of sync, so it cannot lead (unclean election is off). orders-0 is still offline.`;
  }
  const lead = v.b[v.leader];
  let cut = 0;
  if (b.end > lead.end) { cut = b.end - lead.end; await truncate(s, v, b, lead.end); }
  for (let o = b.end; o < lead.end; o++) await append(s, b, o, lead.blocks[o - 100].rect.getAttribute('fill'));
  if (!v.isr.includes(i)) v.isr.push(i);
  await Promise.all([ctl(s, v, GREEN), show(s, v, b)]);
  return `${b.name} is back as a follower${cut ? `, cut off ${cut} uncommitted record${cut > 1 ? 's' : ''}` : ''}, caught up to ${lead.end - 1} and rejoined the ISR.`;
}
async function trySend(s, v) {
  if (v.leader < 0) { await s.shake(v.n.prod); return 'No leader: the producer gets errors and retries until delivery.timeout.ms.'; }
  const lead = v.b[v.leader];
  if (lead.end > 105) return 'The sandbox log is full. Switch tabs and back to start again.';
  // Live followers outside the ISR catch up first (truncating anything the leader does not have) and rejoin.
  for (const b of v.b) if (b.alive && b.i !== v.leader && !v.isr.includes(b.i)) {
    if (b.end > lead.end) await truncate(s, v, b, lead.end);
    for (let o = b.end; o < lead.end; o++) await append(s, b, o, lead.blocks[o - 100].rect.getAttribute('fill'));
    v.isr.push(b.i);
  }
  const off = lead.end;
  await append(s, lead, off);
  for (const i of v.isr) if (i !== v.leader && v.b[i].alive) await append(s, v.b[i], off);
  v.hw = off + 1;
  await Promise.all(v.b.map(x => show(s, v, x)));
  return `Offset ${off} written to ${lead.name} and copied to every live ISR member: ${v.isr.filter(i => v.b[i].alive).map(i => NAMES[i]).join(', ')}.`;
}

export default {
  id: 'election', n: 16, title: 'Leader election', tagline: 'When a leader dies',
  docked: true,
  guide: {
    what: 'When a broker fails, the controller notices missing heartbeats, fences it and gives each partition it led a new leader: the first live replica in the ISR, with a new leader epoch. Clients refresh their metadata and carry on.',
    fits: 'Fourth link of Level 2: broker failure → new leader. Replication kept followers in sync; that is what makes them safe to promote. Next: partition assignment, the consumer side.',
  },
  flows: [
    { id: 'crash', short: 'leader crash', label: 'The leader crashes', about: 'Detect, pick from the ISR, new epoch, clients fail over.', track: flowCrash },
    { id: 'return', short: 'old leader returns', label: 'The old leader returns', about: 'Truncate to the new leader, catch up, preferred leader.', track: flowReturn },
    { id: 'unclean', short: 'unclean', label: 'No in-sync replica left', about: 'Offline by default, or data loss with unclean election.', track: flowUnclean },
  ],
  watch: flowCrash,
  tryIt: {
    intro: 'Stop and start brokers and send records. The controller follows the real rules: the first live ISR member leads; with none, the partition is offline unless unclean election is on.',
    observe: 'Stopping a follower changes nothing for clients; stopping the leader moves leadership; returning brokers truncate and catch up.',
    controls: [
      { type: 'choice', name: 'unclean', label: 'unclean election', options: ['off', 'on'], rebuild: true },
      { type: 'button', label: 'send()', primary: true, run: 'send' },
      { type: 'button', label: 'Stop / start B1', run: 'b0' },
      { type: 'button', label: 'Stop / start B2', run: 'b1' },
      { type: 'button', label: 'Stop / start B3', run: 'b2' },
    ],
    build(s, input) {
      const v = scene(s, { logs: [102, 102, 102], hw: 102 });
      v.unclean = input?.unclean === 'on';
      v.n.clock.t.textContent = 'controller events'; v.n.clock.s.textContent = 'all brokers heartbeating';
      v.message = 'Stop B1, the leader, and watch who takes over. Then stop the others, or bring B1 back.';
      return v;
    },
    async send(s, v) { unfocus(v); v.message = await trySend(s, v); },
    async b0(s, v) { unfocus(v); v.message = await (v.b[0].alive ? tryStop(s, v, 0) : tryStart(s, v, 0)); },
    async b1(s, v) { unfocus(v); v.message = await (v.b[1].alive ? tryStop(s, v, 1) : tryStart(s, v, 1)); },
    async b2(s, v) { unfocus(v); v.message = await (v.b[2].alive ? tryStop(s, v, 2) : tryStart(s, v, 2)); },
    readout: v => `<b>${ctlText(v)}</b> · unclean election <b>${v.unclean ? 'on' : 'off'}</b><br>${v.message}`,
  },
  deeper: {
    note: 'The controller itself, zombie leaders, and how long failover takes.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['ctl'],
        title: 'Who elects the controller?',
        text: 'In KRaft mode a few controller nodes form a Raft quorum; one is the active controller and the others replicate its metadata log, taking over within seconds if it fails. (Older clusters used ZooKeeper and a controller broker.) See the KRaft deep dive.',
        observe: 'The controller box stands for the whole quorum.',
        async run(s, v) { await swap(s, v.n.ctl.t, 'Controller · active of 3 (Raft)', AMBER); },
      },
      {
        on: ['b0', 'ctl'],
        title: 'Zombie leaders are stopped by the epoch',
        text: 'A B1 that was only cut off by the network may still think it leads in epoch 5. Followers and the controller are already in epoch 6, so its fetch responses and writes are rejected, and with acks=all it cannot commit anything alone.',
        observe: 'B1 in epoch 5 versus everyone else in epoch 6.',
        async run(s, v) { await swap(s, v.b[0].roleT, '★ leader? (epoch 5)', RED); },
      },
      {
        on: ['clock'],
        title: 'How long a failover takes',
        text: 'Most of it is detection: broker.session.timeout.ms (9 s). The election itself and the metadata update take milliseconds, even for thousands of partitions in KRaft. A clean shutdown is faster still: the broker hands its leaderships over before stopping.',
        observe: 'The clock box: detection dominates.',
        async run(s, v) { await swap(s, v.n.clock.s, 'detect ~9 s · elect ~ms', AMBER); },
      },
      {
        on: ['b1', 'b2'],
        title: 'Spread leaders with preferred replicas',
        text: 'Each partition\'s first replica is its preferred leader, and partitions are created so these are spread over the brokers. After failures, auto.leader.rebalance.enable (or kafka-leader-election.sh) moves leadership back, so one broker does not end up leading everything.',
        observe: 'Leadership is a per-partition role; here only orders-0 is drawn.',
        async run(s, v) { hit(v, 'b1'); await s.wait(500); },
      },
    ],
  },
  takeaway: 'Broker dies → no heartbeats for broker.session.timeout.ms → the controller fences it → for each of its partitions the first live ISR replica becomes leader with a new epoch → clients refresh metadata. Records only the old leader had are cut off; with no live ISR member the partition stays offline unless unclean election is allowed.',
  recap: {
    points: [
      'The controller detects failure by missing heartbeats (broker.session.timeout.ms, 9 s in KRaft).',
      'New leader = first live replica in the ISR, in assignment order.',
      'Every change bumps the leader epoch; stale leaders and requests are rejected by epoch.',
      'Records only the old leader had (above the HW) are truncated when it returns.',
      'Clients get errors, refresh metadata and retry against the new leader.',
      'No live ISR member: offline (default) or unclean election with data loss.',
    ],
    interview: [
      { q: 'What happens when a partition leader fails?', a: 'The **controller** notices missing heartbeats after **broker.session.timeout.ms**, **fences** the broker, and for each partition it led picks the **first live replica in the ISR** as leader, with a **new leader epoch**. The change goes to the metadata log; brokers switch roles; **clients refresh metadata** and retry against the new leader.' },
      { q: 'Why can only ISR members become leader?', a: 'An ISR member has **every committed record** (everything below the HW). Promoting an out-of-sync replica would **lose committed data**. That is why acks=all plus min.insync.replicas=2 means an acknowledged record survives one broker failure.' },
      { q: 'What is unclean leader election?', a: 'Electing an **out-of-sync** replica when no ISR member is alive. **unclean.leader.election.enable=false** (default) keeps the partition **offline** instead, protecting data; **true** restores availability at once but **loses committed records** and can make offsets go backwards.' },
      { q: 'What is the leader epoch for?', a: 'A counter bumped on every leader change. Followers use it to **truncate** records the new leader does not have (OffsetsForLeaderEpoch), and brokers and clients use it to **reject stale or zombie leaders**. It replaced the older HW-based truncation, which could lose or diverge data.' },
    ],
  },
  quiz: {
    q: 'B1 leads orders-0 with ISR {B1, B2, B3} and crashes. Replica order is [B1, B2, B3]. Who becomes leader?',
    options: ['B3, because it has the most data', 'B2, the first live replica in the ISR', 'Nobody until B1 returns', 'The controller itself'],
    answer: 1,
    why: 'The controller picks the first live replica in the ISR, in assignment order: B2. Every ISR member has all committed records, so it does not need the one with the most data.',
  },
  related: ['replication', 'acks', 'cluster'],
};
