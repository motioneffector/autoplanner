/**
 * Tests for domain generators (conditions, series, constraints, completions).
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  // Conditions
  targetGen,
  tagTargetGen,
  seriesTargetGen,
  comparisonOperatorGen,
  countConditionGen,
  daysSinceConditionGen,
  leafConditionGen,
  andConditionGen,
  orConditionGen,
  notConditionGen,
  conditionGen,
  boundaryConditionGen,
  // Series
  seriesBoundsGen,
  wiggleConfigGen,
  reminderGen,
  cyclingConfigGen,
  adaptiveDurationGen,
  minimalSeriesGen,
  fullSeriesGen,
  seriesWithConditionsGen,
  chainableSeriesGen,
  linkGen,
  linkBoundaryGen,
  seriesGen,
  // Constraints
  constraintTypeGen,
  relationalConstraintGen,
  relationalConstraintValidGen,
  boundaryConstraintGen,
  solvableConstraintSetGen,
  // Completions
  completionGen,
  completionValidGen,
  boundaryCompletionGen,
  completionsForSeriesGen,
} from './index'
import { parseLocalDate, parseLocalTime, isValidDate, isValidTime, parseLocalDateTime } from '../lib/utils'

const VALID_COMPARISON_OPS = ['<', '<=', '=', '>=', '>']
const VALID_CONSTRAINT_TYPES = ['mustBeOnSameDay', 'cantBeOnSameDay', 'mustBeNextTo', 'cantBeNextTo', 'mustBeBefore', 'mustBeAfter', 'mustBeWithin']
const VALID_CONDITION_TYPES = ['count', 'daysSince', 'and', 'or', 'not']

describe('condition generators', () => {
  describe('targetGen', () => {
    it('generates targets with tag or seriesId or both', () => {
      fc.assert(
        fc.property(targetGen(), (target) => {
          // At least one of tag or seriesId should be present
          expect(target.tag !== undefined || target.seriesId !== undefined).toBe(true)
        })
      )
    })
  })

  describe('tagTargetGen', () => {
    it('generates targets with only tag', () => {
      fc.assert(
        fc.property(tagTargetGen(), (target) => {
          expect(target.tag).toBeDefined()
          expect(target.seriesId).toBeUndefined()
        })
      )
    })
  })

  describe('seriesTargetGen', () => {
    it('generates targets with only seriesId', () => {
      fc.assert(
        fc.property(seriesTargetGen(), (target) => {
          expect(target.seriesId).toBeDefined()
          expect(target.tag).toBeUndefined()
        })
      )
    })
  })

  describe('comparisonOperatorGen', () => {
    it('generates valid comparison operators', () => {
      fc.assert(
        fc.property(comparisonOperatorGen(), (op) => {
          expect(VALID_COMPARISON_OPS).toContain(op)
        })
      )
    })
  })

  describe('countConditionGen', () => {
    it('generates count conditions with valid fields', () => {
      fc.assert(
        fc.property(countConditionGen(), (condition) => {
          expect(condition.type).toBe('count')
          expect(condition.threshold).toBeGreaterThanOrEqual(0)
          expect(condition.windowDays).toBeGreaterThanOrEqual(1)
          expect(VALID_COMPARISON_OPS).toContain(condition.comparison)
        })
      )
    })
  })

  describe('daysSinceConditionGen', () => {
    it('generates daysSince conditions with valid fields', () => {
      fc.assert(
        fc.property(daysSinceConditionGen(), (condition) => {
          expect(condition.type).toBe('daysSince')
          expect(condition.threshold).toBeGreaterThanOrEqual(0)
          expect(VALID_COMPARISON_OPS).toContain(condition.comparison)
        })
      )
    })
  })

  describe('leafConditionGen', () => {
    it('generates only leaf conditions (count or daysSince)', () => {
      fc.assert(
        fc.property(leafConditionGen(), (condition) => {
          expect(['count', 'daysSince']).toContain(condition.type)
        })
      )
    })
  })

  describe('andConditionGen', () => {
    it('generates AND conditions', () => {
      fc.assert(
        fc.property(andConditionGen(), (condition) => {
          expect(condition.type).toBe('and')
          expect(Array.isArray(condition.conditions)).toBe(true)
        })
      )
    })
  })

  describe('orConditionGen', () => {
    it('generates OR conditions', () => {
      fc.assert(
        fc.property(orConditionGen(), (condition) => {
          expect(condition.type).toBe('or')
          expect(Array.isArray(condition.conditions)).toBe(true)
        })
      )
    })
  })

  describe('notConditionGen', () => {
    it('generates NOT conditions', () => {
      fc.assert(
        fc.property(notConditionGen(), (condition) => {
          expect(condition.type).toBe('not')
          expect(condition.condition).toBeDefined()
        })
      )
    })
  })

  describe('conditionGen', () => {
    it('generates all condition types', () => {
      const types = new Set<string>()
      const samples = fc.sample(conditionGen(), 500)
      samples.forEach((c) => types.add(c.type))

      VALID_CONDITION_TYPES.forEach((type) => {
        expect(types).toContain(type)
      })
    })
  })

  describe('boundaryConditionGen', () => {
    it('generates valid boundary conditions', () => {
      fc.assert(
        fc.property(boundaryConditionGen(), (condition) => {
          expect(VALID_CONDITION_TYPES).toContain(condition.type)
        }),
        { numRuns: 200 }
      )
    })
  })
})

describe('series component generators', () => {
  describe('seriesBoundsGen', () => {
    it('generates valid series bounds', () => {
      fc.assert(
        fc.property(seriesBoundsGen(), (bounds) => {
          const start = parseLocalDate(bounds.startDate)
          expect(isValidDate(start.year, start.month, start.day)).toBe(true)

          if (bounds.endDate) {
            const end = parseLocalDate(bounds.endDate)
            expect(isValidDate(end.year, end.month, end.day)).toBe(true)
            // End should be >= start
            expect(bounds.endDate >= bounds.startDate).toBe(true)
          }
        })
      )
    })

    it('always has end date when configured', () => {
      fc.assert(
        fc.property(seriesBoundsGen({ hasEndDate: true }), (bounds) => {
          expect(bounds.endDate).toBeDefined()
        })
      )
    })

    it('never has end date when configured', () => {
      fc.assert(
        fc.property(seriesBoundsGen({ hasEndDate: false }), (bounds) => {
          expect(bounds.endDate).toBeUndefined()
        })
      )
    })
  })

  describe('wiggleConfigGen', () => {
    it('generates valid wiggle configs', () => {
      fc.assert(
        fc.property(wiggleConfigGen(), (wiggle) => {
          expect(wiggle.daysBefore).toBeGreaterThanOrEqual(0)
          expect(wiggle.daysAfter).toBeGreaterThanOrEqual(0)

          if (wiggle.timeWindow) {
            const earliest = parseLocalTime(wiggle.timeWindow.earliest)
            const latest = parseLocalTime(wiggle.timeWindow.latest)
            expect(isValidTime(earliest.hours, earliest.minutes)).toBe(true)
            expect(isValidTime(latest.hours, latest.minutes)).toBe(true)
            expect(wiggle.timeWindow.earliest <= wiggle.timeWindow.latest).toBe(true)
          }
        })
      )
    })
  })

  describe('reminderGen', () => {
    it('generates valid reminders', () => {
      fc.assert(
        fc.property(reminderGen(), (reminder) => {
          expect(reminder.minutesBefore).toBeGreaterThanOrEqual(0)
          expect(reminder.tag.length).toBeGreaterThanOrEqual(1)
        })
      )
    })
  })

  describe('cyclingConfigGen', () => {
    it('generates valid cycling configs', () => {
      fc.assert(
        fc.property(cyclingConfigGen(), (cycling) => {
          expect(cycling.items.length).toBeGreaterThanOrEqual(1)
          expect(['sequential', 'random']).toContain(cycling.mode)
          expect(typeof cycling.gapLeap).toBe('boolean')
          expect(cycling.currentIndex).toBeGreaterThanOrEqual(0)
          expect(cycling.currentIndex).toBeLessThan(cycling.items.length)
        })
      )
    })
  })

  describe('adaptiveDurationGen', () => {
    it('generates valid adaptive duration configs', () => {
      fc.assert(
        fc.property(adaptiveDurationGen(), (adaptive) => {
          expect(['lastN', 'windowDays']).toContain(adaptive.mode)
          expect(adaptive.value).toBeGreaterThanOrEqual(1)
          expect(adaptive.multiplier).toBeGreaterThanOrEqual(0.5)
          expect(adaptive.fallback).toBeGreaterThanOrEqual(1)
        })
      )
    })
  })
})

describe('series generators', () => {
  describe('minimalSeriesGen', () => {
    it('generates minimal series with required fields', () => {
      fc.assert(
        fc.property(minimalSeriesGen(), (series) => {
          expect(series.id).toMatch(/^series-/)
          expect(series.title.length).toBeGreaterThanOrEqual(1)
          expect(series.patterns.length).toBeGreaterThanOrEqual(1)
          expect(series.duration).toBeGreaterThanOrEqual(1)
          expect(series.tags).toEqual([])
          expect(series.locked).toBe(false)
        })
      )
    })
  })

  describe('fullSeriesGen', () => {
    it('generates full series with all fields', () => {
      fc.assert(
        fc.property(fullSeriesGen(), (series) => {
          expect(series.id).toMatch(/^series-/)
          expect(series.title.length).toBeGreaterThanOrEqual(1)
          expect(series.patterns.length).toBeGreaterThanOrEqual(1)
          // Fixed items should not have wiggle
          if (series.fixed) {
            expect(series.wiggle).toBeUndefined()
          }
        })
      )
    })
  })

  describe('seriesWithConditionsGen', () => {
    it('generates series with associated conditions', () => {
      fc.assert(
        fc.property(seriesWithConditionsGen(), ({ series, conditions }) => {
          expect(series.patterns.length).toBeGreaterThanOrEqual(1)
          // Each pattern with a conditionId should have a matching condition
          series.patterns.forEach((p) => {
            if (p.conditionId) {
              expect(conditions.has(p.conditionId)).toBe(true)
            }
          })
        })
      )
    })
  })

  describe('chainableSeriesGen', () => {
    it('generates series suitable for chains', () => {
      fc.assert(
        fc.property(chainableSeriesGen(), (series) => {
          // Chains require timed events
          expect(series.timeOfDay).toBeDefined()
          // Chains typically use flexible items
          expect(series.fixed).toBe(false)
          // Should have daily pattern for predictability
          expect(series.patterns[0].pattern.type).toBe('daily')
        })
      )
    })
  })

  describe('seriesGen', () => {
    it('generates valid series', () => {
      fc.assert(
        fc.property(seriesGen(), (series) => {
          expect(series.id).toMatch(/^series-/)
          expect(series.patterns.length).toBeGreaterThanOrEqual(1)
        })
      )
    })
  })
})

describe('link generators', () => {
  describe('linkGen', () => {
    it('generates valid links', () => {
      fc.assert(
        fc.property(linkGen(), (link) => {
          expect(link.parentSeriesId).toMatch(/^series-/)
          expect(link.childSeriesId).toMatch(/^series-/)
          expect(link.parentSeriesId).not.toBe(link.childSeriesId)
          expect(link.targetDistance).toBeGreaterThanOrEqual(0)
          expect(link.earlyWobble).toBeGreaterThanOrEqual(0)
          expect(link.lateWobble).toBeGreaterThanOrEqual(0)
        })
      )
    })
  })

  describe('linkBoundaryGen', () => {
    it('generates valid boundary links', () => {
      fc.assert(
        fc.property(linkBoundaryGen(), (link) => {
          expect(link.parentSeriesId).not.toBe(link.childSeriesId)
          expect(link.targetDistance).toBeGreaterThanOrEqual(0)
        }),
        { numRuns: 100 }
      )
    })
  })
})

describe('constraint generators', () => {
  describe('constraintTypeGen', () => {
    it('generates valid constraint types', () => {
      fc.assert(
        fc.property(constraintTypeGen(), (type) => {
          expect(VALID_CONSTRAINT_TYPES).toContain(type)
        })
      )
    })
  })

  describe('relationalConstraintGen', () => {
    it('generates valid relational constraints', () => {
      fc.assert(
        fc.property(relationalConstraintGen(), (constraint) => {
          expect(constraint.id).toMatch(/^constraint-/)
          expect(VALID_CONSTRAINT_TYPES).toContain(constraint.type)
          // withinMinutes required iff type = mustBeWithin
          if (constraint.type === 'mustBeWithin') {
            expect(constraint.withinMinutes).toBeDefined()
            expect(constraint.withinMinutes).toBeGreaterThanOrEqual(1)
          } else {
            expect(constraint.withinMinutes).toBeUndefined()
          }
        })
      )
    })
  })

  describe('relationalConstraintValidGen', () => {
    it('generates semantically valid constraints', () => {
      fc.assert(
        fc.property(relationalConstraintValidGen(), (constraint) => {
          expect(VALID_CONSTRAINT_TYPES).toContain(constraint.type)
          if (constraint.type === 'mustBeWithin') {
            expect(constraint.withinMinutes).toBeGreaterThanOrEqual(5)
          }
        })
      )
    })
  })

  describe('boundaryConstraintGen', () => {
    it('generates valid boundary constraints', () => {
      fc.assert(
        fc.property(boundaryConstraintGen(), (constraint) => {
          expect(VALID_CONSTRAINT_TYPES).toContain(constraint.type)
        }),
        { numRuns: 200 }
      )
    })
  })

  describe('solvableConstraintSetGen', () => {
    it('generates sets of non-conflicting constraints', () => {
      fc.assert(
        fc.property(solvableConstraintSetGen(), (constraints) => {
          expect(Array.isArray(constraints)).toBe(true)
          // All constraints should be valid
          constraints.forEach((c) => {
            expect(VALID_CONSTRAINT_TYPES).toContain(c.type)
          })
        })
      )
    })
  })
})

describe('completion generators', () => {
  describe('completionGen', () => {
    it('generates valid completions', () => {
      fc.assert(
        fc.property(completionGen(), (completion) => {
          expect(completion.id).toMatch(/^completion-/)
          expect(completion.seriesId).toMatch(/^series-/)
          expect(completion.actualDuration).toBeGreaterThanOrEqual(1)
        })
      )
    })
  })

  describe('completionValidGen', () => {
    it('generates completions with valid time ordering', () => {
      fc.assert(
        fc.property(completionValidGen(), (completion) => {
          // endTime >= startTime
          expect(completion.endTime >= completion.startTime).toBe(true)

          // Parse and validate times
          const start = parseLocalDateTime(completion.startTime)
          const end = parseLocalDateTime(completion.endTime)
          expect(isValidDate(start.year, start.month, start.day)).toBe(true)
          expect(isValidTime(start.hours, start.minutes)).toBe(true)
          expect(isValidDate(end.year, end.month, end.day)).toBe(true)
          expect(isValidTime(end.hours, end.minutes)).toBe(true)
        })
      )
    })
  })

  describe('boundaryCompletionGen', () => {
    it('generates valid boundary completions', () => {
      fc.assert(
        fc.property(boundaryCompletionGen(), (completion) => {
          expect(completion.id).toMatch(/^completion-/)
          expect(completion.actualDuration).toBeGreaterThanOrEqual(1)
        }),
        { numRuns: 200 }
      )
    })
  })

  describe('completionsForSeriesGen', () => {
    it('generates completions all for the same series', () => {
      fc.assert(
        fc.property(completionsForSeriesGen(), ({ seriesId, completions }) => {
          completions.forEach((c) => {
            expect(c.seriesId).toBe(seriesId)
          })
        })
      )
    })
  })
})
