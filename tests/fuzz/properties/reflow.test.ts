/**
 * Property tests for reflow/scheduling (Spec 12).
 *
 * Tests invariants through the REAL createAutoplanner → getSchedule pipeline.
 * No mock engines — every test verifies behavior of the actual CSP solver.
 *
 * Properties tested:
 * - Determinism (#359, #391)
 * - Fixed vs flexible items (#374, #375, #376)
 * - All-day item handling (#367)
 * - Reflow triggers (#383-#389)
 * - Conflict reporting (#377)
 * - Schedule queries (#390)
 * - Condition evaluation (#363-#364)
 * - Domain properties (#365-#366)
 * - Day balancing (#378-#379)
 * - Completeness (#372-#373)
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createAutoplanner, type Autoplanner } from '../../../src/public-api'
import { createMockAdapter } from '../../../src/adapter'
import type { LocalDate, LocalTime, Duration } from '../../../src/core'
import { assertScheduleInvariants } from '../../helpers/schedule-invariants'

// ============================================================================
// Helpers
// ============================================================================

function date(iso: string): LocalDate {
  return iso as LocalDate
}

function time(hhmm: string): LocalTime {
  return hhmm as LocalTime
}

function minutes(n: number): Duration {
  return n as Duration
}

function makePlanner(): Autoplanner {
  return createAutoplanner({ adapter: createMockAdapter(), timezone: 'UTC' })
}

function timeOf(dt: string): string {
  return dt.slice(11)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

function rangesOverlap(s1: string, d1: number, s2: string, d2: number): boolean {
  const a = timeToMinutes(s1), b = a + d1
  const c = timeToMinutes(s2), d = c + d2
  return a < d && c < b
}

async function getScheduleChecked(
  p: Autoplanner,
  start: LocalDate,
  end: LocalDate,
): ReturnType<Autoplanner['getSchedule']> {
  const schedule = await p.getSchedule(start, end)
  assertScheduleInvariants(schedule)
  return schedule
}

// Generators
const hourGen = fc.integer({ min: 7, max: 21 })
const durationMinGen = fc.integer({ min: 15, max: 90 })
const dateStr = '2026-06-15'

// ============================================================================
// Determinism (#359, #391)
// ============================================================================

describe('Spec 12: Reflow - Determinism', () => {
  it('Property #359: reflow is deterministic — same no-time series produce same schedule', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        durationMinGen,
        async (count, dur) => {
          const planner = makePlanner()
          for (let i = 0; i < count; i++) {
            await planner.createSeries({
              title: `Det-${i}`,
              patterns: [{ type: 'daily', duration: minutes(dur) }],
              startDate: date(dateStr),
            })
          }

          const s1 = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const s2 = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          const times1 = s1.instances.map(i => `${i.title}@${i.time}`).sort()
          const times2 = s2.instances.map(i => `${i.title}@${i.time}`).sort()
          expect(times1).toEqual(times2)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Property #391: getSchedule immediately reflects createSeries (synchronous reflow)', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'Instant',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(30) }],
      startDate: date(dateStr),
    })

    // getSchedule should immediately see the new series — no async lag
    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const inst = schedule.instances.find(i => i.seriesId === id)
    expect(inst).toBeDefined()
    expect(inst!.title).toBe('Instant')
    expect(timeOf(inst!.time as string)).toBe('10:00:00')
  })
})

// ============================================================================
// Fixed Items (#374, #375)
// ============================================================================

describe('Spec 12: Reflow - Fixed Items', () => {
  it('Property #374: fixed items ALWAYS at their time regardless of surrounding items', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        fc.integer({ min: 1, max: 4 }),
        async (hour, dur, flexCount) => {
          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          const fixedId = await planner.createSeries({
            title: 'Fixed',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          // Add flexible no-time items that default to 09:00
          for (let i = 0; i < flexCount; i++) {
            await planner.createSeries({
              title: `Flex-${i}`,
              patterns: [{ type: 'daily', duration: minutes(dur) }],
              startDate: date(dateStr),
            })
          }

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const fixedInst = schedule.instances.find(i => i.seriesId === fixedId)
          expect(fixedInst).toBeDefined()
          expect(timeOf(fixedInst!.time as string)).toBe(`${hh}:00:00`)
        }
      ),
      { numRuns: 25 }
    )
  })

  it('Property #375: fixed-fixed overlaps allowed but produce conflict warning', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        async (hour, dur) => {
          fc.pre(dur >= 30)

          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          const id1 = await planner.createSeries({
            title: 'Fixed-1',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          // Second fixed item 15 min later — guaranteed to overlap if dur >= 30
          const hh2 = hour.toString().padStart(2, '0')
          const id2 = await planner.createSeries({
            title: 'Fixed-2',
            patterns: [{ type: 'daily', time: time(`${hh2}:15`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          // Both stay at their positions
          const inst1 = schedule.instances.find(i => i.seriesId === id1)
          const inst2 = schedule.instances.find(i => i.seriesId === id2)
          expect(inst1).toBeDefined()
          expect(inst2).toBeDefined()
          expect(timeOf(inst1!.time as string)).toBe(`${hh}:00:00`)
          expect(timeOf(inst2!.time as string)).toBe(`${hh2}:15:00`)

          // Overlap conflict reported
          const overlap = schedule.conflicts.find(c => c.type === 'overlap')
          expect(overlap).toBeDefined()
          expect(overlap!.seriesIds).toContain(id1)
          expect(overlap!.seriesIds).toContain(id2)
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ============================================================================
// Flexible Items (#376)
// ============================================================================

describe('Spec 12: Reflow - Flexible Items', () => {
  it('Property #376: no-time flexibles placed in waking hours without overlapping fixed', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        async (fixedHour, dur) => {
          const planner = makePlanner()
          const hh = fixedHour.toString().padStart(2, '0')

          // Fixed item at a specific time
          await planner.createSeries({
            title: 'Fixed',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          // Flexible no-time item
          await planner.createSeries({
            title: 'Flex',
            patterns: [{ type: 'daily', duration: minutes(dur) }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const fixed = schedule.instances.find(i => i.title === 'Fixed')!
          const flex = schedule.instances.find(i => i.title === 'Flex')!

          // Flex should be in waking hours
          const flexMins = timeToMinutes(timeOf(flex.time as string))
          expect(flexMins).toBeGreaterThanOrEqual(7 * 60)
          expect(flexMins + dur).toBeLessThanOrEqual(23 * 60)

          // Should not overlap with fixed
          expect(
            rangesOverlap(
              timeOf(fixed.time as string), dur,
              timeOf(flex.time as string), dur,
            ),
          ).toBe(false)
        }
      ),
      { numRuns: 25 }
    )
  })
})

// ============================================================================
// All-Day Items (#367)
// ============================================================================

describe('Spec 12: Reflow - All-Day Items', () => {
  it('Property #367: all-day items excluded from reflow — no conflicts with timed items', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        async (hour, dur) => {
          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          await planner.createSeries({
            title: 'AllDay',
            patterns: [{ type: 'daily', allDay: true }],
            startDate: date(dateStr),
          })

          await planner.createSeries({
            title: 'Timed',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur) }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          const allDay = schedule.instances.find(i => i.title === 'AllDay')
          const timed = schedule.instances.find(i => i.title === 'Timed')
          expect(allDay).toBeDefined()
          expect(allDay!.allDay).toBe(true)
          expect(timed).toBeDefined()
          expect(timeOf(timed!.time as string)).toBe(`${hh}:00:00`)

          // No conflicts between all-day and timed
          expect(schedule.conflicts).toHaveLength(0)
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ============================================================================
// Triggers (#383-#389)
// ============================================================================

describe('Spec 12: Reflow - Triggers', () => {
  it('Property #383: createSeries triggers reflow — new item appears in schedule', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'NewSeries',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      startDate: date(dateStr),
    })

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const inst = schedule.instances.find(i => i.seriesId === id)
    expect(inst).toBeDefined()
    expect(inst!.title).toBe('NewSeries')
  })

  it('Property #384: updateSeries triggers reflow — updated title reflected', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'Original',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      startDate: date(dateStr),
    })

    await planner.updateSeries(id, { title: 'Updated' })

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const inst = schedule.instances.find(i => i.seriesId === id)
    expect(inst!.title).toBe('Updated')
  })

  it('Property #385: deleteSeries triggers reflow — deleted item gone from schedule', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'ToDelete',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      startDate: date(dateStr),
    })

    // Verify it exists first
    let schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    expect(schedule.instances.find(i => i.seriesId === id)).toBeDefined()

    await planner.deleteSeries(id)

    schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    expect(schedule.instances.find(i => i.seriesId === id)).toBeUndefined()
  })

  it('Property #386: linkSeries triggers reflow — child positioned after parent', async () => {
    const planner = makePlanner()

    const parentId = await planner.createSeries({
      title: 'Parent',
      patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30), fixed: true }],
      startDate: date(dateStr),
    })

    const childId = await planner.createSeries({
      title: 'Child',
      patterns: [{ type: 'daily', duration: minutes(30) }],
      startDate: date(dateStr),
    })

    await planner.linkSeries(parentId, childId, {
      distance: 60,
      earlyWobble: 0,
      lateWobble: 0,
    })

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const child = schedule.instances.find(i => i.seriesId === childId)!
    // Parent ends 09:30 + 60 min distance = 10:30
    expect(timeToMinutes(timeOf(child.time as string))).toBe(630)
  })

  it('Property #387: addConstraint triggers reflow — constraint violation detected', async () => {
    const planner = makePlanner()

    const id1 = await planner.createSeries({
      title: 'Must Be First',
      patterns: [{ type: 'daily', time: time('14:00'), duration: minutes(30), fixed: true }],
      startDate: date(dateStr),
    })

    const id2 = await planner.createSeries({
      title: 'Must Be Second',
      patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30), fixed: true }],
      startDate: date(dateStr),
    })

    // id1 at 14:00 must be before id2 at 09:00 — impossible
    await planner.addConstraint({ type: 'mustBeBefore', firstSeries: id1, secondSeries: id2 })

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const violation = schedule.conflicts.find(c => c.type === 'constraintViolation')
    expect(violation).toBeDefined()
    expect(violation!.seriesIds).toContain(id1)
    expect(violation!.seriesIds).toContain(id2)
  })

  it('Property #388: cancelInstance triggers reflow — cancelled instance gone', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'Cancellable',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      startDate: date(dateStr),
    })

    await planner.cancelInstance(id, date(dateStr))

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const inst = schedule.instances.find(i => i.seriesId === id && (i.date as string) === dateStr)
    expect(inst).toBeUndefined()
  })

  it('Property #389: logCompletion triggers reflow — schedule updated', async () => {
    const planner = makePlanner()

    const id = await planner.createSeries({
      title: 'Completable',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      startDate: date(dateStr),
    })

    await planner.logCompletion(id, date(dateStr))

    // Schedule should still work without errors after completion
    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    // Instance should still be present (completion doesn't remove it)
    const inst = schedule.instances.find(i => i.seriesId === id)
    expect(inst).toBeDefined()
    expect(inst!.title).toBe('Completable')
  })
})

// ============================================================================
// Conflicts (#377)
// ============================================================================

describe('Spec 12: Reflow - Conflicts', () => {
  it('Property #377: all fixed-fixed overlaps reported as conflicts', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        fc.integer({ min: 60, max: 90 }),
        async (hour, dur) => {
          fc.pre(hour <= 20) // leave room for 3 overlapping items

          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          // Three overlapping fixed items
          await planner.createSeries({
            title: 'F1',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })
          await planner.createSeries({
            title: 'F2',
            patterns: [{ type: 'daily', time: time(`${hh}:15`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })
          await planner.createSeries({
            title: 'F3',
            patterns: [{ type: 'daily', time: time(`${hh}:30`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          // At least 2 overlap conflicts (F1-F2, F2-F3, possibly F1-F3)
          const overlaps = schedule.conflicts.filter(c => c.type === 'overlap')
          expect(overlaps.length).toBeGreaterThanOrEqual(2)

          // Each overlap should have concrete seriesIds
          for (const o of overlaps) {
            expect(o.seriesIds).toHaveLength(2)
            expect(o.instances.length).toBeGreaterThanOrEqual(2)
            expect(o.instances[0]!.title).toBeDefined()
          }
        }
      ),
      { numRuns: 15 }
    )
  })
})

// ============================================================================
// Schedule Queries (#390)
// ============================================================================

describe('Spec 12: Reflow - Schedule Queries', () => {
  it('Property #390: getSchedule returns post-reflow state with redistributed items', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        async (hour, dur) => {
          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          // Fixed item
          await planner.createSeries({
            title: 'Fixed',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          // Flexible no-time item (defaults to 09:00, gets reflowed)
          await planner.createSeries({
            title: 'Flex',
            patterns: [{ type: 'daily', duration: minutes(dur) }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          // Both items present
          const fixed = schedule.instances.find(i => i.title === 'Fixed')
          const flex = schedule.instances.find(i => i.title === 'Flex')
          expect(fixed).toBeDefined()
          expect(flex).toBeDefined()

          // Fixed at its declared time
          expect(timeOf(fixed!.time as string)).toBe(`${hh}:00:00`)

          // Flex in waking hours
          const flexMins = timeToMinutes(timeOf(flex!.time as string))
          expect(flexMins).toBeGreaterThanOrEqual(7 * 60)
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ============================================================================
// Condition Evaluation (#363-#364)
// ============================================================================

describe('Spec 12: Reflow - Condition Evaluation', () => {
  it('Property #363: condition evaluated for schedule date — item appears or not based on completions', async () => {
    const planner = makePlanner()

    // Create a conditional series: only appears if completed < 3 times in 7 days
    const id = await planner.createSeries({
      title: 'Conditional',
      patterns: [{
        type: 'daily',
        time: time('10:00'),
        duration: minutes(30),
        condition: {
          type: 'completionCount',
          seriesRef: 'self',
          windowDays: 7,
          comparison: 'lessThan',
          value: 3,
        },
      }],
      startDate: date('2026-06-10'),
    })

    // No completions → should appear
    let schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    let inst = schedule.instances.find(i => i.seriesId === id)
    expect(inst).toBeDefined()
    expect(inst!.title).toBe('Conditional')

    // Add 3 completions → condition no longer met
    for (let d = 10; d <= 12; d++) {
      await planner.logCompletion(id, date(`2026-06-${d}`))
    }

    schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    inst = schedule.instances.find(i => i.seriesId === id && (i.date as string) === dateStr)
    // Should NOT appear (3 completions in 7 days ≥ 3, condition is lessThan 3)
    expect(inst).toBeUndefined()
  })

  it('Property #364: duration is consistent across getSchedule calls', async () => {
    const planner = makePlanner()

    await planner.createSeries({
      title: 'Stable',
      patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(45) }],
      startDate: date(dateStr),
    })

    const s1 = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const s2 = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

    const inst1 = s1.instances.find(i => i.title === 'Stable')!
    const inst2 = s2.instances.find(i => i.title === 'Stable')!

    expect(inst1.duration).toBe(45)
    expect(inst2.duration).toBe(45)
    expect(inst1.time).toBe(inst2.time)
  })
})

// ============================================================================
// Domain Properties (#365-#366)
// ============================================================================

describe('Spec 12: Reflow - Domain Properties', () => {
  it('Property #365: fixed items have single-slot domain — always at declared time', async () => {
    await fc.assert(
      fc.asyncProperty(
        hourGen,
        durationMinGen,
        async (hour, dur) => {
          const planner = makePlanner()
          const hh = hour.toString().padStart(2, '0')

          const id = await planner.createSeries({
            title: 'FixedDomain',
            patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(dur), fixed: true }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const inst = schedule.instances.find(i => i.seriesId === id)!

          // Fixed item always at its exact time (single-slot domain)
          expect(timeOf(inst.time as string)).toBe(`${hh}:00:00`)
          expect(inst.duration).toBe(dur)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Property #366: flexible no-time items bounded by waking hours window', async () => {
    await fc.assert(
      fc.asyncProperty(
        durationMinGen,
        async (dur) => {
          const planner = makePlanner()

          await planner.createSeries({
            title: 'FlexDomain',
            patterns: [{ type: 'daily', duration: minutes(dur) }],
            startDate: date(dateStr),
          })

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const inst = schedule.instances.find(i => i.title === 'FlexDomain')!

          const mins = timeToMinutes(timeOf(inst.time as string))
          // Within waking hours window (07:00-23:00)
          expect(mins).toBeGreaterThanOrEqual(7 * 60)
          expect(mins + dur).toBeLessThanOrEqual(23 * 60)
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ============================================================================
// Day Balancing (#378-#379)
// ============================================================================

describe('Spec 12: Reflow - Day Balancing', () => {
  it('Property #378: no-time items distributed across available slots', async () => {
    const planner = makePlanner()

    // 4 no-time items, all 60 min → should spread across waking hours
    for (let i = 0; i < 4; i++) {
      await planner.createSeries({
        title: `Balance-${i}`,
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date(dateStr),
      })
    }

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
    const items = schedule.instances.filter(i => i.title.startsWith('Balance-'))
    expect(items).toHaveLength(4)

    // No two items should overlap
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        expect(
          rangesOverlap(
            timeOf(items[i]!.time as string), items[i]!.duration || 60,
            timeOf(items[j]!.time as string), items[j]!.duration || 60,
          ),
        ).toBe(false)
      }
    }
  })

  it('Property #379: balancing secondary to constraint satisfaction — fixed items never moved', async () => {
    const planner = makePlanner()

    // Fixed items at specific times
    await planner.createSeries({
      title: 'FixedA',
      patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
      startDate: date(dateStr),
    })
    await planner.createSeries({
      title: 'FixedB',
      patterns: [{ type: 'daily', time: time('14:00'), duration: minutes(60), fixed: true }],
      startDate: date(dateStr),
    })

    // Flexible items should work around fixed ones
    await planner.createSeries({
      title: 'Flex',
      patterns: [{ type: 'daily', duration: minutes(60) }],
      startDate: date(dateStr),
    })

    const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

    // Fixed items stay put
    const fixedA = schedule.instances.find(i => i.title === 'FixedA')!
    const fixedB = schedule.instances.find(i => i.title === 'FixedB')!
    expect(timeOf(fixedA.time as string)).toBe('09:00:00')
    expect(timeOf(fixedB.time as string)).toBe('14:00:00')

    // Flex doesn't overlap with either
    const flex = schedule.instances.find(i => i.title === 'Flex')!
    expect(rangesOverlap(timeOf(flex.time as string), 60, '09:00:00', 60)).toBe(false)
    expect(rangesOverlap(timeOf(flex.time as string), 60, '14:00:00', 60)).toBe(false)
  })
})

// ============================================================================
// Completeness (#372-#373)
// ============================================================================

describe('Spec 12: Reflow - Completeness', () => {
  it('Property #372: all series appear in schedule — no items silently dropped', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        durationMinGen,
        async (count, dur) => {
          const planner = makePlanner()
          const ids: string[] = []

          for (let i = 0; i < count; i++) {
            const id = await planner.createSeries({
              title: `Complete-${i}`,
              patterns: [{ type: 'daily', duration: minutes(dur) }],
              startDate: date(dateStr),
            })
            ids.push(id)
          }

          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))

          // Every created series must appear in the schedule
          for (const id of ids) {
            const inst = schedule.instances.find(i => i.seriesId === id)
            expect(inst).toBeDefined()
          }
        }
      ),
      { numRuns: 15 }
    )
  })

  it('Property #373: algorithm always terminates — getSchedule returns in bounded time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (count) => {
          const planner = makePlanner()

          for (let i = 0; i < count; i++) {
            await planner.createSeries({
              title: `Term-${i}`,
              patterns: [{ type: 'daily', duration: minutes(30) }],
              startDate: date(dateStr),
            })
          }

          const start = Date.now()
          const schedule = await getScheduleChecked(planner, date(dateStr), date('2026-06-16'))
          const elapsed = Date.now() - start

          // Must complete in reasonable time (1 second)
          expect(elapsed).toBeLessThan(1000)
          expect(schedule.instances).toHaveLength(count)
        }
      ),
      { numRuns: 10 }
    )
  })
})
