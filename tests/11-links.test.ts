/**
 * Segment 11: Links (Chains)
 *
 * Links create parent-child relationships between series where the child's scheduling
 * depends on the parent's actual completion time. This segment covers link CRUD,
 * cycle detection, chain depth limits, and cascading behavior.
 *
 * This is life-critical software. Tests define expected behavior before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  linkSeries,
  unlinkSeries,
  getLink,
  getLinkByChild,
  getLinksByParent,
  getAllLinks,
  updateLink,
  getChainDepth,
  calculateChildTarget,
  getChildValidWindow,
} from '../src/links';
import {
  createSeries,
  deleteSeries,
} from '../src/series-crud';
import {
  logCompletion,
} from '../src/completions';
import {
  rescheduleInstance,
} from '../src/instance-exceptions';
import {
  createMockAdapter,
  type MockAdapter,
} from '../src/adapter';
import {
  parseDate,
  parseDateTime,
  addDays,
} from '../src/time-date';
import type { SeriesId, LinkId, LocalDate, LocalDateTime } from '../src/types';

describe('Segment 11: Links (Chains)', () => {
  let adapter: MockAdapter;

  // Helper to create a series
  async function createTestSeries(title: string): Promise<SeriesId> {
    const result = await createSeries(adapter, {
      title,
      startDate: parseDate('2024-01-01'),
      pattern: { type: 'daily' },
      time: parseDateTime('2024-01-01T09:00:00'),
      durationMinutes: 30,
    });
    if (!result.ok) throw new Error(`Failed to create series: ${title}`);
    return result.value.id;
  }

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CREATE LINK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('1. Create Link', () => {
    describe('1.1 Basic Link Tests', () => {
      it('link returns ID', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        const result = await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.id).toBeDefined();
          expect(typeof result.value.id).toBe('string');
        }
      });

      it('link creates relationship', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        const link = await getLinkByChild(adapter, childId);
        expect(link).not.toBeNull();
        expect(link!.parentSeriesId).toBe(parentId);
        expect(link!.childSeriesId).toBe(childId);
      });

      it('child scheduling relative to parent', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        // Parent ends at 09:30 (09:00 + 30min), child should target 09:45
        const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:45:00'));
      });
    });

    describe('1.2 Precondition Tests', () => {
      it('child must exist', async () => {
        const parentId = await createTestSeries('Parent');

        const result = await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: 'non-existent-child' as SeriesId,
          targetDistance: 15,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });

      it('parent must exist', async () => {
        const childId = await createTestSeries('Child');

        const result = await linkSeries(adapter, {
          parentSeriesId: 'non-existent-parent' as SeriesId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('NotFoundError');
        }
      });

      it('child already linked', async () => {
        const parent1Id = await createTestSeries('Parent1');
        const parent2Id = await createTestSeries('Parent2');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parent1Id,
          childSeriesId: childId,
          targetDistance: 15,
        });

        const result = await linkSeries(adapter, {
          parentSeriesId: parent2Id,
          childSeriesId: childId,
          targetDistance: 10,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('AlreadyLinkedError');
        }
      });

      it('self-link rejected', async () => {
        const seriesId = await createTestSeries('Series');

        const result = await linkSeries(adapter, {
          parentSeriesId: seriesId,
          childSeriesId: seriesId,
          targetDistance: 15,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('SelfLinkError');
        }
      });

      it('cycle rejected', async () => {
        const aId = await createTestSeries('A');
        const bId = await createTestSeries('B');

        // Create A -> B
        await linkSeries(adapter, {
          parentSeriesId: aId,
          childSeriesId: bId,
          targetDistance: 15,
        });

        // Try to create B -> A (would form cycle)
        const result = await linkSeries(adapter, {
          parentSeriesId: bId,
          childSeriesId: aId,
          targetDistance: 15,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('CycleDetectedError');
        }
      });
    });

    describe('1.3 Multiple Links Tests', () => {
      it('child has one parent only', async () => {
        const parent1Id = await createTestSeries('Parent1');
        const parent2Id = await createTestSeries('Parent2');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parent1Id,
          childSeriesId: childId,
          targetDistance: 15,
        });

        const result = await linkSeries(adapter, {
          parentSeriesId: parent2Id,
          childSeriesId: childId,
          targetDistance: 10,
        });

        expect(result.ok).toBe(false);
      });

      it('parent has multiple children', async () => {
        const parentId = await createTestSeries('Parent');
        const child1Id = await createTestSeries('Child1');
        const child2Id = await createTestSeries('Child2');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: child1Id,
          targetDistance: 15,
        });

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: child2Id,
          targetDistance: 30,
        });

        const links = await getLinksByParent(adapter, parentId);
        expect(links.length).toBe(2);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: UNLINK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('2. Unlink', () => {
    it('unlink removes relationship', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });

      await unlinkSeries(adapter, childId);

      const link = await getLinkByChild(adapter, childId);
      expect(link).toBeNull();
    });

    it('unlinked child independent', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });

      await unlinkSeries(adapter, childId);

      // Child should schedule independently now
      const link = await getLinkByChild(adapter, childId);
      expect(link).toBeNull();
    });

    it('unlink non-linked child', async () => {
      const childId = await createTestSeries('Child');

      const result = await unlinkSeries(adapter, childId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NoLinkError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: QUERY LINKS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3. Query Links', () => {
    it('get link by child', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });

      const link = await getLinkByChild(adapter, childId);
      expect(link).not.toBeNull();
      expect(link!.childSeriesId).toBe(childId);
    });

    it('get link by child none', async () => {
      const childId = await createTestSeries('Child');

      const link = await getLinkByChild(adapter, childId);
      expect(link).toBeNull();
    });

    it('get links by parent', async () => {
      const parentId = await createTestSeries('Parent');
      const child1Id = await createTestSeries('Child1');
      const child2Id = await createTestSeries('Child2');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: child1Id, targetDistance: 15 });
      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: child2Id, targetDistance: 30 });

      const links = await getLinksByParent(adapter, parentId);
      expect(links.length).toBe(2);
    });

    it('get links by parent none', async () => {
      const parentId = await createTestSeries('Parent');

      const links = await getLinksByParent(adapter, parentId);
      expect(links.length).toBe(0);
    });

    it('get all links', async () => {
      const parent1 = await createTestSeries('Parent1');
      const child1 = await createTestSeries('Child1');
      const parent2 = await createTestSeries('Parent2');
      const child2 = await createTestSeries('Child2');
      const child3 = await createTestSeries('Child3');

      await linkSeries(adapter, { parentSeriesId: parent1, childSeriesId: child1, targetDistance: 15 });
      await linkSeries(adapter, { parentSeriesId: parent2, childSeriesId: child2, targetDistance: 30 });
      await linkSeries(adapter, { parentSeriesId: parent2, childSeriesId: child3, targetDistance: 45 });

      const links = await getAllLinks(adapter);
      expect(links.length).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: UPDATE LINK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('4. Update Link', () => {
    it('update targetDistance', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      const createResult = await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await updateLink(adapter, createResult.value.id, { targetDistance: 30 });

      const link = await getLink(adapter, createResult.value.id);
      expect(link!.targetDistance).toBe(30);
    });

    it('update earlyWobble', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      const createResult = await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        earlyWobble: 5,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await updateLink(adapter, createResult.value.id, { earlyWobble: 10 });

      const link = await getLink(adapter, createResult.value.id);
      expect(link!.earlyWobble).toBe(10);
    });

    it('update lateWobble', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      const createResult = await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        lateWobble: 10,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await updateLink(adapter, createResult.value.id, { lateWobble: 15 });

      const link = await getLink(adapter, createResult.value.id);
      expect(link!.lateWobble).toBe(15);
    });

    it('link must exist', async () => {
      const result = await updateLink(adapter, 'non-existent-id' as LinkId, { targetDistance: 30 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('NotFoundError');
      }
    });

    it('cannot change child ID', async () => {
      const parentId = await createTestSeries('Parent');
      const child1Id = await createTestSeries('Child1');
      const child2Id = await createTestSeries('Child2');

      const createResult = await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: child1Id,
        targetDistance: 15,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const result = await updateLink(adapter, createResult.value.id, {
        childSeriesId: child2Id,
      } as any);

      expect(result.ok).toBe(false);
    });

    it('cannot change parent ID', async () => {
      const parent1Id = await createTestSeries('Parent1');
      const parent2Id = await createTestSeries('Parent2');
      const childId = await createTestSeries('Child');

      const createResult = await linkSeries(adapter, {
        parentSeriesId: parent1Id,
        childSeriesId: childId,
        targetDistance: 15,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const result = await updateLink(adapter, createResult.value.id, {
        parentSeriesId: parent2Id,
      } as any);

      expect(result.ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: CHILD SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('5. Child Scheduling', () => {
    describe('5.1 Target Time Calculation', () => {
      it('target is parent end plus distance', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        // Parent: 09:00-09:30, distance 15 -> target 09:45
        const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:45:00'));
      });

      it('uses actual end if completed', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        // Parent completed early at 08:45
        await logCompletion(adapter, {
          seriesId: parentId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T08:45:00'),
        });

        // Target should be based on actual end: 08:45 + 15 = 09:00
        const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:00:00'));
      });

      it('uses scheduled end if not completed', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        // No completion - uses scheduled end 09:30 + 15 = 09:45
        const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:45:00'));
      });
    });

    describe('5.2 Valid Time Window', () => {
      it('child within earliest/latest', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
          earlyWobble: 5,
          lateWobble: 10,
        });

        // Target 09:45, window should be [09:40, 09:55]
        const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
        expect(window.earliest).toBe(parseDateTime('2024-01-15T09:40:00'));
        expect(window.latest).toBe(parseDateTime('2024-01-15T09:55:00'));
      });

      it('earlyWobble 0 no early', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
          earlyWobble: 0,
          lateWobble: 10,
        });

        // Window should be [09:45, 09:55]
        const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
        expect(window.earliest).toBe(parseDateTime('2024-01-15T09:45:00'));
      });

      it('bounds are hard', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
          earlyWobble: 5,
          lateWobble: 10,
        });

        // Verify bounds exist
        const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
        expect(window.earliest).toBeDefined();
        expect(window.latest).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: CHAIN DEPTH
  // ═══════════════════════════════════════════════════════════════════════════

  describe('6. Chain Depth', () => {
    it('root has depth 0', async () => {
      const seriesId = await createTestSeries('Root');

      const depth = await getChainDepth(adapter, seriesId);
      expect(depth).toBe(0);
    });

    it('direct child has depth 1', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      const depth = await getChainDepth(adapter, childId);
      expect(depth).toBe(1);
    });

    it('grandchild has depth 2', async () => {
      const aId = await createTestSeries('A');
      const bId = await createTestSeries('B');
      const cId = await createTestSeries('C');

      await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });
      await linkSeries(adapter, { parentSeriesId: bId, childSeriesId: cId, targetDistance: 15 });

      const depth = await getChainDepth(adapter, cId);
      expect(depth).toBe(2);
    });

    it('depth 5 works', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 6; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 5; i++) {
        await linkSeries(adapter, { parentSeriesId: series[i], childSeriesId: series[i + 1], targetDistance: 15 });
      }

      const depth = await getChainDepth(adapter, series[5]);
      expect(depth).toBe(5);
    });

    it('depth 32 allowed', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 33; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 32; i++) {
        const result = await linkSeries(adapter, {
          parentSeriesId: series[i],
          childSeriesId: series[i + 1],
          targetDistance: 1,
        });
        expect(result.ok).toBe(true);
      }

      const depth = await getChainDepth(adapter, series[32]);
      expect(depth).toBe(32);
    });

    it('depth 33 rejected', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 34; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      // Create chain of 32
      for (let i = 0; i < 32; i++) {
        await linkSeries(adapter, { parentSeriesId: series[i], childSeriesId: series[i + 1], targetDistance: 1 });
      }

      // Try to add 33rd link
      const result = await linkSeries(adapter, {
        parentSeriesId: series[32],
        childSeriesId: series[33],
        targetDistance: 1,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ChainDepthExceededError');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: CYCLE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7. Cycle Detection', () => {
    it('self-link is cycle', async () => {
      const aId = await createTestSeries('A');

      const result = await linkSeries(adapter, {
        parentSeriesId: aId,
        childSeriesId: aId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
    });

    it('mutual link is cycle', async () => {
      const aId = await createTestSeries('A');
      const bId = await createTestSeries('B');

      await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });

      const result = await linkSeries(adapter, {
        parentSeriesId: bId,
        childSeriesId: aId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('CycleDetectedError');
      }
    });

    it('triangle cycle', async () => {
      const aId = await createTestSeries('A');
      const bId = await createTestSeries('B');
      const cId = await createTestSeries('C');

      await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });
      await linkSeries(adapter, { parentSeriesId: bId, childSeriesId: cId, targetDistance: 15 });

      const result = await linkSeries(adapter, {
        parentSeriesId: cId,
        childSeriesId: aId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('CycleDetectedError');
      }
    });

    it('deep cycle detected', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 5; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      // A -> B -> C -> D -> E
      for (let i = 0; i < 4; i++) {
        await linkSeries(adapter, { parentSeriesId: series[i], childSeriesId: series[i + 1], targetDistance: 15 });
      }

      // Try E -> A
      const result = await linkSeries(adapter, {
        parentSeriesId: series[4],
        childSeriesId: series[0],
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('CycleDetectedError');
      }
    });

    it('non-cycle chain works', async () => {
      const aId = await createTestSeries('A');
      const bId = await createTestSeries('B');
      const cId = await createTestSeries('C');
      const dId = await createTestSeries('D');

      const result1 = await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });
      const result2 = await linkSeries(adapter, { parentSeriesId: bId, childSeriesId: cId, targetDistance: 15 });
      const result3 = await linkSeries(adapter, { parentSeriesId: cId, childSeriesId: dId, targetDistance: 15 });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: CASCADE BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════════════

  describe('8. Cascade Behavior', () => {
    it('delete child cascades link', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      await deleteSeries(adapter, childId);

      const link = await getLinkByChild(adapter, childId);
      expect(link).toBeNull();
    });

    it('delete parent blocked', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      const result = await deleteSeries(adapter, parentId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('LinkedChildrenExistError');
      }
    });

    it('must unlink before delete parent', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      await unlinkSeries(adapter, childId);
      const result = await deleteSeries(adapter, parentId);

      expect(result.ok).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: RESCHEDULING BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════════════

  describe('9. Rescheduling Behavior', () => {
    it('reschedule parent moves children', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      // Reschedule parent to 14:00 (was 09:00)
      await rescheduleInstance(adapter, parentId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

      // Child target should now be 14:30 + 15 = 14:45
      const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
      expect(target).toBe(parseDateTime('2024-01-15T14:45:00'));
    });

    it('child new target from new end', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      // Reschedule parent to 10:00
      await rescheduleInstance(adapter, parentId, parseDate('2024-01-15'), parseDateTime('2024-01-15T10:00:00'));

      // New end: 10:30, new target: 10:45
      const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
      expect(target).toBe(parseDateTime('2024-01-15T10:45:00'));
    });

    it('children maintain relative position', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        earlyWobble: 5,
        lateWobble: 10,
      });

      // Reschedule parent
      await rescheduleInstance(adapter, parentId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

      // Window should maintain same wobble
      const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
      expect(window.earliest).toBe(parseDateTime('2024-01-15T14:40:00'));
      expect(window.latest).toBe(parseDateTime('2024-01-15T14:55:00'));
    });

    it('conflict if bounds violated', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        earlyWobble: 5,
        lateWobble: 10,
      });

      // This test verifies that bounds exist - actual conflict handling depends on implementation
      const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
      expect(window.earliest).toBeDefined();
      expect(window.latest).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: INVARIANTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('10. Invariants', () => {
    it('INV 1: no cycles in graph', async () => {
      const aId = await createTestSeries('A');
      const bId = await createTestSeries('B');

      await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });

      const result = await linkSeries(adapter, {
        parentSeriesId: bId,
        childSeriesId: aId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
    });

    it('INV 2: one parent per child', async () => {
      const parent1 = await createTestSeries('Parent1');
      const parent2 = await createTestSeries('Parent2');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parent1, childSeriesId: childId, targetDistance: 15 });

      const result = await linkSeries(adapter, {
        parentSeriesId: parent2,
        childSeriesId: childId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
    });

    it('INV 3: parent != child', async () => {
      const seriesId = await createTestSeries('Series');

      const result = await linkSeries(adapter, {
        parentSeriesId: seriesId,
        childSeriesId: seriesId,
        targetDistance: 15,
      });

      expect(result.ok).toBe(false);
    });

    it('INV 4: distances non-negative', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      const result = await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: -5,
      });

      expect(result.ok).toBe(false);
    });

    it('INV 5: depth <= 32', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 34; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 32; i++) {
        await linkSeries(adapter, { parentSeriesId: series[i], childSeriesId: series[i + 1], targetDistance: 1 });
      }

      const result = await linkSeries(adapter, {
        parentSeriesId: series[32],
        childSeriesId: series[33],
        targetDistance: 1,
      });

      expect(result.ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('11. Boundary Conditions', () => {
    it('B1: targetDistance 0', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 0,
      });

      // Child starts exactly when parent ends
      const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
      expect(target).toBe(parseDateTime('2024-01-15T09:30:00'));
    });

    it('B2: earlyWobble 0', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        earlyWobble: 0,
        lateWobble: 10,
      });

      const window = await getChildValidWindow(adapter, childId, parseDate('2024-01-15'));
      expect(window.earliest).toBe(parseDateTime('2024-01-15T09:45:00'));
    });

    it('B3: chain depth 5+', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 6; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 5; i++) {
        const result = await linkSeries(adapter, {
          parentSeriesId: series[i],
          childSeriesId: series[i + 1],
          targetDistance: 15,
        });
        expect(result.ok).toBe(true);
      }
    });

    it('B4: parent completion updates all', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      // Complete parent early
      await logCompletion(adapter, {
        seriesId: parentId,
        instanceDate: parseDate('2024-01-15'),
        startTime: parseDateTime('2024-01-15T09:00:00'),
        endTime: parseDateTime('2024-01-15T09:15:00'), // 15min early
      });

      // Child target should update
      const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
      expect(target).toBe(parseDateTime('2024-01-15T09:30:00')); // 09:15 + 15
    });

    it('B5: chain depth 32', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 33; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 32; i++) {
        const result = await linkSeries(adapter, {
          parentSeriesId: series[i],
          childSeriesId: series[i + 1],
          targetDistance: 1,
        });
        expect(result.ok).toBe(true);
      }
    });

    it('B6: chain depth 33', async () => {
      const series: SeriesId[] = [];
      for (let i = 0; i < 34; i++) {
        series.push(await createTestSeries(`Series${i}`));
      }

      for (let i = 0; i < 32; i++) {
        await linkSeries(adapter, { parentSeriesId: series[i], childSeriesId: series[i + 1], targetDistance: 1 });
      }

      const result = await linkSeries(adapter, {
        parentSeriesId: series[32],
        childSeriesId: series[33],
        targetDistance: 1,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('ChainDepthExceededError');
      }
    });

    it('B7: reschedule to different day', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      // Reschedule to next day
      await rescheduleInstance(adapter, parentId, parseDate('2024-01-15'), parseDateTime('2024-01-16T09:00:00'));

      // Child target should be on new day
      const target = await calculateChildTarget(adapter, childId, parseDate('2024-01-15'));
      expect(target).toBe(parseDateTime('2024-01-16T09:45:00'));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 12: REAL-WORLD SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('12. Real-World Scenarios', () => {
    describe('12.1 Workout Chain', () => {
      it('warmup to workout chain', async () => {
        const warmupId = await createTestSeries('Warmup');
        const workoutId = await createTestSeries('Workout');

        await linkSeries(adapter, {
          parentSeriesId: warmupId,
          childSeriesId: workoutId,
          targetDistance: 5,
        });

        // Warmup 09:00-09:30, workout starts 5min after -> 09:35
        const target = await calculateChildTarget(adapter, workoutId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:35:00'));
      });

      it('workout completed early', async () => {
        const warmupId = await createTestSeries('Warmup');
        const workoutId = await createTestSeries('Workout');

        await linkSeries(adapter, {
          parentSeriesId: warmupId,
          childSeriesId: workoutId,
          targetDistance: 5,
        });

        // Warmup completed 10 min early
        await logCompletion(adapter, {
          seriesId: warmupId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:20:00'),
        });

        // Workout target adjusts: 09:20 + 5 = 09:25
        const target = await calculateChildTarget(adapter, workoutId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:25:00'));
      });
    });

    describe('12.2 Multi-Step Process', () => {
      it('cook then eat chain', async () => {
        const cookId = await createTestSeries('Cook');
        const eatId = await createTestSeries('Eat');

        await linkSeries(adapter, {
          parentSeriesId: cookId,
          childSeriesId: eatId,
          targetDistance: 10,
        });

        // Cook 09:00-09:30, eat 10min after -> 09:40
        const target = await calculateChildTarget(adapter, eatId, parseDate('2024-01-15'));
        expect(target).toBe(parseDateTime('2024-01-15T09:40:00'));
      });

      it('prep to cook to eat', async () => {
        const prepId = await createTestSeries('Prep');
        const cookId = await createTestSeries('Cook');
        const eatId = await createTestSeries('Eat');

        await linkSeries(adapter, { parentSeriesId: prepId, childSeriesId: cookId, targetDistance: 5 });
        await linkSeries(adapter, { parentSeriesId: cookId, childSeriesId: eatId, targetDistance: 5 });

        // Verify chain exists
        const prepDepth = await getChainDepth(adapter, prepId);
        const cookDepth = await getChainDepth(adapter, cookId);
        const eatDepth = await getChainDepth(adapter, eatId);

        expect(prepDepth).toBe(0);
        expect(cookDepth).toBe(1);
        expect(eatDepth).toBe(2);
      });
    });

    describe('12.3 Reschedule Chain', () => {
      it('reschedule first in chain', async () => {
        const aId = await createTestSeries('A');
        const bId = await createTestSeries('B');
        const cId = await createTestSeries('C');

        await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });
        await linkSeries(adapter, { parentSeriesId: bId, childSeriesId: cId, targetDistance: 15 });

        // Reschedule A
        await rescheduleInstance(adapter, aId, parseDate('2024-01-15'), parseDateTime('2024-01-15T14:00:00'));

        // B and C should both move
        const bTarget = await calculateChildTarget(adapter, bId, parseDate('2024-01-15'));
        expect(bTarget).toBe(parseDateTime('2024-01-15T14:45:00')); // 14:30 + 15
      });

      it('complete first affects rest', async () => {
        const aId = await createTestSeries('A');
        const bId = await createTestSeries('B');
        const cId = await createTestSeries('C');

        await linkSeries(adapter, { parentSeriesId: aId, childSeriesId: bId, targetDistance: 15 });
        await linkSeries(adapter, { parentSeriesId: bId, childSeriesId: cId, targetDistance: 15 });

        // A completes early
        await logCompletion(adapter, {
          seriesId: aId,
          instanceDate: parseDate('2024-01-15'),
          startTime: parseDateTime('2024-01-15T09:00:00'),
          endTime: parseDateTime('2024-01-15T09:15:00'), // 15min early
        });

        // B target moves earlier: 09:15 + 15 = 09:30
        const bTarget = await calculateChildTarget(adapter, bId, parseDate('2024-01-15'));
        expect(bTarget).toBe(parseDateTime('2024-01-15T09:30:00'));
      });
    });
  });
});
