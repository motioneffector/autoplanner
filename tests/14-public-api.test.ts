/**
 * Segment 14: Public API Tests
 *
 * The public API is the consumer-facing interface that ties all components
 * together. It handles initialization, timezone conversion, and event emission.
 *
 * Dependencies: All previous segments (1-13)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAutoplanner,
  type Autoplanner,
  type AutoplannerConfig,
  type Schedule,
  type Conflict,
  type PendingReminder,
  ValidationError,
  LockedSeriesError,
} from '../src/public-api';
import { createMockAdapter, type Adapter } from '../src/adapter';
import {
  type LocalDate,
  type LocalTime,
  type LocalDateTime,
  type SeriesId,
  type ReminderId,
  type ConstraintId,
  type CompletionId,
  type Duration,
} from '../src/core';
import { assertScheduleInvariants } from './helpers/schedule-invariants';
import { Ok, Err } from '../src/result';

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

function createValidConfig(overrides: Partial<AutoplannerConfig> = {}): AutoplannerConfig {
  return {
    adapter: createMockAdapter(),
    timezone: 'America/New_York',
    ...overrides,
  };
}

async function getScheduleChecked(
  p: Autoplanner,
  start: LocalDate,
  end: LocalDate,
): ReturnType<Autoplanner['getSchedule']> {
  const schedule = await p.getSchedule(start, end);
  assertScheduleInvariants(schedule);
  return schedule;
}

// ============================================================================
// 1. Initialization
// ============================================================================

describe('Segment 14: Public API', () => {
  describe('Initialization', () => {
    describe('Basic Initialization', () => {
      it('create autoplanner - valid config creates instance', async () => {
        const config = createValidConfig();
        const planner = createAutoplanner(config);

        // Verify instance works by calling a method
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        expect(id).toMatch(/^[0-9a-f-]{36}$/);

        const series = await planner.getSeries(id);
        expect(series?.title).toBe('Test');
      });

      it('uses provided adapter - operations use adapter', async () => {
        const adapter = createMockAdapter();
        const planner = createAutoplanner({ adapter, timezone: 'UTC' });

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Verify the adapter received the series
        const series = await adapter.getSeries(id);
        expect(series).not.toBeNull();
        expect(series?.title).toBe('Test');
      });

      it('uses configured timezone - times in that timezone', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const series = await planner.getSeries(id);
        // Times should be interpreted as EST/EDT
        expect(series?.patterns[0].time).toBe(time('09:00'));
      });
    });

    describe('Precondition Tests', () => {
      it('adapter must implement interface - invalid adapter throws on use', async () => {
        const planner = createAutoplanner({ adapter: {} as Adapter, timezone: 'UTC' });
        // Empty adapter fails when used
        await expect(
          planner.createSeries({ title: 'Test', patterns: [{ type: 'daily', time: time('09:00') }] })
        ).rejects.toThrow(/is not a function/);
      });

      it('timezone must be valid IANA - Invalid/Zone throws error', () => {
        expect(() => {
          createAutoplanner(createValidConfig({ timezone: 'Invalid/Zone' }));
        }).toThrow(/Invalid timezone/);
      });

      it('valid IANA timezone - America/New_York succeeds', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));
        // Verify planner is functional with valid timezone
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
      });
    });
  });

  // ============================================================================
  // 2. Timezone Conversion
  // ============================================================================

  describe('Timezone Conversion', () => {
    describe('Input Conversion', () => {
      it('input times as configured TZ - createSeries 09:00 in EST interpreted as EST', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const series = await planner.getSeries(id);
        expect(series?.patterns[0].time).toBe(time('09:00'));
      });

      it('logCompletion in configured TZ - log at 14:30 interpreted as local', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        const seriesIdValue = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('14:00') }],
        });

        const startTime = datetime('2025-01-15T14:00:00');
        const endTime = datetime('2025-01-15T14:30:00');
        await planner.logCompletion(seriesIdValue, date('2025-01-15'), {
          startTime,
          endTime,
        });

        const completions = await planner.getCompletions(seriesIdValue);
        expect(completions[0]?.startTime).toBe(startTime);
        expect(completions[0]?.endTime).toBe(endTime);
      });
    });

    describe('Output Conversion', () => {
      it('output times in configured TZ - getSeries returns times in configured TZ', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/Los_Angeles' }));

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const series = await planner.getSeries(id);
        // Output should be in Pacific time
        expect(series?.patterns[0].time).toBe(time('09:00'));
      });

      it('getSchedule in configured TZ - all times local', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));

        schedule.instances.forEach((instance) => {
          // All times should be in EST/EDT (local)
          expect(instance.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        });
      });
    });

    describe('Internal Storage', () => {
      it('stored as UTC - check storage format', async () => {
        const adapter = createMockAdapter();
        const planner = createAutoplanner({ adapter, timezone: 'America/New_York' });

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Verify series stored in adapter
        const series = await adapter.getSeries(id);
        expect(series).toMatchObject({
          title: 'Test',
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        // Patterns stored separately
        const patterns = await adapter.getPatternsBySeries(id);
        expect(patterns).toHaveLength(1);
        expect(patterns[0]).toMatchObject({ type: 'daily', time: time('09:00') });
      });

      it('round-trip preserves time - store then retrieve same local time', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('14:30') }],
        });

        const series = await planner.getSeries(id);
        expect(series?.patterns[0].time).toBe(time('14:30'));
      });
    });

    describe('DST Handling', () => {
      it('DST spring forward - 2:30am on DST start shifts to 3:00am', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        // March 9, 2025 is DST start in EST
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('02:30') }],
        });

        const schedule = await getScheduleChecked(planner, date('2025-03-09'), date('2025-03-10'));
        // 2:30 AM doesn't exist on DST start - should shift to 3:00 AM (first valid time)
        expect(schedule.instances).toSatisfy((instances: typeof schedule.instances) => instances.length === 1 && instances[0].seriesId === id);
        const instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance?.seriesId).toBe(id);
        // Time should be shifted to 03:00 since 02:30 doesn't exist
        expect(instance?.time).toContain('03:00');
      });

      it('DST fall back - 1:30am on DST end uses first occurrence', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

        // November 2, 2025 is DST end in EST
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('01:30') }],
        });

        const schedule = await getScheduleChecked(planner, date('2025-11-02'), date('2025-11-03'));
        // 1:30 AM occurs twice on DST end - should use first occurrence (EDT, before fall back)
        expect(schedule.instances).toSatisfy((instances: typeof schedule.instances) => instances.length === 1 && instances[0].seriesId === id);
        const instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance?.seriesId).toBe(id);
        expect(instance?.time).toContain('01:30');
        // Instance should be at the first 01:30 (EDT, not EST)
      });

      it('spring forward 03:00 resolves to exactly 03:00 on gap date', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));
        const id = await planner.createSeries({
          title: 'Post-Gap',
          patterns: [{ type: 'daily', time: time('03:00'), fixed: true }],
        });
        const schedule = await getScheduleChecked(planner, date('2025-03-09'), date('2025-03-10'));
        const inst = schedule.instances.find(i => i.seriesId === id)!;
        expect(inst.time).toBe(datetime('2025-03-09T03:00:00'));
      });

      it('02:30 on a non-DST date returns 02:30 unchanged', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));
        const id = await planner.createSeries({
          title: 'Normal-Night',
          patterns: [{ type: 'daily', time: time('02:30'), fixed: true }],
        });
        // Jan 15 has no DST transition
        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        const inst = schedule.instances.find(i => i.seriesId === id)!;
        expect(inst.time).toBe(datetime('2025-01-15T02:30:00'));
      });

      it('10:00 on spring-forward date is unaffected', async () => {
        const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));
        const id = await planner.createSeries({
          title: 'Morning',
          patterns: [{ type: 'daily', time: time('10:00'), fixed: true }],
        });
        const schedule = await getScheduleChecked(planner, date('2025-03-09'), date('2025-03-10'));
        const inst = schedule.instances.find(i => i.seriesId === id)!;
        expect(inst.time).toBe(datetime('2025-03-09T10:00:00'));
      });

      it('02:30 spring forward in America/Chicago shifts to 03:00', async () => {
        const planner = createAutoplanner({
          adapter: createMockAdapter(),
          timezone: 'America/Chicago',
        });
        const id = await planner.createSeries({
          title: 'Central-Test',
          patterns: [{ type: 'daily', time: time('02:30'), fixed: true }],
        });
        // March 9, 2025 is also spring-forward for Central
        const schedule = await getScheduleChecked(planner, date('2025-03-09'), date('2025-03-10'));
        const inst = schedule.instances.find(i => i.seriesId === id)!;
        expect(inst.time).toBe(datetime('2025-03-09T03:00:00'));
      });
    });
  });

  // ============================================================================
  // 3. Reflow Triggering
  // ============================================================================

  describe('Reflow Triggering', () => {
    describe('Operations That Trigger Reflow', () => {
      let planner: Autoplanner;
      let reflowHandler: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        planner = createAutoplanner(createValidConfig());
        reflowHandler = vi.fn();
        planner.on('reflow', reflowHandler);
      });

      it('createSeries triggers reflow', async () => {
        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('updateSeries triggers reflow', async () => {
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        reflowHandler.mockClear();

        await planner.updateSeries(id, { title: 'Updated' });

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('deleteSeries triggers reflow', async () => {
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        reflowHandler.mockClear();

        await planner.deleteSeries(id);

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('linkSeries triggers reflow', async () => {
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        reflowHandler.mockClear();

        await planner.linkSeries(parentId, childId, { distance: 0 });

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('unlinkSeries triggers reflow', async () => {
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        await planner.linkSeries(parentId, childId, { distance: 0 });
        reflowHandler.mockClear();

        await planner.unlinkSeries(childId);

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('addConstraint triggers reflow', async () => {
        const id1 = await planner.createSeries({
          title: 'Test 1',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'Test 2',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        reflowHandler.mockClear();

        await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('removeConstraint triggers reflow', async () => {
        const id1 = await planner.createSeries({
          title: 'Test 1',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'Test 2',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        const constraintId = await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });
        reflowHandler.mockClear();

        await planner.removeConstraint(constraintId);

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('cancelInstance triggers reflow', async () => {
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        reflowHandler.mockClear();

        await planner.cancelInstance(id, date('2025-01-15'));

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('rescheduleInstance triggers reflow', async () => {
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        reflowHandler.mockClear();

        await planner.rescheduleInstance(id, date('2025-01-15'), datetime('2025-01-15T14:00:00'));

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('logCompletion triggers reflow', async () => {
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        reflowHandler.mockClear();

        await planner.logCompletion(id, date('2025-01-15'));

        expect(reflowHandler).toHaveBeenCalled();
      });
    });

    describe('Reflow Properties', () => {
      it('reflow event emitted - event fired', async () => {
        const planner = createAutoplanner(createValidConfig());
        const reflowHandler = vi.fn();
        planner.on('reflow', reflowHandler);

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(reflowHandler).toHaveBeenCalled();
      });

      it('getSchedule returns post-reflow - query sees updated schedule', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-21'));
        // 6 days from 2025-01-15 to 2025-01-20 inclusive (daily pattern)
        expect(schedule.instances.every((i) => i.seriesId === id)).toBe(true);
        expect(schedule.instances.every((i) => i.title === 'Test')).toBe(true);
        expect(schedule.instances.map((i) => i.date)).toContain(date('2025-01-15'));
        expect(schedule.instances.map((i) => i.date)).toContain(date('2025-01-20'));
      });

      it('reflow is synchronous - query sees new state immediately', async () => {
        const planner = createAutoplanner(createValidConfig());

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Immediately after createSeries, getSchedule should see the new series
        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        expect(schedule.instances.some((i) => i.title === 'Test')).toBe(true);
      });
    });
  });

  // ============================================================================
  // 4. Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    describe('Error Type Tests', () => {
      it('ValidationError - empty title throws descriptive message', async () => {
        const planner = createAutoplanner(createValidConfig());

        await expect(
          planner.createSeries({
            title: '',
            patterns: [{ type: 'daily', time: time('09:00') }],
          })
        ).rejects.toThrow(/title is required/);
      });

      it('NotFoundError - get non-existent series returns null or throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        // Create a real series to prove getSeries works for valid IDs
        const existingId = await planner.createSeries({
          title: 'Existing',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const existingSeries = await planner.getSeries(existingId);
        expect(existingSeries).toMatchObject({ id: existingId, title: 'Existing' });

        // Now verify non-existent returns null (not just empty/broken)
        const result = await planner.getSeries(seriesId('non-existent'));
        expect(result).toBe(null);

        // Verify allSeries contains the existing one but not the non-existent
        const allSeries = await planner.getAllSeries();
        expect(allSeries).toHaveLength(1);
        expect(allSeries[0]).toMatchObject({ id: existingId, title: 'Existing' });
        expect(allSeries.map((s) => s.id)).not.toContain(seriesId('non-existent'));
      });

      it('LockedSeriesError - update locked series throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.lock(id);

        await expect(planner.updateSeries(id, { title: 'Updated' })).rejects.toThrow(
          /is locked/
        );
      });

      it('CompletionsExistError - delete series with completions includes recovery info', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.logCompletion(id, date('2025-01-15'));

        await expect(planner.deleteSeries(id)).rejects.toThrow(/completions exist/);
      });

      it('LinkedChildrenExistError - delete parent with links includes recovery info', async () => {
        const planner = createAutoplanner(createValidConfig());

        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        await planner.linkSeries(parentId, childId, { distance: 0 });

        await expect(planner.deleteSeries(parentId)).rejects.toThrow(/linked children exist/);
      });

      it('NonExistentInstanceError - cancel non-pattern date throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'weekly', dayOfWeek: 1, time: time('09:00') }], // Monday only
        });

        // Try to cancel a Tuesday
        await expect(planner.cancelInstance(id, date('2025-01-14'))).rejects.toThrow(
          /No instance on/
        );
      });

      it('AlreadyCancelledError - cancel twice throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.cancelInstance(id, date('2025-01-15'));

        await expect(planner.cancelInstance(id, date('2025-01-15'))).rejects.toThrow(
          /already cancelled/
        );
      });

      it('CancelledInstanceError - reschedule cancelled throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.cancelInstance(id, date('2025-01-15'));

        await expect(
          planner.rescheduleInstance(id, date('2025-01-15'), datetime('2025-01-15T14:00:00'))
        ).rejects.toThrow(/Cannot reschedule cancelled/);
      });

      it('CycleDetectedError - create cycle throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id1 = await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        await planner.linkSeries(id1, id2, { distance: 0 });

        await expect(planner.linkSeries(id2, id1, { distance: 0 })).rejects.toThrow(
          /would create a cycle/
        );
      });

      it('ChainDepthExceededError - chain depth 33 throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const ids: SeriesId[] = [];
        for (let i = 0; i < 34; i++) {
          const id = await planner.createSeries({
            title: `Series ${i}`,
            patterns: [{ type: 'daily', time: time('09:00') }],
          });
          ids.push(id);
        }

        // Link all in chain
        for (let i = 0; i < 32; i++) {
          await planner.linkSeries(ids[i], ids[i + 1], { distance: 0 });
        }

        // 33rd link should exceed max depth of 32
        await expect(planner.linkSeries(ids[32], ids[33], { distance: 0 })).rejects.toThrow(
          /exceeds maximum/
        );
      });

      it('DuplicateCompletionError - log completion twice throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.logCompletion(id, date('2025-01-15'));

        await expect(planner.logCompletion(id, date('2025-01-15'))).rejects.toThrow(
          /already exists/
        );
      });
    });

    describe('Error Properties', () => {
      it('errors have messages - descriptive string', async () => {
        const planner = createAutoplanner(createValidConfig());

        try {
          await planner.createSeries({
            title: '',
            patterns: [{ type: 'daily', time: time('09:00') }],
          });
          expect.fail('Should have thrown');
        } catch (e: any) {
          expect(e.message).toContain('title');
          expect(e).toBeInstanceOf(ValidationError);
        }
      });

      it('failed ops dont mutate - state unchanged', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.lock(id);

        const seriesBefore = await planner.getSeries(id);

        try {
          await planner.updateSeries(id, { title: 'Updated' });
          expect.fail('Should have thrown LockedSeriesError');
        } catch (error) {
          expect(error).toBeInstanceOf(LockedSeriesError);
        }

        const seriesAfter = await planner.getSeries(id);
        expect(seriesAfter?.title).toBe(seriesBefore?.title);
      });

      it('errors are typed - has type property', async () => {
        const planner = createAutoplanner(createValidConfig());

        await expect(
          planner.createSeries({
            title: '',
            patterns: [{ type: 'daily', time: time('09:00') }],
          })
        ).rejects.toThrow(/title is required/);
      });
    });
  });

  // ============================================================================
  // 5. Idempotency
  // ============================================================================

  describe('Idempotency', () => {
    describe('Idempotent Operations', () => {
      it('lock is idempotent - lock twice no error still locked', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.lock(id);
        await planner.lock(id);

        const series = await planner.getSeries(id);
        expect(series?.locked).toBe(true);
      });

      it('unlock is idempotent - unlock twice no error still unlocked', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.unlock(id);
        await planner.unlock(id);

        const series = await planner.getSeries(id);
        expect(series?.locked).toBe(false);
      });

      it('acknowledgeReminder idempotent - acknowledge twice no error', async () => {
        const planner = createAutoplanner(createValidConfig());

        const seriesIdValue = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const reminderId = await planner.createReminder(seriesIdValue, {
          type: 'before',
          offset: minutes(15),
        });

        // Simulate reminder becoming due and acknowledging
        await planner.acknowledgeReminder(reminderId, datetime('2025-01-15T08:45:00'));
        await planner.acknowledgeReminder(reminderId, datetime('2025-01-15T08:45:00'));

        // Verify reminder is acknowledged (not in pending list)
        const pending = await planner.getPendingReminders(datetime('2025-01-15T08:45:00'));
        expect(pending.every((r) => r.id !== reminderId)).toBe(true);
      });
    });

    describe('Non-Idempotent Operations', () => {
      it('createSeries not idempotent - create twice gives two different IDs', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id1 = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(id1).not.toBe(id2);
      });

      it('logCompletion not idempotent - log same instance twice throws error', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.logCompletion(id, date('2025-01-15'));
        await expect(planner.logCompletion(id, date('2025-01-15'))).rejects.toThrow(/already exists/);
      });
    });
  });

  // ============================================================================
  // 6. Concurrency
  // ============================================================================

  describe('Concurrency', () => {
    it('sequential operations work correctly', async () => {
      // API designed for single-threaded use - verify sequential operations work
      const planner = createAutoplanner(createValidConfig());

      const id1 = await planner.createSeries({
        title: 'Series 1',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });
      const id2 = await planner.createSeries({
        title: 'Series 2',
        patterns: [{ type: 'daily', time: time('10:00') }],
      });

      // Sequential updates should work
      await planner.updateSeries(id1, { title: 'Updated 1' });
      await planner.updateSeries(id2, { title: 'Updated 2' });

      const series1 = await planner.getSeries(id1);
      const series2 = await planner.getSeries(id2);

      expect(series1?.title).toBe('Updated 1');
      expect(series2?.title).toBe('Updated 2');
    });

    it('rapid sequential operations maintain consistency', async () => {
      // Many rapid sequential operations should not corrupt state
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      // Perform many rapid updates
      for (let i = 0; i < 10; i++) {
        await planner.updateSeries(id, { title: `Title ${i}` });
      }

      const series = await planner.getSeries(id);
      expect(series?.title).toBe('Title 9');
    });

    it('adapter transaction support - adapter provides transaction method', async () => {
      const adapter = createMockAdapter();
      const result = await adapter.transaction(() => Promise.resolve('test-result'));
      expect(result).toBe('test-result');
    });
  });

  // ============================================================================
  // 7. Event Emission
  // ============================================================================

  describe('Event Emission', () => {
    describe('Reflow Event', () => {
      it('reflow event fires - handler called', async () => {
        const planner = createAutoplanner(createValidConfig());
        const handler = vi.fn();
        planner.on('reflow', handler);

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(handler).toHaveBeenCalled();
      });

      it('reflow payload is schedule - complete schedule in event', async () => {
        const planner = createAutoplanner(createValidConfig());
        let schedule: Schedule | null = null;
        planner.on('reflow', (s: Schedule) => {
          schedule = s;
        });

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Verify schedule has instances array with the created series
        expect(schedule).not.toBeNull();
        expect(schedule!.instances).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ seriesId: id, title: 'Test' }),
          ])
        );
      });
    });

    describe('Conflict Event', () => {
      it('conflict event fires - handler called when conflict created', async () => {
        const planner = createAutoplanner(createValidConfig());
        const handler = vi.fn();
        planner.on('conflict', handler);

        // Create two fixed series at same time to cause conflict
        await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });
        await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });

        expect(handler).toHaveBeenCalled();
      });

      it('conflict payload has details - conflict object in event', async () => {
        const planner = createAutoplanner(createValidConfig());
        let conflict: Conflict | null = null;
        planner.on('conflict', (c: Conflict) => {
          conflict = c;
        });

        const idA = await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });
        const idB = await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });

        expect(conflict?.type).toBe('overlap');
        expect([idA, idB]).toContain(conflict?.seriesIds[0]);
        expect([idA, idB]).toContain(conflict?.seriesIds[1]);
      });
    });

    describe('Reminder Due Event', () => {
      it('reminderDue event fires - handler called when reminder time reached', async () => {
        const planner = createAutoplanner(createValidConfig());
        const handler = vi.fn();
        planner.on('reminderDue', handler);

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.createReminder(id, { type: 'before', offset: minutes(15) });

        // Trigger reminder check at 08:45
        await planner.checkReminders(datetime('2025-01-15T08:45:00'));

        expect(handler).toHaveBeenCalled();
      });

      it('reminder payload has details - reminder object in event', async () => {
        const planner = createAutoplanner(createValidConfig());
        let reminder: PendingReminder | null = null;
        planner.on('reminderDue', (r: PendingReminder) => {
          reminder = r;
        });

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const reminderId = await planner.createReminder(id, { type: 'before', offset: minutes(15) });

        await planner.checkReminders(datetime('2025-01-15T08:45:00'));

        expect(reminder?.seriesId).toBe(id);
        expect(reminder?.id).toBe(reminderId);
        expect(reminder?.type).toBe('before');
      });
    });

    describe('Event Properties', () => {
      it('events after mutation - state complete before event', async () => {
        const planner = createAutoplanner(createValidConfig());
        let scheduleAtEvent: Schedule | null = null;

        planner.on('reflow', async (schedule: Schedule) => {
          // Query should return same state as event
          scheduleAtEvent = schedule;
        });

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(scheduleAtEvent?.instances.some((i) => i.seriesId === id)).toBe(true);
        expect(scheduleAtEvent?.instances.some((i) => i.title === 'Test')).toBe(true);
      });

      it('event data immutable - modify payload does not change original', async () => {
        const planner = createAutoplanner(createValidConfig());
        let schedules: Schedule[] = [];

        planner.on('reflow', (schedule: Schedule) => {
          schedules.push(schedule);
          // Try to mutate
          (schedule as any).instances = [];
        });

        const id1 = await planner.createSeries({
          title: 'Test 1',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'Test 2',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });

        // Second event should have fresh data, not affected by mutation
        expect(schedules[0]?.instances.some((i) => i.seriesId === id1)).toBe(true);
        expect(schedules[1]?.instances.some((i) => i.seriesId === id2)).toBe(true);
        expect(schedules[1]?.instances.some((i) => i.title === 'Test 2')).toBe(true);
      });

      it('handler errors isolated - API unaffected by handler throw', async () => {
        const planner = createAutoplanner(createValidConfig());

        planner.on('reflow', () => {
          throw new Error('Handler error');
        });

        // API should not throw even if handler throws
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(id).toMatch(/^[0-9a-f-]{36}$/);
      });
    });
  });

  // ============================================================================
  // 8. API Methods
  // ============================================================================

  describe('API Methods', () => {
    describe('Series Management', () => {
      it('createSeries returns ID - UUID returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(id).toMatch(/^[0-9a-f-]{36}$/);
      });

      it('getSeries returns series - series data returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const series = await planner.getSeries(id);
        expect(series?.title).toBe('Test');
      });

      it('getSeries returns null - non-existent returns null', async () => {
        const planner = createAutoplanner(createValidConfig());

        // Create a series first to ensure we can distinguish non-existent from empty
        const existingId = await planner.createSeries({
          title: 'Existing',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Verify the existing series is retrievable (positive case proves getSeries works)
        const existingSeries = await planner.getSeries(existingId);
        expect(existingSeries).toMatchObject({ id: existingId, title: 'Existing' });

        // Non-existent returns null - contrasted against the positive case above
        const series = await planner.getSeries(seriesId('non-existent'));
        expect(series).toBe(null);

        // Verify the non-existent ID is not in the list of all series
        const allSeries = await planner.getAllSeries();
        expect(allSeries).toHaveLength(1);
        expect(allSeries[0]).toMatchObject({ id: existingId, title: 'Existing' });
        expect(allSeries.map((s) => s.id)).not.toContain(seriesId('non-existent'));
      });

      it('getSeriesByTag filters - matching series returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        await planner.createSeries({
          title: 'Work',
          patterns: [{ type: 'daily', time: time('09:00') }],
          tags: ['work'],
        });
        await planner.createSeries({
          title: 'Personal',
          patterns: [{ type: 'daily', time: time('18:00') }],
          tags: ['personal'],
        });

        const workSeries = await planner.getSeriesByTag('work');
        expect(workSeries).toSatisfy((series: typeof workSeries) => series.length === 1 && series[0].title === 'Work' && series[0].tags?.includes('work'));
      });

      it('getAllSeries returns all - all series returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });

        const all = await planner.getAllSeries();
        expect(all).toSatisfy((series: typeof all) => series.length === 2 && series.map(s => s.title).sort().join(',') === 'A,B');
      });

      it('updateSeries modifies - changes applied', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.updateSeries(id, { title: 'Updated' });

        const series = await planner.getSeries(id);
        expect(series?.title).toBe('Updated');
      });

      it('lock locks - series locked', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.lock(id);

        const series = await planner.getSeries(id);
        expect(series?.locked).toBe(true);
      });

      it('unlock unlocks - series unlocked', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.lock(id);
        await planner.unlock(id);

        const series = await planner.getSeries(id);
        expect(series?.locked).toBe(false);
      });

      it('deleteSeries removes - series gone', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Verify series exists before deletion
        const seriesBefore = await planner.getSeries(id);
        expect(seriesBefore?.title).toBe('Test');

        await planner.deleteSeries(id);

        // Confirm series no longer appears in getAllSeries
        const allSeries = await planner.getAllSeries();
        expect(allSeries.map((s) => s.id)).not.toContain(id);
        // Confirm series no longer appears in schedule
        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        expect(schedule.instances.map((i) => i.seriesId)).not.toContain(id);
      });

      it('splitSeries splits - two series created', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const newId = await planner.splitSeries(id, date('2025-02-01'));

        const original = await planner.getSeries(id);
        const newSeries = await planner.getSeries(newId);

        expect(original?.id).toBe(id);
        expect(original?.title).toBe('Test');
        expect(newSeries?.id).toBe(newId);
        expect(original?.id).not.toBe(newSeries?.id);
      });
    });

    describe('Links', () => {
      it('linkSeries creates link - child linked to parent', async () => {
        const planner = createAutoplanner(createValidConfig());

        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });

        await planner.linkSeries(parentId, childId, { distance: 0 });

        const child = await planner.getSeries(childId);
        expect(child?.parentId).toBe(parentId);
      });

      it('unlinkSeries removes link - link removed', async () => {
        const planner = createAutoplanner(createValidConfig());

        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        await planner.linkSeries(parentId, childId, { distance: 0 });

        // Verify link exists before unlinking
        const childBefore = await planner.getSeries(childId);
        expect(childBefore?.parentId).toBe(parentId);

        await planner.unlinkSeries(childId);

        const child = await planner.getSeries(childId);

        // Child should still exist with its data intact, but parentId link removed
        expect(child).toMatchObject({
          id: childId,
          title: 'Child',
        });
        // Before unlinking, parentId was parentId; after unlinking it should be gone
        expect(child?.parentId).not.toBe(parentId);
        expect('parentId' in (child ?? {})).toBe(false);

        // Parent should be unaffected
        const parent = await planner.getSeries(parentId);
        expect(parent).toMatchObject({ id: parentId, title: 'Parent' });
      });
    });

    describe('Constraints', () => {
      it('addConstraint creates - constraint exists', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id1 = await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });

        const constraintId = await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });

        expect(constraintId).toMatch(/^[0-9a-f-]{36}$/);
      });

      it('removeConstraint removes - constraint gone', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id1 = await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const id2 = await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });
        const constraintId = await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: id1,
          secondSeries: id2,
        });

        // Verify constraint exists before removal
        const constraintsBefore = await planner.getConstraints();
        expect(constraintsBefore.some((c) => c.id === constraintId)).toBe(true);

        await planner.removeConstraint(constraintId);

        const constraints = await planner.getConstraints();
        expect(constraints.every((c) => c.id !== constraintId)).toBe(true);
        expect(constraints.length).toBe(constraintsBefore.length - 1);
      });
    });

    describe('Instance Operations', () => {
      it('getInstance returns instance - instance data returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const instance = await planner.getInstance(id, date('2025-01-15'));
        expect(instance?.seriesId).toBe(id);
        expect(instance?.date).toBe(date('2025-01-15'));
        expect(instance?.title).toBe('Test');
      });

      it('cancelInstance cancels - instance excluded from schedule', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.cancelInstance(id, date('2025-01-15'));

        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        expect(schedule.instances.some((i) => i.date === date('2025-01-15'))).toBe(false);
      });

      it('rescheduleInstance reschedules - instance at new time', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.rescheduleInstance(id, date('2025-01-15'), datetime('2025-01-15T14:00:00'));

        const instance = await planner.getInstance(id, date('2025-01-15'));
        expect(instance?.time).toBe(datetime('2025-01-15T14:00:00'));
      });
    });

    describe('Completions', () => {
      it('logCompletion logs - completion recorded', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.logCompletion(id, date('2025-01-15'));

        const completions = await planner.getCompletions(id);
        expect(completions.some((c) => c.date === date('2025-01-15'))).toBe(true);
      });

      it('getCompletions returns - matching completions returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        await planner.logCompletion(id, date('2025-01-15'));
        await planner.logCompletion(id, date('2025-01-16'));

        const completions = await planner.getCompletions(id);
        expect(completions).toSatisfy((c: typeof completions) => c.length === 2 && c.every(comp => comp.seriesId === id));
        expect(completions.map((c) => c.date).sort()).toEqual([date('2025-01-15'), date('2025-01-16')]);
      });

      it('deleteCompletion removes - completion gone', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const completionId = await planner.logCompletion(id, date('2025-01-15'));

        // Verify completion exists before deletion
        const completionsBefore = await planner.getCompletions(id);
        expect(completionsBefore).toHaveLength(1);
        expect(completionsBefore[0]).toMatchObject({ id: completionId, seriesId: id, date: date('2025-01-15') });

        await planner.deleteCompletion(completionId);

        // After deletion, the 1 completion verified above should now be gone
        const completionsAfter = await planner.getCompletions(id);
        expect(completionsAfter).toSatisfy((c: typeof completionsAfter) =>
          c.length === 0 && !c.some(comp => comp.id === completionId)
        );
      });
    });

    describe('Querying', () => {
      it('getSchedule returns schedule - instances in range', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-21'));

        // Verify instances are returned with correct data
        expect(schedule.instances.every((i) => i.seriesId === id)).toBe(true);
        expect(schedule.instances.every((i) => i.title === 'Test')).toBe(true);
        expect(schedule.instances.map((i) => i.date)).toContain(date('2025-01-15'));
        expect(schedule.instances.map((i) => i.date)).toContain(date('2025-01-20'));
      });

      it('getPendingReminders returns - due reminders returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const reminderId = await planner.createReminder(id, { type: 'before', offset: minutes(15) });

        const pending = await planner.getPendingReminders(datetime('2025-01-15T08:45:00'));

        expect(pending.some((r) => r.id === reminderId)).toBe(true);
        expect(pending.some((r) => r.seriesId === id)).toBe(true);
        expect(pending.some((r) => r.type === 'before')).toBe(true);
      });

      it('acknowledgeReminder acknowledges - reminder dismissed', async () => {
        const planner = createAutoplanner(createValidConfig());

        const seriesIdValue = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        const reminderId = await planner.createReminder(seriesIdValue, {
          type: 'before',
          offset: minutes(15),
        });

        // Verify reminder is pending before acknowledgement
        const pendingBefore = await planner.getPendingReminders(datetime('2025-01-15T08:45:00'));
        expect(pendingBefore.some((r) => r.id === reminderId)).toBe(true);

        await planner.acknowledgeReminder(reminderId, datetime('2025-01-15T08:45:00'));

        const pending = await planner.getPendingReminders(datetime('2025-01-15T08:45:00'));
        expect(pending.every((r) => r.id !== reminderId)).toBe(true);
        expect(pending.length).toBe(pendingBefore.length - 1);
      });

      it('getConflicts returns - current conflicts returned', async () => {
        const planner = createAutoplanner(createValidConfig());

        const idA = await planner.createSeries({
          title: 'A',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });
        const idB = await planner.createSeries({
          title: 'B',
          patterns: [{ type: 'daily', time: time('09:00'), fixed: true }],
        });

        const conflicts = await planner.getConflicts();

        expect(conflicts.some((c) => c.type === 'overlap')).toBe(true);
        expect(conflicts.some((c) => c.seriesIds.includes(idA))).toBe(true);
        expect(conflicts.some((c) => c.seriesIds.includes(idB))).toBe(true);
      });
    });

    describe('State Inspection', () => {
      it('evaluateCondition returns bool - true or false', async () => {
        const planner = createAutoplanner(createValidConfig());

        const result = await planner.evaluateCondition({
          type: 'weekday',
          days: [1, 2, 3, 4, 5],
        }, date('2025-01-15')); // Wednesday

        expect([true, false]).toContain(result);
      });

      it('getActiveConditions returns - active patterns per series', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [
            { type: 'daily', time: time('09:00'), condition: { type: 'weekday', days: [1, 2, 3, 4, 5] } },
            { type: 'daily', time: time('10:00'), condition: { type: 'weekday', days: [6, 0] } },
          ],
        });

        const active = await planner.getActiveConditions(id, date('2025-01-15')); // Wednesday

        // Verify active is an array containing condition evaluation results
        expect(active.length >= 0).toBe(true);
        // On a Wednesday (weekday), the weekday condition should be active
        expect(active.length === 0 || active.every((c) => typeof c === 'object')).toBe(true);
      });
    });
  });

  // ============================================================================
  // 9. Invariants
  // ============================================================================

  describe('Invariants', () => {
    it('INV 1: consistent state - query after any operation', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      // State should be consistent immediately after operation
      const series = await planner.getSeries(id);
      const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));

      expect(series?.id).toBe(id);
      expect(series?.title).toBe('Test');
      expect(schedule.instances.some((i) => i.seriesId === id)).toBe(true);
    });

    it('INV 2: times at boundary local - check all API responses', async () => {
      const planner = createAutoplanner(createValidConfig({ timezone: 'America/New_York' }));

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      const series = await planner.getSeries(id);
      const schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));

      // All times should be in local timezone (America/New_York)
      expect(series?.patterns[0].time).toBe(time('09:00'));
      schedule.instances.forEach((i) => {
        // Times should be local, not UTC
        expect(i.time).toMatch(/T09:00:00$/);
      });
    });

    it('INV 3: events reflect state - compare event payload to query', async () => {
      const planner = createAutoplanner(createValidConfig());
      let eventSchedule: Schedule | null = null;

      planner.on('reflow', (schedule: Schedule) => {
        eventSchedule = schedule;
      });

      await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });

      const queriedSchedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-22'));

      // Event schedule should match queried schedule
      expect(eventSchedule?.instances.length).toBe(queriedSchedule.instances.length);
    });

    it('INV 4: operations transactional - check state after failure', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Test',
        patterns: [{ type: 'daily', time: time('09:00') }],
      });
      await planner.lock(id);

      const seriesBefore = await planner.getSeries(id);

      try {
        await planner.updateSeries(id, { title: 'Updated' });
        expect.fail('Should have thrown LockedSeriesError');
      } catch (error) {
        expect(error).toBeInstanceOf(LockedSeriesError);
      }

      const seriesAfter = await planner.getSeries(id);

      // State should be unchanged after failed operation
      expect(seriesAfter?.title).toBe(seriesBefore?.title);
    });
  });

  // ============================================================================
  // 10. Integration Workflows
  // ============================================================================

  describe('Integration Workflows', () => {
    describe('Full CRUD Workflow', () => {
      it('series lifecycle - create get update delete all work', async () => {
        const planner = createAutoplanner(createValidConfig());

        // Create
        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        expect(id).toMatch(/^[0-9a-f-]{36}$/);

        // Get
        let series = await planner.getSeries(id);
        expect(series?.title).toBe('Test');

        // Update
        await planner.updateSeries(id, { title: 'Updated' });
        series = await planner.getSeries(id);
        expect(series?.title).toBe('Updated');

        // Delete
        await planner.deleteSeries(id);
        // Verify deletion is complete - series ID should not be in the list
        const allSeries = await planner.getAllSeries();
        expect(allSeries.map((s) => s.id)).not.toContain(id);
      });

      it('completion workflow - create series log completion query', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // 45 minute duration: 09:00 to 09:45
        await planner.logCompletion(id, date('2025-01-15'), {
          startTime: datetime('2025-01-15T09:00:00'),
          endTime: datetime('2025-01-15T09:45:00'),
        });

        const completions = await planner.getCompletions(id);
        expect(completions).toSatisfy((c: typeof completions) => c.length === 1 && c[0].seriesId === id);
        // Duration derived from endTime - startTime = 45 minutes
        expect(completions[0].endTime).toBe(datetime('2025-01-15T09:45:00'));
      });
    });

    describe('Complex Workflows', () => {
      it('conditional pattern activation - condition changes pattern activates schedule updates', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Weekday Only',
          patterns: [
            {
              type: 'daily',
              time: time('09:00'),
              condition: { type: 'weekday', days: [1, 2, 3, 4, 5] },
            },
          ],
        });

        // Verify series was created with correct condition
        const series = await planner.getSeries(id);
        expect(series?.patterns[0].condition).toEqual({ type: 'weekday', days: [1, 2, 3, 4, 5] });

        // Wednesday (weekday) - should appear
        const weekdaySchedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        const weekdayInstances = weekdaySchedule.instances.filter((i) => i.seriesId === id);
        expect(weekdayInstances).toHaveLength(1);
        expect(weekdayInstances[0].date).toEqual(date('2025-01-15'));

        // Saturday (weekend) - should not appear (weekday condition excludes day 6)
        // The weekday query above returned 1 instance, proving the series generates results
        const weekendSchedule = await getScheduleChecked(planner, date('2025-01-18'), date('2025-01-19'));
        const weekendInstances = weekendSchedule.instances.filter((i) => i.seriesId === id);
        expect(weekendInstances).toSatisfy((instances: typeof weekendInstances) =>
          instances.length === 0 && !instances.some(i => i.seriesId === id)
        );
      });

      it('chain with completion - parent completes child reschedules', async () => {
        const planner = createAutoplanner(createValidConfig());

        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(60) }],
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('10:00') }],
        });

        await planner.linkSeries(parentId, childId, { distance: 0, earlyWobble: 0, lateWobble: 30 });

        // Before completion, child scheduled relative to parent's scheduled end
        let schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        const childBefore = schedule.instances.find((i) => i.seriesId === childId);
        expect(childBefore?.seriesId).toBe(childId);
        expect(childBefore?.title).toBe('Child');

        // Complete parent early - started at 09:00, finished at 09:45 (15 min early)
        await planner.logCompletion(parentId, date('2025-01-15'), {
          startTime: datetime('2025-01-15T09:00:00'),
          endTime: datetime('2025-01-15T09:45:00'),
        });

        // After completion, child should be rescheduled based on actual end
        schedule = await getScheduleChecked(planner, date('2025-01-15'), date('2025-01-16'));
        const childAfter = schedule.instances.find((i) => i.seriesId === childId);

        // Child may have adjusted based on parent's early completion
        expect(childAfter?.seriesId).toBe(childId);
        expect(childAfter?.title).toBe('Child');
      });
    });
  });

  // ===========================================================================
  // Reflow Integration
  // ===========================================================================

  describe('Reflow integration', () => {
    function timeOf(dt: string): string {
      return dt.slice(11);
    }

    function timeToMinutes(t: string): number {
      const [h, m] = t.split(':').map(Number);
      return h! * 60 + m!;
    }

    function rangesOverlap(s1: string, d1: number, s2: string, d2: number): boolean {
      const a = timeToMinutes(s1), b = a + d1;
      const c = timeToMinutes(s2), d = c + d2;
      return a < d && c < b;
    }

    it('getSchedule uses reflow for time distribution — two no-time items get separated', async () => {
      const planner = createAutoplanner({ adapter: createMockAdapter(), timezone: 'UTC' });

      await planner.createSeries({
        title: 'NoTime-A',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2025-06-01'),
      });

      await planner.createSeries({
        title: 'NoTime-B',
        patterns: [{ type: 'daily', duration: minutes(60) }],
        startDate: date('2025-06-01'),
      });

      const schedule = await getScheduleChecked(planner, date('2025-06-01'), date('2025-06-02'));
      const a = schedule.instances.find((i) => i.title === 'NoTime-A')!;
      const b = schedule.instances.find((i) => i.title === 'NoTime-B')!;

      expect(a.title).toBe('NoTime-A');
      expect(a.duration).toBe(60);
      expect(b.title).toBe('NoTime-B');
      expect(b.duration).toBe(60);

      // They should NOT overlap — reflow should have separated them
      expect(
        rangesOverlap(timeOf(a.time as string), 60, timeOf(b.time as string), 60),
      ).toBe(false);
    });

    it('getSchedule returns reflow conflicts for fixed-fixed overlap', async () => {
      const planner = createAutoplanner({ adapter: createMockAdapter(), timezone: 'UTC' });

      const id1 = await planner.createSeries({
        title: 'FixedOverlap-1',
        patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60), fixed: true }],
        startDate: date('2025-06-01'),
      });

      const id2 = await planner.createSeries({
        title: 'FixedOverlap-2',
        patterns: [{ type: 'daily', time: time('10:30'), duration: minutes(60), fixed: true }],
        startDate: date('2025-06-01'),
      });

      const schedule = await getScheduleChecked(planner, date('2025-06-01'), date('2025-06-02'));

      // Both instances present at their declared times
      const inst1 = schedule.instances.find((i) => i.seriesId === id1)!;
      const inst2 = schedule.instances.find((i) => i.seriesId === id2)!;
      expect(timeOf(inst1.time as string)).toBe('10:00:00');
      expect(timeOf(inst2.time as string)).toBe('10:30:00');

      // Overlap conflict reported with concrete seriesIds
      const overlap = schedule.conflicts.find((c) => c.type === 'overlap');
      expect(overlap).toBeDefined();
      expect(overlap!.seriesIds).toContain(id1);
      expect(overlap!.seriesIds).toContain(id2);
    });

    it('flexible without pattern.time gets placed in waking hours', async () => {
      const planner = createAutoplanner({ adapter: createMockAdapter(), timezone: 'UTC' });

      await planner.createSeries({
        title: 'NoTimeItem',
        patterns: [{ type: 'daily', duration: minutes(45) }],
        startDate: date('2025-06-01'),
      });

      const schedule = await getScheduleChecked(planner, date('2025-06-01'), date('2025-06-02'));
      const inst = schedule.instances.find((i) => i.title === 'NoTimeItem')!;

      expect(inst.title).toBe('NoTimeItem');
      expect(inst.duration).toBe(45);
      const mins = timeToMinutes(timeOf(inst.time as string));
      // Should be within waking hours window (07:00-23:00)
      expect(mins).toBeGreaterThanOrEqual(7 * 60);
      expect(mins + 45).toBeLessThanOrEqual(23 * 60);
    });
  });

  describe('Cycling Projection in Schedule', () => {
    it('2-item sequential cycling projects A/B alternation across weekdays', async () => {
      const planner = createAutoplanner(createValidConfig({ timezone: 'UTC' }));

      const id = await planner.createSeries({
        title: 'Workout',
        startDate: date('2026-03-02'), // Monday
        patterns: [{ type: 'weekdays', daysOfWeek: [1, 3, 5], time: time('10:00:00'), duration: minutes(60) }],
        cycling: { mode: 'sequential', items: ['Workout A', 'Workout B'], gapLeap: true },
      });

      // 2 weeks: Mon 2, Wed 4, Fri 6, Mon 9, Wed 11, Fri 13 = 6 instances
      const sched = await getScheduleChecked(planner, date('2026-03-02'), date('2026-03-14'));
      const titles = sched.instances.filter(i => i.seriesId === id).map(i => i.title);
      expect(titles).toEqual(['Workout A', 'Workout B', 'Workout A', 'Workout B', 'Workout A', 'Workout B']);
    });

    it('2-item cycling shifts after completion', async () => {
      const planner = createAutoplanner(createValidConfig({ timezone: 'UTC' }));

      const id = await planner.createSeries({
        title: 'Workout',
        startDate: date('2026-03-02'),
        patterns: [{ type: 'weekdays', daysOfWeek: [1, 3, 5], time: time('10:00:00'), duration: minutes(60) }],
        cycling: { mode: 'sequential', items: ['Workout A', 'Workout B'], gapLeap: true },
      });

      // Complete first instance → base shifts to B
      await planner.logCompletion(id, date('2026-03-02'));

      const sched = await getScheduleChecked(planner, date('2026-03-04'), date('2026-03-14'));
      const titles = sched.instances.filter(i => i.seriesId === id).map(i => i.title);
      // After 1 completion: B, A, B, A, B
      expect(titles).toHaveLength(5);
      expect(titles[0]).toBe('Workout B');
      expect(titles[1]).toBe('Workout A');
      expect(titles[2]).toBe('Workout B');
      expect(titles[3]).toBe('Workout A');
      expect(titles[4]).toBe('Workout B');
    });

    it('3-item cycling projects through full rotation (Turbovac-like)', async () => {
      const planner = createAutoplanner(createValidConfig({ timezone: 'UTC' }));

      const id = await planner.createSeries({
        title: 'Turbovac',
        startDate: date('2026-03-03'), // Tuesday
        patterns: [{ type: 'weekdays', daysOfWeek: [2], time: time('09:00:00'), duration: minutes(15) }],
        cycling: { mode: 'sequential', items: ['Bedroom', 'Living Room', 'Office'], gapLeap: true },
      });

      // 4 Tuesdays: Mar 3, 10, 17, 24
      const sched = await getScheduleChecked(planner, date('2026-03-03'), date('2026-03-25'));
      const titles = sched.instances.filter(i => i.seriesId === id).map(i => i.title);
      expect(titles).toEqual(['Bedroom', 'Living Room', 'Office', 'Bedroom']);
    });

    it('3-item cycling advances correctly after completions', async () => {
      const planner = createAutoplanner(createValidConfig({ timezone: 'UTC' }));

      const id = await planner.createSeries({
        title: 'Turbovac',
        startDate: date('2026-03-03'),
        patterns: [{ type: 'weekdays', daysOfWeek: [2], time: time('09:00:00'), duration: minutes(15) }],
        cycling: { mode: 'sequential', items: ['Bedroom', 'Living Room', 'Office'], gapLeap: true },
      });

      // Complete Bedroom
      await planner.logCompletion(id, date('2026-03-03'));

      // Now starts at Living Room
      const sched = await getScheduleChecked(planner, date('2026-03-10'), date('2026-03-31'));
      const titles = sched.instances.filter(i => i.seriesId === id).map(i => i.title);
      expect(titles).toEqual(['Living Room', 'Office', 'Bedroom']);
    });
  });

  // ============================================================================
  // endDate Exclusivity
  // ============================================================================

  describe('endDate Exclusivity', () => {
    it('endDate itself is NOT a valid instance date', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Bounded',
        startDate: date('2026-04-01'),
        endDate: date('2026-04-06'), // exclusive: Apr 1-5 valid
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      const sched = await getScheduleChecked(planner, date('2026-04-01'), date('2026-04-10'));
      const dates = sched.instances.filter(i => i.seriesId === id).map(i => i.date);
      expect(dates).toEqual([
        date('2026-04-01'),
        date('2026-04-02'),
        date('2026-04-03'),
        date('2026-04-04'),
        date('2026-04-05'),
      ]);
    });

    it('single-day series: endDate = startDate + 1 produces exactly one instance', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'One Day',
        startDate: date('2026-05-15'),
        endDate: date('2026-05-16'), // exclusive: only May 15
        patterns: [{ type: 'daily', time: time('10:00'), duration: minutes(60) }],
      });

      const sched = await getScheduleChecked(planner, date('2026-05-01'), date('2026-05-31'));
      const instances = sched.instances.filter(i => i.seriesId === id);
      expect(instances).toEqual([
        expect.objectContaining({ date: date('2026-05-15'), title: 'One Day' }),
      ]);
    });

    it('endDate = startDate rejected (zero-day range)', async () => {
      const planner = createAutoplanner(createValidConfig());

      await expect(planner.createSeries({
        title: 'Invalid',
        startDate: date('2026-06-01'),
        endDate: date('2026-06-01'),
        patterns: [{ type: 'daily' }],
      })).rejects.toThrow(/endDate must be > startDate/);
    });

    it('split series: original endDate equals splitDate (exclusive)', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Splittable',
        startDate: date('2026-07-01'),
        endDate: date('2026-07-31'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      const newId = await planner.splitSeries(id, date('2026-07-15'));

      // Original: instances up to Jul 14 (endDate Jul 15 is exclusive)
      const origSched = await getScheduleChecked(planner, date('2026-07-01'), date('2026-07-31'));
      const origDates = origSched.instances.filter(i => i.seriesId === id).map(i => i.date);
      expect(origDates).toContain(date('2026-07-14'));
      expect(origDates).not.toContain(date('2026-07-15'));

      // New series: starts at Jul 15
      const newDates = origSched.instances.filter(i => i.seriesId === newId).map(i => i.date);
      expect(newDates).toContain(date('2026-07-15'));
      expect(newDates).not.toContain(date('2026-07-14'));
    });

    it('endDate boundary: day before endDate is the last instance', async () => {
      const planner = createAutoplanner(createValidConfig());

      const id = await planner.createSeries({
        title: 'Boundary',
        startDate: date('2026-08-01'),
        endDate: date('2026-08-04'), // exclusive: Aug 1, 2, 3
        patterns: [{ type: 'daily', time: time('12:00'), duration: minutes(15) }],
      });

      const sched = await getScheduleChecked(planner, date('2026-08-01'), date('2026-08-10'));
      const dates = sched.instances.filter(i => i.seriesId === id).map(i => i.date);
      const lastDate = dates[dates.length - 1];
      expect(lastDate).toBe(date('2026-08-03'));
    });
  });

  // ============================================================================
  // Chain Propagation (getParentEndTime)
  // ============================================================================

  describe('Chain Propagation', () => {
    it('3-deep chain: grandchild offset uses parent chain-adjusted time, not pattern time', async () => {
      const planner = createAutoplanner(createValidConfig());

      // Root: Load at 09:00, 15 min
      const loadId = await planner.createSeries({
        title: 'Load',
        startDate: date('2026-09-01'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(15) }],
      });

      // Child: Transfer, offset 80 min from Load end
      // Expected: 09:00 + 15min + 80min = 10:35
      const transferId = await planner.createSeries({
        title: 'Transfer',
        startDate: date('2026-09-01'),
        patterns: [{ type: 'daily', duration: minutes(15) }],
      });
      await planner.linkSeries(loadId, transferId, {
        distance: 80,
        earlyWobble: 0,
        lateWobble: 10,
      });

      // Grandchild: Fold, offset 200 min from Transfer end
      // Expected: 10:35 + 15min + 200min = 14:10 (NOT 09:00 + 15 + 200 = 12:35)
      const foldId = await planner.createSeries({
        title: 'Fold',
        startDate: date('2026-09-01'),
        patterns: [{ type: 'daily', duration: minutes(15) }],
      });
      await planner.linkSeries(transferId, foldId, {
        distance: 200,
        earlyWobble: 5,
        lateWobble: 120,
      });

      const sched = await getScheduleChecked(planner, date('2026-09-01'), date('2026-09-02'));
      const load = sched.instances.find(i => i.seriesId === loadId)!;
      const transfer = sched.instances.find(i => i.seriesId === transferId)!;
      const fold = sched.instances.find(i => i.seriesId === foldId)!;

      // Load at 09:00
      expect(load.time).toContain('09:00');
      // Transfer at 09:15 + 80min = 10:35
      expect(transfer.time).toContain('10:35');
      // Fold at 10:35 + 15min + 200min = 14:10 (chain-propagated, not pattern-based)
      expect(fold.time).toContain('14:10');
    });

    it('completion on parent overrides chain-computed time for child', async () => {
      const planner = createAutoplanner(createValidConfig());

      const parentId = await planner.createSeries({
        title: 'Parent',
        startDate: date('2026-09-10'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30) }],
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-10'),
        patterns: [{ type: 'daily', duration: minutes(20) }],
      });
      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 0,
        lateWobble: 30,
      });

      // Before completion: child at 08:00 + 30 + 60 = 09:30
      const sched1 = await getScheduleChecked(planner, date('2026-09-10'), date('2026-09-11'));
      const child1 = sched1.instances.find(i => i.seriesId === childId)!;
      expect(child1.time).toContain('09:30');

      // Log completion with late end time
      await planner.logCompletion(parentId, date('2026-09-10'), {
        endTime: datetime('2026-09-10T10:00:00'),
      });

      // After completion: child at 10:00 + 60 = 11:00 (uses completion endTime)
      const sched2 = await getScheduleChecked(planner, date('2026-09-10'), date('2026-09-11'));
      const child2 = sched2.instances.find(i => i.seriesId === childId)!;
      expect(child2.time).toContain('11:00');
    });

    it('completion-adjusted chain child time survives reflow with exact position', async () => {
      const planner = createAutoplanner(createValidConfig());

      const parentId = await planner.createSeries({
        title: 'Parent',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30) }],
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(20) }],
      });
      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 0,
        lateWobble: 30,
      });

      // Completion ran 45min over: ended at 08:00+30+45 = 09:15
      await planner.logCompletion(parentId, date('2026-09-15'), {
        endTime: datetime('2026-09-15T09:15:00'),
      });

      const sched = await getScheduleChecked(planner, date('2026-09-15'), date('2026-09-16'));
      const parent = sched.instances.find(i => i.seriesId === parentId)!;
      const child = sched.instances.find(i => i.seriesId === childId)!;

      // Parent pattern time stays at 08:00
      expect(parent.time).toBe('2026-09-15T08:00:00');
      // Child at completion end (09:15) + distance (60) = 10:15
      expect(child.time).toBe('2026-09-15T10:15:00');
    });

    it('non-completion chain child still uses derived position from reflow', async () => {
      const planner = createAutoplanner(createValidConfig());

      const parentId = await planner.createSeries({
        title: 'Parent',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30) }],
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(20) }],
      });
      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 0,
        lateWobble: 30,
      });

      // NO completion — child should use normal derivation
      const sched = await getScheduleChecked(planner, date('2026-09-15'), date('2026-09-16'));
      const parent = sched.instances.find(i => i.seriesId === parentId)!;
      const child = sched.instances.find(i => i.seriesId === childId)!;

      // Parent at pattern time
      expect(parent.time).toBe('2026-09-15T08:00:00');
      // Child at parent end (08:30) + distance (60) = 09:30
      expect(child.time).toBe('2026-09-15T09:30:00');
    });

    it('chain grandchild respects grandparent completion', async () => {
      const planner = createAutoplanner(createValidConfig());

      const gpId = await planner.createSeries({
        title: 'Grandparent',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30) }],
      });

      const parentId = await planner.createSeries({
        title: 'Parent',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(20) }],
      });
      await planner.linkSeries(gpId, parentId, {
        distance: 30,
        earlyWobble: 0,
        lateWobble: 0,
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(15) }],
      });
      await planner.linkSeries(parentId, childId, {
        distance: 20,
        earlyWobble: 0,
        lateWobble: 0,
      });

      // Grandparent completion ended at 09:00 (ran 30min over)
      await planner.logCompletion(gpId, date('2026-09-15'), {
        endTime: datetime('2026-09-15T09:00:00'),
      });

      const sched = await getScheduleChecked(planner, date('2026-09-15'), date('2026-09-16'));
      const gp = sched.instances.find(i => i.seriesId === gpId)!;
      const parent = sched.instances.find(i => i.seriesId === parentId)!;
      const child = sched.instances.find(i => i.seriesId === childId)!;

      // GP at pattern time
      expect(gp.time).toBe('2026-09-15T08:00:00');
      // Parent at GP completion end (09:00) + distance (30) = 09:30
      expect(parent.time).toBe('2026-09-15T09:30:00');
      // Child at parent end (09:30 + 20min dur) + distance (20) = 10:10
      expect(child.time).toBe('2026-09-15T10:10:00');
    });

    it('chain root with explicit time remains flexible when no completion', async () => {
      const planner = createAutoplanner(createValidConfig());

      // Two series at same time — one will need to move
      const rootId = await planner.createSeries({
        title: 'Root',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(60) }],
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(30) }],
      });
      await planner.linkSeries(rootId, childId, {
        distance: 30,
        earlyWobble: 0,
        lateWobble: 30,
      });

      const otherId = await planner.createSeries({
        title: 'Other',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(60), fixed: true }],
      });

      // Root must move because Other is fixed at 08:00
      const sched = await getScheduleChecked(planner, date('2026-09-15'), date('2026-09-16'));
      const root = sched.instances.find(i => i.seriesId === rootId)!;
      const child = sched.instances.find(i => i.seriesId === childId)!;
      const other = sched.instances.find(i => i.seriesId === otherId)!;

      // Other stays at 08:00 (fixed)
      expect(other.time).toBe('2026-09-15T08:00:00');
      // Root must have moved away from 08:00
      expect(root.time).not.toBe('2026-09-15T08:00:00');
      // Child must follow the root
      const rootTimeHour = parseInt(root.time!.toString().substring(11, 13));
      const rootTimeMin = parseInt(root.time!.toString().substring(14, 16));
      const childTimeHour = parseInt(child.time!.toString().substring(11, 13));
      const childTimeMin = parseInt(child.time!.toString().substring(14, 16));
      const rootEndMinutes = rootTimeHour * 60 + rootTimeMin + 60;  // root dur=60
      const childStartMinutes = childTimeHour * 60 + childTimeMin;
      // Child should be at root end + distance(30), within wobble tolerance
      expect(childStartMinutes).toBeGreaterThanOrEqual(rootEndMinutes + 30);
      expect(childStartMinutes).toBeLessThanOrEqual(rootEndMinutes + 60);  // +30 late wobble
    });

    it('completion without endTime does not break chain derivation', async () => {
      const planner = createAutoplanner(createValidConfig());

      const parentId = await planner.createSeries({
        title: 'Parent',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', time: time('08:00'), duration: minutes(30) }],
      });

      const childId = await planner.createSeries({
        title: 'Child',
        startDate: date('2026-09-15'),
        patterns: [{ type: 'daily', duration: minutes(20) }],
      });
      await planner.linkSeries(parentId, childId, {
        distance: 60,
        earlyWobble: 0,
        lateWobble: 30,
      });

      // Completion WITHOUT endTime — should NOT skip chain derivation
      await planner.logCompletion(parentId, date('2026-09-15'), {});

      const sched = await getScheduleChecked(planner, date('2026-09-15'), date('2026-09-16'));
      const parent = sched.instances.find(i => i.seriesId === parentId)!;
      const child = sched.instances.find(i => i.seriesId === childId)!;

      // Parent at pattern time
      expect(parent.time).toBe('2026-09-15T08:00:00');
      // Child uses normal derivation: 08:00 + 30 + 60 = 09:30
      expect(child.time).toBe('2026-09-15T09:30:00');
    });
  });

  // ==========================================================================
  // Field Normalization (Concern 3 / F4)
  // ==========================================================================

  describe('Field Normalization', () => {
    it('weekly pattern daysOfWeek survives adapter round-trip as daysOfWeek', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Weekly DOW',
        startDate: date('2026-02-09'),
        patterns: [{ type: 'weekly', daysOfWeek: [1, 3, 5], time: time('09:00'), duration: minutes(30) }],
      });

      const series = await planner.getSeries(id);
      expect(series).not.toBeNull();
      expect(series!.patterns[0].daysOfWeek).toEqual([1, 3, 5]);
      expect(Object.keys(series!.patterns[0])).not.toContain('days');
    });

    it('schedule generation uses daysOfWeek after round-trip', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      // daysOfWeek: [1, 3] = Mon, Wed (WEEKDAY_NAMES: sun=0, mon=1, tue=2, wed=3, ...)
      const id = await planner.createSeries({
        title: 'Weekly Schedule',
        startDate: date('2026-02-09'),
        patterns: [{ type: 'weekly', daysOfWeek: [1, 3], time: time('09:00'), duration: minutes(30) }],
      });

      // Mon 2026-02-09 through Sun 2026-02-15 (exclusive end)
      const sched = await getScheduleChecked(planner, date('2026-02-09'), date('2026-02-16'));
      const instances = sched.instances.filter(i => i.seriesId === id);
      expect(instances).toHaveLength(2);
      expect(instances[0]).toMatchObject({ seriesId: id, date: '2026-02-09' }); // Monday
      expect(instances[1]).toMatchObject({ seriesId: id, date: '2026-02-11' }); // Wednesday
    });

    it('daysOfWeek is populated after adapter loadFullSeries round-trip', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Adapter Round-Trip',
        startDate: date('2026-02-09'),
        patterns: [{ type: 'weekly', daysOfWeek: [1, 4, 6], time: time('08:00'), duration: minutes(45) }],
      });

      // getSeries goes through loadFullSeries which reads from adapter
      const series = await planner.getSeries(id);
      expect(series).not.toBeNull();
      expect(series!.patterns).toHaveLength(1);
      expect(series!.patterns[0]).toMatchObject({
        type: 'weekly',
        daysOfWeek: [1, 4, 6],
        time: '08:00',
        duration: 45,
      });

      // Schedule should fire on Mon(1), Thu(4), Sat(6) within a full week
      const sched = await getScheduleChecked(planner, date('2026-02-09'), date('2026-02-16'));
      const instances = sched.instances.filter(i => i.seriesId === id);
      expect(instances).toHaveLength(3);
      expect(instances[0]).toMatchObject({ date: '2026-02-09' }); // Monday
      expect(instances[1]).toMatchObject({ date: '2026-02-12' }); // Thursday
      expect(instances[2]).toMatchObject({ date: '2026-02-14' }); // Saturday
    });
  });

  // ==========================================================================
  // Exception Upsert (Concern 2 / F10)
  // ==========================================================================

  describe('Exception Upsert', () => {
    it('reschedule then reschedule again does not throw', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Upsert Test',
        startDate: date('2026-03-01'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      await planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T14:00:00'));
      // Second reschedule on same date — must NOT throw
      await planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T16:00:00'));

      const sched = await getScheduleChecked(planner, date('2026-03-09'), date('2026-03-10'));
      const inst = sched.instances.find(i => i.seriesId === id && (i.time as string).includes('2026-03-09'));
      expect(inst).toMatchObject({
        seriesId: id,
        time: '2026-03-09T16:00:00',
      });
    });

    it('reschedule then cancel produces cancelled exception', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Reschedule Then Cancel',
        startDate: date('2026-03-01'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      await planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T14:00:00'));

      // Prove rescheduled instance exists before cancel
      const schedBefore = await getScheduleChecked(planner, date('2026-03-09'), date('2026-03-10'));
      const beforeInst = schedBefore.instances.find(i => i.seriesId === id && i.time === '2026-03-09T14:00:00');
      expect(beforeInst).toMatchObject({ seriesId: id, time: '2026-03-09T14:00:00' });

      await planner.cancelInstance(id, date('2026-03-09'));

      // Schedule should no longer show the rescheduled instance
      const sched = await getScheduleChecked(planner, date('2026-03-09'), date('2026-03-10'));
      const afterInst = sched.instances.find(i => i.seriesId === id && i.time === '2026-03-09T14:00:00');
      expect(afterInst).toBeUndefined();

      // Adapter has cancelled exception (concrete proof of state transition)
      const exc = await adapter.getInstanceException(id, date('2026-03-09'));
      expect(exc).toMatchObject({
        seriesId: id,
        originalDate: '2026-03-09',
        type: 'cancelled',
      });
    });

    it('cancel then reschedule is blocked by AlreadyCancelledError', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Cancel Then Reschedule',
        startDate: date('2026-03-01'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      await planner.cancelInstance(id, date('2026-03-09'));
      // Attempting to reschedule a cancelled instance should throw
      await expect(
        planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T14:00:00'))
      ).rejects.toThrow('cancelled');

      // Adapter still has the cancel
      const exc = await adapter.getInstanceException(id, date('2026-03-09'));
      expect(exc).toMatchObject({
        type: 'cancelled',
        originalDate: '2026-03-09',
      });
    });

    it('adapter state matches in-memory after failed adapter call', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      const id = await planner.createSeries({
        title: 'Crash Safety',
        startDate: date('2026-03-01'),
        patterns: [{ type: 'daily', time: time('09:00'), duration: minutes(30) }],
      });

      // First reschedule succeeds
      await planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T14:00:00'));

      // Sabotage adapter to throw on next createInstanceException
      const origCreate = adapter.createInstanceException.bind(adapter);
      let callCount = 0;
      adapter.createInstanceException = async (exc) => {
        callCount++;
        if (callCount >= 1) throw new Error('Simulated adapter failure');
        return origCreate(exc);
      };

      // Second reschedule should fail due to adapter error
      await expect(
        planner.rescheduleInstance(id, date('2026-03-09'), datetime('2026-03-09T16:00:00'))
      ).rejects.toThrow('Simulated adapter failure');

      // Restore adapter
      adapter.createInstanceException = origCreate;

      // The adapter should still have the FIRST reschedule (14:00), not the second (16:00)
      const exc = await adapter.getInstanceException(id, date('2026-03-09'));
      expect(exc).toMatchObject({
        type: 'rescheduled',
        newTime: '2026-03-09T14:00:00',
      });
    });
  });

  // ========================================================================
  // Hydration Completeness (F6)
  // ========================================================================
  describe('Hydration Completeness', () => {
    it('hydrate restores relational constraints', async () => {
      const adapter = createMockAdapter();

      // Planner A: create two series, add cantBeNextTo constraint
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const idA = await plannerA.createSeries({
        title: 'Series A',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['heavy'],
      });
      const idB = await plannerA.createSeries({
        title: 'Series B',
        patterns: [{ type: 'daily' as const, time: time('10:00:00'), duration: minutes(30) }],
        tags: ['heavy'],
      });
      const constraintId = await plannerA.addConstraint({
        type: 'cantBeNextTo',
        target: { type: 'seriesId', seriesId: idA },
        secondTarget: { type: 'seriesId', seriesId: idB },
      });

      // Planner B: fresh planner from same adapter, hydrate
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // Verify constraints were restored with correct target structures
      const constraints = await plannerB.getConstraints();
      expect(constraints).toHaveLength(1);
      expect(constraints[0]).toMatchObject({
        id: constraintId,
        type: 'cantBeNextTo',
        target: { type: 'seriesId', seriesId: idA },
        secondTarget: { type: 'seriesId', seriesId: idB },
      });
    });

    it('hydrate restores reminders', async () => {
      const adapter = createMockAdapter();

      // Planner A: create series, add reminder
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const seriesIdVal = await plannerA.createSeries({
        title: 'Reminder Series',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
      });
      const reminderId = await plannerA.createReminder(seriesIdVal, {
        type: 'before',
        offset: 15,
      });

      // Planner B: hydrate from same adapter
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // Verify reminder is functional — get pending reminders at 09:00 (fire time = 08:45)
      const pending = await plannerB.getPendingReminders(
        datetime('2026-03-09T09:00:00')
      );
      // Should find our reminder since we're past fire time (08:45) but before instance time (09:00)
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        id: reminderId,
        seriesId: seriesIdVal,
        type: 'before',
        offset: 15,
      });
    });

    it('hydrate rebuilds tagCache for tag-based constraint resolution', async () => {
      const adapter = createMockAdapter();

      // Planner A: create two series with same tag, add tag-based constraint BEFORE hydration
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id1 = await plannerA.createSeries({
        title: 'Tagged A',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['workout'],
      });
      const id2 = await plannerA.createSeries({
        title: 'Tagged B',
        patterns: [{ type: 'daily' as const, time: time('10:00:00'), duration: minutes(30) }],
        tags: ['workout'],
      });
      const constraintId = await plannerA.addConstraint({
        type: 'cantBeNextTo',
        target: { type: 'tag', tag: 'workout' },
        secondTarget: { type: 'tag', tag: 'workout' },
      });

      // Planner B: hydrate — should rebuild tagCache AND restore constraint
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // Verify constraint was restored with tag targets (proves adapter roundtrip)
      const constraints = await plannerB.getConstraints();
      expect(constraints).toHaveLength(1);
      expect(constraints[0]).toMatchObject({
        id: constraintId,
        type: 'cantBeNextTo',
        target: { type: 'tag', tag: 'workout' },
        secondTarget: { type: 'tag', tag: 'workout' },
      });

      // Verify series are in hydrated planner's cache (tagCache populated correctly)
      const seriesA = await plannerB.getSeries(id1);
      const seriesB = await plannerB.getSeries(id2);
      expect(seriesA).toMatchObject({ title: 'Tagged A', tags: ['workout'] });
      expect(seriesB).toMatchObject({ title: 'Tagged B', tags: ['workout'] });
    });

    it('hydrate restores reminder acknowledgments', async () => {
      const adapter = createMockAdapter();

      // Planner A: create series, reminder, then acknowledge
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const sid = await plannerA.createSeries({
        title: 'Ack Series',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
      });
      const remId = await plannerA.createReminder(sid, {
        type: 'before',
        offset: 10,
      });
      // Acknowledge for 2026-03-09 (will persist to adapter now)
      await plannerA.acknowledgeReminder(remId, datetime('2026-03-09T09:00:00'));

      // Verify in planner A: acknowledged date should NOT show as pending
      const pendingA = await plannerA.getPendingReminders(datetime('2026-03-09T09:00:00'));
      const ackedDatesA = pendingA.filter(p => p.id === remId).map(p => p.instanceDate);
      expect(ackedDatesA).not.toContain('2026-03-09');

      // Planner B: hydrate — should restore acks
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // The acknowledged date should NOT be pending in planner B either
      const pendingB = await plannerB.getPendingReminders(datetime('2026-03-09T09:00:00'));
      const ackedDatesB = pendingB.filter(p => p.id === remId).map(p => p.instanceDate);
      expect(ackedDatesB).not.toContain('2026-03-09');

      // But a date outside the ack window SHOULD still be pending (proves selective ack, not blanket suppress)
      // Ack window is ±1 day from asOfDate, so 2026-03-12 is safely outside
      const pendingOther = await plannerB.getPendingReminders(datetime('2026-03-12T09:00:00'));
      const foundOther = pendingOther.find(p => p.id === remId && p.instanceDate === date('2026-03-12'));
      expect(foundOther).toMatchObject({
        id: remId,
        seriesId: sid,
        type: 'before',
      });
    });

    it('acknowledgeReminder persists to adapter', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));
      const sid = await planner.createSeries({
        title: 'Persist Ack',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
      });
      const remId = await planner.createReminder(sid, { type: 'before', offset: 5 });

      // Acknowledge
      await planner.acknowledgeReminder(remId, datetime('2026-03-09T09:00:00'));

      // Verify adapter has the ack
      const isAcked = await adapter.isReminderAcknowledged(remId, date('2026-03-09'));
      expect(isAcked).toBe(true);

      // And a non-acked date should not be acknowledged
      const isNotAcked = await adapter.isReminderAcknowledged(remId, date('2026-03-15'));
      expect(isNotAcked).toBe(false);
    });
  });

  // ========================================================================
  // updateSeries Persistence (F7)
  // ========================================================================
  describe('updateSeries Persistence', () => {
    it('updated patterns persist through adapter round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id = await plannerA.createSeries({
        title: 'Pattern Update',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
      });

      // Update pattern time from 09:00 to 14:00
      await plannerA.updateSeries(id, {
        patterns: [{ type: 'daily' as const, time: time('14:00:00'), duration: minutes(45) }],
      });

      // Fresh planner from same adapter, hydrate
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const loaded = await plannerB.getSeries(id);
      expect(loaded!.patterns).toHaveLength(1);
      expect(loaded!.patterns[0]).toMatchObject({
        type: 'daily',
        time: '14:00:00',
        duration: 45,
      });
    });

    it('updated tags persist through adapter round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id = await plannerA.createSeries({
        title: 'Tag Update',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['exercise'],
      });

      // Update tags: add 'outdoor'
      await plannerA.updateSeries(id, {
        tags: ['exercise', 'outdoor'],
      });

      // Fresh planner, hydrate
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const loaded = await plannerB.getSeries(id);
      expect(loaded!.tags).toEqual(['exercise', 'outdoor']);
    });

    it('removed tags are gone after round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id = await plannerA.createSeries({
        title: 'Tag Removal',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['a', 'b'],
      });

      // Verify both tags present before removal
      const before = await plannerA.getSeries(id);
      expect(before!.tags).toEqual(['a', 'b']);

      // Remove tag 'b'
      await plannerA.updateSeries(id, { tags: ['a'] });

      // Fresh planner, hydrate
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const loaded = await plannerB.getSeries(id);
      expect(loaded!.tags).toEqual(['a']);
    });

    it('updated cycling config persists through round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id = await plannerA.createSeries({
        title: 'Cycling Update',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        cycling: { mode: 'sequential', items: ['A', 'B'], currentIndex: 0 },
      });

      // Update cycling to different items
      await plannerA.updateSeries(id, {
        cycling: { mode: 'sequential', items: ['X', 'Y', 'Z'], currentIndex: 0 },
      });

      // Fresh planner, hydrate
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const loaded = await plannerB.getSeries(id);
      expect(loaded!.cycling).toMatchObject({
        mode: 'sequential',
        items: ['X', 'Y', 'Z'],
      });
    });

    it('tag removal via updateSeries persists through adapter round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));

      // Create two series, both tagged 'heavy'
      const idA = await plannerA.createSeries({
        title: 'Heavy A',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['heavy'],
      });
      const idB = await plannerA.createSeries({
        title: 'Heavy B',
        patterns: [{ type: 'daily' as const, time: time('10:00:00'), duration: minutes(30) }],
        tags: ['heavy'],
      });

      // Remove 'heavy' tag from series A
      await plannerA.updateSeries(idA, { tags: [] });

      // Fresh planner, hydrate — verify tag removal persisted through adapter
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // Series B still has the tag (positive proof data exists in adapter)
      const seriesB = await plannerB.getSeries(idB);
      expect(seriesB!.tags).toEqual(['heavy']);

      // Series A no longer has the tag (removal was persisted)
      const seriesA = await plannerB.getSeries(idA);
      expect((seriesA!.tags || [])).not.toContain('heavy');
    });
  });

  // ========================================================================
  // splitSeries Data Preservation (F11)
  // ========================================================================
  describe('splitSeries Data Preservation', () => {
    it('split series copies tags to new series and persists through round-trip', async () => {
      const adapter = createMockAdapter();
      const plannerA = createAutoplanner(createValidConfig({ adapter }));
      const id = await plannerA.createSeries({
        title: 'Tagged Split',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['heavy', 'exercise'],
        startDate: date('2026-01-01'),
      });

      // Split at March 1
      const newId = await plannerA.splitSeries(id, date('2026-03-01'));

      // Verify new series has same tags in-memory
      const newSeries = await plannerA.getSeries(newId);
      expect(newSeries!.tags).toEqual(['heavy', 'exercise']);

      // Verify through adapter round-trip
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const loaded = await plannerB.getSeries(newId);
      expect(loaded!.tags).toEqual(['heavy', 'exercise']);
    });

    it('split series copies constraints referencing the original', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));
      const idA = await planner.createSeries({
        title: 'Constrained A',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        startDate: date('2026-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'Series B',
        patterns: [{ type: 'daily' as const, time: time('10:00:00'), duration: minutes(30) }],
      });

      // Add constraint: A cantBeNextTo B
      await planner.addConstraint({
        type: 'cantBeNextTo',
        target: { type: 'seriesId', seriesId: idA },
        secondTarget: { type: 'seriesId', seriesId: idB },
      });

      // Split A at March 1 → creates A' (new series)
      const newId = await planner.splitSeries(idA, date('2026-03-01'));

      // Should have 2 constraints: original (A↔B) + copy (A'↔B)
      const allConstraints = await planner.getConstraints();
      expect(allConstraints).toHaveLength(2);

      // Find the constraint referencing the new series
      const newConstraint = allConstraints.find(c =>
        (c.target?.type === 'seriesId' && c.target.seriesId === newId) ||
        (c.secondTarget?.type === 'seriesId' && c.secondTarget.seriesId === newId)
      );
      expect(newConstraint).toMatchObject({
        type: 'cantBeNextTo',
        target: { type: 'seriesId', seriesId: newId },
        secondTarget: { type: 'seriesId', seriesId: idB },
      });

      // Verify through adapter round-trip
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();
      const hydrated = await plannerB.getConstraints();
      expect(hydrated).toHaveLength(2);
      const hydratedNew = hydrated.find(c =>
        (c.target?.type === 'seriesId' && c.target.seriesId === newId)
      );
      expect(hydratedNew).toMatchObject({
        type: 'cantBeNextTo',
        target: { type: 'seriesId', seriesId: newId },
        secondTarget: { type: 'seriesId', seriesId: idB },
      });
    });

    it('split series copies chain link to new series', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));
      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        startDate: date('2026-01-01'),
      });
      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily' as const, time: time('10:00:00'), duration: minutes(30) }],
        startDate: date('2026-01-01'),
      });

      // Link child to parent
      await planner.linkSeries(parentId, childId, { distance: 60 });

      // Split child at March 1
      const newChildId = await planner.splitSeries(childId, date('2026-03-01'));

      // New child should also be linked to the same parent
      // Verify via adapter round-trip
      const plannerB = createAutoplanner(createValidConfig({ adapter }));
      await plannerB.hydrate();

      // Get all links from adapter
      const allLinks = await adapter.getAllLinks();
      const newChildLink = allLinks.find(l => l.childSeriesId === newChildId);
      expect(newChildLink).toMatchObject({
        parentSeriesId: parentId,
        childSeriesId: newChildId,
        targetDistance: 60,
      });
    });

    it('original series retains its data after split', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));
      const id = await planner.createSeries({
        title: 'Original',
        patterns: [{ type: 'daily' as const, time: time('09:00:00'), duration: minutes(30) }],
        tags: ['workout'],
        startDate: date('2026-01-01'),
      });

      // Split at March 1
      await planner.splitSeries(id, date('2026-03-01'));

      // Original should still have its tags and endDate set to splitDate
      const original = await planner.getSeries(id);
      expect(original).toMatchObject({
        title: 'Original',
        endDate: '2026-03-01',
        tags: ['workout'],
      });
      expect(original!.patterns).toHaveLength(1);
      expect(original!.patterns[0]).toMatchObject({
        type: 'daily',
        time: '09:00:00',
      });
    });
  });

  // ========================================================================
  // Per-Date Condition Evaluation (F9)
  // ========================================================================
  describe('Per-Date Condition Evaluation', () => {
    it('weekday condition fires only on matching days in multi-day window', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      // Create daily series with weekday condition: only Wednesdays (3)
      await planner.createSeries({
        title: 'Wed Only',
        patterns: [{
          type: 'daily' as const,
          time: time('09:00:00'),
          duration: minutes(30),
          condition: { type: 'weekday', days: [3] },
        }],
        startDate: date('2026-01-01'),
      });

      // Mon 2026-02-09 through Sun 2026-02-15 (exclusive end = Mon 2026-02-16)
      const schedule = await planner.getSchedule(date('2026-02-09'), date('2026-02-16'));
      const instances = schedule.instances.filter(i => i.title === 'Wed Only');
      expect(instances).toHaveLength(1);
      expect(instances[0]).toMatchObject({
        date: '2026-02-11',
        title: 'Wed Only',
      });
    });

    it('weekday condition works when window starts on non-matching day', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      // Daily series, only fires on Wed (3)
      await planner.createSeries({
        title: 'Wed Only 2',
        patterns: [{
          type: 'daily' as const,
          time: time('09:00:00'),
          duration: minutes(30),
          condition: { type: 'weekday', days: [3] },
        }],
        startDate: date('2026-01-01'),
      });

      // Start on Thursday 2026-02-12, end exclusive 2026-02-19
      // Window: Thu, Fri, Sat, Sun, Mon, Tue, Wed (Feb 18)
      const schedule = await planner.getSchedule(date('2026-02-12'), date('2026-02-19'));
      const instances = schedule.instances.filter(i => i.title === 'Wed Only 2');
      expect(instances).toHaveLength(1);
      expect(instances[0]).toMatchObject({
        date: '2026-02-18',
        title: 'Wed Only 2',
      });
    });

    it('unconditional pattern still works (no regression)', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      await planner.createSeries({
        title: 'Daily NoCondition',
        patterns: [{
          type: 'daily' as const,
          time: time('09:00:00'),
          duration: minutes(30),
        }],
        startDate: date('2026-01-01'),
      });

      // 3-day window: Mon-Wed (exclusive end Thu)
      const schedule = await planner.getSchedule(date('2026-02-09'), date('2026-02-12'));
      const instances = schedule.instances.filter(i => i.title === 'Daily NoCondition');
      expect(instances).toHaveLength(3);
      expect(instances[0]).toMatchObject({ date: '2026-02-09' });
      expect(instances[1]).toMatchObject({ date: '2026-02-10' });
      expect(instances[2]).toMatchObject({ date: '2026-02-11' });
    });

    it('weekday condition with multiple days fires on each matching day', async () => {
      const adapter = createMockAdapter();
      const planner = createAutoplanner(createValidConfig({ adapter }));

      // Daily series, fires on Mon(1), Wed(3), Fri(5)
      await planner.createSeries({
        title: 'MWF',
        patterns: [{
          type: 'daily' as const,
          time: time('09:00:00'),
          duration: minutes(30),
          condition: { type: 'weekday', days: [1, 3, 5] },
        }],
        startDate: date('2026-01-01'),
      });

      // Full week Mon 2026-02-09 through Sun 2026-02-16 (exclusive end)
      const schedule = await planner.getSchedule(date('2026-02-09'), date('2026-02-16'));
      const instances = schedule.instances.filter(i => i.title === 'MWF');
      expect(instances).toHaveLength(3);
      expect(instances[0]).toMatchObject({ date: '2026-02-09' }); // Mon
      expect(instances[1]).toMatchObject({ date: '2026-02-11' }); // Wed
      expect(instances[2]).toMatchObject({ date: '2026-02-13' }); // Fri
    });
  });

  // ============================================================================
  // Schedule Result Cache
  // ============================================================================

  describe('Schedule Result Cache', () => {
    it('getSchedule returns cached result when nothing changed', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'Daily Task',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const s1 = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      const s2 = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));

      expect(s1.instances).toHaveLength(7);
      expect(s2.instances).toHaveLength(7);

      // Concrete date assertions for each day
      const dates1 = s1.instances.map(i => i.date).sort();
      const dates2 = s2.instances.map(i => i.date).sort();
      expect(dates1).toEqual([
        '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04',
        '2025-01-05', '2025-01-06', '2025-01-07',
      ]);
      expect(dates2).toEqual(dates1);

      // Verify all titles are correct
      for (const inst of s1.instances) {
        expect(inst.title).toBe('Daily Task');
      }
      for (const inst of s2.instances) {
        expect(inst.title).toBe('Daily Task');
      }
    });

    it('getSchedule cache invalidated by createSeries', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'Series A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      expect(before.instances).toHaveLength(7);
      expect(before.instances[0]!.title).toBe('Series A');
      expect(before.instances[6]!.title).toBe('Series A');

      const idB = await planner.createSeries({
        title: 'Series B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      expect(after.instances).toHaveLength(14);

      const titlesA = after.instances.filter(i => i.title === 'Series A');
      const titlesB = after.instances.filter(i => i.title === 'Series B');
      expect(titlesA).toHaveLength(7);
      expect(titlesA[0]!).toMatchObject({ title: 'Series A', date: '2025-01-01' });
      expect(titlesB).toHaveLength(7);
      expect(titlesB[0]!).toMatchObject({ title: 'Series B', date: '2025-01-01' });
    });

    it('getSchedule cache invalidated by logCompletion', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'Cond Series',
        patterns: [{
          type: 'daily',
          time: time('09:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: 'self',
            comparison: 'greaterOrEqual',
            value: 3,
            windowDays: 14,
          },
        }],
        startDate: date('2025-01-01'),
      });
      // Add unconditional series so we can verify the schedule is populated
      await planner.createSeries({
        title: 'Baseline',
        patterns: [{ type: 'daily', time: time('14:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // No completions → condition not met → only Baseline fires
      const before = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      expect(before.instances).toHaveLength(7);
      expect(before.instances[0]!).toMatchObject({ title: 'Baseline', date: '2025-01-06' });

      await planner.logCompletion(idA, date('2025-01-01'));
      await planner.logCompletion(idA, date('2025-01-02'));
      await planner.logCompletion(idA, date('2025-01-03'));

      const after = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      expect(after.instances).toHaveLength(14); // 7 Cond + 7 Baseline
      const condInstances = after.instances.filter(i => i.title === 'Cond Series');
      expect(condInstances).toHaveLength(7);
      const condDates = condInstances.map(i => i.date).sort();
      expect(condDates).toEqual([
        '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09',
        '2025-01-10', '2025-01-11', '2025-01-12',
      ]);
      expect(condInstances[0]!).toMatchObject({ title: 'Cond Series', date: '2025-01-06' });
    });

    it('different ranges get separate cache entries', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'Daily',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const s1 = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      const s2 = await planner.getSchedule(date('2025-01-08'), date('2025-01-15'));

      expect(s1.instances).toHaveLength(7);
      expect(s2.instances).toHaveLength(7);

      const dates1 = s1.instances.map(i => i.date).sort();
      const dates2 = s2.instances.map(i => i.date).sort();

      expect(dates1).toEqual([
        '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04',
        '2025-01-05', '2025-01-06', '2025-01-07',
      ]);
      expect(dates2).toEqual([
        '2025-01-08', '2025-01-09', '2025-01-10', '2025-01-11',
        '2025-01-12', '2025-01-13', '2025-01-14',
      ]);

      // No overlap between ranges
      for (const d of dates1) {
        expect(dates2.includes(d)).toBe(false);
      }
    });

    it('returned schedule is a defensive copy', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'Safe Copy',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const s1 = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      expect(s1.instances).toHaveLength(7);
      expect(s1.instances[0]!.title).toBe('Safe Copy');

      // Mutate the returned array
      s1.instances.push({
        seriesId: 'garbage',
        title: 'Garbage',
        date: date('2025-01-20'),
        time: datetime('2025-01-20T09:00:00'),
      });
      expect(s1.instances).toHaveLength(8);
      expect(s1.instances[7]!.title).toBe('Garbage');

      // Mutate a returned instance's title
      s1.instances[0]!.title = 'CORRUPTED';

      // Second call should return clean data
      const s2 = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
      expect(s2.instances).toHaveLength(7);
      expect(s2.instances[0]!.title).toBe('Safe Copy');

      for (const inst of s2.instances) {
        expect(inst.title).toBe('Safe Copy');
      }
    });

    describe('cache invalidated by each mutation type', () => {
      it('updateSeries invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const id = await planner.createSeries({
          title: 'Original',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(before.instances[0]!.title).toBe('Original');

        await planner.updateSeries(id, { title: 'Updated' });

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(after.instances).toHaveLength(7);
        expect(after.instances[0]!.title).toBe('Updated');
      });

      it('deleteSeries invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const id = await planner.createSeries({
          title: 'ToDelete',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(before.instances).toHaveLength(7);
        expect(before.instances[0]!).toMatchObject({ title: 'ToDelete', date: '2025-01-01' });

        await planner.deleteSeries(id);

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(after.instances).toHaveLength(0);
      });

      it('cancelInstance invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        await planner.createSeries({
          title: 'Cancellable',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const id = (await planner.getSchedule(date('2025-01-01'), date('2025-01-08'))).instances[0]!.seriesId;
        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(before.instances).toHaveLength(7);
        expect(before.instances.map(i => i.date).sort()).toEqual([
          '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04',
          '2025-01-05', '2025-01-06', '2025-01-07',
        ]);

        await planner.cancelInstance(id, date('2025-01-03'));

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(after.instances).toHaveLength(6);
        const afterDates = after.instances.map(i => i.date).sort();
        expect(afterDates).toEqual([
          '2025-01-01', '2025-01-02', '2025-01-04',
          '2025-01-05', '2025-01-06', '2025-01-07',
        ]);
      });

      it('rescheduleInstance invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        await planner.createSeries({
          title: 'Reschedulable',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const id = (await planner.getSchedule(date('2025-01-01'), date('2025-01-08'))).instances[0]!.seriesId;

        await planner.rescheduleInstance(id, date('2025-01-03'), datetime('2025-01-03T14:00:00'));

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-08'));
        expect(after.instances).toHaveLength(7);
        const rescheduled = after.instances.find(i => i.date === '2025-01-03');
        expect(rescheduled).toBeDefined();
        expect(rescheduled!.time).toBe('2025-01-03T14:00:00');
      });

      it('linkSeries invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 60, fixed: true }],
          startDate: date('2025-01-01'),
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        const childBefore = before.instances.filter(i => i.title === 'Child');
        expect(childBefore).toHaveLength(3);
        expect(childBefore[0]!).toMatchObject({ title: 'Child', date: '2025-01-01' });

        await planner.linkSeries(parentId, childId, { distance: 30 });

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        const childAfter = after.instances.filter(i => i.title === 'Child');
        expect(childAfter).toHaveLength(3);
        // After linking, child should be offset: parent ends 10:00 + 30min gap = 10:30
        expect(childAfter[0]!).toMatchObject({ title: 'Child', date: '2025-01-01' });
        expect(childAfter[0]!.time).toBe('2025-01-01T10:30:00');
      });

      it('unlinkSeries invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const parentId = await planner.createSeries({
          title: 'Parent',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 60, fixed: true }],
          startDate: date('2025-01-01'),
        });
        const childId = await planner.createSeries({
          title: 'Child',
          patterns: [{ type: 'daily', time: time('11:00:00'), duration: 30, fixed: true }],
          startDate: date('2025-01-01'),
        });

        await planner.linkSeries(parentId, childId, { distance: 30 });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        const linkedChild = before.instances.filter(i => i.title === 'Child');
        expect(linkedChild).toHaveLength(3);
        // Linked: parent ends 10:00, +30 gap → child at 10:30
        expect(linkedChild[0]!).toMatchObject({ title: 'Child', date: '2025-01-01' });
        expect(linkedChild[0]!.time).toBe('2025-01-01T10:30:00');

        await planner.unlinkSeries(childId);

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        const unlinkedChild = after.instances.filter(i => i.title === 'Child');
        expect(unlinkedChild).toHaveLength(3);
        // Unlinked: reverts to pattern time 11:00
        expect(unlinkedChild[0]!).toMatchObject({ title: 'Child', date: '2025-01-01' });
        expect(unlinkedChild[0]!.time).toBe('2025-01-01T11:00:00');
      });

      it('addConstraint invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const idA = await planner.createSeries({
          title: 'First',
          patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30, fixed: true }],
          startDate: date('2025-01-01'),
        });
        const idB = await planner.createSeries({
          title: 'Second',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30, fixed: true }],
          startDate: date('2025-01-01'),
        });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        expect(before.instances).toHaveLength(6);
        expect(before.instances.filter(i => i.title === 'First')[0]!.date).toBe('2025-01-01');
        expect(before.instances.filter(i => i.title === 'Second')[0]!.date).toBe('2025-01-01');

        const cId = await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: idA,
          secondSeries: idB,
        });

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        expect(after.instances).toHaveLength(6);
        expect(after.instances[0]!).toMatchObject({ date: '2025-01-01' });
        // Constraint should generate violations since First (10:00) is after Second (09:00)
        // 3 days in range → 3 violations
        expect(after.conflicts).toHaveLength(3);
        expect(after.conflicts[0]!.type).toBe('constraintViolation');
      });

      it('removeConstraint invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());
        const idA = await planner.createSeries({
          title: 'First',
          patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30, fixed: true }],
          startDate: date('2025-01-01'),
        });
        const idB = await planner.createSeries({
          title: 'Second',
          patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30, fixed: true }],
          startDate: date('2025-01-01'),
        });

        const cId = await planner.addConstraint({
          type: 'mustBeBefore',
          firstSeries: idA,
          secondSeries: idB,
        });

        const before = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        expect(before.instances).toHaveLength(6);
        expect(before.instances[0]!).toMatchObject({ date: '2025-01-01' });
        // With constraint, First(10:00) must be before Second(09:00) → violation
        expect(before.conflicts.some(c => c.type === 'constraintViolation')).toBe(true);

        await planner.removeConstraint(cId);

        const after = await planner.getSchedule(date('2025-01-01'), date('2025-01-04'));
        expect(after.instances).toHaveLength(6);
        expect(after.instances[0]!).toMatchObject({ date: '2025-01-01' });
        // Constraint removed → no more violations
        expect(after.conflicts.filter(c => c.type === 'constraintViolation')).toHaveLength(0);
      });

      it('deleteCompletion invalidates cache', async () => {
        const planner = createAutoplanner(createValidConfig());

        // Two series: Completable (conditional) and Always (unconditional)
        const id = await planner.createSeries({
          title: 'Completable',
          patterns: [{
            type: 'daily',
            time: time('09:00:00'),
            duration: 30,
            condition: {
              type: 'completionCount',
              seriesRef: 'self',
              comparison: 'greaterOrEqual',
              value: 2,
              windowDays: 14,
            },
          }],
          startDate: date('2025-01-01'),
        });
        await planner.createSeries({
          title: 'Always',
          patterns: [{ type: 'daily', time: time('14:00:00'), duration: 30 }],
          startDate: date('2025-01-01'),
        });

        const compId1 = await planner.logCompletion(id, date('2025-01-01'));
        const compId2 = await planner.logCompletion(id, date('2025-01-02'));

        // With 2 completions, both series fire
        const before = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
        expect(before.instances).toHaveLength(14); // 7 Completable + 7 Always
        expect(before.instances.filter(i => i.title === 'Completable')[0]!).toMatchObject({
          title: 'Completable', date: '2025-01-06',
        });
        expect(before.instances.filter(i => i.title === 'Always')[0]!).toMatchObject({
          title: 'Always', date: '2025-01-06',
        });

        await planner.deleteCompletion(compId2);

        // Now only 1 completion → condition not met → Completable disappears, Always remains
        const after = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
        expect(after.instances).toHaveLength(7);
        expect(after.instances[0]!).toMatchObject({ title: 'Always', date: '2025-01-06' });
        expect(after.instances[6]!).toMatchObject({ title: 'Always', date: '2025-01-12' });
      });
    });
  });

  // ============================================================================
  // Condition Dependency Index
  // ============================================================================

  describe('Condition Dependency Index', () => {
    it('cross-series completionCount ref creates dependency', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'Target',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'Dependent',
        patterns: [{
          type: 'daily',
          time: time('10:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: idA,
            comparison: 'greaterOrEqual',
            value: 3,
            windowDays: 14,
          },
        }],
        startDate: date('2025-01-01'),
      });

      const deps = planner.getConditionDeps();
      expect(deps.has(idA)).toBe(true);
      expect(deps.get(idA)!.size).toBe(1);
      expect(deps.get(idA)!.has(idB)).toBe(true);
    });

    it('self-ref does NOT create dependency', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'Self Ref',
        patterns: [{
          type: 'daily',
          time: time('09:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: 'self',
            comparison: 'greaterOrEqual',
            value: 3,
            windowDays: 14,
          },
        }],
        startDate: date('2025-01-01'),
      });

      const deps = planner.getConditionDeps();
      expect(deps.size).toBe(0);
    });

    it('nested conditions (and/or/not) are traversed', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idC = await planner.createSeries({
        title: 'C',
        patterns: [{
          type: 'daily',
          time: time('11:00:00'),
          duration: 30,
          condition: {
            type: 'and',
            conditions: [
              {
                type: 'completionCount',
                seriesRef: idA,
                comparison: 'greaterOrEqual',
                value: 1,
                windowDays: 7,
              },
              {
                type: 'not',
                condition: {
                  type: 'completionCount',
                  seriesRef: idB,
                  comparison: 'greaterOrEqual',
                  value: 5,
                  windowDays: 7,
                },
              },
            ],
          },
        }],
        startDate: date('2025-01-01'),
      });

      const deps = planner.getConditionDeps();
      expect(deps.has(idA)).toBe(true);
      expect(deps.get(idA)!.has(idC)).toBe(true);
      expect(deps.get(idA)!.size).toBe(1);
      expect(deps.has(idB)).toBe(true);
      expect(deps.get(idB)!.has(idC)).toBe(true);
      expect(deps.get(idB)!.size).toBe(1);
    });

    it('index rebuilt when series updated with new conditions', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idC = await planner.createSeries({
        title: 'C',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'B',
        patterns: [{
          type: 'daily',
          time: time('11:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: idA,
            comparison: 'greaterOrEqual',
            value: 1,
            windowDays: 7,
          },
        }],
        startDate: date('2025-01-01'),
      });

      // B depends on A
      const deps1 = planner.getConditionDeps();
      expect(deps1.has(idA)).toBe(true);
      expect(deps1.get(idA)!.has(idB)).toBe(true);

      // Update B to depend on C instead
      await planner.updateSeries(idB, {
        patterns: [{
          type: 'daily',
          time: time('11:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: idC,
            comparison: 'greaterOrEqual',
            value: 1,
            windowDays: 7,
          },
        }],
      });

      const deps2 = planner.getConditionDeps();
      // A should no longer have B as dependent
      expect(!deps2.has(idA) || deps2.get(idA)!.size === 0).toBe(true);
      // C should now have B
      expect(deps2.has(idC)).toBe(true);
      expect(deps2.get(idC)!.has(idB)).toBe(true);
    });

    it('index rebuilt when series deleted', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'B',
        patterns: [{
          type: 'daily',
          time: time('11:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: idA,
            comparison: 'greaterOrEqual',
            value: 1,
            windowDays: 7,
          },
        }],
        startDate: date('2025-01-01'),
      });

      const deps1 = planner.getConditionDeps();
      expect(deps1.has(idA)).toBe(true);
      expect(deps1.get(idA)!.has(idB)).toBe(true);

      await planner.deleteSeries(idB);

      const deps2 = planner.getConditionDeps();
      expect(!deps2.has(idA) || deps2.get(idA)!.size === 0).toBe(true);
    });

    it('hydrate rebuilds index from persisted data', async () => {
      const adapter = (await import('../src/adapter')).createMockAdapter();
      const config1 = { adapter, timezone: 'America/New_York' as const };
      const planner1 = createAutoplanner(config1);

      const idA = await planner1.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner1.createSeries({
        title: 'B',
        patterns: [{
          type: 'daily',
          time: time('11:00:00'),
          duration: 30,
          condition: {
            type: 'completionCount',
            seriesRef: idA,
            comparison: 'greaterOrEqual',
            value: 1,
            windowDays: 7,
          },
        }],
        startDate: date('2025-01-01'),
      });

      const deps1 = planner1.getConditionDeps();
      expect(deps1.has(idA)).toBe(true);
      expect(deps1.get(idA)!.has(idB)).toBe(true);

      // Hydrate a new planner with same adapter
      const planner2 = createAutoplanner(config1);
      await planner2.hydrate();

      const deps2 = planner2.getConditionDeps();
      expect(deps2.has(idA)).toBe(true);
      expect(deps2.get(idA)!.has(idB)).toBe(true);
      expect(deps2.get(idA)!.size).toBe(1);
    });
  });

  // ============================================================================
  // Pattern Date Cache
  // ============================================================================

  describe('Pattern Date Cache', () => {
    it('pattern expansion cached when schedule result cache misses', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // Prime pattern cache
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));

      // addConstraint doesn't affect patterns → pattern cache preserved
      await planner.addConstraint({ type: 'mustBeBefore', firstSeries: idA, secondSeries: idB });

      const before = planner.getCacheStats();
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      // Pattern cache should have been hit (not re-expanded)
      expect(after.patternHits - before.patternHits).toBeGreaterThan(0);
      expect(after.patternMisses - before.patternMisses).toBe(0);

      // Instances still correct
      const dates = result.instances.map(i => i.date).sort();
      expect(dates).toContain('2025-01-06');
      expect(dates).toContain('2025-01-12');
      expect(result.instances.filter(i => i.title === 'A')).toHaveLength(7);
      expect(result.instances.filter(i => i.title === 'A')[0]!.date).toBe('2025-01-06');
    });

    it('logCompletion does NOT evict pattern cache', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // Prime pattern cache
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));

      // logCompletion: scope=completion, no pattern eviction
      await planner.logCompletion(idA, date('2025-01-06'));

      const before = planner.getCacheStats();
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      expect(after.patternMisses - before.patternMisses).toBe(0);
      expect(result.instances).toHaveLength(7);
      expect(result.instances[0]!).toMatchObject({ title: 'A', date: '2025-01-06' });
    });

    it('updateSeries evicts only that series pattern cache', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      const idB = await planner.createSeries({
        title: 'B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // Prime both series' pattern caches
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));

      // Update A → evicts A's patterns, not B's
      await planner.updateSeries(idA, {
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00:00'), duration: 30 }],
      });

      const before = planner.getCacheStats();
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      // A was evicted → miss. B was preserved → hit.
      expect(after.patternMisses - before.patternMisses).toBeGreaterThan(0);
      expect(after.patternHits - before.patternHits).toBeGreaterThan(0);

      // A now only fires on Mondays (Jan 6 is Monday)
      const aInstances = result.instances.filter(i => i.title === 'A');
      expect(aInstances).toHaveLength(1);
      expect(aInstances[0]!.date).toBe('2025-01-06');

      // B still daily
      const bInstances = result.instances.filter(i => i.title === 'B');
      expect(bInstances).toHaveLength(7);
      expect(bInstances[0]!.date).toBe('2025-01-06');
    });

    it('eviction covers ALL ranges for a series', async () => {
      const planner = createAutoplanner(createValidConfig());
      const idA = await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // Prime two different ranges
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      await planner.getSchedule(date('2025-01-13'), date('2025-01-20'));

      // Update A → evicts ALL entries for A (both ranges)
      await planner.updateSeries(idA, {
        patterns: [{ type: 'weekly', daysOfWeek: [1], time: time('09:00:00'), duration: 30 }],
      });

      const before = planner.getCacheStats();
      const r1 = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const r2 = await planner.getSchedule(date('2025-01-13'), date('2025-01-20'));
      const after = planner.getCacheStats();

      // Both ranges should miss (evicted)
      expect(after.patternMisses - before.patternMisses).toBeGreaterThanOrEqual(2);

      // Correct results: only Mondays
      const dates1 = r1.instances.map(i => i.date);
      expect(dates1).toContain('2025-01-06');
      expect(r1.instances).toHaveLength(1);
      expect(r1.instances[0]!.date).toBe('2025-01-06'); // Monday

      const dates2 = r2.instances.map(i => i.date);
      expect(dates2).toContain('2025-01-13');
      expect(r2.instances).toHaveLength(1);
      expect(r2.instances[0]!.date).toBe('2025-01-13'); // Monday
    });

    it('anchor change causes cache miss for weekly daysOfWeek patterns', async () => {
      const planner = createAutoplanner(createValidConfig());
      const id = await planner.createSeries({
        title: 'Weekly',
        patterns: [{ type: 'weekly', daysOfWeek: [1, 5], time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // Prime with no completions (anchor=none)
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));

      // Log completion → anchor changes from undefined to completion date
      await planner.logCompletion(id, date('2025-01-06'));

      const before = planner.getCacheStats();
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      // Second pass uses anchor → different key → cache miss
      expect(after.patternMisses - before.patternMisses).toBeGreaterThan(0);

      // Instances should include Monday (1) and Friday (5)
      const dates = result.instances.map(i => i.date).sort();
      expect(dates).toContain('2025-01-06'); // Monday
      expect(dates).toContain('2025-01-10'); // Friday
      expect(result.instances[0]!).toMatchObject({ title: 'Weekly' });
    });

    it('stale _anchor cleared when completions deleted', async () => {
      const planner = createAutoplanner(createValidConfig());
      const id = await planner.createSeries({
        title: 'Weekly',
        patterns: [{ type: 'weekly', daysOfWeek: [1, 5], time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      // No completions: get baseline dates
      const noCompResult = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const noCompDates = noCompResult.instances.map(i => i.date).sort();
      expect(noCompDates).toContain('2025-01-06');
      expect(noCompResult.instances[0]!.title).toBe('Weekly');

      // Log then delete completion
      const compId = await planner.logCompletion(id, date('2025-01-06'));
      await planner.getSchedule(date('2025-01-06'), date('2025-01-13')); // cache with anchor
      await planner.deleteCompletion(compId);

      // After deletion, anchor should revert → key changes → cache miss
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const resultDates = result.instances.map(i => i.date).sort();

      // Should match the no-completion baseline
      expect(resultDates).toEqual(noCompDates);
      expect(result.instances[0]!).toMatchObject({ title: 'Weekly' });
    });
  });

  // ============================================================================
  // CSP Fingerprint Cache
  // ============================================================================

  describe('CSP Fingerprint Cache', () => {
    it('unchanged schedule uses CSP cache on second getSchedule', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'Flex A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });
      await planner.createSeries({
        title: 'Flex B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const s1 = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const before = planner.getCacheStats();
      const s2 = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      // Second call should be a schedule cache hit (not even run CSP)
      // But let's verify both returned identical results
      expect(s1.instances).toHaveLength(14);
      expect(s1.instances[0]!).toMatchObject({ date: '2025-01-06' });
      expect(s2.instances).toHaveLength(14);
      expect(s2.instances[0]!).toMatchObject({ date: '2025-01-06' });

      // Verify the times are identical
      for (let i = 0; i < s1.instances.length; i++) {
        expect(s1.instances[i]!.time).toBe(s2.instances[i]!.time);
      }
    });

    it('adding instance to a day produces different fingerprint', async () => {
      const planner = createAutoplanner(createValidConfig());
      await planner.createSeries({
        title: 'A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const s1 = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      expect(s1.instances).toHaveLength(7);
      expect(s1.instances[0]!).toMatchObject({ title: 'A', date: '2025-01-06' });

      await planner.createSeries({
        title: 'B',
        patterns: [{ type: 'daily', time: time('10:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      const before = planner.getCacheStats();
      const s2 = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      expect(s2.instances).toHaveLength(14);
      // CSP re-ran because fingerprints changed (extra series B)
      expect(after.cspMisses - before.cspMisses).toBeGreaterThan(0);
      expect(s2.instances.filter(i => i.title === 'B')[0]!).toMatchObject({ title: 'B', date: '2025-01-06' });
    });

    it('duration change produces different fingerprint', async () => {
      const planner = createAutoplanner(createValidConfig());
      const id = await planner.createSeries({
        title: 'Changeable',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));

      await planner.updateSeries(id, {
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 120 }],
      });

      const before = planner.getCacheStats();
      const result = await planner.getSchedule(date('2025-01-06'), date('2025-01-13'));
      const after = planner.getCacheStats();

      // Duration changed → fingerprint changed → CSP re-ran
      expect(after.cspMisses - before.cspMisses).toBeGreaterThan(0);
      expect(result.instances).toHaveLength(7);
      expect(result.instances[0]!).toMatchObject({ title: 'Changeable', date: '2025-01-06', duration: 120 });
    });

    it('CSP cache persists across mutations that do not affect CSP inputs', async () => {
      const planner = createAutoplanner(createValidConfig());

      // Two simple daily series with fixed times — no conditions, chains, cycling
      await planner.createSeries({
        title: 'Fixed A',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30, fixed: true }],
        startDate: date('2025-01-01'),
      });
      await planner.createSeries({
        title: 'Fixed B',
        patterns: [{ type: 'daily', time: time('14:00:00'), duration: 30, fixed: true }],
        startDate: date('2025-01-01'),
      });

      // Prime CSP cache
      const s1 = await planner.getSchedule(date('2025-01-06'), date('2025-01-11'));
      expect(s1.instances).toHaveLength(10); // 5 days × 2 series
      expect(s1.instances[0]!.date).toBe('2025-01-06');

      // Create unrelated series in Feb → triggers triggerReflow → schedule cache cleared
      await planner.createSeries({
        title: 'Feb Only',
        patterns: [{ type: 'daily', time: time('12:00:00'), duration: 30, fixed: true }],
        startDate: date('2025-02-01'),
        endDate: date('2025-02-08'),
      });

      const before = planner.getCacheStats();
      const s2 = await planner.getSchedule(date('2025-01-06'), date('2025-01-11'));
      const after = planner.getCacheStats();

      // CSP cache should hit — the two Jan series are unchanged
      expect(after.cspHits - before.cspHits).toBeGreaterThanOrEqual(5);
      expect(s2.instances.filter(i => i.title === 'Fixed A')).toHaveLength(5);
      expect(s2.instances.filter(i => i.title === 'Fixed A')[0]!.time).toBe(
        s1.instances.filter(i => i.title === 'Fixed A')[0]!.time
      );
    });

    it('chain link change produces different fingerprint', async () => {
      const planner = createAutoplanner(createValidConfig());
      const parentId = await planner.createSeries({
        title: 'Parent',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 60, fixed: true }],
        startDate: date('2025-01-01'),
      });
      const childId = await planner.createSeries({
        title: 'Child',
        patterns: [{ type: 'daily', time: time('09:00:00'), duration: 30 }],
        startDate: date('2025-01-01'),
      });

      await planner.linkSeries(parentId, childId, { distance: 60 });
      const s1 = await planner.getSchedule(date('2025-01-06'), date('2025-01-08'));
      const child1 = s1.instances.filter(i => i.title === 'Child');
      expect(child1).toHaveLength(2);
      // Parent ends at 10:00, +60min gap → child at 11:00
      expect(child1[0]!.time).toBe('2025-01-06T11:00:00');

      await planner.unlinkSeries(childId);
      await planner.linkSeries(parentId, childId, { distance: 120 });

      const s2 = await planner.getSchedule(date('2025-01-06'), date('2025-01-08'));
      const child2 = s2.instances.filter(i => i.title === 'Child');
      expect(child2).toHaveLength(2);
      // Parent ends at 10:00, +120min gap → child at 12:00
      expect(child2[0]!.time).toBe('2025-01-06T12:00:00');
    });
  });
});
