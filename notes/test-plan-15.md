# Test Plan: Segment 15 — SQLite Adapter

## Overview

The SQLite adapter is the production implementation of the adapter interface. It must satisfy all laws from Segment 4 plus SQLite-specific requirements.

**Test file**: `tests/15-sqlite-adapter.test.ts`

**Dependencies**: Segment 4 (Adapter Interface)

---

## 1. Schema Creation

### 1.1 Table Existence Tests

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `all tables created` | createSchema | All tables from schema.md exist |
| `series table exists` | check schema | Table with correct columns |
| `pattern table exists` | check schema | Table with correct columns |
| `condition table exists` | check schema | Table with correct columns |
| `completion table exists` | check schema | Table with correct columns |
| `all entity tables created` | enumerate | All tables present |

### 1.2 Constraint Verification

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `foreign keys active` | PRAGMA foreign_keys | Returns 1 |
| `CHECK constraints active` | insert invalid data | Rejected |
| `UNIQUE constraints active` | insert duplicate | Rejected |

---

## 2. Transaction Implementation

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `BEGIN IMMEDIATE used` | start transaction | Write lock acquired | LAW 1 |
| `nested transactions flatten` | tx inside tx | Single transaction | LAW 2 |
| `rollback restores prior state` | tx fails | Data unchanged | LAW 3 |
| `commit is durable` | commit, reopen DB | Data persists | LAW 4 |

---

## 3. Foreign Key Enforcement

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `foreign keys enabled` | new connection | Enabled | LAW 5 |
| `RESTRICT prevents deletion` | delete with references | Error | LAW 6 |
| `CASCADE deletes dependents` | delete parent | Dependents gone | LAW 7 |
| `FK errors throw ForeignKeyError` | violate FK | ForeignKeyError | LAW 8 |

---

## 4. Index Requirements

### 4.1 Index Existence Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `idx_condition_series exists` | check indices | Exists | LAW 9 |
| `idx_condition_parent exists` | check indices | Exists | LAW 9 |
| `idx_pattern_series exists` | check indices | Exists | LAW 9 |
| `idx_pattern_condition exists` | check indices | Exists | LAW 9 |
| `idx_completion_series exists` | check indices | Exists | LAW 9 |
| `idx_completion_date exists` | check indices | Exists | LAW 9 |
| `idx_completion_instance exists` | check indices | Exists | LAW 9 |
| `idx_reminder_series exists` | check indices | Exists | LAW 9 |
| `idx_reminder_ack_time exists` | check indices | Exists | LAW 9 |
| `idx_link_parent exists` | check indices | Exists | LAW 9 |

### 4.2 Index Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `indices improve queries` | EXPLAIN QUERY PLAN | Uses index | LAW 10 |

---

## 5. Query Implementation

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `prepared statements used` | SQL injection attempt | Escaped safely | LAW 11 |
| `statements reusable` | call same query twice | Works efficiently | LAW 12 |

---

## 6. Type Mapping

### Unit Tests

| Test Name | SQLite Type | TS Type | Laws Verified |
|-----------|-------------|---------|---------------|
| `dates as ISO 8601` | TEXT | string | LAW 13 |
| `booleans as 0/1` | INTEGER | boolean | LAW 14 |
| `no implicit coercion` | store number | Retrieved as number | LAW 15 |

---

## 7. Completion Query Implementation

### 7.1 Count in Window Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `count uses date functions` | query explain | Uses SQLite dates | LAW 16 |
| `count accurate` | 5 in window | Returns 5 | - |
| `window boundaries correct` | edge dates | Correct inclusion/exclusion | - |

### 7.2 Days Since Last Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `NULL when no completions` | empty series | Returns null | LAW 17 |
| `fractional days truncated` | 2.7 days | Returns 2 | LAW 18 |
| `exact days` | exactly 5 days | Returns 5 | - |

---

## 8. Cascade Verification

### 8.1 Series Deletion Cascades

| Test Name | Entity | Expected | Laws Verified |
|-----------|--------|----------|---------------|
| `cascades adaptive_duration` | delete series | Config deleted | LAW 19 |
| `cascades cycling_config` | delete series | Config deleted | LAW 19 |
| `cascades cycling_item` | delete series | Items deleted | LAW 19 |
| `cascades condition` | delete series | Conditions deleted | LAW 19 |
| `cascades pattern` | delete series | Patterns deleted | LAW 19 |
| `cascades pattern_weekday` | delete series | Weekdays deleted | LAW 19 |
| `cascades instance_exception` | delete series | Exceptions deleted | LAW 19 |
| `cascades series_tag` | delete series | Tags removed | LAW 19 |
| `cascades reminder` | delete series | Reminders deleted | LAW 19 |
| `cascades reminder_ack` | delete series | Acks deleted | LAW 19 |
| `cascades child link` | delete series | Link as child deleted | LAW 19 |

### 8.2 RESTRICT Blocks Deletion

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `blocked by completion` | series has completion | Error | LAW 21 |
| `blocked by parent link` | series is parent | Error | LAW 21 |

### 8.3 Cascade Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `cascades atomically` | delete in tx | All or nothing | LAW 19 |
| `respects FK order` | complex cascade | Correct order | LAW 20 |
| `RESTRICT before CASCADE` | mixed constraints | RESTRICT checked first | LAW 21 |

---

## 9. Error Mapping

### Unit Tests

| SQLite Error | Expected Domain Error | Laws Verified |
|--------------|----------------------|---------------|
| SQLITE_CONSTRAINT_UNIQUE | DuplicateKeyError | LAW 22 |
| SQLITE_CONSTRAINT_FOREIGNKEY | ForeignKeyError | LAW 22 |
| SQLITE_CONSTRAINT_CHECK | InvalidDataError | LAW 22 |
| SQLITE_NOTFOUND | NotFoundError | LAW 22 |

### Error Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `original error in cause` | mapped error | SQLite error in cause | LAW 23 |
| `messages include context` | error message | Table/column info | LAW 24 |

---

## 10. Performance Tests

### Benchmark Tests

| Operation | Target | Laws Verified |
|-----------|--------|---------------|
| createSeries | < 10ms | LAW 25 |
| getSeries | < 1ms | LAW 25 |
| getSchedule (50 series, 1 week) | < 100ms | LAW 25 |
| countCompletionsInWindow | < 5ms | LAW 25 |

### Performance Properties

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `performance guidelines` | documented | Not hard limits | LAW 25 |
| `correctness over performance` | slow but correct | Still correct | LAW 26 |

---

## 11. Migration Support

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `schema_version table exists` | createSchema | Table created | LAW 27 |
| `version tracked` | apply migration | Version updated | LAW 27 |
| `migrations run in order` | multiple migrations | Sequential | LAW 28 |
| `failed migrations roll back` | migration fails | No partial changes | LAW 29 |

---

## 12. Adapter Interface Compatibility

### Re-run Segment 4 Tests

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `all Segment 4 tests pass` | run adapter tests | All green |
| `transaction semantics match` | tx tests | Same behavior as mock |
| `CRUD operations match` | CRUD tests | Same behavior as mock |
| `cascade behavior matches` | cascade tests | Same behavior as mock |
| `query results match` | query tests | Same behavior as mock |

---

## 13. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `foreign keys always enabled` | Check every connection |
| INV 2 | `all constraints enforced` | Attempt violations |
| INV 3 | `transactions are ACID` | Verify atomicity, isolation |
| INV 4 | `no data loss on rollback` | Verify exact restoration |
| INV 5 | `schema matches specification` | Compare to schema.md |

---

## 14. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Schema Creation | ~8 | ~8 |
| Transaction Implementation | ~4 | ~4 |
| Foreign Key Enforcement | ~4 | ~4 |
| Index Requirements | ~11 | ~11 |
| Query Implementation | ~2 | ~2 |
| Type Mapping | ~3 | ~3 |
| Completion Queries | ~5 | ~5 |
| Cascade Verification | ~15 | ~15 |
| Error Mapping | ~6 | ~6 |
| Performance Tests | ~6 | ~6 |
| Migration Support | ~4 | ~4 |
| Interface Compatibility | ~5 | ~5 |
| Invariants | ~5 | ~5 |
| **Total** | **~78** | **~78** |

---

## 15. Test Execution Notes

- Test with both bun:sqlite and better-sqlite3 if both targets required
- Use fresh in-memory database for each test
- Verify foreign keys enabled after each connection
- Run Segment 4 tests verbatim against SQLite adapter
- Profile performance with realistic data volumes
- Test cascade order with complex entity graphs
- Verify error mapping with deliberate constraint violations
- Test migration rollback by injecting failures
