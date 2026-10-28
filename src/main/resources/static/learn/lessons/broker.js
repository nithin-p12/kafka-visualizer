// Lesson 5: the broker, one Kafka server that stores partitions and serves clients.
import { el, PARTITION_COLORS as PC } from '../scene.js';

const RED = '#ce3434', COMMIT = '#348747';

// A partition log drawn inside a broker: a labelled lane with `count` records.
// Compact lanes (inside small brokers) use narrower blocks so five records fit.
function miniLane(s, parent, x, y, name, color, count, w, compact = false) {
  const g = s.g(x, y, parent);
  Object.assign(g, { w, color, blocks: [], bw: compact ? 18 : 24 });
  g.pos = compact ? i => -5 + i * 20 : i => -w / 2 + 112 + i * 28;
  el('rect', { x: -w / 2, y: -17, width: w, height: 34, rx: 4, fill: '#fff', stroke: color }, g);
  s.text(g, -w / 2 + 8, 0, name, { 'text-anchor': 'start', 'font-size': 11, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: color });
  for (let i = 0; i < count; i++) g.blocks.push(s.block(g.pos(i), 0, `${i}`, color, { parent: g, w: g.bw, h: 20 }));
  return g;
}
// Root coordinates of a node nested inside translated groups.
function abs(s, n) {
  let x = 0, y = 0;
  for (; n && n !== s.root; n = n.parentNode) { x += n._x ?? 0; y += n._y ?? 0; }
  return [x, y];
}
const nextSlot = (s, l) => { const [x, y] = abs(s, l); return [x + l.pos(l.blocks.length), y]; };

function broker(s, x, y, w, h, name, sub) {
  const b = s.box(x, y, w, h, '', { stroke: '#203347' });
  b.title = s.text(b, 0, -h / 2 + 20, name, { 'font-size': 15, 'font-weight': 700 });
  if (sub) s.text(b, 0, -h / 2 + 39, sub, { 'font-size': 11, fill: '#7b878f' });
  b.online = true;
  return b;
}
function setOnline(b, on) {
  b.online = on;
  b.rect.setAttribute('stroke', on ? '#203347' : RED);
  b.rect.setAttribute('fill', on ? '#fff' : '#fff4f4');
  b.title.textContent = b.title.textContent.replace(/ ✕ down$/, '') + (on ? '' : ' ✕ down');
}
// Send a record toward a lane; fails visibly when the broker is offline.
async function send(s, from, b, l, label = '') {
  const r = s.block(from._x + 70, from._y, label, '#9aa3a9', { w: l.bw, h: 20 });
  if (!b.online) {
    await s.move(r, (from._x + b._x) / 2, (from._y + b._y) / 2, 500);
    r.rect.setAttribute('fill', RED);
    await s.shake(r);
    await s.move(r, from._x + 70, from._y, 400);
    r.remove();
    return false;
  }
  await s.move(r, ...nextSlot(s, l), 650);
  r.remove();
  l.blocks.push(s.block(l.pos(l.blocks.length), 0, `${l.blocks.length}`, l.color, { parent: l, w: l.bw, h: 20 }));
  return true;
}

export default {
  id: 'broker', n: 5, title: 'Broker', tagline: 'One Kafka server that stores partitions',
  guide: {
    what: 'A broker is a single Kafka server. It stores partitions on its disk, accepts writes from producers and serves reads to consumers.',
    fits: 'Records live in partitions; partitions live on brokers. Next (coming soon): many brokers working together as a cluster.',
  },
  watch: {
    build(s) {
      const v = {};
      v.broker = broker(s, 480, 235, 320, 300, 'Broker 1', 'one Kafka server process · port 9092');
      v.disk = s.g(0, 30, v.broker);
      el('rect', { x: -145, y: -88, width: 290, height: 190, rx: 6, fill: '#f5f5f5', stroke: '#d9d9d9' }, v.disk);
      s.text(v.disk, -132, -70, '💽 disk · /var/kafka-logs', { 'text-anchor': 'start', 'font-size': 11, fill: '#7b878f' });
      v.lanes = [['orders-0', PC[0], 2], ['orders-1', PC[1], 3], ['payments-0', PC[0], 1]].map(([n, c, k], i) => miniLane(s, v.disk, 0, -32 + i * 50, n, c, k, 260));
      for (const l of v.lanes) l.setAttribute('opacity', 0);
      v.disk.setAttribute('opacity', 0);
      v.broker.setAttribute('opacity', 0);
      v.producer = s.box(100, 235, 150, 60, 'Producer', { size: 13 });
      v.consumer = s.box(860, 235, 150, 60, 'Consumer', { size: 13 });
      for (const n of [v.producer, v.consumer]) n.setAttribute('opacity', 0);
      return v;
    },
    steps: [
      {
        title: 'A broker is a Kafka server',
        text: 'A broker is one running Kafka server, a Java process on a machine. Clients (producers and consumers) connect to it over the network, usually on port 9092.',
        observe: 'One server appears. Everything you learned so far will live inside it.',
        focus: v => [v.broker],
        async run(s, v) { await s.show(v.broker, 200); await s.pop(v.broker); },
      },
      {
        title: 'It stores partitions on its disk',
        text: 'The partitions from earlier lessons are files on a broker\'s disk. This broker holds orders-0, orders-1 and payments-0: partitions from two different topics.',
        observe: 'Three partition logs appear inside the broker\'s disk.',
        focus: v => [v.disk],
        async run(s, v) { await s.show(v.disk, 300); for (const l of v.lanes) await s.show(l, 280); },
      },
      {
        title: 'Producers send records to the broker',
        text: 'The producer sends a record over the network. The broker appends it to the right partition log on disk, then replies with an acknowledgement that includes the new offset.',
        observe: 'The record goes into orders-1 as offset 3, and a green ack goes back to the producer.',
        focus: v => [v.lanes[1], v.ack],
        async run(s, v) {
          await s.show(v.producer);
          await send(s, v.producer, v.broker, v.lanes[1]);
          const [ax, ay] = abs(s, v.lanes[1].blocks.at(-1));
          v.ack = s.box(ax, ay - 32, 120, 26, '✓ ack · offset 3', { size: 11, fill: '#eef7e8', stroke: COMMIT, color: COMMIT, rx: 13 });
          await s.pop(v.ack, 250);
          await s.move(v.ack, 100, 185, 700);
        },
      },
      {
        title: 'Consumers pull from the broker',
        text: 'Brokers never push records. A consumer asks: "give me orders-1 from offset 2". The broker returns what it has. Pulling lets each consumer read at its own pace.',
        observe: 'First the request goes to the broker, then records 2 and 3 come back.',
        focus: v => [v.consumer, v.lanes[1]],
        async run(s, v) {
          await s.fade(v.ack, 0, 200);
          await s.show(v.consumer);
          v.fetch = s.box(860, 185, 170, 26, 'fetch orders-1 @ 2', { size: 11, fill: '#e6f0ff', stroke: '#1677ff', color: '#1677ff', rx: 13 });
          await s.pop(v.fetch, 250);
          await s.move(v.fetch, 640, 185, 600);
          await s.fade(v.fetch, 0, 200);
          const l = v.lanes[1];
          await Promise.all(l.blocks.slice(2).map(async (b, i) => {
            const c = s.block(...abs(s, b), `${i + 2}`, PC[1], { w: 24, h: 20 });
            await s.wait(i * 250);
            await s.move(c, 790, 235, 600);
            c.remove();
          }));
          await s.pulse(v.consumer);
        },
      },
      {
        title: 'One broker is a single point of failure',
        text: 'If this one machine dies, every partition on it becomes unavailable. Nothing can be written, nothing can be read, until it comes back.',
        observe: 'The broker turns red. The producer\'s record bounces back.',
        focus: v => [v.broker],
        async run(s, v) {
          setOnline(v.broker, false);
          await s.shake(v.broker);
          await send(s, v.producer, v.broker, v.lanes[0]);
          await s.shake(v.consumer);
        },
      },
      {
        title: 'So Kafka runs many brokers',
        text: 'A real deployment runs several brokers, called a cluster. Partitions are spread across them to share the load. To survive a broker failure, partitions are also copied to other brokers (replication). Both are coming lessons.',
        observe: 'Three brokers, each holding one of the partitions.',
        focus: v => v.cluster,
        async run(s, v) {
          await Promise.all([v.broker, v.producer, v.consumer].map(n => s.fade(n, 0, 400)));
          v.cluster = [['Broker 1', 'orders-0', PC[0]], ['Broker 2', 'orders-1', PC[1]], ['Broker 3', 'payments-0', PC[0]]].map(([name, part, c], i) => {
            const b = broker(s, 230 + i * 250, 235, 210, 150, name);
            miniLane(s, b, 0, 20, part, c, 3, 180, true);
            b.setAttribute('opacity', 0);
            return b;
          });
          for (const b of v.cluster) { await s.show(b, 200); await s.pop(b, 300); }
        },
      },
    ],
  },
  tryIt: {
    intro: 'Three brokers each hold one partition of the orders topic, with no copies. Send records, then stop a broker and send again.',
    observe: 'Only the partition on the stopped broker fails. The other partitions keep working.',
    controls: [
      { type: 'button', label: 'Send to orders-0', run: 'p0' },
      { type: 'button', label: 'Send to orders-1', run: 'p1' },
      { type: 'button', label: 'Send to orders-2', run: 'p2' },
      { type: 'button', label: 'Stop / start Broker 1', run: 'b0' },
      { type: 'button', label: 'Stop / start Broker 2', run: 'b1' },
      { type: 'button', label: 'Stop / start Broker 3', run: 'b2' },
    ],
    build(s) {
      const v = { message: 'All three brokers are online.' };
      v.producer = s.box(95, 235, 140, 60, 'Producer', { size: 13 });
      v.brokers = [0, 1, 2].map(i => {
        const b = broker(s, 340 + i * 220, 235, 190, 170, `Broker ${i + 1}`);
        b.lane = miniLane(s, b, 0, 20, `orders-${i}`, PC[i], 1, 180, true);
        return b;
      });
      return v;
    },
    async p(s, v, i) {
      const b = v.brokers[i];
      if (b.lane.blocks.length >= 5) { v.message = 'That partition is full in this sandbox.'; return; }
      const ok = await send(s, v.producer, b, b.lane);
      v.message = ok ? `orders-${i} on Broker ${i + 1} stored the record at offset ${b.lane.blocks.length - 1}.` : `orders-${i} is unavailable: its only copy is on Broker ${i + 1}, which is down. A real producer retries until delivery.timeout.ms (2 minutes by default), then gives up with an error.`;
    },
    p0(s, v) { return this.p(s, v, 0); }, p1(s, v) { return this.p(s, v, 1); }, p2(s, v) { return this.p(s, v, 2); },
    async toggle(s, v, i) {
      const b = v.brokers[i];
      setOnline(b, !b.online);
      await (b.online ? s.pulse(b) : s.shake(b));
      v.message = b.online ? `Broker ${i + 1} is back. orders-${i} is available again, and its data was kept on disk.` : `Broker ${i + 1} stopped. Try sending to orders-${i}.`;
    },
    b0(s, v) { return this.toggle(s, v, 0); }, b1(s, v) { return this.toggle(s, v, 1); }, b2(s, v) { return this.toggle(s, v, 2); },
    readout: v => `${v.brokers.map((b, i) => `Broker ${i + 1}: <b style="color:${b.online ? COMMIT : RED}">${b.online ? 'online' : 'down'}</b>`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'How clients find the right broker, and why brokers are fast.',
    build(s) {
      const v = {};
      v.client = s.box(100, 150, 150, 60, 'Producer', { sub: 'bootstrap.servers=b1:9092', size: 13 });
      v.brokers = [['Broker 1', 'orders-0', PC[0]], ['Broker 2', 'orders-1', PC[1]], ['Broker 3', 'orders-2', PC[2]]].map(([name, part, c], i) => {
        const b = broker(s, 430 + i * 200, 150, 170, 120, name);
        b.lane = miniLane(s, b, 0, 18, part, c, 1, 160, true);
        return b;
      });
      return v;
    },
    steps: [
      {
        title: 'Bootstrap: ask any broker for the map',
        text: 'A client is configured with one or a few broker addresses (bootstrap.servers). It asks that broker for metadata: which broker holds which partition. Then it talks directly to the right broker for each partition.',
        observe: 'The metadata reply, then the record goes straight to Broker 2, which owns orders-1.',
        focus: v => [v.meta],
        async run(s, v) {
          const ask = s.box(100, 150, 110, 24, 'metadata?', { size: 11, fill: '#e6f0ff', stroke: '#1677ff', color: '#1677ff', rx: 12 });
          await s.pop(ask, 200);
          await s.move(ask, 430, 150, 600);
          ask.remove();
          v.meta = s.box(270, 300, 250, 92, '', { fill: '#f7effb', stroke: '#9d4ccc' });
          ['orders-0 → Broker 1', 'orders-1 → Broker 2', 'orders-2 → Broker 3'].forEach((t, i) => s.text(v.meta, 0, -26 + i * 26, t, { 'font-size': 12, 'font-family': 'Consolas, monospace' }));
          await s.show(v.meta);
          await send(s, v.client, v.brokers[1], v.brokers[1].lane);
        },
      },
      {
        title: 'Writes are sequential appends',
        text: 'Because partitions are append-only, a broker always writes at the end of a file, like recording onto tape. Sequential disk I/O is very fast compared with random writes.',
        observe: 'Records stream onto the end of orders-2, one after another.',
        focus: v => [v.brokers[2]],
        async run(s, v) { for (let i = 0; i < 3; i++) await send(s, v.client, v.brokers[2], v.brokers[2].lane); },
      },
      {
        title: 'Page cache and zero-copy reads',
        text: 'Recently written data stays in the operating system\'s memory (page cache). Consumers reading near the end are served from memory, and the OS can send bytes from cache to the network without copying them through the JVM (zero-copy).',
        observe: 'Recent records are served from memory, not disk.',
        focus: v => [v.cache],
        async run(s, v) {
          v.cache = s.box(830, 330, 190, 60, 'page cache (RAM)', { fill: '#fff8e6', stroke: '#e3b341', size: 13, sub: 'latest records' });
          await s.show(v.cache);
          const consumer = s.box(560, 400, 140, 50, 'Consumer', { size: 13 });
          await s.show(consumer);
          for (let i = 0; i < 2; i++) {
            const c = s.block(830, 330, '', PC[2], { w: 24, h: 20 });
            await s.move(c, 560, 380, 550);
            c.remove();
          }
          await s.pulse(consumer);
        },
      },
    ],
  },
  takeaway: 'A broker is one Kafka server: it stores partition logs on disk, appends producer writes, and serves consumer fetches. Consumers pull. One broker alone is a single point of failure.',
  quiz: {
    q: 'There is no replication. Broker 2, which holds orders-1, crashes. What happens?',
    options: ['orders-1 is unavailable until Broker 2 returns', 'Kafka moves orders-1 to another broker automatically', 'orders-1\'s records are rebalanced into orders-0', 'Nothing, because consumers cached the data'],
    answer: 0,
    why: 'Without a copy elsewhere, the only replica of orders-1 is offline. Its data is safe on disk, but it cannot be read or written until the broker comes back. Replication (a later lesson) fixes this.',
  },
  related: ['partition', 'offset'],
};
