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

- **Tests: only when asked.** Don't run the browser suites after each change. Do keep `src/test/browser/*.cjs` in step with markup/URL changes, and `node --check` edited JS. A quick screenshot to check layout is fine.
- **Commits: use judgement.** Don't commit every small tweak. Commit when a coherent piece of work is done: a new feature, a batch of related fixes, or anything the user should be able to pull on another laptop. Clear message: imperative subject, short body on what and why, ending with the co-author trailer. Commit straight to `main` (the user's workflow).
- **Push:** after every 5 unpushed commits (`git rev-list --count origin/main..HEAD`), and whenever this file changes. Never force-push.
- **Plain language** in UI copy and replies.

## UI conventions (Learn)

- No wasted space: no half-empty second lines (keep short strips on one line with `nowrap`; shorten copy or drop secondary bits on narrow screens), no dead bands, no page scroll inside a lesson. A lesson is one screen; the recap must fit without scrolling (checked at 1366×768).
- Readable scene text: SVG labels 15–19 units in the 960×460 viewBox; record blocks ~46×32.
- Colours are soft and consistent. Lesson parts have one tone each (`.tone-watch` blue, `.tone-try` teal, `.tone-deeper` amber, `.tone-recap` purple) used in tabs, map strip and recap path. Levels have `.lv-atoms/.lv-links/.lv-e2e/.lv-deep`. Page background is `--paper` with a faint top glow.
- Icons over numbered labels (see `ICONS` in `learn/learn.js`).
- The guide is one in-scene card (step, explanation, "watch for", next), placed by `placeGuide()` to cover the least of the scene.
- Lesson flow: Watch → Try it → Go deeper → Recap → next topic; every part reachable from the header tabs, the recap path and the ‹ › topic arrows.

## Learn code map

- `learn/learn.js`: page logic (map, routing `#/<lesson>[/<mode>/<step>]`, tabs, guide card, recap, progress in `localStorage`).
- `learn/player.js`: step player (seek replays earlier steps instantly; hooks `step`, `started`, `settled`, `hold`, `done`).
- `learn/scene.js`: SVG helpers and the pausable clock.
- `learn/lessons/<id>.js`: one lesson each: `watch`/`deeper` tracks (`build`, `steps[{title,text,observe,focus,run}]`), `tryIt`, `takeaway`, `recap {points, interview[{q,a}]}`, `quiz`. `lessons/index.js` holds the curriculum (`LESSONS`, `LEVELS`).
- Status: Record and Topic are redrawn at the new sizes and have interview Q&A; Partition, Offset and Broker still use the older, smaller scenes and have no interview Q&A yet.

## Tests (when asked)

Start the app first, then (see README for one-time Playwright install):
`node src/test/browser/learn.cjs` (and the other `*.cjs` suites). They default to `http://127.0.0.1:8888`; override with `KAFKA_LAB_URL`. Run suites one at a time: they share the app's in-memory simulation state.
