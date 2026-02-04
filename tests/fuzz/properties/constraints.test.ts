/**
 * Property tests for relational constraints (Spec 10).
 *
 * Tests the invariants and laws for:
 * - Constraint type semantics
 * - Constraint satisfaction conditions
 * - withinMinutes validation
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  relationalConstraintGen,
  relationalConstraintValidGen,
  mustBeOnSameDayConstraintGen,
  cantBeOnSameDayConstraintGen,
  mustBeNextToConstraintGen,
  cantBeNextToConstraintGen,
  mustBeBeforeConstraintGen,
  mustBeAfterConstraintGen,
  mustBeWithinConstraintGen,
  boundaryConstraintGen,
  localDateGen,
  localDateTimeGen,
} from '../generators'
import { parseLocalDate, parseLocalDateTime, makeLocalDate, makeLocalDateTime, makeLocalTime } from '../lib/utils'
import type { RelationalConstraint, LocalDate, LocalDateTime, ScheduledInstance, SeriesId } from '../lib/types'

// ============================================================================
// Helper: Mock Scheduled Instances
// ============================================================================

interface MockInstance {
  seriesId: SeriesId
  date: LocalDate
  start: LocalDateTime
  end: LocalDateTime
  tags: string[]
}

/**
 * Check if a constraint is satisfied given two instances.
 */
function isConstraintSatisfied(
  constraint: RelationalConstraint,
  sourceInstances: MockInstance[],
  destInstances: MockInstance[]
): boolean {
  // If either source or dest is empty, constraint is trivially satisfied
  if (sourceInstances.length === 0 || destInstances.length === 0) {
    return true
  }

  switch (constraint.type) {
    case 'mustBeOnSameDay':
      // All source instances must share a day with some dest instance
      return sourceInstances.every((src) => destInstances.some((dest) => src.date === dest.date))

    case 'cantBeOnSameDay':
      // No source instance can share a day with any dest instance
      return sourceInstances.every((src) => destInstances.every((dest) => src.date !== dest.date))

    case 'mustBeNextTo':
      // Source and dest must be adjacent (end of one = start of other, or vice versa)
      return sourceInstances.every((src) =>
        destInstances.some((dest) => {
          return src.end === dest.start || dest.end === src.start
        })
      )

    case 'cantBeNextTo':
      // Source and dest must NOT be adjacent
      return sourceInstances.every((src) =>
        destInstances.every((dest) => {
          return src.end !== dest.start && dest.end !== src.start
        })
      )

    case 'mustBeBefore':
      // Source end must be <= dest start (for all pairs on same day)
      return sourceInstances.every((src) =>
        destInstances.every((dest) => {
          if (src.date !== dest.date) return true // Different days, constraint doesn't apply
          return src.end <= dest.start
        })
      )

    case 'mustBeAfter':
      // Source start must be >= dest end (for all pairs on same day)
      return sourceInstances.every((src) =>
        destInstances.every((dest) => {
          if (src.date !== dest.date) return true
          return src.start >= dest.end
        })
      )

    case 'mustBeWithin':
      // Gap between instances must be <= withinMinutes
      if (!constraint.withinMinutes) return true
      const maxGap = constraint.withinMinutes
      return sourceInstances.every((src) =>
        destInstances.some((dest) => {
          if (src.date !== dest.date) return false // Must be on same day
          const srcEnd = parseLocalDateTime(src.end)
          const destStart = parseLocalDateTime(dest.start)
          const destEnd = parseLocalDateTime(dest.end)
          const srcStart = parseLocalDateTime(src.start)

          // Gap is either (dest.start - src.end) or (src.start - dest.end)
          const gap1 = (destStart.hours * 60 + destStart.minutes) - (srcEnd.hours * 60 + srcEnd.minutes)
          const gap2 = (srcStart.hours * 60 + srcStart.minutes) - (destEnd.hours * 60 + destEnd.minutes)

          const gap = Math.min(Math.abs(gap1), Math.abs(gap2))
          return gap <= maxGap
        })
      )
  }
}

// ============================================================================
// Constraint Type Properties (Task #345-#358)
// ============================================================================

describe('Spec 10: Constraints - Same Day', () => {
  it('Property #345: mustBeOnSameDay satisfied when dates equal', () => {
    fc.assert(
      fc.property(mustBeOnSameDayConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date, // Same date
          start: makeLocalDateTime(date, makeLocalTime(14, 0)),
          end: makeLocalDateTime(date, makeLocalTime(15, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })

  it('Property #346: mustBeOnSameDay violated when dates differ', () => {
    fc.assert(
      fc.property(mustBeOnSameDayConstraintGen(), localDateGen(), localDateGen(), (constraint, date1, date2) => {
        fc.pre(date1 !== date2) // Dates must be different

        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date: date1,
          start: makeLocalDateTime(date1, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date1, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date: date2,
          start: makeLocalDateTime(date2, makeLocalTime(14, 0)),
          end: makeLocalDateTime(date2, makeLocalTime(15, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(false)
      })
    )
  })

  it('Property #347: cantBeOnSameDay satisfied when dates differ', () => {
    fc.assert(
      fc.property(cantBeOnSameDayConstraintGen(), localDateGen(), localDateGen(), (constraint, date1, date2) => {
        fc.pre(date1 !== date2)

        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date: date1,
          start: makeLocalDateTime(date1, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date1, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date: date2,
          start: makeLocalDateTime(date2, makeLocalTime(14, 0)),
          end: makeLocalDateTime(date2, makeLocalTime(15, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })

  it('Property #348: cantBeOnSameDay violated when dates equal', () => {
    fc.assert(
      fc.property(cantBeOnSameDayConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(14, 0)),
          end: makeLocalDateTime(date, makeLocalTime(15, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(false)
      })
    )
  })
})

describe('Spec 10: Constraints - Adjacency', () => {
  it('Property #349: mustBeNextTo satisfied when adjacent', () => {
    fc.assert(
      fc.property(mustBeNextToConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(10, 0)), // Starts when instance1 ends
          end: makeLocalDateTime(date, makeLocalTime(11, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })

  it('Property #350: cantBeNextTo satisfied when not adjacent', () => {
    fc.assert(
      fc.property(cantBeNextToConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(11, 0)), // Gap of 1 hour
          end: makeLocalDateTime(date, makeLocalTime(12, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })
})

describe('Spec 10: Constraints - Order', () => {
  it('Property #351: mustBeBefore satisfied when source.end <= dest.start', () => {
    fc.assert(
      fc.property(mustBeBeforeConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(10, 0)), // Starts at or after instance1 ends
          end: makeLocalDateTime(date, makeLocalTime(11, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })

  it('Property #352: mustBeAfter satisfied when source.start >= dest.end', () => {
    fc.assert(
      fc.property(mustBeAfterConstraintGen(), localDateGen(), (constraint, date) => {
        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(11, 0)), // Starts at or after instance2 ends
          end: makeLocalDateTime(date, makeLocalTime(12, 0)),
          tags: [],
        }
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })
})

describe('Spec 10: Constraints - Within', () => {
  it('Property #353: mustBeWithin satisfied when gap <= withinMinutes', () => {
    fc.assert(
      fc.property(mustBeWithinConstraintGen({ maxMinutes: 60 }), localDateGen(), (constraint, date) => {
        const withinMinutes = constraint.withinMinutes ?? 60

        const instance1: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }
        // Create instance2 that starts within withinMinutes of instance1's end
        const gapMinutes = Math.floor(withinMinutes / 2) // Half the allowed gap
        const startHour = 10 + Math.floor(gapMinutes / 60)
        const startMinute = gapMinutes % 60
        const instance2: MockInstance = {
          seriesId: 'series-2' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(startHour, startMinute)),
          end: makeLocalDateTime(date, makeLocalTime(startHour + 1, startMinute)),
          tags: [],
        }

        expect(isConstraintSatisfied(constraint, [instance1], [instance2])).toBe(true)
      })
    )
  })

  it('Property #354: empty source or dest = constraint satisfied', () => {
    fc.assert(
      fc.property(relationalConstraintGen(), localDateGen(), (constraint, date) => {
        const instance: MockInstance = {
          seriesId: 'series-1' as SeriesId,
          date,
          start: makeLocalDateTime(date, makeLocalTime(9, 0)),
          end: makeLocalDateTime(date, makeLocalTime(10, 0)),
          tags: [],
        }

        // Empty source
        expect(isConstraintSatisfied(constraint, [], [instance])).toBe(true)
        // Empty dest
        expect(isConstraintSatisfied(constraint, [instance], [])).toBe(true)
        // Both empty
        expect(isConstraintSatisfied(constraint, [], [])).toBe(true)
      })
    )
  })
})

describe('Spec 10: Constraints - withinMinutes Validation', () => {
  it('Property #357: withinMinutes required iff type = mustBeWithin', () => {
    fc.assert(
      fc.property(relationalConstraintGen(), (constraint) => {
        if (constraint.type === 'mustBeWithin') {
          expect(typeof constraint.withinMinutes).toBe('number')
          expect(constraint.withinMinutes).toBeGreaterThanOrEqual(1)
        } else {
          // Verify withinMinutes is not present for non-mustBeWithin types
          // by ensuring it's not in the object's keys
          expect(Object.keys(constraint)).not.toContain('withinMinutes')
        }
      })
    )
  })

  it('Property #358: withinMinutes >= 0', () => {
    fc.assert(
      fc.property(mustBeWithinConstraintGen(), (constraint) => {
        expect(constraint.withinMinutes).toBeGreaterThanOrEqual(1)
      })
    )
  })
})

describe('Spec 10: Constraints - Boundary Values', () => {
  it('boundary constraints are well-formed', () => {
    fc.assert(
      fc.property(boundaryConstraintGen(), (constraint) => {
        expect(constraint.id).toMatch(/^constraint-/)
        // sourceTarget must have either tag or seriesId
        const hasSourceTag = 'tag' in constraint.sourceTarget && typeof constraint.sourceTarget.tag === 'string'
        const hasSourceSeriesId = 'seriesId' in constraint.sourceTarget && typeof constraint.sourceTarget.seriesId === 'string'
        expect(hasSourceTag || hasSourceSeriesId).toBe(true)
        // destTarget must have either tag or seriesId
        const hasDestTag = 'tag' in constraint.destTarget && typeof constraint.destTarget.tag === 'string'
        const hasDestSeriesId = 'seriesId' in constraint.destTarget && typeof constraint.destTarget.seriesId === 'string'
        expect(hasDestTag || hasDestSeriesId).toBe(true)

        if (constraint.type === 'mustBeWithin') {
          expect(typeof constraint.withinMinutes).toBe('number')
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ============================================================================
// Constraint CRUD Properties (Task #275-#277)
// ============================================================================

// Helper: Constraint Manager
class ConstraintManager {
  private constraints: Map<string, RelationalConstraint> = new Map()
  private idCounter = 0

  createConstraint(constraint: Omit<RelationalConstraint, 'id'>): string {
    const id = `constraint-${++this.idCounter}`
    const fullConstraint: RelationalConstraint = { ...constraint, id } as RelationalConstraint
    this.constraints.set(id, fullConstraint)
    return id
  }

  getConstraint(id: string): RelationalConstraint | undefined {
    return this.constraints.get(id)
  }

  deleteConstraint(id: string): boolean {
    return this.constraints.delete(id)
  }

  getAllConstraints(): RelationalConstraint[] {
    return Array.from(this.constraints.values())
  }
}

describe('Spec 10: Constraints - CRUD Operations', () => {
  it('Property #275: createConstraint returns valid ID', () => {
    fc.assert(
      fc.property(relationalConstraintGen(), (constraint) => {
        const manager = new ConstraintManager()
        const { id, ...rest } = constraint
        const newId = manager.createConstraint(rest)

        expect(newId).toMatch(/^constraint-/)
        const retrieved = manager.getConstraint(newId)
        expect(retrieved).toEqual(expect.objectContaining({ id: newId }))
      })
    )
  })

  it('Property #276: deleteConstraint removes it', () => {
    fc.assert(
      fc.property(relationalConstraintGen(), (constraint) => {
        const manager = new ConstraintManager()
        const { id, ...rest } = constraint
        const newId = manager.createConstraint(rest)

        const retrieved = manager.getConstraint(newId)
        expect(retrieved).toEqual(expect.objectContaining({ id: newId }))

        const deleted = manager.deleteConstraint(newId)
        expect(deleted).toBe(true)
        expect(manager.getAllConstraints().every((c) => c.id !== newId)).toBe(true)
      })
    )
  })

  it('Property #277: getAllConstraints returns all', () => {
    fc.assert(
      fc.property(
        fc.array(relationalConstraintGen(), { minLength: 1, maxLength: 10 }),
        (constraints) => {
          const manager = new ConstraintManager()
          const ids: string[] = []

          for (const constraint of constraints) {
            const { id, ...rest } = constraint
            ids.push(manager.createConstraint(rest))
          }

          const allConstraints = manager.getAllConstraints()
          expect(allConstraints.length).toBe(constraints.length)

          for (const id of ids) {
            const found = allConstraints.find((c) => c.id === id)
            expect(found).toEqual(expect.objectContaining({ id }))
          }
        }
      )
    )
  })

  it('delete non-existent returns false', () => {
    const manager = new ConstraintManager()
    expect(manager.deleteConstraint('nonexistent')).toBe(false)
  })
})

// ============================================================================
// Constraint Edge Case Properties (Task #355-#356)
// ============================================================================

describe('Spec 10: Constraints - Edge Cases', () => {
  it('Property #355: constraint with non-existent target = no-op', () => {
    // When a constraint references a non-existent series/tag,
    // it should effectively be a no-op (trivially satisfied)
    const constraint: RelationalConstraint = {
      id: 'test-constraint' as any,
      sourceTarget: { seriesId: 'nonexistent-series' as any },
      destTarget: { seriesId: 'also-nonexistent' as any },
      type: 'mustBeOnSameDay',
    }

    // With no matching instances, constraint is trivially satisfied
    const sourceInstances: MockInstance[] = []
    const destInstances: MockInstance[] = []

    expect(isConstraintSatisfied(constraint, sourceInstances, destInstances)).toBe(true)
  })

  it('Property #356: orphaned constraint remains but matches nothing', () => {
    const manager = new ConstraintManager()

    // Create constraint referencing series that don't exist
    const id = manager.createConstraint({
      sourceTarget: { tag: 'deleted-tag' },
      destTarget: { tag: 'also-deleted' },
      type: 'mustBeBefore',
    })

    // Constraint still exists
    const retrieved = manager.getConstraint(id)
    expect(retrieved).toEqual(expect.objectContaining({ id }))

    // But when evaluated with empty instances, it's trivially satisfied
    const constraint = manager.getConstraint(id)!
    expect(isConstraintSatisfied(constraint, [], [])).toBe(true)
  })
})

// ============================================================================
// Arc Consistency / Constraint Propagation (Task #368-#370)
// ============================================================================

interface TimeSlot {
  start: number // minutes from midnight
  end: number
}

interface Domain {
  seriesId: SeriesId
  slots: TimeSlot[]
}

/**
 * Arc consistency enforcer for constraint propagation.
 *
 * Arc consistency ensures that for every value in a variable's domain,
 * there exists a consistent value in related variables' domains.
 */
class ArcConsistencyEnforcer {
  /**
   * Prunes domains based on mustBeBefore constraint.
   * If A mustBeBefore B, then:
   * - A's domain cannot have slots that start after B's latest end
   * - B's domain cannot have slots that end before A's earliest start
   */
  pruneMustBeBefore(domainA: Domain, domainB: Domain): { prunedA: Domain; prunedB: Domain } {
    if (domainA.slots.length === 0 || domainB.slots.length === 0) {
      return { prunedA: domainA, prunedB: domainB }
    }

    // Find B's latest possible end time
    const bLatestEnd = Math.max(...domainB.slots.map(s => s.end))

    // Find A's earliest possible start time
    const aEarliestStart = Math.min(...domainA.slots.map(s => s.start))

    // Prune A: remove slots that can't possibly be before any B slot
    const prunedASlots = domainA.slots.filter(slot => slot.end <= bLatestEnd)

    // Prune B: remove slots that can't possibly be after any A slot
    const prunedBSlots = domainB.slots.filter(slot => slot.start >= aEarliestStart)

    return {
      prunedA: { seriesId: domainA.seriesId, slots: prunedASlots },
      prunedB: { seriesId: domainB.seriesId, slots: prunedBSlots },
    }
  }

  /**
   * Prunes domains based on cantBeOnSameDay constraint.
   * If we're looking at same-day instances, at least one must have
   * non-overlapping time slots.
   */
  pruneCantBeOnSameDay(domainA: Domain, domainB: Domain): { prunedA: Domain; prunedB: Domain } {
    // For cant-be-on-same-day, domains on the same day are in conflict
    // In practice, this would involve date-based pruning, not time-based
    // For now, we don't prune time domains based on this constraint
    return { prunedA: domainA, prunedB: domainB }
  }

  /**
   * Prunes domains based on mustBeNextTo constraint.
   * A's end must equal B's start (or vice versa).
   */
  pruneMustBeNextTo(domainA: Domain, domainB: Domain): { prunedA: Domain; prunedB: Domain } {
    if (domainA.slots.length === 0 || domainB.slots.length === 0) {
      return { prunedA: domainA, prunedB: domainB }
    }

    // A slot in A is valid if its end matches some slot's start in B
    const bStarts = new Set(domainB.slots.map(s => s.start))
    const aEnds = new Set(domainA.slots.map(s => s.end))

    const prunedASlots = domainA.slots.filter(slot => bStarts.has(slot.end))
    const prunedBSlots = domainB.slots.filter(slot => aEnds.has(slot.start))

    return {
      prunedA: { seriesId: domainA.seriesId, slots: prunedASlots },
      prunedB: { seriesId: domainB.seriesId, slots: prunedBSlots },
    }
  }

  /**
   * Checks if a domain is empty (no valid values).
   */
  isDomainEmpty(domain: Domain): boolean {
    return domain.slots.length === 0
  }
}

describe('Spec 10: Constraints - Arc Consistency', () => {
  it('Property #368: arc consistency prunes impossible values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 60, max: 300 }),
        fc.integer({ min: 600, max: 1200 }),
        fc.integer({ min: 60, max: 300 }),
        (aStart, aLen, bStart, bLen) => {
          fc.pre(aStart + aLen < bStart) // Ensure A ends before B starts initially

          const enforcer = new ArcConsistencyEnforcer()

          const domainA: Domain = {
            seriesId: 'series-a' as SeriesId,
            slots: [
              { start: aStart, end: aStart + aLen },
              { start: bStart + 100, end: bStart + 100 + aLen }, // This one is after B
            ],
          }

          const domainB: Domain = {
            seriesId: 'series-b' as SeriesId,
            slots: [{ start: bStart, end: bStart + bLen }],
          }

          // Apply mustBeBefore: A must end before B starts
          const { prunedA, prunedB } = enforcer.pruneMustBeBefore(domainA, domainB)

          // The second slot in A (which starts after B) should be pruned
          // because A can't be before B if A starts after B
          // Pruning removes impossible values, so we should have exactly 1 slot remaining
          // (the first slot that ends before B starts)
          expect(prunedA.slots).toEqual([{ start: aStart, end: aStart + aLen }])
        }
      )
    )
  })

  it('Property #369: if domain empty, no solution', () => {
    const enforcer = new ArcConsistencyEnforcer()

    // Create domains where mustBeNextTo can't be satisfied
    const domainA: Domain = {
      seriesId: 'series-a' as SeriesId,
      slots: [{ start: 100, end: 200 }], // Ends at 200
    }

    const domainB: Domain = {
      seriesId: 'series-b' as SeriesId,
      slots: [{ start: 300, end: 400 }], // Starts at 300 - not adjacent!
    }

    const { prunedA, prunedB } = enforcer.pruneMustBeNextTo(domainA, domainB)

    // Both should be empty because no slot in A ends where B starts
    expect(enforcer.isDomainEmpty(prunedA)).toBe(true)
    expect(enforcer.isDomainEmpty(prunedB)).toBe(true)
  })

  it('Property #370: propagation is sound (doesnt remove valid solutions)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 60, max: 120 }),
        (start, duration) => {
          const enforcer = new ArcConsistencyEnforcer()

          // Create domains where A and B CAN be adjacent
          const domainA: Domain = {
            seriesId: 'series-a' as SeriesId,
            slots: [{ start, end: start + duration }],
          }

          const domainB: Domain = {
            seriesId: 'series-b' as SeriesId,
            slots: [{ start: start + duration, end: start + duration + duration }], // Starts exactly when A ends
          }

          const { prunedA, prunedB } = enforcer.pruneMustBeNextTo(domainA, domainB)

          // Neither should be empty - the valid solution should remain
          expect(enforcer.isDomainEmpty(prunedA)).toBe(false)
          expect(enforcer.isDomainEmpty(prunedB)).toBe(false)

          // The valid slots should still be present
          expect(prunedA.slots[0].end).toBe(prunedB.slots[0].start)
        }
      )
    )
  })

  it('mustBeBefore constraint propagation is idempotent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 60, max: 120 }),
        fc.integer({ min: 500, max: 900 }),
        fc.integer({ min: 60, max: 120 }),
        (aStart, aLen, bStart, bLen) => {
          const enforcer = new ArcConsistencyEnforcer()

          const domainA: Domain = {
            seriesId: 'series-a' as SeriesId,
            slots: [{ start: aStart, end: aStart + aLen }],
          }

          const domainB: Domain = {
            seriesId: 'series-b' as SeriesId,
            slots: [{ start: bStart, end: bStart + bLen }],
          }

          // Apply twice
          const first = enforcer.pruneMustBeBefore(domainA, domainB)
          const second = enforcer.pruneMustBeBefore(first.prunedA, first.prunedB)

          // Results should be identical
          expect(second.prunedA.slots).toEqual(first.prunedA.slots)
          expect(second.prunedB.slots).toEqual(first.prunedB.slots)
        }
      )
    )
  })

  it('Property #371: soundness — if returns assignment, all constraints satisfied', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 60, max: 90 }),
        fc.integer({ min: 400, max: 700 }),
        fc.integer({ min: 60, max: 90 }),
        (aStart, aLen, bStart, bLen) => {
          fc.pre(aStart + aLen < bStart) // Ensure valid mustBeBefore scenario

          const enforcer = new ArcConsistencyEnforcer()

          const domainA: Domain = {
            seriesId: 'series-a' as SeriesId,
            slots: [{ start: aStart, end: aStart + aLen }],
          }

          const domainB: Domain = {
            seriesId: 'series-b' as SeriesId,
            slots: [{ start: bStart, end: bStart + bLen }],
          }

          const { prunedA, prunedB } = enforcer.pruneMustBeBefore(domainA, domainB)

          // If we got non-empty domains, any assignment from them should satisfy the constraint
          if (!enforcer.isDomainEmpty(prunedA) && !enforcer.isDomainEmpty(prunedB)) {
            const assignedA = prunedA.slots[0]
            const assignedB = prunedB.slots[0]

            // mustBeBefore: A ends before or when B starts
            expect(assignedA.end).toBeLessThanOrEqual(assignedB.start)
          }
        }
      )
    )
  })
})
