# Segment 9: Instance Exceptions — Formal Specification

## 1. Overview

Instance exceptions modify individual occurrences without changing the series rule. An instance can be cancelled (removed) or rescheduled (moved).

---

## 2. Types

### 2.1 InstanceException

```
type InstanceException = {
  seriesId: SeriesId
  instanceDate: LocalDate    // original scheduled date
  type: 'cancelled' | 'rescheduled'
  newTime?: LocalDateTime    // for rescheduled only
  createdAt: LocalDateTime
}
```

---

## 3. Cancel Instance

```
cancelInstance(seriesId: SeriesId, instanceDate: LocalDate): void
```

### 3.1 Preconditions

```
PRE 1: Series exists
PRE 2: Instance would exist on that date (pattern produces it)
PRE 3: Instance not already cancelled
```

### 3.2 Postconditions

```
POST 1: Exception record created with type='cancelled'
POST 2: Instance no longer appears in schedule
POST 3: Series continues (other instances unaffected)
```

### 3.3 Properties

```
LAW 1: Cancelled instance excluded from getSchedule results
LAW 2: Cancelling doesn't affect pattern (other instances still generated)
LAW 3: Cancelling same instance twice throws AlreadyCancelledError
LAW 4: Can cancel rescheduled instance (becomes cancelled)
```

---

## 4. Reschedule Instance

```
rescheduleInstance(seriesId: SeriesId, instanceDate: LocalDate, newTime: LocalDateTime): void
```

### 4.1 Preconditions

```
PRE 4: Series exists
PRE 5: Instance would exist on that date
PRE 6: Instance not cancelled
PRE 7: newTime is valid LocalDateTime
```

### 4.2 Postconditions

```
POST 4: Exception record created with type='rescheduled', newTime set
POST 5: Instance appears at newTime instead of original time
POST 6: Original time slot freed
```

### 4.3 Properties

```
LAW 5: Rescheduled instance appears at newTime in schedule
LAW 6: Original slot no longer occupied
LAW 7: Rescheduling cancelled instance throws CancelledInstanceError
LAW 8: Rescheduling already rescheduled instance updates newTime (domain layer checks, updates)
```

### 4.4 Update Semantics

When `rescheduleInstance` is called:
1. Domain layer checks if exception exists for (seriesId, instanceDate)
2. If exists and type='cancelled' → throw `CancelledInstanceError`
3. If exists and type='rescheduled' → update the newTime field
4. If doesn't exist → create new exception with type='rescheduled'

Adapter remains simple CRUD; domain layer orchestrates the check-then-act logic.

---

## 5. Restore Instance

```
restoreInstance(seriesId: SeriesId, instanceDate: LocalDate): void
```

### 5.1 Preconditions

```
PRE 8: Exception exists for (seriesId, instanceDate)
```

### 5.2 Postconditions

```
POST 7: Exception deleted
POST 8: Instance returns to original scheduled time
```

### 5.3 Properties

```
LAW 9: After restore, instance appears at original time
LAW 10: Restoring non-excepted instance throws NoExceptionError
```

---

## 6. Query Exceptions

```
getInstanceException(seriesId: SeriesId, instanceDate: LocalDate): InstanceException | null
getInstanceExceptionsBySeries(seriesId: SeriesId): InstanceException[]
getInstanceExceptionsInRange(startDate: LocalDate, endDate: LocalDate): InstanceException[]
```

### 6.1 Properties

```
LAW 11: Returns null if no exception for that instance
LAW 12: Range query returns exceptions where instanceDate ∈ [start, end]
```

---

## 7. Integration with Pattern Expansion

```
expandSeriesInstances(series: Series, range: DateRange): Instance[]

// Conceptually:
expandSeriesInstances(series, range) =
  let baseDates = expandPatterns(series.patterns, range, series.startDate)
  let withExceptions = applyExceptions(baseDates, series.exceptions, range, series.startDate)
  let instances = withExceptions.map(date => makeInstance(series, date))
  let withInstanceExceptions = applyInstanceExceptions(instances, getExceptionsBySeries(series.id))
  withInstanceExceptions
```

### 7.1 Apply Instance Exceptions

```
applyInstanceExceptions(instances: Instance[], exceptions: InstanceException[]): Instance[] =
  instances
    .filter(i => not isCancelled(i, exceptions))
    .map(i => applyReschedule(i, exceptions))

isCancelled(instance, exceptions) =
  ∃e ∈ exceptions: e.instanceDate = instance.date ∧ e.type = 'cancelled'

applyReschedule(instance, exceptions) =
  let e = find(exceptions, e => e.instanceDate = instance.date ∧ e.type = 'rescheduled')
  if e ≠ null then { ...instance, scheduledTime: e.newTime }
  else instance
```

---

## 8. Invariants

```
INV 1: At most one exception per (seriesId, instanceDate)
INV 2: Rescheduled exception always has newTime
INV 3: Cancelled exception never has newTime
INV 4: Exception can only exist for dates pattern would produce
INV 5: Series deletion cascades to exceptions
```

---

## 9. Boundary Conditions

```
B1: Cancel first instance of series → only that instance affected
B2: Cancel last instance → only that instance affected
B3: Reschedule to same day, different time → works
B4: Reschedule to different day → works
B5: Reschedule across month/year boundary → works
B6: Reschedule to date outside reflow range → instance doesn't appear in that range's schedule
B7: Cancel/reschedule date not produced by pattern → NonExistentInstanceError
```

---

## 10. Verification Strategy

### 10.1 Cancel tests

- Cancel → instance gone from schedule
- Cancel → other instances unaffected
- Cancel twice → error

### 10.2 Reschedule tests

- Reschedule → instance at new time
- Reschedule → original slot free
- Reschedule twice → latest time used

### 10.3 Restore tests

- Restore cancelled → back in schedule
- Restore rescheduled → back to original time

### 10.4 Integration tests

- Pattern expansion respects exceptions
- Cancelled exceptions filtered out
- Rescheduled exceptions have modified times

---

## 11. Error Types

```
NonExistentInstanceError: Attempt to cancel/reschedule instance not produced by pattern
  - Thrown when pattern doesn't produce an instance on the given date
AlreadyCancelledError: Attempt to cancel an already-cancelled instance
CancelledInstanceError: Attempt to reschedule a cancelled instance
NoExceptionError: Attempt to restore an instance with no exception
NotFoundError: Series doesn't exist
```

---

## 12. Dependencies

- Segment 2: Pattern Expansion
- Segment 4: Adapter
- Segment 5: Series CRUD
