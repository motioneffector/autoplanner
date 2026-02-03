# Test Plan: Segment 01 — Time & Date Utilities

## Overview

This test plan covers the time and date utilities module, which provides the foundational types and operations for all scheduling functionality. These are pure functions with no external dependencies beyond the runtime timezone database.

**Test file**: `tests/01-time-date.test.ts`

---

## 1. Parsing Functions

### 1.1 parseDate

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `parseDate valid standard date` | `"2024-03-15"` | `Ok("2024-03-15")` | P1 |
| `parseDate valid leap day` | `"2024-02-29"` | `Ok("2024-02-29")` | P1 |
| `parseDate valid year boundary` | `"2024-12-31"` | `Ok("2024-12-31")` | P1 |
| `parseDate valid January first` | `"2024-01-01"` | `Ok("2024-01-01")` | P1 |
| `parseDate rejects Feb 29 non-leap` | `"2023-02-29"` | `Err(ParseError)` | P3 |
| `parseDate rejects Feb 30` | `"2024-02-30"` | `Err(ParseError)` | P3 |
| `parseDate rejects month 13` | `"2024-13-01"` | `Err(ParseError)` | P4 |
| `parseDate rejects month 00` | `"2024-00-15"` | `Err(ParseError)` | P4 |
| `parseDate rejects day 32` | `"2024-01-32"` | `Err(ParseError)` | P3 |
| `parseDate rejects day 00` | `"2024-01-00"` | `Err(ParseError)` | P3 |
| `parseDate rejects unpadded month` | `"2024-3-15"` | `Err(ParseError)` | - |
| `parseDate rejects unpadded day` | `"2024-03-5"` | `Err(ParseError)` | - |
| `parseDate rejects wrong separator` | `"2024/03/15"` | `Err(ParseError)` | - |
| `parseDate rejects empty string` | `""` | `Err(ParseError)` | - |
| `parseDate rejects garbage` | `"not-a-date"` | `Err(ParseError)` | - |
| `parseDate rejects time suffix` | `"2024-03-15T10:00"` | `Err(ParseError)` | - |

#### Boundary Tests — Month Lengths

| Test Name | Input | Expected | Notes |
|-----------|-------|----------|-------|
| `parseDate Jan 31` | `"2024-01-31"` | `Ok` | 31-day month |
| `parseDate Apr 30` | `"2024-04-30"` | `Ok` | 30-day month |
| `parseDate Apr 31` | `"2024-04-31"` | `Err` | April has 30 days |
| `parseDate Feb 28 non-leap` | `"2023-02-28"` | `Ok` | Last day Feb non-leap |
| `parseDate Feb 29 leap` | `"2024-02-29"` | `Ok` | Last day Feb leap |
| `parseDate Feb 29 century non-leap` | `"1900-02-29"` | `Err` | 1900 not leap |
| `parseDate Feb 29 century leap` | `"2000-02-29"` | `Ok` | 2000 is leap |

### 1.2 parseTime

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `parseTime valid HH:MM` | `"14:30"` | `Ok("14:30:00")` | P1, P2 |
| `parseTime valid HH:MM:SS` | `"14:30:45"` | `Ok("14:30:45")` | P1 |
| `parseTime midnight` | `"00:00:00"` | `Ok("00:00:00")` | P1 |
| `parseTime end of day` | `"23:59:59"` | `Ok("23:59:59")` | P1 |
| `parseTime rejects hour 24` | `"24:00:00"` | `Err(ParseError)` | P3 |
| `parseTime rejects hour 25` | `"25:00:00"` | `Err(ParseError)` | P3 |
| `parseTime rejects minute 60` | `"12:60:00"` | `Err(ParseError)` | P3 |
| `parseTime rejects second 60` | `"12:30:60"` | `Err(ParseError)` | P3 |
| `parseTime rejects unpadded hour` | `"9:30:00"` | `Err(ParseError)` | - |
| `parseTime rejects wrong separator` | `"14-30-00"` | `Err(ParseError)` | - |
| `parseTime normalizes HH:MM to HH:MM:SS` | `"14:30"` | `Ok("14:30:00")` | P2 |

### 1.3 parseDateTime

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `parseDateTime valid full` | `"2024-03-15T14:30:00"` | `Ok` | P1 |
| `parseDateTime valid without seconds` | `"2024-03-15T14:30"` | `Ok` | P1 |
| `parseDateTime rejects space separator` | `"2024-03-15 14:30:00"` | `Err` | P2 |
| `parseDateTime rejects invalid date` | `"2024-02-30T14:30:00"` | `Err` | P1 |
| `parseDateTime rejects invalid time` | `"2024-03-15T25:00:00"` | `Err` | P1 |
| `parseDateTime rejects date only` | `"2024-03-15"` | `Err` | - |
| `parseDateTime rejects time only` | `"14:30:00"` | `Err` | - |

---

## 2. Formatting Functions

### 2.1 formatDate

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `formatDate standard date` | date(2024,3,15) | `"2024-03-15"` | P1 |
| `formatDate pads single-digit month` | date(2024,3,5) | `"2024-03-05"` | P1 |
| `formatDate pads single-digit day` | date(2024,1,5) | `"2024-01-05"` | P1 |

### 2.2 formatTime

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `formatTime includes seconds` | time(14,30,0) | `"14:30:00"` | - |
| `formatTime pads all components` | time(9,5,3) | `"09:05:03"` | P1 |

### 2.3 formatDateTime

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `formatDateTime uses T separator` | dt(2024,3,15,14,30,0) | `"2024-03-15T14:30:00"` | - |

---

## 3. Round-Trip Laws

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `format-parse roundtrip for dates` | `∀d: parseDate(formatDate(d)) = Ok(d)` | LAW 1 |
| `format-parse roundtrip for times` | `∀t: parseTime(formatTime(t)) = Ok(t)` | LAW 2 |
| `format-parse roundtrip for datetimes` | `∀dt: parseDateTime(formatDateTime(dt)) = Ok(dt)` | LAW 3 |
| `parse-format canonicalization dates` | `parseDate(s) = Ok(d) → formatDate(d) = canonicalize(s)` | LAW 4 |
| `parse-format canonicalization times` | `parseTime(s) = Ok(t) → formatTime(t) = canonicalize(s)` | LAW 5 |

**Generator requirements for dates**:
- Full year range: 1–9999
- Focus on boundaries: month ends, year ends, leap days
- Include century years (1900, 2000, 2100)

**Generator requirements for times**:
- Full range: 00:00:00–23:59:59
- Include and exclude seconds format

---

## 4. Date Arithmetic

### 4.1 addDays

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `addDays identity` | `addDays("2024-03-15", 0)` | `"2024-03-15"` | LAW 6 |
| `addDays positive` | `addDays("2024-03-15", 5)` | `"2024-03-20"` | LAW 9 |
| `addDays negative` | `addDays("2024-03-15", -5)` | `"2024-03-10"` | LAW 10 |
| `addDays month overflow` | `addDays("2024-01-30", 5)` | `"2024-02-04"` | - |
| `addDays year overflow` | `addDays("2024-12-30", 5)` | `"2025-01-04"` | B3 |
| `addDays year underflow` | `addDays("2024-01-03", -5)` | `"2023-12-29"` | B4 |
| `addDays leap year Feb 28→29` | `addDays("2024-02-28", 1)` | `"2024-02-29"` | B1 |
| `addDays non-leap Feb 28→Mar 1` | `addDays("2023-02-28", 1)` | `"2023-03-01"` | B2 |
| `addDays leap year Feb 29→Mar 1` | `addDays("2024-02-29", 1)` | `"2024-03-01"` | - |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `addDays inverse` | `∀d,n: addDays(addDays(d, n), -n) = d` | LAW 7 |
| `addDays associative` | `∀d,a,b: addDays(addDays(d, a), b) = addDays(d, a + b)` | LAW 8 |
| `addDays monotonic positive` | `∀d,n: n > 0 → addDays(d, n) > d` | LAW 9 |
| `addDays monotonic negative` | `∀d,n: n < 0 → addDays(d, n) < d` | LAW 10 |

### 4.2 addMinutes

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `addMinutes identity` | `addMinutes("2024-03-15T14:30:00", 0)` | `"2024-03-15T14:30:00"` | LAW 11 |
| `addMinutes within hour` | `addMinutes("2024-03-15T14:30:00", 15)` | `"2024-03-15T14:45:00"` | - |
| `addMinutes hour overflow` | `addMinutes("2024-03-15T14:30:00", 45)` | `"2024-03-15T15:15:00"` | - |
| `addMinutes day overflow` | `addMinutes("2024-03-15T23:30:00", 60)` | `"2024-03-16T00:30:00"` | LAW 14 |
| `addMinutes day underflow` | `addMinutes("2024-03-15T00:00:00", -1)` | `"2024-03-14T23:59:00"` | B5 |
| `addMinutes leap year midnight` | `addMinutes("2024-02-28T23:59:00", 1)` | `"2024-02-29T00:00:00"` | B6 |
| `addMinutes non-leap year midnight` | `addMinutes("2023-02-28T23:59:00", 1)` | `"2023-03-01T00:00:00"` | B7 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `addMinutes inverse` | `∀dt,n: addMinutes(addMinutes(dt, n), -n) = dt` | LAW 12 |
| `addMinutes associative` | `∀dt,a,b: addMinutes(addMinutes(dt, a), b) = addMinutes(dt, a + b)` | LAW 13 |

### 4.3 daysBetween

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `daysBetween same date` | `daysBetween("2024-03-15", "2024-03-15")` | `0` | LAW 15 |
| `daysBetween one day` | `daysBetween("2024-03-15", "2024-03-16")` | `1` | - |
| `daysBetween negative` | `daysBetween("2024-03-16", "2024-03-15")` | `-1` | LAW 16 |
| `daysBetween across month` | `daysBetween("2024-01-30", "2024-02-05")` | `6` | - |
| `daysBetween across year` | `daysBetween("2023-12-30", "2024-01-05")` | `6` | - |
| `daysBetween leap year Feb` | `daysBetween("2024-02-28", "2024-03-01")` | `2` | - |
| `daysBetween non-leap Feb` | `daysBetween("2023-02-28", "2023-03-01")` | `1` | - |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `daysBetween antisymmetric` | `∀a,b: daysBetween(a, b) = -daysBetween(b, a)` | LAW 16 |
| `daysBetween additive inverse` | `∀d,n: daysBetween(d, addDays(d, n)) = n` | LAW 17 |
| `daysBetween triangle` | `∀a,b,c: daysBetween(a, c) = daysBetween(a, b) + daysBetween(b, c)` | LAW 18 |

### 4.4 minutesBetween

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `minutesBetween same datetime` | `minutesBetween(dt, dt)` | `0` | LAW 19 |
| `minutesBetween one minute` | `minutesBetween("...T14:30:00", "...T14:31:00")` | `1` | - |
| `minutesBetween one day` | `minutesBetween("2024-03-15T00:00:00", "2024-03-16T00:00:00")` | `1440` | LAW 22 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `minutesBetween antisymmetric` | `∀a,b: minutesBetween(a, b) = -minutesBetween(b, a)` | LAW 20 |
| `minutesBetween additive inverse` | `∀dt,n: minutesBetween(dt, addMinutes(dt, n)) = n` | LAW 21 |

---

## 5. Day-of-Week Queries

### 5.1 dayOfWeek

#### Reference Anchor Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `dayOfWeek Unix epoch` | `"1970-01-01"` | `'thu'` | ANCHOR_3 |
| `dayOfWeek Y2K` | `"2000-01-01"` | `'sat'` | ANCHOR_1 |
| `dayOfWeek 2024 start` | `"2024-01-01"` | `'mon'` | LAW 25, ANCHOR_2 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `dayOfWeek cyclic` | `∀d: dayOfWeek(addDays(d, 7)) = dayOfWeek(d)` | LAW 23 |
| `dayOfWeek increment` | `∀d: dayOfWeek(addDays(d, 1)) = nextWeekday(dayOfWeek(d))` | LAW 24 |

### 5.2 weekdayToIndex / indexToWeekday

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `weekdayToIndex mon` | `'mon'` | `0` | - |
| `weekdayToIndex sun` | `'sun'` | `6` | - |
| `indexToWeekday 0` | `0` | `'mon'` | - |
| `indexToWeekday 6` | `6` | `'sun'` | - |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `weekday bijection` | `∀w: indexToWeekday(weekdayToIndex(w)) = w` | LAW 26 |
| `index bijection` | `∀i ∈ [0,6]: weekdayToIndex(indexToWeekday(i)) = i` | LAW 27 |
| `weekday order` | `weekdayToIndex('mon') < weekdayToIndex('tue') < ... < weekdayToIndex('sun')` | LAW 28 |

---

## 6. Month and Year Queries

### 6.1 isLeapYear

#### Unit Tests

| Test Name | Input | Expected | Notes |
|-----------|-------|----------|-------|
| `isLeapYear 2024` | `2024` | `true` | Divisible by 4, not 100 |
| `isLeapYear 2023` | `2023` | `false` | Not divisible by 4 |
| `isLeapYear 2000` | `2000` | `true` | Divisible by 400 |
| `isLeapYear 1900` | `1900` | `false` | Divisible by 100, not 400 |
| `isLeapYear 2100` | `2100` | `false` | Divisible by 100, not 400 |

#### Property-Based Tests

| Test Name | Property |
|-----------|----------|
| `isLeapYear definition` | `isLeapYear(y) ≡ (y % 4 = 0) ∧ ((y % 100 ≠ 0) ∨ (y % 400 = 0))` |

### 6.2 daysInMonth

#### Unit Tests — All Months

| Test Name | Year | Month | Expected | Laws Verified |
|-----------|------|-------|----------|---------------|
| `daysInMonth Jan` | 2024 | 1 | 31 | LAW 29 |
| `daysInMonth Feb leap` | 2024 | 2 | 29 | LAW 30 |
| `daysInMonth Feb non-leap` | 2023 | 2 | 28 | LAW 30 |
| `daysInMonth Mar` | 2024 | 3 | 31 | LAW 29 |
| `daysInMonth Apr` | 2024 | 4 | 30 | LAW 29 |
| `daysInMonth May` | 2024 | 5 | 31 | LAW 29 |
| `daysInMonth Jun` | 2024 | 6 | 30 | LAW 29 |
| `daysInMonth Jul` | 2024 | 7 | 31 | LAW 29 |
| `daysInMonth Aug` | 2024 | 8 | 31 | LAW 29 |
| `daysInMonth Sep` | 2024 | 9 | 30 | LAW 29 |
| `daysInMonth Oct` | 2024 | 10 | 31 | LAW 29 |
| `daysInMonth Nov` | 2024 | 11 | 30 | LAW 29 |
| `daysInMonth Dec` | 2024 | 12 | 31 | LAW 29 |
| `daysInMonth Feb 2000` | 2000 | 2 | 29 | LAW 30 |
| `daysInMonth Feb 1900` | 1900 | 2 | 28 | LAW 30 |

### 6.3 daysInYear

#### Unit Tests

| Test Name | Input | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `daysInYear leap` | `2024` | `366` | LAW 32 |
| `daysInYear non-leap` | `2023` | `365` | LAW 32 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `daysInYear sum of months` | `∀y: daysInYear(y) = Σ daysInMonth(y, m) for m in 1..12` | LAW 33 |

---

## 7. Component Extraction

### 7.1 Date Components

#### Unit Tests

| Test Name | Input | Expected |
|-----------|-------|----------|
| `yearOf` | `"2024-03-15"` | `2024` |
| `monthOf` | `"2024-03-15"` | `3` |
| `dayOf` | `"2024-03-15"` | `15` |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `date reconstruction` | `∀d: makeDate(yearOf(d), monthOf(d), dayOf(d)) = d` | LAW 34 |
| `monthOf range` | `∀d: monthOf(d) ∈ [1, 12]` | LAW 35 |
| `dayOf range` | `∀d: dayOf(d) ∈ [1, 31]` | LAW 36 |
| `dayOf validity` | `∀d: dayOf(d) ≤ daysInMonth(yearOf(d), monthOf(d))` | LAW 37 |

### 7.2 Time Components

#### Unit Tests

| Test Name | Input | Expected |
|-----------|-------|----------|
| `hourOf` | `"14:30:45"` | `14` |
| `minuteOf` | `"14:30:45"` | `30` |
| `secondOf` | `"14:30:45"` | `45` |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `time reconstruction` | `∀t: makeTime(hourOf(t), minuteOf(t), secondOf(t)) = t` | LAW 38 |
| `hourOf range` | `∀t: hourOf(t) ∈ [0, 23]` | LAW 39 |
| `minuteOf range` | `∀t: minuteOf(t) ∈ [0, 59]` | LAW 40 |
| `secondOf range` | `∀t: secondOf(t) ∈ [0, 59]` | LAW 41 |

### 7.3 DateTime Decomposition

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `datetime reconstruction` | `∀dt: makeDateTime(dateOf(dt), timeOf(dt)) = dt` | LAW 42 |

---

## 8. Timezone Conversion

### 8.1 toUTC / toLocal Round-Trip

#### Unit Tests

| Test Name | Input | Timezone | Notes |
|-----------|-------|----------|-------|
| `toUTC standard time` | `"2024-01-15T12:00:00"` | `"America/New_York"` | -5h offset |
| `toUTC DST time` | `"2024-07-15T12:00:00"` | `"America/New_York"` | -4h offset |
| `toLocal standard time` | UTC equivalent | `"America/New_York"` | -5h offset |
| `toLocal DST time` | UTC equivalent | `"America/New_York"` | -4h offset |

#### DST Gap Handling (Spring Forward)

| Test Name | Input | Timezone | Expected | Notes |
|-----------|-------|----------|----------|-------|
| `toUTC gap time` | `"2024-03-10T02:30:00"` | `"America/New_York"` | Shifts to 03:00 | 2:00-3:00 doesn't exist |

#### DST Overlap Handling (Fall Back)

| Test Name | Input | Timezone | Expected | Notes |
|-----------|-------|----------|----------|-------|
| `toUTC overlap time` | `"2024-11-03T01:30:00"` | `"America/New_York"` | Uses standard time | Assume later instant |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `UTC round-trip` | `∀utc,tz: toUTC(toLocal(utc, tz), tz) = utc` | LAW 43 |
| `Local round-trip (non-gap)` | `∀local,tz: isDSTAt(local, tz) ≠ 'gap' → toLocal(toUTC(local, tz), tz) = local` | LAW 44 |

### 8.2 isDSTAt

#### Unit Tests

| Test Name | Input | Timezone | Expected |
|-----------|-------|----------|----------|
| `isDSTAt winter` | `"2024-01-15T12:00:00"` | `"America/New_York"` | `false` |
| `isDSTAt summer` | `"2024-07-15T12:00:00"` | `"America/New_York"` | `true` |
| `isDSTAt gap` | `"2024-03-10T02:30:00"` | `"America/New_York"` | `'gap'` |
| `isDSTAt overlap` | `"2024-11-03T01:30:00"` | `"America/New_York"` | `'overlap'` |
| `isDSTAt no-DST timezone` | `"2024-07-15T12:00:00"` | `"UTC"` | `false` |

---

## 9. Comparison Operations

### 9.1 Date Comparison

#### Unit Tests

| Test Name | Input A | Input B | compareDates | Laws Verified |
|-----------|---------|---------|--------------|---------------|
| `dates equal` | `"2024-03-15"` | `"2024-03-15"` | `0` | LAW 46 |
| `date before` | `"2024-03-14"` | `"2024-03-15"` | `-1` | LAW 45 |
| `date after` | `"2024-03-16"` | `"2024-03-15"` | `1` | LAW 45 |

#### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `date total order` | Exactly one of a < b, a = b, a > b | LAW 45 |
| `dateEquals reflexive` | `∀d: dateEquals(d, d)` | LAW 46 |
| `dateEquals symmetric` | `∀a,b: dateEquals(a, b) = dateEquals(b, a)` | LAW 47 |
| `dateEquals transitive` | `∀a,b,c: dateEquals(a, b) ∧ dateEquals(b, c) → dateEquals(a, c)` | LAW 48 |
| `dateBefore antisymmetric` | `∀a,b: dateBefore(a, b) → ¬dateBefore(b, a)` | LAW 49 |
| `dateBefore transitive` | `∀a,b,c: dateBefore(a, b) ∧ dateBefore(b, c) → dateBefore(a, c)` | LAW 50 |

### 9.2 Time Comparison

(Same structure as date comparison — test reflexive, symmetric, transitive, antisymmetric properties)

### 9.3 DateTime Comparison

(Same structure as date comparison — test all ordering properties)

---

## 10. System Invariants

These invariants must be verified across all tests:

| Invariant | Description | Verification Method |
|-----------|-------------|---------------------|
| INV 1 | Every LocalDate satisfies domain constraints | Type-enforced + boundary tests |
| INV 2 | Every LocalTime satisfies domain constraints | Type-enforced + boundary tests |
| INV 3 | Every LocalDateTime decomposes to valid components | Property test LAW 42 |
| INV 4 | No operation produces invalid date/time | All operations return valid types |
| INV 5 | All string representations are canonical | Round-trip tests verify |
| INV 6 | Timezone conversions are consistent | LAW 43, LAW 44 |

---

## 11. Error Handling

#### Unit Tests

| Test Name | Operation | Expected |
|-----------|-----------|----------|
| `parse functions return Result` | `parseDate("invalid")` | Returns `Err`, does not throw |
| `arithmetic throws RangeError on overflow` | `addDays(maxDate, 1)` | Throws `RangeError` |
| `error includes input value` | `parseDate("2024-13-01")` | Error message includes `"2024-13-01"` |
| `error includes expected constraint` | `parseDate("2024-13-01")` | Error mentions month range |

---

## 12. Test Count Summary

| Category | Unit Tests | Property-Based Tests | Total |
|----------|------------|---------------------|-------|
| Parsing | ~25 | 5 | ~30 |
| Formatting | ~6 | 0 | ~6 |
| Round-Trip Laws | 0 | 5 | 5 |
| Date Arithmetic | ~20 | 8 | ~28 |
| Day-of-Week | ~8 | 4 | ~12 |
| Month/Year Queries | ~18 | 2 | ~20 |
| Component Extraction | ~6 | 8 | ~14 |
| Timezone Conversion | ~10 | 2 | ~12 |
| Comparison | ~6 | 12 | ~18 |
| Error Handling | ~4 | 0 | ~4 |
| **Total** | **~103** | **~46** | **~149** |

---

## 13. Test Execution Notes

- All property-based tests should run with at least 100 random inputs
- Use `fast-check` or similar library for property-based testing
- Date generators should cover:
  - Full year range (focus on 1970–2100 for practical use)
  - All month lengths
  - Leap year edge cases (2000, 1900, 2100)
  - Year boundaries
- Time generators should cover:
  - Full 24-hour range
  - Midnight and end-of-day boundaries
- DST tests should use real IANA timezone data, not mocks
