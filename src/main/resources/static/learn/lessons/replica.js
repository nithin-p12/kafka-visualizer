// Lesson 7: replicas, leaders and followers: copies of a partition on other brokers.
import { PARTITION_COLORS as PC } from '../scene.js';
import { broker, setOnline, lane, setRole, addBlock, slot, fly, bounce, catchUp, RED, MUTED } from './kit.js';

const BX = [340, 590, 840], BY = 225, BW = 220, BH = 300, ROW_Y = [-62, 10, 82];
const PRODUCER = [195, 163];

// Three brokers, each holding a copy of orders-0, -1 and -2 (hidden until a step shows them).
function scene(s) {
  const v = {};
  v.brokers = BX.map((x, i) => broker(s, x, BY, BW, BH, `Broker ${i + 1}`));
  v.lanes = v.brokers.map(b => ROW_Y.map((y, p) => {
    const l = lane(s, b, 0, y, { name: `orders-${p}`, color: PC[p] });
    l.setAttribute('opacity', 0);
    return l;
  }));
  v.producer = s.box(105, 163, 170, 64, 'Producer', { size: 18 });
  v.producer.setAttribute('opacity', 0);
  v.note = s.note(590, 40, 'topic orders · replication.factor = 3', { 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
  v.note.setAttribute('opacity', 0);
  return v;
}
const col = (v, p) => v.lanes.map(row => row[p]);
function dim(v, i, on) { for (const l of v.lanes[i]) l.setAttribute('opacity', on ? 1 : .35); }

export default {
  id: 'replica', n: 7, title: 'Replica, leader & follower', tagline: 'Copies of a partition across brokers',
  guide: {
    what: 'A replica is a copy of a partition stored on another broker. One copy, the leader, takes all writes; the others, followers, copy from it, ready to take over if the leader\'s broker fails.',
    fits: 'In the cluster lesson a stopped broker took its partition offline. Replicas fix that. Next: the producer, and how it sends records to leaders.',
  },
  watch: {
    build: scene,
    steps: [
      {
        title: 'A replica is a copy of a partition',
        text: 'With replication.factor = 3, every partition of the topic is stored three times, each copy on a different broker. Here orders-0 exists on Broker 1, Broker 2 and Broker 3, holding the same records.',
        observe: 'Three identical copies of orders-0 appear, one per broker.',
        focus: v => col(v, 0),
        async run(s, v) {
          await s.show(v.note, 300);
          for (const l of col(v, 0)) { addBlock(s, l); addBlock(s, l); await s.show(l, 280); }
        },
      },
      {
        title: 'One copy is the leader',
        text: 'For each partition, one replica is the leader. Producers write only to the leader (and consumers read from it by default). Here the leader of orders-0 is on Broker 1; the other two copies are followers.',
        observe: 'The new record goes only to the leader on Broker 1.',
        focus: v => [v.lanes[0][0]],
        async run(s, v) {
          const [leader, ...followers] = col(v, 0);
          setRole(leader, 'leader');
          for (const f of followers) setRole(f, 'follower');
          await s.show(v.producer, 300);
          await fly(s, PRODUCER, slot(s, leader), PC[0], '2', 700);
          addBlock(s, leader);
          await s.pulse(leader);
        },
      },
      {
        title: 'Followers copy from the leader',
        text: 'Followers keep fetching new records from the leader, just like a consumer does, and append them to their own copy in the same order with the same offsets.',
        observe: 'Record 2 is copied from the leader to both followers.',
        focus: v => col(v, 0).slice(1),
        async run(s, v) {
          const [leader, ...followers] = col(v, 0);
          await Promise.all(followers.map(f => catchUp(s, leader, f, 650)));
        },
      },
      {
        title: 'Each partition has its own leader',
        text: 'orders-1 and orders-2 are replicated too, but their leaders are on Broker 2 and Broker 3. Spreading leaders spreads the work: every broker leads some partitions and follows others.',
        observe: 'Each broker is the leader (★) for exactly one partition.',
        focus: v => [v.lanes[0][0], v.lanes[1][1], v.lanes[2][2]],
        async run(s, v) {
          for (const p of [1, 2]) {
            col(v, p).forEach((l, i) => { for (let k = 0; k < 3; k++) addBlock(s, l); setRole(l, i === p ? 'leader' : 'follower'); });
            await Promise.all(col(v, p).map(l => s.show(l, 350)));
          }
          await Promise.all([v.lanes[1][1], v.lanes[2][2]].map(l => s.pulse(l)));
        },
      },
      {
        title: 'The leader\'s broker fails',
        text: 'Broker 1 crashes, taking the leader of orders-0 with it. For a moment orders-0 has no leader, so the producer\'s next record cannot be written. orders-1 and orders-2 are not affected: their leaders are elsewhere.',
        observe: 'Broker 1 turns red and the producer\'s record bounces back.',
        focus: v => [v.brokers[0]],
        async run(s, v) {
          setOnline(v.brokers[0], false);
          dim(v, 0, false);
          for (const l of v.lanes[0]) setRole(l, '');
          await s.shake(v.brokers[0]);
          await bounce(s, PRODUCER, slot(s, v.lanes[0][0]));
        },
      },
      {
        title: 'An in-sync follower becomes the leader',
        text: 'The controller picks a follower that was fully caught up (in sync) and makes it the new leader: here the copy on Broker 2. It already has records 0 to 2, so nothing is lost. The producer now writes there, and Broker 3 follows the new leader.',
        observe: 'The ★ moves to Broker 2. Record 3 is written there and copied to Broker 3.',
        focus: v => [v.lanes[1][0]],
        async run(s, v) {
          const leader = v.lanes[1][0], follower = v.lanes[2][0];
          setRole(leader, 'leader');
          await s.pulse(leader);
          await fly(s, PRODUCER, slot(s, leader), PC[0], '3', 750);
          addBlock(s, leader);
          await catchUp(s, leader, follower, 600);
        },
      },
      {
        title: 'Broker 1 returns as a follower',
        text: 'When Broker 1 comes back, its copy of orders-0 is behind: it missed record 3. It rejoins as a follower, fetches what it missed from the new leader, and is in sync again.',
        observe: 'Broker 1\'s copy catches up with record 3 and becomes a follower.',
        focus: v => [v.lanes[0][0]],
        async run(s, v) {
          setOnline(v.brokers[0], true);
          dim(v, 0, true);
          for (const l of v.lanes[0]) setRole(l, 'follower');
          await s.pulse(v.brokers[0]);
          await catchUp(s, v.lanes[1][0], v.lanes[0][0], 650);
        },
      },
    ],
  },
  tryIt: {
    intro: 'One partition, orders-0, copied to as many brokers as the replication factor. Send records, stop the leader\'s broker, then start it again.',
    observe: 'A follower that is in sync takes over without losing records. A stopped follower falls behind and catches up when it returns.',
    controls: [
      { type: 'choice', name: 'rf', label: 'Replication factor', options: ['3', '2', '1'], rebuild: true },
      { type: 'button', label: 'Send record', primary: true, run: 'send' },
      { type: 'button', label: 'Stop / start Broker 1', run: 'b0' },
      { type: 'button', label: 'Stop / start Broker 2', run: 'b1' },
      { type: 'button', label: 'Stop / start Broker 3', run: 'b2' },
    ],
    build(s, input) {
      const rf = +input.rf, v = { leader: 0, message: `orders-0 has ${rf} ${rf === 1 ? 'copy' : 'copies'}. The leader is on Broker 1.` };
      v.producer = s.box(105, 225, 170, 64, 'Producer', { size: 18 });
      s.note(590, 40, `topic orders · replication.factor = ${rf}`, { 'font-size': 16, 'font-weight': 650, fill: '#1677ff' });
      v.brokers = BX.map((x, i) => broker(s, x, BY, BW, 220, `Broker ${i + 1}`));
      v.reps = v.brokers.map((b, i) => {
        if (i >= rf) { s.text(b, 0, 10, 'no copy here', { 'font-size': 14, fill: MUTED }); return null; }
        const l = lane(s, b, 0, 10, { name: 'orders-0', color: PC[0], h: 64 });
        setRole(l, i ? 'follower' : 'leader');
        return { lane: l, inSync: true };
      });
      return v;
    },
    async send(s, v) {
      const lead = v.leader === null ? null : v.reps[v.leader];
      if (!lead) {
        await bounce(s, [195, 225], [340, 225]);
        v.message = 'orders-0 has no leader, so the write fails. A real producer retries until a leader is back or delivery.timeout.ms runs out.';
        return;
      }
      if (lead.lane.blocks.length >= 6) { v.message = 'The partition is full in this sandbox. Change the replication factor to start again.'; return; }
      const n = lead.lane.blocks.length;
      await fly(s, [195, 225], slot(s, lead.lane), PC[0], `${n}`, 650);
      addBlock(s, lead.lane);
      const behind = [];
      await Promise.all(v.reps.map(async (r, i) => {
        if (!r || r === lead) return;
        if (!v.brokers[i].online) { r.inSync = false; behind.push(i + 1); return; }
        await catchUp(s, lead.lane, r.lane, 550);
      }));
      v.message = `Record ${n} was written to the leader on Broker ${v.leader + 1}` + (v.reps.filter(r => r && r !== lead).length ? ' and copied to the followers that are online.' : '. There are no followers to copy it.')
        + (behind.length ? ` Broker ${behind.join(' and ')} is down and falls behind (out of sync).` : '');
    },
    async toggle(s, v, i) {
      const b = v.brokers[i], r = v.reps[i];
      setOnline(b, !b.online);
      if (r) r.lane.setAttribute('opacity', b.online ? 1 : .35);
      if (!b.online) {
        await s.shake(b);
        if (!r) { v.message = `Broker ${i + 1} stopped. It held no copy of orders-0, so nothing changes.`; return; }
        setRole(r.lane, '');
        if (v.leader !== i) { v.message = `Broker ${i + 1} stopped. It was a follower; the leader keeps working. New records will leave it behind.`; return; }
        // Leader lost: promote the first online follower that is fully caught up.
        const next = v.reps.findIndex((x, k) => x && k !== i && v.brokers[k].online && x.inSync && x.lane.blocks.length === r.lane.blocks.length);
        v.leader = next < 0 ? null : next;
        if (next < 0) { v.message = `Broker ${i + 1} stopped and it was the leader. No in-sync copy is online, so orders-0 is offline. Kafka waits for an in-sync replica instead of risking data loss.`; return; }
        setRole(v.reps[next].lane, 'leader');
        await s.pulse(v.reps[next].lane);
        v.message = `Broker ${i + 1} stopped and it was the leader. Broker ${next + 1} was in sync, so it is the new leader. No records were lost.`;
        return;
      }
      await s.pulse(b);
      if (!r) { v.message = `Broker ${i + 1} is back. It holds no copy of orders-0.`; return; }
      if (v.leader === null) {
        if (!r.inSync) { setRole(r.lane, 'follower'); v.message = `Broker ${i + 1} is back, but its copy is behind. orders-0 stays offline until an in-sync copy returns.`; return; }
        v.leader = i;
        setRole(r.lane, 'leader');
        v.message = `Broker ${i + 1} is back with an up-to-date copy, so it becomes the leader again.`;
        return;
      }
      setRole(r.lane, 'follower');
      const missed = v.reps[v.leader].lane.blocks.length - r.lane.blocks.length;
      await catchUp(s, v.reps[v.leader].lane, r.lane, 450);
      r.inSync = true;
      v.message = `Broker ${i + 1} is back as a follower. ${missed ? `It fetched the ${missed} record${missed > 1 ? 's' : ''} it missed and` : 'It missed nothing and'} is in sync again.`;
    },
    b0(s, v) { return this.toggle(s, v, 0); }, b1(s, v) { return this.toggle(s, v, 1); }, b2(s, v) { return this.toggle(s, v, 2); },
    readout: v => {
      const isr = v.reps.map((r, i) => r && v.brokers[i].online && r.inSync && v.leader !== null && r.lane.blocks.length === v.reps[v.leader].lane.blocks.length ? i + 1 : null).filter(Boolean);
      const logs = v.reps.map((r, i) => r ? `Broker ${i + 1}: ${r.lane.blocks.length} record${r.lane.blocks.length === 1 ? '' : 's'}` : null).filter(Boolean).join(' · ');
      return `Leader: <b style="color:${v.leader === null ? RED : '#c47d1e'}">${v.leader === null ? 'none, partition offline' : `Broker ${v.leader + 1}`}</b> · In sync: <b>{${isr.join(', ')}}</b><br>${logs}<br>${v.message}`;
    },
  },
  deeper: {
    note: 'Spreading copies across racks, and the preferred leader.',
    build(s) {
      const v = {};
      v.zones = BX.map((x, i) => {
        const z = s.box(x, 225, 236, 330, '', { stroke: '#c9ced2', dash: '6 5', rx: 14, fill: '#fafbfc' });
        z.label = s.text(z, 0, 148, `zone ${'abc'[i]}`, { 'font-size': 15, 'font-weight': 650, fill: MUTED });
        return z;
      });
      v.brokers = BX.map((x, i) => broker(s, x, 205, BW, 200, `Broker ${i + 1}`, `broker.rack = ${'abc'[i]}`));
      v.lanes = v.brokers.map((b, i) => {
        const l = lane(s, b, 0, 20, { name: 'orders-0', color: PC[0], h: 64, count: 3 });
        setRole(l, i ? 'follower' : 'leader');
        return l;
      });
      return v;
    },
    steps: [
      {
        title: 'Spread copies across racks or zones',
        text: 'Give each broker a broker.rack (a rack or cloud availability zone) and Kafka places a partition\'s copies in different racks. Then even losing a whole zone, power and network included, leaves other copies alive.',
        observe: 'Zone a goes down with Broker 1. Broker 2 in zone b takes over as leader.',
        focus: v => [v.lanes[1]],
        async run(s, v) {
          const z = v.zones[0];
          z.rect.setAttribute('stroke', RED); z.rect.setAttribute('fill', '#fff4f4');
          z.label.textContent = 'zone a ✕ outage'; z.label.setAttribute('fill', RED);
          setOnline(v.brokers[0], false);
          v.lanes[0].setAttribute('opacity', .35);
          setRole(v.lanes[0], '');
          await s.shake(z);
          setRole(v.lanes[1], 'leader');
          await s.pulse(v.lanes[1]);
        },
      },
      {
        title: 'Leadership returns to the preferred leader',
        text: 'Each partition has a replica list, here [1, 2, 3]; the first broker is the preferred leader. When Broker 1 is back and in sync, Kafka moves leadership back to it (auto.leader.rebalance.enable, on by default), so leaders stay evenly spread.',
        observe: 'Broker 1 returns, catches up, and the ★ moves back to it.',
        focus: v => [v.lanes[0]],
        async run(s, v) {
          const z = v.zones[0];
          z.rect.setAttribute('stroke', '#c9ced2'); z.rect.setAttribute('fill', '#fafbfc');
          z.label.textContent = 'zone a'; z.label.setAttribute('fill', MUTED);
          setOnline(v.brokers[0], true);
          v.lanes[0].setAttribute('opacity', 1);
          setRole(v.lanes[0], 'follower');
          await s.pulse(v.brokers[0]);
          await s.wait(400);
          setRole(v.lanes[1], 'follower');
          setRole(v.lanes[0], 'leader');
          await s.pulse(v.lanes[0]);
        },
      },
    ],
  },
  takeaway: 'Replicas are copies of a partition on different brokers. The leader takes the writes, followers copy it, and when the leader\'s broker fails an in-sync follower takes over without losing records.',
  recap: {
    points: [
      'replication.factor = number of copies of each partition, each on a different broker.',
      'One replica is the leader: producers write to it, consumers read from it by default.',
      'Followers fetch from the leader and keep the same records and offsets.',
      'If the leader\'s broker fails, an in-sync follower becomes leader; nothing written to all in-sync copies is lost.',
      'A returning broker rejoins as a follower and catches up.',
    ],
    interview: [
      { q: 'What is the difference between a leader and a follower?', a: 'Both are full copies of a partition. The **leader** handles all **writes** (and reads by default). **Followers** only **replicate**: they fetch from the leader and stay ready to take over. Leadership is per partition, so each broker leads some partitions and follows others.' },
      { q: 'What happens when the leader\'s broker crashes?', a: 'The **controller** notices the missing heartbeats and promotes a follower from the **in-sync replica set (ISR)** to leader. Clients refresh their metadata and continue with the new leader. Records that reached all in-sync replicas are not lost.' },
      { q: 'What does "in sync" mean?', a: 'A follower is **in sync** when it has caught up with the leader recently (within **replica.lag.time.max.ms**, 30 s by default). Only in-sync followers can become leader cleanly. A follower that falls behind drops out of the ISR until it catches up.' },
      { q: 'Which replication factor would you use in production?', a: '**3** is the usual choice: it survives one broker failure even during maintenance on another. Pair it with **min.insync.replicas = 2** and **acks = all** on producers so a write is only confirmed once at least two copies have it.' },
    ],
  },
  quiz: {
    q: 'orders-0 has replicas on brokers 1 (leader), 2 and 3, all in sync. Broker 1 crashes. What happens?',
    options: ['orders-0 is offline until Broker 1 returns', 'Broker 2 or 3 becomes leader and keeps serving with no data loss', 'Consumers must switch to another topic', 'Kafka rebuilds orders-0 from consumer caches'],
    answer: 1,
    why: 'An in-sync follower already has every committed record, so the controller makes it the new leader. Producers and consumers continue with it. Broker 1 later rejoins as a follower and catches up.',
  },
  related: ['cluster', 'broker'],
};
