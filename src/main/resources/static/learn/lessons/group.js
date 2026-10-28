// Lesson 10: consumer groups, consumers that share a group.id split a topic's partitions between them.
import { PARTITION_COLORS as PC } from '../scene.js';
import { abs, lane, addBlock, slot, fly, RED, GREEN, AMBER, MUTED } from './kit.js';

const LANE_X = 185, LANE_W = 250, LANE_R = LANE_X + LANE_W / 2;
const LANE_Y = { 3: [90, 165, 240], 4: [80, 145, 210, 275] };
const CX = 600, CW = 220, CH = 44, SLOT_Y = [90, 145, 200, 255];
const NAMES = ['A', 'B', 'C', 'D'];
const PURPLE = '#7a4aa3', HEART = '#e07a8a';
const COORD = [855, 165];

// A consumer instance: name on the left, the partitions it owns as coloured chips on the right.
function consumer(s, x, y, name, { w = CW, parent = s.root } = {}) {
  const c = s.box(x, y, w, CH, '', { parent, stroke: '#203347', rx: 8 });
  c.title = s.text(c, -w / 2 + 12, 0, `Consumer ${name}`, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: '#203347' });
  c.chips = s.g(0, 0, c);
  c.idle = s.text(c, w / 2 - 12, 0, 'idle', { 'text-anchor': 'end', 'font-size': 14, 'font-style': 'italic', fill: MUTED });
  Object.assign(c, { name, w, owns: [], online: true, read: 0 });
  setOwns(s, c, []);
  return c;
}
function setOwns(s, c, parts) {
  c.owns = parts;
  c.chips.replaceChildren();
  parts.forEach((p, k) => s.block(c.w / 2 - 29 - (parts.length - 1 - k) * 38, 0, `P${p}`, PC[p], { parent: c.chips, w: 34, h: 24, size: 12 }));
  c.idle.setAttribute('opacity', c.online && !parts.length ? 1 : 0);
}
function crash(c, label = 'crashed') {
  c.online = false;
  c.rect.setAttribute('stroke', RED); c.rect.setAttribute('fill', '#fff4f4'); c.rect.setAttribute('stroke-dasharray', '5 4');
  c.title.textContent = `Consumer ${c.name} ✕ ${label}`; c.title.setAttribute('fill', RED);
}
// Range-style assignment (the classic default): members in order, each gets a contiguous run of partitions.
function ranges(n, P) {
  const per = Math.floor(P / n), extra = P % n;
  return Array.from({ length: n }, (_, i) => {
    const start = i * per + Math.min(i, extra);
    return Array.from({ length: per + (i < extra ? 1 : 0) }, (_, k) => start + k);
  });
}
// Rebalance: give every partition to one member and draw a line from the partition to its owner.
async function assign(s, v, members, ms = 450) {
  const plan = members.length ? ranges(members.length, v.P) : [];
  for (const l of v.links) l?.remove();
  v.links = []; v.owner = [];
  members.forEach((c, i) => {
    setOwns(s, c, plan[i]);
    for (const p of plan[i]) {
      v.owner[p] = c;
      v.links[p] = s.line(LANE_R + 2, v.laneY[p], CX - CW / 2 - 4, c._y, { parent: v.linkLayer, stroke: PC[p], width: 2.5 });
    }
  });
  await Promise.all(v.links.filter(Boolean).map(l => s.draw(l, ms)));
}
// Each partition's owner reads its records in order (one flight at a time per partition, partitions in parallel).
async function read(s, v, from = 0, ms = 380, also = null) {
  await Promise.all(v.lanes.map(async (l, p) => {
    for (let i = from; i < l.blocks.length; i++) {
      const c = v.owner[p], to = [];
      if (c) to.push([CX - CW / 2 + 20, c._y]);
      if (also) { const [x, y] = abs(s, also); to.push([x - also.w / 2 + 20, y]); }
      await Promise.all(to.map(t => fly(s, slot(s, l, i), t, l.color, `${i}`, ms)));
      if (c) c.read++;
    }
  }));
}
async function produce(s, v) {
  await Promise.all(v.lanes.map(l => s.pop(addBlock(s, l), 220)));
}
async function heartbeats(s, v, members, times = 2) {
  for (let k = 0; k < times; k++) {
    await Promise.all(members.filter(c => c.online).map(async c => {
      const h = s.block(CX + CW / 2 - 4, c._y, '♥', HEART, { w: 18, h: 18, size: 11 });
      await s.move(h, COORD[0] - 85, COORD[1], 450);
      h.remove();
    }));
    await s.pulse(v.coord);
  }
}

// Partitions on the left, the group on the right, the coordinator on the far right; a second group bottom-left.
function scene(s, P = 3, count = 3) {
  const v = { P, laneY: LANE_Y[P], cons: [], links: [], owner: [] };
  v.topic = s.note(LANE_X, 40, `topic orders · ${P} partitions`, { 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
  v.lanes = v.laneY.map((y, p) => lane(s, s.root, LANE_X, y, { name: `orders-${p}`, color: PC[p], w: LANE_W, h: 52, count }));
  v.group = s.box(CX, 165, CW + 40, 250, '', { stroke: '#d8b7e9', rx: 14, fill: '#fcfaff' });
  s.text(v.group, -CW / 2 - 8, -108, 'group.id = billing', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: PURPLE });
  v.linkLayer = s.g(0, 0);
  v.coord = s.box(...COORD, 170, 110, '', { stroke: '#203347', rx: 10 });
  s.text(v.coord, 0, -18, 'Broker 2', { 'font-size': 17, 'font-weight': 700 });
  s.text(v.coord, 0, 6, 'group coordinator', { 'font-size': 13, fill: MUTED });
  v.coordNote = s.text(v.coord, 0, 30, '', { 'font-size': 13, 'font-weight': 650, fill: AMBER });
  v.coord.setAttribute('opacity', 0);
  // Second group: one consumer that reads every partition, fed by a bus down the left edge.
  v.group2 = s.g(0, 0);
  v.group2box = s.box(230, 380, 340, 96, '', { parent: v.group2, stroke: '#d8b7e9', rx: 14, fill: '#fcfaff' });
  s.text(v.group2, 72, 348, 'group.id = analytics', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 650, fill: PURPLE });
  for (const y of v.laneY) s.line(LANE_X - LANE_W / 2, y, 38, y, { parent: v.group2, arrow: false, stroke: '#b9a3cc', width: 2 });
  s.line(38, v.laneY[0], 38, 395, { parent: v.group2, arrow: false, stroke: '#b9a3cc', width: 2 });
  s.line(38, 395, 88, 395, { parent: v.group2, stroke: '#b9a3cc', width: 2 });
  v.x = consumer(s, 230, 395, 'X', { parent: v.group2, w: 276 });
  setOwns(s, v.x, [...Array(P).keys()]);
  v.group2.setAttribute('opacity', 0);
  return v;
}
async function join(s, v, i) {
  const c = consumer(s, CX, SLOT_Y[i], NAMES[i]);
  v.cons[i] = c;
  await s.pop(c, 280);
  return c;
}
const online = v => v.cons.filter(c => c && c.online);

// Go deeper: the same join seen with an eager and a cooperative rebalance.
const PANEL_X = [245, 715], ROW_Y = [118, 178, 238];
function panel(s, x, title, sub) {
  const g = s.g(x, 0);
  g.box = s.box(0, 165, 440, 270, '', { parent: g, stroke: '#c9ced2', rx: 14, fill: '#fafbfc' });
  s.text(g, -204, 52, title, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700 });
  s.text(g, -204, 74, sub, { 'text-anchor': 'start', 'font-size': 13, fill: MUTED, 'font-family': 'Consolas, monospace' });
  g.rows = NAMES.slice(0, 3).map((n, i) => {
    const c = consumer(s, -55, ROW_Y[i], n, { w: 250, parent: g });
    c.status = s.text(g, 88, ROW_Y[i], 'reading', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 650, fill: GREEN });
    return c;
  });
  setOwns(s, g.rows[0], [0, 1]); setOwns(s, g.rows[1], [2, 3]);
  g.rows[2].setAttribute('opacity', 0); g.rows[2].status.setAttribute('opacity', 0);
  return g;
}
function status(c, str, color) { c.status.textContent = str; c.status.setAttribute('fill', color); }

export default {
  id: 'group', n: 10, title: 'Consumer group', tagline: 'Sharing partitions between instances',
  guide: {
    what: 'Consumers that use the same group.id form a consumer group. The group splits the topic\'s partitions between its members, so several instances of one app share the work without reading any record twice.',
    fits: 'You have seen one consumer read a topic. Here many instances share it. Next: commits and lag, how a group remembers where it is.',
  },
  watch: {
    build: s => scene(s),
    steps: [
      {
        title: 'A group of one',
        text: 'Consumer A starts with group.id = "billing". It is the only member of that group, so it is given all three partitions of orders and reads every record.',
        observe: 'All three partitions are linked to Consumer A, and their records flow to it.',
        focus: v => [v.cons[0]],
        async run(s, v) {
          const a = await join(s, v, 0);
          await assign(s, v, [a]);
          await read(s, v, 0, 320);
        },
      },
      {
        title: 'A second member joins',
        text: 'Consumer B starts with the same group.id, so it joins the same group. The group splits the partitions: A keeps orders-0 and orders-1, B takes orders-2. A member can own several partitions.',
        observe: 'One link moves from A to B; A still owns two partitions.',
        focus: v => [v.cons[0], v.cons[1]],
        async run(s, v) {
          await join(s, v, 1);
          await assign(s, v, online(v));
        },
      },
      {
        title: 'One reader per partition',
        text: 'Within a group, each partition is read by exactly one member at a time. So the records of a partition are handled by one consumer, in order. Different partitions are read in parallel by different members.',
        observe: 'New records flow down each link, in order, to that partition\'s one owner.',
        focus: v => v.links.filter(Boolean),
        async run(s, v) {
          await produce(s, v);
          await read(s, v, 3, 420);
        },
      },
      {
        title: 'Scale out, up to the partition count',
        text: 'Consumer C joins and each member now owns one partition: the work is spread three ways. Then D joins, but there are only three partitions, so D gets none and sits idle, ready to step in.',
        observe: 'C takes a partition; D joins and stays idle.',
        focus: v => [v.cons[2], v.cons[3]],
        async run(s, v) {
          await join(s, v, 2);
          await assign(s, v, online(v));
          await produce(s, v);
          await read(s, v, 4, 380);
          await join(s, v, 3);
          await assign(s, v, online(v), 250);
        },
      },
      {
        title: 'The group coordinator',
        text: 'One broker acts as the group\'s coordinator. Every member sends it regular heartbeats to say it is alive. Members join and leave through it, and it starts a rebalance whenever membership changes.',
        observe: 'Heartbeats (♥) travel from every member to Broker 2.',
        focus: v => [v.coord],
        async run(s, v) {
          await s.show(v.coord, 300);
          await heartbeats(s, v, online(v));
        },
      },
      {
        title: 'A member crashes: rebalance',
        text: 'Consumer B crashes and its heartbeats stop. After session.timeout.ms (45 s by default) the coordinator removes it and runs a rebalance: the partitions are shared again among A, C and D, so no partition is left unread.',
        observe: 'B turns red, the links are redrawn, and the idle D now has work.',
        focus: v => [v.group],
        async run(s, v) {
          const b = v.cons[1];
          crash(b);
          for (const p of b.owns) { v.links[p]?.remove(); v.links[p] = null; v.owner[p] = null; }
          setOwns(s, b, []);
          await s.shake(b);
          await heartbeats(s, v, online(v), 1);
          v.coordNote.textContent = 'rebalance';
          await assign(s, v, online(v));
          await produce(s, v);
          await read(s, v, 5, 380);
        },
      },
      {
        title: 'Another group reads everything again',
        text: 'A consumer with a different group.id, say "analytics", is a separate group. It gets every record of the topic again and keeps its own place, without taking anything from billing. The Multiple groups lesson goes deeper.',
        observe: 'Each new record goes to its billing owner and also to Consumer X.',
        focus: v => [v.group2box],
        async run(s, v) {
          v.coordNote.textContent = '';
          await s.show(v.group2, 400);
          await produce(s, v);
          await read(s, v, 6, 450, v.x);
        },
      },
    ],
  },
  tryIt: {
    intro: 'Add and stop consumers in group billing, send records, and add a second group. Try 4 consumers with 3 partitions.',
    observe: 'Every partition has exactly one owner in the group. Members beyond the partition count stay idle, and a second group gets every record again.',
    controls: [
      { type: 'choice', name: 'parts', label: 'Partitions', options: ['3', '4'], rebuild: true },
      { type: 'button', label: '+ Add consumer', primary: true, run: 'add' },
      { type: 'button', label: 'Stop newest consumer', run: 'remove' },
      { type: 'button', label: 'Send records', run: 'send' },
      { type: 'button', label: '+ Add group analytics', run: 'group', once: true },
    ],
    build(s, input) {
      const v = scene(s, +input.parts, 0);
      v.coord.setAttribute('opacity', 1);
      v.second = false;
      v.message = 'The group is empty. Add a consumer.';
      return v;
    },
    async add(s, v) {
      const members = online(v);
      if (members.length >= 4) { v.message = 'This sandbox holds four consumers. Stop one first.'; return; }
      const c = await join(s, v, members.length);
      await s.pulse(v.coord);
      await assign(s, v, online(v));
      const n = online(v).length;
      v.message = c.owns.length
        ? `Consumer ${c.name} joined and the group rebalanced. ${n === 1 ? 'It is alone, so it owns every partition.' : `The ${v.P} partitions are now shared by ${n} members.`}`
        : `Consumer ${c.name} joined, but there are only ${v.P} partitions, so it gets none and stays idle as a standby.`;
    },
    async remove(s, v) {
      const members = online(v);
      if (!members.length) { v.message = 'There is no consumer to stop.'; return; }
      const c = members.at(-1), had = c.owns;
      crash(c, 'stopped');
      setOwns(s, c, []);
      await s.shake(c);
      await s.fade(c, 0, 300);
      c.remove();
      v.cons[members.length - 1] = null;
      await s.pulse(v.coord);
      await assign(s, v, online(v));
      const left = online(v);
      v.message = !left.length ? `Consumer ${c.name} stopped. Billing has no members, so nobody in billing reads; new records simply wait in the log.`
        : had.length ? `Consumer ${c.name} stopped. ${had.length > 1 ? 'Its partitions' : 'Its partition'} (${had.map(p => `P${p}`).join(', ')}) ${had.length > 1 ? 'were' : 'was'} handed to the others in a rebalance.`
          : `Consumer ${c.name} stopped. It was idle, so no partition changed owner.`;
    },
    async send(s, v) {
      if (v.lanes.some(l => l.blocks.length >= 8)) { v.message = 'The partitions are full in this sandbox. Change the partition count to start again.'; return; }
      const from = v.lanes[0].blocks.length;
      await produce(s, v);
      await read(s, v, from, 450, v.second ? v.x : null);
      const members = online(v);
      v.message = !members.length ? `${v.P} records written. Billing has no members, so for billing they wait in the log${v.second ? '; Consumer X in analytics still read them' : ''}.`
        : `One record per partition, each read by its one owner in billing${v.second ? ', and every record also by Consumer X in analytics' : ''}.`;
    },
    async group(s, v) {
      v.second = true;
      await s.show(v.group2, 400);
      v.message = 'Group analytics has one member, Consumer X, so it owns every partition. It reads independently of billing. Send records to see both groups get them.';
    },
    readout: v => {
      const members = online(v);
      const who = members.length ? members.map(c => c.owns.length ? `<b>${c.name}</b> ← ${c.owns.map(p => `P${p}`).join(', ')}` : `<b>${c.name}</b> <span style="color:${MUTED}">idle</span>`).join(' · ') : '<span style="color:' + RED + '">no members</span>';
      return `billing: ${who}${v.second ? ' · analytics: <b>X</b> ← all' : ''}<br>${v.message}`;
    },
  },
  deeper: {
    note: 'Two ways to rebalance, and how a quick restart can skip one.',
    build(s) {
      return {
        eager: panel(s, PANEL_X[0], 'Eager rebalance', 'RangeAssignor, RoundRobinAssignor'),
        coop: panel(s, PANEL_X[1], 'Cooperative rebalance', 'CooperativeStickyAssignor'),
      };
    },
    steps: [
      {
        title: 'Eager: everyone stops',
        text: 'With an eager assignor such as RangeAssignor, a rebalance starts with every member giving up all its partitions. Nobody reads until the new plan arrives, even for partitions that end up with the same owner.',
        observe: 'C joins; A and B drop all their partitions and pause, then the new plan is handed out.',
        focus: v => [v.eager.box],
        async run(s, v) {
          const [a, b, c] = v.eager.rows;
          await s.show(c, 300);
          c.status.setAttribute('opacity', 1); status(c, 'joining', AMBER);
          for (const m of [a, b]) { setOwns(s, m, []); m.idle.setAttribute('opacity', 0); status(m, 'paused', RED); }
          await s.shake(v.eager.box);
          await s.wait(600);
          setOwns(s, a, [0, 1]); setOwns(s, b, [2]); setOwns(s, c, [3]);
          for (const m of [a, b, c]) status(m, 'reading', GREEN);
          await Promise.all([a, b, c].map(m => s.pulse(m.chips)));
        },
      },
      {
        title: 'Cooperative: only what moves',
        text: 'With cooperative (incremental) rebalancing, members keep the partitions they will still own and keep reading. Only P3 moves from B to C. The new consumer protocol in Kafka 4.0 (group.protocol=consumer) also rebalances this way.',
        observe: 'A never stops; B gives up only P3, which goes to C.',
        focus: v => [v.coop.box],
        async run(s, v) {
          const [a, b, c] = v.coop.rows;
          await s.show(c, 300);
          c.status.setAttribute('opacity', 1); status(c, 'joining', AMBER);
          status(b, 'gives up P3', AMBER);
          await s.wait(300);
          setOwns(s, b, [2]);
          await s.wait(300);
          setOwns(s, c, [3]);
          status(b, 'reading', GREEN); status(c, 'reading', GREEN);
          await s.pulse(c.chips);
        },
      },
      {
        title: 'Static membership skips the rebalance',
        text: 'Give each instance a fixed group.instance.id. If it restarts and is back within session.timeout.ms, it keeps its partitions and no rebalance happens; they just wait for it. Handy for rolling restarts.',
        observe: 'B restarts; nobody else changes, and B comes back to the same P2.',
        focus: v => [v.coop.rows[1]],
        async run(s, v) {
          const b = v.coop.rows[1];
          b.title.textContent = 'Consumer B restarting'; b.title.setAttribute('fill', MUTED);
          b.rect.setAttribute('stroke-dasharray', '5 4');
          b.chips.setAttribute('opacity', .4);
          status(b, 'P2 waits', AMBER);
          await s.wait(900);
          b.title.textContent = 'Consumer B'; b.title.setAttribute('fill', '#203347');
          b.rect.removeAttribute('stroke-dasharray');
          b.chips.setAttribute('opacity', 1);
          status(b, 'reading', GREEN);
          await s.pulse(b);
        },
      },
    ],
  },
  takeaway: 'Consumers with the same group.id share a topic: each partition goes to exactly one member, members beyond the partition count stay idle, and when a member leaves or crashes a rebalance hands its partitions to the others. A different group.id reads everything again.',
  recap: {
    points: [
      'Consumers with the same group.id form one consumer group.',
      'Each partition is read by exactly one member of the group, so order within a partition is kept; one member can own several.',
      'More members spread the work, up to the number of partitions; extra members are idle.',
      'When a member joins, leaves or crashes, a rebalance shares the partitions again.',
      'One broker is the group coordinator and tracks members through heartbeats.',
      'A different group.id is a separate group that gets every record again.',
    ],
    interview: [
      { q: 'What is a consumer group?', a: 'A set of consumers sharing a **group.id**. The topic\'s partitions are **divided among the members**: each partition is assigned to **exactly one** member, while one member can own several. This lets several instances of an app share the load without processing a record twice.' },
      { q: 'What happens if a group has more consumers than partitions?', a: 'The extra consumers get **no partitions and sit idle**. The **partition count caps the parallelism** of one group. Idle members are still useful as **standbys**: they take over in the next rebalance if a member fails.' },
      { q: 'What is a rebalance and when does it happen?', a: 'A **rebalance** redistributes partitions among the members. It happens when a member **joins**, **leaves**, or is considered dead (no **heartbeats** within **session.timeout.ms**, or no poll within **max.poll.interval.ms**), and when the topic\'s partitions change. The **group coordinator** broker runs it.' },
      { q: 'How do two applications both read every record of a topic?', a: 'Give them **different group.ids**. Each group is **independent**: it gets all partitions, keeps its **own committed offsets**, and reads at its own pace. Within one group records are shared; across groups they are copied.' },
    ],
  },
  quiz: {
    q: 'A topic has 4 partitions. Group billing runs 6 consumers. How many consumers are reading?',
    options: ['6, each reading part of every partition', '4, and 2 are idle', '1, the others wait for it', '6, two of them reading the same partition'],
    answer: 1,
    why: 'Within a group each partition has exactly one owner, so at most 4 members can have work. The other 2 stay idle until a rebalance gives them a partition.',
  },
  related: ['consumer', 'partition'],
};
