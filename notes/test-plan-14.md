# Test Plan: Segment 14 — Public API

## Overview

The public API is the consumer-facing interface that ties all components together. It handles initialization, timezone conversion, and event emission.

**Test file**: `tests/14-public-api.test.ts`

**Dependencies**: All previous segments (1-13)

---

## 1. Initialization

### 1.1 Basic Initialization Tests

| Test Name | Scenario | Expected | Laws/Posts Verified |
|-----------|----------|----------|---------------------|
| `create autoplanner` | valid config | Instance created | POST 1 |
| `uses provided adapter` | adapter operations | Operations use adapter | POST 2 |
| `uses configured timezone` | timezone set | Times in that timezone | POST 3 |

### 1.2 Precondition Tests

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `adapter must implement interface` | invalid adapter | Error | PRE 1 |
| `timezone must be valid IANA` | "Invalid/Zone" | Error | PRE 2 |
| `valid IANA timezone` | "America/New_York" | Success | PRE 2 |

---

## 2. Timezone Conversion

### 2.1 Input Conversion

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `input times as configured TZ` | createSeries 09:00 in EST | Interpreted as EST | LAW 1 |
| `logCompletion in configured TZ` | log at 14:30 | Interpreted as local | LAW 1 |

### 2.2 Output Conversion

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `output times in configured TZ` | getSeries | Times in configured TZ | LAW 2 |
| `getSchedule in configured TZ` | query schedule | All times local | LAW 2 |

### 2.3 Internal Storage

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `stored as UTC` | check storage | UTC format | LAW 3 |
| `round-trip preserves time` | store, retrieve | Same local time | LAW 1, LAW 2 |

### 2.4 DST Handling

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `DST spring forward` | 2:30am on DST start | Per Segment 1 rules | LAW 4 |
| `DST fall back` | 1:30am on DST end | Per Segment 1 rules | LAW 4 |

---

## 3. Reflow Triggering

### 3.1 Operations That Trigger Reflow

| Test Name | Operation | Reflow Expected | Laws Verified |
|-----------|-----------|-----------------|---------------|
| `createSeries triggers` | createSeries | Yes | LAW 5 |
| `updateSeries triggers` | updateSeries | Yes | LAW 5 |
| `deleteSeries triggers` | deleteSeries | Yes | LAW 5 |
| `linkSeries triggers` | linkSeries | Yes | LAW 5 |
| `unlinkSeries triggers` | unlinkSeries | Yes | LAW 5 |
| `addConstraint triggers` | addConstraint | Yes | LAW 5 |
| `removeConstraint triggers` | removeConstraint | Yes | LAW 5 |
| `cancelInstance triggers` | cancelInstance | Yes | LAW 5 |
| `rescheduleInstance triggers` | rescheduleInstance | Yes | LAW 5 |
| `logCompletion triggers` | logCompletion | Yes | LAW 5 |

### 3.2 Reflow Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reflow event emitted` | trigger reflow | Event fired | LAW 6 |
| `getSchedule returns post-reflow` | query after trigger | Updated schedule | LAW 7 |
| `reflow is synchronous` | trigger and query | Query sees new state | LAW 8 |

---

## 4. Error Handling

### 4.1 Error Type Tests

| Error Type | Test Scenario | Expected Message |
|------------|---------------|------------------|
| ValidationError | Empty title | Descriptive message |
| NotFoundError | Get non-existent series | "Series not found" |
| LockedSeriesError | Update locked series | "Series is locked" |
| CompletionsExistError | Delete series with completions | Includes recovery info |
| LinkedChildrenExistError | Delete parent with links | Includes recovery info |
| NonExistentInstanceError | Cancel non-pattern date | "Instance does not exist" |
| AlreadyCancelledError | Cancel twice | "Already cancelled" |
| CancelledInstanceError | Reschedule cancelled | "Cannot reschedule cancelled" |
| CycleDetectedError | Create cycle | "Cycle detected" |
| ChainDepthExceededError | Chain depth 33 | "Maximum depth exceeded" |
| DuplicateCompletionError | Log completion twice | "Already completed" |

### 4.2 Error Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `errors have messages` | any error | Descriptive string | LAW 9 |
| `failed ops don't mutate` | operation fails | State unchanged | LAW 10 |
| `errors are typed` | catch error | Has type property | LAW 11 |

---

## 5. Idempotency

### 5.1 Idempotent Operations

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `lock is idempotent` | lock twice | No error, still locked | LAW 12 |
| `unlock is idempotent` | unlock twice | No error, still unlocked | LAW 13 |
| `acknowledgeReminder idempotent` | acknowledge twice | No error | LAW 14 |

### 5.2 Non-Idempotent Operations

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `createSeries not idempotent` | create twice | Two different IDs | LAW 15 |
| `logCompletion not idempotent` | log same instance twice | Error on second | LAW 16 |

---

## 6. Concurrency

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `single-threaded assumption` | documented | API assumes single thread | LAW 17 |
| `concurrent undefined behavior` | documented | Consumer responsibility | LAW 18, LAW 19 |

---

## 7. Event Emission

### 7.1 Reflow Event

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reflow event fires` | trigger reflow | Handler called | - |
| `reflow payload is schedule` | listen to event | Complete schedule | - |

### 7.2 Conflict Event

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `conflict event fires` | create conflict | Handler called | - |
| `conflict payload has details` | listen to event | Conflict object | - |

### 7.3 Reminder Due Event

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `reminderDue event fires` | reminder time reached | Handler called | - |
| `reminder payload has details` | listen to event | Reminder object | - |

### 7.4 Event Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `events after mutation` | trigger, listen | State complete before event | LAW 20 |
| `event data immutable` | modify payload | Original unchanged | LAW 21 |
| `handler errors isolated` | handler throws | API unaffected | LAW 22 |

---

## 8. API Methods

### 8.1 Series Management

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `createSeries returns ID` | create | UUID returned |
| `getSeries returns series` | get existing | Series data |
| `getSeries returns null` | get non-existent | null |
| `getSeriesByTag filters` | query tag | Matching series |
| `getAllSeries returns all` | query all | All series |
| `updateSeries modifies` | update | Changes applied |
| `lock locks` | lock | Series locked |
| `unlock unlocks` | unlock | Series unlocked |
| `deleteSeries removes` | delete | Series gone |
| `splitSeries splits` | split | Two series |

### 8.2 Links

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `linkSeries creates link` | link | Child linked to parent |
| `unlinkSeries removes link` | unlink | Link removed |

### 8.3 Constraints

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `addConstraint creates` | add | Constraint exists |
| `removeConstraint removes` | remove | Constraint gone |

### 8.4 Instance Operations

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `getInstance returns instance` | query | Instance data |
| `cancelInstance cancels` | cancel | Instance excluded |
| `rescheduleInstance reschedules` | reschedule | Instance at new time |

### 8.5 Completions

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `logCompletion logs` | log | Completion recorded |
| `getCompletions returns` | query | Matching completions |
| `deleteCompletion removes` | delete | Completion gone |

### 8.6 Querying

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `getSchedule returns schedule` | query range | Instances in range |
| `getPendingReminders returns` | query | Due reminders |
| `acknowledgeReminder acknowledges` | ack | Reminder dismissed |
| `getConflicts returns` | query | Current conflicts |

### 8.7 State Inspection

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `evaluateCondition returns bool` | evaluate | true or false |
| `getActiveConditions returns` | query | Active patterns per series |

---

## 9. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `consistent state` | Query after any operation |
| INV 2 | `times at boundary local` | Check all API responses |
| INV 3 | `events reflect state` | Compare event payload to query |
| INV 4 | `operations transactional` | Check state after failure |

---

## 10. Integration Workflows

### 10.1 Full CRUD Workflow

| Test Name | Steps | Expected |
|-----------|-------|----------|
| `series lifecycle` | create→get→update→delete | All operations work |
| `completion workflow` | create series→log completion→query | Completion appears |

### 10.2 Complex Workflows

| Test Name | Steps | Expected |
|-----------|-------|----------|
| `conditional pattern activation` | condition changes→pattern activates | Schedule updates |
| `chain with completion` | parent completes→child reschedules | Chain adjusts |

---

## 11. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Initialization | ~5 | ~5 |
| Timezone Conversion | ~8 | ~8 |
| Reflow Triggering | ~13 | ~13 |
| Error Handling | ~14 | ~14 |
| Idempotency | ~5 | ~5 |
| Concurrency | ~3 | ~3 |
| Event Emission | ~8 | ~8 |
| API Methods | ~25 | ~25 |
| Invariants | ~4 | ~4 |
| Integration | ~4 | ~4 |
| **Total** | **~89** | **~89** |

---

## 12. Test Execution Notes

- Test with mock adapter for unit tests
- Test timezone conversion with multiple timezones
- Verify DST handling at exact transition times
- Test each error type with specific trigger scenario
- Verify event payloads match documented structure
- Test idempotency by calling operations multiple times
- Verify transactional behavior by checking state after failures
- Test full workflows to verify component integration
