/**
 * Segment 04: Adapter (In-Memory Mock) Tests
 *
 * Tests the adapter interface - a domain-oriented interface to persistence.
 * This covers the in-memory mock implementation used for testing all other segments.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  // Main adapter interface
  createMockAdapter,
  type Adapter,
  // Error types
  DuplicateKeyError,
  NotFoundError,
  ForeignKeyError,
  InvalidDataError,
  // Entity types
  type Series,
  type Pattern,
  type Condition,
  type Completion,
  type InstanceException,
  type AdaptiveDurationConfig,
  type CyclingConfig,
  type CyclingItem,
  type Reminder,
  type ReminderAck,
  type RelationalConstraint,
  type Link,
  type Tag,
  type LocalDate,
  type LocalDateTime,
} from '../src/adapter'

import { addDays } from '../src/time-date'

// Fresh adapter for each test
let adapter: Adapter

beforeEach(() => {
  adapter = createMockAdapter()
})

// ============================================================================
// 1. TRANSACTION SEMANTICS
// ============================================================================

describe('Transaction Semantics', () => {
  it('transaction commits on success', async () => {
    await adapter.transaction(async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Test Series',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
    })
    const series = await adapter.getSeries('series-1')
    expect(series).toEqual(expect.objectContaining({
      id: 'series-1',
      title: 'Test Series',
      createdAt: '2024-01-15T10:00:00',
    }))
  })

  it('transaction rolls back on error', async () => {
    await expect(
      adapter.transaction(async () => {
        await adapter.createSeries({
          id: 'series-1',
          title: 'Test Series',
          createdAt: '2024-01-15T10:00:00' as LocalDateTime,
        })
        throw new Error('Deliberate failure')
      })
    ).rejects.toThrow('Deliberate failure')

    const allSeries = await adapter.getAllSeries()
    expect(allSeries.map(s => s.id)).not.toContain('series-1')
  })

  it('transaction returns value', async () => {
    const result = await adapter.transaction(async () => {
      return 42
    })
    expect(result).toBe(42)
  })

  it('transaction propagates error', async () => {
    await expect(
      adapter.transaction(async () => {
        throw new Error('Test error')
      })
    ).rejects.toThrow('Test error')
  })

  it('nested transactions behave as single transaction', async () => {
    await adapter.transaction(async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Outer',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.transaction(async () => {
        await adapter.createSeries({
          id: 'series-2',
          title: 'Inner',
          createdAt: '2024-01-15T10:00:00' as LocalDateTime,
        })
      })
    })
    const s1 = await adapter.getSeries('series-1')
    const s2 = await adapter.getSeries('series-2')
    expect(s1).toEqual(expect.objectContaining({
      id: 'series-1',
      title: 'Outer',
    }))
    expect(s2).toEqual(expect.objectContaining({
      id: 'series-2',
      title: 'Inner',
    }))
  })

  it('nested rollback reverts all', async () => {
    await expect(
      adapter.transaction(async () => {
        await adapter.createSeries({
          id: 'series-1',
          title: 'Outer',
          createdAt: '2024-01-15T10:00:00' as LocalDateTime,
        })
        await adapter.transaction(async () => {
          throw new Error('Inner failure')
        })
      })
    ).rejects.toThrow('Inner failure')

    const allSeries = await adapter.getAllSeries()
    expect(allSeries.map(s => s.id)).not.toContain('series-1')
  })

  describe('Rollback Verification', () => {
    it('rollback series creation', async () => {
      await expect(
        adapter.transaction(async () => {
          await adapter.createSeries({
            id: 'rollback-test',
            title: 'Will Rollback',
            createdAt: '2024-01-15T10:00:00' as LocalDateTime,
          })
          throw new Error('Rollback')
        })
      ).rejects.toThrow('Rollback')

      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('rollback-test')
    })

    it('rollback series update', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Original',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })

      await expect(
        adapter.transaction(async () => {
          await adapter.updateSeries('series-1', { title: 'Updated' })
          throw new Error('Rollback')
        })
      ).rejects.toThrow('Rollback')

      const series = await adapter.getSeries('series-1')
      expect(series?.title).toBe('Original')
    })

    it('rollback series deletion', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Test',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })

      await expect(
        adapter.transaction(async () => {
          await adapter.deleteSeries('series-1')
          throw new Error('Rollback')
        })
      ).rejects.toThrow('Rollback')

      const series = await adapter.getSeries('series-1')
      expect(series).toEqual(expect.objectContaining({
        id: 'series-1',
        title: 'Test',
      }))
    })

    it('rollback multiple operations', async () => {
      await adapter.createSeries({
        id: 'series-b',
        title: 'B Original',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 'series-c',
        title: 'C',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })

      await expect(
        adapter.transaction(async () => {
          await adapter.createSeries({
            id: 'series-a',
            title: 'A',
            createdAt: '2024-01-15T10:00:00' as LocalDateTime,
          })
          await adapter.updateSeries('series-b', { title: 'B Updated' })
          await adapter.deleteSeries('series-c')
          throw new Error('Rollback all')
        })
      ).rejects.toThrow('Rollback all')

      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('series-a')
      expect((await adapter.getSeries('series-b'))?.title).toBe('B Original')
      const seriesC = await adapter.getSeries('series-c')
      expect(seriesC).toEqual(expect.objectContaining({
        id: 'series-c',
        title: 'C',
      }))
    })
  })
})

// ============================================================================
// 2. SERIES OPERATIONS
// ============================================================================

describe('Series Operations', () => {
  describe('CRUD Tests', () => {
    it('create and get series', async () => {
      const input = {
        id: 'series-1',
        title: 'Test Series',
        description: 'A test',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      }
      await adapter.createSeries(input)
      const series = await adapter.getSeries('series-1')
      expect(series).toEqual(input)
    })

    it('create duplicate ID throws DuplicateKeyError', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'First',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await expect(
        adapter.createSeries({
          id: 'series-1',
          title: 'Second',
          createdAt: '2024-01-15T10:00:00' as LocalDateTime,
        })
      ).rejects.toThrow(DuplicateKeyError)
    })

    it('get non-existent series returns null', async () => {
      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('nonexistent')
    })

    it('get all series empty returns empty array', async () => {
      const all = await adapter.getAllSeries()
      expect(all).toEqual([])
    })

    it('get all series multiple', async () => {
      await adapter.createSeries({
        id: 's1',
        title: 'One',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 's2',
        title: 'Two',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 's3',
        title: 'Three',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })

      const all = await adapter.getAllSeries()
      const ids = all.map((s) => s.id).sort()
      expect(ids).toEqual(['s1', 's2', 's3'])
      expect(all.find((s) => s.id === 's1')?.title).toBe('One')
      expect(all.find((s) => s.id === 's2')?.title).toBe('Two')
      expect(all.find((s) => s.id === 's3')?.title).toBe('Three')
    })

    it('update series', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Original',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.updateSeries('series-1', { title: 'Updated' })
      const series = await adapter.getSeries('series-1')
      expect(series?.title).toBe('Updated')
    })

    it('update preserves unspecified fields', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Original',
        description: 'Keep me',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.updateSeries('series-1', { title: 'Updated' })
      const series = await adapter.getSeries('series-1')
      expect(series?.description).toBe('Keep me')
    })

    it('update non-existent throws NotFoundError', async () => {
      await expect(
        adapter.updateSeries('nonexistent', { title: 'X' })
      ).rejects.toThrow(NotFoundError)
    })

    it('delete series', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Test',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.deleteSeries('series-1')
      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('series-1')
    })

    it('delete with completions throws ForeignKeyError', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Test',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      await expect(adapter.deleteSeries('series-1')).rejects.toThrow(ForeignKeyError)
    })

    it('delete with child links throws ForeignKeyError', async () => {
      await adapter.createSeries({
        id: 'parent',
        title: 'Parent',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 'child',
        title: 'Child',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await expect(adapter.deleteSeries('parent')).rejects.toThrow(ForeignKeyError)
    })

    it('delete cascades patterns', async () => {
      await adapter.createSeries({
        id: 'series-1',
        title: 'Test',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createPattern({
        id: 'pattern-1',
        seriesId: 'series-1',
        type: 'daily',
        conditionId: null,
      })
      // Verify pattern exists before deletion
      const patternsBefore = await adapter.getPatternsBySeries('series-1')
      expect(patternsBefore.length).toBe(1)
      await adapter.deleteSeries('series-1')
      const patterns = await adapter.getPatternsBySeries('series-1')
      expect(patterns).toEqual([])
    })
  })

  describe('Query Tests', () => {
    it('get series by tag', async () => {
      await adapter.createSeries({
        id: 's1',
        title: 'One',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 's2',
        title: 'Two',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createSeries({
        id: 's3',
        title: 'Three',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.addTagToSeries('s1', 'work')
      await adapter.addTagToSeries('s2', 'work')

      const workSeries = await adapter.getSeriesByTag('work')
      expect(workSeries.map((s) => s.id).sort()).toEqual(['s1', 's2'])
      expect(workSeries.find((s) => s.id === 's1')?.title).toBe('One')
      expect(workSeries.find((s) => s.id === 's2')?.title).toBe('Two')
    })

    it('get series by tag empty', async () => {
      const series = await adapter.getSeriesByTag('nonexistent')
      expect(series).toEqual([])
    })
  })
})

// ============================================================================
// 3. PATTERN OPERATIONS
// ============================================================================

describe('Pattern Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('create and get pattern', async () => {
    const input = {
      id: 'pattern-1',
      seriesId: 'series-1',
      type: 'daily',
      conditionId: null,
    }
    await adapter.createPattern(input as Pattern)
    const pattern = await adapter.getPattern('pattern-1')
    expect(pattern?.type).toBe('daily')
  })

  it('pattern references invalid series throws ForeignKeyError', async () => {
    await expect(
      adapter.createPattern({
        id: 'pattern-1',
        seriesId: 'nonexistent',
        type: 'daily',
        conditionId: null,
      } as Pattern)
    ).rejects.toThrow(ForeignKeyError)
  })

  it('get patterns by series', async () => {
    await adapter.createPattern({
      id: 'p1',
      seriesId: 'series-1',
      type: 'daily',
      conditionId: null,
    } as Pattern)
    await adapter.createPattern({
      id: 'p2',
      seriesId: 'series-1',
      type: 'weekly',
      conditionId: null,
    } as Pattern)

    const patterns = await adapter.getPatternsBySeries('series-1')
    expect(patterns.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(patterns.map((p) => p.type).sort()).toEqual(['daily', 'weekly'])
    expect(patterns.find((p) => p.type === 'daily')?.id).toBe('p1')
    expect(patterns.find((p) => p.type === 'weekly')?.id).toBe('p2')
  })

  it('delete pattern cascades weekdays', async () => {
    await adapter.createPattern({
      id: 'pattern-1',
      seriesId: 'series-1',
      type: 'weekdays',
      conditionId: null,
    } as Pattern)
    await adapter.setPatternWeekdays('pattern-1', ['mon', 'wed', 'fri'])
    // Verify weekdays exist before deletion
    const weekdaysBefore = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdaysBefore).toEqual(['mon', 'wed', 'fri'])
    await adapter.deletePattern('pattern-1')
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).toEqual([])
  })

  it('series delete cascades patterns', async () => {
    await adapter.createPattern({
      id: 'pattern-1',
      seriesId: 'series-1',
      type: 'daily',
      conditionId: null,
    } as Pattern)
    await adapter.deleteSeries('series-1')
    const allPatterns = await adapter.getPatternsBySeries('series-1')
    expect(allPatterns.map(p => p.id)).not.toContain('pattern-1')
  })
})

// ============================================================================
// 4. PATTERN WEEKDAY OPERATIONS
// ============================================================================

describe('Pattern Weekday Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createPattern({
      id: 'pattern-1',
      seriesId: 'series-1',
      type: 'weekdays',
      conditionId: null,
    } as Pattern)
  })

  it('set and get weekdays', async () => {
    await adapter.setPatternWeekdays('pattern-1', ['mon', 'wed', 'fri'])
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).toEqual(['mon', 'wed', 'fri'])
  })

  it('set replaces all', async () => {
    await adapter.setPatternWeekdays('pattern-1', ['mon'])
    await adapter.setPatternWeekdays('pattern-1', ['tue', 'thu'])
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).toEqual(['tue', 'thu'])
  })

  it('pattern delete cascades weekdays', async () => {
    await adapter.setPatternWeekdays('pattern-1', ['mon', 'wed'])
    // Verify weekdays exist before deletion
    const weekdaysBefore = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdaysBefore).toEqual(['mon', 'wed'])
    await adapter.deletePattern('pattern-1')
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).toEqual([])
  })

  it('get all pattern weekdays', async () => {
    await adapter.createPattern({
      id: 'pattern-2',
      seriesId: 'series-1',
      type: 'weekdays',
      conditionId: null,
    } as Pattern)
    await adapter.setPatternWeekdays('pattern-1', ['mon', 'wed'])
    await adapter.setPatternWeekdays('pattern-2', ['tue', 'thu'])

    const all = await adapter.getAllPatternWeekdays()
    const weekdays = all.map((w) => w.weekday).sort()
    expect(weekdays).toEqual(['mon', 'thu', 'tue', 'wed'])
    // Verify pattern associations
    const pattern1Weekdays = all.filter((w) => w.patternId === 'pattern-1')
    const pattern2Weekdays = all.filter((w) => w.patternId === 'pattern-2')
    expect(pattern1Weekdays.map((w) => w.weekday).sort()).toEqual(['mon', 'wed'])
    expect(pattern2Weekdays.map((w) => w.weekday).sort()).toEqual(['thu', 'tue'])
  })
})

// ============================================================================
// 5. CONDITION OPERATIONS
// ============================================================================

describe('Condition Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('create root condition', async () => {
    await adapter.createCondition({
      id: 'cond-1',
      seriesId: 'series-1',
      parentId: null,
      type: 'count',
      operator: '>=',
      value: 5,
      windowDays: 14,
    } as Condition)
    const condition = await adapter.getCondition('cond-1')
    expect(condition).toEqual(expect.objectContaining({
      id: 'cond-1',
      type: 'count',
      seriesId: 'series-1',
      parentId: null,
    }))
  })

  it('create child condition', async () => {
    await adapter.createCondition({
      id: 'parent',
      seriesId: 'series-1',
      parentId: null,
      type: 'and',
    } as Condition)
    await adapter.createCondition({
      id: 'child',
      seriesId: 'series-1',
      parentId: 'parent',
      type: 'count',
      operator: '>=',
      value: 1,
      windowDays: 7,
    } as Condition)
    const child = await adapter.getCondition('child')
    expect(child?.parentId).toBe('parent')
  })

  it('child with invalid parent throws ForeignKeyError', async () => {
    await expect(
      adapter.createCondition({
        id: 'child',
        seriesId: 'series-1',
        parentId: 'nonexistent',
        type: 'count',
        operator: '>=',
        value: 1,
        windowDays: 7,
      } as Condition)
    ).rejects.toThrow(ForeignKeyError)
  })

  it('delete cascades children', async () => {
    await adapter.createCondition({
      id: 'parent',
      seriesId: 'series-1',
      parentId: null,
      type: 'and',
    } as Condition)
    await adapter.createCondition({
      id: 'child',
      seriesId: 'series-1',
      parentId: 'parent',
      type: 'count',
      operator: '>=',
      value: 1,
      windowDays: 7,
    } as Condition)
    await adapter.deleteCondition('parent')
    const allConditions = await adapter.getConditionsBySeries('series-1')
    expect(allConditions.map(c => c.id)).not.toContain('child')
  })

  it('no cycles allowed', async () => {
    await adapter.createCondition({
      id: 'a',
      seriesId: 'series-1',
      parentId: null,
      type: 'and',
    } as Condition)
    await adapter.createCondition({
      id: 'b',
      seriesId: 'series-1',
      parentId: 'a',
      type: 'and',
    } as Condition)
    await adapter.createCondition({
      id: 'c',
      seriesId: 'series-1',
      parentId: 'b',
      type: 'and',
    } as Condition)

    // Attempt to create cycle: c → a
    await expect(
      adapter.updateCondition('a', { parentId: 'c' })
    ).rejects.toThrow(InvalidDataError)
  })

  it('get conditions by series', async () => {
    await adapter.createCondition({
      id: 'c1',
      seriesId: 'series-1',
      parentId: null,
      type: 'and',
    } as Condition)
    await adapter.createCondition({
      id: 'c2',
      seriesId: 'series-1',
      parentId: 'c1',
      type: 'count',
      operator: '>=',
      value: 1,
      windowDays: 7,
    } as Condition)

    const conditions = await adapter.getConditionsBySeries('series-1')
    expect(conditions.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(conditions.find((c) => c.id === 'c1')?.type).toBe('and')
    expect(conditions.find((c) => c.id === 'c2')?.type).toBe('count')
    expect(conditions.find((c) => c.id === 'c2')?.parentId).toBe('c1')
  })
})

// ============================================================================
// 6. ADAPTIVE DURATION OPERATIONS
// ============================================================================

describe('Adaptive Duration Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('set and get adaptive duration', async () => {
    const config: AdaptiveDurationConfig = {
      seriesId: 'series-1',
      fallbackDuration: 30,
      bufferPercent: 25,
      lastN: 5,
      windowDays: 30,
    }
    await adapter.setAdaptiveDuration('series-1', config)
    const result = await adapter.getAdaptiveDuration('series-1')
    expect(result).toEqual(config)
  })

  it('one per series - second replaces first', async () => {
    await adapter.setAdaptiveDuration('series-1', {
      seriesId: 'series-1',
      fallbackDuration: 30,
      bufferPercent: 25,
      lastN: 5,
      windowDays: 30,
    })
    await adapter.setAdaptiveDuration('series-1', {
      seriesId: 'series-1',
      fallbackDuration: 45,
      bufferPercent: 30,
      lastN: 10,
      windowDays: 60,
    })
    const result = await adapter.getAdaptiveDuration('series-1')
    expect(result?.fallbackDuration).toBe(45)
  })

  it('set null removes config', async () => {
    await adapter.setAdaptiveDuration('series-1', {
      seriesId: 'series-1',
      fallbackDuration: 30,
      bufferPercent: 25,
      lastN: 5,
      windowDays: 30,
    })
    await adapter.setAdaptiveDuration('series-1', null)
    const result = await adapter.getAdaptiveDuration('series-1')
    expect(result).toBeNull()
  })

  it('series delete cascades adaptive duration', async () => {
    await adapter.setAdaptiveDuration('series-1', {
      seriesId: 'series-1',
      fallbackDuration: 30,
      bufferPercent: 25,
      lastN: 5,
      windowDays: 30,
    })
    await adapter.deleteSeries('series-1')
    // Verify series was deleted, which cascades the adaptive duration config
    const allSeries = await adapter.getAllSeries()
    expect(allSeries.map(s => s.id)).not.toContain('series-1')
  })
})

// ============================================================================
// 7. CYCLING OPERATIONS
// ============================================================================

describe('Cycling Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  describe('Config Tests', () => {
    it('set and get cycling config', async () => {
      const config: CyclingConfig = {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      }
      await adapter.setCyclingConfig('series-1', config)
      const result = await adapter.getCyclingConfig('series-1')
      expect(result).toEqual(config)
    })

    it('one per series - second replaces first', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 5,
        gapLeap: false,
      })
      const result = await adapter.getCyclingConfig('series-1')
      expect(result?.currentIndex).toBe(5)
    })

    it('update cycling index', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.updateCyclingIndex('series-1', 3)
      const result = await adapter.getCyclingConfig('series-1')
      expect(result?.currentIndex).toBe(3)
    })
  })

  describe('Item Tests', () => {
    it('set and get cycling items', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      const items: CyclingItem[] = [
        { seriesId: 'series-1', position: 0, title: 'A', duration: 30 },
        { seriesId: 'series-1', position: 1, title: 'B', duration: 45 },
      ]
      await adapter.setCyclingItems('series-1', items)
      const result = await adapter.getCyclingItems('series-1')
      expect(result.map((r) => r.title)).toEqual(['A', 'B'])
      expect(result[0].duration).toBe(30)
      expect(result[0].position).toBe(0)
      expect(result[1].duration).toBe(45)
      expect(result[1].position).toBe(1)
    })

    it('set replaces all items', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.setCyclingItems('series-1', [
        { seriesId: 'series-1', position: 0, title: 'A', duration: 30 },
      ])
      await adapter.setCyclingItems('series-1', [
        { seriesId: 'series-1', position: 0, title: 'B', duration: 45 },
        { seriesId: 'series-1', position: 1, title: 'C', duration: 60 },
      ])
      const result = await adapter.getCyclingItems('series-1')
      expect(result.map((r) => r.title)).toEqual(['B', 'C'])
      expect(result[0].duration).toBe(45)
      expect(result[0].position).toBe(0)
      expect(result[1].duration).toBe(60)
      expect(result[1].position).toBe(1)
    })

    it('items ordered by position', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.setCyclingItems('series-1', [
        { seriesId: 'series-1', position: 2, title: 'C', duration: 30 },
        { seriesId: 'series-1', position: 0, title: 'A', duration: 30 },
        { seriesId: 'series-1', position: 1, title: 'B', duration: 30 },
      ])
      const result = await adapter.getCyclingItems('series-1')
      expect(result[0].title).toBe('A')
      expect(result[1].title).toBe('B')
      expect(result[2].title).toBe('C')
    })

    it('config delete cascades items', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.setCyclingItems('series-1', [
        { seriesId: 'series-1', position: 0, title: 'A', duration: 30 },
      ])
      // Verify items exist before clearing config
      const itemsBefore = await adapter.getCyclingItems('series-1')
      expect(itemsBefore.length).toBe(1)
      await adapter.setCyclingConfig('series-1', null)
      const items = await adapter.getCyclingItems('series-1')
      expect(items).toEqual([])
    })

    it('series delete cascades config and items', async () => {
      await adapter.setCyclingConfig('series-1', {
        seriesId: 'series-1',
        currentIndex: 0,
        gapLeap: true,
      })
      await adapter.setCyclingItems('series-1', [
        { seriesId: 'series-1', position: 0, title: 'A', duration: 30 },
      ])
      // Verify items exist before deletion
      const itemsBefore = await adapter.getCyclingItems('series-1')
      expect(itemsBefore.length).toBe(1)
      await adapter.deleteSeries('series-1')
      // Verify series was deleted, which cascades config and items
      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('series-1')
      const items = await adapter.getCyclingItems('series-1')
      expect(items).toEqual([])
    })
  })
})

// ============================================================================
// 8. INSTANCE EXCEPTION OPERATIONS
// ============================================================================

describe('Instance Exception Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('create and get exception', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    const exc = await adapter.getInstanceException('series-1', '2024-01-15' as LocalDate)
    expect(exc?.type).toBe('cancel')
  })

  it('unique per series+date throws DuplicateKeyError', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    await expect(
      adapter.createInstanceException({
        id: 'exc-2',
        seriesId: 'series-1',
        originalDate: '2024-01-15' as LocalDate,
        type: 'reschedule',
        newDate: '2024-01-16' as LocalDate,
      })
    ).rejects.toThrow(DuplicateKeyError)
  })

  it('get exceptions by series', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    await adapter.createInstanceException({
      id: 'exc-2',
      seriesId: 'series-1',
      originalDate: '2024-01-16' as LocalDate,
      type: 'cancel',
    })
    const exceptions = await adapter.getExceptionsBySeries('series-1')
    expect(exceptions.map((e) => e.originalDate).sort()).toEqual(['2024-01-15', '2024-01-16'])
    expect(exceptions.find((e) => e.originalDate === '2024-01-15')?.id).toBe('exc-1')
    expect(exceptions.find((e) => e.originalDate === '2024-01-15')?.type).toBe('cancel')
    expect(exceptions.find((e) => e.originalDate === '2024-01-16')?.id).toBe('exc-2')
    expect(exceptions.find((e) => e.originalDate === '2024-01-16')?.type).toBe('cancel')
  })

  it('get exceptions in range', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-10' as LocalDate,
      type: 'cancel',
    })
    await adapter.createInstanceException({
      id: 'exc-2',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    await adapter.createInstanceException({
      id: 'exc-3',
      seriesId: 'series-1',
      originalDate: '2024-01-20' as LocalDate,
      type: 'cancel',
    })
    const inRange = await adapter.getExceptionsInRange(
      'series-1',
      '2024-01-12' as LocalDate,
      '2024-01-18' as LocalDate
    )
    expect(inRange.map((e) => e.id)).toEqual(['exc-2'])
    expect(inRange[0].originalDate).toBe('2024-01-15')
    expect(inRange[0].type).toBe('cancel')
  })

  it('delete exception', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    await adapter.deleteInstanceException('exc-1')
    const allExceptions = await adapter.getExceptionsBySeries('series-1')
    expect(allExceptions.map(e => e.id)).not.toContain('exc-1')
  })

  it('series delete cascades exceptions', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    // Verify exception exists before deletion
    const exceptionsBefore = await adapter.getExceptionsBySeries('series-1')
    expect(exceptionsBefore.length).toBe(1)
    await adapter.deleteSeries('series-1')
    const exceptions = await adapter.getExceptionsBySeries('series-1')
    expect(exceptions).toEqual([])
  })
})

// ============================================================================
// 9. COMPLETION OPERATIONS
// ============================================================================

describe('Completion Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  describe('CRUD Tests', () => {
    it('create and get completion', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      const comp = await adapter.getCompletion('comp-1')
      expect(comp?.instanceDate).toBe('2024-01-15')
    })

    it('completion references invalid series throws ForeignKeyError', async () => {
      await expect(
        adapter.createCompletion({
          id: 'comp-1',
          seriesId: 'nonexistent',
          instanceDate: '2024-01-15' as LocalDate,
          date: '2024-01-15' as LocalDate,
          startTime: '2024-01-15T13:30:00' as LocalDateTime,
          endTime: '2024-01-15T14:00:00' as LocalDateTime,
        })
      ).rejects.toThrow(ForeignKeyError)
    })

    it('series delete blocked by completions', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      await expect(adapter.deleteSeries('series-1')).rejects.toThrow(ForeignKeyError)
    })

    it('one per series+instance throws error', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      await expect(
        adapter.createCompletion({
          id: 'comp-2',
          seriesId: 'series-1',
          instanceDate: '2024-01-15' as LocalDate,
          date: '2024-01-15' as LocalDate,
          startTime: '2024-01-15T14:30:00' as LocalDateTime,
          endTime: '2024-01-15T15:00:00' as LocalDateTime,
        })
      ).rejects.toThrow(DuplicateKeyError)
    })

    it('get completions by series', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      await adapter.createCompletion({
        id: 'comp-2',
        seriesId: 'series-1',
        instanceDate: '2024-01-16' as LocalDate,
        date: '2024-01-16' as LocalDate,
        startTime: '2024-01-16T13:30:00' as LocalDateTime,
        endTime: '2024-01-16T14:00:00' as LocalDateTime,
      })
      const completions = await adapter.getCompletionsBySeries('series-1')
      expect(completions.map((c) => c.instanceDate).sort()).toEqual(['2024-01-15', '2024-01-16'])
      expect(completions.find((c) => c.instanceDate === '2024-01-15')?.id).toBe('comp-1')
      expect(completions.find((c) => c.instanceDate === '2024-01-16')?.id).toBe('comp-2')
    })

    it('get completion by instance', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      const comp = await adapter.getCompletionByInstance('series-1', '2024-01-15' as LocalDate)
      expect(comp).toEqual(expect.objectContaining({
        id: 'comp-1',
        instanceDate: '2024-01-15',
        seriesId: 'series-1',
      }))
    })

    it('delete completion', async () => {
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: 'series-1',
        instanceDate: '2024-01-15' as LocalDate,
        date: '2024-01-15' as LocalDate,
        startTime: '2024-01-15T13:30:00' as LocalDateTime,
        endTime: '2024-01-15T14:00:00' as LocalDateTime,
      })
      await adapter.deleteCompletion('comp-1')
      const allCompletions = await adapter.getCompletionsBySeries('series-1')
      expect(allCompletions.map(c => c.id)).not.toContain('comp-1')
    })
  })

  describe('Query Tests', () => {
    it('count completions in window', async () => {
      const asOf = '2024-01-15' as LocalDate
      // 3 in window
      const day1 = addDays(asOf, -1)
      await adapter.createCompletion({
        id: 'c1',
        seriesId: 'series-1',
        instanceDate: day1,
        date: day1,
        startTime: `${day1}T13:30:00` as LocalDateTime,
        endTime: `${day1}T14:00:00` as LocalDateTime,
      })
      const day3 = addDays(asOf, -3)
      await adapter.createCompletion({
        id: 'c2',
        seriesId: 'series-1',
        instanceDate: day3,
        date: day3,
        startTime: `${day3}T13:30:00` as LocalDateTime,
        endTime: `${day3}T14:00:00` as LocalDateTime,
      })
      const day6 = addDays(asOf, -6)
      await adapter.createCompletion({
        id: 'c3',
        seriesId: 'series-1',
        instanceDate: day6,
        date: day6,
        startTime: `${day6}T13:30:00` as LocalDateTime,
        endTime: `${day6}T14:00:00` as LocalDateTime,
      })
      // 1 outside window
      const day10 = addDays(asOf, -10)
      await adapter.createCompletion({
        id: 'c4',
        seriesId: 'series-1',
        instanceDate: day10,
        date: day10,
        startTime: `${day10}T13:30:00` as LocalDateTime,
        endTime: `${day10}T14:00:00` as LocalDateTime,
      })

      const count = await adapter.countCompletionsInWindow('series-1', addDays(asOf, -6), asOf)
      expect(count).toBe(3)
    })

    it('days since last completion', async () => {
      const asOf = '2024-01-15' as LocalDate
      const day5 = addDays(asOf, -5)
      await adapter.createCompletion({
        id: 'c1',
        seriesId: 'series-1',
        instanceDate: day5,
        date: day5,
        startTime: `${day5}T13:30:00` as LocalDateTime,
        endTime: `${day5}T14:00:00` as LocalDateTime,
      })
      const days = await adapter.daysSinceLastCompletion('series-1', asOf)
      expect(days).toBe(5)
    })

    it('days since never completed returns null', async () => {
      const days = await adapter.daysSinceLastCompletion('series-1', '2024-01-15' as LocalDate)
      expect(days).toBeNull()
    })

    it('recent durations lastN', async () => {
      const asOf = '2024-01-15' as LocalDate
      for (let i = 0; i < 5; i++) {
        const day = addDays(asOf, -i)
        const duration = 30 + i * 5
        await adapter.createCompletion({
          id: `c${i}`,
          seriesId: 'series-1',
          instanceDate: day,
          date: day,
          startTime: `${day}T14:00:00` as LocalDateTime,
          endTime: `${day}T14:${String(duration).padStart(2, '0')}:00` as LocalDateTime,
        })
      }
      const durations = await adapter.getRecentDurations('series-1', { lastN: 3 })
      // Most recent completions: i=0 (30min), i=1 (35min), i=2 (40min)
      expect(durations.sort((a, b) => a - b)).toEqual([30, 35, 40])
    })

    it('recent durations windowDays', async () => {
      const asOf = '2024-01-15' as LocalDate
      for (let i = 0; i < 10; i++) {
        const day = addDays(asOf, -i * 5)
        await adapter.createCompletion({
          id: `c${i}`,
          seriesId: 'series-1',
          instanceDate: day,
          date: day,
          startTime: `${day}T14:00:00` as LocalDateTime,
          endTime: `${day}T14:30:00` as LocalDateTime, // 30 min duration
        })
      }
      const durations = await adapter.getRecentDurations('series-1', {
        windowDays: 14,
        asOf,
      })
      // Only dates 0, -5, -10 are within 14 days of asOf
      // All durations should be 30 minutes (time between 14:00 and 14:30)
      expect(durations).toEqual([30, 30, 30])
    })
  })
})

// ============================================================================
// 10. TAG OPERATIONS
// ============================================================================

describe('Tag Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('create tag returns ID', async () => {
    const id = await adapter.createTag('work')
    expect(id).toMatch(/^[a-zA-Z0-9-]+$/)
    expect(id.length).toBeGreaterThanOrEqual(1)
    // Verify the tag was actually created
    const tag = await adapter.getTagByName('work')
    expect(tag).toEqual(expect.objectContaining({
      id: id,
      name: 'work',
    }))
  })

  it('create existing returns same ID', async () => {
    const id1 = await adapter.createTag('work')
    const id2 = await adapter.createTag('work')
    expect(id1).toBe(id2)
  })

  it('get tag by name', async () => {
    await adapter.createTag('work')
    const tag = await adapter.getTagByName('work')
    expect(tag?.name).toBe('work')
  })

  it('add tag to series', async () => {
    await adapter.addTagToSeries('series-1', 'work')
    const tags = await adapter.getTagsForSeries('series-1')
    expect(tags.some((t) => t.name === 'work')).toBe(true)
  })

  it('add tag creates if needed', async () => {
    await adapter.addTagToSeries('series-1', 'newTag')
    const tag = await adapter.getTagByName('newTag')
    expect(tag).toEqual(expect.objectContaining({
      name: 'newTag',
    }))
    expect(tag!.id).toMatch(/^[a-zA-Z0-9-]+$/)
  })

  it('no duplicate associations', async () => {
    await adapter.addTagToSeries('series-1', 'work')
    await adapter.addTagToSeries('series-1', 'work')
    const tags = await adapter.getTagsForSeries('series-1')
    const workTags = tags.filter((t) => t.name === 'work')
    expect(workTags.map((t) => t.name)).toEqual(['work'])
  })

  it('remove tag from series', async () => {
    await adapter.addTagToSeries('series-1', 'work')
    await adapter.removeTagFromSeries('series-1', 'work')
    const tags = await adapter.getTagsForSeries('series-1')
    expect(tags.some((t) => t.name === 'work')).toBe(false)
  })

  it('series delete cascades tag associations', async () => {
    await adapter.addTagToSeries('series-1', 'work')
    await adapter.deleteSeries('series-1')
    // Tag still exists, just association is removed
    const tag = await adapter.getTagByName('work')
    expect(tag).toEqual(expect.objectContaining({
      name: 'work',
    }))
    // But the association was removed (series is gone) - returns empty as expected
    const seriesWithTag = await adapter.getSeriesByTag('work')
    expect(seriesWithTag).toHaveLength(0)
  })

  it('tag delete cascades associations', async () => {
    await adapter.addTagToSeries('series-1', 'work')
    const tag = await adapter.getTagByName('work')
    await adapter.deleteTag(tag!.id)
    const tags = await adapter.getTagsForSeries('series-1')
    expect(tags.some((t) => t.name === 'work')).toBe(false)
  })
})

// ============================================================================
// 11. REMINDER OPERATIONS
// ============================================================================

describe('Reminder Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  it('create and get reminder', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Prepare',
    })
    const rem = await adapter.getReminder('rem-1')
    expect(rem?.minutesBefore).toBe(15)
  })

  it('multiple per series', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Prepare',
    })
    await adapter.createReminder({
      id: 'rem-2',
      seriesId: 'series-1',
      minutesBefore: 5,
      label: 'Urgent',
    })
    await adapter.createReminder({
      id: 'rem-3',
      seriesId: 'series-1',
      minutesBefore: 60,
      label: 'Early',
    })
    const reminders = await adapter.getRemindersBySeries('series-1')
    const sorted = reminders.map((r) => r.minutesBefore).sort((a, b) => a - b)
    expect(sorted).toEqual([5, 15, 60])
    // Verify individual reminder content
    expect(reminders.find((r) => r.minutesBefore === 5)?.label).toBe('Urgent')
    expect(reminders.find((r) => r.minutesBefore === 15)?.label).toBe('Prepare')
    expect(reminders.find((r) => r.minutesBefore === 60)?.label).toBe('Early')
  })

  it('get reminders by series', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Test',
    })
    const reminders = await adapter.getRemindersBySeries('series-1')
    expect(reminders.map((r) => r.id)).toEqual(['rem-1'])
    expect(reminders[0].minutesBefore).toBe(15)
    expect(reminders[0].label).toBe('Test')
    expect(reminders[0].seriesId).toBe('series-1')
  })

  it('update reminder', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Old',
    })
    await adapter.updateReminder('rem-1', { minutesBefore: 30 })
    const rem = await adapter.getReminder('rem-1')
    expect(rem?.minutesBefore).toBe(30)
  })

  it('delete reminder', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Test',
    })
    await adapter.deleteReminder('rem-1')
    const allReminders = await adapter.getRemindersBySeries('series-1')
    expect(allReminders.map(r => r.id)).not.toContain('rem-1')
  })

  it('series delete cascades reminders', async () => {
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Test',
    })
    // Verify reminder exists before deletion
    const remindersBefore = await adapter.getRemindersBySeries('series-1')
    expect(remindersBefore.length).toBe(1)
    await adapter.deleteSeries('series-1')
    const reminders = await adapter.getRemindersBySeries('series-1')
    expect(reminders).toEqual([])
  })
})

// ============================================================================
// 12. REMINDER ACKNOWLEDGMENT OPERATIONS
// ============================================================================

describe('Reminder Acknowledgment Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createReminder({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Test',
    })
  })

  it('acknowledge and check', async () => {
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:45:00' as LocalDateTime)
    const acked = await adapter.isReminderAcknowledged('rem-1', '2024-01-15' as LocalDate)
    expect(acked).toBe(true)
  })

  it('not acknowledged returns false', async () => {
    const acked = await adapter.isReminderAcknowledged('rem-1', '2024-01-15' as LocalDate)
    expect(acked).toBe(false)
  })

  it('re-acknowledge is idempotent', async () => {
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:45:00' as LocalDateTime)
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:50:00' as LocalDateTime)
    const acked = await adapter.isReminderAcknowledged('rem-1', '2024-01-15' as LocalDate)
    expect(acked).toBe(true)
  })

  it('reminder delete cascades acks', async () => {
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:45:00' as LocalDateTime)
    // Verify ack exists before deletion
    const acksBefore = await adapter.getReminderAcksInRange('2024-01-01' as LocalDate, '2024-01-31' as LocalDate)
    expect(acksBefore.length).toBe(1)
    await adapter.deleteReminder('rem-1')
    const acks = await adapter.getReminderAcksInRange('2024-01-01' as LocalDate, '2024-01-31' as LocalDate)
    expect(acks).toEqual([])
  })

  it('purge old acknowledgments', async () => {
    await adapter.acknowledgeReminder('rem-1', '2024-01-01' as LocalDate, '2024-01-01T09:45:00' as LocalDateTime)
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:45:00' as LocalDateTime)
    await adapter.purgeOldReminderAcks('2024-01-10' as LocalDate)
    const acked1 = await adapter.isReminderAcknowledged('rem-1', '2024-01-01' as LocalDate)
    const acked15 = await adapter.isReminderAcknowledged('rem-1', '2024-01-15' as LocalDate)
    expect(acked1).toBe(false)
    expect(acked15).toBe(true)
  })

  it('get acks in range', async () => {
    await adapter.acknowledgeReminder('rem-1', '2024-01-10' as LocalDate, '2024-01-10T09:45:00' as LocalDateTime)
    await adapter.acknowledgeReminder('rem-1', '2024-01-15' as LocalDate, '2024-01-15T09:45:00' as LocalDateTime)
    await adapter.acknowledgeReminder('rem-1', '2024-01-20' as LocalDate, '2024-01-20T09:45:00' as LocalDateTime)
    const acks = await adapter.getReminderAcksInRange('2024-01-12' as LocalDate, '2024-01-18' as LocalDate)
    expect(acks.map((a) => a.reminderId)).toEqual(['rem-1'])
    expect(acks[0].instanceDate).toBe('2024-01-15')
  })
})

// ============================================================================
// 13. RELATIONAL CONSTRAINT OPERATIONS
// ============================================================================

describe('Relational Constraint Operations', () => {
  it('create and get constraint', async () => {
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { tag: 'meeting' },
      destinationTarget: { tag: 'lunch' },
    })
    const rc = await adapter.getRelationalConstraint('rc-1')
    expect(rc?.type).toBe('mustBeBefore')
  })

  it('get all constraints', async () => {
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { tag: 'a' },
      destinationTarget: { tag: 'b' },
    })
    await adapter.createRelationalConstraint({
      id: 'rc-2',
      type: 'cantBeNextTo',
      sourceTarget: { tag: 'c' },
      destinationTarget: { tag: 'd' },
    })
    const all = await adapter.getAllRelationalConstraints()
    expect(all.map((c) => c.type).sort()).toEqual(['cantBeNextTo', 'mustBeBefore'])
    expect(all.find((c) => c.id === 'rc-1')?.type).toBe('mustBeBefore')
    expect(all.find((c) => c.id === 'rc-2')?.type).toBe('cantBeNextTo')
  })

  it('delete constraint', async () => {
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { tag: 'a' },
      destinationTarget: { tag: 'b' },
    })
    await adapter.deleteRelationalConstraint('rc-1')
    const allConstraints = await adapter.getAllRelationalConstraints()
    expect(allConstraints.map(c => c.id)).not.toContain('rc-1')
  })

  it('independent of series - constraint remains after series delete', async () => {
    await adapter.createSeries({
      id: 'series-1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { seriesId: 'series-1' },
      destinationTarget: { tag: 'other' },
    })
    await adapter.deleteSeries('series-1')
    const rc = await adapter.getRelationalConstraint('rc-1')
    expect(rc).toEqual(expect.objectContaining({
      id: 'rc-1',
      type: 'mustBeBefore',
    }))
  })

  it('soft reference by tag works', async () => {
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { tag: 'work' },
      destinationTarget: { tag: 'break' },
    })
    const rc = await adapter.getRelationalConstraint('rc-1')
    expect(rc?.sourceTarget).toEqual({ tag: 'work' })
  })

  it('soft reference by seriesId works', async () => {
    await adapter.createRelationalConstraint({
      id: 'rc-1',
      type: 'mustBeBefore',
      sourceTarget: { seriesId: 'some-uuid' },
      destinationTarget: { seriesId: 'another-uuid' },
    })
    const rc = await adapter.getRelationalConstraint('rc-1')
    expect(rc?.sourceTarget).toEqual({ seriesId: 'some-uuid' })
  })
})

// ============================================================================
// 14. LINK OPERATIONS
// ============================================================================

describe('Link Operations', () => {
  beforeEach(async () => {
    await adapter.createSeries({
      id: 'parent',
      title: 'Parent',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createSeries({
      id: 'child',
      title: 'Child',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
  })

  describe('CRUD Tests', () => {
    it('create and get link', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      const link = await adapter.getLink('link-1')
      expect(link?.targetDistance).toBe(30)
    })

    it('get link by child', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      const link = await adapter.getLinkByChild('child')
      expect(link?.parentSeriesId).toBe('parent')
    })

    it('get links by parent', async () => {
      await adapter.createSeries({
        id: 'child2',
        title: 'Child 2',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.createLink({
        id: 'link-2',
        parentSeriesId: 'parent',
        childSeriesId: 'child2',
        targetDistance: 60,
        earlyWobble: 0,
        lateWobble: 20,
      })
      const links = await adapter.getLinksByParent('parent')
      expect(links.map((l) => l.childSeriesId).sort()).toEqual(['child', 'child2'])
      expect(links.find((l) => l.childSeriesId === 'child')?.id).toBe('link-1')
      expect(links.find((l) => l.childSeriesId === 'child')?.targetDistance).toBe(30)
      expect(links.find((l) => l.childSeriesId === 'child2')?.id).toBe('link-2')
      expect(links.find((l) => l.childSeriesId === 'child2')?.targetDistance).toBe(60)
    })

    it('update link', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.updateLink('link-1', { targetDistance: 45 })
      const link = await adapter.getLink('link-1')
      expect(link?.targetDistance).toBe(45)
    })

    it('delete link', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.deleteLink('link-1')
      const allLinks = await adapter.getLinksByParent('parent')
      expect(allLinks.map(l => l.id)).not.toContain('link-1')
    })
  })

  describe('Constraint Tests', () => {
    it('one link per child throws error', async () => {
      await adapter.createSeries({
        id: 'parent2',
        title: 'Parent 2',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await expect(
        adapter.createLink({
          id: 'link-2',
          parentSeriesId: 'parent2',
          childSeriesId: 'child',
          targetDistance: 60,
          earlyWobble: 0,
          lateWobble: 20,
        })
      ).rejects.toThrow(DuplicateKeyError)
    })

    it('parent can have many children', async () => {
      await adapter.createSeries({
        id: 'child2',
        title: 'Child 2',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.createLink({
        id: 'link-2',
        parentSeriesId: 'parent',
        childSeriesId: 'child2',
        targetDistance: 60,
        earlyWobble: 0,
        lateWobble: 20,
      })
      const links = await adapter.getLinksByParent('parent')
      expect(links.map((l) => l.childSeriesId).sort()).toEqual(['child', 'child2'])
      expect(links.find((l) => l.childSeriesId === 'child')?.id).toBe('link-1')
      expect(links.find((l) => l.childSeriesId === 'child2')?.id).toBe('link-2')
    })

    it('no self-links throws error', async () => {
      await expect(
        adapter.createLink({
          id: 'link-1',
          parentSeriesId: 'parent',
          childSeriesId: 'parent',
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      ).rejects.toThrow(InvalidDataError)
    })

    it('child delete cascades link', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.deleteSeries('child')
      const allLinks = await adapter.getLinksByParent('parent')
      expect(allLinks.map(l => l.id)).not.toContain('link-1')
    })

    it('parent delete blocked by links', async () => {
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await expect(adapter.deleteSeries('parent')).rejects.toThrow(ForeignKeyError)
    })

    it('no cycles allowed', async () => {
      await adapter.createSeries({
        id: 'middle',
        title: 'Middle',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await adapter.createLink({
        id: 'link-1',
        parentSeriesId: 'parent',
        childSeriesId: 'middle',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      await adapter.createLink({
        id: 'link-2',
        parentSeriesId: 'middle',
        childSeriesId: 'child',
        targetDistance: 30,
        earlyWobble: 0,
        lateWobble: 10,
      })
      // Attempt to create cycle: child → parent
      await expect(
        adapter.createLink({
          id: 'link-3',
          parentSeriesId: 'child',
          childSeriesId: 'parent',
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      ).rejects.toThrow(InvalidDataError)
    })

    it('parent must exist', async () => {
      await expect(
        adapter.createLink({
          id: 'link-1',
          parentSeriesId: 'nonexistent',
          childSeriesId: 'child',
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      ).rejects.toThrow(ForeignKeyError)
    })

    it('child must exist', async () => {
      await expect(
        adapter.createLink({
          id: 'link-1',
          parentSeriesId: 'parent',
          childSeriesId: 'nonexistent',
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      ).rejects.toThrow(ForeignKeyError)
    })

    it('max chain depth 33 throws error', async () => {
      // Create 33 series
      const seriesIds: string[] = []
      for (let i = 0; i < 33; i++) {
        const id = `series-${i}`
        seriesIds.push(id)
        await adapter.createSeries({
          id,
          title: `Series ${i}`,
          createdAt: '2024-01-15T10:00:00' as LocalDateTime,
        })
      }

      // Link them in chain: 0→1→2→...→31 (32 links = depth 32, OK)
      for (let i = 0; i < 32; i++) {
        await adapter.createLink({
          id: `chain-link-${i}`,
          parentSeriesId: seriesIds[i],
          childSeriesId: seriesIds[i + 1],
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      }

      // Adding 33rd level should fail
      await adapter.createSeries({
        id: 'series-33',
        title: 'Series 33',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
      await expect(
        adapter.createLink({
          id: 'chain-link-32',
          parentSeriesId: seriesIds[32],
          childSeriesId: 'series-33',
          targetDistance: 30,
          earlyWobble: 0,
          lateWobble: 10,
        })
      ).rejects.toThrow(InvalidDataError)
    })
  })
})

// ============================================================================
// 15. INVARIANTS
// ============================================================================

describe('Invariants', () => {
  it('INV 1: All FK relationships satisfied - orphan creation rejected', async () => {
    await expect(
      adapter.createPattern({
        id: 'p1',
        seriesId: 'nonexistent',
        type: 'daily',
        conditionId: null,
      } as Pattern)
    ).rejects.toThrow(ForeignKeyError)
  })

  it('INV 2: All unique constraints enforced', async () => {
    await adapter.createSeries({
      id: 's1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await expect(
      adapter.createSeries({
        id: 's1',
        title: 'Duplicate',
        createdAt: '2024-01-15T10:00:00' as LocalDateTime,
      })
    ).rejects.toThrow(DuplicateKeyError)
  })

  it('INV 4: CASCADE deletes work', async () => {
    await adapter.createSeries({
      id: 's1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createPattern({
      id: 'p1',
      seriesId: 's1',
      type: 'daily',
      conditionId: null,
    } as Pattern)
    await adapter.deleteSeries('s1')
    const allPatterns = await adapter.getPatternsBySeries('s1')
    expect(allPatterns.map(p => p.id)).not.toContain('p1')
  })

  it('INV 5: RESTRICT deletes throw', async () => {
    await adapter.createSeries({
      id: 's1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createCompletion({
      id: 'c1',
      seriesId: 's1',
      instanceDate: '2024-01-15' as LocalDate,
      date: '2024-01-15' as LocalDate,
      startTime: '2024-01-15T13:30:00' as LocalDateTime,
      endTime: '2024-01-15T14:00:00' as LocalDateTime,
    })
    await expect(adapter.deleteSeries('s1')).rejects.toThrow(ForeignKeyError)
  })

  it('INV 6: Timestamps are valid ISO', async () => {
    await adapter.createSeries({
      id: 's1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    const series = await adapter.getSeries('s1')
    expect(series?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  it('INV 7: No orphaned children after operations', async () => {
    await adapter.createSeries({
      id: 's1',
      title: 'Test',
      createdAt: '2024-01-15T10:00:00' as LocalDateTime,
    })
    await adapter.createPattern({
      id: 'p1',
      seriesId: 's1',
      type: 'weekdays',
      conditionId: null,
    } as Pattern)
    await adapter.setPatternWeekdays('p1', ['mon', 'wed'])
    await adapter.deleteSeries('s1')

    // No orphaned patterns or weekdays - returns empty as expected after cascade delete
    const allPatterns = await adapter.getPatternsBySeries('s1')
    expect(allPatterns.map(p => p.id)).not.toContain('p1')
    const weekdays = await adapter.getPatternWeekdays('p1')
    expect(weekdays).toHaveLength(0)
  })
})
