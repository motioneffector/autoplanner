# Segment 10: Reminders — Formal Specification

## 1. Overview

Reminders fire at specified times before scheduled instances. Each reminder has a tag for consumer-defined behavior.

---

## 2. Types

### 2.1 Reminder Definition

```
type Reminder = {
  id: ReminderId
  seriesId: SeriesId
  minutesBefore: number      // ≥ 0
  tag: string                // consumer-defined
}
```

### 2.2 Pending Reminder

```
type PendingReminder = {
  reminderId: ReminderId
  seriesId: SeriesId
  instanceDate: LocalDate
  fireTime: LocalDateTime    // computed: instance time - minutesBefore
  tag: string
}
```

---

## 3. Reminder CRUD

```
createReminder(seriesId: SeriesId, minutesBefore: number, tag: string): ReminderId
getReminder(id: ReminderId): Reminder | null
getRemindersBySeries(seriesId: SeriesId): Reminder[]
updateReminder(id: ReminderId, changes: Partial<Reminder>): void
deleteReminder(id: ReminderId): void
```

### 3.1 Properties

```
LAW 1: Multiple reminders per series allowed
LAW 2: Same tag can appear multiple times (e.g., 10min urgent, 5min urgent)
LAW 3: Series deletion cascades to reminders
LAW 4: minutesBefore = 0 means reminder at instance start time
```

---

## 4. Get Pending Reminders

```
getPendingReminders(asOf: LocalDateTime): PendingReminder[]
```

### 4.1 Definition

```
getPendingReminders(asOf) =
  let instances = getAllScheduledInstances(near future window)
  let reminders = getAllReminders()
  [
    for each instance i
    for each reminder r where r.seriesId = i.seriesId
    let fireTime = addMinutes(i.scheduledTime, -r.minutesBefore)
    if fireTime ≤ asOf AND not isAcknowledged(r.id, i.instanceDate)
    yield { reminderId: r.id, seriesId: i.seriesId, instanceDate: i.instanceDate, fireTime, tag: r.tag }
  ]
```

### 4.2 Properties

```
LAW 5: Only returns reminders where fireTime ≤ asOf
LAW 6: Excludes acknowledged reminders
LAW 7: Excludes reminders for cancelled instances
LAW 8: Excludes reminders for completed instances (optional, configurable)
LAW 9: Includes reminders for rescheduled instances (at new time)
```

---

## 5. Acknowledge Reminder

```
acknowledgeReminder(reminderId: ReminderId, instanceDate: LocalDate): void
```

### 5.1 Preconditions

```
PRE 1: Reminder exists
```

### 5.2 Postconditions

```
POST 1: Acknowledgment recorded with current timestamp
POST 2: Reminder no longer appears in getPendingReminders for that instance
```

### 5.3 Properties

```
LAW 10: Acknowledgment is idempotent
LAW 11: Acknowledging doesn't affect other instances of same series
LAW 12: Acknowledging doesn't affect other reminders for same instance
```

---

## 6. Query Acknowledgment

```
isReminderAcknowledged(reminderId: ReminderId, instanceDate: LocalDate): boolean
```

### 6.1 Properties

```
LAW 13: Returns false if never acknowledged
LAW 14: Returns true after acknowledgeReminder called
```

---

## 7. Purge Old Acknowledgments

```
purgeOldAcknowledgments(olderThan: LocalDateTime): void
```

### 7.1 Properties

```
LAW 15: Removes acknowledgments where acknowledged_at < olderThan
LAW 16: Doesn't affect recent acknowledgments
LAW 17: Purged reminders may re-appear as pending if fire time hasn't passed
```

**Rationale**: Acknowledgments are temporary. After instance is past, acknowledgment no longer needed.

---

## 8. Fire Time Calculation

```
calculateFireTime(instance: ScheduledInstance, reminder: Reminder): LocalDateTime =
  if instance.allDay then
    // All-day instances: fire relative to 00:00 of that day
    addMinutes(makeDateTime(instance.date, "00:00:00"), -reminder.minutesBefore)
  else
    addMinutes(instance.scheduledTime, -reminder.minutesBefore)
```

### 8.1 Properties

```
LAW 18: fireTime < instance.scheduledTime (unless minutesBefore = 0)
LAW 19: fireTime = instance.scheduledTime when minutesBefore = 0
LAW 20: fireTime respects rescheduled time, not original time
LAW 21: All-day instances use 00:00:00 as reference time for reminder calculation
LAW 22: All-day reminder with minutesBefore=60 fires at 23:00 the previous day
```

---

## 9. Invariants

```
INV 1: minutesBefore ≥ 0
INV 2: tag is non-empty string
INV 3: Reminder references existing series
INV 4: Acknowledgment references existing reminder
INV 5: Acknowledgments auto-purged after 48 hours (configurable)
```

---

## 10. Boundary Conditions

```
B1: minutesBefore = 0 → fires at instance start (or 00:00 for all-day)
B2: minutesBefore > instance duration → fires before previous instance might end
B3: Instance at midnight → reminder might fire previous day
B4: Rescheduled instance → reminder fire time recalculated
B5: Cancelled instance → no reminder fires
B6: All-day instance, minutesBefore = 0 → fires at 00:00 of that day
B7: All-day instance, minutesBefore = 1440 → fires at 00:00 previous day
```

---

## 11. Verification Strategy

### 11.1 CRUD tests

- Create, read, update, delete reminders

### 11.2 Pending tests

- Reminder not yet due → not in pending
- Reminder due → in pending
- Reminder acknowledged → not in pending
- Cancelled instance → reminder not in pending

### 11.3 Fire time tests

- Various minutesBefore values
- Rescheduled instance affects fire time

### 11.4 Purge tests

- Old acknowledgments removed
- Recent acknowledgments retained

---

## 12. Dependencies

- Segment 1: Time & Date Utilities
- Segment 4: Adapter
- Segment 5: Series CRUD
- Segment 9: Instance Exceptions (cancelled/rescheduled)
