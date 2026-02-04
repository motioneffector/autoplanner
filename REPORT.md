# ClaudeCatcher WEAK_ASSERTION Violations Report

**Generated:** 2026-02-04
**Total Violations:** 148
**Files Affected:** 27

---

## Summary by File

| File | Violations |
|------|------------|
| tests/04-adapter.test.ts | 17 |
| tests/fuzz/integration/stress.test.ts | 15 |
| tests/13-reflow-algorithm.test.ts | 15 |
| tests/16-integration.test.ts | 13 |
| tests/10-reminders.test.ts | 11 |
| tests/fuzz/generators/patterns.test.ts | 7 |
| tests/fuzz/properties/series.test.ts | 7 |
| tests/fuzz/invariants/invariants.test.ts | 6 |
| tests/fuzz/properties/completions.test.ts | 6 |
| tests/fuzz/shrinking/shrinking.test.ts | 6 |
| tests/12-relational-constraints.test.ts | 5 |
| tests/15-sqlite-adapter.test.ts | 5 |
| tests/05-series-crud.test.ts | 4 |
| tests/14-public-api.test.ts | 4 |
| tests/fuzz/properties/instances.test.ts | 4 |
| tests/fuzz/properties/pattern-crud.test.ts | 4 |
| tests/fuzz/generators/domain.test.ts | 3 |
| tests/11-links.test.ts | 3 |
| tests/06-completions.test.ts | 2 |
| tests/09-instance-exceptions.test.ts | 2 |
| tests/fuzz/properties/constraints.test.ts | 2 |
| tests/fuzz/properties/transactions.test.ts | 2 |
| tests/07-cycling.test.ts | 1 |
| tests/fuzz/lib/harness.test.ts | 1 |
| tests/fuzz/properties/links.test.ts | 1 |
| tests/fuzz/properties/reflow.test.ts | 1 |
| tests/fuzz/properties/temporal.test.ts | 1 |

---

## Detailed Violation List

### tests/04-adapter.test.ts (17 violations)

1. **Line 396** - `it('delete cascades patterns')`
   - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

2. **Line 399** - `it('delete cascades patterns')`
   - Pattern: toEqual([]) only verifies the result is empty

3. **Line 506** - `it('delete pattern cascades weekdays')`
   - Pattern: toEqual([]) only verifies the result is empty

4. **Line 561** - `it('pattern delete cascades weekdays')`
   - Pattern: toEqual([]) only verifies the result is empty

5. **Line 917** - `it('config delete cascades items')`
   - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

6. **Line 920** - `it('config delete cascades items')`
   - Pattern: toEqual([]) only verifies the result is empty

7. **Line 934** - `it('series delete cascades config and items')`
   - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

8. **Line 940** - `it('series delete cascades config and items')`
   - Pattern: toEqual([]) only verifies the result is empty

9. **Line 1058** - `it('series delete cascades exceptions')`
   - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

10. **Line 1061** - `it('series delete cascades exceptions')`
    - Pattern: toEqual([]) only verifies the result is empty

11. **Line 1318** - `it('create tag returns ID')`
    - Pattern: toBeGreaterThanOrEqual(1) on length only checks non-empty

12. **Line 1379** - `it('series delete cascades tag associations')`
    - Pattern: toHaveLength(0) only verifies the result is empty

13. **Line 1490** - `it('series delete cascades reminders')`
    - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

14. **Line 1493** - `it('series delete cascades reminders')`
    - Pattern: toEqual([]) only verifies the result is empty

15. **Line 1538** - `it('reminder delete cascades acks')`
    - Pattern: Length check alone doesn't verify the actual data - an array of 1 wrong items passes

16. **Line 1541** - `it('reminder delete cascades acks')`
    - Pattern: toEqual([]) only verifies the result is empty

17. **Line 2052** - `it('INV 7: No orphaned children after operations')`
    - Pattern: toHaveLength(0) only verifies the result is empty

---

### tests/05-series-crud.test.ts (4 violations)

1. **Line 1036** - `it('delete cascades patterns')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 1058** - `it('delete cascades conditions')`
   - Pattern: Checking length === 0 only verifies the result is empty

3. **Line 1071** - `it('delete cascades reminders')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 1367** - `it('new series has no completions')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/06-completions.test.ts (2 violations)

1. **Line 481** - `it('completions outside window')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 669** - `it('getByInstance after delete')`
   - Pattern: toEqual([]) only verifies the result is empty

---

### tests/07-cycling.test.ts (1 violation)

1. **Line 861** - `it('cycling optional')`
   - Pattern: toHaveProperty('cycling') only verifies the property exists, not its value

---

### tests/09-instance-exceptions.test.ts (2 violations)

1. **Line 843** - `it('INV 5: series delete cascades')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 1039** - `it('cancel week of instances')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/10-reminders.test.ts (11 violations)

1. **Line 206** - `it('delete existing reminder')`
   - Pattern: toHaveLength(0) only verifies the result is empty

2. **Line 227** - `it('delete cascades acknowledgments')`
   - Pattern: toHaveLength(0) only verifies the result is empty

3. **Line 240** - `it('series delete cascades reminders')`
   - Pattern: toHaveLength(0) only verifies the result is empty

4. **Line 266** - `it('reminder not yet due')`
   - Pattern: toHaveLength(0) only verifies the result is empty

5. **Line 326** - `it('acknowledged not in pending')`
   - Pattern: toHaveLength(0) only verifies the result is empty

6. **Line 362** - `it('cancelled instance excluded')`
   - Pattern: toHaveLength(0) only verifies the result is empty

7. **Line 385** - `it('completed instance excluded')`
   - Pattern: toHaveLength(0) only verifies the result is empty

8. **Line 760** - `it('not original time')`
   - Pattern: toHaveLength(0) only verifies the result is empty

9. **Line 895** - `it('B5: cancelled no reminder')`
   - Pattern: toHaveLength(0) only verifies the result is empty

10. **Line 1062** - `it('15-min meeting reminder early')`
    - Pattern: toHaveLength(0) only verifies the result is empty

11. **Line 1086** - `it('acknowledge dismisses')`
    - Pattern: toHaveLength(0) only verifies the result is empty

---

### tests/11-links.test.ts (3 violations)

1. **Line 286** - `it('unlink removes relationship')`
   - Pattern: toEqual([]) only verifies the result is empty

2. **Line 304** - `it('unlinked child independent')`
   - Pattern: toEqual([]) only verifies the result is empty

3. **Line 823** - `it('delete child cascades link')`
   - Pattern: toEqual([]) only verifies the result is empty

---

### tests/12-relational-constraints.test.ts (5 violations)

1. **Line 76** - `it('add constraint returns ID')`
   - Pattern: expect(typeof result.value.id).toBe('string') only confirms it's a string

2. **Line 187** - `it('delete constraint')`
   - Pattern: 'toBeDefined' alone only confirms null/undefined status

3. **Line 193** - `it('delete constraint')`
   - Pattern: toBe(null) alone only confirms null/undefined status

4. **Line 978** - `it('violation includes description')`
   - Pattern: expect(typeof violations[0].description).toBe('string') only confirms it's a string

5. **Line 1110** - `it('INV 1: withinMinutes only for mustBeWithin')`
   - Pattern: toHaveProperty('withinMinutes') only verifies the property exists, not its value

---

### tests/13-reflow-algorithm.test.ts (15 violations)

1. **Line 163** - `it('cancelled excluded - cancelled instance not generated')`
   - Pattern: toHaveLength(0) only verifies the result is empty

2. **Line 225** - `it('pattern inactive when condition false - instances not generated')`
   - Pattern: toHaveLength(0) only verifies the result is empty

3. **Line 288** - `it('domain bounded by wiggle days - daysBefore=1 daysAfter=1 gives 3 days')`
   - Pattern: toBeGreaterThan(0) on length only checks non-empty

4. **Line 308** - `it('domain bounded by time window - only those hours')`
   - Pattern: toBeGreaterThan(0) on length only checks non-empty

5. **Line 331** - `it('domain discretized - 5-minute increments')`
   - Pattern: toBeGreaterThan(0) on length only checks non-empty

6. **Line 1338** - `it('INV 3: chain bounds are hard constraints')`
   - Pattern: 'toBeNull' alone only confirms null/undefined status

7. **Line 1385** - `it('simple daily schedule - 5 daily series non-overlapping')`
   - Pattern: toHaveLength(0) only verifies the result is empty

8. **Line 1490** - `it('multiple chains - both chains scheduled')`
   - Pattern: toHaveLength(0) only verifies the result is empty

9. **Line 1532** - `it('near-conflict - tight fit solution found')`
   - Pattern: toHaveLength(0) only verifies the result is empty

10. **Line 1595** - `it('complex constraint network - correct result')`
    - Pattern: toHaveLength(0) only verifies the result is empty

11. **Line 1680** - `it('two non-overlapping - both at ideal times')`
    - Pattern: toHaveLength(0) only verifies the result is empty

12. **Line 1790** - `it('arc consistency reduces space - domain shrinks after propagation')`
    - Pattern: Length check alone doesn't verify the actual data - an array of 5 wrong items passes

13. **Line 1794** - `it('arc consistency reduces space - domain shrinks after propagation')`
    - Pattern: toBeLessThan() on length only sets an upper bound

14. **Line 1823** - `it('MRV finds conflicts early - fast failure on unsolvable')`
    - Pattern: 'toBeNull' alone only confirms null/undefined status

15. **Line 1863** - `it('correctness over performance - correct result always')`
    - Pattern: toHaveLength(0) only verifies the result is empty

---

### tests/14-public-api.test.ts (4 violations)

1. **Line 707** - `it('errors have messages - descriptive string')`
   - Pattern: expect(typeof e.message).toBe('string') only confirms it's a string

2. **Line 1289** - `it('unlinkSeries removes link - link removed')`
   - Pattern: toHaveProperty('parentId') only verifies the property exists, not its value

3. **Line 1431** - `it('deleteCompletion removes - completion gone')`
   - Pattern: toEqual([]) only verifies the result is empty

4. **Line 1707** - `it('conditional pattern activation - condition changes pattern activates schedule updates')`
   - Pattern: toEqual([]) only verifies the result is empty

---

### tests/15-sqlite-adapter.test.ts (5 violations)

1. **Line 328** - `it('CASCADE deletes dependents - delete parent removes children')`
   - Pattern: toHaveLength(0) only verifies the result is empty

2. **Line 942** - `it('respects FK order - complex cascade correct order')`
   - Pattern: toHaveLength(0) only verifies the result is empty

3. **Line 944** - `it('respects FK order - complex cascade correct order')`
   - Pattern: toHaveLength(0) only verifies the result is empty

4. **Line 1033** - `it('original error in cause - SQLite error in cause')`
   - Pattern: 'toBeDefined' alone only confirms null/undefined status

5. **Line 1297** - `it('cascade behavior matches - same behavior as mock')`
   - Pattern: toHaveLength(0) only verifies the result is empty

---

### tests/16-integration.test.ts (13 violations)

1. **Line 161** - `it('initial state - walks every other day, no weights')`
   - Pattern: toEqual([]) only verifies the result is empty

2. **Line 302** - `it('conditions update immediately after completion')`
   - Pattern: toEqual([]) only verifies the result is empty

3. **Line 321** - `it('multiple state transitions work correctly')`
   - Pattern: toEqual([]) only verifies the result is empty

4. **Line 402** - `it('PROP 5: cycling preserved across pattern deactivation/reactivation')`
   - Pattern: toEqual([]) only verifies the result is empty

5. **Line 918** - `it('remove cantBeNextTo - heavy can be adjacent')`
   - Pattern: toEqual([]) only verifies the result is empty

6. **Line 1160** - `it('all-day excluded from reflow - no time conflicts')`
   - Pattern: toEqual([]) only verifies the result is empty

7. **Line 1191** - `it('12:55 - no pending reminders')`
   - Pattern: toEqual([]) only verifies the result is empty

8. **Line 1214** - `it('after ack - prepare not pending')`
   - Pattern: Checking length === 0 only verifies the result is empty

9. **Line 1258** - `it('cancel Monday - that Monday not in schedule')`
   - Pattern: toEqual([]) only verifies the result is empty

10. **Line 1260** - `it('cancel Monday - that Monday not in schedule')`
    - Pattern: toEqual([]) only verifies the result is empty

11. **Line 1298** - `it('check original Monday - slot free')`
    - Pattern: toEqual([]) only verifies the result is empty

12. **Line 1494** - `it('non-leap year Feb 29 - no instance')`
    - Pattern: toEqual([]) only verifies the result is empty

13. **Line 1576** - `it('E2E 1: all features together - complex scenario passes')`
    - Pattern: toEqual([]) only verifies the result is empty

---

### tests/fuzz/generators/domain.test.ts (3 violations)

1. **Line 319** - `it('generates minimal series with required fields')`
   - Pattern: toEqual([]) only verifies the result is empty

2. **Line 340** - `it('generates full series with all fields')`
   - Pattern: 'toBeUndefined' alone only confirms null/undefined status

3. **Line 451** - `it('generates valid relational constraints')`
   - Pattern: toHaveProperty('withinMinutes') only verifies the property exists, not its value

---

### tests/fuzz/generators/patterns.test.ts (7 violations)

1. **Line 191** - `it('generates custom patterns with non-empty date arrays')`
   - Pattern: expect(typeof pattern.dates[0]).toBe('string') only confirms it's a string

2. **Line 215** - `it('generates activeOnDates patterns with valid structure')`
   - Pattern: expect(typeof pattern.base.type).toBe('string') only confirms it's a string

3. **Line 217** - `it('generates activeOnDates patterns with valid structure')`
   - Pattern: expect(typeof pattern.dates[0]).toBe('string') only confirms it's a string

4. **Line 228** - `it('generates inactiveOnDates patterns with valid structure')`
   - Pattern: expect(typeof pattern.base.type).toBe('string') only confirms it's a string

5. **Line 230** - `it('generates inactiveOnDates patterns with valid structure')`
   - Pattern: expect(typeof pattern.dates[0]).toBe('string') only confirms it's a string

6. **Line 271** - `it('generates valid boundary patterns')`
   - Pattern: expect(typeof pattern.type).toBe('string') only confirms it's a string

7. **Line 284** - `it('generates valid patterns with realistic distribution')`
   - Pattern: 'toBeDefined' alone only confirms null/undefined status

---

### tests/fuzz/integration/stress.test.ts (15 violations)

1. **Line 421** - `it('Property #480: flexible items with no valid slots')`
   - Pattern: expect(typeof result.conflict).toBe('string') only confirms it's a string

2. **Line 1784** - `it('Test #462: split → completions stay with original')`
   - Pattern: expect(typeof splitResult.newSeriesId).toBe('string') only confirms it's a string

3. **Line 1794** - `it('Test #462: split → completions stay with original')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 1871** - `it('split with multiple completions distributes correctly')`
   - Pattern: toEqual([]) only verifies the result is empty

5. **Line 2188** - `it('Property #408: dates stored as ISO 8601 TEXT')`
   - Pattern: expect(typeof stored?.instanceDate).toBe('string') only confirms it's a string

6. **Line 2262** - `it('Property #409: booleans stored as INTEGER 0/1')`
   - Pattern: expect(typeof stored?.isFixed).toBe('number') only confirms it's numeric

7. **Line 3132** - `it('Test #465: cycling advancement across pattern deactivation')`
   - Pattern: 'toBeNull' alone only confirms null/undefined status

8. **Line 4267** - `it('Property #467: genSolvableSchedule produces solvable inputs')`
   - Pattern: expect(typeof slot.itemId).toBe('string') only confirms it's a string

9. **Line 4268** - `it('Property #467: genSolvableSchedule produces solvable inputs')`
   - Pattern: expect(typeof slot.start).toBe('number') only confirms it's numeric

10. **Line 4269** - `it('Property #467: genSolvableSchedule produces solvable inputs')`
    - Pattern: expect(typeof slot.end).toBe('number') only confirms it's numeric

11. **Line 4290** - `it('Property #468: genUnsolvableSchedule produces unsolvable inputs')`
    - Pattern: expect(typeof result.conflicts![0]).toBe('string') only confirms it's a string

12. **Line 4291** - `it('Property #468: genUnsolvableSchedule produces unsolvable inputs')`
    - Pattern: expect(typeof contradiction).toBe('string') only confirms it's a string

13. **Line 4336** - `it('Property #472: unsolvable inputs report conflicts')`
    - Pattern: expect(typeof conflict).toBe('string') only confirms it's a string

14. **Line 4644** - `it('Property #414: SQLite errors mapped to domain errors')`
    - Pattern: expect(typeof domainError.type).toBe('string') only confirms it's a string

15. **Line 4645** - `it('Property #414: SQLite errors mapped to domain errors')`
    - Pattern: expect(typeof domainError.message).toBe('string') only confirms it's a string

---

### tests/fuzz/invariants/invariants.test.ts (6 violations)

1. **Line 49** - `it('Property #417: valid dates pass dateIsValid')`
   - Pattern: toEqual([]) only verifies the result is empty

2. **Line 75** - `it('Property #418: valid times pass timeIsValid')`
   - Pattern: toEqual([]) only verifies the result is empty

3. **Line 99** - `it('Property #419: valid dateTimes pass dateTimeIsValid')`
   - Pattern: toEqual([]) only verifies the result is empty

4. **Line 111** - `it('Property #420: positive durations pass durationIsPositive')`
   - Pattern: toEqual([]) only verifies the result is empty

5. **Line 137** - `it('Property #423: valid completions pass completionEndAfterStart')`
   - Pattern: toEqual([]) only verifies the result is empty

6. **Line 610** - `it('passing state produces clean report')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/lib/harness.test.ts (1 violation)

1. **Line 47** - `it('handles multiple arbitraries')`
   - Pattern: toBeGreaterThanOrEqual(0) on length only checks non-empty

---

### tests/fuzz/properties/completions.test.ts (6 violations)

1. **Line 193** - `it('Property #269: deleteCompletion removes it')`
   - Pattern: 'toBeUndefined' alone only confirms null/undefined status

2. **Line 331** - `it('boundary completions are well-formed')`
   - Pattern: expect(typeof completion.id).toBe('string') only confirms it's a string

3. **Line 332** - `it('boundary completions are well-formed')`
   - Pattern: expect(typeof completion.seriesId).toBe('string') only confirms it's a string

4. **Line 333** - `it('boundary completions are well-formed')`
   - Pattern: expect(typeof completion.instanceDate).toBe('string') only confirms it's a string

5. **Line 334** - `it('boundary completions are well-formed')`
   - Pattern: expect(typeof completion.startTime).toBe('string') only confirms it's a string

6. **Line 335** - `it('boundary completions are well-formed')`
   - Pattern: expect(typeof completion.endTime).toBe('string') only confirms it's a string

---

### tests/fuzz/properties/constraints.test.ts (2 violations)

1. **Line 374** - `it('Property #357: withinMinutes required iff type = mustBeWithin')`
   - Pattern: expect(typeof constraint.withinMinutes).toBe('number') only confirms it's numeric

2. **Line 409** - `it('boundary constraints are well-formed')`
   - Pattern: expect(typeof constraint.withinMinutes).toBe('number') only confirms it's numeric

---

### tests/fuzz/properties/instances.test.ts (4 violations)

1. **Line 124** - `it('Property #314: cancelInstance excludes from schedule')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 224** - `it('Property #321: restoreInstance un-cancels')`
   - Pattern: Checking length === 0 only verifies the result is empty

3. **Line 353** - `it('Property #360: instances respect series bounds')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 380** - `it('Property #361: cancelled instances excluded from bounded schedule')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/properties/links.test.ts (1 violation)

1. **Line 260** - `it('Property #344: unlink then delete parent succeeds')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/properties/pattern-crud.test.ts (4 violations)

1. **Line 155** - `it('Property #265: deletePattern removes from series')`
   - Pattern: toEqual([]) only verifies the result is empty

2. **Line 255** - `it('deleteConditionsForSeries removes all conditions')`
   - Pattern: Checking length === 0 only verifies the result is empty

3. **Line 286** - `it('patterns and conditions for different series are independent')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 289** - `it('patterns and conditions for different series are independent')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/properties/reflow.test.ts (1 violation)

1. **Line 1440** - `it('Property #372: completeness — if valid arrangement exists, finds one')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/properties/series.test.ts (7 violations)

1. **Line 424** - `it('Property #284: splitSeries sets original endDate')`
   - Pattern: expect(typeof original?.bounds?.endDate).toBe('string') only confirms it's a string

2. **Line 647** - `it('Property #253: deleteSeries cascades to patterns')`
   - Pattern: Checking length === 0 only verifies the result is empty

3. **Line 673** - `it('Property #254: deleteSeries cascades to conditions')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 781** - `it('Property #255: deleteSeries cascades to reminders')`
   - Pattern: Checking length === 0 only verifies the result is empty

5. **Line 879** - `it('Property #256: deleteSeries cascades to instance exceptions')`
   - Pattern: Checking length === 0 only verifies the result is empty

6. **Line 908** - `it('exception cascade includes both cancelled and rescheduled')`
   - Pattern: Checking length === 0 only verifies the result is empty

7. **Line 1146** - `it('Property #259: deleteSeries cascades to series_tag')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/properties/temporal.test.ts (1 violation)

1. **Line 810** - `it('Property #380: all input times interpreted as configured timezone')`
   - Pattern: expect(typeof result.utcOffset).toBe('number') only confirms it's numeric

---

### tests/fuzz/properties/transactions.test.ts (2 violations)

1. **Line 862** - `it('rollback at any depth clears all pending changes')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 896** - `it('partial commit preserves pending state')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

### tests/fuzz/shrinking/shrinking.test.ts (6 violations)

1. **Line 135** - `it('minimum duration produces no shrinks')`
   - Pattern: Checking length === 0 only verifies the result is empty

2. **Line 166** - `it('single element produces no shrinks')`
   - Pattern: toEqual([]) only verifies the result is empty

3. **Line 199** - `it('daily pattern produces no shrinks')`
   - Pattern: Checking length === 0 only verifies the result is empty

4. **Line 322** - `it('single constraint produces no shrinks')`
   - Pattern: Checking length === 0 only verifies the result is empty

5. **Line 366** - `it('single link produces no shrinks')`
   - Pattern: toEqual([]) only verifies the result is empty

6. **Line 436** - `it('single operation produces no shrinks')`
   - Pattern: Checking length === 0 only verifies the result is empty

---

## Violation Categories

### Category 1: Empty Array Verification (89 violations)
Tests using `toEqual([])`, `toHaveLength(0)`, or `length === 0` to verify empty results.

**Pattern Types:**
- `toEqual([])` - 37 occurrences
- `toHaveLength(0)` - 22 occurrences
- `length === 0` check - 30 occurrences

**Resolution approach:** Each test must be examined individually to determine:
- Is this a valid "no results" scenario? If so, rename test clearly (e.g., "returns empty when no matches")
- Is this a cascade deletion test? Verify data exists before deletion, verify specific items deleted
- Is this testing a boundary condition? Add context-specific assertions

### Category 2: Type-Only Verification (30 violations)
Tests using `typeof x === 'string'` or `typeof x === 'number'` without verifying actual values.

**Resolution approach:** Each test must be examined individually to determine:
- If value is known from test setup, assert exact value
- If value is dynamic but has a pattern, use `toMatch()` with regex
- If testing generated data, verify it meets domain constraints

### Category 3: Existence-Only Verification (16 violations)
Tests using `toBeDefined()`, `toBeUndefined()`, `toBeNull()`, or `toHaveProperty()` without value verification.

**Resolution approach:** Each test must be examined individually to determine:
- If testing positive case, add property value assertions
- If testing negative case (should be null/undefined), ensure positive cases elsewhere verify actual data
- For `toHaveProperty()`, provide expected value as second argument

### Category 4: Length-Only Verification (13 violations)
Tests checking array length without verifying array contents.

**Pattern Types:**
- `toBeGreaterThan(0)` on length
- `toBeGreaterThanOrEqual(1)` on length
- `toBeLessThan()` on length
- Length check without content verification

**Resolution approach:** Each test must be examined individually to determine:
- Assert exact expected count based on test setup
- Verify each element matches expected data
- For cascade tests, verify specific items before/after

---

## Status Notes

**Files potentially modified with careless batch replacements (need review):**
- tests/04-adapter.test.ts
- tests/10-reminders.test.ts
- tests/13-reflow-algorithm.test.ts
- tests/15-sqlite-adapter.test.ts

**Files not yet touched (need individual attention):**
- All remaining 23 files in this report

---

*Each test must be addressed individually with respect for its unique intent and context.*
