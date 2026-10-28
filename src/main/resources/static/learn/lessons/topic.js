// Lesson 2: the topic, a named stream of related records.
import { el, PARTITION_COLORS } from '../scene.js';

const TYPES = {
  orders: { color: '#4f7bd9', letter: 'O', producer: 'OrderService', y: 100 },
  payments: { color: '#d9962b', letter: 'P', producer: 'PaymentService', y: 235 },
  signups: { color: '#3aa58a', letter: 'U', producer: 'UserService', y: 370 },
};
// Lanes span x 300..700; readers sit at 760..940.
const LANE_X = 500, LANE_W = 400, LANE_END = LANE_X + LANE_W / 2, SLOT0 = 334, SLOT = 52, MAX = 7, READER_X = 850;
const BLOCK = { w: 46, h: 32, size: 15 };
const slot = (lane, i) => [SLOT0 + Math.min(i, MAX - 1) * SLOT, TYPES[lane].y];

function scene(s, { lanes = true } = {}) {
  const v = { producers: {}, lanes: {}, blocks: { orders: [], payments: [], signups: [] }, readers: {} };
  for (const [name, t] of Object.entries(TYPES)) {
    v.producers[name] = s.box(120, t.y, 200, 64, t.producer, { size: 18 });
    const lane = v.lanes[name] = s.box(LANE_X, t.y, LANE_W, 64, '', { stroke: '#1677ff', rx: 8 });
    s.text(lane, -LANE_W / 2 + 4, -46, `topic: ${name}`, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
    if (!lanes) lane.setAttribute('opacity', 0);
  }
  return v;
}
function reader(s, v, name, y, topic) {
  const r = v.readers[name] = s.box(READER_X, y, 180, 64, name, { sub: `reads ${topic}`, size: 18, subSize: 14 });
  r.got = 0; r.topic = topic;
  r.count = s.text(r, 0, -44, '', { 'font-size': 14, 'font-weight': 700, fill: '#348747' });
  return r;
}
async function produce(s, v, lane, from = v.producers[lane]) {
  const t = TYPES[lane], list = v.blocks[lane];
  const b = s.block(from._x, from._y, `${t.letter}${list.length + 1}`, t.color, BLOCK);
  list.push(b);
  await s.move(b, ...slot(lane, list.length - 1), 650);
  return b;
}
async function deliver(s, v, lane, b, readerNames) {
  await Promise.all(readerNames.map(async name => {
    const r = v.readers[name], copy = s.block(b._x, b._y, b.label.textContent, TYPES[lane].color, BLOCK);
    await s.move(copy, r._x - 62, r._y, 650);
    await s.fade(copy, 0, 200);
    copy.remove();
    r.got++; r.count.textContent = `✓ ${r.got} received`;
  }));
}

export default {
  id: 'topic', n: 2, title: 'Topic', tagline: 'A named stream for one kind of event',
  guide: {
    what: 'A topic is a named category of records, such as "orders" or "payments". Producers write to a topic by name and consumers read from it by name.',
    fits: 'You know what a record is. Here you see where it goes. Next: what a topic looks like inside (partitions).',
  },
  watch: {
    build(s) { return scene(s, { lanes: false }); },
    steps: [
      {
        title: 'Many kinds of events',
        text: 'A real system produces many kinds of events: orders, payments, sign-ups. If all of them went into one pile, every reader would have to dig through everything to find what it cares about.',
        observe: 'Three services throw different events into one pile.',
        focus: v => [v.pileHint],
        async run(s, v) {
          v.pile = [];
          const seq = ['orders', 'payments', 'orders', 'signups', 'payments', 'orders', 'signups'];
          v.pileHint = s.note(LANE_X, 330, 'one messy pile', { 'font-style': 'italic', 'font-size': 18 });
          v.pileHint.setAttribute('opacity', 0);
          for (const [i, lane] of seq.entries()) {
            const t = TYPES[lane], list = v.blocks[lane], p = v.producers[lane];
            const b = s.block(p._x, p._y, `${t.letter}${list.length + 1}`, t.color, BLOCK);
            list.push(b);
            await s.move(b, 405 + (i % 4) * 56 + (i % 2) * 10, 215 + Math.floor(i / 4) * 46 + (i % 3) * 8, 380);
          }
          await s.show(v.pileHint, 300);
        },
      },
      {
        title: 'A topic is a named stream',
        text: 'Kafka sorts records into topics. Each topic holds one kind of event and has a name: orders, payments, signups.',
        observe: 'The pile is sorted into three named topics.',
        focus: v => Object.values(v.lanes),
        async run(s, v) {
          await s.fade(v.pileHint, 0, 200);
          await Promise.all(Object.values(v.lanes).map(l => s.show(l, 400)));
          await Promise.all(Object.entries(v.blocks).flatMap(([lane, list]) => list.map((b, i) => s.move(b, ...slot(lane, i), 700))));
        },
      },
      {
        title: 'Producers write by topic name',
        text: 'In code: producer.send(new ProducerRecord<>("orders", key, value)). The producer only names the topic. It does not know or care who will read it.',
        observe: 'Each service has one arrow, to its own topic.',
        focus: v => [v.producers.orders, v.lanes.orders],
        async run(s, v) {
          v.arrows = Object.values(TYPES).map(t => s.line(222, t.y, 296, t.y, { width: 2 }));
          await Promise.all(v.arrows.map(a => s.draw(a, 400)));
          await produce(s, v, 'orders');
        },
      },
      {
        title: 'Consumers subscribe by topic name',
        text: 'Readers say which topics they want: consumer.subscribe(List.of("orders")). Here Shipping and Analytics both care about orders.',
        observe: 'Two independent readers connect to the same topic.',
        focus: v => [v.readers.Shipping, v.readers.Analytics],
        async run(s, v) {
          reader(s, v, 'Shipping', 175, 'orders'); reader(s, v, 'Analytics', 330, 'orders');
          await Promise.all([s.pop(v.readers.Shipping), s.pop(v.readers.Analytics)]);
          v.readArrows = [s.line(LANE_END + 2, 100, 756, 175, { width: 2 }), s.line(LANE_END + 2, 100, 756, 330, { width: 2 })];
          await Promise.all(v.readArrows.map(a => s.draw(a, 400)));
        },
      },
      {
        title: 'Reading does not remove anything',
        text: 'Unlike a classic queue, a record stays in the topic after it is read. Shipping and Analytics each get every order, independently. Records are removed only by retention (age or size), never by reading.',
        observe: 'Copies fly to both readers, and the originals stay in the topic.',
        focus: v => [v.lanes.orders],
        async run(s, v) {
          for (const b of v.blocks.orders) await deliver(s, v, 'orders', b, ['Shipping', 'Analytics']);
          await s.pulse(v.lanes.orders);
        },
      },
      {
        title: 'A topic is a logical name',
        text: 'A topic is really a name for a group of partitions, and partitions are where records actually live. That is the next lesson.',
        observe: 'The orders topic opens up into three partitions, and its records move into them.',
        focus: v => [v.partGroup],
        async run(s, v) {
          const others = [v.lanes.payments, v.lanes.signups, v.producers.payments, v.producers.signups, ...v.blocks.payments, ...v.blocks.signups, ...v.arrows.slice(1), ...Object.values(v.readers), ...v.readArrows];
          await Promise.all(others.map(n => s.fade(n, .08, 400)));
          v.partGroup = s.g();
          v.parts = PARTITION_COLORS.slice(0, 3).map((c, i) => {
            const p = s.box(LANE_X, 215 + i * 74, 380, 54, '', { parent: v.partGroup, stroke: c, dash: '6 5', rx: 8 });
            s.text(p, -168, 0, `P${i}`, { 'font-weight': 700, 'font-size': 18, fill: c });
            p.setAttribute('opacity', 0);
            return p;
          });
          const link = s.line(LANE_X, 134, LANE_X, 184, { width: 2 });
          await s.draw(link, 300);
          for (const p of v.parts) await s.show(p, 260);
          for (const b of v.blocks.orders) s.root.append(b);
          await Promise.all(v.blocks.orders.map((b, i) => s.move(b, LANE_X - 100 + Math.floor(i / 3) * 56, v.parts[i % 3]._y, 700)));
          v.blocks.orders.forEach((b, i) => b.rect.setAttribute('fill', PARTITION_COLORS[i % 3]));
          v.lanes.orders.rect.setAttribute('stroke-dasharray', '6 5');
        },
      },
    ],
  },
  tryIt: {
    intro: 'Send different events and watch which topic each one lands in. Then add a new reader, Billing, to the payments topic.',
    observe: 'When Billing joins, it can read payments that were sent before it existed. Records stay until retention removes them.',
    controls: [
      { type: 'button', label: 'Order placed', run: 'order' },
      { type: 'button', label: 'Payment received', run: 'payment' },
      { type: 'button', label: 'User signed up', run: 'signup' },
      { type: 'button', label: '+ Add Billing reader', primary: true, run: 'billing', once: true },
    ],
    build(s) {
      const v = scene(s);
      reader(s, v, 'Shipping', 60, 'orders'); reader(s, v, 'Analytics', 165, 'orders');
      s.line(LANE_END + 2, 100, 756, 60, { width: 2 }); s.line(LANE_END + 2, 100, 756, 165, { width: 2 });
      v.message = 'Click a button to produce an event.';
      return v;
    },
    async send(s, v, lane) {
      if (v.blocks[lane].length >= MAX) { v.message = `The ${lane} lane in this sandbox is full. Try another topic.`; return; }
      const b = await produce(s, v, lane);
      const readers = Object.keys(v.readers).filter(n => v.readers[n].topic === lane);
      if (readers.length) await deliver(s, v, lane, b, readers);
      v.message = readers.length ? `Delivered to ${readers.join(' and ')}. It is still stored in "${lane}".` : `Stored in "${lane}". Nobody reads this topic yet, but the record waits there.`;
    },
    order(s, v) { return this.send(s, v, 'orders'); },
    payment(s, v) { return this.send(s, v, 'payments'); },
    signup(s, v) { return this.send(s, v, 'signups'); },
    async billing(s, v) {
      const r = reader(s, v, 'Billing', 330, 'payments');
      await s.pop(r);
      await s.draw(s.line(LANE_END + 2, 235, 756, 330, { width: 2 }), 300);
      for (const b of v.blocks.payments) await deliver(s, v, 'payments', b, ['Billing']);
      v.message = v.blocks.payments.length ? `Billing caught up on ${v.blocks.payments.length} earlier payment(s): history is kept.` : 'Billing joined. Send a payment to see it arrive.';
    },
    readout: v => `${Object.entries(v.blocks).map(([k, l]) => `<b>${k}</b>: ${l.length}`).join(' · ')}<br>${Object.values(v.readers).map(r => `${r.label.textContent} got ${r.got}`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Topic settings: retention and compaction.',
    build(s) {
      const v = {};
      const c = v.card = s.g(200, 235);
      el('rect', { x: -180, y: -150, width: 360, height: 300, rx: 10, fill: '#fff', stroke: '#1677ff', 'stroke-width': 1.6 }, c);
      s.text(c, 0, -120, 'topic: orders · settings', { 'font-size': 17, 'font-weight': 650, fill: '#1677ff' });
      v.rows = [['partitions', '3'], ['replication.factor', '3'], ['retention.ms', '604800000 (7 days)'], ['cleanup.policy', 'delete']].map(([k, val], i) => {
        const r = s.g(0, -66 + i * 60, c);
        s.text(r, -158, -11, k, { 'text-anchor': 'start', 'font-size': 15, 'font-family': 'Consolas, monospace', fill: '#7b878f' });
        r.value = s.text(r, -158, 12, val, { 'text-anchor': 'start', 'font-size': 17, 'font-family': 'Consolas, monospace', 'font-weight': 700 });
        r.setAttribute('opacity', 0);
        return r;
      });
      return v;
    },
    steps: [
      {
        title: 'Every topic has its own settings',
        text: 'When you create a topic you choose its partition count, how many copies to keep (replication factor) and how long to keep data. Different topics can have different rules.',
        observe: 'Four of the most important settings.',
        focus: v => [v.card],
        async run(s, v) { for (const r of v.rows) await s.show(r, 260); },
      },
      {
        title: 'Retention: old records expire',
        text: 'With cleanup.policy=delete, records older than retention.ms (or beyond retention.bytes) are deleted, whether anyone read them or not. Kafka is not permanent storage by default.',
        observe: 'After "7 days" the oldest records disappear.',
        focus: v => [v.lane],
        async run(s, v) {
          v.lane = s.box(690, 140, 440, 64, '', { stroke: '#1677ff', rx: 8 });
          s.text(v.lane, -216, -46, 'cleanup.policy = delete', { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
          v.old = [];
          for (let i = 0; i < 6; i++) { const b = s.block(530 + i * 64, 140, `${i}`, '#4f7bd9', BLOCK); v.old.push(b); await s.pop(b, 150); }
          const clock = s.note(840, 94, '⏱ 7 days later…', { 'font-size': 16 });
          await s.show(clock, 300);
          await Promise.all(v.old.slice(0, 3).map(b => s.fade(b, 0, 600)));
        },
      },
      {
        title: 'Compaction: keep the latest value per key',
        text: 'With cleanup.policy=compact, Kafka keeps only the newest record for each key and drops older ones in the background. Good for "current state" topics such as user profiles.',
        observe: 'A1, B1 and A2 are replaced by newer values for the same key. C1, B2 and A3 survive.',
        focus: v => [v.lane2],
        async run(s, v) {
          v.lane2 = s.box(690, 330, 440, 64, '', { stroke: '#9d4ccc', rx: 8 });
          s.text(v.lane2, -216, -46, 'cleanup.policy = compact', { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 650, fill: '#9d4ccc' });
          const keys = ['A1', 'B1', 'A2', 'C1', 'B2', 'A3'], colors = { A: '#4f7bd9', B: '#d9962b', C: '#3aa58a' };
          const bs = [];
          for (const [i, k] of keys.entries()) { const b = s.block(530 + i * 64, 330, k, colors[k[0]], BLOCK); bs.push(b); await s.pop(b, 150); }
          await s.wait(500);
          await Promise.all(bs.slice(0, 3).map(b => s.fade(b, 0, 600)));
        },
      },
    ],
  },
  takeaway: 'A topic is a named stream. Producers write to it by name, any number of consumers read it independently, and reading never deletes records; retention does.',
  recap: {
    points: [
      "A topic is a named stream for one kind of event, such as orders or payments.",
      "Producers write by topic name and consumers subscribe by name. They never need to know about each other.",
      "Reading does not delete. Any number of consumer groups read the same records independently.",
      "Records leave only through retention (delete policy) or compaction (latest value per key).",
      "Physically, a topic is a set of partitions. That is the next lesson.",
    ],
    interview: [
      {
        q: "How is a Kafka topic different from a queue?",
        a: "In a classic queue a message is **removed once consumed** and goes to one consumer. A Kafka topic is a **durable log**: reading removes nothing, and each consumer group keeps **its own offset**. So many applications read the same data independently and can **replay** it by resetting offsets.",
      },
      {
        q: "When are messages deleted from a topic?",
        a: "Never by reading. With **cleanup.policy=delete**, old segments are dropped after **retention.ms** (7 days by default) or past **retention.bytes**. With **cleanup.policy=compact**, Kafka keeps only the **latest record per key**.",
      },
      {
        q: "How would you design topics for an e-commerce system?",
        a: "One topic per event type or domain: **orders, payments, user-signups**. Keep one schema per topic, key by what must stay ordered (**orderId**), size partitions for the parallelism you need, and use **replication factor 3** in production.",
      },
      {
        q: "A new service subscribes to an old topic. What does it read?",
        a: "Anything still within retention. A new group has no committed offset, so **auto.offset.reset** decides: **earliest** reads the full history, **latest** (the default) only new records.",
      },
    ],
  },
  quiz: {
    q: 'Shipping reads a record from "orders". What happens to that record?',
    options: ['It is deleted from the topic', 'It moves to a Shipping-only queue', 'It stays in the topic, so Analytics can still read it', 'It is locked until Shipping commits'],
    answer: 2,
    why: 'Kafka never deletes on read. Each reader tracks its own position, and records live until retention removes them.',
  },
  related: ['record', 'partition'],
};
