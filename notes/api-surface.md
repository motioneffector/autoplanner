# API Surface

**Unified model**: Everything is a Series. A one-time event is a Series with a single instance.
Consumer thinks in terms of **Series** (definitions) and **Instances** (occurrences).

## Initialization

```typescript
// Create instance with DB adapter
const planner = createAutoplanner({
  db: sqliteAdapter,       // adapter wrapping bun:sqlite, better-sqlite3, etc.
  timezone: 'America/New_York'  // local timezone for API boundary conversion
})
```

## Series Management

### Create

```typescript
planner.createSeries({
  title: string,
  description?: string,
  tags?: string[],

  // Timing
  startDate: LocalDate,
  endDate?: LocalDate,            // omit for forever, or same as startDate for one-time
  count?: number,                 // alternative to endDate (1 = one-time event)
  timeOfDay: LocalTime | 'allDay',
  duration: Duration | 'allDay' | AdaptiveDuration,

  // Patterns (omit or empty array for one-time events)
  patterns?: Pattern[],           // union of patterns
  exceptions?: Pattern[],         // subtract from base

  // Behavior
  fixed: boolean,                 // true = immovable anchor
  wiggle?: WiggleConfig,          // day and/or time flexibility

  // Optional features
  reminders?: Reminder[],
  locked?: boolean,
  cycling?: CyclingConfig,

  // Conditional patterns: define conditions, reference by ID in patterns
  conditions?: ConditionDef[],    // conditions owned by this series
}): SeriesId

// One-time event example:
planner.createSeries({
  title: "Doctor appointment",
  startDate: "2024-03-15",
  count: 1,                       // single instance
  timeOfDay: "14:30",
  duration: 60,
  fixed: true
})

// Recurring example:
planner.createSeries({
  title: "Weekly review",
  startDate: "2024-01-01",
  timeOfDay: "09:00",
  duration: 30,
  patterns: [{ type: 'weekly' }],
  fixed: false,
  wiggle: { daysBefore: 1, daysAfter: 1 }
})
```

### Conditions and Patterns

Conditions are defined at the series level and referenced by patterns:

```typescript
planner.createSeries({
  title: "Weight training",
  startDate: "2024-01-01",
  timeOfDay: "07:00",
  duration: 45,
  conditions: [
    {
      id: 'conditioned',  // local ID for reference
      type: 'count',
      target: { tag: 'weights' },
      operator: '>=',
      value: 4,
      windowDays: 14
    }
  ],
  patterns: [
    { type: 'weekdays', days: ['mon', 'wed', 'fri'], conditionId: 'conditioned' }
  ],
  fixed: true
})
```

### Read

```typescript
planner.getSeries(id: SeriesId): Series | null
planner.getSeriesByTag(tag: string): Series[]
planner.getAllSeries(): Series[]
```

### Update

```typescript
// Fails if locked (unless unlocking)
planner.updateSeries(id: SeriesId, changes: Partial<Series>): void

// Lock/unlock
planner.lock(id: SeriesId): void
planner.unlock(id: SeriesId): void
```

### Delete

```typescript
planner.deleteSeries(id: SeriesId): void  // throws if completions exist (must delete those first)
```

### Series Splitting

```typescript
// End series at date, return new series ID for continuation
planner.splitSeries(id: SeriesId, splitDate: LocalDate, newParams: Partial<Series>): SeriesId
```

## Linked Entries

```typescript
planner.linkSeries({
  childId: SeriesId,
  parentId: SeriesId,
  targetDistance: Duration,     // offset from parent end
  earlyWobble: Duration,        // how much earlier allowed
  lateWobble: Duration          // how much later allowed
}): void

planner.unlinkSeries(childId: SeriesId): void
```

## Relational Constraints

```typescript
planner.addConstraint({
  type: 'mustBeOnSameDay' | 'cantBeOnSameDay' |
        'mustBeNextTo' | 'cantBeNextTo' |
        'mustBeBefore' | 'mustBeAfter' |
        'mustBeWithin',
  sourceTarget: Target,         // { tag: string } | { seriesId: string }
  destTarget: Target,
  withinMinutes?: number        // for 'mustBeWithin'
}): ConstraintId

planner.removeConstraint(id: ConstraintId): void
```

## Instance Operations

Instances are identified by `(seriesId, instanceDate)`.

```typescript
// Get specific instance
planner.getInstance(seriesId: SeriesId, instanceDate: LocalDate): Instance | null

// Cancel single occurrence (removes from schedule, series continues)
planner.cancelInstance(seriesId: SeriesId, instanceDate: LocalDate): void

// Reschedule single occurrence to different time
planner.rescheduleInstance(
  seriesId: SeriesId,
  instanceDate: LocalDate,
  newTime: LocalDateTime
): void
```

Note: To mark an instance complete, use `logCompletion()`. There is no "skip" or "missed" —
if something wasn't completed, no completion is logged. The system doesn't track the difference
between "forgot" and "intentionally skipped."

## Querying

### Schedule

```typescript
// Get computed schedule for date range
// Returns positioned instances after reflow
planner.getSchedule(
  startDate: LocalDate,
  endDate: LocalDate
): ScheduledInstance[]

// ScheduledInstance includes:
// - seriesId
// - instanceDate (original scheduled date)
// - computed start/end time (after reflow)
// - title (resolved from cycling if applicable)
// - status: 'scheduled' | 'completed' | 'cancelled'
// - conflicts/warnings if any
```

### Reminders

```typescript
// Get pending reminders (not yet acknowledged)
planner.getPendingReminders(): PendingReminder[]

// Acknowledge reminder (seriesId + instanceDate identifies which occurrence)
planner.acknowledgeReminder(seriesId: SeriesId, instanceDate: LocalDate, reminderTag: string): void
```

### Conflicts

```typescript
// Get current conflicts/warnings
planner.getConflicts(): Conflict[]

// Conflict includes:
// - type: 'overlap' | 'constraintViolation' | 'chainCannotFit' | 'noValidSlot'
// - involvedSeries
// - description
```

## Completions (Separate from Calendar)

Completions record the past. Series define the future. They are distinct.

```typescript
// Log a completion (the thing got done)
planner.logCompletion({
  seriesId: SeriesId,
  instanceDate: LocalDate,        // which occurrence was completed
  startTime: LocalDateTime,       // actual start
  endTime: LocalDateTime          // actual end
}): CompletionId

// Query completions
planner.getCompletions(
  target: Target,                 // { tag: string } | { seriesId: string }
  windowDays: number
): Completion[]

// Delete a completion (logged in error)
planner.deleteCompletion(id: CompletionId): void
```

## History & State

```typescript
// Evaluate a condition (for debugging/UI)
planner.evaluateCondition(condition: Condition): boolean

// Get current state of all conditional patterns
planner.getActiveConditions(): { seriesId: SeriesId, activePatterns: Pattern[] }[]
```

## Events / Hooks (optional)

```typescript
// Subscribe to changes for reactive UIs
planner.on('reflow', (schedule: ScheduledInstance[]) => void)
planner.on('conflict', (conflict: Conflict) => void)
planner.on('reminderDue', (reminder: PendingReminder) => void)
```

---

## Open Questions

1. **Batch operations**: Should there be transaction-style batching to avoid multiple reflows?
2. **Undo/redo**: Should the library track history for undo, or leave that to consumer?
3. **Export/import**: Serialize full state for backup/restore?
