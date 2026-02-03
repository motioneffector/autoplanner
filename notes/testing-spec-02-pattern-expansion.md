# Segment 2: Pattern Expansion — Formal Specification

## 1. Overview

Pattern expansion is the pure function that takes a pattern definition and a date range, and produces the set of dates on which instances occur. This is deterministic and side-effect free.

```
expandPattern: (Pattern, DateRange, StartDate) → Set<LocalDate>
```

---

## 2. Types

### 2.1 DateRange

```
type DateRange = {
  start: LocalDate  // inclusive
  end: LocalDate    // inclusive
}

CONSTRAINT: range.start ≤ range.end
```

### 2.2 Pattern (Union Type)

```
type Pattern =
  | DailyPattern
  | EveryNDaysPattern
  | WeeklyPattern
  | EveryNWeeksPattern
  | MonthlyPattern
  | LastDayOfMonthPattern
  | YearlyPattern
  | WeekdaysPattern
  | WeekdaysOnlyPattern
  | WeekendsOnlyPattern
  | NthWeekdayOfMonthPattern
  | LastWeekdayOfMonthPattern
  | NthToLastWeekdayOfMonthPattern
```

### 2.3 Pattern Definitions

```
DailyPattern = { type: 'daily' }

EveryNDaysPattern = {
  type: 'everyNDays',
  n: int  // n ≥ 1
}

WeeklyPattern = { type: 'weekly' }

EveryNWeeksPattern = {
  type: 'everyNWeeks',
  n: int,           // n ≥ 1
  weekday?: Weekday // defaults to startDate's weekday
}

MonthlyPattern = {
  type: 'monthly',
  day: int  // day ∈ [1, 31]
}

LastDayOfMonthPattern = { type: 'lastDayOfMonth' }

YearlyPattern = {
  type: 'yearly',
  month: int,  // month ∈ [1, 12]
  day: int     // day ∈ [1, 31]
}

WeekdaysPattern = {
  type: 'weekdays',
  days: Set<Weekday>  // non-empty
}

WeekdaysOnlyPattern = { type: 'weekdaysOnly' }  // mon-fri

WeekendsOnlyPattern = { type: 'weekendsOnly' }  // sat-sun

NthWeekdayOfMonthPattern = {
  type: 'nthWeekdayOfMonth',
  n: int,        // n ∈ [1, 5]
  weekday: Weekday
}

LastWeekdayOfMonthPattern = {
  type: 'lastWeekdayOfMonth',
  weekday: Weekday
}

NthToLastWeekdayOfMonthPattern = {
  type: 'nthToLastWeekdayOfMonth',
  n: int,        // n ∈ [1, 5]
  weekday: Weekday
}
```

---

## 3. Core Expansion Function

### 3.1 Signature

```
expandPattern: (pattern: Pattern, range: DateRange, seriesStart: LocalDate) → Set<LocalDate>
```

**Preconditions**:
- `pattern` is well-formed (satisfies type constraints)
- `range.start ≤ range.end`
- `seriesStart` is valid date

**Postconditions**:
- Returns set of dates within `range` (inclusive)
- All returned dates satisfy the pattern's rule
- Result is deterministic (same inputs → same output)

---

## 4. Pattern-Specific Semantics

### 4.1 Daily

```
expandPattern({ type: 'daily' }, range, _) =
  { d | d ∈ [range.start, range.end] }
```

**Properties**:
```
LAW 1: |expandPattern(daily, range, _)| = daysBetween(range.start, range.end) + 1
LAW 2: ∀d ∈ [range.start, range.end]: d ∈ expandPattern(daily, range, _)
```

---

### 4.2 Every N Days

```
expandPattern({ type: 'everyNDays', n }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        daysBetween(seriesStart, d) mod n = 0 ∧
        d ≥ seriesStart }
```

**Properties**:
```
LAW 3 (Periodicity): d ∈ result → addDays(d, n) ∈ result ∨ addDays(d, n) > range.end
LAW 4 (Phase): All dates in result are congruent to seriesStart mod n
LAW 5 (Anchor): seriesStart ∈ range → seriesStart ∈ result
LAW 6 (N=1 equivalence): expandPattern(everyNDays(1), r, s) = expandPattern(daily, r, s) ∩ {d | d ≥ s}
```

**Edge cases**:
```
E1: seriesStart after range.end → empty set
E2: n > daysBetween(range.start, range.end) → at most one date
```

---

### 4.3 Weekly

```
expandPattern({ type: 'weekly' }, range, seriesStart) =
  expandPattern({ type: 'everyNWeeks', n: 1, weekday: dayOfWeek(seriesStart) }, range, seriesStart)
```

**Properties**:
```
LAW 7: All dates in result have same weekday as seriesStart
LAW 8: Consecutive dates in result are exactly 7 days apart
```

---

### 4.4 Every N Weeks

```
expandPattern({ type: 'everyNWeeks', n, weekday }, range, seriesStart) =
  let targetWeekday = weekday ?? dayOfWeek(seriesStart)
  let anchor = firstOccurrence(seriesStart, targetWeekday)
  { d | d ∈ [range.start, range.end] ∧
        d ≥ anchor ∧
        dayOfWeek(d) = targetWeekday ∧
        weeksBetween(anchor, d) mod n = 0 }

where firstOccurrence(start, weekday) =
  // first date ≥ start with given weekday
  addDays(start, (weekdayToIndex(weekday) - weekdayToIndex(dayOfWeek(start)) + 7) mod 7)

where weeksBetween(a, b) = daysBetween(a, b) / 7
```

**Properties**:
```
LAW 9 (Weekday): ∀d ∈ result: dayOfWeek(d) = targetWeekday
LAW 10 (Spacing): ∀d₁,d₂ ∈ result, consecutive: daysBetween(d₁, d₂) = 7n
LAW 11 (N=1 weekly): everyNWeeks(1, w) produces every occurrence of weekday w
```

---

### 4.5 Monthly (by date)

```
expandPattern({ type: 'monthly', day }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        dayOf(d) = day ∧
        day ≤ daysInMonth(yearOf(d), monthOf(d)) }
```

**Properties**:
```
LAW 12 (Day match): ∀d ∈ result: dayOf(d) = pattern.day
LAW 13 (Skip invalid): "monthly day 31" skips Feb, Apr, Jun, Sep, Nov
LAW 14 (Skip invalid): "monthly day 30" skips Feb
LAW 15 (Skip invalid): "monthly day 29" skips Feb in non-leap years
```

**Critical**: No date coercion. If day doesn't exist in month, month is skipped entirely.

```
RULE: expandPattern(monthly(31), year=2024) contains only:
  Jan 31, Mar 31, May 31, Jul 31, Aug 31, Oct 31, Dec 31
  (7 dates, not 12)
```

---

### 4.6 Last Day of Month

```
expandPattern({ type: 'lastDayOfMonth' }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        dayOf(d) = daysInMonth(yearOf(d), monthOf(d)) }
```

**Properties**:
```
LAW 16: Exactly one date per month in range (if seriesStart allows)
LAW 17: dayOf(result) ∈ {28, 29, 30, 31} depending on month/year
LAW 18: Feb 2024 → 29, Feb 2023 → 28
```

---

### 4.7 Yearly

```
expandPattern({ type: 'yearly', month, day }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        monthOf(d) = month ∧
        dayOf(d) = day ∧
        day ≤ daysInMonth(yearOf(d), month) }
```

**Properties**:
```
LAW 19: At most one date per year
LAW 20: Feb 29 yearly → only leap years (skips non-leap years entirely, no rounding to Feb 28)
LAW 21 (Skip invalid): yearly(2, 30) → empty (Feb 30 never exists)
LAW 21b: yearly(2, 29) produces ~24 dates per 100 years (only leap years)
```

---

### 4.8 Weekdays (specific days)

```
expandPattern({ type: 'weekdays', days }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        dayOfWeek(d) ∈ days }
```

**Properties**:
```
LAW 22: ∀d ∈ result: dayOfWeek(d) ∈ pattern.days
LAW 23: Every date in range with matching weekday is included
LAW 24: weekdays(['mon']) over 7 days contains exactly 1 date
LAW 25: weekdays(['mon','wed','fri']) over 7 days contains exactly 3 dates
```

---

### 4.9 Weekdays Only (Mon-Fri)

```
expandPattern({ type: 'weekdaysOnly' }, range, seriesStart) =
  expandPattern({ type: 'weekdays', days: ['mon','tue','wed','thu','fri'] }, range, seriesStart)
```

---

### 4.10 Weekends Only (Sat-Sun)

```
expandPattern({ type: 'weekendsOnly' }, range, seriesStart) =
  expandPattern({ type: 'weekdays', days: ['sat','sun'] }, range, seriesStart)
```

---

### 4.11 Nth Weekday of Month

```
expandPattern({ type: 'nthWeekdayOfMonth', n, weekday }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        d = nthWeekdayInMonth(yearOf(d), monthOf(d), n, weekday) ∧
        d ≠ null }

where nthWeekdayInMonth(year, month, n, weekday) =
  let firstOfMonth = makeDate(year, month, 1)
  let firstTargetWeekday = firstOccurrence(firstOfMonth, weekday)
  let candidate = addDays(firstTargetWeekday, 7 * (n - 1))
  if monthOf(candidate) = month then candidate else null
```

**Properties**:
```
LAW 26: At most one date per month
LAW 27: dayOfWeek(result) = pattern.weekday
LAW 28: "5th weekday" may not exist in all months → skip
LAW 29: "1st Monday of month" is always between 1st and 7th
LAW 30: "2nd Thursday" is always between 8th and 14th
```

**Verification**:
```
nthWeekdayOfMonth(2024, 1, 2, 'thu') = "2024-01-11"  // 2nd Thursday of Jan 2024
nthWeekdayOfMonth(2024, 2, 5, 'thu') = "2024-02-29"  // 5th Thursday exists (leap year)
nthWeekdayOfMonth(2023, 2, 5, 'thu') = null          // 5th Thursday doesn't exist
```

---

### 4.12 Last Weekday of Month

```
expandPattern({ type: 'lastWeekdayOfMonth', weekday }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        d = lastWeekdayInMonth(yearOf(d), monthOf(d), weekday) }

where lastWeekdayInMonth(year, month, weekday) =
  let lastOfMonth = makeDate(year, month, daysInMonth(year, month))
  let daysBack = (weekdayToIndex(dayOfWeek(lastOfMonth)) - weekdayToIndex(weekday) + 7) mod 7
  addDays(lastOfMonth, -daysBack)
```

**Properties**:
```
LAW 31: Exactly one date per month
LAW 32: dayOfWeek(result) = pattern.weekday
LAW 33: Result is always in last 7 days of month
```

---

### 4.13 Nth-to-Last Weekday of Month

```
expandPattern({ type: 'nthToLastWeekdayOfMonth', n, weekday }, range, seriesStart) =
  { d | d ∈ [range.start, range.end] ∧
        d ≥ seriesStart ∧
        d = nthToLastWeekdayInMonth(yearOf(d), monthOf(d), n, weekday) ∧
        d ≠ null }

where nthToLastWeekdayInMonth(year, month, n, weekday) =
  let last = lastWeekdayInMonth(year, month, weekday)
  let candidate = addDays(last, -7 * (n - 1))
  if monthOf(candidate) = month then candidate else null
```

**Properties**:
```
LAW 34: n=1 equivalent to lastWeekdayOfMonth
LAW 35: "5th-to-last" may not exist → skip month
```

---

## 5. Pattern Composition

### 5.1 Union of Patterns

```
expandPatterns: (Pattern[], DateRange, LocalDate) → Set<LocalDate>

expandPatterns(patterns, range, start) =
  ⋃ { expandPattern(p, range, start) | p ∈ patterns }
```

**Properties**:
```
LAW 36 (Union): Result contains date iff at least one pattern produces it
LAW 37 (Empty): expandPatterns([], range, start) = ∅
LAW 38 (Singleton): expandPatterns([p], range, start) = expandPattern(p, range, start)
LAW 39 (Idempotent): expandPatterns([p, p], r, s) = expandPatterns([p], r, s)
```

---

### 5.2 Exception Subtraction

```
applyExceptions: (Set<LocalDate>, Pattern[], DateRange, LocalDate) → Set<LocalDate>

applyExceptions(baseDates, exceptionPatterns, range, start) =
  baseDates \ expandPatterns(exceptionPatterns, range, start)
```

**Properties**:
```
LAW 40 (Subtraction): Result = base dates minus exception dates
LAW 41 (No exceptions): applyExceptions(dates, [], r, s) = dates
LAW 42 (Full exception): If exception covers all base dates → empty result
LAW 43 (Union): Multiple exception patterns combined via set union before subtraction
LAW 44 (Idempotent): Same date excluded by multiple exceptions still just one exclusion
LAW 45 (Order independent): Order of exception patterns doesn't affect result
```

**Example**:
```
// "Every day except every 2nd Thursday"
base = expandPattern(daily, range, start)
exceptions = expandPattern(nthWeekdayOfMonth(2, 'thu'), range, start)
result = applyExceptions(base, [exceptions], range, start)
```

---

### 5.3 Series Bounds

```
applyBounds: (Set<LocalDate>, SeriesBounds) → Set<LocalDate>

type SeriesBounds = {
  startDate: LocalDate
  endDate?: LocalDate
  count?: int
}

applyBounds(dates, bounds) =
  let afterStart = { d | d ∈ dates ∧ d ≥ bounds.startDate }
  let beforeEnd = if bounds.endDate then { d | d ∈ afterStart ∧ d ≤ bounds.endDate } else afterStart
  let limited = if bounds.count then take(sort(beforeEnd), bounds.count) else beforeEnd
  limited
```

**Properties**:
```
LAW 46: All results ≥ bounds.startDate
LAW 47: All results ≤ bounds.endDate (if specified)
LAW 48: |result| ≤ bounds.count (if specified)
LAW 49: Can't have both endDate and count (mutual exclusion)
```

---

## 6. Algebraic Laws

### 6.1 Determinism

```
LAW 50 (Determinism): expandPattern(p, r, s) at time T₁ = expandPattern(p, r, s) at time T₂
  // Same inputs always produce same outputs, regardless of when called
```

### 6.2 Monotonicity

```
LAW 51 (Range monotonic): r₁ ⊆ r₂ → expandPattern(p, r₁, s) ⊆ expandPattern(p, r₂, s)
  // Larger range produces superset of results
```

### 6.3 Intersection with Range

```
LAW 52: expandPattern(p, r, s) ⊆ { d | d ∈ [r.start, r.end] }
  // All results within requested range
```

### 6.4 Series Start Filtering

```
LAW 53: ∀d ∈ expandPattern(p, r, s): d ≥ s ∨ (pattern is weekday-based and needs anchor)
  // Results respect series start date
```

---

## 7. Boundary Conditions

### 7.1 Empty Results

```
B1: range.end < seriesStart → empty
B2: yearly(2, 30) → always empty (Feb 30 never exists)
B3: nthWeekdayOfMonth(5, w) in month without 5th weekday → empty for that month
B4: monthly(31) in month with < 31 days → empty for that month
```

### 7.2 Single Date Range

```
B5: range.start = range.end → at most one date in result
B6: Single date matches pattern → singleton set
B7: Single date doesn't match → empty set
```

### 7.3 Year Boundaries

```
B8: Range spanning year boundary handled correctly
B9: Leap year → non-leap year transition for Feb 29 patterns
```

### 7.4 Large Ranges

```
B10: 10-year range should complete in bounded time
B11: Result set size bounded by range size (≤ daysBetween + 1)
```

---

## 8. Invariants

```
INV 1: Output is always a valid Set<LocalDate>
INV 2: All dates in output satisfy domain constraints
INV 3: Output is sorted (implementation detail, but useful guarantee)
INV 4: No duplicate dates in output
INV 5: Expansion is pure (no side effects, no state mutation)
```

---

## 9. Error Handling

```
CONTRACT 1: Invalid pattern → throw InvalidPatternError at call time
CONTRACT 2: Invalid range (start > end) → throw InvalidRangeError
CONTRACT 3: n ≤ 0 for everyNDays/everyNWeeks → throw InvalidPatternError
CONTRACT 4: day ∉ [1,31] for monthly → throw InvalidPatternError
CONTRACT 5: month ∉ [1,12] for yearly → throw InvalidPatternError
CONTRACT 6: Empty days array for weekdays → throw InvalidPatternError
```

---

## 10. Verification Strategy

### 10.1 Property-based tests

For each pattern type:
- Generate random valid patterns
- Generate random date ranges
- Verify all laws hold

### 10.2 Known-answer tests

```
KNOWN 1: daily over 2024-01-01 to 2024-01-07 → 7 dates
KNOWN 2: everyNDays(2) starting 2024-01-01 over Jan → {Jan 1, 3, 5, ...}
KNOWN 3: monthly(31) over 2024 → 7 dates (months with 31 days)
KNOWN 4: lastDayOfMonth over 2024 → 12 dates
KNOWN 5: nthWeekdayOfMonth(2, 'thu') for 2024 → 12 dates (every month has 2nd Thursday)
```

### 10.3 Edge case tests

- Feb 29 in leap vs non-leap years
- 5th weekday months
- Pattern starting mid-period
- Single-day ranges
- Very large ranges (performance)

---

## 11. Dependencies

- Segment 1: Time & Date Utilities (all date operations)

---

## 12. Non-Goals

- Time-of-day (patterns produce dates, not datetimes)
- Condition evaluation (Segment 3)
- Instance exceptions (Segment 9)
- Performance optimization beyond reasonable bounds
