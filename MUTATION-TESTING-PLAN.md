# Mutation Testing Improvement Plan

## Overview

Stryker mutation testing run (2026-02-12) on autoplanner codebase.
**Overall score: 53.19%** (73.88% on covered code only)
7456 mutants generated, 3864 killed, 101 timeout, 1402 survived, 2088 no coverage, 1 error.

## Strategy

**Core principle:** We improve *tests*, not source code. Survived mutants = test gaps.
If we discover actual dead code, we surface it — but the goal is better test coverage.

**What we skip/deprioritize:**
- Error message string mutations (`"Invalid date"` → `""`) — cosmetic unless we want exact error assertions
- Pure re-export / barrel file mutants
- public-api.ts score is artificially low (its test file was excluded for speed)

## Dominant Patterns Across All Files

1. **BOUNDARY** (~40% of survivors): `<` vs `<=`, `>` vs `>=` mutations survive because tests use "clearly safe" values, never exact boundary values
2. **WEAK_ASSERTION** (~30%): Tests execute code paths but don't assert tightly enough — sort order, operator flips, default coalescing all survive
3. **STRING_COSMETIC** (~20%): Error message text mutations — tests check `.ok`/`.error.type` but not `.error.message`
4. **NO_COVERAGE** (~10%): Untested code paths — error handlers, optional config fallbacks, edge case branches

## Scores by File

| Tier | File | Score | Killed | Survived | No Cov |
|------|------|-------|--------|----------|--------|
| 1 | errors.ts | 100% | 38 | 0 | 0 |
| 1 | result.ts | 100% | 6 | 0 | 0 |
| 1 | completion-store.ts | 95.24% | 20 | 1 | 0 |
| 1 | adaptive-duration.ts | 91.49% | 43 | 4 | 0 |
| 1 | condition-evaluation.ts | 89.66% | 104 | 12 | 0 |
| 2 | time-date.ts | 85.17% | 353 | 47 | 15 |
| 2 | series-crud.ts | 82.63% | 352 | 67 | 7 |
| 2 | instance-exceptions.ts | 81.51% | 97 | 15 | 7 |
| 2 | completions.ts | 80.10% | 161 | 40 | 0 |
| 2 | reminders.ts | 79.39% | 104 | 23 | 4 |
| 3 | adapter.ts | 78.51% | 455 | 87 | 40 |
| 3 | relational-constraints.ts | 70.49% | 202 | 73 | 12 |
| 3 | links.ts | 69.52% | 143 | 48 | 16 |
| 3 | reflow.ts | 68.92% | 753 | 274 | 80 |
| 3 | cycling.ts | 66.22% | 49 | 13 | 12 |
| 4 | series-assembly.ts | 59.83% | 137 | 82 | 10 |
| 4 | pattern-expansion.ts | 57.78% | 321 | 124 | 142 |
| 4 | sqlite-adapter.ts | 55.18% | 197 | 36 | 124 |
| 4 | schedule.ts | 50.00% | 42 | 39 | 3 |
| 5 | public-api.ts | 12.75% | 287 | 417 | 1616 |

---

## Per-File Recon

### Tier 1: Quick Wins (89-95%)

#### completion-store.ts — 1 survived
- **Line 68**: STRING_COSMETIC — error message string changed, tests check error type not message text
- **Fix**: Assert error message content, or accept as cosmetic

#### adaptive-duration.ts — 4 survived
- **Line 42**: All 4 on same line — `if (durations.length === 0 || config.min === undefined)`
  - ConditionalExpression: `if(false)` — WEAK_ASSERTION, need test where durations is non-empty AND config.min is undefined
  - LogicalOperator: `||` → `&&` — WEAK_ASSERTION, need tests that exercise each branch independently
  - **Fix**: Add test with non-empty durations + undefined min, and empty durations + defined min

#### condition-evaluation.ts — 12 survived
- **Line 55**: STRING_COSMETIC — error message string
- **Lines 63-64**: BOUNDARY — `daysSince >= threshold` mutations (`>=` → `>` or `<=`). Tests check threshold met/not met but not exact boundary
- **Line 73**: BOUNDARY — `count >= threshold` same pattern
- **Lines 104-108**: WEAK_ASSERTION — condition evaluation short-circuit logic, `if(false)` mutations survive because tests don't exercise all branches
- **Fix**: Add boundary tests: daysSince exactly equal to threshold (should pass), daysSince = threshold-1 (should fail). Same for count. Test each condition branch independently.

---

### Tier 2: Strong Base (79-85%)

#### time-date.ts — 47 survived, 15 no coverage

**Boundary (20 mutants):**
- Lines 60-62: `pad4()` — `n < 10`, `n < 100`, `n < 1000` boundary conditions. Mutation `<` → `<=` survives. Fix: test pad4(10), pad4(100), pad4(1000) explicitly.
- Lines 113, 129-137: Month/hour/minute/second boundary — `month < 1`, `hour > 23`, `minute > 59`. Fix: test values 0, 1, 23, 24, 59, 60 explicitly.
- Line 331: `dateBefore` — `a < b` → `a <= b` survives. Fix: test with equal dates (should return false).
- Lines 390, 401, 413, 415, 423, 439, 450: Timezone/DST boundary conditions. Fix: test UTC shortcut, DST gap/overlap exact transition times.

**String cosmetic (15 mutants):**
- Lines 104, 111, 116, 123, 130, 133, 135, 137, 145, 151, 154: Error messages in parse functions. Tests check `.ok`/`.error.type`, not message text.

**Weak assertion (8 mutants):**
- Lines 110, 129: `isNaN(year) || isNaN(month) || isNaN(day)` — `||` → `&&` survives because no test sends partially-valid input (e.g., year=NaN but month valid)
- Lines 180, 192: `parseInt(date.substring(0, 4))` → `parseInt(date)` survives — component extraction tested implicitly via round-trip, not directly
- Line 322: `compareDates` — `a > b` return 1, `if(false)` survives when testing equal dates

**No coverage (15 mutants):**
- Lines 334-335: `dateAfter()` function — no test calls it directly
- Lines 60-62: Padding helper string literals (`'000'`, `'00'`, `'0'`) — no direct tests
- Lines 376, 401, 450: Timezone edge cases (invalid timestamp error, no-DST timezone, DST detection)

#### series-crud.ts — 67 survived, 7 no coverage

**Weak assertion (35 mutants):**
- Default coalescing: `duration ?? 30`, `count ?? undefined` — tests always provide values, `??` never exercised. Fix: test with `undefined` explicitly.
- Lock check: `existing.locked && changes.locked !== false` — tests don't distinguish `undefined` from explicit `false`
- One-time inference: `!input.patterns?.length && count === undefined && ...` — no test disables each condition independently

**Boundary (25 mutants):**
- Line 181: `endDate <= startDate` — `<=` → `<` survives. Fix: test endDate === startDate (should reject per exclusive end convention)
- Lines 186-189: `count < 1` — `<` → `<=` survives. Fix: test count=1 (should allow)
- Lines 210-220: `adaptive.min >= adaptive.max` — `>=` → `>` survives. Fix: test min === max
- Lines 236-243: Wiggle validation boundaries — `daysBefore < 0`, `earliest >= latest`. Fix: test zero values

**String cosmetic (7 mutants):** Error messages in validation

#### instance-exceptions.ts — 15 survived, 7 no coverage

**Weak assertion (5 mutants):**
- Line 41: `e.type === 'rescheduled' && e.newTime` — `&&` → `||` survives because newTime always present when type is 'rescheduled'

**Boundary (4 mutants):**
- Lines 53-56: `isValidInstance()` — `date < series.startDate` and `date >= series.endDate` boundary tests missing. Fix: test instance on exact startDate (valid) and on exact endDate (invalid, exclusive)

**No coverage (7 mutants):**
- Lines 59-60: No-pattern series instance validation path — return `date === series.startDate`. No test creates series without patterns. Fix: create pattern-less series, test validation.

**String cosmetic (4 mutants):** Error messages

#### completions.ts — 40 survived

**Weak assertion (18 mutants):**
- Lines 64, 66, 72: `row.date ?? row.instanceDate` — `??` indistinguishable from `||` in tests. Fix: test with `date = null` vs `date = undefined`
- Lines 192, 215, 296, 299: Sort comparisons `a.date > b.date ? -1 : ...` — operator flips survive. Fix: verify exact sort order with equal dates
- Lines 68-69: `if (row.startTime)` — always provided in tests. Fix: test with missing startTime

**Boundary (12 mutants):**
- Window boundaries: `date >= start && date <= end` — exact boundary dates not tested
- Line 138: `endTime < startTime` — `<` → `<=` would reject zero-duration. Fix: test zero-duration (startTime === endTime)
- Lines 250-253: Comparison operators in sort/filter. Fix: boundary value tests

**String cosmetic (10 mutants):** Error messages in validation

#### reminders.ts — 23 survived, 4 no coverage

**Boundary (12 mutants):**
- Fire time comparison: `fireTime > opts.asOf` — `>` → `>=` survives. No test queries at exact fire time. Fix: query at `08:45:00` exactly when fire time is `08:45:00` (should include).
- minutesBefore validation boundaries

**String cosmetic (8 mutants):** Error messages

**Weak assertion (3 mutants):** Pending reminder filtering conditions

---

### Tier 3: Moderate (66-78%)

#### adapter.ts — 87 survived, 40 no coverage

**Dominated by ConditionalExpression mutations** — `if(false)` replacing guards/validators:
- Lines 289, 293: Alias key comparison — STRING_COSMETIC
- Lines 332-365: Error message strings and early return guards — WEAK_ASSERTION
- Lines 392-402: Transaction depth (`txDepth === 0`) boundary — BOUNDARY
- Lines 431-798: CRUD operations — lots of `if(condition)` guards that can be `if(false)` because tests don't verify the specific error path
- Lines 807-875: Relational constraint/link operations — EqualityOperator mutations on depth checks
- Lines 938: `depth > 32` chain depth — BOUNDARY (need test at exactly depth 32 vs 33)

**No coverage (40 mutants):** Lines 304-310 (arithmetic helpers), 339-347 (boolean defaults), 495-697 (error message strings in throw paths), 787-944 (cascade/object literal paths)

#### relational-constraints.ts — 73 survived, 12 no coverage

**Boundary (30 mutants):**
- Lines 75-85: Date bounds — `<` for startDate, `>=` for endDate. Fix: test exact boundary dates
- Lines 222-276: Constraint checking — `mustBeWithin`, `mustBeBefore` switch cases. Fix: edge cases (empty instances, single instance)

**Weak assertion (30 mutants):**
- Lines 97-105: Exception cancellation check is shallow
- Lines 141-145: `withinMinutes >= 0` — negative values not tested
- Lines 196-216: Empty source/dest handling
- Lines 315-365: Violation detection loop

**No coverage (12 mutants):**
- Lines 107-129: All-day end time `makeTime(23, 59, 59)` never tested
- Lines 278-313: Adjacency logic — "no instances found" or "single instance" paths

#### links.ts — 48 survived, 16 no coverage

**String cosmetic (20 mutants):** Lines 76, 81, 87, 91, 97, 105, 125, 156, 201, 206, 209, 264, 321

**Weak assertion (15 mutants):**
- Lines 103-110: Cycle detection loop — boundary values not tested
- Lines 213-258: Window bound comparisons — only "clearly inside" and "clearly outside" tested
- Lines 271-317: Child valid window, conflict detection — `<` vs `<=` in comparisons

**No coverage (16 mutants):**
- Lines 140-142: Exception handling paths
- Lines 242, 264, 281, 293: Missing link scenarios

#### reflow.ts — 274 survived, 80 no coverage (BIGGEST FILE)

**Major clusters:**

1. **Chain shadow logic (NO_COVERAGE, ~40 mutants):** Lines 195-270 — deep recursion, range-overlap for chains. Tests don't exercise pathological chains.
2. **Backtracking/greedy placement (NO_COVERAGE, ~30 mutants):** Lines 697-855 — iteration deadline, phantom ranges, "every slot overlaps" fallback
3. **Overlap detection (BOUNDARY, ~25 mutants):** Lines 351-379 — `endA <= startB` exact boundary. Fix: test items that end exactly when another starts.
4. **AC-3 propagation (WEAK_ASSERTION, ~30 mutants):** Lines 505-614 — empty-domain cascade, requeue correctness
5. **Domain computation (BOUNDARY, ~20 mutants):** Lines 439-499 — time window parsing `<` vs `<=` at exact start/end times
6. **Instance generation (WEAK_ASSERTION, ~30 mutants):** Lines 392-433 — condition filtering, rescheduled instances. Fix: test cancelled+rescheduled together, count=0
7. **handleNoSolution (WEAK_ASSERTION, ~30 mutants):** Lines 975-1160 — greedy fallback, conflict detection
8. **Capacity check (BOUNDARY):** Line 1289 — `totalMinutes <= windowMinutes` — test schedule exactly at capacity limit

#### cycling.ts — 13 survived, 12 no coverage

**Weak assertion (8 mutants):**
- Line 27: ObjectLiteral — default config object mutation
- Line 36: ArithmeticOperator — `(currentIndex + 1) % items.length` modulo wrapping. Fix: test currentIndex = items.length - 1
- Line 62: LogicalOperator — `||` in fallback
- Lines 118-119: ObjectLiteral — cycling property updates

**No coverage (12 mutants):**
- Lines 73-79, 105-111: gapLeap early-return paths — async test coverage incomplete. Error messages in throw paths never exercised.

---

### Tier 4: Needs Significant Work (50-60%)

#### series-assembly.ts — 82 survived, 10 no coverage

**Pattern:** Heavy ConditionalExpression and EqualityOperator mutations on the assembly/hydration logic. Tests verify happy-path assembly but don't test:
- Partial/missing fields in assembled series
- Boundary conditions in field coercion
- Optional subsystem configs (adaptive, cycling, wiggle) when partially defined

#### pattern-expansion.ts — 124 survived, 142 no coverage

**HIGH no-coverage (142 mutants):** Mostly in:
- Lines 164-169: `everyNDays` description object — never tested (description strings)
- Lines 470-539: Pattern description/toString helper functions — completely untested
- Lines 259-264: Leap year / impossible date handling branches

**Survived (124 mutants):**
- Lines 79-426: Dense EqualityOperator/ConditionalExpression/LogicalOperator in every pattern matcher (`weekly`, `monthly`, `yearly`, `everyNDays`, `everyNWeeks`, `nthWeekday`, `lastDayOfMonth`, `weekdays`, `exceptPatterns`)
- Pattern: `dayOfWeek === 0` → `dayOfWeek <= 0` survives because tests don't check exact boundary
- All pattern matchers have the same gap: `<` vs `<=` and `===` vs `!==` on day/month/year comparisons

**Fix strategy:** Add boundary tests for each pattern type — exact first/last valid date, day-of-week boundaries. Pattern description functions need unit tests or should be excluded from mutation.

#### sqlite-adapter.ts — 36 survived, 124 no coverage

**No coverage (124 mutants):** Integration test file (15-sqlite-adapter.test.ts) IS included, but many adapter methods are tested only through public-api (excluded). Specific untested paths:
- `close()` body — removing it doesn't fail tests (close is called in teardown but not verified)
- `execute()` body — used only in migrations, not directly tested for side effects
- Migration history mapping — `version` and `appliedAt` extraction
- Null config guards for adaptive/cycling — `if (config === null)` → `if (false)` survives

**Survived (36 mutants):**
- Lines 707, 740: Null config guards — WEAK_ASSERTION
- Line 718: `windowDays ?? 30` — `??` → `&&` survives
- Line 756: `row.mode != null` — ConditionalExpression
- Line 898: `if (existing)` — upsert guard

#### schedule.ts — 39 survived, 3 no coverage

**50% score — worst non-public-api file.** The `getSchedule` function is tested but many internal conditions survive:
- Condition evaluation integration: schedule fetches conditions but tests don't verify condition-based filtering
- Date range boundary handling: exclusive end dates, empty ranges
- Sort/merge logic: combining instances from multiple series
- Exception application: cancelled/rescheduled instances in schedule output

**Fix strategy:** schedule.ts is a thin orchestrator — it calls pattern-expansion, instance-exceptions, and condition-evaluation. Many survivors come from the glue logic between these. Need targeted tests that exercise each path through the orchestration.

---

### Tier 5: Special Case

#### public-api.ts — 417 survived, 1616 no coverage
- Score is 12.75% but primary test file (14-public-api.test.ts) was excluded for speed
- Real score with its test file would be much higher
- **Action:** Re-run stryker with public-api test included (accept longer run time) to get true baseline

---

## Bugs Found During Recon

### BUG 1: schedule.ts:89 — Inclusive end on rescheduled instances (CONFIRMED)

```typescript
// CURRENT (WRONG):
if (newDate >= range.start && newDate <= range.end) {
// SHOULD BE:
if (newDate >= range.start && newDate < range.end) {
```

**Impact:** When an instance is rescheduled to `range.end`, it's incorrectly included in schedule output. DateRange uses exclusive end `[start, end)` — a rescheduled instance landing on `end` should be excluded.

**Evidence:** All pattern expansion tests confirm exclusive-end: `[2024-01-01, 2024-01-08)` = 7 dates, not 8. Every other DateRange consumer in the codebase uses `<` for end comparison. This is the only `<=` against `range.end` in schedule.ts.

### BUG 2: schedule.ts:52 — Zero-width range not caught (CONFIRMED)

```typescript
// CURRENT (WRONG):
if (effectiveStart > effectiveEnd) return []
// SHOULD BE:
if (effectiveStart >= effectiveEnd) return []
```

**Impact:** `expandSchedule()` is exported as public API (`src/index.ts:109`). Calling it with `start === end` produces instances when it should produce none — the range `[date, date)` is empty by exclusive-end convention.

**Note:** The public-api wrapper `planner.getSchedule()` already handles this case (returns empty for same start/end since commit 1ba228f), so direct callers of the high-level API are safe. But `expandSchedule` is also a public export and has no protection.

### NOT A BUG: completions.ts:105 — isInWindow (CORRECT)

```typescript
function isInWindow(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end  // intentionally inclusive
}
```

**Status:** Initially flagged as a violation, but the comment at line 100 explicitly says `[asOf-6, asOf] inclusive`. This is a **completion window**, not a DateRange — it aggregates past completions up to and including `asOf`. The inclusive semantics are correct for this use case.

### NOT A BUG: reflow.ts:359 — checkNoOverlap (CORRECT)

```typescript
return (endA as string) <= (startB as string) || (endB as string) <= (startA as string)
```

Correctly implements non-overlapping check for `[start, end)` ranges. If A ends at time X and B starts at time X, they don't overlap.

### DEAD CODE: time-date.ts:334-335 — dateAfter()

```typescript
export function dateAfter(a: LocalDate, b: LocalDate): boolean {
  return a > b
}
```

Exported from `index.ts:33` but never called anywhere in src/ or tests/. Shows as NO_COVERAGE in mutation report. Could be removed or kept as a utility export.

### Summary Table

| File | Line | Issue | Status | Fix |
|------|------|-------|--------|-----|
| schedule.ts | 89 | `<=` should be `<` on range.end | **BUG** | Change `<=` to `<` |
| schedule.ts | 52 | `>` should be `>=` for zero-width | **BUG** | Change `>` to `>=` |
| completions.ts | 105 | isInWindow uses inclusive end | CORRECT | Intentional — window, not range |
| reflow.ts | 359 | checkNoOverlap implementation | CORRECT | No change needed |
| time-date.ts | 334-335 | dateAfter() unused | DEAD CODE | Remove or keep as utility |

---

## Process Per File

1. Read mutation report (HTML or re-run stryker targeted)
2. Categorize survivors: weak assertions / no coverage / dead code / harmless strings
3. Write targeted tests
4. `npx vitest run` — verify nothing breaks
5. Re-run stryker on that file to verify improvement
6. Commit after each file

---

## Execution Plan

### Step Zero

Before beginning with the plan, richly and granularly populate your task list. For each phase of the plan, there are multiple action items, and you should load each one in as a distinct task in your task list tool. Between each phase, create a set of the following three tasks: 1) a zero-violations claudecatcher run as a gate, 2) a hostile audit of your work from the perspective of someone assuming the presence of and hunting for unsafe, lazy, deceptive or cheap coding practices, and also hunting for failure to fully satisfy the requirements of the phase, and 3) a commit step, where all work from the phase is committed to git before moving onto the next phase.

At the end of the task list, there should be a final set of tasks:

- Claudecatcher gate, as above
- Hostile audit, as above, but for the whole codebase and test rig
- Completion audit: is Phase 1 fully satisfied?
- Fix any issues identified in Phase 1 audit
- Completion audit: is Phase 2 fully satisfied?
- Fix any issues identified in Phase 2 audit
- Completion audit: is Phase 3 fully satisfied?
- Fix any issues identified in Phase 3 audit
- Completion audit: is Phase 4 fully satisfied?
- Fix any issues identified in Phase 4 audit
- Completion audit: is Phase 5 fully satisfied?
- Fix any issues identified in Phase 5 audit
- Final overall post-fixes completion audit
- Inform the user of the findings of the final audit with a detailed breakdown of any unresolved test failures, claudecatcher violations, etc.

### Phase 1: Bug Fixes & ClaudeCatcher Cleanup

Fix the two confirmed bugs in schedule.ts and the 5 claudecatcher violations.

**Tasks:**
1. Fix `schedule.ts:89`: Change `newDate <= range.end` to `newDate < range.end`
2. Fix `schedule.ts:52`: Change `effectiveStart > effectiveEnd` to `effectiveStart >= effectiveEnd`
3. Write regression tests for both bugs — test rescheduled instance at exact `range.end` (should be excluded), test `expandSchedule` with zero-width range (should return empty). Add to `09-instance-exceptions.test.ts` boundary section.
4. Fix 5 claudecatcher WEAK_ASSERTION violations in `14-public-api.test.ts` (lines 3569, 3570, 3609, 3610, 3623) — strengthen empty-result assertions
5. Run full test suite to verify no regressions

**Gates:** ClaudeCatcher zero violations → Hostile audit → Commit

### Phase 2: Tier 1 Quick Wins (89-95% → ~98%+)

Kill ~17 easy mutants across 3 files that are already near-perfect.

**Tasks:**
1. `completion-store.ts` (1 mutant): Assert error message content on line 68 string cosmetic
2. `adaptive-duration.ts` (4 mutants): Add branch-independent tests for line 42 — test non-empty durations + undefined min, test empty durations + defined min
3. `condition-evaluation.ts` (12 mutants): Add boundary tests for daysSince/count thresholds at exact values, test `compareNull` function, test each condition branch independently

**Gates:** ClaudeCatcher zero violations → Hostile audit → Commit

### Phase 3: Tier 2 (79-85% → ~90%+)

Kill ~192 mutants across 5 files with moderate gaps.

**Tasks:**
1. `time-date.ts` (47+15): Boundary tests for pad4(10/100/1000), parse validation boundaries, dateBefore with equal dates, timezone edge cases. Add dateAfter() test or assess dead code removal.
2. `series-crud.ts` (67+7): Test endDate===startDate rejection, count=1 acceptance, min===max, default coalescing with undefined values, lock check with explicit false vs undefined
3. `instance-exceptions.ts` (15+7): Test instance on exact startDate/endDate boundaries, no-pattern series path, type guard branch coverage
4. `completions.ts` (40): Window boundary tests, sort order verification with equal dates, zero-duration startTime===endTime, missing-field tests
5. `reminders.ts` (23+4): Fire time at exact boundary, minutesBefore validation edges, pending reminder filter conditions

**Gates:** ClaudeCatcher zero violations → Hostile audit → Commit

### Phase 4: Tier 3 (66-78% → ~85%+)

Kill ~495 mutants across 5 files with significant gaps.

**Tasks:**
1. `adapter.ts` (87+40): Guard validation tests for CRUD operations, transaction depth boundary (depth=0), chain depth at exactly 32 vs 33, error path coverage for throw statements
2. `relational-constraints.ts` (73+12): Date boundary tests, constraint checking edge cases (empty instances, single instance), all-day end time path, adjacency logic coverage
3. `links.ts` (48+16): Cycle detection loop boundaries, window bound comparisons at edges, child valid window conflicts, missing link scenario coverage
4. `reflow.ts` (274+80): Overlap detection at exact boundaries, chain shadow logic coverage, backtracking/greedy placement paths, AC-3 propagation empty-domain cascade, capacity check at exact limit
5. `cycling.ts` (13+12): Modulo wrapping at items.length-1, gapLeap early-return paths, error message coverage in throw paths

**Gates:** ClaudeCatcher zero violations → Hostile audit → Commit

### Phase 5: Tier 4 (50-60% → ~75%+)

Kill ~281 mutants across 4 files with the largest gaps.

**Tasks:**
1. `series-assembly.ts` (82+10): Field-stripping verification, partial/missing field tests, optional subsystem configs (adaptive, cycling, wiggle) when partially defined
2. `pattern-expansion.ts` (124+142): Boundary tests for each pattern type (exact first/last valid date), day-of-week boundaries, description function coverage or exclusion
3. `sqlite-adapter.ts` (36+124): Null config guard tests, close() verification, execute() side effect tests, migration history mapping coverage
4. `schedule.ts` (39+3): Condition filtering paths, orchestration glue between pattern-expansion/instance-exceptions/condition-evaluation, multi-series merge logic

**Gates:** ClaudeCatcher zero violations → Hostile audit → Commit

---

## Config Changes Made

- `stryker.config.json`: added `dryRunTimeoutMinutes: 10`, excluded `src/index.ts` from mutation
- `vitest.stryker.config.ts`: added proper include/exclude patterns, matched main config settings, excluded slow test files (14-public-api, 16-integration)
