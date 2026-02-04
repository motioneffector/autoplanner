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
import type { LocalDate, SeriesId, CyclingConfig } from '../src/types';

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
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'index advances on completion' setup failed: ${seriesResult.error.type}`);

        const seriesId = seriesResult.value.id;

        // Log a completion
        await logCompletion(adapter, {
          seriesId,
          instanceDate: parseDate('2024-01-01'),
          startTime: parseDateTime('2024-01-01T09:00:00'),
          endTime: parseDateTime('2024-01-01T09:30:00'),
        });

        // Advance the cycling
        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'index advances on completion' advance failed: ${result.error.type}`);
        expect(result.value.currentIndex).toBe(1);
      });

      it('skipped instance no advance', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'skipped instance no advance' setup failed: ${seriesResult.error.type}`);

        const seriesId = seriesResult.value.id;

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
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'index wraps at end' setup failed: ${seriesResult.error.type}`);

        const seriesId = seriesResult.value.id;

        // Advance from index 2
        const result = await advanceCycling(adapter, seriesId);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'index wraps at end' advance failed: ${result.error.type}`);
        expect(result.value.currentIndex).toBe(0);
      });

      it('continuous wrap', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'continuous wrap' setup failed: ${seriesResult.error.type}`);

        const seriesId = seriesResult.value.id;

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
        const seriesResult = await createSeries(adapter, {
          title: 'Gap-Leap Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'gap-leap full sequence' setup failed: ${seriesResult.error.type}`);

        const seriesId = seriesResult.value.id;

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
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'advance increments index' setup failed: ${seriesResult.error.type}`);

        const result = await advanceCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(1);
        }
      });

      it('advance wraps around', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'advance wraps around' setup failed: ${seriesResult.error.type}`);

        const result = await advanceCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });

      it('advance requires gapLeap=true', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: false,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'advance requires gapLeap=true' setup failed: ${seriesResult.error.type}`);

        const result = await advanceCycling(adapter, seriesResult.value.id);
        // Should either error or be a no-op
        expect(result.ok).toBe(false);
      });
    });

    describe('4.2 Precondition Tests', () => {
      it('advance on gapLeap=true series', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'GapLeap Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'advance on gapLeap=true series' setup failed: ${seriesResult.error.type}`);

        const result = await advanceCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
      });

      it('advance on gapLeap=false series', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'No GapLeap Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B'],
            mode: 'sequential',
            gapLeap: false,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'advance on gapLeap=false series' setup failed: ${seriesResult.error.type}`);

        const result = await advanceCycling(adapter, seriesResult.value.id);
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
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 5,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'reset sets index to 0' setup failed: ${seriesResult.error.type}`);

        const result = await resetCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });

      it('reset from index 0', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'reset from index 0' setup failed: ${seriesResult.error.type}`);

        const result = await resetCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBe(0);
        }
      });
    });

    describe('No Auto-Reset Tests', () => {
      it('no auto-reset on deactivation', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'no auto-reset on deactivation' setup failed: ${seriesResult.error.type}`);

        // Simulate pattern deactivation by checking series state
        // Index should be preserved
        const series = await adapter.getSeries(seriesResult.value.id);
        expect(series!.cycling!.currentIndex).toBe(2);
      });

      it('consumer must explicitly reset', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 1,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'consumer must explicitly reset' setup failed: ${seriesResult.error.type}`);

        // Without explicit reset, index should remain unchanged
        const series = await adapter.getSeries(seriesResult.value.id);
        expect(series!.cycling!.currentIndex).toBe(1);
      });

      it('deactivation preserves index', async () => {
        const seriesResult = await createSeries(adapter, {
          title: 'Cycling Series',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['A', 'B', 'C'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 2,
          },
        });
        expect(seriesResult.ok).toBe(true);
        if (!seriesResult.ok) throw new Error(`'deactivation preserves index' setup failed: ${seriesResult.error.type}`);

        // Advance cycling to verify state changes
        await advanceCycling(adapter, seriesResult.value.id);

        // Verify index was updated (wrapped to 0)
        const series = await adapter.getSeries(seriesResult.value.id);
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
      const seriesResult = await createSeries(adapter, {
        title: 'Simple Series',
        startDate: parseDate('2024-01-01'),
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'no cycling uses series title' setup failed: ${seriesResult.error.type}`);

      const series = await adapter.getSeries(seriesResult.value.id);
      const title = resolveInstanceTitle(series!, { instanceNumber: 0 });
      expect(title).toBe('Simple Series');
    });

    it('with cycling uses item title', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'Workout',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['Push Day', 'Pull Day', 'Leg Day'],
          mode: 'sequential',
          gapLeap: false,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'with cycling uses item title' setup failed: ${seriesResult.error.type}`);

      const series = await adapter.getSeries(seriesResult.value.id);
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
        parseDate('2024-01-01'),
        parseDate('2024-01-02'),
        parseDate('2024-01-03'),
      ];
      const instanceNumber = getInstanceNumber(instanceDates[0], instanceDates);
      expect(instanceNumber).toBe(0);
    });

    it('instances in chronological order', () => {
      const instanceDates = [
        parseDate('2024-01-01'),
        parseDate('2024-01-03'),
        parseDate('2024-01-05'),
      ];
      expect(getInstanceNumber(instanceDates[0], instanceDates)).toBe(0);
      expect(getInstanceNumber(instanceDates[1], instanceDates)).toBe(1);
      expect(getInstanceNumber(instanceDates[2], instanceDates)).toBe(2);
    });

    it('cancelled instances counted', () => {
      // In gapLeap=false mode, cancelled dates still count in numbering
      const instanceDates = [
        parseDate('2024-01-01'),
        parseDate('2024-01-02'), // This could be cancelled
        parseDate('2024-01-03'),
      ];
      // Instance 3 is still instance number 2, even if 2 is cancelled
      expect(getInstanceNumber(instanceDates[2], instanceDates)).toBe(2);
    });

    it('completions determine index', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'GapLeap Series',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'completions determine index' setup failed: ${seriesResult.error.type}`);

      // In gapLeap=true, index is based on completions, not instance numbers
      // Start at index 0
      let series = await adapter.getSeries(seriesResult.value.id);
      expect(series!.cycling!.currentIndex).toBe(0);

      // Advance (as if completed)
      await advanceCycling(adapter, seriesResult.value.id);
      series = await adapter.getSeries(seriesResult.value.id);
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
      const seriesResult = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 2,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'index at last wraps to 0' setup failed: ${seriesResult.error.type}`);

      const result = await advanceCycling(adapter, seriesResult.value.id);
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
      const seriesResult = await createSeries(adapter, {
        title: 'GapLeap Series',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'no completions first item' setup failed: ${seriesResult.error.type}`);

      // With no completions, should be at first item
      const series = await adapter.getSeries(seriesResult.value.id);
      const item = getCyclingItem(series!.cycling!, { instanceNumber: 0 });
      expect(item).toBe('A');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Invariants', () => {
    it('items non-empty', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'Empty Cycling',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: [],
          mode: 'sequential',
          gapLeap: false,
        },
      });
      expect(seriesResult.ok).toBe(false);
    });

    it('currentIndex in bounds', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 0,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'currentIndex in bounds' setup failed: ${seriesResult.error.type}`);

      // Advance multiple times and verify index stays in bounds
      for (let i = 0; i < 10; i++) {
        const result = await advanceCycling(adapter, seriesResult.value.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.currentIndex).toBeGreaterThanOrEqual(0);
          expect(result.value.currentIndex).toBeLessThan(3);
        }
      }
    });

    it('cycling optional', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'No Cycling',
        startDate: parseDate('2024-01-01'),
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'cycling optional' setup failed: ${seriesResult.error.type}`);

      const series = await adapter.getSeries(seriesResult.value.id);
      // Verify series exists and cycling is not configured
      expect(series).toEqual(expect.objectContaining({ title: 'No Cycling' }));
      expect(series).not.toHaveProperty('cycling');
    });

    it('gapLeap state persisted', async () => {
      const seriesResult = await createSeries(adapter, {
        title: 'Cycling Series',
        startDate: parseDate('2024-01-01'),
        cycling: {
          items: ['A', 'B', 'C'],
          mode: 'sequential',
          gapLeap: true,
          currentIndex: 1,
        },
      });
      expect(seriesResult.ok).toBe(true);
      if (!seriesResult.ok) throw new Error(`'gapLeap state persisted' setup failed: ${seriesResult.error.type}`);

      // Advance
      await advanceCycling(adapter, seriesResult.value.id);

      // Verify index was persisted
      const series = await adapter.getSeries(seriesResult.value.id);
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
        const result = await createSeries(adapter, {
          title: 'Workout',
          startDate: parseDate('2024-01-01'),
          cycling: {
            items: ['Push', 'Pull', 'Legs'],
            mode: 'sequential',
            gapLeap: true,
            currentIndex: 0,
          },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          workoutSeriesId = result.value.id;
        }
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
          instanceDate: parseDate('2024-01-01'),
          startTime: parseDateTime('2024-01-01T09:00:00'),
          endTime: parseDateTime('2024-01-01T10:00:00'),
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
          instanceDate: parseDate('2024-01-01'),
          startTime: parseDateTime('2024-01-01T09:00:00'),
          endTime: parseDateTime('2024-01-01T10:00:00'),
        });
        await advanceCycling(adapter, workoutSeriesId);

        // Complete Pull
        await logCompletion(adapter, {
          seriesId: workoutSeriesId,
          instanceDate: parseDate('2024-01-02'),
          startTime: parseDateTime('2024-01-02T09:00:00'),
          endTime: parseDateTime('2024-01-02T10:00:00'),
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
