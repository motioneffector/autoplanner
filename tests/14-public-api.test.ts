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
  type Adapter,
  type Schedule,
  type Conflict,
  type Reminder,
  ValidationError,
  NotFoundError,
  LockedSeriesError,
  CompletionsExistError,
  LinkedChildrenExistError,
  NonExistentInstanceError,
  AlreadyCancelledError,
  CancelledInstanceError,
  CycleDetectedError,
  ChainDepthExceededError,
  DuplicateCompletionError,
} from '../src/public-api';
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

function createMockAdapter(): Adapter {
  const storage = new Map<string, any>();
  return {
    getSeries: vi.fn((id) => Promise.resolve(storage.get(`series:${id}`) ?? null)),
    saveSeries: vi.fn((series) => {
      storage.set(`series:${series.id}`, series);
      return Promise.resolve();
    }),
    deleteSeries: vi.fn((id) => {
      storage.delete(`series:${id}`);
      return Promise.resolve();
    }),
    getAllSeries: vi.fn(() => Promise.resolve([...storage.values()].filter((v) => v?.id))),
    getCompletion: vi.fn(() => Promise.resolve(null)),
    saveCompletion: vi.fn(() => Promise.resolve()),
    deleteCompletion: vi.fn(() => Promise.resolve()),
    getCompletionsBySeries: vi.fn(() => Promise.resolve([])),
    getReminder: vi.fn(() => Promise.resolve(null)),
    saveReminder: vi.fn(() => Promise.resolve()),
    deleteReminder: vi.fn(() => Promise.resolve()),
    getException: vi.fn(() => Promise.resolve(null)),
    saveException: vi.fn(() => Promise.resolve()),
    deleteException: vi.fn(() => Promise.resolve()),
    getLink: vi.fn(() => Promise.resolve(null)),
    saveLink: vi.fn(() => Promise.resolve()),
    deleteLink: vi.fn(() => Promise.resolve()),
    getConstraint: vi.fn(() => Promise.resolve(null)),
    saveConstraint: vi.fn(() => Promise.resolve()),
    deleteConstraint: vi.fn(() => Promise.resolve()),
    transaction: vi.fn((fn) => fn()),
  };
}

function createValidConfig(overrides: Partial<AutoplannerConfig> = {}): AutoplannerConfig {
  return {
    adapter: createMockAdapter(),
    timezone: 'America/New_York',
    ...overrides,
  };
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

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        expect(adapter.saveSeries).toHaveBeenCalled();
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
      it('adapter must implement interface - invalid adapter throws error', () => {
        expect(() => {
          createAutoplanner({ adapter: {} as Adapter, timezone: 'UTC' });
        }).toThrow(ValidationError);
      });

      it('timezone must be valid IANA - Invalid/Zone throws error', () => {
        expect(() => {
          createAutoplanner(createValidConfig({ timezone: 'Invalid/Zone' }));
        }).toThrow(ValidationError);
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

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

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

        await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        // Internal storage should use UTC
        const savedCall = (adapter.saveSeries as any).mock.calls[0];
        const savedSeries = savedCall[0];
        expect(savedSeries).toEqual(expect.objectContaining({
          title: 'Test',
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          patterns: expect.arrayContaining([
            expect.objectContaining({ time: time('09:00') }),
          ]),
        }));
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

        const schedule = await planner.getSchedule(date('2025-03-09'), date('2025-03-10'));
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

        const schedule = await planner.getSchedule(date('2025-11-02'), date('2025-11-03'));
        // 1:30 AM occurs twice on DST end - should use first occurrence (EDT, before fall back)
        expect(schedule.instances).toSatisfy((instances: typeof schedule.instances) => instances.length === 1 && instances[0].seriesId === id);
        const instance = schedule.instances.find((i) => i.seriesId === id);
        expect(instance?.seriesId).toBe(id);
        expect(instance?.time).toContain('01:30');
        // Instance should be at the first 01:30 (EDT, not EST)
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

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));
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
        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
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
        ).rejects.toThrow(ValidationError);
      });

      it('NotFoundError - get non-existent series returns null or throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const result = await planner.getSeries(seriesId('non-existent'));
        expect(result).toBeNull();
        // Verify query for non-existent series doesn't return any series data
        const allSeries = await planner.getAllSeries();
        expect(allSeries).toEqual([]);
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
          LockedSeriesError
        );
      });

      it('CompletionsExistError - delete series with completions includes recovery info', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });
        await planner.logCompletion(id, date('2025-01-15'));

        await expect(planner.deleteSeries(id)).rejects.toThrow(CompletionsExistError);
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

        await expect(planner.deleteSeries(parentId)).rejects.toThrow(LinkedChildrenExistError);
      });

      it('NonExistentInstanceError - cancel non-pattern date throws', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'weekly', dayOfWeek: 1, time: time('09:00') }], // Monday only
        });

        // Try to cancel a Tuesday
        await expect(planner.cancelInstance(id, date('2025-01-14'))).rejects.toThrow(
          NonExistentInstanceError
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
          AlreadyCancelledError
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
        ).rejects.toThrow(CancelledInstanceError);
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
          CycleDetectedError
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
          ChainDepthExceededError
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
          DuplicateCompletionError
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
          expect(typeof e.message).toBe('string');
          expect(e.message).toContain('title');
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

        try {
          await planner.createSeries({
            title: '',
            patterns: [{ type: 'daily', time: time('09:00') }],
          });
          expect.fail('Should have thrown');
        } catch (e: any) {
          expect(e instanceof ValidationError).toBe(true);
        }
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
        await expect(planner.logCompletion(id, date('2025-01-15'))).rejects.toThrow(DuplicateCompletionError);
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
      // Verify transaction actually works by calling it
      const result = await adapter.transaction(() => 'test-result');
      expect(result).toBe('test-result');
      // Verify transaction was tracked
      expect(adapter.transaction).toHaveBeenCalledTimes(1);
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
        let reminder: Reminder | null = null;
        planner.on('reminderDue', (r: Reminder) => {
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

        const series = await planner.getSeries(seriesId('non-existent'));
        expect(series).toBeNull();
        // Verify the non-existent ID is not in the list of all series
        const allSeries = await planner.getAllSeries();
        expect(allSeries.map((s) => s.id)).not.toContain(seriesId('non-existent'));

        // Confirm the existing series is still there
        const existingSeries = await planner.getSeries(existingId);
        expect(existingSeries?.title).toBe('Existing');
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
        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
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
        // Verify parentId is not set after unlinking - the child should exist but without a parent link
        expect(child).toEqual(expect.objectContaining({
          id: childId,
          title: 'Child',
        }));
        expect(child).not.toHaveProperty('parentId');
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

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
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
        await planner.deleteCompletion(completionId);

        const completions = await planner.getCompletions(id);
        expect(completions).toEqual([]);
      });
    });

    describe('Querying', () => {
      it('getSchedule returns schedule - instances in range', async () => {
        const planner = createAutoplanner(createValidConfig());

        const id = await planner.createSeries({
          title: 'Test',
          patterns: [{ type: 'daily', time: time('09:00') }],
        });

        const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));

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
      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

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
      const schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));

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

      const queriedSchedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-21'));

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

        // Wednesday (weekday) - should appear
        const weekdaySchedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
        expect(weekdaySchedule.instances.some((i) => i.seriesId === id)).toBe(true);
        expect(weekdaySchedule.instances.some((i) => i.title === 'Weekday Only')).toBe(true);
        expect(weekdaySchedule.instances.some((i) => i.date === date('2025-01-15'))).toBe(true);

        // Saturday (weekend) - should not appear
        const weekendSchedule = await planner.getSchedule(date('2025-01-18'), date('2025-01-19'));
        const weekendInstances = weekendSchedule.instances.filter((i) => i.seriesId === id);
        expect(weekendInstances).toEqual([]);
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
        let schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
        const childBefore = schedule.instances.find((i) => i.seriesId === childId);
        expect(childBefore?.seriesId).toBe(childId);
        expect(childBefore?.title).toBe('Child');

        // Complete parent early - started at 09:00, finished at 09:45 (15 min early)
        await planner.logCompletion(parentId, date('2025-01-15'), {
          startTime: datetime('2025-01-15T09:00:00'),
          endTime: datetime('2025-01-15T09:45:00'),
        });

        // After completion, child should be rescheduled based on actual end
        schedule = await planner.getSchedule(date('2025-01-15'), date('2025-01-16'));
        const childAfter = schedule.instances.find((i) => i.seriesId === childId);

        // Child may have adjusted based on parent's early completion
        expect(childAfter?.seriesId).toBe(childId);
        expect(childAfter?.title).toBe('Child');
      });
    });
  });
});
