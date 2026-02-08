/**
 * Segment 19: Completion Store Tests
 *
 * Tests the createCompletionStore factory and all CompletionStore methods.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createCompletionStore, type CompletionStore } from '../src/completion-store'
import { createMockAdapter, type Adapter } from '../src/adapter'
import type { LocalDate, LocalDateTime } from '../src/time-date'
import { makeDate, addDays } from '../src/time-date'

describe('Segment 19: Completion Store', () => {
  let adapter: Adapter
  let store: CompletionStore

  const date = (s: string) => s as LocalDate
  const dt = (s: string) => s as LocalDateTime
  const today = date('2025-06-15')

  beforeEach(async () => {
    adapter = createMockAdapter()
    store = createCompletionStore(adapter)

    // Create two series
    await adapter.createSeries({ id: 's1', title: 'Series A', createdAt: dt('2025-01-01T00:00:00') })
    await adapter.createSeries({ id: 's2', title: 'Series B', createdAt: dt('2025-01-01T00:00:00') })

    // Tag both for tag-based queries
    await adapter.addTagToSeries('s1', 'exercise')
    await adapter.addTagToSeries('s2', 'exercise')
  })

  // ========================================================================
  // countInWindow
  // ========================================================================

  describe('countInWindow', () => {
    it('returns 0 when no completions exist', async () => {
      const count = await store.countInWindow({ type: 'seriesId', seriesId: 's1' }, 7, today)
      expect(count).toBe(0)
    })

    it('counts only completions within the window', async () => {
      // 3 completions: 2 within 7-day window, 1 outside
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-15'), date: date('2025-06-15') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's1', instanceDate: date('2025-06-10'), date: date('2025-06-10') })
      await adapter.createCompletion({ id: 'c3', seriesId: 's1', instanceDate: date('2025-06-01'), date: date('2025-06-01') })

      const count = await store.countInWindow({ type: 'seriesId', seriesId: 's1' }, 7, today)
      expect(count).toBe(2)
    })

    it('works with tag targets across multiple series', async () => {
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's2', instanceDate: date('2025-06-13'), date: date('2025-06-13') })

      const count = await store.countInWindow({ type: 'tag', tag: 'exercise' }, 7, today)
      expect(count).toBe(2)
    })
  })

  // ========================================================================
  // daysSinceLast
  // ========================================================================

  describe('daysSinceLast', () => {
    it('returns null when never completed, correct count after completion', async () => {
      // No completions → null
      expect(await store.daysSinceLast({ type: 'seriesId', seriesId: 's1' }, today)).toBe(null)

      // After logging a completion → returns days
      await adapter.createCompletion({ id: 'c0', seriesId: 's1', instanceDate: date('2025-06-15'), date: date('2025-06-15') })
      expect(await store.daysSinceLast({ type: 'seriesId', seriesId: 's1' }, today)).toBe(0)
    })

    it('returns correct day count', async () => {
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-12'), date: date('2025-06-12') })

      const result = await store.daysSinceLast({ type: 'seriesId', seriesId: 's1' }, today)
      expect(result).toBe(3)
    })

    it('with tag target returns minimum days across matching series', async () => {
      // s1: last completion 5 days ago, s2: last completion 2 days ago
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-10'), date: date('2025-06-10') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's2', instanceDate: date('2025-06-13'), date: date('2025-06-13') })

      // daysSinceLastCompletion finds the most recent across all resolved series
      const result = await store.daysSinceLast({ type: 'tag', tag: 'exercise' }, today)
      expect(result).toBe(2)
    })
  })

  // ========================================================================
  // getRecentDurations
  // ========================================================================

  describe('getRecentDurations', () => {
    it('lastN mode returns last N durations', async () => {
      await adapter.createCompletion({
        id: 'c1', seriesId: 's1', instanceDate: date('2025-06-10'), date: date('2025-06-10'),
        startTime: dt('2025-06-10T09:00:00'), endTime: dt('2025-06-10T09:30:00'), durationMinutes: 30,
      })
      await adapter.createCompletion({
        id: 'c2', seriesId: 's1', instanceDate: date('2025-06-12'), date: date('2025-06-12'),
        startTime: dt('2025-06-12T09:00:00'), endTime: dt('2025-06-12T09:45:00'), durationMinutes: 45,
      })
      await adapter.createCompletion({
        id: 'c3', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14'),
        startTime: dt('2025-06-14T09:00:00'), endTime: dt('2025-06-14T10:00:00'), durationMinutes: 60,
      })

      const result = await store.getRecentDurations('s1', { lastN: 2 })
      // Most recent first, limited to 2
      expect(result).toEqual([60, 45])
    })

    it('windowDays mode returns durations within window', async () => {
      await adapter.createCompletion({
        id: 'c1', seriesId: 's1', instanceDate: date('2025-06-01'), date: date('2025-06-01'),
        durationMinutes: 20,
      })
      await adapter.createCompletion({
        id: 'c2', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14'),
        durationMinutes: 50,
      })

      // 7-day window: [2025-06-09, 2025-06-15]
      const result = await store.getRecentDurations('s1', { windowDays: 7, asOf: today })
      expect(result).toEqual([50])
    })

    it('filters out completions without duration', async () => {
      await adapter.createCompletion({
        id: 'c1', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14'),
        // No durationMinutes, no startTime/endTime
      })
      await adapter.createCompletion({
        id: 'c2', seriesId: 's1', instanceDate: date('2025-06-15'), date: date('2025-06-15'),
        durationMinutes: 25,
      })

      const result = await store.getRecentDurations('s1', { lastN: 10 })
      expect(result).toEqual([25])
    })
  })

  // ========================================================================
  // getCompletionsInWindow
  // ========================================================================

  describe('getCompletionsInWindow', () => {
    it('returns enriched DomainCompletion objects', async () => {
      await adapter.createCompletion({
        id: 'c1', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14'),
        startTime: dt('2025-06-14T09:00:00'), endTime: dt('2025-06-14T09:30:00'),
      })

      const result = await store.getCompletionsInWindow({ type: 'seriesId', seriesId: 's1' }, 7, today)
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('c1')
      expect(result[0]!.seriesId).toBe('s1')
      expect(result[0]!.date).toBe('2025-06-14')
      // Duration calculated from start/end times
      expect(result[0]!.durationMinutes).toBe(30)
    })

    it('respects window boundaries', async () => {
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-15'), date: date('2025-06-15') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's1', instanceDate: date('2025-06-09'), date: date('2025-06-09') })
      await adapter.createCompletion({ id: 'c3', seriesId: 's1', instanceDate: date('2025-06-08'), date: date('2025-06-08') })

      // 7-day window: [2025-06-09, 2025-06-15]
      const result = await store.getCompletionsInWindow({ type: 'seriesId', seriesId: 's1' }, 7, today)
      expect(result).toHaveLength(2)
      const ids = result.map(c => c.id)
      expect(ids).toContain('c1')
      expect(ids).toContain('c2')
    })
  })

  // ========================================================================
  // getLastCompletion
  // ========================================================================

  describe('getLastCompletion', () => {
    it('returns the most recent completion as DomainCompletion', async () => {
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-10'), date: date('2025-06-10') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's1', instanceDate: date('2025-06-14'), date: date('2025-06-14') })
      await adapter.createCompletion({ id: 'c3', seriesId: 's1', instanceDate: date('2025-06-12'), date: date('2025-06-12') })

      const result = await store.getLastCompletion({ type: 'seriesId', seriesId: 's1' })
      expect(result).not.toBeNull()
      expect(result!.id).toBe('c2')
      expect(result!.date).toBe('2025-06-14')
    })

    it('with tag target returns most recent across all matching series', async () => {
      await adapter.createCompletion({ id: 'c1', seriesId: 's1', instanceDate: date('2025-06-10'), date: date('2025-06-10') })
      await adapter.createCompletion({ id: 'c2', seriesId: 's2', instanceDate: date('2025-06-14'), date: date('2025-06-14') })

      const result = await store.getLastCompletion({ type: 'tag', tag: 'exercise' })
      expect(result).not.toBeNull()
      expect(result!.id).toBe('c2')
      expect(result!.seriesId).toBe('s2')
    })
  })
})
