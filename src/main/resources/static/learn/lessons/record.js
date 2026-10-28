// Lesson 1: the record (message), the unit of data Kafka moves.
import { el } from '../scene.js';

const GREY = '#9aa3a9', KEY = '#1677ff';
const BIG = { size: 19, subSize: 14 }, BLOCK = { w: 48, h: 32, size: 15 };
const CARD_X = 515, CARD_Y = 235, TOPIC_X = 868;

function card(s, x, y) {
  const c = s.g(x, y);
  el('rect', { x: -225, y: -158, width: 450, height: 316, rx: 12, fill: '#fff', stroke: '#9d4ccc', 'stroke-width': 2 }, c);
  s.text(c, 0, -132, 'ProducerRecord', { 'font-size': 17, fill: '#9d4ccc', 'font-weight': 650 });
  const row = (y, name, value) => {
    const r = s.g(0, y, c);
    r.bg = el('rect', { x: -207, y: -25, width: 414, height: 50, rx: 6, fill: '#f5f5f5' }, r);
    s.text(r, -190, 0, name, { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, fill: '#7b878f', 'letter-spacing': '.04em' });
    r.value = s.text(r, -88, 0, value, { 'text-anchor': 'start', 'font-size': 17, fill: '#203347', 'font-family': 'Consolas, monospace' });
    r.setAttribute('opacity', 0);
    return r;
  };
  c.key = row(-78, 'KEY', '"user-42"');
  c.value = row(-18, 'VALUE', '{"order":1042,"total":59.9}');
  c.time = row(42, 'TIMESTAMP', '2026-10-27 09:14:03');
  c.headers = row(102, 'HEADERS', 'trace-id=7f3a');
  c.setAttribute('opacity', 0);
  return c;
}

async function fillRow(s, v, row) {
  const dot = s.block(v.app._x + 110, v.app._y, '', GREY, { w: 20, h: 20 });
  await s.move(dot, CARD_X - 40, CARD_Y + row._y, 520);
  dot.remove();
  await s.fade(row, 1, 260);
}

export default {
  id: 'record', n: 1, title: 'Record', tagline: 'The envelope every message travels in',
  guide: {
    what: 'A record (also called a message or event) is the smallest piece of data in Kafka. Everything else in Kafka exists to store, copy and deliver records.',
    fits: 'This is the starting point. Next you will see where records go: a topic.',
  },
  watch: {
    build(s) {
      const v = {};
      v.app = s.box(140, CARD_Y, 220, 96, 'OrderService', { sub: 'your application', ...BIG });
      v.bubble = s.box(140, 110, 236, 54, 'Order #1042 placed', { fill: '#fff8e6', stroke: '#e3b341', size: 17, weight: 500, rx: 27 });
      v.bubble.setAttribute('opacity', 0);
      v.card = card(s, CARD_X, CARD_Y);
      v.topic = s.box(TOPIC_X, CARD_Y, 160, 84, 'orders', { sub: 'topic', stroke: '#1677ff', ...BIG });
      v.topic.setAttribute('opacity', 0);
      return v;
    },
    steps: [
      {
        title: 'Something happens in your app',
        text: 'OrderService just placed order #1042. Right now this is an ordinary object inside your Java code. Kafka has not seen it yet.',
        observe: 'The event exists only inside the application.',
        focus: v => [v.app, v.bubble],
        async run(s, v) { await s.show(v.bubble, 300); await s.pop(v.bubble); },
      },
      {
        title: 'Kafka wraps it in a record',
        text: 'To send anything to Kafka you create a record (ProducerRecord in Java). Think of it as an envelope with four parts: key, value, timestamp and headers.',
        observe: 'Each part is filled in one at a time.',
        focus: v => [v.card],
        async run(s, v) {
          await s.fade(v.card, 1, 350);
          for (const r of [v.card.key, v.card.value, v.card.time, v.card.headers]) await fillRow(s, v, r);
        },
      },
      {
        title: 'Key: who or what this is about',
        text: 'The key (here "user-42") names the subject of the event. It is optional, but Kafka uses it to decide where the record is stored. Records with the same key always stay together, in order.',
        observe: 'The key is highlighted. Remember it; it comes back in the Partition lesson.',
        focus: v => [v.card.key],
        async run(s, v) { v.card.key.bg.setAttribute('fill', '#e6f0ff'); await s.pulse(v.card.key, 2); },
      },
      {
        title: 'Value: the actual data',
        text: 'The value is the payload: JSON, Avro, plain text or anything else. Kafka never looks inside it. To Kafka it is just bytes.',
        observe: 'Kafka treats the value as an opaque box.',
        focus: v => [v.card.value],
        async run(s, v) { v.card.value.bg.setAttribute('fill', '#fff8e6'); await s.pulse(v.card.value, 2); },
      },
      {
        title: 'Timestamp and headers: metadata',
        text: 'The timestamp says when the event happened. Headers are optional labels such as a trace ID, useful for tooling. Business data belongs in the value.',
        observe: 'These two rows describe the record rather than carry its data.',
        focus: v => [v.card.time, v.card.headers],
        async run(s, v) { await Promise.all([s.pulse(v.card.time), s.pulse(v.card.headers)]); },
      },
      {
        title: 'Records are immutable',
        text: 'Once written, a record can never be edited. If the order changes, you send a new record such as "Order #1042 cancelled". Kafka is a log of facts that happened.',
        observe: 'The edit attempt is rejected.',
        focus: v => [v.card, v.lock],
        async run(s, v) {
          const pen = s.box(TOPIC_X, 110, 150, 42, '✎ edit', { fill: '#fff', stroke: '#ce3434', color: '#ce3434', size: 16, rx: 21 });
          await s.show(pen, 200);
          await s.move(pen, CARD_X + 120, CARD_Y - 18, 650);
          await s.shake(v.card);
          pen.label.textContent = '✕ not allowed';
          await s.wait(500);
          await s.fade(pen, 0, 300);
          pen.remove();
          v.lock = s.text(v.card, 196, -132, '🔒', { 'font-size': 24 });
          await s.pop(v.lock);
        },
      },
      {
        title: 'Off it goes, to a topic',
        text: 'The record is sent to a topic: a named stream such as "orders". The next lesson explains what a topic is.',
        observe: 'The envelope becomes one small block. That block is how records look everywhere in the Visualizer.',
        focus: v => [v.topic, v.sent],
        async run(s, v) {
          await s.show(v.topic, 300);
          await s.scale(v.card, .12, 500);
          v.card.setAttribute('opacity', 0);
          v.sent = s.block(CARD_X, CARD_Y, '#1', GREY, BLOCK);
          await s.pop(v.sent, 200);
          await s.move(v.sent, TOPIC_X, CARD_Y + 72, 800);
          await s.pulse(v.topic);
        },
      },
    ],
  },
  tryIt: {
    intro: 'Build your own records. Pick a key and a value, then send. Try sending the same key twice, then try editing a record you already sent.',
    observe: 'Every send adds a new block. Nothing you sent earlier changes.',
    controls: [
      { type: 'choice', name: 'key', label: 'Key', options: ['user-42', 'user-7', 'no key'] },
      { type: 'choice', name: 'value', label: 'Value', options: ['order placed', 'order paid', 'order cancelled'] },
      { type: 'button', label: 'Send record', primary: true, run: 'send' },
      { type: 'button', label: 'Edit last record', run: 'edit' },
    ],
    build(s) {
      const v = { sent: [], message: 'Nothing sent yet.' };
      v.app = s.box(125, 240, 200, 96, 'OrderService', { sub: 'your application', ...BIG });
      v.topicFrame = s.box(645, 245, 560, 350, '', { stroke: '#1677ff', dash: '7 6' });
      s.text(s.root, 645, 46, 'topic: orders', { 'font-size': 18, 'font-weight': 650, fill: '#1677ff' });
      return v;
    },
    async send(s, v, input) {
      const i = v.sent.length;
      if (i >= 12) { v.message = 'The sandbox is full. Switch tabs and back to start again.'; return; }
      const key = input.key === 'no key' ? null : input.key;
      const g = s.g(125, 240);
      el('rect', { x: -80, y: -30, width: 160, height: 60, rx: 7, fill: '#fff', stroke: '#9d4ccc', 'stroke-width': 1.6 }, g);
      s.text(g, 0, -12, `key: ${key ?? 'null'}`, { 'font-size': 14, 'font-weight': 600, 'font-family': 'Consolas, monospace', fill: key ? KEY : '#7b878f' });
      s.text(g, 0, 12, input.value, { 'font-size': 14, 'font-family': 'Consolas, monospace' });
      await s.pop(g, 250);
      await s.move(g, 465 + (i % 3) * 180, 125 + Math.floor(i / 3) * 80, 650);
      v.sent.push({ g, key, value: input.value });
      v.message = `Record #${i + 1} sent with key ${key ?? 'null'}. It is now a permanent fact in the topic.`;
    },
    async edit(s, v) {
      const last = v.sent.at(-1);
      if (!last) { v.message = 'Send a record first.'; return; }
      await s.shake(last.g);
      v.message = 'Rejected: records are immutable. To change the story, send a new record (for example "order cancelled").';
    },
    readout: v => `<b>${v.sent.length}</b> record(s) in the topic.<br>${v.message}`,
  },
  deeper: {
    note: 'Serialization: how records become bytes on the wire.',
    build(s) {
      const v = {};
      v.obj = s.box(130, 150, 220, 90, 'key: "user-42"', { sub: 'Java String', ...BIG, size: 18 });
      v.ser = s.box(375, 150, 170, 76, 'Serializer', { fill: '#f7effb', stroke: '#9d4ccc', color: '#614373', size: 18 });
      v.bytes = s.box(640, 150, 300, 62, '75 73 65 72 2d 34 32', { size: 18, weight: 500, stroke: '#7b878f' });
      v.bytes.label.setAttribute('font-family', 'Consolas, monospace');
      v.bytes.setAttribute('opacity', 0);
      v.broker = s.box(875, 150, 150, 76, 'Broker', { sub: 'stores bytes', ...BIG });
      v.des = s.box(640, 330, 190, 76, 'Deserializer', { fill: '#f7effb', stroke: '#9d4ccc', color: '#614373', size: 18 });
      v.out = s.box(860, 330, 180, 90, 'key: "user-42"', { sub: 'back to a String', ...BIG, size: 18 });
      for (const n of [v.des, v.out]) n.setAttribute('opacity', 0);
      return v;
    },
    steps: [
      {
        title: 'Kafka only stores bytes',
        text: 'Brokers know nothing about Java objects or JSON. Before sending, the producer turns the key and value into byte arrays using the serializers you configure (key.serializer, value.serializer).',
        observe: 'The text "user-42" becomes seven bytes.',
        focus: v => [v.ser, v.bytes],
        async run(s, v) {
          const dot = s.block(130, 150, 'K', KEY, BLOCK);
          await s.move(dot, 375, 150, 600);
          await s.pulse(v.ser);
          dot.remove();
          await s.show(v.bytes, 400);
          await s.pulse(v.broker);
        },
      },
      {
        title: 'Consumers must use the matching deserializer',
        text: 'The reading side turns the bytes back into objects. Producer and consumer must agree on the format. Reading JSON bytes with an Avro deserializer fails with a SerializationException.',
        observe: 'Bytes travel from the broker back up into an object.',
        focus: v => [v.des, v.out],
        async run(s, v) {
          await Promise.all([s.show(v.des), s.show(v.out)]);
          const b = s.block(875, 150, '01', GREY, BLOCK);
          await s.move(b, 640, 330, 700);
          await s.pulse(v.des);
          await s.move(b, 860, 330, 500);
          b.remove();
          await s.pulse(v.out);
        },
      },
    ],
  },
  takeaway: 'A record = key + value + timestamp + headers. The key decides placement, the value is opaque bytes, and records are never edited once written.',
  recap: {
    points: [
      "A record has a key, a value, a timestamp and headers. The broker adds the partition and offset when it is stored.",
      "The key decides the partition: the same key always lands in the same partition, so those records stay in order.",
      "The value is opaque bytes. Serializers on the producer and matching deserializers on the consumer turn it into objects.",
      "Records are immutable. To change something, send a new event; old ones go away only through retention or compaction.",
    ],
    interview: [
      {
        q: "What is inside a Kafka message?",
        a: "Say: \"A record is a **key, value, timestamp and optional headers**. The key is used for partitioning, the value is the payload as bytes, and headers carry metadata such as a trace ID. Once written, it is identified by **topic, partition and offset**.\"",
      },
      {
        q: "Why does the message key matter?",
        a: "The default partitioner hashes the key (**murmur2 % partition count**), so every record with the same key goes to the **same partition** and is read **in order**. With a null key, records are spread across partitions. Pick the key by what must stay ordered, for example orderId or userId.",
      },
      {
        q: "Can you update or delete a message?",
        a: "**No, records are immutable.** You append a new event instead (OrderCancelled). Records disappear only through **retention** (time or size), or on a **compacted** topic, where a newer value or a **tombstone** (key with a null value) replaces older ones for that key.",
      },
      {
        q: "How large can a message be?",
        a: "About **1 MB by default** (broker message.max.bytes, producer max.request.size). It can be raised, but the usual answer is to store large files in object storage and send a **reference** (a URL or ID) in the record.",
      },
    ],
  },
  quiz: {
    q: 'By default, which part of a record does Kafka use to choose where it is stored?',
    options: ['The value', 'The key', 'The timestamp', 'A header'],
    answer: 1,
    why: 'The producer hashes the key to pick a partition, so records with the same key always land together. The value is never inspected.',
  },
  related: ['topic', 'partition'],
};
