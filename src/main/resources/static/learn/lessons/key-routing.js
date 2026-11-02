// Level 2 · Link 1: key → partition. How the producer's default partitioner turns a key into a partition number,
// event by event, on one map: send() → which rule → the partitioner's four steps → the topic's partitions.
import { PARTITION_COLORS as PC, el, place, murmur2 } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { INK, MONO, BLUE, start, layers, frame, node, part, wire, ride, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

// ---- layout (960 × 460) ----
const PX = 179;                                                   // producer column centre
const Y = { send: 80, rule: 147, bytes: 230, hash: 284, pos: 338, mod: 392 };
const LANE_Y = [100, 200, 300, 400], LANE_X = 690, SLOT0 = 520, SLOT_DX = 76, SLOTS = 6;
const CHIP = { w: 70, h: 32, size: 14 };

const hex = key => [...new TextEncoder().encode(key)].map(b => b.toString(16).padStart(2, '0')).join(' ');
export const route = (key, n) => { const h = murmur2(key), pos = h & 0x7fffffff; return { bytes: hex(key), h, pos, p: pos % n }; };
const fmt = n => String(n);

function scene(s, { partitions = 3 } = {}) {
  const v = start(s, { parent: { send: 'prod', rule: 'prod', part: 'prod', bytes: 'part', hash: 'part', pos: 'part', mod: 'part', p0: 'topic', p1: 'topic', p2: 'topic', p3: 'topic' } });
  v.count = partitions;
  v.sticky = 1;

  // ---- producer ----
  frame(s, v, 'prod', PX, 238, 330, 416, 'Producer', { color: '#7a4aa3', fill: '#fcfaff', stroke: '#d8b7e9' });
  node(s, v, 'send', PX, Y.send, 300, 46, 'send("ORD101", order)', { mono: true, size: 15 });
  node(s, v, 'rule', PX, Y.rule, 300, 40, 'rule: ?', { size: 15 });
  frame(s, v, 'part', PX, 307, 312, 258, 'default partitioner', { color: MUTED });
  const pt = v.n.part.querySelector('text'); pt.setAttribute('x', 142); pt.setAttribute('text-anchor', 'end');   // clear of the wire down the middle
  const step = (key, y, title) => { const n = node(s, v, key, PX, y, 280, 44, title, { sub: '', size: 15 }); n.s.setAttribute('font-family', MONO); return n; };
  step('bytes', Y.bytes, 'key → bytes (serialized)');
  step('hash', Y.hash, 'murmur2(bytes)');
  step('pos', Y.pos, '& 0x7fffffff · drop the sign');
  step('mod', Y.mod, '% number of partitions');

  // ---- topic ----
  frame(s, v, 'topic', 683, 238, 526, 416, 'topic orders', {});
  v.countT = s.text(v.n.topic, 249, -190, `partitions: ${partitions}`, { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: AMBER });
  v.lanes = LANE_Y.map((y, p) => {
    // A partition that does not exist yet sits in a hidden wrapper (focus classes on the lane itself would
    // override an opacity attribute and show it too early).
    const wrap = p >= partitions ? s.g(0, 0, s.root, { opacity: 0 }) : s.root;
    const l = s.box(LANE_X, y, 480, 60, '', { stroke: PC[p], rx: 8, parent: wrap });
    l.wrap = wrap;
    l.classList.add('jn');
    s.text(l, -224, 0, `P${p}`, { 'font-size': 18, 'font-weight': 800, fill: PC[p] });
    l.blocks = [];
    v.n[`p${p}`] = l;
    return l;
  });

  // ---- wires ----
  const vline = (x, y1, y2) => `M${x},${y1} L${x},${y2}`;
  wire(v, 'send-rule', vline(PX, Y.send + 23, Y.rule - 20));
  wire(v, 'rule-bytes', vline(PX, Y.rule + 20, Y.bytes - 22));
  wire(v, 'bytes-hash', vline(PX, Y.bytes + 22, Y.hash - 22));
  wire(v, 'hash-pos', vline(PX, Y.hash + 22, Y.pos - 22));
  wire(v, 'pos-mod', vline(PX, Y.mod - 32, Y.mod - 22));
  for (const [p, y] of LANE_Y.entries()) {
    wire(v, `mod-p${p}`, `M319,${Y.mod} C392,${Y.mod} 378,${y} 450,${y}`);
    wire(v, `rule-p${p}`, `M329,${Y.rule} C396,${Y.rule} 380,${y} 450,${y}`);
    if (p >= partitions) for (const k of [`mod-p${p}`, `rule-p${p}`]) v.w[k].style.display = 'none';
  }
  layers(s, v);
  return v;
}

// ---- motion ----
const slotX = (l, i) => SLOT0 + i * SLOT_DX - LANE_X;
// A record chip rides a wire into partition p and takes the next slot (the oldest slides out when the lane is full).
async function land(s, v, wireKey, p, key, ms = 1000) {
  const chip = s.block(...[0, 0], key, PC[p], { ...CHIP, parent: v.packs });
  const q = v.w[wireKey].getPointAtLength(0);
  place(chip, q.x, q.y);
  await s.pop(chip, 200);
  await ride(s, v, chip, wireKey, ms);
  const l = v.lanes[p];
  if (l.blocks.length >= SLOTS) {
    const old = l.blocks.shift();
    await Promise.all([s.fade(old, 0, 200), ...l.blocks.map((b, i) => s.move(b, slotX(l, i), 0, 300))]);
    old.remove();
  }
  await s.move(chip, LANE_X + slotX(l, l.blocks.length), LANE_Y[p], 350);
  chip.remove();
  l.blocks.push(s.block(slotX(l, l.blocks.length), 0, key, PC[p], { ...CHIP, parent: l }));
  hit(v, `p${p}`);
}
// The key's trip through the four partitioner steps: a bead glides down while each step shows its result.
async function pipe(s, v, key, { fast = false } = {}) {
  const r = route(key, v.count), ms = fast ? 260 : 600;
  const b = el('circle', { r: 7, fill: '#65727a', stroke: '#fff', 'stroke-width': 2 }, v.packs);
  place(b, PX, Y.rule);
  const visit = async (k, text, color) => { await s.move(b, PX, Y[k] - 0, ms); hit(v, k); await swap(s, v.n[k].s, text, color); };
  await visit('bytes', r.bytes, INK);
  await visit('hash', fmt(r.h), INK);
  await visit('pos', fmt(r.pos), r.h < 0 ? AMBER : INK);
  await visit('mod', `${r.pos} % ${v.count} = ${r.p} → P${r.p}`, PC[r.p]);
  b.setAttribute('fill', PC[r.p]);
  await s.fade(b, 0, 150);
  b.remove();
  return r;
}
async function call(s, v, key, rule) {
  hit(v, 'send');
  await swap(s, v.n.send.t, key == null ? 'send(null, event)' : `send("${key}", order)`);
  await swap(s, v.n.rule.t, rule);
}

// ---- events ----
const keyed = (key, { title, text, observe, phase = 'Same key, same partition' }) => ({
  phase, on: ['send', 'rule', 'bytes', 'hash', 'pos', 'mod'], wires: ['send-rule', 'rule-bytes', 'bytes-hash', 'hash-pos', 'pos-mod', `mod-p${route(key, 3).p}`],
  title, text, observe,
  async run(s, v) {
    await call(s, v, key, 'key set → hash it');
    const r = await pipe(s, v, key, { fast: true });
    await land(s, v, `mod-p${r.p}`, r.p, key, 800);
  },
});
const E = {
  send: {
    phase: 'One key, step by step', on: ['send'],
    title: 'send() with a key',
    text: 'kafkaTemplate.send("orders", "ORD101", order). The record has a key, ORD101, but no partition number. The producer\'s partitioner has to choose one of orders\' three partitions.',
    observe: 'send("ORD101", order) lights up.',
    async run(s, v) { hit(v, 'send'); await s.pulse(v.n.send); },
  },
  rule: {
    phase: 'One key, step by step', on: ['send', 'rule'], wire: 'send-rule',
    title: 'Which rule applies?',
    text: 'The producer checks in this order: 1) a partition set on the record is used as is; 2) otherwise a custom partitioner.class decides; 3) otherwise, with a key, the key is hashed; 4) with no key, the sticky partitioner picks. Here there is a key.',
    observe: 'The rule box says: key set → hash it.',
    async run(s, v) { await swap(s, v.n.rule.t, 'key set → hash it'); hit(v, 'rule'); },
  },
  bytes: {
    phase: 'One key, step by step', on: ['rule', 'bytes'], wire: 'rule-bytes',
    title: 'Step 1: the key as bytes',
    text: 'The partitioner hashes the serialized key, the bytes your key.serializer produced, not the Java object. With StringSerializer, "ORD101" is the UTF-8 bytes 4f 52 44 31 30 31.',
    observe: 'The bytes 4f 52 44 31 30 31 appear.',
    async run(s, v) {
      const r = route('ORD101', v.count);
      await packet(s, v, 'rule-bytes', 'ORD101', MUTED, { ms: 600 });
      hit(v, 'bytes');
      await swap(s, v.n.bytes.s, r.bytes, INK);
    },
  },
  hash: {
    phase: 'One key, step by step', on: ['bytes', 'hash'], wire: 'bytes-hash',
    title: 'Step 2: murmur2 turns the bytes into a number',
    text: 'murmur2 is a fast, non-cryptographic hash. It mixes the bytes into one 32-bit number, and the same bytes give the same number on every Java client, every time. The number can be negative.',
    observe: 'murmur2 gives 1485139803 for ORD101.',
    async run(s, v) {
      const r = route('ORD101', v.count);
      await packet(s, v, 'bytes-hash', 'bytes', MUTED, { ms: 500 });
      hit(v, 'hash');
      await swap(s, v.n.hash.s, fmt(r.h), INK);
    },
  },
  pos: {
    phase: 'One key, step by step', on: ['hash', 'pos'], wire: 'hash-pos',
    title: 'Step 3: & 0x7fffffff makes it positive',
    text: 'A negative number would give a negative partition. AND-ing with 0x7fffffff clears the sign bit. ORD101\'s hash is already positive, so it stays 1485139803. (ORD105 hashes to -549909168, which becomes 1597574480.)',
    observe: 'The positive value 1485139803.',
    async run(s, v) {
      const r = route('ORD101', v.count);
      await packet(s, v, 'hash-pos', fmt(r.h), MUTED, { ms: 500 });
      hit(v, 'pos');
      await swap(s, v.n.pos.s, fmt(r.pos), INK);
    },
  },
  mod: {
    phase: 'One key, step by step', on: ['pos', 'mod'], wire: 'pos-mod',
    title: 'Step 4: % 3 picks the partition',
    text: 'The remainder after dividing by the number of partitions is the partition: 1485139803 % 3 = 0, so P0. This is why the partition count matters so much: change it, and the answer changes.',
    observe: '1485139803 % 3 = 0 → P0, in P0\'s green.',
    async run(s, v) {
      const r = route('ORD101', v.count);
      await packet(s, v, 'pos-mod', fmt(r.pos), MUTED, { ms: 400 });
      hit(v, 'mod');
      await swap(s, v.n.mod.s, `${r.pos} % ${v.count} = ${r.p} → P${r.p}`, PC[r.p]);
    },
  },
  land: {
    phase: 'One key, step by step', on: ['mod', 'p0'], wire: 'mod-p0',
    title: 'The record goes to P0',
    text: 'The record is added to the batch for P0 and is sent to P0\'s leader (see Producer and Journey). All of this happened inside the producer: brokers never hash keys.',
    observe: 'ORD101 lands in P0.',
    async run(s, v) { await land(s, v, 'mod-p0', 0, 'ORD101'); },
  },
  again: keyed('ORD101', {
    title: 'ORD101 again: P0 again',
    text: 'A later event for the same order, also keyed ORD101, goes through the same four steps and gets the same answer: P0. Every event for one key lands in one partition.',
    observe: 'A second ORD101 lands right behind the first in P0.',
  }),
  other1: keyed('ORD102', {
    title: 'ORD102 → P1',
    text: 'A different key gives a different hash: murmur2("ORD102") = 2008181302, and 2008181302 % 3 = 1. So ORD102 goes to P1.',
    observe: 'ORD102 runs through the steps and lands in P1.',
  }),
  other2: keyed('ORD104', {
    title: 'ORD104 → P2',
    text: 'murmur2("ORD104") = 1218910409, and 1218910409 % 3 = 2, so ORD104 goes to P2. Keys spread over the partitions roughly evenly when there are many of them.',
    observe: 'ORD104 lands in P2.',
  }),
  order: {
    phase: 'Same key, same partition', on: ['p0', 'p1', 'p2'],
    title: 'Order is kept per key, not across keys',
    text: 'Inside one partition records keep their order, so both ORD101 events are read in the order they were sent. Between partitions there is no order: a consumer may see ORD104 before ORD102. Choose the key so that what must stay in order shares a key.',
    observe: 'P0 holds ORD101 twice, in order; P1 and P2 hold the other keys.',
    async run(s, v) { for (const l of v.lanes.slice(0, 3)) await s.pulse(l.blocks[0] ?? l); },
  },
};

// ---- no key: the sticky partitioner ----
const sticky = (p, n, { title, text, observe }) => ({
  phase: 'No key', on: ['send', 'rule', `p${p}`], wire: `rule-p${p}`,
  title, text, observe,
  async run(s, v) {
    await call(s, v, null, `no key → sticky: P${p}`);
    for (let i = 0; i < n; i++) await land(s, v, `rule-p${p}`, p, 'null', 650);
  },
});
const N = {
  first: {
    phase: 'No key', on: ['send', 'rule'], wire: 'send-rule',
    title: 'send() with no key',
    text: 'kafkaTemplate.send("orders", event) with a null key. There is nothing to hash, so the default partitioner falls back to the sticky partitioner.',
    observe: 'The rule box says: no key → sticky.',
    async run(s, v) { await call(s, v, null, 'no key → sticky'); hit(v, 'rule'); },
  },
  stick: sticky(1, 1, {
    title: 'Sticky picks one partition for the batch',
    text: 'The sticky partitioner picks a partition, here P1, and keeps using it for every keyless record until the current batch for P1 is sent. The partitioner steps are skipped entirely.',
    observe: 'The keyless record goes straight from the rule to P1.',
  }),
  fill: sticky(1, 3, {
    title: 'The next records stick to P1',
    text: 'More keyless records arrive. All of them join the same P1 batch, so the batch fills up quickly and goes out as one request.',
    observe: 'Three more records go to P1.',
  }),
  switch: {
    phase: 'No key', on: ['rule', 'p1', 'p2'],
    title: 'The batch is sent, so it switches',
    text: 'When P1\'s batch is full (batch.size, 16 KB) or linger.ms runs out, it is sent. Only then does the sticky partitioner move on to another partition for the next batch, here P2.',
    observe: 'The rule changes from P1 to P2.',
    async run(s, v) { await s.pulse(v.lanes[1]); await swap(s, v.n.rule.t, 'no key → sticky: P2', PC[2]); },
  },
  next: sticky(2, 3, {
    title: 'The next batch goes to P2',
    text: 'Keyless records now fill P2\'s batch. Over time every partition gets its share, but in big batches instead of one record at a time.',
    observe: 'Three records go to P2.',
  }),
  why: {
    phase: 'No key', on: ['p0', 'p1', 'p2', 'rule'],
    title: 'Why sticky instead of round robin',
    text: 'Before Kafka 2.4, keyless records went round robin: one per partition, so every batch was tiny and requests multiplied. Sticky (KIP-480) gives full batches and lower latency. Since 3.3 it also favours partitions on less busy brokers.',
    observe: 'Keyless records sit in runs per partition, not alternating.',
    async run(s, v) { await Promise.all(v.lanes.slice(1, 3).map(l => s.pulse(l))); },
  },
};

// ---- adding a partition breaks key → partition ----
const G = {
  before: keyed('ORD101', {
    phase: 'Adding a partition',
    title: 'Today ORD101 → P0',
    text: 'With 3 partitions, ORD101 goes to P0 as before. Its events build up in P0, in order.',
    observe: 'ORD101 lands in P0.',
  }),
  grow: {
    phase: 'Adding a partition', on: ['topic', 'p3'],
    title: 'An admin adds a fourth partition',
    text: 'kafka-topics.sh --alter --topic orders --partitions 4. Partitions can be added, never removed. Existing records stay where they are: Kafka never moves them to the new partition.',
    observe: 'P3 appears and the topic now says partitions: 4.',
    async run(s, v) {
      v.count = 4;
      await swap(s, v.countT, 'partitions: 4', RED);
      for (const k of ['mod-p3', 'rule-p3']) v.w[k].style.display = '';
      await s.show(v.lanes[3].wrap, 500);
      hit(v, 'p3');
    },
  },
  refresh: {
    phase: 'Adding a partition', on: ['send', 'mod', 'topic'],
    title: 'The producer learns about it',
    text: 'On its next metadata refresh (metadata.max.age.ms, 5 minutes by default) the producer sees 4 partitions. From then on it divides by 4 instead of 3.',
    observe: 'The last step now reads "% 4".',
    async run(s, v) { await swap(s, v.n.mod.t, '% number of partitions (4)', RED); hit(v, 'mod'); },
  },
  after: {
    phase: 'Adding a partition', on: ['send', 'rule', 'bytes', 'hash', 'pos', 'mod', 'p3'], wires: ['send-rule', 'rule-bytes', 'bytes-hash', 'hash-pos', 'pos-mod', 'mod-p3'],
    title: 'ORD101 now goes to P3',
    text: 'Same key, same hash, 1485139803. But 1485139803 % 4 = 3. The new ORD101 event lands in P3 while its earlier events are still in P0.',
    observe: '1485139803 % 4 = 3 → P3.',
    async run(s, v) {
      await call(s, v, 'ORD101', 'key set → hash it');
      const r = await pipe(s, v, 'ORD101');
      await land(s, v, `mod-p${r.p}`, r.p, 'ORD101');
    },
  },
  broken: {
    phase: 'Adding a partition', on: ['p0', 'p3'],
    title: 'Per-key order is broken',
    text: 'ORD101\'s events now live in two partitions, which may be read by different consumers at different speeds, so "shipped" can be processed before "created". Pick the partition count up front, or move to a new topic when you must grow.',
    observe: 'ORD101 in P0 and in P3.',
    async run(s, v) { await Promise.all([s.pulse(v.lanes[0].blocks[0]), s.pulse(v.lanes[3].blocks[0])]); },
  },
};

const track = steps => { const t = { continuous: true, build: s => { const v = scene(s); v.track = t; return v; }, enter, steps }; return t; };
const flowKey = track([E.send, E.rule, E.bytes, E.hash, E.pos, E.mod, E.land, E.again, E.other1, E.other2, E.order]);
const flowNoKey = track([N.first, N.stick, N.fill, N.switch, N.next, N.why]);
const flowGrow = track([G.before, G.grow, G.refresh, G.after, G.broken]);

export default {
  id: 'key-routing', n: 13, title: 'Key → partition', tagline: 'How the producer picks a partition',
  docked: true,
  guide: {
    what: 'The producer, not the broker, decides which partition a record goes to. With a key it hashes the key bytes with murmur2 and takes the remainder by the partition count; with no key the sticky partitioner fills one partition\'s batch at a time.',
    fits: 'First link of Level 2: producer ↔ partition. You know producers and partitions as atoms; here is the rule that connects them. Next: acks, the producer ↔ leader ↔ followers link.',
  },
  flows: [
    { id: 'key', short: 'with a key', label: 'With a key', about: 'Same key → same partition, step by step.', track: flowKey },
    { id: 'nokey', short: 'no key', label: 'No key (sticky)', about: 'Keyless records fill one partition\'s batch, then switch.', track: flowNoKey },
    { id: 'grow', short: 'add a partition', label: 'Adding a partition', about: 'Why growing a topic moves keys.', track: flowGrow },
  ],
  watch: flowKey,
  tryIt: {
    intro: 'Type any key (or leave it empty for no key), choose the partition count, and press send(). The steps show the real murmur2 numbers.',
    observe: 'The same key always lands in the same partition until the partition count changes.',
    controls: [
      { type: 'text', name: 'key', label: 'Key', value: 'ORD101', placeholder: 'empty = no key' },
      { type: 'choice', name: 'parts', label: 'Partitions', options: ['3', '4'], rebuild: true },
      { type: 'button', label: 'send()', primary: true, run: 'one' },
    ],
    build(s, input) {
      const v = scene(s, { partitions: +(input?.parts ?? 3) });
      v.history = [];
      if (v.count === 4) { v.countT.textContent = 'partitions: 4'; v.n.mod.t.textContent = '% number of partitions (4)'; }
      v.message = 'Press send(). Try the same key twice, then switch to 4 partitions and send it again.';
      return v;
    },
    async one(s, v, input) {
      const key = (input.key ?? '').trim();
      unfocus(v);
      if (!key) {
        await call(s, v, null, `no key → sticky: P${v.sticky}`);
        await land(s, v, `rule-p${v.sticky}`, v.sticky, 'null', 700);
        v.message = `No key: the sticky partitioner put it in P${v.sticky}, the partition of the current batch. Keyless records keep going there until that batch is sent.`;
        v.history.push(`null→P${v.sticky}`);
        return;
      }
      await call(s, v, key, 'key set → hash it');
      const r = await pipe(s, v, key);
      await land(s, v, `mod-p${r.p}`, r.p, key.length > 7 ? `${key.slice(0, 6)}…` : key, 800);
      const seen = v.history.find(h => h.startsWith(`${key}→`));
      v.history.push(`${key}→P${r.p}`);
      v.message = `"${key}" → bytes ${r.bytes.length > 26 ? `${r.bytes.slice(0, 26)}…` : r.bytes} → murmur2 ${r.h}${r.h < 0 ? ` → positive ${r.pos}` : ''} → ${r.pos} % ${v.count} = <b>P${r.p}</b>.`
        + (seen ? ` Same key as before, same partition.` : '');
    },
    readout: v => `Partitions: <b>${v.count}</b> · Records: ${v.lanes.slice(0, v.count).map((l, p) => `<b style="color:${PC[p]}">P${p}</b> ${l.blocks.length}`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Explicit partitions, custom partitioners, hot keys and other clients.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on, [v.track.steps[i].wire].filter(Boolean)); },
    steps: [
      {
        on: ['send', 'rule', 'p2'], wire: 'rule-p2',
        title: 'You can name the partition yourself',
        text: 'new ProducerRecord<>("orders", 2, "ORD101", order) sets partition 2 directly. The partitioner is not called at all, so you own the routing (and its mistakes).',
        observe: 'The record goes straight from the rule to P2, skipping all four steps.',
        async run(s, v) {
          await swap(s, v.n.send.t, 'send("orders", 2, "ORD101", …)');
          await swap(s, v.n.rule.t, 'partition given → use it', AMBER);
          await land(s, v, 'rule-p2', 2, 'ORD101');
        },
      },
      {
        on: ['rule', 'part'],
        title: 'A custom partitioner replaces the default',
        text: 'Set partitioner.class to your own Partitioner, for example to send VIP customers to a dedicated partition. It runs for every record without an explicit partition and must be fast and deterministic.',
        observe: 'The rule box now names the custom partitioner.',
        async run(s, v) { await swap(s, v.n.rule.t, 'partitioner.class = VipPartitioner', AMBER); },
      },
      {
        on: ['p0'],
        title: 'Hot keys make one partition busy',
        text: 'If one key carries most of the traffic (a huge customer, a "null"-like default key), its partition and the consumer that owns it do most of the work. More partitions do not help a single key; a better key (or a key plus a suffix) does.',
        observe: 'P0 fills up with one key while the others stay empty.',
        async run(s, v) { await swap(s, v.n.rule.t, 'key set → hash it'); for (let i = 0; i < 5; i++) await land(s, v, 'mod-p0', 0, 'BIG', 420); },
      },
      {
        on: ['part', 'hash'],
        title: 'Other clients may hash differently',
        text: 'The Java client uses murmur2. librdkafka (used by Python, Go, .NET and others) defaults to consistent_random, a CRC32 hash, so the same key can land in a different partition. Set partitioner=murmur2_random there when both kinds of producers write the same topic.',
        observe: 'The hash step is the part that differs between clients.',
        async run(s, v) { await swap(s, v.n.hash.t, 'murmur2 (Java) vs CRC32 (librdkafka)', RED); hit(v, 'hash'); },
      },
    ],
  },
  takeaway: 'The producer picks the partition: an explicit partition wins, then a custom partitioner, then murmur2(key bytes) & 0x7fffffff % partitions, and with no key the sticky partitioner. Same key → same partition → per-key order, until the partition count changes.',
  recap: {
    points: [
      'Partitioning happens in the producer; brokers never hash keys.',
      'Order: explicit partition → custom partitioner.class → key hash → sticky (no key).',
      'Key hash: murmur2(serialized key) & 0x7fffffff % number of partitions.',
      'Same key → same partition → events for one key stay in order.',
      'No key: sticky fills one partition\'s batch, then switches (bigger batches than round robin).',
      'Adding partitions remaps keys; existing records never move.',
    ],
    interview: [
      { q: 'How does Kafka decide which partition a record goes to?', a: 'The **producer** decides. If the record names a **partition**, that is used. Otherwise a custom **partitioner.class** if set. Otherwise, with a key: **murmur2(serialized key) & 0x7fffffff % number of partitions**. With **no key**, the **sticky partitioner** keeps filling one partition\'s batch and switches when the batch is sent.' },
      { q: 'How do you guarantee ordering for one customer\'s events?', a: 'Use the **customer id as the key**. Same key → same partition, and a partition is **strictly ordered**. Also keep retries from reordering: **enable.idempotence=true** (default since 3.0). There is **no ordering across partitions**.' },
      { q: 'What happens to keys when you add partitions?', a: 'The modulus changes, so **most keys map to a different partition**. Old records **stay where they are**, so one key\'s history is split and per-key order can break during the switch. Plan the partition count up front, or migrate to a new topic.' },
      { q: 'Why did Kafka move from round robin to the sticky partitioner?', a: 'Round robin put **one keyless record per partition**, making many **tiny batches** and more requests. **Sticky** (KIP-480, Kafka 2.4) fills **one batch at a time**, so batches are full and latency drops; since 3.3 it also prefers partitions on less loaded brokers.' },
      { q: 'What is a hot partition and how do you fix it?', a: 'One **key with far more traffic** makes its partition (and its consumer) a bottleneck. More partitions do **not** help a single key. Fix the **key design**: a finer key, or a key plus a bucket suffix when strict per-key order is not needed.' },
    ],
  },
  quiz: {
    q: 'orders has 3 partitions and ORD101 always lands in P0. You add a 4th partition. What happens to the next ORD101 record?',
    options: ['It still goes to P0: keys are pinned', 'It goes to murmur2 % 4, which can be a different partition', 'Kafka moves all ORD101 records to the new partition', 'It goes to the new partition P3 because it is empty'],
    answer: 1,
    why: 'The partition is recomputed with the new count: 1485139803 % 4 = 3, so P3. Existing records never move, so ORD101 is now split across P0 and P3.',
  },
  related: ['producer', 'partition', 'journey'],
};
