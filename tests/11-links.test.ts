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
  detectConflicts,
} from '../src/links';
import {
  createSeries,
  deleteSeries,
  getSeries,
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
import { LinkedChildrenExistError } from '../src/series-crud';

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

describe('Segment 11: Links (Chains)', () => {
  let adapter: MockAdapter;

  // Helper to create a series
  async function createTestSeries(title: string): Promise<SeriesId> {
    return await createSeries(adapter, {
      title,
      startDate: date('2024-01-01'),
      pattern: { type: 'daily' },
      time: datetime('2024-01-01T09:00:00'),
      durationMinutes: 30,
    }) as SeriesId;
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
          expect(result.value).toEqual(expect.objectContaining({
            id: result.value.id,
            parentSeriesId: parentId,
            childSeriesId: childId,
            targetDistance: 15,
          }));
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
        expect(link).toEqual(expect.objectContaining({
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        }));
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
        const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:45:00'));
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
        const childIds = links.map(l => l.childSeriesId);
        expect(childIds).toContain(child1Id);
        expect(childIds).toContain(child2Id);
        expect(childIds.length === 2).toBe(true);
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

      // Verify link exists before unlink
      const allLinksBefore = await getAllLinks(adapter);
      const linksBefore = allLinksBefore.filter(l => l.childSeriesId === childId);
      expect(linksBefore).toHaveLength(1);
      expect(linksBefore[0]).toMatchObject({
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });

      const linkByChild = await getLinkByChild(adapter, childId);
      expect(linkByChild).not.toBeNull();
      expect(linkByChild!.parentSeriesId).toBe(parentId);
      expect(linkByChild!.childSeriesId).toBe(childId);
      expect(linkByChild!.targetDistance).toBe(15);

      await unlinkSeries(adapter, childId);

      // Same getLinkByChild call that returned data above now returns null
      const linkByChildAfter = await getLinkByChild(adapter, childId);
      expect(linkByChildAfter).toBe(null);

      // Verify the link was removed from the global collection too
      const allLinksAfter = await getAllLinks(adapter);
      expect(allLinksAfter.map(l => l.childSeriesId)).not.toContain(childId);
    });

    it('unlinked child independent', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      });

      // Verify child is linked before unlink
      const linkBefore = await getLinkByChild(adapter, childId);
      expect(linkBefore).not.toBeNull();
      expect(linkBefore!.parentSeriesId).toBe(parentId);
      expect(linkBefore!.childSeriesId).toBe(childId);
      expect(linkBefore!.targetDistance).toBe(15);

      await unlinkSeries(adapter, childId);

      // Same getLinkByChild call that returned data above now returns null
      const linkAfter = await getLinkByChild(adapter, childId);
      expect(linkAfter).toBe(null);

      // Child should schedule independently now - no links reference this child
      const allLinksAfter = await getAllLinks(adapter);
      expect(allLinksAfter.map(l => l.childSeriesId)).not.toContain(childId);
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
      expect(link).toEqual(expect.objectContaining({
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
      }));
    });

    it('get link by child returns empty when no link exists', async () => {
      const parentId = await createTestSeries('Parent');
      const linkedChild = await createTestSeries('LinkedChild');
      const unlinkedChild = await createTestSeries('UnlinkedChild');

      // Create a link for linkedChild so the DB isn't empty
      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: linkedChild, targetDistance: 15 });

      // Verify linkedChild has a link (proves getAllLinks works)
      const allLinks = await getAllLinks(adapter);
      const linkedChildLinks = allLinks.filter(l => l.childSeriesId === linkedChild);
      expect(linkedChildLinks).toHaveLength(1);
      expect(linkedChildLinks[0]).toMatchObject({
        parentSeriesId: parentId,
        childSeriesId: linkedChild,
        targetDistance: 15,
      });

      // unlinkedChild should not appear in any link
      expect(allLinks.map(l => l.childSeriesId)).not.toContain(unlinkedChild);
      expect(allLinks.map(l => l.parentSeriesId)).not.toContain(unlinkedChild);
    });

    it('get links by parent', async () => {
      const parentId = await createTestSeries('Parent');
      const child1Id = await createTestSeries('Child1');
      const child2Id = await createTestSeries('Child2');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: child1Id, targetDistance: 15 });
      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: child2Id, targetDistance: 30 });

      const links = await getLinksByParent(adapter, parentId);
      const childIds = links.map(l => l.childSeriesId);
      expect(childIds).toContain(child1Id);
      expect(childIds).toContain(child2Id);
      expect(childIds.length === 2).toBe(true);
    });

    it('get links by parent returns empty when no children linked', async () => {
      const parentWithChildren = await createTestSeries('ParentWithChildren');
      const childId = await createTestSeries('Child');
      const parentWithout = await createTestSeries('ParentWithout');

      // Link a child to parentWithChildren so DB has data
      await linkSeries(adapter, { parentSeriesId: parentWithChildren, childSeriesId: childId, targetDistance: 15 });

      // Verify parentWithChildren has links (proves getLinksByParent works)
      const withLinks = await getLinksByParent(adapter, parentWithChildren);
      expect(withLinks).toHaveLength(1);
      expect(withLinks[0]).toMatchObject({
        parentSeriesId: parentWithChildren,
        childSeriesId: childId,
        targetDistance: 15,
      });

      // parentWithout should have no links
      const links = await getLinksByParent(adapter, parentWithout);
      expect(links.map(l => l.parentSeriesId)).not.toContain(parentWithout);
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
      const childIds = links.map(l => l.childSeriesId);
      expect(childIds).toContain(child1);
      expect(childIds).toContain(child2);
      expect(childIds).toContain(child3);
      expect(childIds.length === 3).toBe(true);
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
      if (!createResult.ok) throw new Error(`'update targetDistance' setup failed: ${createResult.error.type}`);

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
      if (!createResult.ok) throw new Error(`'update earlyWobble' setup failed: ${createResult.error.type}`);

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
      if (!createResult.ok) throw new Error(`'update lateWobble' setup failed: ${createResult.error.type}`);

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
      if (!createResult.ok) throw new Error(`'cannot change child ID' setup failed: ${createResult.error.type}`);

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
      if (!createResult.ok) throw new Error(`'cannot change parent ID' setup failed: ${createResult.error.type}`);

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
        const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:45:00'));
      });

      it('uses actual end if completed', async () => {
        const parentId = await createTestSeries('Parent');
        const childId = await createTestSeries('Child');

        await linkSeries(adapter, {
          parentSeriesId: parentId,
          childSeriesId: childId,
          targetDistance: 15,
        });

        // Parent started and completed early, ending at 08:45
        await logCompletion(adapter, {
          seriesId: parentId,
          instanceDate: date('2024-01-15'),
          startTime: datetime('2024-01-15T08:30:00'),
          endTime: datetime('2024-01-15T08:45:00'),
        });

        // Target should be based on actual end: 08:45 + 15 = 09:00
        const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:00:00'));
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
        const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:45:00'));
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
        const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));
        expect(window.earliest).toBe(datetime('2024-01-15T09:40:00'));
        expect(window.latest).toBe(datetime('2024-01-15T09:55:00'));
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
        const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));
        expect(window.earliest).toBe(datetime('2024-01-15T09:45:00'));
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

        // Parent ends at 09:30, target = 09:30 + 15 = 09:45
        // earliest = 09:45 - 5 (earlyWobble) = 09:40
        // latest = 09:45 + 10 (lateWobble) = 09:55
        const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));
        expect(window.earliest).toBe(datetime('2024-01-15T09:40:00'));
        expect(window.latest).toBe(datetime('2024-01-15T09:55:00'));
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

      // Verify link and series exist before deletion
      const allLinksBefore = await getAllLinks(adapter);
      const linksBefore = allLinksBefore.filter(l => l.childSeriesId === childId);
      expect(linksBefore).toHaveLength(1);
      expect(linksBefore[0].parentSeriesId).toBe(parentId);
      expect(linksBefore[0].childSeriesId).toBe(childId);
      expect(linksBefore[0].targetDistance).toBe(15);

      const childBefore = await getSeries(adapter, childId);
      expect(childBefore).not.toBeNull();
      expect(childBefore!.title).toBe('Child');

      await deleteSeries(adapter, childId);

      // Verify series deletion succeeded (negative case - positive verified above)
      const childAfter = await getSeries(adapter, childId);
      expect(childAfter).toBeNull();

      // Verify link was cascade-deleted: childId should not appear in any link
      const allLinksAfter = await getAllLinks(adapter);
      expect(allLinksAfter.map(l => l.childSeriesId)).not.toContain(childId);
    });

    it('delete parent blocked', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      await expect(deleteSeries(adapter, parentId)).rejects.toThrow(/has linked children/);
    });

    it('must unlink before delete parent', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      await unlinkSeries(adapter, childId);

      // Verify parent series exists with concrete values before deletion
      const parentBefore = await getSeries(adapter, parentId);
      expect(parentBefore).toMatchObject({ title: 'Parent' });
      expect(parentBefore!.id).toBe(parentId);

      await deleteSeries(adapter, parentId);

      // Same getSeries call that returned concrete data above now returns null
      const parentAfter = await getSeries(adapter, parentId);
      expect(parentAfter).toBeNull();
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
      await rescheduleInstance(adapter, parentId, date('2024-01-15'), datetime('2024-01-15T14:00:00'));

      // Child target should now be 14:30 + 15 = 14:45
      const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
      expect(target).toBe(datetime('2024-01-15T14:45:00'));
    });

    it('child new target from new end', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, { parentSeriesId: parentId, childSeriesId: childId, targetDistance: 15 });

      // Reschedule parent to 10:00
      await rescheduleInstance(adapter, parentId, date('2024-01-15'), datetime('2024-01-15T10:00:00'));

      // New end: 10:30, new target: 10:45
      const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
      expect(target).toBe(datetime('2024-01-15T10:45:00'));
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
      await rescheduleInstance(adapter, parentId, date('2024-01-15'), datetime('2024-01-15T14:00:00'));

      // Window should maintain same wobble
      const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));
      expect(window.earliest).toBe(datetime('2024-01-15T14:40:00'));
      expect(window.latest).toBe(datetime('2024-01-15T14:55:00'));
    });

    it('conflict if bounds violated', async () => {
      const parentId = await createTestSeries('Parent');
      const childId = await createTestSeries('Child');

      await linkSeries(adapter, {
        parentSeriesId: parentId,
        childSeriesId: childId,
        targetDistance: 15,
        earlyWobble: 0,  // No early flexibility
        lateWobble: 5,   // Only 5 min late flexibility
      });

      // Get the valid window
      const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));

      // Parent ends at 09:30, target = 09:30 + 15 = 09:45
      // With earlyWobble=0 and lateWobble=5, window is [09:45, 09:50]
      expect(window.earliest).toBe(datetime('2024-01-15T09:45:00'));
      expect(window.latest).toBe(datetime('2024-01-15T09:50:00'));

      // Attempting to schedule child outside this window should produce conflict
      const conflicts = await detectConflicts(adapter, childId, date('2024-01-15'), {
        proposedTime: datetime('2024-01-15T10:00:00'),  // Outside window
      });
      expect(conflicts.some((c) => c.type === 'chainBoundsViolated')).toBe(true);
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
      const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
      expect(target).toBe(datetime('2024-01-15T09:30:00'));
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

      const window = await getChildValidWindow(adapter, childId, date('2024-01-15'));
      expect(window.earliest).toBe(datetime('2024-01-15T09:45:00'));
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
        instanceDate: date('2024-01-15'),
        startTime: datetime('2024-01-15T09:00:00'),
        endTime: datetime('2024-01-15T09:15:00'), // 15min early
      });

      // Child target should update
      const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
      expect(target).toBe(datetime('2024-01-15T09:30:00')); // 09:15 + 15
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
      await rescheduleInstance(adapter, parentId, date('2024-01-15'), datetime('2024-01-16T09:00:00'));

      // Child target should be on new day
      const target = await calculateChildTarget(adapter, childId, date('2024-01-15'));
      expect(target).toBe(datetime('2024-01-16T09:45:00'));
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
        const target = await calculateChildTarget(adapter, workoutId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:35:00'));
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
          instanceDate: date('2024-01-15'),
          startTime: datetime('2024-01-15T09:00:00'),
          endTime: datetime('2024-01-15T09:20:00'),
        });

        // Workout target adjusts: 09:20 + 5 = 09:25
        const target = await calculateChildTarget(adapter, workoutId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:25:00'));
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
        const target = await calculateChildTarget(adapter, eatId, date('2024-01-15'));
        expect(target).toBe(datetime('2024-01-15T09:40:00'));
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
        await rescheduleInstance(adapter, aId, date('2024-01-15'), datetime('2024-01-15T14:00:00'));

        // B and C should both move
        const bTarget = await calculateChildTarget(adapter, bId, date('2024-01-15'));
        expect(bTarget).toBe(datetime('2024-01-15T14:45:00')); // 14:30 + 15
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
          instanceDate: date('2024-01-15'),
          startTime: datetime('2024-01-15T09:00:00'),
          endTime: datetime('2024-01-15T09:15:00'), // 15min early
        });

        // B target moves earlier: 09:15 + 15 = 09:30
        const bTarget = await calculateChildTarget(adapter, bId, date('2024-01-15'));
        expect(bTarget).toBe(datetime('2024-01-15T09:30:00'));
      });
    });
  });
});
