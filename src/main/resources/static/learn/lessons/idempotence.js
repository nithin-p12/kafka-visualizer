// Level 4 · Deep dive: the idempotent producer and exactly-once. Why a retry can duplicate a record, how producer
// ids and sequence numbers let the leader drop the duplicate, and how transactions make "read, process, write"
// atomic for read_committed consumers.
import { PARTITION_COLORS as PC } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, INK, start, layers, frame, node, part, wire, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0], Q = '#2f9e8f', MARK = '#8f4fc4';
const logX = off => 408 + (off - 100) * 46, LOG_Y = 104;

function scene(s, { idem = false, txn = false } = {}) {
  const v = start(s, { parent: { send: 'prod', pid: 'prod', seq: 'prod', sender: 'prod', txn: 'prod', log: 'b1', pstate: 'b1', hand: 'b1', rc: 'pay', ru: 'pay' } });
  Object.assign(v, { idem, txnOn: txn, next: 100, seq: 7, blocks: [] });

  frame(s, v, 'prod', 157, 240, 286, 412, txn ? 'Producer · billing app' : 'Producer', { color: '#7a4aa3', fill: '#fcfaff', stroke: '#d8b7e9' });
  node(s, v, 'send', 157, 84, 250, 44, 'send(ORD101)', { sub: idem ? 'enable.idempotence=true' : 'enable.idempotence=false' });
  node(s, v, 'pid', 157, 152, 250, 44, 'producer id: none', { sub: idem ? 'not assigned yet' : 'no id, no sequence' });
  node(s, v, 'seq', 157, 220, 250, 44, 'sequence for orders-0', { sub: '—' });
  node(s, v, 'sender', 157, 288, 250, 44, 'sender · retries on', { sub: 'idle' });
  node(s, v, 'txn', 157, 392, 250, 64, 'transactional.id', { sub: txn ? 'billing-1' : 'not set' });
  for (const k of ['send', 'pid', 'seq', 'sender', 'txn']) v.n[k].s.setAttribute('font-family', MONO);

  frame(s, v, 'b1', 485, 150, 300, 220, `Broker B1 · leader of ${txn ? 'payments-0' : 'orders-0'}`);
  const log = part(s, v, 'log');
  s.text(log, 346, LOG_Y, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  node(s, v, 'pstate', 485, 168, 270, 50, 'producer state', { sub: 'none' });
  v.n.pstate.s.setAttribute('font-family', MONO);
  node(s, v, 'hand', 485, 230, 270, 44, 'request handler', { sub: '', size: 14 });
  v.handT = v.n.hand.s;

  node(s, v, 'coord', 485, 392, 300, 64, 'Transaction coordinator', { sub: '__transaction_state: —' });
  v.n.coord.s.setAttribute('font-family', MONO);

  frame(s, v, 'pay', 808, 287, 290, 160, txn ? 'consumers of payments' : 'consumers of orders', { color: MUTED });
  node(s, v, 'rc', 808, 268, 260, 50, 'consumer · read_committed', { sub: 'sees: —', size: 14 });
  node(s, v, 'ru', 808, 330, 260, 50, 'consumer · read_uncommitted', { sub: 'sees: —', size: 14 });
  node(s, v, 'offs', 808, 410, 260, 48, '__consumer_offsets', { sub: 'billing · orders-0 → 100', size: 14 });
  for (const k of ['rc', 'ru', 'offs']) v.n[k].s.setAttribute('font-family', MONO);

  wire(v, 'sender-hand', 'M282,282 C318,282 318,226 350,226');
  wire(v, 'hand-sender', 'M350,238 C318,244 318,296 282,296');
  wire(v, 'pid-coord', 'M282,146 C318,146 300,386 335,386');
  wire(v, 'coord-pid', 'M335,398 C292,398 312,160 282,160');
  wire(v, 'txn-coord', 'M282,404 L335,404');
  wire(v, 'coord-offs', 'M635,404 C664,404 660,410 678,410');
  wire(v, 'sender-offs', 'M282,300 C330,470 600,446 678,420');
  wire(v, 'log-rc', 'M560,74 C660,60 690,268 678,268');
  wire(v, 'log-ru', 'M580,74 C700,70 700,330 678,330');
  layers(s, v);
  return v;
}

// ---- helpers ----
async function append(s, v, label, { color = P0, faded = false } = {}) {
  const off = v.next++;
  const b = s.block(logX(off), LOG_Y, label ?? `${off}`, color, { w: 42, h: 30, size: 13, parent: v.n.log });
  if (faded) b.setAttribute('opacity', .45);
  v.blocks.push(b);
  await s.pop(b, 300);
  hit(v, 'log');
  return { off, b };
}
const sees = (s, v, k, str, color = INK) => swap(s, v.n[k].s, str, color);

// ---- flow 1: duplicates without idempotence ----
const D = {
  send: {
    phase: 'Send', on: ['send', 'sender', 'hand', 'log'], wire: 'sender-hand',
    title: 'ORD101 is sent and written as offset 100',
    text: 'The producer sends a batch with ORD101. The leader appends it as offset 100. So far, so good.',
    observe: 'ProduceRequest to B1; ORD101 lands at offset 100.',
    async run(s, v) { await swap(s, v.n.sender.s, 'ProduceRequest (ORD101)', BLUE); await packet(s, v, 'sender-hand', 'Produce ORD101', BLUE, { ms: 900 }); await append(s, v, '#101'); await swap(s, v.handT, 'wrote offset 100', MUTED); },
  },
  lost: {
    phase: 'Send', on: ['hand', 'sender'], wire: 'hand-sender',
    title: 'The response is lost',
    text: 'B1 sends the ProduceResponse, but the connection breaks on the way back (or the reply arrives after request.timeout.ms). From the producer\'s side the request simply failed.',
    observe: 'The green response turns red before reaching the sender.',
    async run(s, v) { await packet(s, v, 'hand-sender', 'ProduceResponse', RED, { ms: 900 }); await swap(s, v.n.sender.s, '✕ no answer: timeout', RED); },
  },
  retry: {
    phase: 'Retry', on: ['sender', 'hand'], wire: 'sender-hand',
    title: 'The producer retries the same batch',
    text: 'retries is effectively unlimited (bounded by delivery.timeout.ms), so the sender sends the same batch again. It cannot know the first attempt was actually written.',
    observe: 'A second ProduceRequest with ORD101.',
    async run(s, v) { await swap(s, v.n.sender.s, 'retry ProduceRequest (ORD101)', AMBER); await packet(s, v, 'sender-hand', 'Produce ORD101 (retry)', AMBER, { ms: 900 }); },
  },
  dup: {
    phase: 'Retry', on: ['log', 'hand'],
    title: 'The leader writes it again: offset 101',
    text: 'To the broker this is just another batch, so it appends ORD101 again as offset 101. The log now holds the same order twice.',
    observe: 'A red duplicate ORD101 at offset 101.',
    async run(s, v) { await append(s, v, '#101', { color: RED }); await swap(s, v.handT, 'wrote offset 101 (duplicate)', RED); await swap(s, v.n.sender.s, '✓ offset 101', GREEN); },
  },
  seen: {
    phase: 'Consequence', on: ['log', 'rc', 'ru'], wires: ['log-rc', 'log-ru'],
    title: 'Every consumer sees ORD101 twice',
    text: 'Consumers read both offsets. With max.in.flight > 1 retries can also reorder batches. This is why idempotence became the default in Kafka 3.0.',
    observe: 'Both consumers list ORD101 twice.',
    async run(s, v) { await Promise.all([sees(s, v, 'rc', 'sees: ORD101, ORD101', RED), sees(s, v, 'ru', 'sees: ORD101, ORD101', RED)]); },
  },
};
// ---- flow 2: the idempotent producer ----
const I = {
  init: {
    phase: 'Producer id', on: ['pid', 'coord'], wires: ['pid-coord', 'coord-pid'],
    title: 'On start-up the producer gets a producer id',
    text: 'An idempotent producer first sends InitProducerId and receives a producer id (PID), here 42, with an epoch. Every batch it sends will carry this PID.',
    observe: 'InitProducerId goes out; "PID 42 · epoch 0" comes back.',
    async run(s, v) { await packet(s, v, 'pid-coord', 'InitProducerId', BLUE, { ms: 800 }); await packet(s, v, 'coord-pid', 'PID 42 · epoch 0', GREEN, { ms: 800 }); await swap(s, v.n.pid.t, 'producer id: 42 · epoch 0'); await swap(s, v.n.pid.s, 'kept for this session', MUTED); },
  },
  send: {
    phase: 'Sequence numbers', on: ['seq', 'sender', 'hand', 'log', 'pstate'], wire: 'sender-hand',
    title: 'Each batch carries PID and a sequence number',
    text: 'Per partition, the producer numbers its batches: this one is sequence 7 for orders-0. The leader appends it as offset 100 and remembers "PID 42: last sequence 7" (it keeps the last 5 batches per producer).',
    observe: 'Produce(PID 42, seq 7); B1\'s producer state shows last seq 7.',
    async run(s, v) {
      await swap(s, v.n.seq.s, 'next batch: seq 7', BLUE);
      await packet(s, v, 'sender-hand', 'Produce · PID 42 · seq 7', BLUE, { ms: 900 });
      await append(s, v, '#101');
      await swap(s, v.n.pstate.s, 'PID 42 · last seq 7 → offset 100', BLUE);
    },
  },
  lost: { ...D.lost, phase: 'Retry' },
  retry: {
    phase: 'Retry', on: ['sender', 'hand', 'pstate'], wire: 'sender-hand',
    title: 'The retry carries the same sequence: 7',
    text: 'The sender retries the identical batch, with the same PID and the same sequence number 7.',
    observe: 'Produce(PID 42, seq 7) again.',
    async run(s, v) { await swap(s, v.n.sender.s, 'retry · PID 42 · seq 7', AMBER); await packet(s, v, 'sender-hand', 'Produce · PID 42 · seq 7 (retry)', AMBER, { ms: 900 }); },
  },
  dedupe: {
    phase: 'Retry', on: ['pstate', 'hand', 'sender'], wire: 'hand-sender',
    title: 'Seen before: no second write',
    text: 'The leader sees sequence 7 from PID 42 is the one it already has. It does not append anything and answers success with the original offset 100. The log keeps exactly one ORD101.',
    observe: 'No new block; the response says offset 100.',
    async run(s, v) {
      await swap(s, v.handT, 'seq 7 already written → dup', GREEN);
      await packet(s, v, 'hand-sender', '✓ offset 100 (duplicate)', GREEN, { ms: 900 });
      await swap(s, v.n.sender.s, '✓ offset 100', GREEN);
      await swap(s, v.n.seq.s, 'next batch: seq 8', MUTED);
    },
  },
  order: {
    phase: 'Order', on: ['seq', 'pstate', 'hand'],
    title: 'Sequence numbers also keep order',
    text: 'With up to 5 batches in flight, seq 9 may arrive while seq 8 is being retried. The leader rejects 9 (OutOfOrderSequence, retriable) until 8 is in, so batches land in send order. That is why idempotence allows max.in.flight up to 5.',
    observe: 'B1 accepts 8 then 9, never 9 before 8.',
    async run(s, v) { await swap(s, v.handT, 'seq 9 before 8 → retry later', AMBER); await swap(s, v.n.pstate.s, 'PID 42 · last seq 9 (in order)', BLUE); },
  },
  limits: {
    phase: 'Order', on: ['pid', 'pstate'],
    title: 'The limit: one producer session',
    text: 'Duplicates are caught per PID and partition. If the producer process restarts it gets a new PID, and a batch it resends from scratch is a new record. Surviving restarts, and spanning several partitions atomically, needs transactions.',
    observe: 'Deduplication is tied to PID 42.',
    async run(s, v) { hit(v, 'pid'); await s.wait(400); },
  },
};
// ---- flow 3: transactions ----
const T = {
  init: {
    phase: 'Set up', on: ['txn', 'coord', 'pid'], wires: ['pid-coord', 'coord-pid'],
    title: 'A transactional producer registers its transactional.id',
    text: 'The billing app reads orders and writes payments. Its producer has transactional.id=billing-1. InitProducerId goes to the transaction coordinator, which returns PID 42 and bumps the epoch to 3: any older instance with billing-1 is now fenced.',
    observe: 'Coordinator: billing-1 → PID 42 · epoch 3.',
    async run(s, v) {
      await packet(s, v, 'pid-coord', 'InitProducerId(billing-1)', BLUE, { ms: 800 });
      await swap(s, v.n.coord.s, 'billing-1 · PID 42 · epoch 3 · idle', BLUE);
      await packet(s, v, 'coord-pid', 'PID 42 · epoch 3', GREEN, { ms: 800 });
      await swap(s, v.n.pid.t, 'producer id: 42 · epoch 3');
    },
  },
  begin: {
    phase: 'Transaction', on: ['txn', 'coord'], wire: 'txn-coord',
    title: 'beginTransaction(), then the first send',
    text: 'The app consumed order ORD101 and starts a transaction. Before the first write to payments-0, the producer registers that partition with the coordinator (AddPartitionsToTxn).',
    observe: 'Coordinator: transaction ongoing, partitions {payments-0}.',
    async run(s, v) { await swap(s, v.n.txn.s, 'billing-1 · in transaction', AMBER); await packet(s, v, 'txn-coord', 'AddPartitionsToTxn', BLUE, { ms: 600 }); await swap(s, v.n.coord.s, 'billing-1 · ONGOING · {payments-0}', AMBER); },
  },
  write: {
    phase: 'Transaction', on: ['sender', 'hand', 'log', 'ru', 'rc'], wires: ['sender-hand', 'log-ru'],
    title: 'The payment is written, but not committed',
    text: 'The producer writes payment PAY-1 to payments-0 as usual: it is in the log (faded here). A read_uncommitted consumer can already see it; a read_committed one cannot.',
    observe: 'Faded PAY-1 at offset 100; read_uncommitted sees it, read_committed does not.',
    async run(s, v) {
      await packet(s, v, 'sender-hand', 'Produce PAY-1 (txn)', BLUE, { ms: 900 });
      await append(s, v, 'PAY', { color: Q, faded: true });
      await Promise.all([sees(s, v, 'ru', 'sees: PAY-1 (uncommitted!)', AMBER), sees(s, v, 'rc', 'sees: nothing yet (LSO 100)', MUTED)]);
    },
  },
  offsets: {
    phase: 'Transaction', on: ['sender', 'offs', 'coord'], wire: 'sender-offs',
    title: 'The input offset joins the transaction',
    text: 'sendOffsetsToTransaction() writes "billing has consumed orders-0 up to 101" as part of the same transaction. The consumed position and the produced payment will become visible together, or not at all.',
    observe: 'A TxnOffsetCommit travels to __consumer_offsets, pending.',
    async run(s, v) { await packet(s, v, 'sender-offs', 'TxnOffsetCommit 101', BLUE, { ms: 900 }); await swap(s, v.n.offs.s, 'orders-0 → 101 (pending)', AMBER); },
  },
  commit: {
    phase: 'Commit', on: ['txn', 'coord'], wire: 'txn-coord',
    title: 'commitTransaction(): the coordinator decides',
    text: 'The producer asks the coordinator to commit. The coordinator first records PREPARE_COMMIT in __transaction_state: from this point the transaction will complete even if the producer dies.',
    observe: 'Coordinator: PREPARE_COMMIT.',
    async run(s, v) { await packet(s, v, 'txn-coord', 'EndTxn(commit)', BLUE, { ms: 600 }); await swap(s, v.n.coord.s, 'billing-1 · PREPARE_COMMIT', AMBER); },
  },
  markers: {
    phase: 'Commit', on: ['coord', 'log', 'offs'], wires: ['coord-offs'],
    title: 'Commit markers are written to every partition',
    text: 'The coordinator writes a COMMIT control marker into payments-0 and into __consumer_offsets, then records COMPLETE_COMMIT. The marker takes an offset (101) but is never delivered to applications.',
    observe: 'A purple C marker after PAY-1; PAY-1 turns solid; the input offset is committed.',
    async run(s, v) {
      await append(s, v, 'C', { color: MARK });
      await s.fade(v.blocks[0], 1, 300);
      await packet(s, v, 'coord-offs', 'COMMIT marker', MARK, { ms: 600 });
      await Promise.all([swap(s, v.n.offs.s, 'billing · orders-0 → 101', GREEN), swap(s, v.n.coord.s, 'billing-1 · COMPLETE_COMMIT', GREEN), swap(s, v.n.txn.s, 'billing-1 · committed', GREEN)]);
    },
  },
  visible: {
    phase: 'Commit', on: ['rc', 'log'], wire: 'log-rc',
    title: 'read_committed now sees PAY-1',
    text: 'The last stable offset moves past the transaction, and the read_committed consumer receives PAY-1. Exactly once: the payment exists once, and the order\'s offset was committed with it.',
    observe: 'read_committed: "sees: PAY-1".',
    async run(s, v) { await sees(s, v, 'rc', 'sees: PAY-1', GREEN); },
  },
  abort: {
    phase: 'Abort', on: ['log', 'coord', 'rc', 'ru'],
    title: 'An aborted transaction is skipped',
    text: 'The next order fails halfway: PAY-2 was written, then abortTransaction() makes the coordinator write ABORT markers. read_committed consumers skip PAY-2 (they know from the markers which records to drop); the input offset was not committed, so ORD102 is processed again.',
    observe: 'Faded PAY-2 followed by a red A marker; read_committed never sees PAY-2.',
    async run(s, v) {
      await append(s, v, 'PAY', { color: Q, faded: true });
      await swap(s, v.n.coord.s, 'billing-1 · PREPARE_ABORT', RED);
      await append(s, v, 'A', { color: RED });
      await Promise.all([sees(s, v, 'ru', 'sees: PAY-1, PAY-2 (aborted!)', RED), sees(s, v, 'rc', 'sees: PAY-1 only', GREEN), swap(s, v.n.coord.s, 'billing-1 · COMPLETE_ABORT', MUTED)]);
    },
  },
  zombie: {
    phase: 'Fencing', on: ['pid', 'coord', 'hand'],
    title: 'A zombie instance is fenced',
    text: 'An old billing instance that was stuck in a GC pause wakes up and tries to write with epoch 2. The brokers know billing-1 is at epoch 3 and reject it with ProducerFenced. Only one live instance per transactional.id can write.',
    observe: 'The handler rejects epoch 2: ProducerFenced.',
    async run(s, v) { await swap(s, v.handT, 'epoch 2 < 3 → ProducerFenced', RED); await s.shake(v.n.hand); },
  },
};

const trackOf = (steps, opts) => { const t = { continuous: true, steps, enter, build(s) { const v = scene(s, opts); v.track = t; return v; } }; return t; };
const flowDup = trackOf(Object.values(D), { idem: false });
const flowIdem = trackOf(Object.values(I), { idem: true });
const flowTxn = trackOf(Object.values(T), { idem: true, txn: true });

// ---- try it ----
async function trySend(s, v, input, lose) {
  const idem = input.idem === 'on';
  if (!v.started && idem) { await I.init.run(s, v); v.started = true; }
  if (v.next > 104) return 'The sandbox log is full. Switch tabs and back to start again.';
  const seq = v.seq;
  await packet(s, v, 'sender-hand', idem ? `Produce · seq ${seq}` : 'Produce', BLUE, { ms: 700 });
  const { off } = await append(s, v, `#${v.order}`);
  if (idem) await swap(s, v.n.pstate.s, `PID 42 · last seq ${seq} → offset ${off}`, BLUE);
  if (!lose) { await packet(s, v, 'hand-sender', `✓ offset ${off}`, GREEN, { ms: 700 }); v.seq++; v.order++; return `Order ${v.order - 1} written once at offset ${off}.`; }
  await packet(s, v, 'hand-sender', 'response lost', RED, { ms: 700 });
  await packet(s, v, 'sender-hand', idem ? `retry · seq ${seq}` : 'retry', AMBER, { ms: 700 });
  if (idem) {
    await swap(s, v.handT, `seq ${seq} already written → dup`, GREEN);
    await packet(s, v, 'hand-sender', `✓ offset ${off}`, GREEN, { ms: 700 });
    v.seq++; v.order++;
    return `The retry carried seq ${seq} again; B1 recognised it and answered with offset ${off}. Order ${v.order - 1} is in the log once.`;
  }
  const dup = await append(s, v, `#${v.order}`, { color: RED });
  await packet(s, v, 'hand-sender', `✓ offset ${dup.off}`, GREEN, { ms: 700 });
  v.order++;
  return `Without idempotence the retry was written again: order ${v.order - 1} is at offsets ${off} and ${dup.off}.`;
}

export default {
  id: 'idempotence', n: 25, title: 'Idempotent producer & exactly-once', tagline: 'No duplicates on retry',
  docked: true,
  guide: {
    what: 'A retry after a lost response can write a record twice. The idempotent producer tags every batch with a producer id and sequence number so the leader can drop the duplicate. Transactions go further: writes to several partitions and the consumed offsets become visible together, or not at all.',
    fits: 'Deep dive after acks, Commit & restart and Batching: it closes the gap between at-least-once and exactly-once.',
  },
  flows: [
    { id: 'dup', short: 'duplicate', label: 'Without idempotence', about: 'A lost response and a retry write the record twice.', track: flowDup },
    { id: 'idem', short: 'idempotent', label: 'Idempotent producer', about: 'PID + sequence: the leader drops the retry.', track: flowIdem },
    { id: 'txn', short: 'transactions', label: 'Transactions', about: 'Read, process, write atomically; abort; fencing.', track: flowTxn },
  ],
  watch: flowDup,
  tryIt: {
    intro: 'Send orders with idempotence on or off. "Send, lose the reply" makes the response disappear so the producer retries.',
    observe: 'With idempotence off, a lost reply means a duplicate in the log; with it on, the leader answers the retry with the original offset.',
    controls: [
      { type: 'choice', name: 'idem', label: 'enable.idempotence', options: ['on', 'off'], rebuild: true },
      { type: 'button', label: 'Send', primary: true, run: 'ok' },
      { type: 'button', label: 'Send, lose the reply', run: 'lose' },
    ],
    build(s, input) {
      const v = scene(s, { idem: input?.idem !== 'off' });
      v.order = 101; v.started = false;
      v.message = 'Send once normally, then send and lose the reply.';
      return v;
    },
    async ok(s, v, input) { unfocus(v); v.message = await trySend(s, v, input, false); },
    async lose(s, v, input) { unfocus(v); v.message = await trySend(s, v, input, true); },
    readout: v => `Log: <b>${v.blocks.map(b => b.label.textContent).join(' ') || 'empty'}</b> · duplicates <b>${v.blocks.filter(b => b.rect.getAttribute('fill') === RED).length}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Exactly-once in Kafka Streams, its limits, and the settings involved.',
    continuous: true,
    build(s) { const v = scene(s, { idem: true, txn: true }); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['txn', 'coord'],
        title: 'Kafka Streams does this for you',
        text: 'processing.guarantee=exactly_once_v2 makes Kafka Streams wrap every read-process-write cycle in a transaction, including state store changelogs and offsets. Plain producers and consumers have to call the transaction API themselves.',
        observe: 'The same coordinator, driven by Streams.',
        async run(s, v) { await swap(s, v.n.txn.s, 'Streams: exactly_once_v2', BLUE); },
      },
      {
        on: ['rc', 'ru'],
        title: 'Only inside Kafka',
        text: 'Exactly-once covers Kafka topics and offsets. A side effect outside Kafka (an e-mail, a payment API, a database row) is not part of the transaction: make it idempotent or write the result to Kafka and let a sink handle it idempotently.',
        observe: 'Consumers of the output see each committed record once.',
        async run(s, v) { hit(v, 'rc'); await s.wait(500); },
      },
      {
        on: ['pid', 'sender', 'txn'],
        title: 'Settings',
        text: 'Idempotence: enable.idempotence=true (default since 3.0) needs acks=all, retries > 0 and max.in.flight ≤ 5. Transactions add transactional.id (stable per instance) and transaction.timeout.ms; consumers need isolation.level=read_committed.',
        observe: 'The settings each piece depends on.',
        async run(s, v) { await swap(s, v.n.sender.s, 'acks=all · in-flight ≤ 5', BLUE); },
      },
    ],
  },
  takeaway: 'Retries can duplicate writes. The idempotent producer (default since 3.0) sends a producer id and per-partition sequence number with each batch; the leader drops repeats and keeps order. Transactions make writes to many partitions plus the consumed offsets atomic; read_committed consumers see only committed data, and epochs fence zombie instances.',
  recap: {
    points: [
      'A lost ProduceResponse + retry = duplicate without idempotence.',
      'Idempotence: producer id + sequence per partition; the leader drops a sequence it already has.',
      'Sequence numbers also keep order with up to 5 requests in flight.',
      'Dedupe is per producer session; restarts get a new PID unless transactional.id is set.',
      'Transactions: begin → writes + sendOffsetsToTransaction → commit/abort markers.',
      'read_committed consumers stop at the LSO and skip aborted records; epochs fence zombies.',
    ],
    interview: [
      { q: 'How does the idempotent producer prevent duplicates?', a: 'The producer gets a **producer id** and numbers its batches with a **sequence per partition**. The leader keeps the last sequences per producer; a **retried batch with a sequence it already has is not appended**, and the leader returns the **original offset**. It also rejects out-of-order sequences, so up to **5 in-flight requests** stay ordered.' },
      { q: 'What does exactly-once mean in Kafka?', a: 'For **read-process-write** between Kafka topics: the output records and the **consumed offsets** are committed in one **transaction**, so after any crash each input is reflected **exactly once** in the output. Consumers must use **isolation.level=read_committed**. It does not cover side effects outside Kafka.' },
      { q: 'How do Kafka transactions work?', a: 'A producer with a **transactional.id** registers with the **transaction coordinator** (InitProducerId, which bumps the **epoch** and fences older instances). It **begins** a transaction, registers partitions, writes records, adds offsets with **sendOffsetsToTransaction**, then **commits**: the coordinator logs PREPARE_COMMIT and writes **commit markers** to every partition. read_committed consumers read only up to the **LSO** and drop aborted records.' },
      { q: 'What is a zombie producer and how is it stopped?', a: 'An old instance that **looks dead but is not** (GC pause, network partition) and later tries to write. Because every new instance with the same transactional.id gets a **higher epoch**, brokers reject the old one with **ProducerFenced**.' },
    ],
  },
  quiz: {
    q: 'An idempotent producer\'s response is lost and it retries the batch with the same sequence number. What does the leader do?',
    options: ['Appends it again at a new offset', 'Rejects it with an error, and the record is lost', 'Recognises the sequence, does not append, and returns the original offset', 'Waits for the consumer to deduplicate'],
    answer: 2,
    why: 'The leader tracks the last sequence numbers per producer id and partition; a repeat is acknowledged with the original offset instead of being written twice.',
  },
  related: ['acks', 'redelivery', 'batching'],
};
