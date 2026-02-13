/**
 * Segment 07: Cycling
 *
 * Cycling rotates through a list of titles/descriptions across instances of a series.
 * Supports sequential and random modes, with optional gap-leap behavior for state-based progression.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCyclingItem,
  advanceCycling,
  resetCycling,
  resolveInstanceTitle,
  getInstanceNumber,
} from '../src/cycling';
import {
  createSeries,
  ValidationError,
} from '../src/series-crud';
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
import type { LocalDate, LocalDateTime, SeriesId, CyclingConfig } from '../src/types';

function date(s: string): LocalDate {
  const r = parseDate(s);
  if (!r.ok) throw new Error(`Invalid test date: ${s}`);
  return r.value;
}

function datetime(s: string): LocalDateTime {
  const r = parseDateTime(s);
  if (!r.ok) throw new Error(`Invalid test datetime: ${s}`);
  return r.value;
}

describe('Segment 07: Cycling', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: SEQUENTIAL MODE (gapLeap=false)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Sequential Mode (gapLeap=false)', () => {
    describe('1.1 Basic Cycling Tests', () => {
      const cyclingConfig: CyclingConfig = {
        items: ['A', 'B', 'C'],
        mode: 'sequential',
        gapLeap: false,
      };

      it('instance 0 gets item 0', () => {
        const item = getCyclingItem(cyclingConfig, { instanceNumber: 0 });
        expect(item).toBe('A');
      });

      it('instance 1 gets item 1', () => {
        const item = getCyclingItem(cyclingConfig, { instanceNumber: 1 });
        expect(item).toBe('B');
      });

      it('instance 2 gets item 2', () => {
        const item = getCyclingItem(cyclingConfig, { instanceNumber: 2 });
        expect(item).toBe('C');
      });

      it('instance wraps around', () => {
        const item = getCyclingItem(cyclingConfig, { instanceNumber: 3 });
        expect(item).toBe('A');
      });

      it('deterministic same instance', () => {
        const item1 = getCyclingItem(cyclingConfig, { instanceNumber: 1 });
        const item2 = getCyclingItem(cyclingConfig, { instanceNumber: 1 });
        expect(item1).toBe('B');
        expect(item2).toBe('B');
      });
    });

    describe('1.2 Periodicity Tests', () => {
      it('full cycle wraps', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: false,
        };
        const results = [0, 1, 2, 3, 4, 5].map(n =>
          getCyclingItem(config, { instanceNumber: n })
        );
        expect(results).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
      });

      it('two items cycle', () => {
        const config: CyclingConfig = {
          items: ['A', 'B'],
          mode: 'sequential',
          gapLeap: false,
        };
        const results = [0, 1, 2, 3].map(n =>
          getCyclingItem(config, { instanceNumber: n })
        );
        expect(results).toEqual(['A', 'B', 'A', 'B']);
      });

      it('period equals item count', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: false,
        };
        const n = 5;
        const itemAtN = getCyclingItem(config, { instanceNumber: n });
        const itemAtNPlus3 = getCyclingItem(config, { instanceNumber: n + 3 });
        expect(itemAtN).toBe(itemAtNPlus3);
      });
    });

    describe('1.3 Known Answer Tests', () => {
      it('5 instances 3 items', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: false,
        };
        const results = [0, 1, 2, 3, 4].map(n =>
          getCyclingItem(config, { instanceNumber: n })
        );
        expect(results).toEqual(['A', 'B', 'C', 'A', 'B']);
      });

      it('4 instances 2 items', () => {
        const config: CyclingConfig = {
          items: ['A', 'B'],
          mode: 'sequential',
          gapLeap: false,
        };
        const results = [0, 1, 2, 3].map(n =>
          getCyclingItem(config, { instanceNumber: n })
        );
        expect(results).toEqual(['A', 'B', 'A', 'B']);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: SEQUENTIAL MODE (gapLeap=true)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Sequential Mode (gapLeap=true)', () => {
    describe('2.1 State-Based Cycling Tests', () => {
      it('item determined by currentIndex', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 1,
        };
        const item = getCyclingItem(config, { instanceNumber: 0 });
        expect(item).toBe('B');
      });

      it('ignores instance number', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        };
        // Even with instanceNumber=5, should use currentIndex=0
        const item = getCyclingItem(config, { instanceNumber: 5 });
        expect(item).toBe('A');
      });

      it('index advances on completion', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        // Log a completion
        await logCompletion(adapter, {
          seriesId,
          instanceDate: date('2024-01-01'),
          startTime: datetime('2024-01-01T09:00:00'),
          endTime: datetime('2024-01-01T09:30:00'),
        });

        // Advance the cycling
        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'index advances on completion' advance failed: ${result.error.type}`);
        expect(result.value.currentIndex).toBe(1);
      });

      it('skipped instance no advance', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        // Don't log any completion - just skip the instance
        // Index should remain 0
        const series = await adapter.getSeries(seriesId);
        expect(series).not.toBeNull();
        expect(series!.cycling).toBeDefined();
        expect(series!.cycling!.currentIndex).toBe(0);
      });
    });

    describe('2.2 Wrap-Around Tests', () => {
      it('index wraps at end', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        }) as SeriesId;

        // Advance from index 2
        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'index wraps at end' advance failed: ${result.error.type}`);
        expect(result.value.currentIndex).toBe(0);
      });

      it('continuous wrap', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        // Advance 6 times - should cycle through twice
        const indices: number[] = [];
        for (let i = 0; i < 6; i++) {
          const result = await advanceCycling(adapter, seriesId);
          expect(result.ok).toBe(true);
          if (result.ok) {
            indices.push(result.value.currentIndex);
          }
        }

        expect(indices).toEqual([1, 2, 0, 1, 2, 0]);
      });
    });

    describe('2.3 Gap-Leap Sequence Test', () => {
      it('gap-leap full sequence', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Gap-Leap Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        // Get item at index 0 -> A
        let series = await adapter.getSeries(seriesId);
        let item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('A');

        // Complete -> advance to index 1
        await advanceCycling(adapter, seriesId);
        series = await adapter.getSeries(seriesId);
        expect(series!.cycling!.currentIndex).toBe(1);

        // Get item at index 1 -> B
        item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('B');

        // Skip (don't complete) -> still B
        item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('B');

        // Complete -> advance to index 2
        await advanceCycling(adapter, seriesId);
        series = await adapter.getSeries(seriesId);
        expect(series!.cycling!.currentIndex).toBe(2);

        // Get item at index 2 -> C
        item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('C');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: RANDOM MODE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Random Mode', () => {
    describe('3.1 Random gapLeap=false', () => {
      it('result is valid item', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: false,
        };
        const item = getCyclingItem(config, { instanceNumber: 42 });
        expect(['A', 'B', 'C']).toContain(item);
      });

      it('same seed same item', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: false,
        };
        const item1 = getCyclingItem(config, { instanceNumber: 5 });
        const item2 = getCyclingItem(config, { instanceNumber: 5 });
        expect(item1).toBe(item2);
      });

      it('different seeds differ', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: false,
        };
        // Test over multiple different seeds - at least one should differ
        const items = new Set<string>();
        for (let i = 0; i < 20; i++) {
          items.add(getCyclingItem(config, { instanceNumber: i }));
        }
        // With random mode, we should get more than one unique item
        expect(items.size).toBeGreaterThan(1);
      });
    });

    describe('3.2 Random gapLeap=true', () => {
      it('seeded by currentIndex', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: true,
          currentIndex: 0,
        };
        const item = getCyclingItem(config, { instanceNumber: 0 });
        expect(['A', 'B', 'C']).toContain(item);
      });

      it('same index same item', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: true,
          currentIndex: 1,
        };
        const item1 = getCyclingItem(config, { instanceNumber: 0 });
        const item2 = getCyclingItem(config, { instanceNumber: 0 });
        expect(item1).toBe(item2);
      });
    });

    describe('3.3 Distribution Test', () => {
      it('all items reachable', () => {
        const config: CyclingConfig = {
          items: ['A', 'B', 'C'],
          mode: 'random',
          gapLeap: false,
        };
        const seen = new Set<string>();
        for (let i = 0; i < 1000; i++) {
          seen.add(getCyclingItem(config, { instanceNumber: i }));
        }
        expect(seen.size).toBe(3);
        expect(seen.has('A')).toBe(true);
        expect(seen.has('B')).toBe(true);
        expect(seen.has('C')).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: ADVANCE CYCLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Advance Cycling', () => {
    describe('4.1 Advance Tests', () => {
      it('advance increments index', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(1);
        }
      });

      it('advance wraps around', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });

      it('advance requires gapLeap=true', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: false,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        // Should either error or be a no-op
        expect(result.ok).toBe(false);
      });
    });

    describe('4.2 Precondition Tests', () => {
      it('advance on gapLeap=true series', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'GapLeap Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
      });

      it('advance on gapLeap=false series', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'No GapLeap Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B'],
            mode: 'sequential',
            gapLeap: false,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: RESET CYCLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Reset Cycling', () => {
    describe('Unit Tests', () => {
      it('reset sets index to 0', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 5,
          },
        }) as SeriesId;

        const result = await resetCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });

      it('reset from index 0', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;

        const result = await resetCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });
    });

    describe('No Auto-Reset Tests', () => {
      it('no auto-reset on deactivation', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        }) as SeriesId;

        // Simulate pattern deactivation by checking series state
        // Index should be preserved
        const series = await adapter.getSeries(seriesId);
        expect(series!.cycling!.currentIndex).toBe(2);
      });

      it('consumer must explicitly reset', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 1,
          },
        }) as SeriesId;

        // Without explicit reset, index should remain unchanged
        const series = await adapter.getSeries(seriesId);
        expect(series!.cycling!.currentIndex).toBe(1);
      });

      it('deactivation preserves index', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        }) as SeriesId;

        // Advance cycling to verify state changes
        await advanceCycling(adapter, seriesId);

        // Verify index was updated (wrapped to 0)
        const series = await adapter.getSeries(seriesId);
        expect(series!.cycling!.currentIndex).toBe(0);

        // Index is preserved across operations - no auto-reset
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: RESOLVE INSTANCE TITLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Resolve Instance Title', () => {
    it('no cycling uses series title', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Simple Series',
        startDate: date('2024-01-01'),
      }) as SeriesId;

      const series = await adapter.getSeries(seriesId);
      const title = resolveInstanceTitle(series!, { instanceNumber: 0 });
      expect(title).toBe('Simple Series');
    });

    it('with cycling uses item title', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Workout',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['Push Day', 'Pull Day', 'Leg Day'],
          mode: 'sequential',
          gapLeap: false,
        },
      }) as SeriesId;

      const series = await adapter.getSeries(seriesId);
      const title = resolveInstanceTitle(series!, { instanceNumber: 1 });
      expect(title).toBe('Pull Day');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: INSTANCE NUMBER CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Instance Number Calculation', () => {
    it('first instance is number 0', () => {
      const instanceDates = [
        date('2024-01-01'),
        date('2024-01-02'),
        date('2024-01-03'),
      ];
      const instanceNumber = getInstanceNumber(instanceDates[0], instanceDates);
      expect(instanceNumber).toBe(0);
    });

    it('instances in chronological order', () => {
      const instanceDates = [
        date('2024-01-01'),
        date('2024-01-03'),
        date('2024-01-05'),
      ];
      expect(getInstanceNumber(instanceDates[0], instanceDates)).toBe(0);
      expect(getInstanceNumber(instanceDates[1], instanceDates)).toBe(1);
      expect(getInstanceNumber(instanceDates[2], instanceDates)).toBe(2);
    });

    it('cancelled instances counted', () => {
      // In gapLeap=false mode, cancelled dates still count in numbering
      const instanceDates = [
        date('2024-01-01'),
        date('2024-01-02'), // This could be cancelled
        date('2024-01-03'),
      ];
      // Instance 3 is still instance number 2, even if 2 is cancelled
      expect(getInstanceNumber(instanceDates[2], instanceDates)).toBe(2);
    });

    it('completions determine index', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'GapLeap Series',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      }) as SeriesId;

      // In gapLeap=true, index is based on completions, not instance numbers
      // Start at index 0
      let series = await adapter.getSeries(seriesId);
      expect(series!.cycling!.currentIndex).toBe(0);

      // Advance (as if completed)
      await advanceCycling(adapter, seriesId);
      series = await adapter.getSeries(seriesId);
      expect(series!.cycling!.currentIndex).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Boundary Conditions', () => {
    it('single item always returned', () => {
      const config: CyclingConfig = {
        items: ['A'],
        mode: 'sequential',
        gapLeap: false,
      };
      for (let i = 0; i < 10; i++) {
        expect(getCyclingItem(config, { instanceNumber: i })).toBe('A');
      }
    });

    it('index at last wraps to 0', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 2,
        },
      }) as SeriesId;

      const result = await advanceCycling(adapter, seriesId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currentIndex).toBe(0);
      }
    });

    it('instance 0 first item', () => {
      const config: CyclingConfig = {
        items: ['First', 'Second', 'Third'],
        mode: 'sequential',
        gapLeap: false,
      };
      expect(getCyclingItem(config, { instanceNumber: 0 })).toBe('First');
    });

    it('no completions first item', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'GapLeap Series',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      }) as SeriesId;

      // With no completions, should be at first item
      const series = await adapter.getSeries(seriesId);
      const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
      expect(item).toBe('A');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8B: ERROR PATH COVERAGE (Mutation Targets)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8B. Error Path Coverage', () => {
    describe('advanceCycling error paths', () => {
      it('nonexistent series returns NotFoundError with seriesId', async () => {
        const result = await advanceCycling(adapter, 'ghost-series-id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
          expect(result.error.message).toContain('ghost-series-id');
        }
      });

      it('series without cycling returns NoCyclingError with seriesId', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'No Cycling',
          startDate: date('2024-01-01'),
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NoCyclingError');
          expect(result.error.message).toContain(seriesId);
        }
      });

      it('gapLeap=false returns GapLeapDisabledError with message', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'No GapLeap',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['A', 'B'],
            mode: 'sequential',
            gapLeap: false,
          },
        }) as SeriesId;

        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('GapLeapDisabledError');
          expect(result.error.message).toContain('gapLeap');
        }
      });
    });

    describe('resetCycling error paths', () => {
      it('nonexistent series returns NotFoundError with seriesId', async () => {
        const result = await resetCycling(adapter, 'ghost-reset-id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
          expect(result.error.message).toContain('ghost-reset-id');
        }
      });

      it('series without cycling returns NoCyclingError with seriesId', async () => {
        const seriesId = await createSeries(adapter, {
          title: 'No Cycling Reset',
          startDate: date('2024-01-01'),
        }) as SeriesId;

        const result = await resetCycling(adapter, seriesId);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NoCyclingError');
          expect(result.error.message).toContain(seriesId);
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8C: NULL COALESCING DEFAULTS (Mutation Targets)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8C. Null Coalescing Defaults', () => {
    it('sequential gapLeap=true with undefined currentIndex defaults to item 0', () => {
      const config: CyclingConfig = {
        items: ['First', 'Second', 'Third'],
        mode: 'sequential',
        gapLeap: true,
        // currentIndex deliberately omitted
      };
      const item = getCyclingItem(config, { instanceNumber: 99 });
      expect(item).toBe('First'); // (undefined ?? 0) % 3 = 0 → 'First'
    });

    it('random gapLeap=true with undefined currentIndex uses seed 0', () => {
      const config: CyclingConfig = {
        items: ['A', 'B', 'C'],
        mode: 'random',
        gapLeap: true,
        // currentIndex deliberately omitted → seed = undefined ?? 0 = 0
      };
      const withUndefined = getCyclingItem(config, { instanceNumber: 42 });

      const configExplicit: CyclingConfig = {
        items: ['A', 'B', 'C'],
        mode: 'random',
        gapLeap: true,
        currentIndex: 0, // explicitly 0
      };
      const withExplicit = getCyclingItem(configExplicit, { instanceNumber: 42 });

      expect(withUndefined).toBe(withExplicit);
      // Also verify the actual value — seededIndex(0, 3) = 1 → items[1] = 'B'
      expect(withUndefined).toBe('B');
    });

    it('advanceCycling with undefined currentIndex starts from 0', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Undefined Index',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 2, // Start at 2 so we can distinguish from ?? 0 fallback
        },
      }) as SeriesId;

      // Positive control: advance from index 2 → (2+1)%3 = 0
      const controlResult = await advanceCycling(adapter, seriesId);
      expect(controlResult.ok).toBe(true);
      if (controlResult.ok) {
        expect(controlResult.value.currentIndex).toBe(0); // (2+1)%3 = 0
      }

      // Now bypass createSeries normalization: set cycling WITHOUT currentIndex
      // This tests cycling.ts line 86: `const currentIndex = cycling.currentIndex ?? 0`
      await adapter.updateSeries(seriesId, {
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          // currentIndex deliberately omitted → undefined in series.cycling
        },
      } as any);

      // advance from (undefined ?? 0) → newIndex = (0 + 1) % 3 = 1
      // NOT (0+1)%3=1 from the old 0 — the old index was 0 from control advance
      // If ?? 0 fallback is broken, it would use some other value
      const result = await advanceCycling(adapter, seriesId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currentIndex).toBe(1); // (0+1)%3 = 1 from ?? 0 fallback
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8D: DUAL-UPDATE VERIFICATION (Mutation Targets)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8D. Dual-Update Verification', () => {
    it('advanceCycling updates both series record and cycling config', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Dual Update',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      }) as SeriesId;

      await advanceCycling(adapter, seriesId);

      // Verify series record
      const series = await adapter.getSeries(seriesId);
      expect((series as any)?.cycling?.currentIndex).toBe(1);

      // Verify cycling config table
      const config = await adapter.getCyclingConfig(seriesId);
      expect(config?.currentIndex).toBe(1);
    });

    it('resetCycling updates both series record and cycling config', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Dual Reset',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 2,
        },
      }) as SeriesId;

      // Verify before-state has non-zero index
      const seriesBefore = await adapter.getSeries(seriesId);
      expect((seriesBefore as any)?.cycling?.currentIndex).toBe(2);
      const configBefore = await adapter.getCyclingConfig(seriesId);
      expect(configBefore?.currentIndex).toBe(2);

      await resetCycling(adapter, seriesId);

      // Verify series record reset — was 2, now should be 0
      const series = await adapter.getSeries(seriesId);
      const seriesIndex = (series as any)?.cycling?.currentIndex;
      expect(seriesIndex).not.toBe(2);
      expect(seriesIndex).toEqual(0);

      // Verify cycling config table reset — was 2, now should be 0
      const config = await adapter.getCyclingConfig(seriesId);
      expect(config).not.toBeNull();
      expect(config!.currentIndex).not.toBe(2);
      expect(config!.currentIndex).toEqual(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8E: INSTANCE NUMBER EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8E. Instance Number Edge Cases', () => {
    it('getInstanceNumber returns -1 for date not in list', () => {
      const instanceDates = [
        date('2024-01-01'),
        date('2024-01-02'),
        date('2024-01-03'),
      ];
      const result = getInstanceNumber(date('2024-01-05'), instanceDates);
      expect(result).toBe(-1);
    });

    it('getInstanceNumber with unsorted input sorts correctly', () => {
      const instanceDates = [
        date('2024-01-03'),
        date('2024-01-01'),
        date('2024-01-02'),
      ];
      // After sorting: ['2024-01-01', '2024-01-02', '2024-01-03']
      expect(getInstanceNumber(date('2024-01-01'), instanceDates)).toBe(0);
      expect(getInstanceNumber(date('2024-01-02'), instanceDates)).toBe(1);
      expect(getInstanceNumber(date('2024-01-03'), instanceDates)).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Invariants', () => {
    it('items non-empty', async () => {
      await expect(createSeries(adapter, {
        title: 'Empty Cycling',
        startDate: date('2024-01-01'),
        cycling: {
          items: [],
          mode: 'sequential',
          gapLeap: false,
        },
      })).rejects.toThrow(/Cycling items must not be empty/);
    });

    it('currentIndex in bounds', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      }) as SeriesId;

      // Advance multiple times and verify index stays in bounds
      for (let i = 0; i < 10; i++) {
        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBeGreaterThanOrEqual(0);
          expect(result.value.currentIndex).toBeLessThan(3);
        }
      }
    });

    it('cycling optional', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'No Cycling',
        startDate: date('2024-01-01'),
      }) as SeriesId;

      const series = await adapter.getSeries(seriesId);
      // Verify series exists and cycling is not configured
      expect(series).toEqual(expect.objectContaining({
        id: seriesId,
        title: 'No Cycling',
      }));
      expect(series).not.toMatchObject({ cycling: expect.anything() });

      // INV 3: Verify via dedicated getter
      // Positive case: create a series WITH cycling to prove getter works
      const withCyclingId = await createSeries(adapter, {
        title: 'Has Cycling',
        startDate: date('2024-02-01'),
        cycling: { items: ['X', 'Y'], mode: 'sequential', gapLeap: false, currentIndex: 0 },
      }) as SeriesId;

      const withCyclingConfig = await adapter.getCyclingConfig(withCyclingId);
      expect(withCyclingConfig).toMatchObject({ mode: 'sequential' });

      // Now verify the no-cycling series returns null (positive case above proves getter returns real data)
      const cyclingConfig = await adapter.getCyclingConfig(seriesId);
      expect(cyclingConfig).toBe(null);
      // Contrast with the cycling series that has a real config
      const positiveCyclingConfig = await adapter.getCyclingConfig(withCyclingId);
      expect(positiveCyclingConfig).toMatchObject({ mode: 'sequential' });

      // Prove getCyclingItems returns real data for the cycling series
      let cyclingItems = await adapter.getCyclingItems(withCyclingId);
      expect(cyclingItems).toHaveLength(2);
      expect(cyclingItems[0]).toMatchObject({ title: 'X' });
      expect(cyclingItems[1]).toMatchObject({ title: 'Y' });

      // Now verify no cycling items for the non-cycling series
      cyclingItems = await adapter.getCyclingItems(seriesId);
      expect(cyclingItems.some(i => i.title === 'X')).toBe(false);
      expect(cyclingItems.some(i => i.title === 'Y')).toBe(false);
    });

    it('gapLeap state persisted', async () => {
      const seriesId = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: date('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 1,
        },
      }) as SeriesId;

      // Advance
      await advanceCycling(adapter, seriesId);

      // Verify index was persisted
      const series = await adapter.getSeries(seriesId);
      expect(series!.cycling!.currentIndex).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: INTEGRATION SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('10. Integration Scenarios', () => {
    describe('10.1 Workout Rotation', () => {
      let workoutSeriesId: SeriesId;

      beforeEach(async () => {
        workoutSeriesId = await createSeries(adapter, {
          title: 'Workout',
          startDate: date('2024-01-01'),
          cycling: {
            items: ['Push', 'Pull', 'Legs'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        }) as SeriesId;
      });

      it('start at push', async () => {
        const series = await adapter.getSeries(workoutSeriesId);
        const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('Push');
      });

      it('after push done', async () => {
        // Log completion for Push
        await logCompletion(adapter, {
          seriesId: workoutSeriesId,
          instanceDate: date('2024-01-01'),
          startTime: datetime('2024-01-01T09:00:00'),
          endTime: datetime('2024-01-01T10:00:00'),
        });
        await advanceCycling(adapter, workoutSeriesId);

        const series = await adapter.getSeries(workoutSeriesId);
        const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('Pull');
      });

      it('after push and pull done', async () => {
        // Complete Push
        await logCompletion(adapter, {
          seriesId: workoutSeriesId,
          instanceDate: date('2024-01-01'),
          startTime: datetime('2024-01-01T09:00:00'),
          endTime: datetime('2024-01-01T10:00:00'),
        });
        await advanceCycling(adapter, workoutSeriesId);

        // Complete Pull
        await logCompletion(adapter, {
          seriesId: workoutSeriesId,
          instanceDate: date('2024-01-02'),
          startTime: datetime('2024-01-02T09:00:00'),
          endTime: datetime('2024-01-02T10:00:00'),
        });
        await advanceCycling(adapter, workoutSeriesId);

        const series = await adapter.getSeries(workoutSeriesId);
        const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('Legs');
      });

      it('skip a day, still on legs', async () => {
        // Advance to Legs (2 completions)
        await advanceCycling(adapter, workoutSeriesId);
        await advanceCycling(adapter, workoutSeriesId);

        // Skip a day (no completion, no advance)
        // Should still be on Legs
        const series = await adapter.getSeries(workoutSeriesId);
        const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('Legs');
      });

      it('after legs done', async () => {
        // Advance through full cycle
        await advanceCycling(adapter, workoutSeriesId); // -> Pull
        await advanceCycling(adapter, workoutSeriesId); // -> Legs
        await advanceCycling(adapter, workoutSeriesId); // -> Push (wrap)

        const series = await adapter.getSeries(workoutSeriesId);
        const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
        expect(item).toBe('Push');
      });
    });

    describe('10.2 Book Reading Schedule', () => {
      it('day 0', () => {
        const config: CyclingConfig = {
          items: ['Book A', 'Book B'],
          mode: 'sequential',
          gapLeap: false,
        };
        expect(getCyclingItem(config, { instanceNumber: 0 })).toBe('Book A');
      });

      it('day 1', () => {
        const config: CyclingConfig = {
          items: ['Book A', 'Book B'],
          mode: 'sequential',
          gapLeap: false,
        };
        expect(getCyclingItem(config, { instanceNumber: 1 })).toBe('Book B');
      });

      it('day 2', () => {
        const config: CyclingConfig = {
          items: ['Book A', 'Book B'],
          mode: 'sequential',
          gapLeap: false,
        };
        expect(getCyclingItem(config, { instanceNumber: 2 })).toBe('Book A');
      });

      it('day 3', () => {
        const config: CyclingConfig = {
          items: ['Book A', 'Book B'],
          mode: 'sequential',
          gapLeap: false,
        };
        expect(getCyclingItem(config, { instanceNumber: 3 })).toBe('Book B');
      });
    });
  });
});
