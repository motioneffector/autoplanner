# Segment 4: Adapter (In-Memory Mock) — Formal Specification

## 1. Overview

The adapter provides a domain-oriented interface to persistence. The in-memory mock implements this interface for testing without a database.

This specification defines the **interface contract** that both the mock and real adapters must satisfy.

---

## 2. Interface Contract

### 2.1 Transaction Semantics

```
transaction<T>(fn: () → T): T
```

**Preconditions**: None.

**Postconditions**:
- If `fn()` completes normally → all mutations in `fn` are committed, return value returned
- If `fn()` throws → all mutations in `fn` are rolled back, exception propagated

**Properties**:
```
LAW 1 (Atomicity): All operations in transaction succeed or all fail
LAW 2 (Isolation): Concurrent transactions see consistent state (for single-threaded mock: trivial)
LAW 3 (Nested): transaction(() => transaction(() => x)) behaves as single transaction
```

---

### 2.2 Series Operations

```
createSeries(series: SeriesRow): void
```

**Preconditions**:
- `series.id` is unique (not already in store)
- All required fields present
- All field values valid per schema

**Postconditions**:
- Series with given ID exists in store
- All fields match input

**Properties**:
```
LAW 4: After createSeries(s), getSeries(s.id) returns s
LAW 5: createSeries with duplicate ID throws DuplicateKeyError
```

---

```
getSeries(id: string): SeriesRow | null
```

**Preconditions**: None.

**Postconditions**:
- Returns series if exists, null otherwise

**Properties**:
```
LAW 6: getSeries(id) = null ↔ no series with that ID exists
LAW 7: getSeries(id) returns exactly what was stored (no transformation)
```

---

```
getAllSeries(): SeriesRow[]
```

**Postconditions**:
- Returns all series in store
- Order is unspecified (implementation-dependent)

**Properties**:
```
LAW 8: |getAllSeries()| = number of series created - number deleted
LAW 9: ∀s ∈ getAllSeries(): getSeries(s.id) = s
```

---

```
getSeriesByTag(tagName: string): SeriesRow[]
```

**Postconditions**:
- Returns all series that have the given tag

**Properties**:
```
LAW 10: s ∈ getSeriesByTag(t) ↔ t ∈ getTagsForSeries(s.id)
```

---

```
updateSeries(id: string, changes: Partial<SeriesRow>): void
```

**Preconditions**:
- Series with `id` exists
- `changes` doesn't include `id` (can't change primary key)
- Changed values are valid per schema

**Postconditions**:
- Only specified fields are updated
- Unspecified fields retain previous values
- `updated_at` is set to current time

**Properties**:
```
LAW 11: After updateSeries(id, {title: "X"}), getSeries(id).title = "X"
LAW 12: After updateSeries(id, {title: "X"}), getSeries(id).description unchanged
LAW 13: updateSeries on non-existent ID throws NotFoundError
```

---

```
deleteSeries(id: string): void
```

**Preconditions**:
- Series with `id` exists
- No completions reference this series (RESTRICT)
- No links have this series as parent (RESTRICT)

**Postconditions**:
- Series no longer exists
- Associated patterns, conditions, reminders, etc. also deleted (CASCADE)

**Properties**:
```
LAW 14: After deleteSeries(id), getSeries(id) = null
LAW 15: deleteSeries with completions throws ForeignKeyError
LAW 16: deleteSeries with child links throws ForeignKeyError
LAW 17: deleteSeries cascades to patterns: getPatternsBySeries(id) = []
```

---

### 2.3 Pattern Operations

```
createPattern(pattern: PatternRow): void
getPattern(id: string): PatternRow | null
getPatternsBySeries(seriesId: string): PatternRow[]
getAllPatterns(): PatternRow[]
updatePattern(id: string, changes: Partial<PatternRow>): void
deletePattern(id: string): void
```

**Analogous laws to Series operations.**

**Additional**:
```
LAW 18: Pattern's series_id must reference existing series
LAW 19: Pattern deletion cascades to pattern_weekday entries
LAW 20: Series deletion cascades to patterns
```

---

### 2.4 Pattern Weekday Operations

```
setPatternWeekdays(patternId: string, weekdays: Weekday[]): void
getPatternWeekdays(patternId: string): Weekday[]
getAllPatternWeekdays(): PatternWeekdayRow[]
```

**Properties**:
```
LAW 21: setPatternWeekdays replaces all existing weekdays for pattern
LAW 22: getPatternWeekdays returns exactly what was set
LAW 23: Pattern deletion cascades to weekdays
```

---

### 2.5 Condition Operations

```
createCondition(condition: ConditionRow): void
getCondition(id: string): ConditionRow | null
getConditionsBySeries(seriesId: string): ConditionRow[]
getAllConditions(): ConditionRow[]
updateCondition(id: string, changes: Partial<ConditionRow>): void
deleteCondition(id: string): void
```

**Tree structure properties**:
```
LAW 24: Root conditions have parent_id = null
LAW 25: Child conditions reference existing parent
LAW 26: Condition deletion cascades to children
LAW 27: No cycles in parent_id chain
LAW 28: getConditionsBySeries returns flat list; tree built via parent_id
```

---

### 2.6 Adaptive Duration Operations

```
setAdaptiveDuration(seriesId: string, config: AdaptiveDurationRow | null): void
getAdaptiveDuration(seriesId: string): AdaptiveDurationRow | null
getAllAdaptiveDurations(): AdaptiveDurationRow[]
```

**Properties**:
```
LAW 29: At most one adaptive duration config per series
LAW 30: setAdaptiveDuration(id, null) removes config
LAW 31: Series deletion cascades to adaptive duration
```

---

### 2.7 Cycling Operations

```
setCyclingConfig(seriesId: string, config: CyclingConfigRow | null): void
getCyclingConfig(seriesId: string): CyclingConfigRow | null
getAllCyclingConfigs(): CyclingConfigRow[]
updateCyclingIndex(seriesId: string, index: number): void

setCyclingItems(configId: string, items: CyclingItemRow[]): void
getCyclingItems(configId: string): CyclingItemRow[]
getAllCyclingItems(): CyclingItemRow[]
```

**Properties**:
```
LAW 32: At most one cycling config per series
LAW 33: setCyclingItems replaces all items
LAW 34: getCyclingItems returns items ordered by position
LAW 35: Config deletion cascades to items
LAW 36: Series deletion cascades to cycling config
```

---

### 2.8 Instance Exception Operations

```
createInstanceException(exception: InstanceExceptionRow): void
getInstanceException(seriesId: string, instanceDate: string): InstanceExceptionRow | null
getInstanceExceptionsBySeries(seriesId: string): InstanceExceptionRow[]
getInstanceExceptionsInRange(startDate: string, endDate: string): InstanceExceptionRow[]
deleteInstanceException(seriesId: string, instanceDate: string): void
```

**Properties**:
```
LAW 37: At most one exception per (seriesId, instanceDate)
LAW 38: Second exception for same key throws DuplicateKeyError or updates
LAW 39: Series deletion cascades to exceptions
```

---

### 2.9 Completion Operations

```
createCompletion(completion: CompletionRow): void
getCompletion(id: string): CompletionRow | null
getCompletionsBySeries(seriesId: string): CompletionRow[]
getCompletionByInstance(seriesId: string, instanceDate: string): CompletionRow | null
deleteCompletion(id: string): void
```

**Properties**:
```
LAW 40: Completion's series_id must reference existing series
LAW 41: Series deletion BLOCKED if completions exist (RESTRICT)
LAW 42: At most one completion per (seriesId, instanceDate)
```

---

### 2.10 Completion Query Operations

```
countCompletionsInWindow(target: Target, windowDays: number, asOfDate: string): number
getDaysSinceLastCompletion(target: Target, asOfDate: string): number | null
getRecentCompletionDurations(seriesId: string, mode: 'lastN' | 'windowDays', value: number): number[]
```

**Properties**:
```
LAW 43: countCompletionsInWindow counts completions in [asOfDate - windowDays + 1, asOfDate]
LAW 44: getDaysSinceLastCompletion returns null if no completions exist for target
LAW 45: getRecentCompletionDurations('lastN', n) returns up to n durations, most recent first
LAW 46: getRecentCompletionDurations('windowDays', d) returns durations from past d days
```

---

### 2.11 Tag Operations

```
createTag(name: string): string  // returns id
getTagByName(name: string): TagRow | null
getAllTags(): TagRow[]
deleteTag(id: string): void
addTagToSeries(seriesId: string, tagName: string): void
removeTagFromSeries(seriesId: string, tagName: string): void
getTagsForSeries(seriesId: string): string[]
getAllSeriesTags(): SeriesTagRow[]
```

**Properties**:
```
LAW 47: createTag returns existing ID if name already exists
LAW 48: addTagToSeries creates tag if it doesn't exist
LAW 49: Tag-series association is unique (no duplicates)
LAW 50: Series deletion cascades to tag associations
LAW 51: Tag deletion cascades to tag associations
```

---

### 2.12 Reminder Operations

```
createReminder(reminder: ReminderRow): void
getReminder(id: string): ReminderRow | null
getRemindersBySeries(seriesId: string): ReminderRow[]
getAllReminders(): ReminderRow[]
updateReminder(id: string, changes: Partial<ReminderRow>): void
deleteReminder(id: string): void
```

**Properties**:
```
LAW 52: Multiple reminders per series allowed
LAW 53: Series deletion cascades to reminders
```

---

### 2.13 Reminder Acknowledgment Operations

```
acknowledgeReminder(reminderId: string, instanceDate: string): void
isReminderAcknowledged(reminderId: string, instanceDate: string): boolean
getAcknowledgedRemindersInRange(startDate: string, endDate: string): ReminderAcknowledgmentRow[]
purgeOldAcknowledgments(olderThan: string): void
```

**Properties**:
```
LAW 54: After acknowledge, isReminderAcknowledged returns true
LAW 55: Re-acknowledging is idempotent
LAW 56: Reminder deletion cascades to acknowledgments
LAW 57: purgeOldAcknowledgments removes entries where acknowledged_at < olderThan
```

---

### 2.14 Relational Constraint Operations

```
createConstraint(constraint: RelationalConstraintRow): void
getConstraint(id: string): RelationalConstraintRow | null
getAllConstraints(): RelationalConstraintRow[]
deleteConstraint(id: string): void
```

**Properties**:
```
LAW 58: Constraints are independent of series (not cascade deleted)
LAW 59: Constraints reference targets by tag or seriesId (soft reference)
```

---

### 2.15 Link Operations

```
createLink(link: LinkRow): void
getLink(id: string): LinkRow | null
getLinkByChild(childSeriesId: string): LinkRow | null
getLinksByParent(parentSeriesId: string): LinkRow[]
getAllLinks(): LinkRow[]
updateLink(id: string, changes: Partial<LinkRow>): void
deleteLink(id: string): void
```

**Properties**:
```
LAW 60: At most one link per child series (child can only have one parent)
LAW 61: Parent can have multiple children
LAW 62: child_series_id ≠ parent_series_id (no self-links)
LAW 63: Child deletion cascades to link
LAW 64: Parent deletion BLOCKED if links exist (RESTRICT)
LAW 65: No cycles in link graph (A→B→C→A forbidden)
LAW 66: Link's parent_series_id must reference existing series (FK enforced)
LAW 67: Link's child_series_id must reference existing series (FK enforced)
LAW 68: Maximum chain depth is 32 levels (configurable)
```

---

## 3. Mock Implementation Requirements

### 3.1 Data Structures

```
MockStore = {
  series: Map<string, SeriesRow>
  patterns: Map<string, PatternRow>
  patternWeekdays: Map<string, Set<Weekday>>
  conditions: Map<string, ConditionRow>
  adaptiveDurations: Map<string, AdaptiveDurationRow>
  cyclingConfigs: Map<string, CyclingConfigRow>
  cyclingItems: Map<string, CyclingItemRow[]>
  instanceExceptions: Map<string, InstanceExceptionRow>  // key = seriesId:instanceDate
  completions: Map<string, CompletionRow>
  tags: Map<string, TagRow>
  seriesTags: Map<string, Set<string>>  // seriesId → tag names
  reminders: Map<string, ReminderRow>
  reminderAcks: Map<string, ReminderAcknowledgmentRow>  // key = reminderId:instanceDate
  constraints: Map<string, RelationalConstraintRow>
  links: Map<string, LinkRow>
}
```

### 3.2 Transaction Implementation

```
transaction<T>(fn: () → T): T {
  snapshot = deepClone(store)
  try {
    result = fn()
    return result
  } catch (e) {
    store = snapshot  // rollback
    throw e
  }
}
```

---

## 4. Invariants

```
INV 1: All foreign key relationships are satisfied
INV 2: All unique constraints are enforced
INV 3: All CHECK constraints from schema are enforced
INV 4: CASCADE deletes propagate correctly
INV 5: RESTRICT deletes throw correctly
INV 6: Timestamps are valid ISO strings
INV 7: No orphaned child records
```

---

## 5. Error Types

```
DuplicateKeyError: Attempt to insert with existing primary key
NotFoundError: Attempt to update/delete non-existent record
ForeignKeyError: RESTRICT violation on delete
InvalidDataError: Schema constraint violation
```

---

## 6. Verification Strategy

### 6.1 CRUD Round-trips

For each entity:
- Create → Get returns same data
- Update → Get returns updated data
- Delete → Get returns null

### 6.2 Cascade tests

- Delete series → verify all dependent entities deleted

### 6.3 Restrict tests

- Delete series with completions → verify error
- Delete parent series with links → verify error

### 6.4 Transaction tests

- Operation throws → verify rollback
- Nested transactions → verify behavior

---

## 7. Dependencies

- Segment 1: Time & Date Utilities (for timestamps)
