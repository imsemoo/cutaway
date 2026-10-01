import { describe, expect, it } from 'vitest'
import { STORY, WINGS, WING_BY_CODE } from '../data/floorplan'
import { applyEvents, emptyDay, toEvents } from '../live/events'
import { PLAN, simulate } from '../sim/simulate'
import { DAY_MIN } from '../sim/time'
import { DEFAULT_TIME } from '../state/store'
import { HORIZON, STRIDE, balanceAt, outlook, pendingPlan } from './forecast'
import { bedAt } from './query'

const day = simulate()
// `npm run backtest` prints the measurements the case study quotes.
const report = (rows: Record<string, unknown>[]) => import.meta.env.MODE === 'backtest' && console.table(rows)
const percent = (x: number) => `${(x * 100).toFixed(1)} %`

/** How the forecast fared against what the day did next, `h` minutes ahead, at every `every` minutes from `from`. */
function backtest(d: typeof day, places: (typeof WINGS)[], h: number, every: number, from = 0) {
  let n = 0
  let held = 0
  let off = 0
  let bias = 0
  for (const wings of places) {
    for (let t = from; t + h <= DAY_MIN; t += every) {
      const s = outlook(d, t, wings).steps[h / STRIDE]
      const actual = balanceAt(d, t + h, wings)
      n++
      if (actual >= s.low && actual <= s.high) held++
      off += Math.abs(actual - s.mid)
      bias += actual - s.mid
    }
  }
  return { held: held / n, off: off / n, bias: bias / n, n }
}

describe('the capacity forecast', () => {
  it('starts from the balance now: ward beds ready, less the patients waiting', () => {
    for (const t of [9 * 60, DEFAULT_TIME, 19 * 60]) {
      const o = outlook(day, t, WINGS)
      expect(o.steps[0]).toEqual({ at: t, low: o.ready - o.waiting, mid: o.ready - o.waiting, high: o.ready - o.waiting })
      expect(o.ready - o.waiting).toBe(balanceAt(day, t, WINGS))
    }
  })

  it('looks four hours ahead in steps, and stops at midnight', () => {
    expect(outlook(day, DEFAULT_TIME, WINGS).steps).toHaveLength(HORIZON / STRIDE + 1)
    expect(outlook(day, 22 * 60, WINGS).steps.at(-1)?.at).toBe(DAY_MIN)
  })

  it('gives the same view the same forecast', () => {
    const wing = [WING_BY_CODE[STORY]]
    expect(outlook(day, DEFAULT_TIME, wing)).toEqual(outlook(day, DEFAULT_TIME, wing))
  })

  it('knows only what had happened by its minute: made from the live feed so far, it is the same forecast', () => {
    const log = toEvents(day)
    for (const t of [8 * 60 + 40, DEFAULT_TIME, 19 * 60 + 5]) {
      const live = applyEvents(emptyDay(day.seed), log.filter((e) => e.at <= t))
      expect(outlook(live, t, WINGS)).toEqual(outlook(day, t, WINGS))
    }
  })

  it('counts a planned discharge from when the round noted it, while its patient is still in', () => {
    const plan = day.plans.find((p) => p.at > PLAN.round[0] && bedAt(day, p.room, p.at)?.state === 'occupied')!
    expect(pendingPlan(day, plan.room, plan.at - 1)).toBeUndefined()
    expect(pendingPlan(day, plan.room, plan.at)).toEqual(plan)
    const left = day.rooms[plan.room].spans.find((s) => s.state === 'dirty' && s.from > plan.at)!
    expect(pendingPlan(day, plan.room, left.from)).toBeUndefined()
  })

  it('holds what each wing did next inside its range at least four times in five, and misses by under a bed on average', () => {
    // Whole beds make the range err wide: a wing's few beds hold it more often than four times in five.
    const rows = [60, 120, HORIZON].map((h) => ({ h, ...backtest(day, WINGS.map((w) => [w]), h, 30) }))
    report(rows.map(({ h, held, off, bias, n }) => ({ 'each wing, the replayed day': `${h / 60} h ahead`, held: percent(held), 'off by': off.toFixed(2), lean: bias.toFixed(2), n })))
    for (const { h, held, off, bias } of rows) {
      expect(held, `${h} min ahead`).toBeGreaterThan(0.8)
      expect(off).toBeLessThan(1)
      expect(Math.abs(bias)).toBeLessThan(0.3)
    }
  }, 30_000)

  it('across the hospital, over twelve other simulated days, holds about four times in five, with no lean either way', () => {
    // The story wing keeps a scripted day of its own, so the 35 ordinary wings are counted together.
    const ordinary = [WINGS.filter((w) => w.code !== STORY)]
    const days = Array.from({ length: 12 }, (_, k) => simulate(1000 + 37 * (k + 1)))
    const rows = [60, 120, HORIZON].map((h) => {
      const runs = days.map((d) => backtest(d, ordinary, h, 60, 6 * 60))
      const n = runs.reduce((a, r) => a + r.n, 0)
      const mean = (key: 'held' | 'off' | 'bias') => runs.reduce((a, r) => a + r[key] * r.n, 0) / n
      return { h, held: mean('held'), off: mean('off'), bias: mean('bias'), n }
    })
    report(rows.map(({ h, held, off, bias, n }) => ({ '35 wings together, 12 days': `${h / 60} h ahead`, held: percent(held), 'off by': off.toFixed(2), lean: bias.toFixed(2), n })))
    const last = rows.at(-1)!
    expect(last.held).toBeGreaterThan(0.7)
    expect(last.held).toBeLessThan(0.95)
    for (const r of rows) expect(Math.abs(r.bias)).toBeLessThan(1.5)
  }, 60_000)
})
