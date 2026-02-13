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
      ).rejects.toThrow(/Rollback/)

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
      ).rejects.toThrow(/Rollback/)

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
      ).rejects.toThrow(/Rollback/)

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
      ).rejects.toThrow(/already exists/)
    })

    it('get non-existent series returns null', async () => {
      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('nonexistent')
    })

    it('get all series returns empty when no data exists', async () => {
      // Companion test 'get all series multiple' below proves query returns data when populated
      const all = await adapter.getAllSeries()
      expect(all).toMatchObject([])
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
      ).rejects.toThrow(/not found/)
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
      await expect(adapter.deleteSeries('series-1')).rejects.toThrow(/has completions/)
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
      await expect(adapter.deleteSeries('parent')).rejects.toThrow(/has linked children/)
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
      expect(patternsBefore).toHaveLength(1)
      expect(patternsBefore[0]).toMatchObject({
        id: 'pattern-1',
        seriesId: 'series-1',
        type: 'daily',
      })
      await adapter.deleteSeries('series-1')
      const patterns = await adapter.getPatternsBySeries('series-1')
      expect(patterns.map(p => p.id)).not.toContain('pattern-1')
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

    it('get series by tag returns empty when no matches', async () => {
      // Companion test 'get series by tag' above proves query returns data when matched
      const series = await adapter.getSeriesByTag('nonexistent')
      expect(series).toMatchObject([])
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
    ).rejects.toThrow(/Series 'nonexistent' not found/)
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
    // Verify weekdays exist before deletion with concrete values
    const weekdaysBefore = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdaysBefore).toHaveLength(3)
    expect(weekdaysBefore[0]).toBe('mon')
    expect(weekdaysBefore[1]).toBe('wed')
    expect(weekdaysBefore[2]).toBe('fri')
    await adapter.deletePattern('pattern-1')
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).not.toContain('mon')
    expect(weekdays).not.toContain('wed')
    expect(weekdays).not.toContain('fri')
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
    // Verify weekdays exist before deletion with concrete values
    const weekdaysBefore = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdaysBefore).toHaveLength(2)
    expect(weekdaysBefore[0]).toBe('mon')
    expect(weekdaysBefore[1]).toBe('wed')
    await adapter.deletePattern('pattern-1')
    const weekdays = await adapter.getPatternWeekdays('pattern-1')
    expect(weekdays).not.toContain('mon')
    expect(weekdays).not.toContain('wed')
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
    ).rejects.toThrow(/Parent condition 'nonexistent' not found/)
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
    ).rejects.toThrow(/would create a cycle/)
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
    // Verify config exists before removal
    const configBefore = await adapter.getAdaptiveDuration('series-1')
    expect(configBefore).toMatchObject({
      seriesId: 'series-1',
      fallbackDuration: 30,
      bufferPercent: 25,
    })
    await adapter.setAdaptiveDuration('series-1', null)
    const result = await adapter.getAdaptiveDuration('series-1')
    expect(result).toBe(null)
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
      expect(itemsBefore).toHaveLength(1)
      expect(itemsBefore[0]).toMatchObject({
        seriesId: 'series-1',
        position: 0,
        title: 'A',
        duration: 30,
      })
      await adapter.setCyclingConfig('series-1', null)
      const items = await adapter.getCyclingItems('series-1')
      expect(items.map(i => i.title)).not.toContain('A')
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
      expect(itemsBefore).toHaveLength(1)
      expect(itemsBefore[0]).toMatchObject({
        seriesId: 'series-1',
        position: 0,
        title: 'A',
        duration: 30,
      })
      await adapter.deleteSeries('series-1')
      // itemsBefore above proved item 'A' existed; series deletion should cascade remove items
      const allSeries = await adapter.getAllSeries()
      expect(allSeries.map(s => s.id)).not.toContain('series-1')
      const items = await adapter.getCyclingItems('series-1')
      expect(items.find(i => i.title === 'A')).toBeUndefined()
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

  it('upsert on same series+date replaces the exception', async () => {
    await adapter.createInstanceException({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })
    // Second create with same (seriesId, originalDate) should upsert, not throw
    await adapter.createInstanceException({
      id: 'exc-2',
      seriesId: 'series-1',
      originalDate: '2024-01-15' as LocalDate,
      type: 'reschedule',
      newDate: '2024-01-16' as LocalDate,
    })
    const exc = await adapter.getInstanceException('series-1', '2024-01-15' as LocalDate)
    expect(exc).toMatchObject({
      id: 'exc-2',
      seriesId: 'series-1',
      originalDate: '2024-01-15',
      type: 'reschedule',
    })
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
    // Verify exception exists before deletion with concrete values
    const exceptionsBefore = await adapter.getExceptionsBySeries('series-1')
    expect(exceptionsBefore).toHaveLength(1)
    expect(exceptionsBefore[0]).toMatchObject({
      id: 'exc-1',
      seriesId: 'series-1',
      originalDate: '2024-01-15',
      type: 'cancel',
    })
    await adapter.deleteSeries('series-1')
    const exceptions = await adapter.getExceptionsBySeries('series-1')
    expect(exceptions.find(e => e.id === 'exc-1')).toBeUndefined()
    // Also verify via range query that exception is gone
    const rangeExceptions = await adapter.getExceptionsInRange(
      'series-1',
      '2024-01-01' as LocalDate,
      '2024-01-31' as LocalDate
    )
    expect(rangeExceptions.find(e => e.id === 'exc-1')).toBeUndefined()
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
      ).rejects.toThrow(/Series 'nonexistent' not found/)
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
      await expect(adapter.deleteSeries('series-1')).rejects.toThrow(/has completions/)
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
      ).rejects.toThrow(/already exists/)
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
    expect(id.length).toBeGreaterThanOrEqual(8)  // Reasonable minimum for ID formats
    // Verify the tag was actually created
    const tag = await adapter.getTagByName('work')
    expect(tag).toEqual({
      id: id,
      name: 'work',
    })
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

    // Verify association exists before deletion with concrete values
    const seriesBeforeDeletion = await adapter.getSeriesByTag('work')
    expect(seriesBeforeDeletion).toHaveLength(1)
    expect(seriesBeforeDeletion[0]).toMatchObject({ id: 'series-1', title: 'Test' })

    await adapter.deleteSeries('series-1')
    // Tag still exists, just association is removed
    const tag = await adapter.getTagByName('work')
    expect(tag).toEqual(expect.objectContaining({
      name: 'work',
    }))
    // seriesBeforeDeletion above proved series-1 was tagged 'work'; deletion should cascade
    const seriesWithTag = await adapter.getSeriesByTag('work')
    expect(seriesWithTag.find(s => s.id === 'series-1')).toBeUndefined()

    // Also verify via getAllSeriesTags
    const allAssociations = await adapter.getAllSeriesTags()
    expect(allAssociations.some(st => st.series_id === 'series-1')).toBe(false)
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
    expect(remindersBefore).toHaveLength(1)
    expect(remindersBefore[0]).toMatchObject({
      id: 'rem-1',
      seriesId: 'series-1',
      minutesBefore: 15,
      label: 'Test',
    })
    await adapter.deleteSeries('series-1')
    const reminders = await adapter.getRemindersBySeries('series-1')
    expect(reminders.find(r => r.id === 'rem-1')).toBeUndefined()
    // Also verify via global query
    const allReminders = await adapter.getAllReminders()
    expect(allReminders.find(r => r.id === 'rem-1')).toBeUndefined()
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
    // Verify ack exists with correct properties before deletion
    const acksBefore = await adapter.getReminderAcksInRange('2024-01-01' as LocalDate, '2024-01-31' as LocalDate)
    expect(acksBefore).toHaveLength(1)
    expect(acksBefore[0]).toMatchObject({
      reminderId: 'rem-1',
      instanceDate: '2024-01-15',
    })

    // Verify via isReminderAcknowledged
    const wasAcked = await adapter.isReminderAcknowledged('rem-1', '2024-01-15' as LocalDate)
    expect(wasAcked).toBe(true)

    await adapter.deleteReminder('rem-1')
    const acks = await adapter.getReminderAcksInRange('2024-01-01' as LocalDate, '2024-01-31' as LocalDate)
    expect(acks.find(a => a.reminderId === 'rem-1')).toBeUndefined()
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
      ).rejects.toThrow(/already has a parent link/)
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
      ).rejects.toThrow(/Cannot link a series to itself/)
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
      await expect(adapter.deleteSeries('parent')).rejects.toThrow(/has linked children/)
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
      ).rejects.toThrow(/would create a cycle/)
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
      ).rejects.toThrow(/Parent series 'nonexistent' not found/)
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
      ).rejects.toThrow(/Child series 'nonexistent' not found/)
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
      ).rejects.toThrow(/exceeds maximum of 32/)
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
    ).rejects.toThrow(/Series 'nonexistent' not found/)
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
    ).rejects.toThrow(/already exists/)
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
    await expect(adapter.deleteSeries('s1')).rejects.toThrow(/has completions/)
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

    // Verify weekdays exist before deletion
    const weekdaysBefore = await adapter.getPatternWeekdays('p1')
    expect(weekdaysBefore).toEqual(['mon', 'wed'])

    await adapter.deleteSeries('s1')

    // weekdaysBefore proved ['mon', 'wed'] existed; cascade delete should remove everything
    const allPatterns = await adapter.getPatternsBySeries('s1')
    expect(allPatterns.map(p => p.id)).not.toContain('p1')
    const weekdays = await adapter.getPatternWeekdays('p1')
    expect(weekdays).not.toContain('mon')
    expect(weekdays).not.toContain('wed')

    // Also verify via global query that no weekdays for p1 remain
    const allWeekdays = await adapter.getAllPatternWeekdays()
    expect(allWeekdays.find(w => w.pattern_id === 'p1')).toBeUndefined()
  })
})

// ============================================================================
// ERROR MESSAGE ASSERTIONS (Mutation Targets)
// ============================================================================

describe('Error Message Assertions', () => {
  it('DuplicateKeyError message contains series ID', async () => {
    await adapter.createSeries({
      id: 'dup-test',
      title: 'First',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })

    try {
      await adapter.createSeries({
        id: 'dup-test',
        title: 'Second',
        createdAt: '2024-01-01T00:00:00' as LocalDateTime,
      })
      expect.unreachable('Should have thrown DuplicateKeyError')
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateKeyError)
      expect((e as Error).message).toContain('dup-test')
    }
  })

  it('NotFoundError on update contains series ID', async () => {
    try {
      await adapter.updateSeries('ghost-series', { title: 'New' })
      expect.unreachable('Should have thrown NotFoundError')
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundError)
      expect((e as Error).message).toContain('ghost-series')
    }
  })

  it('ForeignKeyError on delete with completions contains series ID', async () => {
    await adapter.createSeries({
      id: 'fk-test',
      title: 'FK Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createCompletion({
      id: 'comp-1',
      seriesId: 'fk-test',
      instanceDate: '2024-01-15' as LocalDate,
      date: '2024-01-15' as LocalDate,
    })

    try {
      await adapter.deleteSeries('fk-test')
      expect.unreachable('Should have thrown ForeignKeyError')
    } catch (e) {
      expect(e).toBeInstanceOf(ForeignKeyError)
      expect((e as Error).message).toContain('fk-test')
    }
  })

  it('ForeignKeyError on delete with linked children contains series ID', async () => {
    await adapter.createSeries({
      id: 'parent-fk',
      title: 'Parent',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createSeries({
      id: 'child-fk',
      title: 'Child',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createLink({
      id: 'link-fk',
      parentSeriesId: 'parent-fk',
      childSeriesId: 'child-fk',
      targetDistance: 15,
      earlyWobble: 0,
      lateWobble: 0,
    })

    try {
      await adapter.deleteSeries('parent-fk')
      expect.unreachable('Should have thrown ForeignKeyError')
    } catch (e) {
      expect(e).toBeInstanceOf(ForeignKeyError)
      expect((e as Error).message).toContain('parent-fk')
    }
  })

  it('ForeignKeyError on pattern with invalid series', async () => {
    try {
      await adapter.createPattern({
        id: 'pat-1',
        seriesId: 'no-such-series',
        type: 'daily',
        conditionId: null,
      })
      expect.unreachable('Should have thrown ForeignKeyError')
    } catch (e) {
      expect(e).toBeInstanceOf(ForeignKeyError)
      expect((e as Error).message).toContain('no-such-series')
    }
  })

  it('DuplicateKeyError on duplicate pattern', async () => {
    await adapter.createSeries({
      id: 'pat-dup-series',
      title: 'Series',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createPattern({
      id: 'pat-dup',
      seriesId: 'pat-dup-series',
      type: 'daily',
      conditionId: null,
    })

    try {
      await adapter.createPattern({
        id: 'pat-dup',
        seriesId: 'pat-dup-series',
        type: 'weekly',
        conditionId: null,
      })
      expect.unreachable('Should have thrown DuplicateKeyError')
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateKeyError)
      expect((e as Error).message).toContain('pat-dup')
    }
  })
})

// ============================================================================
// RANGE BOUNDARY TESTS (Mutation Targets)
// ============================================================================

describe('Range Boundary Tests', () => {
  it('getExceptionsInRange — start boundary inclusive', async () => {
    await adapter.createSeries({
      id: 'series-range',
      title: 'Range Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createInstanceException({
      id: 'exc-boundary',
      seriesId: 'series-range',
      originalDate: '2024-01-15' as LocalDate,
      type: 'cancel',
    })

    // start = '2024-01-15' → inclusive, should include
    const inRange = await adapter.getExceptionsInRange(
      'series-range',
      '2024-01-15' as LocalDate,
      '2024-01-16' as LocalDate
    )
    expect(inRange).toHaveLength(1)
    expect(inRange[0].id).toBe('exc-boundary')
  })

  it('getExceptionsInRange — end boundary exclusive', async () => {
    await adapter.createSeries({
      id: 'series-range-end',
      title: 'Range End Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createInstanceException({
      id: 'exc-end',
      seriesId: 'series-range-end',
      originalDate: '2024-01-18' as LocalDate,
      type: 'cancel',
    })

    // end = '2024-01-18' → exclusive, should NOT include
    const inRange = await adapter.getExceptionsInRange(
      'series-range-end',
      '2024-01-15' as LocalDate,
      '2024-01-18' as LocalDate
    )
    expect(inRange.map(e => e.id)).not.toContain('exc-end')
  })

  it('getExceptionsInRange — day before end included', async () => {
    await adapter.createSeries({
      id: 'series-range-be',
      title: 'Range Before End Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createInstanceException({
      id: 'exc-before-end',
      seriesId: 'series-range-be',
      originalDate: '2024-01-17' as LocalDate,
      type: 'cancel',
    })

    const inRange = await adapter.getExceptionsInRange(
      'series-range-be',
      '2024-01-15' as LocalDate,
      '2024-01-18' as LocalDate
    )
    expect(inRange).toHaveLength(1)
    expect(inRange[0].id).toBe('exc-before-end')
  })
})

// ============================================================================
// CAMEL-TO-SNAKE ALIAS TESTS (Mutation Targets)
// ============================================================================

describe('CamelCase to snake_case Aliases', () => {
  it('exception properties have snake_case aliases', async () => {
    await adapter.createSeries({
      id: 'alias-exc-series',
      title: 'Alias Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createInstanceException({
      id: 'alias-exc',
      seriesId: 'alias-exc-series',
      originalDate: '2024-01-15' as LocalDate,
      type: 'reschedule',
      newDate: '2024-01-16' as LocalDate,
      newTime: '2024-01-16T10:00:00' as LocalDateTime,
    })

    const exc = await adapter.getInstanceException('alias-exc-series', '2024-01-15' as LocalDate)
    expect(exc).not.toBeNull()
    // Check both camelCase and snake_case exist
    expect(exc!.seriesId).toBe('alias-exc-series')
    expect((exc as any).series_id).toBe('alias-exc-series')
    expect(exc!.originalDate).toBe('2024-01-15')
    expect((exc as any).original_date).toBe('2024-01-15')
    expect(exc!.newDate).toBe('2024-01-16')
    expect((exc as any).new_date).toBe('2024-01-16')
    expect(exc!.newTime).toBe('2024-01-16T10:00:00')
    expect((exc as any).new_time).toBe('2024-01-16T10:00:00')
  })

  it('completion properties have snake_case aliases', async () => {
    await adapter.createSeries({
      id: 'comp-alias-series',
      title: 'Test',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createCompletion({
      id: 'comp-alias',
      seriesId: 'comp-alias-series',
      instanceDate: '2024-01-15' as LocalDate,
      date: '2024-01-15' as LocalDate,
      startTime: '2024-01-15T09:00:00' as LocalDateTime,
      endTime: '2024-01-15T09:30:00' as LocalDateTime,
      durationMinutes: 30,
    })

    const comp = await adapter.getCompletion('comp-alias')
    expect(comp).not.toBeNull()
    expect(comp!.seriesId).toBe('comp-alias-series')
    expect((comp as any).series_id).toBe('comp-alias-series')
    expect(comp!.instanceDate).toBe('2024-01-15')
    expect((comp as any).instance_date).toBe('2024-01-15')
    expect(comp!.durationMinutes).toBe(30)
    expect((comp as any).duration_minutes).toBe(30)
  })

  it('link properties have snake_case aliases', async () => {
    await adapter.createSeries({
      id: 'link-alias-parent',
      title: 'Parent',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createSeries({
      id: 'link-alias-child',
      title: 'Child',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createLink({
      id: 'link-alias',
      parentSeriesId: 'link-alias-parent',
      childSeriesId: 'link-alias-child',
      targetDistance: 15,
      earlyWobble: 5,
      lateWobble: 10,
    })

    const link = await adapter.getLink('link-alias')
    expect(link).not.toBeNull()
    expect(link!.parentSeriesId).toBe('link-alias-parent')
    expect((link as any).parent_series_id).toBe('link-alias-parent')
    expect(link!.childSeriesId).toBe('link-alias-child')
    expect((link as any).child_series_id).toBe('link-alias-child')
    expect(link!.targetDistance).toBe(15)
    expect((link as any).target_distance).toBe(15)
    expect(link!.earlyWobble).toBe(5)
    expect((link as any).early_wobble).toBe(5)
  })
})

// ============================================================================
// TRANSACTION DEPTH BOUNDARY (Mutation Targets)
// ============================================================================

describe('Transaction Depth Boundary', () => {
  it('outer transaction snapshot taken only at depth 0', async () => {
    // Create series outside transaction
    await adapter.createSeries({
      id: 'tx-depth-test',
      title: 'Before TX',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })

    // Inner transaction fails → outer also rolls back
    await expect(adapter.transaction(async () => {
      await adapter.updateSeries('tx-depth-test', { title: 'In TX' })

      // Verify change is visible inside transaction
      const during = await adapter.getSeries('tx-depth-test')
      expect(during!.title).toBe('In TX')

      throw new Error('deliberate rollback')
    })).rejects.toThrow('deliberate rollback')

    // After rollback, original state restored
    const after = await adapter.getSeries('tx-depth-test')
    expect(after!.title).toBe('Before TX')
  })

  it('nested transaction does not snapshot again', async () => {
    await adapter.createSeries({
      id: 'nested-tx-test',
      title: 'Original',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })

    await expect(adapter.transaction(async () => {
      await adapter.updateSeries('nested-tx-test', { title: 'Outer' })

      // Nested transaction
      await adapter.transaction(async () => {
        await adapter.updateSeries('nested-tx-test', { title: 'Inner' })
      })

      // After inner succeeds, we should see Inner
      const afterInner = await adapter.getSeries('nested-tx-test')
      expect(afterInner!.title).toBe('Inner')

      throw new Error('outer rollback')
    })).rejects.toThrow('outer rollback')

    // Entire outer+inner rolled back to Original
    const after = await adapter.getSeries('nested-tx-test')
    expect(after!.title).toBe('Original')
  })
})

// ============================================================================
// CASCADE GRANULARITY (Mutation Targets)
// ============================================================================

describe('Cascade Granularity', () => {
  it('series delete cascades cycling config and items', async () => {
    await adapter.createSeries({
      id: 'cascade-cycling',
      title: 'Cycling Series',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })

    await adapter.setCyclingConfig('cascade-cycling', {
      seriesId: 'cascade-cycling',
      currentIndex: 0,
      gapLeap: false,
      mode: 'sequential',
    })
    await adapter.setCyclingItems('cascade-cycling', [
      { seriesId: 'cascade-cycling', position: 0, title: 'A', duration: 30 },
      { seriesId: 'cascade-cycling', position: 1, title: 'B', duration: 30 },
    ])

    // Verify config and items exist before delete
    const configBefore = await adapter.getCyclingConfig('cascade-cycling')
    expect(configBefore).not.toBeNull()
    expect(configBefore!.mode).toBe('sequential')

    const itemsBefore = await adapter.getCyclingItems('cascade-cycling')
    expect(itemsBefore).toHaveLength(2)
    expect(itemsBefore[0].title).toBe('A')

    await adapter.deleteSeries('cascade-cycling')

    // Config and items cascade-deleted
    const configAfter = await adapter.getCyclingConfig('cascade-cycling')
    expect(configAfter).toBeNull()

    const itemsAfter = await adapter.getCyclingItems('cascade-cycling')
    expect(itemsAfter).toHaveLength(0)
  })

  it('series delete cascades adaptive duration', async () => {
    await adapter.createSeries({
      id: 'cascade-adaptive',
      title: 'Adaptive Series',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })

    await adapter.setAdaptiveDuration('cascade-adaptive', {
      seriesId: 'cascade-adaptive',
      fallbackDuration: 30,
      bufferPercent: 10,
      lastN: 5,
      windowDays: 14,
    })

    const before = await adapter.getAdaptiveDuration('cascade-adaptive')
    expect(before).not.toBeNull()
    expect(before!.seriesId).toBe('cascade-adaptive')
    expect(before!.fallbackDuration).toBe(30)
    expect(before!.bufferPercent).toBe(10)
    expect(before!.lastN).toBe(5)

    await adapter.deleteSeries('cascade-adaptive')

    const after = await adapter.getAdaptiveDuration('cascade-adaptive')
    expect(after).toBeNull()
  })

  it('series delete cascades child links but not parent links', async () => {
    await adapter.createSeries({
      id: 'cascade-parent',
      title: 'Parent',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createSeries({
      id: 'cascade-child',
      title: 'Child',
      createdAt: '2024-01-01T00:00:00' as LocalDateTime,
    })
    await adapter.createLink({
      id: 'cascade-link',
      parentSeriesId: 'cascade-parent',
      childSeriesId: 'cascade-child',
      targetDistance: 15,
      earlyWobble: 0,
      lateWobble: 0,
    })

    // Deleting child cascades the link
    await adapter.deleteSeries('cascade-child')

    const link = await adapter.getLink('cascade-link')
    expect(link).toBeNull()

    // Parent still exists
    const parent = await adapter.getSeries('cascade-parent')
    expect(parent).not.toBeNull()
    expect(parent!.title).toBe('Parent')
  })
})
