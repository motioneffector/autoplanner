# Segment 16: Integration Tests — Formal Specification

## 1. Overview

Integration tests verify the complete system works correctly end-to-end. These are scenario-based tests that exercise multiple components together.

---

## 2. Exercise Regimen Scenario

### 2.1 Setup

```
Series:
- "Walk" (tag: 'walk', 'workout')
  - Pattern: everyNDays(2) when deconditioned
  - Pattern: daily when conditioning
  - fixed: true, timeOfDay: "07:00", duration: 30

- "Weight Training" (tag: 'weights', 'workout')
  - Pattern: weekdays(['mon', 'fri']) when conditioning
  - Pattern: weekdays(['mon', 'wed', 'fri']) when conditioned
  - fixed: true, timeOfDay: "08:00", duration: 45
  - cycling: { items: ["Workout A", "Workout B"], mode: 'sequential', gapLeap: true }

Conditions:
- deconditioned: count(tag:'walk') < 7 in 14 days
- conditioning: count(tag:'walk') >= 7 in 14 days AND count(tag:'weights') < 4 in 14 days
- conditioned: count(tag:'weights') >= 4 in 14 days
```

### 2.2 Test Sequence

```
STATE 1: Deconditioned (start)
  VERIFY: Schedule shows walks every other day
  VERIFY: No weight training scheduled
  VERIFY: Walk title is "Walk"

ACTION: Log 7 walks over 14 days

STATE 2: Conditioning
  VERIFY: Schedule shows daily walks
  VERIFY: Weight training on Mon/Fri
  VERIFY: First weight training is "Workout A"

ACTION: Complete weight training (advances cycling)

STATE 3: Still Conditioning
  VERIFY: Next weight training is "Workout B"

ACTION: Log 4 weight sessions over 14 days

STATE 4: Conditioned
  VERIFY: Weight training on Mon/Wed/Fri
  VERIFY: Cycling continues correctly

ACTION: Stop logging for 7 days

STATE 5: Regression to Deconditioned
  VERIFY: daysSince('workout') >= 7 triggers regression
  VERIFY: Back to walks every other day
  VERIFY: Cycling resets (optional based on config)
```

### 2.3 Properties to Verify

```
PROP 1: State transitions happen at correct thresholds
PROP 2: Cycling A/B maintains sequence across skips
PROP 3: Conditions re-evaluate after each completion
PROP 4: Schedule reflects current state immediately
PROP 5: Cycling does NOT auto-reset on pattern deactivation/reactivation
```

---

## 3. Laundry Chain Scenario

### 3.1 Setup

```
Series:
- "Load Washer" (parent)
  - Pattern: weekly (Saturday)
  - fixed: true, timeOfDay: "09:00", duration: 14

- "Transfer to Dryer" (child of Load Washer)
  - link: { targetDistance: 80, earlyWobble: 0, lateWobble: 10 }
  - duration: 5

- "Unload & Fold" (child of Transfer)
  - link: { targetDistance: 200, earlyWobble: 5, lateWobble: 120 }
  - duration: 20
```

### 3.2 Test Sequence

```
STATE 1: Initial Schedule
  VERIFY: Load Washer at 09:00
  VERIFY: Transfer at 10:20 (09:00 + 14 + 80 = 10:34 target, adjusted)
  VERIFY: Unload at ~13:40 (after Transfer + 200 min)

ACTION: Complete Load Washer, actual end at 09:20 (ran long)

STATE 2: Chain Updates
  VERIFY: Transfer target shifts to 10:40 (09:20 + 80)
  VERIFY: Unload shifts accordingly

ACTION: Complete Transfer at 10:45

STATE 3: Final Update
  VERIFY: Unload target based on 10:45 + 200

ACTION: Try to schedule something in chain gap

STATE 4: Constraint Enforcement
  VERIFY: Chain bounds respected
  VERIFY: Conflict if something can't fit
```

### 3.3 Properties to Verify

```
PROP 6: Chain distances calculated from actual completion times when available
PROP 7: Before parent completes, child uses parent's scheduled duration
PROP 8: earlyWobble = 0 prevents early scheduling
PROP 9: lateWobble limits how late child can be
PROP 10: Deep chains (3+ levels, up to 32) work correctly
PROP 11: Rescheduling parent moves children recursively
```

---

## 4. Conflict Scenario

### 4.1 Fixed-Fixed Overlap

```
Series:
- "Meeting A": fixed: true, timeOfDay: "10:00", duration: 60
- "Meeting B": fixed: true, timeOfDay: "10:30", duration: 60

VERIFY: Both scheduled at their times
VERIFY: Overlap conflict reported with severity: 'warning'
VERIFY: Both meetings appear in schedule
```

### 4.2 Impossible Constraint

```
Series:
- "Task A": fixed: true, timeOfDay: "14:00"
- "Task B": fixed: true, timeOfDay: "10:00"

Constraint: mustBeBefore(A, B)

VERIFY: Conflict reported with severity: 'error'
VERIFY: Constraint violation identified
VERIFY: Both tasks still scheduled (best effort)
```

### 4.3 Chain Cannot Fit

```
Series:
- "Parent": fixed: true, timeOfDay: "23:00", duration: 30
- "Child": link: { targetDistance: 120, earlyWobble: 0, lateWobble: 30 }

VERIFY: Child would be at 01:30 next day
VERIFY: If child has day constraint, may conflict
VERIFY: chainCannotFit error if bounds violated
```

### 4.4 Properties to Verify

```
PROP 12: All conflict types correctly identified
PROP 13: Conflicts include enough detail to diagnose
PROP 14: Best-effort placement still produces usable schedule
```

---

## 5. Relational Constraint Scenario

### 5.1 Setup

```
Series:
- "Heavy Lifting" (tag: 'heavy')
- "Cardio" (tag: 'cardio')

Constraints:
- cantBeNextTo(tag:'heavy', tag:'heavy')
- mustBeOnSameDay(tag:'cardio', tag:'heavy')
```

### 5.2 Test Sequence

```
STATE 1: Schedule Two Heavy Lifting
  VERIFY: Not scheduled adjacent
  VERIFY: Gap or other activity between them

STATE 2: Add Cardio
  VERIFY: Cardio on same day as heavy lifting

STATE 3: Remove Constraint
  VERIFY: Heavy lifting can now be adjacent
```

---

## 6. Large Data Scenario

### 6.1 Setup

```
- 100 series with various patterns
- 1 year date range
- Multiple constraints
- Several chains
```

### 6.2 Verification

```
VERIFY: Schedule computes successfully
VERIFY: No infinite loops or crashes
VERIFY: Performance within acceptable bounds
VERIFY: All constraints evaluated
```

---

## 7. Timezone Scenario

### 7.1 DST Transition

```
Config: timezone = "America/New_York"

Series: Daily at 02:30 (during spring forward gap)

VERIFY: Instance on DST transition date handled
VERIFY: Time shifts forward to 03:00 (first valid time)
VERIFY: Other instances unaffected
```

### 7.2 Cross-Timezone

```
Series created in EST
Schedule queried in PST context

VERIFY: Times correctly converted
VERIFY: Day boundaries correct
```

### 7.3 All-Day Reminders

```
Series: All-day event on 2024-03-15
Reminder: minutesBefore = 60

VERIFY: Reminder fires at 23:00 on 2024-03-14 (60 min before 00:00)
VERIFY: All-day instances excluded from reflow (no time slot conflicts)
```

---

## 8. Reminder Scenario

### 8.1 Setup

```
Series: "Important Meeting"
  - timeOfDay: "14:00"
  - reminders: [
      { minutesBefore: 60, tag: "prepare" },
      { minutesBefore: 10, tag: "urgent" }
    ]
```

### 8.2 Test Sequence

```
TIME: 12:55
  VERIFY: No pending reminders

TIME: 13:00
  VERIFY: "prepare" reminder pending

ACTION: Acknowledge "prepare" reminder

TIME: 13:05
  VERIFY: "prepare" not pending (acknowledged)
  VERIFY: "urgent" not yet pending

TIME: 13:50
  VERIFY: "urgent" reminder pending

ACTION: Complete meeting

TIME: Next instance
  VERIFY: Both reminders pending again (new instance)
```

---

## 9. Instance Exception Scenario

### 9.1 Cancel and Reschedule

```
Series: Weekly on Monday

ACTION: Cancel specific Monday

VERIFY: That Monday not in schedule
VERIFY: Other Mondays still scheduled

ACTION: Reschedule another Monday to Tuesday

VERIFY: Instance appears on Tuesday
VERIFY: Original Monday slot free
```

---

## 10. Cycling Scenario

### 10.1 gapLeap Behavior

```
Series: "Rotating Chore"
  - Pattern: weekly
  - cycling: { items: [A, B, C], mode: 'sequential', gapLeap: true }

Week 1: Instance scheduled, shows "A"
ACTION: Skip (don't complete)

Week 2: Instance scheduled, shows "A" (didn't advance)
ACTION: Complete

Week 3: Instance scheduled, shows "B" (advanced)
```

### 10.2 Without gapLeap

```
Series: "Fixed Rotation"
  - cycling: { items: [A, B, C], mode: 'sequential', gapLeap: false }

Week 1: Shows "A" (instance 0)
Week 2: Shows "B" (instance 1)
Week 3: Shows "C" (instance 2)
Week 4: Shows "A" (instance 3, wraps)

// Completion status doesn't affect sequence
```

---

## 11. Adaptive Duration Scenario

### 11.1 Setup

```
Series: "Variable Task"
  - duration: { mode: 'lastN', value: 5, multiplier: 1.25, fallback: 30 }
```

### 11.2 Test Sequence

```
STATE 1: No History
  VERIFY: Duration = 30 (fallback)

ACTION: Complete with durations [20, 25, 30, 25, 30]

STATE 2: Has History
  VERIFY: Duration = ceil(avg(20,25,30,25,30) * 1.25) = ceil(26 * 1.25) = 33
```

---

## 12. Leap Year Scenario

### 12.1 Feb 29 Yearly Pattern

```
Series: Yearly on Feb 29
Range: 2020-01-01 to 2030-12-31

VERIFY: Instances on 2020-02-29, 2024-02-29, 2028-02-29 (leap years)
VERIFY: No instances in 2021, 2022, 2023, 2025, 2026, 2027, 2029, 2030 (non-leap)
VERIFY: Pattern skips non-leap years entirely (no rounding to Feb 28)
```

---

## 13. Chain Depth Scenario

### 13.1 Maximum Depth

```
Create chain: A → B → C → ... (32 levels)

VERIFY: Chain of 32 levels works
VERIFY: Attempting to add 33rd level throws ChainDepthExceededError
```

---

## 14. End-to-End Properties

```
E2E 1: System handles all features used together
E2E 2: State is consistent after any sequence of operations
E2E 3: Reflow produces valid schedule for valid inputs
E2E 4: Conflicts clearly reported for invalid configurations
E2E 5: Performance acceptable for realistic workloads
E2E 6: No data loss or corruption under normal operation
E2E 7: Error recovery leaves system in consistent state
E2E 8: Cycling state preserved across series splits
E2E 9: Children move recursively when parent rescheduled
E2E 10: All-day reminders fire relative to 00:00
```

---

## 15. Dependencies

- All previous segments
- Both mock and SQLite adapters
