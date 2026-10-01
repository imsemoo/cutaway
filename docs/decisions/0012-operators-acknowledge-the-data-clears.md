# 12. Operators acknowledge; the data clears

## Context

The twin showed alerts and nothing more could be done with them. An operator who has seen a warm room needs to say so, and to hand it to the team that can fix it, and a reviewer of the day needs to see who saw what, and when.

The tempting design is a "resolve" button that closes an alert. It would also be a lie: a button does not cool a room or answer a call light. Alarm-management practice (ISA-18.2, IEC 62682) keeps the two apart. The process clears an alarm when its condition ends; the operator acknowledges it. An alarm that clears before anyone acknowledged it is the case a review looks for.

## Decision

An alert still opens and clears with its condition, from the data. An operator can acknowledge it, then send it to the team that owns its kind: facilities for a warm room or stale air, nursing for a call light or a pump on battery, housekeeping for a bed waiting to be cleaned, bed management for a clean bed with no patient. Each is an action stamped with the minute it was taken, and actions are part of the day, like everything else the views read. How an alert stands at minute t is worked out from the actions taken by t, so scrubbing back before an acknowledgement shows the alert new again, and a room's log never shows what comes later.

Live, an action does not change the screen that took it. It goes to the server as a message, the server logs it as an event at its own clock, and every screen on the feed folds it in, the one that sent it included. An action waits in an outbox until the server's log has it and goes again after every reconnect, so one taken during an outage arrives after it; the server logs an action once, by its id, so sending it twice is safe.

## Consequences

- One code path for every screen: the view of an alert is a function of the day and a minute, whether the action came from this screen, another one, or a catch-up after a drop.
- In replay, actions belong to this visit only. The recorded day plays on as it was recorded, so sending a warm room to facilities does not fix it sooner; a real deployment would pass the action on to the team's own system, through the same feed.
- Each kind of alert has one owner. Real hospitals route by more than the kind, by ward and by hour; the table is one place to change.
- The embed reports each alert's handling, `acknowledged` and `sentTo`, in the same message as the rest of the alert, without a new protocol version.
- The alert list and its actions load after the first paint, with the forecast, since neither can show anything before the day arrives.
