# Architecture Decisions

## Critical Context

**This system is life-critical.** It will be used in caretaker applications where failure means people may die. No shortcuts. No lazy options. Every decision must prioritize reliability, correctness, and auditability.

## Database

### Adapter Pattern
- **Thick adapter**: Adapter implements domain methods (`getCompletions()`, `saveSeries()`, etc.), not just raw SQL
- Library is SQL-dialect-agnostic
- Consumer provides adapter for their driver (bun:sqlite, better-sqlite3, etc.)

### Transaction Support
- Adapter must support transactions
- Atomic operations for multi-step changes (create series + link + constraints)

### Schema
- **Fully normalized**: No JSON blobs. Every pattern, condition, reminder, constraint, and relationship gets proper tables with proper foreign keys, proper indices, and proper integrity constraints.
- Schema must be auditable and queryable
- Instance exceptions stored in dedicated exceptions table keyed by series + instance ID

## Schedule Computation

### When
- Computed on query for the requested window
- No precomputation
- Must be performant enough for real-time use

### Reflow
- Triggered by any change
- Constraint satisfaction with backtracking (see reflow-algorithm.md)
- Soundness guarantee: if valid arrangement exists, we find it

## Unified Model

**Everything is a Series.** No separate Entry concept at the API level.

- A one-time event is a Series with a single instance
- Consumer thinks in terms of **Series** (definitions) and **Instances** (occurrences)
- Simplifies mental model and API

### Instance Identification
- Instances are identified by `(series_id, instance_date)`
- No separate instance ID

## Data Separation

### Calendar (Series)
- The future: what's planned
- Series definitions, patterns, constraints, relationships

### Completions
- The past: what actually happened
- Separate database/tables
- Records: series ID, instance date, actual start time, actual end time
- Conditions query completions to affect future scheduling
