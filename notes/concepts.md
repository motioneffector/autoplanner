# Autoplanner Core Concepts

## State-Based Scheduling
Not just "do X on Y days" - schedule depends on current state derived from history.

### Exercise Example States:
1. **Deconditioned**: < 7 walks in past 14 days
   - Only exercise: 1 walk every other day
2. **Conditioning**: 7+ walks in 14 days, building up
   - Walks daily
   - Weight training unlocks: A/B alternating on Mon/Fri
3. **Conditioned**: 4+ weight sessions in past 14 days
   - Weights move to MWF (3x/week), still A/B alternating
4. **Regression**: 7 days with no completions tagged 'workout' → back to Deconditioned

## Conditional Recurrence
Rules activate based on conditions:
- Historical completion counts ("7 completions of tag X in 14 days")
- Days since last completion ("no completions of X in 7 days")
- State transitions trigger pattern changes

## Sequenced/Alternating Items
- Weight A/B days maintain sequence across skips
- Always starts with A after deconditioned break
- If you skip a day, next scheduled is still the correct next letter

## Manual Overrides Affect Future
- Logging extra walks on off-days speeds up reconditioning
- History drives state, manual entries count

## Fixed vs Flexible Items

### Fixed Time Items
- Have specific times of day (e.g., workouts at set times)
- Anchors that flexible items flow around

### Flexible Items with Constraints
- **Day patterns**: daily, specific weekdays, 2nd Thursday, 1st of month, every 5th Wednesday
- **Wiggle room**: can shift N days from ideal to balance workload
- **Time windows**: must be on Friday, but can be 6pm-11pm
- **Day-locked but time-flexible**: must be that day, anywhere in day or within window

## Completion Time Tracking
- Record actual start/end times of activities
- Optional per-task: future scheduling uses historical data
- Example: schedule = avg(past year completions) × 1.25
- Allows reservations to adapt to actual duration

## Duration Model
- **Adaptive length tracking** (optional per series):
  - When enabled: duration = average of past X completions OR past X calendar time (configurable)
  - Silently overrides any manually set end time
- **Manual duration**: If adaptive not enabled, duration is mandatory
- **All Day**: Valid option - instance exists as a day banner (like Outlook), no specific time slot
  - Library marks it as all-day, consumer handles UI representation

## Series Bounds
- **Start date**: Required for all series
- **End date**: Optional
  - If omitted: repeats forever
  - If set: series terminates after that date
- Could also support "repeat N times" as alternative end condition

## Tags
- Series can have arbitrary tags (string array)
- Used for filtering, grouping, conditional logic
- Consumer defines tag semantics
- Single calendar, tags provide differentiation

## Complex Recurrence Exceptions
- "Every day except every second Thursday" (hole for biweekly meeting)
- Composable patterns with exclusions

## Workload Balancing
- Flexible items reflow to balance load over time
- Wiggle room allows spreading out clustered tasks

## Cycling Series
A single recurring series that rotates through multiple titles/descriptions:
- Cycle in order or randomly

### gap_leap behavior:
- **gap_leap = false**: Cycling tied to scheduled instance sequence. Instance 1 = item 1, instance 2 = item 2, etc. Deterministic from instance position, regardless of completions.
- **gap_leap = true**: Cycling advances only on completion. If instance 2 is not completed, instance 3 gets item 2 (next item after last completed). Tracks position via `current_index`.

### Use cases:
- A/B workouts with gap_leap=true: always the correct next workout regardless of skips
- Rotating chores with gap_leap=false: each scheduled instance has its predetermined task
- Domain-agnostic: just a set of strings that rotate, library doesn't know what they mean

## Reminders (Tagged Array)
Each series can have multiple reminders, each with:
- **minutes**: time before event
- **tag**: string identifier for the reminder type

Example:
```
[
  { minutes: 30, tag: "30min_check" },
  { minutes: 10, tag: "urgent" },
  { minutes: 5, tag: "urgent" }
]
```

Library responsibilities:
- Store reminder definitions per series
- Track which reminders have fired / been acknowledged
- Return list of pending/unread reminder notifications

Consumer responsibilities:
- Decide what each tag means
- Map tags to functions/behaviors
- Library doesn't care what "urgent" does

## Instance vs Series Operations

### Single Instance Operations
- **Cancel instance**: Skip one occurrence without affecting the recurrence rule
  - "Skip this Tuesday's meeting" - rule continues, this one is marked cancelled
- **Reschedule instance**: Move one occurrence to different time/day
  - "Move this Friday's task to Saturday" - just this one, rule unchanged

### Series Splitting
- End a recurring sequence at a point in time
- Create a new sequence with modified parameters going forward
- Use case: "Starting next month, this moves from 3pm to 4pm"
- Old rule terminates, new rule begins
- Preserves history attached to old rule

## Series Lock Toggle
- Boolean lock on series definitions
- NOT on instance exceptions
- When locked: parameter edits rejected, must unlock first
- Does NOT affect scheduling behavior:
  - Flexible items still reflow
  - Conditions still evaluate
  - Everything runs normally
- Purely edit protection - the floppy disk write-protect tab
- Prevents accidental changes to carefully tuned rules

## Linked/Chained Series
Parent-child relationships between series with configurable time constraints.

### Configuration per link:
- **Target distance**: Time offset from parent (e.g., 80 minutes after parent ends)
- **Early wobble**: How much earlier than target it can shift (can be 0)
- **Late wobble**: How much later than target it can shift

### Behavior:
- Child scheduling is relative to parent
- Once parent marked complete with actual time, child's target updates dynamically
- Children can have children → chains of arbitrary depth

### Laundry example:
```
Load washer (14 min)
  └→ Transfer to dryer
      - target: 80min after parent ends
      - early wobble: 0 (can't move clothes that aren't washed)
      - late wobble: 10min (musty if left too long)
      └→ Unload & fold
          - target: 200min after parent ends
          - early wobble: 5min (dryer sometimes finishes early)
          - late wobble: 120min (clothes in dryer is tolerable)
```

### Use cases (domain-agnostic):
- Multi-step processes with timing dependencies
- Manufacturing sequences
- Cooking/meal prep
- Any workflow where steps must follow in sequence with time constraints

## Relational Constraints
Rules about how instances relate to each other on the schedule, defined by referencing tags or series IDs.

### Day-level constraints (evaluated first):
- **Must be on same day as** / **Can't be on same day as**
- If instances aren't on the same day, intra-day constraints don't apply

### Intra-day constraints (within a single day):
- **Can't be next to** / **Must be next to**
- **Must be before** / **Must be after**
- **Must be within X mins of**
- Only relevant when instances land on the same day

### Targeting:
- Reference by **tag**: "instances of series tagged 'heavy-lifting' can't be next to each other"
- Reference by **series ID**: "instances of series ABC must be before instances of series XYZ"
- Constraints defined at series level, evaluated against instances on the schedule

## ID Model
- **Series ID**: Unique identifier for each series (UUID)
- **Instance identification**: `(series_id, instance_date)` — no separate instance ID
- One-time events are just series with a single instance
- Relational constraints target series IDs
- Instance operations use series ID + instance date

## Conflict Resolution

### Hierarchy:
1. **Truly fixed items**: No wobble, no flexibility. Doctor's appointments, work meetings.
   - NEVER move under any condition
   - Consumer is the only one who can change them
   - Overlaps allowed as last resort — library won't sacrifice fixed items to avoid overlap

2. **Flexible items**: Have wobble room, time windows, day flexibility
   - Push each other aside to get closest to ideal placement
   - Best-effort when true best isn't possible
   - Respect relational constraints while reflowing

### Strategy:
- Fixed items are immovable anchors
- Flexible items flow around them and each other
- When constraints conflict, get as close as possible to ideal
- Overlaps only happen when fixed items collide (library warns but allows)

### Exception: Linked chains
- Linked chains (parent-child relationships) have **hard distance bounds**
- They can wobble within their configured early/late limits, but NEVER beyond
- Not best-effort — these are inviolable constraints
- If a chain can't fit within its bounds, that's a conflict (warn/overlap), don't stretch the chain
