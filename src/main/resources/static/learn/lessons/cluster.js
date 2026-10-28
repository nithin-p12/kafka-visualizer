// Lesson 6: the cluster, many brokers working as one.
import { el, PARTITION_COLORS as PC } from '../scene.js';
import { abs, broker, setOnline, fly, RED, MUTED } from './kit.js';

const SLOT_X = [330, 500, 670, 840], BY = 225, BW = 150, BH = 250;
const TOPIC_COLORS = ['#4f7bd9', '#d9962b', '#3aa58a', '#9e579e'], TOPICS = ['orders', 'payments', 'users', 'clicks'];

// The dashed cluster boundary around the broker slots.
function frame(s) {
  const f = s.box(590, 215, 700, 330, '', { stroke: '#9aa3a9', dash: '7 6', rx: 14 });
  s.text(f, -336, 150, 'Kafka cluster', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: '#65727a' });
  return f;
}
function brokers(s, count = 4) {
  return SLOT_X.slice(0, count).map((x, i) => Object.assign(broker(s, x, BY, BW, BH, `Broker ${i + 1}`, `id ${i + 1}`), { chips: [], idx: i }));
}
// A partition placed on a broker: a labelled chip, stacked under the broker's title.
function chip(s, b, name, color) {
  const c = s.g(0, -40 + b.chips.length * 46, b);
  c.rect = el('rect', { x: -64, y: -18, width: 128, height: 36, rx: 6, fill: '#fff', stroke: color, 'stroke-width': 1.6 }, c);
  s.text(c, -54, 0, name, { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: color });
  c.count = s.text(c, 54, 0, '', { 'text-anchor': 'end', 'font-size': 13, 'font-weight': 700, fill: MUTED });
  Object.assign(c, { name, color, n: 0 });
  b.chips.push(c);
  return c;
}
function markChips(b) {
  for (const c of b.chips) {
    c.rect.setAttribute('stroke', b.online ? c.color : RED);
    c.rect.setAttribute('stroke-dasharray', b.online ? '' : '5 4');
    c.rect.setAttribute('fill', b.online ? '#fff' : '#fff4f4');
  }
}
function controllerBadge(s, b) {
  return s.box(0, -150, 136, 28, '★ controller', { parent: b, size: 13, fill: '#fff8e6', stroke: '#e3b341', color: '#8a5a12', rx: 14 });
}
// A partition chip flies in from the topic label, then appears on its broker.
async function place(s, from, c, ms = 550) {
  c.setAttribute('opacity', 0);
  await fly(s, from, abs(s, c), c.color, '', ms);
  await s.show(c, 200);
}
async function heartbeat(s, from, ctrl) {
  const [x] = abs(s, from), [cx, cy] = abs(s, ctrl);
  const dot = s.block(x, BY - BH / 2, '', '#e3b341', { w: 12, h: 12 });
  await s.move(dot, cx, cy + 10, 550);
  dot.remove();
}

export default {
  id: 'cluster', n: 6, title: 'Cluster', tagline: 'Many brokers working as one',
  guide: {
    what: 'A cluster is a group of brokers that work together and look like one Kafka to clients. Partitions are spread across the brokers so the work is shared.',
    fits: 'You know one broker. Here many brokers share the partitions. Next: copies of each partition on other brokers (replicas), so one failure loses nothing.',
  },
  watch: {
    build(s) {
      const v = {};
      v.frame = frame(s);
      v.brokers = brokers(s);
      v.producer = s.box(110, 150, 180, 64, 'Producer', { size: 18 });
      v.consumer = s.box(110, 300, 180, 64, 'Consumer', { size: 18 });
      v.topic = s.note(590, 28, 'topic: orders · 3 partitions', { 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
      for (const n of [v.frame, ...v.brokers, v.producer, v.consumer, v.topic]) n.setAttribute('opacity', 0);
      return v;
    },
    steps: [
      {
        title: 'One cluster, many brokers',
        text: 'A Kafka cluster is a group of brokers working together. Each broker is a separate server with its own id. To clients, the whole group behaves like one Kafka.',
        observe: 'Three brokers appear inside one cluster boundary.',
        focus: v => v.brokers.slice(0, 3),
        async run(s, v) {
          await s.show(v.frame, 300);
          for (const b of v.brokers.slice(0, 3)) { await s.show(b, 150); await s.pop(b, 280); }
        },
      },
      {
        title: 'A topic\'s partitions are spread out',
        text: 'When you create a topic, Kafka places its partitions on different brokers. Here orders-0 goes to Broker 1, orders-1 to Broker 2 and orders-2 to Broker 3.',
        observe: 'Each partition lands on a different broker.',
        focus: v => v.chips,
        async run(s, v) {
          await s.show(v.topic, 300);
          v.chips = [0, 1, 2].map(p => chip(s, v.brokers[p], `orders-${p}`, PC[p]));
          for (const c of v.chips) await place(s, [590, 40], c);
        },
      },
      {
        title: 'The work is shared',
        text: 'A producer writes to all three partitions at once, and each broker handles only its share. Add partitions and brokers, and the cluster handles more traffic.',
        observe: 'Records go to all three brokers in parallel. Each counter grows by the same amount.',
        focus: v => v.brokers.slice(0, 3),
        async run(s, v) {
          await s.show(v.producer, 300);
          for (let round = 0; round < 3; round++) {
            await Promise.all(v.chips.map(async (c, p) => {
              await fly(s, [200, 150], abs(s, c), PC[p], '', 600);
              c.count.textContent = ++c.n;
            }));
          }
        },
      },
      {
        title: 'Clients talk to every broker',
        text: 'A consumer reading the topic fetches each partition from the broker that holds it. Clients learn this map from any broker (the metadata request from the Broker lesson).',
        observe: 'Records come back to the consumer from all three brokers.',
        focus: v => [v.consumer],
        async run(s, v) {
          await s.show(v.consumer, 300);
          await Promise.all(v.chips.map(async (c, p) => {
            for (let k = 0; k < 2; k++) await fly(s, abs(s, c), [200, 300], PC[p], '', 550);
          }));
          await s.pulse(v.consumer);
        },
      },
      {
        title: 'One broker is also the controller',
        text: 'One node acts as the controller. It tracks which brokers are alive, using their regular heartbeats, and decides which broker leads each partition. In modern Kafka (KRaft) this is a small group of controller nodes; here Broker 1 plays the role.',
        observe: 'Broker 2 and Broker 3 send heartbeats to the controller.',
        focus: v => [v.ctrl],
        async run(s, v) {
          v.ctrl = controllerBadge(s, v.brokers[0]);
          await s.pop(v.ctrl, 300);
          for (let k = 0; k < 2; k++) await Promise.all([1, 2].map(i => heartbeat(s, v.brokers[i], v.ctrl)));
        },
      },
      {
        title: 'When a broker stops, the controller notices',
        text: 'Broker 2 crashes, so its heartbeats stop. The controller marks it dead. Its partition orders-1 has no other copy, so it is offline: nobody can write or read it until Broker 2 returns.',
        observe: 'Only Broker 3 still sends heartbeats. orders-1 turns red.',
        focus: v => [v.chips[1]],
        async run(s, v) {
          setOnline(v.brokers[1], false);
          await s.shake(v.brokers[1]);
          await heartbeat(s, v.brokers[2], v.ctrl);
          markChips(v.brokers[1]);
          v.offline = s.text(v.chips[1], 0, 30, 'offline', { 'font-size': 13, 'font-weight': 700, fill: RED });
          await s.pulse(v.chips[1]);
        },
      },
      {
        title: 'Adding a broker does not move data',
        text: 'Broker 2 is back, and a new Broker 4 joins. Existing partitions stay where they are: Kafka never moves data on its own. New partitions can land on Broker 4; moving existing ones needs a partition reassignment.',
        observe: 'Broker 4 joins empty. Only the new payments topic uses it.',
        focus: v => [v.brokers[3]],
        async run(s, v) {
          setOnline(v.brokers[1], true);
          markChips(v.brokers[1]);
          v.offline.remove();
          await s.pulse(v.brokers[1]);
          const b4 = v.brokers[3];
          await s.show(b4, 150);
          await s.pop(b4, 300);
          v.topic.textContent = 'topic: payments · 2 partitions';
          await s.pulse(v.topic);
          await place(s, [590, 40], chip(s, b4, 'payments-0', TOPIC_COLORS[1]));
          await place(s, [590, 40], chip(s, v.brokers[0], 'payments-1', TOPIC_COLORS[1]));
        },
      },
    ],
  },
  tryIt: {
    intro: 'Create topics and watch where their partitions go. Then stop a broker, or add Broker 4 and create another topic.',
    observe: 'Partitions spread across the brokers that are online. Stopping a broker takes its partitions offline; adding one moves nothing that already exists.',
    controls: [
      { type: 'button', label: '+ Create topic (3 partitions)', primary: true, run: 'create' },
      { type: 'button', label: '+ Add Broker 4', run: 'add', once: true },
      { type: 'choice', name: 'broker', label: 'Broker', options: ['1', '2', '3', '4'] },
      { type: 'button', label: 'Stop / start that broker', run: 'toggle' },
    ],
    build(s) {
      const v = { topics: [], message: 'Three brokers are online. Create a topic.' };
      frame(s);
      v.brokers = brokers(s);
      v.brokers.forEach((b, i) => { b.added = i < 3; if (!b.added) b.setAttribute('opacity', 0); });
      v.slot4 = s.box(SLOT_X[3], BY, BW, BH, 'room for', { sub: 'Broker 4', stroke: '#c9ced2', dash: '6 5', color: MUTED, size: 14, subSize: 14, weight: 500, rx: 10 });
      v.ctrlAt = 0;
      v.ctrl = controllerBadge(s, v.brokers[0]);
      v.label = s.note(590, 28, '', { 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
      return v;
    },
    async create(s, v) {
      if (v.topics.length >= TOPICS.length) { v.message = 'The sandbox has room for four topics. Switch tabs and back to start again.'; return; }
      const online = v.brokers.filter(b => b.added && b.online);
      if (!online.length) { v.message = 'No broker is online, so the topic cannot be created.'; return; }
      const k = v.topics.length, name = TOPICS[k], start = k % online.length;
      const targets = [0, 1, 2].map(p => online[(start + p) % online.length]);
      const full = targets.find(b => b.chips.length + targets.filter(t => t === b).length > 4);
      if (full) { v.message = `${full.name} has no room left in this sandbox. Start or add a broker first.`; return; }
      v.label.textContent = `topic: ${name} · 3 partitions`;
      await s.pulse(v.label);
      const parts = [];
      for (const [p, b] of targets.entries()) { const c = chip(s, b, `${name}-${p}`, TOPIC_COLORS[k]); await place(s, [590, 40], c, 450); parts.push(`${name}-${p} → ${b.name}`); }
      v.topics.push(name);
      v.message = `Created ${name}: ${parts.join(', ')}.`;
    },
    async add(s, v) {
      const b = v.brokers[3];
      await s.fade(v.slot4, 0, 200);
      v.slot4.remove();
      b.added = true;
      await s.show(b, 150);
      await s.pop(b, 300);
      v.message = 'Broker 4 joined with no partitions. Nothing moved to it. Create a topic to see new partitions use it.';
    },
    async toggle(s, v, input) {
      const b = v.brokers[+input.broker - 1];
      if (!b.added) { v.message = 'Broker 4 has not joined yet. Add it first.'; return; }
      setOnline(b, !b.online);
      markChips(b);
      await (b.online ? s.pulse(b) : s.shake(b));
      const parts = b.chips.map(c => c.name).join(', ') || 'none';
      v.message = b.online ? `${b.name} is back. Its partitions (${parts}) are available again; their data was kept on disk.`
        : `${b.name} stopped. Its partitions (${parts}) are offline: with no copy on another broker, nobody can read or write them.`;
      // If the controller stopped, the role moves to the lowest-numbered broker still online (none: no controller).
      if (v.ctrlAt !== null && v.brokers[v.ctrlAt].online) return;
      const next = v.brokers.find(x => x.added && x.online);
      v.ctrl?.remove();
      v.ctrl = null;
      v.ctrlAt = next ? next.idx : null;
      if (!next) { v.message += ' No broker is online, so there is no controller.'; return; }
      v.ctrl = controllerBadge(s, next);
      await s.pop(v.ctrl, 300);
      v.message += ` The controller role moved to ${next.name}.`;
    },
    readout: v => {
      const live = v.brokers.filter(b => b.added && b.online), down = v.brokers.filter(b => b.added && !b.online);
      const offline = down.flatMap(b => b.chips.map(c => c.name));
      return `Online: <b>${live.map(b => b.idx + 1).join(', ') || 'none'}</b>${down.length ? ` · Down: <b style="color:${RED}">${down.map(b => b.idx + 1).join(', ')}</b>` : ''} · Controller: ${v.ctrlAt === null ? 'none' : `Broker ${v.ctrlAt + 1}`}`
        + `<br>Offline partitions: ${offline.length ? `<b style="color:${RED}">${offline.join(', ')}</b>` : 'none'}<br>${v.message}`;
    },
  },
  deeper: {
    note: 'The controller quorum (KRaft) and the metadata log.',
    build(s) {
      const v = {};
      v.ctrls = [300, 530, 760].map((x, i) => {
        const c = s.box(x, 95, 200, 72, `Controller ${i + 1}`, { sub: i ? 'follower' : 'active', size: 17, subSize: 13, stroke: i ? '#babdbe' : '#e3b341', fill: i ? '#fff' : '#fff8e6', rx: 10 });
        c.log = s.g(x, 168);
        el('rect', { x: -100, y: -18, width: 200, height: 36, rx: 6, fill: '#f6f7fb', stroke: '#d9d9d9' }, c.log);
        c.log.entries = 0;
        return c;
      });
      s.text(s.root, 180, 168, 'metadata log', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });
      v.brokers = [230, 420, 610, 800].map((x, i) => s.box(x, 380, 160, 60, `Broker ${i + 1}`, { size: 16 }));
      v.list = s.g(120, 250);
      return v;
    },
    steps: [
      {
        title: 'Controllers keep the cluster\'s metadata',
        text: 'In KRaft mode a few controller nodes (usually three) store every cluster change in a metadata log: brokers joining, topics created, partition leaders chosen. The active controller writes each change and the others copy it.',
        observe: 'Each change is appended to the active controller\'s log, then copied to the other two.',
        focus: v => v.ctrls.map(c => c.log),
        async run(s, v) {
          const changes = ['broker 4 registered', 'topic orders created', 'orders-1 leader = 2'];
          for (const [k, change] of changes.entries()) {
            s.text(v.list, 0, k * 24, `${k + 1}  ${change}`, { 'text-anchor': 'start', 'font-size': 13, 'font-family': 'Consolas, monospace', fill: '#3d4a55' });
            await entry(s, v, 0, [1, 2]);
          }
        },
      },
      {
        title: 'Brokers follow the metadata log',
        text: 'Brokers keep fetching the latest metadata from the controllers, so every broker learns about new topics and leader changes within moments. That is how a client can ask any broker for the map.',
        observe: 'Updates flow from the active controller down to every broker.',
        focus: v => v.brokers,
        async run(s, v) {
          await Promise.all(v.brokers.map(async (b, i) => {
            await s.wait(i * 120);
            const dot = s.block(300, 190, '', '#e3b341', { w: 12, h: 12 });
            await s.move(dot, b._x, b._y - 30, 650);
            dot.remove();
            await s.pulse(b);
          }));
        },
      },
      {
        title: 'If the active controller fails, another takes over',
        text: 'Controller 1 stops. The remaining two are still a majority (2 of 3), so they elect a new active controller and the cluster keeps working. With three controllers, Kafka survives losing one.',
        observe: 'Controller 2 becomes active and writes change 4, copied to Controller 3.',
        focus: v => [v.ctrls[1]],
        async run(s, v) {
          const [c1, c2] = v.ctrls;
          c1.rect.setAttribute('stroke', RED); c1.rect.setAttribute('fill', '#fff4f4');
          c1.sub.textContent = 'down'; c1.sub.setAttribute('fill', RED);
          await s.shake(c1);
          c2.rect.setAttribute('stroke', '#e3b341'); c2.rect.setAttribute('fill', '#fff8e6');
          c2.sub.textContent = 'active';
          await s.pulse(c2);
          s.text(v.list, 0, 3 * 24, '4  topic payments created', { 'text-anchor': 'start', 'font-size': 13, 'font-family': 'Consolas, monospace', fill: '#3d4a55' });
          await entry(s, v, 1, [2]);
        },
      },
    ],
  },
  takeaway: 'A cluster is a group of brokers that acts as one Kafka. Partitions are spread across brokers to share the work, a controller tracks live brokers and partition leaders, and adding a broker moves no existing data.',
  recap: {
    points: [
      'A cluster is several brokers, each with its own id, that clients see as one Kafka.',
      'A topic\'s partitions are spread across brokers, so reads and writes are shared.',
      'The controller tracks which brokers are alive (heartbeats) and picks partition leaders. In KRaft it is a small quorum of controller nodes.',
      'Without replication, a stopped broker takes its partitions offline.',
      'A new broker starts empty; existing partitions move only through a reassignment.',
    ],
    interview: [
      { q: 'Why does Kafka run as a cluster?', a: 'For **scale** and **availability**. Partitions are spread across brokers, so many machines share the reads and writes. With **replication** (next lesson), copies on other brokers keep partitions available when one broker fails.' },
      { q: 'What does the controller do?', a: 'It is the cluster\'s brain: it tracks **which brokers are alive**, chooses the **leader of each partition**, and records topic and partition changes. In **KRaft** mode a quorum of controllers (usually 3) keeps this in a replicated **metadata log**; older clusters used **ZooKeeper** for this.' },
      { q: 'You add a broker. Does the load rebalance?', a: '**Not by itself.** Existing partitions stay where they are; only new partitions may be placed on the new broker. To move load, run a **partition reassignment** (kafka-reassign-partitions or a tool like Cruise Control), which copies data in the background.' },
      { q: 'How many controllers should you run?', a: 'An **odd number, usually 3** (5 for very large clusters). The quorum needs a **majority**: 3 controllers tolerate 1 failure, 5 tolerate 2. An even number adds cost without extra tolerance.' },
    ],
  },
  quiz: {
    q: 'A cluster has 3 brokers and no replication. Broker 2 crashes. What happens to the topic orders (orders-0, -1, -2 on brokers 1, 2, 3)?',
    options: ['The whole topic stops working', 'Only orders-1 is unavailable; orders-0 and orders-2 keep working', 'orders-1 moves to Broker 4 automatically', 'Kafka merges orders-1 into orders-0'],
    answer: 1,
    why: 'Each partition lives on its own broker. Losing Broker 2 takes only its partition offline; the others keep serving. Kafka does not move partitions on its own, and replication is what keeps orders-1 available.',
  },
  related: ['broker', 'replica'],
};

// Append one metadata entry to controller `at`'s log, then copy it to the `to` controllers.
async function entry(s, v, at, to) {
  const c = v.ctrls[at], k = c.log.entries;
  const add = log => { s.block(-80 + log.entries * 32, 0, `${log.entries + 1}`, '#c47d1e', { parent: log, w: 26, h: 22, size: 12 }); log.entries++; };
  add(c.log);
  await s.pulse(c.log);
  await Promise.all(to.map(async i => {
    const t = v.ctrls[i].log;
    await fly(s, [c.log._x - 80 + k * 32, c.log._y], [t._x - 80 + t.entries * 32, t._y], '#c47d1e', `${k + 1}`, 500);
    add(t);
  }));
}
