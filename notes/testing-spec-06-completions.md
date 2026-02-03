# Segment 6: Completions — Formal Specification

## 1. Overview

Completions record what actually happened. They are the historical record that conditions query to affect future scheduling.

---

## 2. Types

### 2.1 Completion

```
type Completion = {
  id: CompletionId
  seriesId: SeriesId
  instanceDate: LocalDate     // which occurrence was completed
  date: LocalDate             // when it was completed
  startTime: LocalDateTime    // actual start
  endTime: LocalDateTime      // actual end
  createdAt: LocalDateTime
}
```

### 2.2 Derived

```
duration(c: Completion): Duration = minutesBetween(c.startTime, c.endTime)
```

---

## 3. Log Completion

```
logCompletion(input: LogCompletionInput): CompletionId

type LogCompletionInput = {
  seriesId: SeriesId
  instanceDate: LocalDate
  startTime: LocalDateTime
  endTime: LocalDateTime
}
```

### 3.1 Preconditions

```
PRE 1: Series with seriesId exists
PRE 2: No completion already exists for (seriesId, instanceDate)
PRE 3: endTime ≥ startTime
PRE 4: instanceDate is valid LocalDate
PRE 5: startTime and endTime are valid LocalDateTime
```

### 3.2 Postconditions

```
POST 1: Completion created with unique ID
POST 2: date set to dateOf(startTime)
POST 3: createdAt set to current time
POST 4: getCompletion(id) returns the completion
```

### 3.3 Properties

```
LAW 1: After logCompletion, getCompletionByInstance(seriesId, instanceDate) ≠ null
LAW 2: Logging completion for same instance twice throws DuplicateCompletionError
LAW 3: Completion duration = endTime - startTime
```

---

## 4. Query Completions

### 4.1 By ID

```
getCompletion(id: CompletionId): Completion | null
```

### 4.2 By Series

```
getCompletionsBySeries(seriesId: SeriesId): Completion[]
```

**Properties**:
```
LAW 4: All returned completions have matching seriesId
LAW 5: Ordered by date descending (most recent first)
```

### 4.3 By Instance

```
getCompletionByInstance(seriesId: SeriesId, instanceDate: LocalDate): Completion | null
```

**Properties**:
```
LAW 6: Returns the unique completion for that instance, or null
```

### 4.4 By Target and Window

```
getCompletions(target: Target, windowDays: number): Completion[]
```

**Properties**:
```
LAW 7: All returned completions have date in [today - windowDays + 1, today]
LAW 8: If target = { tag: t }, returns completions where series has tag t
LAW 9: If target = { seriesId: s }, returns completions for series s
```

---

## 5. Delete Completion

```
deleteCompletion(id: CompletionId): void
```

### 5.1 Preconditions

```
PRE 6: Completion with id exists
```

### 5.2 Postconditions

```
POST 5: Completion no longer exists
POST 6: getCompletion(id) = null
```

### 5.3 Properties

```
LAW 10: After delete, getCompletionByInstance returns null for that instance
LAW 11: Delete on non-existent ID throws NotFoundError
```

---

## 6. Condition Support Operations

These operations support condition evaluation (Segment 3).

### 6.1 Count in Window

```
countCompletionsInWindow(target: Target, windowDays: number, asOfDate: LocalDate): number
```

**Definition**:
```
countCompletionsInWindow(target, windowDays, asOf) =
  |{ c | c ∈ completions(target) ∧ c.date ∈ [asOf - windowDays + 1, asOf] }|
```

**Properties**:
```
LAW 12: Result ≥ 0
LAW 13: Result ≤ total completions for target
LAW 14: Window is inclusive on both ends
LAW 15: Completion on asOf date is counted
LAW 16: Completion on asOf - windowDays + 1 is counted
LAW 17: Completion on asOf - windowDays is NOT counted
```

### 6.2 Days Since Last

```
getDaysSinceLastCompletion(target: Target, asOfDate: LocalDate): number | null
```

**Definition**:
```
getDaysSinceLastCompletion(target, asOf) =
  let completions = completions(target)
  if completions = ∅ then null
  else daysBetween(max(c.date for c in completions), asOf)
```

**Properties**:
```
LAW 18: Returns null if no completions exist for target
LAW 19: Returns 0 if most recent completion is on asOfDate
LAW 20: Returns positive integer if most recent is before asOfDate
LAW 21: Result = daysBetween(mostRecentCompletionDate, asOfDate)
```

---

## 7. Adaptive Duration Support

```
getRecentCompletionDurations(seriesId: SeriesId, mode: 'lastN' | 'windowDays', value: number): Duration[]
```

### 7.1 Mode: lastN

```
getRecentCompletionDurations(seriesId, 'lastN', n) =
  let completions = getCompletionsBySeries(seriesId) ordered by date desc
  take(n, completions).map(c => duration(c))
```

**Properties**:
```
LAW 22: Returns at most n durations
LAW 23: Returns fewer if fewer completions exist
LAW 24: Most recent first
```

### 7.2 Mode: windowDays

```
getRecentCompletionDurations(seriesId, 'windowDays', days) =
  let completions = getCompletionsBySeries(seriesId)
  let recent = { c | c ∈ completions ∧ c.date ∈ [today - days + 1, today] }
  recent.map(c => duration(c))
```

**Properties**:
```
LAW 25: All returned durations from completions in window
LAW 26: Returns empty if no completions in window
```

---

## 8. Invariants

```
INV 1: Every completion references existing series
INV 2: At most one completion per (seriesId, instanceDate)
INV 3: endTime ≥ startTime for all completions
INV 4: Completion ID is immutable
INV 5: Completions are never modified, only created or deleted
```

---

## 9. Error Types

```
NotFoundError: Completion or series doesn't exist
DuplicateCompletionError: Completion already exists for instance
InvalidTimeRangeError: endTime < startTime
```

---

## 10. Verification Strategy

### 10.1 CRUD tests

- Log → Get → Delete → Get null

### 10.2 Query tests

- Multiple completions → query by series returns all
- Query by tag returns completions for all series with tag

### 10.3 Window tests

- Completions on boundary dates
- Empty window
- Window with multiple completions

### 10.4 Days since tests

- No completions → null
- Completion today → 0
- Completion yesterday → 1

---

## 11. Dependencies

- Segment 1: Time & Date Utilities
- Segment 4: Adapter
- Segment 5: Series CRUD (series must exist)
