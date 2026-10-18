# Kafka Visualizer — functional and visual test report

Date: 18 October 2026. Environment: Windows, JDK 17, Maven wrapper, Microsoft Edge driven by Playwright. The packaged Spring Boot application was tested on `http://localhost:8081` in a separate process.

## Result

- Maven `verify`: **48 Java tests passed**, successful packaged build.
- Pure JavaScript layout/replay/presentation checks: **16 tests passed**.
- Detailed real-browser audit: **16 cases, 139 checks passed**, including all ten guided scenarios and six additional configuration/lifecycle cases.
- Sustained-flow browser regression: **30 individual message journeys passed**, including failure/retry, broker recovery, pause/step, playback ownership and consumer arrival boundaries.
- Broader browser suite: **passed**, covering controls, custom names, JSON import/export, keyboard/Focus, partition inspection, failover/rebalance, long labels, filtering and the maximum 150-replica topology.

The audit combines actual browser interactions, screenshots inspected visually, DOM geometry sampling every 80 ms, actual packet-stage observations, simulation snapshots and event-history assertions. It does not rely only on server logs.

## Defects found and fixed

| Defect | Reproduction and impact | Fix and regression coverage |
|---|---|---|
| Producer queues collide vertically | Three producers publishing manually: a “Waiting to depart” caption touches the following producer marker. | Reserve room for six queued tiles, pending counts and waiting captions. Pure layout checks cover desktop/laptop/mobile; mixed configuration audit checks visible labels while running. |
| Departing message obscures pending ID or service name | A moving packet initially occupies the same slot as the next FIFO head; the narrow-screen vertical corridor can brush the producer name. | Start the packet immediately outside the pending tile, move the producer column slightly left and constrain/wrap its label. Check queue/name clearance in layout tests and continuously in Edge. Full names remain in tooltips. |
| Zoom controls cover queue records | The floating bottom-left zoom buttons overlap the final queued tiles on laptop/mobile and dense configurations. | Put the controls in their own compact 32 px row outside the scrollable diagram. Check separation at each scenario's desktop, laptop and mobile viewport. Focus still hides that row. |
| Reset mistaken for reconnect | Multiple resets between browser polls discard old-epoch events; the old event cursor can then produce a gap flag and a misleading reconnect/history-loading notice. | Treat gaps as reconnects only within the same epoch. Reset the presentation and replay the new epoch's events normally. The rapid-reset browser case verifies zero existing history and no reconnect notice. |

Initial audit setup/harness issues were corrected separately: optional video recording required Playwright FFmpeg, scenario selection already closes its drawer, historical assertions need the full event endpoint rather than the browser's incremental event batch, and a newly opened test browser must acquire the previous browser's playback lease before starting. The latter caused a chained smoke run to time out at tick 1; its startup now waits for ownership. These were not Kafka simulation defects.

## All ten guided scenarios

Every scenario was selected through the configuration drawer and exercised with real paced animation. Its active summary, assignment exclusivity, pause behavior, diagram direction, label geometry and consumer arrival timing were checked. Screenshots were captured at **1920×1080**, **1366×768** and **390×844**, including the consumer side after horizontal panning on mobile.

| # | Scenario | Verified behavior | Result |
|---|---|---|---|
| 1 | One partition / one consumer | Exactly one owner, ordered records, processing and retained log | Pass |
| 2 | Three partitions / three consumers | One partition per member in the same group | Pass |
| 3 | Three partitions / five consumers | Three assigned members and exactly two idle members | Pass |
| 4 | Three partitions / two consumers | A 2/1 partition assignment | Pass |
| 5 | Independent groups | All three groups independently receive M1, M2 and M3; each subscribes to all three partitions | Pass |
| 6 | Crash before commit | Scripted crash/restart, repeated processing/redelivery, no forced offset commit, demonstration pauses | Pass |
| 7 | RF 2 leader failover | A broker stops, surviving in-sync replicas lead, acknowledged record survives, all partitions remain available | Pass |
| 8 | Producer faster than consumer | At least 25 published messages and growing committed-offset lag | Pass |
| 9 | Same message key | All published records use one partition with consecutive offsets | Pass |
| 10 | Add consumer / rebalance | Third consumer joins, rebalance completes, each member owns one partition | Pass |

## Additional combinations and regressions

- **Rapid resets:** three configuration resets between polls; the new epoch is not presented as a reconnect.
- **Mixed subscriptions:** three brokers, three named topics, three named producers, three groups and six consumers. Twelve messages produce 8, 8 and 12 processing completions for the respective topic subscriptions. Automatic commits are disabled and offsets remain uncommitted.
- **Live configuration:** committing one consumer affects its group only; increasing a topic from three to six partitions and renaming services preserves retained messages. Invalid replication and stale configuration revisions are rejected without overwriting active state.
- **Paused consumer:** ownership remains assigned while paused; a published record waits visibly. Resume processes it, including an injected failure/retry of the same record, without a forced commit.
- **Stale replica outage:** publish with RF 2, stop a follower and acknowledge another record on the surviving ISR, then stop the leader. The stale follower cannot lead. An attempted commit fails explicitly when every broker is offline, the FIFO head remains queued, and recovery preserves M1/M2/M3 on both replicas.
- **Retention/live controls:** a retention limit of two bounds the retained log while keeping original offsets and exposing expired backlog. Producer and consumer sliders change live; follower/replication/commit view toggles preserve engine state.
- **Sustained flow:** each of the first 28 messages independently traverses producer, delivery and completion stages; M29 fails and retries, and M30 survives an unavailable broker. Consumer state stays empty until delivery arrival. Manual publishing while paused completes its journey and pauses again. Step drains a paused animation batch and advances exactly one tick.
- **Replay stress:** 300 messages reach two independent consumers at their own arrival boundaries; 1,000 individual stages are not bundled or evicted. Tests cover causal dependencies, conflicting routes, obsolete ownership cancellation and metadata pruning.
- **Broader UI suite:** three brokers/three partitions/three groups/six consumers, all visible stage types, pause/resume, Focus/keyboard, one-click manual production, custom name editing and escaping, configuration JSON, action dialogs, retries, broker/consumer restart, diagnostics, long names, mobile toolbar fit, filters and maximum supported topology.

## Evidence and reproduction

The expandable local report is **[target/browser-tests/audit/report.html](target/browser-tests/audit/report.html)**. It links the per-case checks, scenario screenshots, complete browser recording and [JSON evidence](target/browser-tests/audit/report.json). These generated files are ignored by Git; rerun the audit to recreate them after cloning or cleaning `target`.

Build and start a dedicated application instance in the first PowerShell window. Stop an earlier test JAR before rebuilding so Windows does not keep it locked:

```powershell
.\mvnw.cmd verify
java -jar target/kafka-visualizer-0.0.1-SNAPSHOT.jar --server.port=8081
```

Run the suites sequentially in a second PowerShell window:

```powershell
npm.cmd install --prefix target/browser-tests --no-save --no-audit --no-fund playwright
node --test src/test/browser/layout.cjs src/test/browser/replay.cjs
$env:KAFKA_LAB_URL='http://localhost:8081'
node target/browser-tests/node_modules/playwright/cli.js install ffmpeg
$env:KAFKA_AUDIT_VIDEO='1'
node src/test/browser/audit.cjs
node src/test/browser/flow.cjs
node src/test/browser/visualizer.cjs
```

Browser suites replace that instance's in-memory configuration and restore the default paused preset on successful completion. Run them one at a time.

## Scope of the result

No blocking failure remained in the tested cases. This is a targeted Edge audit rather than an exhaustive enumeration of every configuration or browser. Geometry is sampled, not a proof about every rendered frame. Video was captured; visual review used selected screenshots and live-state/stage assertions rather than watching every recorded frame. Dense topologies intentionally scroll inside the canvas, and mobile preserves readable horizontal panning. The tests validate this deterministic simulator, not a real Kafka deployment or real broker-storage durability.
