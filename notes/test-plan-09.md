# Test Plan: Segment 09 — Instance Exceptions

## Overview

Instance exceptions modify individual occurrences without changing the series rule. An instance can be cancelled (removed) or rescheduled (moved) to a different time.

**Test file**: `tests/09-instance-exceptions.test.ts`

**Dependencies**: Segment 2 (Pattern Expansion), Segment 4 (Adapter), Segment 5 (Series CRUD)

---

## 1. Cancel Instance

### 1.1 Basic Cancel Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `cancel removes from schedule` | cancel instance | Instance not in getSchedule | LAW 1 |
| `cancel doesn't affect pattern` | cancel one | Other instances still generated | LAW 2 |
| `cancel creates exception` | cancel | Exception record exists | POST 1 |
| `series continues after cancel` | cancel one instance | Other instances unaffected | POST 3 |

### 1.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `series must exist` | cancel on non-existent series | NotFoundError | PRE 1 |
| `instance must exist` | cancel date not in pattern | NonExistentInstanceError | PRE 2, B7 |
| `cannot cancel already cancelled` | cancel twice | AlreadyCancelledError | PRE 3, LAW 3 |

### 1.3 Cancel Rescheduled Instance

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `can cancel rescheduled` | reschedule then cancel | Instance cancelled | LAW 4 |
| `cancel overwrites reschedule` | reschedule then cancel | Type becomes cancelled | LAW 4 |

---

## 2. Reschedule Instance

### 2.1 Basic Reschedule Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reschedule moves instance` | reschedule to new time | Instance at newTime | LAW 5, POST 5 |
| `original slot freed` | reschedule | Original time unoccupied | LAW 6, POST 6 |
| `exception record created` | reschedule | Exception with type=rescheduled | POST 4 |

### 2.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `series must exist` | reschedule non-existent series | NotFoundError | PRE 4 |
| `instance must exist` | reschedule date not in pattern | NonExistentInstanceError | PRE 5 |
| `cannot reschedule cancelled` | cancel then reschedule | CancelledInstanceError | PRE 6, LAW 7 |
| `newTime must be valid` | invalid datetime | ValidationError | PRE 7 |

### 2.3 Re-Reschedule Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reschedule updates newTime` | reschedule twice | Latest newTime used | LAW 8 |
| `original still freed` | re-reschedule | Original still free | LAW 6 |

---

## 3. Restore Instance

### 3.1 Restore Cancelled Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `restore cancelled instance` | cancel then restore | Instance back in schedule | LAW 9, POST 7, POST 8 |
| `restored at original time` | cancel, restore | Original time | LAW 9 |

### 3.2 Restore Rescheduled Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `restore rescheduled instance` | reschedule then restore | Instance at original time | LAW 9 |
| `exception deleted` | restore | getException returns null | POST 7 |

### 3.3 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `exception must exist` | restore non-excepted | NoExceptionError | PRE 8, LAW 10 |

---

## 4. Query Exceptions

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get exception for instance` | cancel, get | Returns exception | - |
| `get non-excepted returns null` | get unexcepted instance | null | LAW 11 |
| `get exceptions by series` | create 3 exceptions | Returns all 3 | - |
| `range query inclusive` | exceptions in range | Returns matching | LAW 12 |
| `range query excludes outside` | exception outside range | Not returned | LAW 12 |

---

## 5. Integration with Pattern Expansion

### 5.1 Expansion Respects Exceptions

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `cancelled excluded from expansion` | cancel, expand | Instance not in list | LAW 1 |
| `rescheduled at new time` | reschedule, expand | Instance at newTime | LAW 5 |
| `non-excepted unchanged` | expand | Normal instances present | LAW 2 |

### 5.2 Multiple Exceptions

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `multiple cancelled` | cancel 3 instances | All 3 excluded |
| `multiple rescheduled` | reschedule 2 instances | Both at new times |
| `mixed exceptions` | cancel 1, reschedule 1 | One excluded, one moved |

---

## 6. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `cancel first instance` | cancel day 1 | Only first excluded | B1 |
| `cancel last instance` | cancel last scheduled | Only last excluded | B2 |
| `reschedule same day different time` | same date, new time | Works | B3 |
| `reschedule to different day` | new date entirely | Works | B4 |
| `reschedule across month boundary` | Jan 31 → Feb 1 | Works | B5 |
| `reschedule across year boundary` | Dec 31 → Jan 1 | Works | B5 |
| `reschedule outside range` | to date outside reflow range | Not in that range | B6 |
| `exception on non-pattern date` | cancel date not produced | NonExistentInstanceError | B7 |

---

## 7. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `one exception per instance` | Verify unique (seriesId, instanceDate) |
| INV 2 | `rescheduled has newTime` | Check newTime not null for rescheduled |
| INV 3 | `cancelled no newTime` | Check newTime null for cancelled |
| INV 4 | `exception only for pattern dates` | Attempt exception on non-pattern date |
| INV 5 | `series delete cascades` | Delete series, verify exceptions deleted |

---

## 8. Error Types

| Error Type | Test Scenario |
|------------|---------------|
| NonExistentInstanceError | Cancel/reschedule instance not in pattern |
| AlreadyCancelledError | Cancel already-cancelled instance |
| CancelledInstanceError | Reschedule cancelled instance |
| NoExceptionError | Restore instance without exception |
| NotFoundError | Cancel/reschedule for non-existent series |

---

## 9. Real-World Scenarios

### 9.1 Skipping a Day

| Test Name | Setup | Action | Expected |
|-----------|-------|--------|----------|
| `skip workout one day` | daily series | cancel Wed | Mon, Tue, Thu, Fri appear |
| `restore skipped day` | cancelled Wed | restore | Mon-Fri all appear |

### 9.2 Moving an Appointment

| Test Name | Setup | Action | Expected |
|-----------|-------|--------|----------|
| `move meeting earlier` | meeting at 2pm | reschedule to 10am | Appears at 10am |
| `move to next day` | meeting Mon | reschedule to Tue | Appears Tue |

### 9.3 Vacation Handling

| Test Name | Setup | Action | Expected |
|-----------|-------|--------|----------|
| `cancel week of instances` | daily, Mon-Fri | cancel 5 days | None in that week |
| `restore after vacation` | 5 cancelled | restore all 5 | All 5 back |

---

## 10. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Cancel Instance | ~10 | ~10 |
| Reschedule Instance | ~10 | ~10 |
| Restore Instance | ~6 | ~6 |
| Query Exceptions | ~5 | ~5 |
| Pattern Integration | ~6 | ~6 |
| Boundary Conditions | ~8 | ~8 |
| Invariants | ~5 | ~5 |
| Error Types | ~5 | ~5 |
| Scenarios | ~8 | ~8 |
| **Total** | **~63** | **~63** |

---

## 11. Test Execution Notes

- Create series with known patterns before testing exceptions
- Verify pattern produces instances on target dates before testing
- Test both cancelled and rescheduled types independently
- Verify exception records match expected type and data
- Test schedule expansion after each exception operation
- Verify cascade delete by checking exceptions after series deletion
- Test across date boundaries (month, year, DST transitions)
