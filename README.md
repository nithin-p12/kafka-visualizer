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

Open **http://localhost:8888** for the home page, which links to **Learn** (`/learn.html`) and the **Visualizer** (`/visualizer.html`). The startup log prints all three URLs. Stop the application with **Ctrl+C**.

Alternatively, after building:

```powershell
java -jar .\target\kafka-visualizer-0.0.1-SNAPSHOT.jar
```

Requires JDK 17 (`java -version`; `JAVA_HOME` points at the JDK). The Maven wrapper downloads Maven/dependencies on first use. The application binds to localhost on port 8888; stop any other application using that port before starting. No internet connection is needed at runtime.

In IntelliJ IDEA, import/reload the Maven project and run `com.kafka.visualizer.KafkaVisualizerApplication`. The Maven project and Spring application are named `kafka-visualizer`.

## Learn Kafka (animated lessons)

Open **http://localhost:8888/learn.html** (or the **Learn** card on the home page, or **📘 Learn** in the Visualizer toolbar). The learning map links to the Visualizer from its top bar; inside a lesson, the **Kafka** logo returns to the map. The learning map orders lessons from single components to end-to-end flow:

1. **Atoms**: one component at a time. Built so far: Record, Topic, Partition, Offset, Broker. Cluster, replicas, producer, consumer, groups, commit/lag and retention appear as "coming soon".
2. **Links**: how two components interact (key routing, acks, replication, election, assignment, rebalance, redelivery, multiple groups).
3. **End to end**: one message's full journey, then the live Visualizer.
4. **Deep dives (optional)**: ISR/high watermark, batching, idempotence, KRaft. Kept separate so the main path stays light.

Each lesson has three tabs. **Watch** plays a step-by-step animation by itself, with a caption per step; pause (Space), step (← →), jump with the step dots, replay and change speed. **Try it** puts you in control of the same scene with buttons (for example, choose a key and see which partition Kafka's real murmur2 partitioner picks, or crash a consumer before committing). **Go deeper** is an optional extra track. A takeaway and one interview-style check follow each lesson.

**Guide me** (top right, on by default) shows a side panel with *What is this?*, *Watch for*, *Up next* and *Where it fits*, and draws purple spotlights around the element to observe once each step settles. Turning it off hides all guide surfaces. Progress, quiz answers, speed and the guide preference stay in browser storage. Lessons are browser-only scripted animations; they do not use or change the simulation engine.

## Use the dashboard

- On your first visit, the purple **Welcome guide** walks through the interface with Next, Previous and Skip. Reopen it from **More → Welcome guide**. It preserves your setup and restores the panels that were open before the tour.
- **Run scenario & reset** and Custom's **Run configuration & reset** first open a centered explanation. **Continue** starts the new run; Cancel leaves existing state intact. Custom introductions use your draft service/broker/topic names, subscriptions and rates. Apply Configuration remains available for live edits.
- **Guide me during this run** enables real engine checkpoints, including before crashes, broker failure and consumer joins, followed by explanations of the results. Continue releases a checkpoint; Hide guide or More's Guide during runs disables it without resetting messages. Checkpoint explanations appear after the current visible stages settle. Scenario 6 finishes paused after demonstrating redelivery.
- Partition-colored **Assign P…** packets on purple dashed paths illustrate partition ownership within each group. These are group-assignment visual aids, separate from business messages; real group coordination is simplified. A consumer's visible partition color appears on assignment arrival, and production waits for the current assignment animations. Rebalances animate the new owners again.
- Purple spotlights and pointers identify what to observe. Failures use red outlines that fade over 4 seconds, retry/redelivery uses orange, and successful processing/commits use brief green outlines. Lag checkpoints shade the affected logical group light red and show its actual committed-offset lag. Offline indicators remain while a component is offline. Reduced-motion settings remove highlight pulsing. View choices and guide preferences stay in browser storage, outside configuration JSON.

- The default view is the horizontal visualization, with Configuration, legend and diagnostics hidden. **Show Configuration** opens a drawer with **Custom** selected; guided examples live in its separate **Scenarios** tab. Concise hover tooltips explain the components.
- **Resume/Pause** controls playback; **Restart** clears runtime state, restores instances online and pauses. Custom configuration is retained; a scenario restarts from its original preset and keeps its scenario label. **More → Step one tick** advances one 100 ms logical tick after any paused animation batch finishes.
- Beside **Show Configuration**, one line identifies the active scenario or the applied Custom counts (brokers, topics, total partitions, replication factor, producers, consumers and groups) and Auto/Manual/Mixed mode. Draft edits do not change this line until Apply. Narrow screens truncate the line with its full text available on hover.
- **Focus** hides all application chrome and gives the visualization the entire viewport. Escape or Exit focus restores the normal view. Space pauses/resumes; N produces using the selected producer. Shortcuts ignore text inputs and open dialogs.
- Producers are on the left, lightly outlined broker bands contain their physical partition replicas in the center, and logical groups branch to individual consumers on the right. The architecture stays horizontal on mobile; pan the canvas and use Fit/zoom rather than shrinking labels into unreadability.
- The presentation follows the minimal [SoftwareMill visualizer](https://softwaremill.com/kafka-visualisation/) style. Partition P0 is green `#5BB12F`, P1 purple `#9E579E`, P2 cyan `#73C5E1`, and P3 pink `#EB65A0`; P4–P9 extend that palette. Colors stay consistent across replicas, records and consumer history. Topics are distinguished by their names. Leaders use filled circles/blocks, followers outlines; labels explicitly identify their roles.
- Moving records are numbered rectangular blocks. Each message travels individually; no `+N` bundles, counted crossings or dropped animation stages are used. Conflicting packet corridors wait while independent routes can run concurrently. Producer-stage blocks are gray; subsequent blocks use their partition color. Acknowledgements remain in diagnostics, without extra backward wires. **View → Show commit flows** enables separate green next-offset packets and the abstract offset-storage badge.
- Replicas show five recent records. Consumers show current processing and a bounded history of completed records. Processing pulses; failures and retries have explicit indicators. Replication and commit animations are optional view settings and never change the engine.
- The browser requests the next logical tick only after its current visible stages finish. Fast production or slow animation slows wall-clock progress rather than skipping messages; producer and consumer rates still apply per simulated second. Records appear in leader/follower logs only on arrival, and in consumers only after delivery arrives. Processing history and committed-offset displays update at their respective stage boundaries.
- Beneath each producer, a FIFO queue shows upcoming application messages, with the next at the top. Ten messages are prepared per producer; six are shown in crowded layouts with the remaining count below. Dispatch removes the head, animates that same ID from its queue slot, and replenishes the tail. These are templates awaiting publication, not previously published records. IDs are reserved before dispatch; with multiple producers, IDs need not be published globally in numeric order. Kafka offsets are assigned on successful publication and remain ordered within each partition.
- In Configuration, **Auto / Manual** updates all producers live. Individual automatic flags remain editable for mixed configurations. In Manual mode, click a producer once (or focus it and press Enter/Space) to request its next configured message without a popup. Edit producers in Configuration. The toolbar's Produce button, sidebar's custom key/payload fields and N shortcut request the selected producer's next message with the entered overrides. At most ten manual requests can wait per producer; controls disable at capacity.
- Producing while paused completes the requested journey through each subscribed group that can process it, including earlier partition backlog, then pauses again. Automatic publication is suppressed during this manual burst, even for otherwise automatic producers. Auto-commit still uses its configured tick interval; finishing a journey does not force a commit. Offline/paused consumers or an unavailable leader produce an explicit waiting status. The queue head survives broker unavailability and is retried when its leader returns.
- Delivery paths use the nearest clear approach to each consumer, including lower space when the source partition is below it. Packet-sized clearance keeps moving records away from group names and consumer labels.
- Live speed sliders are in Configuration: 0.25–10 messages per **simulated** second per instance. Individual rates remain editable. A consumer shares its throughput across assigned partitions. Animation speed ranges from 0.25× to 4×. Pause freezes engine time and packets; Resume continues them, and Step advances exactly one logical tick with its visible stages.
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
- All engine state is in memory and shared by browser tabs. One browser holds a renewable 10-second playback lease and drives paced ticks; other tabs observe. Losing the heartbeat pauses advancement. Restarting the application loses runtime state. Engine snapshots remain authoritative; the diagram's separate presentation state updates at completed visual stages. Opening/reconnecting a page loads existing history once, then animates future events.

Authoritative references: [Kafka design](https://kafka.apache.org/42/design/design/), [consumer configuration](https://kafka.apache.org/42/configuration/consumer-configs/), [producer configuration](https://kafka.apache.org/42/configuration/producer-configs/).

## Verification and code layout

- `com.kafka.visualizer.simulation`: configuration records, deterministic engine, scenarios, REST adapter and playback ownership. Wall time affects lease expiry only; engine outcomes use logical ticks.
- `src/main/resources/static`: configuration/API adapter, SVG renderer, pure layout/routing, stage-bound presentation state and individual-message animation scheduler. UI view preferences use browser storage independently of configuration JSON.
- `src/test/java`: engine and real-HTTP Spring Boot tests. Run with `mvnw.cmd clean verify`.
- `src/test/browser/visualizer.cjs`: optional development-only Edge/Playwright browser smoke tests; captures screenshots under `target/browser-tests/screenshots`. No Node dependency is shipped with the app.

To run browser verification, start the application in another PowerShell window, then:

```powershell
npm.cmd install --prefix target/browser-tests --no-save --no-audit --no-fund playwright
node --test src/test/browser/layout.cjs src/test/browser/replay.cjs
node src/test/browser/visualizer.cjs
node src/test/browser/flow.cjs
node src/test/browser/audit.cjs
node src/test/browser/guides.cjs
node src/test/browser/consumer-feedback.cjs
node src/test/browser/learn.cjs
```

Requires Node and Microsoft Edge. Dashboard checks cover naming, JSON, controls, scenarios, failover/rebalance, routing, packet/label collisions and desktop/mobile layouts. `flow.cjs` checks actual arrival boundaries, 30 individual message journeys, FIFO dispatch, paused manual completion, retries, blocked-head recovery, playback ownership and the active setup summary. Pure tests verify 300 messages delivered independently to two groups, 1,000 stages without bundling/eviction, causal dependencies, pause and cancellation. The browser suites restore the paused default configuration afterward.

`audit.cjs` runs all ten scenarios through the UI at desktop, laptop and mobile sizes, then checks mixed topic subscriptions, three producers/six consumers, independent commits, live partition increases, invalid/stale configurations, paused-consumer recovery, processing retry, stale-replica outages and retention/live speed controls. It samples visible label/packet geometry and consumer arrival boundaries, and writes an expandable **`target/browser-tests/audit/report.html`**, detailed `report.json` and screenshots. Run browser suites sequentially against a dedicated application instance: they share and replace its in-memory simulation state. Set `$env:KAFKA_LAB_URL='http://localhost:8081'` to use a separate test port.

Optional browser recording (development-only download):

```powershell
node target/browser-tests/node_modules/playwright/cli.js install ffmpeg
$env:KAFKA_AUDIT_VIDEO='1'
node src/test/browser/audit.cjs
```

See [TEST_REPORT.md](TEST_REPORT.md) for the reviewed audit findings and verification scope. Generated evidence is local and ignored by Git; rerunning the audit regenerates it.

`guides.cjs` checks the first-visit tour and replay, introduction cancellation, all ten guided scenario milestones, actual pre-event holds, assignment animation and pause/resume, custom-name explanations, disabling guidance, failure fade and mobile guidance. Screenshots and checkpoint results are written to `target/browser-tests/guides`. The other browser suites explicitly select unguided playback and dismiss introductions so their existing flow/geometry checks remain independent.

Guidance API additions: `POST /api/simulation/scenarios/{id}` accepts an optional `{guided: true}` body; the existing bodyless call remains unguided. `POST /api/simulation/run` accepts `{configuration, configRevision?, guided?}` and atomically applies a fresh custom setup and starts it. Snapshots include `guided` and nullable `guideCue` (`key`, `token`, `title`, `description`, `targets`, `tone`). Commands add `GUIDE_CONTINUE` with `targetId` equal to the current cue token, plus `GUIDE_ENABLE` and `GUIDE_DISABLE`. Checkpoints block tick advancement until continued/disabled; stale checkpoint tokens, including those from a previous run, are rejected. `ASSIGNMENT` events contain a group, partition, source replica and destination consumer, and no message or offset. Configuration files remain schema version 1.

REST endpoints live under `/api/simulation`: `state?afterEventId=…`, `configuration`, `commands`, `playback`, `scenarios`, and `partitions/{topicId}/{partitionId}/history`. Configuration PUT expects `{configuration, reset, configRevision}`; commands POST expects `{type, targetId?, key?, payload?}`. `PRODUCE` requests the next pending message; `messageCount` increments only on successful dispatch. Playback POST expects `{action, clientId, epoch, expectedTick, completedEventId}`, where action is `CLAIM`, `HEARTBEAT` or `ADVANCE`. Advancing requires ownership, the current epoch/tick and acknowledgement of all latest events. Snapshots add `producerQueues`, `manualFlow`, `manualStatus`, `canAdvance` and `playbackPaused`; message events include their immutable record data. Configuration JSON remains schema version 1 and excludes runtime queues.

### Consumer feedback and assignment colors

Primary buttons, selected tabs, speed selections, focus rings and queue-head outlines use the original blue `#1677FF`. All buttons, including guide navigation, use blue accents; purple `#9D4CCC` is reserved for learning-guide decoration. Partition colors remain distinct to identify ownership and records. Assignment tokens carry their partition color; assignments to the same consumer arrive sequentially. The consumer is uncolored until the first token arrives, then shows one equal segment per assigned partition (two partitions = 50/50). This is a visual explanation of an assignment decision, not movement of Kafka partition data.

A delivered record pulses while processing, then changes to a processed tile at the same position without a checkmark. The same tile and rectangle remain mounted during this transition. There is no completion packet returning to the consumer. Success outlines blink for 280 ms; checkpoint pointers remain purple. Previously processed IDs occupy one history tile each, while actual repeated processing is still reflected in events and processing counters. Commits remain separate.

Each consumer shows a red **number only** for its visibly assigned partitions: log end minus committed next. This includes completed work awaiting a commit. At **20 records**, its box pulses red for four seconds, then fades; each further increase of 20 can trigger another alert, with a four-second cooldown. The count remains visible, and these alerts work with scenario guidance disabled. Unassigned backlog stays in group-level lag. Hover over the consumer for this definition.

`learn.cjs` plays every Learn lesson step (Watch and Go deeper), exercises every Try-it control, answers each quick check, checks progress badges, the Guide me toggle (persisted, no spotlights when off), the mobile layout without horizontal scroll and the Visualizer's Learn link. Screenshots of every step are written to `target/browser-tests/learn`.

`consumer-feedback.cjs` checks progressive assignment colors, 50/50 ownership, pause/resume during assignment, blue controls and purple guide accents, numeric lag fallback, identical tile identity and geometry before/after processing, short success feedback, absence of completion packets, lag threshold/count/fade with guidance disabled, and desktop/laptop/mobile screenshots. Evidence is written under `target/browser-tests/consumer-feedback`.

Static frontend resources use `Cache-Control: no-store`; the entrypoints and all module imports share an asset-version query to avoid mixing older browser-cached replay/presentation code with the current renderer. Normal processing and completion keep the same message tile mounted. Browser tests check that it is never removed or reinserted and that no completion path or packet exists.
