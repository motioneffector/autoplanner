# Type Shapes

All object shapes for the autoplanner system.

## Time Types

```typescript
// ISO 8601 strings - portable, SQLite-friendly
type LocalDate = string      // "2024-03-15"
type LocalTime = string      // "14:30" or "14:30:00"
type LocalDateTime = string  // "2024-03-15T14:30:00"
type Duration = number       // minutes
```

## Pattern Shapes

```typescript
type Pattern =
  // Interval-based
  | { type: 'daily' }
  | { type: 'everyNDays', n: number }
  | { type: 'weekly' }
  | { type: 'everyNWeeks', n: number, weekday?: Weekday }  // weekday optional, defaults to start date's day
  | { type: 'monthly', day: number }                       // 15th of every month
  | { type: 'lastDayOfMonth' }
  | { type: 'yearly', month: number, day: number }

  // Weekday-based
  | { type: 'weekdays', days: Weekday[] }                  // ['mon', 'wed', 'fri']
  | { type: 'weekdaysOnly' }                               // mon-fri
  | { type: 'weekendsOnly' }                               // sat-sun

  // Position-based
  | { type: 'nthWeekdayOfMonth', n: number, weekday: Weekday }      // 2nd Thursday
  | { type: 'lastWeekdayOfMonth', weekday: Weekday }                // last Friday
  | { type: 'nthToLastWeekdayOfMonth', n: number, weekday: Weekday } // 2nd-to-last Friday

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
```

## Wiggle Config

```typescript
type WiggleConfig = {
  // Day flexibility
  daysBefore?: number    // can shift N days earlier (default 0)
  daysAfter?: number     // can shift N days later (default 0)

  // Time flexibility (within a day)
  timeWindow?: {
    earliest: LocalTime  // e.g., "06:00"
    latest: LocalTime    // e.g., "23:00"
  }
  // If no timeWindow, uses the series's exact timeOfDay
}
```

Examples:
- Fixed day, flexible time: `{ timeWindow: { earliest: "18:00", latest: "23:00" } }`
- Flexible day, fixed time: `{ daysBefore: 2, daysAfter: 3 }`
- Fully flexible: `{ daysBefore: 1, daysAfter: 2, timeWindow: { earliest: "09:00", latest: "17:00" } }`

## Adaptive Duration Config

```typescript
type AdaptiveDuration = {
  mode: 'lastN' | 'windowDays'
  value: number              // last N completions, or past N days
  multiplier?: number        // default 1.0, e.g., 1.25 for padding
  minimum?: Duration         // floor in minutes
  maximum?: Duration         // ceiling in minutes
  fallback: Duration         // used when no history exists
}
```

Examples:
- Avg of last 10 completions × 1.25: `{ mode: 'lastN', value: 10, multiplier: 1.25, fallback: 30 }`
- Avg of past 90 days: `{ mode: 'windowDays', value: 90, fallback: 60 }`

## Cycling Config

```typescript
type CyclingConfig = {
  items: CyclingItem[]
  mode: 'sequential' | 'random'
  gapLeap: boolean           // true = skips don't break sequence
}

type CyclingItem = {
  title: string
  description?: string
}
```

Examples:
- A/B workouts: `{ items: [{ title: "Workout A" }, { title: "Workout B" }], mode: 'sequential', gapLeap: true }`
- Rotating chores: `{ items: [{ title: "Clean gutters" }, { title: "Check filters" }, { title: "Trim hedges" }], mode: 'sequential', gapLeap: false }`

## Reminder Shape

```typescript
type Reminder = {
  minutes: number    // before event
  tag: string        // consumer-defined identifier
}
```

## Conflict Shape

```typescript
type Conflict = {
  type: 'overlap' | 'constraintViolation' | 'chainCannotFit' | 'noValidSlot'
  severity: 'warning' | 'error'   // warning = best-effort applied, error = couldn't resolve
  involvedSeries: SeriesId[]
  instanceDates?: LocalDate[]     // if specific instances
  description: string
  date: LocalDate
}
```

Examples:
- Two fixed items overlap: `{ type: 'overlap', severity: 'warning', ... }`
- "Must be before" constraint impossible: `{ type: 'constraintViolation', severity: 'error', ... }`
- Linked chain can't fit in day: `{ type: 'chainCannotFit', severity: 'error', ... }`
- No slot exists in wiggle range: `{ type: 'noValidSlot', severity: 'warning', ... }` (placed at ideal anyway)

## Link Config

```typescript
type LinkConfig = {
  parentId: SeriesId
  targetDistance: Duration      // minutes after parent ends
  earlyWobble: Duration         // can be 0
  lateWobble: Duration
}
```
