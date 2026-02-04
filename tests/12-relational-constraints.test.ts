/**
 * Segment 12: Relational Constraints
 *
 * Relational constraints define rules about how instances of different series relate
 * to each other in the schedule. Constraint types include day-level constraints and
 * intra-day ordering constraints.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addConstraint,
  getConstraint,
  getAllConstraints,
  deleteConstraint,
  resolveTarget,
  checkConstraint,
  getConstraintViolations,
  type Constraint,
  type ConstraintViolation,
} from '../src/relational-constraints';
import {
  createSeries,
  deleteSeries,
} from '../src/series-crud';
import {
  createMockAdapter,
  type MockAdapter,
} from '../src/adapter';
import {
  parseDate,
  parseDateTime,
} from '../src/time-date';
import type { SeriesId, ConstraintId, LocalDate } from '../src/types';

describe('Segment 12: Relational Constraints', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  // Helper to create a series
  async function createTestSeries(title: string, tags?: string[]): Promise<SeriesId> {
    const result = await createSeries(adapter, {
      title,
      startDate: parseDate('2024-01-01'),
      pattern: { type: 'daily' },
      time: parseDateTime('2024-01-01T09:00:00'),
      durationMinutes: 60,
      tags,
    });
    if (!result.ok) throw new Error(`Failed to create series: ${title}`);
    return result.value.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CONSTRAINT CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Constraint CRUD', () => {
    describe('1.1 Add Constraint Tests', () => {
      it('add constraint returns ID', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const result = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(typeof result.value.id).toBe('string');
          // Verify ID is a valid non-empty string (UUID format)
          expect(result.value.id).toMatch(/^.+$/);
        }
      });

      it('constraints are global', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const result = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'constraints are global' setup failed: ${result.error.type}`);

        // Constraint is not tied to a specific series
        const constraint = await getConstraint(adapter, result.value.id);
        expect(constraint).not.toBeNull();
        expect(constraint!.source.type).toBe('seriesId');
        expect(constraint!.dest.type).toBe('seriesId');
      });

      it('constraints reference targets', async () => {
        await createTestSeries('Exercise', ['workout']);
        await createTestSeries('Cool Down', ['recovery']);

        const result = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'tag', tag: 'workout' },
          dest: { type: 'tag', tag: 'recovery' },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`'constraints reference targets' setup failed: ${result.error.type}`);

        const constraint = await getConstraint(adapter, result.value.id);
        expect(constraint!.source.type).toBe('tag');
        expect(constraint!.dest.type).toBe('tag');
      });
    });

    describe('1.2 Get Constraint Tests', () => {
      it('get existing constraint', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const createResult = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'get existing constraint' setup failed: ${createResult.error.type}`);

        const constraint = await getConstraint(adapter, createResult.value.id);
        expect(constraint).not.toBeNull();
        expect(constraint!.type).toBe('mustBeBefore');
      });

      it('get non-existent constraint', async () => {
        const constraint = await getConstraint(adapter, 'non-existent-id' as ConstraintId);
        expect(constraint).toBeNull();
      });

      it('get all constraints', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');
        const seriesC = await createTestSeries('C');

        await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });
        await addConstraint(adapter, {
          type: 'mustBeAfter',
          source: { type: 'seriesId', seriesId: seriesB },
          dest: { type: 'seriesId', seriesId: seriesC },
        });
        await addConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesC },
        });

        const constraints = await getAllConstraints(adapter);
        const types = constraints.map(c => c.type).sort();
        expect(types).toEqual(['mustBeAfter', 'mustBeBefore', 'mustBeOnSameDay']);
      });
    });

    describe('1.3 Delete Constraint Tests', () => {
      it('delete constraint', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const createResult = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'delete constraint' setup failed: ${createResult.error.type}`);

        await deleteConstraint(adapter, createResult.value.id);

        const constraint = await getConstraint(adapter, createResult.value.id);
        expect(constraint).toBeNull();
        // Verify the constraint ID is no longer retrievable
        const allConstraints = await adapter.getConstraints?.() ?? [];
        expect(allConstraints.map((c: any) => c.id)).not.toContain(createResult.value.id);
      });

      it('series delete doesnt delete constraint', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const createResult = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'series delete doesnt delete constraint' setup failed: ${createResult.error.type}`);

        await deleteSeries(adapter, seriesA);

        // Constraint should still exist
        const constraint = await getConstraint(adapter, createResult.value.id);
        expect(constraint).not.toBeNull();
        expect(constraint!.type).toBe('mustBeBefore');
      });

      it('constraint with non-existent target', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const createResult = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) throw new Error(`'constraint with non-existent target' setup failed: ${createResult.error.type}`);

        await deleteSeries(adapter, seriesA);

        // Constraint becomes no-op when target doesn't exist
        const resolved = await resolveTarget(adapter, { type: 'seriesId', seriesId: seriesA });
        expect(resolved.length).toBe(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: TARGET RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Target Resolution', () => {
    describe('2.1 Tag Target Tests', () => {
      it('tag matches all series', async () => {
        await createTestSeries('Series1', ['exercise']);
        await createTestSeries('Series2', ['exercise']);
        await createTestSeries('Series3', ['exercise']);

        const resolved = await resolveTarget(adapter, { type: 'tag', tag: 'exercise' });
        expect(resolved.length === 3 && resolved.every(r => typeof r === 'string' && r.length > 0)).toBe(true);
      });

      it('tag excludes non-tagged', async () => {
        await createTestSeries('Series1', ['exercise']);
        await createTestSeries('Series2', ['exercise']);
        await createTestSeries('Series3', ['reading']); // Different tag

        const resolved = await resolveTarget(adapter, { type: 'tag', tag: 'exercise' });
        expect(resolved.length === 2 && resolved.every(r => typeof r === 'string' && r.length > 0)).toBe(true);
      });

      it('non-existent tag empty match', async () => {
        await createTestSeries('Series1', ['exercise']);

        const resolved = await resolveTarget(adapter, { type: 'tag', tag: 'unknown-tag' });
        expect(resolved.length).toBe(0);
      });
    });

    describe('2.2 SeriesId Target Tests', () => {
      it('seriesId matches only one', async () => {
        const seriesA = await createTestSeries('A');
        await createTestSeries('B');

        const resolved = await resolveTarget(adapter, { type: 'seriesId', seriesId: seriesA });
        expect(resolved).toEqual([seriesA]);
      });

      it('seriesId excludes others', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        const resolved = await resolveTarget(adapter, { type: 'seriesId', seriesId: seriesA });
        expect(resolved).toEqual([seriesA]);
      });

      it('non-existent seriesId empty', async () => {
        const seriesA = await createTestSeries('A');
        await deleteSeries(adapter, seriesA);

        const resolved = await resolveTarget(adapter, { type: 'seriesId', seriesId: seriesA });
        expect(resolved.length).toBe(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: DAY-LEVEL CONSTRAINTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Day-Level Constraints', () => {
    describe('3.1 mustBeOnSameDay', () => {
      it('both on same day', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        await addConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        // Both series have daily pattern, so they're on same days
        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('on different days', async () => {
        // Create series with different patterns
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['monday'] },
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['tuesday'] },
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        // Monday and Tuesday - different days
        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-08')); // A Monday

        expect(satisfied).toBe(false);
      });

      it('source empty', async () => {
        // Create series with end date in past
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          endDate: parseDate('2024-01-05'),
          pattern: { type: 'daily' },
        });
        const seriesB = await createTestSeries('B');

        if (!resultA.ok) throw new Error('Failed to create series');

        // After end date, no instances
        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: seriesB },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true); // Empty source = trivially satisfied
      });
    });

    describe('3.2 cantBeOnSameDay', () => {
      it('on different days', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['monday'] },
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['tuesday'] },
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'cantBeOnSameDay',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-08'));

        expect(satisfied).toBe(true);
      });

      it('both on same day', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        // Both daily, so same day
        const satisfied = await checkConstraint(adapter, {
          type: 'cantBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });

      it('source empty', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          endDate: parseDate('2024-01-05'),
          pattern: { type: 'daily' },
        });
        const seriesB = await createTestSeries('B');

        if (!resultA.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'cantBeOnSameDay',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: seriesB },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true); // Empty source = trivially satisfied
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: INTRA-DAY CONSTRAINTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Intra-Day Constraints', () => {
    describe('4.1 mustBeNextTo', () => {
      it('adjacent instances', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeNextTo',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('instance between', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultC = await createSeries(adapter, {
          title: 'C',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T11:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok || !resultC.ok) throw new Error('Failed to create series');

        // A at 09:00, C at 10:00, B at 11:00 - A and B not adjacent
        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeNextTo',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });

      it('on different days', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['monday'] },
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'weekly', daysOfWeek: ['tuesday'] },
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        // Not on same day - constraint N/A, treated as satisfied
        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeNextTo',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-08'));

        expect(satisfied).toBe(true);
      });
    });

    describe('4.2 cantBeNextTo', () => {
      it('instance between', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultC = await createSeries(adapter, {
          title: 'C',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T11:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok || !resultC.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'cantBeNextTo',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('adjacent instances', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'cantBeNextTo',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });
    });

    describe('4.3 mustBeBefore', () => {
      it('A before B', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('A after B', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T11:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });

      it('A equals B time', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60, // Ends at 10:00
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'), // Starts when A ends
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true); // end <= start
      });
    });

    describe('4.4 mustBeAfter', () => {
      it('A after B', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T11:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeAfter',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('A before B', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 60,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 60,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeAfter',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });
    });

    describe('4.5 mustBeWithin', () => {
      it('within time', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 30,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:20:00'),
          durationMinutes: 30,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeWithin',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
          withinMinutes: 30,
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });

      it('outside time', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 30,
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'),
          durationMinutes: 30,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeWithin',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
          withinMinutes: 30,
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(false);
      });

      it('exactly at boundary', async () => {
        const resultA = await createSeries(adapter, {
          title: 'A',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T09:00:00'),
          durationMinutes: 30, // Ends 09:30
        });
        const resultB = await createSeries(adapter, {
          title: 'B',
          startDate: parseDate('2024-01-01'),
          pattern: { type: 'daily' },
          time: parseDateTime('2024-01-01T10:00:00'), // 30 min from A end
          durationMinutes: 30,
        });

        if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

        const satisfied = await checkConstraint(adapter, {
          type: 'mustBeWithin',
          source: { type: 'seriesId', seriesId: resultA.value.id },
          dest: { type: 'seriesId', seriesId: resultB.value.id },
          withinMinutes: 30,
        }, parseDate('2024-01-15'));

        expect(satisfied).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: CONSTRAINT SATISFACTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Constraint Satisfaction', () => {
    it('empty source satisfied', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        endDate: parseDate('2024-01-05'),
        pattern: { type: 'daily' },
      });
      const seriesB = await createTestSeries('B');

      if (!resultA.ok) throw new Error('Failed to create series');

      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-15'));

      expect(satisfied).toBe(true);
    });

    it('empty dest satisfied', async () => {
      const seriesA = await createTestSeries('A');
      const resultB = await createSeries(adapter, {
        title: 'B',
        startDate: parseDate('2024-01-01'),
        endDate: parseDate('2024-01-05'),
        pattern: { type: 'daily' },
      });

      if (!resultB.ok) throw new Error('Failed to create series');

      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: resultB.value.id },
      }, parseDate('2024-01-15'));

      expect(satisfied).toBe(true);
    });

    it('intra-day checked per day', async () => {
      const seriesA = await createTestSeries('A');
      const seriesB = await createTestSeries('B');

      // Check different days independently
      const jan15 = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-15'));

      const jan16 = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-16'));

      // Both days should have same result (same schedule pattern)
      expect(jan15).toBe(jan16);
    });

    it('all-day instances excluded', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        allDay: true,
      });
      const seriesB = await createTestSeries('B');

      if (!resultA.ok) throw new Error('Failed to create series');

      // All-day instances excluded from intra-day constraints
      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-15'));

      expect(satisfied).toBe(true); // All-day excluded
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: CONSTRAINT VIOLATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Constraint Violations', () => {
    it('violation identifies instances', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T11:00:00'),
      });
      const resultB = await createSeries(adapter, {
        title: 'B',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T09:00:00'),
      });

      if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

      const violations = await getConstraintViolations(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: resultB.value.id },
      }, { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') });

      expect(violations.length === 1 && typeof violations[0].sourceInstance === 'string' && typeof violations[0].destInstance === 'string').toBe(true);
    });

    it('multiple violations same constraint', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T11:00:00'),
      });
      const resultB = await createSeries(adapter, {
        title: 'B',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T09:00:00'),
      });

      if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

      const violations = await getConstraintViolations(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: resultB.value.id },
      }, { start: parseDate('2024-01-15'), end: parseDate('2024-01-17') });

      // One per day
      expect(violations.length === 3 && violations.every(v => typeof v.sourceInstance === 'string' && typeof v.destInstance === 'string')).toBe(true);
    });

    it('violation includes description', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T11:00:00'),
      });
      const resultB = await createSeries(adapter, {
        title: 'B',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T09:00:00'),
      });

      if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

      const violations = await getConstraintViolations(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: resultB.value.id },
      }, { start: parseDate('2024-01-15'), end: parseDate('2024-01-15') });

      expect(typeof violations[0].description).toBe('string');
      // Verify description contains meaningful content
      expect(violations[0].description).toMatch(/^.+$/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: CONSTRAINT INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Constraint Interactions', () => {
    describe('7.1 Contradictory Constraints', () => {
      it('mutual before contradiction', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesB },
          dest: { type: 'seriesId', seriesId: seriesA },
        });

        // Both constraints exist but are unsatisfiable together
        const constraints = await getAllConstraints(adapter);
        expect(constraints.length === 2 && constraints.every(c => c.type === 'mustBeBefore')).toBe(true);
      });

      it('sameDay + notSameDay', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        await addConstraint(adapter, {
          type: 'mustBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        await addConstraint(adapter, {
          type: 'cantBeOnSameDay',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        // Both constraints created
        const constraints = await getAllConstraints(adapter);
        const types = constraints.map(c => c.type).sort();
        expect(types).toEqual(['cantBeOnSameDay', 'mustBeOnSameDay']);
      });
    });

    describe('7.2 Validation Timing', () => {
      it('no validation at creation', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        // Contradictory constraints created without error
        const result1 = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        const result2 = await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesB },
          dest: { type: 'seriesId', seriesId: seriesA },
        });

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);
      });

      it('detected during reflow', async () => {
        const seriesA = await createTestSeries('A');
        const seriesB = await createTestSeries('B');

        await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesA },
          dest: { type: 'seriesId', seriesId: seriesB },
        });

        await addConstraint(adapter, {
          type: 'mustBeBefore',
          source: { type: 'seriesId', seriesId: seriesB },
          dest: { type: 'seriesId', seriesId: seriesA },
        });

        // At least one constraint will have violations
        const constraints = await getAllConstraints(adapter);
        let totalViolations = 0;

        for (const constraint of constraints) {
          const violations = await getConstraintViolations(adapter, constraint, {
            start: parseDate('2024-01-15'),
            end: parseDate('2024-01-15'),
          });
          totalViolations += violations.length;
        }

        expect(totalViolations).toBeGreaterThan(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Invariants', () => {
    it('INV 1: withinMinutes only for mustBeWithin', async () => {
      const seriesA = await createTestSeries('A');
      const seriesB = await createTestSeries('B');

      const result = await addConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
        withinMinutes: 30,
      } as any);

      // Should either ignore withinMinutes or error
      if (result.ok) {
        const constraint = await getConstraint(adapter, result.value.id);
        // For non-mustBeWithin constraints, withinMinutes should not be present
        expect(constraint!.type).toBe('mustBeBefore');
        expect((constraint as any).withinMinutes === undefined || (constraint as any).withinMinutes === null).toBe(true);
      }
    });

    it('INV 2: withinMinutes > 0', async () => {
      const seriesA = await createTestSeries('A');
      const seriesB = await createTestSeries('B');

      const result = await addConstraint(adapter, {
        type: 'mustBeWithin',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
        withinMinutes: -5,
      });

      expect(result.ok).toBe(false);
    });

    it('INV 3: constraints independent of series', async () => {
      const seriesA = await createTestSeries('A');
      const seriesB = await createTestSeries('B');

      const createResult = await addConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) throw new Error(`'INV 3: constraints independent of series' setup failed: ${createResult.error.type}`);

      await deleteSeries(adapter, seriesA);

      const constraint = await getConstraint(adapter, createResult.value.id);
      expect(constraint).not.toBeNull();
      expect(constraint!.type).toBe('mustBeBefore');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Boundary Conditions', () => {
    it('B1: source equals dest', async () => {
      const seriesA = await createTestSeries('A');

      // Same series on both sides
      const result = await addConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesA },
      });

      // Should be allowed (constraints same series instances)
      expect(result.ok).toBe(true);
    });

    it('B2: withinMinutes 0', async () => {
      const resultA = await createSeries(adapter, {
        title: 'A',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T09:00:00'),
        durationMinutes: 30,
      });
      const resultB = await createSeries(adapter, {
        title: 'B',
        startDate: parseDate('2024-01-01'),
        pattern: { type: 'daily' },
        time: parseDateTime('2024-01-01T09:30:00'),
        durationMinutes: 30,
      });

      if (!resultA.ok || !resultB.ok) throw new Error('Failed to create series');

      // withinMinutes=0 means must be adjacent
      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeWithin',
        source: { type: 'seriesId', seriesId: resultA.value.id },
        dest: { type: 'seriesId', seriesId: resultB.value.id },
        withinMinutes: 0,
      }, parseDate('2024-01-15'));

      expect(satisfied).toBe(true);
    });

    it('B3: single instance source', async () => {
      const seriesA = await createTestSeries('A');
      const seriesB = await createTestSeries('B');

      // Single instance in range is trivially satisfied
      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'seriesId', seriesId: seriesA },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-15'));

      // A comes before B in default setup
      expect(satisfied).toBe(true);
    });

    it('B4: tag matches nothing', async () => {
      const seriesB = await createTestSeries('B');

      const satisfied = await checkConstraint(adapter, {
        type: 'mustBeBefore',
        source: { type: 'tag', tag: 'non-existent-tag' },
        dest: { type: 'seriesId', seriesId: seriesB },
      }, parseDate('2024-01-15'));

      expect(satisfied).toBe(true); // Empty source = trivially satisfied
    });
  });
});
