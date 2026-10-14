package com.kafka.visualizer.simulation;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** Single authoritative deterministic state machine. No clock, random values or external Kafka. */
public final class SimulationEngine {
    public record Message(String id, long offset, String key, String payload, String producerId, long tick) {}
    public record Command(String type, String targetId, String key, String payload, Double value) {}
    public record Event(long id, long tick, long epoch, String stage, String messageId, String partitionKey,
                        String topicName, String groupId, String source, String destination,
                        String sourceName, String destinationName, Long offset, Long committedNext,
                        long generation, String description, Message message) {}
    public record PendingMessage(String id, String key, String payload, boolean requested, String status) {}
    private static final class Pending {
        final String id;
        String key, payload, status = "Ready template";
        boolean requested;
        Pending(String id, String key, String payload) { this.id=id; this.key=key; this.payload=payload; }
        PendingMessage view() { return new PendingMessage(id,key,payload,requested,status); }
    }
    private record ManualTarget(Message message, String partitionKey, Set<String> groups) {}
    private static final class Replica {
        final String brokerId;
        final List<Message> log = new ArrayList<>();
        long end;
        boolean inSync = true;
        Replica(String brokerId) { this.brokerId = brokerId; }
    }
    private static final class Partition {
        final String topicId;
        final int number;
        final LinkedHashMap<String, Replica> replicas = new LinkedHashMap<>();
        String leader;
        long end, start;
        Partition(String topicId, int number) { this.topicId = topicId; this.number = number; }
        String key() { return topicId + ":" + number; }
        String node(String brokerId) { return "replica:" + key() + ":" + brokerId; }
    }
    private static final class Cursor {
        long fetched, completed;
        Cursor(long offset) { fetched = completed = offset; }
    }
    private static final class Work {
        final Partition partition;
        final Message message;
        int credit;
        boolean failed;
        Work(Partition p, Message m) { partition = p; message = m; }
    }
    private static final class ConsumerState {
        boolean online = true, paused, failNext;
        final LinkedHashMap<String, Cursor> cursors = new LinkedHashMap<>();
        Work work;
        int rotation;
        long successes, retries, redeliveries;
    }
    private static final class Group {
        final Map<String, String> assignments = new LinkedHashMap<>();
        final Map<String, Long> committed = new LinkedHashMap<>();
        final Map<String, Set<Long>> processed = new HashMap<>();
        long generation;
        int rebalanceTicks;
    }

    private Configuration configuration;
    private final Map<String, Boolean> brokers = new LinkedHashMap<>();
    private final Map<String, Partition> partitions = new LinkedHashMap<>();
    private final Map<String, ConsumerState> consumers = new LinkedHashMap<>();
    private final Map<String, Group> groups = new LinkedHashMap<>();
    private final Map<String, Integer> producerCredit = new HashMap<>(), roundRobin = new HashMap<>();
    private final ArrayDeque<Event> events = new ArrayDeque<>();
    private final Map<String, ArrayDeque<Pending>> pending = new LinkedHashMap<>();
    private final List<ManualTarget> manualTargets = new ArrayList<>();
    private long reservedSequence;
    private boolean manualBurst, manualSuspended, playbackPaused=true;
    private String manualStatus = "";
    private long tick, revision, configRevision, eventSequence, messageSequence, epoch;
    private boolean running;
    private int scenario, scenarioPhase;
    private String scenarioBroker;
    private long scenarioActionTick;

    public SimulationEngine() { configuration = Configuration.defaults(); reset(); }
    public synchronized Configuration configuration() { return configuration; }

    public static void validate(Configuration c) {
        if (c == null || c.schemaVersion() != 1) fail("schemaVersion must be 1");
        size(c.brokers(), 1, 5, "brokers"); size(c.topics(), 1, 3, "topics");
        size(c.producers(), 1, 3, "producers"); size(c.consumers(), 1, 10, "consumers");
        size(c.groups(), 1, 10, "groups");
        var ids = new HashSet<String>(); var names = new HashSet<String>();
        for (var b : c.brokers()) { identity(b.id(), b.name(), ids, "broker"); }
        ids.clear();
        for (var t : c.topics()) {
            identity(t.id(), t.name(), ids, "topic");
            if (!names.add(t.name())) fail("Topic names must be unique");
            if (t.partitions() < 1 || t.partitions() > 10) fail("partitions must be 1–10");
            if (t.replicationFactor() < 1 || t.replicationFactor() > c.brokers().size()) fail("replicationFactor cannot exceed brokers");
        }
        var topicIds = Set.copyOf(ids); ids.clear(); names.clear();
        for (var g : c.groups()) { text(g, "group ID"); if (!names.add(g)) fail("Group IDs must be unique"); }
        for (var p : c.producers()) {
            identity(p.id(), p.name(), ids, "producer"); rate(p.rate());
            if (!topicIds.contains(p.topicId())) fail("Producer target topic does not exist");
            if (p.key() == null || p.payload() == null || p.key().length() > 1000 || p.payload().length() > 4000) fail("Producer key/payload is missing or too long");
        }
        ids.clear();
        for (var consumer : c.consumers()) {
            identity(consumer.id(), consumer.name(), ids, "consumer"); rate(consumer.rate());
            if (!names.contains(consumer.groupId())) fail("Consumer group ID does not exist");
            size(consumer.topicIds(), 1, 3, "subscribed topics");
            if (!topicIds.containsAll(consumer.topicIds()) || new HashSet<>(consumer.topicIds()).size() != consumer.topicIds().size()) fail("Consumer subscriptions must reference distinct existing topics");
        }
        if (c.commitIntervalTicks() < 1 || c.commitIntervalTicks() > 600) fail("commitIntervalTicks must be 1–600");
        if (c.retentionLimit() < 1 || c.retentionLimit() > 500) fail("retentionLimit must be 1–500");
    }
    private static void size(List<?> list, int min, int max, String field) {
        if (list == null || list.size() < min || list.size() > max || list.stream().anyMatch(Objects::isNull)) fail(field + " must contain " + min + "–" + max + " entries");
    }
    private static void text(String value, String field) {
        if (value == null || value.isBlank() || !value.equals(value.trim()) || value.length() > 80) fail(field + " must be 1–80 characters without surrounding spaces");
    }
    private static void identity(String id, String name, Set<String> ids, String field) {
        text(id, field + " ID"); text(name, field + " name");
        if (!id.matches("[A-Za-z0-9_-]+") || !ids.add(id)) fail(field + " IDs must be unique and contain only letters, digits, _ or -");
    }
    private static void rate(double rate) {
        if (!Double.isFinite(rate) || rate < .25 || rate > 10 || Math.abs(rate * 4 - Math.rint(rate * 4)) > .0001) fail("rate must be 0.25–10 in 0.25 increments");
    }
    private static void fail(String message) { throw new SimulationException(message); }

    public synchronized boolean requiresReset(Configuration next) {
        if (!configuration.brokers().stream().map(Configuration.Broker::id).toList().equals(next.brokers().stream().map(Configuration.Broker::id).toList())) return true;
        for (var old : configuration.topics()) {
            var topic = next.topics().stream().filter(t -> t.id().equals(old.id())).findFirst();
            if (topic.isEmpty() || topic.get().partitions() < old.partitions() || topic.get().replicationFactor() != old.replicationFactor()) return true;
        }
        return false;
    }
    public synchronized void apply(Configuration next, boolean resetAllowed, Long expectedRevision) {
        validate(next);
        if (expectedRevision != null && expectedRevision != configRevision) throw new SimulationException("Configuration changed in another tab. Reload the configuration.", true);
        boolean resetNeeded = requiresReset(next);
        if (resetNeeded && !resetAllowed) throw new SimulationException("This change requires a reset of messages and offsets.", true);
        var old = configuration;
        scenario = scenarioPhase = 0;
        // Defensive collection copies: callers cannot mutate the active configuration after validation.
        configuration = new Configuration(1, List.copyOf(next.brokers()), List.copyOf(next.topics()), List.copyOf(next.producers()),
                List.copyOf(next.groups()), next.consumers().stream().map(c -> new Configuration.Consumer(c.id(), c.name(), c.groupId(), List.copyOf(c.topicIds()), c.rate())).toList(),
                next.commitIntervalTicks(), next.retentionLimit(), next.autoCommit());
        configRevision++;
        if (resetNeeded || resetAllowed) { reset(); return; }
        consumers.keySet().retainAll(configuration.consumers().stream().map(Configuration.Consumer::id).toList());
        for (var c : configuration.consumers()) consumers.computeIfAbsent(c.id(), ignored -> new ConsumerState());
        for (var g : configuration.groups()) groups.computeIfAbsent(g, ignored -> new Group());
        addPartitions();
        var affectedGroups = new LinkedHashSet<String>();
        for (var previous : old.consumers()) {
            var current = configuration.consumers().stream().filter(c -> c.id().equals(previous.id())).findFirst().orElse(null);
            if (current == null || !current.groupId().equals(previous.groupId()) || !current.topicIds().equals(previous.topicIds())) {
                affectedGroups.add(previous.groupId());
                if (current != null) affectedGroups.add(current.groupId());
            }
        }
        configuration.consumers().stream().filter(c -> old.consumers().stream().noneMatch(p -> p.id().equals(c.id())))
                .forEach(c -> affectedGroups.add(c.groupId()));
        var changedTopics = configuration.topics().stream().filter(t -> old.topics().stream()
                .noneMatch(previous -> previous.id().equals(t.id()) && previous.partitions() == t.partitions()))
                .map(Configuration.Topic::id).collect(java.util.stream.Collectors.toSet());
        configuration.consumers().stream().filter(c -> c.topicIds().stream().anyMatch(changedTopics::contains))
                .forEach(c -> affectedGroups.add(c.groupId()));
        if (!affectedGroups.isEmpty()) rebalance(affectedGroups);
        producerCredit.keySet().retainAll(configuration.producers().stream().map(Configuration.Producer::id).toList());
        reconcilePending();
        retain(); revision++;
        emit("CONFIGURATION", null, null, "", "", "", null, "Configuration applied; retained records and offsets preserved.");
    }
    public synchronized void reset() {
        running = false; tick = messageSequence = 0; epoch++; revision++;
        scenarioPhase = 0; scenarioBroker = null;
        reservedSequence=0; pending.clear(); manualTargets.clear(); manualBurst=manualSuspended=false; playbackPaused=true; manualStatus="";
        brokers.clear(); partitions.clear(); consumers.clear(); groups.clear(); producerCredit.clear(); roundRobin.clear(); events.clear();
        configuration.brokers().forEach(b -> brokers.put(b.id(), true));
        configuration.consumers().forEach(c -> consumers.put(c.id(), new ConsumerState()));
        configuration.groups().forEach(g -> groups.put(g, new Group()));
        addPartitions(); rebalance(); reconcilePending();
        emit("RESET", null, null, "", "", "", null, "Reset: logs and offsets cleared. Configuration retained. Simulation paused.");
    }
    private void addPartitions() {
        int index = 0;
        for (var topic : configuration.topics()) for (int n = 0; n < topic.partitions(); n++, index++) {
            String key = topic.id() + ":" + n;
            if (partitions.containsKey(key)) continue;
            var p = new Partition(topic.id(), n);
            for (int r = 0; r < topic.replicationFactor(); r++) {
                String id = configuration.brokers().get((index + r) % configuration.brokers().size()).id();
                p.replicas.put(id, new Replica(id));
            }
            p.leader = p.replicas.keySet().iterator().next(); partitions.put(key, p);
            for (var replica : p.replicas.values()) replica.inSync = Boolean.TRUE.equals(brokers.get(replica.brokerId));
            elect(p);
        }
    }

    public synchronized void command(Command command) {
        if (command == null || command.type() == null) fail("Command type is required");
        switch (command.type()) {
            case "START", "RESUME" -> { playbackPaused=false; if (manualBurst) manualSuspended=false; else running = true; }
            case "PAUSE" -> { playbackPaused=true; running = false; if (manualBurst) manualSuspended=true; }
            case "STEP" -> { if (running) throw new SimulationException("Pause before stepping.", true); playbackPaused=false; advance(); }
            case "RESET" -> {
                if(scenario>0) {
                    int selected=scenario; apply(scenarioConfiguration(selected),true,null); scenario=selected;
                } else reset();
            }
            case "PRODUCE" -> requestProduce(producer(command.targetId()), command.key(), command.payload());
            case "BROKER_STOP", "BROKER_RESTART" -> {
                if (!brokers.containsKey(command.targetId())) fail("Unknown broker");
                boolean online = command.type().equals("BROKER_RESTART");
                brokers.put(command.targetId(), online);
                emit(online ? "ONLINE" : "OFFLINE", null, null, "", "broker:" + command.targetId(), "", null, brokerName(command.targetId()) + (online ? " restarted; replicas must catch up." : " stopped; evaluating leaders."));
                for (var p : partitions.values()) {
                    var replica = p.replicas.get(command.targetId());
                    if (replica != null) replica.inSync = online && replica.end == p.end;
                    elect(p);
                }
            }
            case "CONSUMER_STOP", "CONSUMER_RESTART", "CONSUMER_PAUSE", "CONSUMER_RESUME", "FAIL" -> {
                var c = consumer(command.targetId()); var state = consumers.get(c.id());
                switch (command.type()) {
                    case "CONSUMER_STOP" -> { state.online = false; state.work = null; state.cursors.clear(); state.failNext = false; rebalance(Set.of(c.groupId())); }
                    case "CONSUMER_RESTART" -> { state.online = true; state.paused = false; rebalance(Set.of(c.groupId())); }
                    case "CONSUMER_PAUSE" -> state.paused = true;
                    case "CONSUMER_RESUME" -> state.paused = false;
                    case "FAIL" -> { if (!state.online) fail("Restart this consumer before triggering a failure"); state.failNext = true; }
                }
                emit(command.type().equals("CONSUMER_STOP") ? "OFFLINE" : "CONTROL", null, null, c.groupId(), "consumer:" + c.id(), "", null, c.name() + ": " + command.type().toLowerCase(Locale.ROOT).replace('_', ' '));
            }
            case "COMMIT" -> { if (command.targetId() == null || command.targetId().isEmpty()) configuration.consumers().forEach(this::commit); else commit(consumer(command.targetId())); }
            case "REBALANCE" -> rebalance();
            default -> fail("Unknown command: " + command.type());
        }
        revision++;
    }
    public synchronized void advanceIfRunning() { if (shouldAdvance()) advance(); }
    public synchronized boolean shouldAdvance() { return running || (manualBurst && !manualSuspended && manualRunnable()); }
    public synchronized void pacedAdvance(long expectedEpoch, long expectedTick, long completedEventId) {
        if (expectedEpoch != epoch || expectedTick != tick || completedEventId < eventSequence)
            throw new SimulationException("Playback state changed; refresh before advancing.", true);
        if (shouldAdvance()) advance();
    }
    public synchronized void advance() {
        tick++;
        scenarioActions();
        for (var p : partitions.values()) {
            elect(p);
            if (p.leader == null) continue;
            var leader = p.replicas.get(p.leader);
            for (var replica : p.replicas.values()) if (Boolean.TRUE.equals(brokers.get(replica.brokerId)) && !replica.inSync) {
                replica.log.clear(); replica.log.addAll(leader.log); replica.end = p.end; replica.inSync = true;
                emit("RECOVERY", null, p, "", p.node(p.leader), p.node(replica.brokerId), null, brokerName(replica.brokerId) + " replica caught up for " + partitionName(p));
            }
        }
        completeRebalances();
        dispatchRequested();
        for (var producer : configuration.producers()) if (producer.automatic() && !manualBurst) {
            int credit = producerCredit.getOrDefault(producer.id(), 0) + (int)Math.round(producer.rate() * 4);
            if (credit >= 40) { publishHead(producer); credit -= 40; }
            producerCredit.put(producer.id(), credit);
        }
        for (var c : configuration.consumers()) process(c);
        if (configuration.autoCommit() && tick % configuration.commitIntervalTicks() == 0) configuration.consumers().forEach(this::commit);
        retain(); updateManualFlow(); revision++;
    }
    private void elect(Partition p) {
        if (p.leader != null && Boolean.TRUE.equals(brokers.get(p.leader)) && p.replicas.get(p.leader).end == p.end) return;
        String previous = p.leader;
        p.leader = p.replicas.values().stream().filter(r -> Boolean.TRUE.equals(brokers.get(r.brokerId)) && r.inSync && r.end == p.end)
                .map(r -> r.brokerId).findFirst().orElse(null);
        if (!Objects.equals(previous, p.leader)) emit(p.leader == null ? "UNAVAILABLE" : "ELECTION", null, p, "", "", p.leader == null ? "" : p.node(p.leader), null,
                partitionName(p) + (p.leader == null ? " unavailable: no eligible in-sync replica." : " leader is now " + brokerName(p.leader) + ". Acknowledged records preserved."));
    }
    private boolean publishHead(Configuration.Producer producer) {
        var head = pending.get(producer.id()).getFirst();
        String key = head.key, payload = head.payload;
        var topic = topic(producer.topicId());
        String rrKey = producer.id() + ":" + topic.id();
        int number = key.isEmpty() ? Math.floorMod(roundRobin.getOrDefault(rrKey, 0), topic.partitions()) : keyedPartition(key, topic.partitions());
        var p = partitions.get(topic.id() + ":" + number);
        if (p.leader == null) {
            if (!head.status.startsWith("Waiting")) emit("FAILED", null, p, "", "producer:" + producer.id(), "", null, producer.name() + " waiting: " + partitionName(p) + " has no leader. Pending message retained; no acknowledgement or offset allocated.");
            head.status="Waiting for partition leader"; return false;
        }
        if (key.isEmpty()) roundRobin.put(rrKey, (number + 1) % topic.partitions());
        var m = new Message(head.id, p.end, key, payload, producer.id(), tick);
        messageSequence++;
        boolean requested = head.requested;
        pending.get(producer.id()).removeFirst(); refill(producer);
        emit("PRODUCED", m, p, "", "producer:" + producer.id(), p.node(p.leader), null, producer.name() + " → " + partitionName(p) + " offset " + m.offset());
        var leader = p.replicas.get(p.leader); leader.log.add(m); leader.end = p.end + 1;
        for (var replica : p.replicas.values()) if (!replica.brokerId.equals(p.leader) && Boolean.TRUE.equals(brokers.get(replica.brokerId)) && replica.inSync) {
            replica.log.add(m); replica.end = p.end + 1;
            emit("REPLICATED", m, p, "", p.node(p.leader), p.node(replica.brokerId), null, m.id() + " replicated to " + brokerName(replica.brokerId) + " / " + partitionName(p));
        }
        p.end++;
        emit("ACKNOWLEDGED", m, p, "", p.node(p.leader), "producer:" + producer.id(), null, m.id() + " acknowledged by all current ISR; min.insync.replicas=1.");
        retainPartition(p);
        if (requested && manualBurst) {
            var subscribed = configuration.consumers().stream().filter(c -> c.topicIds().contains(producer.topicId()))
                    .map(Configuration.Consumer::groupId).collect(java.util.stream.Collectors.toSet());
            manualTargets.add(new ManualTarget(m,p.key(),subscribed));
        }
        return true;
    }
    private void reconcilePending() {
        pending.keySet().retainAll(configuration.producers().stream().map(Configuration.Producer::id).toList());
        for (var p : configuration.producers()) {
            pending.computeIfAbsent(p.id(), ignored -> new ArrayDeque<>());
            for (var m : pending.get(p.id())) if (!m.requested) { m.key=p.key(); m.payload=p.payload(); m.status="Ready template"; }
        }
        // Round-robin reservation is deterministic. IDs identify application messages, not offsets.
        for (int i=0;i<10;i++) for (var p : configuration.producers()) if (pending.get(p.id()).size()<10)
            pending.get(p.id()).addLast(new Pending("M"+(++reservedSequence),p.key(),p.payload()));
    }
    private void refill(Configuration.Producer p) {
        while (pending.get(p.id()).size()<10) pending.get(p.id()).addLast(new Pending("M"+(++reservedSequence),p.key(),p.payload()));
    }
    private void requestProduce(Configuration.Producer p, String key, String payload) {
        if ((key!=null && key.length()>1000) || (payload!=null && payload.length()>4000)) fail("Message key/payload is too long");
        var next = pending.get(p.id()).stream().filter(m -> !m.requested).findFirst()
                .orElseThrow(() -> new SimulationException("Ten publish requests are already pending for this producer.",true));
        next.key=key==null?p.key():key; next.payload=payload==null?p.payload():payload;
        next.requested=true; next.status="Publish requested";
        playbackPaused=false;
        if (!running) { manualBurst=true; manualSuspended=false; manualStatus="Manual message journey"; }
        emit("QUEUED",null,null,"","producer:"+p.id(),"",null,next.id+" queued by "+p.name()+"; waiting for paced dispatch.");
        updateManualFlow();
    }
    synchronized void dispatchRequested() {
        for (var p : configuration.producers()) if (pending.get(p.id()).getFirst().requested) publishHead(p);
    }
    private boolean targetComplete(ManualTarget target) {
        var p=partitions.get(target.partitionKey());
        return p==null || target.message().offset()<p.start || target.groups().stream().allMatch(id ->
            !groups.containsKey(id) || groups.get(id).processed.getOrDefault(target.partitionKey(),Set.of()).contains(target.message().offset()));
    }
    private boolean manualRunnable() {
        for (var p : configuration.producers()) {
            var head=pending.get(p.id()).getFirst();
            if (head.requested) {
                int n=head.key.isEmpty()?roundRobin.getOrDefault(p.id()+":"+p.topicId(),0)%topic(p.topicId()).partitions():keyedPartition(head.key,topic(p.topicId()).partitions());
                if (partitions.get(p.topicId()+":"+n).leader!=null) return true;
            }
        }
        for (var target : manualTargets) if (!targetComplete(target)) for (var id : target.groups()) {
            var g=groups.get(id); if (g==null || g.processed.getOrDefault(target.partitionKey(),Set.of()).contains(target.message().offset())) continue;
            if (g.rebalanceTicks>0) return true;
            var owner=g.assignments.get(target.partitionKey()); var c=consumers.get(owner); var p=partitions.get(target.partitionKey());
            if (c!=null && c.online && !c.paused && (p.leader!=null || c.work!=null)) return true;
        }
        return false;
    }
    private void updateManualFlow() {
        if (!manualBurst) return;
        boolean stored=manualTargets.stream().anyMatch(t -> t.groups().isEmpty());
        manualTargets.removeIf(this::targetComplete);
        boolean requested=pending.values().stream().flatMap(Collection::stream).anyMatch(m -> m.requested);
        if (!requested && manualTargets.isEmpty()) { manualBurst=false; manualSuspended=false; manualStatus=stored?"Stored: no subscribed consumer group":"Manual journey complete; paused"; }
        else manualStatus=manualRunnable()?"Manual message journey":waitingForLeader()?"Waiting for partition leader":"Waiting for eligible consumer";
    }
    private boolean waitingForLeader() {
        for(var p:configuration.producers()) {
            var head=pending.get(p.id()).getFirst();
            if(!head.requested)continue;
            int n=head.key.isEmpty()?roundRobin.getOrDefault(p.id()+":"+p.topicId(),0)%topic(p.topicId()).partitions():keyedPartition(head.key,topic(p.topicId()).partitions());
            if(partitions.get(p.topicId()+":"+n).leader==null) {head.status="Waiting for partition leader";return true;}
        }
        for(var target:manualTargets) if(!targetComplete(target)) {
            var p=partitions.get(target.partitionKey());
            if(p==null || p.leader!=null)continue;
            for(var id:target.groups()) {
                var g=groups.get(id);if(g==null)continue;
                var c=consumers.get(g.assignments.get(target.partitionKey()));
                if(c==null || c.work==null)return true;
            }
        }
        return false;
    }
    private void rebalance() {
        rebalance(new LinkedHashSet<>(groups.keySet()));
    }
    private void rebalance(Set<String> affectedGroups) {
        for (var entry : groups.entrySet()) {
            if (!affectedGroups.contains(entry.getKey())) continue;
            var g = entry.getValue(); g.generation++; g.rebalanceTicks = 1; g.assignments.clear();
            emit("REBALANCE", null, null, entry.getKey(), "", "", null, entry.getKey() + " generation " + g.generation + ": assignments revoked; uncommitted records may be redelivered.");
        }
        configuration.consumers().stream().filter(c -> affectedGroups.contains(c.groupId())).forEach(c -> {
            var state = consumers.get(c.id()); state.work = null; state.cursors.clear();
        });
    }
    private void completeRebalances() {
        for (var entry : groups.entrySet()) {
            var g = entry.getValue();
            if (g.rebalanceTicks == 0 || --g.rebalanceTicks > 0) continue;
            var members = configuration.consumers().stream().filter(c -> c.groupId().equals(entry.getKey()) && consumers.get(c.id()).online)
                    .sorted(Comparator.comparing(Configuration.Consumer::id)).toList();
            int position = 0;
            for (var p : partitions.values()) {
                if (members.isEmpty()) break;
                Configuration.Consumer owner = null;
                for (int n = 0; n < members.size(); n++) {
                    var candidate = members.get((position + n) % members.size());
                    if (candidate.topicIds().contains(p.topicId)) { owner = candidate; position = (position + n + 1) % members.size(); break; }
                }
                if (owner == null) continue;
                g.assignments.put(p.key(), owner.id());
                long offset = g.committed.getOrDefault(p.key(), 0L);
                if (offset < p.start) emit("RETENTION", null, p, entry.getKey(), "", "consumer:" + owner.id(), null, entry.getKey() + " offset " + offset + " expired; resetting fetch position to earliest retained " + p.start);
                consumers.get(owner.id()).cursors.put(p.key(), new Cursor(Math.max(offset, p.start)));
            }
            emit("ASSIGNED", null, null, entry.getKey(), "", "", null, entry.getKey() + " rebalance complete: " + g.assignments.size() + " partitions assigned exclusively to subscribed members.");
        }
    }
    private void process(Configuration.Consumer c) {
        var state = consumers.get(c.id()); var group = groups.get(c.groupId());
        if (!state.online || state.paused || group.rebalanceTicks > 0) return;
        if (state.work == null && !state.cursors.isEmpty()) {
            var keys = new ArrayList<>(state.cursors.keySet());
            for (int i = 0; i < keys.size(); i++) {
                int index = (state.rotation + i) % keys.size();
                var p = partitions.get(keys.get(index)); var cursor = state.cursors.get(p.key());
                if (p.leader == null) continue;
                if (cursor.fetched < p.start) {
                    emit("RETENTION", null, p, c.groupId(), "", "consumer:" + c.id(), null, c.name() + " fetch offset expired; skipped to earliest retained " + p.start);
                    cursor.fetched = cursor.completed = p.start;
                }
                Message message = p.replicas.get(p.leader).log.stream().filter(m -> m.offset() == cursor.fetched).findFirst().orElse(null);
                if (message == null) continue;
                state.work = new Work(p, message); cursor.fetched = message.offset() + 1; state.rotation = (index + 1) % keys.size();
                emit("DELIVERED", message, p, c.groupId(), p.node(p.leader), "consumer:" + c.id(), null, message.id() + " polled by " + c.name() + " in " + c.groupId());
                if (group.processed.getOrDefault(p.key(), Set.of()).contains(message.offset())) {
                    state.redeliveries++;
                    emit("REDELIVERED", message, p, c.groupId(), "consumer:" + c.id(), "", null, message.id() + " redelivered to " + c.name() + ": previously processed, not committed. Duplicate business work is possible.");
                }
                emit("PROCESSING", message, p, c.groupId(), "consumer:" + c.id(), "", null, c.name() + " processing " + message.id() + " / " + partitionName(p));
                break;
            }
        }
        var work = state.work;
        if (work == null) return;
        if (work.failed) {
            work.failed = false; state.retries++;
            emit("RETRY", work.message, work.partition, c.groupId(), "consumer:" + c.id(), "consumer:" + c.id(), null, c.name() + " retrying " + work.message.id() + " at the same offset.");
        }
        work.credit += (int)Math.round(c.rate() * 4);
        if (state.failNext) {
            state.failNext = false; work.credit = 0; work.failed = true;
            emit("FAILED", work.message, work.partition, c.groupId(), "consumer:" + c.id(), "", null, c.name() + " failed " + work.message.id() + "; no offset committed. Retry next tick."); return;
        }
        if (work.credit < 40) return;
        state.cursors.get(work.partition.key()).completed = work.message.offset() + 1;
        group.processed.computeIfAbsent(work.partition.key(), ignored -> new HashSet<>()).add(work.message.offset());
        state.successes++;
        emit("PROCESSED", work.message, work.partition, c.groupId(), "consumer:" + c.id(), "complete:" + c.id(), null, c.name() + " completed " + work.message.id() + " at offset " + work.message.offset() + "; not yet committed.");
        state.work = null;
    }
    private void commit(Configuration.Consumer c) {
        var state = consumers.get(c.id()); var group = groups.get(c.groupId());
        if (!state.online || state.paused || group.rebalanceTicks > 0) return;
        if (brokers.values().stream().noneMatch(Boolean.TRUE::equals)) {
            if (state.cursors.entrySet().stream().anyMatch(e -> e.getValue().completed > group.committed.getOrDefault(e.getKey(), 0L)))
                emit("COMMIT_FAILED", null, null, c.groupId(), "consumer:" + c.id(), "", null,
                        c.name() + " could not commit: every broker is offline. Completed work remains uncommitted; retry when offset storage is available.");
            return;
        }
        for (var entry : state.cursors.entrySet()) {
            long next = entry.getValue().completed;
            if (!c.id().equals(group.assignments.get(entry.getKey())) || next <= group.committed.getOrDefault(entry.getKey(), 0L)) continue;
            group.committed.put(entry.getKey(), next);
            emit("COMMITTED", null, partitions.get(entry.getKey()), c.groupId(), "consumer:" + c.id(), "offset-store", next,
                    c.name() + " → " + c.groupId() + " / " + partitionName(partitions.get(entry.getKey())) + ": committed next offset " + next + " ✓");
        }
    }
    private void retain() { partitions.values().forEach(this::retainPartition); }
    private void retainPartition(Partition p) {
        if (p.leader == null) return;
        var leader = p.replicas.get(p.leader);
        long previous = p.start;
        if (leader.log.size() > configuration.retentionLimit()) p.start = leader.log.get(leader.log.size() - configuration.retentionLimit()).offset();
        for (var r : p.replicas.values()) if (Boolean.TRUE.equals(brokers.get(r.brokerId)) && r.inSync) r.log.removeIf(m -> m.offset() < p.start);
        for (var g : groups.values()) g.processed.getOrDefault(p.key(), Collections.emptySet()).removeIf(o -> o < p.start);
        if (p.start > previous) emit("RETENTION", null, p, "", "", "", null, partitionName(p) + " retained offsets " + p.start + "–" + (p.end - 1) + "; removed " + (p.start - previous) + " records independently of consumption.");
    }

    public synchronized void scenario(int id) {
        var next = scenarioConfiguration(id);
        apply(next, true, null); scenario = id; running = true; playbackPaused=false;
        emit("SCENARIO", null, null, "", "", "", null, Scenarios.ALL.get(id - 1).explanation());
    }
    private Configuration scenarioConfiguration(int id) {
        var next=Scenarios.configuration(id);
        return id==6?new Configuration(1,next.brokers(),next.topics(),next.producers(),next.groups(),next.consumers(),600,50,true):next;
    }
    private void scenarioActions() {
        if (scenario == 6) {
            var state = consumers.get("c1");
            if (scenarioPhase == 0 && state.successes > 0) {
                command(new Command("CONSUMER_STOP", "c1", null, null, null)); scenarioPhase = 1; scenarioActionTick = tick;
            } else if (scenarioPhase == 1 && tick >= scenarioActionTick + 10) {
                command(new Command("CONSUMER_RESTART", "c1", null, null, null)); scenarioPhase = 2;
            } else if (scenarioPhase == 2 && state.redeliveries > 0 && state.work == null) { scenarioPhase = 3; running = false; }
        } else if (scenario == 7 && scenarioPhase == 0 && partitions.values().stream().anyMatch(p -> p.end > 0)) {
            scenarioBroker = partitions.values().stream().filter(p -> p.end > 0).findFirst().orElseThrow().leader;
            command(new Command("BROKER_STOP", scenarioBroker, null, null, null)); scenarioPhase = 1;
        } else if (scenario == 10 && scenarioPhase == 0 && consumers.values().stream().anyMatch(c -> c.successes >= 2)) {
            var list = new ArrayList<>(configuration.consumers());
            list.add(new Configuration.Consumer("c3", "ResultsService-3", "results-group", List.of("t1"), 1));
            int activeScenario=scenario;
            apply(new Configuration(1, configuration.brokers(), configuration.topics(), configuration.producers(), configuration.groups(), list,
                    configuration.commitIntervalTicks(), configuration.retentionLimit(), configuration.autoCommit()), false, null); scenario=activeScenario; scenarioPhase = 1;
        }
    }

    private Configuration.Topic topic(String id) { return configuration.topics().stream().filter(t -> t.id().equals(id)).findFirst().orElseThrow(() -> new SimulationException("Unknown topic")); }
    private Configuration.Producer producer(String id) { return configuration.producers().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow(() -> new SimulationException("Unknown producer")); }
    private Configuration.Consumer consumer(String id) { return configuration.consumers().stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow(() -> new SimulationException("Unknown consumer")); }
    private String brokerName(String id) { return configuration.brokers().stream().filter(b -> b.id().equals(id)).map(Configuration.Broker::name).findFirst().orElse(id); }
    private String partitionName(Partition p) { return topic(p.topicId).name() + " / P" + p.number; }
    private String nodeName(String id) {
        if (id == null || id.isEmpty()) return "";
        if (id.equals("offset-store")) return "Simulated __consumer_offsets";
        if (id.startsWith("producer:")) return producer(id.substring(9)).name();
        if (id.startsWith("consumer:") || id.startsWith("complete:")) return consumer(id.substring(9)).name() + (id.startsWith("complete:") ? " completed" : "");
        if (id.startsWith("broker:")) return brokerName(id.substring(7));
        if (id.startsWith("replica:")) { var parts = id.split(":"); return partitionName(partitions.get(parts[1] + ":" + parts[2])) + " @ " + brokerName(parts[3]); }
        return id;
    }
    private void emit(String stage, Message message, Partition p, String groupId, String source, String destination, Long committed, String description) {
        var event = new Event(++eventSequence, tick, epoch, stage, message == null ? "" : message.id(), p == null ? "" : p.key(),
                p == null ? "" : topic(p.topicId).name(), groupId, source, destination, nodeName(source), nodeName(destination),
                message == null ? null : message.offset(), committed, groups.containsKey(groupId) ? groups.get(groupId).generation : 0, description, message);
        events.add(event); while (events.size() > 2000) events.removeFirst();
    }
    public synchronized Map<String, Object> snapshot(long afterEventId) {
        var brokerViews = configuration.brokers().stream().map(b -> map("id", b.id(), "name", b.name(), "online", brokers.get(b.id()), "replicas", partitions.values().stream()
                .filter(p -> p.replicas.containsKey(b.id())).map(p -> {
                    var r = p.replicas.get(b.id());
                    return map("key", p.key(), "topicId", p.topicId, "topicName", topic(p.topicId).name(), "partition", p.number,
                            "nodeId", p.node(b.id()), "leader", b.id().equals(p.leader), "leaderId", p.leader, "inSync", r.inSync,
                            "available", p.leader != null, "logStart", p.start, "replicaStart", r.log.isEmpty() ? r.end : r.log.get(0).offset(), "logEnd", p.end, "replicaEnd", r.end,
                            "messages", List.copyOf(r.log.subList(Math.max(0, r.log.size() - 8), r.log.size())));
                }).toList())).toList();
        var groupViews = configuration.groups().stream().map(id -> {
            var group = groups.get(id);
            var members = configuration.consumers().stream().filter(c -> c.groupId().equals(id)).toList();
            var topicIds = members.stream().flatMap(c -> c.topicIds().stream()).collect(java.util.stream.Collectors.toSet());
            var offsets = partitions.values().stream().filter(p -> topicIds.contains(p.topicId)).map(p -> {
                String owner = group.assignments.get(p.key()); var state = consumers.get(owner);
                var cursor = state == null ? null : state.cursors.get(p.key());
                long committed = group.committed.getOrDefault(p.key(), 0L);
                return map("key", p.key(), "topicName", topic(p.topicId).name(), "partition", p.number, "ownerId", owner,
                        "ownerName", owner == null ? "Unassigned" : consumer(owner).name(), "committedNext", group.committed.get(p.key()),
                        "fetchedNext", cursor == null ? null : cursor.fetched, "completedNext", cursor == null ? null : cursor.completed,
                        "logStart", p.start, "logEnd", p.end, "lag", p.end - committed, "expiredBacklog", Math.max(0, p.start - committed),
                        "processingBacklog", p.end - (cursor == null ? Math.max(p.start, committed) : cursor.completed), "available", p.leader != null);
            }).toList();
            var memberViews = members.stream().map(c -> {
                var s = consumers.get(c.id());
                return map("id", c.id(), "name", c.name(), "groupId", c.groupId(), "topicIds", c.topicIds(), "rate", c.rate(),
                        "online", s.online, "paused", s.paused, "assignments", List.copyOf(s.cursors.keySet()),
                        "status", !s.online ? "OFFLINE" : s.paused ? "PAUSED" : group.rebalanceTicks > 0 ? "REBALANCING" : s.work != null ? s.work.failed ? "FAILED" : "PROCESSING" : s.cursors.isEmpty() ? "IDLE" : "WAITING",
                        "processing", s.work == null ? null : map("message", s.work.message, "partitionKey", s.work.partition.key(), "progress", Math.min(1d, s.work.credit / 40d)),
                        "successes", s.successes, "retries", s.retries, "redeliveries", s.redeliveries);
            }).toList();
            return map("id", id, "generation", group.generation, "rebalancing", group.rebalanceTicks > 0,
                    "consumers", memberViews, "offsets", offsets, "lag", offsets.stream().mapToLong(o -> (long)o.get("lag")).sum());
        }).toList();
        var eventList = events.stream().filter(e -> e.id() > afterEventId).toList();
        return map("tick", tick, "tickMillis", 100, "revision", revision, "configRevision", configRevision, "epoch", epoch,
                "running", running, "configuration", configuration, "brokers", brokerViews, "groups", groupViews,
                "events", eventList, "latestEventId", eventSequence, "eventGap", !events.isEmpty() && afterEventId > 0 && afterEventId < events.getFirst().id() - 1,
                "scenarioId", scenario, "scenarioPhase", scenarioPhase, "messageCount", messageSequence,
                "producerQueues",configuration.producers().stream().map(p -> map("producerId",p.id(),"messages",pending.get(p.id()).stream().map(Pending::view).toList())).toList(),
                "manualFlow",manualBurst, "manualSuspended",manualSuspended, "canAdvance",shouldAdvance(), "manualStatus",manualStatus,"playbackPaused",playbackPaused);
    }
    public synchronized Map<String, Object> history(String topicId, int number, String brokerId, int page) {
        var p = partitions.get(topicId + ":" + number);
        if (p == null) fail("Unknown partition");
        var r = p.replicas.get(brokerId == null ? p.leader : brokerId);
        if (r == null) fail("Select a valid replica; this partition may be unavailable");
        int pages = Math.max(1, (r.log.size() + 19) / 20); int safePage = Math.max(0, Math.min(page, pages - 1));
        int start = safePage * 20;
        return map("key", p.key(), "brokerId", r.brokerId, "page", safePage, "pages", pages, "total", r.log.size(),
                "messages", List.copyOf(r.log.subList(start, Math.min(start + 20, r.log.size()))));
    }
    public static Map<String, Object> map(Object... entries) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < entries.length; i += 2) result.put((String)entries[i], entries[i + 1]);
        return Collections.unmodifiableMap(result);
    }

    /** Same unsigned Murmur2 selection used by the Java Kafka producer for serialized keys. */
    public static int keyedPartition(String key, int partitionCount) {
        byte[] data = key.getBytes(StandardCharsets.UTF_8); int length = data.length;
        int h = 0x9747b28c ^ length, m = 0x5bd1e995;
        int offset = 0;
        while (length >= 4) {
            int k = (data[offset] & 0xff) | (data[offset + 1] & 0xff) << 8 | (data[offset + 2] & 0xff) << 16 | (data[offset + 3] & 0xff) << 24;
            k *= m; k ^= k >>> 24; k *= m; h *= m; h ^= k; offset += 4; length -= 4;
        }
        if (length == 3) h ^= (data[offset + 2] & 0xff) << 16;
        if (length >= 2) h ^= (data[offset + 1] & 0xff) << 8;
        if (length >= 1) { h ^= data[offset] & 0xff; h *= m; }
        h ^= h >>> 13; h *= m; h ^= h >>> 15;
        return (h & 0x7fffffff) % partitionCount;
    }
}
