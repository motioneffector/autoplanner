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
})
