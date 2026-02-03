# Adapter Interface

The adapter implements domain methods. Consumer provides implementation wrapping their SQL driver (bun:sqlite, better-sqlite3, etc.).

**Unified model**: Everything is a Series. No separate Entry concept.

**Note:** This is a synchronous interface. bun:sqlite and better-sqlite3 are sync. Async databases would need a different adapter interface.

**Note:** Deletion restrictions (RESTRICT) are enforced at the DB level via foreign key constraints, not in adapter logic.

```typescript
interface AutoplannerAdapter {
  // === Transactions ===
  // Execute fn in transaction, rollback on error
  // Sync only — matches bun:sqlite and better-sqlite3
  transaction<T>(fn: () => T): T

  // === Series ===
  createSeries(series: SeriesRow): void
  getSeries(id: string): SeriesRow | null
  getAllSeries(): SeriesRow[]
  getSeriesByTag(tagName: string): SeriesRow[]
  updateSeries(id: string, changes: Partial<SeriesRow>): void
  deleteSeries(id: string): void  // DB throws if completions exist or has linked children (RESTRICT)

  // === Pattern ===
  createPattern(pattern: PatternRow): void
  getPattern(id: string): PatternRow | null
  getPatternsBySeries(seriesId: string): PatternRow[]
  getAllPatterns(): PatternRow[]
  updatePattern(id: string, changes: Partial<PatternRow>): void
  deletePattern(id: string): void

  // === PatternWeekday ===
  setPatternWeekdays(patternId: string, weekdays: Weekday[]): void  // replaces all
  getPatternWeekdays(patternId: string): Weekday[]
  getAllPatternWeekdays(): PatternWeekdayRow[]  // for bulk loading

  // === Condition ===
  createCondition(condition: ConditionRow): void
  getCondition(id: string): ConditionRow | null
  getConditionsBySeries(seriesId: string): ConditionRow[]  // flat list, use parent_id to build tree
  getAllConditions(): ConditionRow[]
  updateCondition(id: string, changes: Partial<ConditionRow>): void
  deleteCondition(id: string): void  // cascades to children

  // === AdaptiveDuration ===
  setAdaptiveDuration(seriesId: string, config: AdaptiveDurationRow | null): void  // null removes
  getAdaptiveDuration(seriesId: string): AdaptiveDurationRow | null
  getAllAdaptiveDurations(): AdaptiveDurationRow[]

  // === CyclingConfig ===
  setCyclingConfig(seriesId: string, config: CyclingConfigRow | null): void  // null removes
  getCyclingConfig(seriesId: string): CyclingConfigRow | null
  getAllCyclingConfigs(): CyclingConfigRow[]
  updateCyclingIndex(seriesId: string, index: number): void

  // === CyclingItem ===
  setCyclingItems(configId: string, items: CyclingItemRow[]): void  // replaces all
  getCyclingItems(configId: string): CyclingItemRow[]  // ordered by position
  getAllCyclingItems(): CyclingItemRow[]

  // === InstanceException ===
  createInstanceException(exception: InstanceExceptionRow): void
  getInstanceException(seriesId: string, instanceDate: string): InstanceExceptionRow | null
  getInstanceExceptionsBySeries(seriesId: string): InstanceExceptionRow[]
  getInstanceExceptionsInRange(startDate: string, endDate: string): InstanceExceptionRow[]
  deleteInstanceException(seriesId: string, instanceDate: string): void

  // === Completion ===
  createCompletion(completion: CompletionRow): void
  getCompletion(id: string): CompletionRow | null
  getCompletionsBySeries(seriesId: string): CompletionRow[]
  getCompletionByInstance(seriesId: string, instanceDate: string): CompletionRow | null
  deleteCompletion(id: string): void

  // Condition evaluation:
  countCompletionsInWindow(target: Target, windowDays: number, asOfDate: string): number
  getDaysSinceLastCompletion(target: Target, asOfDate: string): number | null  // null = never

  // Adaptive duration:
  getRecentCompletionDurations(seriesId: string, mode: 'lastN' | 'windowDays', value: number): number[]

  // === Tag ===
  createTag(name: string): string  // returns id, or existing id if name exists
  getTagByName(name: string): TagRow | null
  getAllTags(): TagRow[]
  deleteTag(id: string): void
  addTagToSeries(seriesId: string, tagName: string): void
  removeTagFromSeries(seriesId: string, tagName: string): void
  getTagsForSeries(seriesId: string): string[]  // tag names
  getAllSeriesTags(): SeriesTagRow[]  // for bulk loading

  // === Reminder ===
  createReminder(reminder: ReminderRow): void
  getReminder(id: string): ReminderRow | null
  getRemindersBySeries(seriesId: string): ReminderRow[]
  getAllReminders(): ReminderRow[]
  updateReminder(id: string, changes: Partial<ReminderRow>): void
  deleteReminder(id: string): void

  // === ReminderAcknowledgment ===
  acknowledgeReminder(reminderId: string, instanceDate: string): void
  isReminderAcknowledged(reminderId: string, instanceDate: string): boolean
  getAcknowledgedRemindersInRange(startDate: string, endDate: string): ReminderAcknowledgmentRow[]
  purgeOldAcknowledgments(olderThan: string): void  // ISO datetime

  // === RelationalConstraint ===
  createConstraint(constraint: RelationalConstraintRow): void
  getConstraint(id: string): RelationalConstraintRow | null
  getAllConstraints(): RelationalConstraintRow[]
  deleteConstraint(id: string): void

  // === Link ===
  createLink(link: LinkRow): void
  getLink(id: string): LinkRow | null
  getLinkByChild(childSeriesId: string): LinkRow | null
  getLinksByParent(parentSeriesId: string): LinkRow[]
  getAllLinks(): LinkRow[]
  updateLink(id: string, changes: Partial<LinkRow>): void
  deleteLink(id: string): void
}
```

---

## Row Types

```typescript
interface SeriesRow {
  id: string
  title: string
  description: string | null
  start_date: string  // ISO date
  end_date: string | null  // ISO date
  count: number | null
  time_of_day: string | null  // ISO time
  all_day: number  // 0 or 1
  duration: number | null  // minutes
  fixed: number  // 0 or 1
  locked: number  // 0 or 1
  wiggle_days_before: number
  wiggle_days_after: number
  wiggle_time_earliest: string | null  // ISO time
  wiggle_time_latest: string | null  // ISO time
  created_at: string
  updated_at: string
}

interface PatternRow {
  id: string
  series_id: string
  condition_id: string | null
  is_exception: number  // 0 or 1
  type: string
  n: number | null
  day: number | null
  month: number | null
  weekday: string | null
}

interface PatternWeekdayRow {
  pattern_id: string
  weekday: string
}

interface ConditionRow {
  id: string
  series_id: string
  parent_id: string | null
  type: string  // 'count' | 'daysSince' | 'and' | 'or' | 'not'
  operator: string | null
  value: number | null
  window_days: number | null
  target_type: string | null  // 'tag' | 'seriesId'
  target_value: string | null
}

interface AdaptiveDurationRow {
  id: string
  series_id: string
  mode: string  // 'lastN' | 'windowDays'
  value: number
  multiplier: number
  minimum: number | null
  maximum: number | null
  fallback: number
}

interface CyclingConfigRow {
  id: string
  series_id: string
  mode: string  // 'sequential' | 'random'
  gap_leap: number  // 0 or 1
  current_index: number
}

interface CyclingItemRow {
  id: string
  cycling_config_id: string
  position: number
  title: string
  description: string | null
}

interface InstanceExceptionRow {
  id: string
  series_id: string
  instance_date: string  // ISO date
  type: string  // 'cancelled' | 'rescheduled'
  new_time: string | null  // ISO datetime
  created_at: string
}

interface CompletionRow {
  id: string
  series_id: string
  instance_date: string  // ISO date
  date: string  // ISO date when completed
  start_time: string  // ISO datetime
  end_time: string  // ISO datetime
  created_at: string
}

interface TagRow {
  id: string
  name: string
}

interface SeriesTagRow {
  series_id: string
  tag_id: string
}

interface ReminderRow {
  id: string
  series_id: string
  minutes_before: number
  tag: string
}

interface ReminderAcknowledgmentRow {
  reminder_id: string
  instance_date: string
  acknowledged_at: string
}

interface RelationalConstraintRow {
  id: string
  type: string
  source_type: string  // 'tag' | 'seriesId'
  source_value: string
  dest_type: string  // 'tag' | 'seriesId'
  dest_value: string
  within_minutes: number | null
}

interface LinkRow {
  id: string
  child_series_id: string
  parent_series_id: string
  target_distance: number  // minutes
  early_wobble: number  // minutes
  late_wobble: number  // minutes
}

type Target = { tag: string } | { seriesId: string }
type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
```
