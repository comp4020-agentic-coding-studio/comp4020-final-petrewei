# ADR 0071: Explicit Tutorial Controls and Short Tick Labels

Status: accepted, 2 November 2026. The tutorial's controls and the tick tooltips were redone by [ADR 0072](0072-the-tutorial-plays-like-a-disc.md).

## 1 Decision

The tutorial waits for Start. Its four controls are Start/Restart, Back, Stop/Continue and Skip. Stop freezes the private scripted price queue and automatic hint timer; Continue resumes them. Seconds remain in hint text from its first display, including while stopped. Restart begins the tutorial again.

The ladder is 1, 3, 10, 30, 100, 300 and 1000, and the desk takes that ladder and no other: a leverage the page does not offer, such as 2, 5, 200 or 500, is refused as "No such leverage." The house traders and every check trade only on it. The "wild" threshold is unchanged and now means 300× and up. Tick hover labels are short descriptions followed by the financing rate. The ticket calls the time-based charge margin interest; the four stake choices retain their percentages and get short hover descriptions.

Pause and countdown overlays use translucent backgrounds. About has the market header tools and footer, with standalone language, theme and audio controls. The name form includes the About link alongside its other tools.

## 2 What Was Left Out

The tutorial has no button for starting a single lesson again: Start and Restart begin the whole tutorial, and the server's `again` action remains for an older page. Whether the tutorial has begun is kept in the page only, so a reload waits for Start again, and Start clears the server's stopped state. The About page's header is cut out of the market page's header, with the tabs and the name button removed; a check reads it in all three languages so a change to either page cannot lose a tool.

## 3 Deploying

The live checks run against the deployed app. An app still on the old ladder refuses 300×, so the checks that trade at it fail until this is deployed; they pass once it is.
