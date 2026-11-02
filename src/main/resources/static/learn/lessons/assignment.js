// Level 2 · Link 5: partition assignment. How a group turns "members + subscribed partitions" into "who reads what":
// the JoinGroup / SyncGroup protocol (the leader consumer runs the assignor), the built-in assignors, idle members.
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { BLUE, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';
import { groupScene, assign, coord, coordText, state, members, showConsumer, hideConsumer, wiresOn, range, roundRobin, sticky, ASSIGNORS, CNAME } from './groupmap.js';

const LINES = v => v.lanes.map((_, k) => `l${k}`);
const join = (s, v, ids, label = 'JoinGroup') => Promise.all(ids.map(i => packet(s, v, `c${i}-co`, label, BLUE, { ms: 800 })));
const reply = (s, v, i, label, color = GREEN) => packet(s, v, `co-c${i}`, label, color, { ms: 800 });
const counts = (v, owner) => v.cons.filter(c => c.inGroup).map(c => `${CNAME[c.i]} ${Object.values(owner).filter(x => x === c.i).length}`).join(' · ');
// Put members straight into the group (for flows that start after the join).
function joined(v, ids, gen = 1) { for (const i of ids) { v.cons[i].inGroup = true; v.cons[i].state.textContent = 'in the group'; } v.cons[ids[0]].badge.textContent = 'group leader'; v.gen = gen; coordText(v); }

// ---- flow 1: the protocol ----
const P = {
  start: {
    phase: 'Joining', on: ['c0', 'c1'],
    title: 'Two consumers start with the same group.id',
    text: 'C1 and C2 both run with group.id=orders-app and subscribe(orders). orders has 6 partitions. Neither knows yet which partitions it will read: the group decides that together.',
    observe: 'C1 and C2 show "subscribed · no partitions".',
    async run(s, v) { await Promise.all([0, 1].map(i => state(s, v.cons[i], 'subscribed · no partitions'))); },
  },
  find: {
    phase: 'Joining', on: ['c0', 'c1', 'coord'], wires: ['c0-co', 'c1-co'],
    title: 'Find the group coordinator',
    text: 'Each consumer asks any broker: who coordinates orders-app? The answer is the leader of the __consumer_offsets partition that the group id hashes to (hash(group.id) % 50): here broker B2. All group traffic goes there.',
    observe: 'FindCoordinator from both; the coordinator box lights up.',
    async run(s, v) { await join(s, v, [0, 1], 'FindCoordinator'); hit(v, 'coord'); },
  },
  join: {
    phase: 'Joining', on: ['c0', 'c1', 'coord'], wires: ['c0-co', 'c1-co'],
    title: 'JoinGroup from every member',
    text: 'Each consumer sends JoinGroup with the topics it subscribes to and the assignors it supports, in order of preference (by default range, then cooperative-sticky).',
    observe: 'JoinGroup from C1 and C2; both say "joining…".',
    async run(s, v) {
      await Promise.all([0, 1].map(i => state(s, v.cons[i], 'joining…', AMBER)));
      await join(s, v, [0, 1]);
      await coord(s, v, 'orders-app · collecting members: C1, C2', AMBER);
    },
  },
  leader: {
    phase: 'Joining', on: ['coord', 'c0'],
    title: 'The coordinator opens generation 1 and picks a leader',
    text: 'The coordinator waits until the known members have joined (new groups wait group.initial.rebalance.delay.ms, 3 s, for more to arrive). It starts generation 1, picks an assignor all members support (range), and makes the first member to join, C1, the group leader.',
    observe: 'Coordinator: generation 1, members C1, C2.',
    async run(s, v) { v.gen = 1; for (const i of [0, 1]) v.cons[i].inGroup = true; await coord(s, v, undefined, BLUE); },
  },
  joinRes: {
    phase: 'Joining', on: ['coord', 'c0', 'c1'], wires: ['co-c0', 'co-c1'],
    title: 'Only the leader gets the member list',
    text: 'The JoinGroup responses differ: the leader receives every member with its subscriptions; the other members only get their own member id and the generation. The broker itself does not decide the assignment.',
    observe: 'C1 gets "you lead · members C1, C2"; C2 just its id. C1 shows "group leader".',
    async run(s, v) {
      await Promise.all([reply(s, v, 0, 'you lead · C1, C2'), reply(s, v, 1, 'member id · gen 1')]);
      v.cons[0].badge.textContent = 'group leader';
      await Promise.all([state(s, v.cons[0], 'leader: computing plan', AMBER), state(s, v.cons[1], 'waiting for its partitions', AMBER)]);
    },
  },
  plan: {
    phase: 'Assigning', on: ['c0'],
    title: 'The leader consumer runs the assignor',
    text: 'C1 runs the range assignor in its own process: 6 partitions over 2 members gives 3 each, in order: C1 gets orders-0 to 2, C2 gets orders-3 to 5. Running it on a client means you can plug in your own assignor without touching the brokers.',
    observe: 'C1 shows the plan: C1 P0–P2, C2 P3–P5.',
    async run(s, v) { v.plan = range(v, [0, 1]); await state(s, v.cons[0], 'plan: C1 P0–P2 · C2 P3–P5', BLUE); },
  },
  sync: {
    phase: 'Assigning', on: ['c0', 'c1', 'coord'], wires: ['c0-co', 'c1-co'],
    title: 'SyncGroup: the leader hands in the plan',
    text: 'Every member sends SyncGroup. The leader\'s carries the whole plan; the others\' are empty, they just wait for their share.',
    observe: 'SyncGroup(plan) from C1, an empty SyncGroup from C2.',
    async run(s, v) { await Promise.all([packet(s, v, 'c0-co', 'SyncGroup(plan)', BLUE, { ms: 800 }), packet(s, v, 'c1-co', 'SyncGroup()', BLUE, { ms: 800 })]); hit(v, 'coord'); },
  },
  syncRes: {
    phase: 'Assigning', on: ['coord', 'c0', 'c1', ...['l0', 'l1', 'l2', 'l3', 'l4', 'l5']], wires: ['co-c0', 'co-c1'],
    title: 'Each member gets its own partitions',
    text: 'The coordinator sends each member only its part of the plan. Now every partition of orders has exactly one owner in the group, and the lines show who reads what.',
    observe: 'Lines connect orders-0..2 to C1 and orders-3..5 to C2.',
    async run(s, v) {
      await Promise.all([reply(s, v, 0, 'P0 P1 P2'), reply(s, v, 1, 'P3 P4 P5')]);
      await assign(s, v, v.plan ?? range(v, [0, 1]));
      await Promise.all([0, 1].map(i => state(s, v.cons[i], 'assigned', GREEN)));
    },
  },
  fetch: {
    phase: 'Consuming', on: ['c0', 'c1', 'coord'], wires: ['c0-co', 'c1-co'],
    title: 'Where to start: the committed offsets',
    text: 'Each consumer asks the coordinator for the group\'s committed offsets of its new partitions (OffsetFetch), then starts fetching from the partition leaders from there. With no commit yet, auto.offset.reset decides.',
    observe: 'OffsetFetch from both; they turn to "consuming".',
    async run(s, v) {
      await join(s, v, [0, 1], 'OffsetFetch');
      await Promise.all([0, 1].map(i => state(s, v.cons[i], 'consuming', GREEN)));
    },
  },
  beat: {
    phase: 'Consuming', on: ['c0', 'c1', 'coord'], wires: ['c0-co', 'c1-co'],
    title: 'Heartbeats keep the assignment alive',
    text: 'From now on each member heartbeats the coordinator every heartbeat.interval.ms (3 s). If one stops for session.timeout.ms (45 s), or joins or leaves, the coordinator starts a new generation: a rebalance, the next lesson.',
    observe: 'Heartbeats from C1 and C2 to the coordinator.',
    async run(s, v) { await join(s, v, [0, 1], 'heartbeat'); hit(v, 'coord'); },
  },
};

// ---- flow 2: range vs round robin (two topics) ----
const two = [{ name: 'orders', n: 3 }, { name: 'payments', n: 3 }];
const ALL6 = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'];
const A = {
  range: {
    phase: 'Range', on: ['c0', 'c1', ...ALL6],
    title: 'Range: each topic is split on its own',
    text: 'The group reads two topics, orders and payments, 3 partitions each. Range handles one topic at a time: 3 partitions over 2 members is 2 + 1, and the first member gets the extra. It does the same for payments.',
    observe: 'C1 gets orders-0, 1 and payments-0, 1; C2 gets orders-2 and payments-2.',
    async run(s, v) { await assign(s, v, range(v, [0, 1])); },
  },
  uneven: {
    phase: 'Range', on: ['c0', 'c1'],
    title: 'The extra partitions add up on C1',
    text: 'C1 has 4 partitions and C2 has 2, because C1 wins the remainder in every topic. With ten such topics it would be 20 against 10. Range is only even when every topic\'s partition count divides by the number of members.',
    observe: 'C1 lists 4 partitions, C2 lists 2.',
    async run(s, v) { await Promise.all([state(s, v.cons[0], 'reads 4 partitions', RED), state(s, v.cons[1], 'reads 2 partitions', MUTED)]); },
  },
  rr: {
    phase: 'Round robin', on: ['c0', 'c1', ...ALL6],
    title: 'Round robin deals all partitions in turn',
    text: 'Round robin lists every partition of every subscribed topic and deals them out one by one: C1, C2, C1, C2… Both members get 3.',
    observe: 'C1: orders-0, orders-2, payments-1; C2: orders-1, payments-0, payments-2.',
    async run(s, v) { await assign(s, v, roundRobin(v, [0, 1])); await Promise.all([0, 1].map(i => state(s, v.cons[i], 'reads 3 partitions', GREEN))); },
  },
  copart: {
    phase: 'Range', on: ['l0', 'l3', 'c0'],
    title: 'Range\'s one advantage: co-partitioning',
    text: 'With range, orders-0 and payments-0 always go to the same member. If both topics use the same key and the same partition count, that member sees both sides of each key, which is what a join (as in Kafka Streams) needs.',
    observe: 'Back to range: orders-0 and payments-0 both belong to C1.',
    async run(s, v) { await assign(s, v, range(v, [0, 1])); await Promise.all([0, 1].map(i => state(s, v.cons[i], 'in the group'))); },
  },
  stickyEv: {
    phase: 'Sticky', on: ['c0', 'c1', ...ALL6],
    title: 'Sticky: balanced, and it remembers',
    text: 'The sticky assignors balance like round robin, and when membership changes they keep as many partitions with their previous owner as possible. cooperative-sticky also lets the move happen without stopping everyone: see Rebalance.',
    observe: 'Starting from range\'s picture, sticky moves just one partition to make it 3 and 3.',
    async run(s, v) { await assign(s, v, sticky(v, [0, 1])); await Promise.all([0, 1].map(i => state(s, v.cons[i], 'reads 3 partitions', GREEN))); },
  },
};

// ---- flow 3: more members than partitions ----
const I = {
  three: {
    phase: 'Idle member', on: ['c2', 'coord'], wire: 'c2-co',
    title: 'A third consumer joins a topic with 2 partitions',
    text: 'orders here has only 2 partitions, read by C1 and C2. C3 starts with the same group.id and joins. The group gets a new generation and the leader assigns again.',
    observe: 'C3 appears and sends JoinGroup.',
    async run(s, v) { await showConsumer(s, v, 2); await join(s, v, [2]); v.cons[2].inGroup = true; v.gen = 2; await coord(s, v, undefined, BLUE); },
  },
  idle: {
    phase: 'Idle member', on: ['c0', 'c1', 'c2', 'l0', 'l1'],
    title: 'C3 gets nothing: it is idle',
    text: 'A partition has at most one owner per group, so 2 partitions can keep at most 2 members busy. C3 is a full member with no partitions: it heartbeats and waits.',
    observe: 'C1 → orders-0, C2 → orders-1, C3 "nothing: idle".',
    async run(s, v) { await assign(s, v, range(v, [0, 1, 2])); await state(s, v.cons[2], 'in the group · idle', AMBER); },
  },
  standby: {
    phase: 'Idle member', on: ['c0', 'c2', 'l0'],
    title: 'An idle member is a hot standby',
    text: 'If C1 fails, the next assignment gives orders-0 to C3, which is already running and in the group. To use more consumers, add partitions (planned up front: see Key → partition).',
    observe: 'C1 fades out; orders-0 moves to C3.',
    async run(s, v) {
      v.cons[0].inGroup = false; await hideConsumer(s, v, 0);
      v.cons[1].badge.textContent = 'group leader'; v.cons[0].badge.textContent = '';
      await assign(s, v, range(v, [1, 2]));
      await state(s, v.cons[2], 'took over orders-0', GREEN);
    },
  },
};

const trackOf = (steps, opts, pre) => {
  const t = { continuous: true, steps, enter, async build(s) { const v = groupScene(s, opts); v.track = t; await pre?.(v, s); return v; } };
  return t;
};
const flowProtocol = trackOf([P.start, P.find, P.join, P.leader, P.joinRes, P.plan, P.sync, P.syncRes, P.fetch, P.beat]);
const flowAssignors = trackOf([A.range, A.uneven, A.rr, A.copart, A.stickyEv], { topics: two }, v => { joined(v, [0, 1]); });
const flowIdle = trackOf([I.three, I.idle, I.standby], { topics: [{ name: 'orders', n: 2 }], members: 2 }, async (v, s) => {
  joined(v, [0, 1]);
  await assign(s, v, range(v, [0, 1]));
});

// ---- try it ----
async function reassign(s, v, input, what) {
  const ids = members(v).map(c => c.i), prev = v.owner;
  const next = ASSIGNORS[input.assignor](v, ids, prev);
  const moved = Object.keys(next).filter(k => prev[k] != null && prev[k] !== next[k]).length;
  v.gen++;
  await coord(s, v, undefined, BLUE);
  await assign(s, v, next);
  for (const c of v.cons) if (c.inGroup) c.state.textContent = 'consuming';
  v.message = `${what} Generation ${v.gen}, ${input.assignor}: ${counts(v, next)}.${Object.keys(prev).length ? ` ${moved} partition${moved === 1 ? '' : 's'} changed owner.` : ''}`;
}

export default {
  id: 'assignment', n: 17, title: 'Partition assignment', tagline: 'Who in the group reads what',
  docked: true,
  guide: {
    what: 'When consumers form a group, they agree on who reads which partition: every member sends JoinGroup to the group coordinator, one member (the leader) runs the assignor, and SyncGroup hands each member its share.',
    fits: 'Fifth link of Level 2: partitions → group members. You know groups as an atom; this is how the split is decided. Next: rebalance, what happens when the membership changes.',
  },
  flows: [
    { id: 'protocol', short: 'join & sync', label: 'Join and sync', about: 'FindCoordinator, JoinGroup, the leader\'s plan, SyncGroup.', track: flowProtocol },
    { id: 'assignors', short: 'assignors', label: 'Range vs round robin', about: 'Two topics, two members, three ways to split.', track: flowAssignors },
    { id: 'idle', short: 'idle member', label: 'More members than partitions', about: 'Why a member can end up with nothing.', track: flowIdle },
  ],
  watch: flowProtocol,
  tryIt: {
    intro: 'Pick an assignor and the topics, then add or remove consumers. Every change is a new generation computed by the real assignor.',
    observe: 'Range gets uneven with several topics; round robin is even but reshuffles; sticky is even and moves as little as possible.',
    controls: [
      { type: 'choice', name: 'assignor', label: 'Assignor', options: ['range', 'roundrobin', 'sticky'] },
      { type: 'choice', name: 'topics', label: 'Topics', options: ['orders ×6', 'orders ×3 + payments ×3'], rebuild: true },
      { type: 'button', label: '+ consumer', primary: true, run: 'add' },
      { type: 'button', label: '− consumer', run: 'remove' },
    ],
    build(s, input) {
      const v = groupScene(s, { topics: input?.topics === 'orders ×6' || !input?.topics ? [{ name: 'orders', n: 6 }] : two, members: 0 });
      v.message = 'Press "+ consumer" to start the group.';
      return v;
    },
    async add(s, v, input) {
      unfocus(v);
      const c = v.cons.find(x => !x.inGroup);
      if (!c) { v.message = 'Three consumers is the most this sandbox draws.'; return; }
      c.rect.setAttribute('stroke', ['#2f6fe0', '#9e579e', '#e08a1e'][c.i]);
      wiresOn(v, c.i);
      await s.show(c.wrap, 300);
      await packet(s, v, `c${c.i}-co`, 'JoinGroup', BLUE, { ms: 600 });
      c.inGroup = true;
      if (!members(v).some(m => m.badge.textContent)) c.badge.textContent = 'group leader';
      await reassign(s, v, input, `${CNAME[c.i]} joined.`);
    },
    async remove(s, v, input) {
      unfocus(v);
      const c = [...v.cons].reverse().find(x => x.inGroup);
      if (!c) { v.message = 'No consumers left.'; return; }
      await packet(s, v, `c${c.i}-co`, 'LeaveGroup', RED, { ms: 600 });
      c.inGroup = false; c.state.textContent = '';
      const wasLeader = !!c.badge.textContent; c.badge.textContent = '';
      await s.fade(c.wrap, 0, 300);
      if (wasLeader && members(v)[0]) members(v)[0].badge.textContent = 'group leader';
      await reassign(s, v, input, `${CNAME[c.i]} left.`);
    },
    readout: v => `Generation <b>${v.gen}</b> · members <b>${members(v).map(c => CNAME[c.i]).join(', ') || 'none'}</b>${members(v).length ? ` · ${counts(v, v.owner)}` : ''}<br>${v.message}`,
  },
  deeper: {
    note: 'The new consumer protocol (KIP-848), custom assignors, and rack-aware assignment.',
    continuous: true,
    build(s) { const v = groupScene(s); joined(v, [0, 1]); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['coord'],
        title: 'KIP-848: the broker computes the assignment',
        text: 'Kafka 4.0 makes a new consumer group protocol generally available (group.protocol=consumer). Members just heartbeat their subscriptions; the coordinator runs the assignor itself (uniform or range) and changes assignments one member at a time, with no group-wide JoinGroup/SyncGroup barrier.',
        observe: 'The coordinator box now does the planning.',
        async run(s, v) { await swap(s, v.n.coord.t, 'Group coordinator · runs the assignor (KIP-848)', BLUE); },
      },
      {
        on: ['c0'],
        title: 'Custom assignors',
        text: 'With the classic protocol you can implement ConsumerPartitionAssignor and list it in partition.assignment.strategy, for example to keep heavy partitions apart. Every member must support it, and only the leader\'s copy actually runs.',
        observe: 'C1, the leader, is where a custom assignor would run.',
        async run(s, v) { await state(s, v.cons[0], 'runs MyAssignor', BLUE); },
      },
      {
        on: ['l0', 'l1', 'c0', 'c1'],
        title: 'Rack-aware assignment',
        text: 'If consumers set client.rack and brokers set broker.rack, newer assignors prefer giving each consumer partitions with a replica in its own rack, so fetches stay inside one zone and cost less.',
        observe: 'Partitions paired with consumers in the same zone.',
        async run(s, v) { await assign(s, v, range(v, [0, 1])); },
      },
    ],
  },
  takeaway: 'Members JoinGroup at the group coordinator; the first becomes the leader and runs the assignor; SyncGroup gives each member its partitions. Range splits each topic separately (uneven across topics, keeps co-partitioning), round robin deals everything evenly, sticky stays even and keeps previous owners. Extra members beyond the partition count are idle.',
  recap: {
    points: [
      'The group coordinator is the broker leading the group\'s __consumer_offsets partition.',
      'Classic protocol: JoinGroup → leader member runs the assignor → SyncGroup delivers each share.',
      'Range: per topic, contiguous, first members get the extra; good for co-partitioning.',
      'Round robin: all partitions dealt in turn, even but reshuffles on change.',
      'Sticky / cooperative-sticky: even and keeps previous owners.',
      'More members than partitions → some members are idle (standbys).',
    ],
    interview: [
      { q: 'How does Kafka assign partitions to consumers in a group?', a: 'Each member sends **JoinGroup** to the **group coordinator** (the broker leading the group\'s __consumer_offsets partition). The coordinator picks a **leader member**, which runs the configured **assignor** on the client and sends the plan in **SyncGroup**; the coordinator returns each member its own partitions. With **KIP-848** (Kafka 4.0) the broker computes assignments itself.' },
      { q: 'Range vs round robin vs sticky?', a: '**Range** assigns each topic\'s partitions in contiguous blocks; with several topics the first members get more (uneven) but matching partition numbers land together (**co-partitioning**). **Round robin** deals all partitions in turn: even, but many move when members change. **Sticky / cooperative-sticky**: even, and keeps previous owners; cooperative also avoids stop-the-world rebalances.' },
      { q: 'What happens if there are more consumers than partitions?', a: 'Each partition has **one owner per group**, so the extra consumers get **no partitions** and sit **idle** as hot standbys. To scale reading further you need **more partitions**.' },
      { q: 'Who decides the assignment, the broker or the client?', a: 'In the **classic protocol**, a **client**: the group leader member runs the assignor, so custom assignors need no broker changes. In the **new protocol (KIP-848)** the **coordinator** runs it and assignments change incrementally per member.' },
    ],
  },
  quiz: {
    q: 'A group of 2 consumers reads topics A and B with 3 partitions each, using the range assignor. How many partitions does the first consumer get?',
    options: ['3', '4', '2', '6'],
    answer: 1,
    why: 'Range splits each topic separately: 3 over 2 is 2 + 1 for A and again for B, and the first member gets the extra both times: 2 + 2 = 4. Round robin would give 3 and 3.',
  },
  related: ['group', 'rebalance', 'key-routing'],
};
