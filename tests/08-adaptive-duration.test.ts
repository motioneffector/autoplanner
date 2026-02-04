/**
 * Segment 08: Adaptive Duration
 *
 * Adaptive duration calculates scheduled duration based on historical completion times
 * rather than a fixed value. This enables schedules to automatically adjust to actual task durations.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateAdaptiveDuration,
  type AdaptiveDurationConfig,
} from '../src/adaptive-duration';
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
import type { SeriesId } from '../src/types';

describe('Segment 08: Adaptive Duration', () => {
  let adapter: MockAdapter;
  let testSeriesId: SeriesId;

  beforeEach(async () => {
    adapter = createMockAdapter();
    const result = await createSeries(adapter, {
      title: 'Test Series',
      startDate: parseDate('2024-01-01'),
    });
    if (!result.ok) throw new Error('Failed to create test series');
    testSeriesId = result.value.id;
  });

  // Helper to log a completion with a specific duration
  async function logCompletionWithDuration(
    seriesId: SeriesId,
    date: string,
    durationMinutes: number
  ): Promise<void> {
    const d = parseDate(date);
    const startTime = parseDateTime(`${date}T09:00:00`);
    const endMinutes = 9 * 60 + durationMinutes;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const endTimeStr = `${date}T${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}:00`;
    const endTime = parseDateTime(endTimeStr);

    await logCompletion(adapter, {
      seriesId,
      instanceDate: d,
      startTime,
      endTime,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: FALLBACK BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Fallback Behavior', () => {
    it('no completions returns fallback', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 5 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(30);
    });

    it('fallback when window empty', async () => {
      // Log completion outside the window
      await logCompletionWithDuration(testSeriesId, '2024-01-01', 45);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'windowDays', days: 7 },
        fallback: 30,
        multiplier: 1.0,
      };

      // Query from date far after the completion
      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-02-01'));
      expect(result).toBe(30);
    });

    it('fallback value used exactly', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 5 },
        fallback: 45,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: AVERAGE CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Average Calculation', () => {
    describe('2.1 Basic Average Tests', () => {
      it('average of 3 durations', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
        await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 3 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(60);
      });

      it('average of 2 durations', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 20);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 2 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(15);
      });

      it('average of single duration', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 45);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 5 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(45);
      });

      it('average with varying values', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 20);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 40);
        await logCompletionWithDuration(testSeriesId, '2024-01-17', 30);
        await logCompletionWithDuration(testSeriesId, '2024-01-18', 50);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 4 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(35);
      });
    });

    describe('2.2 Rounding Tests', () => {
      it('rounds to nearest integer', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 11);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 2 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(11); // 10.5 rounds up
      });

      it('rounds down at .4', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 10);
        await logCompletionWithDuration(testSeriesId, '2024-01-17', 11);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 3 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(10); // 10.33 rounds to 10
      });

      it('rounds up at .5', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
        await logCompletionWithDuration(testSeriesId, '2024-01-16', 11);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 2 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(11); // 10.5 rounds to 11
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: MULTIPLIER APPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Multiplier Application', () => {
    it('multiplier 1.0 no change', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('multiplier 1.25 adds 25%', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.25,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(75);
    });

    it('multiplier 0.5 halves', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 0.5,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(30);
    });

    it('multiplier 2.0 doubles', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 2.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('multiplier applied before bounds', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 40);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.5,
      };

      // 40 * 1.5 = 60 (before any clamping)
      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: MINIMUM AND MAXIMUM BOUNDS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Minimum and Maximum Bounds', () => {
    describe('4.1 Minimum Bound Tests', () => {
      it('above minimum unchanged', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(60);
      });

      it('below minimum clamped up', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(45);
      });

      it('equals minimum unchanged', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 45);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(45);
      });
    });

    describe('4.2 Maximum Bound Tests', () => {
      it('below maximum unchanged', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(60);
      });

      it('above maximum clamped down', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 120);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(90);
      });

      it('equals maximum unchanged', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 90);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(90);
      });
    });

    describe('4.3 Combined Bounds Tests', () => {
      it('min and max both apply', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(60);
      });

      it('minimum equals maximum', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 50,
          maximum: 50,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(50);
      });

      it('clamped to minimum when both set', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(45);
      });

      it('clamped to maximum when both set', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 120);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.0,
          minimum: 45,
          maximum: 90,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(90);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: POSITIVE RESULT GUARANTEE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Positive Result Guarantee', () => {
    it('result always positive', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it('zero duration clamped to 1', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 0);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(1);
    });

    it('all zero durations clamped', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 0);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 0);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 0);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(1);
    });

    it('very small average clamped', async () => {
      // Can't easily create fractional durations, but test the principle
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 1);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 0.3,
      };

      // 1 * 0.3 = 0.3, should clamp to 1
      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: MODE: lastN
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Mode: lastN', () => {
    it('uses n most recent', async () => {
      // Log 10 completions with durations 10, 20, 30, ..., 100
      for (let i = 1; i <= 10; i++) {
        await logCompletionWithDuration(testSeriesId, `2024-01-${i.toString().padStart(2, '0')}`, i * 10);
      }

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 5 },
        fallback: 30,
        multiplier: 1.0,
      };

      // Most recent 5: 60, 70, 80, 90, 100 -> avg = 80
      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(80);
    });

    it('fewer than n uses all', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 10 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('order doesnt affect average', async () => {
      // Log completions in non-chronological order of values
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('most recent by date', async () => {
      // Log completions on different dates
      await logCompletionWithDuration(testSeriesId, '2024-01-10', 100); // Old - excluded
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 2 },
        fallback: 30,
        multiplier: 1.0,
      };

      // Should use the 2 most recent: 30, 60 -> avg = 45
      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: MODE: windowDays
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Mode: windowDays', () => {
    it('uses completions in window', async () => {
      const asOf = parseDate('2024-01-20');
      // 3 completions in 7-day window
      await logCompletionWithDuration(testSeriesId, '2024-01-18', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-19', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-20', 90);
      // 2 completions outside window
      await logCompletionWithDuration(testSeriesId, '2024-01-01', 10);
      await logCompletionWithDuration(testSeriesId, '2024-01-02', 20);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'windowDays', days: 7 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, asOf);
      expect(result).toBe(60); // Average of 30, 60, 90
    });

    it('window includes today', async () => {
      const asOf = parseDate('2024-01-20');
      await logCompletionWithDuration(testSeriesId, '2024-01-20', 45);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'windowDays', days: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, asOf);
      expect(result).toBe(45);
    });

    it('empty window returns fallback', async () => {
      // Log completion far in the past
      await logCompletionWithDuration(testSeriesId, '2023-12-01', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'windowDays', days: 30 },
        fallback: 45,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });

    it('boundary: first day of window', async () => {
      const asOf = parseDate('2024-01-20');
      // Completion exactly at window start (7-day window: 2024-01-14 to 2024-01-20)
      await logCompletionWithDuration(testSeriesId, '2024-01-14', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'windowDays', days: 7 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, asOf);
      expect(result).toBe(60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Boundary Conditions', () => {
    it('B1: multiplier 1.0', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 50);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(50);
    });

    it('B2: multiplier 1.25', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 40);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.25,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(50);
    });

    it('B3: min equals max', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 50,
        maximum: 50,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(50);
    });

    it('B4: min exceeds calculated', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 45,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });

    it('B5: max below calculated', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 100);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
        maximum: 90,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(90);
    });

    it('B6: single completion', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 45);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });

    it('B7: zero duration completion', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 0);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(1);
    });

    it('B8: all zero durations', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 0);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 0);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 2 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Invariants', () => {
    it('INV 1: fallback >= 1', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 0,
        multiplier: 1.0,
      };

      // Should either throw or clamp fallback to 1
      await expect(async () => {
        await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      }).rejects.toThrow(ValidationError);
    });

    it('INV 2: minimum <= maximum', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 100,
        maximum: 50,
      };

      await expect(async () => {
        await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      }).rejects.toThrow(ValidationError);
    });

    it('INV 3: multiplier > 0', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 30,
        multiplier: 0,
      };

      await expect(async () => {
        await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      }).rejects.toThrow(ValidationError);
    });

    it('INV 4: value >= 1', async () => {
      // This is implicitly tested by the positive result tests
      // The result should always be >= 1
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 1);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 1 },
        fallback: 1,
        multiplier: 0.1,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: KNOWN ANSWER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('10. Known Answer Tests', () => {
    it('[30, 60, 90], mult=1.0, no bounds -> 60', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('[30, 60, 90], mult=1.25, no bounds -> 75', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.25,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(75);
    });

    it('[30, 60, 90], mult=1.0, min=45, max=90 -> 60', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 45,
        maximum: 90,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(60);
    });

    it('[30, 60, 90], mult=1.0, min=75, max=100 -> 75', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 75,
        maximum: 100,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(75);
    });

    it('[30, 60, 90], mult=1.0, min=30, max=50 -> 50', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 30);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 60);
      await logCompletionWithDuration(testSeriesId, '2024-01-17', 90);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 3 },
        fallback: 30,
        multiplier: 1.0,
        minimum: 30,
        maximum: 50,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(50);
    });

    it('[10, 20], mult=1.0, no bounds -> 15', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 20);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 2 },
        fallback: 30,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(15);
    });

    it('[10, 20], mult=2.0, no bounds -> 30', async () => {
      await logCompletionWithDuration(testSeriesId, '2024-01-15', 10);
      await logCompletionWithDuration(testSeriesId, '2024-01-16', 20);

      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 2 },
        fallback: 30,
        multiplier: 2.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(30);
    });

    it('no completions, fallback=45 -> 45', async () => {
      const config: AdaptiveDurationConfig = {
        mode: { type: 'lastN', n: 5 },
        fallback: 45,
        multiplier: 1.0,
      };

      const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
      expect(result).toBe(45);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: REAL-WORLD SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('11. Real-World Scenarios', () => {
    describe('11.1 Workout Duration Adaptation', () => {
      it('adapt to recent workouts', async () => {
        // Last 5 workouts: 45, 50, 55, 40, 60
        await logCompletionWithDuration(testSeriesId, '2024-01-11', 45);
        await logCompletionWithDuration(testSeriesId, '2024-01-12', 50);
        await logCompletionWithDuration(testSeriesId, '2024-01-13', 55);
        await logCompletionWithDuration(testSeriesId, '2024-01-14', 40);
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 5 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(50);
      });

      it('new workout starts at fallback', async () => {
        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 5 },
          fallback: 30,
          multiplier: 1.0,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(30);
      });
    });

    describe('11.2 Padding for Transitions', () => {
      it('25% buffer for transitions', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 40);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.25,
        };

        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(50);
      });

      it('buffer respects maximum', async () => {
        await logCompletionWithDuration(testSeriesId, '2024-01-15', 60);

        const config: AdaptiveDurationConfig = {
          mode: { type: 'lastN', n: 1 },
          fallback: 30,
          multiplier: 1.25,
          maximum: 70,
        };

        // 60 * 1.25 = 75, clamped to 70
        const result = await calculateAdaptiveDuration(adapter, testSeriesId, config, parseDate('2024-01-20'));
        expect(result).toBe(70);
      });
    });
  });
});
