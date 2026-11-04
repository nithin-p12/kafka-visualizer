// Level 4 · Deep dive: batching & compression. How the producer turns single send() calls into a few large
// requests: one batch per partition in the accumulator, sent when full (batch.size) or when linger.ms runs out,
// one request per broker carrying several batches, and compression per batch.
import { PARTITION_COLORS as PC, el, place } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, INK, start, layers, frame, node, part, wire, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

// ---- layout (960 × 460) ----
const BAR_Y = [176, 234, 292], BAR_X = 70, BAR_W = 300, FULL = 16;
const LEADER = [0, 0, 1], BNAME = ['B1', 'B2'];
const ROW = [{ b: 0, y: 112 }, { b: 0, y: 192 }, { b: 1, y: 366 }];
// Compressed size of a batch of n 1 KB JSON records: compression gets better with bigger batches.
export const zstd = n => Math.max(.2, .55 - n * .025) * n;

function scene(s, { linger = 0, codec = 'none' } = {}) {
  const v = start(s, { parent: { send: 'prod', acc: 'prod', comp: 'prod', sender: 'prod', r0: 'b1', r1: 'b1', r2: 'b2' } });
  Object.assign(v, { linger, codec, requests: 0, kb: 0, recs: 0, clock: 0 });

  frame(s, v, 'prod', 240, 240, 452, 412, 'Producer', { color: '#7a4aa3', fill: '#fcfaff', stroke: '#d8b7e9' });
  v.statsT = s.text(v.n.prod, 212, -188, 'requests 0 · 0 KB sent', { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, 'font-weight': 700, fill: MUTED });
  node(s, v, 'send', 240, 86, 400, 44, 'send(record)', { sub: 'each record ≈ 1 KB of JSON' });
  const acc = part(s, v, 'acc');
  v.accT = s.text(acc, 40, 134, '', { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, 'font-family': MONO });
  v.timerT = s.text(acc, 440, 134, '', { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, fill: AMBER, 'font-weight': 700 });
  v.bars = BAR_Y.map((y, p) => {
    s.text(acc, 40, y, `P${p}`, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 800, fill: PC[p] });
    el('rect', { x: BAR_X, y: y - 17, width: BAR_W, height: 34, rx: 6, fill: '#f6f7fb', stroke: '#d5d9dc' }, acc);
    const fill = el('rect', { x: BAR_X, y: y - 17, width: 0, height: 34, rx: 6, fill: PC[p], opacity: .75 }, acc);
    const t = s.text(acc, BAR_X + 10, y, 'empty', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, fill: INK });
    s.text(acc, 440, y, `→ ${BNAME[LEADER[p]]}`, { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, fill: MUTED });
    return { p, y, fill, t, n: 0 };
  });
  node(s, v, 'comp', 240, 352, 400, 40, '', { size: 15 });
  node(s, v, 'sender', 240, 408, 400, 44, 'sender thread', { sub: 'one request per broker' });
  labels(v);

  frame(s, v, 'b1', 790, 150, 300, 220, 'Broker B1 · leads P0, P1');
  frame(s, v, 'b2', 790, 360, 300, 160, 'Broker B2 · leads P2');
  v.rows = ROW.map((r, p) => {
    const g = part(s, v, `r${p}`);
    s.text(g, 656, r.y, `P${p}`, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 800, fill: PC[p] });
    return Object.assign(g, r, { chips: [] });
  });

  wire(v, 'send-sender', 'M240,108 L240,130', { hidden: true });
  wire(v, 'out-b1', 'M440,402 C540,402 560,150 640,150');
  wire(v, 'out-b2', 'M440,414 C560,414 566,372 640,372');
  layers(s, v);
  return v;
}

// ---- picture ----
function labels(v) {
  v.accT.textContent = `accumulator · batch.size ${FULL} KB · linger.ms ${v.linger}`;
  v.n.comp.t.textContent = `compression.type = ${v.codec}`;
}
const stats = v => `requests ${v.requests} · ${Math.round(v.kb * 10) / 10} KB sent`;
async function barTo(s, v, p, n) {
  const b = v.bars[p], w0 = +b.fill.getAttribute('width'), w1 = BAR_W * Math.min(n, FULL) / FULL;
  b.n = n;
  b.t.textContent = n ? `${n} record${n > 1 ? 's' : ''} · ${n} KB${n >= FULL ? ' · FULL' : ''}` : 'empty';
  b.t.setAttribute('fill', n >= FULL ? RED : INK);
  await s.clock.tween(260, t => b.fill.setAttribute('width', w0 + (w1 - w0) * t));
}
// One record from send() into partition p's batch.
async function add(s, v, p) {
  const dot = el('circle', { r: 7, fill: PC[p], stroke: '#fff', 'stroke-width': 2 }, v.packs);
  place(dot, 240, 92);
  await s.move(dot, BAR_X + 20 + BAR_W * Math.min(v.bars[p].n, FULL - 1) / FULL, BAR_Y[p], 420);
  dot.remove();
  v.recs++;
  await barTo(s, v, p, v.bars[p].n + 1);
}
// Ship the given partitions' batches: one request per broker, each carrying that broker's batches.
async function ship(s, v, parts) {
  parts = parts.filter(p => v.bars[p].n);
  if (!parts.length) return [];
  hit(v, 'comp');
  const byBroker = [0, 1].map(b => parts.filter(p => LEADER[p] === b)).filter(x => x.length);
  const sent = [];
  // batches move through compression to the sender
  await Promise.all(parts.map(async p => {
    const d = el('circle', { r: 8, fill: PC[p], stroke: '#fff', 'stroke-width': 2 }, v.packs);
    place(d, BAR_X + 40, BAR_Y[p]);
    await s.move(d, 240, 352, 450);
    await s.move(d, 240, 408, 300);
    d.remove();
  }));
  hit(v, 'sender');
  const sizes = Object.fromEntries(parts.map(p => { const n = v.bars[p].n; return [p, v.codec === 'zstd' ? zstd(n) : n]; }));
  await Promise.all(byBroker.map(async ps => {
    const b = LEADER[ps[0]], kb = ps.reduce((a, p) => a + sizes[p], 0);
    v.requests++; v.kb += kb;
    const label = `Produce: ${ps.map(p => `P${p}×${v.bars[p].n}`).join(' ')} · ${Math.round(kb * 10) / 10} KB`;
    await packet(s, v, `out-b${b + 1}`, label, BLUE, { ms: 900 });
    hit(v, `b${b + 1}`);
    for (const p of ps) {
      const r = v.rows[p], n = v.bars[p].n;
      if (r.chips.length >= 3) { const old = r.chips.shift(); old.remove(); r.chips.forEach((c, k) => place(c, 720 + k * 82, r.y)); }
      const c = s.box(720 + r.chips.length * 82, r.y, 78, 30, `${n} rec · ${Math.round(sizes[p] * 10) / 10}K`, { parent: r, size: 12.5, rx: 6, fill: '#fff', stroke: PC[p], weight: 700 });
      c.label.setAttribute('fill', PC[p]);
      r.chips.push(c);
      await s.pop(c, 250);
      sent.push({ p, n, kb: sizes[p] });
    }
  }));
  await Promise.all(parts.map(p => barTo(s, v, p, 0)));
  await swap(s, v.statsT, stats(v), BLUE);
  return sent;
}
async function linger(s, v) {
  for (let t = 5; t <= v.linger; t += 5) { v.clock = t; await swap(s, v.timerT, `waiting ${t} / ${v.linger} ms`, AMBER); await s.wait(120); }
  await swap(s, v.timerT, 'linger.ms passed → send', GREEN);
}

// ---- events ----
const Z = {
  one: {
    phase: 'linger.ms = 0', on: ['send', 'acc'],
    title: 'A record arrives, and goes at once',
    text: 'With linger.ms=0 (the default until Kafka 4.0), a batch is ready to send the moment it has a record. The first order goes into P0\'s batch and the sender ships it straight away.',
    observe: 'One record fills a sliver of P0\'s bar, then leaves.',
    async run(s, v) { await add(s, v, 0); await ship(s, v, [0]); },
  },
  each: {
    phase: 'linger.ms = 0', on: ['send', 'acc', 'sender', 'b1', 'b2'], wires: ['out-b1', 'out-b2'],
    title: 'Every record becomes its own request',
    text: 'Five more orders arrive a millisecond apart, spread over P0, P1 and P2. Each one is shipped alone: six requests for six small records.',
    observe: 'The request counter climbs with every record; each broker stores one-record batches.',
    async run(s, v) { for (const p of [1, 2, 0, 1, 2]) { await add(s, v, p); await ship(s, v, [p]); } },
  },
  cost: {
    phase: 'linger.ms = 0', on: ['prod', 'b1', 'b2'],
    title: 'Small requests are expensive',
    text: 'Every request carries headers, takes a network round trip and costs the broker work regardless of size. At high rates, many tiny requests limit throughput long before the network is full. (When the sender is busy, records do pile up and batch naturally even with linger.ms=0.)',
    observe: 'requests 6 · 6 KB sent.',
    async run(s, v) { hit(v, 'prod'); await s.wait(500); },
  },
};
const W = {
  set: {
    phase: 'linger.ms = 20', on: ['acc'],
    title: 'Wait a little: linger.ms = 20',
    text: 'linger.ms tells the producer to keep a batch open a little longer, so records arriving in the meantime travel together. Kafka 4.0 made 5 ms the default; here 20 ms.',
    observe: 'The accumulator header shows linger.ms 20.',
    async run(s, v) { hit(v, 'acc'); await s.wait(300); },
  },
  fill: {
    phase: 'linger.ms = 20', on: ['send', 'acc'],
    title: 'Six orders collect in their batches',
    text: 'The same six orders arrive within 20 ms. Each joins the open batch of its partition; nothing is sent yet. The linger clock counts.',
    observe: 'P0, P1 and P2 each hold 2 records; the timer runs up to 20 ms.',
    async run(s, v) { for (const p of [0, 1, 2, 0, 1, 2]) await add(s, v, p); await linger(s, v); },
  },
  go: {
    phase: 'linger.ms = 20', on: ['comp', 'sender', 'b1', 'b2'], wires: ['out-b1', 'out-b2'],
    title: 'One request per broker',
    text: 'When linger.ms passes, the sender drains the ready batches and groups them by leader: P0 and P1 both lead on B1, so they travel in one request; P2 goes to B2. Two requests instead of six.',
    observe: 'One request to B1 carrying P0×2 and P1×2, one to B2 with P2×2.',
    async run(s, v) { await ship(s, v, [0, 1, 2]); await swap(s, v.timerT, '', MUTED); },
  },
  trade: {
    phase: 'linger.ms = 20', on: ['prod'],
    title: 'The trade-off: a few ms of latency',
    text: 'Each record now waits up to 20 ms before it leaves, in exchange for fewer, larger requests and better compression. For high-throughput producers a linger of 5–50 ms is usual; for latency-critical ones keep it small.',
    observe: 'requests 2 · 6 KB sent, compared with 6 requests before.',
    async run(s, v) { hit(v, 'prod'); await s.wait(500); },
  },
};
const F = {
  burst: {
    phase: 'batch.size', on: ['send', 'acc'],
    title: 'A burst fills P0\'s batch',
    text: 'A sale starts: 16 orders for P0 arrive within a few ms. P0\'s batch reaches batch.size (16 KB by default) long before linger.ms is up. P1 and P2 get one record each.',
    observe: 'P0\'s bar fills to FULL.',
    async run(s, v) { await add(s, v, 1); await add(s, v, 2); for (let k = 0; k < FULL; k++) { v.recs++; await barTo(s, v, 0, v.bars[0].n + 1); } },
  },
  full: {
    phase: 'batch.size', on: ['acc', 'sender', 'b1'], wire: 'out-b1',
    title: 'A full batch is sent immediately',
    text: 'A batch is ready when it is full or when linger.ms has passed, whichever comes first. P0\'s full batch goes now; P1 and P2 keep waiting for their linger.',
    observe: 'A request with P0×16 goes to B1; P1 and P2 still hold one record each.',
    async run(s, v) { await ship(s, v, [0]); },
  },
  later: {
    phase: 'batch.size', on: ['acc', 'sender', 'b1', 'b2'], wires: ['out-b1', 'out-b2'],
    title: 'The others go when their linger ends',
    text: 'linger.ms later, P1 and P2 are drained: P1 to B1, P2 to B2. batch.size is an upper bound per partition, not something the producer waits to reach.',
    observe: 'Two more requests with one record each.',
    async run(s, v) { await linger(s, v); await ship(s, v, [1, 2]); await swap(s, v.timerT, '', MUTED); },
  },
};
const C = {
  set: {
    phase: 'Compression', on: ['comp', 'acc'],
    title: 'compression.type = zstd',
    text: 'The producer can compress each batch before sending: gzip, snappy, lz4 or zstd. Compression works on whole batches, so bigger batches compress better.',
    observe: 'The compression step shows zstd.',
    async run(s, v) { hit(v, 'comp'); await s.wait(300); },
  },
  fill: {
    phase: 'Compression', on: ['send', 'acc'],
    title: 'Ten orders in P0\'s batch',
    text: 'Ten JSON orders, about 10 KB, collect in P0\'s batch during linger.ms. Order records repeat the same field names and similar values, which compresses very well.',
    observe: 'P0 holds 10 records · 10 KB.',
    async run(s, v) { for (let k = 0; k < 10; k++) await add(s, v, 0); await linger(s, v); },
  },
  squeeze: {
    phase: 'Compression', on: ['comp', 'sender', 'b1'], wire: 'out-b1',
    title: '10 KB becomes about 3 KB',
    text: 'The sender compresses the batch as one block and sends it. The request carries about 3 KB instead of 10 KB: less network, less disk on every replica.',
    observe: 'The request label shows about 3 KB; B1 stores the compressed batch.',
    async run(s, v) { await ship(s, v, [0]); await swap(s, v.timerT, '', MUTED); },
  },
  stored: {
    phase: 'Compression', on: ['b1'],
    title: 'The broker stores it compressed, consumers decompress',
    text: 'With the topic\'s compression.type=producer (the default), the broker writes the batch exactly as received and replicates it compressed. Consumers decompress it. Only if the topic sets a different codec does the broker recompress, which costs CPU.',
    observe: 'B1\'s P0 row holds one compressed batch of 10 records.',
    async run(s, v) { hit(v, 'r0'); await s.wait(500); },
  },
  codecs: {
    phase: 'Compression', on: ['comp'],
    title: 'Which codec?',
    text: 'zstd: best ratio at good speed, the usual choice today. lz4 and snappy: very fast, lower ratio. gzip: small but CPU-heavy. Compression costs producer and consumer CPU and saves network, disk and broker I/O.',
    observe: 'The trade-off is CPU for bytes.',
    async run(s, v) { await swap(s, v.n.comp.t, 'zstd ≈ 3–5× on JSON', GREEN); },
  },
};

const trackOf = (steps, opts) => { const t = { continuous: true, steps, enter, build(s) { const v = scene(s, opts); v.track = t; return v; } }; return t; };
const flowZero = trackOf(Object.values(Z), { linger: 0 });
const flowLinger = trackOf(Object.values(W), { linger: 20 });
const flowFull = trackOf(Object.values(F), { linger: 20 });
const flowZstd = trackOf(Object.values(C), { linger: 20, codec: 'zstd' });

// ---- try it ----
async function trySend(s, v, n, input) {
  const lingerMs = input.linger === '0 ms' ? 0 : 20;
  if (v.linger !== lingerMs || v.codec !== input.codec) { v.linger = lingerMs; v.codec = input.codec; labels(v); }
  const before = { r: v.requests, kb: v.kb };
  for (let k = 0; k < n; k++) {
    const p = v.next++ % 3;
    await add(s, v, p);
    if (v.bars[p].n >= FULL || v.linger === 0) await ship(s, v, [p]);
  }
  if (v.linger) { await linger(s, v); await ship(s, v, [0, 1, 2]); await swap(s, v.timerT, '', MUTED); }
  const r = v.requests - before.r, kb = Math.round((v.kb - before.kb) * 10) / 10;
  return `${n} record${n > 1 ? 's' : ''} → ${r} request${r > 1 ? 's' : ''}, ${kb} KB on the wire (${n} KB uncompressed).`;
}

export default {
  id: 'batching', n: 25, title: 'Batching & compression', tagline: 'linger.ms, batch.size, compression.type',
  docked: true,
  guide: {
    what: 'The producer collects records into one batch per partition. A batch is sent when it reaches batch.size or when linger.ms has passed; the sender groups ready batches by broker into one request, and each batch can be compressed.',
    fits: 'Deep dive after Producer and the Journey: it zooms into the accumulator and sender to explain where producer throughput comes from.',
  },
  flows: [
    { id: 'zero', short: 'linger 0', label: 'linger.ms = 0', about: 'Every record its own request.', track: flowZero },
    { id: 'linger', short: 'linger 20', label: 'linger.ms = 20', about: 'Wait a little, send much less often.', track: flowLinger },
    { id: 'full', short: 'batch.size', label: 'A full batch', about: 'Sent at once, without waiting for linger.', track: flowFull },
    { id: 'zstd', short: 'compression', label: 'Compression', about: 'Batches compressed with zstd.', track: flowZstd },
  ],
  watch: flowZero,
  tryIt: {
    intro: 'Choose linger.ms and compression, then send records (spread over P0, P1, P2). Compare requests and bytes on the wire.',
    observe: 'With linger, many records share few requests; with zstd, the bytes shrink, more so for bigger batches.',
    controls: [
      { type: 'choice', name: 'linger', label: 'linger.ms', options: ['0 ms', '20 ms'] },
      { type: 'choice', name: 'codec', label: 'compression', options: ['none', 'zstd'] },
      { type: 'button', label: 'send 1', run: 'one' },
      { type: 'button', label: 'send 12', primary: true, run: 'many' },
    ],
    build(s) { const v = scene(s); v.next = 0; v.message = 'Send 12 with linger 0, then with 20 ms, then add zstd.'; return v; },
    async one(s, v, input) { unfocus(v); v.message = await trySend(s, v, 1, input); },
    async many(s, v, input) { unfocus(v); v.message = await trySend(s, v, 12, input); },
    readout: v => `Total: <b>${v.recs}</b> records · <b>${v.requests}</b> requests · <b>${Math.round(v.kb * 10) / 10} KB</b> on the wire<br>${v.message}`,
  },
  deeper: {
    note: 'In-flight requests, the buffer, and broker-side settings.',
    continuous: true,
    build(s) { const v = scene(s, { linger: 5 }); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['sender'],
        title: 'max.in.flight.requests.per.connection',
        text: 'The sender may have up to 5 unanswered requests per broker (the default). More in flight means more throughput on slow links; with idempotence on, Kafka still keeps order for up to 5.',
        observe: 'The sender line names the in-flight limit.',
        async run(s, v) { await swap(s, v.n.sender.s, 'up to 5 in flight per broker', BLUE); },
      },
      {
        on: ['acc'],
        title: 'buffer.memory backs all batches',
        text: 'All open batches live in buffer.memory (32 MB). If brokers fall behind and it fills, send() blocks for up to max.block.ms (60 s) and then throws. Bigger batches need more of it per partition.',
        observe: 'The accumulator is bounded by buffer.memory.',
        async run(s, v) { await swap(s, v.accT, 'accumulator ⊂ buffer.memory 32 MB', BLUE); },
      },
      {
        on: ['b1', 'b2'],
        title: 'Broker limits',
        text: 'A batch must fit message.max.bytes (about 1 MB) on the broker and max.request.size on the producer. Consumers fetch whole batches, so fetch.max.bytes and max.partition.fetch.bytes must allow the largest one.',
        observe: 'The brokers enforce the size of each batch.',
        async run(s, v) { hit(v, 'b1'); hit(v, 'b2'); await s.wait(500); },
      },
    ],
  },
  takeaway: 'Records go into one batch per partition; a batch is sent when it is full (batch.size, 16 KB) or linger.ms has passed (5 ms by default since 4.0). Ready batches for the same broker share one request. Compression (zstd, lz4, snappy, gzip) works per batch, so larger batches compress better, and the broker stores them compressed.',
  recap: {
    points: [
      'One open batch per partition in the accumulator (inside buffer.memory).',
      'Sent when full (batch.size) or after linger.ms, whichever is first.',
      'One request per broker carries every ready batch for that broker.',
      'Higher linger.ms: fewer, bigger requests and better compression, a little more latency.',
      'compression.type compresses each batch; the broker stores it as received.',
      'Up to max.in.flight.requests.per.connection (5) requests per broker at a time.',
    ],
    interview: [
      { q: 'How does the Kafka producer batch records?', a: 'send() appends each record to the **open batch of its partition** in the accumulator. A batch becomes **ready when it is full (batch.size)** or **linger.ms** has passed. The **sender thread** drains ready batches and sends **one request per broker** containing all of that broker\'s batches.' },
      { q: 'How do linger.ms and batch.size affect throughput and latency?', a: '**linger.ms** adds up to that much waiting so more records share a batch: fewer requests, better compression, slightly higher latency. **batch.size** caps the batch; a batch is sent as soon as it is full. Typical high-throughput settings: linger.ms 5–50 ms and batch.size 64–256 KB.' },
      { q: 'Where does compression happen?', a: 'In the **producer, per batch** (compression.type: gzip, snappy, lz4, zstd). The broker stores and replicates the batch **compressed** when the topic\'s compression.type is producer, and **consumers decompress**. A different topic codec makes the broker recompress.' },
      { q: 'Why does a bigger batch compress better?', a: 'Compression finds repeated patterns; one batch is compressed as a **single block**, so more similar records (same JSON field names, similar values) give the codec more repetition to exploit.' },
    ],
  },
  quiz: {
    q: 'linger.ms=50 and batch.size=16 KB. A partition receives 16 KB of records in 5 ms. When is its batch sent?',
    options: ['After 50 ms, when linger.ms runs out', 'Right away, at about 5 ms, because it is full', 'Only when all partitions are full', 'When the consumer asks for it'],
    answer: 1,
    why: 'A batch is ready when it is full or when linger.ms has passed, whichever comes first. A full batch does not wait for linger.',
  },
  related: ['producer', 'journey', 'idempotence'],
};
