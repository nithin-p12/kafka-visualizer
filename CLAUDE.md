# Kafka Visualizer: working notes

Read this first in every session. It travels with the repo so every laptop gets the same rules.
**Keep it current:** when a rule, URL, layout or convention below changes, update this file in the same commit.

## What this is

Spring Boot 4 / Java 17 app serving static pages from `src/main/resources/static` (vanilla HTML/CSS/JS, no build step, no CDN):

| URL | File | What |
|---|---|---|
| `/` | `index.html` | Home: two cards, Learn and Visualize |
| `/learn.html` | `learn.html`, `learn/` | Animated lessons (map, lessons, recap) |
| `/visualizer.html` | `visualizer.html`, `app.js`, … | Live simulation backed by `simulation/` Java code |

The server runs on **http://127.0.0.1:8888** (`application.yaml`). `StartupUrls.java` logs all three URLs on startup.

## Running and seeing changes

- Start: `.\mvnw.cmd spring-boot:run` (or run `KafkaVisualizerApplication` in IntelliJ).
- The running server serves static files from `target/classes/static`, not `src/`. After editing static files, copy them over so a refresh shows the change without a restart:
  `cp -r src/main/resources/static/. target/classes/static/`
- Java changes need a restart.
- Bump the `?v=` query on `learn.css`/`learn.js` in `learn.html` when changing them, so browsers drop cached copies.

## Working agreements (from the user)

- **Tests: only when asked.** Don't run the browser suites after each change. Do keep `src/test/browser/*.cjs` in step with markup/URL changes, and syntax-check edited browser JS with `node --input-type=module --check < file.js` (plain `node --check` does not catch errors in these ES modules). A quick screenshot to check layout is fine.
- **Commits: use judgement.** Don't commit every small tweak. Commit when a coherent piece of work is done: a new feature, a batch of related fixes, or anything the user should be able to pull on another laptop. Clear message: imperative subject, short body on what and why, ending with the co-author trailer. Commit straight to `main` (the user's workflow).
- **Push:** after every 5 unpushed commits (`git rev-list --count origin/main..HEAD`), and whenever this file changes. Never force-push.
- **Plain language** in UI copy and replies.

## UI conventions (Learn)

- No wasted space: no half-empty second lines (keep short strips on one line with `nowrap`; shorten copy or drop secondary bits on narrow screens), no dead bands, no page scroll inside a lesson. A lesson is one screen; the recap must fit without scrolling (checked at 1366×768).
- Readable scene text: SVG labels 15–19 units in the 960×460 viewBox; record blocks ~46×32.
- Colours are soft and consistent. Lesson parts have one tone each (`.tone-watch` blue, `.tone-try` teal, `.tone-deeper` amber, `.tone-recap` purple) used in tabs, map strip and recap path. Levels have `.lv-atoms/.lv-links/.lv-e2e/.lv-deep`. Page background is `--paper` with a faint top glow.
- Icons over numbered labels (see `ICONS` in `learn/learn.js`).
- The guide is one in-scene card (step, explanation, "watch for", next), placed by `placeGuide()`. Before a step plays, it is run instantly on the invisible `#ghost` stage so the card is placed once against the step's final picture and spotlight, and does not move while the step plays. It must never cover the spotlight or scene text; when no spot is clear it shortens itself (no "Next", then no "Watch for", then title only) and **+** shows it all. Check placement across every step at 1365×900 and 1366×768 after changing a scene.
- Keyboard (works whatever has focus): Space pause/play, ←/→ steps (→ past the last opens the recap, ← closes it), Shift+←/→ topics, F full screen, G guide, R recap, M shrink/expand guide card, Esc closes the recap. Enter still presses the focused button.
- Lesson flow: Watch → Try it → Go deeper → Recap → next topic; every part reachable from the header tabs, the recap path and the ‹ › topic arrows.

## Learn code map

- `learn/learn.js`: page logic (map, routing `#/<lesson>[/<mode>/<step>]`, tabs, guide card, recap, progress in `localStorage`).
- `learn/player.js`: step player. Each step goes reading → running → holding: a reading pause first (2.5–9 s from the word count, shown as a bar on the guide card; while paused it waits for Play/"Start now"), then the animation, then a short hold. Seek replays earlier steps instantly; `replay()` re-runs a step without the reading pause. Hooks: `step`, `started`, `read`, `settled`, `hold`, `done`.
- `learn/scene.js`: SVG helpers and the pausable clock.
- `learn/lessons/<id>.js`: one lesson each: `watch`/`deeper` tracks (`build`, `steps[{title,text,observe,focus,run}]`), `tryIt`, `takeaway`, `recap {points, interview[{q,a}]}`, `quiz`. `lessons/index.js` holds the curriculum (`LESSONS`, `LEVELS`).
- `learn/lessons/kit.js`: shared helpers for multi-broker scenes (broker boxes, partition lanes with leader/follower roles, record flights, catch-up).
- Status: Level 1 (Atoms) is complete: Record, Topic, Partition, Offset, Broker, Cluster, Replica, Producer, Consumer, Consumer group, Commit & lag, Retention. All except Partition, Offset and Broker use the new sizes and have interview Q&A; those three still use the older, smaller scenes and need a redraw. Next: Level 2 (Links), then the End-to-end journey and Level 4 deep dives. Lessons must stay atom-level and leave topics owned by later lessons (key routing, acks, replication flow, election, assignment, rebalance, redelivery, multiple groups, ISR/high watermark, batching, idempotence, KRaft) to those lessons, with a one-line pointer.
- Parallel lesson writing works: register placeholders in `lessons/index.js` first, then each writer edits only its own `lessons/<id>.js`, copies it to `target/classes`, and checks placement with a script that steps through every Watch/Go deeper step at both sizes (nothing covered, no movement mid-step).
- Adding a lesson: create `lessons/<id>.js`, import it in `lessons/index.js` (add to `LESSONS`, and use the id string in `LEVELS`), add the id to `LESSONS` in `src/test/browser/learn.cjs`, and point the previous lesson's "Next" text at it.

## Tests (when asked)

Start the app first, then (see README for one-time Playwright install):
`node src/test/browser/learn.cjs` (and the other `*.cjs` suites). They default to `http://127.0.0.1:8888`; override with `KAFKA_LAB_URL`. Run suites one at a time: they share the app's in-memory simulation state.
