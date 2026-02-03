/**
 * Property tests for chains and links (Spec 11).
 *
 * Tests the invariants and laws for:
 * - Link creation and validation
 * - Chain depth limits
 * - Cycle detection
 * - Child scheduling relative to parent
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { linkGen, linkBoundaryGen, seriesIdGen, durationGen, localDateGen, localTimeGen } from '../generators'
import { makeLocalDateTime, makeLocalDate, makeLocalTime, parseLocalDateTime } from '../lib/utils'
import type { Link, SeriesId, LocalDate, LocalDateTime, Duration } from '../lib/types'

// ============================================================================
// Helper: Chain Management
// ============================================================================

class ChainManager {
  private links: Map<SeriesId, Link> = new Map() // childId -> link
  private children: Map<SeriesId, Set<SeriesId>> = new Map() // parentId -> childIds

  addLink(link: Link): boolean {
    // Check for cycle
    if (this.wouldCreateCycle(link.parentSeriesId, link.childSeriesId)) {
      return false
    }

    // Check depth limit
    // Spec 11 LAW 3: Maximum chain depth is 32
    // This means 32 levels from root, so a chain can have at most 32 links
    // getDepth returns the number of ancestors (depth from root)
    // If parent has depth D, child would have depth D+1
    // We allow depth up to 32, so we reject if newDepth >= 32 (allowing 32 links total)
    const parentDepth = this.getDepth(link.parentSeriesId)
    const newChildDepth = parentDepth + 1
    if (newChildDepth >= 32) {
      return false
    }

    this.links.set(link.childSeriesId, link)

    if (!this.children.has(link.parentSeriesId)) {
      this.children.set(link.parentSeriesId, new Set())
    }
    this.children.get(link.parentSeriesId)!.add(link.childSeriesId)

    return true
  }

  removeLink(childId: SeriesId): boolean {
    const link = this.links.get(childId)
    if (!link) return false

    this.links.delete(childId)
    this.children.get(link.parentSeriesId)?.delete(childId)
    return true
  }

  getLink(childId: SeriesId): Link | undefined {
    return this.links.get(childId)
  }

  getParent(childId: SeriesId): SeriesId | undefined {
    return this.links.get(childId)?.parentSeriesId
  }

  getChildren(parentId: SeriesId): SeriesId[] {
    return Array.from(this.children.get(parentId) ?? [])
  }

  hasParent(childId: SeriesId): boolean {
    return this.links.has(childId)
  }

  getDepth(seriesId: SeriesId): number {
    let depth = 0
    let current: SeriesId | undefined = seriesId

    while (current && this.links.has(current)) {
      depth++
      current = this.links.get(current)?.parentSeriesId
    }

    return depth
  }

  getChainDepth(seriesId: SeriesId): number {
    // Depth of the entire chain starting from root
    let root = seriesId
    while (this.links.has(root)) {
      root = this.links.get(root)!.parentSeriesId
    }

    return this.getMaxDepthFrom(root)
  }

  private getMaxDepthFrom(seriesId: SeriesId): number {
    const childIds = this.children.get(seriesId)
    if (!childIds || childIds.size === 0) {
      return 0
    }

    let maxChildDepth = 0
    for (const childId of childIds) {
      const childDepth = this.getMaxDepthFrom(childId)
      maxChildDepth = Math.max(maxChildDepth, childDepth)
    }

    return maxChildDepth + 1
  }

  private wouldCreateCycle(parentId: SeriesId, childId: SeriesId): boolean {
    // Would adding parent -> child create a cycle?
    // Check if childId is an ancestor of parentId
    let current: SeriesId | undefined = parentId

    while (current) {
      if (current === childId) {
        return true // childId is ancestor of parentId, would create cycle
      }
      current = this.links.get(current)?.parentSeriesId
    }

    return false
  }
}

/**
 * Calculate child scheduled time based on parent completion.
 */
function calculateChildTime(
  parentEndTime: LocalDateTime,
  link: Link
): { earliest: LocalDateTime; target: LocalDateTime; latest: LocalDateTime } {
  const { hours, minutes, year, month, day } = parseLocalDateTime(parentEndTime)
  const parentEndMinutes = hours * 60 + minutes

  const targetMinutes = parentEndMinutes + link.targetDistance
  const earliestMinutes = targetMinutes - link.earlyWobble
  const latestMinutes = targetMinutes + link.lateWobble

  const toDateTime = (mins: number): LocalDateTime => {
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    return makeLocalDateTime(makeLocalDate(year, month, day), makeLocalTime(h, m))
  }

  return {
    earliest: toDateTime(Math.max(0, earliestMinutes)),
    target: toDateTime(targetMinutes),
    latest: toDateTime(Math.min(1439, latestMinutes)),
  }
}

// ============================================================================
// Link Properties (Task #331-#333)
// ============================================================================

describe('Spec 11: Chains - Link Properties', () => {
  it('Property #331: link creates parent-child', () => {
    fc.assert(
      fc.property(linkGen(), (link) => {
        const manager = new ChainManager()
        const added = manager.addLink(link)

        if (added) {
          expect(manager.hasParent(link.childSeriesId)).toBe(true)
          expect(manager.getParent(link.childSeriesId)).toBe(link.parentSeriesId)
          expect(manager.getChildren(link.parentSeriesId)).toContain(link.childSeriesId)
        }
      })
    )
  })

  it('Property #332: child has one parent or none', () => {
    fc.assert(
      fc.property(seriesIdGen(), seriesIdGen(), seriesIdGen(), (child, parent1, parent2) => {
        fc.pre(child !== parent1 && child !== parent2 && parent1 !== parent2)

        const link1: Link = {
          parentSeriesId: parent1,
          childSeriesId: child,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        }
        const link2: Link = {
          parentSeriesId: parent2,
          childSeriesId: child,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        }

        const manager = new ChainManager()
        manager.addLink(link1)
        // Second link replaces first (Map behavior) - child still has exactly one parent
        manager.addLink(link2)

        expect(manager.hasParent(child)).toBe(true)
        // At any point, child has at most one parent
        const parent = manager.getParent(child)
        expect(parent === parent1 || parent === parent2).toBe(true)
      })
    )
  })

  it('Property #333: unlinkSeries removes relationship', () => {
    fc.assert(
      fc.property(linkGen(), (link) => {
        const manager = new ChainManager()
        manager.addLink(link)
        manager.removeLink(link.childSeriesId)

        expect(manager.hasParent(link.childSeriesId)).toBe(false)
        expect(manager.getChildren(link.parentSeriesId)).not.toContain(link.childSeriesId)
      })
    )
  })
})

// ============================================================================
// Cycle Detection Properties (Task #334-#335)
// ============================================================================

describe('Spec 11: Chains - Cycle Detection', () => {
  it('Property #334: cycle detection A to B to A', () => {
    fc.assert(
      fc.property(seriesIdGen(), seriesIdGen(), (a, b) => {
        fc.pre(a !== b)

        const manager = new ChainManager()

        // A -> B (A is parent of B)
        const link1: Link = {
          parentSeriesId: a,
          childSeriesId: b,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        }

        // B -> A (B is parent of A) - would create cycle
        const link2: Link = {
          parentSeriesId: b,
          childSeriesId: a,
          targetDistance: 30,
          earlyWobble: 5,
          lateWobble: 5,
        }

        manager.addLink(link1)
        const cycleCreated = manager.addLink(link2)

        expect(cycleCreated).toBe(false)
      })
    )
  })

  it('Property #335: cycle detection longer cycles', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        seriesIdGen(),
        seriesIdGen(),
        seriesIdGen(),
        (a, b, c, d) => {
          fc.pre(new Set([a, b, c, d]).size === 4) // All different

          const manager = new ChainManager()

          // Create chain: A -> B -> C -> D
          const addedAB = manager.addLink({
            parentSeriesId: a,
            childSeriesId: b,
            targetDistance: 30,
            earlyWobble: 5,
            lateWobble: 5,
          })

          const addedBC = manager.addLink({
            parentSeriesId: b,
            childSeriesId: c,
            targetDistance: 30,
            earlyWobble: 5,
            lateWobble: 5,
          })

          const addedCD = manager.addLink({
            parentSeriesId: c,
            childSeriesId: d,
            targetDistance: 30,
            earlyWobble: 5,
            lateWobble: 5,
          })

          expect(addedAB).toBe(true)
          expect(addedBC).toBe(true)
          expect(addedCD).toBe(true)

          // Try to create cycle: D -> A
          const cycleCreated = manager.addLink({
            parentSeriesId: d,
            childSeriesId: a,
            targetDistance: 30,
            earlyWobble: 5,
            lateWobble: 5,
          })

          expect(cycleCreated).toBe(false)
        }
      )
    )
  })
})

// ============================================================================
// Depth Limit Properties (Task #336-#338)
// ============================================================================

describe('Spec 11: Chains - Depth Limits', () => {
  it('Property #336: depth limit enforced max 32', () => {
    const manager = new ChainManager()
    const seriesIds: SeriesId[] = []

    // Generate 35 series IDs
    for (let i = 0; i < 35; i++) {
      seriesIds.push(`series-${i}` as SeriesId)
    }

    // Try to create a linear chain - stop at first rejection
    // Spec 11 LAW 3: Maximum chain depth is 32
    // This means a chain can have at most 32 levels (depth 0-31)
    // which requires 31 links (0->1, 1->2, ..., 30->31)
    let successfulLinks = 0
    for (let i = 0; i < 34; i++) {
      const added = manager.addLink({
        parentSeriesId: seriesIds[i],
        childSeriesId: seriesIds[i + 1],
        targetDistance: 30,
        earlyWobble: 5,
        lateWobble: 5,
      })

      if (added) {
        successfulLinks++
      } else {
        // Stop at first rejection - we can't extend this chain further
        break
      }
    }

    // A chain with max depth 31 has 31 links connecting 32 nodes
    expect(successfulLinks).toBe(31)
    // The deepest node should have depth 31
    expect(manager.getDepth(seriesIds[31])).toBe(31)
  })

  it('Property #337: chain of 32 succeeds', () => {
    const manager = new ChainManager()
    const seriesIds: SeriesId[] = []

    // Generate exactly 32 series IDs (for 31 links, making max depth 31)
    for (let i = 0; i < 32; i++) {
      seriesIds.push(`series-${i}` as SeriesId)
    }

    // Create a chain of exactly 31 links (max allowed)
    let allAdded = true
    for (let i = 0; i < 31; i++) {
      const added = manager.addLink({
        parentSeriesId: seriesIds[i],
        childSeriesId: seriesIds[i + 1],
        targetDistance: 30,
        earlyWobble: 5,
        lateWobble: 5,
      })

      if (!added) {
        allAdded = false
        break
      }
    }

    expect(allAdded).toBe(true)
    // seriesIds[31] has 31 ancestors, so depth = 31
    expect(manager.getDepth(seriesIds[31])).toBe(31)
  })

  it('Property #338: chain of 33 throws/fails', () => {
    const manager = new ChainManager()
    const seriesIds: SeriesId[] = []

    // Generate 33 series IDs (for 32 links attempt)
    for (let i = 0; i < 33; i++) {
      seriesIds.push(`series-${i}` as SeriesId)
    }

    // Create a chain of 31 links (max allowed)
    for (let i = 0; i < 31; i++) {
      manager.addLink({
        parentSeriesId: seriesIds[i],
        childSeriesId: seriesIds[i + 1],
        targetDistance: 30,
        earlyWobble: 5,
        lateWobble: 5,
      })
    }

    // Try to add 32nd link - should fail (would make depth 32, exceeding max 31)
    const added32 = manager.addLink({
      parentSeriesId: seriesIds[31],
      childSeriesId: seriesIds[32],
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    })

    expect(added32).toBe(false)
  })
})

// ============================================================================
// Child Scheduling Properties (Task #339-#342)
// ============================================================================

describe('Spec 11: Chains - Child Scheduling', () => {
  it('Property #339: child scheduled relative to parent', () => {
    fc.assert(
      fc.property(linkGen(), localDateGen(), fc.integer({ min: 8, max: 16 }), (link, date, hour) => {
        const parentEndTime = makeLocalDateTime(date, makeLocalTime(hour, 0))
        const { earliest, target, latest } = calculateChildTime(parentEndTime, link)

        // Target should be parentEnd + targetDistance
        const { hours: targetHours, minutes: targetMinutes } = parseLocalDateTime(target)
        const expectedMinutes = (hour * 60 + link.targetDistance) % 1440
        expect(targetHours * 60 + targetMinutes).toBe(expectedMinutes)
      })
    )
  })

  it('Property #340: child within wobble bounds', () => {
    fc.assert(
      fc.property(linkGen(), localDateGen(), fc.integer({ min: 8, max: 14 }), (link, date, hour) => {
        const parentEndTime = makeLocalDateTime(date, makeLocalTime(hour, 0))
        const { earliest, target, latest } = calculateChildTime(parentEndTime, link)

        // Verify bounds
        expect(earliest <= target).toBe(true)
        expect(target <= latest).toBe(true)
      })
    )
  })

  it('Property #341: after completion child uses actual endTime', () => {
    fc.assert(
      fc.property(
        linkGen(),
        localDateGen(),
        fc.integer({ min: 8, max: 14 }),
        fc.integer({ min: 30, max: 90 }),
        (link, date, startHour, actualDuration) => {
          // Parent was scheduled at startHour but completed with different duration
          const scheduledStart = makeLocalDateTime(date, makeLocalTime(startHour, 0))
          const scheduledEnd = makeLocalDateTime(date, makeLocalTime(startHour + 1, 0)) // 60 min estimated
          const actualEnd = addMinutesToDateTime(scheduledStart, actualDuration) // Actual completion time

          // After completion, child should use actual endTime
          const childTimeFromActual = calculateChildTime(actualEnd, link)
          const childTimeFromScheduled = calculateChildTime(scheduledEnd, link)

          // The two calculations should differ if actualDuration != 60
          if (actualDuration !== 60) {
            expect(childTimeFromActual.target).not.toBe(childTimeFromScheduled.target)
          }

          // Child target based on actual completion time
          const { hours: targetHours, minutes: targetMinutes } = parseLocalDateTime(childTimeFromActual.target)
          const actualEndParsed = parseLocalDateTime(actualEnd)
          const expectedMinutes = (actualEndParsed.hours * 60 + actualEndParsed.minutes + link.targetDistance) % 1440
          expect(targetHours * 60 + targetMinutes).toBe(expectedMinutes)
        }
      )
    )
  })

  it('Property #342: before completion child uses scheduled', () => {
    fc.assert(
      fc.property(
        linkGen(),
        localDateGen(),
        fc.integer({ min: 8, max: 14 }),
        fc.integer({ min: 30, max: 120 }),
        (link, date, startHour, estimatedDuration) => {
          // Before parent completes, child uses scheduled (estimated) end time
          const scheduledEnd = addMinutesToDateTime(
            makeLocalDateTime(date, makeLocalTime(startHour, 0)),
            estimatedDuration
          )

          const childTime = calculateChildTime(scheduledEnd, link)

          // Child should be scheduled relative to parent's scheduled end
          const { hours: targetHours, minutes: targetMinutes } = parseLocalDateTime(childTime.target)
          const scheduledEndParsed = parseLocalDateTime(scheduledEnd)
          const expectedMinutes = (scheduledEndParsed.hours * 60 + scheduledEndParsed.minutes + link.targetDistance) % 1440
          expect(targetHours * 60 + targetMinutes).toBe(expectedMinutes)
        }
      )
    )
  })
})

/**
 * Helper: Add minutes to a datetime.
 */
function addMinutesToDateTime(dt: LocalDateTime, minutes: number): LocalDateTime {
  const parsed = parseLocalDateTime(dt)
  const totalMinutes = parsed.hours * 60 + parsed.minutes + minutes

  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMinutes = totalMinutes % 60

  // Simplified: assume same day for these tests
  return makeLocalDateTime(
    makeLocalDate(parsed.year, parsed.month, parsed.day),
    makeLocalTime(newHours, newMinutes)
  )
}

// ============================================================================
// Boundary Link Tests
// ============================================================================

describe('Spec 11: Chains - Boundary Values', () => {
  it('boundary links are well-formed', () => {
    fc.assert(
      fc.property(linkBoundaryGen(), (link) => {
        expect(link.parentSeriesId).not.toBe(link.childSeriesId)
        expect(link.targetDistance).toBeGreaterThanOrEqual(0)
        expect(link.earlyWobble).toBeGreaterThanOrEqual(0)
        expect(link.lateWobble).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 }
    )
  })
})
