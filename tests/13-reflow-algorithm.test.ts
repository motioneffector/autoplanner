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
  buildChainTree,
  chainShadowClear,
  pruneByChainShadow,
  type ReflowInput,
  type ReflowOutput,
  type Instance,
  type Domain,
  type Assignment,
  type Conflict,
  type ConflictType,
  type ChainNode,
  type ChainTree,
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
        // First verify non-cancelled series DOES generate instances
        const activeInput = createReflowInput([createBasicSeries('A', { cancelled: false })]);
        const activeResult = generateInstances(activeInput);
        expect(activeResult).toHaveLength(1);
        expect(activeResult[0].seriesId).toBe(seriesId('A'));

        // Now verify cancelled series does NOT generate instances
        const input = createReflowInput([createBasicSeries('A', { cancelled: true })]);

        const result = generateInstances(input);

        // Cancelled series produces no instances (non-cancelled proven above with 1 result)
        expect(result).toStrictEqual([]);
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
        expect(activeResult).toHaveLength(1);
        expect(activeResult[0].seriesId).toBe(seriesId('A'));

        // Now verify condition=false does NOT generate instances
        const input = createReflowInput([
          createBasicSeries('A', { conditionSatisfied: false }),
        ]);

        const result = generateInstances(input);

        // Condition false produces no instances (condition true proven above with 1 result)
        expect(result).toStrictEqual([]);
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
        expect(domain).toEqual(expect.arrayContaining([expect.stringMatching(/^2025-01-1[456]T/)]));

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
        // 08:00 to 10:00 at 5-min granularity = 25 slots
        expect(domain!).toHaveLength(25);
        expect(domain![0]).toBe(datetime('2025-01-15T08:00:00'));

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
        // 1-hour window at 5-min granularity = 13 slots (09:00 through 10:00 inclusive)
        expect(domain!).toHaveLength(13);
        expect(domain![0]).toBe(datetime('2025-01-15T09:00:00'));

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

      it('chain child excluded from domain map — derived variable', () => {
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

        // Chain children are derived variables — NOT in the domain map
        expect(domains.has(child)).toBe(false);
        // Parent still has its domain
        expect(domains.has(parent)).toBe(true);
        expect(domains.get(parent)).toStrictEqual([datetime('2025-01-15T09:00:00')]);
      });

      it('chain child excluded from domains, parent shadow-pruned (T1)', () => {
        // Parent is flexible with a wide time window. Child is chain child.
        // After computeDomains + shadow pruning:
        // - child has NO domain entry (derived variable)
        // - parent retains full domain since no fixed items to conflict with
        const parent = {
          seriesId: seriesId('P'),
          fixed: false,
          idealTime: datetime('2025-01-15T10:00:00'),
          duration: minutes(30),
          timeWindow: { start: time('08:00:00'), end: time('12:00:00') },
          daysBefore: 0,
          daysAfter: 0,
          allDay: false,
        } as Instance;

        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 60,
          earlyWobble: minutes(0),
          lateWobble: minutes(10),
        } as Instance;

        const instances = [parent, child];
        const domains = computeDomains(instances);

        // Child is NOT in domain map — it's a derived variable
        expect(domains.has(child)).toBe(false);

        // Parent domain still spans 08:00–12:00 in 5-min increments = 49 slots
        const parentDomain = domains.get(parent)!;
        expect(parentDomain).toContain(datetime('2025-01-15T08:00:00'));
        expect(parentDomain).toContain(datetime('2025-01-15T12:00:00'));
        expect(parentDomain).toHaveLength(49);
      });

      it('fixed parent: child excluded, parent domain unchanged (T2)', () => {
        // Fixed parent → child excluded from domains (derived variable)
        // Parent domain is just [idealTime] as always for fixed items
        const parent = {
          seriesId: seriesId('P'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(30),
        } as Instance;

        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 60,
          earlyWobble: minutes(0),
          lateWobble: minutes(10),
        } as Instance;

        const instances = [parent, child];
        const domains = computeDomains(instances);

        // Child is NOT in domain map
        expect(domains.has(child)).toBe(false);

        // Parent fixed → single-slot domain at ideal time
        expect(domains.get(parent)).toStrictEqual([datetime('2025-01-15T09:00:00')]);
      });
    });
  });

  // ============================================================================
  // 2b. Derived Chain Variables (Shadow Pruning + Chain Trees)
  // ============================================================================

  describe('Derived Chain Variables', () => {
    describe('buildChainTree', () => {
      it('builds single-level chain tree', () => {
        const parent = { seriesId: seriesId('P'), fixed: false, duration: minutes(30) } as Instance;
        const child = { seriesId: seriesId('C'), fixed: false, parentId: seriesId('P'), duration: minutes(15) } as Instance;
        const chains = [{ parentId: seriesId('P'), childId: seriesId('C'), distance: 60, earlyWobble: 0, lateWobble: 10 }];

        const tree = buildChainTree([parent, child], chains);

        expect(tree.size).toBe(1);
        expect(tree.has(parent)).toBe(true);
        const nodes = tree.get(parent)!;
        expect(nodes).toHaveLength(1);
        expect(nodes[0]!.instance).toBe(child);
        expect(nodes[0]!.distance).toBe(60);
        expect(nodes[0]!.lateWobble).toBe(10);
        expect(nodes[0]!.children).toStrictEqual([]);
      });

      it('builds multi-level chain tree (3 levels)', () => {
        const gp = { seriesId: seriesId('GP'), fixed: false, duration: minutes(15) } as Instance;
        const p = { seriesId: seriesId('P'), fixed: false, parentId: seriesId('GP'), duration: minutes(15) } as Instance;
        const c = { seriesId: seriesId('C'), fixed: false, parentId: seriesId('P'), duration: minutes(15) } as Instance;
        const chains = [
          { parentId: seriesId('GP'), childId: seriesId('P'), distance: 80, earlyWobble: 0, lateWobble: 10 },
          { parentId: seriesId('P'), childId: seriesId('C'), distance: 200, earlyWobble: 0, lateWobble: 10 },
        ];

        const tree = buildChainTree([gp, p, c], chains);

        expect(tree.size).toBe(1);
        expect(tree.has(gp)).toBe(true);
        const gpNodes = tree.get(gp)!;
        expect(gpNodes).toHaveLength(1);
        expect(gpNodes[0]!.instance).toBe(p);
        expect(gpNodes[0]!.children).toHaveLength(1);
        expect(gpNodes[0]!.children[0]!.instance).toBe(c);
      });

      it('returns empty map when no chains', () => {
        const inst = { seriesId: seriesId('A'), fixed: false } as Instance;
        const tree = buildChainTree([inst], []);
        expect(tree.size).toBe(0);
      });
    });

    describe('chainShadowClear', () => {
      it('returns true when child fits without overlap', () => {
        const child = { seriesId: seriesId('C'), fixed: false, duration: minutes(15) } as Instance;
        const childNode: ChainNode = {
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 0, children: [],
        };

        // Parent at 09:00, dur=30. Child target = 10:30 (dur=15). No occupied ranges.
        const result = chainShadowClear(
          datetime('2025-01-15T09:00:00'), 30, [childNode], []
        );
        expect(result).toBe(true);
      });

      it('returns false when child overlaps fixed item', () => {
        const child = { seriesId: seriesId('C'), fixed: false, duration: minutes(15) } as Instance;
        const childNode: ChainNode = {
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 0, children: [],
        };

        // Parent at 09:00, dur=30. Child target = 10:30 (dur=15).
        // Fixed occupier at 10:00-11:00 → child [10:30, 10:45] overlaps [10:00, 11:00]
        const fixedRanges = [{ start: '2025-01-15T10:00:00', end: '2025-01-15T11:00:00' }];
        const result = chainShadowClear(
          datetime('2025-01-15T09:00:00'), 30, [childNode], fixedRanges
        );
        expect(result).toBe(false);
      });

      it('returns true when wobble allows child to dodge fixed item', () => {
        const child = { seriesId: seriesId('C'), fixed: false, duration: minutes(15) } as Instance;
        const childNode: ChainNode = {
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 30, children: [],
        };

        // Parent at 09:00, dur=30. Child target = 10:30, wobble 0/30 → range [10:30, 11:00]
        // Fixed occupier at 10:00-10:45. Child at 10:45 (dur=15) → [10:45, 11:00] overlaps [10:00, 10:45]? No! 10:45 >= 10:45.
        // Wait, checkNoOverlap is endA <= startB || endB <= startA. So [10:45, 11:00] vs [10:00, 10:45]: 10:45 <= 10:45 → true. No overlap.
        const fixedRanges = [{ start: '2025-01-15T10:00:00', end: '2025-01-15T10:45:00' }];
        const result = chainShadowClear(
          datetime('2025-01-15T09:00:00'), 30, [childNode], fixedRanges
        );
        expect(result).toBe(true);
      });

      it('multi-level: grandchild blocked returns false', () => {
        const p = { seriesId: seriesId('P'), fixed: false, duration: minutes(15) } as Instance;
        const c = { seriesId: seriesId('C'), fixed: false, duration: minutes(15) } as Instance;
        const childNode: ChainNode = {
          instance: p, distance: 10, earlyWobble: 0, lateWobble: 0,
          children: [{
            instance: c, distance: 10, earlyWobble: 0, lateWobble: 0, children: [],
          }],
        };

        // Root at 09:00, dur=30.
        // P target = 09:40, P range = [09:40, 09:55]
        // C target = 10:05, C range = [10:05, 10:20]
        // Fixed at 10:00-10:30 → C overlaps
        const fixedRanges = [{ start: '2025-01-15T10:00:00', end: '2025-01-15T10:30:00' }];
        const result = chainShadowClear(
          datetime('2025-01-15T09:00:00'), 30, [childNode], fixedRanges
        );
        expect(result).toBe(false);
      });
    });

    describe('pruneByChainShadow', () => {
      it('removes parent slots whose children overlap fixed items (T3)', () => {
        const parent = {
          seriesId: seriesId('P'), fixed: false, duration: minutes(30),
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;
        const child = {
          seriesId: seriesId('C'), fixed: false, parentId: seriesId('P'),
          chainDistance: 60, earlyWobble: minutes(0), lateWobble: minutes(0),
          duration: minutes(15),
        } as Instance;
        const occupier = {
          seriesId: seriesId('OCC'), fixed: true,
          idealTime: datetime('2025-01-15T10:00:00'), duration: minutes(60),
        } as Instance;

        const chainTree: ChainTree = new Map();
        chainTree.set(parent, [{
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 0, children: [],
        }]);

        // Parent at 09:00 → child at 10:30 → overlaps occupier [10:00-11:00]
        // Parent at 08:00 → child at 09:30 → clear
        // Parent at 10:00 → child at 11:30 → clear
        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        pruneByChainShadow(domains, chainTree, [parent, child, occupier]);

        const remaining = domains.get(parent)!;
        expect(remaining).toContain(datetime('2025-01-15T08:00:00'));
        expect(remaining).not.toContain(datetime('2025-01-15T09:00:00'));
        expect(remaining).toContain(datetime('2025-01-15T10:00:00'));
        expect(remaining).toHaveLength(2);
      });

      it('preserves all parent slots when no fixed conflicts', () => {
        const parent = {
          seriesId: seriesId('P'), fixed: false, duration: minutes(30),
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;
        const child = {
          seriesId: seriesId('C'), fixed: false, parentId: seriesId('P'),
          duration: minutes(15),
        } as Instance;

        const chainTree: ChainTree = new Map();
        chainTree.set(parent, [{
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 0, children: [],
        }]);

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        // No fixed items → nothing pruned
        pruneByChainShadow(domains, chainTree, [parent, child]);

        expect(domains.get(parent)!).toStrictEqual([
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);
      });
    });

    describe('backtracking with shadow checking', () => {
      it('parent displaced when derived child would hit fixed item (T4)', () => {
        const parent = {
          seriesId: seriesId('P'), fixed: false, duration: minutes(30),
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;
        const occupier = {
          seriesId: seriesId('OCC'), fixed: true, duration: minutes(60),
          idealTime: datetime('2025-01-15T10:00:00'),
        } as Instance;
        const child = {
          seriesId: seriesId('C'), fixed: false, parentId: seriesId('P'),
          chainDistance: 60, earlyWobble: minutes(0), lateWobble: minutes(0),
          duration: minutes(15),
        } as Instance;

        const chainTree: ChainTree = new Map();
        chainTree.set(parent, [{
          instance: child, distance: 60, earlyWobble: 0, lateWobble: 0, children: [],
        }]);

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(occupier, [datetime('2025-01-15T10:00:00')]);
        domains.set(parent, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);

        const constraints = [
          { type: 'noOverlap' as const, instances: [parent, occupier] as [Instance, Instance] },
        ];

        const result = backtrackSearch([occupier, parent], domains, constraints, { chainTree });

        expect(result).toBeInstanceOf(Map);
        expect(result!.size).toBe(2);
        // Parent at 09:00 → child at 10:30 → overlaps occupier → rejected by shadow check
        // Parent at 08:00 → child at 09:30 → clear → accepted (closest to ideal among valid)
        const parentSlot = result!.get(parent)!;
        expect(parentSlot).not.toBe(datetime('2025-01-15T09:00:00'));
        expect([datetime('2025-01-15T08:00:00'), datetime('2025-01-15T10:00:00')]).toContain(parentSlot);
      });
    });

    describe('performance', () => {
      it('schedule with chains completes in under 100ms', () => {
        // Create a realistic schedule: 7 fixed + 5 flex + 2 chain children
        const series: any[] = [];
        // Fixed items
        for (let i = 0; i < 7; i++) {
          series.push({
            id: seriesId(`F${i}`),
            fixed: true,
            idealTime: datetime(`2025-01-15T${String(7 + i * 2).padStart(2, '0')}:00:00`),
            duration: minutes(60),
            daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
            cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          });
        }
        // Flexible items
        for (let i = 0; i < 5; i++) {
          series.push({
            id: seriesId(`X${i}`),
            fixed: false,
            idealTime: datetime(`2025-01-15T${String(8 + i).padStart(2, '0')}:30:00`),
            duration: minutes(30),
            daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
            cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          });
        }
        // Chain root
        series.push({
          id: seriesId('LOAD'),
          fixed: false,
          idealTime: datetime('2025-01-15T09:15:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        });
        // Chain children
        series.push({
          id: seriesId('TRANSFER'),
          fixed: false,
          idealTime: datetime('2025-01-15T10:35:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        });
        series.push({
          id: seriesId('FOLD'),
          fixed: false,
          idealTime: datetime('2025-01-15T14:00:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        });

        const input = {
          series,
          constraints: [],
          chains: [
            { parentId: seriesId('LOAD'), childId: seriesId('TRANSFER'), distance: 80, earlyWobble: 0, lateWobble: 10 },
            { parentId: seriesId('TRANSFER'), childId: seriesId('FOLD'), distance: 200, earlyWobble: 0, lateWobble: 10 },
          ],
          today: date('2025-01-15'),
          windowStart: date('2025-01-15'),
          windowEnd: date('2025-01-15'),
        } as ReflowInput;

        const start = performance.now();
        const result = reflow(input);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(100);
        // All 15 items (7 fixed + 5 flex + 3 chain) should have assignments
        expect(result.assignments).toHaveLength(15);
        expect(result.conflicts).toStrictEqual([]);

        // Verify chain assignments: Load, Transfer, Fold all present with times
        const loadAssign = result.assignments.find(a => (a.seriesId as string) === 'LOAD');
        const transferAssign = result.assignments.find(a => (a.seriesId as string) === 'TRANSFER');
        const foldAssign = result.assignments.find(a => (a.seriesId as string) === 'FOLD');
        expect(loadAssign).toMatchObject({ seriesId: seriesId('LOAD') });
        expect(transferAssign).toMatchObject({ seriesId: seriesId('TRANSFER') });
        expect(foldAssign).toMatchObject({ seriesId: seriesId('FOLD') });

        // Verify fixed items placed at their ideal times
        const f0Assign = result.assignments.find(a => (a.seriesId as string) === 'F0');
        const f6Assign = result.assignments.find(a => (a.seriesId as string) === 'F6');
        expect(f0Assign).toMatchObject({ seriesId: seriesId('F0'), time: datetime('2025-01-15T07:00:00') });
        expect(f6Assign).toMatchObject({ seriesId: seriesId('F6'), time: datetime('2025-01-15T19:00:00') });
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

      it('empty domain no solution - at least one domain empties when only conflicting slots exist', () => {
        // A and B only have overlapping slots — at least one must lose its slot
        const domains = new Map<Instance, LocalDateTime[]>();
        const instanceA = { seriesId: seriesId('A'), fixed: true } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false } as Instance;

        domains.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domains.set(instanceB, [datetime('2025-01-15T09:00:00')]); // Only overlapping slot

        const constraints = [{ type: 'noOverlap', instances: [instanceA, instanceB] }];

        const result = propagateConstraints(domains, constraints);

        // A gets emptied first (A's 09:00 has no non-overlapping support from B)
        expect(result.get(instanceA)).toStrictEqual([]);
        // B retains its slot: with A unplaceable, noOverlap is trivially satisfied
        expect(result.get(instanceB)).toStrictEqual([datetime('2025-01-15T09:00:00')]);
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

    describe('Selective Cascade Behavior', () => {
      it('noOverlap with empty partner does not cascade - sibling retains slots', () => {
        // A and B share only one overlapping slot → A empties first
        // C has noOverlap with A and its own non-conflicting slot
        // After A empties, C should NOT cascade because noOverlap is trivially satisfied
        const instanceA = { seriesId: seriesId('A'), fixed: false, duration: minutes(60) } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false, duration: minutes(60) } as Instance;
        const instanceC = { seriesId: seriesId('C'), fixed: false, duration: minutes(60) } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instanceA, [datetime('2025-01-15T09:00:00')]);
        domains.set(instanceB, [datetime('2025-01-15T09:00:00')]); // Only overlapping slot with A
        domains.set(instanceC, [datetime('2025-01-15T11:00:00')]); // Non-conflicting with A

        const constraints = [
          { type: 'noOverlap', instances: [instanceA, instanceB] },
          { type: 'noOverlap', instances: [instanceA, instanceC] },
        ];

        const result = propagateConstraints(domains, constraints);

        // A empties because its only slot conflicts with B's only slot
        expect(result.get(instanceA)).toStrictEqual([]);
        // B retains: noOverlap with empty A is trivially satisfied
        expect(result.get(instanceB)).toStrictEqual([datetime('2025-01-15T09:00:00')]);
        // C retains: noOverlap with empty A is trivially satisfied
        expect(result.get(instanceC)).toStrictEqual([datetime('2025-01-15T11:00:00')]);
      });

      it('chain cascade goes parent→child: empty parent empties child', () => {
        // Parent has empty domain → child must also empty (can't place child without parent)
        const parent = { seriesId: seriesId('P'), fixed: false, duration: minutes(60) } as Instance;
        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, []); // Empty — parent can't be placed
        domains.set(child, [datetime('2025-01-15T10:00:00')]);

        const constraints = [{ type: 'chain', parent, child }];
        const result = propagateConstraints(domains, constraints);

        // Child cascaded to empty because parent is gone
        expect(result.get(child)).toStrictEqual([]);
      });

      it('chain cascade does NOT go child→parent: empty child preserves parent', () => {
        // Child has empty domain → parent should NOT cascade (parent is independent)
        const parent = { seriesId: seriesId('P'), fixed: false, duration: minutes(60) } as Instance;
        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [datetime('2025-01-15T09:00:00')]);
        domains.set(child, []); // Empty — child can't be placed

        const constraints = [{ type: 'chain', parent, child }];
        const result = propagateConstraints(domains, constraints);

        // Parent retains its slot: child being absent doesn't affect parent
        expect(result.get(parent)).toStrictEqual([datetime('2025-01-15T09:00:00')]);
        // Child stays empty
        expect(result.get(child)).toStrictEqual([]);
      });

      it('mustBeBefore with empty partner does not cascade', () => {
        // A must be before B. If B's domain empties, A should still keep its slots.
        const instanceA = { seriesId: seriesId('A'), fixed: false } as Instance;
        const instanceB = { seriesId: seriesId('B'), fixed: false } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(instanceA, [datetime('2025-01-15T08:00:00')]);
        domains.set(instanceB, []); // Empty — B can't be placed

        const constraints = [{ type: 'mustBeBefore', first: instanceA, second: instanceB }];
        const result = propagateConstraints(domains, constraints);

        // A retains: mustBeBefore is trivially satisfied when B absent
        expect(result.get(instanceA)).toStrictEqual([datetime('2025-01-15T08:00:00')]);
      });

      it('AC-3 prunes parent slots that cause child to overlap fixed item (T3)', () => {
        // Parent flexible at [08:00, 09:00, 10:00], dur=30
        // Child: distance=60, wobble 0/0 (exact placement)
        // Fixed occupier at 10:00 dur=60
        // Parent=09:00 → child=10:30 → overlaps occupier [10:00-11:00] → parent=09:00 pruned
        // Parent=08:00 → child=09:30 → safe → parent=08:00 kept
        // Parent=10:00 → child=11:30 → safe → parent=10:00 kept
        const parent = {
          seriesId: seriesId('P'),
          fixed: false,
          duration: minutes(30),
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;
        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 60,
          earlyWobble: minutes(0),
          lateWobble: minutes(0),
          duration: minutes(15),
        } as Instance;
        const occupier = {
          seriesId: seriesId('OCC'),
          fixed: true,
          duration: minutes(60),
          idealTime: datetime('2025-01-15T10:00:00'),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);
        // Child domain must be wide enough to include slots from all parent positions
        domains.set(child, [
          datetime('2025-01-15T09:30:00'), // from parent=08:00
          datetime('2025-01-15T10:30:00'), // from parent=09:00 — conflicts with occupier
          datetime('2025-01-15T11:30:00'), // from parent=10:00
        ]);
        domains.set(occupier, [datetime('2025-01-15T10:00:00')]);

        const constraints = [
          { type: 'chain', parent, child },
          { type: 'noOverlap', instances: [child, occupier] },
        ];

        const result = propagateConstraints(domains, constraints);

        // Child=10:30 pruned by noOverlap with occupier (10:00-11:00 overlaps 10:30-10:45)
        const childDomain = result.get(child)!;
        expect(childDomain).not.toContain(datetime('2025-01-15T10:30:00'));
        expect(childDomain).toContain(datetime('2025-01-15T09:30:00'));
        expect(childDomain).toContain(datetime('2025-01-15T11:30:00'));

        // Parent=09:00 pruned via chain arc: its only valid child slot (10:30) was removed
        const parentDomain = result.get(parent)!;
        expect(parentDomain).not.toContain(datetime('2025-01-15T09:00:00'));
        expect(parentDomain).toContain(datetime('2025-01-15T08:00:00'));
        expect(parentDomain).toContain(datetime('2025-01-15T10:00:00'));
      });

      it('backtracking finds solution — parent displaced by child conflict (T4)', () => {
        // Same setup as T3 but through backtrackSearch
        const parent = {
          seriesId: seriesId('P'),
          fixed: false,
          duration: minutes(30),
          idealTime: datetime('2025-01-15T09:00:00'),
        } as Instance;
        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 60,
          earlyWobble: minutes(0),
          lateWobble: minutes(0),
          duration: minutes(15),
        } as Instance;
        const occupier = {
          seriesId: seriesId('OCC'),
          fixed: true,
          duration: minutes(60),
          idealTime: datetime('2025-01-15T10:00:00'),
        } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(occupier, [datetime('2025-01-15T10:00:00')]);
        domains.set(parent, [
          datetime('2025-01-15T08:00:00'),
          datetime('2025-01-15T09:00:00'),
          datetime('2025-01-15T10:00:00'),
        ]);
        domains.set(child, [
          datetime('2025-01-15T09:30:00'),
          datetime('2025-01-15T10:30:00'),
          datetime('2025-01-15T11:30:00'),
        ]);

        const constraints = [
          { type: 'chain', parent, child },
          { type: 'noOverlap', instances: [child, occupier] },
          { type: 'noOverlap', instances: [parent, occupier] },
        ];

        const instances = [occupier, parent, child];
        const result = backtrackSearch(instances, domains, constraints);

        expect(result).toBeInstanceOf(Map);
        expect(result!.size).toBe(3);
        // Parent must NOT be at 09:00 (that puts child at 10:30 overlapping occupier)
        const parentSlot = result!.get(parent)!;
        expect(parentSlot).not.toBe(datetime('2025-01-15T09:00:00'));
        // Parent lands at 08:00 (closest to ideal) or 10:00
        expect([datetime('2025-01-15T08:00:00'), datetime('2025-01-15T10:00:00')]).toContain(parentSlot);
        // Child does NOT overlap occupier [10:00-11:00]
        const childSlot = result!.get(child)!;
        expect([datetime('2025-01-15T09:30:00'), datetime('2025-01-15T11:30:00')]).toContain(childSlot);
      });

      it('chain child empty does not cascade to overlapping sibling via noOverlap', () => {
        // Parent empty → child cascaded to empty. Sibling has noOverlap with child.
        // Sibling should NOT be emptied just because child is empty.
        const parent = { seriesId: seriesId('P'), fixed: false, duration: minutes(60) } as Instance;
        const child = {
          seriesId: seriesId('C'),
          fixed: false,
          parentId: seriesId('P'),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(30),
        } as Instance;
        const sibling = { seriesId: seriesId('S'), fixed: false, duration: minutes(60) } as Instance;

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, []); // Empty parent
        domains.set(child, [datetime('2025-01-15T10:00:00')]);
        domains.set(sibling, [datetime('2025-01-15T10:00:00')]); // Same slot as child

        const constraints = [
          { type: 'chain', parent, child },
          { type: 'noOverlap', instances: [child, sibling] },
        ];
        const result = propagateConstraints(domains, constraints);

        // Child cascaded to empty by chain (empty parent)
        expect(result.get(child)).toStrictEqual([]);
        // Sibling retains: noOverlap with empty child is trivially satisfied
        expect(result.get(sibling)).toStrictEqual([datetime('2025-01-15T10:00:00')]);
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

        // Verify this same setup WITHOUT constraints produces a valid result
        const unconstrainedResult = backtrackSearch(instances, domains, []);
        expect(unconstrainedResult).toBeInstanceOf(Map);
        expect(unconstrainedResult!.size).toBe(2);

        const constraints = [{ type: 'noOverlap', instances }];
        const result = backtrackSearch(instances, domains, constraints);

        // No solution exists when both fixed instances overlap - result must be null
        // (positive case proven above: unconstrained search returns Map with 2 entries)
        expect(result).toBe(null);
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

      it('chainCannotFit conflict - derived child overlaps fixed item', () => {
        // Parent fixed at 09:00 (dur=15). Child chain distance=0, wobble 0/0.
        // Occupier fixed at 09:15 (dur=60). Child derives to 09:15 → overlaps occupier.
        const parent = {
          seriesId: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:00:00'),
          duration: minutes(15),
        } as Instance;
        const child = {
          seriesId: seriesId('B'),
          fixed: false,
          parentId: seriesId('A'),
          duration: minutes(30),
          chainDistance: 0,
          earlyWobble: minutes(0),
          lateWobble: minutes(0),
        } as Instance;
        const occupier = {
          seriesId: seriesId('OCC'),
          fixed: true,
          idealTime: datetime('2025-01-15T09:15:00'),
          duration: minutes(60),
        } as Instance;

        const chainTree: ChainTree = new Map();
        chainTree.set(parent, [{
          instance: child,
          distance: 0,
          earlyWobble: 0,
          lateWobble: 0,
          children: [],
        }]);

        const domains = new Map<Instance, LocalDateTime[]>();
        domains.set(parent, [datetime('2025-01-15T09:00:00')]);

        const result = handleNoSolution([parent, child, occupier], domains, [], chainTree);
        // Should detect overlap between derived child and occupier
        const overlapConflict = result.conflicts.find((c) => c.type === 'overlap');
        expect(overlapConflict).toEqual(expect.objectContaining({
          type: 'overlap',
          severity: 'warning',
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
      expect(validResult).toBeInstanceOf(Map);
      expect(validResult!.get(parent)).toBe(datetime('2025-01-15T09:00:00'));
      expect(validResult!.get(child)).toBe(datetime('2025-01-15T10:00:00'));

      // Now test that invalid configuration fails
      const invalidDomains = new Map<Instance, LocalDateTime[]>();
      invalidDomains.set(parent, [datetime('2025-01-15T09:00:00')]);
      invalidDomains.set(child, [datetime('2025-01-15T11:00:00')]); // Outside chain bounds

      const constraints = [{ type: 'chain', parent, child }];
      const result = backtrackSearch([parent, child], invalidDomains, constraints);

      // Should not find solution because child is outside bounds
      // (valid case proven above: within-bounds child returns Map with 2 assignments)
      expect(result).toBe(null);
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

        // 5 non-overlapping series each 1 hour apart should produce zero conflicts
        // (verified by the 5 assignments above and the time checks below)
        expect(result.conflicts).toStrictEqual([]);
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

        // Verify chain relationships - these prove constraints are satisfied
        const getTime = (id: string) => result.assignments.find(a => a.seriesId === seriesId(id))!.time;
        expect(getTime('A') < getTime('B')).toBe(true);
        expect(getTime('C') < getTime('D')).toBe(true);
        // All 4 assigned + chain order maintained = no conflicts
        expect(result.conflicts).toStrictEqual([]);
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
        // 3 assignments in window + no overlaps verified above = no conflicts
        expect(result.conflicts).toStrictEqual([]);
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

      const assignedIds = new Set(result.assignments.map((a) => a.seriesId));
      expect(assignedIds.size).toBe(20);
      // Verify all series are assigned and in correct order
      const times = Array.from({ length: 20 }, (_, i) =>
        result.assignments.find((a) => a.seriesId === seriesId(`S${i}`))?.time
      );
      for (let i = 0; i < 19; i++) {
        expect(times[i]! < times[i + 1]!).toBe(true);
      }
      // 20 assignments + correct ordering verified above = no conflicts
      expect(result.conflicts).toStrictEqual([]);
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
      // A at 09:00 (60min) ends at 10:00, B starts at 10:00 - no overlap = no conflicts
      expect(result.conflicts).toStrictEqual([]);
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
      // Bidirectional overlap: B at 08:30 (60min, ends 09:30) overlaps A at 09:00
      // Only 08:00 and 10:00 survive
      expect(domainAfter).toHaveLength(2);
      expect(domainAfter).toContainEqual(datetime('2025-01-15T08:00:00'));
      expect(domainAfter).toContainEqual(datetime('2025-01-15T10:00:00'));
      expect(domainAfter).not.toContainEqual(datetime('2025-01-15T08:30:00'));
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
      expect(solvableResult).toBeInstanceOf(Map);
      expect(solvableResult!.get(instances[0])).toBe(datetime('2025-01-15T09:00:00'));

      const start = Date.now();
      const result = backtrackSearch(instances, domains, constraints);
      const elapsed = Date.now() - start;

      // No solution exists when all items must be at the same time with no-overlap constraints
      // (proven by solvable case above returning valid Map with assignment)
      expect(result).toBe(null);
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

      // 3 assignments + non-overlapping times verified above = no conflicts
      expect(result.conflicts).toStrictEqual([]);
    });
  });

  // ============================================================================
  // Chain Displacement Edge Cases
  // ============================================================================

  describe('Chain Displacement Edge Cases', () => {
    it('deriveChildTime silent fallback — fully blocked wobble window produces overlap', () => {
      // Parent B is flexible (15min), child C derives from B with distance=80, wobble=0/10.
      // Fixed item A occupies 10:00-11:00. If B is placed at 08:45, parent ends at 09:00,
      // child target = 10:20, wobble window = [10:20, 10:30].
      // Fixed item WALL occupies 10:15-10:45, covering the entire wobble window.
      // deriveChildTime should fall back to target (10:20) which overlaps WALL.
      const series = [
        {
          id: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T10:00:00'),
          duration: minutes(60),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('WALL'),
          fixed: true,
          idealTime: datetime('2025-01-15T10:15:00'),
          duration: minutes(30),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('B'),
          fixed: false,
          idealTime: datetime('2025-01-15T08:45:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindowStart: '08:45', timeWindowEnd: '08:45',
        },
        {
          id: seriesId('C'),
          fixed: false,
          idealTime: datetime('2025-01-15T10:20:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
      ];

      const input = createReflowInput(series, {
        chains: [
          { parentId: seriesId('B'), childId: seriesId('C'), distance: 80, earlyWobble: 0, lateWobble: 10 },
        ],
      });

      const result = reflow(input);

      // C should be assigned (derived from parent B)
      const assignC = result.assignments.find(a => (a.seriesId as string) === 'C');
      expect(assignC).toBeDefined();
      expect(assignC!.seriesId).toBe(seriesId('C'));

      // B should be assigned
      const assignB = result.assignments.find(a => (a.seriesId as string) === 'B');
      expect(assignB).toBeDefined();
      expect(assignB!.seriesId).toBe(seriesId('B'));

      // If the solver can't avoid the overlap, we expect a conflict to be reported.
      // The shadow pruner should ideally prevent this, but if B's only domain slot
      // puts C into the blocked zone, deriveChildTime silently falls back to target.
      // Either: (a) no conflicts and C avoids the blocker, or (b) overlap conflict reported.
      const cTime = assignC!.time;
      const blockerStart = '2025-01-15T10:15:00';
      const blockerEnd = '2025-01-15T10:45:00';
      const cEnd = datetime('2025-01-15T' +
        String(parseInt(cTime.substring(11, 13)) + Math.floor((parseInt(cTime.substring(14, 16)) + 15) / 60)).padStart(2, '0') + ':' +
        String((parseInt(cTime.substring(14, 16)) + 15) % 60).padStart(2, '0') + ':00');

      const cOverlapsWall = !((cEnd as string) <= blockerStart || (cTime as string) >= blockerEnd);

      if (cOverlapsWall) {
        // Silent fallback happened — overlap conflict MUST be reported for C vs WALL
        const cWallOverlap = result.conflicts.find(c =>
          c.type === 'overlap' &&
          c.message !== undefined &&
          c.message.includes('WALL') &&
          /\bC\b/.test(c.message)
        );
        expect(cWallOverlap).toEqual(expect.objectContaining({
          type: 'overlap',
          severity: 'warning',
        }));

        // Also verify C overlaps A (10:00-11:00) since C at 10:20 is inside A's range
        const cAOverlap = result.conflicts.find(c =>
          c.type === 'overlap' &&
          c.message !== undefined &&
          /\bC\b/.test(c.message) &&
          /\bA\b/.test(c.message)
        );
        expect(cAOverlap).toEqual(expect.objectContaining({
          type: 'overlap',
          severity: 'warning',
        }));
      } else {
        // Solver found a way to avoid the overlap entirely — C-specific overlaps absent
        const cOverlaps = result.conflicts.filter(c =>
          c.type === 'overlap' && c.message !== undefined &&
          /\bC\b/.test(c.message)
        );
        expect(cOverlaps).toStrictEqual([]);
      }
    });

    it('handleNoSolution with chain roots — children derived and conflicts detected', () => {
      // Force into handleNoSolution: three fixed items at overlapping times + a flex chain root.
      // The flex chain root has a child. Verify child appears in output and overlaps are reported.
      const fixedA = {
        seriesId: seriesId('F1'),
        fixed: true,
        idealTime: datetime('2025-01-15T09:00:00'),
        duration: minutes(60),
      } as Instance;
      const fixedB = {
        seriesId: seriesId('F2'),
        fixed: true,
        idealTime: datetime('2025-01-15T09:00:00'),
        duration: minutes(60),
      } as Instance;
      // Chain root: flexible, 15min
      const chainRoot = {
        seriesId: seriesId('ROOT'),
        fixed: false,
        idealTime: datetime('2025-01-15T09:00:00'),
        duration: minutes(15),
      } as Instance;
      // Chain child: derived from ROOT
      const chainChild = {
        seriesId: seriesId('CHILD'),
        fixed: false,
        parentId: seriesId('ROOT'),
        idealTime: datetime('2025-01-15T09:45:00'),
        duration: minutes(15),
        chainDistance: 30,
        earlyWobble: minutes(0),
        lateWobble: minutes(5),
      } as Instance;

      const chainTree: ChainTree = new Map();
      chainTree.set(chainRoot, [{
        instance: chainChild,
        distance: 30,
        earlyWobble: 0,
        lateWobble: 5,
        children: [],
      }]);

      // Give chainRoot a domain with only the conflicting slot (forces overlap)
      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(fixedA, [datetime('2025-01-15T09:00:00')]);
      domains.set(fixedB, [datetime('2025-01-15T09:00:00')]);
      domains.set(chainRoot, [datetime('2025-01-15T09:00:00')]);

      const constraints = [
        { type: 'noOverlap' as const, instances: [fixedA, fixedB] as [Instance, Instance] },
        { type: 'noOverlap' as const, instances: [fixedA, chainRoot] as [Instance, Instance] },
        { type: 'noOverlap' as const, instances: [fixedB, chainRoot] as [Instance, Instance] },
      ];

      const result = handleNoSolution(
        [fixedA, fixedB, chainRoot, chainChild],
        domains,
        constraints,
        chainTree
      );

      // All items should be assigned (fixed at their times, root greedy-placed, child derived)
      expect(result.assignments.size).toBe(4);
      expect(result.assignments.get(fixedA)).toBe(datetime('2025-01-15T09:00:00'));
      expect(result.assignments.get(fixedB)).toBe(datetime('2025-01-15T09:00:00'));

      // Chain root: only candidate is 09:00 (overlaps both fixed), greedy places it there
      const rootTime = result.assignments.get(chainRoot);
      expect(rootTime).toBe(datetime('2025-01-15T09:00:00'));

      // Chain child derived: parentEnd(09:15) + distance(30) = 09:45
      // Wobble window [09:45, 09:50] fully blocked by F1/F2 (09:00-10:00)
      // deriveChildTime falls back to target = 09:45
      const childTime = result.assignments.get(chainChild);
      expect(childTime).toBe(datetime('2025-01-15T09:45:00'));

      // Overlap conflicts: F1-F2, F1-ROOT, F2-ROOT from pair check,
      // plus CHILD vs F1, CHILD vs F2 from both pair and chain-child checks
      const overlapConflicts = result.conflicts.filter(c => c.type === 'overlap');

      // Verify the fixed-fixed overlap is specifically reported
      const ffOverlap = overlapConflicts.find(c =>
        c.message?.includes('F1') && c.message?.includes('F2')
      );
      expect(ffOverlap).toEqual(expect.objectContaining({
        type: 'overlap',
        severity: 'warning',
      }));

      // Verify child-fixed overlaps are reported (child at 09:45 overlaps F1 and F2 at 09:00-10:00)
      const childF1Overlap = overlapConflicts.find(c =>
        c.message?.includes('CHILD') && c.message?.includes('F1')
      );
      expect(childF1Overlap).toEqual(expect.objectContaining({
        type: 'overlap',
        severity: 'warning',
      }));
    });

    it('full reflow displacement — chain child must not overlap fixed item', () => {
      // Minimal displacement scenario:
      // Item A: fixed at 10:00, 60min (occupies 10:00-11:00)
      // Item B: flexible, 15min (chain root), time window 06:00-23:00
      // Item C: flexible, 15min (chain child of B, distance=30, wobble=0)
      //
      // If B is at 09:15, B ends 09:30, C = 09:30+30 = 10:00 — overlaps A.
      // So B MUST be displaced: either before 09:15 (so C lands before 10:00)
      // or after 11:00 (so C starts at 11:30+).
      const series = [
        {
          id: seriesId('A'),
          fixed: true,
          idealTime: datetime('2025-01-15T10:00:00'),
          duration: minutes(60),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('B'),
          fixed: false,
          idealTime: datetime('2025-01-15T09:15:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('C'),
          fixed: false,
          idealTime: datetime('2025-01-15T10:00:00'),
          duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
      ];

      const input = createReflowInput(series, {
        chains: [
          { parentId: seriesId('B'), childId: seriesId('C'), distance: 30, earlyWobble: 0, lateWobble: 0 },
        ],
      });

      const result = reflow(input);

      // All three items must be assigned
      expect(result.assignments).toHaveLength(3);
      const assignA = result.assignments.find(a => (a.seriesId as string) === 'A');
      const assignB = result.assignments.find(a => (a.seriesId as string) === 'B');
      const assignC = result.assignments.find(a => (a.seriesId as string) === 'C');

      expect(assignA).toMatchObject({ seriesId: seriesId('A'), time: datetime('2025-01-15T10:00:00') });
      expect(assignB).toBeDefined();
      expect(assignB!.seriesId).toBe(seriesId('B'));
      expect(assignC).toBeDefined();
      expect(assignC!.seriesId).toBe(seriesId('C'));

      // CRITICAL: C must NOT overlap A (10:00-11:00)
      // C is 15min, so C must end at or before 10:00, or start at or after 11:00
      const cTime = assignC!.time as string;
      const aStart = '2025-01-15T10:00:00';
      const aEnd = '2025-01-15T11:00:00';

      // Compute C's end time manually (cTime + 15min)
      const cHour = parseInt(cTime.substring(11, 13));
      const cMin = parseInt(cTime.substring(14, 16));
      const cEndMin = cMin + 15;
      const cEndHour = cHour + Math.floor(cEndMin / 60);
      const cEndTimeStr = `2025-01-15T${String(cEndHour).padStart(2, '0')}:${String(cEndMin % 60).padStart(2, '0')}:00`;

      const cOverlapsA = !(cEndTimeStr <= aStart || cTime >= aEnd);

      // If the shadow pruner works correctly, C should not overlap A
      // and there should be zero conflicts
      expect(cOverlapsA).toBe(false);
      expect(result.conflicts).toStrictEqual([]);

      // Verify B was displaced away from 09:15 (where C would land on A)
      // B must be placed so that B_end + 30 min puts C outside [10:00, 11:00]
      const bTime = assignB!.time as string;
      const bHour = parseInt(bTime.substring(11, 13));
      const bMin = parseInt(bTime.substring(14, 16));
      const bEndMin = bMin + 15;
      const bEndHour = bHour + Math.floor(bEndMin / 60);
      const derivedCMin = (bEndMin % 60) + 30;
      const derivedCHour = bEndHour + Math.floor(derivedCMin / 60);
      const derivedCTimeStr = `2025-01-15T${String(derivedCHour).padStart(2, '0')}:${String(derivedCMin % 60).padStart(2, '0')}:00`;

      // Derived C time must match the actual assignment
      expect(assignC!.time).toBe(datetime(derivedCTimeStr));
    });
  });

  // ============================================================================
  // Chain Displacement Bug Reproduction
  //
  // Real Friday scenario: Laundry chain (Load → Transfer → Fold) overlaps
  // Weight Training (fixed 10:00-11:00) because the reflow solver fails to
  // displace the chain root early enough for derived children to clear the
  // fixed blocker.
  // ============================================================================

  describe('Chain Displacement Bug Reproduction', () => {
    const D = '2026-02-13'; // Friday

    function fridaySeries() {
      return [
        // Fixed items
        {
          id: seriesId('BREAKFAST'), fixed: true,
          idealTime: datetime(`${D}T07:15:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('CHECKIN'), fixed: true,
          idealTime: datetime(`${D}T08:00:00`), duration: minutes(30),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('WALKING'), fixed: true,
          idealTime: datetime(`${D}T09:30:00`), duration: minutes(30),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('WT'), fixed: true,
          idealTime: datetime(`${D}T10:00:00`), duration: minutes(60),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        {
          id: seriesId('SHOWER'), fixed: true,
          idealTime: datetime(`${D}T22:00:00`), duration: minutes(20),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
        },
        // Laundry chain: Load (root) → Transfer (child) → Fold (grandchild)
        {
          id: seriesId('LOAD'), fixed: false,
          idealTime: datetime(`${D}T08:45:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
        {
          id: seriesId('TRANSFER'), fixed: false,
          idealTime: datetime(`${D}T10:20:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
        {
          id: seriesId('FOLD'), fixed: false,
          idealTime: datetime(`${D}T14:00:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
        // Other flexible items
        {
          id: seriesId('SRS'), fixed: false,
          idealTime: datetime(`${D}T11:30:00`), duration: minutes(30),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
        {
          id: seriesId('MEDITATION'), fixed: false,
          idealTime: datetime(`${D}T12:00:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
        {
          id: seriesId('GLASSES'), fixed: false,
          idealTime: datetime(`${D}T07:45:00`), duration: minutes(15),
          daysBefore: 0, daysAfter: 0, allDay: false, count: 1,
          cancelled: false, conditionSatisfied: true, adaptiveDuration: false,
          timeWindow: { start: time('07:00'), end: time('23:00') },
        },
      ];
    }

    function fridayChains() {
      return [
        { parentId: seriesId('LOAD'), childId: seriesId('TRANSFER'), distance: 80, earlyWobble: 0, lateWobble: 10 },
        { parentId: seriesId('TRANSFER'), childId: seriesId('FOLD'), distance: 200, earlyWobble: 5, lateWobble: 120 },
      ];
    }

    function fridayInput(): ReflowInput {
      return {
        series: fridaySeries(),
        constraints: [],
        chains: fridayChains(),
        today: date(D),
        windowStart: date(D),
        windowEnd: date(D),
      } as ReflowInput;
    }

    /** Parse minutes-since-midnight from a LocalDateTime */
    function toMins(dt: string): number {
      const h = parseInt(dt.substring(11, 13));
      const m = parseInt(dt.substring(14, 16));
      return h * 60 + m;
    }

    /** Check if two time ranges [startA, startA+durA) and [startB, startB+durB) overlap */
    function rangesOverlap(startA: number, durA: number, startB: number, durB: number): boolean {
      return startA < startB + durB && startB < startA + durA;
    }

    it('produces assignments for all 11 series', () => {
      const result = reflow(fridayInput());

      // 11 series total: 5 fixed + 3 laundry chain + 3 other flex
      const assignedIds = result.assignments.map(a => a.seriesId as string).sort();
      const expectedIds = [
        'BREAKFAST', 'CHECKIN', 'FOLD', 'GLASSES', 'LOAD',
        'MEDITATION', 'SHOWER', 'SRS', 'TRANSFER', 'WALKING', 'WT',
      ];
      expect(assignedIds).toStrictEqual(expectedIds);

      // Each assignment has a valid ISO datetime
      for (const a of result.assignments) {
        expect(a.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      }
    });

    it('Transfer does not overlap Weight Training (10:00-11:00)', () => {
      const result = reflow(fridayInput());

      const transfer = result.assignments.find(a => (a.seriesId as string) === 'TRANSFER');
      expect(transfer).toBeDefined();
      expect(transfer!.seriesId).toBe(seriesId('TRANSFER'));

      const transferStart = toMins(transfer!.time as string);
      const transferEnd = transferStart + 15;
      const wtStart = 10 * 60;       // 10:00 = 600
      const wtEnd = wtStart + 60;    // 11:00 = 660

      // Transfer must finish before WT starts or begin after WT ends
      const outsideWT = transferEnd <= wtStart || transferStart >= wtEnd;
      expect(outsideWT).toBe(true);
    });

    it('Fold does not overlap Weight Training (10:00-11:00)', () => {
      const result = reflow(fridayInput());

      const fold = result.assignments.find(a => (a.seriesId as string) === 'FOLD');
      expect(fold).toBeDefined();
      expect(fold!.seriesId).toBe(seriesId('FOLD'));

      const foldStart = toMins(fold!.time as string);
      const foldEnd = foldStart + 15;
      const wtStart = 10 * 60;
      const wtEnd = wtStart + 60;

      // Fold must finish before WT starts or begin after WT ends
      const outsideFold = foldEnd <= wtStart || foldStart >= wtEnd;
      expect(outsideFold).toBe(true);
    });

    it('Load displaced early enough that Transfer clears WT', () => {
      const result = reflow(fridayInput());

      const load = result.assignments.find(a => (a.seriesId as string) === 'LOAD');
      const transfer = result.assignments.find(a => (a.seriesId as string) === 'TRANSFER');
      expect(load).toBeDefined();
      expect(load!.seriesId).toBe(seriesId('LOAD'));
      expect(transfer).toBeDefined();
      expect(transfer!.seriesId).toBe(seriesId('TRANSFER'));

      const loadStart = toMins(load!.time as string);
      const loadEnd = loadStart + 15;
      const transferStart = toMins(transfer!.time as string);
      const transferEnd = transferStart + 15;

      // Chain distance: Transfer starts in [loadEnd+80, loadEnd+90]
      const gap = transferStart - loadEnd;
      expect(gap).toBeGreaterThanOrEqual(80);
      expect(gap).toBeLessThanOrEqual(90);

      // Transfer must not overlap WT (10:00-11:00)
      const wtStart = 10 * 60;
      const wtEnd = wtStart + 60;
      const outsideWT = transferEnd <= wtStart || transferStart >= wtEnd;
      expect(outsideWT).toBe(true);
    });

    it('chain distance constraints respected for both links', () => {
      const result = reflow(fridayInput());

      const load = result.assignments.find(a => (a.seriesId as string) === 'LOAD');
      const transfer = result.assignments.find(a => (a.seriesId as string) === 'TRANSFER');
      const fold = result.assignments.find(a => (a.seriesId as string) === 'FOLD');
      expect(load).toBeDefined();
      expect(load!.seriesId).toBe(seriesId('LOAD'));
      expect(transfer).toBeDefined();
      expect(transfer!.seriesId).toBe(seriesId('TRANSFER'));
      expect(fold).toBeDefined();
      expect(fold!.seriesId).toBe(seriesId('FOLD'));

      const loadEnd = toMins(load!.time as string) + 15;
      const transferStart = toMins(transfer!.time as string);
      const transferEnd = transferStart + 15;
      const foldStart = toMins(fold!.time as string);

      // Load → Transfer: distance=80, earlyWobble=0, lateWobble=10
      const loadToTransfer = transferStart - loadEnd;
      expect(loadToTransfer).toBeGreaterThanOrEqual(80);
      expect(loadToTransfer).toBeLessThanOrEqual(90);

      // Transfer → Fold: distance=200, earlyWobble=5, lateWobble=120
      const transferToFold = foldStart - transferEnd;
      expect(transferToFold).toBeGreaterThanOrEqual(195);
      expect(transferToFold).toBeLessThanOrEqual(320);
    });

    it('no overlap conflicts in the output', () => {
      const result = reflow(fridayInput());

      // If there are conflicts, none should be Transfer overlapping WT
      const overlapConflicts = result.conflicts.filter(c => c.type === 'overlap');
      const transferWTOverlap = overlapConflicts.filter(c =>
        c.message !== undefined &&
        c.message.includes('TRANSFER') && c.message.includes('WT')
      );
      expect(transferWTOverlap).toStrictEqual([]);

      // Strongest assertion: a valid placement exists, so zero conflicts
      expect(result.conflicts).toStrictEqual([]);
    });
  });

  // ============================================================================
  // handleNoSolution: Occupied Slot Marking for Derived Chain Children
  // ============================================================================

  describe('handleNoSolution occupied slot marking', () => {
    it('greedy placement does not overlap derived chain children', () => {
      // Setup: flexible chain root R (60min) + chain child C (60min, distance=0, wobble=0)
      // + standalone flexible item S (60min)
      // All share same time window. R placed first, C derived at R_end.
      // S must NOT land on C's slot.
      const R: Instance = {
        seriesId: seriesId('R'),
        fixed: false,
        idealTime: datetime('2026-02-09T09:00:00'),
        duration: minutes(60),
        daysBefore: 0, daysAfter: 0, allDay: false,
        timeWindow: { start: time('07:00:00'), end: time('23:00:00') },
      };
      const C: Instance = {
        seriesId: seriesId('C'),
        fixed: false,
        idealTime: datetime('2026-02-09T10:00:00'),
        duration: minutes(60),
        daysBefore: 0, daysAfter: 0, allDay: false,
        parentId: seriesId('R'),
        chainDistance: 0,
        earlyWobble: minutes(0),
        lateWobble: minutes(0),
      };
      const S: Instance = {
        seriesId: seriesId('S'),
        fixed: false,
        idealTime: datetime('2026-02-09T10:00:00'),
        duration: minutes(60),
        daysBefore: 0, daysAfter: 0, allDay: false,
        timeWindow: { start: time('07:00:00'), end: time('23:00:00') },
      };

      const chainTree: ChainTree = new Map();
      chainTree.set(R, [{
        instance: C,
        distance: 0,
        earlyWobble: 0,
        lateWobble: 0,
        children: [],
      }]);

      // Give R a small domain so handleNoSolution places it at 09:00
      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(R, [datetime('2026-02-09T09:00:00')]);
      domains.set(S, [
        datetime('2026-02-09T09:00:00'),
        datetime('2026-02-09T10:00:00'),
        datetime('2026-02-09T11:00:00'),
      ]);

      const result = handleNoSolution([R, C, S], domains, [
        { type: 'noOverlap', instances: [R, S] },
      ], chainTree);

      // R placed at 09:00 (only option)
      expect(result.assignments.get(R)).toBe(datetime('2026-02-09T09:00:00'));
      // C derived: R ends 10:00, distance 0 → C at 10:00
      expect(result.assignments.get(C)).toBe(datetime('2026-02-09T10:00:00'));
      // S must NOT be at 10:00 (overlaps C). Should be at 11:00 (first free slot)
      expect(result.assignments.get(S)).toBe(datetime('2026-02-09T11:00:00'));

      // No spurious conflicts — all items placed without overlap
      const overlapConflicts = result.conflicts.filter(c => c.type === 'overlap');
      expect(overlapConflicts).toStrictEqual([]);
    });

    it('fixed root children marked before greedy loop', () => {
      // Fixed root F at 09:00 (30min) + chain child FC (60min, distance=0, wobble=0)
      // FC occupies 09:30-10:30. Flexible item S (60min) must NOT land at 09:30.
      const F: Instance = {
        seriesId: seriesId('F'),
        fixed: true,
        idealTime: datetime('2026-02-09T09:00:00'),
        duration: minutes(30),
        daysBefore: 0, daysAfter: 0, allDay: false,
      };
      const FC: Instance = {
        seriesId: seriesId('FC'),
        fixed: false,
        idealTime: datetime('2026-02-09T09:30:00'),
        duration: minutes(60),
        daysBefore: 0, daysAfter: 0, allDay: false,
        parentId: seriesId('F'),
        chainDistance: 0,
        earlyWobble: minutes(0),
        lateWobble: minutes(0),
      };
      const S: Instance = {
        seriesId: seriesId('S'),
        fixed: false,
        idealTime: datetime('2026-02-09T09:30:00'),
        duration: minutes(60),
        daysBefore: 0, daysAfter: 0, allDay: false,
        timeWindow: { start: time('07:00:00'), end: time('23:00:00') },
      };

      const chainTree: ChainTree = new Map();
      chainTree.set(F, [{
        instance: FC,
        distance: 0,
        earlyWobble: 0,
        lateWobble: 0,
        children: [],
      }]);

      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(F, [datetime('2026-02-09T09:00:00')]);
      domains.set(S, [
        datetime('2026-02-09T09:30:00'),
        datetime('2026-02-09T10:30:00'),
        datetime('2026-02-09T11:00:00'),
      ]);

      const result = handleNoSolution([F, FC, S], domains, [], chainTree);

      expect(result.assignments.get(F)).toBe(datetime('2026-02-09T09:00:00'));
      expect(result.assignments.get(FC)).toBe(datetime('2026-02-09T09:30:00'));
      // S can't be at 09:30 (FC is there, 09:30-10:30). Must be at 10:30.
      expect(result.assignments.get(S)).toBe(datetime('2026-02-09T10:30:00'));

      // No spurious conflicts
      const overlapConflicts = result.conflicts.filter(c => c.type === 'overlap');
      expect(overlapConflicts).toStrictEqual([]);
    });

    it('grandchildren slots are marked in occupiedSlots', () => {
      // Chain: R (15min) → C (15min, distance=30) → G (15min, distance=30)
      // Plus flexible item S (15min) that tries to land on G's slot.
      const R: Instance = {
        seriesId: seriesId('R'),
        fixed: false,
        idealTime: datetime('2026-02-09T09:00:00'),
        duration: minutes(15),
        daysBefore: 0, daysAfter: 0, allDay: false,
        timeWindow: { start: time('07:00:00'), end: time('23:00:00') },
      };
      const C: Instance = {
        seriesId: seriesId('C'),
        fixed: false,
        idealTime: datetime('2026-02-09T09:45:00'),
        duration: minutes(15),
        daysBefore: 0, daysAfter: 0, allDay: false,
        parentId: seriesId('R'),
        chainDistance: 30,
        earlyWobble: minutes(0),
        lateWobble: minutes(0),
      };
      const G: Instance = {
        seriesId: seriesId('G'),
        fixed: false,
        idealTime: datetime('2026-02-09T10:30:00'),
        duration: minutes(15),
        daysBefore: 0, daysAfter: 0, allDay: false,
        parentId: seriesId('C'),
        chainDistance: 30,
        earlyWobble: minutes(0),
        lateWobble: minutes(0),
      };
      const S: Instance = {
        seriesId: seriesId('S'),
        fixed: false,
        idealTime: datetime('2026-02-09T10:30:00'),
        duration: minutes(15),
        daysBefore: 0, daysAfter: 0, allDay: false,
        timeWindow: { start: time('07:00:00'), end: time('23:00:00') },
      };

      const chainTree: ChainTree = new Map();
      chainTree.set(R, [{
        instance: C,
        distance: 30,
        earlyWobble: 0,
        lateWobble: 0,
        children: [{
          instance: G,
          distance: 30,
          earlyWobble: 0,
          lateWobble: 0,
          children: [],
        }],
      }]);

      const domains = new Map<Instance, LocalDateTime[]>();
      domains.set(R, [datetime('2026-02-09T09:00:00')]);
      domains.set(S, [
        datetime('2026-02-09T10:30:00'),
        datetime('2026-02-09T10:45:00'),
        datetime('2026-02-09T11:00:00'),
      ]);

      const result = handleNoSolution([R, C, G, S], domains, [
        { type: 'noOverlap', instances: [R, S] },
      ], chainTree);

      // R at 09:00, ends 09:15
      expect(result.assignments.get(R)).toBe(datetime('2026-02-09T09:00:00'));
      // C: R_end(09:15) + 30 = 09:45, ends 10:00
      expect(result.assignments.get(C)).toBe(datetime('2026-02-09T09:45:00'));
      // G: C_end(10:00) + 30 = 10:30, ends 10:45
      expect(result.assignments.get(G)).toBe(datetime('2026-02-09T10:30:00'));
      // S can't be at 10:30 (G is there). Must be at 10:45.
      expect(result.assignments.get(S)).toBe(datetime('2026-02-09T10:45:00'));

      // No spurious conflicts
      const overlapConflicts = result.conflicts.filter(c => c.type === 'overlap');
      expect(overlapConflicts).toStrictEqual([]);
    });
  });
});
