# Segment 5: Series CRUD & Tags — Formal Specification

## 1. Overview

This segment specifies the domain-level operations on Series entities, built on top of the adapter. It includes validation, business rules, and tag management.

---

## 2. Domain Types

### 2.1 Series (Domain Object)

```
type Series = {
  id: SeriesId
  title: string              // non-empty
  description?: string
  tags: string[]

  // Timing
  startDate: LocalDate
  endDate?: LocalDate
  count?: number             // alternative to endDate
  timeOfDay: LocalTime | 'allDay'
  duration: Duration | 'allDay' | AdaptiveDuration

  // Patterns
  patterns: Pattern[]        // union of patterns
  exceptions: Pattern[]      // subtract from base

  // Behavior
  fixed: boolean
  wiggle?: WiggleConfig

  // Optional
  reminders: Reminder[]
  locked: boolean
  cycling?: CyclingConfig
  conditions: ConditionDef[]

  // Metadata
  createdAt: LocalDateTime
  updatedAt: LocalDateTime
}
```

### 2.2 SeriesId

```
type SeriesId = string  // UUID v4
```

---

## 3. Create Series

```
createSeries(input: CreateSeriesInput): SeriesId
```

### 3.1 Preconditions

```
PRE 1: input.title is non-empty string
PRE 2: input.startDate is valid LocalDate
PRE 3: endDate and count are mutually exclusive (at most one specified)
PRE 4: If endDate specified: endDate ≥ startDate
PRE 5: If count specified: count ≥ 1
PRE 6: timeOfDay is valid LocalTime or 'allDay'
PRE 7: duration is valid Duration, 'allDay', or valid AdaptiveDuration
PRE 8: If timeOfDay = 'allDay', duration must = 'allDay'
PRE 9: patterns are all valid Pattern objects
PRE 10: If patterns empty and no count, series is one-time (implicit count=1)
PRE 11: wiggle values are non-negative
PRE 12: reminders have non-negative minutes
```

### 3.2 Postconditions

```
POST 1: New series exists with unique ID
POST 2: getSeries(id) returns the created series
POST 3: createdAt and updatedAt set to current time
POST 4: locked defaults to false
POST 5: Tags created if they don't exist
POST 6: All patterns stored
POST 7: All conditions stored
```

### 3.3 Properties

```
LAW 1 (ID uniqueness): createSeries always returns unique ID
LAW 2 (Retrievable): After create, getSeries(id) ≠ null
LAW 3 (One-time inference): No patterns + no count + no endDate → treated as count=1
```

---

## 4. Get Series

```
getSeries(id: SeriesId): Series | null
getSeriesByTag(tag: string): Series[]
getAllSeries(): Series[]
```

### 4.1 Properties

```
LAW 4: getSeries(id) = null ↔ series doesn't exist or was deleted
LAW 5: s ∈ getSeriesByTag(t) ↔ t ∈ s.tags
LAW 6: getAllSeries() contains exactly all existing series
```

---

## 5. Update Series

```
updateSeries(id: SeriesId, changes: Partial<Series>): void
```

### 5.1 Preconditions

```
PRE 13: Series with id exists
PRE 14: Series is not locked (unless unlocking)
PRE 15: Cannot change id
PRE 16: Cannot change createdAt
PRE 17: All changed values satisfy validation rules
```

### 5.2 Postconditions

```
POST 8: Specified fields updated
POST 9: Unspecified fields unchanged
POST 10: updatedAt set to current time
```

### 5.3 Properties

```
LAW 7: Update on locked series throws LockedSeriesError (unless changes = {locked: false})
LAW 8: Update on non-existent series throws NotFoundError
```

---

## 6. Delete Series

```
deleteSeries(id: SeriesId): void
```

### 6.1 Preconditions

```
PRE 18: Series with id exists
PRE 19: No completions exist for this series
PRE 20: No links have this series as parent
```

### 6.2 Postconditions

```
POST 11: Series no longer exists
POST 12: All associated data deleted (patterns, conditions, reminders, etc.)
```

### 6.3 Properties

```
LAW 9: Delete with completions throws CompletionsExistError
LAW 10: Delete with child links throws LinkedChildrenExistError
LAW 11: After delete, getSeries(id) = null
```

---

## 7. Lock/Unlock

```
lock(id: SeriesId): void
unlock(id: SeriesId): void
```

### 7.1 Properties

```
LAW 12: After lock(id), getSeries(id).locked = true
LAW 13: After unlock(id), getSeries(id).locked = false
LAW 14: lock/unlock on non-existent series throws NotFoundError
LAW 15: lock is idempotent (locking locked series succeeds)
LAW 16: unlock is idempotent
```

---

## 8. Series Splitting

```
splitSeries(id: SeriesId, splitDate: LocalDate, newParams: Partial<Series>): SeriesId
```

### 8.1 Preconditions

```
PRE 21: Series with id exists
PRE 22: splitDate > series.startDate
PRE 23: splitDate ≤ series.endDate (if series has endDate)
PRE 24: Series is not locked
```

### 8.2 Postconditions

```
POST 13: Original series endDate set to splitDate - 1 day
POST 14: New series created with startDate = splitDate
POST 15: New series inherits from original, overridden by newParams
POST 16: Both series exist and are valid
POST 17: If original has cycling with gapLeap=true, currentIndex carries over to new series
```

### 8.3 Properties

```
LAW 17: splitSeries returns new series ID ≠ original ID
LAW 18: Original series completions preserved
LAW 19: New series has no completions initially
LAW 20: Cycling state (currentIndex) is preserved in new series for continuity
```

---

## 9. Tag Management

```
addTagToSeries(seriesId: SeriesId, tag: string): void
removeTagFromSeries(seriesId: SeriesId, tag: string): void
```

### 9.1 Properties

```
LAW 21: After addTagToSeries(s, t), t ∈ getTagsForSeries(s)
LAW 22: After removeTagFromSeries(s, t), t ∉ getTagsForSeries(s)
LAW 23: addTagToSeries creates tag if it doesn't exist
LAW 24: Adding existing tag is idempotent
LAW 25: Removing non-existent tag is idempotent
```

---

## 10. Validation Rules

### 10.1 Title

```
RULE 1: title.trim().length > 0
```

### 10.2 Dates

```
RULE 2: startDate is valid LocalDate
RULE 3: endDate is null OR endDate ≥ startDate
RULE 4: count is null OR count ≥ 1
RULE 5: NOT (endDate ≠ null AND count ≠ null)
```

### 10.3 Time

```
RULE 6: timeOfDay is valid LocalTime OR 'allDay'
RULE 7: timeOfDay = 'allDay' → duration = 'allDay'
RULE 8: duration = 'allDay' → timeOfDay = 'allDay'
```

### 10.4 Duration

```
RULE 9: duration is number (minutes) ≥ 1 OR 'allDay' OR valid AdaptiveDuration
RULE 10: AdaptiveDuration.fallback ≥ 1
RULE 11: AdaptiveDuration.minimum < AdaptiveDuration.maximum (if both specified)
```

### 10.5 Wiggle

```
RULE 12: wiggle.daysBefore ≥ 0
RULE 13: wiggle.daysAfter ≥ 0
RULE 14: wiggle.timeWindow.earliest < wiggle.timeWindow.latest (if specified)
RULE 15: If fixed=true, wiggle must be null or all-zero (no flexibility for fixed items)
```

---

## 11. Invariants

```
INV 1: All series in store satisfy validation rules
INV 2: Series ID is immutable once created
INV 3: createdAt is immutable once set
INV 4: locked status only prevents edits, not scheduling
```

---

## 12. Error Types

```
ValidationError: Input fails validation rules (includes fixed+wiggle conflict)
NotFoundError: Series doesn't exist
LockedSeriesError: Attempt to modify locked series
CompletionsExistError: Attempt to delete series with completions
  - Message: "Cannot delete series with existing completions. Delete completions first."
  - Recovery: Consumer must delete completions before deleting series
LinkedChildrenExistError: Attempt to delete series that is parent to linked children
  - Message: "Cannot delete series that is parent to linked children. Unlink children first."
  - Recovery: Consumer must unlink children before deleting parent
```

---

## 13. Verification Strategy

### 13.1 Validation tests

For each rule, test:
- Valid input accepted
- Invalid input rejected with appropriate error

### 13.2 CRUD round-trip tests

- Create → Get → Update → Get → Delete → Get null

### 13.3 Lock tests

- Lock → Update fails → Unlock → Update succeeds

### 13.4 Split tests

- Split → Both series valid → Original ended → New started

---

## 14. Dependencies

- Segment 1: Time & Date Utilities
- Segment 4: Adapter
