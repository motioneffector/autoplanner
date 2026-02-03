# Test Plan: Segment 08 — Adaptive Duration

## Overview

Adaptive duration calculates scheduled duration based on historical completion times rather than a fixed value. This enables schedules to automatically adjust to actual task durations.

**Test file**: `tests/08-adaptive-duration.test.ts`

**Dependencies**: Segment 6 (Completions)

---

## 1. Fallback Behavior

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no completions returns fallback` | 0 completions, fallback=30 | 30 | LAW 1 |
| `fallback when window empty` | windowDays mode, no completions in window | fallback | LAW 1, LAW 13 |
| `fallback value used exactly` | fallback=45, no history | 45 | LAW 1 |

---

## 2. Average Calculation

### 2.1 Basic Average Tests

| Test Name | Durations | Expected Average | Laws Verified |
|-----------|-----------|------------------|---------------|
| `average of 3 durations` | [30, 60, 90] | 60 | LAW 2 |
| `average of 2 durations` | [10, 20] | 15 | LAW 2 |
| `average of single duration` | [45] | 45 | LAW 2, B6 |
| `average with varying values` | [20, 40, 30, 50] | 35 | LAW 2 |

### 2.2 Rounding Tests

| Test Name | Durations | Expected (rounded) | Laws Verified |
|-----------|-----------|-------------------|---------------|
| `rounds to nearest integer` | [10, 11] | 11 (10.5 rounds up) | LAW 6 |
| `rounds down at .4` | [10, 10, 11] | 10 (10.33 rounds to 10) | LAW 6 |
| `rounds up at .5` | [10, 11] | 11 | LAW 6 |

---

## 3. Multiplier Application

### Unit Tests

| Test Name | Average | Multiplier | Expected | Laws Verified |
|-----------|---------|------------|----------|---------------|
| `multiplier 1.0 no change` | 60 | 1.0 | 60 | LAW 3, B1 |
| `multiplier 1.25 adds 25%` | 60 | 1.25 | 75 | LAW 3, B2 |
| `multiplier 0.5 halves` | 60 | 0.5 | 30 | LAW 3 |
| `multiplier 2.0 doubles` | 30 | 2.0 | 60 | LAW 3 |
| `multiplier applied before bounds` | 40 | 1.5 | 60 (before clamping) | LAW 3 |

---

## 4. Minimum and Maximum Bounds

### 4.1 Minimum Bound Tests

| Test Name | Calculated | Minimum | Expected | Laws Verified |
|-----------|------------|---------|----------|---------------|
| `above minimum unchanged` | 60 | 45 | 60 | LAW 4 |
| `below minimum clamped up` | 30 | 45 | 45 | LAW 4, B4 |
| `equals minimum unchanged` | 45 | 45 | 45 | LAW 4 |

### 4.2 Maximum Bound Tests

| Test Name | Calculated | Maximum | Expected | Laws Verified |
|-----------|------------|---------|----------|---------------|
| `below maximum unchanged` | 60 | 90 | 60 | LAW 5 |
| `above maximum clamped down` | 120 | 90 | 90 | LAW 5, B5 |
| `equals maximum unchanged` | 90 | 90 | 90 | LAW 5 |

### 4.3 Combined Bounds Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `min and max both apply` | calc=60, min=45, max=90 | 60 | LAW 4, LAW 5 |
| `minimum equals maximum` | calc=60, min=50, max=50 | 50 | B3 |
| `clamped to minimum when both set` | calc=30, min=45, max=90 | 45 | LAW 4 |
| `clamped to maximum when both set` | calc=120, min=45, max=90 | 90 | LAW 5 |

---

## 5. Positive Result Guarantee

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `result always positive` | any valid config | result ≥ 1 | LAW 7 |
| `zero duration clamped to 1` | durations=[0] | 1 | LAW 8, B7 |
| `all zero durations clamped` | durations=[0, 0, 0] | 1 | LAW 8, B8 |
| `very small average clamped` | avg=0.3, multiplier=1 | 1 | LAW 8 |

---

## 6. Mode: lastN

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `uses n most recent` | 10 completions, n=5 | Average of 5 most recent | LAW 8 (mode) |
| `fewer than n uses all` | 3 completions, n=10 | Average of 3 | LAW 9 |
| `order doesn't affect average` | durations in any order | Same average | LAW 10 |
| `most recent by date` | varying dates | Uses chronologically recent | LAW 8 (mode) |

---

## 7. Mode: windowDays

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `uses completions in window` | 3 in 7 days, 2 older | Average of 3 | LAW 11 |
| `window includes today` | completion today, window=1 | Included | LAW 12 |
| `empty window returns fallback` | no completions in 30 days | fallback | LAW 13 |
| `boundary: first day of window` | completion at window start | Included | LAW 11 |

---

## 8. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `multiplier 1.0` | no scaling | Average unchanged | B1 |
| `multiplier 1.25` | 25% padding | avg * 1.25 | B2 |
| `min equals max` | min=max=50 | 50 (if history) | B3 |
| `min exceeds calculated` | calc=30, min=45 | 45 | B4 |
| `max below calculated` | calc=100, max=90 | 90 | B5 |
| `single completion` | [45] | 45 | B6 |
| `zero duration completion` | [0] | 1 | B7 |
| `all zero durations` | [0, 0] | 1 | B8 |

---

## 9. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `fallback >= 1` | Attempt fallback=0 |
| INV 2 | `minimum <= maximum` | Attempt min > max |
| INV 3 | `multiplier > 0` | Attempt multiplier=0 or negative |
| INV 4 | `value >= 1` | Attempt value=0 |

---

## 10. Known Answer Tests

| Durations | Multiplier | Min | Max | Expected |
|-----------|------------|-----|-----|----------|
| [30, 60, 90] | 1.0 | - | - | 60 |
| [30, 60, 90] | 1.25 | - | - | 75 |
| [30, 60, 90] | 1.0 | 45 | 90 | 60 |
| [30, 60, 90] | 1.0 | 75 | 100 | 75 |
| [30, 60, 90] | 1.0 | 30 | 50 | 50 |
| [10, 20] | 1.0 | - | - | 15 |
| [10, 20] | 2.0 | - | - | 30 |
| [] (fallback=45) | 1.0 | - | - | 45 |

---

## 11. Real-World Scenarios

### 11.1 Workout Duration Adaptation

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `adapt to recent workouts` | last 5 workouts: 45,50,55,40,60 | 50 minutes |
| `new workout starts at fallback` | no history, fallback=30 | 30 minutes |

### 11.2 Padding for Transitions

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `25% buffer for transitions` | avg=40, multiplier=1.25 | 50 minutes |
| `buffer respects maximum` | avg=60, mult=1.25, max=70 | 70 minutes |

---

## 12. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Fallback Behavior | ~3 | ~3 |
| Average Calculation | ~7 | ~7 |
| Multiplier Application | ~5 | ~5 |
| Bounds (Min/Max) | ~10 | ~10 |
| Positive Result | ~4 | ~4 |
| Mode lastN | ~4 | ~4 |
| Mode windowDays | ~4 | ~4 |
| Boundary Conditions | ~8 | ~8 |
| Invariants | ~4 | ~4 |
| Known Answer Tests | ~8 | ~8 |
| Scenarios | ~4 | ~4 |
| **Total** | **~61** | **~61** |

---

## 13. Test Execution Notes

- Create completions with known durations before testing
- Test rounding behavior at exact .5 boundaries
- Verify multiplier is applied BEFORE bounds clamping
- Test both modes independently
- Verify positive floor (≥1) is applied last
- Use exact arithmetic to predict expected values
- Test edge case of minimum = maximum
