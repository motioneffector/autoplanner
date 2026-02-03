# Segment 7: Cycling — Formal Specification

## 1. Overview

Cycling rotates through a list of titles/descriptions across instances of a series. Supports sequential and random modes, with optional gap-leap behavior.

---

## 2. Types

### 2.1 CyclingConfig

```
type CyclingConfig = {
  items: CyclingItem[]       // non-empty
  mode: 'sequential' | 'random'
  gapLeap: boolean
}

type CyclingItem = {
  title: string
  description?: string
}
```

### 2.2 State

```
type CyclingState = {
  currentIndex: number       // for gapLeap=true, tracks position
}
```

---

## 3. Get Cycling Item

```
getCyclingItem(config: CyclingConfig, state: CyclingState, instanceNumber: number): CyclingItem
```

### 3.1 Mode: Sequential, gapLeap=false

```
getCyclingItem({ items, mode: 'sequential', gapLeap: false }, _, instanceNumber) =
  items[instanceNumber mod |items|]
```

**Properties**:
```
LAW 1 (Deterministic): Same instanceNumber always returns same item
LAW 2 (Periodic): getCyclingItem(_, _, n) = getCyclingItem(_, _, n + |items|)
LAW 3 (Start): Instance 0 gets item 0
LAW 4 (Sequence): Instance n gets item (n mod length)
```

### 3.2 Mode: Sequential, gapLeap=true

```
getCyclingItem({ items, mode: 'sequential', gapLeap: true }, { currentIndex }, _) =
  items[currentIndex mod |items|]

// After completion, advance index:
advanceIndex(state) = { currentIndex: (state.currentIndex + 1) mod |items| }
```

**Properties**:
```
LAW 5 (State-based): Item determined by currentIndex, not instanceNumber
LAW 6 (Advance on complete): Index advances only when completion logged
LAW 7 (Skip-safe): Skipped instances don't advance index
LAW 8 (Wrap): Index wraps around at end of items
```

### 3.3 Mode: Random

```
getCyclingItem({ items, mode: 'random', gapLeap }, state, instanceNumber) =
  if gapLeap then
    // Seed RNG with currentIndex for reproducibility per position
    items[seededRandom(state.currentIndex) mod |items|]
  else
    // Seed RNG with instanceNumber
    items[seededRandom(instanceNumber) mod |items|]
```

**Properties**:
```
LAW 9 (Bounded): Result is always a valid item from the list
LAW 10 (Reproducible): Same seed → same item (deterministic "random")
```

---

## 4. Advance Cycling

```
advanceCycling(seriesId: SeriesId): void
```

### 4.1 Preconditions

```
PRE 1: Series has cycling config with gapLeap=true
```

### 4.2 Postconditions

```
POST 1: currentIndex incremented by 1 (mod length)
```

### 4.3 Properties

```
LAW 11: Called after completion logged
LAW 12: Not called for gapLeap=false (no state to track)
LAW 13: Idempotent if called multiple times without new completions (no-op guard needed)
```

---

## 5. Reset Cycling

```
resetCycling(seriesId: SeriesId): void
```

### 5.1 Postconditions

```
POST 2: currentIndex set to 0
```

### 5.2 Use Case

Consumer explicitly wants to restart cycling from the beginning.

### 5.3 Important: No Auto-Reset

```
LAW 13: Cycling does NOT auto-reset when patterns deactivate/reactivate due to conditions
LAW 14: Consumer must explicitly call resetCycling if reset is desired
LAW 15: Pattern deactivation preserves currentIndex for when pattern reactivates
```

Rationale: Auto-reset would be surprising behavior. If someone stops exercising for a week, their next workout should continue the sequence, not restart. The consumer can implement auto-reset logic if desired by calling resetCycling based on their domain rules.

---

## 6. Resolve Instance Title

```
resolveInstanceTitle(series: Series, instanceNumber: number): string
```

**Definition**:
```
resolveInstanceTitle(series, instanceNumber) =
  if series.cycling = null then
    series.title
  else
    let item = getCyclingItem(series.cycling, series.cyclingState, instanceNumber)
    item.title
```

**Properties**:
```
LAW 14: No cycling → series title
LAW 15: With cycling → cycling item title
```

---

## 7. Instance Number Calculation

```
getInstanceNumber(series: Series, instanceDate: LocalDate): number
```

**Definition**:
```
getInstanceNumber(series, instanceDate) =
  let allDates = expandPatterns(series.patterns, {start: series.startDate, end: instanceDate}, series.startDate)
  let sortedDates = sort(allDates)
  indexOf(sortedDates, instanceDate)
```

**Properties**:
```
LAW 16: First instance has number 0
LAW 17: Instances numbered in chronological order
LAW 18: Cancelled instances still count (for gapLeap=false)
LAW 19: Completed instances determine index advancement (for gapLeap=true)
```

---

## 8. Invariants

```
INV 1: items.length ≥ 1
INV 2: 0 ≤ currentIndex < items.length
INV 3: Cycling config is optional per series
INV 4: gapLeap state persisted in database
```

---

## 9. Boundary Conditions

```
B1: Single item → always returns that item
B2: currentIndex at last item → wraps to 0 on advance
B3: Instance number 0 → first item (gapLeap=false)
B4: No completions yet (gapLeap=true) → currentIndex=0 → first item
```

---

## 10. Verification Strategy

### 10.1 Sequential gapLeap=false

```
TEST: items=[A,B,C], instances 0,1,2,3,4 → A,B,C,A,B
TEST: items=[A,B], instances 0,1,2,3 → A,B,A,B
```

### 10.2 Sequential gapLeap=true

```
TEST: items=[A,B], start at index 0
  - Get item → A
  - Complete → advance to 1
  - Get item → B
  - Skip (no complete)
  - Get item → still B
  - Complete → advance to 0
  - Get item → A
```

### 10.3 Random mode

```
TEST: Same seed produces same item
TEST: All items reachable over many calls
```

---

## 11. Dependencies

- Segment 2: Pattern Expansion (for instance numbering)
- Segment 5: Series CRUD
- Segment 6: Completions (for advance trigger)
