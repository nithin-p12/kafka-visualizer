// Lesson 8: the producer, what happens inside producer.send().
import { PARTITION_COLORS as PC, partitionFor } from '../scene.js';
import { setOnline, RED, GREEN, MUTED } from './kit.js';

const GREY = '#9aa3a9';
const ROW_Y = [282, 322, 362], ROW_X0 = 166, STEP = 32, SENDER = [575, 322];
const BROKER_X = 830, BROKER_Y = [120, 240, 360];
const SMALL = { w: 28, h: 24, size: 12 };
const logSlot = (p, i) => [BROKER_X - 92 + i * 30, BROKER_Y[p] + 28];
const rowSlot = (p, i) => [ROW_X0 + i * STEP, ROW_Y[p]];

function scene(s) {
  const v = { rows: [[], [], []], logs: [[], [], []] };
  v.app = s.box(330, 235, 600, 360, '', { stroke: '#d8b7e9', rx: 14, fill: '#fcfaff' });
  s.text(v.app, -284, -160, 'Your app · KafkaProducer', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: '#7a4aa3' });
  v.send = s.box(110, 125, 120, 54, 'send()', { size: 17 });
  v.ser = s.box(270, 125, 130, 54, 'serializer', { size: 16 });
  v.part = s.box(430, 125, 130, 54, 'partitioner', { size: 16 });
  s.line(171, 125, 203, 125); s.line(336, 125, 363, 125);
  v.buffer = s.box(300, 315, 440, 160, '', { stroke: '#c9ced2', rx: 10 });
  s.text(v.buffer, -208, -65, 'buffer · one batch per partition', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
  v.rowBoxes = ROW_Y.map((y, p) => {
    const r = s.box(320, y, 360, 32, '', { stroke: PC[p], rx: 6 });
    s.text(s.root, 112, y, `P${p}`, { 'font-size': 15, 'font-weight': 700, fill: PC[p] });
    return r;
  });
  v.sender = s.box(...SENDER, 90, 84, 'sender', { sub: 'thread', size: 15, subSize: 13 });
  v.brokers = BROKER_Y.map((y, p) => {
    const b = s.box(BROKER_X, y, 230, 100, '', { stroke: '#203347', rx: 10 });
    b.title = s.text(b, 0, -30, `Broker ${p + 1}`, { 'font-size': 16, 'font-weight': 700 });
    s.text(b, 0, -10, `leader of orders-${p}`, { 'font-size': 13, fill: MUTED });
    return Object.assign(b, { name: `Broker ${p + 1}`, online: true });
  });
  return v;
}
// Put a record (already at some position) into partition p's batch.
async function toRow(s, v, b, p, ms = 450) {
  const i = v.rows[p].length;
  v.rows[p].push(b);
  b.rect.setAttribute('fill', PC[p]);
  await s.move(b, ...rowSlot(p, i), ms);
}
// The sender ships partition p's whole batch to its leader. Returns how many records were delivered.
async function ship(s, v, p) {
  const batch = v.rows[p];
  if (!batch.length) return 0;
  v.rows[p] = [];
  if (!v.brokers[p].online) {
    // Leader unavailable: the batch goes back into the buffer to be retried.
    await Promise.all(batch.map(b => s.move(b, SENDER[0], SENDER[1], 350)));
    for (const b of batch) b.rect.setAttribute('fill', RED);
    await s.shake(v.sender);
    await Promise.all(batch.map((b, i) => { b.rect.setAttribute('fill', PC[p]); v.rows[p].push(b); return s.move(b, ...rowSlot(p, i), 400); }));
    return -batch.length;
  }
  const start = v.logs[p].length;
  await Promise.all(batch.map(async (b, i) => {
    await s.wait(i * 70);
    await s.move(b, ...SENDER, 320);
    await s.move(b, ...logSlot(p, start + i), 450);
    b.remove();
  }));
  for (let i = 0; i < batch.length; i++) v.logs[p].push(s.block(...logSlot(p, start + i), `${start + i}`, PC[p], { w: 26, h: 22, size: 12 }));
  return batch.length;
}
// The leader's acknowledgement travels back to send(): this completes the Future / runs the callback.
async function ack(s, v, p, first, last) {
  const pill = s.box(BROKER_X - 60, BROKER_Y[p] - 52, 150, 26, `✓ orders-${p} @ ${first === last ? first : `${first}–${last}`}`, { size: 12, fill: '#eef7e8', stroke: GREEN, color: GREEN, rx: 13 });
  await s.pop(pill, 200);
  await s.move(pill, 110, 70, 650);
  await s.fade(pill, 0, 250);
  pill.remove();
}

const KEYS = ['user-7', 'user-13', 'user-99', 'user-42', 'user-5'];

export default {
  id: 'producer', n: 8, title: 'Producer', tagline: 'How records leave your app',
  guide: {
    what: 'The producer is the Kafka client your application uses to write records. send() does not write to the broker directly: it prepares the record, groups it into a batch, and a background thread delivers batches to each partition\'s leader.',
    fits: 'You know where records are stored (partitions, brokers, replicas). Here is how they get there. Next: the consumer, which reads them back.',
  },
  watch: {
    build: scene,
    steps: [
      {
        title: 'Your code calls send()',
        text: 'It starts with one line: producer.send(new ProducerRecord<>("orders", "user-42", order)). You name the topic and give a key and a value. The producer takes it from here.',
        observe: 'A record with key user-42 enters the producer.',
        focus: v => [v.send, v.rec],
        async run(s, v) {
          v.rec = s.block(110, 185, 'user-42', GREY, { w: 92, h: 30, size: 13 });
          await s.pop(v.rec, 300);
          await s.pulse(v.send);
        },
      },
      {
        title: 'The serializer turns it into bytes',
        text: 'Kafka only moves bytes. The key serializer and value serializer you configured (for example StringSerializer, or JSON or Avro serializers) turn the key and the value into byte arrays.',
        observe: 'The record moves through the serializer and becomes bytes.',
        focus: v => [v.ser, v.rec],
        async run(s, v) {
          await s.move(v.rec, 270, 185, 550);
          await s.pulse(v.ser);
          v.rec.label.textContent = '01 6b 2f…';
          v.rec.rect.setAttribute('fill', '#65727a');
        },
      },
      {
        title: 'The partitioner picks a partition',
        text: 'Next the producer decides which partition gets the record. With a key, it hashes the key, so the same key always goes to the same partition. Without a key, records are spread out. The Key → partition lesson goes deeper.',
        observe: 'The key\'s hash picks one of the three partitions.',
        focus: v => [v.part, v.hash],
        async run(s, v) {
          v.p = partitionFor('user-42', 3);
          await s.move(v.rec, 430, 185, 550);
          await s.pulse(v.part);
          v.rec.rect.setAttribute('fill', PC[v.p]);
          v.rec.label.textContent = `→ P${v.p}`;
          v.hash = s.note(430, 218, `hash("user-42") % 3 = ${v.p}`, { 'font-size': 13, 'font-family': 'Consolas, monospace', fill: '#3d4a55' });
          await s.show(v.hash, 250);
        },
      },
      {
        title: 'It waits in a batch',
        text: 'The record joins a batch for its partition in the producer\'s buffer, and send() returns at once: your code does not wait for the network. More records arrive and collect in their partition\'s batch.',
        observe: 'Records pile up per partition while send() keeps returning immediately.',
        focus: v => [v.buffer],
        async run(s, v) {
          await s.fade(v.hash, 0, 200);
          const rec = v.rec;
          rec.label.textContent = '';
          await Promise.all([s.scale(rec, 1, 1), toRow(s, v, rec, v.p, 500)]);
          rec.rect.setAttribute('width', SMALL.w); rec.rect.setAttribute('x', -SMALL.w / 2);
          rec.rect.setAttribute('height', SMALL.h); rec.rect.setAttribute('y', -SMALL.h / 2);
          v.returned = s.note(110, 218, 'send() returned ✓', { 'font-size': 13, 'font-weight': 650, fill: GREEN });
          await s.show(v.returned, 200);
          for (const key of KEYS) {
            const b = s.block(110, 185, '', GREY, SMALL);
            await s.pop(b, 120);
            await toRow(s, v, b, partitionFor(key, 3), 420);
          }
        },
      },
      {
        title: 'The sender ships batches to the leaders',
        text: 'A background sender thread takes each partition\'s batch and sends it to that partition\'s leader broker. One request carries many records, which is far cheaper than one request per record.',
        observe: 'Each batch travels as a group to its own leader.',
        focus: v => v.brokers,
        async run(s, v) {
          await s.fade(v.returned, 0, 200);
          v.sent = await Promise.all([0, 1, 2].map(p => ship(s, v, p)));
        },
      },
      {
        title: 'The leader acknowledges',
        text: 'Each leader appends the batch to its partition and replies with the offsets it assigned. That reply completes the Future that send() returned, or runs your callback, so your code learns the write succeeded.',
        observe: 'Green acks with the new offsets travel back to send().',
        focus: v => [v.send],
        async run(s, v) {
          await Promise.all(v.sent.map((n, p) => n > 0 ? ack(s, v, p, 0, n - 1) : null));
          await s.pulse(v.send);
        },
      },
      {
        title: 'Failures are retried for you',
        text: 'Broker 2 is down, so the batch for orders-1 cannot be delivered. The producer keeps it and retries automatically until it succeeds or delivery.timeout.ms (2 minutes by default) runs out. With idempotence (on by default) a retry never writes a duplicate.',
        observe: 'The batch for P1 bounces back into the buffer, then goes through once Broker 2 returns.',
        focus: v => [v.rowBoxes[1]],
        async run(s, v) {
          setOnline(v.brokers[1], false);
          await s.shake(v.brokers[1]);
          const key = ['user-1', 'user-2', 'user-3', 'user-4', 'user-6', 'user-8'].find(k => partitionFor(k, 3) === 1);
          const b = s.block(110, 185, '', GREY, SMALL);
          await s.pop(b, 150);
          await toRow(s, v, b, partitionFor(key, 3), 450);
          await ship(s, v, 1);
          await s.wait(500);
          setOnline(v.brokers[1], true);
          await s.pulse(v.brokers[1]);
          const start = v.logs[1].length;
          const n = await ship(s, v, 1);
          await ack(s, v, 1, start, start + n - 1);
        },
      },
    ],
  },
  tryIt: {
    intro: 'Pick a key and call send(). Send five at once to see batching, and try stopping Broker 2 (the leader of orders-1).',
    observe: 'Records wait in their partition\'s batch, then travel together to the leader. A batch for a down leader stays in the buffer and is retried.',
    controls: [
      { type: 'choice', name: 'key', label: 'Key', options: ['user-42', 'user-7', 'no key'] },
      { type: 'button', label: 'send()', primary: true, run: 'one' },
      { type: 'button', label: 'send() × 5', run: 'five' },
      { type: 'button', label: 'Stop / start Broker 2', run: 'toggle' },
    ],
    build(s) {
      const v = scene(s);
      v.sticky = 0;
      v.message = 'Pick a key and press send().';
      return v;
    },
    // No key: the sticky partitioner fills one partition's batch, then moves on to the next partition.
    pick(v, key) { return key === 'no key' ? v.sticky : partitionFor(key, 3); },
    async add(s, v, input, count) {
      const p = this.pick(v, input.key);
      if (v.logs[p].length + v.rows[p].length + count > 7) { v.message = `orders-${p} has no room for ${count} more in this sandbox. Try another key, or switch tabs and back to start again.`; return false; }
      for (let k = 0; k < count; k++) {
        const b = s.block(110, 185, '', GREY, SMALL);
        await s.pop(b, 100);
        await toRow(s, v, b, p, 300);
      }
      return true;
    },
    async flush(s, v) {
      await s.wait(350); // linger.ms: give the batch a moment to fill
      const before = v.logs.map(l => l.length);
      const sent = await Promise.all([0, 1, 2].map(p => ship(s, v, p)));
      await Promise.all(sent.map((n, p) => n > 0 ? ack(s, v, p, before[p], before[p] + n - 1) : null));
      v.sticky = (v.sticky + 1) % 3;
      const ok = sent.map((n, p) => n > 0 ? `${n} → orders-${p}` : null).filter(Boolean), failed = sent.findIndex(n => n < 0);
      return { ok, failed };
    },
    async one(s, v, input) {
      if (!(await this.add(s, v, input, 1))) return;
      const { ok, failed } = await this.flush(s, v);
      v.message = (ok.length ? `Delivered ${ok.join(', ')}.` : '') + (failed >= 0 ? ` The batch for orders-${failed} is waiting: its leader is down, so the producer will retry.` : '');
    },
    async five(s, v, input) {
      if (!(await this.add(s, v, input, 5))) return;
      const { ok, failed } = await this.flush(s, v);
      const where = input.key === 'no key' ? 'With no key, the sticky partitioner put all five in one partition\'s batch.' : `Same key, so all five went to the same partition, in order.`;
      v.message = `${where} ${ok.length ? `Delivered ${ok.join(', ')} in ${ok.length > 1 ? 'one request per partition' : 'a single request'}.` : ''}${failed >= 0 ? ` orders-${failed}'s batch is waiting for its leader.` : ''}`;
    },
    async toggle(s, v) {
      const b = v.brokers[1];
      setOnline(b, !b.online);
      await (b.online ? s.pulse(b) : s.shake(b));
      if (!b.online) { v.message = 'Broker 2 stopped. Records for orders-1 will wait in the buffer.'; return; }
      const waiting = v.rows[1].length;
      if (!waiting) { v.message = 'Broker 2 is back.'; return; }
      const start = v.logs[1].length, n = await ship(s, v, 1);
      await ack(s, v, 1, start, start + n - 1);
      v.message = `Broker 2 is back. The waiting batch (${n} record${n > 1 ? 's' : ''}) was retried and delivered.`;
    },
    readout: v => `Delivered: ${v.logs.map((l, p) => `<b>orders-${p}</b> ${l.length}`).join(' · ')} · Waiting in buffer: <b>${v.rows.flat().length}</b>`
      + ` · Broker 2: <b style="color:${v.brokers[1].online ? GREEN : RED}">${v.brokers[1].online ? 'online' : 'down'}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Three ways to call send(), and what happens when the buffer is full.',
    build(s) {
      const v = {};
      v.rows = [['send(record)', 'fire and forget'], ['send(record).get()', 'wait for each ack'], ['send(record, callback)', 'async + callback']].map(([code, sub], i) => {
        const y = 110 + i * 120;
        const g = s.g(0, y);
        s.text(g, 40, -10, code, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, 'font-family': 'Consolas, monospace' });
        s.text(g, 40, 14, sub, { 'text-anchor': 'start', 'font-size': 13, fill: MUTED });
        g.axis = s.line(330, 0, 930, 0, { parent: g, arrow: false, stroke: '#d9d9d9', width: 2 });
        g.setAttribute('opacity', 0);
        return g;
      });
      s.note(630, 455, 'time →', { 'font-size': 13 });
      return v;
    },
    steps: [
      {
        title: 'Three ways to call send()',
        text: 'Fire and forget ignores the result, so failures go unnoticed. .get() blocks until each ack arrives, which is safe but slow. A callback keeps sending at full speed and still tells you about every success or failure: the usual choice.',
        observe: 'The .get() row waits for every ack. The callback row keeps sending while acks come back.',
        focus: v => [v.rows[1], v.rows[2]],
        async run(s, v) {
          for (const r of v.rows) await s.show(r, 250);
          const dot = (r, x, color, label = '') => s.block(x, 0, label, color, { parent: r, w: label ? 60 : 16, h: label ? 22 : 16, size: 11 });
          // Fire and forget: sends only.
          for (let k = 0; k < 5; k++) { await s.pop(dot(v.rows[0], 360 + k * 70, GREY), 80); }
          // Sync: each send waits for its ack.
          for (let k = 0; k < 2; k++) {
            const x = 360 + k * 280;
            await s.pop(dot(v.rows[1], x, GREY), 80);
            const wait = s.box(x + 110, 0, 190, 22, 'app blocked', { parent: v.rows[1], size: 11, fill: '#fff4f4', stroke: '#f3b4b4', color: RED, rx: 11 });
            await s.show(wait, 300);
            await s.pop(dot(v.rows[1], x + 230, GREEN, '✓ ack'), 120);
          }
          // Callback: keep sending; acks arrive later.
          for (let k = 0; k < 5; k++) await s.pop(dot(v.rows[2], 360 + k * 70, GREY), 80);
          for (let k = 0; k < 3; k++) await s.pop(s.block(500 + k * 140, 26, '✓ callback', GREEN, { parent: v.rows[2], w: 84, h: 20, size: 11 }), 120);
        },
      },
      {
        title: 'When the buffer is full, send() blocks',
        text: 'If records arrive faster than the brokers accept them, the buffer (buffer.memory, 32 MB by default) fills up. Then send() itself waits, up to max.block.ms (60 seconds), and throws a TimeoutException if there is still no room.',
        observe: 'The buffer gauge fills; at 100% the next send() has to wait.',
        focus: v => [v.gauge],
        async run(s, v) {
          await Promise.all(v.rows.map(r => s.fade(r, .12, 300)));
          v.gauge = s.box(480, 230, 520, 70, '', { stroke: '#203347', rx: 10 });
          const fill = s.g(0, 0, v.gauge);
          const bar = s.block(-255, 0, '', '#d9962b', { parent: fill, w: 10, h: 54 });
          bar.rect.setAttribute('x', 0);
          s.text(v.gauge, 0, -54, 'buffer.memory', { 'font-size': 15, 'font-weight': 650 });
          const pct = s.text(v.gauge, 0, 54, '0% full', { 'font-size': 14, fill: MUTED });
          await s.clock.tween(1400, t => { bar.rect.setAttribute('width', 10 + t * 500); pct.textContent = `${Math.round(t * 100)}% full`; });
          bar.rect.setAttribute('fill', RED);
          const blocked = s.box(480, 340, 300, 34, 'send() waits · max.block.ms', { size: 14, fill: '#fff4f4', stroke: RED, color: RED, rx: 17 });
          await s.pop(blocked, 300);
          await s.shake(blocked);
        },
      },
    ],
  },
  takeaway: 'send() serializes the record, picks its partition and adds it to a per-partition batch, then returns immediately. A background sender ships batches to each leader, the leader\'s ack completes the send, and failures are retried automatically.',
  recap: {
    points: [
      'send() is asynchronous: it returns a Future right away.',
      'Serializers turn key and value into bytes; the partitioner picks the partition (key hash, or spread when there is no key).',
      'Records are grouped into one batch per partition in the buffer.',
      'A background sender thread sends each batch to that partition\'s leader.',
      'The leader\'s ack (with offsets) completes the Future or callback; retriable errors are retried automatically.',
    ],
    interview: [
      { q: 'What happens when you call producer.send()?', a: 'The record is **serialized**, the **partitioner** picks its partition, and it is appended to that partition\'s **batch** in the buffer. send() then **returns a Future immediately**. A background **sender thread** sends batches to each partition\'s **leader**, and the leader\'s **ack** (with the offset) completes the Future or runs the callback.' },
      { q: 'How does the producer choose a partition?', a: 'In order: an **explicit partition** if you set one; otherwise the **hash of the key** (murmur2 % number of partitions), so a key always maps to the same partition; with **no key**, the **sticky partitioner** fills a batch for one partition, then switches, which keeps batches large.' },
      { q: 'Is send() synchronous? How do you know a write failed?', a: '**No, it is asynchronous.** Calling **.get()** on the Future makes it synchronous but slow. In production pass a **callback** (or check the Future) and handle the exception; fire-and-forget hides failures.' },
      { q: 'What happens if the leader is down when you send?', a: 'Retriable errors (leader not available, timeouts) are **retried automatically** until **delivery.timeout.ms** (2 min) runs out. With **enable.idempotence=true** (the default since Kafka 3.0) retries cannot create duplicates or reorder records. Non-retriable errors, such as a record that is too large, go straight to the callback.' },
    ],
  },
  quiz: {
    q: 'Your code calls send() 1,000 times in a loop. What does each call wait for?',
    options: ['The broker to write the record to disk', 'Usually nothing: the record is buffered and send() returns at once', 'All replicas to copy the record', 'A consumer to read the record'],
    answer: 1,
    why: 'send() only serializes, partitions and buffers the record, then returns a Future. Delivery happens in the background. It waits only if the buffer is full (up to max.block.ms).',
  },
  related: ['replica', 'record'],
};
