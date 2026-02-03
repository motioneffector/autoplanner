# Test Plan: Segment 05 — Series CRUD & Tags

## Overview

Series CRUD operations provide domain-level management of Series entities with validation, business rules, and tag management. This segment builds on the adapter layer and adds business logic.

**Test file**: `tests/05-series-crud.test.ts`

**Dependencies**: Segment 1 (Time & Date Utilities), Segment 4 (Adapter)

---

## 1. Create Series

### 1.1 Basic Creation Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `create series returns unique ID` | create() | UUID v4 format ID | LAW 1 |
| `created series is retrievable` | create, get | Returns series | LAW 2 |
| `two creates return different IDs` | create twice | ID1 ≠ ID2 | LAW 1 |
| `createdAt set on create` | create | createdAt = now | POST 3 |
| `updatedAt set on create` | create | updatedAt = now | POST 3 |
| `locked defaults to false` | create without locked | locked = false | POST 4 |

### 1.2 One-Time Series Inference

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no patterns no count no endDate` | empty patterns, no count | treated as count=1 | LAW 3 |
| `patterns present` | patterns=[daily], no count | not one-time | - |
| `count specified` | count=5, no patterns | uses count | - |
| `endDate specified` | endDate=future, no patterns | uses endDate | - |

### 1.3 Tag Creation on Series Create

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `tags created if not exist` | create with new tags | Tags exist after | POST 5 |
| `existing tags not duplicated` | create with existing tag | One tag entry | - |

---

## 2. Precondition Validation (Create)

### 2.1 Title Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid title` | "Morning Walk" | Accepted | PRE 1 |
| `empty title` | "" | ValidationError | PRE 1 |
| `whitespace only title` | "   " | ValidationError | PRE 1, RULE 1 |

### 2.2 Date Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid startDate` | "2024-01-15" | Accepted | PRE 2 |
| `invalid startDate format` | "01-15-2024" | ValidationError | PRE 2, RULE 2 |
| `endDate equals startDate` | start=end | Accepted | PRE 4 |
| `endDate before startDate` | end < start | ValidationError | PRE 4, RULE 3 |
| `endDate after startDate` | end > start | Accepted | PRE 4 |
| `count and endDate both set` | both specified | ValidationError | PRE 3, RULE 5 |
| `count = 0` | count=0 | ValidationError | PRE 5, RULE 4 |
| `count = 1` | count=1 | Accepted | PRE 5 |
| `negative count` | count=-1 | ValidationError | PRE 5 |

### 2.3 Time Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid timeOfDay` | "09:00" | Accepted | PRE 6, RULE 6 |
| `allDay timeOfDay` | "allDay" | Accepted | PRE 6 |
| `invalid time format` | "9am" | ValidationError | PRE 6 |
| `allDay time requires allDay duration` | time=allDay, duration=30 | ValidationError | PRE 8, RULE 7 |
| `allDay duration requires allDay time` | time=09:00, duration=allDay | ValidationError | RULE 8 |
| `allDay consistency` | time=allDay, duration=allDay | Accepted | PRE 8 |

### 2.4 Duration Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid duration minutes` | 30 | Accepted | PRE 7 |
| `zero duration` | 0 | ValidationError | RULE 9 |
| `negative duration` | -10 | ValidationError | PRE 7 |
| `allDay duration` | "allDay" | Accepted | PRE 7 |
| `adaptive duration valid` | {fallback: 30, ...} | Accepted | PRE 7 |
| `adaptive duration fallback < 1` | {fallback: 0} | ValidationError | RULE 10 |
| `adaptive min >= max` | {min: 60, max: 30} | ValidationError | RULE 11 |
| `adaptive min < max` | {min: 20, max: 60} | Accepted | RULE 11 |

### 2.5 Pattern Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid patterns` | [daily, weekly] | Accepted | PRE 9 |
| `invalid pattern object` | [{invalid: true}] | ValidationError | PRE 9 |

### 2.6 Wiggle Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid wiggle` | {daysBefore: 1, daysAfter: 2} | Accepted | PRE 11 |
| `negative daysBefore` | {daysBefore: -1} | ValidationError | PRE 11, RULE 12 |
| `negative daysAfter` | {daysAfter: -1} | ValidationError | PRE 11, RULE 13 |
| `valid timeWindow` | {earliest: "08:00", latest: "10:00"} | Accepted | RULE 14 |
| `invalid timeWindow order` | {earliest: "10:00", latest: "08:00"} | ValidationError | RULE 14 |
| `fixed with wiggle` | fixed=true, wiggle={daysBefore: 1} | ValidationError | RULE 15 |
| `fixed with null wiggle` | fixed=true, wiggle=null | Accepted | RULE 15 |
| `fixed with zero wiggle` | fixed=true, wiggle={daysBefore:0, daysAfter:0} | Accepted | RULE 15 |

### 2.7 Reminder Validation

| Test Name | Input | Expected | Preconditions Verified |
|-----------|-------|----------|------------------------|
| `valid reminders` | [{minutes: 15}] | Accepted | PRE 12 |
| `negative reminder minutes` | [{minutes: -5}] | ValidationError | PRE 12 |
| `zero reminder minutes` | [{minutes: 0}] | Accepted | PRE 12 |

---

## 3. Get Series

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get existing series` | create, get | Returns series | LAW 4 |
| `get non-existent series` | get unknown ID | null | LAW 4 |
| `get deleted series` | create, delete, get | null | LAW 4 |
| `get series by tag` | create with tag, query tag | Returns in result | LAW 5 |
| `get series by tag excludes others` | create without tag, query tag | Not in result | LAW 5 |
| `get all series` | create 3 series | Returns all 3 | LAW 6 |
| `get all series empty` | no series | [] | LAW 6 |

---

## 4. Update Series

### 4.1 Basic Update Tests

| Test Name | Scenario | Expected | Laws/Posts Verified |
|-----------|----------|----------|---------------------|
| `update title` | update({title: "New"}) | Title changed | POST 8 |
| `update preserves other fields` | update title only | description unchanged | POST 9 |
| `update sets updatedAt` | update any field | updatedAt = now | POST 10 |
| `update non-existent series` | update unknown ID | NotFoundError | LAW 8 |

### 4.2 Locked Series Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `update locked series fails` | lock, update title | LockedSeriesError | LAW 7 |
| `unlocking locked series allowed` | lock, update({locked: false}) | Succeeds | LAW 7 |
| `update unlocked series works` | lock, unlock, update | Succeeds | - |

### 4.3 Update Preconditions

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `cannot change id` | update({id: "new"}) | ValidationError | PRE 15 |
| `cannot change createdAt` | update({createdAt: "new"}) | ValidationError | PRE 16 |
| `update validation applied` | update({title: ""}) | ValidationError | PRE 17 |

---

## 5. Delete Series

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `delete existing series` | create, delete | Succeeds | - |
| `get after delete` | create, delete, get | null | LAW 11 |
| `delete non-existent series` | delete unknown ID | NotFoundError | - |
| `delete with completions` | add completion, delete | CompletionsExistError | LAW 9 |
| `delete with child links` | add as parent link, delete | LinkedChildrenExistError | LAW 10 |
| `delete cascades patterns` | add pattern, delete series | Patterns deleted | POST 12 |
| `delete cascades conditions` | add condition, delete series | Conditions deleted | POST 12 |
| `delete cascades reminders` | add reminder, delete series | Reminders deleted | POST 12 |

---

## 6. Lock/Unlock

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `lock sets locked true` | lock(id) | locked = true | LAW 12 |
| `unlock sets locked false` | lock, unlock | locked = false | LAW 13 |
| `lock non-existent` | lock unknown ID | NotFoundError | LAW 14 |
| `unlock non-existent` | unlock unknown ID | NotFoundError | LAW 14 |
| `lock is idempotent` | lock, lock | No error, still locked | LAW 15 |
| `unlock is idempotent` | unlock, unlock | No error, still unlocked | LAW 16 |
| `lock unlocked then lock` | create (unlocked), lock | locked = true | LAW 12 |

---

## 7. Series Splitting

### 7.1 Basic Split Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `split returns new ID` | split(id, date, {}) | New ID returned | LAW 17 |
| `split IDs differ` | split | newId ≠ originalId | LAW 17 |
| `original endDate set` | split at day 10 | original.endDate = day 9 | POST 13 |
| `new startDate set` | split at day 10 | new.startDate = day 10 | POST 14 |
| `new inherits from original` | split with no overrides | Same title, patterns, etc. | POST 15 |
| `new applies overrides` | split({title: "New Title"}) | new.title = "New Title" | POST 15 |
| `both series valid` | split | Both pass validation | POST 16 |

### 7.2 Split Preconditions

| Test Name | Scenario | Expected | Preconditions Verified |
|-----------|----------|----------|------------------------|
| `split non-existent series` | split unknown ID | NotFoundError | PRE 21 |
| `split at startDate` | splitDate = startDate | ValidationError | PRE 22 |
| `split before startDate` | splitDate < startDate | ValidationError | PRE 22 |
| `split after endDate` | splitDate > endDate | ValidationError | PRE 23 |
| `split locked series` | lock, split | LockedSeriesError | PRE 24 |

### 7.3 Completion Preservation

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `original completions preserved` | add completions, split | original still has completions | LAW 18 |
| `new series has no completions` | split | new.completions = [] | LAW 19 |

### 7.4 Cycling State Transfer

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `cycling currentIndex carries over` | cycling index=3, split | new.cycling.currentIndex=3 | LAW 20, POST 17 |
| `cycling without gapLeap` | gapLeap=false, split | Index preserved | LAW 20 |

---

## 8. Tag Management

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `add tag to series` | addTagToSeries(s, "work") | Tag in getTagsForSeries | LAW 21 |
| `remove tag from series` | add, remove | Tag not in getTagsForSeries | LAW 22 |
| `add tag creates if not exists` | addTagToSeries with new tag | Tag exists in getAllTags | LAW 23 |
| `add existing tag idempotent` | add same tag twice | One association only | LAW 24 |
| `remove non-existent tag idempotent` | remove tag not on series | No error | LAW 25 |
| `tag on non-existent series` | addTagToSeries(unknown, tag) | NotFoundError | - |

---

## 9. Validation Rules (Comprehensive)

### 9.1 RULE Tests

| Rule | Test Name | Invalid Input | Expected |
|------|-----------|---------------|----------|
| RULE 1 | `empty title rejected` | title="" | ValidationError |
| RULE 2 | `invalid date rejected` | startDate="invalid" | ValidationError |
| RULE 3 | `endDate before startDate rejected` | end < start | ValidationError |
| RULE 4 | `zero count rejected` | count=0 | ValidationError |
| RULE 5 | `both endDate and count rejected` | both set | ValidationError |
| RULE 6 | `invalid timeOfDay rejected` | timeOfDay="noon" | ValidationError |
| RULE 7 | `allDay time non-allDay duration rejected` | time=allDay, dur=30 | ValidationError |
| RULE 8 | `non-allDay time allDay duration rejected` | time=09:00, dur=allDay | ValidationError |
| RULE 9 | `zero duration rejected` | duration=0 | ValidationError |
| RULE 10 | `adaptive fallback < 1 rejected` | fallback=0 | ValidationError |
| RULE 11 | `adaptive min >= max rejected` | min=60, max=30 | ValidationError |
| RULE 12 | `negative daysBefore rejected` | daysBefore=-1 | ValidationError |
| RULE 13 | `negative daysAfter rejected` | daysAfter=-1 | ValidationError |
| RULE 14 | `invalid timeWindow order rejected` | earliest > latest | ValidationError |
| RULE 15 | `fixed with non-zero wiggle rejected` | fixed=true, wiggle.daysBefore=1 | ValidationError |

---

## 10. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `all series satisfy validation` | Enumerate all series, validate each |
| INV 2 | `series ID immutable` | Attempt to change ID fails |
| INV 3 | `createdAt immutable` | Attempt to change createdAt fails |
| INV 4 | `locked allows scheduling` | Locked series still generates instances |

---

## 11. Error Types

| Error Type | Test Scenario |
|------------|---------------|
| ValidationError | Create with empty title |
| ValidationError | Create with fixed=true and wiggle.daysBefore=1 |
| NotFoundError | Get/Update/Delete non-existent series |
| LockedSeriesError | Update locked series (except unlock) |
| CompletionsExistError | Delete series with completions |
| LinkedChildrenExistError | Delete series that is parent to links |

---

## 12. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Create Series | ~12 | ~12 |
| Precondition Validation | ~35 | ~35 |
| Get Series | ~7 | ~7 |
| Update Series | ~10 | ~10 |
| Delete Series | ~8 | ~8 |
| Lock/Unlock | ~7 | ~7 |
| Series Splitting | ~15 | ~15 |
| Tag Management | ~6 | ~6 |
| Validation Rules | ~15 | ~15 |
| Invariants | ~4 | ~4 |
| **Total** | **~119** | **~119** |

---

## 13. Test Execution Notes

- Use mock adapter for unit tests
- Each test should start with fresh adapter state
- Test isolation is critical - no shared state between tests
- Verify exact error types thrown (not just error occurrence)
- Test boundary conditions for dates, counts, durations
- Verify updatedAt changes on every mutation
- Test tag creation side effects carefully
- Verify cascade deletes by checking dependent entities
