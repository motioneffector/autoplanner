/**
 * Property tests for adaptive duration (Spec 6).
 *
 * Tests the invariants and laws for:
 * - Duration history calculations
 * - Multiplier application
 * - Window-based averaging
 * - Fallback behavior
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { adaptiveDurationGen, seriesIdGen, durationGen, localDateGen } from '../generators'
import { parseLocalDate, makeLocalDate, makeLocalDateTime, makeLocalTime } from '../lib/utils'
import type { AdaptiveDuration, SeriesId, Duration, LocalDate, Completion } from '../lib/types'

// ============================================================================
// Helper: Adaptive Duration Calculator
// ============================================================================

interface DurationRecord {
  date: LocalDate
  duration: Duration
}

class AdaptiveDurationCalculator {
  private history: Map<SeriesId, DurationRecord[]> = new Map()
  private configs: Map<SeriesId, AdaptiveDuration> = new Map()
  private fallbackDuration: Map<SeriesId, Duration> = new Map()

  setConfig(seriesId: SeriesId, config: AdaptiveDuration, fallback: Duration): void {
    this.configs.set(seriesId, config)
    this.fallbackDuration.set(seriesId, fallback)
    if (!this.history.has(seriesId)) {
      this.history.set(seriesId, [])
    }
  }

  addCompletion(seriesId: SeriesId, date: LocalDate, duration: Duration): void {
    if (!this.history.has(seriesId)) {
      this.history.set(seriesId, [])
    }
    this.history.get(seriesId)!.push({ date, duration })
  }

  getHistory(seriesId: SeriesId): DurationRecord[] {
    return this.history.get(seriesId) ?? []
  }

  calculateDuration(seriesId: SeriesId, referenceDate: LocalDate): Duration {
    const config = this.configs.get(seriesId)
    const fallback = this.fallbackDuration.get(seriesId) ?? (60 as Duration)

    if (!config) {
      return fallback
    }

    const records = this.getRecentRecords(seriesId, referenceDate, config.windowDays)

    if (records.length === 0) {
      return fallback
    }

    // Calculate average based on config
    let average: number

    if (config.lastN !== undefined && records.length > config.lastN) {
      // Use only last N records
      const lastN = records.slice(-config.lastN)
      average = lastN.reduce((sum, r) => sum + r.duration, 0) / lastN.length
    } else {
      // Use all records in window
      average = records.reduce((sum, r) => sum + r.duration, 0) / records.length
    }

    // Apply multiplier
    const adjusted = average * config.multiplier

    // Apply ceiling
    return Math.ceil(adjusted) as Duration
  }

  private getRecentRecords(seriesId: SeriesId, referenceDate: LocalDate, windowDays: number): DurationRecord[] {
    const allRecords = this.history.get(seriesId) ?? []
    const refParsed = parseLocalDate(referenceDate)
    const refMs = new Date(refParsed.year, refParsed.month - 1, refParsed.day).getTime()

    return allRecords
      .filter((r) => {
        const rParsed = parseLocalDate(r.date)
        const rMs = new Date(rParsed.year, rParsed.month - 1, rParsed.day).getTime()
        const daysDiff = Math.floor((refMs - rMs) / (1000 * 60 * 60 * 24))
        return daysDiff >= 0 && daysDiff < windowDays
      })
      .sort((a, b) => {
        const aParsed = parseLocalDate(a.date)
        const bParsed = parseLocalDate(b.date)
        return new Date(aParsed.year, aParsed.month - 1, aParsed.day).getTime() -
               new Date(bParsed.year, bParsed.month - 1, bParsed.day).getTime()
      })
  }
}

// ============================================================================
// Adaptive Duration Properties (Task #308-#313)
// ============================================================================

describe('Spec 6: Adaptive Duration - Fallback', () => {
  it('Property #308: no history returns fallback', () => {
    fc.assert(
      fc.property(seriesIdGen(), adaptiveDurationGen(), durationGen(), localDateGen(), (seriesId, config, fallback, date) => {
        const calc = new AdaptiveDurationCalculator()
        calc.setConfig(seriesId, config, fallback)

        // No history added
        const result = calc.calculateDuration(seriesId, date)
        expect(result).toBe(fallback)
      })
    )
  })

  it('unconfigured series returns default fallback', () => {
    fc.assert(
      fc.property(seriesIdGen(), localDateGen(), (seriesId, date) => {
        const calc = new AdaptiveDurationCalculator()
        // Not configured at all
        const result = calc.calculateDuration(seriesId, date)
        expect(result).toBe(60) // Default fallback
      })
    )
  })
})

describe('Spec 6: Adaptive Duration - History Calculation', () => {
  it('Property #309: lastN averages last N records', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.integer({ min: 2, max: 5 }),
        fc.array(durationGen({ min: 10, max: 120 }), { minLength: 10, maxLength: 15 }),
        (seriesId, lastN, durations) => {
          const calc = new AdaptiveDurationCalculator()
          const config: AdaptiveDuration = {
            windowDays: 30,
            lastN,
            multiplier: 1.0,
          }
          const fallback = 60 as Duration
          const referenceDate = makeLocalDate(2024, 6, 15)

          calc.setConfig(seriesId, config, fallback)

          // Add completions on consecutive days
          durations.forEach((d, i) => {
            const date = makeLocalDate(2024, 6, 15 - i)
            calc.addCompletion(seriesId, date, d)
          })

          const result = calc.calculateDuration(seriesId, referenceDate)

          // Calculate expected: average of last N (sorted by date)
          // Since we added most recent first, the lastN are the first N we added
          const sortedDurations = [...durations].reverse() // Now in chronological order
          const lastNDurations = sortedDurations.slice(-lastN)
          const expectedAverage = lastNDurations.reduce((a, b) => a + b, 0) / lastN
          const expected = Math.ceil(expectedAverage) as Duration

          expect(result).toBe(expected)
        }
      )
    )
  })

  it('Property #310: windowDays filters records', () => {
    fc.assert(
      fc.property(seriesIdGen(), fc.integer({ min: 5, max: 15 }), (seriesId, windowDays) => {
        const calc = new AdaptiveDurationCalculator()
        const config: AdaptiveDuration = {
          windowDays,
          multiplier: 1.0,
        }
        const fallback = 60 as Duration
        const referenceDate = makeLocalDate(2024, 6, 15)

        calc.setConfig(seriesId, config, fallback)

        // Add completions - some inside window, some outside
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 15), 30 as Duration) // Day 0 - inside
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 10), 40 as Duration) // Day 5 - inside if windowDays > 5
        calc.addCompletion(seriesId, makeLocalDate(2024, 5, 1), 200 as Duration) // ~45 days ago - outside

        const result = calc.calculateDuration(seriesId, referenceDate)

        // The old completion (200 min) should not affect result
        if (windowDays > 5) {
          // Both recent completions included
          expect(result).toBe(35) // ceil((30+40)/2)
        } else {
          // Only the most recent
          expect(result).toBe(30)
        }
      })
    )
  })

  it('Property #311: multiplier applied to average', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        fc.double({ min: 0.5, max: 2.0 }),
        fc.array(durationGen({ min: 30, max: 60 }), { minLength: 3, maxLength: 5 }),
        (seriesId, multiplier, durations) => {
          const calc = new AdaptiveDurationCalculator()
          const config: AdaptiveDuration = {
            windowDays: 30,
            multiplier,
          }
          const fallback = 60 as Duration
          const referenceDate = makeLocalDate(2024, 6, 15)

          calc.setConfig(seriesId, config, fallback)

          // Add completions
          durations.forEach((d, i) => {
            const date = makeLocalDate(2024, 6, 15 - i)
            calc.addCompletion(seriesId, date, d)
          })

          const result = calc.calculateDuration(seriesId, referenceDate)

          // Calculate expected
          const average = durations.reduce((a, b) => a + b, 0) / durations.length
          const expected = Math.ceil(average * multiplier) as Duration

          expect(result).toBe(expected)
        }
      )
    )
  })

  it('Property #312: result is ceiling', () => {
    fc.assert(
      fc.property(seriesIdGen(), (seriesId) => {
        const calc = new AdaptiveDurationCalculator()
        const config: AdaptiveDuration = {
          windowDays: 30,
          multiplier: 1.0,
        }
        const fallback = 60 as Duration
        const referenceDate = makeLocalDate(2024, 6, 15)

        calc.setConfig(seriesId, config, fallback)

        // Add completions that will average to a non-integer
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 15), 31 as Duration)
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 14), 32 as Duration)

        const result = calc.calculateDuration(seriesId, referenceDate)

        // (31 + 32) / 2 = 31.5 -> ceil = 32
        expect(result).toBe(32)
        expect(Number.isInteger(result)).toBe(true)
      })
    )
  })

  it('Property #313: adaptive duration is deterministic', () => {
    fc.assert(
      fc.property(
        seriesIdGen(),
        adaptiveDurationGen(),
        durationGen(),
        fc.array(durationGen({ min: 10, max: 120 }), { minLength: 1, maxLength: 10 }),
        localDateGen(),
        (seriesId, config, fallback, durations, referenceDate) => {
          const calc1 = new AdaptiveDurationCalculator()
          const calc2 = new AdaptiveDurationCalculator()

          calc1.setConfig(seriesId, config, fallback)
          calc2.setConfig(seriesId, config, fallback)

          // Add same completions to both
          durations.forEach((d, i) => {
            const { year, month, day } = parseLocalDate(referenceDate)
            const date = makeLocalDate(year, month, Math.max(1, day - i))
            calc1.addCompletion(seriesId, date, d)
            calc2.addCompletion(seriesId, date, d)
          })

          const result1 = calc1.calculateDuration(seriesId, referenceDate)
          const result2 = calc2.calculateDuration(seriesId, referenceDate)

          expect(result1).toBe(result2)
        }
      )
    )
  })
})

// ============================================================================
// Boundary Tests
// ============================================================================

describe('Spec 6: Adaptive Duration - Boundaries', () => {
  it('single completion returns that duration (with ceiling)', () => {
    fc.assert(
      fc.property(seriesIdGen(), durationGen(), localDateGen(), (seriesId, duration, date) => {
        const calc = new AdaptiveDurationCalculator()
        const config: AdaptiveDuration = {
          windowDays: 30,
          multiplier: 1.0,
        }
        const fallback = 60 as Duration

        calc.setConfig(seriesId, config, fallback)
        calc.addCompletion(seriesId, date, duration)

        const result = calc.calculateDuration(seriesId, date)
        expect(result).toBe(Math.ceil(duration))
      })
    )
  })

  it('lastN larger than history uses all records', () => {
    fc.assert(
      fc.property(seriesIdGen(), (seriesId) => {
        const calc = new AdaptiveDurationCalculator()
        const config: AdaptiveDuration = {
          windowDays: 30,
          lastN: 100, // Much larger than actual history
          multiplier: 1.0,
        }
        const fallback = 60 as Duration
        const referenceDate = makeLocalDate(2024, 6, 15)

        calc.setConfig(seriesId, config, fallback)

        // Only add 3 completions
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 15), 30 as Duration)
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 14), 40 as Duration)
        calc.addCompletion(seriesId, makeLocalDate(2024, 6, 13), 50 as Duration)

        const result = calc.calculateDuration(seriesId, referenceDate)

        // Should average all 3: (30+40+50)/3 = 40
        expect(result).toBe(40)
      })
    )
  })

  it('zero multiplier returns zero (edge case)', () => {
    const calc = new AdaptiveDurationCalculator()
    const seriesId = 'test-series' as SeriesId
    const config: AdaptiveDuration = {
      windowDays: 30,
      multiplier: 0.0,
    }
    const fallback = 60 as Duration
    const referenceDate = makeLocalDate(2024, 6, 15)

    calc.setConfig(seriesId, config, fallback)
    calc.addCompletion(seriesId, makeLocalDate(2024, 6, 15), 30 as Duration)

    const result = calc.calculateDuration(seriesId, referenceDate)
    expect(result).toBe(0)
  })
})
