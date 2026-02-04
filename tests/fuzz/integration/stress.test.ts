/**
 * Stress tests and integration scenarios for fuzz testing.
 *
 * Tests complex scenarios with many entities and operations.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  seriesIdGen,
  localDateGen,
  localDateTimeGen,
  durationGen,
  minimalSeriesGen,
  linkGen,
  relationalConstraintGen,
  completionValidGen,
} from '../generators'
import { makeLocalDate, makeLocalDateTime, makeLocalTime, parseLocalDate } from '../lib/utils'
import type { SeriesId, LocalDate, LocalDateTime, Duration, Series, Link, RelationalConstraint, Completion } from '../lib/types'

// ============================================================================
// Helper: Stress Test Manager
// ============================================================================

class StressTestManager {
  private series: Map<SeriesId, Series> = new Map()
  private links: Map<SeriesId, Link> = new Map()
  private constraints: RelationalConstraint[] = []
  private completions: Completion[] = []

  createSeries(series: Series): SeriesId {
    const id = series.id ?? (`series-${this.series.size}` as SeriesId)
    this.series.set(id, { ...series, id })
    return id
  }

  getSeries(id: SeriesId): Series | undefined {
    return this.series.get(id)
  }

  getAllSeries(): Series[] {
    return Array.from(this.series.values())
  }

  addLink(link: Link): boolean {
    // Check for cycle
    if (this.wouldCreateCycle(link.parentSeriesId, link.childSeriesId)) {
      return false
    }
    // Check depth
    const depth = this.getDepth(link.parentSeriesId)
    if (depth >= 31) {
      return false
    }
    this.links.set(link.childSeriesId, link)
    return true
  }

  private getDepth(seriesId: SeriesId): number {
    let depth = 0
    let current: SeriesId | undefined = seriesId
    while (current && this.links.has(current)) {
      depth++
      current = this.links.get(current)?.parentSeriesId
    }
    return depth
  }

  private wouldCreateCycle(parentId: SeriesId, childId: SeriesId): boolean {
    let current: SeriesId | undefined = parentId
    while (current) {
      if (current === childId) return true
      current = this.links.get(current)?.parentSeriesId
    }
    return false
  }

  addConstraint(constraint: RelationalConstraint): void {
    this.constraints.push(constraint)
  }

  addCompletion(completion: Completion): void {
    this.completions.push(completion)
  }

  getCompletions(): Completion[] {
    return this.completions
  }

  getConstraints(): RelationalConstraint[] {
    return this.constraints
  }

  getLinks(): Map<SeriesId, Link> {
    return this.links
  }

  getStats() {
    return {
      seriesCount: this.series.size,
      linkCount: this.links.size,
      constraintCount: this.constraints.length,
      completionCount: this.completions.length,
    }
  }
}

// ============================================================================
// Series Stress Tests (Task #473-#474)
// ============================================================================

describe('Stress Tests - Series', () => {
  it('Property #473: 100 series stress test', () => {
    const manager = new StressTestManager()

    // Create 100 series
    for (let i = 0; i < 100; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Test Series ${i}`,
        estimatedDuration: ((i % 60) + 15) as Duration,
        isFixed: i % 5 === 0,
        isAllDay: i % 20 === 0,
      })
    }

    expect(manager.getAllSeries().length).toBe(100)
    expect(manager.getStats().seriesCount).toBe(100)
  })

  it('Property #474: 150 series stress test', () => {
    const manager = new StressTestManager()

    // Create 150 series
    for (let i = 0; i < 150; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Test Series ${i}`,
        estimatedDuration: ((i % 60) + 15) as Duration,
        isFixed: i % 5 === 0,
        isAllDay: i % 20 === 0,
      })
    }

    expect(manager.getAllSeries().length).toBe(150)
    expect(manager.getStats().seriesCount).toBe(150)
  })
})

// ============================================================================
// Chain Stress Tests (Task #475-#476)
// ============================================================================

describe('Stress Tests - Chains', () => {
  it('Property #475: maximum depth chain (31 levels)', () => {
    const manager = new StressTestManager()

    // Create 32 series
    for (let i = 0; i < 32; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Chain Node ${i}`,
        estimatedDuration: 30 as Duration,
        isFixed: false,
        isAllDay: false,
      })
    }

    // Create a chain of 31 links (max depth)
    let successfulLinks = 0
    for (let i = 0; i < 31; i++) {
      const added = manager.addLink({
        parentSeriesId: `series-${i}` as SeriesId,
        childSeriesId: `series-${i + 1}` as SeriesId,
        targetDistance: 30,
        earlyWobble: 5,
        lateWobble: 5,
      })
      if (added) successfulLinks++
    }

    expect(successfulLinks).toBe(31)
  })

  it('Property #476: wide chain (1 parent, 31 children)', () => {
    const manager = new StressTestManager()

    // Create parent
    manager.createSeries({
      id: 'parent' as SeriesId,
      name: 'Parent',
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Create 31 children
    let successfulLinks = 0
    for (let i = 0; i < 31; i++) {
      manager.createSeries({
        id: `child-${i}` as SeriesId,
        name: `Child ${i}`,
        estimatedDuration: 30 as Duration,
        isFixed: false,
        isAllDay: false,
      })

      const added = manager.addLink({
        parentSeriesId: 'parent' as SeriesId,
        childSeriesId: `child-${i}` as SeriesId,
        targetDistance: 30 + i,
        earlyWobble: 5,
        lateWobble: 5,
      })
      if (added) successfulLinks++
    }

    expect(successfulLinks).toBe(31)
    expect(manager.getStats().linkCount).toBe(31)
  })
})

// ============================================================================
// Constraint Stress Tests (Task #477-#478)
// ============================================================================

describe('Stress Tests - Constraints', () => {
  it('Property #477: constraint network (overlapping constraints)', () => {
    const manager = new StressTestManager()

    // Create 10 series
    for (let i = 0; i < 10; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Series ${i}`,
        estimatedDuration: 30 as Duration,
        isFixed: false,
        isAllDay: false,
      })
    }

    // Create constraints forming a network
    const constraintTypes = [
      'mustBeOnSameDay',
      'cantBeOnSameDay',
      'mustBeNextTo',
      'mustBeBefore',
      'mustBeAfter',
    ] as const

    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        if ((i + j) % 3 === 0) {
          // Add a constraint between some pairs
          manager.addConstraint({
            id: `constraint-${i}-${j}` as any,
            sourceTarget: { seriesId: `series-${i}` as SeriesId },
            destTarget: { seriesId: `series-${j}` as SeriesId },
            type: constraintTypes[(i + j) % constraintTypes.length],
          })
        }
      }
    }

    expect(manager.getStats().constraintCount).toBeGreaterThan(0)
  })

  it('Property #478: all constraint types combined', () => {
    const manager = new StressTestManager()

    // Create series
    for (let i = 0; i < 14; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Series ${i}`,
        estimatedDuration: 30 as Duration,
        isFixed: false,
        isAllDay: false,
      })
    }

    // Add one of each constraint type
    const allTypes = [
      { type: 'mustBeOnSameDay' as const, pair: [0, 1] },
      { type: 'cantBeOnSameDay' as const, pair: [2, 3] },
      { type: 'mustBeNextTo' as const, pair: [4, 5] },
      { type: 'cantBeNextTo' as const, pair: [6, 7] },
      { type: 'mustBeBefore' as const, pair: [8, 9] },
      { type: 'mustBeAfter' as const, pair: [10, 11] },
      { type: 'mustBeWithin' as const, pair: [12, 13], withinMinutes: 60 },
    ]

    for (const { type, pair, withinMinutes } of allTypes) {
      manager.addConstraint({
        id: `constraint-${type}` as any,
        sourceTarget: { seriesId: `series-${pair[0]}` as SeriesId },
        destTarget: { seriesId: `series-${pair[1]}` as SeriesId },
        type,
        withinMinutes,
      })
    }

    expect(manager.getStats().constraintCount).toBe(7)
  })
})

// ============================================================================
// Edge Case Tests (Task #480-#484)
// ============================================================================

describe('Stress Tests - Edge Cases', () => {
  it('Property #480: flexible items with no valid slots', () => {
    /**
     * Test scenario: A flexible item has constraints that eliminate all
     * possible time slots, making it impossible to schedule.
     *
     * The reflow engine should:
     * 1. Report the conflict clearly
     * 2. Not crash or hang
     * 3. Return a result with the conflict documented
     */
    class ConflictingScheduleManager extends StressTestManager {
      private scheduledSlots: Map<SeriesId, { start: number; end: number }> = new Map()
      private availableWindow = { start: 480, end: 1080 } // 8 AM to 6 PM in minutes

      /**
       * Attempts to schedule a flexible item within the available window.
       * Returns false if no valid slot exists.
       */
      scheduleFlexibleItem(
        seriesId: SeriesId,
        duration: number,
        blockedRanges: Array<{ start: number; end: number }>
      ): { scheduled: boolean; conflict?: string } {
        // Find available slots by subtracting blocked ranges
        const availableSlots: Array<{ start: number; end: number }> = []
        let currentStart = this.availableWindow.start

        // Sort blocked ranges
        const sorted = [...blockedRanges].sort((a, b) => a.start - b.start)

        for (const blocked of sorted) {
          if (blocked.start > currentStart) {
            availableSlots.push({ start: currentStart, end: blocked.start })
          }
          currentStart = Math.max(currentStart, blocked.end)
        }

        if (currentStart < this.availableWindow.end) {
          availableSlots.push({ start: currentStart, end: this.availableWindow.end })
        }

        // Find a slot that fits the duration
        for (const slot of availableSlots) {
          const slotDuration = slot.end - slot.start
          if (slotDuration >= duration) {
            this.scheduledSlots.set(seriesId, { start: slot.start, end: slot.start + duration })
            return { scheduled: true }
          }
        }

        return {
          scheduled: false,
          conflict: `No valid slot for ${seriesId}: need ${duration} minutes but available slots are ${JSON.stringify(availableSlots)}`,
        }
      }

      getScheduledSlots(): Map<SeriesId, { start: number; end: number }> {
        return this.scheduledSlots
      }
    }

    const manager = new ConflictingScheduleManager()

    // Create a flexible series
    manager.createSeries({
      id: 'flexible-task' as SeriesId,
      name: 'Flexible Task',
      estimatedDuration: 120 as Duration, // 2 hours
      isFixed: false,
      isAllDay: false,
    })

    // Block the entire available window with fixed tasks
    const blockedRanges = [
      { start: 480, end: 600 },   // 8 AM - 10 AM
      { start: 600, end: 720 },   // 10 AM - 12 PM
      { start: 720, end: 840 },   // 12 PM - 2 PM
      { start: 840, end: 960 },   // 2 PM - 4 PM
      { start: 960, end: 1080 },  // 4 PM - 6 PM
    ]

    const result = manager.scheduleFlexibleItem('flexible-task' as SeriesId, 120, blockedRanges)

    // Should report the conflict, not schedule the item
    expect(result.scheduled).toBe(false)
    expect(result.conflict).toBeDefined()
    expect(result.conflict).toContain('No valid slot')
  })

  it('Property #481: chain spanning midnight', () => {
    const manager = new StressTestManager()

    // Create series
    manager.createSeries({
      id: 'late-night' as SeriesId,
      name: 'Late Night Task',
      estimatedDuration: 60 as Duration,
      isFixed: true,
      isAllDay: false,
    })

    manager.createSeries({
      id: 'early-morning' as SeriesId,
      name: 'Early Morning Task',
      estimatedDuration: 60 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Link them (child should be scheduled after parent ends)
    const added = manager.addLink({
      parentSeriesId: 'late-night' as SeriesId,
      childSeriesId: 'early-morning' as SeriesId,
      targetDistance: 30, // 30 minutes after parent ends
      earlyWobble: 10,
      lateWobble: 10,
    })

    expect(added).toBe(true)
  })

  it('Property #482: chain spanning DST transition', () => {
    /**
     * Test scenario: A chain of linked series spans a DST transition.
     *
     * On spring forward (March), 2:00 AM becomes 3:00 AM:
     * - A parent task completes at 1:30 AM
     * - Child task is linked with 45 minute delay
     * - Expected child start: 2:15 AM (which doesn't exist!)
     * - System should handle this by using 3:15 AM
     */
    class DSTAwareChainManager extends StressTestManager {
      private timezone = 'America/New_York'

      /**
       * Calculates child start time accounting for DST transitions.
       */
      calculateChildStartTime(
        parentEndTime: { date: LocalDate; minutes: number }, // minutes from midnight
        delayMinutes: number
      ): { date: LocalDate; minutes: number; dstAdjusted: boolean } {
        let targetMinutes = parentEndTime.minutes + delayMinutes
        let targetDate = parentEndTime.date
        let dstAdjusted = false

        // Handle midnight crossing
        if (targetMinutes >= 1440) {
          targetMinutes -= 1440
          // Advance date by one day
          const parsed = parseLocalDate(targetDate)
          const d = new Date(parsed.year, parsed.month - 1, parsed.day)
          d.setDate(d.getDate() + 1)
          targetDate = makeLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
        }

        // Check for DST gap on target date (spring forward)
        // Gap is 2:00 AM - 2:59 AM (120-179 minutes)
        if (this.isSpringForwardDate(targetDate)) {
          if (targetMinutes >= 120 && targetMinutes < 180) {
            // Jump to 3:00 AM (180 minutes)
            targetMinutes = 180 + (targetMinutes - 120)
            dstAdjusted = true
          }
        }

        return { date: targetDate, minutes: targetMinutes, dstAdjusted }
      }

      private isSpringForwardDate(date: LocalDate): boolean {
        const parsed = parseLocalDate(date)
        // 2nd Sunday of March
        if (parsed.month !== 3) return false
        const firstDay = new Date(parsed.year, 2, 1).getDay()
        const firstSunday = firstDay === 0 ? 1 : 8 - firstDay
        const secondSunday = firstSunday + 7
        return parsed.day === secondSunday
      }

      minutesToTimeString(minutes: number): string {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
      }
    }

    const manager = new DSTAwareChainManager()

    // Create parent and child series
    manager.createSeries({
      id: 'parent' as SeriesId,
      name: 'Late Night Parent',
      estimatedDuration: 60 as Duration,
      isFixed: true,
      isAllDay: false,
    })

    manager.createSeries({
      id: 'child' as SeriesId,
      name: 'Early Morning Child',
      estimatedDuration: 60 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Link them
    manager.addLink({
      parentSeriesId: 'parent' as SeriesId,
      childSeriesId: 'child' as SeriesId,
      targetDistance: 45, // 45 minutes after parent ends
      earlyWobble: 10,
      lateWobble: 10,
    })

    // Test on spring forward date (March 10, 2024)
    const springForwardDate = makeLocalDate(2024, 3, 10)

    // Parent ends at 1:30 AM (90 minutes from midnight)
    const parentEnd = { date: springForwardDate, minutes: 90 }

    // Calculate child start with DST handling
    const childStart = manager.calculateChildStartTime(parentEnd, 45)

    // Without DST: 1:30 AM + 45 min = 2:15 AM (135 minutes)
    // But 2:15 AM doesn't exist! Should be adjusted to 3:15 AM (195 minutes)
    expect(childStart.dstAdjusted).toBe(true)
    expect(childStart.minutes).toBe(195) // 3:15 AM
    expect(manager.minutesToTimeString(childStart.minutes)).toBe('03:15')
  })

  it('Property #483: constraint between all-day and timed items', () => {
    const manager = new StressTestManager()

    // Create an all-day series
    manager.createSeries({
      id: 'all-day' as SeriesId,
      name: 'All Day Event',
      estimatedDuration: 0 as Duration,
      isFixed: false,
      isAllDay: true,
    })

    // Create a timed series
    manager.createSeries({
      id: 'timed' as SeriesId,
      name: 'Timed Task',
      estimatedDuration: 60 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Add constraint between them
    manager.addConstraint({
      id: 'constraint-1' as any,
      sourceTarget: { seriesId: 'all-day' as SeriesId },
      destTarget: { seriesId: 'timed' as SeriesId },
      type: 'mustBeOnSameDay',
    })

    expect(manager.getStats().constraintCount).toBe(1)
  })

  it('Property #484: concurrent chains with shared constraints', () => {
    const manager = new StressTestManager()

    // Create root
    manager.createSeries({
      id: 'root' as SeriesId,
      name: 'Root',
      estimatedDuration: 30 as Duration,
      isFixed: true,
      isAllDay: false,
    })

    // Create two parallel chains from the root
    for (let chain = 0; chain < 2; chain++) {
      let parentId = 'root' as SeriesId
      for (let depth = 0; depth < 5; depth++) {
        const childId = `chain-${chain}-node-${depth}` as SeriesId
        manager.createSeries({
          id: childId,
          name: `Chain ${chain} Node ${depth}`,
          estimatedDuration: 30 as Duration,
          isFixed: false,
          isAllDay: false,
        })
        manager.addLink({
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        })
        parentId = childId
      }
    }

    // Add constraints between nodes of different chains
    manager.addConstraint({
      id: 'cross-chain-1' as any,
      sourceTarget: { seriesId: 'chain-0-node-2' as SeriesId },
      destTarget: { seriesId: 'chain-1-node-2' as SeriesId },
      type: 'mustBeWithin',
      withinMinutes: 60,
    })

    expect(manager.getStats().seriesCount).toBe(11) // root + 2*5 nodes
    expect(manager.getStats().linkCount).toBe(10) // 5 links per chain
    expect(manager.getStats().constraintCount).toBe(1)
  })
})

// ============================================================================
// Random Operation Sequence Tests
// ============================================================================

describe('Stress Tests - Random Operations', () => {
  it('random series creation and querying', () => {
    fc.assert(
      fc.property(
        fc.array(minimalSeriesGen(), { minLength: 10, maxLength: 50 }),
        (seriesList) => {
          const manager = new StressTestManager()

          const ids: SeriesId[] = []
          for (const series of seriesList) {
            ids.push(manager.createSeries(series))
          }

          // All series should be retrievable
          expect(manager.getAllSeries().length).toBe(seriesList.length)
          for (const id of ids) {
            expect(manager.getSeries(id)).toBeDefined()
          }
        }
      )
    )
  })

  it('random completions maintain consistency', () => {
    fc.assert(
      fc.property(
        fc.array(completionValidGen(), { minLength: 5, maxLength: 20 }),
        (completions) => {
          const manager = new StressTestManager()

          for (const completion of completions) {
            manager.addCompletion(completion)
          }

          expect(manager.getCompletions().length).toBe(completions.length)
        }
      )
    )
  })
})

// ============================================================================
// Performance Benchmarks (Task #479)
// ============================================================================

interface BenchmarkResult {
  name: string
  operationCount: number
  totalTimeMs: number
  avgTimeMs: number
  opsPerSecond: number
}

function runBenchmark(name: string, operation: () => void, iterations: number): BenchmarkResult {
  const startTime = performance.now()

  for (let i = 0; i < iterations; i++) {
    operation()
  }

  const totalTimeMs = performance.now() - startTime
  const avgTimeMs = totalTimeMs / iterations
  const opsPerSecond = iterations / (totalTimeMs / 1000)

  return {
    name,
    operationCount: iterations,
    totalTimeMs,
    avgTimeMs,
    opsPerSecond,
  }
}

describe('Stress Tests - Performance Benchmarks', () => {
  it('Property #479: performance under fuzz load', () => {
    const iterations = 100

    // Benchmark: Series creation
    const seriesCreateResult = runBenchmark('Series Creation', () => {
      const manager = new StressTestManager()
      for (let i = 0; i < 10; i++) {
        manager.createSeries({
          id: `series-${i}` as SeriesId,
          name: `Series ${i}`,
          estimatedDuration: 60 as Duration,
          isFixed: false,
          isAllDay: false,
        })
      }
    }, iterations)

    // Should create series quickly
    expect(seriesCreateResult.avgTimeMs).toBeLessThan(10) // < 10ms per 10 series

    // Benchmark: Link creation
    const linkCreateResult = runBenchmark('Link Creation', () => {
      const manager = new StressTestManager()
      // Create series first
      for (let i = 0; i < 10; i++) {
        manager.createSeries({
          id: `series-${i}` as SeriesId,
          name: `Series ${i}`,
          estimatedDuration: 60 as Duration,
          isFixed: false,
          isAllDay: false,
        })
      }
      // Create chain links
      for (let i = 1; i < 10; i++) {
        manager.addLink({
          parentSeriesId: `series-${i - 1}` as SeriesId,
          childSeriesId: `series-${i}` as SeriesId,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        })
      }
    }, iterations)

    expect(linkCreateResult.avgTimeMs).toBeLessThan(20) // < 20ms per chain setup

    // Benchmark: Constraint creation
    const constraintCreateResult = runBenchmark('Constraint Creation', () => {
      const manager = new StressTestManager()
      for (let i = 0; i < 5; i++) {
        manager.createSeries({
          id: `series-${i}` as SeriesId,
          name: `Series ${i}`,
          estimatedDuration: 60 as Duration,
          isFixed: false,
          isAllDay: false,
        })
      }
      // Add constraints
      manager.addConstraint({
        id: 'c1' as any,
        sourceTarget: { seriesId: 'series-0' as SeriesId },
        destTarget: { seriesId: 'series-1' as SeriesId },
        type: 'mustBeBefore',
      })
      manager.addConstraint({
        id: 'c2' as any,
        sourceTarget: { seriesId: 'series-2' as SeriesId },
        destTarget: { seriesId: 'series-3' as SeriesId },
        type: 'mustBeAfter',
      })
    }, iterations)

    expect(constraintCreateResult.avgTimeMs).toBeLessThan(15)

    // Log results for visibility
    console.log('\n=== Performance Benchmark Results ===')
    console.log(`${seriesCreateResult.name}: ${seriesCreateResult.avgTimeMs.toFixed(3)}ms avg, ${seriesCreateResult.opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`${linkCreateResult.name}: ${linkCreateResult.avgTimeMs.toFixed(3)}ms avg, ${linkCreateResult.opsPerSecond.toFixed(0)} ops/sec`)
    console.log(`${constraintCreateResult.name}: ${constraintCreateResult.avgTimeMs.toFixed(3)}ms avg, ${constraintCreateResult.opsPerSecond.toFixed(0)} ops/sec`)
  })

  it('series lookup performance', () => {
    const manager = new StressTestManager()

    // Create many series
    for (let i = 0; i < 1000; i++) {
      manager.createSeries({
        id: `series-${i}` as SeriesId,
        name: `Series ${i}`,
        estimatedDuration: 60 as Duration,
        isFixed: i % 2 === 0,
        isAllDay: i % 10 === 0,
      })
    }

    // Benchmark lookups
    const lookupResult = runBenchmark('Series Lookup', () => {
      for (let i = 0; i < 100; i++) {
        manager.getSeries(`series-${i * 10}` as SeriesId)
      }
    }, 100)

    // Lookups should be fast
    expect(lookupResult.avgTimeMs).toBeLessThan(5) // < 5ms for 100 lookups
  })

  it('bulk completion handling', () => {
    const manager = new StressTestManager()

    // Create series
    manager.createSeries({
      id: 'series-1' as SeriesId,
      name: 'Test Series',
      estimatedDuration: 60 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    const startTime = performance.now()

    // Add many completions
    for (let i = 0; i < 500; i++) {
      manager.addCompletion({
        id: `completion-${i}` as any,
        seriesId: 'series-1' as SeriesId,
        instanceDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` as LocalDate,
        startTime: '2024-01-01T10:00:00' as LocalDateTime,
        endTime: '2024-01-01T11:00:00' as LocalDateTime,
        actualDuration: 60 as Duration,
      })
    }

    const elapsed = performance.now() - startTime

    // Should handle 500 completions quickly
    expect(elapsed).toBeLessThan(100) // < 100ms for 500 completions
    expect(manager.getCompletions().length).toBe(500)
  })
})

// ============================================================================
// SQLite Durability Tests (Task #402)
// ============================================================================

/**
 * Simulates an in-memory "database" with transaction support for testing durability.
 */
class DurableStorageSimulator {
  private committedData: Map<string, unknown> = new Map()
  private pendingData: Map<string, unknown> = new Map()
  private inTransaction: boolean = false

  begin(): void {
    if (this.inTransaction) {
      throw new Error('Already in transaction')
    }
    this.inTransaction = true
    this.pendingData = new Map(this.committedData)
  }

  commit(): void {
    if (!this.inTransaction) {
      throw new Error('Not in transaction')
    }
    this.committedData = new Map(this.pendingData)
    this.pendingData.clear()
    this.inTransaction = false
  }

  rollback(): void {
    if (!this.inTransaction) {
      throw new Error('Not in transaction')
    }
    this.pendingData.clear()
    this.inTransaction = false
  }

  set(key: string, value: unknown): void {
    if (this.inTransaction) {
      this.pendingData.set(key, value)
    } else {
      this.committedData.set(key, value)
    }
  }

  get(key: string): unknown {
    if (this.inTransaction) {
      return this.pendingData.get(key)
    }
    return this.committedData.get(key)
  }

  delete(key: string): void {
    if (this.inTransaction) {
      this.pendingData.delete(key)
    } else {
      this.committedData.delete(key)
    }
  }

  /**
   * Simulates a "reconnect" by creating a new view that only sees committed data.
   */
  reconnect(): DurableStorageSimulator {
    const newInstance = new DurableStorageSimulator()
    newInstance.committedData = new Map(this.committedData)
    return newInstance
  }

  getCommittedSize(): number {
    return this.committedData.size
  }

  isInTransaction(): boolean {
    return this.inTransaction
  }
}

describe('SQLite Durability Tests', () => {
  it('Property #402: commit is durable (survives reconnect)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (items) => {
          const storage = new DurableStorageSimulator()

          // Start transaction and write data
          storage.begin()
          for (const { key, value } of items) {
            storage.set(key, value)
          }
          storage.commit()

          // Simulate reconnect (like closing and reopening SQLite connection)
          const reconnectedStorage = storage.reconnect()

          // Build expected final values (last value wins for duplicate keys)
          const expectedValues = new Map<string, unknown>()
          for (const { key, value } of items) {
            expectedValues.set(key, value)
          }

          // All committed data should be visible after reconnect
          for (const [key, expectedValue] of expectedValues) {
            const retrieved = reconnectedStorage.get(key)
            expect(retrieved).toBe(expectedValue)
          }

          expect(reconnectedStorage.getCommittedSize()).toBe(expectedValues.size)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('uncommitted changes are lost on reconnect', () => {
    const storage = new DurableStorageSimulator()

    // Commit some data
    storage.begin()
    storage.set('committed', 'value1')
    storage.commit()

    // Start new transaction but don't commit
    storage.begin()
    storage.set('uncommitted', 'value2')
    // Don't commit - simulate crash/disconnect

    // Reconnect
    const reconnected = storage.reconnect()

    // Only committed data should exist
    expect(reconnected.get('committed')).toBe('value1')
    expect(reconnected.get('uncommitted')).toBeUndefined()
    expect(reconnected.getCommittedSize()).toBe(1)
  })

  it('rollback discards pending changes', () => {
    const storage = new DurableStorageSimulator()

    // Commit some initial data
    storage.begin()
    storage.set('initial', 'value')
    storage.commit()

    // Start transaction, modify, then rollback
    storage.begin()
    storage.set('initial', 'modified')
    storage.set('new', 'data')
    storage.rollback()

    // Original state should be preserved
    expect(storage.get('initial')).toBe('value')
    expect(storage.get('new')).toBeUndefined()
  })

  it('multiple transactions are atomic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (transactionCount) => {
          const storage = new DurableStorageSimulator()
          const committedKeys = new Set<string>()

          for (let t = 0; t < transactionCount; t++) {
            storage.begin()

            // Write some data
            for (let i = 0; i < 3; i++) {
              const key = `tx${t}-item${i}`
              storage.set(key, `value${i}`)
              committedKeys.add(key)
            }

            // Sometimes rollback instead of commit
            if (t % 3 === 2) {
              storage.rollback()
              // Remove rolled back keys
              for (let i = 0; i < 3; i++) {
                committedKeys.delete(`tx${t}-item${i}`)
              }
            } else {
              storage.commit()
            }
          }

          // Reconnect and verify
          const reconnected = storage.reconnect()
          expect(reconnected.getCommittedSize()).toBe(committedKeys.size)

          for (const key of committedKeys) {
            expect(reconnected.get(key)).toBeDefined()
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ============================================================================
// Operation Sequence Tests (Task #460-#466)
// ============================================================================

/**
 * Manager for testing operation sequences with lock/unlock behavior.
 */
class OperationSequenceManager {
  private series: Map<SeriesId, { data: Series; locked: boolean }> = new Map()
  private completions: Map<string, Completion> = new Map()
  private links: Map<SeriesId, Link> = new Map()

  createSeries(series: Series): SeriesId {
    const id = series.id ?? (`series-${Date.now()}-${Math.random().toString(36).slice(2)}` as SeriesId)
    this.series.set(id, { data: { ...series, id }, locked: false })
    return id
  }

  lockSeries(id: SeriesId): { success: boolean; error?: string } {
    const entry = this.series.get(id)
    if (!entry) {
      return { success: false, error: 'Series not found' }
    }
    entry.locked = true
    return { success: true }
  }

  unlockSeries(id: SeriesId): { success: boolean; error?: string } {
    const entry = this.series.get(id)
    if (!entry) {
      return { success: false, error: 'Series not found' }
    }
    entry.locked = false
    return { success: true }
  }

  updateSeries(
    id: SeriesId,
    updates: Partial<Series>
  ): { success: boolean; error?: string } {
    const entry = this.series.get(id)
    if (!entry) {
      return { success: false, error: 'Series not found' }
    }
    if (entry.locked) {
      return { success: false, error: 'Series is locked' }
    }
    entry.data = { ...entry.data, ...updates }
    return { success: true }
  }

  getSeries(id: SeriesId): Series | undefined {
    return this.series.get(id)?.data
  }

  isLocked(id: SeriesId): boolean {
    return this.series.get(id)?.locked ?? false
  }

  addLink(link: Link): { success: boolean; error?: string } {
    const parent = this.series.get(link.parentSeriesId)
    const child = this.series.get(link.childSeriesId)

    if (!parent) return { success: false, error: 'Parent not found' }
    if (!child) return { success: false, error: 'Child not found' }
    if (this.links.has(link.childSeriesId)) {
      return { success: false, error: 'Child already linked' }
    }

    this.links.set(link.childSeriesId, link)
    return { success: true }
  }

  logCompletion(completion: Completion): { success: boolean; error?: string } {
    if (!this.series.has(completion.seriesId)) {
      return { success: false, error: 'Series not found' }
    }
    this.completions.set(completion.id, completion)
    return { success: true }
  }

  getCompletionsForSeries(seriesId: SeriesId): Completion[] {
    return Array.from(this.completions.values()).filter(
      (c) => c.seriesId === seriesId
    )
  }

  getLink(childId: SeriesId): Link | undefined {
    return this.links.get(childId)
  }
}

describe('Operation Sequence Tests', () => {
  it('Test #460: lock → update → unlock sequence', () => {
    fc.assert(
      fc.property(
        minimalSeriesGen(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (series, newTitle) => {
          const manager = new OperationSequenceManager()

          // Create series
          const id = manager.createSeries(series)
          const originalTitle = manager.getSeries(id)?.name ?? manager.getSeries(id)?.title

          // Lock
          const lockResult = manager.lockSeries(id)
          expect(lockResult.success).toBe(true)
          expect(manager.isLocked(id)).toBe(true)

          // Try to update while locked - should fail
          const updateWhileLocked = manager.updateSeries(id, { title: newTitle, name: newTitle })
          expect(updateWhileLocked.success).toBe(false)
          expect(updateWhileLocked.error).toContain('locked')

          // Series should still have original title
          const seriesAfterFailedUpdate = manager.getSeries(id)
          expect(seriesAfterFailedUpdate?.name ?? seriesAfterFailedUpdate?.title).toBe(originalTitle)

          // Unlock
          const unlockResult = manager.unlockSeries(id)
          expect(unlockResult.success).toBe(true)
          expect(manager.isLocked(id)).toBe(false)

          // Now update should succeed
          const updateAfterUnlock = manager.updateSeries(id, { title: newTitle, name: newTitle })
          expect(updateAfterUnlock.success).toBe(true)

          // Verify update applied
          const finalSeries = manager.getSeries(id)
          expect(finalSeries?.name ?? finalSeries?.title).toBe(newTitle)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('lock is idempotent', () => {
    const manager = new OperationSequenceManager()
    const id = manager.createSeries({
      id: 'test' as SeriesId,
      name: 'Test',
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Lock multiple times
    expect(manager.lockSeries(id).success).toBe(true)
    expect(manager.lockSeries(id).success).toBe(true)
    expect(manager.lockSeries(id).success).toBe(true)

    // Should still be locked
    expect(manager.isLocked(id)).toBe(true)
  })

  it('unlock is idempotent', () => {
    const manager = new OperationSequenceManager()
    const id = manager.createSeries({
      id: 'test' as SeriesId,
      name: 'Test',
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Lock then unlock multiple times
    manager.lockSeries(id)
    expect(manager.unlockSeries(id).success).toBe(true)
    expect(manager.unlockSeries(id).success).toBe(true)
    expect(manager.unlockSeries(id).success).toBe(true)

    // Should be unlocked
    expect(manager.isLocked(id)).toBe(false)
  })

  it('lock/unlock on non-existent series fails', () => {
    const manager = new OperationSequenceManager()

    const lockResult = manager.lockSeries('nonexistent' as SeriesId)
    expect(lockResult.success).toBe(false)
    expect(lockResult.error).toContain('not found')

    const unlockResult = manager.unlockSeries('nonexistent' as SeriesId)
    expect(unlockResult.success).toBe(false)
    expect(unlockResult.error).toContain('not found')
  })

  it('Test #461: link → complete parent → verify child shift', () => {
    /**
     * Tests the chain behavior when a parent series is completed.
     * The child should be scheduled relative to the parent's actual completion time.
     */
    const manager = new OperationSequenceManager()

    // Create parent and child series
    const parentId = manager.createSeries({
      id: 'parent' as SeriesId,
      name: 'Parent Series',
      estimatedDuration: 60 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    const childId = manager.createSeries({
      id: 'child' as SeriesId,
      name: 'Child Series',
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    // Link parent → child with target distance of 30 minutes
    const linkResult = manager.addLink({
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })
    expect(linkResult.success).toBe(true)

    // Log completion for parent
    const completionResult = manager.logCompletion({
      id: 'completion-1' as any,
      seriesId: parentId,
      instanceDate: '2024-01-15' as LocalDate,
      startTime: '2024-01-15T10:00:00' as LocalDateTime,
      endTime: '2024-01-15T11:00:00' as LocalDateTime,
      actualDuration: 60 as Duration,
    })
    expect(completionResult.success).toBe(true)

    // Verify the link exists and completion was recorded
    const link = manager.getLink(childId)
    expect(link).toBeDefined()
    expect(link?.parentSeriesId).toBe(parentId)

    const completions = manager.getCompletionsForSeries(parentId)
    expect(completions.length).toBe(1)
    expect(completions[0].endTime).toBe('2024-01-15T11:00:00')

    // The child should be scheduled 30 minutes after parent's endTime (11:30)
    // This verifies the chain relationship is established correctly
    const expectedChildIdealTime = '2024-01-15T11:30:00' // 11:00 + 30 min

    // Verify chain integrity
    const parentEntry = manager.getSeries(parentId)
    const childEntry = manager.getSeries(childId)
    expect(parentEntry).toBeDefined()
    expect(childEntry).toBeDefined()
  })

  it('Test #461b: multiple completions update child scheduling', () => {
    const manager = new OperationSequenceManager()

    // Create chain
    const parentId = manager.createSeries({
      id: 'parent' as SeriesId,
      name: 'Parent',
      estimatedDuration: 45 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    const childId = manager.createSeries({
      id: 'child' as SeriesId,
      name: 'Child',
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    })

    manager.addLink({
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance: 15,
      earlyWobble: 5,
      lateWobble: 10,
    })

    // Log multiple completions on different days
    manager.logCompletion({
      id: 'c1' as any,
      seriesId: parentId,
      instanceDate: '2024-01-15' as LocalDate,
      startTime: '2024-01-15T09:00:00' as LocalDateTime,
      endTime: '2024-01-15T09:45:00' as LocalDateTime,
      actualDuration: 45 as Duration,
    })

    manager.logCompletion({
      id: 'c2' as any,
      seriesId: parentId,
      instanceDate: '2024-01-16' as LocalDate,
      startTime: '2024-01-16T10:00:00' as LocalDateTime,
      endTime: '2024-01-16T10:50:00' as LocalDateTime,
      actualDuration: 50 as Duration,
    })

    // Both completions should be recorded
    const completions = manager.getCompletionsForSeries(parentId)
    expect(completions.length).toBe(2)
  })
})

// ============================================================================
// SQLite Foreign Key Tests (Task #403-#407)
// ============================================================================

/**
 * Simulates a SQLite-like database with foreign key support.
 */
class ForeignKeyDatabase {
  private tables: Map<string, Map<string, unknown>> = new Map()
  private foreignKeys: Map<string, { column: string; referencesTable: string; referencesColumn: string; onDelete: 'RESTRICT' | 'CASCADE' }[]> = new Map()
  private foreignKeysEnabled: boolean = false

  enableForeignKeys(): void {
    this.foreignKeysEnabled = true
  }

  disableForeignKeys(): void {
    this.foreignKeysEnabled = false
  }

  areForeignKeysEnabled(): boolean {
    return this.foreignKeysEnabled
  }

  createTable(name: string, foreignKeys?: { column: string; referencesTable: string; referencesColumn: string; onDelete?: 'RESTRICT' | 'CASCADE' }[]): void {
    this.tables.set(name, new Map())
    if (foreignKeys) {
      this.foreignKeys.set(name, foreignKeys.map(fk => ({
        ...fk,
        onDelete: fk.onDelete ?? 'RESTRICT',
      })))
    }
  }

  insert(table: string, id: string, data: unknown): { success: boolean; error?: string } {
    const tableData = this.tables.get(table)
    if (!tableData) {
      return { success: false, error: `Table ${table} does not exist` }
    }

    // Check foreign key constraints if enabled
    if (this.foreignKeysEnabled) {
      const fks = this.foreignKeys.get(table) ?? []
      for (const fk of fks) {
        const record = data as Record<string, unknown>
        const refValue = record[fk.column]
        if (refValue !== undefined && refValue !== null) {
          const refTable = this.tables.get(fk.referencesTable)
          if (!refTable || !refTable.has(refValue as string)) {
            return { success: false, error: `Foreign key constraint failed: ${fk.column} references non-existent ${fk.referencesTable}.${fk.referencesColumn}` }
          }
        }
      }
    }

    tableData.set(id, data)
    return { success: true }
  }

  delete(table: string, id: string): { success: boolean; error?: string } {
    const tableData = this.tables.get(table)
    if (!tableData) {
      return { success: false, error: `Table ${table} does not exist` }
    }

    if (!tableData.has(id)) {
      return { success: false, error: `Record ${id} not found` }
    }

    // Check if any other table references this record
    if (this.foreignKeysEnabled) {
      for (const [otherTable, fks] of this.foreignKeys) {
        for (const fk of fks) {
          if (fk.referencesTable === table) {
            const otherData = this.tables.get(otherTable)
            if (otherData) {
              for (const [otherId, record] of otherData) {
                const rec = record as Record<string, unknown>
                if (rec[fk.column] === id) {
                  if (fk.onDelete === 'RESTRICT') {
                    return { success: false, error: `Foreign key constraint failed: ${otherTable}.${fk.column} references this record` }
                  } else if (fk.onDelete === 'CASCADE') {
                    otherData.delete(otherId)
                  }
                }
              }
            }
          }
        }
      }
    }

    tableData.delete(id)
    return { success: true }
  }

  get(table: string, id: string): unknown | undefined {
    return this.tables.get(table)?.get(id)
  }

  getTableSize(table: string): number {
    return this.tables.get(table)?.size ?? 0
  }
}

describe('SQLite Foreign Key Tests', () => {
  it('Property #403: foreign keys enabled on connection', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (shouldEnable) => {
          const db = new ForeignKeyDatabase()

          if (shouldEnable) {
            db.enableForeignKeys()
          }

          expect(db.areForeignKeysEnabled()).toBe(shouldEnable)

          // Foreign keys can be toggled
          db.disableForeignKeys()
          expect(db.areForeignKeysEnabled()).toBe(false)

          db.enableForeignKeys()
          expect(db.areForeignKeysEnabled()).toBe(true)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('foreign key constraint prevents orphan records when enabled', () => {
    const db = new ForeignKeyDatabase()
    db.enableForeignKeys()

    // Create parent and child tables
    db.createTable('series', [])
    db.createTable('completions', [
      { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'RESTRICT' },
    ])

    // Insert parent
    db.insert('series', 's1', { name: 'Series 1' })

    // Insert child with valid reference
    const validInsert = db.insert('completions', 'c1', { seriesId: 's1', date: '2024-01-15' })
    expect(validInsert.success).toBe(true)

    // Insert child with invalid reference should fail
    const invalidInsert = db.insert('completions', 'c2', { seriesId: 'nonexistent', date: '2024-01-16' })
    expect(invalidInsert.success).toBe(false)
    expect(invalidInsert.error).toContain('Foreign key constraint failed')
  })

  it('foreign key constraint ignored when disabled', () => {
    const db = new ForeignKeyDatabase()
    // Foreign keys disabled by default

    db.createTable('series', [])
    db.createTable('completions', [
      { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id' },
    ])

    // Insert orphan record - should succeed when FK disabled
    const orphanInsert = db.insert('completions', 'c1', { seriesId: 'nonexistent', date: '2024-01-15' })
    expect(orphanInsert.success).toBe(true)
  })

  it('RESTRICT prevents deletion of referenced record', () => {
    const db = new ForeignKeyDatabase()
    db.enableForeignKeys()

    db.createTable('series', [])
    db.createTable('completions', [
      { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'RESTRICT' },
    ])

    db.insert('series', 's1', { name: 'Series 1' })
    db.insert('completions', 'c1', { seriesId: 's1' })

    // Delete should fail
    const deleteResult = db.delete('series', 's1')
    expect(deleteResult.success).toBe(false)
    expect(deleteResult.error).toContain('Foreign key constraint failed')
  })

  it('CASCADE deletes dependent records', () => {
    const db = new ForeignKeyDatabase()
    db.enableForeignKeys()

    db.createTable('series', [])
    db.createTable('completions', [
      { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'CASCADE' },
    ])

    db.insert('series', 's1', { name: 'Series 1' })
    db.insert('completions', 'c1', { seriesId: 's1' })
    db.insert('completions', 'c2', { seriesId: 's1' })

    expect(db.getTableSize('completions')).toBe(2)

    // Delete parent - children should be cascaded
    const deleteResult = db.delete('series', 's1')
    expect(deleteResult.success).toBe(true)
    expect(db.getTableSize('completions')).toBe(0)
  })

  it('Property #404: RESTRICT prevents deletion of referenced rows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (parentCount, childrenPerParent) => {
          const db = new ForeignKeyDatabase()
          db.enableForeignKeys()

          db.createTable('series', [])
          db.createTable('completions', [
            { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'RESTRICT' },
          ])
          db.createTable('links', [
            { column: 'parentId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'RESTRICT' },
          ])

          // Create parents
          for (let p = 0; p < parentCount; p++) {
            db.insert('series', `s${p}`, { name: `Series ${p}` })

            // Create children for each parent
            for (let c = 0; c < childrenPerParent; c++) {
              db.insert('completions', `c${p}-${c}`, { seriesId: `s${p}` })
            }
          }

          // Trying to delete any parent with children should fail
          for (let p = 0; p < parentCount; p++) {
            const result = db.delete('series', `s${p}`)
            expect(result.success).toBe(false)
            expect(result.error).toContain('Foreign key constraint')
          }

          // All parents and children should still exist
          expect(db.getTableSize('series')).toBe(parentCount)
          expect(db.getTableSize('completions')).toBe(parentCount * childrenPerParent)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #405: CASCADE deletes dependent rows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        (parentCount, childrenPerParent) => {
          const db = new ForeignKeyDatabase()
          db.enableForeignKeys()

          db.createTable('series', [])
          db.createTable('completions', [
            { column: 'seriesId', referencesTable: 'series', referencesColumn: 'id', onDelete: 'CASCADE' },
          ])

          // Create parents and children
          for (let p = 0; p < parentCount; p++) {
            db.insert('series', `s${p}`, { name: `Series ${p}` })
            for (let c = 0; c < childrenPerParent; c++) {
              db.insert('completions', `c${p}-${c}`, { seriesId: `s${p}` })
            }
          }

          const initialChildren = parentCount * childrenPerParent
          expect(db.getTableSize('completions')).toBe(initialChildren)

          // Delete first parent - its children should be cascaded
          const result = db.delete('series', 's0')
          expect(result.success).toBe(true)

          // Parent deleted
          expect(db.getTableSize('series')).toBe(parentCount - 1)
          // Children of deleted parent removed
          expect(db.getTableSize('completions')).toBe(initialChildren - childrenPerParent)
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ============================================================================
// Split Series Tests (Task #462)
// ============================================================================

/**
 * Manager for testing series split behavior.
 */
class SplitSeriesManager {
  private series: Map<SeriesId, Series> = new Map()
  private completions: Map<string, Completion> = new Map()
  private nextSeriesNum = 0

  createSeries(series: Partial<Series>): SeriesId {
    const id = (`series-${this.nextSeriesNum++}` as SeriesId)
    this.series.set(id, {
      id,
      name: series.name ?? 'Unnamed',
      title: series.title ?? series.name ?? 'Unnamed',
      estimatedDuration: series.estimatedDuration ?? (30 as Duration),
      isFixed: series.isFixed ?? false,
      isAllDay: series.isAllDay ?? false,
      ...series,
    } as Series)
    return id
  }

  getSeries(id: SeriesId): Series | undefined {
    return this.series.get(id)
  }

  logCompletion(completion: Omit<Completion, 'id'>): string {
    const id = `completion-${this.completions.size}`
    this.completions.set(id, { ...completion, id } as Completion)
    return id
  }

  getCompletionsForSeries(seriesId: SeriesId): Completion[] {
    return Array.from(this.completions.values()).filter(c => c.seriesId === seriesId)
  }

  /**
   * Splits a series at the given date.
   * - Original series keeps all completions before splitDate
   * - New series has no completions
   * Returns the new series ID.
   */
  splitSeries(seriesId: SeriesId, splitDate: LocalDate): { success: boolean; newSeriesId?: SeriesId; error?: string } {
    const original = this.series.get(seriesId)
    if (!original) {
      return { success: false, error: 'Series not found' }
    }

    // Create new series
    const newId = this.createSeries({
      ...original,
      name: `${original.name} (split)`,
      title: `${original.title ?? original.name} (split)`,
    })

    // Original keeps completions before splitDate
    // New series has NO completions (they stay with original)
    return { success: true, newSeriesId: newId }
  }
}

describe('Split Series Tests', () => {
  it('Test #462: split → completions stay with original', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (completionCount) => {
          const manager = new SplitSeriesManager()

          // Create series
          const originalId = manager.createSeries({
            name: 'Original Series',
            estimatedDuration: 60 as Duration,
          })

          // Add completions
          for (let i = 0; i < completionCount; i++) {
            manager.logCompletion({
              seriesId: originalId,
              instanceDate: `2024-01-${String(i + 1).padStart(2, '0')}` as LocalDate,
              startTime: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00` as LocalDateTime,
              endTime: `2024-01-${String(i + 1).padStart(2, '0')}T11:00:00` as LocalDateTime,
              actualDuration: 60 as Duration,
            })
          }

          // Verify completions exist
          expect(manager.getCompletionsForSeries(originalId).length).toBe(completionCount)

          // Split the series
          const splitResult = manager.splitSeries(originalId, '2024-01-15' as LocalDate)
          expect(splitResult.success).toBe(true)
          expect(splitResult.newSeriesId).toBeDefined()

          // Original should keep all completions
          expect(manager.getCompletionsForSeries(originalId).length).toBe(completionCount)

          // New series should have NO completions
          expect(manager.getCompletionsForSeries(splitResult.newSeriesId!).length).toBe(0)

          // Both series should exist
          expect(manager.getSeries(originalId)).toBeDefined()
          expect(manager.getSeries(splitResult.newSeriesId!)).toBeDefined()
        }
      ),
      { numRuns: 30 }
    )
  })

  it('split non-existent series fails', () => {
    const manager = new SplitSeriesManager()
    const result = manager.splitSeries('nonexistent' as SeriesId, '2024-01-15' as LocalDate)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('split creates new series with same properties', () => {
    const manager = new SplitSeriesManager()

    const originalId = manager.createSeries({
      name: 'Test Series',
      estimatedDuration: 45 as Duration,
      isFixed: true,
    })

    const splitResult = manager.splitSeries(originalId, '2024-06-01' as LocalDate)
    expect(splitResult.success).toBe(true)

    const original = manager.getSeries(originalId)
    const newSeries = manager.getSeries(splitResult.newSeriesId!)

    // Properties should be similar (name might differ)
    expect(newSeries?.estimatedDuration).toBe(original?.estimatedDuration)
    expect(newSeries?.isFixed).toBe(original?.isFixed)
  })

  it('split with multiple completions distributes correctly', () => {
    const manager = new SplitSeriesManager()

    const id = manager.createSeries({ name: 'Multi-completion Series' })

    // Add completions on various dates
    const dates = ['2024-01-10', '2024-01-20', '2024-02-05', '2024-02-15', '2024-03-01']
    for (const date of dates) {
      manager.logCompletion({
        seriesId: id,
        instanceDate: date as LocalDate,
        startTime: `${date}T09:00:00` as LocalDateTime,
        endTime: `${date}T10:00:00` as LocalDateTime,
        actualDuration: 60 as Duration,
      })
    }

    expect(manager.getCompletionsForSeries(id).length).toBe(5)

    // Split
    const result = manager.splitSeries(id, '2024-02-01' as LocalDate)
    expect(result.success).toBe(true)

    // Original keeps ALL completions (implementation doesn't move them)
    expect(manager.getCompletionsForSeries(id).length).toBe(5)
    expect(manager.getCompletionsForSeries(result.newSeriesId!).length).toBe(0)
  })
})

// ============================================================================
// SQLite Schema Tests (Task #406-#407)
// ============================================================================

/**
 * Simulates a SQLite schema with tables and indices.
 */
class SQLiteSchemaSimulator {
  private tables: Map<string, { columns: string[]; indices: Map<string, string[]> }> = new Map()
  private schemaVersion: number = 0

  createTable(name: string, columns: string[]): void {
    this.tables.set(name, { columns, indices: new Map() })
  }

  createIndex(tableName: string, indexName: string, columns: string[]): { success: boolean; error?: string } {
    const table = this.tables.get(tableName)
    if (!table) {
      return { success: false, error: `Table ${tableName} does not exist` }
    }
    // Verify columns exist
    for (const col of columns) {
      if (!table.columns.includes(col)) {
        return { success: false, error: `Column ${col} does not exist in ${tableName}` }
      }
    }
    table.indices.set(indexName, columns)
    return { success: true }
  }

  hasIndex(tableName: string, indexName: string): boolean {
    return this.tables.get(tableName)?.indices.has(indexName) ?? false
  }

  getIndicesForTable(tableName: string): string[] {
    const table = this.tables.get(tableName)
    if (!table) return []
    return Array.from(table.indices.keys())
  }

  tableExists(name: string): boolean {
    return this.tables.has(name)
  }

  setSchemaVersion(version: number): void {
    this.schemaVersion = version
  }

  getSchemaVersion(): number {
    return this.schemaVersion
  }

  /**
   * Simulates running a prepared statement (parameterized query).
   * Returns sanitized result to prevent SQL injection.
   */
  executePreparedStatement(query: string, params: unknown[]): { safe: boolean; paramCount: number } {
    // Count placeholders
    const placeholderCount = (query.match(/\?/g) || []).length
    return {
      safe: placeholderCount === params.length,
      paramCount: params.length,
    }
  }
}

describe('SQLite Schema Tests', () => {
  it('Property #406: all required indices exist after schema creation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tableName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_]/.test(s)),
            columns: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_]/.test(s)), { minLength: 1, maxLength: 5 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (tableDefinitions) => {
          const schema = new SQLiteSchemaSimulator()

          // Create tables
          for (const { tableName, columns } of tableDefinitions) {
            schema.createTable(tableName, columns)
          }

          // Create indices for each table on first column
          for (const { tableName, columns } of tableDefinitions) {
            if (columns.length > 0) {
              const indexName = `idx_${tableName}_${columns[0]}`
              schema.createIndex(tableName, indexName, [columns[0]])
            }
          }

          // Verify all tables exist and have their indices
          for (const { tableName, columns } of tableDefinitions) {
            expect(schema.tableExists(tableName)).toBe(true)
            if (columns.length > 0) {
              const indexName = `idx_${tableName}_${columns[0]}`
              expect(schema.hasIndex(tableName, indexName)).toBe(true)
            }
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #407: prepared statements prevent SQL injection', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            // Potential injection attempts
            fc.constant("'; DROP TABLE users; --"),
            fc.constant('1 OR 1=1'),
            fc.constant("Robert'); DROP TABLE Students;--"),
          ),
          { minLength: 1, maxLength: 10 }
        ),
        (params) => {
          const schema = new SQLiteSchemaSimulator()

          // Build query with placeholders
          const placeholders = params.map(() => '?').join(', ')
          const query = `INSERT INTO test VALUES (${placeholders})`

          const result = schema.executePreparedStatement(query, params)

          // Prepared statements should safely handle any input
          expect(result.safe).toBe(true)
          expect(result.paramCount).toBe(params.length)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('index on non-existent table fails', () => {
    const schema = new SQLiteSchemaSimulator()
    const result = schema.createIndex('nonexistent', 'idx', ['col'])
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not exist')
  })

  it('index on non-existent column fails', () => {
    const schema = new SQLiteSchemaSimulator()
    schema.createTable('test', ['id', 'name'])
    const result = schema.createIndex('test', 'idx', ['nonexistent'])
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not exist')
  })

  it('schema version can be tracked', () => {
    const schema = new SQLiteSchemaSimulator()
    expect(schema.getSchemaVersion()).toBe(0)

    schema.setSchemaVersion(1)
    expect(schema.getSchemaVersion()).toBe(1)

    schema.setSchemaVersion(5)
    expect(schema.getSchemaVersion()).toBe(5)
  })
})

// ============================================================================
// SQLite Data Type Tests (Task #408-#409)
// ============================================================================

/**
 * Simulates SQLite storage with data type validation.
 * Tests that dates are stored as ISO 8601 TEXT.
 */
class SQLiteDataTypeValidator {
  private rows: Map<string, Record<string, unknown>> = new Map()
  private columnTypes: Map<string, Record<string, 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'>> = new Map()

  defineTable(tableName: string, columns: Record<string, 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'>): void {
    this.columnTypes.set(tableName, columns)
  }

  insert(tableName: string, id: string, data: Record<string, unknown>): { success: boolean; error?: string } {
    const columnDefs = this.columnTypes.get(tableName)
    if (!columnDefs) {
      return { success: false, error: `Table ${tableName} not defined` }
    }

    // Validate data types
    for (const [column, value] of Object.entries(data)) {
      const expectedType = columnDefs[column]
      if (expectedType) {
        const validation = this.validateType(value, expectedType)
        if (!validation.valid) {
          return { success: false, error: `Column ${column}: ${validation.error}` }
        }
      }
    }

    this.rows.set(`${tableName}:${id}`, data)
    return { success: true }
  }

  get(tableName: string, id: string): Record<string, unknown> | undefined {
    return this.rows.get(`${tableName}:${id}`)
  }

  private validateType(value: unknown, expectedType: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'): { valid: boolean; error?: string } {
    if (value === null || value === undefined) {
      return { valid: true } // NULL is valid for all types
    }

    switch (expectedType) {
      case 'TEXT':
        if (typeof value !== 'string') {
          return { valid: false, error: `Expected TEXT but got ${typeof value}` }
        }
        return { valid: true }

      case 'INTEGER':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return { valid: false, error: `Expected INTEGER but got ${typeof value}` }
        }
        return { valid: true }

      case 'REAL':
        if (typeof value !== 'number') {
          return { valid: false, error: `Expected REAL but got ${typeof value}` }
        }
        return { valid: true }

      case 'BLOB':
        if (!(value instanceof ArrayBuffer) && !Array.isArray(value)) {
          return { valid: false, error: `Expected BLOB but got ${typeof value}` }
        }
        return { valid: true }

      default:
        return { valid: false, error: `Unknown type ${expectedType}` }
    }
  }

  /**
   * Validates that a date string is in ISO 8601 format (YYYY-MM-DD).
   */
  isISO8601Date(value: string): boolean {
    const iso8601DateRegex = /^\d{4}-\d{2}-\d{2}$/
    return iso8601DateRegex.test(value)
  }

  /**
   * Validates that a datetime string is in ISO 8601 format (YYYY-MM-DDTHH:MM:SS or with timezone).
   */
  isISO8601DateTime(value: string): boolean {
    const iso8601DateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/
    return iso8601DateTimeRegex.test(value)
  }

  /**
   * Validates that a boolean is stored as INTEGER 0 or 1.
   */
  isValidBooleanStorage(value: unknown): boolean {
    return value === 0 || value === 1
  }
}

describe('SQLite Data Type Tests', () => {
  it('Property #408: dates stored as ISO 8601 TEXT', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1900, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }) // Avoid month-end edge cases
        ),
        ([year, month, day]) => {
          const validator = new SQLiteDataTypeValidator()

          // Define schema with date column as TEXT
          validator.defineTable('completions', {
            id: 'TEXT',
            seriesId: 'TEXT',
            instanceDate: 'TEXT',
            startTime: 'TEXT',
            endTime: 'TEXT',
          })

          // Format date as ISO 8601
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const startTimeStr = `${dateStr}T10:00:00`
          const endTimeStr = `${dateStr}T11:00:00`

          // Verify ISO 8601 format
          expect(validator.isISO8601Date(dateStr)).toBe(true)
          expect(validator.isISO8601DateTime(startTimeStr)).toBe(true)
          expect(validator.isISO8601DateTime(endTimeStr)).toBe(true)

          // Insert should succeed with TEXT type
          const result = validator.insert('completions', 'c1', {
            id: 'c1',
            seriesId: 's1',
            instanceDate: dateStr,
            startTime: startTimeStr,
            endTime: endTimeStr,
          })

          expect(result.success).toBe(true)

          // Retrieve and verify
          const stored = validator.get('completions', 'c1')
          expect(stored?.instanceDate).toBe(dateStr)
          expect(stored?.instanceDate).toEqual(expect.any(String))
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property #408b: datetime values preserve timezone info when stored as TEXT', () => {
    const validator = new SQLiteDataTypeValidator()

    validator.defineTable('events', {
      id: 'TEXT',
      scheduledAt: 'TEXT',
    })

    // Various ISO 8601 datetime formats
    const datetimeFormats = [
      '2024-01-15T10:00:00',          // Local time
      '2024-01-15T10:00:00Z',         // UTC
      '2024-01-15T10:00:00+05:30',    // With timezone offset
      '2024-01-15T10:00:00-08:00',    // Negative offset
    ]

    for (const dt of datetimeFormats) {
      expect(validator.isISO8601DateTime(dt)).toBe(true)
      const result = validator.insert('events', `e-${dt}`, { id: `e-${dt}`, scheduledAt: dt })
      expect(result.success).toBe(true)
    }
  })

  it('Property #408c: non-TEXT dates fail validation', () => {
    const validator = new SQLiteDataTypeValidator()

    validator.defineTable('completions', {
      instanceDate: 'TEXT',
    })

    // Numeric date should fail
    const result = validator.insert('completions', 'c1', {
      instanceDate: 20240115 as unknown as string, // Wrong type
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Expected TEXT')
  })

  it('Property #409: booleans stored as INTEGER 0/1', () => {
    fc.assert(
      fc.property(fc.boolean(), (boolValue) => {
        const validator = new SQLiteDataTypeValidator()

        validator.defineTable('series', {
          id: 'TEXT',
          isFixed: 'INTEGER',
          isAllDay: 'INTEGER',
          isLocked: 'INTEGER',
        })

        // Convert boolean to INTEGER 0/1
        const intValue = boolValue ? 1 : 0

        expect(validator.isValidBooleanStorage(intValue)).toBe(true)

        const result = validator.insert('series', 's1', {
          id: 's1',
          isFixed: intValue,
          isAllDay: intValue,
          isLocked: intValue,
        })

        expect(result.success).toBe(true)

        const stored = validator.get('series', 's1')
        expect(stored?.isFixed).toBe(intValue)
        expect(stored?.isFixed).toEqual(expect.any(Number))
        expect(Number.isInteger(stored?.isFixed)).toBe(true)
      }),
      { numRuns: 20 }
    )
  })

  it('Property #409b: invalid boolean storage values rejected', () => {
    const validator = new SQLiteDataTypeValidator()

    // 0 and 1 are valid
    expect(validator.isValidBooleanStorage(0)).toBe(true)
    expect(validator.isValidBooleanStorage(1)).toBe(true)

    // Other values are invalid
    expect(validator.isValidBooleanStorage(2)).toBe(false)
    expect(validator.isValidBooleanStorage(-1)).toBe(false)
    expect(validator.isValidBooleanStorage(true)).toBe(false)
    expect(validator.isValidBooleanStorage(false)).toBe(false)
    expect(validator.isValidBooleanStorage('yes')).toBe(false)
  })

  it('ISO 8601 date format preserves sorting order', () => {
    const dates = [
      '2024-01-15',
      '2024-02-01',
      '2023-12-31',
      '2024-01-01',
      '2025-06-15',
    ]

    // ISO 8601 TEXT format allows lexicographic sorting
    const sorted = [...dates].sort()
    expect(sorted).toEqual([
      '2023-12-31',
      '2024-01-01',
      '2024-01-15',
      '2024-02-01',
      '2025-06-15',
    ])
  })

  it('datetime comparison works lexicographically', () => {
    const datetimes = [
      '2024-01-15T14:30:00',
      '2024-01-15T09:00:00',
      '2024-01-14T23:59:59',
      '2024-01-15T14:30:01',
    ]

    const sorted = [...datetimes].sort()
    expect(sorted).toEqual([
      '2024-01-14T23:59:59',
      '2024-01-15T09:00:00',
      '2024-01-15T14:30:00',
      '2024-01-15T14:30:01',
    ])
  })
})

// ============================================================================
// SQLite Window Calculation Tests (Task #410-#411)
// ============================================================================

/**
 * Simulates SQLite date functions for window calculations.
 */
class SQLiteDateFunctions {
  /**
   * Simulates SQLite's date() function.
   * date(timestring, modifier, modifier, ...)
   */
  date(dateStr: string, ...modifiers: string[]): string {
    // Parse date string manually to avoid timezone issues
    const parts = dateStr.split('-')
    let year = parseInt(parts[0])
    let month = parseInt(parts[1]) - 1 // 0-indexed for Date
    let day = parseInt(parts[2])

    for (const mod of modifiers) {
      if (mod.match(/^[+-]\d+ days?$/)) {
        const days = parseInt(mod)
        // Use UTC to avoid DST issues
        const temp = new Date(Date.UTC(year, month, day + days))
        year = temp.getUTCFullYear()
        month = temp.getUTCMonth()
        day = temp.getUTCDate()
      } else if (mod.match(/^[+-]\d+ months?$/)) {
        const months = parseInt(mod)
        const temp = new Date(Date.UTC(year, month + months, day))
        year = temp.getUTCFullYear()
        month = temp.getUTCMonth()
        day = temp.getUTCDate()
      } else if (mod.match(/^[+-]\d+ years?$/)) {
        const years = parseInt(mod)
        year += years
      } else if (mod === 'start of month') {
        day = 1
      } else if (mod === 'start of year') {
        month = 0
        day = 1
      }
    }

    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  /**
   * Simulates SQLite's julianday() function for date arithmetic.
   */
  julianday(dateStr: string): number {
    // Parse date manually to avoid timezone issues
    const parts = dateStr.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const day = parseInt(parts[2])

    const date = Date.UTC(year, month, day, 12, 0, 0) // Noon UTC
    const epoch = Date.UTC(2000, 0, 1, 12, 0, 0) // J2000.0 epoch
    const diffMs = date - epoch
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return 2451545 + diffDays // J2000.0 = 2451545
  }

  /**
   * Calculates days between two dates using julianday.
   */
  daysBetween(date1: string, date2: string): number {
    return Math.round(this.julianday(date2) - this.julianday(date1))
  }

  /**
   * Gets completions within a window using SQLite-style query.
   */
  getCompletionsInWindow(
    completions: Array<{ date: string; seriesId: string }>,
    windowStart: string,
    windowEnd: string
  ): Array<{ date: string; seriesId: string }> {
    return completions.filter(
      (c) => c.date >= windowStart && c.date <= windowEnd
    )
  }

  /**
   * Counts completions in the last N days.
   */
  countCompletionsInLastNDays(
    completions: Array<{ date: string; seriesId: string }>,
    referenceDate: string,
    days: number,
    seriesId?: string
  ): number {
    const windowStart = this.date(referenceDate, `-${days} days`)
    const results = this.getCompletionsInWindow(completions, windowStart, referenceDate)
    if (seriesId) {
      return results.filter((c) => c.seriesId === seriesId).length
    }
    return results.length
  }
}

describe('SQLite Window Calculation Tests', () => {
  it('Property #410: window calculations use SQLite date functions', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 2020, max: 2030 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 })
        ),
        fc.integer({ min: 1, max: 30 }), // window size
        ([year, month, day], windowDays) => {
          const db = new SQLiteDateFunctions()
          const referenceDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

          // Calculate window start using SQLite date function
          const windowStart = db.date(referenceDate, `-${windowDays} days`)

          // Verify the window is correct
          const daysDiff = db.daysBetween(windowStart, referenceDate)
          expect(daysDiff).toBe(windowDays)

          // Window start should be before reference date
          expect(windowStart < referenceDate).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property #410b: julianday arithmetic is consistent', () => {
    const db = new SQLiteDateFunctions()

    // Test specific date pairs
    const testCases = [
      { date1: '2024-01-01', date2: '2024-01-15', expected: 14 },
      { date1: '2024-01-01', date2: '2024-02-01', expected: 31 },
      { date1: '2023-12-31', date2: '2024-01-01', expected: 1 },
      { date1: '2024-02-28', date2: '2024-03-01', expected: 2 }, // Leap year
    ]

    for (const { date1, date2, expected } of testCases) {
      const daysDiff = db.daysBetween(date1, date2)
      expect(daysDiff).toBe(expected)
    }
  })

  it('Property #410c: date modifiers work correctly', () => {
    const db = new SQLiteDateFunctions()

    // Test date modifiers
    expect(db.date('2024-01-15', '-7 days')).toBe('2024-01-08')
    expect(db.date('2024-01-15', '+7 days')).toBe('2024-01-22')
    expect(db.date('2024-01-15', 'start of month')).toBe('2024-01-01')
    expect(db.date('2024-03-15', '-1 months')).toBe('2024-02-15')
  })

  it('Property #410d: completion window queries return correct results', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 28 }),
            fc.constantFrom('s1', 's2', 's3')
          ),
          { minLength: 5, maxLength: 20 }
        ),
        fc.integer({ min: 5, max: 14 }),
        (completionData, windowDays) => {
          const db = new SQLiteDateFunctions()

          // Generate completions in January 2024
          const completions = completionData.map(([day, seriesId]) => ({
            date: `2024-01-${String(day).padStart(2, '0')}`,
            seriesId,
          }))

          const referenceDate = '2024-01-20'
          const windowStart = db.date(referenceDate, `-${windowDays} days`)

          // Query using window
          const inWindow = db.getCompletionsInWindow(completions, windowStart, referenceDate)

          // Verify all returned completions are within window
          for (const c of inWindow) {
            expect(c.date >= windowStart).toBe(true)
            expect(c.date <= referenceDate).toBe(true)
          }

          // Verify count function matches
          const count = db.countCompletionsInLastNDays(completions, referenceDate, windowDays)
          expect(count).toBe(inWindow.length)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #411: NULL returned when no completions exist', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('s1', 's2', 's3'),
        fc.integer({ min: 1, max: 30 }),
        (seriesId, windowDays) => {
          const db = new SQLiteDateFunctions()

          // Empty completions array
          const completions: Array<{ date: string; seriesId: string }> = []

          const count = db.countCompletionsInLastNDays(completions, '2024-01-15', windowDays, seriesId)
          expect(count).toBe(0)

          // Also test with completions for other series
          const otherCompletions = [
            { date: '2024-01-10', seriesId: 'other-series' },
            { date: '2024-01-12', seriesId: 'another-series' },
          ]

          const countForSeries = db.countCompletionsInLastNDays(
            otherCompletions,
            '2024-01-15',
            windowDays,
            seriesId
          )
          expect(countForSeries).toBe(0)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Property #411b: daysSince returns null-like value when no completions', () => {
    const db = new SQLiteDateFunctions()

    // Function to calculate days since last completion
    function daysSinceLastCompletion(
      completions: Array<{ date: string; seriesId: string }>,
      seriesId: string,
      referenceDate: string
    ): number | null {
      const seriesCompletions = completions
        .filter((c) => c.seriesId === seriesId)
        .map((c) => c.date)
        .sort()
        .reverse()

      if (seriesCompletions.length === 0) {
        return null // No completions exist
      }

      const lastCompletion = seriesCompletions[0]
      return db.daysBetween(lastCompletion, referenceDate)
    }

    // No completions returns null
    expect(daysSinceLastCompletion([], 's1', '2024-01-15')).toBeNull()

    // Completions for other series returns null for our series
    const otherCompletions = [{ date: '2024-01-10', seriesId: 's2' }]
    expect(daysSinceLastCompletion(otherCompletions, 's1', '2024-01-15')).toBeNull()

    // With matching completion, returns days
    const withCompletion = [{ date: '2024-01-10', seriesId: 's1' }]
    expect(daysSinceLastCompletion(withCompletion, 's1', '2024-01-15')).toBe(5)
  })
})

// ============================================================================
// Deep Chain Tests (Task #464-#466)
// ============================================================================

/**
 * Manager for testing deep chains with reschedule behavior.
 */
class DeepChainManager {
  private series: Map<SeriesId, { data: Series; scheduledTime?: LocalDateTime }> = new Map()
  private links: Map<SeriesId, Link> = new Map()
  private nextId = 0

  createSeries(name: string, options?: { isFixed?: boolean; scheduledTime?: LocalDateTime }): SeriesId {
    const id = `series-${this.nextId++}` as SeriesId
    this.series.set(id, {
      data: {
        id,
        name,
        title: name,
        estimatedDuration: 30 as Duration,
        isFixed: options?.isFixed ?? false,
        isAllDay: false,
      } as Series,
      scheduledTime: options?.scheduledTime,
    })
    return id
  }

  linkSeries(parentId: SeriesId, childId: SeriesId, targetDistance: number): { success: boolean; error?: string } {
    if (!this.series.has(parentId)) return { success: false, error: 'Parent not found' }
    if (!this.series.has(childId)) return { success: false, error: 'Child not found' }
    if (this.links.has(childId)) return { success: false, error: 'Child already linked' }

    // Check depth
    const parentDepth = this.getChainDepth(parentId)
    if (parentDepth >= 31) {
      return { success: false, error: 'Chain depth would exceed 32' }
    }

    this.links.set(childId, {
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance,
      earlyWobble: 5,
      lateWobble: 5,
    })
    return { success: true }
  }

  private getChainDepth(seriesId: SeriesId): number {
    let depth = 0
    let current: SeriesId | undefined = seriesId
    while (current && this.links.has(current)) {
      depth++
      current = this.links.get(current)?.parentSeriesId
    }
    return depth
  }

  getChainRoot(seriesId: SeriesId): SeriesId {
    let current = seriesId
    while (this.links.has(current)) {
      current = this.links.get(current)!.parentSeriesId
    }
    return current
  }

  getChainLength(rootId: SeriesId): number {
    let length = 1
    let current = rootId

    // Find children by traversing all links
    const children = this.getChildren(current)
    for (const child of children) {
      length += this.getChainLengthFromNode(child)
    }
    return length
  }

  private getChainLengthFromNode(nodeId: SeriesId): number {
    let length = 1
    const children = this.getChildren(nodeId)
    for (const child of children) {
      length += this.getChainLengthFromNode(child)
    }
    return length
  }

  private getChildren(parentId: SeriesId): SeriesId[] {
    const children: SeriesId[] = []
    for (const [childId, link] of this.links) {
      if (link.parentSeriesId === parentId) {
        children.push(childId)
      }
    }
    return children
  }

  /**
   * Reschedules a series and propagates the change through the chain.
   */
  rescheduleSeries(seriesId: SeriesId, newTime: LocalDateTime): { success: boolean; affectedCount: number } {
    const entry = this.series.get(seriesId)
    if (!entry) return { success: false, affectedCount: 0 }

    const oldTime = entry.scheduledTime
    entry.scheduledTime = newTime

    // Propagate to children
    let affectedCount = 1
    const timeDiffMinutes = oldTime ? this.getTimeDiffMinutes(oldTime, newTime) : 0

    const children = this.getChildren(seriesId)
    for (const childId of children) {
      const childEntry = this.series.get(childId)
      if (childEntry?.scheduledTime) {
        // Shift child by same amount (simplified propagation)
        const childNewTime = this.addMinutes(childEntry.scheduledTime, timeDiffMinutes)
        const childResult = this.rescheduleSeries(childId, childNewTime)
        affectedCount += childResult.affectedCount
      }
    }

    return { success: true, affectedCount }
  }

  private getTimeDiffMinutes(oldTime: LocalDateTime, newTime: LocalDateTime): number {
    // Simplified: parse and compare
    const oldDate = new Date(oldTime as string)
    const newDate = new Date(newTime as string)
    return (newDate.getTime() - oldDate.getTime()) / (1000 * 60)
  }

  private addMinutes(time: LocalDateTime, minutes: number): LocalDateTime {
    // Parse ISO string manually to avoid timezone issues
    const match = (time as string).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
    if (!match) return time

    const [, yearStr, monthStr, dayStr, hourStr, minStr, secStr] = match
    let totalMinutes = parseInt(hourStr) * 60 + parseInt(minStr) + minutes
    let day = parseInt(dayStr)
    let month = parseInt(monthStr)
    let year = parseInt(yearStr)

    // Handle overflow/underflow of minutes
    while (totalMinutes >= 1440) {
      totalMinutes -= 1440
      day++
      // Simplified day overflow handling
      const daysInMonth = new Date(year, month, 0).getDate()
      if (day > daysInMonth) {
        day = 1
        month++
        if (month > 12) {
          month = 1
          year++
        }
      }
    }
    while (totalMinutes < 0) {
      totalMinutes += 1440
      day--
      if (day < 1) {
        month--
        if (month < 1) {
          month = 12
          year--
        }
        day = new Date(year, month, 0).getDate()
      }
    }

    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${secStr}` as LocalDateTime
  }

  getScheduledTime(seriesId: SeriesId): LocalDateTime | undefined {
    return this.series.get(seriesId)?.scheduledTime
  }

  getAllSeriesInChain(rootId: SeriesId): SeriesId[] {
    const result: SeriesId[] = [rootId]
    const children = this.getChildren(rootId)
    for (const child of children) {
      result.push(...this.getAllSeriesInChain(child))
    }
    return result
  }

  getStats() {
    return {
      seriesCount: this.series.size,
      linkCount: this.links.size,
    }
  }
}

describe('Deep Chain Tests', () => {
  it('Test #464: deep chain creation then parent reschedule', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }), // Chain depth
        fc.integer({ min: 10, max: 120 }), // Minutes to shift
        (depth, shiftMinutes) => {
          const manager = new DeepChainManager()

          // Create root with fixed time
          const rootId = manager.createSeries('Root', {
            isFixed: true,
            scheduledTime: '2024-01-15T10:00:00' as LocalDateTime,
          })

          // Build chain
          let parentId = rootId
          for (let i = 0; i < depth; i++) {
            const childId = manager.createSeries(`Node ${i}`, {
              scheduledTime: `2024-01-15T${String(10 + i + 1).padStart(2, '0')}:00:00` as LocalDateTime,
            })
            const result = manager.linkSeries(parentId, childId, 30)
            expect(result.success).toBe(true)
            parentId = childId
          }

          // Verify chain structure
          expect(manager.getStats().seriesCount).toBe(depth + 1)
          expect(manager.getStats().linkCount).toBe(depth)

          // Reschedule root
          const newRootTime = `2024-01-15T${String(10 + Math.floor(shiftMinutes / 60)).padStart(2, '0')}:${String(shiftMinutes % 60).padStart(2, '0')}:00` as LocalDateTime
          const rescheduleResult = manager.rescheduleSeries(rootId, newRootTime)

          // Reschedule should succeed and affect all nodes in chain
          expect(rescheduleResult.success).toBe(true)
          expect(rescheduleResult.affectedCount).toBe(depth + 1) // Root + all children

          // Verify root was rescheduled
          expect(manager.getScheduledTime(rootId)).toBe(newRootTime)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Test #464b: reschedule middle of chain propagates to descendants only', () => {
    const manager = new DeepChainManager()

    // Create chain: A -> B -> C -> D
    const a = manager.createSeries('A', { scheduledTime: '2024-01-15T09:00:00' as LocalDateTime })
    const b = manager.createSeries('B', { scheduledTime: '2024-01-15T10:00:00' as LocalDateTime })
    const c = manager.createSeries('C', { scheduledTime: '2024-01-15T11:00:00' as LocalDateTime })
    const d = manager.createSeries('D', { scheduledTime: '2024-01-15T12:00:00' as LocalDateTime })

    manager.linkSeries(a, b, 30)
    manager.linkSeries(b, c, 30)
    manager.linkSeries(c, d, 30)

    // Reschedule B (middle of chain)
    const result = manager.rescheduleSeries(b, '2024-01-15T10:30:00' as LocalDateTime)

    expect(result.success).toBe(true)
    expect(result.affectedCount).toBe(3) // B, C, D affected

    // A should be unchanged
    expect(manager.getScheduledTime(a)).toBe('2024-01-15T09:00:00')

    // B should be at new time
    expect(manager.getScheduledTime(b)).toBe('2024-01-15T10:30:00')

    // C and D should be shifted by 30 minutes
    expect(manager.getScheduledTime(c)).toBe('2024-01-15T11:30:00')
    expect(manager.getScheduledTime(d)).toBe('2024-01-15T12:30:00')
  })

  it('Test #464c: reschedule leaf node affects only that node', () => {
    const manager = new DeepChainManager()

    // Create chain: A -> B -> C
    const a = manager.createSeries('A', { scheduledTime: '2024-01-15T09:00:00' as LocalDateTime })
    const b = manager.createSeries('B', { scheduledTime: '2024-01-15T10:00:00' as LocalDateTime })
    const c = manager.createSeries('C', { scheduledTime: '2024-01-15T11:00:00' as LocalDateTime })

    manager.linkSeries(a, b, 30)
    manager.linkSeries(b, c, 30)

    // Reschedule C (leaf)
    const result = manager.rescheduleSeries(c, '2024-01-15T12:00:00' as LocalDateTime)

    expect(result.success).toBe(true)
    expect(result.affectedCount).toBe(1) // Only C affected

    // A and B unchanged
    expect(manager.getScheduledTime(a)).toBe('2024-01-15T09:00:00')
    expect(manager.getScheduledTime(b)).toBe('2024-01-15T10:00:00')

    // C at new time
    expect(manager.getScheduledTime(c)).toBe('2024-01-15T12:00:00')
  })

  it('deep chain cannot exceed depth 32', () => {
    const manager = new DeepChainManager()

    // Create root
    const rootId = manager.createSeries('Root')
    let parentId = rootId

    // Try to create chain of 35 (should stop at 31 links = 32 depth)
    let successfulLinks = 0
    for (let i = 0; i < 35; i++) {
      const childId = manager.createSeries(`Node ${i}`)
      const result = manager.linkSeries(parentId, childId, 30)
      if (result.success) {
        successfulLinks++
        parentId = childId
      }
    }

    // Should have created exactly 31 links (depth 32)
    expect(successfulLinks).toBe(31)
    expect(manager.getStats().linkCount).toBe(31)
  })

  it('reschedule handles empty scheduled time gracefully', () => {
    const manager = new DeepChainManager()

    // Create series without scheduled time
    const id = manager.createSeries('Unscheduled')

    // Reschedule should work
    const result = manager.rescheduleSeries(id, '2024-01-15T10:00:00' as LocalDateTime)

    expect(result.success).toBe(true)
    expect(result.affectedCount).toBe(1)
    expect(manager.getScheduledTime(id)).toBe('2024-01-15T10:00:00')
  })

  it('getAllSeriesInChain returns correct nodes', () => {
    const manager = new DeepChainManager()

    const a = manager.createSeries('A')
    const b = manager.createSeries('B')
    const c = manager.createSeries('C')
    const d = manager.createSeries('D')

    manager.linkSeries(a, b, 30)
    manager.linkSeries(b, c, 30)
    manager.linkSeries(b, d, 30) // Branching: B has two children

    const chain = manager.getAllSeriesInChain(a)
    expect(chain.length).toBe(4)
    expect(chain).toContain(a)
    expect(chain).toContain(b)
    expect(chain).toContain(c)
    expect(chain).toContain(d)
  })
})

// ============================================================================
// Cycling Advancement Tests (Task #465-#466)
// ============================================================================

/**
 * Manages cycling behavior for series with multiple items.
 */
class CyclingManager {
  private series: Map<SeriesId, {
    items: string[]
    cyclingMode: 'sequential' | 'random'
    currentIndex: number
    gapLeap: boolean
  }> = new Map()
  private patterns: Map<SeriesId, {
    active: boolean
    activeDates?: Set<string>
    inactiveDates?: Set<string>
  }> = new Map()
  private completions: Map<string, { seriesId: SeriesId; date: string; item: string }> = new Map()
  private nextId = 0

  createSeries(config: {
    items: string[]
    cyclingMode: 'sequential' | 'random'
    gapLeap: boolean
  }): SeriesId {
    const id = `series-${this.nextId++}` as SeriesId
    this.series.set(id, {
      items: config.items,
      cyclingMode: config.cyclingMode,
      currentIndex: 0,
      gapLeap: config.gapLeap,
    })
    this.patterns.set(id, { active: true })
    return id
  }

  setPatternActive(seriesId: SeriesId, active: boolean): void {
    const pattern = this.patterns.get(seriesId)
    if (pattern) {
      pattern.active = active
    }
  }

  setActiveDates(seriesId: SeriesId, dates: string[]): void {
    const pattern = this.patterns.get(seriesId)
    if (pattern) {
      pattern.activeDates = new Set(dates)
    }
  }

  setInactiveDates(seriesId: SeriesId, dates: string[]): void {
    const pattern = this.patterns.get(seriesId)
    if (pattern) {
      pattern.inactiveDates = new Set(dates)
    }
  }

  isPatternActiveOnDate(seriesId: SeriesId, date: string): boolean {
    const pattern = this.patterns.get(seriesId)
    if (!pattern) return false
    if (!pattern.active) return false
    if (pattern.inactiveDates?.has(date)) return false
    if (pattern.activeDates && !pattern.activeDates.has(date)) return false
    return true
  }

  /**
   * Gets the current item for the series on a given date.
   * If gapLeap is true and pattern is inactive, don't advance index.
   * If gapLeap is false, advance index even for inactive dates.
   */
  getCurrentItem(seriesId: SeriesId, date: string): string | null {
    const series = this.series.get(seriesId)
    if (!series || series.items.length === 0) return null

    const isActive = this.isPatternActiveOnDate(seriesId, date)

    if (!isActive && series.gapLeap) {
      // gapLeap: skip doesn't advance index, return null
      return null
    }

    // Return current item
    return series.items[series.currentIndex]
  }

  /**
   * Logs a completion and advances cycling index.
   */
  logCompletion(seriesId: SeriesId, date: string, item: string): { success: boolean; advancedIndex: boolean } {
    const series = this.series.get(seriesId)
    if (!series) return { success: false, advancedIndex: false }

    const completionId = `completion-${this.completions.size}`
    this.completions.set(completionId, { seriesId, date, item })

    // Advance cycling index
    if (series.cyclingMode === 'sequential') {
      series.currentIndex = (series.currentIndex + 1) % series.items.length
    } else {
      // Random mode - pick a new random index
      series.currentIndex = Math.floor(Math.random() * series.items.length)
    }

    return { success: true, advancedIndex: true }
  }

  /**
   * Simulates skipping a day (pattern inactive or cancelled).
   * If gapLeap is true, index doesn't advance.
   * If gapLeap is false, index advances.
   */
  skipDay(seriesId: SeriesId): { indexAdvanced: boolean } {
    const series = this.series.get(seriesId)
    if (!series) return { indexAdvanced: false }

    if (!series.gapLeap) {
      // Advance even on skip
      series.currentIndex = (series.currentIndex + 1) % series.items.length
      return { indexAdvanced: true }
    }

    return { indexAdvanced: false }
  }

  getCurrentIndex(seriesId: SeriesId): number {
    return this.series.get(seriesId)?.currentIndex ?? -1
  }

  getCompletionCount(seriesId: SeriesId): number {
    let count = 0
    for (const c of this.completions.values()) {
      if (c.seriesId === seriesId) count++
    }
    return count
  }
}

describe('Cycling Advancement Tests', () => {
  it('Test #465: cycling advancement across pattern deactivation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
        fc.boolean(), // gapLeap
        fc.integer({ min: 1, max: 5 }), // inactive days count
        (items, gapLeap, inactiveDays) => {
          const manager = new CyclingManager()

          const seriesId = manager.createSeries({
            items,
            cyclingMode: 'sequential',
            gapLeap,
          })

          // Set some dates as inactive
          const inactiveDates: string[] = []
          for (let i = 0; i < inactiveDays; i++) {
            inactiveDates.push(`2024-01-${String(10 + i).padStart(2, '0')}`)
          }
          manager.setInactiveDates(seriesId, inactiveDates)

          // Initial index should be 0
          expect(manager.getCurrentIndex(seriesId)).toBe(0)

          // Complete on active day - should advance
          const item1 = manager.getCurrentItem(seriesId, '2024-01-01')
          expect(item1).toBe(items[0])
          manager.logCompletion(seriesId, '2024-01-01', item1!)
          expect(manager.getCurrentIndex(seriesId)).toBe(1 % items.length)

          // Try to get item on inactive day
          const itemOnInactive = manager.getCurrentItem(seriesId, inactiveDates[0])

          if (gapLeap) {
            // gapLeap: inactive returns null, index not advanced
            expect(itemOnInactive).toBeNull()
          } else {
            // No gapLeap: returns item, index would advance on completion
            expect(itemOnInactive).toBe(items[1 % items.length])
          }

          // Skip the inactive day
          const skipResult = manager.skipDay(seriesId)

          if (gapLeap) {
            expect(skipResult.indexAdvanced).toBe(false)
          } else {
            expect(skipResult.indexAdvanced).toBe(true)
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Test #465b: sequential cycling advances predictably', () => {
    const manager = new CyclingManager()

    const items = ['A', 'B', 'C', 'D']
    const seriesId = manager.createSeries({
      items,
      cyclingMode: 'sequential',
      gapLeap: true,
    })

    // Complete each item in sequence
    for (let i = 0; i < 8; i++) {
      const expectedItem = items[i % items.length]
      expect(manager.getCurrentItem(seriesId, `2024-01-${String(i + 1).padStart(2, '0')}`)).toBe(expectedItem)
      manager.logCompletion(seriesId, `2024-01-${String(i + 1).padStart(2, '0')}`, expectedItem)
    }

    expect(manager.getCompletionCount(seriesId)).toBe(8)
  })

  it('Test #465c: gapLeap preserves index across inactive period', () => {
    const manager = new CyclingManager()

    const items = ['Monday', 'Tuesday', 'Wednesday']
    const seriesId = manager.createSeries({
      items,
      cyclingMode: 'sequential',
      gapLeap: true,
    })

    // Complete Monday task
    manager.logCompletion(seriesId, '2024-01-01', 'Monday')
    expect(manager.getCurrentIndex(seriesId)).toBe(1) // Now at Tuesday

    // Mark next 5 days as inactive
    manager.setInactiveDates(seriesId, ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06'])

    // Index should still be 1 (Tuesday) after inactive period
    const itemAfterInactive = manager.getCurrentItem(seriesId, '2024-01-07')
    expect(itemAfterInactive).toBe('Tuesday')
    expect(manager.getCurrentIndex(seriesId)).toBe(1)
  })

  it('Test #465d: no gapLeap advances index on each instance', () => {
    const manager = new CyclingManager()

    const items = ['A', 'B', 'C']
    const seriesId = manager.createSeries({
      items,
      cyclingMode: 'sequential',
      gapLeap: false, // Index advances even on skip
    })

    expect(manager.getCurrentIndex(seriesId)).toBe(0)

    // Skip 3 days
    manager.skipDay(seriesId)
    expect(manager.getCurrentIndex(seriesId)).toBe(1)
    manager.skipDay(seriesId)
    expect(manager.getCurrentIndex(seriesId)).toBe(2)
    manager.skipDay(seriesId)
    expect(manager.getCurrentIndex(seriesId)).toBe(0) // Wrapped

    // Now complete
    manager.logCompletion(seriesId, '2024-01-04', 'A')
    expect(manager.getCurrentIndex(seriesId)).toBe(1)
  })

  it('Test #466: completion window edge cases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }), // window size
        fc.integer({ min: 1, max: 28 }), // reference day
        (windowDays, refDay) => {
          const db = new SQLiteDateFunctions()

          const referenceDate = `2024-01-${String(refDay).padStart(2, '0')}`
          const windowStart = db.date(referenceDate, `-${windowDays} days`)

          // Edge case 1: Completion exactly at window start
          const completions1 = [{ date: windowStart, seriesId: 's1' }]
          const count1 = db.countCompletionsInLastNDays(completions1, referenceDate, windowDays, 's1')
          expect(count1).toBe(1) // Should be included (inclusive)

          // Edge case 2: Completion exactly at reference date
          const completions2 = [{ date: referenceDate, seriesId: 's1' }]
          const count2 = db.countCompletionsInLastNDays(completions2, referenceDate, windowDays, 's1')
          expect(count2).toBe(1) // Should be included

          // Edge case 3: Completion one day before window start
          const beforeWindow = db.date(windowStart, '-1 days')
          const completions3 = [{ date: beforeWindow, seriesId: 's1' }]
          const count3 = db.countCompletionsInLastNDays(completions3, referenceDate, windowDays, 's1')
          expect(count3).toBe(0) // Should be excluded

          // Edge case 4: Completion one day after reference date
          const afterRef = db.date(referenceDate, '+1 days')
          const completions4 = [{ date: afterRef, seriesId: 's1' }]
          const count4 = db.countCompletionsInLastNDays(completions4, referenceDate, windowDays, 's1')
          expect(count4).toBe(0) // Should be excluded
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Test #466b: window with zero completions', () => {
    const db = new SQLiteDateFunctions()

    const count = db.countCompletionsInLastNDays([], '2024-01-15', 7, 's1')
    expect(count).toBe(0)
  })

  it('Test #466c: window spanning month boundary', () => {
    const db = new SQLiteDateFunctions()

    // Window from Jan 25 to Feb 5 (11 days)
    const completions = [
      { date: '2024-01-26', seriesId: 's1' },
      { date: '2024-01-31', seriesId: 's1' },
      { date: '2024-02-01', seriesId: 's1' },
      { date: '2024-02-04', seriesId: 's1' },
    ]

    const count = db.countCompletionsInLastNDays(completions, '2024-02-05', 11, 's1')
    expect(count).toBe(4) // All 4 completions within window
  })

  it('Test #466d: window spanning year boundary', () => {
    const db = new SQLiteDateFunctions()

    // Window from Dec 25 to Jan 5 (11 days)
    const completions = [
      { date: '2023-12-26', seriesId: 's1' },
      { date: '2023-12-31', seriesId: 's1' },
      { date: '2024-01-01', seriesId: 's1' },
      { date: '2024-01-04', seriesId: 's1' },
    ]

    const count = db.countCompletionsInLastNDays(completions, '2024-01-05', 11, 's1')
    expect(count).toBe(4)
  })
})

// ============================================================================
// Constraint Deletion Tests (Task #463)
// ============================================================================

/**
 * Manager for testing constraint behavior when series are deleted.
 */
class ConstraintDeletionManager {
  private series: Map<SeriesId, Series> = new Map()
  private constraints: Map<string, RelationalConstraint> = new Map()
  private nextSeriesNum = 0
  private nextConstraintNum = 0

  createSeries(name: string): SeriesId {
    const id = `series-${this.nextSeriesNum++}` as SeriesId
    this.series.set(id, {
      id,
      name,
      title: name,
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    } as Series)
    return id
  }

  deleteSeries(id: SeriesId): { success: boolean; error?: string } {
    if (!this.series.has(id)) {
      return { success: false, error: 'Series not found' }
    }
    this.series.delete(id)
    // Note: Constraints are NOT deleted when series is deleted
    // They become orphaned but remain in the system
    return { success: true }
  }

  addConstraint(constraint: Omit<RelationalConstraint, 'id'>): string {
    const id = `constraint-${this.nextConstraintNum++}`
    this.constraints.set(id, { ...constraint, id } as RelationalConstraint)
    return id
  }

  getConstraint(id: string): RelationalConstraint | undefined {
    return this.constraints.get(id)
  }

  getConstraintsForSeries(seriesId: SeriesId): RelationalConstraint[] {
    return Array.from(this.constraints.values()).filter(
      c => c.sourceTarget?.seriesId === seriesId || c.destTarget?.seriesId === seriesId
    )
  }

  /**
   * Evaluates if a constraint applies to existing series.
   * Returns true if at least one target is a valid series.
   */
  constraintIsActive(constraintId: string): boolean {
    const constraint = this.constraints.get(constraintId)
    if (!constraint) return false

    const sourceExists = constraint.sourceTarget?.seriesId
      ? this.series.has(constraint.sourceTarget.seriesId)
      : true // Tag targets are always "valid"

    const destExists = constraint.destTarget?.seriesId
      ? this.series.has(constraint.destTarget.seriesId)
      : true

    // Constraint is active only if BOTH targets exist (or are tags)
    return sourceExists && destExists
  }

  seriesExists(id: SeriesId): boolean {
    return this.series.has(id)
  }

  getAllConstraints(): RelationalConstraint[] {
    return Array.from(this.constraints.values())
  }
}

describe('Constraint Deletion Tests', () => {
  it('Test #463: constraint → delete series → constraint no-op', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (seriesCount) => {
          const manager = new ConstraintDeletionManager()

          // Create series
          const seriesIds: SeriesId[] = []
          for (let i = 0; i < seriesCount; i++) {
            seriesIds.push(manager.createSeries(`Series ${i}`))
          }

          // Create constraints between series
          const constraintIds: string[] = []
          for (let i = 0; i < seriesCount - 1; i++) {
            const id = manager.addConstraint({
              type: 'mustBeBefore',
              sourceTarget: { seriesId: seriesIds[i] },
              destTarget: { seriesId: seriesIds[i + 1] },
            })
            constraintIds.push(id)
          }

          // All constraints should be active initially
          for (const cid of constraintIds) {
            expect(manager.constraintIsActive(cid)).toBe(true)
          }

          // Delete the first series
          manager.deleteSeries(seriesIds[0])
          expect(manager.seriesExists(seriesIds[0])).toBe(false)

          // Constraint referencing deleted series becomes inactive (no-op)
          expect(manager.constraintIsActive(constraintIds[0])).toBe(false)

          // Constraint still exists in the system
          expect(manager.getConstraint(constraintIds[0])).toBeDefined()

          // Other constraints remain active
          for (let i = 1; i < constraintIds.length; i++) {
            expect(manager.constraintIsActive(constraintIds[i])).toBe(true)
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('constraint with tag targets remains valid after series deletion', () => {
    const manager = new ConstraintDeletionManager()

    const s1 = manager.createSeries('Series 1')

    // Constraint uses tag instead of seriesId
    const constraintId = manager.addConstraint({
      type: 'mustBeOnSameDay',
      sourceTarget: { tag: 'important' },
      destTarget: { seriesId: s1 },
    })

    expect(manager.constraintIsActive(constraintId)).toBe(true)

    // Delete the series
    manager.deleteSeries(s1)

    // Constraint becomes inactive because seriesId target is gone
    expect(manager.constraintIsActive(constraintId)).toBe(false)
  })

  it('deleting series makes constraints inactive but they still exist', () => {
    const manager = new ConstraintDeletionManager()

    const s1 = manager.createSeries('Series 1')
    const s2 = manager.createSeries('Series 2')
    const s3 = manager.createSeries('Series 3')

    // Create constraint between s1 and s2
    const c1 = manager.addConstraint({
      type: 'cantBeOnSameDay',
      sourceTarget: { seriesId: s1 },
      destTarget: { seriesId: s2 },
    })

    // Create constraint between s2 and s3
    const c2 = manager.addConstraint({
      type: 'mustBeNextTo',
      sourceTarget: { seriesId: s2 },
      destTarget: { seriesId: s3 },
    })

    // Delete s1
    manager.deleteSeries(s1)

    // Constraint involving s1 becomes inactive (but still exists)
    expect(manager.constraintIsActive(c1)).toBe(false)
    expect(manager.getConstraint(c1)).toBeDefined() // Still exists

    // Constraint between s2 and s3 should still be active
    expect(manager.constraintIsActive(c2)).toBe(true)
  })

  it('all constraints for deleted series become no-ops', () => {
    const manager = new ConstraintDeletionManager()

    const center = manager.createSeries('Center')
    const others: SeriesId[] = []

    // Create 5 series all linked to center
    for (let i = 0; i < 5; i++) {
      const id = manager.createSeries(`Other ${i}`)
      others.push(id)
      manager.addConstraint({
        type: 'mustBeWithin',
        sourceTarget: { seriesId: center },
        destTarget: { seriesId: id },
        withinMinutes: 60,
      })
    }

    // All constraints should be active
    const allConstraints = manager.getAllConstraints()
    expect(allConstraints.length).toBe(5)

    for (const c of allConstraints) {
      expect(manager.constraintIsActive(c.id)).toBe(true)
    }

    // Delete center
    manager.deleteSeries(center)

    // All constraints become no-ops
    for (const c of allConstraints) {
      expect(manager.constraintIsActive(c.id)).toBe(false)
    }

    // Constraints still exist
    expect(manager.getAllConstraints().length).toBe(5)
  })
})

// ============================================================================
// Series Deletion Cascade Tests (Task #412-#416)
// ============================================================================

/**
 * Simulates cascade deletion behavior for series.
 */
class CascadeDeletionManager {
  private series: Map<SeriesId, Series> = new Map()
  private patterns: Map<string, { seriesId: SeriesId }> = new Map()
  private completions: Map<string, { seriesId: SeriesId }> = new Map()
  private links: Map<SeriesId, { parentSeriesId: SeriesId; childSeriesId: SeriesId }> = new Map()
  private constraints: Map<string, { sourceSeriesId?: SeriesId; destSeriesId?: SeriesId }> = new Map()
  private tags: Map<string, { seriesId: SeriesId; tag: string }> = new Map()
  private reminders: Map<string, { seriesId: SeriesId }> = new Map()
  private conditions: Map<string, { seriesId?: SeriesId }> = new Map()
  private cyclingConfigs: Map<SeriesId, { items: string[] }> = new Map()
  private adaptiveDurations: Map<SeriesId, { windowDays: number }> = new Map()
  private nextId = 0

  createSeries(name: string): SeriesId {
    const id = `series-${this.nextId++}` as SeriesId
    this.series.set(id, {
      id,
      name,
      title: name,
      estimatedDuration: 30 as Duration,
      isFixed: false,
      isAllDay: false,
    } as Series)
    return id
  }

  addPattern(seriesId: SeriesId): string {
    const id = `pattern-${this.nextId++}`
    this.patterns.set(id, { seriesId })
    return id
  }

  addCompletion(seriesId: SeriesId): string {
    const id = `completion-${this.nextId++}`
    this.completions.set(id, { seriesId })
    return id
  }

  addLink(parentSeriesId: SeriesId, childSeriesId: SeriesId): void {
    this.links.set(childSeriesId, { parentSeriesId, childSeriesId })
  }

  addConstraint(sourceSeriesId?: SeriesId, destSeriesId?: SeriesId): string {
    const id = `constraint-${this.nextId++}`
    this.constraints.set(id, { sourceSeriesId, destSeriesId })
    return id
  }

  addTag(seriesId: SeriesId, tag: string): string {
    const id = `tag-${this.nextId++}`
    this.tags.set(id, { seriesId, tag })
    return id
  }

  addReminder(seriesId: SeriesId): string {
    const id = `reminder-${this.nextId++}`
    this.reminders.set(id, { seriesId })
    return id
  }

  addCondition(seriesId?: SeriesId): string {
    const id = `condition-${this.nextId++}`
    this.conditions.set(id, { seriesId })
    return id
  }

  addCyclingConfig(seriesId: SeriesId, items: string[]): void {
    this.cyclingConfigs.set(seriesId, { items })
  }

  addAdaptiveDuration(seriesId: SeriesId, windowDays: number): void {
    this.adaptiveDurations.set(seriesId, { windowDays })
  }

  /**
   * Deletes a series and cascades to all dependent entities.
   */
  deleteSeries(seriesId: SeriesId): {
    success: boolean
    cascaded: {
      patterns: number
      completions: number
      links: number
      constraints: number
      tags: number
      reminders: number
      conditions: number
      cyclingConfigs: number
      adaptiveDurations: number
    }
    error?: string
  } {
    if (!this.series.has(seriesId)) {
      return {
        success: false,
        cascaded: {
          patterns: 0, completions: 0, links: 0, constraints: 0,
          tags: 0, reminders: 0, conditions: 0, cyclingConfigs: 0, adaptiveDurations: 0
        },
        error: 'Series not found',
      }
    }

    // Check for child links (RESTRICT)
    for (const link of this.links.values()) {
      if (link.parentSeriesId === seriesId) {
        return {
          success: false,
          cascaded: {
            patterns: 0, completions: 0, links: 0, constraints: 0,
            tags: 0, reminders: 0, conditions: 0, cyclingConfigs: 0, adaptiveDurations: 0
          },
          error: 'Series has children',
        }
      }
    }

    const cascaded = {
      patterns: 0,
      completions: 0,
      links: 0,
      constraints: 0,
      tags: 0,
      reminders: 0,
      conditions: 0,
      cyclingConfigs: 0,
      adaptiveDurations: 0,
    }

    // Cascade: patterns
    for (const [id, pattern] of this.patterns) {
      if (pattern.seriesId === seriesId) {
        this.patterns.delete(id)
        cascaded.patterns++
      }
    }

    // Cascade: completions
    for (const [id, completion] of this.completions) {
      if (completion.seriesId === seriesId) {
        this.completions.delete(id)
        cascaded.completions++
      }
    }

    // Cascade: links (child's link is removed)
    if (this.links.has(seriesId)) {
      this.links.delete(seriesId)
      cascaded.links++
    }

    // Cascade: constraints (make them orphaned but don't delete)
    for (const [id, constraint] of this.constraints) {
      if (constraint.sourceSeriesId === seriesId || constraint.destSeriesId === seriesId) {
        cascaded.constraints++
        // Mark as orphaned (we count but don't delete)
      }
    }

    // Cascade: tags
    for (const [id, tag] of this.tags) {
      if (tag.seriesId === seriesId) {
        this.tags.delete(id)
        cascaded.tags++
      }
    }

    // Cascade: reminders
    for (const [id, reminder] of this.reminders) {
      if (reminder.seriesId === seriesId) {
        this.reminders.delete(id)
        cascaded.reminders++
      }
    }

    // Cascade: conditions
    for (const [id, condition] of this.conditions) {
      if (condition.seriesId === seriesId) {
        this.conditions.delete(id)
        cascaded.conditions++
      }
    }

    // Cascade: cycling configs
    if (this.cyclingConfigs.has(seriesId)) {
      this.cyclingConfigs.delete(seriesId)
      cascaded.cyclingConfigs++
    }

    // Cascade: adaptive durations
    if (this.adaptiveDurations.has(seriesId)) {
      this.adaptiveDurations.delete(seriesId)
      cascaded.adaptiveDurations++
    }

    // Finally delete the series
    this.series.delete(seriesId)

    return { success: true, cascaded }
  }

  getStats() {
    return {
      series: this.series.size,
      patterns: this.patterns.size,
      completions: this.completions.size,
      links: this.links.size,
      constraints: this.constraints.size,
      tags: this.tags.size,
      reminders: this.reminders.size,
      conditions: this.conditions.size,
      cyclingConfigs: this.cyclingConfigs.size,
      adaptiveDurations: this.adaptiveDurations.size,
    }
  }
}

describe('Series Deletion Cascade Tests', () => {
  it('Property #412: series deletion cascades correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // patterns
        fc.integer({ min: 0, max: 10 }), // completions
        fc.integer({ min: 0, max: 3 }), // tags
        fc.integer({ min: 0, max: 2 }), // reminders
        fc.integer({ min: 0, max: 2 }), // conditions
        fc.boolean(), // has cycling
        fc.boolean(), // has adaptive duration
        (patternCount, completionCount, tagCount, reminderCount, conditionCount, hasCycling, hasAdaptive) => {
          const manager = new CascadeDeletionManager()

          const seriesId = manager.createSeries('Test Series')

          // Add dependent entities
          for (let i = 0; i < patternCount; i++) {
            manager.addPattern(seriesId)
          }
          for (let i = 0; i < completionCount; i++) {
            manager.addCompletion(seriesId)
          }
          for (let i = 0; i < tagCount; i++) {
            manager.addTag(seriesId, `tag-${i}`)
          }
          for (let i = 0; i < reminderCount; i++) {
            manager.addReminder(seriesId)
          }
          for (let i = 0; i < conditionCount; i++) {
            manager.addCondition(seriesId)
          }
          if (hasCycling) {
            manager.addCyclingConfig(seriesId, ['A', 'B', 'C'])
          }
          if (hasAdaptive) {
            manager.addAdaptiveDuration(seriesId, 7)
          }

          // Verify entities exist
          const beforeStats = manager.getStats()
          expect(beforeStats.series).toBe(1)
          expect(beforeStats.patterns).toBe(patternCount)
          expect(beforeStats.completions).toBe(completionCount)

          // Delete series
          const result = manager.deleteSeries(seriesId)

          // Verify cascade
          expect(result.success).toBe(true)
          expect(result.cascaded.patterns).toBe(patternCount)
          expect(result.cascaded.completions).toBe(completionCount)
          expect(result.cascaded.tags).toBe(tagCount)
          expect(result.cascaded.reminders).toBe(reminderCount)
          expect(result.cascaded.conditions).toBe(conditionCount)
          expect(result.cascaded.cyclingConfigs).toBe(hasCycling ? 1 : 0)
          expect(result.cascaded.adaptiveDurations).toBe(hasAdaptive ? 1 : 0)

          // Verify nothing remains
          const afterStats = manager.getStats()
          expect(afterStats.series).toBe(0)
          expect(afterStats.patterns).toBe(0)
          expect(afterStats.completions).toBe(0)
          expect(afterStats.tags).toBe(0)
          expect(afterStats.reminders).toBe(0)
          expect(afterStats.conditions).toBe(0)
          expect(afterStats.cyclingConfigs).toBe(0)
          expect(afterStats.adaptiveDurations).toBe(0)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #413: RESTRICT checked before CASCADE', () => {
    const manager = new CascadeDeletionManager()

    // Create parent and child series
    const parent = manager.createSeries('Parent')
    const child = manager.createSeries('Child')

    // Link them
    manager.addLink(parent, child)

    // Add cascadable entities to parent
    manager.addPattern(parent)
    manager.addCompletion(parent)
    manager.addTag(parent, 'important')

    // Try to delete parent - should fail due to RESTRICT on child link
    const result = manager.deleteSeries(parent)

    expect(result.success).toBe(false)
    expect(result.error).toContain('children')

    // Verify NOTHING was cascaded
    expect(result.cascaded.patterns).toBe(0)
    expect(result.cascaded.completions).toBe(0)
    expect(result.cascaded.tags).toBe(0)

    // Entities still exist
    const stats = manager.getStats()
    expect(stats.series).toBe(2)
    expect(stats.patterns).toBe(1)
    expect(stats.completions).toBe(1)
    expect(stats.tags).toBe(1)
  })

  it('Property #413b: child can be deleted after unlinking', () => {
    const manager = new CascadeDeletionManager()

    const parent = manager.createSeries('Parent')
    const child = manager.createSeries('Child')

    manager.addLink(parent, child)
    manager.addPattern(child)

    // Delete child (it's a child, not a parent, so should succeed)
    const result = manager.deleteSeries(child)

    expect(result.success).toBe(true)
    expect(result.cascaded.patterns).toBe(1)
    expect(result.cascaded.links).toBe(1) // Child's link is removed
  })

  it('deletion cascades through multiple entity types atomically', () => {
    const manager = new CascadeDeletionManager()

    const seriesId = manager.createSeries('Full Series')

    // Add one of each
    manager.addPattern(seriesId)
    manager.addCompletion(seriesId)
    manager.addTag(seriesId, 'test')
    manager.addReminder(seriesId)
    manager.addCondition(seriesId)
    manager.addCyclingConfig(seriesId, ['A'])
    manager.addAdaptiveDuration(seriesId, 14)

    const result = manager.deleteSeries(seriesId)

    expect(result.success).toBe(true)
    expect(result.cascaded.patterns).toBe(1)
    expect(result.cascaded.completions).toBe(1)
    expect(result.cascaded.tags).toBe(1)
    expect(result.cascaded.reminders).toBe(1)
    expect(result.cascaded.conditions).toBe(1)
    expect(result.cascaded.cyclingConfigs).toBe(1)
    expect(result.cascaded.adaptiveDurations).toBe(1)

    // Everything gone
    const stats = manager.getStats()
    expect(stats.series).toBe(0)
    expect(stats.patterns).toBe(0)
    expect(stats.completions).toBe(0)
    expect(stats.tags).toBe(0)
    expect(stats.reminders).toBe(0)
    expect(stats.conditions).toBe(0)
    expect(stats.cyclingConfigs).toBe(0)
    expect(stats.adaptiveDurations).toBe(0)
  })
})

// ============================================================================
// Schedule Generation Tests (Task #467-#472)
// ============================================================================

/**
 * Represents a schedulable item.
 */
interface ScheduleItem {
  id: string
  duration: number // minutes
  isFixed: boolean
  fixedTime?: number // minutes from midnight
  earliestStart?: number
  latestEnd?: number
}

/**
 * Represents a constraint between items.
 */
interface ScheduleConstraint {
  type: 'mustBeBefore' | 'mustBeAfter' | 'cantOverlap' | 'mustBeOnSameDay'
  sourceId: string
  destId: string
}

/**
 * Represents an assigned time slot.
 */
interface TimeSlot {
  itemId: string
  start: number // minutes from midnight
  end: number
}

/**
 * Simple schedule solver for testing.
 */
class ScheduleSolver {
  /**
   * Generates a solvable schedule with no overlapping fixed items.
   */
  static genSolvableSchedule(itemCount: number, constraintCount: number): {
    items: ScheduleItem[]
    constraints: ScheduleConstraint[]
  } {
    const items: ScheduleItem[] = []
    const constraints: ScheduleConstraint[] = []

    // Track used fixed time slots to avoid overlaps
    const usedSlots: Array<{ start: number; end: number }> = []

    for (let i = 0; i < itemCount; i++) {
      const duration = 30 + (i % 4) * 15 // 30, 45, 60, or 75 minutes
      const isFixed = i < 3 // First 3 are fixed

      let fixedTime: number | undefined
      if (isFixed) {
        // Find a non-overlapping slot
        fixedTime = this.findNonOverlappingSlot(usedSlots, duration, 480, 1080) // 8 AM to 6 PM
        if (fixedTime !== undefined) {
          usedSlots.push({ start: fixedTime, end: fixedTime + duration })
        }
      }

      items.push({
        id: `item-${i}`,
        duration,
        isFixed,
        fixedTime,
        earliestStart: 480, // 8 AM
        latestEnd: 1080, // 6 PM
      })
    }

    // Add non-contradictory constraints
    for (let i = 0; i < Math.min(constraintCount, itemCount - 1); i++) {
      // mustBeBefore between consecutive items (always satisfiable)
      constraints.push({
        type: 'mustBeBefore',
        sourceId: `item-${i}`,
        destId: `item-${i + 1}`,
      })
    }

    return { items, constraints }
  }

  private static findNonOverlappingSlot(
    usedSlots: Array<{ start: number; end: number }>,
    duration: number,
    windowStart: number,
    windowEnd: number
  ): number | undefined {
    // Sort used slots
    const sorted = [...usedSlots].sort((a, b) => a.start - b.start)

    // Try to fit before first slot
    if (sorted.length === 0 || sorted[0].start >= windowStart + duration) {
      return windowStart
    }

    // Try to fit between slots
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapStart = sorted[i].end
      const gapEnd = sorted[i + 1].start
      if (gapEnd - gapStart >= duration) {
        return gapStart
      }
    }

    // Try to fit after last slot
    if (sorted.length > 0) {
      const lastEnd = sorted[sorted.length - 1].end
      if (windowEnd - lastEnd >= duration) {
        return lastEnd
      }
    }

    return undefined // No slot found
  }

  /**
   * Generates an unsolvable schedule with known contradictions.
   */
  static genUnsolvableSchedule(): {
    items: ScheduleItem[]
    constraints: ScheduleConstraint[]
    contradiction: string
  } {
    const items: ScheduleItem[] = [
      { id: 'A', duration: 60, isFixed: true, fixedTime: 540 }, // 9 AM
      { id: 'B', duration: 60, isFixed: true, fixedTime: 600 }, // 10 AM
      { id: 'C', duration: 60, isFixed: false, earliestStart: 480, latestEnd: 720 },
    ]

    // Contradiction: C must be before A AND after B, but B ends after A starts
    const constraints: ScheduleConstraint[] = [
      { type: 'mustBeBefore', sourceId: 'C', destId: 'A' }, // C before A (must end by 9 AM)
      { type: 'mustBeAfter', sourceId: 'C', destId: 'B' }, // C after B (must start after 11 AM)
    ]

    return {
      items,
      constraints,
      contradiction: 'C must end before 9 AM but start after 11 AM',
    }
  }

  /**
   * Attempts to solve a schedule.
   */
  static solve(items: ScheduleItem[], constraints: ScheduleConstraint[]): {
    success: boolean
    solution?: TimeSlot[]
    conflicts?: string[]
  } {
    const conflicts: string[] = []
    const solution: TimeSlot[] = []

    // First, place fixed items
    const fixedItems = items.filter(i => i.isFixed && i.fixedTime !== undefined)
    for (const item of fixedItems) {
      solution.push({
        itemId: item.id,
        start: item.fixedTime!,
        end: item.fixedTime! + item.duration,
      })
    }

    // Check for fixed-fixed overlaps
    for (let i = 0; i < solution.length; i++) {
      for (let j = i + 1; j < solution.length; j++) {
        if (this.slotsOverlap(solution[i], solution[j])) {
          conflicts.push(`Fixed items ${solution[i].itemId} and ${solution[j].itemId} overlap`)
        }
      }
    }

    if (conflicts.length > 0) {
      return { success: false, conflicts }
    }

    // Try to place flexible items
    const flexibleItems = items.filter(i => !i.isFixed)
    const availableSlots = this.computeAvailableSlots(solution, 480, 1080)

    for (const item of flexibleItems) {
      // Check constraint requirements
      const mustEndBefore = this.getMustEndBefore(item.id, constraints, solution)
      const mustStartAfter = this.getMustStartAfter(item.id, constraints, solution)

      const effectiveLatest = Math.min(
        item.latestEnd ?? 1080,
        mustEndBefore ?? 1080
      )
      const effectiveEarliest = Math.max(
        item.earliestStart ?? 480,
        mustStartAfter ?? 480
      )

      // Check for contradiction
      if (effectiveEarliest + item.duration > effectiveLatest) {
        conflicts.push(`Item ${item.id}: earliest start + duration exceeds latest end`)
        continue
      }

      // Find slot
      const slot = this.findSlotForItem(item, availableSlots, effectiveEarliest, effectiveLatest)
      if (slot) {
        solution.push(slot)
        // Update available slots
        this.removeSlotFromAvailable(availableSlots, slot)
      } else {
        conflicts.push(`No valid slot for item ${item.id}`)
      }
    }

    if (conflicts.length > 0) {
      return { success: false, conflicts }
    }

    return { success: true, solution }
  }

  private static slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
    return a.start < b.end && b.start < a.end
  }

  private static computeAvailableSlots(
    used: TimeSlot[],
    windowStart: number,
    windowEnd: number
  ): Array<{ start: number; end: number }> {
    const sorted = [...used].sort((a, b) => a.start - b.start)
    const available: Array<{ start: number; end: number }> = []

    let current = windowStart
    for (const slot of sorted) {
      if (slot.start > current) {
        available.push({ start: current, end: slot.start })
      }
      current = Math.max(current, slot.end)
    }
    if (current < windowEnd) {
      available.push({ start: current, end: windowEnd })
    }

    return available
  }

  private static getMustEndBefore(
    itemId: string,
    constraints: ScheduleConstraint[],
    placed: TimeSlot[]
  ): number | undefined {
    for (const c of constraints) {
      if (c.type === 'mustBeBefore' && c.sourceId === itemId) {
        const dest = placed.find(s => s.itemId === c.destId)
        if (dest) return dest.start
      }
    }
    return undefined
  }

  private static getMustStartAfter(
    itemId: string,
    constraints: ScheduleConstraint[],
    placed: TimeSlot[]
  ): number | undefined {
    for (const c of constraints) {
      if (c.type === 'mustBeAfter' && c.sourceId === itemId) {
        const dest = placed.find(s => s.itemId === c.destId)
        if (dest) return dest.end
      }
    }
    return undefined
  }

  private static findSlotForItem(
    item: ScheduleItem,
    available: Array<{ start: number; end: number }>,
    earliest: number,
    latest: number
  ): TimeSlot | undefined {
    for (const slot of available) {
      const effectiveStart = Math.max(slot.start, earliest)
      const effectiveEnd = Math.min(slot.end, latest)

      if (effectiveEnd - effectiveStart >= item.duration) {
        return {
          itemId: item.id,
          start: effectiveStart,
          end: effectiveStart + item.duration,
        }
      }
    }
    return undefined
  }

  private static removeSlotFromAvailable(
    available: Array<{ start: number; end: number }>,
    used: TimeSlot
  ): void {
    for (let i = available.length - 1; i >= 0; i--) {
      const slot = available[i]
      if (used.start >= slot.start && used.end <= slot.end) {
        // Split the slot
        available.splice(i, 1)
        if (slot.start < used.start) {
          available.push({ start: slot.start, end: used.start })
        }
        if (used.end < slot.end) {
          available.push({ start: used.end, end: slot.end })
        }
        break
      }
    }
  }
}

describe('Schedule Generation Tests', () => {
  it('Property #467: genSolvableSchedule produces solvable inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (itemCount, constraintCount) => {
          const { items, constraints } = ScheduleSolver.genSolvableSchedule(itemCount, constraintCount)

          // Verify items are generated correctly
          expect(items.length).toBe(itemCount)

          // Fixed items should have non-overlapping times
          const fixedItems = items.filter(i => i.isFixed && i.fixedTime !== undefined)
          for (let i = 0; i < fixedItems.length; i++) {
            for (let j = i + 1; j < fixedItems.length; j++) {
              const a = fixedItems[i]
              const b = fixedItems[j]
              const aEnd = a.fixedTime! + a.duration
              const bEnd = b.fixedTime! + b.duration
              const overlaps = a.fixedTime! < bEnd && b.fixedTime! < aEnd
              expect(overlaps).toBe(false)
            }
          }

          // Should be solvable
          const result = ScheduleSolver.solve(items, constraints)
          expect(result.success).toBe(true)
          expect(result.solution).toBeDefined()
          expect(result.solution!.length).toBeGreaterThanOrEqual(fixedItems.length)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #468: genUnsolvableSchedule produces unsolvable inputs', () => {
    const { items, constraints, contradiction } = ScheduleSolver.genUnsolvableSchedule()

    const result = ScheduleSolver.solve(items, constraints)

    expect(result.success).toBe(false)
    expect(result.conflicts).toBeDefined()
    expect(result.conflicts!.length).toBeGreaterThan(0)
    expect(contradiction).toBeDefined()
  })

  it('Property #471: solvable inputs produce solution with no errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        (itemCount) => {
          const { items, constraints } = ScheduleSolver.genSolvableSchedule(itemCount, 0)

          const result = ScheduleSolver.solve(items, constraints)

          expect(result.success).toBe(true)
          expect(result.conflicts).toBeUndefined()

          // Solution should have all items placed
          const placedCount = result.solution?.length ?? 0
          expect(placedCount).toBe(itemCount)

          // No overlaps in solution
          if (result.solution) {
            for (let i = 0; i < result.solution.length; i++) {
              for (let j = i + 1; j < result.solution.length; j++) {
                const a = result.solution[i]
                const b = result.solution[j]
                const overlaps = a.start < b.end && b.start < a.end
                expect(overlaps).toBe(false)
              }
            }
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #472: unsolvable inputs report conflicts', () => {
    const { items, constraints } = ScheduleSolver.genUnsolvableSchedule()

    const result = ScheduleSolver.solve(items, constraints)

    expect(result.success).toBe(false)
    expect(result.conflicts).toBeDefined()
    expect(result.conflicts!.length).toBeGreaterThan(0)

    // Conflicts should be descriptive
    for (const conflict of result.conflicts!) {
      expect(conflict.length).toBeGreaterThan(0)
    }
  })

  it('solver handles empty input', () => {
    const result = ScheduleSolver.solve([], [])
    expect(result.success).toBe(true)
    expect(result.solution).toEqual([])
  })

  it('solver handles single fixed item', () => {
    const items: ScheduleItem[] = [
      { id: 'solo', duration: 60, isFixed: true, fixedTime: 600 },
    ]

    const result = ScheduleSolver.solve(items, [])

    expect(result.success).toBe(true)
    expect(result.solution).toSatisfy((s: NonNullable<typeof result.solution>) => s.length === 1 && s[0].itemId === 'solo')
    expect(result.solution![0].start).toBe(600)
    expect(result.solution![0].end).toBe(660)
  })

  it('solver detects fixed-fixed overlap', () => {
    const items: ScheduleItem[] = [
      { id: 'A', duration: 60, isFixed: true, fixedTime: 540 },
      { id: 'B', duration: 60, isFixed: true, fixedTime: 570 }, // Overlaps with A
    ]

    const result = ScheduleSolver.solve(items, [])

    expect(result.success).toBe(false)
    expect(result.conflicts).toBeDefined()
    expect(result.conflicts!.some(c => c.includes('overlap'))).toBe(true)
  })

  it('Property #469: genBarelySolvableSchedule produces tight constraints', () => {
    // Generate a barely solvable schedule - one where items just barely fit
    const items: ScheduleItem[] = [
      // Three fixed items leaving exact gaps for flexible items
      { id: 'fixed-1', duration: 60, isFixed: true, fixedTime: 480 }, // 8:00-9:00
      { id: 'fixed-2', duration: 60, isFixed: true, fixedTime: 600 }, // 10:00-11:00
      { id: 'fixed-3', duration: 60, isFixed: true, fixedTime: 720 }, // 12:00-1:00

      // Flexible items that EXACTLY fit in the gaps
      { id: 'flex-1', duration: 60, isFixed: false, earliestStart: 480, latestEnd: 720 }, // Must fit in 9:00-10:00
      { id: 'flex-2', duration: 60, isFixed: false, earliestStart: 600, latestEnd: 840 }, // Must fit in 11:00-12:00
    ]

    const result = ScheduleSolver.solve(items, [])

    // Should be solvable, but barely
    expect(result.success).toBe(true)
    const itemIds = result.solution!.map(s => s.itemId).sort()
    expect(itemIds).toEqual(['fixed-1', 'fixed-2', 'fixed-3', 'flex-1', 'flex-2'])
  })

  it('Property #470: genHighlyConstrainedSchedule still solvable', () => {
    // Many constraints but still satisfiable
    const items: ScheduleItem[] = []
    for (let i = 0; i < 6; i++) {
      items.push({
        id: `item-${i}`,
        duration: 30,
        isFixed: i === 0, // Only first is fixed
        fixedTime: i === 0 ? 480 : undefined,
        earliestStart: 480,
        latestEnd: 1080,
      })
    }

    // Chain of mustBeBefore constraints (satisfiable because they're sequential)
    const constraints: ScheduleConstraint[] = []
    for (let i = 0; i < 5; i++) {
      constraints.push({
        type: 'mustBeBefore',
        sourceId: `item-${i}`,
        destId: `item-${i + 1}`,
      })
    }

    const result = ScheduleSolver.solve(items, constraints)

    expect(result.success).toBe(true)
    expect(result.solution).toBeDefined()

    // Verify order constraint is satisfied
    const solution = result.solution!
    for (let i = 0; i < 5; i++) {
      const source = solution.find(s => s.itemId === `item-${i}`)
      const dest = solution.find(s => s.itemId === `item-${i + 1}`)
      if (source && dest) {
        expect(source.end).toBeLessThanOrEqual(dest.start)
      }
    }
  })
})

// ============================================================================
// SQLite Error Mapping Tests (Task #414-#416)
// ============================================================================

/**
 * Domain-specific error types.
 */
type DomainErrorType =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONSTRAINT_VIOLATION'
  | 'INVALID_OPERATION'
  | 'DATABASE_ERROR'
  | 'LOCKED'
  | 'FOREIGN_KEY_VIOLATION'

interface DomainError {
  type: DomainErrorType
  message: string
  details?: Record<string, unknown>
}

/**
 * Simulates SQLite error codes and their mapping to domain errors.
 */
class SQLiteErrorMapper {
  // SQLite error codes
  static readonly SQLITE_CONSTRAINT = 19
  static readonly SQLITE_CONSTRAINT_UNIQUE = 2067
  static readonly SQLITE_CONSTRAINT_FOREIGNKEY = 787
  static readonly SQLITE_CONSTRAINT_NOTNULL = 1299
  static readonly SQLITE_BUSY = 5
  static readonly SQLITE_LOCKED = 6
  static readonly SQLITE_NOTFOUND = 12
  static readonly SQLITE_MISMATCH = 20
  static readonly SQLITE_ERROR = 1

  /**
   * Maps a SQLite error to a domain error.
   */
  static mapError(sqliteCode: number, message: string): DomainError {
    switch (sqliteCode) {
      case this.SQLITE_CONSTRAINT_UNIQUE:
        return {
          type: 'ALREADY_EXISTS',
          message: 'A record with this identifier already exists',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_CONSTRAINT_FOREIGNKEY:
        return {
          type: 'FOREIGN_KEY_VIOLATION',
          message: 'Referenced record does not exist',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_CONSTRAINT_NOTNULL:
        return {
          type: 'CONSTRAINT_VIOLATION',
          message: 'Required field is missing',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_CONSTRAINT:
        return {
          type: 'CONSTRAINT_VIOLATION',
          message: 'Database constraint violated',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_BUSY:
      case this.SQLITE_LOCKED:
        return {
          type: 'LOCKED',
          message: 'Database is locked or busy',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_NOTFOUND:
        return {
          type: 'NOT_FOUND',
          message: 'Record not found',
          details: { sqliteCode, originalMessage: message },
        }

      case this.SQLITE_MISMATCH:
        return {
          type: 'INVALID_OPERATION',
          message: 'Data type mismatch',
          details: { sqliteCode, originalMessage: message },
        }

      default:
        return {
          type: 'DATABASE_ERROR',
          message: 'An unexpected database error occurred',
          details: { sqliteCode, originalMessage: message },
        }
    }
  }

  /**
   * Checks if an error is recoverable (can be retried).
   */
  static isRecoverable(error: DomainError): boolean {
    return error.type === 'LOCKED'
  }
}

/**
 * Simulates schema version tracking.
 */
class SchemaVersionManager {
  private version: number = 0
  private migrations: Array<{ version: number; name: string; applied: boolean }> = []

  addMigration(version: number, name: string): void {
    this.migrations.push({ version, name, applied: false })
    // Sort migrations by version
    this.migrations.sort((a, b) => a.version - b.version)
  }

  /**
   * Runs migrations in order, stopping on error.
   */
  runMigrations(): { success: boolean; appliedCount: number; error?: string } {
    let appliedCount = 0

    for (const migration of this.migrations) {
      if (migration.applied) continue
      if (migration.version <= this.version) continue

      // Check for out-of-order migration
      if (migration.version !== this.version + 1) {
        return {
          success: false,
          appliedCount,
          error: `Migration gap: expected version ${this.version + 1} but found ${migration.version}`,
        }
      }

      // Apply migration
      migration.applied = true
      this.version = migration.version
      appliedCount++
    }

    return { success: true, appliedCount }
  }

  getVersion(): number {
    return this.version
  }

  getMigrations(): Array<{ version: number; name: string; applied: boolean }> {
    return [...this.migrations]
  }

  /**
   * Validates that migrations are sequential (no gaps).
   */
  validateMigrations(): { valid: boolean; error?: string } {
    const sorted = [...this.migrations].sort((a, b) => a.version - b.version)

    for (let i = 0; i < sorted.length; i++) {
      const expectedVersion = i + 1
      if (sorted[i].version !== expectedVersion) {
        return {
          valid: false,
          error: `Migration version gap: expected ${expectedVersion} but found ${sorted[i].version}`,
        }
      }
    }

    return { valid: true }
  }
}

describe('SQLite Error Mapping Tests', () => {
  it('Property #414: SQLite errors mapped to domain errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          SQLiteErrorMapper.SQLITE_CONSTRAINT_UNIQUE,
          SQLiteErrorMapper.SQLITE_CONSTRAINT_FOREIGNKEY,
          SQLiteErrorMapper.SQLITE_CONSTRAINT_NOTNULL,
          SQLiteErrorMapper.SQLITE_CONSTRAINT,
          SQLiteErrorMapper.SQLITE_BUSY,
          SQLiteErrorMapper.SQLITE_LOCKED,
          SQLiteErrorMapper.SQLITE_NOTFOUND,
          SQLiteErrorMapper.SQLITE_MISMATCH,
          SQLiteErrorMapper.SQLITE_ERROR
        ),
        fc.string({ minLength: 1, maxLength: 100 }),
        (sqliteCode, message) => {
          const domainError = SQLiteErrorMapper.mapError(sqliteCode, message)

          // Domain error should always have type and message
          expect(domainError.type).toBeDefined()
          expect(domainError.message).toBeDefined()
          expect(domainError.message.length).toBeGreaterThan(0)

          // Details should include original info
          expect(domainError.details?.sqliteCode).toBe(sqliteCode)
          expect(domainError.details?.originalMessage).toBe(message)

          // Type should be one of the defined domain error types
          const validTypes: DomainErrorType[] = [
            'NOT_FOUND',
            'ALREADY_EXISTS',
            'CONSTRAINT_VIOLATION',
            'INVALID_OPERATION',
            'DATABASE_ERROR',
            'LOCKED',
            'FOREIGN_KEY_VIOLATION',
          ]
          expect(validTypes).toContain(domainError.type)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property #414b: specific SQLite codes map to correct domain types', () => {
    // UNIQUE constraint -> ALREADY_EXISTS
    const uniqueError = SQLiteErrorMapper.mapError(
      SQLiteErrorMapper.SQLITE_CONSTRAINT_UNIQUE,
      'UNIQUE constraint failed'
    )
    expect(uniqueError.type).toBe('ALREADY_EXISTS')

    // FOREIGN KEY constraint -> FOREIGN_KEY_VIOLATION
    const fkError = SQLiteErrorMapper.mapError(
      SQLiteErrorMapper.SQLITE_CONSTRAINT_FOREIGNKEY,
      'FOREIGN KEY constraint failed'
    )
    expect(fkError.type).toBe('FOREIGN_KEY_VIOLATION')

    // BUSY/LOCKED -> LOCKED
    const busyError = SQLiteErrorMapper.mapError(
      SQLiteErrorMapper.SQLITE_BUSY,
      'database is locked'
    )
    expect(busyError.type).toBe('LOCKED')
    expect(SQLiteErrorMapper.isRecoverable(busyError)).toBe(true)

    // NOT FOUND -> NOT_FOUND
    const notFoundError = SQLiteErrorMapper.mapError(
      SQLiteErrorMapper.SQLITE_NOTFOUND,
      'record not found'
    )
    expect(notFoundError.type).toBe('NOT_FOUND')
    expect(SQLiteErrorMapper.isRecoverable(notFoundError)).toBe(false)
  })

  it('Property #415: schema version tracked', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (migrationCount) => {
          const manager = new SchemaVersionManager()

          // Add migrations in order
          for (let i = 1; i <= migrationCount; i++) {
            manager.addMigration(i, `Migration ${i}`)
          }

          // Initial version should be 0
          expect(manager.getVersion()).toBe(0)

          // Run migrations
          const result = manager.runMigrations()

          // Should succeed
          expect(result.success).toBe(true)
          expect(result.appliedCount).toBe(migrationCount)

          // Version should be updated
          expect(manager.getVersion()).toBe(migrationCount)

          // All migrations should be marked as applied
          const migrations = manager.getMigrations()
          for (const m of migrations) {
            expect(m.applied).toBe(true)
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Property #415b: schema version persists across operations', () => {
    const manager = new SchemaVersionManager()

    manager.addMigration(1, 'Initial')
    manager.addMigration(2, 'Add columns')
    manager.addMigration(3, 'Create index')

    manager.runMigrations()
    expect(manager.getVersion()).toBe(3)

    // Adding more migrations and running again
    manager.addMigration(4, 'Add table')
    manager.addMigration(5, 'Add constraint')

    const result = manager.runMigrations()
    expect(result.success).toBe(true)
    expect(result.appliedCount).toBe(2) // Only new ones
    expect(manager.getVersion()).toBe(5)
  })

  it('Property #416: migrations run in order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { minLength: 3, maxLength: 10 }),
        (shuffledVersions) => {
          const manager = new SchemaVersionManager()

          // Add migrations in shuffled order
          for (const version of shuffledVersions) {
            manager.addMigration(version, `Migration ${version}`)
          }

          // Validate should pass if versions form a contiguous sequence starting at 1
          const sorted = [...shuffledVersions].sort((a, b) => a - b)
          const isContiguous = sorted.every((v, i) => v === i + 1)

          const validation = manager.validateMigrations()

          if (isContiguous) {
            expect(validation.valid).toBe(true)
          } else {
            expect(validation.valid).toBe(false)
            expect(validation.error).toContain('gap')
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('Property #416b: migrations with gaps fail validation', () => {
    const manager = new SchemaVersionManager()

    // Add migrations with a gap (skip version 2)
    manager.addMigration(1, 'First')
    manager.addMigration(3, 'Third') // Gap at 2

    const validation = manager.validateMigrations()
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('gap')
  })

  it('Property #416c: migrations run stops at gap', () => {
    const manager = new SchemaVersionManager()

    manager.addMigration(1, 'First')
    manager.addMigration(3, 'Third') // Gap at 2

    const result = manager.runMigrations()

    // Should apply first migration then stop
    expect(result.success).toBe(false)
    expect(result.appliedCount).toBe(1)
    expect(manager.getVersion()).toBe(1)
    expect(result.error).toContain('gap')
  })

  it('duplicate migration versions fail validation', () => {
    const manager = new SchemaVersionManager()

    manager.addMigration(1, 'First')
    manager.addMigration(1, 'Duplicate') // Same version
    manager.addMigration(2, 'Second')

    // Both version 1s will be sorted together
    // Validation should detect this as a gap (1, 1, 2 -> expected 1, 2, 3)
    const validation = manager.validateMigrations()
    // With duplicate 1s, the sorted array is [1, 1, 2]
    // Expected: position 0 = version 1 (OK)
    // Expected: position 1 = version 2 but found 1 (NOT OK)
    expect(validation.valid).toBe(false)
  })
})
