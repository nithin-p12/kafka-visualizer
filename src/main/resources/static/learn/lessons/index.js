// Curriculum: built lessons are imported; planned ones appear on the map as "coming soon".
import record from './record.js';
import topic from './topic.js';
import partition from './partition.js';
import offset from './offset.js';
import broker from './broker.js';
import cluster from './cluster.js';
import replica from './replica.js';
import producer from './producer.js';
import consumer from './consumer.js';
import group from './group.js';
import commitLag from './commit-lag.js';
import retention from './retention.js';

export const LESSONS = [record, topic, partition, offset, broker, cluster, replica, producer, consumer, group, commitLag, retention];

export const LEVELS = [
  {
    id: 'atoms', title: 'Level 1 · Atoms', blurb: 'One component at a time. What it is and what it does inside.',
    items: [
      'record', 'topic', 'partition', 'offset', 'broker', 'cluster', 'replica', 'producer', 'consumer', 'group', 'commit-lag', 'retention',
    ],
  },
  {
    id: 'links', title: 'Level 2 · Links', blurb: 'How two components talk to each other.',
    items: [
      { id: 'key-routing', title: 'Key → partition', tagline: 'Producer ↔ partition' },
      { id: 'acks', title: 'acks = 0 / 1 / all', tagline: 'Producer ↔ leader ↔ followers' },
      { id: 'replication', title: 'Replication flow', tagline: 'Leader → followers' },
      { id: 'election', title: 'Leader election', tagline: 'Broker failure → new leader' },
      { id: 'assignment', title: 'Partition assignment', tagline: 'Partitions → group members' },
      { id: 'rebalance', title: 'Rebalance', tagline: 'A consumer joins or leaves' },
      { id: 'redelivery', title: 'Commit & restart', tagline: 'At-least-once in action' },
      { id: 'multi-group', title: 'Multiple groups', tagline: 'Every group gets every record' },
    ],
  },
  {
    id: 'e2e', title: 'Level 3 · End to end', blurb: 'One record\'s full journey, then the live Visualizer.',
    items: [{ id: 'journey', title: 'Journey of one message', tagline: 'From send() to commit, every stage' }],
  },
  {
    id: 'deep', title: 'Level 4 · Deep dives (optional)', blurb: 'Interview-level internals. Leave these until the flow above makes sense.',
    items: [
      { id: 'isr', title: 'ISR & high watermark', tagline: 'What "committed" means on the broker' },
      { id: 'batching', title: 'Batching & compression', tagline: 'linger.ms, batch.size' },
      { id: 'idempotence', title: 'Idempotent producer & exactly-once', tagline: 'No duplicates on retry' },
      { id: 'kraft', title: 'KRaft controller', tagline: 'Who manages cluster metadata' },
    ],
  },
];

const byId = Object.fromEntries(LESSONS.map(l => [l.id, l]));
export const lesson = id => byId[id];
export const titleOf = id => byId[id]?.title ?? LEVELS.flatMap(l => l.items).find(i => i.id === id)?.title ?? id;
