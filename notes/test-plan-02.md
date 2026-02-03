# Test Plan: Segment 02 — Pattern Expansion

## Overview

Pattern expansion is a pure function that takes a pattern definition, date range, and series start date, and produces the set of dates on which instances occur. This module has 13 pattern types and composition operations.

**Test file**: `tests/02-pattern-expansion.test.ts`

**Dependencies**: Segment 1 (Time & Date Utilities)

---

## 1. Daily Pattern

### Unit Tests

| Test Name | Range | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `daily 7-day range` | 2024-01-01 to 2024-01-07 | 7 dates | LAW 1, LAW 2, KNOWN 1 |
| `daily single day` | 2024-01-01 to 2024-01-01 | 1 date | B5, B6 |
| `daily month boundary` | 2024-01-30 to 2024-02-02 | 4 dates | LAW 2 |
| `daily year boundary` | 2023-12-30 to 2024-01-02 | 4 dates | B8 |
| `daily leap year Feb` | 2024-02-28 to 2024-03-01 | 3 dates | - |
| `daily non-leap Feb` | 2023-02-28 to 2023-03-01 | 2 dates | - |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `daily count equals days in range + 1` | `|result| = daysBetween(start, end) + 1` | LAW 1 |
| `daily contains all dates in range` | `∀d ∈ [start, end]: d ∈ result` | LAW 2 |

---

## 2. Every N Days Pattern

### Unit Tests

| Test Name | Pattern | Range | Start | Expected | Laws Verified |
|-----------|---------|-------|-------|----------|---------------|
| `everyNDays(2) over Jan` | n=2 | 2024-01-01 to 2024-01-31 | 2024-01-01 | Jan 1,3,5,7,...,31 (16 dates) | LAW 3, KNOWN 2 |
| `everyNDays(3) over Jan` | n=3 | 2024-01-01 to 2024-01-31 | 2024-01-01 | Jan 1,4,7,10,...,31 (11 dates) | LAW 4 |
| `everyNDays anchor` | n=2 | 2024-01-01 to 2024-01-10 | 2024-01-01 | Includes Jan 1 | LAW 5 |
| `everyNDays phase from mid-month` | n=3 | 2024-01-01 to 2024-01-31 | 2024-01-05 | Jan 5,8,11,... | LAW 4 |
| `everyNDays start after range` | n=2 | 2024-01-01 to 2024-01-10 | 2024-01-15 | empty | E1, B1 |
| `everyNDays n > range span` | n=30 | 2024-01-01 to 2024-01-10 | 2024-01-01 | [Jan 1] only | E2 |
| `everyNDays(1) equals daily` | n=1 | 2024-01-01 to 2024-01-07 | 2024-01-01 | 7 dates | LAW 6 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `everyNDays periodicity` | `d ∈ result → addDays(d, n) ∈ result ∨ addDays(d, n) > end` | LAW 3 |
| `everyNDays phase` | All dates congruent to seriesStart mod n | LAW 4 |
| `everyNDays includes anchor` | `seriesStart ∈ range → seriesStart ∈ result` | LAW 5 |

---

## 3. Weekly Pattern

### Unit Tests

| Test Name | Range | Start | Expected | Laws Verified |
|-----------|-------|-------|----------|---------------|
| `weekly Mon start` | 2024-01-01 (Mon) to 2024-01-31 | 2024-01-01 | 5 Mondays | LAW 7, LAW 8 |
| `weekly Fri start` | 2024-01-05 (Fri) to 2024-02-02 | 2024-01-05 | 5 Fridays | LAW 7 |
| `weekly across year` | 2023-12-25 to 2024-01-15 | 2023-12-25 | Mondays only | LAW 7 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `weekly same weekday` | All dates have same weekday as seriesStart | LAW 7 |
| `weekly 7-day spacing` | Consecutive dates are exactly 7 days apart | LAW 8 |

---

## 4. Every N Weeks Pattern

### Unit Tests

| Test Name | Pattern | Range | Start | Expected | Laws Verified |
|-----------|---------|-------|-------|----------|---------------|
| `everyNWeeks(2) bi-weekly` | n=2 | 2024-01-01 to 2024-02-29 | 2024-01-01 | ~4-5 dates | LAW 10 |
| `everyNWeeks explicit weekday` | n=2, wed | 2024-01-01 to 2024-01-31 | 2024-01-01 | Every other Wed | LAW 9 |
| `everyNWeeks(1) same as weekly` | n=1 | 2024-01-01 to 2024-01-31 | 2024-01-01 | Same as weekly | LAW 11 |
| `everyNWeeks default weekday` | n=2, no weekday | 2024-01-01 to 2024-01-31 | 2024-01-01 | Uses start's weekday | LAW 9 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `everyNWeeks correct weekday` | `∀d ∈ result: dayOfWeek(d) = targetWeekday` | LAW 9 |
| `everyNWeeks spacing` | Consecutive dates are 7n days apart | LAW 10 |

---

## 5. Monthly (by date) Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `monthly(15) full year` | day=15 | 2024-01-01 to 2024-12-31 | 12 dates, all 15th | LAW 12 |
| `monthly(31) full year` | day=31 | 2024-01-01 to 2024-12-31 | 7 dates (31-day months only) | LAW 13, KNOWN 3 |
| `monthly(30) full year` | day=30 | 2024-01-01 to 2024-12-31 | 11 dates (skips Feb) | LAW 14 |
| `monthly(29) leap year` | day=29 | 2024-01-01 to 2024-12-31 | 12 dates (Feb 29 exists) | - |
| `monthly(29) non-leap` | day=29 | 2023-01-01 to 2023-12-31 | 11 dates (skips Feb) | LAW 15 |
| `monthly(31) skips short months` | day=31 | 2024-04-01 to 2024-06-30 | 1 date (May 31 only) | LAW 13 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `monthly day matches` | `∀d ∈ result: dayOf(d) = pattern.day` | LAW 12 |
| `monthly no coercion` | Day doesn't exist → month skipped | LAW 13, 14, 15 |

---

## 6. Last Day of Month Pattern

### Unit Tests

| Test Name | Range | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `lastDayOfMonth full year 2024` | 2024-01-01 to 2024-12-31 | 12 dates | LAW 16, KNOWN 4 |
| `lastDayOfMonth Feb leap` | 2024-02-01 to 2024-02-29 | Feb 29 | LAW 18 |
| `lastDayOfMonth Feb non-leap` | 2023-02-01 to 2023-02-28 | Feb 28 | LAW 18 |
| `lastDayOfMonth various lengths` | 2024-01-01 to 2024-04-30 | Jan 31, Feb 29, Mar 31, Apr 30 | LAW 17 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `lastDayOfMonth one per month` | Exactly one date per month in range | LAW 16 |
| `lastDayOfMonth valid last day` | `dayOf(d) ∈ {28, 29, 30, 31}` | LAW 17 |

---

## 7. Yearly Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `yearly Mar 15` | month=3, day=15 | 2024-01-01 to 2026-12-31 | 3 dates | LAW 19 |
| `yearly Feb 29` | month=2, day=29 | 2020-01-01 to 2028-12-31 | 2024, 2028 only | LAW 20, LAW 21b |
| `yearly Feb 30` | month=2, day=30 | 2020-01-01 to 2030-12-31 | empty | LAW 21, B2 |
| `yearly Dec 31` | month=12, day=31 | 2024-01-01 to 2024-12-31 | 1 date | LAW 19 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `yearly at most one per year` | At most one date per year | LAW 19 |
| `yearly Feb 29 leap only` | Only appears in leap years | LAW 20 |

---

## 8. Weekdays Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `weekdays Mon only` | ['mon'] | 2024-01-01 to 2024-01-07 | 1 date (Mon) | LAW 24 |
| `weekdays MWF` | ['mon','wed','fri'] | 2024-01-01 to 2024-01-07 | 3 dates | LAW 25 |
| `weekdays TTh` | ['tue','thu'] | 2024-01-01 to 2024-01-07 | 2 dates | LAW 22 |
| `weekdays all days` | ['mon'...'sun'] | 2024-01-01 to 2024-01-07 | 7 dates | - |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `weekdays matches pattern` | `∀d ∈ result: dayOfWeek(d) ∈ pattern.days` | LAW 22 |
| `weekdays complete` | Every matching date in range is included | LAW 23 |

---

## 9. Weekdays Only Pattern (Mon-Fri)

### Unit Tests

| Test Name | Range | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `weekdaysOnly one week` | 2024-01-01 (Mon) to 2024-01-07 (Sun) | 5 dates | - |
| `weekdaysOnly starts weekend` | 2024-01-06 (Sat) to 2024-01-12 (Fri) | 5 dates | - |
| `weekdaysOnly full month` | 2024-01-01 to 2024-01-31 | ~23 weekdays | - |

---

## 10. Weekends Only Pattern (Sat-Sun)

### Unit Tests

| Test Name | Range | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `weekendsOnly one week` | 2024-01-01 to 2024-01-07 | 2 dates (Sat, Sun) | - |
| `weekendsOnly full month` | 2024-01-01 to 2024-01-31 | ~8-9 weekend days | - |

---

## 11. Nth Weekday of Month Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `2nd Thu Jan 2024` | n=2, thu | 2024-01-01 to 2024-01-31 | 2024-01-11 | LAW 27, LAW 30 |
| `2nd Thu full year` | n=2, thu | 2024-01-01 to 2024-12-31 | 12 dates | LAW 26, KNOWN 5 |
| `1st Mon Jan` | n=1, mon | 2024-01-01 to 2024-01-31 | 2024-01-01 | LAW 29 |
| `5th Thu Feb 2024 (leap)` | n=5, thu | 2024-02-01 to 2024-02-29 | 2024-02-29 | - |
| `5th Thu Feb 2023 (non-leap)` | n=5, thu | 2023-02-01 to 2023-02-28 | empty | LAW 28, B3 |
| `5th Mon most months` | n=5, mon | 2024-01-01 to 2024-12-31 | ~4 dates | LAW 28 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `nthWeekday at most one per month` | At most one date per month | LAW 26 |
| `nthWeekday correct weekday` | `dayOfWeek(d) = pattern.weekday` | LAW 27 |
| `1st weekday between 1-7` | dayOf(d) ∈ [1, 7] | LAW 29 |
| `2nd weekday between 8-14` | dayOf(d) ∈ [8, 14] | LAW 30 |

---

## 12. Last Weekday of Month Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `last Fri Jan 2024` | fri | 2024-01-01 to 2024-01-31 | 2024-01-26 | LAW 32 |
| `last Fri full year` | fri | 2024-01-01 to 2024-12-31 | 12 dates | LAW 31 |
| `last Mon Feb leap` | mon | 2024-02-01 to 2024-02-29 | 2024-02-26 | LAW 33 |
| `last Sun months` | sun | 2024-01-01 to 2024-03-31 | 3 dates | LAW 31 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `lastWeekday one per month` | Exactly one date per month | LAW 31 |
| `lastWeekday correct weekday` | `dayOfWeek(d) = pattern.weekday` | LAW 32 |
| `lastWeekday in last 7 days` | `dayOf(d) > daysInMonth - 7` | LAW 33 |

---

## 13. Nth-to-Last Weekday of Month Pattern

### Unit Tests

| Test Name | Pattern | Range | Expected | Laws Verified |
|-----------|---------|-------|----------|---------------|
| `1st-to-last Fri` | n=1, fri | 2024-01-01 to 2024-01-31 | Same as lastWeekday(fri) | LAW 34 |
| `2nd-to-last Fri Jan 2024` | n=2, fri | 2024-01-01 to 2024-01-31 | 2024-01-19 | - |
| `5th-to-last short month` | n=5, fri | 2024-02-01 to 2024-02-29 | empty | LAW 35, B3 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `nthToLast n=1 equals lastWeekday` | Same result as lastWeekdayOfMonth | LAW 34 |

---

## 14. Pattern Composition

### 14.1 Union of Patterns

#### Unit Tests

| Test Name | Patterns | Range | Expected | Laws Verified |
|-----------|----------|-------|----------|---------------|
| `empty patterns` | [] | any | empty set | LAW 37 |
| `singleton pattern` | [daily] | 7 days | Same as daily | LAW 38 |
| `duplicate patterns` | [daily, daily] | 7 days | Same as [daily] | LAW 39 |
| `MWF union` | [weekdays(['mon']), weekdays(['wed']), weekdays(['fri'])] | 7 days | 3 dates | LAW 36 |
| `monthly union` | [monthly(1), monthly(15)] | month | 2 dates | LAW 36 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `union contains if any pattern produces` | d ∈ result ↔ ∃p ∈ patterns: d ∈ expand(p) | LAW 36 |

### 14.2 Exception Subtraction

#### Unit Tests

| Test Name | Base | Exception | Expected | Laws Verified |
|-----------|------|-----------|----------|---------------|
| `no exceptions` | daily | [] | Same as daily | LAW 41 |
| `daily except weekends` | daily | weekendsOnly | Mon-Fri only | LAW 40 |
| `daily except 2nd Thu` | daily | nthWeekday(2, thu) | All except 2nd Thursdays | LAW 40 |
| `full exception` | weekdays(['mon']) | weekdays(['mon']) | empty | LAW 42 |
| `multiple exceptions` | daily | [nthWeekday(1,mon), nthWeekday(2,mon)] | Skip 1st and 2nd Mondays | LAW 43 |
| `overlapping exceptions` | daily | [weekends, weekends] | Same as single weekend exception | LAW 44 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `subtraction removes dates` | result = base \ exceptions | LAW 40 |
| `exception order independent` | Order doesn't affect result | LAW 45 |

### 14.3 Series Bounds

#### Unit Tests

| Test Name | Bounds | Expected | Laws Verified |
|-----------|--------|----------|---------------|
| `startDate filter` | start=2024-01-15 | All results ≥ Jan 15 | LAW 46 |
| `endDate filter` | end=2024-01-15 | All results ≤ Jan 15 | LAW 47 |
| `count limit` | count=5 | At most 5 results | LAW 48 |
| `count takes earliest` | count=3 | First 3 chronologically | LAW 48 |

---

## 15. Algebraic Laws

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `determinism` | Same inputs → same outputs | LAW 50 |
| `range monotonicity` | r₁ ⊆ r₂ → expand(p, r₁) ⊆ expand(p, r₂) | LAW 51 |
| `results within range` | All results within [range.start, range.end] | LAW 52 |
| `respects series start` | All results ≥ seriesStart | LAW 53 |

---

## 16. Boundary Conditions

### Unit Tests

| Test Name | Condition | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `range end before series start` | range.end < seriesStart | empty | B1 |
| `Feb 30 yearly` | yearly(2, 30) | always empty | B2 |
| `5th weekday non-existent` | nthWeekday(5, mon) in Feb | empty for that month | B3 |
| `monthly 31 in short month` | monthly(31) in Apr | empty for Apr | B4 |
| `single day matches` | daily on single-day range | 1 date | B5, B6 |
| `single day no match` | monthly(15) on 2024-01-01 | empty | B7 |
| `year boundary` | weekly across Dec→Jan | Handles correctly | B8 |
| `leap→non-leap Feb 29` | yearly Feb 29 across years | Only leap years | B9 |
| `large range performance` | 10 years daily | Completes in bounded time | B10 |
| `result size bounded` | any pattern | |result| ≤ days in range + 1 | B11 |

---

## 17. Invariants

| Invariant | Description | Verification Method |
|-----------|-------------|---------------------|
| INV 1 | Output is valid Set<LocalDate> | Type checking |
| INV 2 | All dates satisfy domain constraints | Property test |
| INV 3 | Output is sorted | Verify ordering |
| INV 4 | No duplicate dates | Set semantics |
| INV 5 | Expansion is pure | No side effects |

---

## 18. Error Handling

#### Unit Tests

| Test Name | Input | Expected |
|-----------|-------|----------|
| `invalid range start > end` | start=2024-02-01, end=2024-01-01 | InvalidRangeError |
| `everyNDays n=0` | n=0 | InvalidPatternError |
| `everyNDays n=-1` | n=-1 | InvalidPatternError |
| `everyNWeeks n=0` | n=0 | InvalidPatternError |
| `monthly day=0` | day=0 | InvalidPatternError |
| `monthly day=32` | day=32 | InvalidPatternError |
| `yearly month=0` | month=0 | InvalidPatternError |
| `yearly month=13` | month=13 | InvalidPatternError |
| `weekdays empty array` | days=[] | InvalidPatternError |

---

## 19. Known Answer Tests

| Test Name | Input | Expected | Source |
|-----------|-------|----------|--------|
| `KNOWN 1` | daily 2024-01-01 to 2024-01-07 | 7 dates | spec |
| `KNOWN 2` | everyNDays(2) Jan 2024 | Jan 1,3,5,7,...,31 | spec |
| `KNOWN 3` | monthly(31) 2024 | 7 dates | spec |
| `KNOWN 4` | lastDayOfMonth 2024 | 12 dates | spec |
| `KNOWN 5` | nthWeekday(2, thu) 2024 | 12 dates | spec |

---

## 20. Test Count Summary

| Category | Unit Tests | Property-Based Tests | Total |
|----------|------------|---------------------|-------|
| Daily | ~6 | 2 | ~8 |
| Every N Days | ~7 | 3 | ~10 |
| Weekly | ~3 | 2 | ~5 |
| Every N Weeks | ~4 | 2 | ~6 |
| Monthly | ~6 | 2 | ~8 |
| Last Day of Month | ~4 | 2 | ~6 |
| Yearly | ~4 | 2 | ~6 |
| Weekdays | ~4 | 2 | ~6 |
| Weekdays/Weekends Only | ~4 | 0 | ~4 |
| Nth Weekday | ~6 | 4 | ~10 |
| Last Weekday | ~4 | 3 | ~7 |
| Nth-to-Last Weekday | ~3 | 1 | ~4 |
| Pattern Union | ~5 | 1 | ~6 |
| Exception Subtraction | ~6 | 2 | ~8 |
| Series Bounds | ~4 | 0 | ~4 |
| Algebraic Laws | 0 | 4 | 4 |
| Boundary Conditions | ~11 | 0 | ~11 |
| Error Handling | ~9 | 0 | ~9 |
| Known Answer | ~5 | 0 | ~5 |
| **Total** | **~95** | **~32** | **~127** |

---

## 21. Test Execution Notes

- All property-based tests should run with at least 100 random inputs
- Pattern generators should cover:
  - All 13 pattern types
  - Edge values for n (1, 2, large values)
  - All weekdays
  - Month boundary days (28, 29, 30, 31)
- Range generators should cover:
  - Single-day ranges
  - Week ranges
  - Month ranges
  - Year ranges
  - Multi-year ranges (for performance)
- Verify leap year handling thoroughly (2000, 1900, 2024, 2023)
