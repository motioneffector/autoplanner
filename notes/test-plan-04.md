# Test Plan: Segment 04 — Adapter (In-Memory Mock)

## Overview

The adapter provides a domain-oriented interface to persistence. This test plan covers the in-memory mock implementation that will be used for testing all other segments.

**Test file**: `tests/04-adapter.test.ts`

**Dependencies**: Segment 1 (Time & Date Utilities)

---

## 1. Transaction Semantics

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `transaction commits on success` | fn completes normally | All mutations persisted | LAW 1 |
| `transaction rolls back on error` | fn throws | All mutations reverted | LAW 1 |
| `transaction returns value` | fn returns 42 | transaction returns 42 | - |
| `transaction propagates error` | fn throws Error | Error propagates | - |
| `nested transactions` | tx(() => tx(() => x)) | Behaves as single tx | LAW 3 |
| `nested rollback` | tx(() => { mutate; tx(() => throw) }) | All reverted | LAW 1, LAW 3 |

### Rollback Verification

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `rollback series creation` | Create series in tx, throw | Series doesn't exist |
| `rollback series update` | Update in tx, throw | Original values restored |
| `rollback series deletion` | Delete in tx, throw | Series still exists |
| `rollback multiple operations` | Create A, Update B, Delete C, throw | All reverted |

---

## 2. Series Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get series` | create, get | Returns exact data | LAW 4, LAW 7 |
| `create duplicate ID` | create same ID twice | DuplicateKeyError | LAW 5 |
| `get non-existent series` | get unknown ID | null | LAW 6 |
| `get all series empty` | getAllSeries empty store | [] | LAW 8 |
| `get all series multiple` | create 3, getAll | Returns all 3 | LAW 8, LAW 9 |
| `update series` | update title | New title returned | LAW 11 |
| `update preserves unspecified` | update only title | Description unchanged | LAW 12 |
| `update non-existent` | update unknown ID | NotFoundError | LAW 13 |
| `delete series` | create, delete, get | null | LAW 14 |
| `delete with completions` | add completion, delete series | ForeignKeyError | LAW 15 |
| `delete with child links` | add link as parent, delete | ForeignKeyError | LAW 16 |
| `delete cascades patterns` | create pattern, delete series | Patterns gone | LAW 17 |

### Query Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get series by tag` | Series A,B have tag, C doesn't | Returns A,B | LAW 10 |
| `get series by tag empty` | No series with tag | [] | LAW 10 |

---

## 3. Pattern Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get pattern` | create, get | Returns exact data | - |
| `pattern references series` | create with invalid series_id | ForeignKeyError | LAW 18 |
| `get patterns by series` | create 2 patterns for series | Returns both | - |
| `delete pattern cascades weekdays` | delete pattern | Weekdays gone | LAW 19 |
| `series delete cascades patterns` | delete series | Patterns deleted | LAW 20 |

---

## 4. Pattern Weekday Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `set and get weekdays` | set ['mon','wed','fri'], get | Returns same | LAW 22 |
| `set replaces all` | set ['mon'], set ['tue','thu'] | Only tue,thu | LAW 21 |
| `pattern delete cascades` | delete pattern | Weekdays gone | LAW 23 |
| `get all pattern weekdays` | create multiple | Returns all | - |

---

## 5. Condition Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create root condition` | parent_id = null | Creates correctly | LAW 24 |
| `create child condition` | parent_id = existing | Creates correctly | LAW 25 |
| `child with invalid parent` | parent_id = nonexistent | ForeignKeyError | LAW 25 |
| `delete cascades children` | delete parent | Children deleted | LAW 26 |
| `no cycles allowed` | A→B→C→A | Error or prevented | LAW 27 |
| `get conditions by series` | Create tree | Returns flat list | LAW 28 |

---

## 6. Adaptive Duration Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `set and get adaptive duration` | set, get | Returns config | - |
| `one per series` | set twice | Second replaces first | LAW 29 |
| `set null removes` | set config, set null | getAdaptiveDuration = null | LAW 30 |
| `series delete cascades` | delete series | Config removed | LAW 31 |

---

## 7. Cycling Operations

### Config Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `set and get cycling config` | set, get | Returns config | - |
| `one per series` | set twice | Second replaces first | LAW 32 |
| `update cycling index` | updateCyclingIndex | Index updated | - |

### Item Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `set and get items` | setCyclingItems, get | Returns items | - |
| `set replaces all` | set A, set B | Only B items | LAW 33 |
| `items ordered by position` | set out of order | Returns sorted | LAW 34 |
| `config delete cascades items` | delete config | Items deleted | LAW 35 |
| `series delete cascades config` | delete series | Config deleted | LAW 36 |

---

## 8. Instance Exception Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get exception` | create, get by key | Returns exception | - |
| `unique per series+date` | create twice same key | DuplicateKeyError | LAW 37, LAW 38 |
| `get by series` | create multiple for series | Returns all | - |
| `get in range` | create across dates | Returns in-range only | - |
| `delete exception` | create, delete | get returns null | - |
| `series delete cascades` | delete series | Exceptions deleted | LAW 39 |

---

## 9. Completion Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get completion` | create, get | Returns completion | - |
| `completion references series` | create with invalid series | ForeignKeyError | LAW 40 |
| `series delete blocked` | create completion, delete series | ForeignKeyError | LAW 41 |
| `one per series+instance` | create twice same instance | Error | LAW 42 |
| `get by series` | create multiple | Returns all for series | - |
| `get by instance` | create, get by instance | Returns one | - |
| `delete completion` | create, delete | get returns null | - |

### Query Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `count in window` | 3 completions in window, 1 outside | 3 | LAW 43 |
| `days since last` | completion 5 days ago | 5 | - |
| `days since never` | no completions | null | LAW 44 |
| `recent durations lastN` | 5 completions, lastN=3 | Returns 3 most recent | LAW 45 |
| `recent durations windowDays` | completions over 30 days | Returns those in window | LAW 46 |

---

## 10. Tag Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create tag returns ID` | createTag('work') | Returns ID | - |
| `create existing returns same ID` | createTag twice | Same ID | LAW 47 |
| `get tag by name` | create, getByName | Returns tag | - |
| `add tag to series` | addTagToSeries | getTagsForSeries includes it | - |
| `add tag creates if needed` | add nonexistent tag | Tag created | LAW 48 |
| `no duplicate associations` | add same tag twice | Only one association | LAW 49 |
| `remove tag from series` | add, remove | Tag association gone | - |
| `series delete cascades` | delete series | Associations removed | LAW 50 |
| `tag delete cascades` | delete tag | Associations removed | LAW 51 |

---

## 11. Reminder Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get reminder` | create, get | Returns reminder | - |
| `multiple per series` | create 3 for same series | All returned | LAW 52 |
| `get by series` | create multiple | Returns all for series | - |
| `update reminder` | update minutes | New value returned | - |
| `delete reminder` | create, delete | get returns null | - |
| `series delete cascades` | delete series | Reminders deleted | LAW 53 |

---

## 12. Reminder Acknowledgment Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `acknowledge and check` | acknowledge, isAcknowledged | true | LAW 54 |
| `not acknowledged` | isAcknowledged fresh | false | - |
| `re-acknowledge idempotent` | acknowledge twice | No error | LAW 55 |
| `reminder delete cascades` | delete reminder | Acks removed | LAW 56 |
| `purge old acknowledgments` | old acks, purge | Old removed | LAW 57 |
| `get in range` | acks across dates | Returns in-range | - |

---

## 13. Relational Constraint Operations

### Unit Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get constraint` | create, get | Returns constraint | - |
| `get all constraints` | create multiple | Returns all | - |
| `delete constraint` | create, delete | get returns null | - |
| `independent of series` | delete series referenced | Constraint remains | LAW 58 |
| `soft reference by tag` | target { tag: 'x' } | Works | LAW 59 |
| `soft reference by seriesId` | target { seriesId: 'x' } | Works | LAW 59 |

---

## 14. Link Operations

### CRUD Tests

| Test Name | Operation | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `create and get link` | create, get | Returns link | - |
| `get by child` | create, getByChild | Returns link | - |
| `get by parent` | create, getByParent | Returns links | - |
| `update link` | update distances | New values | - |
| `delete link` | create, delete | get returns null | - |

### Constraint Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `one link per child` | create two links for child | Error | LAW 60 |
| `parent can have many children` | A→B, A→C | Both work | LAW 61 |
| `no self-links` | child = parent | Error | LAW 62 |
| `child delete cascades link` | delete child series | Link removed | LAW 63 |
| `parent delete blocked` | delete parent with links | ForeignKeyError | LAW 64 |
| `no cycles` | A→B→C→A | Error | LAW 65 |
| `parent must exist` | link to nonexistent parent | ForeignKeyError | LAW 66 |
| `child must exist` | link with nonexistent child | ForeignKeyError | LAW 67 |
| `max chain depth` | 33 levels | Error at 33 | LAW 68 |

---

## 15. Invariants

| Invariant | Description | Verification Method |
|-----------|-------------|---------------------|
| INV 1 | All FK relationships satisfied | Attempt orphan creation |
| INV 2 | All unique constraints enforced | Attempt duplicates |
| INV 3 | Schema CHECK constraints enforced | Invalid values rejected |
| INV 4 | CASCADE deletes work | Verify dependent deletion |
| INV 5 | RESTRICT deletes throw | Verify block on FK |
| INV 6 | Timestamps are valid ISO | Parse all timestamps |
| INV 7 | No orphaned children | Verify after operations |

---

## 16. Error Types

| Error Type | Test Scenario |
|------------|---------------|
| DuplicateKeyError | Create with existing ID |
| NotFoundError | Update/delete non-existent |
| ForeignKeyError | RESTRICT violation |
| InvalidDataError | Schema violation |

---

## 17. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Transactions | ~10 | ~10 |
| Series | ~15 | ~15 |
| Patterns | ~8 | ~8 |
| Pattern Weekdays | ~5 | ~5 |
| Conditions | ~8 | ~8 |
| Adaptive Duration | ~5 | ~5 |
| Cycling | ~10 | ~10 |
| Instance Exceptions | ~8 | ~8 |
| Completions | ~12 | ~12 |
| Tags | ~12 | ~12 |
| Reminders | ~8 | ~8 |
| Reminder Acks | ~7 | ~7 |
| Constraints | ~7 | ~7 |
| Links | ~15 | ~15 |
| Invariants | ~7 | ~7 |
| **Total** | **~127** | **~127** |

---

## 18. Test Execution Notes

- Each test should start with a fresh mock store
- Test isolation is critical - no shared state
- Verify exact data returned (not just existence)
- Test all error paths explicitly
- Use generated UUIDs for IDs in tests
- Verify CASCADE by checking all dependent entities
- Verify RESTRICT by catching specific error type
