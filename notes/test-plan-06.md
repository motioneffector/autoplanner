# Test Plan: Segment 06 — Completions

## Overview

Completions record what actually happened. They provide the historical record that conditions query to affect future scheduling, and support adaptive duration calculations.

**Test file**: `tests/06-completions.test.ts`

**Dependencies**: Segment 1 (Time & Date Utilities), Segment 4 (Adapter), Segment 5 (Series CRUD)

---

## 1. Log Completion

### 1.1 Basic Logging Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `log completion returns unique ID` | logCompletion | UUID returned | POST 1 |
| `logged completion is retrievable` | log, getCompletion | Returns completion | POST 4, LAW 1 |
| `date derived from startTime` | log with startTime | date = dateOf(startTime) | POST 2 |
| `createdAt set on log` | log | createdAt = now | POST 3 |
| `duration calculated correctly` | log, check duration | endTime - startTime | LAW 3 |

### 1.2 Precondition Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `series must exist` | non-existent seriesId | NotFoundError | PRE 1 |
| `duplicate instance rejected` | log same instance twice | DuplicateCompletionError | PRE 2, LAW 2 |
| `endTime before startTime` | endTime < startTime | InvalidTimeRangeError | PRE 3 |
| `endTime equals startTime` | endTime = startTime | Accepted (0 duration) | PRE 3 |
| `invalid instanceDate` | invalid date format | ValidationError | PRE 4 |
| `invalid startTime` | invalid datetime | ValidationError | PRE 5 |
| `invalid endTime` | invalid datetime | ValidationError | PRE 5 |

---

## 2. Query Completions

### 2.1 By ID

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get existing completion` | log, get by ID | Returns completion | - |
| `get non-existent completion` | get unknown ID | null | - |
| `get deleted completion` | log, delete, get | null | - |

### 2.2 By Series

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `all completions match series` | create 3 for series A | All have seriesId = A | LAW 4 |
| `excludes other series` | create for A and B, query A | Only A completions | LAW 4 |
| `ordered by date descending` | log dates 1, 3, 2 | Returns in order 3, 2, 1 | LAW 5 |
| `empty if no completions` | query series with none | [] | - |

### 2.3 By Instance

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get completion by instance` | log, getByInstance | Returns completion | LAW 6 |
| `returns null if no completion` | query non-completed instance | null | LAW 6 |
| `unique per instance` | only one per (series, date) | At most one returned | LAW 6 |

### 2.4 By Target and Window

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `completions in window` | window=7, log within | Included | LAW 7 |
| `completions outside window` | window=7, log 10 days ago | Excluded | LAW 7 |
| `target by tag` | series has tag, log | Returned for tag query | LAW 8 |
| `target by tag multiple series` | 2 series with tag | Returns completions from both | LAW 8 |
| `target by seriesId` | target specific series | Only that series | LAW 9 |
| `target by seriesId excludes others` | 2 series, target one | Only targeted series | LAW 9 |

---

## 3. Delete Completion

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `delete existing completion` | log, delete | Succeeds | - |
| `get after delete returns null` | log, delete, get | null | POST 5, POST 6 |
| `getByInstance after delete` | log, delete, getByInstance | null | LAW 10 |
| `delete non-existent` | delete unknown ID | NotFoundError | LAW 11 |
| `delete already deleted` | delete twice | NotFoundError | LAW 11 |

---

## 4. Count Completions in Window

### 4.1 Basic Count Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `count is non-negative` | any query | result ≥ 0 | LAW 12 |
| `count bounded by total` | 3 completions, query | result ≤ 3 | LAW 13 |
| `count empty target` | target with no completions | 0 | LAW 12 |

### 4.2 Window Boundary Tests

| Test Name | Window | Completion Date | asOf | Expected | Laws Verified |
|-----------|--------|-----------------|------|----------|---------------|
| `completion on asOf date` | 7 | asOf | asOf | counted | LAW 14, LAW 15 |
| `completion on window start` | 7 | asOf - 6 | asOf | counted | LAW 14, LAW 16 |
| `completion one day before window` | 7 | asOf - 7 | asOf | NOT counted | LAW 17 |
| `completion after asOf` | 7 | asOf + 1 | asOf | NOT counted | - |
| `14-day window boundary start` | 14 | asOf - 13 | asOf | counted | LAW 16 |
| `14-day window one before` | 14 | asOf - 14 | asOf | NOT counted | LAW 17 |

### 4.3 Count by Target

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `count by tag` | 2 series with tag, 3 total completions | 3 | - |
| `count by seriesId` | specific series, 2 completions | 2 | - |
| `count excludes wrong tag` | series without tag | 0 | - |

---

## 5. Days Since Last Completion

### 5.1 Basic Days Since Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no completions returns null` | target with none | null | LAW 18 |
| `completion today returns 0` | completion on asOf | 0 | LAW 19 |
| `completion yesterday returns 1` | completion on asOf - 1 | 1 | LAW 20 |
| `completion 7 days ago` | completion on asOf - 7 | 7 | LAW 20, LAW 21 |

### 5.2 Multiple Completions

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `uses most recent` | completions at 3, 5, 10 days ago | 3 | LAW 21 |
| `ignores older completions` | recent and old | Uses recent | LAW 21 |

### 5.3 By Target Type

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `days since by tag` | tag target, completion 2 days ago | 2 | - |
| `days since by seriesId` | series target, completion 5 days ago | 5 | - |
| `tag finds most recent across series` | 2 series with tag, completions at 1 and 3 | 1 | - |

---

## 6. Adaptive Duration Support

### 6.1 Mode: lastN

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `returns at most n durations` | 10 completions, n=5 | 5 durations | LAW 22 |
| `returns fewer if fewer exist` | 3 completions, n=10 | 3 durations | LAW 23 |
| `most recent first` | durations 30, 45, 60 (by date) | [60, 45, 30] | LAW 24 |
| `empty if no completions` | n=5, no completions | [] | LAW 23 |

### 6.2 Mode: windowDays

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `all durations in window` | window=7, 3 in window | 3 durations | LAW 25 |
| `excludes outside window` | window=7, 1 in, 1 out | 1 duration | LAW 25 |
| `empty if none in window` | window=7, completion 10 days ago | [] | LAW 26 |
| `boundary: completion on window start` | window=7, completion 6 days ago | Included | LAW 25 |

### 6.3 Duration Calculation

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `duration is endTime - startTime` | 09:00 to 09:30 | 30 minutes | LAW 3 |
| `zero duration allowed` | start = end | 0 minutes | - |
| `long duration` | 09:00 to 11:30 | 150 minutes | - |

---

## 7. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `completion references existing series` | Attempt orphan creation |
| INV 2 | `at most one per instance` | Attempt duplicate |
| INV 3 | `endTime >= startTime` | Attempt invalid range |
| INV 4 | `completion ID immutable` | Verify ID unchanged after operations |
| INV 5 | `completions never modified` | No update operation exists |

---

## 8. Error Types

| Error Type | Test Scenario |
|------------|---------------|
| NotFoundError | Delete non-existent completion |
| NotFoundError | Log completion for non-existent series |
| DuplicateCompletionError | Log completion for same instance twice |
| InvalidTimeRangeError | Log with endTime < startTime |

---

## 9. Real-World Scenario Tests

### 9.1 Condition Integration Scenario

| Test Name | Setup | Query | Expected |
|-----------|-------|-------|----------|
| `condition count query` | 5 walks in 14 days | countInWindow('walk', 14) | 5 |
| `condition days since query` | last walk 3 days ago | daysSince('walk') | 3 |

### 9.2 Adaptive Duration Scenario

| Test Name | Setup | Query | Expected |
|-----------|-------|-------|----------|
| `average recent durations` | durations 20, 30, 25 | lastN=3 | [25, 30, 20] |
| `window durations for calculation` | 5 in 7 days | windowDays=7 | 5 durations |

---

## 10. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Log Completion | ~12 | ~12 |
| Query by ID/Series/Instance | ~10 | ~10 |
| Query by Target and Window | ~6 | ~6 |
| Delete Completion | ~5 | ~5 |
| Count in Window | ~12 | ~12 |
| Days Since Last | ~10 | ~10 |
| Adaptive Duration | ~12 | ~12 |
| Invariants | ~5 | ~5 |
| Scenarios | ~4 | ~4 |
| **Total** | **~76** | **~76** |

---

## 11. Test Execution Notes

- Use mock adapter for unit tests
- Each test should start with fresh adapter state
- Create test series before logging completions
- Test window boundaries carefully with exact date arithmetic
- Verify sort order by checking array indices
- Test both tag and seriesId target types for all query operations
- Verify durations are calculated correctly from timestamps
- Test edge cases: zero duration, midnight crossings
