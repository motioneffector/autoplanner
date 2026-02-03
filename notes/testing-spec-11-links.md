# Segment 11: Links (Chains) — Formal Specification

## 1. Overview

Links create parent-child relationships between series where the child's scheduling depends on the parent's actual completion time.

---

## 2. Types

### 2.1 Link

```
type Link = {
  id: LinkId
  childSeriesId: SeriesId
  parentSeriesId: SeriesId
  targetDistance: Duration   // minutes after parent ends
  earlyWobble: Duration      // how much earlier allowed
  lateWobble: Duration       // how much later allowed
}
```

### 2.2 Constraints

```
targetDistance ≥ 0
earlyWobble ≥ 0
lateWobble ≥ 0
childSeriesId ≠ parentSeriesId
```

---

## 3. Link Operations

### 3.1 Create Link

```
linkSeries(input: LinkInput): LinkId

type LinkInput = {
  childId: SeriesId
  parentId: SeriesId
  targetDistance: Duration
  earlyWobble: Duration
  lateWobble: Duration
}
```

**Preconditions**:
```
PRE 1: Child series exists
PRE 2: Parent series exists
PRE 3: Child doesn't already have a parent (one parent only)
PRE 4: childId ≠ parentId
PRE 5: Linking doesn't create cycle
```

**Postconditions**:
```
POST 1: Link created
POST 2: Child scheduling now relative to parent
```

**Properties**:
```
LAW 1: Child can have at most one parent
LAW 2: Parent can have multiple children
LAW 3: No cycles allowed (A→B→C→A forbidden)
```

### 3.2 Unlink

```
unlinkSeries(childId: SeriesId): void
```

**Preconditions**:
```
PRE 6: Child has a parent link
```

**Postconditions**:
```
POST 3: Link removed
POST 4: Child scheduling returns to independent
```

---

## 4. Query Links

```
getLinkByChild(childSeriesId: SeriesId): Link | null
getLinksByParent(parentSeriesId: SeriesId): Link[]
getAllLinks(): Link[]
```

### 4.1 Properties

```
LAW 4: getLinkByChild returns null if child has no parent
LAW 5: getLinksByParent returns empty if parent has no children
```

---

## 5. Update Link

```
updateLink(childId: SeriesId, changes: Partial<Link>): void
```

**Preconditions**:
```
PRE 7: Link exists
PRE 8: Cannot change childSeriesId or parentSeriesId
```

**Postconditions**:
```
POST 5: Distance/wobble values updated
```

---

## 6. Child Scheduling

### 6.1 Target Time Calculation

```
calculateChildTargetTime(child: Series, parent: Series, parentInstance: Instance): LocalDateTime =
  let parentEnd = getParentEndTime(parent, parentInstance)
  addMinutes(parentEnd, child.link.targetDistance)

getParentEndTime(parent, instance) =
  let completion = getCompletionByInstance(parent.id, instance.date)
  if completion ≠ null then
    completion.endTime  // actual end time
  else
    addMinutes(instance.scheduledTime, parent.duration)  // scheduled end time
```

### 6.2 Properties

```
LAW 6: Child target = parent end + targetDistance
LAW 7: If parent completed, uses actual end time
LAW 8: If parent not completed, uses scheduled end time
```

### 6.3 Valid Time Window

```
childValidWindow(child: Series, parentEnd: LocalDateTime): TimeWindow =
  let target = addMinutes(parentEnd, child.link.targetDistance)
  {
    earliest: addMinutes(target, -child.link.earlyWobble),
    latest: addMinutes(target, child.link.lateWobble)
  }
```

**Properties**:
```
LAW 9: Child must be scheduled within [earliest, latest]
LAW 10: earlyWobble = 0 means child cannot be before target
LAW 11: Bounds are HARD (not best-effort)
```

---

## 7. Chain Depth

### 7.1 Definition

```
chainDepth(series) =
  if hasParent(series) then
    1 + chainDepth(parent(series))
  else
    0
```

### 7.2 Properties

```
LAW 12: Root series (no parent) has depth 0
LAW 13: Direct child has depth 1
LAW 14: Grandchild has depth 2
LAW 15: Maximum chain depth is 32 levels (configurable)
LAW 16: Creating link that would exceed depth throws ChainDepthExceededError
```

---

## 8. Cycle Detection

### 8.1 Algorithm

```
wouldCreateCycle(childId, parentId): boolean =
  // Check if parentId is reachable from childId following parent links
  let visited = {}
  let current = parentId
  while current ≠ null:
    if current = childId then return true
    if visited[current] then return false  // already checked this path
    visited[current] = true
    current = getParent(current)
  return false
```

### 8.2 Properties

```
LAW 17: Creating cycle throws CycleDetectedError
LAW 18: Self-link is a cycle (A→A)
LAW 19: Mutual link is a cycle (A→B, B→A)
```

---

## 9. Cascade Behavior

```
LAW 20: Delete child → link deleted (CASCADE)
LAW 21: Delete parent → error if has children (RESTRICT)
LAW 22: Must unlink children before deleting parent
```

---

## 10. Rescheduling Behavior

When a parent instance is rescheduled:

```
LAW 23: Rescheduling parent automatically reschedules all children recursively
LAW 24: Child's new target time = parent's new end time + targetDistance
LAW 25: Children maintain their relative positions within wobble bounds
LAW 26: If child cannot fit at new time (bounds violated), conflict reported
```

The reflow algorithm handles this: when parent's scheduled time changes, child domains are recomputed based on new parent position. This cascades through the entire chain.

---

## 11. Invariants

```
INV 1: No cycles in link graph
INV 2: At most one parent per child
INV 3: Parent and child are different series
INV 4: Link distances are non-negative
INV 5: Chain depth never exceeds 32 levels
```

---

## 12. Boundary Conditions

```
B1: targetDistance = 0 → child starts when parent ends
B2: earlyWobble = 0 → child cannot start before target
B3: Chain of depth 5+ should work (up to 32)
B4: Parent completion updates all descendants
B5: Chain of depth 32 → works
B6: Chain of depth 33 → ChainDepthExceededError on link creation
B7: Rescheduling parent to different day → children move to same day
```

---

## 13. Verification Strategy

### 12.1 CRUD tests

- Link, query, update, unlink

### 12.2 Cycle tests

- Self-link → error
- A→B→A → error
- A→B→C→A → error
- Deep chains without cycles → success

### 12.3 Cascade tests

- Delete child → link gone
- Delete parent with children → error

### 12.4 Scheduling tests

- Child scheduled relative to parent
- Parent completion → child time updates

---

## 14. Dependencies

- Segment 4: Adapter
- Segment 5: Series CRUD
- Segment 6: Completions (for actual end time)
