# Segment 1: Time & Date Utilities — Formal Specification

## 1. Types and Domains

### 1.1 LocalDate

**Representation**: ISO 8601 date string `"YYYY-MM-DD"`

**Domain constraints**:
```
year ∈ [1, 9999]
month ∈ [1, 12]
day ∈ [1, maxDay(year, month)]

where maxDay(y, m) =
  | m ∈ {1,3,5,7,8,10,12} → 31
  | m ∈ {4,6,9,11} → 30
  | m = 2 ∧ isLeapYear(y) → 29
  | m = 2 ∧ ¬isLeapYear(y) → 28

where isLeapYear(y) =
  (y mod 4 = 0) ∧ ((y mod 100 ≠ 0) ∨ (y mod 400 = 0))
```

**Canonical form**: Always zero-padded. `"2024-03-05"` not `"2024-3-5"`.

**Total ordering**: Dates are totally ordered by chronological sequence.

---

### 1.2 LocalTime

**Representation**: ISO 8601 time string `"HH:MM"` or `"HH:MM:SS"`

**Domain constraints**:
```
hour ∈ [0, 23]
minute ∈ [0, 59]
second ∈ [0, 59]  // leap seconds not supported
```

**Canonical form**: `"HH:MM:SS"` with zero-padding. Inputs may omit seconds; outputs always include them.

**Total ordering**: Times are totally ordered within a day.

---

### 1.3 LocalDateTime

**Representation**: ISO 8601 `"YYYY-MM-DDTHH:MM:SS"`

**Domain**: Cartesian product of valid LocalDate × LocalTime.

**Total ordering**: Ordered lexicographically (date first, then time).

---

### 1.4 Duration

**Representation**: Non-negative integer (minutes).

**Domain**: `duration ∈ [0, ∞)` — practically bounded by storage (safe integer range).

**Note**: Durations are always positive. Direction is conveyed by operation semantics, not sign.

---

### 1.5 Weekday

**Representation**: `'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'`

**Ordering**: Cyclic. Monday = 0, Sunday = 6 for arithmetic purposes.

---

### 1.6 Timezone

**Representation**: IANA timezone identifier string (e.g., `"America/New_York"`).

**Validity**: Must be recognized by the runtime's timezone database.

---

## 2. Parsing Functions

### 2.1 parseDate

```
parseDate: string → Result<LocalDate, ParseError>
```

**Preconditions**: None (total function over strings).

**Postconditions**:
- If input matches `/^\d{4}-\d{2}-\d{2}$/` AND components form valid date → `Ok(date)`
- Otherwise → `Err(ParseError)`

**Properties**:
```
P1 (Validity): parseDate(s) = Ok(d) → isValidDate(d)
P2 (Determinism): parseDate(s₁) = parseDate(s₂) ↔ s₁ = s₂ ∨ (both Err)
P3 (No silent coercion): parseDate("2024-02-30") = Err(_)  // Feb 30 doesn't exist
P4 (No rollover): parseDate("2024-13-01") = Err(_)  // month 13 is invalid, not Jan next year
```

---

### 2.2 parseTime

```
parseTime: string → Result<LocalTime, ParseError>
```

**Preconditions**: None.

**Postconditions**:
- Accepts `"HH:MM"` or `"HH:MM:SS"`
- Components must be in valid ranges
- Returns canonical form (with seconds)

**Properties**:
```
P1 (Validity): parseTime(s) = Ok(t) → isValidTime(t)
P2 (Normalization): parseTime("14:30") = parseTime("14:30:00")
P3 (No rollover): parseTime("25:00:00") = Err(_)  // not 01:00 next day
```

---

### 2.3 parseDateTime

```
parseDateTime: string → Result<LocalDateTime, ParseError>
```

**Preconditions**: None.

**Postconditions**:
- Accepts `"YYYY-MM-DDTHH:MM:SS"` or `"YYYY-MM-DDTHH:MM"`
- Both date and time components must be valid

**Properties**:
```
P1 (Composition): parseDateTime(s) = Ok(dt) ↔
    ∃d,t: parseDate(datePart(s)) = Ok(d) ∧ parseTime(timePart(s)) = Ok(t)
P2 (Separator): Only 'T' accepted as separator (ISO 8601 strict)
```

---

## 3. Formatting Functions

### 3.1 formatDate

```
formatDate: LocalDate → string
```

**Preconditions**: Input is valid LocalDate (enforced by type).

**Postconditions**: Output matches `/^\d{4}-\d{2}-\d{2}$/`

**Properties**:
```
P1 (Canonical): Output is always zero-padded
P2 (Total): Never throws for valid input
```

---

### 3.2 formatTime

```
formatTime: LocalTime → string
```

**Preconditions**: Input is valid LocalTime.

**Postconditions**: Output matches `/^\d{2}:\d{2}:\d{2}$/`

---

### 3.3 formatDateTime

```
formatDateTime: LocalDateTime → string
```

**Preconditions**: Input is valid LocalDateTime.

**Postconditions**: Output matches ISO 8601 with 'T' separator.

---

## 4. Round-Trip Laws

These are the critical correctness properties. **Violation of any round-trip law is a critical bug.**

### 4.1 Parse-Format Identity

```
LAW 1 (Format-Parse): ∀d ∈ LocalDate: parseDate(formatDate(d)) = Ok(d)
LAW 2 (Format-Parse): ∀t ∈ LocalTime: parseTime(formatTime(t)) = Ok(t)
LAW 3 (Format-Parse): ∀dt ∈ LocalDateTime: parseDateTime(formatDateTime(dt)) = Ok(dt)
```

### 4.2 Canonical Parse-Format

```
LAW 4 (Parse-Format): parseDate(s) = Ok(d) → formatDate(d) = canonicalize(s)
LAW 5 (Parse-Format): parseTime(s) = Ok(t) → formatTime(t) = canonicalize(s)
```

Where `canonicalize` zero-pads and adds seconds if missing.

---

## 5. Date Arithmetic

### 5.1 addDays

```
addDays: (LocalDate, int) → LocalDate
```

**Preconditions**: Result must be within valid date range.

**Postconditions**: Returns date `n` days forward (positive) or backward (negative).

**Properties (Algebraic Laws)**:
```
LAW 6 (Identity): addDays(d, 0) = d
LAW 7 (Inverse): addDays(addDays(d, n), -n) = d
LAW 8 (Associative): addDays(addDays(d, a), b) = addDays(d, a + b)
LAW 9 (Monotonic): n > 0 → addDays(d, n) > d
LAW 10 (Monotonic): n < 0 → addDays(d, n) < d
```

**Boundary behaviors**:
```
B1: addDays("2024-02-28", 1) = "2024-02-29"  // leap year
B2: addDays("2023-02-28", 1) = "2023-03-01"  // non-leap year
B3: addDays("2024-12-31", 1) = "2025-01-01"  // year boundary
B4: addDays("2024-01-01", -1) = "2023-12-31" // year boundary backward
```

---

### 5.2 addMinutes (to DateTime)

```
addMinutes: (LocalDateTime, int) → LocalDateTime
```

**Preconditions**: Result within valid range.

**Postconditions**: Returns datetime `n` minutes forward or backward.

**Properties**:
```
LAW 11 (Identity): addMinutes(dt, 0) = dt
LAW 12 (Inverse): addMinutes(addMinutes(dt, n), -n) = dt
LAW 13 (Associative): addMinutes(addMinutes(dt, a), b) = addMinutes(dt, a + b)
LAW 14 (Day overflow): addMinutes("2024-03-15T23:30:00", 60) = "2024-03-16T00:30:00"
```

**Boundary behaviors**:
```
B5: addMinutes("2024-03-15T00:00:00", -1) = "2024-03-14T23:59:00"
B6: addMinutes("2024-02-28T23:59:00", 1) = "2024-02-29T00:00:00"  // leap year
B7: addMinutes("2023-02-28T23:59:00", 1) = "2023-03-01T00:00:00"  // non-leap
```

---

### 5.3 daysBetween

```
daysBetween: (LocalDate, LocalDate) → int
```

**Preconditions**: None.

**Postconditions**: Returns signed difference in days. `daysBetween(a, b) = b - a` conceptually.

**Properties**:
```
LAW 15 (Self): daysBetween(d, d) = 0
LAW 16 (Antisymmetric): daysBetween(a, b) = -daysBetween(b, a)
LAW 17 (Additive inverse): daysBetween(d, addDays(d, n)) = n
LAW 18 (Triangle): daysBetween(a, c) = daysBetween(a, b) + daysBetween(b, c)
```

---

### 5.4 minutesBetween

```
minutesBetween: (LocalDateTime, LocalDateTime) → int
```

**Properties**:
```
LAW 19 (Self): minutesBetween(dt, dt) = 0
LAW 20 (Antisymmetric): minutesBetween(a, b) = -minutesBetween(b, a)
LAW 21 (Additive inverse): minutesBetween(dt, addMinutes(dt, n)) = n
LAW 22 (Day conversion): minutesBetween(dt, addDays(dateOf(dt), 1) + timeOf(dt)) = 1440
```

---

## 6. Day-of-Week Queries

### 6.1 dayOfWeek

```
dayOfWeek: LocalDate → Weekday
```

**Preconditions**: Valid date.

**Postconditions**: Returns correct weekday.

**Properties**:
```
LAW 23 (Cyclic): dayOfWeek(addDays(d, 7)) = dayOfWeek(d)
LAW 24 (Increment): dayOfWeek(addDays(d, 1)) = nextWeekday(dayOfWeek(d))
LAW 25 (Reference): dayOfWeek("2024-01-01") = 'mon'  // known anchor
```

**Verification**: Any implementation must agree with reference anchors:
```
ANCHOR_1: dayOfWeek("2000-01-01") = 'sat'
ANCHOR_2: dayOfWeek("2024-01-01") = 'mon'
ANCHOR_3: dayOfWeek("1970-01-01") = 'thu'  // Unix epoch
```

---

### 6.2 weekdayToIndex / indexToWeekday

```
weekdayToIndex: Weekday → int  // mon=0, sun=6
indexToWeekday: int → Weekday
```

**Properties**:
```
LAW 26 (Bijection): indexToWeekday(weekdayToIndex(w)) = w
LAW 27 (Bijection): weekdayToIndex(indexToWeekday(i mod 7)) = i mod 7
LAW 28 (Order): weekdayToIndex('mon') < weekdayToIndex('tue') < ... < weekdayToIndex('sun')
```

---

## 7. Month and Year Queries

### 7.1 isLeapYear

```
isLeapYear: int → bool
```

**Definition (not implementation—this IS the spec)**:
```
isLeapYear(y) ≡ (y mod 4 = 0) ∧ ((y mod 100 ≠ 0) ∨ (y mod 400 = 0))
```

**Verification points**:
```
isLeapYear(2000) = true   // divisible by 400
isLeapYear(1900) = false  // divisible by 100, not 400
isLeapYear(2024) = true   // divisible by 4, not 100
isLeapYear(2023) = false  // not divisible by 4
```

---

### 7.2 daysInMonth

```
daysInMonth: (int, int) → int  // (year, month) → days
```

**Preconditions**: `month ∈ [1, 12]`

**Postconditions**: Returns 28, 29, 30, or 31.

**Properties**:
```
LAW 29 (Range): daysInMonth(y, m) ∈ {28, 29, 30, 31}
LAW 30 (February): daysInMonth(y, 2) = if isLeapYear(y) then 29 else 28
LAW 31 (Consistency): daysInMonth(y, m) = maxDay(y, m)  // from domain definition
```

**Exhaustive February verification**:
```
daysInMonth(2024, 2) = 29
daysInMonth(2023, 2) = 28
daysInMonth(2000, 2) = 29
daysInMonth(1900, 2) = 28
```

---

### 7.3 daysInYear

```
daysInYear: int → int
```

**Properties**:
```
LAW 32: daysInYear(y) = if isLeapYear(y) then 366 else 365
LAW 33: daysInYear(y) = Σ(m=1 to 12) daysInMonth(y, m)
```

---

## 8. Component Extraction

### 8.1 Date components

```
yearOf: LocalDate → int
monthOf: LocalDate → int
dayOf: LocalDate → int
```

**Properties**:
```
LAW 34 (Reconstruction): makeDate(yearOf(d), monthOf(d), dayOf(d)) = d
LAW 35 (Range): monthOf(d) ∈ [1, 12]
LAW 36 (Range): dayOf(d) ∈ [1, 31]
LAW 37 (Validity): dayOf(d) ≤ daysInMonth(yearOf(d), monthOf(d))
```

---

### 8.2 Time components

```
hourOf: LocalTime → int
minuteOf: LocalTime → int
secondOf: LocalTime → int
```

**Properties**:
```
LAW 38 (Reconstruction): makeTime(hourOf(t), minuteOf(t), secondOf(t)) = t
LAW 39 (Range): hourOf(t) ∈ [0, 23]
LAW 40 (Range): minuteOf(t) ∈ [0, 59]
LAW 41 (Range): secondOf(t) ∈ [0, 59]
```

---

### 8.3 DateTime decomposition

```
dateOf: LocalDateTime → LocalDate
timeOf: LocalDateTime → LocalTime
```

**Properties**:
```
LAW 42 (Reconstruction): makeDateTime(dateOf(dt), timeOf(dt)) = dt
```

---

## 9. Timezone Conversion

### 9.1 toUTC

```
toUTC: (LocalDateTime, Timezone) → UTCDateTime
```

**Preconditions**:
- DateTime is valid
- Timezone is recognized

**Postconditions**: Returns equivalent instant in UTC.

**DST handling**:
```
CASE 1 (Normal): Unambiguous conversion
CASE 2 (Gap): Local time doesn't exist (spring forward)
  → Behavior: Shift forward to valid time (first moment after gap)
CASE 3 (Overlap): Local time is ambiguous (fall back)
  → Behavior: Assume standard time (later instant)
```

**Rationale for DST choices**: Gaps shift forward (you can't schedule in time that doesn't exist—move to when it does). Overlaps use standard time (conservative, predictable).

---

### 9.2 toLocal

```
toLocal: (UTCDateTime, Timezone) → LocalDateTime
```

**Preconditions**:
- UTCDateTime is valid
- Timezone is recognized

**Postconditions**: Returns local time at that instant.

**Properties**:
```
LAW 43 (UTC round-trip): toUTC(toLocal(utc, tz), tz) = utc  // always holds
LAW 44 (Local round-trip): toLocal(toUTC(local, tz), tz) = local
  // holds EXCEPT during DST gaps (input didn't exist, output is shifted)
```

---

### 9.3 DST Query

```
isDSTAt: (LocalDateTime, Timezone) → bool | 'gap' | 'overlap'
```

**Postconditions**:
- `true`: DST is in effect
- `false`: Standard time
- `'gap'`: This local time doesn't exist
- `'overlap'`: This local time is ambiguous

---

## 10. Comparison Operations

### 10.1 Date comparison

```
compareDates: (LocalDate, LocalDate) → -1 | 0 | 1
dateEquals: (LocalDate, LocalDate) → bool
dateBefore: (LocalDate, LocalDate) → bool
dateAfter: (LocalDate, LocalDate) → bool
```

**Properties**:
```
LAW 45 (Total order): Exactly one of a < b, a = b, a > b holds
LAW 46 (Reflexive): dateEquals(d, d) = true
LAW 47 (Symmetric): dateEquals(a, b) = dateEquals(b, a)
LAW 48 (Transitive): dateEquals(a, b) ∧ dateEquals(b, c) → dateEquals(a, c)
LAW 49 (Antisymmetric): dateBefore(a, b) → ¬dateBefore(b, a)
LAW 50 (Transitive): dateBefore(a, b) ∧ dateBefore(b, c) → dateBefore(a, c)
```

### 10.2 Similar for Time and DateTime

(Same laws apply, substituting types)

---

## 11. System Invariants

These must hold at ALL times, across ALL operations:

```
INV 1: Every LocalDate in the system satisfies domain constraints
INV 2: Every LocalTime in the system satisfies domain constraints
INV 3: Every LocalDateTime decomposes to valid LocalDate and LocalTime
INV 4: No operation produces an invalid date/time (type safety)
INV 5: All string representations are in canonical form
INV 6: Timezone conversions are consistent (same instant = same instant)
```

---

## 12. Error Handling Contracts

```
CONTRACT 1: Parse functions return Result, never throw
CONTRACT 2: Arithmetic functions with invalid results throw RangeError
CONTRACT 3: All errors include enough context to diagnose:
  - Input value
  - Expected constraint
  - Actual violation
```

---

## 13. Test Oracle Requirements

For property-based testing, we need reference implementations:

```
ORACLE 1: Date arithmetic must agree with JavaScript Date for dates 1970-2100
ORACLE 2: Weekday calculations must agree with known calendar
ORACLE 3: Leap year must agree with definition (not external library)
ORACLE 4: Timezone conversion must agree with IANA tz database
```

---

## 14. Verification Strategy

### 14.1 Property-based tests

Each LAW above becomes a property test with random inputs:
- Generate valid dates across full range
- Generate edge dates (month boundaries, year boundaries, leap days)
- Generate random durations
- Verify law holds for all generated inputs

### 14.2 Boundary tests

Explicit tests for:
- First/last valid date
- Month transitions (28→1, 29→1, 30→1, 31→1)
- Year transitions
- Leap year Feb 28→29→Mar 1
- DST transitions for major timezones

### 14.3 Reference tests

Fixed examples that must always pass:
- Known date/weekday pairs
- Known leap years
- DST transition times for specific timezones/years

### 14.4 Mutation testing

Laws must be strong enough that mutating implementation breaks at least one test.

---

## 15. Dependencies

This module has **no dependencies** on other autoplanner modules.

External dependencies:
- Runtime timezone database (Intl API or equivalent)
- No date libraries—implementation must be from first principles for auditability

---

## 16. Non-Goals

Explicitly out of scope for this module:
- Recurring patterns (Segment 2)
- Duration display formatting ("2h 30m")
- Calendar week numbers
- Fiscal years
- Julian dates
- Astronomical calculations
- Timezones not in IANA database
- Sub-minute precision
- Leap seconds
