# Database Schema

Fully normalized. No JSON blobs. Proper foreign keys, indices, and integrity constraints.

**Unified model**: Everything is a Series. One-time events are series with `count=1` or `start_date=end_date`.

## Series
All calendar items — recurring or one-time.

```sql
CREATE TABLE series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,           -- ISO date
  end_date TEXT,                      -- ISO date, NULL = forever, same as start = one-time
  count INTEGER,                      -- alternative to end_date, 1 = one-time
  time_of_day TEXT,                   -- ISO time, NULL if all_day
  all_day INTEGER NOT NULL DEFAULT 0,
  duration INTEGER,                   -- minutes, NULL if all_day or adaptive
  fixed INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  wiggle_days_before INTEGER NOT NULL DEFAULT 0,
  wiggle_days_after INTEGER NOT NULL DEFAULT 0,
  wiggle_time_earliest TEXT,          -- ISO time
  wiggle_time_latest TEXT,            -- ISO time
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (end_date IS NULL OR count IS NULL)  -- can't have both
);
```

## AdaptiveDuration
Optional adaptive duration config per series.

```sql
CREATE TABLE adaptive_duration (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('lastN', 'windowDays')),
  value INTEGER NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1.0,
  minimum INTEGER,                    -- minutes
  maximum INTEGER,                    -- minutes
  fallback INTEGER NOT NULL           -- minutes
);
```

## CyclingConfig
Optional cycling config per series.

```sql
CREATE TABLE cycling_config (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('sequential', 'random')),
  gap_leap INTEGER NOT NULL DEFAULT 0,  -- boolean
  current_index INTEGER NOT NULL DEFAULT 0  -- tracks position (for gap_leap=true)
);
```

## CyclingItem
Items in a cycling config.

```sql
CREATE TABLE cycling_item (
  id TEXT PRIMARY KEY,
  cycling_config_id TEXT NOT NULL REFERENCES cycling_config(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  UNIQUE (cycling_config_id, position)
);
```

## Condition
Activation conditions. Tree structure for combinators (AND/OR/NOT).

```sql
CREATE TABLE condition (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES condition(id) ON DELETE CASCADE,  -- NULL = root
  type TEXT NOT NULL CHECK (type IN ('count', 'daysSince', 'and', 'or', 'not')),
  -- Leaf condition fields (NULL for combinators):
  operator TEXT CHECK (operator IN ('>=', '<=', '==', '>', '<', '!=')),
  value INTEGER,
  window_days INTEGER,                -- for 'count' type
  target_type TEXT CHECK (target_type IN ('tag', 'seriesId')),
  target_value TEXT
);

CREATE INDEX idx_condition_series ON condition(series_id);
CREATE INDEX idx_condition_parent ON condition(parent_id);
```

## Pattern
Recurrence patterns. Can be gated by conditions.

For one-time events: no patterns needed (or empty). The series just fires once on start_date.

```sql
CREATE TABLE pattern (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  condition_id TEXT REFERENCES condition(id) ON DELETE SET NULL,  -- NULL = always active
  is_exception INTEGER NOT NULL DEFAULT 0,  -- boolean: subtract from base
  type TEXT NOT NULL,
  -- Type-specific fields (nullable based on type):
  n INTEGER,                          -- everyNDays, everyNWeeks, nthWeekdayOfMonth, nthToLastWeekdayOfMonth
  day INTEGER,                        -- monthly, yearly (1-31)
  month INTEGER,                      -- yearly (1-12)
  weekday TEXT,                       -- everyNWeeks, nthWeekdayOfMonth, lastWeekdayOfMonth, nthToLastWeekdayOfMonth

  CHECK (type IN (
    'daily', 'everyNDays', 'weekly', 'everyNWeeks',
    'monthly', 'lastDayOfMonth', 'yearly',
    'weekdays', 'weekdaysOnly', 'weekendsOnly',
    'nthWeekdayOfMonth', 'lastWeekdayOfMonth', 'nthToLastWeekdayOfMonth'
  ))
);

CREATE INDEX idx_pattern_series ON pattern(series_id);
CREATE INDEX idx_pattern_condition ON pattern(condition_id);
```

## PatternWeekday
For 'weekdays' type patterns — which days of week.

```sql
CREATE TABLE pattern_weekday (
  pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
  weekday TEXT NOT NULL CHECK (weekday IN ('mon','tue','wed','thu','fri','sat','sun')),

  PRIMARY KEY (pattern_id, weekday)
);
```

## InstanceException
Cancelled or rescheduled instances. Keyed by series + date.

```sql
CREATE TABLE instance_exception (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  instance_date TEXT NOT NULL,        -- ISO date of the original occurrence
  type TEXT NOT NULL CHECK (type IN ('cancelled', 'rescheduled')),
  new_time TEXT,                      -- ISO datetime, for rescheduled only
  created_at TEXT NOT NULL,

  UNIQUE (series_id, instance_date)
);
```

## Completion
Historical completion records. Separate from series definitions.

```sql
CREATE TABLE completion (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
  instance_date TEXT NOT NULL,        -- ISO date of the instance
  date TEXT NOT NULL,                 -- ISO date when completed
  start_time TEXT NOT NULL,           -- ISO datetime actual start
  end_time TEXT NOT NULL,             -- ISO datetime actual end
  created_at TEXT NOT NULL
);

CREATE INDEX idx_completion_series ON completion(series_id);
CREATE INDEX idx_completion_date ON completion(date);
CREATE INDEX idx_completion_instance ON completion(series_id, instance_date);
```

## Tag
Tags for series.

```sql
CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE series_tag (
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,

  PRIMARY KEY (series_id, tag_id)
);
```

## Reminder
Reminder definitions.

```sql
CREATE TABLE reminder (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL,
  tag TEXT NOT NULL
);

CREATE INDEX idx_reminder_series ON reminder(series_id);
```

## ReminderAcknowledgment
Tracks acknowledged reminders. Entries older than 48 hours are periodically purged.
Fire times computed dynamically from schedule; this just tracks what's been acknowledged.

```sql
CREATE TABLE reminder_acknowledgment (
  reminder_id TEXT NOT NULL REFERENCES reminder(id) ON DELETE CASCADE,
  instance_date TEXT NOT NULL,        -- ISO date of the instance
  acknowledged_at TEXT NOT NULL,      -- ISO datetime

  PRIMARY KEY (reminder_id, instance_date)
);

CREATE INDEX idx_reminder_ack_time ON reminder_acknowledgment(acknowledged_at);
```

## RelationalConstraint
Constraints between series (day-level and intra-day).

```sql
CREATE TABLE relational_constraint (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'mustBeOnSameDay', 'cantBeOnSameDay',
    'mustBeNextTo', 'cantBeNextTo',
    'mustBeBefore', 'mustBeAfter',
    'mustBeWithin'
  )),
  source_type TEXT NOT NULL CHECK (source_type IN ('tag', 'seriesId')),
  source_value TEXT NOT NULL,
  dest_type TEXT NOT NULL CHECK (dest_type IN ('tag', 'seriesId')),
  dest_value TEXT NOT NULL,
  within_minutes INTEGER              -- for 'mustBeWithin' only
);
```

## Link
Parent-child chain relationships between series.

```sql
CREATE TABLE link (
  id TEXT PRIMARY KEY,
  child_series_id TEXT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
  parent_series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
  target_distance INTEGER NOT NULL,   -- minutes after parent ends
  early_wobble INTEGER NOT NULL,      -- minutes, can be 0
  late_wobble INTEGER NOT NULL,       -- minutes

  CHECK (child_series_id != parent_series_id)  -- can't link to self
);

CREATE INDEX idx_link_parent ON link(parent_series_id);
```

---

## Deletion Behavior Summary

| Table | On Parent Delete | Rationale |
|-------|------------------|-----------|
| adaptive_duration | CASCADE | Config meaningless without series |
| cycling_config | CASCADE | Config meaningless without series |
| cycling_item | CASCADE | Items meaningless without config |
| condition | CASCADE | Conditions meaningless without series |
| pattern | CASCADE | Patterns meaningless without series |
| pattern_weekday | CASCADE | Weekdays meaningless without pattern |
| instance_exception | CASCADE | Exceptions meaningless without series |
| completion | RESTRICT | Preserve historical data; must explicitly delete |
| series_tag | CASCADE | Tag association meaningless without series |
| reminder | CASCADE | Reminders meaningless without series |
| reminder_acknowledgment | CASCADE | Acks meaningless without reminder |
| link (child) | CASCADE | Link removed if child deleted |
| link (parent) | RESTRICT | Can't delete parent with linked children |
