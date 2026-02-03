# Segment 14: Public API — Formal Specification

## 1. Overview

The public API is the consumer-facing interface that ties all components together. It handles initialization, timezone conversion, and event emission.

---

## 2. Initialization

```
createAutoplanner(config: AutoplannerConfig): Autoplanner

type AutoplannerConfig = {
  db: AutoplannerAdapter
  timezone: string           // IANA timezone
}
```

### 2.1 Preconditions

```
PRE 1: db implements AutoplannerAdapter interface
PRE 2: timezone is valid IANA identifier
```

### 2.2 Postconditions

```
POST 1: Autoplanner instance created
POST 2: All operations use provided adapter
POST 3: All API times interpreted in provided timezone
```

---

## 3. API Methods

### 3.1 Series Management

```
interface Autoplanner {
  // Create
  createSeries(input: CreateSeriesInput): SeriesId

  // Read
  getSeries(id: SeriesId): Series | null
  getSeriesByTag(tag: string): Series[]
  getAllSeries(): Series[]

  // Update
  updateSeries(id: SeriesId, changes: Partial<Series>): void
  lock(id: SeriesId): void
  unlock(id: SeriesId): void

  // Delete
  deleteSeries(id: SeriesId): void

  // Split
  splitSeries(id: SeriesId, splitDate: LocalDate, newParams: Partial<Series>): SeriesId
}
```

### 3.2 Links

```
interface Autoplanner {
  linkSeries(input: LinkInput): void
  unlinkSeries(childId: SeriesId): void
}
```

### 3.3 Constraints

```
interface Autoplanner {
  addConstraint(constraint: RelationalConstraint): ConstraintId
  removeConstraint(id: ConstraintId): void
}
```

### 3.4 Instance Operations

```
interface Autoplanner {
  getInstance(seriesId: SeriesId, instanceDate: LocalDate): Instance | null
  cancelInstance(seriesId: SeriesId, instanceDate: LocalDate): void
  rescheduleInstance(seriesId: SeriesId, instanceDate: LocalDate, newTime: LocalDateTime): void
}
```

### 3.5 Completions

```
interface Autoplanner {
  logCompletion(input: LogCompletionInput): CompletionId
  getCompletions(target: Target, windowDays: number): Completion[]
  deleteCompletion(id: CompletionId): void
}
```

### 3.6 Querying

```
interface Autoplanner {
  getSchedule(startDate: LocalDate, endDate: LocalDate): ScheduledInstance[]
  getPendingReminders(): PendingReminder[]
  acknowledgeReminder(seriesId: SeriesId, instanceDate: LocalDate, reminderTag: string): void
  getConflicts(): Conflict[]
}
```

### 3.7 State Inspection

```
interface Autoplanner {
  evaluateCondition(condition: Condition): boolean
  getActiveConditions(): { seriesId: SeriesId, activePatterns: Pattern[] }[]
}
```

### 3.8 Events

```
interface Autoplanner {
  on(event: 'reflow', handler: (schedule: ScheduledInstance[]) => void): void
  on(event: 'conflict', handler: (conflict: Conflict) => void): void
  on(event: 'reminderDue', handler: (reminder: PendingReminder) => void): void
}
```

---

## 4. Timezone Conversion

### 4.1 At API Boundary

```
// Input: Local time in configured timezone
// Storage: UTC internally
// Output: Local time in configured timezone

createSeries({ timeOfDay: "09:00" })
  → stored as UTC equivalent
  → returned as "09:00" in configured timezone

logCompletion({ startTime: "2024-03-15T14:30:00" })
  → interpreted as local time
  → stored as UTC
  → returned as local time
```

### 4.2 Properties

```
LAW 1: All input times interpreted as configured timezone
LAW 2: All output times in configured timezone
LAW 3: Internal storage is UTC
LAW 4: DST transitions handled per Segment 1 rules
```

---

## 5. Reflow Triggering

### 5.1 Operations That Trigger Reflow

```
- createSeries
- updateSeries
- deleteSeries
- linkSeries / unlinkSeries
- addConstraint / removeConstraint
- cancelInstance / rescheduleInstance
- logCompletion (may change condition states)
```

### 5.2 Properties

```
LAW 5: Reflow happens automatically after triggering operations
LAW 6: Reflow event emitted after each reflow
LAW 7: getSchedule returns post-reflow state
LAW 8: Reflow is synchronous (completes before operation returns)
```

---

## 6. Error Handling

### 6.1 Error Types

```
ValidationError: Input validation failed
NotFoundError: Entity doesn't exist
LockedSeriesError: Series is locked
CompletionsExistError: Attempt to delete series with completions
LinkedChildrenExistError: Attempt to delete series that is parent to linked children
NonExistentInstanceError: Attempt to cancel/reschedule instance not produced by pattern
AlreadyCancelledError: Attempt to cancel already-cancelled instance
CancelledInstanceError: Attempt to reschedule cancelled instance
CycleDetectedError: Attempt to create cycle in link graph
ChainDepthExceededError: Attempt to exceed maximum chain depth (32)
DuplicateCompletionError: Attempt to log completion for already-completed instance
```

### 6.2 Properties

```
LAW 9: All errors include descriptive message
LAW 10: Failed operations don't mutate state (transactional)
LAW 11: Errors are typed for programmatic handling
```

---

## 7. Idempotency

### 7.1 Idempotent Operations

```
LAW 12: lock(id) is idempotent
LAW 13: unlock(id) is idempotent
LAW 14: acknowledgeReminder is idempotent
```

### 7.2 Non-Idempotent Operations

```
LAW 15: createSeries always creates new series
LAW 16: logCompletion for same instance throws
```

---

## 8. Concurrency

### 8.1 Single-Threaded Assumption

```
LAW 17: API assumes single-threaded access
LAW 18: Concurrent calls may produce undefined behavior
LAW 19: Consumer responsible for synchronization if needed
```

---

## 9. Event Emission

### 9.1 Reflow Event

```
on('reflow', (schedule) => ...)

Emitted: After every reflow
Payload: Complete schedule for configured window
```

### 9.2 Conflict Event

```
on('conflict', (conflict) => ...)

Emitted: When new conflict detected
Payload: Conflict details
```

### 9.3 Reminder Due Event

```
on('reminderDue', (reminder) => ...)

Emitted: When reminder fire time reached
Payload: Reminder details
Note: Requires consumer to poll or set up timer
```

### 9.4 Properties

```
LAW 20: Events fire after state mutation complete
LAW 21: Event handlers receive immutable snapshots
LAW 22: Errors in handlers don't affect API operation
```

---

## 10. Invariants

```
INV 1: API always returns consistent state
INV 2: All times at API boundary are local timezone
INV 3: Events reflect current state
INV 4: Operations are transactional
```

---

## 11. Verification Strategy

### 11.1 Integration tests

- Full CRUD workflows
- Reflow triggers correctly
- Events fire correctly

### 11.2 Timezone tests

- Input/output conversion
- DST transitions
- Various timezones

### 11.3 Error handling tests

- Each error type
- Transactional rollback

### 11.4 Event tests

- Event ordering
- Payload correctness
- Handler isolation

---

## 12. Dependencies

- All previous segments
