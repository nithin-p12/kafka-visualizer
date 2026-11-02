// Level 2 · Link 6: rebalance. What happens to the group when a member joins, leaves, crashes or is too slow:
// eager (everyone stops) vs cooperative (only what moves), session timeouts and max.poll.interval.ms.
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { BLUE, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';
import { groupScene, assign, coord, coordText, state, members, showConsumer, hideConsumer, wiresOn, sticky, CNAME, CCOL } from './groupmap.js';

const LANES = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'];
const ownerOf = v => ({ ...v.owner });
const without = (owner, keys) => Object.fromEntries(Object.entries(owner).filter(([k]) => !keys.includes(k)));
const short = k => k.replace('orders-', 'P');
// Start: C1 and C2 in generation 1, C1 owns orders-0..2, C2 owns orders-3..5, both consuming.
async function steady(v, s) {
  for (const i of [0, 1]) { v.cons[i].inGroup = true; v.cons[i].state.textContent = 'consuming'; }
  v.cons[0].badge.textContent = 'group leader';
  v.gen = 1;
  coordText(v);
  await assign(s, v, { 'orders-0': 0, 'orders-1': 0, 'orders-2': 0, 'orders-3': 1, 'orders-4': 1, 'orders-5': 1 });
}
const rejoin = (s, v, ids, label = 'JoinGroup') => Promise.all(ids.map(i => packet(s, v, `c${i}-co`, label, BLUE, { ms: 750 })));
const tell = (s, v, ids, label, color = AMBER) => Promise.all(ids.map(i => packet(s, v, `co-c${i}`, label, color, { ms: 750 })));
const allStates = (s, v, ids, str, color) => Promise.all(ids.map(i => state(s, v.cons[i], str, color)));

// ---- C3 joins ----
const joinC3 = {
  phase: 'Trigger', on: ['c2', 'coord'], wire: 'c2-co',
  title: 'C3 starts and sends JoinGroup',
  text: 'A third instance of the app starts with group.id=orders-app. Its JoinGroup tells the coordinator the membership has changed, so the group needs a new generation: a rebalance.',
  observe: 'C3 appears; the coordinator says "rebalancing → generation 2".',
  async run(s, v) {
    await showConsumer(s, v, 2);
    await state(s, v.cons[2], 'joining…', AMBER);
    await packet(s, v, 'c2-co', 'JoinGroup', BLUE, { ms: 800 });
    await coord(s, v, 'orders-app · rebalancing → generation 2', AMBER);
  },
};
const notify = {
  phase: 'Trigger', on: ['coord', 'c0', 'c1'], wires: ['co-c0', 'co-c1'],
  title: 'The others hear about it on their next heartbeat',
  text: 'The coordinator cannot push to consumers. It answers C1\'s and C2\'s next heartbeats with REBALANCE_IN_PROGRESS, which tells them to rejoin.',
  observe: 'REBALANCE_IN_PROGRESS goes back to C1 and C2.',
  async run(s, v) { await rejoin(s, v, [0, 1], 'heartbeat'); await tell(s, v, [0, 1], 'REBALANCE_IN_PROGRESS'); },
};
const E = {
  revoke: {
    phase: 'Eager: stop everything', on: ['c0', 'c1', ...LANES],
    title: 'Eager: every member gives up every partition',
    text: 'With an eager assignor (range, roundrobin, sticky), each member first revokes all its partitions: onPartitionsRevoked runs, it commits its offsets and stops fetching. For now nobody in the group reads orders at all.',
    observe: 'All six lines disappear; every partition shows "no owner".',
    async run(s, v) { await allStates(s, v, [0, 1], '⏸ revoked everything', RED); await assign(s, v, {}); },
  },
  join: {
    phase: 'Eager: stop everything', on: ['c0', 'c1', 'c2', 'coord'], wires: ['c0-co', 'c1-co', 'c2-co'],
    title: 'Everyone sends JoinGroup again',
    text: 'C1 and C2 rejoin; C3 is already waiting. The coordinator waits for all known members (up to the rebalance timeout, max.poll.interval.ms), then opens generation 2 with C1 still as leader.',
    observe: 'JoinGroup from all three; coordinator: generation 2, members C1, C2, C3.',
    async run(s, v) {
      await rejoin(s, v, [0, 1]);
      v.cons[2].inGroup = true; v.gen = 2;
      await coord(s, v, undefined, BLUE);
      await tell(s, v, [0, 1, 2], 'JoinGroup ok', GREEN);
    },
  },
  plan: {
    phase: 'Eager: stop everything', on: ['c0'],
    title: 'The leader computes the new plan',
    text: 'C1 runs the assignor for three members: 6 partitions → 2 each. With the sticky assignor most partitions keep their owner, but in eager mode that does not help: they were all revoked anyway.',
    observe: 'C1 shows the plan: C1 P0 P1 · C2 P3 P4 · C3 P2 P5.',
    async run(s, v) { v.plan = sticky(v, [0, 1, 2], v.before); await state(s, v.cons[0], 'plan: C1 P0 P1 · C2 P3 P4 · C3 P2 P5', BLUE); },
  },
  sync: {
    phase: 'Eager: stop everything', on: ['coord', 'c0', 'c1', 'c2', ...LANES], wires: ['co-c0', 'co-c1', 'co-c2'],
    title: 'SyncGroup, and everyone starts again',
    text: 'SyncGroup delivers each member its partitions, onPartitionsAssigned runs, each member fetches the committed offsets and resumes.',
    observe: 'Six lines come back: two partitions per consumer.',
    async run(s, v) {
      await tell(s, v, [0, 1, 2], 'your partitions', GREEN);
      await assign(s, v, v.plan);
      await allStates(s, v, [0, 1, 2], 'consuming', GREEN);
    },
  },
  cost: {
    phase: 'Cost', on: LANES,
    title: 'The cost: the whole group stopped',
    text: 'Four of the six partitions ended up with the owner they had before, yet all six were paused from the revoke until the new assignment. With many members, many partitions or slow onPartitionsRevoked handlers, this "stop the world" can last seconds to minutes, and lag grows on every partition.',
    observe: '6 of 6 partitions were paused, 2 actually moved.',
    async run(s, v) { await coord(s, v, 'generation 2 · paused 6 of 6 · moved 2', RED); },
  },
};
const C = {
  keep: {
    phase: 'Cooperative: round 1', on: ['c0', 'c1', 'c2', 'coord', ...LANES], wires: ['c0-co', 'c1-co'],
    title: 'Cooperative: rejoin and keep consuming',
    text: 'With cooperative-sticky, C1 and C2 rejoin but keep their partitions and keep reading. Their JoinGroup lists what they currently own, so the leader can plan around it.',
    observe: 'JoinGroup from C1 and C2 while all six lines stay.',
    async run(s, v) {
      await allStates(s, v, [0, 1], 'consuming · rejoining', GREEN);
      await rejoin(s, v, [0, 1], 'JoinGroup(owns 3)');
      v.cons[2].inGroup = true; v.gen = 2;
      await coord(s, v, undefined, BLUE);
    },
  },
  target: {
    phase: 'Cooperative: round 1', on: ['c0'],
    title: 'The leader works out what must move',
    text: 'The sticky target is the same as before: C1 P0 P1, C2 P3 P4, C3 P2 P5. Compared with today, only orders-2 (from C1) and orders-5 (from C2) change owner.',
    observe: 'C1 shows the plan and the two partitions that must move.',
    async run(s, v) { v.plan = sticky(v, [0, 1, 2], v.before); await state(s, v.cons[0], 'move only P2 and P5 → C3', BLUE); },
  },
  give: {
    phase: 'Cooperative: round 1', on: ['c0', 'c1', 'l2', 'l5'], wires: ['co-c0', 'co-c1'],
    title: 'Round 1: give up only what moves',
    text: 'The first SyncGroup gives each member its target minus anything still owned by someone else. So C1 revokes just orders-2, C2 just orders-5. Everything else is never paused.',
    observe: 'Only the lines to orders-2 and orders-5 disappear.',
    async run(s, v) {
      await tell(s, v, [0, 1], 'revoke P2 / P5');
      await assign(s, v, without(v.owner, ['orders-2', 'orders-5']));
      await Promise.all([state(s, v.cons[0], 'consuming P0 P1', GREEN), state(s, v.cons[1], 'consuming P3 P4', GREEN)]);
    },
  },
  again: {
    phase: 'Cooperative: round 2', on: ['c0', 'c1', 'c2', 'coord'], wires: ['c0-co', 'c1-co', 'c2-co'],
    title: 'A revoke triggers a second, quick rebalance',
    text: 'Because something was revoked, the members rejoin straight away. In this second round (generation 3) the freed partitions are unowned, so they can be handed out.',
    observe: 'JoinGroup from all three; generation 3.',
    async run(s, v) { await rejoin(s, v, [0, 1, 2]); v.gen = 3; await coord(s, v, undefined, BLUE); },
  },
  hand: {
    phase: 'Cooperative: round 2', on: ['c2', 'l2', 'l5', 'coord'], wire: 'co-c2',
    title: 'Round 2: C3 gets orders-2 and orders-5',
    text: 'C3 receives the two free partitions and starts from their committed offsets. The group is balanced: two partitions each.',
    observe: 'Lines from orders-2 and orders-5 to C3.',
    async run(s, v) { await tell(s, v, [2], 'P2 P5', GREEN); await assign(s, v, v.plan); await state(s, v.cons[2], 'consuming', GREEN); },
  },
  benefit: {
    phase: 'Cost', on: LANES,
    title: 'Only 2 of 6 partitions were ever paused',
    text: 'Two rounds instead of one, but four partitions kept being read the whole time. That is why cooperative-sticky is the recommended assignor for most apps (Kafka Streams uses cooperative rebalancing too).',
    observe: 'paused 2 of 6 · moved 2.',
    async run(s, v) { await coord(s, v, 'generation 3 · paused 2 of 6 · moved 2', GREEN); },
  },
};
// ---- a member crashes ----
const K = {
  die: {
    phase: 'Crash', on: ['c1'],
    title: 'C2 crashes',
    text: 'C2\'s process is killed (kill -9, out of memory, a lost machine). It cannot send LeaveGroup, so the coordinator does not know yet.',
    observe: 'C2 turns red; its three lines are still drawn.',
    async run(s, v) { await hideConsumer(s, v, 1); await state(s, v.cons[1], '✕ crashed', RED); },
  },
  stall: {
    phase: 'Crash', on: ['l3', 'l4', 'l5', 'coord'],
    title: 'Its partitions sit unread until the session times out',
    text: 'orders-3 to 5 still belong to C2 in generation 1, so nobody reads them. The coordinator waits session.timeout.ms (45 s by default) without heartbeats before it gives up on C2. Meanwhile their lag grows.',
    observe: 'Coordinator: "no heartbeat from C2 · 15, 30, 45 s".',
    async run(s, v) {
      for (const l of v.lanes.slice(3)) { l.ownerT.textContent = '→ C2 (dead) · lag ↑'; l.ownerT.setAttribute('fill', RED); }
      for (const t of [15, 30, 45]) { await coord(s, v, `no heartbeat from C2 · ${t} s`, t === 45 ? RED : AMBER); await s.wait(200); }
    },
  },
  remove: {
    phase: 'Rebalance', on: ['coord', 'c0'], wires: ['co-c0', 'c0-co'],
    title: 'The coordinator removes C2 and rebalances',
    text: 'After 45 s C2 is removed from the group and a new generation starts. C1 hears REBALANCE_IN_PROGRESS on its heartbeat and rejoins (with cooperative-sticky it keeps its own partitions while doing so).',
    observe: 'Generation 2 with member C1 only.',
    async run(s, v) {
      v.cons[1].inGroup = false; v.gen = 2;
      await tell(s, v, [0], 'REBALANCE_IN_PROGRESS');
      await rejoin(s, v, [0]);
      await coord(s, v, undefined, BLUE);
    },
  },
  take: {
    phase: 'Rebalance', on: ['c0', 'l3', 'l4', 'l5'],
    title: 'C1 takes over orders-3 to 5 from their last commit',
    text: 'C1 now owns all six partitions. For orders-3 to 5 it starts at C2\'s last committed offsets, so records C2 had processed but not yet committed are read again. That is at-least-once delivery (see Commit & restart).',
    observe: 'Lines from orders-3..5 now go to C1.',
    async run(s, v) { await assign(s, v, sticky(v, [0])); await state(s, v.cons[0], 'consuming all six', GREEN); },
  },
  faster: {
    phase: 'Rebalance', on: ['c1', 'coord'],
    title: 'Faster: leave cleanly, or keep a static identity',
    text: 'A graceful shutdown (consumer.close()) sends LeaveGroup, so the rebalance starts at once instead of after 45 s. With static membership (group.instance.id) a member that restarts within session.timeout.ms gets its old partitions back with no rebalance at all.',
    observe: 'The two ways to avoid waiting for the timeout.',
    async run(s, v) { await state(s, v.cons[1], 'close() → LeaveGroup', AMBER); },
  },
};
// ---- a member is too slow ----
const W = {
  slowWork: {
    phase: 'Too slow', on: ['c1', 'l3', 'l4', 'l5'],
    title: 'C2 takes too long between polls',
    text: 'C2\'s poll() returned 500 records (max.poll.records) and each one calls a slow service. Its heartbeat thread still runs, so C2 looks alive, but it has not called poll() again for minutes.',
    observe: 'C2: "processing 500 records… 3 min, 5 min".',
    async run(s, v) { for (const t of ['1 min', '3 min', '5 min']) { await state(s, v.cons[1], `processing 500 records… ${t}`, AMBER); await s.wait(200); } },
  },
  leave: {
    phase: 'Too slow', on: ['c1', 'coord'], wire: 'c1-co',
    title: 'max.poll.interval.ms passes: C2 leaves the group',
    text: 'If poll() is not called within max.poll.interval.ms (5 minutes), the consumer assumes it is stuck: its heartbeat thread sends LeaveGroup. The coordinator rebalances without it.',
    observe: 'LeaveGroup from C2; generation 2 with C1 only.',
    async run(s, v) {
      await packet(s, v, 'c1-co', 'LeaveGroup', RED, { ms: 800 });
      v.cons[1].inGroup = false; v.gen = 2;
      await coord(s, v, undefined, AMBER);
      await assign(s, v, sticky(v, [0]));
      await state(s, v.cons[1], 'still processing (not a member)', RED);
    },
  },
  fail: {
    phase: 'Too slow', on: ['c1', 'coord'], wires: ['c1-co', 'co-c1'],
    title: 'Its commit is rejected',
    text: 'C2 finally finishes and calls commitSync(). Its generation is old, so the coordinator rejects it and C2 gets CommitFailedException. C1 already re-read those records from the last commit: they are processed twice.',
    observe: 'A commit from C2 comes back as CommitFailedException.',
    async run(s, v) {
      await packet(s, v, 'c1-co', 'OffsetCommit (gen 1)', BLUE, { ms: 750 });
      await packet(s, v, 'co-c1', 'CommitFailedException', RED, { ms: 750 });
      await state(s, v.cons[1], '✕ CommitFailedException', RED);
    },
  },
  fix: {
    phase: 'Fixes', on: ['c1'],
    title: 'How to stay in the group',
    text: 'Keep each poll loop short: lower max.poll.records, make processing faster, or raise max.poll.interval.ms if work is truly slow. Make processing idempotent anyway, because a rebalance can always cause a re-read.',
    observe: 'The settings that decide how long a member may work between polls.',
    async run(s, v) { await state(s, v.cons[1], 'max.poll.records ↓ · interval ↑', BLUE); },
  },
};

const trackOf = (steps, pre = steady) => {
  const t = { continuous: true, steps, enter, async build(s) { const v = groupScene(s, { members: 2 }); v.track = t; await pre(v, s); v.before = ownerOf(v); return v; } };
  return t;
};
const flowEager = trackOf([joinC3, notify, E.revoke, E.join, E.plan, E.sync, E.cost]);
const flowCoop = trackOf([joinC3, notify, C.keep, C.target, C.give, C.again, C.hand, C.benefit]);
const flowCrash = trackOf([K.die, K.stall, K.remove, K.take, K.faster]);
const flowSlow = trackOf([W.slowWork, W.leave, W.fail, W.fix]);

// ---- try it ----
async function rebalance(s, v, protocol, why) {
  const ids = members(v).map(c => c.i), prev = ownerOf(v);
  const next = sticky(v, ids, prev);
  const moving = Object.keys(next).filter(k => prev[k] !== next[k]);
  let paused;
  if (protocol === 'eager') {
    await assign(s, v, {});
    paused = v.lanes.filter(l => prev[l.key] != null || next[l.key] != null).length;
    v.gen++;
    await coord(s, v, undefined, AMBER);
    await assign(s, v, next);
  } else {
    const keep = Object.fromEntries(Object.entries(prev).filter(([k, i]) => next[k] === i && ids.includes(i)));
    await assign(s, v, keep);
    paused = moving.length;
    v.gen++;
    if (moving.length) { await coord(s, v, undefined, AMBER); v.gen++; }
    await assign(s, v, next);
    await coord(s, v, undefined, BLUE);
  }
  for (const c of members(v)) c.state.textContent = 'consuming';
  v.message = `${why} ${protocol === 'eager' ? 'Eager' : 'Cooperative'} rebalance → generation ${v.gen}: ${paused} of 6 partitions paused, ${moving.length} moved.`;
}

export default {
  id: 'rebalance', n: 18, title: 'Rebalance', tagline: 'When the group changes',
  docked: true,
  guide: {
    what: 'A rebalance re-runs partition assignment because the group changed: a member joined, left, crashed or was too slow. Eager rebalancing stops the whole group; cooperative rebalancing only pauses the partitions that move.',
    fits: 'Sixth link of Level 2: a consumer joins or leaves. Assignment showed how one generation is decided; this is how the group gets from one generation to the next. Next: commit & restart, why rebalances can re-deliver records.',
  },
  flows: [
    { id: 'eager', short: 'eager', label: 'Eager (stop the world)', about: 'C3 joins; everyone revokes everything first.', track: flowEager },
    { id: 'coop', short: 'cooperative', label: 'Cooperative', about: 'C3 joins; only the partitions that move are paused.', track: flowCoop },
    { id: 'crash', short: 'crash', label: 'A member crashes', about: 'Nothing happens until session.timeout.ms.', track: flowCrash },
    { id: 'slow', short: 'too slow', label: 'A member is too slow', about: 'max.poll.interval.ms and CommitFailedException.', track: flowSlow },
  ],
  watch: flowEager,
  tryIt: {
    intro: 'Choose eager or cooperative, then add C3, stop a member or bring it back. Each change runs a real sticky rebalance and counts how many partitions had to pause.',
    observe: 'Eager pauses every partition on every change; cooperative only pauses the ones that change owner.',
    controls: [
      { type: 'choice', name: 'protocol', label: 'Rebalance', options: ['eager', 'cooperative'] },
      { type: 'button', label: 'Add / remove C3', primary: true, run: 'c3' },
      { type: 'button', label: 'Stop / start C2', run: 'c2' },
    ],
    build(s) {
      const v = groupScene(s, { members: 2 });
      steady(v, s);                                     // try builds are synchronous; the lines fade in
      v.message = 'C1 and C2 share orders. Add C3 with eager, then switch to cooperative and do it again.';
      return v;
    },
    async c3(s, v, input) {
      unfocus(v);
      const c = v.cons[2];
      if (!c.inGroup) {
        c.rect.setAttribute('stroke', CCOL[2]);
        wiresOn(v, 2);
        await s.show(c.wrap, 300);
        await packet(s, v, 'c2-co', 'JoinGroup', BLUE, { ms: 600 });
        c.inGroup = true;
        return rebalance(s, v, input.protocol, 'C3 joined.');
      }
      await packet(s, v, 'c2-co', 'LeaveGroup', RED, { ms: 600 });
      c.inGroup = false; c.state.textContent = '';
      await s.fade(c.wrap, 0, 300);
      return rebalance(s, v, input.protocol, 'C3 left.');
    },
    async c2(s, v, input) {
      unfocus(v);
      const c = v.cons[1];
      if (c.inGroup) {
        await packet(s, v, 'c1-co', 'LeaveGroup', RED, { ms: 600 });
        c.inGroup = false;
        await hideConsumer(s, v, 1, MUTED);
        c.state.textContent = 'stopped';
        return rebalance(s, v, input.protocol, 'C2 stopped (clean shutdown, LeaveGroup).');
      }
      c.rect.setAttribute('stroke', CCOL[1]);
      await s.fade(c.wrap, 1, 300);
      await packet(s, v, 'c1-co', 'JoinGroup', BLUE, { ms: 600 });
      c.inGroup = true;
      return rebalance(s, v, input.protocol, 'C2 is back.');
    },
    readout: v => `Generation <b>${v.gen}</b> · members <b>${members(v).map(c => CNAME[c.i]).join(', ')}</b> · ${members(v).map(c => `${CNAME[c.i]}: ${v.lanes.filter(l => v.owner[l.key] === c.i).map(l => short(l.key)).join(' ') || 'idle'}`).join(' · ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Rebalance listeners, static membership, and the new protocol.',
    continuous: true,
    async build(s) { const v = groupScene(s, { members: 2 }); v.track = this; await steady(v, s); return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['c0', 'c1'],
        title: 'ConsumerRebalanceListener: your hook',
        text: 'onPartitionsRevoked runs before a partition is taken away: commit what you processed and flush state there. onPartitionsAssigned runs after you get partitions: restore state or seek. onPartitionsLost runs when you were kicked out and cannot commit any more.',
        observe: 'Both members show the callbacks they run.',
        async run(s, v) { await allStates(s, v, [0, 1], 'onRevoked → commit', BLUE); },
      },
      {
        on: ['c1', 'coord'],
        title: 'Static membership: restarts without rebalances',
        text: 'Give each instance a stable group.instance.id. A rolling restart that comes back within session.timeout.ms keeps its partitions and triggers no rebalance. Raise session.timeout.ms to cover your deploy time.',
        observe: 'C2 keeps its id across a restart.',
        async run(s, v) { await state(s, v.cons[1], 'group.instance.id=app-2', BLUE); },
      },
      {
        on: ['coord', 'c0', 'c1'],
        title: 'The new protocol removes the group-wide barrier',
        text: 'With KIP-848 (group.protocol=consumer, Kafka 4.0), the coordinator moves partitions member by member through heartbeats. There is no global JoinGroup/SyncGroup round, so a change only affects the members whose partitions move.',
        observe: 'The coordinator handles changes per member.',
        async run(s, v) { await coord(s, v, 'KIP-848: per-member, no global barrier', BLUE); },
      },
    ],
  },
  takeaway: 'A rebalance starts a new generation when a member joins, leaves, crashes (after session.timeout.ms) or stalls (after max.poll.interval.ms). Eager revokes every partition first; cooperative-sticky only revokes the ones that move, in two quick rounds. Uncommitted work on moved partitions is re-read.',
  recap: {
    points: [
      'Triggers: join, LeaveGroup, missed heartbeats (session.timeout.ms, 45 s), no poll within max.poll.interval.ms (5 min), subscription or partition changes.',
      'Members learn about it from REBALANCE_IN_PROGRESS on their heartbeat.',
      'Eager: everyone revokes everything, rejoins, gets a new assignment: stop the world.',
      'Cooperative-sticky: keep consuming, revoke only what moves, second round hands it out.',
      'Moved partitions restart from the last commit: uncommitted records are read again.',
      'Static membership and clean shutdowns avoid needless rebalances.',
    ],
    interview: [
      { q: 'What triggers a consumer group rebalance?', a: 'A **member joining**, a member **leaving** (LeaveGroup on close), a member **missing heartbeats** for **session.timeout.ms**, a member **not calling poll()** within **max.poll.interval.ms**, and changes to the **subscribed topics** or their **partition count**.' },
      { q: 'Eager vs cooperative rebalancing?', a: '**Eager**: every member **revokes all partitions** before rejoining, so the whole group stops until the new assignment. **Cooperative (incremental)**: members keep their partitions, the assignor computes the target, only **partitions that change owner are revoked**, and a **second short rebalance** assigns them. Use **cooperative-sticky**.' },
      { q: 'Why do I get CommitFailedException?', a: 'The consumer was **removed from the group** (usually it exceeded **max.poll.interval.ms**) and a rebalance gave its partitions away. Its **generation is stale**, so the commit is rejected. Fix the slow loop: fewer **max.poll.records**, faster processing, or a larger interval.' },
      { q: 'How do you reduce rebalances during deploys?', a: '**Static membership** (group.instance.id) with a **session.timeout.ms** longer than a restart, **clean shutdowns** (close() sends LeaveGroup), **cooperative-sticky** so changes are incremental, or the **KIP-848** protocol.' },
    ],
  },
  quiz: {
    q: 'With cooperative-sticky, C3 joins a group where C1 and C2 each own 3 of 6 partitions. How many partitions stop being read during the rebalance?',
    options: ['All 6', 'Only the 2 that move to C3', 'None at all', '3, one per consumer'],
    answer: 1,
    why: 'Cooperative rebalancing only revokes partitions that change owner. The sticky target keeps 2 with C1 and 2 with C2, so just the 2 moving to C3 pause briefly.',
  },
  related: ['assignment', 'group', 'commit-lag'],
};
