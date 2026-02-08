/**
 * Segment 17: Reflow Integration Tests
 *
 * Verifies that the CSP solver (reflow) runs through createAutoplanner → getSchedule,
 * properly distributing flexible items, preserving fixed items, respecting chain
 * constraints, and reporting conflicts.
 *
 * Dependencies: Segments 1-16
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createAutoplanner, type Autoplanner } from '../src/public-api'
import { createMockAdapter } from '../src/adapter'
import {
  type LocalDate,
  type LocalTime,
  type Duration,
} from '../src/core'

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

async function createTestPlanner(): Promise<Autoplanner> {
  return createAutoplanner({
    adapter: createMockAdapter(),
    timezone: 'UTC',
  })
}

/** Extract the HH:MM:SS portion from a LocalDateTime string */
function timeOf(dt: string): string {
  return dt.slice(11)
}

/** Convert HH:MM:SS to total minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

/** Check whether two time ranges overlap */
function rangesOverlap(
  start1: string,
  dur1: number,
  start2: string,
  dur2: number,
): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = s1 + dur1
  const s2 = timeToMinutes(start2)
  const e2 = s2 + dur2
  return s1 < e2 && s2 < e1
}

// ============================================================================
// Tests
// ============================================================================

describe('Segment 17: Reflow Integration Tests', () => {
  let planner: Autoplanner

  beforeEach(async () => {
    planner = await createTestPlanner()
  })

  // ========================================================================
  // Flexible item redistribution
  // ========================================================================
  describe('Flexible item redistribution', () => {
    // Items WITHOUT pattern.time are flexible (default to 09:00, solver redistributes).
    // Items WITH pattern.time are treated as fixed by the solver (user chose that time).

    it('two no-time flexibles get separated', async () => {
      await planner.createSeries({
        title: 'Task A',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Task B',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const a = schedule.instances.find(i => i.title === 'Task A')!
      const b = schedule.instances.find(i => i.title === 'Task B')!

      // They should NOT overlap after reflow
      expect(
        rangesOverlap(
          timeOf(a.time as string), a.duration || 60,
          timeOf(b.time as string), b.duration || 60,
        ),
      ).toBe(false)
    })

    it('five no-time flexibles all fit without overlap', async () => {
      for (let i = 0; i < 5; i++) {
        await planner.createSeries({
          title: `Flex ${i}`,
          patterns: [{ type: 'daily', duration: minutes(30) }],
          startDate: date('2026-03-01'),
        })
      }

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const instances = schedule.instances.filter(i => !i.allDay)

      expect(instances).toHaveLength(5)

      // Pairwise non-overlap check
      for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
          const a = instances[i]!
          const b = instances[j]!
          expect(
            rangesOverlap(
              timeOf(a.time as string), a.duration || 30,
              timeOf(b.time as string), b.duration || 30,
            ),
          ).toBe(false)
        }
      }
    })

    it('no-time flexible moves around fixed occupier', async () => {
      await planner.createSeries({
        title: 'Fixed Meeting',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })
      // No time → defaults to 09:00 → solver must move it
      await planner.createSeries({
        title: 'Flexible Task',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const fixed = schedule.instances.find(i => i.title === 'Fixed Meeting')!
      const flexible = schedule.instances.find(i => i.title === 'Flexible Task')!

      // Fixed stays at 09:00
      expect(timeOf(fixed.time as string)).toBe('09:00:00')

      // Flexible moved to a non-overlapping slot
      expect(
        rangesOverlap(
          timeOf(fixed.time as string), fixed.duration || 60,
          timeOf(flexible.time as string), flexible.duration || 60,
        ),
      ).toBe(false)
    })

    it('no-time flexible lands in waking hours', async () => {
      await planner.createSeries({
        title: 'No Time Set',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const inst = schedule.instances.find(i => i.title === 'No Time Set')!

      const mins = timeToMinutes(timeOf(inst.time as string))
      expect(mins).toBeGreaterThanOrEqual(7 * 60)
      expect(mins + (inst.duration || 60)).toBeLessThanOrEqual(23 * 60)
    })

    it('explicit-time items stay at their chosen time', async () => {
      await planner.createSeries({
        title: 'Chosen',
        patterns: [{ type: 'daily', time: time('14:00'), duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const inst = schedule.instances.find(i => i.title === 'Chosen')!

      // Explicit time → treated as fixed by solver, stays put
      expect(timeOf(inst.time as string)).toBe('14:00:00')
    })

    it('ten no-time flexibles spread across waking hours', async () => {
      for (let i = 0; i < 10; i++) {
        await planner.createSeries({
          title: `Spread ${i}`,
          patterns: [{ type: 'daily', duration: minutes(60) }],
          startDate: date('2026-03-01'),
        })
      }

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const instances = schedule.instances.filter(i => !i.allDay)

      expect(instances).toHaveLength(10)

      // All within waking hours (07:00-23:00)
      for (const inst of instances) {
        const mins = timeToMinutes(timeOf(inst.time as string))
        expect(mins).toBeGreaterThanOrEqual(7 * 60)
        expect(mins + (inst.duration || 60)).toBeLessThanOrEqual(23 * 60)
      }

      // Pairwise non-overlap
      for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
          const a = instances[i]!
          const b = instances[j]!
          expect(
            rangesOverlap(
              timeOf(a.time as string), a.duration || 60,
              timeOf(b.time as string), b.duration || 60,
            ),
          ).toBe(false)
        }
      }
    })
  })

  // ========================================================================
  // Fixed items never move
  // ========================================================================
  describe('Fixed items never move', () => {
    it('fixed item stays at exact time', async () => {
      await planner.createSeries({
        title: 'Pinned',
        patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(45), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const inst = schedule.instances.find(i => i.title === 'Pinned')!

      expect(timeOf(inst.time as string)).toBe('10:00:00')
    })

    it('fixed-fixed overlap produces warning, both stay at their time', async () => {
      await planner.createSeries({
        title: 'Meeting A',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Meeting B',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const a = schedule.instances.find(i => i.title === 'Meeting A')!
      const b = schedule.instances.find(i => i.title === 'Meeting B')!

      // Both stay at 09:00
      expect(timeOf(a.time as string)).toBe('09:00:00')
      expect(timeOf(b.time as string)).toBe('09:00:00')

      // Overlap conflict reported with both series identified
      const overlap = schedule.conflicts.find(c => c.type === 'overlap')
      expect(overlap).toBeDefined()
      expect(overlap!.seriesIds).toHaveLength(2)
      expect(overlap!.seriesIds).toContain(a.seriesId)
      expect(overlap!.seriesIds).toContain(b.seriesId)
      expect(overlap!.instances).toHaveLength(2)
      expect(overlap!.instances.map(i => i.title).sort()).toEqual(['Meeting A', 'Meeting B'])
    })

    it('fixed item not affected by surrounding no-time flexibles', async () => {
      // Two no-time flexibles default to 09:00, fixed is also at 09:00
      await planner.createSeries({
        title: 'Flex Before',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Fixed Center',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Flex After',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const fixedInst = schedule.instances.find(i => i.title === 'Fixed Center')!

      // Fixed stays put at 09:00
      expect(timeOf(fixedInst.time as string)).toBe('09:00:00')

      // Both flexibles moved to non-overlapping slots
      for (const inst of schedule.instances) {
        if (inst.title === 'Fixed Center') continue
        expect(
          rangesOverlap(
            timeOf(fixedInst.time as string), fixedInst.duration || 60,
            timeOf(inst.time as string), inst.duration || 60,
          ),
        ).toBe(false)
      }
    })
  })

  // ========================================================================
  // Chain constraints through reflow
  // ========================================================================
  describe('Chain constraints through reflow', () => {
    it('chain child placed after parent end + distance', async () => {
      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 0,
        lateWobble: 0,
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const parent = schedule.instances.find(i => i.title === 'Parent')!
      const child = schedule.instances.find(i => i.title === 'Child')!

      // Parent at 09:00, ends 09:30. Child should be at 10:30 (09:30 + 60 min distance)
      expect(timeOf(parent.time as string)).toBe('09:00:00')
      const childMins = timeToMinutes(timeOf(child.time as string))
      // 09:30 + 60 = 10:30 = 630 minutes
      expect(childMins).toBe(630)
    })

    it('chain child respects wobble bounds', async () => {
      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 15,
        lateWobble: 30,
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const child = schedule.instances.find(i => i.title === 'Child')!
      const childMins = timeToMinutes(timeOf(child.time as string))

      // Parent ends 09:30. Target = 09:30 + 60 = 10:30 (630 min)
      // Earliest = 10:30 - 15 = 10:15 (615 min)
      // Latest = 10:30 + 30 = 11:00 (660 min)
      expect(childMins).toBeGreaterThanOrEqual(615)
      expect(childMins).toBeLessThanOrEqual(660)
    })

    it('chain with 3 levels all positioned correctly', async () => {
      const grandparentId = await planner.createSeries({
        title: 'Grandparent',
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      await planner.linkSeries(grandparentId, parentId, {
        distance: 30,
        earlyWobble: 0,
        lateWobble: 0,
      })

      await planner.linkSeries(parentId, childId, {
        distance: 30,
        earlyWobble: 0,
        lateWobble: 0,
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const gp = schedule.instances.find(i => i.title === 'Grandparent')!
      const p = schedule.instances.find(i => i.title === 'Parent')!
      const c = schedule.instances.find(i => i.title === 'Child')!

      const gpMins = timeToMinutes(timeOf(gp.time as string))
      const pMins = timeToMinutes(timeOf(p.time as string))
      const cMins = timeToMinutes(timeOf(c.time as string))

      // GP at 08:00 (480), ends 08:30. Parent at 09:00 (540). Ends 09:30. Child at 10:00 (600)
      expect(gpMins).toBe(480)
      expect(pMins).toBe(540)
      expect(cMins).toBe(600)
    })

    it('chain child follows parent when parent is flexible', async () => {
      // Occupier blocks 09:00 so parent must move.
      // Child needs lateWobble to give the solver room to accommodate parent relocation
      // (child domain is computed from parent's IDEAL position, so wobble widens the window).
      await planner.createSeries({
        title: 'Occupier',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })

      // Parent has NO explicit time → flexible, defaults to 09:00, solver must move it
      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      await planner.linkSeries(parentId, childId, {
        distance: 30,
        earlyWobble: 60,
        lateWobble: 120,
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const occupier = schedule.instances.find(i => i.title === 'Occupier')!
      const parent = schedule.instances.find(i => i.title === 'Parent')!
      const child = schedule.instances.find(i => i.title === 'Child')!

      const parentMins = timeToMinutes(timeOf(parent.time as string))
      const childMins = timeToMinutes(timeOf(child.time as string))

      // Occupier stays at 09:00
      expect(timeOf(occupier.time as string)).toBe('09:00:00')

      // Parent should NOT overlap with occupier (solver moved it)
      expect(
        rangesOverlap(
          timeOf(parent.time as string), parent.duration || 30,
          timeOf(occupier.time as string), occupier.duration || 60,
        ),
      ).toBe(false)

      // Child should come AFTER parent ends
      const parentEndMins = parentMins + (parent.duration || 30)
      expect(childMins).toBeGreaterThanOrEqual(parentEndMins)
    })
  })

  // ========================================================================
  // Conflict reporting
  // ========================================================================
  describe('Conflict reporting', () => {
    it('returns empty conflicts when non-overlapping series fit cleanly', async () => {
      await planner.createSeries({
        title: 'Morning',
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Afternoon',
        patterns: [{ type: 'daily', time: time('14:00'), duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Evening',
        patterns: [{ type: 'daily', time: time('19:00'), duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))

      // Three non-overlapping series → no conflicts expected
      expect(schedule.instances).toHaveLength(3)
      expect(schedule.instances.map(i => i.title).sort()).toEqual(['Afternoon', 'Evening', 'Morning'])
      expect(schedule.conflicts).toHaveLength(0)
    })

    it('overlap conflict reported for fixed-fixed', async () => {
      const idA = await planner.createSeries({
        title: 'Fixed A',
        patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })
      const idB = await planner.createSeries({
        title: 'Fixed B',
        patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60), fixed: true }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const overlap = schedule.conflicts.find(c => c.type === 'overlap')

      expect(overlap).toBeDefined()
      expect(overlap!.seriesIds).toContain(idA)
      expect(overlap!.seriesIds).toContain(idB)
    })

    it('best-effort placement when waking hours saturated', async () => {
      // Fill 07:00-23:00 (16 hours) with fixed items, then add a flexible.
      // The solver can't find a non-overlapping slot, so it falls back to ideal time.
      // detectConflicts only flags fixed-fixed overlaps, not flexible-fixed.
      for (let h = 7; h < 23; h++) {
        const hh = h.toString().padStart(2, '0')
        await planner.createSeries({
          title: `Block ${hh}`,
          patterns: [{ type: 'daily', time: time(`${hh}:00`), duration: minutes(60), fixed: true }],
          startDate: date('2026-03-01'),
        })
      }

      // This flexible has nowhere to go
      await planner.createSeries({
        title: 'Homeless',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))

      // The homeless item should still appear (best-effort placement)
      const homeless = schedule.instances.find(i => i.title === 'Homeless')
      expect(homeless).toBeDefined()
      expect(homeless!.title).toBe('Homeless')

      // All 16 fixed blocks should still be present at their assigned times
      const fixedBlocks = schedule.instances.filter(i => i.title.startsWith('Block'))
      expect(fixedBlocks).toHaveLength(16)
      // Verify first and last blocks kept their times
      const block07 = fixedBlocks.find(i => i.title === 'Block 07')!
      const block22 = fixedBlocks.find(i => i.title === 'Block 22')!
      expect(timeOf(block07.time as string)).toBe('07:00:00')
      expect(timeOf(block22.time as string)).toBe('22:00:00')
    })
  })

  // ========================================================================
  // All-day items excluded from reflow
  // ========================================================================
  describe('All-day items excluded from reflow', () => {
    it('returns empty conflicts when all-day and timed coexist without overlap', async () => {
      await planner.createSeries({
        title: 'All Day Event',
        patterns: [{ type: 'daily', allDay: true }],
        startDate: date('2026-03-01'),
      })
      await planner.createSeries({
        title: 'Timed Task',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const timed = schedule.instances.find(i => i.title === 'Timed Task')!
      const allDay = schedule.instances.find(i => i.title === 'All Day Event')!

      // Timed stays at 09:00 (no conflict with all-day), all-day has its flag
      expect(timeOf(timed.time as string)).toBe('09:00:00')
      expect(timed.title).toBe('Timed Task')
      expect(allDay.allDay).toBe(true)
      expect(allDay.title).toBe('All Day Event')
      expect(schedule.conflicts).toHaveLength(0)
    })

    it('all-day items appear in schedule', async () => {
      await planner.createSeries({
        title: 'Anniversary',
        patterns: [{ type: 'daily', allDay: true }],
        startDate: date('2026-03-01'),
      })

      const schedule = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const inst = schedule.instances.find(i => i.title === 'Anniversary')!

      expect(inst).toBeDefined()
      expect(inst.allDay).toBe(true)
    })
  })

  // ========================================================================
  // Reflow is deterministic through API
  // ========================================================================
  describe('Reflow is deterministic through API', () => {
    it('same no-time series produce same schedule', async () => {
      for (let i = 0; i < 5; i++) {
        await planner.createSeries({
          title: `Det ${i}`,
          patterns: [{ type: 'daily', duration: minutes(30) }],
          startDate: date('2026-03-01'),
        })
      }

      const s1 = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const s2 = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))

      const times1 = s1.instances.map(i => i.time as string).sort()
      const times2 = s2.instances.map(i => i.time as string).sort()

      expect(times1).toEqual(times2)
    })

    it('schedule stable after adding non-conflicting series', async () => {
      for (let i = 0; i < 3; i++) {
        await planner.createSeries({
          title: `Original ${i}`,
          patterns: [{ type: 'daily', duration: minutes(30) }],
          startDate: date('2026-03-01'),
        })
      }

      const before = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))
      const originalTimes = new Map<string, string>()
      for (const inst of before.instances) {
        originalTimes.set(inst.title, inst.time as string)
      }

      // Add a non-conflicting series at a distant time
      await planner.createSeries({
        title: 'Newcomer',
        patterns: [{ type: 'daily', time: time('20:00'), duration: minutes(30) }],
        startDate: date('2026-03-01'),
      })

      const after = await planner.getSchedule(date('2026-03-01'), date('2026-03-02'))

      // Original items should keep their times
      for (const inst of after.instances) {
        if (inst.title === 'Newcomer') continue
        expect(inst.time as string).toBe(originalTimes.get(inst.title))
      }
    })
  })
})
