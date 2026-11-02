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
import keyRouting from './key-routing.js';
import acks from './acks.js';
import replication from './replication.js';
import election from './election.js';
import assignment from './assignment.js';
import rebalance from './rebalance.js';
import redelivery from './redelivery.js';
import multiGroup from './multi-group.js';
import journey from './journey.js';
import isr from './isr.js';
import batching from './batching.js';
import idempotence from './idempotence.js';

export const LESSONS = [record, topic, partition, offset, broker, cluster, replica, producer, consumer, group, commitLag, retention, keyRouting, acks, replication, election, assignment, rebalance, redelivery, multiGroup, journey, isr, batching, idempotence];

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
      'key-routing',
      'acks',
      'replication',
      'election',
      'assignment',
      'rebalance',
      'redelivery',
      'multi-group',
    ],
  },
  {
    id: 'e2e', title: 'Level 3 · End to end', blurb: 'One record\'s full journey, then the live Visualizer.',
    items: ['journey'],
  },
  {
    id: 'deep', title: 'Level 4 · Deep dives (optional)', blurb: 'Interview-level internals. Leave these until the flow above makes sense.',
    items: [
      'isr',
      'batching',
      'idempotence',
      { id: 'kraft', title: 'KRaft controller', tagline: 'Who manages cluster metadata' },
    ],
  },
];

const byId = Object.fromEntries(LESSONS.map(l => [l.id, l]));
export const lesson = id => byId[id];
export const titleOf = id => byId[id]?.title ?? LEVELS.flatMap(l => l.items).find(i => i.id === id)?.title ?? id;
