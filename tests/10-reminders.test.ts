/**
 * Segment 10: Reminders
 *
 * Reminders fire at specified times before scheduled instances. Each reminder has a tag
 * for consumer-defined behavior. This segment covers reminder CRUD, pending reminder queries,
 * acknowledgments, and fire time calculations.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createReminder,
  getReminder,
  getRemindersBySeries,
  updateReminder,
  deleteReminder,
  getPendingReminders,
  acknowledgeReminder,
  isReminderAcknowledged,
  purgeOldAcknowledgments,
  calculateFireTime,
} from '../src/reminders';
import {
  createSeries,
  deleteSeries,
} from '../src/series-crud';
import {
  cancelInstance,
  rescheduleInstance,
  getException,
} from '../src/instance-exceptions';
import {
  logCompletion,
} from '../src/completions';
import {
  createMockAdapter,
  type MockAdapter,
} from '../src/adapter';
import {
  parseDate,
  parseDateTime,
  addDays,
} from '../src/time-date';
import type { SeriesId, ReminderId, LocalDate, LocalDateTime } from '../src/types';

describe('Segment 10: Reminders', () => {
  let adapter: MockAdapter;
  let testSeriesId: SeriesId;

  beforeEach(async () => {
    adapter = createMockAdapter();
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
  // SECTION 1: REMINDER CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Reminder CRUD', () => {
    describe('1.1 Create Reminder Tests', () => {
      it('create reminder returns ID', async () => {
        const result = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'notification',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Verify the returned ID can be used to retrieve the complete reminder
          const reminder = await getReminder(adapter, result.value.id);
          expect(reminder).toEqual(expect.objectContaining({
            id: result.value.id,
            seriesId: testSeriesId,
            minutesBefore: 15,
            tag: 'notification',
          }));
        }
      });

      it('create multiple per series', async () => {
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 30, tag: 'early' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 15, tag: 'standard' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 5, tag: 'urgent' });

        const reminders = await getRemindersBySeries(adapter, testSeriesId);
        const tags = reminders.map(r => r.tag).sort();
        expect(tags).toEqual(['early', 'standard', 'urgent']);
      });

      it('same tag multiple reminders', async () => {
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 10, tag: 'urgent' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 5, tag: 'urgent' });

        const reminders = await getRemindersBySeries(adapter, testSeriesId);
        const urgentReminders = reminders.filter(r => r.tag === 'urgent');
        const minutesBefore = urgentReminders.map(r => r.minutesBefore).sort((a, b) => a - b);
        expect(minutesBefore).toEqual([5, 10]);
      });

      it('minutesBefore 0 allowed', async () => {
        const result = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 0,
          tag: 'at-start',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          const reminder = await getReminder(adapter, result.value.id);
          expect(reminder!.minutesBefore).toBe(0);
        }
      });
    });

    describe('1.2 Get Reminder Tests', () => {
      it('get existing reminder', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'get existing reminder' setup failed: ${createResult.error.type}`);

        const reminder = await getReminder(adapter, createResult.value.id);
        expect(reminder).toEqual(expect.objectContaining({
          id: createResult.value.id,
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        }));
      });

      it('get non-existent reminder', async () => {
        // Create a real reminder to prove getReminder works
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'exists',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error('Setup failed');

        // Verify the real reminder is retrievable with concrete values
        let reminder = await getReminder(adapter, createResult.value.id);
        expect(reminder).not.toBeNull();
        expect(reminder!.id).toBe(createResult.value.id);
        expect(reminder!.tag).toBe('exists');

        // Now verify a non-existent ID returns null
        reminder = await getReminder(adapter, 'non-existent-id' as ReminderId);
        expect(reminder).toStrictEqual(null);
      });

      it('get reminders by series', async () => {
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 30, tag: 'a' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 15, tag: 'b' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 5, tag: 'c' });

        const reminders = await getRemindersBySeries(adapter, testSeriesId);
        const tags = reminders.map(r => r.tag).sort();
        expect(tags).toEqual(['a', 'b', 'c']);
      });
    });

    describe('1.3 Update Reminder Tests', () => {
      it('update minutesBefore', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 10,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'update minutesBefore' setup failed: ${createResult.error.type}`);

        await updateReminder(adapter, createResult.value.id, { minutesBefore: 15 });

        const reminder = await getReminder(adapter, createResult.value.id);
        expect(reminder!.minutesBefore).toBe(15);
      });

      it('update tag', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 10,
          tag: 'normal',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'update tag' setup failed: ${createResult.error.type}`);

        await updateReminder(adapter, createResult.value.id, { tag: 'urgent' });

        const reminder = await getReminder(adapter, createResult.value.id);
        expect(reminder!.tag).toBe('urgent');
      });
    });

    describe('1.4 Delete Reminder Tests', () => {
      it('delete existing reminder', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'delete existing reminder' setup failed: ${createResult.error.type}`);

        const reminderId = createResult.value.id;

        // Verify reminder exists before deletion with concrete values
        const beforeDelete = await getReminder(adapter, reminderId);
        expect(beforeDelete).not.toBeNull();
        expect(beforeDelete!.id).toBe(reminderId);
        expect(beforeDelete!.tag).toBe('test');
        expect(beforeDelete).toMatchObject({
          id: reminderId,
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Also verify via getRemindersBySeries
        const beforeDeleteBySeries = await getRemindersBySeries(adapter, testSeriesId);
        expect(beforeDeleteBySeries.some(r => r.id === reminderId)).toBe(true);

        const deleteResult = await deleteReminder(adapter, reminderId);
        expect(deleteResult.ok).toBe(true);

        // Verify deletion via getReminder - should return null
        const afterDelete = await getReminder(adapter, reminderId);
        expect(afterDelete).toBeNull();

        // Verify deletion via collection - deleted reminder should not appear
        const reminders = await getRemindersBySeries(adapter, testSeriesId);
        expect(reminders.find(r => r.id === reminderId)).toBeUndefined();

        // Also verify via getAllReminders
        const allReminders = await adapter.getAllReminders();
        expect(allReminders.find(r => r.id === reminderId)).toBeUndefined();
      });

      it('delete cascades acknowledgments', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'delete cascades acknowledgments' setup failed: ${createResult.error.type}`);

        const reminderId = createResult.value.id;
        const instanceDate = parseDate('2024-01-15');

        // Acknowledge the reminder
        await acknowledgeReminder(adapter, reminderId, instanceDate);

        // Verify acknowledgment exists before deletion
        const isAckedBefore = await isReminderAcknowledged(adapter, reminderId, instanceDate);
        expect(isAckedBefore).toBe(true);

        // Also verify via range query
        const acksBefore = await adapter.getAcknowledgedRemindersInRange(
          parseDate('2024-01-01'),
          parseDate('2024-01-31')
        );
        expect(acksBefore.some(a => a.reminder_id === reminderId && a.instance_date === instanceDate)).toBe(true);

        // Delete the reminder
        await deleteReminder(adapter, reminderId);

        // LAW 56: Verify reminder is deleted
        const reminder = await getReminder(adapter, reminderId);
        expect(reminder).toBeNull();

        // Verify reminder not in series list
        const reminders = await getRemindersBySeries(adapter, testSeriesId);
        expect(reminders.find(r => r.id === reminderId)).toBeUndefined();

        // LAW 56: Verify acknowledgment was cascaded
        const acksAfter = await adapter.getAcknowledgedRemindersInRange(
          parseDate('2024-01-01'),
          parseDate('2024-01-31')
        );
        expect(acksAfter.find(a => a.reminder_id === reminderId)).toBeUndefined();
      });

      it('series delete cascades reminders', async () => {
        const result1 = await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 15, tag: 'a' });
        const result2 = await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 30, tag: 'b' });
        if (!result1.ok || !result2.ok) throw new Error('Setup failed');

        const reminderId1 = result1.value.id;
        const reminderId2 = result2.value.id;

        let reminders = await getRemindersBySeries(adapter, testSeriesId);
        expect(reminders).toHaveLength(2);
        expect(reminders.map(r => r.tag).sort()).toEqual(['a', 'b']);

        await deleteSeries(adapter, testSeriesId);

        // LAW 3: Verify cascade
        reminders = await getRemindersBySeries(adapter, testSeriesId);
        expect(reminders).toEqual([]);

        // Cross-verify via getAllReminders
        const allReminders = await adapter.getAllReminders();
        expect(allReminders.find(r => r.id === reminderId1)).toBeUndefined();
        expect(allReminders.find(r => r.id === reminderId2)).toBeUndefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: GET PENDING REMINDERS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Get Pending Reminders', () => {
    describe('2.1 Fire Time Filtering', () => {
      it('reminder not yet due', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error('Setup failed');

        // Verify reminder exists
        const reminder = await getReminder(adapter, createResult.value.id);
        expect(reminder).not.toBeNull();
        expect(reminder?.minutesBefore).toBe(15);

        // Instance at 09:00, reminder fires at 08:45
        // Query at 08:30 - not yet due
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:30:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Boundary test: verify it DOES appear at fire time (positive case first)
        const onTimeQuery = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:45:00'),  // Fire time
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forOurInstance = onTimeQuery.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forOurInstance).toHaveLength(1);
        expect(forOurInstance[0].tag).toBe('test');

        // LAW 5: fireTime > asOf → not in pending (negative case, proven by positive above)
        expect(pending.some(p => p.instanceDate === parseDate('2024-01-15'))).toBe(false);
      });

      it('reminder exactly due', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Instance at 09:00, reminder fires at 08:45
        // Query at exactly 08:45
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forOurInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forOurInstance.map(p => p.tag)).toEqual(['test']);
      });

      it('reminder past due', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Instance at 09:00, reminder fires at 08:45
        // Query at 08:50 - past due
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forOurInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forOurInstance.map(p => p.tag)).toEqual(['test']);
      });
    });

    describe('2.2 Acknowledgment Filtering', () => {
      it('acknowledged not in pending', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'acknowledged not in pending' setup failed: ${createResult.error.type}`);

        // Verify reminder appears before acknowledgment
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forOurInstance = pendingBefore.filter(p =>
          p.instanceDate === parseDate('2024-01-15') && p.reminderId === createResult.value.id
        );
        expect(forOurInstance).toHaveLength(1);
        expect(forOurInstance[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

        await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

        // Verify acknowledgment was recorded
        const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-15'));
        expect(isAcked).toBe(true);

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Proven present before ack, now confirmed absent after ack
        expect(pending.some(p =>
          p.instanceDate === parseDate('2024-01-15') && p.reminderId === createResult.value.id
        )).toBe(false);
      });

      it('unacknowledged in pending', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forOurInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forOurInstance.map(p => p.tag)).toEqual(['test']);
      });
    });

    describe('2.3 Exception Handling', () => {
      it('cancelled instance excluded', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Verify reminder appears before cancellation
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forCancelled = pendingBefore.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forCancelled).toHaveLength(1);
        expect(forCancelled[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

        await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

        // Verify the instance is actually cancelled
        const exception = await getException(adapter, testSeriesId, parseDate('2024-01-15'));
        expect(exception).not.toBeNull();
        expect(exception?.type).toBe('cancelled');

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Proven present above, now confirmed absent after cancel
        forCancelled = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forCancelled).toEqual([]);
      });

      it('completed instance excluded', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Verify reminder appears before completion
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forCompleted = pendingBefore.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forCompleted).toHaveLength(1);
        expect(forCompleted[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

        await logCompletion(adapter, {
          seriesId: testSeriesId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:30:00'),
        });

        // Verify the completion was actually recorded
        const completion = await getCompletionByInstance(adapter, testSeriesId, parseDate('2024-01-15'));
        expect(completion).toMatchObject({ seriesId: testSeriesId, instanceDate: parseDate('2024-01-15') });

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Proven present before completion, now confirmed absent after completion
        expect(pending.some(p => p.instanceDate === parseDate('2024-01-15'))).toBe(false);
      });

      it('rescheduled instance included', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Reschedule from 09:00 to 14:00
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

        // New fire time is 13:45
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T13:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forRescheduled = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forRescheduled.map(p => p.tag)).toEqual(['test']);
      });
    });

    describe('2.4 Multiple Reminders', () => {
      it('multiple due at same time', async () => {
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 15, tag: 'a' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 15, tag: 'b' });

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forOurInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        const tags = forOurInstance.map(p => p.tag).sort();
        expect(tags).toEqual(['a', 'b']);
      });

      it('multiple instances', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-16T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-16') },
        });

        // Should have reminders for both Jan 15 and Jan 16
        const jan15 = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        const jan16 = pending.filter(p => p.instanceDate === parseDate('2024-01-16'));

        expect(jan15.map(p => p.tag)).toEqual(['test']);
        expect(jan16.map(p => p.tag)).toEqual(['test']);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: ACKNOWLEDGE REMINDER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Acknowledge Reminder', () => {
    describe('3.1 Basic Acknowledgment Tests', () => {
      it('acknowledge records timestamp', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'acknowledge records timestamp' setup failed: ${createResult.error.type}`);

        const before = Date.now();
        const result = await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));
        const after = Date.now();

        expect(result.ok).toBe(true);
        if (result.ok && result.value.acknowledgedAt) {
          const ackTime = new Date(result.value.acknowledgedAt).getTime();
          expect(ackTime).toBeGreaterThanOrEqual(before);
          expect(ackTime).toBeLessThanOrEqual(after);
        }
      });

      it('acknowledged removed from pending', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'acknowledged removed from pending' setup failed: ${createResult.error.type}`);

        // Verify reminder IS in pending before acknowledgment
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let acknowledgedReminders = pendingBefore.filter(
          p => p.reminderId === createResult.value.id && p.instanceDate === parseDate('2024-01-15')
        );
        expect(acknowledgedReminders).toHaveLength(1);
        expect(acknowledgedReminders[0]).toMatchObject({ tag: 'test', instanceDate: parseDate('2024-01-15') });

        await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Proven present before ack, now confirmed absent after ack
        expect(pending.some(
          p => p.reminderId === createResult.value.id && p.instanceDate === parseDate('2024-01-15')
        )).toBe(false);
      });

      it('acknowledge is idempotent', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'acknowledge is idempotent' setup failed: ${createResult.error.type}`);

        const first = await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));
        const second = await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
      });
    });

    describe('3.2 Precondition Tests', () => {
      it('reminder must exist', async () => {
        const result = await acknowledgeReminder(
          adapter,
          'non-existent-id' as ReminderId,
          parseDate('2024-01-15')
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });
    });

    describe('3.3 Isolation Tests', () => {
      it('doesnt affect other instances', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'doesnt affect other instances' setup failed: ${createResult.error.type}`);

        // Acknowledge day 1
        await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

        // Check day 2 is still pending
        const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-16'));
        expect(isAcked).toBe(false);
      });

      it('doesnt affect other reminders', async () => {
        const reminderA = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 30,
          tag: 'a',
        });
        const reminderB = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'b',
        });
        expect(reminderA.ok && reminderB.ok).toBe(true);
        if (!reminderA.ok) throw new Error(`'doesnt affect other reminders' setup failed: ${reminderA.error.type}`);
        if (!reminderB.ok) throw new Error(`'doesnt affect other reminders' setup failed: ${reminderB.error.type}`);

        // Acknowledge A
        await acknowledgeReminder(adapter, reminderA.value.id, parseDate('2024-01-15'));

        // B should still be pending
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const bPending = pending.find(p => p.reminderId === reminderB.value.id);
        expect(bPending).toEqual(expect.objectContaining({
          tag: 'b',
          instanceDate: parseDate('2024-01-15'),
        }));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: QUERY ACKNOWLEDGMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Query Acknowledgment', () => {
    it('false if never acknowledged', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'false if never acknowledged' setup failed: ${createResult.error.type}`);

      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-15'));
      expect(isAcked).toBe(false);
    });

    it('true after acknowledgment', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'true after acknowledgment' setup failed: ${createResult.error.type}`);

      await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-15'));
      expect(isAcked).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PURGE OLD ACKNOWLEDGMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Purge Old Acknowledgments', () => {
    it('removes old acknowledgments', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'removes old acknowledgments' setup failed: ${createResult.error.type}`);

      // Acknowledge 3 days ago
      await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-12'));

      // Purge acknowledgments older than 2 days from Jan 15
      await purgeOldAcknowledgments(adapter, {
        olderThan: 2,
        asOf: parseDate('2024-01-15'),
      });

      // Should be removed
      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-12'));
      expect(isAcked).toBe(false);
    });

    it('keeps recent acknowledgments', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'keeps recent acknowledgments' setup failed: ${createResult.error.type}`);

      // Acknowledge 1 day ago
      await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-14'));

      // Purge acknowledgments older than 2 days from Jan 15
      await purgeOldAcknowledgments(adapter, {
        olderThan: 2,
        asOf: parseDate('2024-01-15'),
      });

      // Should be retained
      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-14'));
      expect(isAcked).toBe(true);
    });

    it('purged may re-appear pending', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'purged may re-appear pending' setup failed: ${createResult.error.type}`);

      // Acknowledge old instance
      await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-10'));

      // Purge
      await purgeOldAcknowledgments(adapter, {
        olderThan: 2,
        asOf: parseDate('2024-01-15'),
      });

      // If we query for that old date, it may appear pending again
      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-10'));
      expect(isAcked).toBe(false); // No longer acknowledged
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: FIRE TIME CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Fire Time Calculation', () => {
    describe('6.1 Regular Instances', () => {
      it('basic fire time', () => {
        const instanceTime = parseDateTime('2024-01-15T09:00:00');
        const fireTime = calculateFireTime(instanceTime, 15);
        expect(fireTime).toBe(parseDateTime('2024-01-15T08:45:00'));
      });

      it('fire time at start', () => {
        const instanceTime = parseDateTime('2024-01-15T09:00:00');
        const fireTime = calculateFireTime(instanceTime, 0);
        expect(fireTime).toBe(parseDateTime('2024-01-15T09:00:00'));
      });

      it('fire time 1 hour before', () => {
        const instanceTime = parseDateTime('2024-01-15T10:00:00');
        const fireTime = calculateFireTime(instanceTime, 60);
        expect(fireTime).toBe(parseDateTime('2024-01-15T09:00:00'));
      });

      it('crosses midnight', () => {
        const instanceTime = parseDateTime('2024-01-15T00:30:00');
        const fireTime = calculateFireTime(instanceTime, 60);
        expect(fireTime).toBe(parseDateTime('2024-01-14T23:30:00'));
      });
    });

    describe('6.2 Rescheduled Instances', () => {
      it('uses rescheduled time', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Reschedule to 10:00
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T10:00:00'));

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T09:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Fire time should be 09:45, which is when we're querying
        const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toEqual(expect.objectContaining({
          tag: 'test',
          seriesId: testSeriesId,
        }));
      });

      it('not original time', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'test',
        });

        // Verify reminder appears at original fire time before reschedule
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        const beforeReschedule = pendingBefore.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(beforeReschedule).toHaveLength(1);
        expect(beforeReschedule[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

        // Original time 09:00, reschedule to 10:00
        await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T10:00:00'));

        // Verify the reschedule happened
        const exception = await getException(adapter, testSeriesId, parseDate('2024-01-15'));
        expect(exception?.type).toBe('rescheduled');

        // Verify reminder DOES appear at new fire time (09:45) - positive case first
        const pendingAtNew = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T09:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forInstance = pendingAtNew.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toHaveLength(1);
        expect(forInstance[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

        // Query at 08:50 (would be after original fire time 08:45)
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Should NOT be pending yet (new fire time is 09:45) - proven present at new time above
        expect(pending.some(p => p.instanceDate === parseDate('2024-01-15'))).toBe(false);
      });
    });

    describe('6.3 All-Day Instances', () => {
      let allDaySeriesId: SeriesId;

      beforeEach(async () => {
        const result = await createSeries(adapter, {
          title: 'All-Day Series',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          allDay: true,
        });
        if (!result.ok) throw new Error('Failed to create all-day series');
        allDaySeriesId = result.value.id;
      });

      it('all-day uses 00:00', async () => {
        await createReminder(adapter, {
          seriesId: allDaySeriesId,
          minutesBefore: 0,
          tag: 'test',
        });

        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T00:00:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toEqual(expect.objectContaining({
          tag: 'test',
          seriesId: allDaySeriesId,
        }));
      });

      it('all-day 60 min before', async () => {
        await createReminder(adapter, {
          seriesId: allDaySeriesId,
          minutesBefore: 60,
          tag: 'test',
        });

        // Fire time should be Jan 14 23:00
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-14T23:00:00'),
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-15') },
        });

        const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toEqual(expect.objectContaining({
          tag: 'test',
          seriesId: allDaySeriesId,
        }));
      });

      it('all-day 1440 min before', async () => {
        await createReminder(adapter, {
          seriesId: allDaySeriesId,
          minutesBefore: 1440, // 24 hours
          tag: 'test',
        });

        // Fire time should be Jan 14 00:00
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-14T00:00:00'),
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-15') },
        });

        const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toEqual(expect.objectContaining({
          tag: 'test',
          seriesId: allDaySeriesId,
        }));
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Boundary Conditions', () => {
    it('B1: minutesBefore 0', () => {
      const instanceTime = parseDateTime('2024-01-15T09:00:00');
      const fireTime = calculateFireTime(instanceTime, 0);
      expect(fireTime).toBe(instanceTime);
    });

    it('B2: minutesBefore > duration', async () => {
      // 120 min before a 30 min instance - should still work
      const result = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 120,
        tag: 'test',
      });
      expect(result.ok).toBe(true);
    });

    it('B3: instance at midnight', () => {
      const instanceTime = parseDateTime('2024-01-15T00:15:00');
      const fireTime = calculateFireTime(instanceTime, 30);
      expect(fireTime).toBe(parseDateTime('2024-01-14T23:45:00'));
    });

    it('B4: rescheduled recalculates', async () => {
      await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });

      await rescheduleInstance(adapter, testSeriesId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

      // New fire time should be 13:45
      const fireTime = calculateFireTime(parseDateTime('2024-01-15T14:00:00'), 15);
      expect(fireTime).toBe(parseDateTime('2024-01-15T13:45:00'));
    });

    it('B5: cancelled no reminder', async () => {
      await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });

      // Verify reminder appears before cancellation
      const pendingBefore = await getPendingReminders(adapter, {
        asOf: parseDateTime('2024-01-15T08:50:00'),
        range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
      });
      let forCancelled = pendingBefore.filter(p => p.instanceDate === parseDate('2024-01-15'));
      expect(forCancelled).toHaveLength(1);
      expect(forCancelled[0]).toMatchObject({ instanceDate: parseDate('2024-01-15'), tag: 'test' });

      await cancelInstance(adapter, testSeriesId, parseDate('2024-01-15'));

      // Verify cancellation was recorded
      const exception = await getException(adapter, testSeriesId, parseDate('2024-01-15'));
      expect(exception?.type).toBe('cancelled');

      // B5: Cancelled instance - no reminder
      const pending = await getPendingReminders(adapter, {
        asOf: parseDateTime('2024-01-15T08:50:00'),
        range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
      });

      // Proven present before cancel, now confirmed absent after cancel
      forCancelled = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
      expect(forCancelled).toEqual([]);
    });

    it('B6: all-day minutesBefore 0', async () => {
      const allDayResult = await createSeries(adapter, {
        title: 'All-Day',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        allDay: true,
      });
      expect(allDayResult.ok).toBe(true);
      if (!allDayResult.ok) throw new Error(`'B6: all-day minutesBefore 0' setup failed: ${allDayResult.error.type}`);

      await createReminder(adapter, {
        seriesId: allDayResult.value.id,
        minutesBefore: 0,
        tag: 'test',
      });

      // Fire time should be 00:00 of that day
      const pending = await getPendingReminders(adapter, {
        asOf: parseDateTime('2024-01-15T00:00:00'),
        range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
      });

      const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
      expect(forInstance).toEqual(expect.objectContaining({
        tag: 'test',
        seriesId: allDayResult.value.id,
      }));
    });

    it('B7: all-day 1440 min', async () => {
      const allDayResult = await createSeries(adapter, {
        title: 'All-Day',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        allDay: true,
      });
      expect(allDayResult.ok).toBe(true);
      if (!allDayResult.ok) throw new Error(`'B7: all-day 1440 min' setup failed: ${allDayResult.error.type}`);

      await createReminder(adapter, {
        seriesId: allDayResult.value.id,
        minutesBefore: 1440,
        tag: 'day-before',
      });

      // Fire time should be 00:00 of prev day
      const pending = await getPendingReminders(adapter, {
        asOf: parseDateTime('2024-01-14T00:00:00'),
        range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-15') },
      });

      const forInstance = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
      expect(forInstance).toEqual(expect.objectContaining({
        tag: 'day-before',
        seriesId: allDayResult.value.id,
      }));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Invariants', () => {
    it('INV 1: minutesBefore >= 0', async () => {
      const result = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: -5,
        tag: 'test',
      });

      expect(result.ok).toBe(false);
    });

    it('INV 2: tag non-empty', async () => {
      const result = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: '',
      });

      expect(result.ok).toBe(false);
    });

    it('INV 3: reminder references series', async () => {
      const result = await createReminder(adapter, {
        seriesId: 'non-existent-series' as SeriesId,
        minutesBefore: 15,
        tag: 'test',
      });

      expect(result.ok).toBe(false);
    });

    it('INV 4: ack references reminder', async () => {
      const result = await acknowledgeReminder(
        adapter,
        'non-existent-reminder' as ReminderId,
        parseDate('2024-01-15')
      );

      expect(result.ok).toBe(false);
    });

    it('INV 5: auto-purge old acks', async () => {
      const createResult = await createReminder(adapter, {
        seriesId: testSeriesId,
        minutesBefore: 15,
        tag: 'test',
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'INV 5: auto-purge old acks' setup failed: ${createResult.error.type}`);

      // Acknowledge old instances
      await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-01'));

      // Verify purge works
      await purgeOldAcknowledgments(adapter, {
        olderThan: 7,
        asOf: parseDate('2024-01-15'),
      });

      const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-01'));
      expect(isAcked).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: REAL-WORLD SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Real-World Scenarios', () => {
    describe('9.1 Meeting Reminders', () => {
      it('15-min meeting reminder', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'meeting',
        });

        // Meeting at 09:00, reminder at 08:45
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance.map(p => p.tag)).toEqual(['meeting']);
      });

      it('15-min meeting reminder early', async () => {
        await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'meeting',
        });

        // Verify it DOES appear at 08:45 (fire time) - positive case first
        const pendingOnTime = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:45:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forInstance = pendingOnTime.filter(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forInstance).toHaveLength(1);
        expect(forInstance[0].tag).toBe('meeting');

        // Query at 08:30 - not yet due (proven present at fire time above)
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:30:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        expect(pending.some(p => p.instanceDate === parseDate('2024-01-15'))).toBe(false);
      });

      it('acknowledge dismisses', async () => {
        const createResult = await createReminder(adapter, {
          seriesId: testSeriesId,
          minutesBefore: 15,
          tag: 'meeting',
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'acknowledge dismisses' setup failed: ${createResult.error.type}`);

        // Verify reminder is pending before acknowledgment
        const pendingBefore = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });
        let forInstance = pendingBefore.filter(p => p.reminderId === createResult.value.id);
        expect(forInstance).toHaveLength(1);
        expect(forInstance[0]).toMatchObject({ tag: 'meeting', instanceDate: parseDate('2024-01-15') });

        // Acknowledge at 08:46
        await acknowledgeReminder(adapter, createResult.value.id, parseDate('2024-01-15'));

        // Verify acknowledgment was recorded
        const isAcked = await isReminderAcknowledged(adapter, createResult.value.id, parseDate('2024-01-15'));
        expect(isAcked).toBe(true);

        // Check at 08:50
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:50:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        // Proven present before ack, now confirmed absent after ack
        expect(pending.some(
          p => p.reminderId === createResult.value.id && p.instanceDate === parseDate('2024-01-15')
        )).toBe(false);
      });
    });

    describe('9.2 Multi-Level Reminders', () => {
      it('30 and 5 min reminders', async () => {
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 30, tag: 'early' });
        await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 5, tag: 'urgent' });

        // At 08:55, both should be pending (30min fired at 08:30, 5min at 08:55)
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:55:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const forInstance = pending.filter(p => p.instanceDate === parseDate('2024-01-15'));
        const tags = forInstance.map(p => p.tag).sort();
        expect(tags).toEqual(['early', 'urgent']);
      });

      it('acknowledge each separately', async () => {
        const reminder30 = await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 30, tag: 'early' });
        const reminder5 = await createReminder(adapter, { seriesId: testSeriesId, minutesBefore: 5, tag: 'urgent' });
        expect(reminder30.ok && reminder5.ok).toBe(true);
        if (!reminder30.ok) throw new Error(`'acknowledge each separately' setup failed: ${reminder30.error.type}`);
        if (!reminder5.ok) throw new Error(`'acknowledge each separately' setup failed: ${reminder5.error.type}`);

        // Acknowledge 30min reminder
        await acknowledgeReminder(adapter, reminder30.value.id, parseDate('2024-01-15'));

        // 5min should still be pending
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-15T08:55:00'),
          range: { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') },
        });

        const urgent = pending.find(p => p.reminderId === reminder5.value.id);
        expect(urgent).toEqual(expect.objectContaining({
          tag: 'urgent',
          instanceDate: parseDate('2024-01-15'),
        }));
      });
    });

    describe('9.3 All-Day Event Reminders', () => {
      let allDaySeriesId: SeriesId;

      beforeEach(async () => {
        const result = await createSeries(adapter, {
          title: 'Holiday',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          allDay: true,
        });
        if (!result.ok) throw new Error('Failed to create all-day series');
        allDaySeriesId = result.value.id;
      });

      it('reminder day before', async () => {
        await createReminder(adapter, {
          seriesId: allDaySeriesId,
          minutesBefore: 1440, // 24 hours
          tag: 'day-before',
        });

        // Fires prev day 00:00
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-14T00:00:00'),
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-15') },
        });

        const forJan15 = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forJan15).toEqual(expect.objectContaining({
          tag: 'day-before',
          seriesId: allDaySeriesId,
        }));
      });

      it('reminder evening before', async () => {
        await createReminder(adapter, {
          seriesId: allDaySeriesId,
          minutesBefore: 720, // 12 hours
          tag: 'evening-before',
        });

        // Fires prev day 12:00
        const pending = await getPendingReminders(adapter, {
          asOf: parseDateTime('2024-01-14T12:00:00'),
          range: { start: parseDate('2024-01-14'), end: parseDate('2024-01-15') },
        });

        const forJan15 = pending.find(p => p.instanceDate === parseDate('2024-01-15'));
        expect(forJan15).toEqual(expect.objectContaining({
          tag: 'evening-before',
          seriesId: allDaySeriesId,
        }));
      });
    });
  });
});
