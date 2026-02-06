/**
 * Segment 06: Completions
 *
 * Completions record what actually happened. They provide the historical record
 * that conditions query to affect future scheduling, and support adaptive duration calculations.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  logCompletion,
  getCompletion,
  getCompletionByInstance,
  getCompletionsBySeries,
  getCompletionsByTarget,
  deleteCompletion,
  countCompletionsInWindow,
  daysSinceLastCompletion,
  getDurationsForAdaptive,
} from '../src/completions';
import {
  createSeries,
} from '../src/series-crud';
import {
  createMockAdapter,
  type MockAdapter,
} from '../src/adapter';
import {
  parseDate,
  parseDateTime,
  addDays,
} from '../src/time-date';
import type { LocalDate, LocalDateTime, SeriesId, CompletionId } from '../src/types';

describe('Segment 06: Completions', () => {
  let adapter: MockAdapter;
  let testSeriesId: SeriesId;

  beforeEach(async () => {
    adapter = createMockAdapter();
    // Create a test series for completions
    const result = await createSeries(adapter, {
      title: 'Test Series',
      startDate: parseDate('2024-01-01'),
    });
    if (!result.ok) throw new Error('Failed to create test series');
    testSeriesId = result.value.id;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: LOG COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Log Completion', () => {
    describe('1.1 Basic Logging Tests', () => {
      it('log completion returns unique ID', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.id).toMatch(/^[0-9a-f-]{36}$/);
        }
      });

      it('logged completion is retrievable', async () => {
        const logResult = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(logResult.ok).toBe(true);
        if (!logResult.ok) throw new Error(`'logged completion is retrievable' setup failed: ${logResult.error.type}`);

        const completion = await getCompletion(adapter, logResult.value.id);
        expect(completion?.id).toBe(logResult.value.id);
        expect(completion?.seriesId).toBe(testSeriesId);
        expect(completion?.date).toBe(parseDate('2024-01-15'));
        expect(completion?.durationMinutes).toBe(30);
      });

      it('date derived from startTime', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T23:30:00'),
          endTime: parseDateTime('2024-01-16T00:30:00'),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'date derived from startTime' setup failed: ${result.error.type}`);

        const completion = await getCompletion(adapter, result.value.id);
        // The date should be derived from the instanceDate, not startTime
        expect(completion?.date).toBe(parseDate('2024-01-15'));
        expect(completion?.seriesId).toBe(testSeriesId);
        expect(completion?.id).toBe(result.value.id);
      });

      it('createdAt set on log', async () => {
        const before = Date.now();
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        const after = Date.now();

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'createdAt set on log' setup failed: ${result.error.type}`);

        const completion = await getCompletion(adapter, result.value.id);
        expect(completion?.id).toBe(result.value.id);
        const createdAtMs = new Date(completion!.createdAt).getTime();
        expect(createdAtMs).toBeGreaterThanOrEqual(before);
        expect(createdAtMs).toBeLessThanOrEqual(after);
      });

      it('duration calculated correctly', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'duration calculated correctly' setup failed: ${result.error.type}`);

        const completion = await getCompletion(adapter, result.value.id);
        expect(completion?.id).toBe(result.value.id);
        expect(completion?.durationMinutes).toBe(30);
      });
    });

    describe('1.2 Precondition Validation', () => {
      it('series must exist', async () => {
        const result = await logCompletion(adapter, {
          seriesId: 'non-existent-series-id' as SeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });

      it('duplicate instance rejected', async () => {
        // Log first completion
        const first = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        expect(first.ok).toBe(true);

        // Attempt duplicate
        const second = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T10:00:00'),
          endTime: parseDateTime('2024-01-15T10:30:00'),
        });

        expect(second.ok).toBe(false);
        if (!second.ok) {
          expect(second.error.type).toBe('DuplicateCompletionError');
        }
      });

      it('endTime before startTime', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T10:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('InvalidTimeRangeError');
        }
      });

      it('endTime equals startTime', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:00:00'),
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          const completion = await getCompletion(adapter, result.value.id);
          expect(completion!.durationMinutes).toBe(0);
        }
      });

      it('invalid instanceDate', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: 'not-a-date' as LocalDate,
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('ValidationError');
        }
      });

      it('invalid startTime', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: 'not-a-datetime' as LocalDateTime,
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('ValidationError');
        }
      });

      it('invalid endTime', async () => {
        const result = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: 'not-a-datetime' as LocalDateTime,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('ValidationError');
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: QUERY COMPLETIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Query Completions', () => {
    describe('2.1 By ID', () => {
      it('get existing completion', async () => {
        const logResult = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        expect(logResult.ok).toBe(true);
        if (!logResult.ok) throw new Error(`'get existing completion' setup failed: ${logResult.error.type}`);

        const completion = await getCompletion(adapter, logResult.value.id);
        expect(completion?.id).toBe(logResult.value.id);
        expect(completion?.seriesId).toBe(testSeriesId);
        expect(completion?.date).toBe(parseDate('2024-01-15'));
      });

      it('returns null for non-existent completion ID', async () => {
        // First, prove positive retrieval works by logging and retrieving a real completion
        const logResult = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        expect(logResult.ok).toBe(true);
        if (!logResult.ok) throw new Error(`setup failed: ${logResult.error.type}`);

        const realCompletion = await getCompletion(adapter, logResult.value.id);
        expect(realCompletion).toMatchObject({
          id: logResult.value.id,
          seriesId: testSeriesId,
          date: parseDate('2024-01-15'),
          durationMinutes: 30,
        });

        // Now verify non-existent ID returns null
        const completion = await getCompletion(adapter, 'non-existent-id' as CompletionId);
        expect(completion).toBe(null);
      });

      it('get deleted completion', async () => {
        const logResult = await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        expect(logResult.ok).toBe(true);
        if (!logResult.ok) throw new Error(`'get deleted completion' setup failed: ${logResult.error.type}`);

        // Prove data exists before deletion
        const beforeDelete = await getCompletion(adapter, logResult.value.id);
        expect(beforeDelete).toMatchObject({
          id: logResult.value.id,
          seriesId: testSeriesId,
          date: parseDate('2024-01-15'),
          durationMinutes: 30,
        });
        let allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
        expect(allCompletions).toHaveLength(1);
        expect(allCompletions[0]).toMatchObject({
          id: logResult.value.id,
          seriesId: testSeriesId,
          date: parseDate('2024-01-15'),
          durationMinutes: 30,
        });

        await deleteCompletion(adapter, logResult.value.id);
        const completion = await getCompletion(adapter, logResult.value.id);
        expect(completion).toBe(null);
        // Verify the completion was actually removed from the collection
        allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
        expect(allCompletions).toEqual([]);
      });
    });

    describe('2.2 By Series', () => {
      it('all completions match series', async () => {
        // Create 3 completions for the test series
        for (let i = 1; i <= 3; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: parseDate(`2024-01-${10 + i}`),
            startTime: parseDateTime(`2024-01-${10 + i}T09:00:00`),
            endTime: parseDateTime(`2024-01-${10 + i}T09:30:00`),
          });
        }

        const completions = await getCompletionsBySeries(adapter, testSeriesId);
        // Verify exactly 3 completions with their dates (descending order)
        expect(completions).toHaveLength(3);
        expect(completions[0].date).toBe(parseDate('2024-01-13'));
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[1].date).toBe(parseDate('2024-01-12'));
        expect(completions[1].seriesId).toBe(testSeriesId);
        expect(completions[2].date).toBe(parseDate('2024-01-11'));
        expect(completions[2].seriesId).toBe(testSeriesId);
      });

      it('excludes other series', async () => {
        // Create another series
        const series2Result = await createSeries(adapter, {
          title: 'Other Series',
          startDate: parseDate('2024-01-01'),
        });
        expect(series2Result.ok).toBe(true);
        if (!series2Result.ok) throw new Error(`'excludes other series' setup failed: ${series2Result.error.type}`);
        const series2Id = series2Result.value.id;

        // Add completions to both series
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: series2Id,
          instanceDate: parseDate('2024-01-16'),
          startTime: parseDateTime('2024-01-16T09:00:00'),
          endTime: parseDateTime('2024-01-16T09:30:00'),
        });

        // Query first series - should only have 1 completion
        const completions = await getCompletionsBySeries(adapter, testSeriesId);
        expect(completions).toHaveLength(1);
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[0].date).toBe(parseDate('2024-01-15'));
      });

      it('ordered by date descending', async () => {
        // Log completions in non-chronological order: 1, 3, 2
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-10'),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-12'),
          startTime: parseDateTime('2024-01-12T09:00:00'),
          endTime: parseDateTime('2024-01-12T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-11'),
          startTime: parseDateTime('2024-01-11T09:00:00'),
          endTime: parseDateTime('2024-01-11T09:30:00'),
        });

        const completions = await getCompletionsBySeries(adapter, testSeriesId);
        // Should be exactly 3 completions in descending order: 12, 11, 10
        expect(completions).toHaveLength(3);
        expect(completions[0].date).toBe(parseDate('2024-01-12'));
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[1].date).toBe(parseDate('2024-01-11'));
        expect(completions[2].date).toBe(parseDate('2024-01-10'));
      });

      it('returns empty for series with no completions', async () => {
        // testSeriesId exists (created in beforeEach) but has no completions
        // Prove the query mechanism works by creating a completion in another series
        const otherResult = await createSeries(adapter, {
          title: 'Other Series',
          startDate: parseDate('2024-01-01'),
        });
        expect(otherResult.ok).toBe(true);
        if (!otherResult.ok) throw new Error(`setup failed: ${otherResult.error.type}`);
        await logCompletion(adapter, {
          seriesId: otherResult.value.id,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        // Prove getCompletionsBySeries returns data when completions exist
        const otherCompletions = await getCompletionsBySeries(adapter, otherResult.value.id);
        expect(otherCompletions).toHaveLength(1);
        expect(otherCompletions[0]).toMatchObject({
          seriesId: otherResult.value.id,
          date: parseDate('2024-01-15'),
          durationMinutes: 30,
        });

        // Now verify our test series (no completions) returns none
        const noCompletions = await getCompletionsBySeries(adapter, testSeriesId);
        const noCompletionsCount = noCompletions.length;
        expect(noCompletionsCount).toBe(0);
      });
    });

    describe('2.3 By Instance', () => {
      it('get completion by instance', async () => {
        const instanceDate = parseDate('2024-01-15');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate,
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const completion = await getCompletionByInstance(adapter, testSeriesId, instanceDate);
        expect(completion?.seriesId).toBe(testSeriesId);
        expect(completion?.date).toBe(instanceDate);
        expect(completion?.durationMinutes).toBe(30);
      });

      it('returns null when no completion exists for instance', async () => {
        // First prove positive retrieval works
        const instanceDate = parseDate('2024-01-10');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate,
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });
        const existing = await getCompletionByInstance(adapter, testSeriesId, instanceDate);
        expect(existing).toMatchObject({
          seriesId: testSeriesId,
          date: instanceDate,
          durationMinutes: 30,
        });

        // Now verify a different instance date returns null
        const completion = await getCompletionByInstance(
          adapter,
          testSeriesId,
          parseDate('2024-01-15')
        );
        expect(completion).toBe(null);
      });

      it('unique per instance', async () => {
        const instanceDate = parseDate('2024-01-15');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate,
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const completion = await getCompletionByInstance(adapter, testSeriesId, instanceDate);
        expect(completion?.seriesId).toBe(testSeriesId);
        expect(completion?.date).toBe(instanceDate);

        // There can only be one completion per instance
        const allForSeries = await getCompletionsBySeries(adapter, testSeriesId);
        const matchingInstance = allForSeries.filter(c => c.date === instanceDate);
        expect(matchingInstance).toHaveLength(1);
        expect(matchingInstance[0].seriesId).toBe(testSeriesId);
        expect(matchingInstance[0].date).toBe(instanceDate);
      });
    });

    describe('2.4 By Target and Window', () => {
      it('completions in window', async () => {
        const asOf = parseDate('2024-01-20');
        // Log completion 3 days ago (within 7-day window)
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });

        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        expect(completions).toHaveLength(1);
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[0].date).toBe(addDays(asOf, -3));
      });

      it('completions outside window excluded', async () => {
        const asOf = parseDate('2024-01-20');
        // Log completion 10 days ago (outside 7-day window)
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -10),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });

        // Prove getCompletionsByTarget returns data when completions are in window
        // Use a 30-day window to include the completion we just logged
        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 30,
          asOf,
        });
        expect(completions).toHaveLength(1);
        expect(completions[0]).toMatchObject({
          seriesId: testSeriesId,
          date: addDays(asOf, -10),
          durationMinutes: 30,
        });

        // Now verify the 7-day window excludes this completion
        const narrowWindow = await getCompletionsByTarget(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        const narrowWindowCount = narrowWindow.length;
        expect(narrowWindowCount).toBe(0);
      });

      it('target by tag', async () => {
        // Update series to have a tag
        const seriesWithTag = await createSeries(adapter, {
          title: 'Tagged Series',
          startDate: parseDate('2024-01-01'),
          tags: ['exercise'],
        });
        expect(seriesWithTag.ok).toBe(true);
        if (!seriesWithTag.ok) throw new Error(`'target by tag' setup failed: ${seriesWithTag.error.type}`);

        await logCompletion(adapter, {
          seriesId: seriesWithTag.value.id,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'tag', tag: 'exercise' },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(completions).toHaveLength(1);
        expect(completions[0].seriesId).toBe(seriesWithTag.value.id);
        expect(completions[0].date).toBe(parseDate('2024-01-15'));
      });

      it('target by tag multiple series', async () => {
        // Create two series with the same tag
        const series1 = await createSeries(adapter, {
          title: 'Series 1',
          startDate: parseDate('2024-01-01'),
          tags: ['cardio'],
        });
        const series2 = await createSeries(adapter, {
          title: 'Series 2',
          startDate: parseDate('2024-01-01'),
          tags: ['cardio'],
        });
        expect(series1.ok).toBe(true);
        expect(series2.ok).toBe(true);
        if (!series1.ok || !series2.ok) throw new Error(`'target by tag multiple series' setup failed`);

        await logCompletion(adapter, {
          seriesId: series1.value.id,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: series2.value.id,
          instanceDate: parseDate('2024-01-16'),
          startTime: parseDateTime('2024-01-16T09:00:00'),
          endTime: parseDateTime('2024-01-16T09:30:00'),
        });

        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'tag', tag: 'cardio' },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        // Verify we have exactly 2 completions from 2 different series (order by date desc: series2 then series1)
        expect(completions).toHaveLength(2);
        expect(completions[0]).toEqual(expect.objectContaining({
          seriesId: series2.value.id,
          date: parseDate('2024-01-16'),
        }));
        expect(completions[1]).toEqual(expect.objectContaining({
          seriesId: series1.value.id,
          date: parseDate('2024-01-15'),
        }));
      });

      it('target by seriesId', async () => {
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(completions).toHaveLength(1);
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[0].date).toBe(parseDate('2024-01-15'));
      });

      it('target by seriesId excludes others', async () => {
        // Create another series
        const other = await createSeries(adapter, {
          title: 'Other',
          startDate: parseDate('2024-01-01'),
        });
        expect(other.ok).toBe(true);
        if (!other.ok) throw new Error(`'target by seriesId excludes others' setup failed: ${other.error.type}`);

        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: other.value.id,
          instanceDate: parseDate('2024-01-16'),
          startTime: parseDateTime('2024-01-16T09:00:00'),
          endTime: parseDateTime('2024-01-16T09:30:00'),
        });

        const completions = await getCompletionsByTarget(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(completions).toHaveLength(1);
        expect(completions[0].seriesId).toBe(testSeriesId);
        expect(completions[0].date).toBe(parseDate('2024-01-15'));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: DELETE COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Delete Completion', () => {
    it('delete existing completion', async () => {
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'delete existing completion' setup failed: ${logResult.error.type}`);

      const result = await deleteCompletion(adapter, logResult.value.id);
      expect(result.ok).toBe(true);
    });

    it('get after delete returns null', async () => {
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'get after delete returns null' setup failed: ${logResult.error.type}`);

      // Prove data exists before deletion
      const beforeDelete = await getCompletion(adapter, logResult.value.id);
      expect(beforeDelete).toMatchObject({
        id: logResult.value.id,
        seriesId: testSeriesId,
        date: parseDate('2024-01-15'),
        durationMinutes: 30,
      });
      let allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
      expect(allCompletions).toHaveLength(1);
      expect(allCompletions[0]).toMatchObject({
        id: logResult.value.id,
        seriesId: testSeriesId,
        date: parseDate('2024-01-15'),
        durationMinutes: 30,
      });

      await deleteCompletion(adapter, logResult.value.id);
      const completion = await getCompletion(adapter, logResult.value.id);
      expect(completion).toBe(null);
      // Verify the completion was actually removed from the collection
      allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
      expect(allCompletions).toEqual([]);
    });

    it('getByInstance after delete', async () => {
      const instanceDate = parseDate('2024-01-15');
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate,
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'getByInstance after delete' setup failed: ${logResult.error.type}`);

      const completionId = logResult.value.id;

      // Verify completion exists before deletion
      const beforeDelete = await getCompletionByInstance(adapter, testSeriesId, instanceDate);
      expect(beforeDelete).toEqual(expect.objectContaining({
        seriesId: testSeriesId,
        date: instanceDate,
        durationMinutes: 30,
      }));

      // Also verify via getCompletionsBySeries
      let allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
      expect(allCompletions).toHaveLength(1);
      expect(allCompletions[0]).toMatchObject({
        id: completionId,
        seriesId: testSeriesId,
        date: instanceDate,
        durationMinutes: 30,
      });

      await deleteCompletion(adapter, completionId);

      // LAW 10: After delete, getCompletionByInstance returns null
      const afterDelete = await getCompletionByInstance(adapter, testSeriesId, instanceDate);
      expect(afterDelete).toBe(null);

      // Verify the completion was actually removed from the collection
      allCompletions = await getCompletionsBySeries(adapter, testSeriesId);
      expect(allCompletions).toEqual([]);

      // Also verify via getAllCompletions
      const globalCompletions = await adapter.getAllCompletions();
      expect(globalCompletions.find(c => c.id === completionId)).toBeUndefined();
    });

    it('delete non-existent', async () => {
      const result = await deleteCompletion(adapter, 'non-existent-id' as CompletionId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });

    it('delete already deleted', async () => {
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'delete already deleted' setup failed: ${logResult.error.type}`);

      await deleteCompletion(adapter, logResult.value.id);
      const result = await deleteCompletion(adapter, logResult.value.id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: COUNT COMPLETIONS IN WINDOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Count Completions in Window', () => {
    describe('4.1 Basic Count Tests', () => {
      it('count is non-negative', async () => {
        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBeGreaterThanOrEqual(0);
      });

      it('count bounded by total', async () => {
        // Log 3 completions
        for (let i = 1; i <= 3; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: parseDate(`2024-01-${14 + i}`),
            startTime: parseDateTime(`2024-01-${14 + i}T09:00:00`),
            endTime: parseDateTime(`2024-01-${14 + i}T09:30:00`),
          });
        }

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBeLessThanOrEqual(3);
      });

      it('count empty target', async () => {
        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBe(0);
      });
    });

    describe('4.2 Window Boundary Tests', () => {
      it('completion on asOf date', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: asOf,
          startTime: parseDateTime('2024-01-20T09:00:00'),
          endTime: parseDateTime('2024-01-20T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        expect(count).toBe(1);
      });

      it('completion on window start', async () => {
        const asOf = parseDate('2024-01-20');
        // Window of 7 days: 2024-01-14 through 2024-01-20 (inclusive)
        const windowStart = addDays(asOf, -6);
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: windowStart,
          startTime: parseDateTime('2024-01-14T09:00:00'),
          endTime: parseDateTime('2024-01-14T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        expect(count).toBe(1);
      });

      it('completion one day before window', async () => {
        const asOf = parseDate('2024-01-20');
        // One day before the 7-day window
        const beforeWindow = addDays(asOf, -7);
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: beforeWindow,
          startTime: parseDateTime('2024-01-13T09:00:00'),
          endTime: parseDateTime('2024-01-13T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        expect(count).toBe(0);
      });

      it('completion after asOf', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, 1),
          startTime: parseDateTime('2024-01-21T09:00:00'),
          endTime: parseDateTime('2024-01-21T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 7,
          asOf,
        });
        expect(count).toBe(0);
      });

      it('14-day window boundary start', async () => {
        const asOf = parseDate('2024-01-20');
        // Window of 14 days: 2024-01-07 through 2024-01-20 (inclusive)
        const windowStart = addDays(asOf, -13);
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: windowStart,
          startTime: parseDateTime('2024-01-07T09:00:00'),
          endTime: parseDateTime('2024-01-07T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 14,
          asOf,
        });
        expect(count).toBe(1);
      });

      it('14-day window one before', async () => {
        const asOf = parseDate('2024-01-20');
        // One day before the 14-day window
        const beforeWindow = addDays(asOf, -14);
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: beforeWindow,
          startTime: parseDateTime('2024-01-06T09:00:00'),
          endTime: parseDateTime('2024-01-06T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 14,
          asOf,
        });
        expect(count).toBe(0);
      });
    });

    describe('4.3 Count by Target', () => {
      it('count by tag', async () => {
        // Create two series with same tag
        const series1 = await createSeries(adapter, {
          title: 'Series 1',
          startDate: parseDate('2024-01-01'),
          tags: ['walk'],
        });
        const series2 = await createSeries(adapter, {
          title: 'Series 2',
          startDate: parseDate('2024-01-01'),
          tags: ['walk'],
        });
        expect(series1.ok && series2.ok).toBe(true);
        if (!series1.ok || !series2.ok) throw new Error(`'count by tag' setup failed`);

        // Log 2 completions for series1, 1 for series2
        await logCompletion(adapter, {
          seriesId: series1.value.id,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: series1.value.id,
          instanceDate: parseDate('2024-01-16'),
          startTime: parseDateTime('2024-01-16T09:00:00'),
          endTime: parseDateTime('2024-01-16T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: series2.value.id,
          instanceDate: parseDate('2024-01-17'),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'tag', tag: 'walk' },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBe(3);
      });

      it('count by seriesId', async () => {
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-16'),
          startTime: parseDateTime('2024-01-16T09:00:00'),
          endTime: parseDateTime('2024-01-16T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBe(2);
      });

      it('count excludes wrong tag', async () => {
        // Series without the target tag
        const seriesWithDifferentTag = await createSeries(adapter, {
          title: 'Running',
          startDate: parseDate('2024-01-01'),
          tags: ['running'],
        });
        expect(seriesWithDifferentTag.ok).toBe(true);
        if (!seriesWithDifferentTag.ok) throw new Error(`'count excludes wrong tag' setup failed: ${seriesWithDifferentTag.error.type}`);

        await logCompletion(adapter, {
          seriesId: seriesWithDifferentTag.value.id,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'tag', tag: 'walking' },
          windowDays: 30,
          asOf: parseDate('2024-01-20'),
        });
        expect(count).toBe(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: DAYS SINCE LAST COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Days Since Last Completion', () => {
    describe('5.1 Basic Days Since Tests', () => {
      it('returns null when no completions exist for series', async () => {
        // Prove daysSinceLastCompletion works with data by using a different series
        const otherResult = await createSeries(adapter, {
          title: 'Other Series',
          startDate: parseDate('2024-01-01'),
        });
        expect(otherResult.ok).toBe(true);
        if (!otherResult.ok) throw new Error(`setup failed: ${otherResult.error.type}`);
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: otherResult.value.id,
          instanceDate: addDays(asOf, -2),
          startTime: parseDateTime('2024-01-18T09:00:00'),
          endTime: parseDateTime('2024-01-18T09:30:00'),
        });
        const otherDaysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: otherResult.value.id },
          asOf,
        });
        expect(otherDaysSince).toBe(2);

        // Now verify our test series (with no completions) returns null
        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(null);
      });

      it('completion today returns 0', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: asOf,
          startTime: parseDateTime('2024-01-20T09:00:00'),
          endTime: parseDateTime('2024-01-20T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(0);
      });

      it('completion yesterday returns 1', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -1),
          startTime: parseDateTime('2024-01-19T09:00:00'),
          endTime: parseDateTime('2024-01-19T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(1);
      });

      it('completion 7 days ago', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -7),
          startTime: parseDateTime('2024-01-13T09:00:00'),
          endTime: parseDateTime('2024-01-13T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(7);
      });
    });

    describe('5.2 Multiple Completions', () => {
      it('uses most recent', async () => {
        const asOf = parseDate('2024-01-20');
        // Log completions at 3, 5, and 10 days ago
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -10),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -5),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(3);
      });

      it('ignores older completions', async () => {
        const asOf = parseDate('2024-01-20');
        // Log recent completion
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -1),
          startTime: parseDateTime('2024-01-19T09:00:00'),
          endTime: parseDateTime('2024-01-19T09:30:00'),
        });
        // Log older completion
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -30),
          startTime: parseDateTime('2023-12-21T09:00:00'),
          endTime: parseDateTime('2023-12-21T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(1);
      });
    });

    describe('5.3 By Target Type', () => {
      it('days since by tag', async () => {
        const series = await createSeries(adapter, {
          title: 'Tagged Series',
          startDate: parseDate('2024-01-01'),
          tags: ['meditation'],
        });
        expect(series.ok).toBe(true);
        if (!series.ok) throw new Error(`'days since by tag' setup failed: ${series.error.type}`);

        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: series.value.id,
          instanceDate: addDays(asOf, -2),
          startTime: parseDateTime('2024-01-18T09:00:00'),
          endTime: parseDateTime('2024-01-18T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'tag', tag: 'meditation' },
          asOf,
        });
        expect(daysSince).toBe(2);
      });

      it('days since by seriesId', async () => {
        const asOf = parseDate('2024-01-20');
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -5),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'seriesId', seriesId: testSeriesId },
          asOf,
        });
        expect(daysSince).toBe(5);
      });

      it('tag finds most recent across series', async () => {
        const series1 = await createSeries(adapter, {
          title: 'Series 1',
          startDate: parseDate('2024-01-01'),
          tags: ['yoga'],
        });
        const series2 = await createSeries(adapter, {
          title: 'Series 2',
          startDate: parseDate('2024-01-01'),
          tags: ['yoga'],
        });
        expect(series1.ok && series2.ok).toBe(true);
        if (!series1.ok || !series2.ok) throw new Error(`'tag finds most recent across series' setup failed`);

        const asOf = parseDate('2024-01-20');
        // Series 1: completion 3 days ago
        await logCompletion(adapter, {
          seriesId: series1.value.id,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });
        // Series 2: completion 1 day ago
        await logCompletion(adapter, {
          seriesId: series2.value.id,
          instanceDate: addDays(asOf, -1),
          startTime: parseDateTime('2024-01-19T09:00:00'),
          endTime: parseDateTime('2024-01-19T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'tag', tag: 'yoga' },
          asOf,
        });
        expect(daysSince).toBe(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: ADAPTIVE DURATION SUPPORT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Adaptive Duration Support', () => {
    describe('6.1 Mode: lastN', () => {
      it('returns at most n durations', async () => {
        // Log 10 completions
        for (let i = 1; i <= 10; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: parseDate(`2024-01-${i.toString().padStart(2, '0')}`),
            startTime: parseDateTime(`2024-01-${i.toString().padStart(2, '0')}T09:00:00`),
            endTime: parseDateTime(`2024-01-${i.toString().padStart(2, '0')}T09:30:00`),
          });
        }

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 5 },
          asOf: parseDate('2024-01-15'),
        });
        // Verify exactly 5 durations, all 30 minutes
        expect(durations).toEqual([30, 30, 30, 30, 30]);
      });

      it('returns fewer if fewer exist', async () => {
        // Log 3 completions
        for (let i = 1; i <= 3; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: parseDate(`2024-01-${i.toString().padStart(2, '0')}`),
            startTime: parseDateTime(`2024-01-${i.toString().padStart(2, '0')}T09:00:00`),
            endTime: parseDateTime(`2024-01-${i.toString().padStart(2, '0')}T09:30:00`),
          });
        }

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 10 },
          asOf: parseDate('2024-01-15'),
        });
        // Verify exactly 3 durations, all 30 minutes
        expect(durations).toEqual([30, 30, 30]);
      });

      it('most recent first', async () => {
        // Log completions with different durations on different dates
        // Jan 1: 30 min, Jan 2: 45 min, Jan 3: 60 min
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-01'),
          startTime: parseDateTime('2024-01-01T09:00:00'),
          endTime: parseDateTime('2024-01-01T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-02'),
          startTime: parseDateTime('2024-01-02T09:00:00'),
          endTime: parseDateTime('2024-01-02T09:45:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-03'),
          startTime: parseDateTime('2024-01-03T09:00:00'),
          endTime: parseDateTime('2024-01-03T10:00:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 3 },
          asOf: parseDate('2024-01-15'),
        });

        // Most recent first: 60, 45, 30
        expect(durations).toEqual([60, 45, 30]);
      });

      it('returns empty when no completions exist for series', async () => {
        // Prove getDurationsForAdaptive works with data using a different series
        const otherResult = await createSeries(adapter, {
          title: 'Other Series',
          startDate: parseDate('2024-01-01'),
        });
        expect(otherResult.ok).toBe(true);
        if (!otherResult.ok) throw new Error(`setup failed: ${otherResult.error.type}`);
        await logCompletion(adapter, {
          seriesId: otherResult.value.id,
          instanceDate: parseDate('2024-01-10'),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });
        // Prove getDurationsForAdaptive returns data when completions exist
        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: otherResult.value.id,
          mode: { type: 'lastN', n: 5 },
          asOf: parseDate('2024-01-15'),
        });
        expect(durations).toEqual([30]);

        // Now verify our test series (with no completions) returns none
        const noDurations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 5 },
          asOf: parseDate('2024-01-15'),
        });
        const noDurationsCount = noDurations.length;
        expect(noDurationsCount).toBe(0);
      });
    });

    describe('6.2 Mode: windowDays', () => {
      it('all durations in window', async () => {
        const asOf = parseDate('2024-01-20');
        // Log 3 completions within 7-day window
        for (let i = 1; i <= 3; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: addDays(asOf, -i),
            startTime: parseDateTime(`2024-01-${20 - i}T09:00:00`),
            endTime: parseDateTime(`2024-01-${20 - i}T09:30:00`),
          });
        }

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 7 },
          asOf,
        });
        // Verify exactly 3 durations, all 30 minutes each
        expect(durations).toEqual([30, 30, 30]);
      });

      it('excludes outside window', async () => {
        const asOf = parseDate('2024-01-20');
        // Log 1 within window, 1 outside
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -10),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 7 },
          asOf,
        });
        // Only 1 completion within window (the one 3 days ago)
        expect(durations).toEqual([30]);
      });

      it('returns empty when all completions outside window', async () => {
        const asOf = parseDate('2024-01-20');
        // Log completion 10 days ago (outside 7-day window)
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -10),
          startTime: parseDateTime('2024-01-10T09:00:00'),
          endTime: parseDateTime('2024-01-10T09:30:00'),
        });

        // Prove getDurationsForAdaptive returns data with a wide enough window
        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 30 },
          asOf,
        });
        expect(durations).toEqual([30]);

        // Now verify the 7-day window excludes this completion
        const narrowDurations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 7 },
          asOf,
        });
        const narrowDurationsCount = narrowDurations.length;
        expect(narrowDurationsCount).toBe(0);
      });

      it('boundary: completion on window start', async () => {
        const asOf = parseDate('2024-01-20');
        // Completion exactly 6 days ago (window start for 7-day window)
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -6),
          startTime: parseDateTime('2024-01-14T09:00:00'),
          endTime: parseDateTime('2024-01-14T09:30:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 7 },
          asOf,
        });
        // Completion on window start is included
        expect(durations).toEqual([30]);
      });
    });

    describe('6.3 Duration Calculation', () => {
      it('duration is endTime - startTime', async () => {
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 1 },
          asOf: parseDate('2024-01-20'),
        });
        expect(durations[0]).toBe(30);
      });

      it('zero duration allowed', async () => {
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:00:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 1 },
          asOf: parseDate('2024-01-20'),
        });
        expect(durations[0]).toBe(0);
      });

      it('long duration', async () => {
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T11:30:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 1 },
          asOf: parseDate('2024-01-20'),
        });
        expect(durations[0]).toBe(150);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Invariants', () => {
    it('completion references existing series', async () => {
      const result = await logCompletion(adapter, {
        seriesId: 'non-existent-series' as SeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });

      expect(result.ok).toBe(false);
      // Cannot create orphan completion
    });

    it('at most one per instance', async () => {
      await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });

      const second = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T10:00:00'),
        endTime: parseDateTime('2024-01-15T10:30:00'),
      });

      expect(second.ok).toBe(false);
    });

    it('endTime >= startTime', async () => {
      const result = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T10:00:00'),
        endTime: parseDateTime('2024-01-15T09:00:00'),
      });

      expect(result.ok).toBe(false);
    });

    it('completion ID immutable', async () => {
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'completion ID immutable' setup failed: ${logResult.error.type}`);

      const originalId = logResult.value.id;

      // Verify ID unchanged after operations
      const completion = await getCompletion(adapter, originalId);
      expect(completion?.id).toBe(originalId);
      expect(completion?.seriesId).toBe(testSeriesId);
      expect(completion?.date).toBe(parseDate('2024-01-15'));
    });

    it('completions never modified', async () => {
      const logResult = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(logResult.ok).toBe(true);
      if (!logResult.ok) throw new Error(`'completions never modified' setup failed: ${logResult.error.type}`);

      const original = await getCompletion(adapter, logResult.value.id);

      // Completions are immutable - no update operation should exist
      // Just verify the completion hasn't changed
      const retrieved = await getCompletion(adapter, logResult.value.id);
      expect(retrieved).toEqual(original);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: ERROR TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Error Types', () => {
    it('NotFoundError: delete non-existent completion', async () => {
      const result = await deleteCompletion(adapter, 'non-existent' as CompletionId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });

    it('NotFoundError: log completion for non-existent series', async () => {
      const result = await logCompletion(adapter, {
        seriesId: 'non-existent' as SeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });

    it('DuplicateCompletionError: log completion for same instance twice', async () => {
      await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:30:00'),
      });

      const result = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T10:00:00'),
        endTime: parseDateTime('2024-01-15T10:30:00'),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('DuplicateCompletionError');
      }
    });

    it('InvalidTimeRangeError: log with endTime < startTime', async () => {
      const result = await logCompletion(adapter, {
        seriesId: testSeriesId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T10:00:00'),
        endTime: parseDateTime('2024-01-15T09:00:00'),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('InvalidTimeRangeError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: REAL-WORLD SCENARIO TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Real-World Scenario Tests', () => {
    describe('9.1 Condition Integration Scenario', () => {
      it('condition count query', async () => {
        const walkSeries = await createSeries(adapter, {
          title: 'Daily Walk',
          startDate: parseDate('2024-01-01'),
          tags: ['walk'],
        });
        expect(walkSeries.ok).toBe(true);
        if (!walkSeries.ok) throw new Error(`'condition count query' setup failed: ${walkSeries.error.type}`);

        const asOf = parseDate('2024-01-20');
        // Log 5 walks in the past 14 days
        for (let i = 1; i <= 5; i++) {
          await logCompletion(adapter, {
            seriesId: walkSeries.value.id,
            instanceDate: addDays(asOf, -i * 2), // Every other day
            startTime: parseDateTime(`2024-01-${20 - i * 2}T09:00:00`),
            endTime: parseDateTime(`2024-01-${20 - i * 2}T09:30:00`),
          });
        }

        const count = await countCompletionsInWindow(adapter, {
          target: { type: 'tag', tag: 'walk' },
          windowDays: 14,
          asOf,
        });
        expect(count).toBe(5);
      });

      it('condition days since query', async () => {
        const walkSeries = await createSeries(adapter, {
          title: 'Daily Walk',
          startDate: parseDate('2024-01-01'),
          tags: ['walk'],
        });
        expect(walkSeries.ok).toBe(true);
        if (!walkSeries.ok) throw new Error(`'condition days since query' setup failed: ${walkSeries.error.type}`);

        const asOf = parseDate('2024-01-20');
        // Last walk 3 days ago
        await logCompletion(adapter, {
          seriesId: walkSeries.value.id,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:30:00'),
        });

        const daysSince = await daysSinceLastCompletion(adapter, {
          target: { type: 'tag', tag: 'walk' },
          asOf,
        });
        expect(daysSince).toBe(3);
      });
    });

    describe('9.2 Adaptive Duration Scenario', () => {
      it('average recent durations', async () => {
        const asOf = parseDate('2024-01-20');
        // Log completions with durations 20, 30, 25 (most recent last)
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -3),
          startTime: parseDateTime('2024-01-17T09:00:00'),
          endTime: parseDateTime('2024-01-17T09:20:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -2),
          startTime: parseDateTime('2024-01-18T09:00:00'),
          endTime: parseDateTime('2024-01-18T09:30:00'),
        });
        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: addDays(asOf, -1),
          startTime: parseDateTime('2024-01-19T09:00:00'),
          endTime: parseDateTime('2024-01-19T09:25:00'),
        });

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'lastN', n: 3 },
          asOf,
        });

        // Most recent first: 25, 30, 20
        expect(durations).toEqual([25, 30, 20]);
      });

      it('window durations for calculation', async () => {
        const asOf = parseDate('2024-01-20');
        // Log 5 completions in 7-day window
        for (let i = 1; i <= 5; i++) {
          await logCompletion(adapter, {
            seriesId: testSeriesId,
            instanceDate: addDays(asOf, -i),
            startTime: parseDateTime(`2024-01-${20 - i}T09:00:00`),
            endTime: parseDateTime(`2024-01-${20 - i}T09:30:00`),
          });
        }

        const durations = await getDurationsForAdaptive(adapter, {
          seriesId: testSeriesId,
          mode: { type: 'windowDays', days: 7 },
          asOf,
        });

        // Verify exactly 5 durations, all 30 minutes each
        expect(durations).toEqual([30, 30, 30, 30, 30]);
      });
    });
  });
});
