package com.kafka.visualizer.simulation;

import java.util.List;

public final class Scenarios {
    private Scenarios() {}
    public record Scenario(int id, String name, String explanation) {}
    public static final List<Scenario> ALL = List.of(
        new Scenario(1, "One partition · one consumer", "Watch increasing partition offsets, processing, commits and records remaining in the log."),
        new Scenario(2, "Three partitions · three consumers", "Each consumer in results-group owns one partition. Replicas do not add consumer parallelism."),
        new Scenario(3, "Three partitions · five consumers", "Exactly three consumers own partitions; two remain idle in the same group."),
        new Scenario(4, "Three partitions · two consumers", "One consumer owns two partitions; the other owns one."),
        new Scenario(5, "Independent consumer groups", "results-group, reports-group and audit-group each receive every partition independently."),
        new Scenario(6, "Crash before offset commit", "The script processes offset 0, crashes before committing, restarts and highlights its redelivery."),
        new Scenario(7, "Leader failover · RF 2", "After the first replicated record, its leader stops. An in-sync follower takes over without losing the acknowledged record."),
        new Scenario(8, "Growing consumer lag", "The producer sends 10 records/s while one consumer processes 0.5 records/s. Amber lag grows."),
        new Scenario(9, "Same key · ordered partition", "Every record uses execution-42. All route to the same partition in offset order."),
        new Scenario(10, "Add consumer · rebalance", "After processing begins, ResultsService-3 joins. Watch the group revoke and redistribute partitions.")
    );
    public static Configuration configuration(int id) {
        return switch (id) {
            case 1 -> Configuration.preset(1, 1, 1, List.of("results-group"), 1, 1);
            case 2 -> Configuration.defaults();
            case 3 -> Configuration.preset(3, 3, 2, java.util.Collections.nCopies(5, "results-group"), 2, 1);
            case 4, 10 -> Configuration.preset(3, 3, 2, java.util.Collections.nCopies(2, "results-group"), 2, 1);
            case 5 -> Configuration.preset(3, 3, 2, List.of("results-group", "reports-group", "audit-group"), 1, 1);
            case 6 -> Configuration.preset(1, 1, 1, List.of("results-group"), 1, 2);
            case 7 -> Configuration.preset(3, 3, 2, List.of("results-group"), 1, 1);
            case 8 -> Configuration.preset(3, 3, 2, List.of("results-group"), 10, .5);
            case 9 -> {
                var c = Configuration.defaults();
                yield new Configuration(1, c.brokers(), c.topics(),
                        List.of(new Configuration.Producer("p1", "ExecutionService", "t1", 2, true, "execution-42", "Ordered execution event")),
                        c.groups(), c.consumers(), 40, 50, true);
            }
            default -> throw new SimulationException("Unknown scenario: " + id);
        };
    }
}
