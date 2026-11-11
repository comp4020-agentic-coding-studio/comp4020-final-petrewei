# Product Review

Tom Griffiths' three product prompts from the week 11 lecture, run on the game on 9 November 2026, hours before the freeze: a PRFAQ, five people who might use it, and forty candidate features scored with RICE. The agent wrote the drafts from the code, the README, the ADRs and the play-testing in `PROCESS.md`; the decisions in section 3 are Peter's.

## 1 PRFAQ

### 1.1 Press Release

**Losscut! lets a room lose a fortune together, and learn why.**

A shared currency market for a crit group, a class or a showcase crowd: everyone trades the same price with play money, and the whole room watches each wipe-out land.

CANBERRA, 11 November 2026: Losscut! Kurumi's FX Fantasy opens at the ANU showcase today. It is a browser game where several people trade one currency market at once, with leverage up to 1000×, the figure offshore brokers advertise.

Leveraged forex is sold online as a quick way to make money. ESMA found that 74–89% of retail accounts lose, and in 2015 the Swiss franc's unpegging left FXCM's clients owing it $225 million. People hear these numbers and still believe they would be the exception. Explaining it rarely changes their minds; losing usually does.

In Losscut! you pick a name, choose a mode and press Start. Rewind replays five real trading days around one of nineteen market breaks, from Lehman to the franc, with the dates hidden until the bell, so nobody can trade on hindsight. Random draws a market from today's rate and a hidden situation. Live trades all forty-two pairs at real prices until you go bankrupt. Every stop-out lands in the room's feed, emergency credit charges a loan shark's rate, and at the bell the game replays your biggest trade at 1×, 30× and 1000×.

"I wanted the lesson to land the way it lands in the comic: in front of people you know, and funny until you see the numbers," said Peter, who built it for COMP4020. "Nobody needs a lecture on leverage after watching a friend's 400× position vanish in one candle."

Getting started takes two steps: open the page and choose a name. Ten short lessons cover the basics, and seven characters from *FX Fighter Kurumi-chan* trade beside you, so one person alone still has a market. An AI agent can join Live through MCP with a single command.

"With everything in at once there was nothing left to decide," said one play-tester, an amateur stock investor; the game's default margin came down after her feedback.

Losscut! is free in any browser at comp4020-final-petrewei.fly.dev, in English, Japanese and Chinese. It uses play money only and has no broker links.

### 1.2 Customer Questions

1. **Is any real money involved?** No. Accounts hold play money in Australian dollars, and nothing in the game can be bought. There are no broker names, links or deposit offers, by rule.
2. **Do I need an account?** No. A browser cookie identifies you and you choose a display name. A Live account lives with that browser: clearing cookies or switching device starts a new player.
3. **Can I play alone?** Yes. Seven house traders, the comic's characters, trade in every room and in Live, and the tutorial is private. The game is still built for several people at once.
4. **How long is a round?** Rewind and Random play five market days at round speed, about four minutes in all, with pauses anyone on the tab can call. Live never ends unless you go bankrupt.
5. **Why can I not see which crisis I am trading?** Guessing the year is part of Rewind. The dates and the event stay hidden, even in the server's messages, until the bell.
6. **Why is Live sometimes shut?** The real FX market closes for the weekend. The page shows when it opens in your time zone, which you can change in Settings.
7. **Does it work on a phone?** Yes. Every layout is checked at 390×844 as well as 1920×1080. The chart has a range picker (All, 1D, 6H) so small moves stay visible on a narrow screen.
8. **Which languages?** English, Japanese and Chinese, each at its own address. Players reading different languages share the same rooms.
9. **What does "losscut" mean?** It's the Japanese traders' word (ロスカット) for the broker closing your position when your margin runs out. In this game it ends your round.
10. **Can I challenge a friend?** Yes. Duel another player over a round; the higher score wins.
11. **Is it affiliated with the comic?** No. It's an unaffiliated fan parody that uses no official art or music; the characters appear by name only, with hand-drawn pixel faces.
12. **What if gambling or debt is hurting me?** The README and every public page carry Australia's Gambling Help line, 1800 858 858.

### 1.3 Engineering Questions

1. **What happens when the server restarts or redeploys?** Live saves every five seconds and on shutdown, which a deploy triggers, so a crash loses at most five seconds. A round in progress is lost on a redeploy; that cost was accepted because rounds take minutes.
2. **How many people can play at once?** One Node process on a 256 MB shared-CPU Fly machine handles every room. Concurrency tests cover crowds of simultaneous orders; nobody has measured the ceiling. A showcase crowd of a few dozen is the expected peak.
3. **Where do Live's prices come from, and what if they stop?** Yahoo Finance is polled every few seconds. If it fails, Live waits for recent history rather than trading on a stale price. There is no second source, which is the biggest risk on showcase day.
4. **Can a player cheat by editing the page?** No. The page sends only what the player chose; the server owns the price, the fills and the broker's rules, and checks every field.
5. **Can an AI agent do anything a person cannot?** No. Every MCP tool goes through Live's own action. Agents are capped at twenty at once, one action a second each, and are dropped after thirty minutes idle.
6. **Why no database?** One JSON file per store on a Fly volume. A schema bought nothing for one small state; the cost is that every rule a database would enforce is hand-written and tested (ADR 0001).
7. **How is real time delivered?** Server-sent events: a full state on connect, then deltas, within a second, held by `spec/realtime.test.ts`.
8. **How is Rewind's history kept honest?** It replays HistData's real minute bars for seventeen of the nineteen plots, and a test checks that it passes every real close.

### 1.4 Business Questions

1. **Who is it for?** One group at a time, Shirky's situated software: a crit group, a class or the showcase. It is not built to grow a mass audience.
2. **How does it make money?** It doesn't, and it must not. Any revenue model built on trading would sell the leverage the game warns against.
3. **Could it be read as promoting trading?** That's the main reputational risk. It's met by play money only, no broker links, the ESMA figures in the README, and a design where losing is the expected outcome.
4. **What does it cost to run?** It stays within the course's Fly defaults: one small machine and one volume.
5. **Is the parody legally safe?** It uses names only: no official art, music or passages from the comic, and an unaffiliated notice on every public page.
6. **What is unvalidated?** Whether a room "laughs and learns" at the bell has been seen with family, friends and crit groups, but never measured. Whether the Japanese and Chinese read as native has had only light review.

## 2 Five People

1. **Mei, a COMP4020 classmate at the showcase.** She has ten minutes between stands and plays on her phone beside two friends. *"We all went 1000× on the franc because nobody believed it would move that much. The bell told us the year and we groaned together."*
2. **Peter's mother, an amateur stock investor.** She knows shares, not leverage, and wants room to manage a position, which full margin by default took away; the default came down after her feedback. *"With everything in at once there was nothing left to decide. Give me margin to work with and I'll show you how I lose it."*
3. **Haruto, a Japanese reader of *FX Fighter Kurumi-chan*.** He found the game through the comic's terms and plays in Japanese with friends abroad in English. *"ロスカット in the feed with Kurumi's face next to it is exactly the comic. I just wish the yen pairs moved like 2022 again."*
4. **A course marker with two Chrome profiles.** They arrive with only the URL, read `/readme/`, open a second profile and check that each trade reaches the other page within a second. *"Two profiles side by side, one trade, both feeds updated. Then I tried to break it with a double click."*
5. **Jordan, twenty-two, served offshore-broker ads.** Jordan has never traded, and 500× sounds like opportunity. Jordan is who the lesson is for. *"I made A$4,000 in a minute and lost it all in the next one. Then the replay at 1× showed I'd been right about the direction and still lost."*

Mei, Haruto and Jordan are illustrative. Peter's mother's line paraphrases her play-testing feedback, and the marker's routine follows the rubric's two-profile check.

## 3 Forty Candidates by RICE

Reach is people out of an expected 100 in the showcase and marking week. Impact is 3, 2, 1, 0.5 or 0.25, Confidence 100%, 80% or 50%, and Effort is hours of directing the agent, testing included. Score = R × I × C ÷ E, sorted highest first. RICE favours small, safe changes, so the agent's view also weighs each candidate against the README's idea: a room laughing at a wipe-out, then understanding why. The Decision column is Peter's; a dash is not yet decided.

| # | Candidate | Area | R | I | C | E | Score | Agent's view | Decision |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| 1 | QR code on the page that joins this tab from a phone | UI | 50 | 2 | 80% | 1 | 80 | Build: a showcase crowd joins in seconds | — |
| 2 | The wipe-out price on the ticket before ordering | UI | 80 | 2 | 80% | 2 | 64 | Build: risk read in price, beside the money | Already built: the leverage note says how far a move wipes the margin |
| 3 | The ESMA "74–89% lose" figure beside your result at the bell | Education | 70 | 1 | 80% | 1 | 56 | Build: the lesson, where it lands | Built, at the bell |
| 4 | On a stop-out pop-up, a "show me" that marks the candle that did it | Education | 70 | 2 | 80% | 2 | 56 | Build after freeze | Mostly built: your stop-out is marked on the chart with your face and ✕ |
| 5 | A short GIF of two profiles trading at the top of the README | Education | 60 | 1 | 80% | 1 | 48 | Build: markers see real time before trying | — |
| 6 | Wipe-out animation: the chart shakes, Kurumi's face | Art | 70 | 1 | 80% | 2 | 28 | Build: the laugh, for the room | Already built: the 強制ロスカット stamp shakes the screen |
| 7 | Shorter Rewind (two days) as a showcase option | Mechanics | 50 | 2 | 80% | 3 | 27 | Consider: changes the clock ADR | — |
| 8 | A deposit bonus or broker referral, "for realism" | Mechanics | 100 | 1 | 50% | 2 | 25 | Reject: breaks the play-money rule outright | Rejected |
| 9 | Live's bankruptcy wait shortened on showcase day | Mechanics | 30 | 1 | 80% | 1 | 24 | Reject: Sydney midnight is the lesson's cost | — |
| 10 | Reactions (😱 💸) on another player's stop-out in the feed | Actions | 60 | 2 | 50% | 3 | 20 | Consider: the room's voice, needs moderation | — |
| 11 | A sound of its own for a stop-out | Art | 50 | 0.5 | 80% | 1 | 20 | Build: cheap, felt across the room | Already built: a falling tone, when sound is on |
| 12 | New players capped at 30× until the tutorial is done | Mechanics | 50 | 1 | 80% | 2 | 20 | Reject: 1000× is the joke; the tutorial is optional | Rejected |
| 13 | A risk line on the ticket: how often a day's usual move wipes this position | Education | 60 | 2 | 50% | 3 | 20 | Consider: true numbers need care | — |
| 14 | A 30-second "one trade" try before choosing a name | Education | 80 | 2 | 50% | 4 | 20 | Consider: the first five minutes | — |
| 15 | Phone: the feed folded under the chart by default | UI | 50 | 1 | 80% | 2 | 20 | Build after freeze | — |
| 16 | Projector view: chart, board and feed only, large | UI | 30 | 2 | 80% | 3 | 16 | Consider for the showcase screen | — |
| 17 | Rematch after a duel | Actions | 20 | 1 | 80% | 1 | 16 | Build after freeze | Built, from the bell |
| 18 | An example agent prompt beside the MCP line | Education | 10 | 1 | 80% | 0.5 | 16 | Build: one line in the README | Built, in the README |
| 19 | Skip to any tutorial lesson | Education | 30 | 0.5 | 80% | 1 | 12 | Build after freeze | Built: the lesson number is a list |
| 20 | The price tag pulses on a big move | Art | 60 | 0.25 | 80% | 1 | 12 | Optional | — |
| 21 | A weekly Live season: longest survival this week | Mechanics | 40 | 1 | 80% | 3 | 11 | Consider: the board already ranks survival | — |
| 22 | Live falls back to a labelled replay when Yahoo fails | Elements | 40 | 2 | 50% | 4 | 10 | Consider: the showcase's biggest risk | — |
| 23 | Paid prayers or loot boxes for luck | Mechanics | 60 | 1 | 50% | 3 | 10 | Reject: rewards spending | Rejected |
| 24 | Partial close | Actions | 30 | 1 | 80% | 3 | 8 | Defer: real feature, small lesson | — |
| 25 | A result card to share after the bell | UI | 40 | 1 | 50% | 3 | 7 | Defer | — |
| 26 | Achievements, such as "Survived Lehman" | Mechanics | 50 | 1 | 50% | 4 | 6 | Defer: rewards surviving, not learning | — |
| 27 | Rewind plots by difficulty | Elements | 30 | 0.5 | 80% | 2 | 6 | Reject: hints at the plot | Rejected |
| 28 | Bot faces react to their own profit and loss | Art | 40 | 0.5 | 80% | 3 | 5 | Optional | — |
| 29 | Trailing stop | Actions | 20 | 1 | 80% | 3 | 5 | Defer | — |
| 30 | Keyboard shortcuts: B, S, C | UI | 10 | 0.5 | 80% | 1 | 4 | Defer: Tab already reaches every control | — |
| 31 | A flip button that reverses a position | Actions | 20 | 0.5 | 80% | 2 | 4 | Reject: rewards the revenge trade | Rejected |
| 32 | Agents and people on separate boards | Mechanics | 10 | 0.5 | 80% | 1 | 4 | Reject: the badge already marks agents | — |
| 33 | Follow a bot's trades | Actions | 30 | 1 | 50% | 4 | 4 | Reject: copy-trading is what brokers sell | Rejected |
| 34 | Teams sharing one account | Mechanics | 30 | 2 | 50% | 8 | 4 | Defer: large, untested with people | — |
| 35 | Teacher mode: a presenter runs a Rewind with notes | Education | 20 | 2 | 50% | 6 | 3 | Defer: after the course | — |
| 36 | A personal record across rounds | UI | 30 | 1 | 50% | 5 | 3 | Defer | — |
| 37 | Two more Rewind plots | Elements | 40 | 0.5 | 80% | 6 | 3 | Defer | — |
| 38 | A real economic calendar in Live | Elements | 30 | 1 | 50% | 6 | 2 | Reject: removed on purpose; news is in the feed | — |
| 39 | Screen-reader announcements of fills | UI | 5 | 1 | 80% | 2 | 2 | Consider: accessibility, rubric-adjacent | Built: your own moments are said aloud |
| 40 | A crypto pair in Live | Elements | 20 | 0.5 | 50% | 6 | 0.8 | Reject: off the FX idea | Rejected |

The deposit bonus and the paid prayers score in the middle but break the game's first rule, play money only. They show RICE's blind spot: it scores reach and effort, not whether a feature betrays the idea.

Checking the top of the list against the code showed four of the top eleven already in the game: the agent drafted them from the README and ADRs, which do not mention every detail of the page. A RICE list drafted from documents needs checking against the running app before anything is built.
