# Segment 15: SQLite Adapter — Formal Specification

## 1. Overview

The SQLite adapter is the production implementation of the adapter interface. It must satisfy all laws from Segment 4 plus SQLite-specific requirements.

---

## 2. Implementation Requirements

### 2.1 Driver Compatibility

```
Supported drivers:
- bun:sqlite (primary target)
- better-sqlite3 (Node.js compatibility)

Interface: Synchronous (both drivers are sync)
```

### 2.2 Schema Creation

```
createSchema(): void

Postconditions:
- All tables from schema.md created
- All indices created
- All foreign key constraints active
- All CHECK constraints active
```

---

## 3. Transaction Implementation

```
transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
```

### 3.1 Properties

```
LAW 1: BEGIN IMMEDIATE prevents write starvation
LAW 2: Nested transactions flatten (savepoints optional enhancement)
LAW 3: Rollback restores exact prior state
LAW 4: Commit is durable
```

---

## 4. Foreign Key Enforcement

### 4.1 Enabling Foreign Keys

```
// Must be enabled per connection
db.exec('PRAGMA foreign_keys = ON')
```

### 4.2 Properties

```
LAW 5: Foreign keys enabled on every connection
LAW 6: RESTRICT prevents deletion of referenced rows
LAW 7: CASCADE deletes dependent rows
LAW 8: Foreign key errors throw ForeignKeyError
```

---

## 5. Index Requirements

### 5.1 Required Indices

```
idx_condition_series ON condition(series_id)
idx_condition_parent ON condition(parent_id)
idx_pattern_series ON pattern(series_id)
idx_pattern_condition ON pattern(condition_id)
idx_completion_series ON completion(series_id)
idx_completion_date ON completion(date)
idx_completion_instance ON completion(series_id, instance_date)
idx_reminder_series ON reminder(series_id)
idx_reminder_ack_time ON reminder_acknowledgment(acknowledged_at)
idx_link_parent ON link(parent_series_id)
```

### 5.2 Properties

```
LAW 9: All indices exist after schema creation
LAW 10: Indices improve query performance (not correctness)
```

---

## 6. Query Implementation

### 6.1 Prepared Statements

```
// All queries should use prepared statements
const stmt = db.prepare('SELECT * FROM series WHERE id = ?')
stmt.get(id)
```

### 6.2 Properties

```
LAW 11: Prepared statements prevent SQL injection
LAW 12: Statements can be reused for performance
```

---

## 7. Type Mapping

### 7.1 SQLite to TypeScript

```
TEXT → string
INTEGER → number
REAL → number
NULL → null

Boolean: INTEGER 0/1 → boolean
Date: TEXT ISO 8601 → string
DateTime: TEXT ISO 8601 → string
```

### 7.2 Properties

```
LAW 13: Dates stored as ISO 8601 TEXT
LAW 14: Booleans stored as INTEGER 0 or 1
LAW 15: No implicit type coercion
```

---

## 8. Completion Query Implementation

### 8.1 Count in Window

```sql
SELECT COUNT(*) FROM completion c
JOIN series_tag st ON c.series_id = st.series_id
JOIN tag t ON st.tag_id = t.id
WHERE t.name = ?
AND c.date >= date(?, '-' || ? || ' days', '+1 day')
AND c.date <= ?
```

### 8.2 Days Since Last

```sql
SELECT julianday(?) - julianday(MAX(date)) as days
FROM completion c
JOIN series_tag st ON c.series_id = st.series_id
JOIN tag t ON st.tag_id = t.id
WHERE t.name = ?
```

### 8.3 Properties

```
LAW 16: Window calculations use SQLite date functions
LAW 17: NULL returned when no completions exist
LAW 18: Fractional days truncated to integer
```

---

## 9. Cascade Verification

### 9.1 Series Deletion Cascade

```
DELETE FROM series WHERE id = ?

Cascades to:
- adaptive_duration
- cycling_config → cycling_item
- condition (tree)
- pattern → pattern_weekday
- instance_exception
- series_tag
- reminder → reminder_acknowledgment
- link (as child)

Blocked by:
- completion (RESTRICT)
- link (as parent, RESTRICT)
```

### 9.2 Properties

```
LAW 19: All cascade deletes happen atomically
LAW 20: Cascade respects foreign key order
LAW 21: RESTRICT checked before CASCADE
```

---

## 10. Error Mapping

### 10.1 SQLite to Domain Errors

```
SQLITE_CONSTRAINT_UNIQUE → DuplicateKeyError
SQLITE_CONSTRAINT_FOREIGNKEY → ForeignKeyError
SQLITE_CONSTRAINT_CHECK → InvalidDataError
SQLITE_NOTFOUND → NotFoundError
```

### 10.2 Properties

```
LAW 22: All SQLite errors mapped to domain errors
LAW 23: Original error preserved in cause
LAW 24: Error messages include context
```

---

## 11. Performance Requirements

### 11.1 Benchmarks

```
createSeries: < 10ms
getSeries: < 1ms
getSchedule (1 week, 50 series): < 100ms
countCompletionsInWindow: < 5ms
```

### 11.2 Properties

```
LAW 25: Performance targets are guidelines, not hard requirements
LAW 26: Correctness never sacrificed for performance
```

---

## 12. Migration Support

### 12.1 Schema Versioning

```
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

### 12.2 Properties

```
LAW 27: Schema version tracked
LAW 28: Migrations run in order
LAW 29: Failed migrations roll back
```

---

## 13. Invariants

```
INV 1: Foreign keys always enabled
INV 2: All constraints enforced
INV 3: Transactions are ACID
INV 4: No data loss on rollback
INV 5: Schema matches specification
```

---

## 14. Verification Strategy

### 14.1 Schema tests

- All tables exist
- All columns have correct types
- All constraints active
- All indices exist

### 14.2 Adapter interface tests

- Run all Segment 4 tests against SQLite adapter
- Must pass identically to mock

### 14.3 Foreign key tests

- RESTRICT prevents deletion
- CASCADE deletes dependents
- Proper error types

### 14.4 Transaction tests

- Commit persists
- Rollback restores
- Nested behavior

### 14.5 Performance tests

- Benchmark key operations
- Test with realistic data volumes

---

## 15. Dependencies

- Segment 4: Adapter Interface (must implement)
- bun:sqlite or better-sqlite3
