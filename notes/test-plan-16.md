# Test Plan: Segment 16 — Integration Tests

## Overview

Integration tests verify the complete system works correctly end-to-end. These are scenario-based tests that exercise multiple components together.

**Test file**: `tests/16-integration.test.ts`

**Dependencies**: All previous segments (1-15), both mock and SQLite adapters

---

## 1. Exercise Regimen Scenario

### 1.1 State Machine Progression

| State | Condition | Walk Pattern | Weight Pattern |
|-------|-----------|--------------|----------------|
| Deconditioned | < 7 walks/14 days | everyNDays(2) | None |
| Conditioning | >= 7 walks, < 4 weights | daily | Mon/Fri |
| Conditioned | >= 4 weights/14 days | daily | Mon/Wed/Fri |

### 1.2 Test Steps

| Step | Action | Expected Verification | Properties |
|------|--------|----------------------|------------|
| 1 | Initial state | Walks every other day, no weights | - |
| 2 | Log 7 walks | Pattern transitions to daily, weights appear | PROP 1, PROP 3, PROP 4 |
| 3 | Complete first weight | Next weight shows "Workout B" | PROP 2 |
| 4 | Log 4 weight sessions | Weights now Mon/Wed/Fri | PROP 1 |
| 5 | Stop logging 7 days | Regression to deconditioned | PROP 1 |
| 6 | Check cycling | Cycling index preserved (PROP 5) | PROP 5 |

---

## 2. Laundry Chain Scenario

### 2.1 Chain Structure

```
Load Washer (09:00, 14 min)
  └→ Transfer to Dryer (target: +80 min, early: 0, late: +10)
       └→ Unload & Fold (target: +200 min, early: -5, late: +120)
```

### 2.2 Test Steps

| Step | Action | Expected Verification | Properties |
|------|--------|----------------------|------------|
| 1 | Initial schedule | Transfer ~10:34, Unload ~13:54 | PROP 7 |
| 2 | Complete washer at 09:20 | Transfer shifts to 10:40 | PROP 6 |
| 3 | Complete transfer at 10:45 | Unload target based on 10:45 | PROP 6 |
| 4 | Attempt early transfer | Blocked by earlyWobble=0 | PROP 8 |
| 5 | Test late bounds | Limited by lateWobble | PROP 9 |

### 2.3 Deep Chain Test

| Test Name | Scenario | Expected | Properties |
|-----------|----------|----------|------------|
| `3-level chain works` | A→B→C | All scheduled correctly | PROP 10 |
| `reschedule cascades` | Reschedule parent A | B and C move | PROP 11 |

---

## 3. Conflict Scenario

### 3.1 Fixed-Fixed Overlap

| Test Name | Setup | Expected | Properties |
|-----------|-------|----------|------------|
| `fixed overlap warning` | Two meetings same time | Both scheduled, warning | PROP 12, PROP 14 |
| `overlap details` | Check conflict | Includes involved series | PROP 13 |

### 3.2 Impossible Constraint

| Test Name | Setup | Expected | Properties |
|-----------|-------|----------|------------|
| `constraint violation error` | mustBeBefore with fixed times reversed | Error conflict | PROP 12 |
| `best-effort placement` | After error | Both tasks still scheduled | PROP 14 |

### 3.3 Chain Cannot Fit

| Test Name | Setup | Expected | Properties |
|-----------|-------|----------|------------|
| `chainCannotFit error` | Child bounds violated | Error reported | PROP 12 |
| `conflict details` | Check conflict | Chain info included | PROP 13 |

---

## 4. Relational Constraint Scenario

### Test Steps

| Step | Action | Expected |
|------|--------|----------|
| 1 | Schedule two heavy | Not adjacent |
| 2 | Add cardio | Cardio same day as heavy |
| 3 | Remove cantBeNextTo | Heavy can be adjacent |

---

## 5. Large Data Scenario

### Performance Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `100 series stress` | 100 series, 1 year | Completes successfully |
| `no infinite loops` | Complex constraints | Terminates |
| `acceptable performance` | Large data set | Within time bounds |
| `all constraints evaluated` | Multiple constraints | All checked |

---

## 6. Timezone Scenario

### 6.1 DST Transition Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `spring forward 02:30` | Series at 02:30 on DST date | Shifts to 03:00 |
| `other instances unaffected` | Check adjacent days | Normal times |
| `fall back ambiguity` | Series at 01:30 on DST end | First occurrence |

### 6.2 Cross-Timezone Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `EST to PST conversion` | Create in EST, query in PST | Correct times |
| `day boundaries correct` | Cross-midnight events | Correct dates |

### 6.3 All-Day Reminder Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `all-day reminder timing` | Event on 15th, 60 min before | Fires 23:00 on 14th |
| `all-day excluded from reflow` | All-day instance | No time conflicts |

---

## 7. Reminder Scenario

### Test Steps

| Time | Expected State |
|------|---------------|
| 12:55 | No pending reminders |
| 13:00 | "prepare" (60 min) pending |
| After ack | "prepare" not pending |
| 13:50 | "urgent" (10 min) pending |
| After complete | Both reminders for next instance |

---

## 8. Instance Exception Scenario

### Test Steps

| Action | Expected |
|--------|----------|
| Cancel Monday | That Monday not in schedule |
| Check other Mondays | Still scheduled |
| Reschedule to Tuesday | Instance on Tuesday |
| Check original Monday | Slot free |

---

## 9. Cycling Scenario

### 9.1 With gapLeap

| Week | Action | Expected Title |
|------|--------|----------------|
| 1 | Skip | "A" (no advance) |
| 2 | Complete | "A" → "B" |
| 3 | Check | "B" |

### 9.2 Without gapLeap

| Instance | Expected Title |
|----------|----------------|
| 0 | "A" |
| 1 | "B" |
| 2 | "C" |
| 3 | "A" (wrap) |

---

## 10. Adaptive Duration Scenario

### Test Steps

| State | Durations | Expected |
|-------|-----------|----------|
| No history | - | 30 (fallback) |
| After [20,25,30,25,30] | avg=26 | 33 (26 * 1.25) |

---

## 11. Leap Year Scenario

### Yearly on Feb 29

| Year | Expected |
|------|----------|
| 2020 | Instance on Feb 29 |
| 2021-2023 | No instance |
| 2024 | Instance on Feb 29 |
| 2025-2027 | No instance |
| 2028 | Instance on Feb 29 |

---

## 12. Chain Depth Scenario

### Unit Tests

| Test Name | Depth | Expected |
|-----------|-------|----------|
| `depth 32 works` | 32 levels | Chain created |
| `depth 33 rejected` | 33 levels | ChainDepthExceededError |

---

## 13. End-to-End Properties

| Property | Description | Verification |
|----------|-------------|--------------|
| E2E 1 | All features together | Complex scenario passes |
| E2E 2 | State consistency | Query after any operation |
| E2E 3 | Valid inputs → valid schedule | Random valid inputs |
| E2E 4 | Invalid → conflicts reported | Known invalid inputs |
| E2E 5 | Performance acceptable | Benchmark tests |
| E2E 6 | No data loss | Persist and reload |
| E2E 7 | Error recovery consistent | Fail and verify state |
| E2E 8 | Cycling preserved on split | Split series with cycling |
| E2E 9 | Children move on parent reschedule | Reschedule chain parent |
| E2E 10 | All-day reminders use 00:00 | All-day with reminder |

---

## 14. Adapter Comparison Tests

### Run All Tests on Both Adapters

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `mock adapter passes` | All integration tests | All green |
| `SQLite adapter passes` | All integration tests | All green |
| `behavior identical` | Compare results | Identical output |

---

## 15. Test Count Summary

| Scenario | Test Steps | Total |
|----------|------------|-------|
| Exercise Regimen | ~10 | ~10 |
| Laundry Chain | ~8 | ~8 |
| Conflict | ~6 | ~6 |
| Relational Constraint | ~3 | ~3 |
| Large Data | ~4 | ~4 |
| Timezone | ~6 | ~6 |
| Reminder | ~5 | ~5 |
| Instance Exception | ~4 | ~4 |
| Cycling | ~6 | ~6 |
| Adaptive Duration | ~2 | ~2 |
| Leap Year | ~2 | ~2 |
| Chain Depth | ~2 | ~2 |
| E2E Properties | ~10 | ~10 |
| Adapter Comparison | ~3 | ~3 |
| **Total** | **~71** | **~71** |

---

## 16. Test Execution Notes

- Run scenarios as full sequences, not isolated tests
- Test state transitions by logging completions and verifying schedule changes
- Verify cycling index preserved across operations
- Test chain behavior with actual completion times
- Generate conflicts deliberately to verify reporting
- Test timezone behavior at exact DST transition times
- Run performance tests with realistic data volumes
- Compare mock and SQLite adapter results for consistency
- Document any behavioral differences between adapters
