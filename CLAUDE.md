# Fridge Poetry

This is the working agreement for the final-project repository: each rule and the reason for it. The rules are carried over from crit 7 (`comp4020-crit7-petrewei`) and adapted to this app; the argument they serve is in `README.md`.

The platform is fixed and is not restated here: `fly.toml`, the `Dockerfile`, `.github/workflows/checks.yml` and `spec/README.md` each say what they fix. Read the published [brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/) and the current crit's spec before planning.

## 1 This Deliverable

The final project, built across crits 8, 9 and 10. Crit 8 (cutoff Wednesday 7 October 2026, 07:00) asks for a first working version and a first `README.md`.

## 2 App and Data

- **The vocabulary lives only in `src/words.ts`, and each word appears once.** The server never accepts text from a client; `spec/fridge.test.ts` checks both.
- **A magnet's position is a fraction of the door, 0 to 1.** Pixel positions would make an arrangement depend on the screen it was made on.
- **State is `/data/fridge.json`, written by the server alone, via a temporary file and a rename.** The reasons are in `docs/adr/0001-plain-node-and-a-json-file.md`.
- **The visitor cookie never leaves the server.** Clients learn only whether a magnet is theirs (`mine`), never who moved it.
- **Keep `/api/events` streaming every move to every open page.** It is how the app meets the brief's real-time requirement, and `spec/realtime.test.ts` holds it to under a second.
- **One hand at a time: the server refuses a grab or a move on a word someone else holds.** The decision and its costs are in `docs/adr/0002-one-hand-at-a-time.md`; `spec/hold.test.ts` checks the refusals and every way a hold ends.
- **A theft notice names the word, never who took it.** It goes live to the robbed visitor's open pages, or waits in `/data/taken.json` until they come back; `spec/taken.test.ts` checks both.
- **Notices go in `#status`, which floats over the bottom of the screen.** The fridge is taller than most windows, so anything placed below it is never seen.
- **Lines and the archive follow `docs/adr/0003-an-archive-of-broken-lines.md`.** Keep `width()` in `src/lines.ts` fitted to the magnets as rendered; a change to their font or padding needs it refitted.
- **Every word stays reachable by keyboard.** Each magnet is a button, and the arrow keys move it.

## 3 Working Practices

- **Review the plan adversarially before building.** Ask what is assumed, which choice the spec requires as against merely prefers, and what the alternatives were.
- **Build the slice the plan describes, and stop there.** Propose extras separately.
- **Never rewrite the spec to match the build.** A disagreement between the two is a decision to flag.

## 4 Verification

- **Return the evidence itself:** a screenshot, response body, DOM state or exit code.
- **Verify the deployed app after every deploy.** Move a word on `https://comp4020-final-petrewei.fly.dev/`, reload, and check it is still there and outlined.
- **Run `pnpm check` against the live app as well as locally:** `APP_URL=https://comp4020-final-petrewei.fly.dev pnpm check`.

## 5 Sensors and Checks

- **Write the sensor before a change worth holding to.** A check outlives the edit and rejects later drift on its own.
- **Tests that change the door skip the live one** (`live` from `spec/live.ts`). Real visitors share it, so a test's move, hold, theft notice or poem would land on them; CI runs those tests against a throwaway copy, and only read-only checks run live.
- **Treat a red check as correct until proven otherwise.** Never weaken one to fit output you did not intend.

## 6 Git and CI

- **Commit small and often, and say why in the message.** Stage files by name, and commit only on green.
- **Push once after a change's commits, without asking.** Each push queues a CI run behind the last.

## 7 PROCESS.md

- **Rewrite `PROCESS.md` at each crit so it describes the project as it stands,** and grow the crit's reflection with each change I direct, citing its commit.
- **Write each moment in STAR form, weighted:** Situation 20%, Task 10%, Action 60%, Result 10%.
- **Cite commits inline as links whose text is the hash,** and say which decisions were mine.

## 8 Markdown

- **Keep each prose paragraph on a single line.**
- **Number document subheadings in Title Case** (`## 1 Heading`), in `CLAUDE.md`, `PROCESS.md` and ADRs, never in `README.md`, which the app serves as its own page.
- **Use the em dash character for a dash, never `---`.**
