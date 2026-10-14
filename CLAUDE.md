# Rules

## 1 Working Practices

- **Review the plan adversarially before building.** Ask what is assumed, which choice the brief requires as against merely prefers, and what the alternatives were.
- **Check decisions against the published brief, not this file.** This file holds rules; the requirements are on the course website.
- **Build the slice the plan describes, and stop there.** Propose extras separately.
- **Never rewrite a check to match the build.** A disagreement between the two is a decision to flag.

## 2 Data and Access

- **Decide on the server who may see and change what, never in the page.** A page's code is in every visitor's hands.
- **Never send a visitor's cookie to another visitor.** Show people by a derived name or short code.
- **Keep secrets out of the repo, commits and logs.** They live in Fly secrets and `mise.local.toml`.

## 3 Verification

- **Return the evidence itself:** a screenshot, response body, DOM state or exit code.
- **Verify the deployed app after every deploy,** in a real browser, with two separate sessions for anything multi-user.
- **Run `pnpm check` against the live app as well as locally.**
- **Close the Playwright browser after a round of checks, and delete its screenshots, snapshots and logs.** They collect in `../.playwright-mcp/`, outside the repo.

## 4 Sensors and Checks

- **Write the sensor before a change worth holding to.** A check outlives the edit and rejects later drift on its own.
- **Tests that change shared state skip the live app.** Real visitors share it; CI runs those tests against a throwaway copy.
- **Treat a red check as correct until proven otherwise.** Never weaken one to fit output you did not intend.

## 5 Git and CI

- **Commit small and often, and say why in the message.** Stage files by name, and commit only on green.
- **Push once after a change's commits, without asking.** Each push queues a CI run behind the last.

## 6 PROCESS.md

- **Rewrite `PROCESS.md` at each crit so it describes the project as it stands,** and grow the crit's reflection with each change I direct, citing its commit.
- **Write each moment in STAR form, weighted:** Situation 20%, Task 10%, Action 60%, Result 10%.
- **Cite commits inline as links whose text is the hash,** and say which decisions were mine.

## 7 Markdown

- **Keep each prose paragraph on a single line.**
- **Number document subheadings in Title Case** (`## 1 Heading`), in `CLAUDE.md`, `PROCESS.md` and ADRs, never in `README.md`, which the app serves as its own page.
- **Use the em dash character for a dash, never `---`.**
