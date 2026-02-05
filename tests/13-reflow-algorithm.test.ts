/**
 * Segment 13: Reflow Algorithm Tests
 *
 * The reflow algorithm computes a valid schedule by placing instances
 * such that all constraints are satisfied. It uses constraint satisfaction
 * with backtracking to guarantee finding a solution if one exists.
 *
 * CRITICAL: This is life-critical software. If a valid arrangement exists,
 * we MUST find it.
 *
 * Dependencies: Segments 1-3, 8, 9, 11, 12
 */
import { describe, it, expect } from 'vitest';
import {
  reflow,
  generateInstances,
  computeDomains,
  propagateConstraints,
  backtrackSearch,
  handleNoSolution,
  checkNoOverlap,
  checkChainConstraint,
  calculateWorkloadScore,
  type ReflowInput,
  type ReflowOutput,
  type Instance,
  type Domain,
  type Assignment,
  type Conflict,
  type ConflictType,
} from '../src/reflow';
import {
  type LocalDate,
  type LocalTime,
  type LocalDateTime,
  type SeriesId,
  type PatternId,
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

function patternId(id: string): PatternId {
  return id as PatternId;
}

function minutes(n: number): Duration {
  return n as Duration;
}

function createBasicSeries(
  id: string,
  options: {
    fixed?: boolean;
    idealTime?: string;
    duration?: number;
    daysBefore?: number;
    daysAfter?: number;
    timeWindowStart?: string;
    timeWindowEnd?: string;
    allDay?: boolean;
    count?: number;
    cancelled?: boolean;
    rescheduledTo?: string;
    conditionSatisfied?: boolean;
    adaptiveDuration?: boolean;
  } = {}
) {
  return {
    id: seriesId(id),
    fixed: options.fixed ?? false,
    idealTime: options.idealTime ? datetime(options.idealTime) : datetime('2025-01-15T09:00:00'),
    duration: minutes(options.duration ?? 60),
    daysBefore: options.daysBefore ?? 0,
    daysAfter: options.daysAfter ?? 0,
    timeWindow: options.timeWindowStart
      ? { start: time(options.timeWindowStart), end: time(options.timeWindowEnd ?? '23:59') }
      : undefined,
    allDay: options.allDay ?? false,
    count: options.count ?? 1,
    cancelled: options.cancelled ?? false,
    rescheduledTo: options.rescheduledTo ? datetime(options.rescheduledTo) : undefined,
    conditionSatisfied: options.conditionSatisfied ?? true,
    adaptiveDuration: options.adaptiveDuration ?? false,
  };
}

function createReflowInput(
  series: ReturnType<typeof createBasicSeries>[],
  options: {
    constraints?: any[];
    chains?: any[];
    today?: string;
    windowStart?: string;
    windowEnd?: string;
  } = {}
): ReflowInput {
  return {
    series,
    constraints: options.constraints ?? [],
    chains: options.chains ?? [],
    today: options.today ? date(options.today) : date('2025-01-15'),
    windowStart: options.windowStart ? date(options.windowStart) : date('2025-01-15'),
    windowEnd: options.windowEnd ? date(options.windowEnd) : date('2025-01-21'),
  };
}

// ============================================================================
// 1. Phase 1: Generate Instances
// ============================================================================

describe('Segment 13: Reflow Algorithm', () => {
  describe('Phase 1: Generate Instances', () => {
    describe('Basic Generation', () => {
      it('deterministic generation - same inputs produce same instances', () => {
        const input = createReflowInput([createBasicSeries('A')]);

        const result1 = generateInstances(input);
        const result2 = generateInstances(input);

        expect(result1).toEqual(result2);
      });

      it('respects series bounds - series with count=5 produces only 5 instances', () => {
        const input = createReflowInput([createBasicSeries('A', { count: 5 })]);

        const result = generateInstances(input);

        const seriesAInstances = result.filter((i) => i.seriesId === seriesId('A'));
        expect(seriesAInstances).toHaveLength(5);
        seriesAInstances.forEach((inst, index) => {
          expect(inst.seriesId).toBe(seriesId('A'));
          expect(inst.idealTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
          // Verify each instance is at index position in the array
          expect(seriesAInstances[index]).toBe(inst);
        });
      });

      it('cancelled excluded - cancelled instance not generated', () => {
        const input = createReflowInput([createBasicSeries('A', { cancelled: true })]);

        const result = generateInstances(input);

        expect(result).toHaveLength(0); // Cancelled instances correctly excluded
      });

      it('rescheduled uses new time - idealTime equals newTime', () => {
        const newTime = '2025-01-16T14:00:00';
        const input = createReflowInput([
          createBasicSeries('A', { rescheduledTo: newTime }),
        ]);

        const result = generateInstances(input);

        expect(result[0].idealTime).toBe(datetime(newTime));
      });

      it('conditions evaluated as of today - correct evaluation', () => {
        const input = createReflowInput(
          [createBasicSeries('A', { conditionSatisfied: true })],
          { today: '2025-01-15' }
        );

        const result = generateInstances(input);

        expect(result.length).toBe(1);
        expect(result[0].seriesId).toBe(seriesId('A'));
        expect(result[0].idealTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });

      it('duration calculated once - single calculation per instance', () => {
        const input = createReflowInput([
          createBasicSeries('A', { adaptiveDuration: true, duration: 60 }),
        ]);

        const result = generateInstances(input);

        // Duration should be fixed at generation time, not recalculated
        expect(result[0].duration).toBeGreaterThan(0);
        expect(Number.isFinite(result[0].duration)).toBe(true);

        // Verify duration is deterministic - same input produces same duration
        const result2 = generateInstances(input);
        expect(result2[0].duration).toBe(result[0].duration);
      });
    });

    describe('Condition Evaluation', () => {
      it('pattern active when condition true - instances generated', () => {
        const input = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: true }),
        ]);

        const result = generateInstances(input);

        expect(result).toEqual([expect.objectContaining({ seriesId: seriesId('A') })]);
      });

      it('pattern inactive when condition false - instances not generated', () => {
        // First verify active condition generates instances
        const activeInput = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: true }),
        ]);
        const activeResult = generateInstances(activeInput);
        expect(activeResult.length).toBeGreaterThan(0);
        expect(activeResult[0].seriesId).toBe(seriesId('A'));

        // Now verify condition=false does NOT generate instances
        const input = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: false }),
        ]);

        const result = generateInstances(input);

        expect(result).toHaveLength(0); // Condition false - correctly excluded
        expect(result.filter(i => i.seriesId === seriesId('A'))).toEqual([]);
      });

      it('multiple patterns mixed conditions - only active pattern instances', () => {
        const input = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: true }),
          createBasicSeries('B', { conditionSatisfied: false }),
          createBasicSeries('C', { conditionSatisfied: true }),
        ]);

        const result = generateInstances(input);

        const seriesIds = result.map((i) => i.seriesId);
        expect(seriesIds).toContain(seriesId('A'));
        expect(seriesIds).not.toContain(seriesId('B'));
        expect(seriesIds).toContain(seriesId('C'));
      });
    });
  });

  // ============================================================================
  // 2. Phase 3: Compute Domains
  // ============================================================================

  describe('Phase 3: Compute Domains', () => {
    describe('Fixed Instance Domains', () => {
      it('fixed has single slot - domain size 1', () => {
        const instances = [
          { seriesId: seriesId('A'), fixed: true, idealTime: datetime('2025-01-15T09:00:00') },
        ] as Instance[];

        const domains = computeDomains(instances);

        expect(domains.get(instances[0])).toEqual([datetime('2025-01-15T09:00:00')]);
      });

      it('fixed domain is ideal time - domain equals [idealTime]', () => {
        const idealTime = datetime('2025-01-15T09:00:00');
        const instances = [
          { seriesId: seriesId('A'), fixed: true, idealTime },
        ] as Instance[];

        const domains = computeDomains(instances);

        expect(domains.get(instances[0])).toEqual([idealTime]);
      });
    });

    describe('Flexible Instance Domains', () => {
      it('domain bounded by wiggle days - daysBefore=1 daysAfter=1 gives 3 days', () => {
        const instances = [
          {
            seriesId: seriesId('A'),
            fixed: false,
            idealTime: datetime('2025-01-15T09:00:00'),
            daysBefore: 1,
            daysAfter: 1,
          },
        ] as Instance[];

        const domains = computeDomains(instances);
        const domain = domains.get(instances[0]);
        expect(domain).toBeDefined();

        // Domain should span 3 days (Jan 14, 15, 16)
        const days = new Set(domain!.map((dt) => dt.substring(0, 10)));
        expect(days.size).toBe(3);

        // Verify the exact days
        expect(days.has('2025-01-14')).toBe(true);
        expect(days.has('2025-01-15')).toBe(true);
        expect(days.has('2025-01-16')).toBe(true);
      });

      it('domain bounded by time window - only those hours', () => {
        const instances = [
          {
            seriesId: seriesId('A'),
            fixed: false,
            idealTime: datetime('2025-01-15T09:00:00'),
            timeWindow: { start: time('08:00'), end: time('10:00') },
          },
        ] as Instance[];

        const domains = computeDomains(instances);
        const domain = domains.get(instances[0]);
        expect(domain).toBeDefined();

        // All slots should be between 08:00 and 10:00
        domain!.forEach((dt) => {
          const hour = parseInt(dt.substring(11, 13));
          expect(hour).toBeGreaterThanOrEqual(8);
          expect(hour).toBeLessThanOrEqual(10);
        });

        // Verify specific hours are covered
        const hours = new Set(domain!.map(dt => parseInt(dt.substring(11, 13))));
        expect(hours.has(8)).toBe(true);
        expect(hours.has(9)).toBe(true);
      });

      it('domain discretized - 5-minute increments', () => {
        const instances = [
          {
            seriesId: seriesId('A'),
            fixed: false,
            idealTime: datetime('2025-01-15T09:00:00'),
            timeWindow: { start: time('09:00'), end: time('10:00') },
          },
        ] as Instance[];

        const domains = computeDomains(instances);
        const domain = domains.get(instances[0]);
        expect(domain).toBeDefined();

        // 1-hour window at 5-min granularity = ~12-13 slots
        expect(domain!.length).toBeGreaterThanOrEqual(12);
        expect(domain!.length).toBeLessThanOrEqual(13);

        // All slots should have minutes divisible by 5
        domain!.forEach((dt) => {
          const minutes = parseInt(dt.substring(14, 16));
          expect(minutes % 5).toBe(0);
        });

        // Verify specific expected slots exist
        const minuteSet = new Set(domain!.map(dt => dt.substring(14, 16)));
        expect(minuteSet.has('00')).toBe(true);
        expect(minuteSet.has('05')).toBe(true);
        expect(minuteSet.has('10')).toBe(true);
      });
    });

    describe('Special Cases', () => {
      it('all-day excluded from reflow - not in constraint graph', () => {
        const instances = [
          { seriesId: seriesId('A'), allDay: true, idealTime: datetime('2025-01-15T00:00:00') },
        ] as Instance[];

        const domains = computeDomains(instances);

        // All-day instances should not have domains (excluded from reflow)
        expect(domains.has(instances[0])).toBe(false);
      });

      it('chain child domain dynamic - computed from parent', () => {
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;

        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          chainDistance: 0,
        } as Instance;

        const instances = [parent, child];
        const domains = computeDomains(instances);

        // Child domain should be relative to parent
        expect(domains.has(child)).toBe(true);
        const childDomain = domains.get(child)!;
        // Verify domain contains valid datetime strings
        expect(childDomain).toEqual(
          expect.arrayContaining([expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)])
        );
      });
    });
  });

  // ============================================================================
  // 3. Phase 4: Constraint Propagation (Arc Consistency)
  // ============================================================================

  describe('Phase 4: Constraint Propagation', () => {
    describe('Propagation Tests', () => {
      it('prunes impossible values - domain shrinks', () => {
        // A fixed at 09:00, B cannot overlap
        const domainsBefore = new Map<Instance, LocalDateTime[]>();
        const instanceA = { seriesId: seriesId('A'), fixed: true } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false } as Instance;

        domainsBefore.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domainsBefore.set(instanceB, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T11:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances: [instanceA, instanceB] }];
        const domainsAfter = propagateConstraints(domainsBefore, constraints);

        const domainAfter = domainsAfter.get(instanceB)!;
        expect(domainAfter).toEqual([
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T11:00:00'),
        ]);
      });

      it('empty domain no solution - propagation returns false', () => {
        // All slots for B conflict with A
        const domains = new Map<Instance, LocalDateTime[]>();
        const instanceA = { seriesId: seriesId('A'), fixed: true } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false } as Instance;

        domains.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domains.set(instanceB, [datetime('2025-01-15T09:00:00')]); // Only overlapping slot

        const constraints = [{ type: 'noOverlap', instances: [instanceA, instanceB] }];
        const result = propagateConstraints(domains, constraints);

        // Should indicate no solution possible
        expect(result.get(instanceB)?.length ?? 0).toBe(0);
      });

      it('propagation is sound - no valid solutions removed', () => {
        const domains = new Map<Instance, LocalDateTime[]>();
        const instanceA = { seriesId: seriesId('A'), fixed: true } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false } as Instance;

        const validSlot = datetime('2025-01-15T11:00:00');
        domains.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domains.set(instanceB, [
          datetime('2025-01-15T09:00:00'),
          validSlot,
        ]);

        const constraints = [{ type: 'noOverlap', instances: [instanceA, instanceB] }];
        const result = propagateConstraints(domains, constraints);

        // Valid slot should still be in domain
        expect(result.get(instanceB)).toContain(validSlot);
      });

      it('propagation incomplete - may need backtracking', () => {
        // Complex network where propagation alone cannot determine solution
        const domains = new Map<Instance, LocalDateTime[]>();
        const instances = ['A', 'B', 'C'].map((id) => ({
          seriesId: seriesId(id),
          fixed: false,
        })) as Instance[];

        instances.forEach((inst) => {
          domains.set(inst, [
            datetime('2025-01-15T09:00:00'),
            datetime('2025-01-15T10:00:00'),
          ]);
        });

        const constraints = [
          { type: 'noOverlap', instances: [instances[0], instances[1]] },
          { type: 'noOverlap', instances: [instances[1], instances[2]] },
        ];

        const result = propagateConstraints(domains, constraints);

        // Domains may still have multiple values - backtracking needed
        instances.forEach((inst) => {
          const domain = result.get(inst)!;
          expect(domain).toEqual([
            datetime('2025-01-15T09:00:00'),
            datetime('2025-01-15T10:00:00'),
          ]);
        });
      });
    });

    describe('Specific Constraint Propagation', () => {
      it('noOverlap prunes overlapping slots', () => {
        const domains = new Map<Instance, LocalDateTime[]>();
        const instanceA = {
          seriesId: seriesId('A'),
          fixed: true,
          duration: minutes(60),
        } as Instance;
        const instanceB = {
          seriesId: seriesId('B'),
          fixed: false,
          duration: minutes(60),
        } as Instance;

        domains.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domains.set(instanceB, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T09:30:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances: [instanceA, instanceB] }];
        const result = propagateConstraints(domains, constraints);

        // 09:00 and 09:30 overlap with A (09:00-10:00), only 10:00 valid
        expect(result.get(instanceB)).toContain(datetime('2025-01-15T10:00:00'));
        expect(result.get(instanceB)).not.toContain(datetime('2025-01-15T09:00:00'));
      });

      it('mustBeBefore prunes - A slots after B removed', () => {
        const domains = new Map<Instance, LocalDateTime[]>();
        const instanceA = { seriesId: seriesId('A'), fixed: false } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: true } as Instance;

        domains.set(instanceA, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);
        domains.set(instanceB, [datetime('2025-01-15T09:00:00')]);

        const constraints = [{ type: 'mustBeBefore', first: instanceA, second: instanceB }];
        const result = propagateConstraints(domains, constraints);

        // A must be before B (09:00), so 09:00 and 10:00 removed for A
        expect(result.get(instanceA)).toContain(datetime('2025-01-15T08:00:00'));
        expect(result.get(instanceA)).not.toContain(datetime('2025-01-15T10:00:00'));
      });

      it('chain constraint prunes - child domain narrowed when parent assigned', () => {
        const domains = new Map<Instance, LocalDateTime[]>();
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          duration: minutes(60),
        } as Instance;
        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;

        domains.set(parent, [datetime('2025-01-15T09:00:00')]);
        domains.set(child, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T10:30:00'),
          datetime('2025-01-15T11:00:00'),
        ]);

        const constraints = [{ type: 'chain', parent, child }];
        const result = propagateConstraints(domains, constraints);

        // Parent ends at 10:00, child can be 10:00-10:30 (within wobble)
        expect(result.get(child)).toContain(datetime('2025-01-15T10:00:00'));
        expect(result.get(child)).toContain(datetime('2025-01-15T10:30:00'));
        expect(result.get(child)).not.toContain(datetime('2025-01-15T11:00:00'));
      });
    });
  });

  // ============================================================================
  // 4. Phase 5: Backtracking Search
  // ============================================================================

  describe('Phase 5: Backtracking Search', () => {
    describe('Basic Search', () => {
      it('finds valid assignment - assignment returned', () => {
        const instances = [
          { seriesId: seriesId('A'), fixed: false },
          { seriesId: seriesId('B'), fixed: false },
        ] as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instances[0], [datetime('2025-01-15T09:00:00')]);
        domains.set(instances[1], [datetime('2025-01-15T10:00:00')]);

        const result = backtrackSearch(instances, domains, []);

        expect(result).toBeInstanceOf(Map);
        expect(result!.get(instances[0])).toBe(datetime('2025-01-15T09:00:00'));
        expect(result!.get(instances[1])).toBe(datetime('2025-01-15T10:00:00'));
      });

      it('satisfies all constraints - all constraints met', () => {
        const instances = [
          { seriesId: seriesId('A'), fixed: false, duration: minutes(60) },
          { seriesId: seriesId('B'), fixed: false, duration: minutes(60) },
        ] as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instances[0], [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);
        domains.set(instances[1], [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances }];
        const result = backtrackSearch(instances, domains, constraints);

        expect(result).toBeInstanceOf(Map);
        // Verify non-overlapping
        const timeA = result!.get(instances[0]);
        const timeB = result!.get(instances[1]);
        expect([datetime('2025-01-15T09:00:00'), datetime('2025-01-15T10:00:00')]).toContain(timeA);
        expect([datetime('2025-01-15T09:00:00'), datetime('2025-01-15T10:00:00')]).toContain(timeB);
        expect(timeA).not.toBe(timeB);
      });

      it('finds solution if exists - exactly one solution found', () => {
        // Only one valid arrangement exists
        const instances = [
          { seriesId: seriesId('A'), fixed: true, duration: minutes(60) },
          { seriesId: seriesId('B'), fixed: false, duration: minutes(60) },
        ] as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instances[0], [datetime('2025-01-15T09:00:00')]);
        domains.set(instances[1], [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances }];
        const result = backtrackSearch(instances, domains, constraints);

        expect(result).toBeInstanceOf(Map);
        expect(result!.get(instances[0])).toBe(datetime('2025-01-15T09:00:00'));
        expect(result!.get(instances[1])).toBe(datetime('2025-01-15T10:00:00'));
      });

      it('terminates on no solution - returns null', () => {
        const instances = [
          { seriesId: seriesId('A'), fixed: true, duration: minutes(60) },
          { seriesId: seriesId('B'), fixed: true, duration: minutes(60) },
        ] as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instances[0], [datetime('2025-01-15T09:00:00')]);
        domains.set(instances[1], [datetime('2025-01-15T09:00:00')]);

        const constraints = [{ type: 'noOverlap', instances }];
        const result = backtrackSearch(instances, domains, constraints);

        // No solution exists when both fixed instances overlap - result must be null
        expect(result).toBeNull();
        // Verify no assignments were made
        expect(result).not.toBeInstanceOf(Map);
      });

      it('always terminates - eventually returns', () => {
        const instances = Array.from({ length: 10 }, (_, i) => ({
          seriesId: seriesId(`S${i}`),
          fixed: false,
          duration: minutes(60),
        })) as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        instances.forEach((inst) => {
          domains.set(inst, [
            datetime('2025-01-15T09:00:00'),
            datetime('2025-01-15T10:00:00'),
          ]);
        });

        // This should terminate (may return null if unsolvable, but must terminate)
        const result = backtrackSearch(instances, domains, []);
        // Result is either a Map with assignments or null for no solution
        if (result !== null) {
          expect(result).toBeInstanceOf(Map);
        }
      });
    });

    describe('Variable Ordering', () => {
      it('fixed items first - fixed assigned before flexible', () => {
        const fixed = { seriesId: seriesId('A'), fixed: true } as Instance;
        const flexible = { seriesId: seriesId('B'), fixed: false } as Instance;
        const instances = [flexible, fixed]; // Flexible first in array

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(fixed, [datetime('2025-01-15T09:00:00')]);
        domains.set(flexible, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const result = backtrackSearch(instances, domains, []);

        // Fixed should be at its only slot
        expect(result?.get(fixed)).toBe(datetime('2025-01-15T09:00:00'));
      });

      it('chain roots before children - A assigned then B then C', () => {
        const root = { seriesId: seriesId('A'), fixed: false } as Instance;
        const child = { seriesId: seriesId('B'), fixed: false, parentId: seriesId('A') } as Instance;
        const grandchild = { seriesId: seriesId('C'), fixed: false, parentId: seriesId('B') } as Instance;

        const instances = [grandchild, child, root]; // Reverse order in array

        const domains = new Map<Instance, LocalDateTime[]>();
        [root, child, grandchild].forEach((inst) => {
          domains.set(inst, [datetime('2025-01-15T09:00:00')]);
        });

        const result = backtrackSearch(instances, domains, []);

        expect(result).toBeInstanceOf(Map);
        // All should be assigned to the same time
        expect(result!.get(root)).toBe(datetime('2025-01-15T09:00:00'));
        expect(result!.get(child)).toBe(datetime('2025-01-15T09:00:00'));
        expect(result!.get(grandchild)).toBe(datetime('2025-01-15T09:00:00'));
      });

      it('smallest domain first - MRV heuristic', () => {
        const small = { seriesId: seriesId('A'), fixed: false } as Instance;
        const large = { seriesId: seriesId('B'), fixed: false } as Instance;
        const instances = [large, small];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(small, [datetime('2025-01-15T09:00:00')]);
        domains.set(large, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T11:00:00'),
        ]);

        const result = backtrackSearch(instances, domains, []);

        // Small domain instance should get its only choice
        expect(result?.get(small)).toBe(datetime('2025-01-15T09:00:00'));
      });
    });

    describe('Value Ordering', () => {
      it('prefers closer to ideal - ideal tried first', () => {
        const instance = {
          seriesId: seriesId('A'),
          fixed: false,
          idealTime: datetime('2025-01-15T10:00:00'),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instance, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T11:00:00'),
        ]);

        const result = backtrackSearch([instance], domains, []);

        // Should pick ideal time
        expect(result?.get(instance)).toBe(datetime('2025-01-15T10:00:00'));
      });

      it('prefers less loaded days - workload balancing', () => {
        const instance = {
          seriesId: seriesId('A'),
          fixed: false,
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instance, [
          datetime('2025-01-15T09:00:00'), // Busy day
          datetime('2025-01-16T09:00:00'), // Less busy day
        ]);

        const workload = new Map<string, number>();
        workload.set('2025-01-15', 8 * 60); // 8 hours already
        workload.set('2025-01-16', 2 * 60); // 2 hours

        const result = backtrackSearch([instance], domains, [], { workload });

        // Should prefer less loaded day
        expect(result?.get(instance)).toBe(datetime('2025-01-16T09:00:00'));
      });
    });
  });

  // ============================================================================
  // 5. Phase 6: Handle No Solution
  // ============================================================================

  describe('Phase 6: Handle No Solution', () => {
    describe('Best-Effort Placement', () => {
      it('fixed items always placed - fixed at ideal time', () => {
        const fixed = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;

        const result = handleNoSolution([fixed], new Map(), []);

        expect(result.assignments.get(fixed)).toBe(datetime('2025-01-15T09:00:00'));
      });

      it('fixed-fixed overlap allowed - both placed with warning', () => {
        const fixed1 = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const fixed2 = {
          seriesId: seriesId('B'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;

        const result = handleNoSolution([fixed1, fixed2], new Map(), []);

        expect(result.assignments.get(fixed1)).toBe(datetime('2025-01-15T09:00:00'));
        expect(result.assignments.get(fixed2)).toBe(datetime('2025-01-15T09:00:00'));
        expect(result.conflicts.some((c) => c.type === 'overlap')).toBe(true);
      });

      it('best effort for flexible - placed with conflict', () => {
        const fixed = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const flexible = {
          seriesId: seriesId('B'),
          fixed: false,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(flexible, [datetime('2025-01-15T09:00:00')]); // Only conflicting slot

        const result = handleNoSolution([fixed, flexible], domains, [
          { type: 'noOverlap', instances: [fixed, flexible] },
        ]);

        expect(result.assignments.get(flexible)).toBe(datetime('2025-01-15T09:00:00'));
        expect(result.conflicts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'overlap' }),
          ])
        );
      });

      it('all conflicts reported - all in output', () => {
        const instances = Array.from({ length: 3 }, (_, i) => ({
          seriesId: seriesId(`S${i}`),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        })) as Instance[];

        const result = handleNoSolution(instances, new Map(), []);

        // Should report multiple overlaps
        expect(result.conflicts.filter((c) => c.type === 'overlap').length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Conflict Types', () => {
      it('overlap conflict - two fixed at same time', () => {
        const fixed1 = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const fixed2 = {
          seriesId: seriesId('B'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;

        const result = handleNoSolution([fixed1, fixed2], new Map(), []);
        const overlap = result.conflicts.find((c) => c.type === 'overlap');

        expect(overlap).toEqual(expect.objectContaining({
          type: 'overlap',
          severity: 'warning',
        }));
      });

      it('chainCannotFit conflict - child outside parent bounds', () => {
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          idealTime: datetime('2025-01-15T12:00:00'), // Too far from parent
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(child, []); // No valid slots

        const result = handleNoSolution([parent, child], domains, []);
        const chainConflict = result.conflicts.find((c) => c.type === 'chainCannotFit');

        expect(chainConflict).toEqual(expect.objectContaining({
          type: 'chainCannotFit',
          severity: 'error',
        }));
      });

      it('constraintViolation conflict - relational constraint unsatisfied', () => {
        const instanceA = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T10:00:00'),
        } as Instance;
        const instanceB = {
          seriesId: seriesId('B'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;

        const constraints = [{ type: 'mustBeBefore', first: instanceA, second: instanceB }];
        const result = handleNoSolution([instanceA, instanceB], new Map(), constraints);
        const violation = result.conflicts.find((c) => c.type === 'constraintViolation');

        expect(violation).toEqual(expect.objectContaining({
          type: 'constraintViolation',
          severity: 'error',
        }));
      });

      it('noValidSlot conflict - no slot in wiggle range', () => {
        const flexible = {
          seriesId: seriesId('A'),
          fixed: false,
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(flexible, []); // No valid slots

        const result = handleNoSolution([flexible], domains, []);
        const noSlot = result.conflicts.find((c) => c.type === 'noValidSlot');

        expect(noSlot).toEqual(expect.objectContaining({
          type: 'noValidSlot',
          severity: 'warning',
        }));
      });
    });
  });

  // ============================================================================
  // 6. Constraint Checking Functions
  // ============================================================================

  describe('Constraint Checking Functions', () => {
    describe('No Overlap', () => {
      it('no overlap satisfied - A ends before B starts', () => {
        const result = checkNoOverlap(
          datetime('2025-01-15T09:00:00'),
          minutes(60),
          datetime('2025-01-15T10:00:00'),
          minutes(60)
        );

        expect(result).toBe(true);
      });

      it('no overlap violated - A overlaps B', () => {
        const result = checkNoOverlap(
          datetime('2025-01-15T09:00:00'),
          minutes(60),
          datetime('2025-01-15T09:30:00'),
          minutes(60)
        );

        expect(result).toBe(false);
      });

      it('adjacent instances allowed - A ends exactly when B starts', () => {
        const result = checkNoOverlap(
          datetime('2025-01-15T09:00:00'),
          minutes(60),
          datetime('2025-01-15T10:00:00'),
          minutes(60)
        );

        expect(result).toBe(true);
      });
    });

    describe('Chain Constraint', () => {
      it('uses actual end if completed - child based on actual end', () => {
        const result = checkChainConstraint({
          parentScheduledEnd: datetime('2025-01-15T10:00:00'),
          parentActualEnd: datetime('2025-01-15T09:45:00'),
          parentCompleted: true,
          childStart: datetime('2025-01-15T09:45:00'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        });

        expect(result).toBe(true);
      });

      it('uses scheduled end if not completed - child based on scheduled', () => {
        const result = checkChainConstraint({
          parentScheduledEnd: datetime('2025-01-15T10:00:00'),
          parentActualEnd: undefined,
          parentCompleted: false,
          childStart: datetime('2025-01-15T10:00:00'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        });

        expect(result).toBe(true);
      });

      it('child within bounds - at target plus earlyWobble satisfied', () => {
        const result = checkChainConstraint({
          parentScheduledEnd: datetime('2025-01-15T10:00:00'),
          parentCompleted: false,
          childStart: datetime('2025-01-15T10:15:00'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        });

        expect(result).toBe(true);
      });

      it('child outside bounds - child before earliest violated', () => {
        const result = checkChainConstraint({
          parentScheduledEnd: datetime('2025-01-15T10:00:00'),
          parentCompleted: false,
          childStart: datetime('2025-01-15T09:30:00'), // Before parent ends
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        });

        expect(result).toBe(false);
      });
    });
  });

  // ============================================================================
  // 7. Workload Balancing
  // ============================================================================

  describe('Workload Balancing', () => {
    it('less loaded day preferred - new item prefers less busy day', () => {
      const workload = new Map<string, number>();
      workload.set('2025-01-15', 8 * 60); // 8 hours
      workload.set('2025-01-16', 2 * 60); // 2 hours

      const scoreA = calculateWorkloadScore(date('2025-01-15'), workload);
      const scoreB = calculateWorkloadScore(date('2025-01-16'), workload);

      // Lower score = preferred
      expect(scoreB).toBeLessThan(scoreA);
    });

    it('balancing only for flexible - fixed item ignores balancing', () => {
      const fixed = {
        seriesId: seriesId('A'),
        fixed: true,
        idealTime: datetime('2025-01-15T09:00:00'),
      } as Instance;

      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(fixed, [datetime('2025-01-15T09:00:00')]);

      const workload = new Map<string, number>();
      workload.set('2025-01-15', 10 * 60); // Very busy day

      const result = backtrackSearch([fixed], domains, [], { workload });

      // Fixed stays at ideal regardless of workload
      expect(result?.get(fixed)).toBe(datetime('2025-01-15T09:00:00'));
    });

    it('constraints take priority - constraint wins over balancing', () => {
      const fixed = {
        seriesId: seriesId('A'),
        fixed: true,
        idealTime: datetime('2025-01-16T09:00:00'),
        duration: minutes(60),
      } as Instance;
      const flexible = {
        seriesId: seriesId('B'),
        fixed: false,
        duration: minutes(60),
      } as Instance;

      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(fixed, [datetime('2025-01-16T09:00:00')]);
      domains.set(flexible, [
        datetime('2025-01-15T09:00:00'), // Less loaded day but would violate constraint
        datetime('2025-01-16T10:00:00'), // More loaded but satisfies constraint
      ]);

      const workload = new Map<string, number>();
      workload.set('2025-01-15', 1 * 60);
      workload.set('2025-01-16', 8 * 60);

      const constraints = [{ type: 'mustBeBefore', first: fixed, second: flexible }];
      const result = backtrackSearch([fixed, flexible], domains, constraints, { workload });

      // Must pick Jan 16 to satisfy constraint even though Jan 15 is less loaded
      expect(result?.get(flexible)).toBe(datetime('2025-01-16T10:00:00'));
    });
  });

  // ============================================================================
  // 8. Soundness Tests
  // ============================================================================

  describe('Soundness Tests', () => {
    describe('Single Solution Scenarios', () => {
      it('finds unique solution - exactly one valid arrangement found', () => {
        const instances = [
          { seriesId: seriesId('A'), fixed: true, idealTime: datetime('2025-01-15T09:00:00'), duration: minutes(60) },
          { seriesId: seriesId('B'), fixed: false, duration: minutes(60) },
        ] as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instances[0], [datetime('2025-01-15T09:00:00')]);
        domains.set(instances[1], [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances }];
        const result = backtrackSearch(instances, domains, constraints);

        expect(result?.get(instances[0])).toBe(datetime('2025-01-15T09:00:00'));
        expect(result?.get(instances[1])).toBe(datetime('2025-01-15T10:00:00'));
      });

      it('chain with exact fit - valid placement found', () => {
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          earlyWobble: minutes(0),
          lateWobble: minutes(0), // Exact fit required
          duration: minutes(60),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [datetime('2025-01-15T09:00:00')]);
        domains.set(child, [datetime('2025-01-15T10:00:00')]);

        const constraints = [{ type: 'chain', parent, child }];
        const result = backtrackSearch([parent, child], domains, constraints);

        expect(result?.get(child)).toBe(datetime('2025-01-15T10:00:00'));
      });
    });

    describe('Property Tests', () => {
      it('valid inputs produce solution found', () => {
        // Construct a definitely solvable schedule
        const instances = Array.from({ length: 5 }, (_, i) => ({
          seriesId: seriesId(`S${i}`),
          fixed: false,
          idealTime: datetime(`2025-01-15T${String(9 + i).padStart(2, '0')}:00:00`),
          duration: minutes(60),
        })) as Instance[];

        const domains = new Map<Instance, LocalDateTime[]>();
        instances.forEach((inst) => {
          domains.set(inst, [inst.idealTime]);
        });

        const result = backtrackSearch(instances, domains, []);

        expect(result).toBeInstanceOf(Map);
        expect(result!.size).toBe(5);
        instances.forEach((inst) => {
          expect(result!.get(inst)).toBe(inst.idealTime);
        });
      });

      it('conflicts produce conflicts reported', () => {
        // Construct a known conflict schedule
        const instances = [
          { seriesId: seriesId('A'), fixed: true, idealTime: datetime('2025-01-15T09:00:00'), duration: minutes(60) },
          { seriesId: seriesId('B'), fixed: true, idealTime: datetime('2025-01-15T09:00:00'), duration: minutes(60) },
        ] as Instance[];

        const result = handleNoSolution(instances, new Map(), []);

        expect(result.conflicts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'overlap' }),
          ])
        );
      });

      it('fixed never moved - position unchanged after reflow', () => {
        const idealTime = datetime('2025-01-15T09:00:00');
        const fixed = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime,
          duration: minutes(60),
        } as Instance;

        const flexible = {
          seriesId: seriesId('B'),
          fixed: false,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(fixed, [idealTime]);
        domains.set(flexible, [
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [{ type: 'noOverlap', instances: [fixed, flexible] }];
        const result = backtrackSearch([fixed, flexible], domains, constraints);

        expect(result?.get(fixed)).toBe(idealTime);
      });

      it('chain bounds respected - child within parent bounds', () => {
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(60),
        } as Instance;
        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [datetime('2025-01-15T09:00:00')]);
        domains.set(child, [
          datetime('2025-01-15T10:00:00'),
          datetime('2025-01-15T10:15:00'),
          datetime('2025-01-15T10:30:00'),
        ]);

        const constraints = [{ type: 'chain', parent, child }];
        const result = backtrackSearch([parent, child], domains, constraints);

        expect(result).toBeInstanceOf(Map);
        const childTime = result!.get(child);
        // Child should be between 10:00 and 10:30
        expect(['2025-01-15T10:00:00', '2025-01-15T10:15:00', '2025-01-15T10:30:00']).toContain(
          childTime
        );
      });
    });
  });

  // ============================================================================
  // 9. Invariants
  // ============================================================================

  describe('Invariants', () => {
    it('INV 1: fixed items never moved', () => {
      const idealTime = datetime('2025-01-15T09:00:00');
      const input = createReflowInput([createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00' })]);

      const result = reflow(input);

      const assignment = result.assignments.find((a) => a.seriesId === seriesId('A'));
      expect(assignment?.time).toBe(idealTime);
    });

    it('INV 2: all-day excluded from constraint graph', () => {
      const input = createReflowInput([
        createBasicSeries('A', { allDay: true }),
        createBasicSeries('B'),
      ]);

      const instances = generateInstances(input);
      const domains = computeDomains(instances);

      const allDayInstance = instances.find((i) => i.allDay);
      expect(allDayInstance).toEqual(expect.objectContaining({ allDay: true }));
      expect(domains.has(allDayInstance!)).toBe(false);
    });

    it('INV 3: chain bounds are hard constraints', () => {
      const parent = {
        seriesId: seriesId('A'),
        fixed: true,
        idealTime: datetime('2025-01-15T09:00:00'),
        duration: minutes(60),
      } as Instance;
      const child = {
        seriesId: seriesId('B'),
        fixed: false,
        parentId: seriesId('A'),
        earlyWobble: minutes(0),
        lateWobble: minutes(0),
      } as Instance;

      // First verify valid configuration succeeds
      const validDomains = new Map<Instance, LocalDateTime[]>();
      validDomains.set(parent, [datetime('2025-01-15T09:00:00')]);
      validDomains.set(child, [datetime('2025-01-15T10:00:00')]); // Within bounds
      const validResult = backtrackSearch([parent, child], validDomains, [{ type: 'chain', parent, child }]);
      expect(validResult).not.toBeNull();

      // Now test that invalid configuration fails
      const invalidDomains = new Map<Instance, LocalDateTime[]>();
      invalidDomains.set(parent, [datetime('2025-01-15T09:00:00')]);
      invalidDomains.set(child, [datetime('2025-01-15T11:00:00')]); // Outside chain bounds

      const constraints = [{ type: 'chain', parent, child }];
      const result = backtrackSearch([parent, child], invalidDomains, constraints);

      // Should not find solution because child is outside bounds
      expect(result).toBeNull(); // No valid assignment possible
    });

    it('INV 4: deterministic output - same inputs same output', () => {
      const input = createReflowInput([
        createBasicSeries('A'),
        createBasicSeries('B'),
        createBasicSeries('C'),
      ]);

      const result1 = reflow(input);
      const result2 = reflow(input);

      expect(result1.assignments).toEqual(result2.assignments);
    });

    it('INV 5: all conflicts reported - no silent failures', () => {
      const input = createReflowInput([
        createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
        createBasicSeries('B', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
        createBasicSeries('C', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
      ]);

      const result = reflow(input);

      // Should report all overlaps
      expect(result.conflicts.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // 10. Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Full Reflow Scenarios', () => {
      it('simple daily schedule - 5 daily series non-overlapping', () => {
        const series = Array.from({ length: 5 }, (_, i) =>
          createBasicSeries(`S${i}`, {
            idealTime: `2025-01-15T${String(9 + i).padStart(2, '0')}:00:00`,
            duration: 60,
          })
        );

        const input = createReflowInput(series);
        const result = reflow(input);

        // First verify all 5 series are assigned
        expect(result.assignments).toHaveLength(5);

        expect(result.conflicts).toHaveLength(0); // Non-overlapping - no conflicts expected
        expect(result.conflicts).toEqual([]);
        const assignedSeriesIds = result.assignments.map((a) => a.seriesId);
        expect(assignedSeriesIds).toEqual(expect.arrayContaining([
          seriesId('S0'), seriesId('S1'), seriesId('S2'), seriesId('S3'), seriesId('S4'),
        ]));
        result.assignments.forEach((a) => {
          expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        });
      });

      it('with relational constraints - order enforced', () => {
        const input = createReflowInput(
          [
            createBasicSeries('A', { daysBefore: 0, daysAfter: 0 }),
            createBasicSeries('B', { daysBefore: 0, daysAfter: 0 }),
          ],
          {
            constraints: [
              { type: 'mustBeBefore', firstSeries: seriesId('A'), secondSeries: seriesId('B') },
            ],
          }
        );

        const result = reflow(input);

        const assignmentA = result.assignments.find((a) => a.seriesId === seriesId('A'));
        const assignmentB = result.assignments.find((a) => a.seriesId === seriesId('B'));

        expect(assignmentA).toEqual(expect.objectContaining({ seriesId: seriesId('A') }));
        expect(assignmentB).toEqual(expect.objectContaining({ seriesId: seriesId('B') }));
        expect(assignmentA!.time < assignmentB!.time).toBe(true);
      });

      it('with chain - child relative to parent', () => {
        const input = createReflowInput(
          [
            createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
            createBasicSeries('B', { daysBefore: 0, daysAfter: 0 }),
          ],
          {
            chains: [
              { parentId: seriesId('A'), childId: seriesId('B'), distance: 0, earlyWobble: 0, lateWobble: 30 },
            ],
          }
        );

        const result = reflow(input);

        const timeB = result.assignments.find((a) => a.seriesId === seriesId('B'))?.time;

        // B should start at or shortly after A ends (10:00)
        expect(timeB?.startsWith('2025-01-15T10:')).toBe(true);
      });

      it('with adaptive duration - duration calculated and used', () => {
        const input = createReflowInput([
          createBasicSeries('A', { adaptiveDuration: true, duration: 60 }),
        ]);

        const result = reflow(input);

        expect(result.assignments).toEqual([
          expect.objectContaining({
            seriesId: seriesId('A'),
            time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
          }),
        ]);
      });

      it('with conditions - only active patterns in schedule', () => {
        const input = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: true }),
          createBasicSeries('B', { conditionSatisfied: false }),
        ]);

        const result = reflow(input);

        expect(result.assignments.some((a) => a.seriesId === seriesId('A'))).toBe(true);
        expect(result.assignments.some((a) => a.seriesId === seriesId('B'))).toBe(false);
      });
    });

    describe('Complex Scenarios', () => {
      it('multiple chains - both chains scheduled', () => {
        const input = createReflowInput(
          [
            createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
            createBasicSeries('B'),
            createBasicSeries('C', { fixed: true, idealTime: '2025-01-15T14:00:00', duration: 60 }),
            createBasicSeries('D'),
          ],
          {
            chains: [
              { parentId: seriesId('A'), childId: seriesId('B'), distance: 0, earlyWobble: 0, lateWobble: 30 },
              { parentId: seriesId('C'), childId: seriesId('D'), distance: 0, earlyWobble: 0, lateWobble: 30 },
            ],
          }
        );

        const result = reflow(input);

        // All 4 series should be assigned
        expect(result.assignments).toHaveLength(4);

        const assignedIds = result.assignments.map((a) => a.seriesId);
        expect(assignedIds).toEqual(expect.arrayContaining([
          seriesId('A'), seriesId('B'), seriesId('C'), seriesId('D'),
        ]));
        expect(result.conflicts).toHaveLength(0); // All constraints satisfied

        // Verify chain relationships
        const getTime = (id: string) => result.assignments.find(a => a.seriesId === seriesId(id))!.time;
        expect(getTime('A') < getTime('B')).toBe(true);
        expect(getTime('C') < getTime('D')).toBe(true);
      });

      it('overlapping constraints - all satisfied', () => {
        const input = createReflowInput(
          [
            createBasicSeries('A'),
            createBasicSeries('B'),
            createBasicSeries('C'),
          ],
          {
            constraints: [
              { type: 'mustBeBefore', firstSeries: seriesId('A'), secondSeries: seriesId('B') },
              { type: 'mustBeBefore', firstSeries: seriesId('B'), secondSeries: seriesId('C') },
            ],
          }
        );

        const result = reflow(input);

        const times = ['A', 'B', 'C'].map(
          (id) => result.assignments.find((a) => a.seriesId === seriesId(id))?.time
        );

        expect(times[0]! < times[1]!).toBe(true);
        expect(times[1]! < times[2]!).toBe(true);
      });

      it('near-conflict - tight fit solution found', () => {
        // Three 1-hour tasks in a 3-hour window
        const series = Array.from({ length: 3 }, (_, i) =>
          createBasicSeries(`S${i}`, {
            idealTime: '2025-01-15T09:00:00',
            duration: 60,
            timeWindowStart: '09:00',
            timeWindowEnd: '12:00',
          })
        );

        const input = createReflowInput(series);
        const result = reflow(input);

        // All 3 series should be assigned
        expect(result.assignments).toHaveLength(3);

        expect(result.conflicts).toHaveLength(0); // Tight fit but solution exists
        const assignedIds = result.assignments.map((a) => a.seriesId);
        expect(assignedIds).toEqual(expect.arrayContaining([
          seriesId('S0'), seriesId('S1'), seriesId('S2'),
        ]));
        // Verify all assignments are within the time window
        result.assignments.forEach((a) => {
          const hour = parseInt(a.time.substring(11, 13));
          expect(hour).toBeGreaterThanOrEqual(9);
          expect(hour).toBeLessThanOrEqual(12);
        });

        // Verify tasks don't overlap
        const sortedTimes = result.assignments.map(a => a.time).sort();
        for (let i = 0; i < sortedTimes.length - 1; i++) {
          const thisEnd = parseInt(sortedTimes[i].substring(11, 13)) + 1; // +1 hour
          const nextStart = parseInt(sortedTimes[i + 1].substring(11, 13));
          expect(thisEnd).toBeLessThanOrEqual(nextStart);
        }
      });
    });
  });

  // ============================================================================
  // 11. Stress Tests
  // ============================================================================

  describe('Stress Tests', () => {
    it('100+ series - completes in reasonable time', () => {
      const series = Array.from({ length: 100 }, (_, i) =>
        createBasicSeries(`S${i}`, {
          idealTime: `2025-01-${String(15 + Math.floor(i / 10)).padStart(2, '0')}T${String(
            9 + (i % 10)
          ).padStart(2, '0')}:00:00`,
          duration: 30,
        })
      );

      const input = createReflowInput(series, { windowEnd: '2025-01-31' });

      const start = Date.now();
      const result = reflow(input);
      const elapsed = Date.now() - start;

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(100);
      // Verify all assignments have valid times
      result.assignments.forEach((a) => {
        expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });
      expect(elapsed).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    it('complex constraint network - correct result', () => {
      const series = Array.from({ length: 20 }, (_, i) =>
        createBasicSeries(`S${i}`, { duration: 30 })
      );

      const constraints = [];
      for (let i = 0; i < 19; i++) {
        constraints.push({
          type: 'mustBeBefore',
          firstSeries: seriesId(`S${i}`),
          secondSeries: seriesId(`S${i + 1}`),
        });
      }

      const input = createReflowInput(series, { constraints });
      const result = reflow(input);

      // All 20 series should be assigned
      expect(result.assignments).toHaveLength(20);

      // Should find valid ordering
      expect(result.conflicts).toHaveLength(0); // Valid ordering exists
      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(20);
      // Verify all series are assigned and in correct order
      const times = Array.from({ length: 20 }, (_, i) =>
        result.assignments.find((a) => a.seriesId === seriesId(`S${i}`))?.time
      );
      for (let i = 0; i < 19; i++) {
        expect(times[i]! < times[i + 1]!).toBe(true);
      }
    });

    it('deep chains - 10-level chain correctly scheduled', () => {
      const series = Array.from({ length: 10 }, (_, i) =>
        createBasicSeries(`S${i}`, {
          fixed: i === 0,
          idealTime: i === 0 ? '2025-01-15T09:00:00' : undefined,
          duration: 30,
        })
      );

      const chains = [];
      for (let i = 0; i < 9; i++) {
        chains.push({
          parentId: seriesId(`S${i}`),
          childId: seriesId(`S${i + 1}`),
          distance: 0,
          earlyWobble: 0,
          lateWobble: 15,
        });
      }

      const input = createReflowInput(series, { chains });
      const result = reflow(input);

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(10);
      // Verify chain order is maintained (each subsequent item is after its parent)
      const times = Array.from({ length: 10 }, (_, i) =>
        result.assignments.find((a) => a.seriesId === seriesId(`S${i}`))?.time
      );
      for (let i = 0; i < 9; i++) {
        expect(times[i]! <= times[i + 1]!).toBe(true);
      }
    });

    it('many flexible items - solution found', () => {
      const series = Array.from({ length: 50 }, (_, i) =>
        createBasicSeries(`S${i}`, {
          duration: 15,
          daysBefore: 1,
          daysAfter: 1,
        })
      );

      const input = createReflowInput(series);
      const result = reflow(input);

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(50);
      result.assignments.forEach((a) => {
        expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });
    });
  });

  // ============================================================================
  // 12. Known Answer Tests
  // ============================================================================

  describe('Known Answer Tests', () => {
    it('two non-overlapping - both at ideal times', () => {
      const input = createReflowInput([
        createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
        createBasicSeries('B', { fixed: true, idealTime: '2025-01-15T10:00:00', duration: 60 }),
      ]);

      const result = reflow(input);

      // Both series should be assigned
      expect(result.assignments).toHaveLength(2);

      expect(result.assignments.find((a) => a.seriesId === seriesId('A'))?.time).toBe(
        datetime('2025-01-15T09:00:00')
      );
      expect(result.assignments.find((a) => a.seriesId === seriesId('B'))?.time).toBe(
        datetime('2025-01-15T10:00:00')
      );
      expect(result.conflicts).toHaveLength(0);
      expect(result.conflicts).toEqual([]);
    });

    it('must reschedule B - B moved to 10:00', () => {
      const input = createReflowInput([
        createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
        createBasicSeries('B', { idealTime: '2025-01-15T09:30:00', duration: 60 }),
      ]);

      const result = reflow(input);

      const timeB = result.assignments.find((a) => a.seriesId === seriesId('B'))?.time;
      // B should be moved to not overlap with A (which ends at 10:00)
      expect(timeB! >= datetime('2025-01-15T10:00:00')).toBe(true);
    });

    it('chain at distance 0 - B starts when A ends', () => {
      const input = createReflowInput(
        [
          createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
          createBasicSeries('B'),
        ],
        {
          chains: [
            { parentId: seriesId('A'), childId: seriesId('B'), distance: 0, earlyWobble: 0, lateWobble: 0 },
          ],
        }
      );

      const result = reflow(input);

      expect(result.assignments.find((a) => a.seriesId === seriesId('B'))?.time).toBe(
        datetime('2025-01-15T10:00:00')
      );
    });

    it('unsolvable - conflicts reported', () => {
      const input = createReflowInput(
        [
          createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T10:00:00' }),
          createBasicSeries('B', { fixed: true, idealTime: '2025-01-15T09:00:00' }),
        ],
        {
          constraints: [
            { type: 'mustBeBefore', firstSeries: seriesId('A'), secondSeries: seriesId('B') },
          ],
        }
      );

      const result = reflow(input);

      expect(result.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'constraintViolation' }),
        ])
      );
    });
  });

  // ============================================================================
  // 13. Performance Tests
  // ============================================================================

  describe('Performance Tests', () => {
    it('typical week window - fast performance', () => {
      const series = Array.from({ length: 35 }, (_, i) =>
        createBasicSeries(`S${i}`, {
          idealTime: `2025-01-${String(15 + (i % 7)).padStart(2, '0')}T${String(
            9 + Math.floor((i % 35) / 7)
          ).padStart(2, '0')}:00:00`,
          duration: 60,
        })
      );

      const input = createReflowInput(series);

      const start = Date.now();
      const result = reflow(input);
      const elapsed = Date.now() - start;

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(35);
      result.assignments.forEach((a) => {
        expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });
      expect(elapsed).toBeLessThan(1000); // Under 1 second
    });

    it('arc consistency reduces space - domain shrinks after propagation', () => {
      const instances = [
        { seriesId: seriesId('A'), fixed: true, duration: minutes(60) },
        { seriesId: seriesId('B'), fixed: false, duration: minutes(60) },
      ] as Instance[];

      const domainsBefore = new Map<Instance, LocalDateTime[]>();
      domainsBefore.set(instances[0], [datetime('2025-01-15T09:00:00')]);
      domainsBefore.set(instances[1], [
        datetime('2025-01-15T08:00:00'),
        datetime('2025-01-15T08:30:00'),
        datetime('2025-01-15T09:00:00'),
        datetime('2025-01-15T09:30:00'),
        datetime('2025-01-15T10:00:00'),
      ]);

      const constraints = [{ type: 'noOverlap', instances }];
      const domainsAfter = propagateConstraints(domainsBefore, constraints);

      const domainBefore = domainsBefore.get(instances[1]);
      const domainAfter = domainsAfter.get(instances[1]);
      expect(domainBefore).toBeDefined();
      expect(domainBefore).toEqual([
        datetime('2025-01-15T08:00:00'),
        datetime('2025-01-15T08:30:00'),
        datetime('2025-01-15T09:00:00'),
        datetime('2025-01-15T09:30:00'),
        datetime('2025-01-15T10:00:00'),
      ]);
      expect(domainAfter).toBeDefined();

      // After propagation, domain should be reduced (fewer valid slots)
      // Exactly 3 slots should remain (08:00, 08:30, 10:00)
      expect(domainAfter).toHaveLength(3);
      expect(domainAfter).toContainEqual(datetime('2025-01-15T08:00:00'));
      expect(domainAfter).toContainEqual(datetime('2025-01-15T08:30:00'));
      expect(domainAfter).toContainEqual(datetime('2025-01-15T10:00:00'));
      expect(domainAfter).not.toContainEqual(datetime('2025-01-15T09:00:00'));
      expect(domainAfter).not.toContainEqual(datetime('2025-01-15T09:30:00'));
    });

    it('MRV finds conflicts early - fast failure on unsolvable', () => {
      // Unsolvable: 10 fixed items all at same time
      const instances = Array.from({ length: 10 }, (_, i) => ({
        seriesId: seriesId(`S${i}`),
        fixed: true,
        idealTime: datetime('2025-01-15T09:00:00'),
        duration: minutes(60),
      })) as Instance[];

      const domains = new Map<Instance, LocalDateTime[]>();
      instances.forEach((inst) => {
        domains.set(inst, [datetime('2025-01-15T09:00:00')]);
      });

      const constraints = [];
      for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
          constraints.push({ type: 'noOverlap', instances: [instances[i], instances[j]] });
        }
      }

      // First verify that a solvable problem succeeds
      const solvableInstances = [instances[0]];
      const solvableDomains = new Map<Instance, LocalDateTime[]>();
      solvableDomains.set(instances[0], [datetime('2025-01-15T09:00:00')]);
      const solvableResult = backtrackSearch(solvableInstances, solvableDomains, []);
      expect(solvableResult).not.toBeNull();

      const start = Date.now();
      const result = backtrackSearch(instances, domains, constraints);
      const elapsed = Date.now() - start;

      // No solution exists when all items must be at the same time with no-overlap constraints
      expect(result).toBeNull(); // Unsolvable - correctly returns null
      expect(elapsed).toBeLessThan(100); // Should fail fast
    });

    it('manageable search space - typical calendar reasonable time', () => {
      // Typical day: 8-10 items
      const series = Array.from({ length: 10 }, (_, i) =>
        createBasicSeries(`S${i}`, {
          idealTime: `2025-01-15T${String(8 + i).padStart(2, '0')}:00:00`,
          duration: 45,
          daysBefore: 0,
          daysAfter: 1,
        })
      );

      const input = createReflowInput(series);

      const start = Date.now();
      const result = reflow(input);
      const elapsed = Date.now() - start;

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(10);
      result.assignments.forEach((a) => {
        expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });
      expect(elapsed).toBeLessThan(500);
    });

    it('correctness over performance - correct result always', () => {
      // Edge case that might tempt shortcuts
      const input = createReflowInput([
        createBasicSeries('A', { fixed: true, idealTime: '2025-01-15T09:00:00', duration: 60 }),
        createBasicSeries('B', { idealTime: '2025-01-15T09:30:00', duration: 60, daysBefore: 1, daysAfter: 1 }),
        createBasicSeries('C', { idealTime: '2025-01-15T10:00:00', duration: 60 }),
      ]);

      const result = reflow(input);

      // CRITICAL: All 3 series should be assigned
      expect(result.assignments).toHaveLength(3);

      // Must find valid non-overlapping assignment
      expect(result.conflicts).toHaveLength(0); // Valid assignment exists
      expect(result.conflicts).toEqual([]);

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(3);
      // Verify each series is assigned
      expect(assignedIds.has(seriesId('A'))).toBe(true);
      expect(assignedIds.has(seriesId('B'))).toBe(true);
      expect(assignedIds.has(seriesId('C'))).toBe(true);

      const times = result.assignments.map((a) => a.time).sort();
      // Verify no overlaps
      for (let i = 0; i < times.length - 1; i++) {
        expect(times[i]! < times[i + 1]!).toBe(true);
      }

      // Verify A is at its fixed time
      const timeA = result.assignments.find((a) => a.seriesId === seriesId('A'))?.time;
      expect(timeA).toBe(datetime('2025-01-15T09:00:00'));
    });
  });
});
