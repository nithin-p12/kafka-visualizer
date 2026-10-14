package com.kafka.visualizer.simulation;

import java.util.List;

/** Configuration files contain definitions only, never runtime messages or offsets. */
public record Configuration(int schemaVersion, List<Broker> brokers, List<Topic> topics,
                            List<Producer> producers, List<String> groups, List<Consumer> consumers,
                            int commitIntervalTicks, int retentionLimit, boolean autoCommit) {
    public record Broker(String id, String name) {}
    public record Topic(String id, String name, int partitions, int replicationFactor) {}
    public record Producer(String id, String name, String topicId, double rate,
                           boolean automatic, String key, String payload) {}
    public record Consumer(String id, String name, String groupId, List<String> topicIds, double rate) {}

    public static Configuration defaults() {
        return preset(3, 3, 2, List.of("results-group", "results-group", "results-group"), 1, 1);
    }

    public static Configuration preset(int brokerCount, int partitions, int replication,
                                       List<String> memberships, double producerRate, double consumerRate) {
        var brokers = java.util.stream.IntStream.rangeClosed(1, brokerCount)
                .mapToObj(i -> new Broker("b" + i, "Broker-" + i)).toList();
        var consumers = java.util.stream.IntStream.range(0, memberships.size())
                .mapToObj(i -> new Consumer("c" + (i + 1), "ResultsService-" + (i + 1),
                        memberships.get(i), List.of("t1"), consumerRate)).toList();
        return new Configuration(1, brokers, List.of(new Topic("t1", "execution-completed", partitions, replication)),
                List.of(new Producer("p1", "ExecutionService", "t1", producerRate, true, "", "Execution completed")),
                memberships.stream().distinct().toList(), consumers, 40, 50, true);
    }
}
