# Kafka Visualizer

Interactive Apache Kafka architecture and message-flow **simulation** for Senior Java interview preparation. Built on this project's Java 17, Spring Boot 4.1.1 and Maven wrapper. All frontend assets are local HTML/CSS/vanilla JavaScript; there is no Kafka broker, database, Docker, React, CDN or external runtime service.

## Run on Windows 11

Open PowerShell:

```powershell
git clone https://github.com/nithin-p12/kafka-visualizer.git
cd kafka-visualizer
.\mvnw.cmd clean verify
.\mvnw.cmd spring-boot:run
```

Open **http://localhost:8080**. Stop the application with **Ctrl+C**.

Alternatively, after building:

```powershell
java -jar .\target\kafka-visualizer-0.0.1-SNAPSHOT.jar
```

Requires JDK 17 (`java -version`; `JAVA_HOME` points at the JDK). The Maven wrapper downloads Maven/dependencies on first use. The application binds to localhost on port 8080; stop any other application using that port before starting. No internet connection is needed at runtime.

In IntelliJ IDEA, import/reload the Maven project and run `com.kafka.visualizer.KafkaVisualizerApplication`. The Maven project and Spring application are named `kafka-visualizer`.

## Use the dashboard

- The default view is the horizontal visualization, with Configuration, legend and diagnostics hidden. **Show Configuration** opens a drawer with **Custom** selected; guided examples live in its separate **Scenarios** tab. Concise hover tooltips explain the components.
- **Resume/Pause** controls playback; **Restart** clears runtime state, restores instances online and pauses without changing configuration. **More → Step one tick** advances one 100 ms logical tick. Restart is the existing reset operation.
- **Focus** hides all application chrome and gives the visualization the entire viewport. Escape or Exit focus restores the normal view. Space pauses/resumes; N produces using the selected producer. Shortcuts ignore text inputs and open dialogs.
- Producers are on the left, lightly outlined broker bands contain their physical partition replicas in the center, and logical groups branch to individual consumers on the right. The architecture stays horizontal on mobile; pan the canvas and use Fit/zoom rather than shrinking labels into unreadability.
- The presentation follows the minimal [SoftwareMill visualizer](https://softwaremill.com/kafka-visualisation/) style. Partition P0 is green `#5BB12F`, P1 purple `#9E579E`, P2 cyan `#73C5E1`, and P3 pink `#EB65A0`; P4–P9 extend that palette. Colors stay consistent across replicas, records and consumer history. Topics are distinguished by their names. Leaders use filled circles/blocks, followers outlines; labels explicitly identify their roles.
- Moving records are numbered rectangular blocks, not tiny dots. Only active transport paths are drawn, with one packet per shared stage trunk. Producer-stage blocks are gray; subsequent blocks use their partition color. Acknowledgements remain visible in diagnostics, without extra backward wires. **View → Show commit flows** enables separate green next-offset packets and the abstract offset-storage badge.
- Replicas show five recent records. Consumers show current processing and a bounded history of completed records. Processing pulses; failures and retries have explicit indicators. Replication and commit animations are optional view settings and never change the engine.
- At high rates, queued traffic on the same route is combined as `M… +N`, with IDs in its tooltip. Crossing packets share a counted `×N` marker with inspectable descriptions instead of overlapping labels. The replay counter in More identifies queued, bundled and canceled stages. Animation speed affects visual replay only; snapshots are authoritative current state.
- In Configuration, **Auto / Manual** updates all producers live. Individual automatic flags remain editable for mixed configurations. In Manual mode, click a producer once (or focus it and press Enter/Space) to immediately publish its configured key and payload, without a popup. Edit producers in Configuration. The toolbar's Produce button, sidebar's custom key/payload fields and N shortcut publish using the selected producer and entered overrides, while paused or running.
- Delivery paths use the nearest clear approach to each consumer, including lower space when the source partition is below it. Packet-sized clearance keeps moving records away from group names and consumer labels.
- Live speed sliders are in Configuration: 0.25–10 messages per **simulated** second per instance. Individual rates remain editable. A consumer shares its throughput across assigned partitions. Pause freezes engine time and packets; Step or Produce One while paused plays the resulting stages, then freezes again.
- Click a replica for its physical locations, assignments, fetched/completed/committed positions, lag and paginated retained history. Full custom names remain in tooltips when a measured label needs wrapping or ellipsis.
- Click a broker's power button for stop/restart actions. Click a consumer for crash/restart, pause/resume, failure and commit actions. **Fail** affects the current or next attempt once, then retries the same offset. Crashes/rebalances can redeliver already-processed work. A stale replica is never elected merely because it is online.
- **More → Show diagnostics** reveals Events, Lag & offsets, and Processing tabs. **Commit completed work** commits safely for all eligible consumers. Closing diagnostics removes its entire layout footprint. Topic/group filters and follower visibility are in the drawer's View section.

## Custom microservice configuration

Edit or add brokers, topics, producers, groups and consumers in Configuration. Every consumer has an editable name, group ID, topic subscriptions and rate. Every producer has a target topic, key and payload template. Example: topic `execution-completed`, producer `ExecutionService`, two `ResultsService` instances in `results-group`, and a `ReportsService` in `reports-group`.

Edits remain a **draft** until **Apply Configuration**. Names use stable entity IDs, so renaming a topic/service/broker preserves its logs and positions. Multiple consumers can share a group, and multiple groups independently subscribe to the same topics. Empty groups are allowed, but keep at least one configured consumer overall. Deleting a group also removes its members; deleting a topic retargets affected draft producers/subscriptions to a remaining topic, visibly before applying.

Names, rates, producers, consumers, subscriptions, retention, new topics and partition increases apply live. Membership, group or subscription edits cause a visible eager rebalance. A changed group ID starts a different offset namespace; old offsets are not transferred. Historical group offsets remain until reset.

Broker topology changes, replication changes, topic deletion and partition decreases require **Apply Configuration & Reset**; its impact is shown before clicking. Partition decreases rebuild this simulator; Kafka does not support simply shrinking a topic's partitions. Increasing partition count can remap existing keys.

**Save JSON** exports the current draft (or active configuration when unedited). **Load JSON** stages a configuration file for review and Apply. Files use `schemaVersion: 1`, include stable IDs and configuration only, and do not contain runtime logs/offsets. Server-side validation checks limits, references, rates and replication. Invalid applications preserve the active simulation. Concurrent configuration changes from another tab return a conflict; Discard edits reloads current state.

## Guided scenarios

Each scenario button replaces the current simulation and starts its demonstration:

| # | Scenario | Observe |
|---|---|---|
| 1 | One partition, one consumer | Ordering, processing and commits |
| 2 | Three partitions, three same-group consumers | One partition each |
| 3 | Three partitions, five same-group consumers | Two idle consumers |
| 4 | Three partitions, two same-group consumers | A 2/1 assignment |
| 5 | Three independent groups | Every group receives every topic record |
| 6 | Crash before commit | Scripted crash/restart and redelivery; pauses after demonstrating duplication |
| 7 | Leader failure, replication factor two | In-sync follower election after the first acknowledged record |
| 8 | Producer faster than consumer | Growing lag and, eventually, retention-expired backlog |
| 9 | Repeated message key | Same partition, increasing offsets |
| 10 | Add consumer | Third instance joins after processing starts; assignments rebalance |

## Correctness and deliberate simplifications

- Topic partitions are logical logs; replicas are separate broker-hosted copies. Leaders handle all simulated reads/writes. Replication factor includes the leader and does **not** add consumer parallelism.
- Ordering is per partition, never global. Keyed messages use UTF-8 Kafka-compatible Murmur2 selection; unkeyed messages use round-robin per producer/topic instead of Kafka's default sticky behavior.
- Offsets start at zero and never renumber. Consumption does not delete records. Record-count retention operates independently of consumption; Kafka normally uses time/bytes and log segments.
- Groups are logical memberships, not servers. Only a running, subscribed member owns a partition within each group. Paused consumers retain ownership. Subscriptions may differ; a partition with no eligible member stays unassigned.
- Fetched-next, completed-next and committed-next offsets are separate. Commits cover only contiguous successfully completed work. This is an intentionally safe application-managed model, not a claim that unrestricted client auto-commit is safe. Lag is log end minus committed next (zero before first commit); processing backlog and expired backlog are separate.
- Missing/out-of-range offsets reset to the earliest retained record, with explicit events. Retention can remove unconsumed records; these are reported rather than described as successfully consumed.
- Eager rebalances take one logical tick, revoke all assignments and resume at committed offsets without implicit commits. Real assignment strategies, coordination, heartbeats and timeout detection are more complex.
- Replication is synchronous to current online in-sync replicas before acknowledgement: `acks=all`, `min.insync.replicas=1`, unclean election disabled. A surviving leader can acknowledge with one ISR, which offers less redundancy. Real Kafka durability requires surviving up-to-date storage.
- Broker stop preserves its in-memory log. Stale replicas require catch-up from a current leader before election. If none can safely lead, the partition stays unavailable and production receives no acknowledgement/offset. No disk destruction, network partition or asynchronous replica lag is modeled.
- Group offset storage is abstracted rather than implemented as another replicated topic. It persists in engine memory; commits fail explicitly if every broker is offline and can be retried after recovery.
- Processing is single-record, single-threaded per consumer. A failed attempt retries next tick without allowing later offsets to overtake it. Previously fetched records may finish even if their broker later stops.
- Consumer groups alone do not ensure exactly-once business processing. Crash/rebalance before commit may repeat already-completed work; no transactions, producer idempotence or business-side database is modeled.
- All state is in memory and shared by browser tabs. Restarting the application loses it. Snapshots show current state; animations are explicitly labeled replay and never determine engine outcomes.

Authoritative references: [Kafka design](https://kafka.apache.org/42/design/design/), [consumer configuration](https://kafka.apache.org/42/configuration/consumer-configs/), [producer configuration](https://kafka.apache.org/42/configuration/producer-configs/).

## Verification and code layout

- `com.kafka.visualizer.simulation`: configuration records, deterministic engine, scenarios and REST/scheduler adapter. The engine has no external clock/random dependency and can be tested directly.
- `src/main/resources/static`: configuration/API adapter, SVG diagram renderer, pure branch layout/routing, shared reference colors and bounded event replay. UI view preferences use browser storage independently of configuration JSON.
- `src/test/java`: engine and real-HTTP Spring Boot tests. Run with `mvnw.cmd clean verify`.
- `src/test/browser/visualizer.cjs`: optional development-only Edge/Playwright browser smoke tests; captures screenshots under `target/browser-tests/screenshots`. No Node dependency is shipped with the app.

To run browser verification, start the application in another PowerShell window, then:

```powershell
npm.cmd install --prefix target/browser-tests --no-save --no-audit --no-fund playwright
node --test src/test/browser/layout.cjs src/test/browser/replay.cjs
node src/test/browser/visualizer.cjs
```

Requires Node and Microsoft Edge. Checks default canvas space, reference colors, drawer/tabs, Focus/keyboard controls, three brokers/three partitions/three groups/six consumers, actual animated stages, pause/step, one-click manual producer publishing without popups (including Enter/Space in Focus), custom publishing overrides, failure/failover/rebalance, custom names, JSON files, measured long-label collisions, desktop/laptop/mobile layouts, scripted scenarios and bounded maximum topology. A Broker-2 regression checks delivery through available lower space and captures a screenshot. Pure layout tests check physical replica placement, stable coordinates, colors, filtering, route endpoints and packet-sized label clearance. The browser suite restores the paused default configuration afterward.

REST endpoints live under `/api/simulation`: `state?afterEventId=…`, `configuration`, `commands`, `scenarios`, and `partitions/{topicId}/{partitionId}/history`. Configuration PUT expects `{configuration, reset, configRevision}`; commands POST expects `{type, targetId?, key?, payload?}`. Responses are authoritative immutable snapshots with revision, epoch, sequenced events and bounded recent logs.
