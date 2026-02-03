# Testing Plan

Red-first TDD. Write failing tests, then implement to pass.

## Segments (Ordered by Dependency)

### Segment 1: Time & Date Utilities
**Depends on:** Nothing

Foundation for everything else. Pure functions.

**Test cases:**
- Parse/format ISO dates, times, datetimes
- Date arithmetic (add days, add minutes)
- Day-of-week calculations
- Month length handling (28/29/30/31)
- Leap year detection
- DST-safe operations
- Timezone conversion (UTC ↔ local)

---

### Segment 2: Pattern Expansion
**Depends on:** Segment 1

Pure functions. Given pattern + date range → list of dates.

**Test cases by pattern type:**

*Interval-based:*
- `daily` - every day in range
- `everyNDays` - every 2nd, 3rd, etc. day
- `weekly` - same weekday each week
- `everyNWeeks` - every N weeks on specified weekday
- `monthly` - same date each month
- `lastDayOfMonth` - 28/29/30/31 as appropriate
- `yearly` - same date each year

*Weekday-based:*
- `weekdays` - specific days (Mon/Wed/Fri, etc.)
- `weekdaysOnly` - Mon-Fri
- `weekendsOnly` - Sat-Sun

*Position-based:*
- `nthWeekdayOfMonth` - 2nd Thursday, etc.
- `lastWeekdayOfMonth` - last Friday, etc.
- `nthToLastWeekdayOfMonth` - 2nd-to-last Friday

**Edge cases:**
- Pattern starting mid-week/mid-month
- Leap years (Feb 29)
- Month boundaries (31st skipped in short months)
- Year boundaries
- Patterns with count limit
- Patterns with end date
- Pattern unions (multiple patterns per series)
- Exception patterns (subtract from base)

---

### Segment 3: Condition Evaluation
**Depends on:** Segment 1

Pure functions. Given condition + completion data → boolean.

**Test cases:**

*count:*
- Exact counts (==, !=)
- Thresholds (>=, <=, >, <)
- Different window sizes
- No completions in window → count = 0
- Completions exactly on window boundary

*daysSince:*
- Never completed → null handling
- Completed today → 0 days
- Boundary conditions

*Combinators:*
- `and` - all must be true
- `or` - at least one true
- `not` - inversion
- Nested combinators (and inside or, etc.)
- Empty condition arrays

*Targeting:*
- By tag (completions with that tag)
- By series ID (specific series)

---

### Segment 4: Adapter (In-Memory Mock)
**Depends on:** Nothing (just types)

Mock adapter for testing. Implements full interface in memory.

**Test cases:**
- All CRUD operations return correct data
- All query methods filter correctly
- Transaction rollback on error
- Bulk getters return complete data
- Deletion restrictions enforced (RESTRICT behavior)

---

### Segment 5: Series CRUD & Tags
**Depends on:** Segment 4

Basic operations through the adapter.

**Test cases:**
- Create series (one-time: count=1)
- Create series (recurring: with patterns)
- Read series by ID
- Read series by tag
- Update series fields
- Delete series (no completions)
- Delete series blocked by completions
- Lock prevents edits
- Unlock allows edits
- Add/remove tags
- Query by tag

---

### Segment 6: Completions
**Depends on:** Segments 4, 5

Recording and querying the past.

**Test cases:**
- Log completion with actual times
- Query completions by series
- Query completions by tag
- Query completions in time window
- Delete completion
- Count completions in window (for conditions)
- Days since last completion (for conditions)
- Completion durations (for adaptive)

---

### Segment 7: Cycling
**Depends on:** Segments 5, 6

Title/description rotation.

**Test cases:**

*Sequential mode:*
- Items rotate in order
- Wraps around at end
- Position correct for arbitrary instance number

*Random mode:*
- Returns valid item
- (Statistical test: all items appear over many calls)

*gap_leap = false:*
- Instance N always gets item (N mod length)
- Completions don't affect sequence
- Deterministic across calls

*gap_leap = true:*
- Advances only on completion
- current_index starts at 0
- Skipped instances don't advance
- current_index wraps correctly

---

### Segment 8: Adaptive Duration
**Depends on:** Segment 6

Duration calculation from completion history.

**Test cases:**

*lastN mode:*
- Average of last N completions
- Less than N completions → use what exists
- Zero completions → fallback
- Multiplier applied correctly
- Minimum bound respected
- Maximum bound respected

*windowDays mode:*
- Average of completions in window
- No completions in window → fallback
- Multiplier, min, max applied

---

### Segment 9: Instance Exceptions
**Depends on:** Segments 2, 5

Cancel and reschedule individual instances.

**Test cases:**
- Cancel instance removes from schedule
- Cancelled instance not in getSchedule result
- Series continues after cancelled instance
- Reschedule instance to new time
- Rescheduled instance appears at new time
- Original slot freed after reschedule
- Exception stored and retrievable
- Pattern expansion respects exceptions
- Delete exception restores instance

---

### Segment 10: Reminders
**Depends on:** Segment 5

Reminder definitions and acknowledgments.

**Test cases:**
- Create reminder on series
- Multiple reminders per series
- Fire time = instance time - minutes_before
- Query pending reminders (unacknowledged)
- Acknowledge reminder
- Acknowledged reminder not in pending
- Purge removes old acknowledgments
- Reminders for cancelled instances not pending

---

### Segment 11: Links (Chains)
**Depends on:** Segment 5

Parent-child relationships between series.

**Test cases:**
- Create link
- Query link by child
- Query links by parent
- Delete link
- Update link distances
- Validate no self-links (child = parent)
- Validate no circular chains
- Delete child cascades link
- Delete parent blocked (RESTRICT)
- Unlink before deleting parent

---

### Segment 12: Relational Constraints
**Depends on:** Segment 5

Constraint definitions.

**Test cases:**
- Create each constraint type
- Delete constraint
- Query all constraints
- Target by tag
- Target by series ID
- withinMinutes stored for mustBeWithin

---

### Segment 13: Reflow Algorithm
**Depends on:** Segments 2, 3, 9, 11, 12

The core scheduler. CSP with backtracking.

**Test cases:**

*Domain computation:*
- Fixed items: domain = single slot
- Flexible items: domain = all valid slots in wiggle range
- All-day items: excluded from reflow

*Basic placement:*
- Fixed items placed exactly
- Flexible items at ideal when no conflicts
- Flexible items shifted when conflicts exist

*Constraint satisfaction:*
- `mustBeOnSameDay` - both on same day
- `cantBeOnSameDay` - on different days
- `mustBeBefore` - A before B
- `mustBeAfter` - A after B
- `mustBeNextTo` - adjacent, no gap
- `cantBeNextTo` - gap between
- `mustBeWithin` - within N minutes

*Chain handling:*
- Child within distance bounds of parent
- Early wobble respected
- Late wobble respected
- Chain of depth 3+
- Parent completion updates child target
- Chain can't fit → conflict

*Conflict detection:*
- Fixed-fixed overlap → warning, both placed
- No valid slot → warning, placed at ideal
- Chain exceeds bounds → error
- Constraint violation → error

*Soundness:*
- Valid arrangement exists → found
- Backtracking explores alternatives
- Constraint propagation prunes correctly
- No false negatives (missing valid solutions)

*Workload balancing:*
- Day wiggle prefers less loaded days
- Even distribution over multiple days

---

### Segment 14: Public API
**Depends on:** All above

Thin wrapper tying everything together.

**Test cases:**
- `createAutoplanner()` initializes correctly
- All public methods callable
- Timezone conversion at API boundary
- Local time in → UTC stored → local time out
- Event hooks fire on changes
- Errors propagate correctly

---

### Segment 15: SQLite Adapter
**Depends on:** Segment 4 (same interface)

Real adapter implementation. Must pass all Segment 4 tests.

**Additional test cases:**
- Schema created correctly
- Foreign keys enforced
- Indices exist
- RESTRICT deletion behavior
- CASCADE deletion behavior
- Transaction atomicity
- Concurrent access (if applicable)

---

### Segment 16: Integration Tests
**Depends on:** All above

Full scenarios end-to-end.

**Scenarios:**

*Exercise regimen:*
- Start deconditioned (< 7 walks in 14 days)
- Schedule shows walks every other day
- Log 7 walks → transition to conditioning
- Schedule shows daily walks + weights Mon/Fri
- Log 4 weight sessions → transition to conditioned
- Schedule shows weights MWF
- Stop logging → regress to deconditioned
- Verify cycling (A/B workouts) maintains sequence

*Laundry chain:*
- Create wash → dry → fold chain
- Schedule shows all three with correct distances
- Complete wash with actual end time
- Child times update based on actual
- Verify bounds enforced

*Conflict scenarios:*
- Two fixed items at same time → warning, both shown
- Impossible constraint → error flagged
- Chain can't fit in day → error flagged
- Verify best-effort placement

*Large data:*
- 100+ series
- 1 year date range
- Performance acceptable

---

## Implementation Order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

Each segment: write failing tests first, then implement to pass.
