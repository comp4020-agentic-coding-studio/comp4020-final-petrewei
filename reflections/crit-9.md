# Crit 9 Reflection

## 1 What Was the Breakthrough That Moved the Work Forward?

Separating the durable fact from its delivery. A move is first written to the server's state and then broadcast over server-sent events to every open page, which is the same save-then-publish path the week 9 lecture traced through Phoenix: the saved position survives a restart, while the stream and the open pages are transient and reconnect. Once I saw it that way, the crit 9 decision about two people grabbing one word became a question about the durable state, not the stream. I chose one hand at a time ([ADR 0002](../docs/adr/0002-one-hand-at-a-time.md)) because it extends the rule that each word exists once to how a real magnet behaves. The lecture's warning that a completion summary is not a working feature held throughout: a throttled two-browser test found a late refusal that left a freed word glowing until reload, and only a version stamped on every word by the server, checked in `spec/version.test.ts`, settled which news a page should believe.

## 2 What Did This Work Change About Who I Want to Be as a Software Developer?

I want to use subagents for what they are good at, and judge their work in the running product rather than by their summaries. Four review agents read the code in parallel and returned compact findings, which kept the main conversation clear, but they cost more tokens in total, and their output was not the last word: a fresh `/code-review` showed that the refactor they prompted had broken a refused move, which only a browser test reproduced. The agent that builds a feature should not be its only judge.
