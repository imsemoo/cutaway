# 13. A forecast from what is known, checked against the day

## Context

A bed manager's question is not how many beds are free now, which the board already says, but whether there will be beds for the patients coming in this afternoon. A forecast can answer it, and it can also mislead: a single number reads as a promise, and a forecast built inside a simulation can quietly read the simulated future it is meant to predict.

## Decision

The forecast counts the balance of ward beds: clean, empty beds less the patients waiting for one. An admission takes one of each and leaves the balance as it was, so the balance ahead is the balance now, plus the beds that will come out of cleaning, less the requests that will arrive. It is given every fifteen minutes for four hours, as the most likely value and a range meant to hold four times in five, and drawn as a range.

It is made only from what is known at the minute: the beds waiting for cleaning or being cleaned and for how long, the discharges the morning round has planned and that have not happened, the patients waiting, and the usual day. The simulation gained what a hospital would know ahead, discharge plans with their estimated times and the requests for beds, from a random stream of its own so the replayed day did not change. The usual day is the simulation's own parameters (`WARD` and `PLAN`); in a hospital it would come from its history. Each forecast runs 300 draws of how long each bed takes and how many requests arrive, seeded by the minute and the place, so a view shows the same forecast every time it is opened.

A test checks that it knows nothing it should not: built from the live feed up to a minute, the forecast is identical to the one built from the whole recorded day. A backtest checks that it is right: it makes the forecast at every half hour in every wing and compares it with what the day did.

## Consequences

- Measured on the replayed day, per wing, four hours ahead: the range held 94% of the time and the middle was off by 0.68 of a bed on average, with almost no lean either way (−0.05). With a few beds a wing, the range rounds to whole beds and errs wide.
- For the hospital as a whole, one day is one sample. Over twelve other simulated days, the 35 ordinary wings together held 88%, 83% and 80% of the time one, two and four hours ahead. The replayed day falls short of that, because its story wing keeps a scripted day of its own and its evening happened to be busier than usual. The test checks the twelve-day figure, not the one day.
- The forecast knows the simulation's averages, so the backtest measures how well it reasons from them, not how well it learned them. Run against a real hospital's history, the same backtest would measure both.
- ICU bays are left out. They admit bay to bay, and their few beds would add noise to the ward question.
- The first version missed by half its range; two faults were found by the backtest, not by looking. They are in [the making of](../making-of.md).
