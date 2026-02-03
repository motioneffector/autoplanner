# Test Plan: Segment 07 — Cycling

## Overview

Cycling rotates through a list of titles/descriptions across instances of a series. Supports sequential and random modes, with optional gap-leap behavior for state-based progression.

**Test file**: `tests/07-cycling.test.ts`

**Dependencies**: Segment 2 (Pattern Expansion), Segment 5 (Series CRUD), Segment 6 (Completions)

---

## 1. Sequential Mode (gapLeap=false)

### 1.1 Basic Cycling Tests

| Test Name | Items | Instance | Expected | Laws Verified |
|-----------|-------|----------|----------|---------------|
| `instance 0 gets item 0` | [A,B,C] | 0 | A | LAW 3 |
| `instance 1 gets item 1` | [A,B,C] | 1 | B | LAW 4 |
| `instance 2 gets item 2` | [A,B,C] | 2 | C | LAW 4 |
| `instance wraps around` | [A,B,C] | 3 | A | LAW 2, LAW 4 |
| `deterministic same instance` | [A,B,C] | 1, 1 | B, B | LAW 1 |

### 1.2 Periodicity Tests

| Test Name | Items | Instances | Expected | Laws Verified |
|-----------|-------|-----------|----------|---------------|
| `full cycle wraps` | [A,B,C] | 0,1,2,3,4,5 | A,B,C,A,B,C | LAW 2 |
| `two items cycle` | [A,B] | 0,1,2,3 | A,B,A,B | LAW 2 |
| `period equals item count` | [A,B,C] | n, n+3 | Same item | LAW 2 |

### 1.3 Known Answer Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `5 instances 3 items` | items=[A,B,C], instances 0-4 | A,B,C,A,B |
| `4 instances 2 items` | items=[A,B], instances 0-3 | A,B,A,B |

---

## 2. Sequential Mode (gapLeap=true)

### 2.1 State-Based Cycling Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `item determined by currentIndex` | index=1, items=[A,B,C] | B | LAW 5 |
| `ignores instance number` | index=0, instanceNumber=5 | First item | LAW 5 |
| `index advances on completion` | index=0, complete | Index becomes 1 | LAW 6, POST 1 |
| `skipped instance no advance` | skip without complete | Index unchanged | LAW 7 |

### 2.2 Wrap-Around Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `index wraps at end` | index=2, items=[A,B,C], complete | Index becomes 0 | LAW 8 |
| `continuous wrap` | 6 completions, 3 items | Cycles through twice | LAW 8 |

### 2.3 Gap-Leap Sequence Test

| Test Name | Steps | Expected |
|-----------|-------|----------|
| `gap-leap full sequence` | index=0, get→complete→get→skip→get→complete | A, advance, B, still B, B, advance to C |

---

## 3. Random Mode

### 3.1 Random gapLeap=false

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `result is valid item` | random, any instanceNumber | Item in items[] | LAW 9 |
| `same seed same item` | instanceNumber=5, call twice | Same item | LAW 10 |
| `different seeds differ` | instanceNumber 5 vs 6 | May differ (probabilistic) | - |

### 3.2 Random gapLeap=true

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `seeded by currentIndex` | index=0, items=[A,B,C] | Deterministic item | LAW 10 |
| `same index same item` | index=1, call twice | Same item | LAW 10 |

### 3.3 Distribution Test

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `all items reachable` | 1000 calls, 3 items | All 3 items appear | LAW 9 |

---

## 4. Advance Cycling

### 4.1 Advance Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `advance increments index` | index=0, advance | index=1 | POST 1 |
| `advance wraps around` | index=2, 3 items, advance | index=0 | POST 1 |
| `advance requires gapLeap=true` | gapLeap=false, advance | No-op or error | LAW 12 |

### 4.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `advance on gapLeap=true series` | valid gapLeap series | Succeeds | PRE 1 |
| `advance on gapLeap=false series` | gapLeap=false | Error or no-op | PRE 1 |

---

## 5. Reset Cycling

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reset sets index to 0` | index=5, reset | index=0 | POST 2 |
| `reset from index 0` | index=0, reset | index=0 | POST 2 |

### No Auto-Reset Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no auto-reset on deactivation` | pattern deactivates | Index preserved | LAW 13 (reset) |
| `consumer must explicitly reset` | pattern reactivates | Index unchanged | LAW 14 (reset) |
| `deactivation preserves index` | condition disables, re-enables | Continues from same index | LAW 15 (reset) |

---

## 6. Resolve Instance Title

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no cycling uses series title` | series without cycling | series.title | LAW 14 (resolve) |
| `with cycling uses item title` | series with cycling | cycling item title | LAW 15 (resolve) |

---

## 7. Instance Number Calculation

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `first instance is number 0` | first date in expansion | 0 | LAW 16 |
| `instances in chronological order` | dates sorted | Numbered 0, 1, 2... | LAW 17 |
| `cancelled instances counted` | gapLeap=false, cancelled date | Still counts in numbering | LAW 18 |
| `completions determine index` | gapLeap=true | Index based on completions | LAW 19 |

---

## 8. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `single item always returned` | items=[A], any instance | A | B1 |
| `index at last wraps to 0` | index=2, items=[A,B,C], advance | index=0 | B2 |
| `instance 0 first item` | gapLeap=false, instance 0 | items[0] | B3 |
| `no completions first item` | gapLeap=true, no completions | items[0] | B4 |

---

## 9. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `items non-empty` | Attempt empty items |
| INV 2 | `currentIndex in bounds` | Verify 0 ≤ index < length |
| INV 3 | `cycling optional` | Series without cycling works |
| INV 4 | `gapLeap state persisted` | Reset, reload, verify index |

---

## 10. Integration Scenarios

### 10.1 Workout Rotation

```typescript
// Setup: 3 workout types cycling
config = { items: ['Push', 'Pull', 'Legs'], mode: 'sequential', gapLeap: true }
```

| Test Name | Completions | Expected Next |
|-----------|-------------|---------------|
| `start at push` | none | Push |
| `after push done` | 1 | Pull |
| `after push and pull done` | 2 | Legs |
| `skip a day, still on legs` | 2 (skipped) | Legs |
| `after legs done` | 3 | Push (wrap) |

### 10.2 Book Reading Schedule

```typescript
// Setup: 2 books cycling without gapLeap
config = { items: ['Book A', 'Book B'], mode: 'sequential', gapLeap: false }
```

| Test Name | Instance | Expected |
|-----------|----------|----------|
| `day 0` | 0 | Book A |
| `day 1` | 1 | Book B |
| `day 2` | 2 | Book A |
| `day 3` | 3 | Book B |

---

## 11. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Sequential gapLeap=false | ~10 | ~10 |
| Sequential gapLeap=true | ~8 | ~8 |
| Random Mode | ~6 | ~6 |
| Advance Cycling | ~4 | ~4 |
| Reset Cycling | ~5 | ~5 |
| Resolve Instance Title | ~2 | ~2 |
| Instance Number Calculation | ~4 | ~4 |
| Boundary Conditions | ~4 | ~4 |
| Invariants | ~4 | ~4 |
| Integration Scenarios | ~9 | ~9 |
| **Total** | **~56** | **~56** |

---

## 12. Test Execution Notes

- Create mock series with cycling config for each test
- For gapLeap=true tests, explicitly manage currentIndex state
- Test wrap-around with exact boundary values (length-1, length)
- For random mode, use seeded RNG for reproducibility
- Verify determinism by calling same function multiple times
- Test pattern deactivation/reactivation preserves index
- For integration scenarios, simulate complete workflow with completions
