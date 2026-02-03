# Test Plan: Segment 11 — Links (Chains)

## Overview

Links create parent-child relationships between series where the child's scheduling depends on the parent's actual completion time. This segment covers link CRUD, cycle detection, chain depth limits, and cascading behavior.

**Test file**: `tests/11-links.test.ts`

**Dependencies**: Segment 4 (Adapter), Segment 5 (Series CRUD), Segment 6 (Completions)

---

## 1. Create Link

### 1.1 Basic Link Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `link returns ID` | linkSeries | Link ID returned | - |
| `link creates relationship` | link A to B | getLinkByChild returns link | POST 1 |
| `child scheduling relative to parent` | link, schedule | Child relative to parent | POST 2 |

### 1.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `child must exist` | link non-existent child | NotFoundError | PRE 1 |
| `parent must exist` | link to non-existent parent | NotFoundError | PRE 2 |
| `child already linked` | link child twice | AlreadyLinkedError | PRE 3, LAW 1 |
| `self-link rejected` | childId = parentId | SelfLinkError | PRE 4 |
| `cycle rejected` | create cycle | CycleDetectedError | PRE 5, LAW 3 |

### 1.3 Multiple Links Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `child has one parent only` | attempt second parent | Error | LAW 1 |
| `parent has multiple children` | A→B, A→C | Both links exist | LAW 2 |

---

## 2. Unlink

### Unit Tests

| Test Name | Scenario | Expected | Laws/Posts Verified |
|-----------|----------|----------|---------------------|
| `unlink removes relationship` | link then unlink | Link gone | POST 3 |
| `unlinked child independent` | unlink | Child schedules independently | POST 4 |
| `unlink non-linked child` | unlink orphan | NoLinkError | PRE 6 |

---

## 3. Query Links

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get link by child` | create link | Returns link | - |
| `get link by child none` | child without parent | null | LAW 4 |
| `get links by parent` | A→B, A→C | Returns both | - |
| `get links by parent none` | parent without children | [] | LAW 5 |
| `get all links` | create 3 links | Returns all 3 | - |

---

## 4. Update Link

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `update targetDistance` | change to 30 | New value | POST 5 |
| `update earlyWobble` | change to 10 | New value | POST 5 |
| `update lateWobble` | change to 15 | New value | POST 5 |
| `link must exist` | update non-existent | NotFoundError | PRE 7 |
| `cannot change child ID` | change childSeriesId | Error | PRE 8 |
| `cannot change parent ID` | change parentSeriesId | Error | PRE 8 |

---

## 5. Child Scheduling

### 5.1 Target Time Calculation

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `target is parent end plus distance` | distance=15, parent ends 09:00 | Target 09:15 | LAW 6 |
| `uses actual end if completed` | parent completed at 08:45 | Target based on 08:45 | LAW 7 |
| `uses scheduled end if not completed` | parent not completed | Target based on scheduled | LAW 8 |

### 5.2 Valid Time Window

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `child within earliest/latest` | earlyWobble=5, lateWobble=10 | Window [target-5, target+10] | LAW 9 |
| `earlyWobble 0 no early` | earlyWobble=0 | Cannot be before target | LAW 10 |
| `bounds are hard` | attempt outside window | Rejected | LAW 11 |

---

## 6. Chain Depth

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `root has depth 0` | series without parent | Depth 0 | LAW 12 |
| `direct child has depth 1` | A→B | B depth 1 | LAW 13 |
| `grandchild has depth 2` | A→B→C | C depth 2 | LAW 14 |
| `depth 5 works` | A→B→C→D→E→F | F depth 5 | - |
| `depth 32 allowed` | chain of 32 | Works | LAW 15, B5 |
| `depth 33 rejected` | chain of 33 | ChainDepthExceededError | LAW 16, B6 |

---

## 7. Cycle Detection

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `self-link is cycle` | A→A | CycleDetectedError | LAW 17, LAW 18 |
| `mutual link is cycle` | A→B then B→A | CycleDetectedError | LAW 17, LAW 19 |
| `triangle cycle` | A→B→C then C→A | CycleDetectedError | LAW 17 |
| `deep cycle detected` | A→B→C→D→E→A | CycleDetectedError | LAW 17 |
| `non-cycle chain works` | A→B→C→D | All links created | - |

---

## 8. Cascade Behavior

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `delete child cascades link` | delete child series | Link deleted | LAW 20 |
| `delete parent blocked` | delete parent with children | RestrictError | LAW 21 |
| `must unlink before delete parent` | unlink then delete | Works | LAW 22 |

---

## 9. Rescheduling Behavior

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reschedule parent moves children` | reschedule parent | Children move | LAW 23 |
| `child new target from new end` | parent new end + distance | Correct target | LAW 24 |
| `children maintain relative position` | reschedule with wobble | Within new bounds | LAW 25 |
| `conflict if bounds violated` | reschedule outside child ability | Conflict reported | LAW 26 |

---

## 10. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `no cycles in graph` | Attempt cycle creation |
| INV 2 | `one parent per child` | Attempt second parent |
| INV 3 | `parent != child` | Attempt self-link |
| INV 4 | `distances non-negative` | Attempt negative distance |
| INV 5 | `depth <= 32` | Attempt chain of 33 |

---

## 11. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `targetDistance 0` | distance=0 | Child starts at parent end | B1 |
| `earlyWobble 0` | earlyWobble=0 | No earlier than target | B2 |
| `chain depth 5+` | 5 level chain | Works | B3 |
| `parent completion updates all` | complete parent | All descendants updated | B4 |
| `chain depth 32` | 32 level chain | Works | B5 |
| `chain depth 33` | 33 level chain | ChainDepthExceededError | B6 |
| `reschedule to different day` | parent to next day | Children move to same day | B7 |

---

## 12. Real-World Scenarios

### 12.1 Workout Chain

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `warmup to workout chain` | warmup (15min), workout 5min after | workout starts 5 min after warmup ends |
| `workout completed early` | warmup ends early | workout target adjusts |

### 12.2 Multi-Step Process

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `cook then eat chain` | cook→eat, 10min gap | eat starts 10 min after cook |
| `prep to cook to eat` | 3-step chain | All relative to parent |

### 12.3 Reschedule Chain

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `reschedule first in chain` | A→B→C, reschedule A | B and C both move |
| `complete first affects rest` | A→B→C, A completes early | B and C move earlier |

---

## 13. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Create Link | ~10 | ~10 |
| Unlink | ~3 | ~3 |
| Query Links | ~5 | ~5 |
| Update Link | ~6 | ~6 |
| Child Scheduling | ~6 | ~6 |
| Chain Depth | ~6 | ~6 |
| Cycle Detection | ~5 | ~5 |
| Cascade Behavior | ~3 | ~3 |
| Rescheduling | ~4 | ~4 |
| Invariants | ~5 | ~5 |
| Boundary Conditions | ~7 | ~7 |
| Scenarios | ~6 | ~6 |
| **Total** | **~66** | **~66** |

---

## 14. Test Execution Notes

- Create series pairs before linking
- Test cycle detection with various chain depths
- Verify cascade deletes by checking links after child deletion
- Test restrict behavior by verifying error on parent deletion with children
- Test depth 32 and 33 boundaries exactly
- Verify rescheduling cascades through entire chain
- Test with both completed and uncompleted parent instances
- Verify wobble bounds are hard limits
