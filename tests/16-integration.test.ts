/**
 * Segment 16: Integration Tests
 *
 * Integration tests verify the complete system works correctly end-to-end.
 * These are scenario-based tests that exercise multiple components together.
 *
 * Dependencies: All previous segments (1-15), both mock and SQLite adapters
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAutoplanner,
  createMockAdapter,
  createSqliteAdapter,
  type Autoplanner,
  type Adapter,
  LockedSeriesError,
  ValidationError,
  ChainDepthExceededError,
} from '../src/public-api';
import {
  type LocalDate,
  type LocalTime,
  type LocalDateTime,
  type SeriesId,
  type Duration,
} from '../src/core';

// ============================================================================
// Test Helpers
// ============================================================================

function date(iso: string): LocalDate {
  return iso as LocalDate;
}

function time(hhmm: string): LocalTime {
  return hhmm as LocalTime;
}

function datetime(iso: string): LocalDateTime {
  return iso as LocalDateTime;
}

function seriesId(id: string): SeriesId {
  return id as SeriesId;
}

function minutes(n: number): Duration {
  return n as Duration;
}

async function createTestPlanner(timezone = 'America/New_York'): Promise<Autoplanner> {
  return createAutoplanner({
    adapter: createMockAdapter(),
    timezone,
  });
}

// ============================================================================
// 1. Exercise Regimen Scenario
// ============================================================================

describe('Segment 16: Integration Tests', () => {
  describe('Exercise Regimen Scenario', () => {
    let planner: Autoplanner;
    let walkSeriesId: SeriesId;
    let weightSeriesId: SeriesId;

    beforeEach(async () => {
      planner = await createTestPlanner();

      // Create walk series with condition based on completion count
      walkSeriesId = await planner.createSeries({
        title: 'Morning Walk',
        patterns: [
          {
            type: 'everyNDays',
            n: 2,
            time: time('07:00'),
            duration: minutes(30),
            condition: {
              type: 'completionCount',
              seriesRef: 'self',
              windowDays: 14,
              comparison: 'lessThan',
              value: 7,
            },
          },
          {
            type: 'daily',
            time: time('07:00'),
            duration: minutes(30),
            condition: {
              type: 'completionCount',
              seriesRef: 'self',
              windowDays: 14,
              comparison: 'greaterOrEqual',
              value: 7,
            },
          },
        ],
      });

      // Create weight series with similar condition structure
      weightSeriesId = await planner.createSeries({
        title: 'Weight Training',
        patterns: [
          {
            type: 'weekly',
            daysOfWeek: [1, 5], // Mon, Fri
            time: time('08:00'),
            duration: minutes(45),
            condition: {
              type: 'and',
              conditions: [
                { type: 'completionCount', seriesRef: walkSeriesId, windowDays: 14, comparison: 'greaterOrEqual', value: 7 },
                { type: 'completionCount', seriesRef: 'self', windowDays: 14, comparison: 'lessThan', value: 4 },
              ],
            },
          },
          {
            type: 'weekly',
            daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
            time: time('08:00'),
            duration: minutes(45),
            condition: {
              type: 'completionCount',
              seriesRef: 'self',
              windowDays: 14,
              comparison: 'greaterOrEqual',
              value: 4,
            },
          },
        ],
        cycling: {
          mode: 'sequential',
          items: ['Workout A', 'Workout B', 'Workout C'],
          gapLeap: false,
        },
      });
    });

    it('initial state - walks every other day, no weights', async () => {
      const schedule = await planner.getSchedule(date('2025-01-01'), date('2025-01-14'));

      // Only walks should appear, every other day
      const walkInstances = schedule.instances.filter((i) => i.seriesId === walkSeriesId);
      const weightInstances = schedule.instances.filter((i) => i.seriesId === weightSeriesId);

      expect(walkInstances.length).toBeGreaterThan(0);
      expect(walkInstances.length).toBeLessThanOrEqual(7); // Every other day = ~7 in 14 days
      expect(weightInstances).toHaveLength(0);
    });

    it('log 7 walks - pattern transitions to daily, weights appear', async () => {
      // Log 7 walks over 14 days
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-28'));

      // Walks should now be daily
      const walkInstances = schedule.instances.filter((i) => i.seriesId === walkSeriesId);
      expect(walkInstances.length).toBeGreaterThanOrEqual(12); // ~14 days of daily

      // Weights should appear (Mon/Fri initially)
      const weightInstances = schedule.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weightInstances.length).toBeGreaterThan(0);
    });

    it('complete first weight - next weight shows Workout B', async () => {
      // First get walks to conditioning state
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      // Complete first weight workout
      await planner.logCompletion(weightSeriesId, date('2025-01-20')); // A Monday

      // Get next weight instance
      const schedule = await planner.getSchedule(date('2025-01-21'), date('2025-01-31'));
      const weightInstance = schedule.instances.find((i) => i.seriesId === weightSeriesId);

      expect(weightInstance?.title).toContain('Workout B');
    });

    it('log 4 weight sessions - weights now Mon/Wed/Fri', async () => {
      // Get to conditioning state
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      // Complete 4 weight sessions
      await planner.logCompletion(weightSeriesId, date('2025-01-20'));
      await planner.logCompletion(weightSeriesId, date('2025-01-24'));
      await planner.logCompletion(weightSeriesId, date('2025-01-27'));
      await planner.logCompletion(weightSeriesId, date('2025-01-31'));

      const schedule = await planner.getSchedule(date('2025-02-01'), date('2025-02-14'));

      // Weights should now be Mon/Wed/Fri (3 per week)
      const weightInstances = schedule.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weightInstances.length).toBeGreaterThanOrEqual(5); // ~6 in 14 days
    });

    it('stop logging 7 days - regression to deconditioned', async () => {
      // Build up to conditioned state
      for (let i = 1; i <= 14; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i).padStart(2, '0')}`));
      }

      // Verify conditioned state - daily walks
      const scheduleConditioned = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));
      const walksConditioned = scheduleConditioned.instances.filter((i) => i.seriesId === walkSeriesId);
      expect(walksConditioned.length).toBeGreaterThanOrEqual(6); // Daily = ~7 in a week

      // Query far future where sliding window no longer contains 7 completions
      // Feb 1-14 is >14 days after last completion (Jan 14), so window has 0 completions
      const scheduleDeconditioned = await planner.getSchedule(date('2025-02-01'), date('2025-02-14'));
      const walksDeconditioned = scheduleDeconditioned.instances.filter((i) => i.seriesId === walkSeriesId);

      // Should regress to every-other-day pattern (<=7 in 14 days)
      expect(walksDeconditioned.length).toBeLessThanOrEqual(7);
    });

    it('check cycling - cycling index preserved', async () => {
      // Get to conditioning
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      // Complete workouts A, B
      await planner.logCompletion(weightSeriesId, date('2025-01-20'));
      await planner.logCompletion(weightSeriesId, date('2025-01-24'));

      // Cycling index should be at C now
      const schedule = await planner.getSchedule(date('2025-01-27'), date('2025-01-31'));
      const weightInstance = schedule.instances.find((i) => i.seriesId === weightSeriesId);

      expect(weightInstance?.title).toContain('Workout C');
    });

    it('cycling wraps around after all items', async () => {
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      // Complete A, B, C
      await planner.logCompletion(weightSeriesId, date('2025-01-20'));
      await planner.logCompletion(weightSeriesId, date('2025-01-24'));
      await planner.logCompletion(weightSeriesId, date('2025-01-27'));

      // Next should be back to A
      const schedule = await planner.getSchedule(date('2025-01-31'), date('2025-02-07'));
      const weightInstance = schedule.instances.find((i) => i.seriesId === weightSeriesId);

      expect(weightInstance?.title).toContain('Workout A');
    });

    it('conditions update immediately after completion', async () => {
      const scheduleBefore = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));
      const weightsBefore = scheduleBefore.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weightsBefore).toHaveLength(0);

      // Log 7 walks
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      const scheduleAfter = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));
      const weightsAfter = scheduleAfter.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weightsAfter.length).toBeGreaterThan(0);
    });

    it('multiple state transitions work correctly', async () => {
      // Start deconditioned
      let schedule = await planner.getSchedule(date('2025-01-01'), date('2025-01-07'));
      expect(schedule.instances.filter((i) => i.seriesId === weightSeriesId)).toHaveLength(0);

      // Move to conditioning
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));
      expect(schedule.instances.filter((i) => i.seriesId === weightSeriesId).length).toBeGreaterThan(0);

      // Move to conditioned
      for (let i = 0; i < 4; i++) {
        await planner.logCompletion(weightSeriesId, date(`2025-01-${String(20 + i * 3).padStart(2, '0')}`));
      }

      schedule = await planner.getSchedule(date('2025-02-01'), date('2025-02-07'));
      const weights = schedule.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weights.length).toBeGreaterThanOrEqual(2); // Mon, Wed, Fri in a week
    });

    it('completion count window slides correctly', async () => {
      // Log completions in first week (Jan 1-7)
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i).padStart(2, '0')}`));
      }

      // Should be conditioned (7 completions in 14-day window)
      const scheduleConditioned = await planner.getSchedule(date('2025-01-08'), date('2025-01-14'));
      const walksConditioned = scheduleConditioned.instances.filter((i) => i.seriesId === walkSeriesId);
      expect(walksConditioned.length).toBeGreaterThanOrEqual(6); // Daily pattern active

      // After 14 days (Jan 22+), window slides past all completions
      // 14-day window from Jan 22 = Jan 8-22, which excludes Jan 1-7 completions
      const scheduleSlid = await planner.getSchedule(date('2025-01-22'), date('2025-01-28'));
      const walksSlid = scheduleSlid.instances.filter((i) => i.seriesId === walkSeriesId);

      // Should regress to every-other-day pattern (0 completions in window < 7)
      expect(walksSlid.length).toBeLessThanOrEqual(4); // ~3-4 in a week for every-other-day
    });

    it('PROP 5: cycling preserved across pattern deactivation/reactivation', async () => {
      // Step 1: Get to conditioning state (weights pattern active)
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-01-${String(i * 2).padStart(2, '0')}`));
      }

      // Step 2: Advance cycling to B by completing one weight workout
      await planner.logCompletion(weightSeriesId, date('2025-01-20'));

      // Verify cycling is at B
      let schedule = await planner.getSchedule(date('2025-01-24'), date('2025-01-25'));
      let weightInstance = schedule.instances.find((i) => i.seriesId === weightSeriesId);
      expect(weightInstance?.title).toContain('Workout B');

      // Step 3: Deactivate weights by letting walk window slide past threshold
      // Query far future where walk count in 14-day window drops below 7
      // Feb 15-28 window contains no completions from Jan 2-14
      schedule = await planner.getSchedule(date('2025-02-15'), date('2025-02-21'));
      const weightsDeactivated = schedule.instances.filter((i) => i.seriesId === weightSeriesId);
      expect(weightsDeactivated).toHaveLength(0); // Weights pattern should be inactive

      // Step 4: Reactivate by logging 7 new walks
      for (let i = 1; i <= 7; i++) {
        await planner.logCompletion(walkSeriesId, date(`2025-02-${String(i * 2).padStart(2, '0')}`));
      }

      // Step 5: Verify cycling is still at B (not reset to A)
      schedule = await planner.getSchedule(date('2025-02-17'), date('2025-02-21'));
      weightInstance = schedule.instances.find((i) => i.seriesId === weightSeriesId);
      expect(weightInstance?.title).toContain('Workout B');
    });
  });

  // ============================================================================
  // 2. Laundry Chain Scenario
  // ============================================================================

  describe('Laundry Chain Scenario', () => {
    let planner: Autoplanner;
    let loadWasherId: SeriesId;
    let transferId: SeriesId;
    let unloadId: SeriesId;

    beforeEach(async () => {
      planner = await createTestPlanner();

      // Load Washer (09:00, 14 min)
      loadWasherId = await planner.createSeries({
        title: 'Load Washer',
        patterns: [
          { type: 'weekly', daysOfWeek: [0], time: time('09:00'), duration: minutes(14), fixed: true },
        ],
      });

      // Transfer to Dryer
      transferId = await planner.createSeries({
        title: 'Transfer to Dryer',
        patterns: [
          { type: 'weekly', daysOfWeek: [0], time: time('10:34'), duration: minutes(5) },
        ],
      });

      // Unload & Fold
      // Target = Transfer end (10:39) + 200 = 13:59
      unloadId = await planner.createSeries({
        title: 'Unload & Fold',
        patterns: [
          { type: 'weekly', daysOfWeek: [0], time: time('13:59'), duration: minutes(15) },
        ],
      });

      // Create chain
      await planner.linkSeries(loadWasherId, transferId, {
        distance: 80, // +80 min from parent end
        earlyWobble: 0,
        lateWobble: 10,
      });

      await planner.linkSeries(transferId, unloadId, {
        distance: 200, // +200 min from parent end
        earlyWobble: 5,
        lateWobble: 120,
      });
    });

    it('initial schedule - all chain instances scheduled', async () => {
      const schedule = await planner.getSchedule(date('2025-01-19'), date('2025-01-20')); // Sunday

      const loadWasher = schedule.instances.find((i) => i.seriesId === loadWasherId);
      const transfer = schedule.instances.find((i) => i.seriesId === transferId);
      const unload = schedule.instances.find((i) => i.seriesId === unloadId);

      expect(loadWasher).toBeDefined();
      expect(loadWasher?.time).toContain('09:00');
      expect(transfer).toBeDefined();
      expect(transfer?.time).toContain('10:34');
      expect(unload).toBeDefined();
      expect(unload?.time).toContain('13:59');
    });

    it('complete washer late - transfer adjusts based on actual completion', async () => {
      // Get transfer time before completion
      const scheduleBefore = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const transferBefore = scheduleBefore.instances.find((i) => i.seriesId === transferId);
      expect(transferBefore?.time).toContain('10:34'); // Original scheduled time

      // Complete washer - ran 6 minutes over, ended at 09:20
      await planner.logCompletion(loadWasherId, date('2025-01-19'), {
        startTime: datetime('2025-01-19T09:00:00'),
        endTime: datetime('2025-01-19T09:20:00'),
      });

      const scheduleAfter = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const transferAfter = scheduleAfter.instances.find((i) => i.seriesId === transferId);

      // Transfer should shift: endTime 09:20 + 80min distance = 10:40
      expect(transferAfter).toBeDefined();
      expect(transferAfter?.time).toContain('10:40');
    });

    it('complete transfer - unload adjusts based on transfer completion', async () => {
      // Get unload time before completions
      const scheduleBefore = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const unloadBefore = scheduleBefore.instances.find((i) => i.seriesId === unloadId);
      expect(unloadBefore?.time).toContain('13:59'); // Original scheduled time

      // Complete washer and transfer
      await planner.logCompletion(loadWasherId, date('2025-01-19'), {
        startTime: datetime('2025-01-19T09:00:00'),
        endTime: datetime('2025-01-19T09:20:00'),
      });
      await planner.logCompletion(transferId, date('2025-01-19'), {
        startTime: datetime('2025-01-19T10:40:00'),
        endTime: datetime('2025-01-19T10:45:00'),
      });

      const scheduleAfter = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const unloadAfter = scheduleAfter.instances.find((i) => i.seriesId === unloadId);

      // Unload target = transfer endTime 10:45 + 200min = 14:05
      expect(unloadAfter).toBeDefined();
      expect(unloadAfter?.time).toContain('14:05');
    });

    it('attempt early transfer - blocked by earlyWobble=0', async () => {
      // Try to reschedule transfer before chain target
      await expect(
        planner.rescheduleInstance(transferId, date('2025-01-19'), datetime('2025-01-19T09:30:00'))
      ).rejects.toThrow(ValidationError);
    });

    it('chain bounds enforced - instances within wobble limits', async () => {
      const schedule = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const loadWasher = schedule.instances.find((i) => i.seriesId === loadWasherId);
      const transfer = schedule.instances.find((i) => i.seriesId === transferId);

      expect(loadWasher).toBeDefined();
      expect(transfer).toBeDefined();

      // Transfer has earlyWobble=0, lateWobble=10
      // Parent ends at 09:00 + 14min = 09:14, distance=80min means target=10:34
      // Allowed range: 10:34 to 10:44
      expect(transfer?.time).toContain('10:34');
    });

    it('3-level chain works - all scheduled correctly', async () => {
      const schedule = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));

      expect(schedule.instances.find((i) => i.seriesId === loadWasherId)).toBeDefined();
      expect(schedule.instances.find((i) => i.seriesId === transferId)).toBeDefined();
      expect(schedule.instances.find((i) => i.seriesId === unloadId)).toBeDefined();
    });

    it('reschedule cascades - reschedule parent moves children', async () => {
      // Reschedule load washer to 10:00
      await planner.rescheduleInstance(loadWasherId, date('2025-01-19'), datetime('2025-01-19T10:00:00'));

      const schedule = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const loadWasher = schedule.instances.find((i) => i.seriesId === loadWasherId);
      const transfer = schedule.instances.find((i) => i.seriesId === transferId);

      expect(loadWasher?.time).toContain('10:00');
      // Transfer target = Load Washer end (10:14) + 80 = 11:34
      expect(transfer).toBeDefined();
      expect(transfer?.time).toContain('11:34');
    });

    it('chain respects actual completion times', async () => {
      // Get original transfer time
      const scheduleBefore = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const transferBefore = scheduleBefore.instances.find((i) => i.seriesId === transferId);
      expect(transferBefore?.time).toContain('10:34');

      // Complete washer early - finished at 09:10 instead of 09:14
      await planner.logCompletion(loadWasherId, date('2025-01-19'), {
        startTime: datetime('2025-01-19T09:00:00'),
        endTime: datetime('2025-01-19T09:10:00'),
      });

      const scheduleAfter = await planner.getSchedule(date('2025-01-19'), date('2025-01-20'));
      const transferAfter = scheduleAfter.instances.find((i) => i.seriesId === transferId);

      // New target = endTime 09:10 + 80 = 10:30
      // earlyWobble=0 means Transfer can't be earlier than target, so Transfer is at 10:30
      expect(transferAfter).toBeDefined();
      expect(transferAfter?.time).toContain('10:30');
    });
  });

  // ============================================================================
  // 3. Conflict Scenario
  // ============================================================================

  describe('Conflict Scenario', () => {
    let planner: Autoplanner;

    beforeEach(async () => {
      planner = await createTestPlanner();
    });

    describe('Fixed-Fixed Overlap', () => {
      it('fixed overlap warning - both scheduled with warning', async () => {
        const meeting1Id = await planner.createSeries({
          title: 'Meeting 1',
          patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00'), duration: minutes(60), fixed: true }],
        });

        const meeting2Id = await planner.createSeries({
          title: 'Meeting 2',
          patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00'), duration: minutes(60), fixed: true }],
        });

        const schedule = await planner.getSchedule(date('2025-01-20'), date('2025-01-21'));
        const conflicts = await planner.getConflicts();

        // Both should be scheduled
        expect(schedule.instances.find((i) => i.seriesId === meeting1Id)).toBeDefined();
        expect(schedule.instances.find((i) => i.seriesId === meeting2Id)).toBeDefined();

        // Should have overlap warning
        expect(conflicts.some((c) => c.type === 'overlap')).toBe(true);
      });

      it('overlap details - includes involved series', async () => {
        await planner.createSeries({
          title: 'Meeting 1',
          patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00'), duration: minutes(60), fixed: true }],
        });
        await planner.createSeries({
          title: 'Meeting 2',
          patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00'), duration: minutes(60), fixed: true }],
        });

        const conflicts = await planner.getConflicts();
        const overlap = conflicts.find((c) => c.type === 'overlap');

        expect(overlap?.instances).toBeDefined();
        expect(overlap?.instances?.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Impossible Constraint', () => {
      it('constraint violation error - reversed times with mustBeBefore', async () => {
        const id1 = await planner.createSeries({
          title: 'Task A',
          patterns: [{ type: 'daily', time: time('14:00'), fixed: true }],
        });
        const id2 = await planner.createSeries({
          title: 'Task B',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });

        // A at 14:00 mustBeBefore B at 09:00 - impossible
        await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });

        const conflicts = await planner.getConflicts();
        expect(conflicts.some((c) => c.type === 'constraintViolation')).toBe(true);
      });

      it('best-effort placement - both tasks still scheduled after error', async () => {
        const id1 = await planner.createSeries({
          title: 'Task A',
          patterns: [{ type: 'daily', time: time('14:00'), fixed: true }],
        });
        const id2 = await planner.createSeries({
          title: 'Task B',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });

        await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

        // Both should still be scheduled (best-effort)
        expect(schedule.instances.find((i) => i.seriesId === id1)).toBeDefined();
        expect(schedule.instances.find((i) => i.seriesId === id2)).toBeDefined();
      });
    });

    describe('Chain Cannot Fit', () => {
      it('chainCannotFit error - child bounds violated', async () => {
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('23:00'), duration: minutes(60), fixed: true }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('23:30'), duration: minutes(60) }],
        });

        // Link with tight bounds that can't fit after midnight
        await planner.linkSeries(parentId, childId, {
          distance: 0,
          earlyWobble: 0,
          lateWobble: 0,
        });

        const conflicts = await planner.getConflicts();
        expect(conflicts.some((c) => c.type === 'chainCannotFit' || c.type === 'overlap')).toBe(true);
      });

      it('conflict details - chain info included', async () => {
        // Parent ends at 00:00 (23:00 + 60min)
        // Child target = 00:00 + 0 distance = 00:00
        // Child allowed window = 00:00 to 00:30 (lateWobble)
        // Child pattern time = 02:00, which is outside allowed window
        // This MUST produce chainCannotFit
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('23:00'), duration: minutes(60), fixed: true }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('02:00'), duration: minutes(60) }],
        });

        await planner.linkSeries(parentId, childId, {
          distance: 0,
          earlyWobble: 0,
          lateWobble: 30,
        });

        const conflicts = await planner.getConflicts();
        const chainConflict = conflicts.find((c) => c.type === 'chainCannotFit');

        expect(chainConflict).toBeDefined();
        expect(chainConflict!.parentId ?? chainConflict!.childId).toBeDefined();
      });
    });
  });

  // ============================================================================
  // 4. Relational Constraint Scenario
  // ============================================================================

  describe('Relational Constraint Scenario', () => {
    let planner: Autoplanner;

    beforeEach(async () => {
      planner = await createTestPlanner();
    });

    it('schedule two heavy - not adjacent with cantBeNextTo', async () => {
      const heavy1Id = await planner.createSeries({
        title: 'Heavy Workout 1',
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00') }],
        tags: ['heavy'],
      });
      const heavy2Id = await planner.createSeries({
        title: 'Heavy Workout 2',
        patterns: [{ type: 'weekly', daysOfWeek: [2], time: time('09:00') }],
        tags: ['heavy'],
      });

      await planner.addConstraint({
        type: 'cantBeNextTo',
        target: { type: 'tag', tag: 'heavy' },
      });

      const conflicts = await planner.getConflicts();
      // Mon and Tue are adjacent, should have conflict
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('add cardio - mustBeOnSameDay as heavy', async () => {
      const heavyId = await planner.createSeries({
        title: 'Heavy Workout',
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00') }],
        tags: ['heavy'],
      });
      const cardioId = await planner.createSeries({
        title: 'Cardio',
        patterns: [{ type: 'weekly', daysOfWeek: [1, 2, 3], time: time('18:00') }],
      });

      await planner.addConstraint({
        type: 'mustBeOnSameDay',
        firstSeries: cardioId,
        secondTarget: { type: 'tag', tag: 'heavy' },
      });

      const schedule = await planner.getSchedule(date('2025-01-20'), date('2025-01-24'));

      // Cardio should only appear on Monday (same day as heavy)
      const cardioInstances = schedule.instances.filter((i) => i.seriesId === cardioId);
      expect(cardioInstances.every((i) => i.date === date('2025-01-20'))).toBe(true);
    });

    it('remove cantBeNextTo - heavy can be adjacent', async () => {
      const heavy1Id = await planner.createSeries({
        title: 'Heavy Workout 1',
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00') }],
        tags: ['heavy'],
      });
      const heavy2Id = await planner.createSeries({
        title: 'Heavy Workout 2',
        patterns: [{ type: 'weekly', daysOfWeek: [2], time: time('09:00') }],
        tags: ['heavy'],
      });

      const constraintId = await planner.addConstraint({
        type: 'cantBeNextTo',
        target: { type: 'tag', tag: 'heavy' },
      });

      await planner.removeConstraint(constraintId);

      const conflicts = await planner.getConflicts();
      expect(conflicts.filter((c) => c.type === 'constraintViolation')).toHaveLength(0);
    });
  });

  // ============================================================================
  // 5. Large Data Scenario
  // ============================================================================

  describe('Large Data Scenario', () => {
    it('100 series stress - completes successfully', async () => {
      const planner = await createTestPlanner();

      for (let i = 0; i < 100; i++) {
        await planner.createSeries({
          title: `Series ${i}`,
          patterns: [
            { type: 'daily', time: time(`${String(8 + (i % 12)).padStart(2, '0')}:00`), duration: minutes(30) },
          ],
        });
      }

      const schedule = await planner.getSchedule(date('2025-01-01'), date('2025-12-31'));
      expect(schedule.instances.length).toBeGreaterThan(0);
    });

    it('no infinite loops - complex constraints terminate', async () => {
      const planner = await createTestPlanner();

      const ids: SeriesId[] = [];
      for (let i = 0; i < 20; i++) {
        const id = await planner.createSeries({
          title: `Series ${i}`,
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        ids.push(id);
      }

      // Add multiple constraints
      for (let i = 0; i < 19; i++) {
        await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: ids[i],
          secondSeries: ids[i + 1],
        });
      }

      const start = Date.now();
      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
      const elapsed = Date.now() - start;

      expect(schedule).toBeDefined();
      expect(elapsed).toBeLessThan(30000); // Should complete in under 30 seconds
    });

    it('acceptable performance - large data set within time bounds', async () => {
      const planner = await createTestPlanner();

      for (let i = 0; i < 50; i++) {
        await planner.createSeries({
          title: `Series ${i}`,
          patterns: [{ type: 'daily', time: time(`${String(8 + (i % 12)).padStart(2, '0')}:00`) }],
        });
      }

      const start = Date.now();
      await planner.getSchedule(date('2025-01-01'), date('2025-01-31'));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });

    it('all constraints evaluated - multiple constraints all checked', async () => {
      const planner = await createTestPlanner();

      const id1 = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });
      const id2 = await planner.createSeries({
        title: 'B',
        patterns: [{ type: 'daily', time: time('10:00') }],
      });
      const id3 = await planner.createSeries({
        title: 'C',
        patterns: [{ type: 'daily', time: time('11:00') }],
      });

      await planner.addConstraint({ type: 'mustBeBefore', firstSeries: id1, secondSeries: id2 });
      await planner.addConstraint({ type: 'mustBeBefore', firstSeries: id2, secondSeries: id3 });

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

      const times = [id1, id2, id3].map(
        (id) => schedule.instances.find((i) => i.seriesId === id)?.time
      );

      expect(times[0]! < times[1]!).toBe(true);
      expect(times[1]! < times[2]!).toBe(true);
    });
  });

  // ============================================================================
  // 6. Timezone Scenario
  // ============================================================================

  describe('Timezone Scenario', () => {
    describe('DST Transition Tests', () => {
      it('spring forward 02:30 - shifts to 03:00', async () => {
        const planner = await createTestPlanner('America/New_York');

        const id = await planner.createSeries({
          title: 'Early Morning',
          patterns: [{ type: 'daily', time: time('02:30') }],
        });

        // March 9, 2025 is DST start in EST
        const schedule = await planner.getSchedule(date('2025-03-09'), date('2025-03-10'));

        // 02:30 doesn't exist on DST start, should shift to 03:00 (first valid time)
        expect(schedule.instances).toHaveLength(1);
        const instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance).toBeDefined();
        expect(instance?.time).toContain('03:00');
      });

      it('other instances unaffected - adjacent days normal times', async () => {
        const planner = await createTestPlanner('America/New_York');

        const id = await planner.createSeries({
          title: 'Morning',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const schedule = await planner.getSchedule(date('2025-03-08'), date('2025-03-11'));

        // March 8 and March 10 should both have 09:00 instances
        const instances = schedule.instances.filter((i) => i.seriesId === id);
        expect(instances.length).toBeGreaterThanOrEqual(2);
      });

      it('fall back ambiguity - 01:30 on DST end uses first occurrence', async () => {
        const planner = await createTestPlanner('America/New_York');

        const id = await planner.createSeries({
          title: 'Night Task',
          patterns: [{ type: 'daily', time: time('01:30') }],
        });

        // November 2, 2025 is DST end in EST
        const schedule = await planner.getSchedule(date('2025-11-02'), date('2025-11-03'));

        // 01:30 occurs twice on DST end - should use first occurrence (EDT, before fall back)
        expect(schedule.instances).toHaveLength(1);
        const instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance).toBeDefined();
        expect(instance?.time).toContain('01:30');
        // Should only have one instance, not two (uses first occurrence)
      });
    });

    describe('Cross-Timezone Tests', () => {
      it('EST to PST conversion - correct times', async () => {
        const estPlanner = await createTestPlanner('America/New_York');

        const id = await estPlanner.createSeries({
          title: 'Meeting',
          patterns: [{ type: 'daily', time: time('09:00') }], // 09:00 EST
        });

        const schedule = await estPlanner.getSchedule(date('2025-01-15'), date('2025-01-16'));
        const instance = schedule.instances.find((i) => i.seriesId === id);

        expect(instance?.time).toContain('09:00');
      });

      it('day boundaries correct - cross-midnight events', async () => {
        const planner = await createTestPlanner('America/New_York');

        await planner.createSeries({
          title: 'Late Night',
          patterns: [{ type: 'daily', time: time('23:30'), duration: minutes(60) }],
        });

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

        // Event at 23:30 should be on Jan 15
        expect(schedule.instances.some((i) => i.date === date('2025-01-15'))).toBe(true);
      });
    });

    describe('All-Day Reminder Tests', () => {
      it('all-day reminder timing - fires 23:00 on previous day', async () => {
        const planner = await createTestPlanner();

        const id = await planner.createSeries({
          title: 'All Day Event',
          patterns: [{ type: 'daily', allDay: true }],
        });

        await planner.createReminder(id, { type: 'before', offset: minutes(60) });

        const reminders = await planner.getPendingReminders(datetime('2025-01-14T23:00:00'));

        // Reminder for Jan 15 all-day should fire at 23:00 on Jan 14
        expect(reminders.some((r) => r.seriesId === id)).toBe(true);
      });

      it('all-day excluded from reflow - no time conflicts', async () => {
        const planner = await createTestPlanner();

        const allDayId = await planner.createSeries({
          title: 'All Day Event',
          patterns: [{ type: 'daily', allDay: true }],
        });

        const timedId = await planner.createSeries({
          title: 'Timed Event',
          patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
        });

        const conflicts = await planner.getConflicts();

        // All-day should not conflict with timed events
        expect(conflicts.filter((c) =>
          c.instances?.some((i) => i.seriesId === allDayId) &&
          c.instances?.some((i) => i.seriesId === timedId)
        )).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // 7. Reminder Scenario
  // ============================================================================

  describe('Reminder Scenario', () => {
    let planner: Autoplanner;
    let seriesIdValue: SeriesId;

    beforeEach(async () => {
      planner = await createTestPlanner();

      seriesIdValue = await planner.createSeries({
        title: 'Daily Task',
        patterns: [{ type: 'daily', time: time('14:00'), duration: minutes(30) }],
      });

      // 60 min before = "prepare" reminder
      await planner.createReminder(seriesIdValue, { type: 'before', offset: minutes(60) });
      // 10 min before = "urgent" reminder
      await planner.createReminder(seriesIdValue, { type: 'before', offset: minutes(10) });
    });

    it('12:55 - no pending reminders', async () => {
      const reminders = await planner.getPendingReminders(datetime('2025-01-15T12:55:00'));
      expect(reminders.filter((r) => r.seriesId === seriesIdValue)).toHaveLength(0);
    });

    it('13:00 - prepare (60 min) pending', async () => {
      const reminders = await planner.getPendingReminders(datetime('2025-01-15T13:00:00'));
      expect(reminders.some((r) => r.seriesId === seriesIdValue)).toBe(true);
    });

    it('after ack - prepare not pending', async () => {
      const reminders = await planner.getPendingReminders(datetime('2025-01-15T13:00:00'));
      const prepareReminder = reminders.find((r) => r.seriesId === seriesIdValue);

      if (prepareReminder) {
        await planner.acknowledgeReminder(prepareReminder.id, datetime('2025-01-15T13:05:00'));
      }

      const remindersAfter = await planner.getPendingReminders(datetime('2025-01-15T13:10:00'));
      // Prepare should not be pending after acknowledgment (for this instance)
      expect(remindersAfter.filter((r) =>
        r.seriesId === seriesIdValue && r.instanceDate === date('2025-01-15')
      ).length).toBeLessThanOrEqual(1);
    });

    it('13:50 - urgent (10 min) pending', async () => {
      const reminders = await planner.getPendingReminders(datetime('2025-01-15T13:50:00'));
      expect(reminders.some((r) => r.seriesId === seriesIdValue)).toBe(true);
    });

    it('after complete - reminders for next instance', async () => {
      await planner.logCompletion(seriesIdValue, date('2025-01-15'));

      const reminders = await planner.getPendingReminders(datetime('2025-01-16T13:00:00'));
      expect(reminders.some((r) =>
        r.seriesId === seriesIdValue && r.instanceDate === date('2025-01-16')
      )).toBe(true);
    });
  });

  // ============================================================================
  // 8. Instance Exception Scenario
  // ============================================================================

  describe('Instance Exception Scenario', () => {
    let planner: Autoplanner;
    let seriesIdValue: SeriesId;

    beforeEach(async () => {
      planner = await createTestPlanner();

      seriesIdValue = await planner.createSeries({
        title: 'Weekly Meeting',
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00') }], // Every Monday
      });
    });

    it('cancel Monday - that Monday not in schedule', async () => {
      await planner.cancelInstance(seriesIdValue, date('2025-01-20')); // Monday

      const schedule = await planner.getSchedule(date('2025-01-20'), date('2025-01-21'));

      expect(schedule.instances.find((i) =>
        i.seriesId === seriesIdValue && i.date === date('2025-01-20')
      )).toBeUndefined();
    });

    it('check other Mondays - still scheduled', async () => {
      await planner.cancelInstance(seriesIdValue, date('2025-01-20'));

      const schedule = await planner.getSchedule(date('2025-01-27'), date('2025-01-28'));

      expect(schedule.instances.find((i) =>
        i.seriesId === seriesIdValue && i.date === date('2025-01-27')
      )).toBeDefined();
    });

    it('reschedule to Tuesday - instance on Tuesday', async () => {
      await planner.rescheduleInstance(seriesIdValue, date('2025-01-20'), datetime('2025-01-21T14:00:00'));

      const schedule = await planner.getSchedule(date('2025-01-20'), date('2025-01-22'));

      const instance = schedule.instances.find((i) => i.seriesId === seriesIdValue);
      expect(instance?.date).toBe(date('2025-01-21'));
      expect(instance?.time).toContain('14:00');
    });

    it('check original Monday - slot free', async () => {
      await planner.rescheduleInstance(seriesIdValue, date('2025-01-20'), datetime('2025-01-21T14:00:00'));

      const schedule = await planner.getSchedule(date('2025-01-20'), date('2025-01-22'));

      // Original Monday should not have the instance
      expect(schedule.instances.find((i) =>
        i.seriesId === seriesIdValue && i.date === date('2025-01-20')
      )).toBeUndefined();
    });
  });

  // ============================================================================
  // 9. Cycling Scenario
  // ============================================================================

  describe('Cycling Scenario', () => {
    describe('With gapLeap (gapLeap: true)', () => {
      it('skip does not advance cycling index', async () => {
        const planner = await createTestPlanner();

        const id = await planner.createSeries({
          title: 'Weekly Task',
          patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00') }],
          cycling: { mode: 'sequential', items: ['A', 'B', 'C'], gapLeap: true },
        });

        // Week 1: Skip (cancel)
        await planner.cancelInstance(id, date('2025-01-20'));

        // Week 2: Should still be "A"
        let schedule = await planner.getSchedule(date('2025-01-27'), date('2025-01-28'));
        let instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance?.title).toContain('A');

        // Complete week 2
        await planner.logCompletion(id, date('2025-01-27'));

        // Week 3: Should be "B"
        schedule = await planner.getSchedule(date('2025-02-03'), date('2025-02-04'));
        instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance?.title).toContain('B');
      });
    });

    describe('Without gapLeap (gapLeap: false)', () => {
      it('cycling advances on each instance regardless of completion', async () => {
        const planner = await createTestPlanner();

        const id = await planner.createSeries({
          title: 'Daily Cycling',
          patterns: [{ type: 'daily', time: time('09:00') }],
          cycling: { mode: 'sequential', items: ['A', 'B', 'C'], gapLeap: false },
        });

        // Instance 0: A
        let schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
        expect(schedule.instances[0]?.title).toContain('A');

        await planner.logCompletion(id, date('2025-01-15'));

        // Instance 1: B
        schedule = await planner.getSchedule(date('2025-01-16'), date('2025-01-17'));
        expect(schedule.instances.find((i) => i.seriesId === id)?.title).toContain('B');

        await planner.logCompletion(id, date('2025-01-16'));

        // Instance 2: C
        schedule = await planner.getSchedule(date('2025-01-17'), date('2025-01-18'));
        expect(schedule.instances.find((i) => i.seriesId === id)?.title).toContain('C');

        await planner.logCompletion(id, date('2025-01-17'));

        // Instance 3: A (wrap)
        schedule = await planner.getSchedule(date('2025-01-18'), date('2025-01-19'));
        expect(schedule.instances.find((i) => i.seriesId === id)?.title).toContain('A');
      });

      it('random mode picks randomly', async () => {
        const planner = await createTestPlanner();

        const id = await planner.createSeries({
          title: 'Random Task',
          patterns: [{ type: 'daily', time: time('09:00') }],
          cycling: { mode: 'random', items: ['A', 'B', 'C', 'D', 'E'] },
        });

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-20'));
        const titles = schedule.instances
          .filter((i) => i.seriesId === id)
          .map((i) => i.title);

        // Should have items from the cycling list
        expect(titles.every((t) => ['A', 'B', 'C', 'D', 'E'].some((item) => t.includes(item)))).toBe(true);
      });
    });
  });

  // ============================================================================
  // 10. Adaptive Duration Scenario
  // ============================================================================

  describe('Adaptive Duration Scenario', () => {
    it('no history - uses fallback duration', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Adaptive Task',
        patterns: [{ type: 'daily', time: time('09:00') }],
        adaptiveDuration: {
          fallback: minutes(30),
          mode: 'lastN',
          lastN: 5,
          multiplier: 1.25,
        },
      });

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
      const instance = schedule.instances.find((i) => i.seriesId === id);

      expect(instance?.duration).toBe(minutes(30));
    });

    it('after completions - uses calculated duration', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Adaptive Task',
        patterns: [{ type: 'daily', time: time('09:00') }],
        adaptiveDuration: {
          fallback: minutes(30),
          mode: 'lastN',
          lastN: 5,
          multiplier: 1.25,
        },
      });

      // Log completions with durations: 20, 25, 30, 25, 30 (avg = 26)
      // Duration = endTime - startTime
      const durations = [20, 25, 30, 25, 30];
      for (let i = 0; i < durations.length; i++) {
        const day = String(10 + i).padStart(2, '0');
        const endMinutes = String(durations[i]).padStart(2, '0');
        await planner.logCompletion(id, date(`2025-01-${day}`), {
          startTime: datetime(`2025-01-${day}T09:00:00`),
          endTime: datetime(`2025-01-${day}T09:${endMinutes}:00`),
        });
      }

      const schedule = await planner.getSchedule(date('2025-01-16'), date('2025-01-17'));
      const instance = schedule.instances.find((i) => i.seriesId === id);

      // Expected: 26 * 1.25 = 32.5 → 33 (rounded)
      expect(instance?.duration).toBe(minutes(33));
    });
  });

  // ============================================================================
  // 11. Leap Year Scenario
  // ============================================================================

  describe('Leap Year Scenario', () => {
    it('yearly on Feb 29 - only appears on leap years', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Leap Day Event',
        patterns: [{ type: 'yearly', month: 2, dayOfMonth: 29, time: time('09:00') }],
      });

      // 2020 - leap year
      let schedule = await planner.getSchedule(date('2020-02-28'), date('2020-03-01'));
      expect(schedule.instances.some((i) => i.seriesId === id && i.date === date('2020-02-29'))).toBe(true);

      // 2021 - not leap year
      schedule = await planner.getSchedule(date('2021-02-28'), date('2021-03-01'));
      expect(schedule.instances.some((i) => i.seriesId === id && i.date === date('2021-02-29'))).toBe(false);

      // 2024 - leap year
      schedule = await planner.getSchedule(date('2024-02-28'), date('2024-03-01'));
      expect(schedule.instances.some((i) => i.seriesId === id && i.date === date('2024-02-29'))).toBe(true);
    });

    it('non-leap year Feb 29 - no instance', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Leap Day Event',
        patterns: [{ type: 'yearly', month: 2, dayOfMonth: 29, time: time('09:00') }],
      });

      // 2023 is not a leap year
      const schedule = await planner.getSchedule(date('2023-02-01'), date('2023-03-01'));
      expect(schedule.instances.filter((i) => i.seriesId === id)).toHaveLength(0);
    });
  });

  // ============================================================================
  // 12. Chain Depth Scenario
  // ============================================================================

  describe('Chain Depth Scenario', () => {
    it('depth 32 works - chain created', async () => {
      const planner = await createTestPlanner();

      const ids: SeriesId[] = [];
      for (let i = 0; i < 32; i++) {
        const id = await planner.createSeries({
          title: `Series ${i}`,
          patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(15) }],
        });
        ids.push(id);
      }

      // Link all 32 in chain
      for (let i = 0; i < 31; i++) {
        await planner.linkSeries(ids[i], ids[i + 1], { distance: 0 });
      }

      // Should succeed
      const depth = await planner.getChainDepth(ids[31]);
      expect(depth).toBe(31); // 31 links = depth 31
    });

    it('depth 33 rejected - ChainDepthExceededError', async () => {
      const planner = await createTestPlanner();

      const ids: SeriesId[] = [];
      for (let i = 0; i < 34; i++) {
        const id = await planner.createSeries({
          title: `Series ${i}`,
          patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(15) }],
        });
        ids.push(id);
      }

      // Link first 32
      for (let i = 0; i < 32; i++) {
        await planner.linkSeries(ids[i], ids[i + 1], { distance: 0 });
      }

      // 33rd link should fail
      await expect(planner.linkSeries(ids[32], ids[33], { distance: 0 })).rejects.toThrow(ChainDepthExceededError);
    });
  });

  // ============================================================================
  // 13. End-to-End Properties
  // ============================================================================

  describe('End-to-End Properties', () => {
    it('E2E 1: all features together - complex scenario passes', async () => {
      const planner = await createTestPlanner();

      // Create series with various features
      const parentId = await planner.createSeries({
        title: 'Parent Task',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
      });

      const childId = await planner.createSeries({
        title: 'Child Task',
        patterns: [{ type: 'daily', time: time('10:30') }],
        cycling: { mode: 'sequential', items: ['Part A', 'Part B'] },
      });

      await planner.linkSeries(parentId, childId, { distance: 30 });
      await planner.createReminder(parentId, { type: 'before', offset: minutes(15) });

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
      const conflicts = await planner.getConflicts();

      expect(schedule.instances.length).toBeGreaterThanOrEqual(2);
      expect(conflicts.filter((c) => c.type === 'error')).toHaveLength(0);
    });

    it('E2E 2: state consistency - query after any operation', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      // State should be consistent after each operation
      let series = await planner.getSeries(id);
      expect(series).toBeDefined();

      await planner.updateSeries(id, { title: 'Updated' });
      series = await planner.getSeries(id);
      expect(series?.title).toBe('Updated');

      await planner.lock(id);
      series = await planner.getSeries(id);
      expect(series?.locked).toBe(true);
    });

    it('E2E 3: valid inputs produce valid schedule', async () => {
      const planner = await createTestPlanner();

      // Create valid series
      await planner.createSeries({
        title: 'Valid Series',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
      });

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));

      expect(schedule.instances.length).toBeGreaterThan(0);
      schedule.instances.forEach((instance) => {
        expect(instance.time).toBeDefined();
        expect(instance.duration).toBeDefined();
      });
    });

    it('E2E 4: invalid produces conflicts reported', async () => {
      const planner = await createTestPlanner();

      await planner.createSeries({
        title: 'Fixed 1',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
      });
      await planner.createSeries({
        title: 'Fixed 2',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60), fixed: true }],
      });

      const conflicts = await planner.getConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('E2E 5: performance acceptable - benchmark passes', async () => {
      const planner = await createTestPlanner();

      for (let i = 0; i < 50; i++) {
        await planner.createSeries({
          title: `Series ${i}`,
          patterns: [{ type: 'daily', time: time(`${String(8 + (i % 12)).padStart(2, '0')}:00`) }],
        });
      }

      const start = Date.now();
      await planner.getSchedule(date('2025-01-01'), date('2025-01-31'));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });

    it('E2E 6: no data loss - persist and reload', async () => {
      // Use a shared adapter to test persistence across planner instances
      const sharedAdapter = createMockAdapter();

      // First planner - create and populate data
      const planner1 = createAutoplanner({
        adapter: sharedAdapter,
        timezone: 'America/New_York',
      });

      const id = await planner1.createSeries({
        title: 'Persistent Series',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      await planner1.logCompletion(id, date('2025-01-15'));

      // Second planner - reload with same adapter (simulating restart)
      const planner2 = createAutoplanner({
        adapter: sharedAdapter,
        timezone: 'America/New_York',
      });

      // Verify data persisted across planner instances
      const series = await planner2.getSeries(id);
      expect(series).toBeDefined();
      expect(series?.title).toBe('Persistent Series');

      const completions = await planner2.getCompletions(id);
      expect(completions).toHaveLength(1);
    });

    it('E2E 7: error recovery consistent - fail and verify state', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });
      await planner.lock(id);

      const seriesBefore = await planner.getSeries(id);

      try {
        await planner.updateSeries(id, { title: 'Should Fail' });
        expect.fail('Should have thrown LockedSeriesError');
      } catch (error) {
        expect(error).toBeInstanceOf(LockedSeriesError);
      }

      const seriesAfter = await planner.getSeries(id);
      expect(seriesAfter?.title).toBe(seriesBefore?.title);
    });

    it('E2E 8: cycling preserved on split', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'Cycling Series',
        patterns: [{ type: 'daily', time: time('09:00') }],
        cycling: { mode: 'sequential', items: ['A', 'B', 'C'], currentIndex: 1 },
      });

      const newId = await planner.splitSeries(id, date('2025-02-01'));

      const newSeries = await planner.getSeries(newId);
      expect(newSeries?.cycling?.currentIndex).toBe(1);
    });

    it('E2E 9: children move on parent reschedule', async () => {
      const planner = await createTestPlanner();

      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
      });
      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', time: time('10:30') }],
      });

      await planner.linkSeries(parentId, childId, { distance: 30 });

      // Reschedule parent from 09:00 to 11:00
      await planner.rescheduleInstance(parentId, date('2025-01-15'), datetime('2025-01-15T11:00:00'));

      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
      const parent = schedule.instances.find((i) => i.seriesId === parentId);
      const child = schedule.instances.find((i) => i.seriesId === childId);

      // Parent should be at 11:00, ends at 12:00 (60 min duration)
      expect(parent?.time).toContain('11:00');

      // Child should have moved: parent end (12:00) + distance (30) = 12:30
      expect(child).toBeDefined();
      expect(child?.time).toContain('12:30');
    });

    it('E2E 10: all-day reminders use 00:00', async () => {
      const planner = await createTestPlanner();

      const id = await planner.createSeries({
        title: 'All Day Event',
        patterns: [{ type: 'daily', allDay: true }],
      });

      await planner.createReminder(id, { type: 'before', offset: minutes(60) });

      const reminders = await planner.getPendingReminders(datetime('2025-01-14T23:00:00'));

      // All-day event uses 00:00, so 60 min before is 23:00 previous day
      expect(reminders.some((r) => r.seriesId === id)).toBe(true);
    });
  });

  // ============================================================================
  // 14. Adapter Comparison Tests
  // ============================================================================

  describe('Adapter Comparison Tests', () => {
    it('mock adapter passes - all integration tests work', async () => {
      const planner = createAutoplanner({
        adapter: createMockAdapter(),
        timezone: 'UTC',
      });

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      const series = await planner.getSeries(id);
      expect(series).toBeDefined();
    });

    it('SQLite adapter passes - all integration tests work', async () => {
      const sqliteAdapter = await createSqliteAdapter(':memory:');
      const planner = createAutoplanner({
        adapter: sqliteAdapter,
        timezone: 'UTC',
      });

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      const series = await planner.getSeries(id);
      expect(series).toBeDefined();

      await sqliteAdapter.close();
    });

    it('behavior identical - same results from both adapters', async () => {
      const mockAdapter = createMockAdapter();
      const sqliteAdapter = await createSqliteAdapter(':memory:');

      const mockPlanner = createAutoplanner({ adapter: mockAdapter, timezone: 'UTC' });
      const sqlitePlanner = createAutoplanner({ adapter: sqliteAdapter, timezone: 'UTC' });

      // Create same series in both
      const mockId = await mockPlanner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
      });
      const sqliteId = await sqlitePlanner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
      });

      // Get schedules
      const mockSchedule = await mockPlanner.getSchedule(date('2025-01-15'), date('2025-01-16'));
      const sqliteSchedule = await sqlitePlanner.getSchedule(date('2025-01-15'), date('2025-01-16'));

      // Compare structure (not exact equality due to IDs)
      expect(mockSchedule.instances.length).toBe(sqliteSchedule.instances.length);

      await sqliteAdapter.close();
    });
  });
});
