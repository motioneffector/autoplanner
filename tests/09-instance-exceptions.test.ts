/**
 * Segment 09: Instance Exceptions
 *
 * Instance exceptions modify individual occurrences without changing the series rule.
 * An instance can be cancelled (removed) or rescheduled (moved) to a different time.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  cancelInstance,
  rescheduleInstance,
  restoreInstance,
  getException,
  getExceptionsBySeries,
  getExceptionsInRange,
} from '../src/instance-exceptions';
import {
  createSeries,
  deleteSeries,
} from '../src/series-crud';
import {
  expandPattern,
} from '../src/pattern-expansion';
import {
  getSchedule,
} from '../src/schedule';
import {
  createMockAdapter,
  type MockAdapter,
} from '../src/adapter';
import {
  parseDate,
  parseDateTime,
  addDays,
} from '../src/time-date';
import type { LocalDate, LocalDateTime, SeriesId } from '../src/types';

describe('Segment 09: Instance Exceptions', () => {
  let adapter: MockAdapter;
  let testSeriesId: SeriesId;

  beforeEach(async () => {
    adapter = createMockAdapter();
    // Create a daily series for testing exceptions
    const result = await createSeries(adapter, {
      title: 'Test Series',
      startDate: parseDate('2024-01-01'),
      pattern: { type: 'daily' },
      time: parseDateTime('2024-01-01T09:00:00'),
    });
    if (!result.ok) throw new Error('Failed to create test series');
    testSeriesId = result.value.id;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CANCEL INSTANCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Cancel Instance', () => {
    describe('1.1 Basic Cancel Tests', () => {
      it('cancel removes from schedule', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-31') },
        });

        // Verify cancelled instance is not in schedule
        expect(schedule.map(i => i.date)).not.toContain(targetDate);
      });

      it('cancel doesnt affect pattern', async () => {
        const cancelDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, cancelDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-16') },
        });

        // Jan 14 and Jan 16 should still exist
        expect(schedule.some(i => i.date === parseDate('2024-01-14'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-16'))).toBe(true);
      });

      it('cancel creates exception', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);

        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception).toEqual(expect.objectContaining({
          type: 'cancelled',
          instanceDate: targetDate,
        }));
      });

      it('series continues after cancel', async () => {
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

        // Other instances should be unaffected
        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-20') },
        });

        // Should have instances except Jan 15 (Jan 1-20 is 20 days, minus 1 cancelled = 19)
        expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-20'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-15'))).toBe(false);
        expect(schedule[0].date).toBe(parseDate('2024-01-01'));
        expect(schedule[18].date).toBe(parseDate('2024-01-20'));
        expect(schedule.every(i => i.seriesId === testSeriesId && i.date !== parseDate('2024-01-15'))).toBe(true);
        // 19 instances: Jan 1-14 (14 days) + Jan 16-20 (5 days) = 19 days
        const expectedDates = Array.from({ length: 19 }, (_, i) => {
          const day = i < 14 ? i + 1 : i + 2; // Skip day 15
          return parseDate(`2024-01-${day.toString().padStart(2, '0')}`);
        });
        expect(schedule.map(i => i.date)).toEqual(expectedDates);
      });
    });

    describe('1.2 Precondition Tests', () => {
      it('series must exist', async () => {
        const result = await cancelInstance(
          adapter,
          'non-existent-series' as SeriesId,
          parseDate('2024-01-15')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });

      it('instance must exist', async () => {
        // Create a weekly series (only Mondays)
        const weeklyResult = await createSeries(adapter, {
          title: 'Weekly Series',
          startDate: parseDate('2024-01-01'), // Monday
          pattern: { type: 'weekly', daysOfWeek: ['monday'] },
        });
        expect(weeklyResult.ok).toBe(true);
        if (!weeklyResult.ok) throw new Error(`'instance must exist' setup failed: ${weeklyResult.error.type}`);

        // Try to cancel a Tuesday (not in pattern)
        const result = await cancelInstance(
          adapter,
          weeklyResult.value.id,
          parseDate('2024-01-16') // Tuesday
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NonExistentInstanceError');
        }
      });

      it('cannot cancel already cancelled', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);

        const result = await cancelInstance(adapter, testSeriesId, targetDate);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('AlreadyCancelledError');
        }
      });
    });

    describe('1.3 Cancel Rescheduled Instance', () => {
      it('can cancel rescheduled', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        // First reschedule
        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

        // Then cancel
        const result = await cancelInstance(adapter, testSeriesId, targetDate);
        expect(result.ok).toBe(true);

        // Verify it's cancelled
        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception!.type).toBe('cancelled');
      });

      it('cancel overwrites reschedule', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);
        await cancelInstance(adapter, testSeriesId, targetDate);

        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception).toEqual(expect.objectContaining({
          type: 'cancelled',
          instanceDate: targetDate,
          seriesId: testSeriesId,
        }));
        // Cancelled exceptions should not have newTime property
        expect(Object.keys(exception!)).not.toContain('newTime');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: RESCHEDULE INSTANCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Reschedule Instance', () => {
    describe('2.1 Basic Reschedule Tests', () => {
      it('reschedule moves instance', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const instance = schedule.find(i => i.date === targetDate);
        expect(instance).toEqual(expect.objectContaining({
          date: targetDate,
          time: newTime,
        }));
      });

      it('original slot freed', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Should not be at original 9am time
        const timesOnTargetDate = schedule
          .filter(i => i.date === targetDate)
          .map(i => i.time);
        expect(timesOnTargetDate).not.toContain(parseDateTime('2024-01-15T09:00:00'));
      });

      it('exception record created', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception).toEqual(expect.objectContaining({
          type: 'rescheduled',
          instanceDate: targetDate,
          newTime: newTime,
        }));
      });
    });

    describe('2.2 Precondition Tests', () => {
      it('series must exist', async () => {
        const result = await rescheduleInstance(
          adapter,
          'non-existent-series' as SeriesId,
          parseDate('2024-01-15'),
          parseDateTime('2024-01-15T14:00:00')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });

      it('instance must exist', async () => {
        // Create a weekly series (only Mondays)
        const weeklyResult = await createSeries(adapter, {
          title: 'Weekly Series',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['monday'] },
        });
        expect(weeklyResult.ok).toBe(true);
        if (!weeklyResult.ok) throw new Error(`'instance must exist' setup failed: ${weeklyResult.error.type}`);

        // Try to reschedule a Tuesday
        const result = await rescheduleInstance(
          adapter,
          weeklyResult.value.id,
          parseDate('2024-01-16'), // Tuesday
          parseDateTime('2024-01-16T14:00:00')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NonExistentInstanceError');
        }
      });

      it('cannot reschedule cancelled', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);

        const result = await rescheduleInstance(
          adapter,
          testSeriesId,
          targetDate,
          parseDateTime('2024-01-15T14:00:00')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('CancelledInstanceError');
        }
      });

      it('newTime must be valid', async () => {
        const result = await rescheduleInstance(
          adapter,
          testSeriesId,
          parseDate('2024-01-15'),
          'invalid-datetime' as LocalDateTime
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('ValidationError');
        }
      });
    });

    describe('2.3 Re-Reschedule Tests', () => {
      it('reschedule updates newTime', async () => {
        const targetDate = parseDate('2024-01-15');
        const firstTime = parseDateTime('2024-01-15T14:00:00');
        const secondTime = parseDateTime('2024-01-15T16:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, firstTime);
        await rescheduleInstance(adapter, testSeriesId, targetDate, secondTime);

        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception!.newTime).toBe(secondTime);
      });

      it('original still freed', async () => {
        const targetDate = parseDate('2024-01-15');

        await rescheduleInstance(adapter, testSeriesId, targetDate, parseDateTime('2024-01-15T14:00:00'));
        await rescheduleInstance(adapter, testSeriesId, targetDate, parseDateTime('2024-01-15T16:00:00'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Original 9am slot should still be free
        const timesOnTargetDate = schedule
          .filter(i => i.date === targetDate)
          .map(i => i.time);
        expect(timesOnTargetDate).not.toContain(parseDateTime('2024-01-15T09:00:00'));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: RESTORE INSTANCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Restore Instance', () => {
    describe('3.1 Restore Cancelled Tests', () => {
      it('restore cancelled instance', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);
        await restoreInstance(adapter, testSeriesId, targetDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        expect(schedule.some(i => i.date === targetDate)).toBe(true);
      });

      it('restored at original time', async () => {
        const targetDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, targetDate);
        await restoreInstance(adapter, testSeriesId, targetDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const instance = schedule.find(i => i.date === targetDate);
        // Should be at original time (9am)
        expect(instance).toEqual(expect.objectContaining({
          date: targetDate,
          time: parseDateTime('2024-01-15T09:00:00'),
        }));
      });
    });

    describe('3.2 Restore Rescheduled Tests', () => {
      it('restore rescheduled instance', async () => {
        const targetDate = parseDate('2024-01-15');
        await rescheduleInstance(adapter, testSeriesId, targetDate, parseDateTime('2024-01-15T14:00:00'));
        await restoreInstance(adapter, testSeriesId, targetDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const instance = schedule.find(i => i.date === targetDate);
        // Should be back at original time
        expect(instance).toEqual(expect.objectContaining({
          date: targetDate,
          time: parseDateTime('2024-01-15T09:00:00'),
        }));
      });

      it('exception deleted', async () => {
        const targetDate = parseDate('2024-01-15');
        await rescheduleInstance(adapter, testSeriesId, targetDate, parseDateTime('2024-01-15T14:00:00'));
        await restoreInstance(adapter, testSeriesId, targetDate);

        const exception = await getException(adapter, testSeriesId, targetDate);
        expect(exception).toBeNull();
      });
    });

    describe('3.3 Precondition Tests', () => {
      it('exception must exist', async () => {
        const result = await restoreInstance(
          adapter,
          testSeriesId,
          parseDate('2024-01-15')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NoExceptionError');
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: QUERY EXCEPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Query Exceptions', () => {
    it('get exception for instance', async () => {
      const targetDate = parseDate('2024-01-15');
      await cancelInstance(adapter, testSeriesId, targetDate);

      const exception = await getException(adapter, testSeriesId, targetDate);
      expect(exception).toEqual(expect.objectContaining({
        instanceDate: targetDate,
        type: 'cancelled',
      }));
    });

    it('get non-excepted returns null', async () => {
      const exception = await getException(adapter, testSeriesId, parseDate('2024-01-15'));
      expect(exception).toBeNull();
    });

    it('get exceptions by series', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-16'));
      await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-17'), parseDateTime('2024-01-17T14:00:00'));

      const exceptions = await getExceptionsBySeries(adapter, testSeriesId);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-15') && e.type === 'cancelled')).toBe(true);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-16') && e.type === 'cancelled')).toBe(true);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-17') && e.type === 'rescheduled')).toBe(true);
      expect(exceptions[0].seriesId).toBe(testSeriesId);
      expect(exceptions[2].seriesId).toBe(testSeriesId);
      expect(exceptions.map(e => e.instanceDate).sort()).toEqual([
        parseDate('2024-01-15'),
        parseDate('2024-01-16'),
        parseDate('2024-01-17'),
      ].sort());
    });

    it('range query inclusive', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-10'));
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-20'));

      const exceptions = await getExceptionsInRange(adapter, testSeriesId, {
        start: parseDate('2024-01-10'),
        end: parseDate('2024-01-20'),
      });

      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-10'))).toBe(true);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-15'))).toBe(true);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-20'))).toBe(true);
      expect(exceptions[0].type).toBe('cancelled');
      expect(exceptions[2].type).toBe('cancelled');
      expect(exceptions.map(e => e.instanceDate).sort()).toEqual([
        parseDate('2024-01-10'),
        parseDate('2024-01-15'),
        parseDate('2024-01-20'),
      ].sort());
    });

    it('range query excludes outside', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-05'));
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-25'));

      const exceptions = await getExceptionsInRange(adapter, testSeriesId, {
        start: parseDate('2024-01-10'),
        end: parseDate('2024-01-20'),
      });

      expect(exceptions[0].instanceDate).toBe(parseDate('2024-01-15'));
      expect(exceptions[0].type).toBe('cancelled');
      expect(exceptions[0].seriesId).toBe(testSeriesId);
      expect(exceptions.map(e => e.instanceDate)).toEqual([parseDate('2024-01-15')]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: INTEGRATION WITH PATTERN EXPANSION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Integration with Pattern Expansion', () => {
    describe('5.1 Expansion Respects Exceptions', () => {
      it('cancelled excluded from expansion', async () => {
        const cancelDate = parseDate('2024-01-15');
        await cancelInstance(adapter, testSeriesId, cancelDate);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-31') },
        });

        expect(schedule.some(i => i.date === cancelDate)).toBe(false);
      });

      it('rescheduled at new time', async () => {
        const targetDate = parseDate('2024-01-15');
        const newTime = parseDateTime('2024-01-15T14:00:00');

        await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const instance = schedule.find(i => i.date === targetDate);
        expect(instance).toEqual(expect.objectContaining({
          date: targetDate,
          time: newTime,
        }));
      });

      it('non-excepted unchanged', async () => {
        // Cancel one instance
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-16') },
        });

        // Jan 14 and 16 should be present and unaffected
        expect(schedule.some(i => i.date === parseDate('2024-01-14'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-16'))).toBe(true);
      });
    });

    describe('5.2 Multiple Exceptions', () => {
      it('multiple cancelled', async () => {
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-10'));
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-20'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-31') },
        });

        expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(false);
        expect(schedule.some(i => i.date === parseDate('2024-01-15'))).toBe(false);
        expect(schedule.some(i => i.date === parseDate('2024-01-20'))).toBe(false);
      });

      it('multiple rescheduled', async () => {
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-10'), parseDateTime('2024-01-10T14:00:00'));
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T16:00:00'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-10'), end: parseDate('2024-01-15') },
        });

        const jan10 = schedule.find(i => i.date === parseDate('2024-01-10'));
        const jan15 = schedule.find(i => i.date === parseDate('2024-01-15'));

        expect(jan10!.time).toBe(parseDateTime('2024-01-10T14:00:00'));
        expect(jan15!.time).toBe(parseDateTime('2024-01-15T16:00:00'));
      });

      it('mixed exceptions', async () => {
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-10'));
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-10'), end: parseDate('2024-01-15') },
        });

        // Jan 10 should be excluded
        expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(false);

        // Jan 15 should be moved
        const jan15 = schedule.find(i => i.date === parseDate('2024-01-15'));
        expect(jan15!.time).toBe(parseDateTime('2024-01-15T14:00:00'));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Boundary Conditions', () => {
    it('B1: cancel first instance', async () => {
      const firstDate = parseDate('2024-01-01');
      await cancelInstance(adapter, testSeriesId, firstDate);

      const schedule = await getSchedule(adapter, {
        seriesId: testSeriesId,
        range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-10') },
      });

      expect(schedule.some(i => i.date === firstDate)).toBe(false);
      expect(schedule.some(i => i.date === parseDate('2024-01-02'))).toBe(true);
    });

    it('B2: cancel last instance', async () => {
      // Create a series with end date
      const seriesResult = await createSeries(adapter, {
        title: 'Bounded Series',
        startDate: parseDate('2024-01-01'),
        endDate: parseDate('2024-01-10'),
        pattern: { type: 'daily' },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'B2: cancel last instance' setup failed: ${seriesResult.error.type}`);

      await cancelInstance(adapter, seriesResult.value.id, parseDate('2024-01-10'));

      const schedule = await getSchedule(adapter, {
        seriesId: seriesResult.value.id,
        range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-10') },
      });

      expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(false);
      expect(schedule.some(i => i.date === parseDate('2024-01-09'))).toBe(true);
    });

    it('B3: reschedule same day different time', async () => {
      const targetDate = parseDate('2024-01-15');
      const newTime = parseDateTime('2024-01-15T17:00:00');

      const result = await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);
      expect(result.ok).toBe(true);

      const exception = await getException(adapter, testSeriesId, targetDate);
      expect(exception!.newTime).toBe(newTime);
    });

    it('B4: reschedule to different day', async () => {
      const targetDate = parseDate('2024-01-15');
      const newTime = parseDateTime('2024-01-20T09:00:00');

      const result = await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);
      expect(result.ok).toBe(true);

      const exception = await getException(adapter, testSeriesId, targetDate);
      expect(exception!.newTime).toBe(newTime);
    });

    it('B5: reschedule across month boundary', async () => {
      const targetDate = parseDate('2024-01-31');
      const newTime = parseDateTime('2024-02-01T09:00:00');

      const result = await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);
      expect(result.ok).toBe(true);
    });

    it('B5: reschedule across year boundary', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'Year End Series',
        startDate: parseDate('2023-12-01'),
        pattern: { type: 'daily' },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'B5: reschedule across year boundary' setup failed: ${seriesResult.error.type}`);

      const targetDate = parseDate('2023-12-31');
      const newTime = parseDateTime('2024-01-01T09:00:00');

      const result = await rescheduleInstance(adapter, seriesResult.value.id, targetDate, newTime);
      expect(result.ok).toBe(true);
    });

    it('B6: reschedule outside range', async () => {
      const targetDate = parseDate('2024-01-15');
      const newTime = parseDateTime('2024-03-01T09:00:00');

      await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

      // When querying January only, the rescheduled instance shouldn't appear
      const schedule = await getSchedule(adapter, {
        seriesId: testSeriesId,
        range: { start: parseDate('2024-01-01'), end: parseDate('2024-01-31') },
      });

      expect(schedule.some(i => i.date === targetDate)).toBe(false);
    });

    it('B7: exception on non-pattern date', async () => {
      // Create weekly series (only Mondays)
      const weeklyResult = await createSeries(adapter, {
        title: 'Weekly Series',
        startDate: parseDate('2024-01-01'), // Monday
        pattern: { type: 'weekly', daysOfWeek: ['monday'] },
      });
      expect(weeklyResult.ok).toBe(true);
      if (!weeklyResult.ok) throw new Error(`'B7: exception on non-pattern date' setup failed: ${weeklyResult.error.type}`);

      // Try to cancel Tuesday (not in pattern)
      const result = await cancelInstance(
        adapter,
        weeklyResult.value.id,
        parseDate('2024-01-02') // Tuesday
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NonExistentInstanceError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Invariants', () => {
    it('INV 1: one exception per instance', async () => {
      const targetDate = parseDate('2024-01-15');
      await cancelInstance(adapter, testSeriesId, targetDate);

      const exceptions = await getExceptionsBySeries(adapter, testSeriesId);
      const forDate = exceptions.filter(e => e.instanceDate === targetDate);
      expect(forDate[0].instanceDate).toBe(targetDate);
      expect(forDate[0].type).toBe('cancelled');
      expect(forDate[0].seriesId).toBe(testSeriesId);
      expect(forDate.map(e => e.instanceDate)).toEqual([targetDate]);
    });

    it('INV 2: rescheduled has newTime', async () => {
      const targetDate = parseDate('2024-01-15');
      const newTime = parseDateTime('2024-01-15T14:00:00');

      await rescheduleInstance(adapter, testSeriesId, targetDate, newTime);

      const exception = await getException(adapter, testSeriesId, targetDate);
      expect(exception!.type).toBe('rescheduled');
      expect(exception!.newTime).not.toBeNull();
      expect(exception!.newTime).toBe(newTime);
    });

    it('INV 3: cancelled no newTime', async () => {
      const targetDate = parseDate('2024-01-15');
      await cancelInstance(adapter, testSeriesId, targetDate);

      const exception = await getException(adapter, testSeriesId, targetDate);
      expect(exception).toEqual(expect.objectContaining({
        type: 'cancelled',
        instanceDate: targetDate,
        seriesId: testSeriesId,
      }));
      // Cancelled exceptions should not have newTime property
      expect(Object.keys(exception!)).not.toContain('newTime');
    });

    it('INV 4: exception only for pattern dates', async () => {
      // Create weekly series
      const weeklyResult = await createSeries(adapter, {
        title: 'Weekly',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'weekly', daysOfWeek: ['monday'] },
      });
      expect(weeklyResult.ok).toBe(true);
      if (!weeklyResult.ok) throw new Error(`'INV 4: exception only for pattern dates' setup failed: ${weeklyResult.error.type}`);

      const result = await cancelInstance(
        adapter,
        weeklyResult.value.id,
        parseDate('2024-01-03') // Wednesday, not in pattern
      );

      expect(result.ok).toBe(false);
    });

    it('INV 5: series delete cascades', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));
      await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-16'), parseDateTime('2024-01-16T14:00:00'));

      // Verify exceptions exist
      let exceptions = await getExceptionsBySeries(adapter, testSeriesId);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-15'))).toBe(true);
      expect(exceptions.some(e => e.instanceDate === parseDate('2024-01-16'))).toBe(true);
      expect(exceptions[0].seriesId).toBe(testSeriesId);
      expect(exceptions[1].seriesId).toBe(testSeriesId);
      expect(exceptions.map(e => e.instanceDate).sort()).toEqual([
        parseDate('2024-01-15'),
        parseDate('2024-01-16'),
      ].sort());

      // Capture exception IDs for verification
      const exceptionIds = exceptions.map(e => e.id);
      expect(exceptionIds).toHaveLength(2);

      // Delete series
      await deleteSeries(adapter, testSeriesId);

      // Exceptions should be deleted too
      exceptions = await getExceptionsBySeries(adapter, testSeriesId);
      expect(exceptions).toEqual([]);

      // Also verify via individual lookups
      const ex1 = await adapter.getInstanceException(testSeriesId, parseDate('2024-01-15'));
      const ex2 = await adapter.getInstanceException(testSeriesId, parseDate('2024-01-16'));
      expect(ex1).toBeNull();
      expect(ex2).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: ERROR TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Error Types', () => {
    it('NonExistentInstanceError: cancel instance not in pattern', async () => {
      const weeklyResult = await createSeries(adapter, {
        title: 'Weekly',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'weekly', daysOfWeek: ['monday'] },
      });
      expect(weeklyResult.ok).toBe(true);
      if (!weeklyResult.ok) throw new Error(`'NonExistentInstanceError: cancel instance not in pattern' setup failed: ${weeklyResult.error.type}`);

      const result = await cancelInstance(
        adapter,
        weeklyResult.value.id,
        parseDate('2024-01-02') // Not a Monday
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NonExistentInstanceError');
      }
    });

    it('AlreadyCancelledError: cancel already-cancelled instance', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

      const result = await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('AlreadyCancelledError');
      }
    });

    it('CancelledInstanceError: reschedule cancelled instance', async () => {
      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

      const result = await rescheduleInstance(
        adapter,
        testSeriesId,
        parseDate('2024-01-15'),
        parseDateTime('2024-01-15T14:00:00')
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('CancelledInstanceError');
      }
    });

    it('NoExceptionError: restore instance without exception', async () => {
      const result = await restoreInstance(
        adapter,
        testSeriesId,
        parseDate('2024-01-15')
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NoExceptionError');
      }
    });

    it('NotFoundError: cancel for non-existent series', async () => {
      const result = await cancelInstance(
        adapter,
        'non-existent' as SeriesId,
        parseDate('2024-01-15')
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: REAL-WORLD SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Real-World Scenarios', () => {
    describe('9.1 Skipping a Day', () => {
      it('skip workout one day', async () => {
        // Create weekday series
        const seriesResult = await createSeries(adapter, {
          title: 'Daily Workout',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'skip workout one day' setup failed: ${seriesResult.error.type}`);

        // Skip Wednesday Jan 10
        await cancelInstance(adapter, seriesResult.value.id, parseDate('2024-01-10'));

        const schedule = await getSchedule(adapter, {
          seriesId: seriesResult.value.id,
          range: { start: parseDate('2024-01-08'), end: parseDate('2024-01-12') },
        });

        // Mon, Tue, Thu, Fri should appear; Wed should not
        expect(schedule.some(i => i.date === parseDate('2024-01-08'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-09'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(false);
        expect(schedule.some(i => i.date === parseDate('2024-01-11'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-12'))).toBe(true);
      });

      it('restore skipped day', async () => {
        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-10'));
        await restoreInstance(adapter, testSeriesId, parseDate('2024-01-10'));

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-08'), end: parseDate('2024-01-12') },
        });

        // All days including Wed should appear
        expect(schedule.some(i => i.date === parseDate('2024-01-08'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-09'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-10'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-11'))).toBe(true);
        expect(schedule.some(i => i.date === parseDate('2024-01-12'))).toBe(true);
      });
    });

    describe('9.2 Moving an Appointment', () => {
      it('move meeting earlier', async () => {
        // Series has time at 14:00
        const meetingResult = await createSeries(adapter, {
          title: 'Weekly Meeting',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T14:00:00'),
        });
        expect(meetingResult.ok).toBe(true);
        if (!meetingResult.ok) throw new Error(`'move meeting earlier' setup failed: ${meetingResult.error.type}`);

        // Move to 10am
        await rescheduleInstance(
          adapter,
          meetingResult.value.id,
          parseDate('2024-01-15'),
          parseDateTime('2024-01-15T10:00:00')
        );

        const schedule = await getSchedule(adapter, {
          seriesId: meetingResult.value.id,
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        expect(schedule[0].time).toBe(parseDateTime('2024-01-15T10:00:00'));
      });

      it('move to next day', async () => {
        // Monday meeting
        await rescheduleInstance(
          adapter,
          testSeriesId,
          parseDate('2024-01-08'), // Monday
          parseDateTime('2024-01-09T09:00:00') // Tuesday
        );

        const exception = await getException(adapter, testSeriesId, parseDate('2024-01-08'));
        expect(exception!.newTime).toBe(parseDateTime('2024-01-09T09:00:00'));
      });
    });

    describe('9.3 Vacation Handling', () => {
      it('cancel week of instances', async () => {
        // Cancel Mon-Fri of week 2
        const dates = [
          parseDate('2024-01-08'),
          parseDate('2024-01-09'),
          parseDate('2024-01-10'),
          parseDate('2024-01-11'),
          parseDate('2024-01-12'),
        ];

        // Verify instances exist before cancellation
        const beforeCancel = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: dates[0], end: dates[4] },
        });
        expect(beforeCancel).toHaveLength(5);
        expect(beforeCancel.map(i => i.date)).toEqual(dates);

        for (const date of dates) {
          await cancelInstance(adapter, testSeriesId, date);
        }

        // Verify exception records were created
        const exceptions = await getExceptionsBySeries(adapter, testSeriesId);
        expect(exceptions).toHaveLength(5);
        for (const date of dates) {
          expect(exceptions.some(e =>
            e.instanceDate === date && e.type === 'cancelled'
          )).toBe(true);
        }

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-08'), end: parseDate('2024-01-12') },
        });

        expect(schedule).toEqual([]);

        // LAW 2: Verify other instances still exist
        const afterRange = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-13'), end: parseDate('2024-01-14') },
        });
        expect(afterRange).toHaveLength(2);
      });

      it('restore after vacation', async () => {
        const dates = [
          parseDate('2024-01-08'),
          parseDate('2024-01-09'),
          parseDate('2024-01-10'),
          parseDate('2024-01-11'),
          parseDate('2024-01-12'),
        ];

        // Cancel all
        for (const date of dates) {
          await cancelInstance(adapter, testSeriesId, date);
        }

        // Restore all
        for (const date of dates) {
          await restoreInstance(adapter, testSeriesId, date);
        }

        const schedule = await getSchedule(adapter, {
          seriesId: testSeriesId,
          range: { start: parseDate('2024-01-08'), end: parseDate('2024-01-12') },
        });

        for (const date of dates) {
          expect(schedule.some(i => i.date === date)).toBe(true);
        }
        expect(schedule[0].date).toBe(parseDate('2024-01-08'));
        expect(schedule[4].date).toBe(parseDate('2024-01-12'));
        expect(schedule.map(i => i.date)).toEqual(dates);
      });
    });
  });
});
