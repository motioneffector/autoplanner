/**
 * Segment 18: Series Assembly Tests
 *
 * Tests the fat-series marshaling in series-assembly.ts:
 * reconstructConditionTree, persistConditionTree, loadFullSeries,
 * loadAllFullSeries, persistNewSeries.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  reconstructConditionTree,
  persistConditionTree,
  loadFullSeries,
  loadAllFullSeries,
  persistNewSeries,
} from '../src/series-assembly'
import { createMockAdapter, type Adapter, type Condition } from '../src/adapter'
import type { LocalDateTime } from '../src/time-date'

describe('Segment 18: Series Assembly', () => {
  let adapter: Adapter

  beforeEach(() => {
    adapter = createMockAdapter()
  })

  // ========================================================================
  // reconstructConditionTree
  // ========================================================================

  describe('reconstructConditionTree', () => {
    it('returns null for missing root ID but succeeds for valid ID', () => {
      const cond: Condition = {
        id: 'c1', seriesId: 's1', parentId: null,
        type: 'weekday', days: [1],
      }
      const conditionsById = new Map([['c1', cond]])
      const childrenByParent = new Map<string, Condition[]>()
      // Missing ID → null
      expect(reconstructConditionTree('nonexistent', conditionsById, childrenByParent)).toBe(null)
      // Valid ID → non-null with correct type
      const valid = reconstructConditionTree('c1', conditionsById, childrenByParent)
      expect(valid!.type).toBe('weekday')
    })

    it('reconstructs a single leaf condition and strips adapter fields', () => {
      const cond: Condition = {
        id: 'c1', seriesId: 's1', parentId: null,
        type: 'completionCount', seriesRef: 'ref1', comparison: '>=', value: 3, windowDays: 7,
      }
      const conditionsById = new Map([['c1', cond]])
      const childrenByParent = new Map<string, Condition[]>()

      const result = reconstructConditionTree('c1', conditionsById, childrenByParent)
      expect(result).toEqual({
        type: 'completionCount', seriesRef: 'ref1', comparison: '>=', value: 3, windowDays: 7,
      })
      // Adapter fields stripped — result keys should be exactly the domain fields
      const keys = Object.keys(result!)
      expect(keys).not.toContain('id')
      expect(keys).not.toContain('seriesId')
      expect(keys).not.toContain('parentId')
    })

    it('reconstructs AND with two children', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'and' }
      const child1: Condition = {
        id: 'c1', seriesId: 's1', parentId: 'r',
        type: 'completionCount', seriesRef: 'ref1', comparison: '>=', value: 1, windowDays: 7,
      }
      const child2: Condition = {
        id: 'c2', seriesId: 's1', parentId: 'r',
        type: 'weekday', days: [1, 3, 5],
      }

      const conditionsById = new Map([['r', root], ['c1', child1], ['c2', child2]])
      const childrenByParent = new Map([['r', [child1, child2]]])

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result).toMatchObject({
        type: 'and',
        conditions: [
          { type: 'completionCount', seriesRef: 'ref1', comparison: '>=', value: 1, windowDays: 7 },
          { type: 'weekday', days: [1, 3, 5] },
        ],
      })
    })

    it('reconstructs NOT wrapping a leaf', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'not' }
      const child: Condition = {
        id: 'c1', seriesId: 's1', parentId: 'r',
        type: 'completionCount', seriesRef: 'ref1', comparison: '<', value: 5, windowDays: 30,
      }

      const conditionsById = new Map([['r', root], ['c1', child]])
      const childrenByParent = new Map([['r', [child]]])

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result).toMatchObject({
        type: 'not',
        condition: { type: 'completionCount', seriesRef: 'ref1', comparison: '<', value: 5, windowDays: 30 },
      })
    })

    it('reconstructs nested OR containing AND children', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'or' }
      const andNode: Condition = { id: 'a', seriesId: 's1', parentId: 'r', type: 'and' }
      const leaf1: Condition = {
        id: 'l1', seriesId: 's1', parentId: 'a',
        type: 'completionCount', seriesRef: 'x', comparison: '>=', value: 1, windowDays: 7,
      }
      const leaf2: Condition = {
        id: 'l2', seriesId: 's1', parentId: 'r',
        type: 'weekday', days: [0, 6],
      }

      const conditionsById = new Map([['r', root], ['a', andNode], ['l1', leaf1], ['l2', leaf2]])
      const childrenByParent = new Map([
        ['r', [andNode, leaf2]],
        ['a', [leaf1]],
      ])

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result).toMatchObject({
        type: 'or',
        conditions: [
          {
            type: 'and',
            conditions: [
              { type: 'completionCount', seriesRef: 'x', comparison: '>=', value: 1, windowDays: 7 },
            ],
          },
          { type: 'weekday', days: [0, 6] },
        ],
      })
    })
  })

  // ========================================================================
  // persistConditionTree round-trip
  // ========================================================================

  describe('persistConditionTree', () => {
    it('persists a leaf condition as one adapter row', async () => {
      const seriesId = 's1'
      await adapter.createSeries({ id: seriesId, title: 'Test', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const condition = { type: 'completionCount' as const, seriesRef: 'ref1', comparison: '>=', value: 3, windowDays: 7 }
      const rootId = await persistConditionTree(adapter, seriesId, condition, null)

      const rows = await adapter.getConditionsBySeries(seriesId)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.id).toBe(rootId)
      expect(rows[0]!.type).toBe('completionCount')
      expect(rows[0]!.parentId).toBe(null)
    })

    it('persists AND with 2 children as 3 rows', async () => {
      const seriesId = 's1'
      await adapter.createSeries({ id: seriesId, title: 'Test', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'completionCount' as const, seriesRef: 'a', comparison: '>=', value: 1, windowDays: 7 },
          { type: 'weekday' as const, days: [1, 3] },
        ],
      }
      const rootId = await persistConditionTree(adapter, seriesId, condition, null)

      const rows = await adapter.getConditionsBySeries(seriesId)
      expect(rows).toHaveLength(3)

      const root = rows.find(r => r.id === rootId)
      expect(root!.type).toBe('and')
      expect(root!.parentId).toBe(null)

      const children = rows.filter(r => r.parentId === rootId)
      expect(children).toHaveLength(2)
      expect(children[0]!.type).toBe('completionCount')
      expect(children[1]!.type).toBe('weekday')
    })

    it('round-trips: persist -> reconstruct matches original', async () => {
      const seriesId = 's1'
      await adapter.createSeries({ id: seriesId, title: 'Test', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const original = {
        type: 'and' as const,
        conditions: [
          { type: 'completionCount' as const, seriesRef: 'ref1', comparison: '>=', value: 5, windowDays: 14 },
          { type: 'not' as const, condition: { type: 'weekday' as const, days: [0, 6] } },
        ],
      }
      const rootId = await persistConditionTree(adapter, seriesId, original, null)

      const rows = await adapter.getConditionsBySeries(seriesId)
      const conditionsById = new Map<string, Condition>()
      const childrenByParent = new Map<string, Condition[]>()
      for (const c of rows) {
        conditionsById.set(c.id, c)
        if (c.parentId) {
          if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, [])
          childrenByParent.get(c.parentId)!.push(c)
        }
      }

      const reconstructed = reconstructConditionTree(rootId, conditionsById, childrenByParent)
      expect(reconstructed).toMatchObject(original)
    })
  })

  // ========================================================================
  // loadFullSeries
  // ========================================================================

  describe('loadFullSeries', () => {
    it('returns null for non-existent series, loads valid series correctly', async () => {
      // Non-existent → null
      expect(await loadFullSeries(adapter, 'nonexistent')).toBe(null)

      // Valid → present with correct data
      await adapter.createSeries({ id: 's1', title: 'Minimal', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const result = await loadFullSeries(adapter, 's1')
      expect(result!.id).toBe('s1')
      expect(result!.title).toBe('Minimal')
      expect(result!.createdAt).toBe('2025-01-01T00:00:00')
    })

    it('loads series with patterns and weekday conversion', async () => {
      await adapter.createSeries({ id: 's1', title: 'Weekly', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'weekly', time: '09:00:00' })
      await adapter.setPatternWeekdays('p1', ['1', '3', '5'])

      const result = await loadFullSeries(adapter, 's1')
      expect(result!.patterns).toHaveLength(1)
      expect(result!.patterns[0]!.type).toBe('weekly')
      // Weekday conversion: adapter stores string[], loaded as number[]
      expect(result!.patterns[0]!.daysOfWeek).toEqual([1, 3, 5])
      // seriesId should be stripped from pattern
      expect(Object.keys(result!.patterns[0]!)).not.toContain('seriesId')
    })

    it('loads series with all features', async () => {
      await adapter.createSeries({
        id: 's1', title: 'Full', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
      })
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'daily' })
      await adapter.addTagToSeries('s1', 'exercise')
      await adapter.addTagToSeries('s1', 'morning')
      await adapter.setCyclingConfig('s1', {
        seriesId: 's1', currentIndex: 2, gapLeap: true, mode: 'sequential',
      })
      await adapter.setCyclingItems('s1', [
        { seriesId: 's1', position: 0, title: 'A', duration: 0 },
        { seriesId: 's1', position: 1, title: 'B', duration: 0 },
      ])
      await adapter.setAdaptiveDuration('s1', {
        seriesId: 's1', fallback: 30, lastN: 5, multiplier: 1.2,
      })

      const result = await loadFullSeries(adapter, 's1')
      expect(result!.tags).toEqual(['exercise', 'morning'])
      expect(result!.cycling).toMatchObject({
        currentIndex: 2,
        gapLeap: true,
        mode: 'sequential',
        items: ['A', 'B'],
      })
      expect(result!.adaptiveDuration).toMatchObject({ fallback: 30, lastN: 5, multiplier: 1.2 })
    })
  })

  // ========================================================================
  // loadAllFullSeries
  // ========================================================================

  describe('loadAllFullSeries', () => {
    it('returns all series fully assembled, empty when none exist', async () => {
      // Empty adapter → empty results; adding series → returns them
      await adapter.createSeries({ id: 's1', title: 'First', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createSeries({ id: 's2', title: 'Second', createdAt: '2025-01-02T00:00:00' as LocalDateTime })
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'daily' })

      const result = await loadAllFullSeries(adapter)
      expect(result).toHaveLength(2)
      const s1 = result.find(s => s.id === 's1')
      const s2 = result.find(s => s.id === 's2')
      expect(s1!.title).toBe('First')
      expect(s1!.patterns).toHaveLength(1)
      expect(s1!.patterns[0]!.type).toBe('daily')
      expect(s2!.title).toBe('Second')
    })
  })

  // ========================================================================
  // persistNewSeries + loadFullSeries round-trip
  // ========================================================================

  describe('persistNewSeries round-trip', () => {
    it('persists minimal series and loads it back', async () => {
      await persistNewSeries(adapter, {
        id: 's1', title: 'Minimal', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
      })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('s1')
      expect(loaded!.title).toBe('Minimal')
    })

    it('persists series with patterns, tags, cycling, adaptiveDuration and loads them back', async () => {
      await persistNewSeries(adapter, {
        id: 's1',
        title: 'Full',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [
          { type: 'weekly', time: '08:00:00', daysOfWeek: [1, 3, 5] },
          { type: 'daily', time: '09:00:00', duration: 30, fixed: true },
        ],
        tags: ['fitness', 'routine'],
        cycling: { currentIndex: 0, gapLeap: false, items: ['Push', 'Pull', 'Legs'] },
        adaptiveDuration: { fallback: 45, lastN: 3 },
      })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.patterns).toHaveLength(2)

      const weeklyPat = loaded!.patterns.find(p => p.type === 'weekly')
      expect(weeklyPat!.daysOfWeek).toEqual([1, 3, 5])
      expect(weeklyPat!.time).toBe('08:00:00')

      const dailyPat = loaded!.patterns.find(p => p.type === 'daily')
      expect(dailyPat!.duration).toBe(30)
      expect(dailyPat!.fixed).toBe(true)

      expect(loaded!.tags).toEqual(['fitness', 'routine'])
      expect(loaded!.cycling).toMatchObject({
        currentIndex: 0,
        gapLeap: false,
        items: ['Push', 'Pull', 'Legs'],
      })
      expect(loaded!.adaptiveDuration).toMatchObject({ fallback: 45, lastN: 3 })
    })

    it('persists series with condition tree on pattern and loads it back', async () => {
      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'completionCount' as const, seriesRef: 'ref1', comparison: '>=', value: 3, windowDays: 7 },
          { type: 'weekday' as const, days: [1, 2, 3, 4, 5] },
        ],
      }
      await persistNewSeries(adapter, {
        id: 's1',
        title: 'Conditional',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'daily', time: '10:00:00', condition }],
      })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.patterns).toHaveLength(1)
      expect(loaded!.patterns[0]!.condition).toMatchObject(condition)
    })
  })

  // ========================================================================
  // Mutation-killing: persistNewSeries optional field spreads (L192-217)
  // ========================================================================

  describe('persistNewSeries optional fields', () => {
    it('persists locked, startDate, endDate, updatedAt when provided', async () => {
      await persistNewSeries(adapter, {
        id: 's-opt',
        title: 'WithOptionals',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        locked: true,
        startDate: '2025-02-01' as import('../src/time-date').LocalDate,
        endDate: '2025-12-31' as import('../src/time-date').LocalDate,
        updatedAt: '2025-01-15T12:00:00' as LocalDateTime,
        patterns: [],
      })

      const loaded = await loadFullSeries(adapter, 's-opt')
      expect(loaded!.locked).toBe(true)
      expect(loaded!.startDate).toBe('2025-02-01')
      expect(loaded!.endDate).toBe('2025-12-31')
      expect(loaded!.updatedAt).toBe('2025-01-15T12:00:00')
    })

    it('omits locked, startDate, endDate, updatedAt when not provided', async () => {
      await persistNewSeries(adapter, {
        id: 's-bare',
        title: 'Bare',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
      })
      await persistNewSeries(adapter, {
        id: 's-full',
        title: 'Full',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        locked: true,
        startDate: '2025-02-01' as import('../src/time-date').LocalDate,
        endDate: '2025-12-31' as import('../src/time-date').LocalDate,
        updatedAt: '2025-01-15T12:00:00' as LocalDateTime,
        patterns: [],
      })

      const series = await adapter.getSeries('s-bare')
      expect(series).not.toBeNull()
      expect(series!.title).toBe('Bare')
      const bareKeys = Object.keys(series!)
      expect(bareKeys).not.toContain('locked')
      expect(bareKeys).not.toContain('startDate')
      expect(bareKeys).not.toContain('endDate')
      expect(bareKeys).not.toContain('updatedAt')

      const full = await loadFullSeries(adapter, 's-full')
      expect(full!.locked).toBe(true)
      expect(full!.startDate).toBe('2025-02-01')
      expect(full!.endDate).toBe('2025-12-31')
      expect(full!.updatedAt).toBe('2025-01-15T12:00:00')
    })

    it('persists pattern optional fields: time, n, day, month, weekday, allDay, duration, fixed', async () => {
      await persistNewSeries(adapter, {
        id: 's-patopt',
        title: 'PatOpt',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{
          type: 'nthWeekdayOfMonth',
          time: '14:00:00',
          n: 2,
          day: 15,
          month: 6,
          weekday: 'thu',
          allDay: false,
          duration: 45,
          fixed: true,
        }],
      })

      const loaded = await loadFullSeries(adapter, 's-patopt')
      const pat = loaded!.patterns[0]!
      expect(pat.time).toBe('14:00:00')
      expect(pat.n).toBe(2)
      expect(pat.day).toBe(15)
      expect(pat.month).toBe(6)
      expect(pat.weekday).toBe('thu')
      expect(pat.allDay).toBe(false)
      expect(pat.duration).toBe(45)
      expect(pat.fixed).toBe(true)
    })

    it('omits pattern optional fields when not provided', async () => {
      await persistNewSeries(adapter, {
        id: 's-patbare',
        title: 'PatBare',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'daily' }],
      })
      await persistNewSeries(adapter, {
        id: 's-patfull',
        title: 'PatFull',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'nthWeekdayOfMonth', time: '14:00:00', n: 2, day: 15, month: 6, weekday: 'thu', allDay: false, duration: 45, fixed: true }],
      })

      const loaded = await loadFullSeries(adapter, 's-patbare')
      const pat = loaded!.patterns[0]!
      expect(pat.time).toBeUndefined()
      expect(pat.n).toBeUndefined()
      expect(pat.day).toBeUndefined()
      expect(pat.month).toBeUndefined()
      expect(pat.weekday).toBeUndefined()
      expect(pat.allDay).toBeUndefined()
      expect(pat.duration).toBeUndefined()
      expect(pat.fixed).toBeUndefined()
      expect(pat.type).toBe('daily')

      const full = await loadFullSeries(adapter, 's-patfull')
      const fullPat = full!.patterns[0]!
      expect(fullPat.time).toBe('14:00:00')
      expect(fullPat.n).toBe(2)
      expect(fullPat.day).toBe(15)
      expect(fullPat.month).toBe(6)
      expect(fullPat.weekday).toBe('thu')
      expect(fullPat.allDay).toBe(false)
      expect(fullPat.duration).toBe(45)
      expect(fullPat.fixed).toBe(true)
    })
  })

  // ========================================================================
  // Mutation-killing: persistNewSeries array/guard paths (L198, 219, 225, 238)
  // ========================================================================

  describe('persistNewSeries guard paths', () => {
    it('handles undefined patterns gracefully', async () => {
      await persistNewSeries(adapter, {
        id: 's-nopat',
        title: 'NoPat',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
      } as FullSeries)

      const loaded = await loadFullSeries(adapter, 's-nopat')
      expect(loaded).toMatchObject({ id: 's-nopat', title: 'NoPat', patterns: [] })
    })

    it('handles undefined tags gracefully', async () => {
      await persistNewSeries(adapter, {
        id: 's-notag',
        title: 'NoTag',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
      })

      const loaded = await loadFullSeries(adapter, 's-notag')
      expect(loaded!.tags).toBeUndefined()
      expect(loaded!.title).toBe('NoTag')

      await persistNewSeries(adapter, {
        id: 's-withtag', title: 'WithTag', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [], tags: ['exercise'],
      })
      const withTag = await loadFullSeries(adapter, 's-withtag')
      expect(withTag!.tags).toEqual(['exercise'])
    })

    it('handles pattern without daysOfWeek', async () => {
      await persistNewSeries(adapter, {
        id: 's-noweek',
        title: 'NoWeek',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'daily' }],
      })

      const loaded = await loadFullSeries(adapter, 's-noweek')
      expect(loaded!.patterns[0]!.daysOfWeek).toBeUndefined()
      expect(loaded!.patterns[0]!.type).toBe('daily')

      await persistNewSeries(adapter, {
        id: 's-withweek', title: 'WithWeek', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'weekly', daysOfWeek: [1, 3, 5] }],
      })
      const withWeek = await loadFullSeries(adapter, 's-withweek')
      expect(withWeek!.patterns[0]!.daysOfWeek).toEqual([1, 3, 5])
    })

    it('handles cycling without items', async () => {
      await persistNewSeries(adapter, {
        id: 's-noitems',
        title: 'NoItems',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { currentIndex: 0, gapLeap: false },
      })

      const loaded = await loadFullSeries(adapter, 's-noitems')
      expect(loaded!.cycling).toBeDefined()
      expect(loaded!.cycling).toMatchObject({ currentIndex: 0, items: [] })
      expect(loaded!.title).toBe('NoItems')

      await persistNewSeries(adapter, {
        id: 's-withitems', title: 'WithItems', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { currentIndex: 0, gapLeap: false, items: ['A', 'B'] },
      })
      const withItems = await loadFullSeries(adapter, 's-withitems')
      expect(withItems!.cycling!.items).toHaveLength(2)
      expect(withItems!.cycling!.items[0]).toBe('A')
      expect(withItems!.cycling!.items[1]).toBe('B')
    })

    it('handles undefined adaptiveDuration gracefully', async () => {
      await persistNewSeries(adapter, {
        id: 's-noadapt',
        title: 'NoAdapt',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
      })

      const loaded = await loadFullSeries(adapter, 's-noadapt')
      expect(loaded!.adaptiveDuration).toBeUndefined()
      expect(loaded!.title).toBe('NoAdapt')

      await persistNewSeries(adapter, {
        id: 's-withadapt', title: 'WithAdapt', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [], adaptiveDuration: { fallback: 30, lastN: 5 },
      })
      const withAdapt = await loadFullSeries(adapter, 's-withadapt')
      expect(withAdapt!.adaptiveDuration).toMatchObject({ fallback: 30, lastN: 5 })
    })
  })

  // ========================================================================
  // Mutation-killing: cycling defaults (L234-236)
  // ========================================================================

  describe('persistNewSeries cycling defaults', () => {
    it('currentIndex defaults to 0 via ?? when undefined', async () => {
      await persistNewSeries(adapter, {
        id: 's-cyc-def',
        title: 'CycDef',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { items: ['A', 'B'] } as any,
      })

      const loaded = await loadFullSeries(adapter, 's-cyc-def')
      expect(loaded!.cycling!.currentIndex).toBe(0)
    })

    it('gapLeap defaults to false via ?? when undefined', async () => {
      await persistNewSeries(adapter, {
        id: 's-gap-def',
        title: 'GapDef',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { currentIndex: 1, items: ['X'] } as any,
      })

      const loaded = await loadFullSeries(adapter, 's-gap-def')
      expect(loaded!.cycling!.gapLeap).toBe(false)
    })

    it('mode excluded from cycling config when not provided', async () => {
      await persistNewSeries(adapter, {
        id: 's-nomode',
        title: 'NoMode',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { currentIndex: 0, gapLeap: true, items: ['Y'] },
      })

      const config = await adapter.getCyclingConfig('s-nomode')
      expect(config).not.toBeNull()
      expect(config!.mode).toBeUndefined()
      expect(config!.currentIndex).toBe(0)
      expect(config!.gapLeap).toBe(true)

      await persistNewSeries(adapter, {
        id: 's-withmode2', title: 'WM', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [], cycling: { currentIndex: 0, gapLeap: false, mode: 'sequential', items: ['Z'] },
      })
      const withMode = await adapter.getCyclingConfig('s-withmode2')
      expect(withMode!.mode).toBe('sequential')
    })

    it('mode included in cycling config when provided', async () => {
      await persistNewSeries(adapter, {
        id: 's-withmode',
        title: 'WithMode',
        createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [],
        cycling: { currentIndex: 0, gapLeap: false, mode: 'sequential', items: ['Z'] },
      })

      const config = await adapter.getCyclingConfig('s-withmode')
      expect(config).not.toBeNull()
      expect(config!.mode).toBe('sequential')
    })
  })

  // ========================================================================
  // Mutation-killing: loadFullSeries field absence (L112-158)
  // ========================================================================

  describe('loadFullSeries field absence', () => {
    it('patterns without weekdays have no daysOfWeek property', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'daily' })
      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createPattern({ id: 'p2', seriesId: 's2', type: 'weekly' })
      await adapter.setPatternWeekdays('p2', ['1', '3'])

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.patterns).toHaveLength(1)
      expect(loaded!.patterns[0]!.daysOfWeek).toBeUndefined()
      expect(loaded!.patterns[0]!.type).toBe('daily')

      const withWeekdays = await loadFullSeries(adapter, 's2')
      expect(withWeekdays!.patterns[0]!.daysOfWeek).toEqual([1, 3])
    })

    it('series without conditions does not attach condition trees', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'daily' })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.patterns[0]!.condition).toBeUndefined()
      expect(loaded!.patterns[0]!.type).toBe('daily')

      await persistNewSeries(adapter, {
        id: 's2', title: 'WithCond', createdAt: '2025-01-01T00:00:00' as LocalDateTime,
        patterns: [{ type: 'daily', condition: { type: 'weekday' as const, days: [1, 2] } }],
      })
      const withCond = await loadFullSeries(adapter, 's2')
      expect(withCond!.patterns[0]!.condition).toMatchObject({ type: 'weekday', days: [1, 2] })
    })

    it('series without tags has no tags property', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.tags).toBeUndefined()
      expect(loaded!.title).toBe('T')

      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.addTagToSeries('s2', 'fitness')
      const withTags = await loadFullSeries(adapter, 's2')
      expect(withTags!.tags).toEqual(['fitness'])
    })

    it('series without cycling has no cycling property', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.cycling).toBeUndefined()
      expect(loaded!.title).toBe('T')

      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.setCyclingConfig('s2', { seriesId: 's2', currentIndex: 1, gapLeap: true })
      await adapter.setCyclingItems('s2', [{ seriesId: 's2', position: 0, title: 'X', duration: 0 }])
      const withCycling = await loadFullSeries(adapter, 's2')
      expect(withCycling!.cycling!.currentIndex).toBe(1)
    })

    it('series without adaptive duration has no adaptiveDuration property', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.adaptiveDuration).toBeUndefined()
      expect(loaded!.title).toBe('T')

      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.setAdaptiveDuration('s2', { seriesId: 's2', fallback: 20, lastN: 3, multiplier: 1.1 })
      const withAdaptive = await loadFullSeries(adapter, 's2')
      expect(withAdaptive!.adaptiveDuration!.fallback).toBe(20)
    })

    it('cycling with mode=null omits mode from assembled object', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.setCyclingConfig('s1', {
        seriesId: 's1', currentIndex: 0, gapLeap: false,
        // mode not provided → undefined
      })
      await adapter.setCyclingItems('s1', [])

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.cycling).toBeDefined()
      expect(loaded!.cycling!.mode).toBeUndefined()
      expect(loaded!.cycling!.currentIndex).toBe(0)
      expect(loaded!.cycling!.gapLeap).toBe(false)

      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.setCyclingConfig('s2', { seriesId: 's2', currentIndex: 0, gapLeap: false, mode: 'sequential' })
      await adapter.setCyclingItems('s2', [])
      const withMode = await loadFullSeries(adapter, 's2')
      expect(withMode!.cycling!.mode).toBe('sequential')
    })

    it('cycling with gapLeap=null omits gapLeap from assembled object', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      // The mock stores what we give it; set gapLeap to null explicitly
      await adapter.setCyclingConfig('s1', {
        seriesId: 's1', currentIndex: 0, gapLeap: null as any,
      })
      await adapter.setCyclingItems('s1', [])

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.cycling).toBeDefined()
      expect(loaded!.cycling!.gapLeap).toBeUndefined()
      expect(loaded!.cycling!.currentIndex).toBe(0)

      await adapter.createSeries({ id: 's2', title: 'T2', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.setCyclingConfig('s2', { seriesId: 's2', currentIndex: 0, gapLeap: true })
      await adapter.setCyclingItems('s2', [])
      const withGapLeap = await loadFullSeries(adapter, 's2')
      expect(withGapLeap!.cycling!.gapLeap).toBe(true)
    })

    it('pattern with conditionId but condition missing from map', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      // Create a condition so the conditions.length > 0 branch runs
      await adapter.createCondition({
        id: 'c-real', seriesId: 's1', parentId: null, type: 'weekday', days: [1],
      })
      // Create pattern that points to a DIFFERENT condition ID
      await adapter.createPattern({ id: 'p1', seriesId: 's1', type: 'daily', conditionId: 'c-missing' })

      const loaded = await loadFullSeries(adapter, 's1')
      expect(loaded!.patterns[0]!.condition).toBeUndefined()
      expect(loaded!.patterns[0]!.type).toBe('daily')

      await adapter.createPattern({ id: 'p2', seriesId: 's1', type: 'weekly', conditionId: 'c-real' })
      const reloaded = await loadFullSeries(adapter, 's1')
      const patWithCond = reloaded!.patterns.find(p => p.type === 'weekly')
      expect(patWithCond!.condition).toMatchObject({ type: 'weekday', days: [1] })
    })
  })

  // ========================================================================
  // Mutation-killing: reconstructConditionTree edge cases (L43-90)
  // ========================================================================

  describe('reconstructConditionTree edge cases', () => {
    it('AND with no children produces empty conditions array', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'and' }
      const child: Condition = { id: 'c1', seriesId: 's1', parentId: 'r', type: 'weekday', days: [1] }
      const conditionsById = new Map([['r', root]])
      const childrenByParent = new Map<string, Condition[]>()

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result).toMatchObject({ type: 'and', conditions: [] })

      conditionsById.set('c1', child)
      childrenByParent.set('r', [child])
      const withChildren = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect((withChildren as any).conditions).toHaveLength(1)
      expect((withChildren as any).conditions[0].type).toBe('weekday')
    })

    it('OR with no children produces empty conditions array', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'or' }
      const child: Condition = { id: 'c1', seriesId: 's1', parentId: 'r', type: 'weekday', days: [2] }
      const conditionsById = new Map([['r', root]])
      const childrenByParent = new Map<string, Condition[]>()

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result).toMatchObject({ type: 'or', conditions: [] })

      conditionsById.set('c1', child)
      childrenByParent.set('r', [child])
      const withChildren = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect((withChildren as any).conditions).toHaveLength(1)
      expect((withChildren as any).conditions[0].type).toBe('weekday')
    })

    it('NOT with no children does not set condition property', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'not' }
      const child: Condition = { id: 'c1', seriesId: 's1', parentId: 'r', type: 'weekday', days: [0, 6] }
      const conditionsById = new Map([['r', root]])
      const childrenByParent = new Map<string, Condition[]>()

      const result = reconstructConditionTree('r', conditionsById, childrenByParent) as any
      expect(result.condition).toBeUndefined()
      expect(result.type).toBe('not')

      conditionsById.set('c1', child)
      childrenByParent.set('r', [child])
      const withChild = reconstructConditionTree('r', conditionsById, childrenByParent) as any
      expect(withChild.condition).toEqual({ type: 'weekday', days: [0, 6] })
    })

    it('NOT with one child sets condition property', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'not' }
      const child: Condition = { id: 'c1', seriesId: 's1', parentId: 'r', type: 'weekday', days: [0, 6] }
      const conditionsById = new Map([['r', root], ['c1', child]])
      const childrenByParent = new Map([['r', [child]]])

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result!.type).toBe('not')
      expect((result as any).condition).toEqual({ type: 'weekday', days: [0, 6] })
    })

    it('AND child with missing ID is filtered out by filter(Boolean)', () => {
      const root: Condition = { id: 'r', seriesId: 's1', parentId: null, type: 'and' }
      const goodChild: Condition = { id: 'c1', seriesId: 's1', parentId: 'r', type: 'weekday', days: [1] }
      // badChild references an ID that exists in childrenByParent but NOT in conditionsById
      const badChild: Condition = { id: 'c-gone', seriesId: 's1', parentId: 'r', type: 'weekday', days: [2] }

      const conditionsById = new Map([['r', root], ['c1', goodChild]])
      // childrenByParent includes badChild, but its ID isn't in conditionsById → reconstructs to null → filtered
      const childrenByParent = new Map([['r', [goodChild, badChild]]])

      const result = reconstructConditionTree('r', conditionsById, childrenByParent)
      expect(result!.type).toBe('and')
      // Only the good child survives filter(Boolean)
      expect((result as any).conditions).toHaveLength(1)
      expect((result as any).conditions[0].type).toBe('weekday')
      expect((result as any).conditions[0].days).toEqual([1])
    })
  })

  // ========================================================================
  // Mutation-killing: persistConditionTree conditional spreads (L74-79)
  // ========================================================================

  describe('persistConditionTree optional field spreads', () => {
    it('persists condition with operator field', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const cond = { type: 'completionCount' as const, seriesRef: 'x', comparison: '>=', value: 3, windowDays: 7 }
      const rootId = await persistConditionTree(adapter, 's1', cond, null)

      const rows = await adapter.getConditionsBySeries('s1')
      const row = rows.find(r => r.id === rootId)!
      expect(row.comparison).toBe('>=')
      expect(row.value).toBe(3)
      expect(row.windowDays).toBe(7)
      expect(row.seriesRef).toBe('x')
    })

    it('persists condition with days field', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const cond = { type: 'weekday' as const, days: [1, 3, 5] }
      const rootId = await persistConditionTree(adapter, 's1', cond, null)

      const rows = await adapter.getConditionsBySeries('s1')
      const row = rows.find(r => r.id === rootId)!
      expect(row.operator).toBeUndefined()
      expect(row.comparison).toBeUndefined()
      expect(row.value).toBeUndefined()
      expect(row.windowDays).toBeUndefined()
      expect(row.seriesRef).toBeUndefined()
      expect(row.type).toBe('weekday')
      expect(row.days).toEqual([1, 3, 5])

      const fullCond = { type: 'completionCount' as const, seriesRef: 'x', comparison: '>=', value: 3, windowDays: 7 }
      const fullId = await persistConditionTree(adapter, 's1', fullCond, null)
      const allRows = await adapter.getConditionsBySeries('s1')
      const fullRow = allRows.find(r => r.id === fullId)!
      expect(fullRow.comparison).toBe('>=')
      expect(fullRow.value).toBe(3)
      expect(fullRow.windowDays).toBe(7)
      expect(fullRow.seriesRef).toBe('x')
    })

    it('persists AND condition with children linked by parentId', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const cond = {
        type: 'and' as const,
        conditions: [
          { type: 'weekday' as const, days: [1] },
          { type: 'completionCount' as const, seriesRef: 'r', comparison: '>=', value: 1, windowDays: 7 },
        ],
      }
      const rootId = await persistConditionTree(adapter, 's1', cond, null)

      const rows = await adapter.getConditionsBySeries('s1')
      expect(rows).toHaveLength(3)
      const children = rows.filter(r => r.parentId === rootId)
      expect(children).toHaveLength(2)
      expect(children.map(c => c.type).sort()).toEqual(['completionCount', 'weekday'])
    })

    it('persists NOT condition with single child', async () => {
      await adapter.createSeries({ id: 's1', title: 'T', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const cond = {
        type: 'not' as const,
        condition: { type: 'weekday' as const, days: [0, 6] },
      }
      const rootId = await persistConditionTree(adapter, 's1', cond, null)

      const rows = await adapter.getConditionsBySeries('s1')
      expect(rows).toHaveLength(2)
      const child = rows.find(r => r.parentId === rootId)!
      expect(child.type).toBe('weekday')
      expect(child.days).toEqual([0, 6])
    })
  })

  // ========================================================================
  // Mutation-killing: loadAllFullSeries guard (L170)
  // ========================================================================

  describe('loadAllFullSeries', () => {
    it('returns empty array when no series exist', async () => {
      const result = await loadAllFullSeries(adapter)
      expect(result).toEqual([])

      await adapter.createSeries({ id: 's1', title: 'Proof', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      const nonEmpty = await loadAllFullSeries(adapter)
      expect(nonEmpty).toHaveLength(1)
      expect(nonEmpty[0]!.title).toBe('Proof')
    })

    it('assembles multiple series with their subsystems', async () => {
      await adapter.createSeries({ id: 's1', title: 'First', createdAt: '2025-01-01T00:00:00' as LocalDateTime })
      await adapter.createSeries({ id: 's2', title: 'Second', createdAt: '2025-01-02T00:00:00' as LocalDateTime })
      await adapter.addTagToSeries('s1', 'tagged')

      const result = await loadAllFullSeries(adapter)
      expect(result).toHaveLength(2)
      const s1 = result.find(s => s.id === 's1')!
      expect(s1.tags).toEqual(['tagged'])
    })
  })
})
