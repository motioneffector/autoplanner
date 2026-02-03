# Autoplanner Test Inventory

Generated: 2026-02-02

## Overview

Total test files: 16 segments
Total test cases: ~1,383
Total lines: 21,458

## Test Segments

### Segment 01: Time-Date Types (01-time-date.test.ts)
- **Tests**: 165
- **Lines**: 1,175
- **Purpose**: Core time/date types with timezone handling
- **Key areas**:
  - LocalDate validation and arithmetic
  - LocalTime validation and arithmetic
  - LocalDateTime validation and composition
  - Duration type and calculations
  - Timezone conversions (DST handling)
  - Branded type safety
- **Dependencies**: None (foundation layer)
- **Audit status**: PASSED (no issues)

### Segment 02: Pattern Expansion (02-pattern-expansion.test.ts)
- **Tests**: 130
- **Lines**: 1,245
- **Purpose**: Recurrence pattern expansion to concrete instances
- **Key areas**:
  - Daily patterns
  - Weekly patterns with day selection
  - Monthly patterns (dayOfMonth, nthWeekday)
  - Yearly patterns
  - EveryNDays patterns
  - All-day event handling
  - Pattern combination and priority
- **Dependencies**: Segment 01 (Time-Date)
- **Audit status**: PASSED (no issues)

### Segment 03: Condition Evaluation (03-condition-evaluation.test.ts)
- **Tests**: 109
- **Lines**: 1,295
- **Purpose**: Boolean condition tree evaluation for pattern activation
- **Key areas**:
  - Completion count conditions (rolling windows)
  - Days since last completion
  - Weekday conditions
  - Date range conditions
  - Logical operators (and, or, not)
  - Nested condition trees
  - Edge cases (empty windows, boundaries)
- **Dependencies**: Segments 01, 02
- **Audit status**: PASSED (no issues)

### Segment 04: Adapter Interface (04-adapter.test.ts)
- **Tests**: 116
- **Lines**: 1,892
- **Purpose**: Storage adapter interface laws and mock implementation
- **Key areas**:
  - CRUD operations for all entities
  - Transaction semantics (atomicity, isolation)
  - Query operations
  - Referential integrity
  - Mock adapter implementation
- **Dependencies**: Segments 01-03
- **Audit status**: PASSED (no issues)

### Segment 05: Series CRUD (05-series-crud.test.ts)
- **Tests**: 107
- **Lines**: 1,477
- **Purpose**: Series lifecycle management
- **Key areas**:
  - Create/read/update/delete operations
  - Validation rules
  - Locking mechanism
  - Tag management
  - Series splitting
  - Pattern assignment
- **Dependencies**: Segment 04 (Adapter)
- **Audit status**: PASSED (no issues)

### Segment 06: Completions (06-completions.test.ts)
- **Tests**: 78
- **Lines**: 1,579
- **Purpose**: Task completion logging and querying
- **Key areas**:
  - Log completion with metadata
  - Actual time/duration tracking
  - Completion queries (by date, by series)
  - Rolling window counts
  - Completion deletion/correction
- **Dependencies**: Segments 04, 05
- **Audit status**: PASSED (no issues)

### Segment 07: Cycling (07-cycling.test.ts)
- **Tests**: 56
- **Lines**: 1,016
- **Purpose**: Sequential and random item cycling through series instances
- **Key areas**:
  - Sequential mode (A -> B -> C -> A...)
  - Random mode
  - gapLeap behavior (advance on skip vs only on complete)
  - Cycling state persistence
  - Wrap-around handling
- **Dependencies**: Segments 04-06
- **Audit status**: PASSED (no issues)

### Segment 08: Adaptive Duration (08-adaptive-duration.test.ts)
- **Tests**: 61
- **Lines**: 1,019
- **Purpose**: Duration calculation based on historical completion times
- **Key areas**:
  - lastN averaging mode
  - allTime averaging mode
  - Multiplier application
  - Fallback duration
  - Edge cases (no history, insufficient data)
  - Rounding behavior
- **Dependencies**: Segments 04-06
- **Audit status**: PASSED (no issues)

### Segment 09: Instance Exceptions (09-instance-exceptions.test.ts)
- **Tests**: 58
- **Lines**: 1,008
- **Purpose**: Cancel/reschedule/restore individual instances
- **Key areas**:
  - Cancel instance (skip)
  - Reschedule to new time
  - Restore canceled instance
  - Exception persistence
  - Interaction with pattern expansion
- **Dependencies**: Segments 04-06
- **Audit status**: PASSED (no issues)

### Segment 10: Reminders (10-reminders.test.ts)
- **Tests**: 61
- **Lines**: 1,135
- **Purpose**: Reminder CRUD and fire time calculation
- **Key areas**:
  - Before/after event reminders
  - Multiple reminders per series
  - Pending reminder queries
  - Acknowledgment tracking
  - All-day event reminders (fire at 23:00 previous day)
  - Fire time edge cases
- **Dependencies**: Segments 04-06
- **Audit status**: PASSED (no issues)

### Segment 11: Links (11-links.test.ts)
- **Tests**: 66
- **Lines**: 1,225
- **Purpose**: Parent-child series relationships for chained tasks
- **Key areas**:
  - Link creation with distance/wobble
  - Cycle detection (prevent circular chains)
  - Chain depth limits (max 32)
  - Cascade behavior
  - Time calculation from parent completion
- **Dependencies**: Segments 04-06
- **Audit status**: PASSED (no issues)

### Segment 12: Relational Constraints (12-relational-constraints.test.ts)
- **Tests**: 52
- **Lines**: 1,212
- **Purpose**: Inter-series scheduling constraints
- **Key areas**:
  - mustBeBefore/mustBeAfter
  - mustBeOnSameDay
  - cantBeNextTo (adjacency prevention)
  - Tag-based constraints
  - Constraint violation detection
  - Day-level vs intra-day constraints
- **Dependencies**: Segments 04-06, 11
- **Audit status**: PASSED (no issues)

### Segment 13: Reflow Algorithm (13-reflow-algorithm.test.ts)
- **Tests**: 83
- **Lines**: 1,743
- **Purpose**: Constraint satisfaction with backtracking for schedule optimization
- **Key areas**:
  - Phase 1: Fixed instance placement
  - Phase 2: Constraint satisfaction
  - Phase 3: Time optimization
  - Backtracking on contradiction
  - Soundness tests (valid output)
  - Stress tests (performance)
  - Best-effort mode (unsatisfiable constraints)
- **Dependencies**: Segments 04-06, 11, 12
- **Audit status**: PASSED (no issues)

### Segment 14: Public API (14-public-api.test.ts)
- **Tests**: 92
- **Lines**: 1,600
- **Purpose**: Consumer-facing API with timezone conversion and events
- **Key areas**:
  - Schedule generation
  - CRUD operations via API
  - Timezone conversion
  - Event emission
  - Error handling (Result types)
  - Idempotency
  - Conflict reporting
- **Dependencies**: All previous segments
- **Audit status**: PASSED (no issues)

### Segment 15: SQLite Adapter (15-sqlite-adapter.test.ts)
- **Tests**: 80
- **Lines**: 1,287
- **Purpose**: Production SQLite adapter implementation
- **Key areas**:
  - Schema creation and verification
  - Transaction implementation (IMMEDIATE)
  - Foreign key enforcement
  - Index requirements
  - Type mapping (dates, booleans, numbers)
  - Cascade verification
  - Error mapping (UNIQUE, FK, CHECK)
  - Migration support
  - Performance benchmarks
- **Dependencies**: Segment 04 (satisfies adapter interface)
- **Audit status**: PASSED (1 no-op test removed)

### Segment 16: Integration Tests (16-integration.test.ts)
- **Tests**: 69
- **Lines**: 1,550
- **Purpose**: End-to-end scenario testing
- **Key areas**:
  - Exercise regimen scenario (conditioning states)
  - Laundry chain scenario (linked tasks)
  - Conflict scenarios (fixed overlap, impossible constraints)
  - Relational constraint scenarios
  - Large data stress tests
  - Timezone scenarios (DST, cross-timezone)
  - Reminder scenarios
  - Instance exception scenarios
  - Cycling scenarios
  - Adaptive duration scenarios
  - Leap year handling
  - Chain depth limits
  - End-to-end properties
  - Adapter comparison (mock vs SQLite)
- **Dependencies**: All segments
- **Audit status**: PASSED (several incomplete assertions fixed)

## Audit Summary

All 16 segments passed the audit with the following fixes applied:

| Segment | Issues Found | Fixes Applied |
|---------|--------------|---------------|
| 01-03 | 0 | None needed |
| 04 | 11 | Fixed all completion API fields: `completedAt` → `date`/`startTime`/`endTime` |
| 05 | 3 | Fixed completion API fields in delete/split tests |
| 06-13 | 0 | None needed |
| 14 | ~10 | Fixed all `actualTime`/`actualDuration` → `startTime`/`endTime` |
| 15 | 12 | Removed LAW 25 no-op test; fixed schema column test (`completed_at` → `date`/`start_time`/`end_time`); fixed all completion API fields |
| 16 | 8 | Fixed gapLeap values (were backwards); fixed Unload time calculation (from parent END); fixed all `actualTime`/`actualDuration`; fixed chainConflict conditional assertion |

### Critical API Corrections

The original tests invented a completion API that didn't match the spec:

**Incorrect (removed):**
```typescript
{
  completedAt: LocalDateTime,    // Wrong
  actualTime: LocalDateTime,     // Wrong
  actualDuration: number,        // Wrong
}
```

**Correct (per spec):**
```typescript
{
  date: LocalDate,              // When it was completed
  startTime: LocalDateTime,     // Actual start time
  endTime: LocalDateTime,       // Actual end time
  // Duration is derived: endTime - startTime
}
```

This is critical because:
1. Chain scheduling calculates child start times from parent END time (not start)
2. Adaptive duration requires start/end to compute actual duration

## Test Quality Characteristics

The test suite demonstrates:

1. **Result Type Pattern**: Proper error handling using Ok/Err types with `.ok` checks
2. **Branded Types**: Type safety with LocalDate, LocalTime, SeriesId, etc.
3. **Invariant Testing**: Each segment includes invariant tests (INV) for critical properties
4. **Boundary Testing**: Edge cases systematically tested (empty inputs, max values, boundaries)
5. **Error Path Coverage**: Error types explicitly tested with proper assertions
6. **Integration Coverage**: Segment 16 exercises all features together in realistic scenarios

## Implementation Status

- Tests: COMPLETE (1,383 test cases defined)
- Source implementation: NOT STARTED (only src/index.ts exists)
- Test execution: BLOCKED (waiting for implementation)

Once implementation files are created, run:
```bash
npm run test:run
```
