# Test Plan: Segment 10 — Reminders

## Overview

Reminders fire at specified times before scheduled instances. Each reminder has a tag for consumer-defined behavior. This segment covers reminder CRUD, pending reminder queries, acknowledgments, and fire time calculations.

**Test file**: `tests/10-reminders.test.ts`

**Dependencies**: Segment 1 (Time & Date), Segment 4 (Adapter), Segment 5 (Series CRUD), Segment 9 (Instance Exceptions)

---

## 1. Reminder CRUD

### 1.1 Create Reminder Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `create reminder returns ID` | createReminder | UUID returned | - |
| `create multiple per series` | create 3 reminders | All 3 exist | LAW 1 |
| `same tag multiple reminders` | 10min urgent, 5min urgent | Both created | LAW 2 |
| `minutesBefore 0 allowed` | minutesBefore=0 | Created | LAW 4 |

### 1.2 Get Reminder Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get existing reminder` | create, get | Returns reminder | - |
| `get non-existent reminder` | get unknown ID | null | - |
| `get reminders by series` | create 3 | Returns all 3 | LAW 1 |

### 1.3 Update Reminder Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `update minutesBefore` | update to 15 | Value changed | - |
| `update tag` | update to "urgent" | Tag changed | - |

### 1.4 Delete Reminder Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `delete existing reminder` | delete | Removed | - |
| `delete cascades acknowledgments` | ack then delete reminder | Acks deleted | - |
| `series delete cascades reminders` | delete series | Reminders deleted | LAW 3 |

---

## 2. Get Pending Reminders

### 2.1 Fire Time Filtering

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reminder not yet due` | fireTime > asOf | Not in pending | LAW 5 |
| `reminder exactly due` | fireTime = asOf | In pending | LAW 5 |
| `reminder past due` | fireTime < asOf | In pending | LAW 5 |

### 2.2 Acknowledgment Filtering

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `acknowledged not in pending` | acknowledge, query | Not returned | LAW 6 |
| `unacknowledged in pending` | don't acknowledge | Returned | LAW 6 |

### 2.3 Exception Handling

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `cancelled instance excluded` | cancel instance | Reminder not pending | LAW 7 |
| `completed instance excluded` | complete instance | Reminder not pending (optional) | LAW 8 |
| `rescheduled instance included` | reschedule | Reminder at new fire time | LAW 9 |

### 2.4 Multiple Reminders

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `multiple due at same time` | 2 reminders for same instance | Both returned |
| `multiple instances` | daily series, 2 days due | Reminders for both |

---

## 3. Acknowledge Reminder

### 3.1 Basic Acknowledgment Tests

| Test Name | Scenario | Expected | Laws/Posts Verified |
|-----------|----------|----------|---------------------|
| `acknowledge records timestamp` | acknowledge | Record created | POST 1 |
| `acknowledged removed from pending` | acknowledge, getPending | Not returned | POST 2 |
| `acknowledge is idempotent` | acknowledge twice | No error | LAW 10 |

### 3.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `reminder must exist` | acknowledge unknown | NotFoundError | PRE 1 |

### 3.3 Isolation Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `doesn't affect other instances` | ack day 1, check day 2 | Day 2 still pending | LAW 11 |
| `doesn't affect other reminders` | ack reminder A, check B | B still pending | LAW 12 |

---

## 4. Query Acknowledgment

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `false if never acknowledged` | query fresh | false | LAW 13 |
| `true after acknowledgment` | acknowledge, query | true | LAW 14 |

---

## 5. Purge Old Acknowledgments

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `removes old acknowledgments` | ack 3 days ago, purge 2 days | Removed | LAW 15 |
| `keeps recent acknowledgments` | ack 1 day ago, purge 2 days | Retained | LAW 16 |
| `purged may re-appear pending` | ack, purge, query pending | May be pending again | LAW 17 |

---

## 6. Fire Time Calculation

### 6.1 Regular Instances

| Test Name | Instance Time | Minutes Before | Expected Fire Time | Laws Verified |
|-----------|---------------|----------------|-------------------|---------------|
| `basic fire time` | 09:00 | 15 | 08:45 | LAW 18 |
| `fire time at start` | 09:00 | 0 | 09:00 | LAW 19 |
| `fire time 1 hour before` | 10:00 | 60 | 09:00 | LAW 18 |
| `crosses midnight` | 00:30 | 60 | 23:30 (prev day) | LAW 18 |

### 6.2 Rescheduled Instances

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `uses rescheduled time` | reschedule to 10:00, 15min before | 09:45 | LAW 20 |
| `not original time` | original 09:00, rescheduled 10:00 | Based on 10:00 | LAW 20 |

### 6.3 All-Day Instances

| Test Name | Instance | Minutes Before | Expected Fire Time | Laws Verified |
|-----------|----------|----------------|-------------------|---------------|
| `all-day uses 00:00` | all-day Jan 15 | 0 | Jan 15 00:00 | LAW 21, B6 |
| `all-day 60 min before` | all-day Jan 15 | 60 | Jan 14 23:00 | LAW 22 |
| `all-day 1440 min before` | all-day Jan 15 | 1440 | Jan 14 00:00 | B7 |

---

## 7. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `minutesBefore 0` | fires at instance start | fireTime = scheduledTime | B1 |
| `minutesBefore > duration` | 120 min before 30 min instance | Still works | B2 |
| `instance at midnight` | 00:15, 30 min before | Prev day 23:45 | B3 |
| `rescheduled recalculates` | reschedule | New fire time | B4 |
| `cancelled no reminder` | cancel | No pending | B5 |
| `all-day minutesBefore 0` | fires at 00:00 | 00:00 of that day | B6 |
| `all-day 1440 min` | full day before | 00:00 prev day | B7 |

---

## 8. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `minutesBefore >= 0` | Attempt negative |
| INV 2 | `tag non-empty` | Attempt empty tag |
| INV 3 | `reminder references series` | Attempt orphan |
| INV 4 | `ack references reminder` | Attempt ack unknown reminder |
| INV 5 | `auto-purge old acks` | Verify old acks cleaned |

---

## 9. Real-World Scenarios

### 9.1 Meeting Reminders

| Test Name | Setup | Query Time | Expected |
|-----------|-------|------------|----------|
| `15-min meeting reminder` | meeting 09:00, 15min reminder | 08:45 | Pending |
| `15-min meeting reminder early` | meeting 09:00, 15min reminder | 08:30 | Not pending |
| `acknowledge dismisses` | acknowledge at 08:46 | 08:50 | Not pending |

### 9.2 Multi-Level Reminders

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `30 and 5 min reminders` | both on same instance | Both fire at their times |
| `acknowledge each separately` | ack 30min, check 5min | 5min still pending |

### 9.3 All-Day Event Reminders

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `reminder day before` | all-day event, 24h reminder | Fires prev day 00:00 |
| `reminder evening before` | all-day event, 12h reminder | Fires prev day 12:00 |

---

## 10. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Reminder CRUD | ~12 | ~12 |
| Get Pending Reminders | ~10 | ~10 |
| Acknowledge Reminder | ~7 | ~7 |
| Query Acknowledgment | ~2 | ~2 |
| Purge Acknowledgments | ~3 | ~3 |
| Fire Time Calculation | ~12 | ~12 |
| Boundary Conditions | ~7 | ~7 |
| Invariants | ~5 | ~5 |
| Scenarios | ~8 | ~8 |
| **Total** | **~66** | **~66** |

---

## 11. Test Execution Notes

- Create series and instances before testing reminders
- Set up known instance times for predictable fire time testing
- Test acknowledgment isolation carefully (same instance, different reminders)
- Verify fire time calculations with exact arithmetic
- Test all-day instances separately from timed instances
- Test across date boundaries (midnight crossings)
- Verify purge doesn't affect recent acknowledgments
- Test rescheduled instances recalculate fire time correctly
