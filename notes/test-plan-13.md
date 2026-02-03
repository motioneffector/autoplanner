# Test Plan: Segment 13 — Reflow Algorithm

## Overview

The reflow algorithm computes a valid schedule by placing instances such that all constraints are satisfied. It uses constraint satisfaction with backtracking to guarantee finding a solution if one exists.

**CRITICAL**: This is life-critical software. If a valid arrangement exists, we MUST find it.

**Test file**: `tests/13-reflow-algorithm.test.ts`

**Dependencies**: Segments 1-3, 8, 9, 11, 12

---

## 1. Phase 1: Generate Instances

### 1.1 Basic Generation Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `deterministic generation` | same inputs twice | Same instances | LAW 1 |
| `respects series bounds` | series with count=5 | Only 5 instances | LAW 2 |
| `cancelled excluded` | cancel one instance | Instance not generated | LAW 3 |
| `rescheduled uses new time` | reschedule instance | idealTime = newTime | LAW 4 |
| `conditions evaluated as of today` | condition with today's date | Correct evaluation | LAW 5 |
| `duration calculated once` | adaptive duration | Single calculation per instance | LAW 6 |

### 1.2 Condition Evaluation Tests

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `pattern active when condition true` | condition satisfied | Instances generated |
| `pattern inactive when condition false` | condition not satisfied | Instances not generated |
| `multiple patterns mixed conditions` | some active, some not | Only active pattern instances |

---

## 2. Phase 3: Compute Domains

### 2.1 Fixed Instance Domains

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `fixed has single slot` | fixed=true | Domain size 1 | LAW 6 (domains) |
| `fixed domain is ideal time` | fixed instance | Domain = [idealTime] | LAW 6 (domains) |

### 2.2 Flexible Instance Domains

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `domain bounded by wiggle days` | daysBefore=1, daysAfter=1 | 3 days of slots | LAW 7 |
| `domain bounded by time window` | timeWindow 08:00-10:00 | Only those hours | LAW 7 |
| `domain discretized` | any flexible | 5-minute increments | LAW 8 |

### 2.3 Special Cases

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `all-day excluded from reflow` | all-day instance | Not in constraint graph | LAW 9 |
| `chain child domain dynamic` | linked child | Computed from parent | - |

---

## 3. Phase 4: Constraint Propagation (Arc Consistency)

### 3.1 Propagation Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `prunes impossible values` | constraint removes slots | Domain shrinks | LAW 10 |
| `empty domain no solution` | all slots pruned | Propagation returns false | LAW 11 |
| `propagation is sound` | any constraint network | No valid solutions removed | LAW 12 |
| `propagation incomplete` | complex network | May need backtracking | LAW 13 |

### 3.2 Specific Constraint Propagation

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `noOverlap prunes overlapping slots` | A fixed at 09:00-10:00 | B cannot be 09:00-10:00 |
| `mustBeBefore prunes` | A mustBeBefore B | A slots after B removed |
| `chain constraint prunes` | parent assigned | Child domain narrowed |

---

## 4. Phase 5: Backtracking Search

### 4.1 Basic Search Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `finds valid assignment` | solvable problem | Assignment returned | LAW 14 |
| `satisfies all constraints` | any valid assignment | All constraints met | LAW 14 |
| `finds solution if exists` | exactly one solution | That solution found | LAW 15 |
| `terminates on no solution` | unsolvable | Returns null | LAW 16 |
| `always terminates` | any input | Eventually returns | LAW 16 |

### 4.2 Variable Ordering Tests

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `fixed items first` | mix of fixed/flexible | Fixed assigned first |
| `chain roots before children` | A→B→C | A assigned, then B, then C |
| `smallest domain first` | varying domain sizes | Smallest picked first |

### 4.3 Value Ordering Tests

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `prefers closer to ideal` | domain with ideal in middle | Ideal tried first |
| `prefers less loaded days` | some days busy | Less busy day preferred |

---

## 5. Phase 6: Handle No Solution

### 5.1 Best-Effort Placement

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `fixed items always placed` | no solution | Fixed at ideal time | LAW 17 |
| `fixed-fixed overlap allowed` | two fixed overlap | Both placed, warning | LAW 18 |
| `best effort for flexible` | no valid slot | Placed with conflict | LAW 19 |
| `all conflicts reported` | multiple conflicts | All in output | LAW 20 |

### 5.2 Conflict Types

| Conflict Type | Test Scenario | Severity |
|---------------|---------------|----------|
| overlap | Two fixed at same time | warning |
| chainCannotFit | Child outside parent bounds | error |
| constraintViolation | Relational constraint unsatisfied | error |
| noValidSlot | No slot in wiggle range | warning |

---

## 6. Constraint Checking Functions

### 6.1 No Overlap

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `no overlap satisfied` | A ends before B starts | true |
| `no overlap violated` | A overlaps B | false |
| `adjacent instances allowed` | A 09:00-10:00, B 10:00-11:00 | true |

### 6.2 Chain Constraint

| Test Name | Scenario | Expected |
|-----------|----------|----------|
| `uses actual end if completed` | parent completed | Child based on actual end |
| `uses scheduled end if not completed` | parent not completed | Child based on scheduled |
| `child within bounds` | child at target+earlyWobble | satisfied |
| `child outside bounds` | child before earliest | violated |

---

## 7. Workload Balancing

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `less loaded day preferred` | day A: 2hrs, day B: 4hrs | New item prefers A | LAW 21 |
| `balancing only for flexible` | fixed item | No balancing applied | LAW 22 |
| `constraints take priority` | balancing vs constraint | Constraint wins | LAW 23 |

---

## 8. Soundness Tests

### 8.1 Single Solution Scenarios

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `finds unique solution` | Exactly one valid arrangement | That arrangement found |
| `chain with exact fit` | Parent→child, tight bounds | Valid placement |

### 8.2 Property Tests

| Property | Description |
|----------|-------------|
| `valid inputs → solution found` | Randomly generated valid schedules |
| `conflicts → conflicts reported` | Known conflict schedules |
| `fixed never moved` | Any schedule with fixed items |
| `chain bounds respected` | Chain scenarios |

---

## 9. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `fixed items never moved` | Verify position after reflow |
| INV 2 | `all-day excluded` | Check constraint graph |
| INV 3 | `chain bounds hard` | Attempt violation |
| INV 4 | `deterministic output` | Same inputs, same output |
| INV 5 | `all conflicts reported` | Check output completeness |

---

## 10. Integration Tests

### 10.1 Full Reflow Scenarios

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `simple daily schedule` | 5 daily series | Valid non-overlapping schedule |
| `with relational constraints` | mustBeBefore constraint | Order enforced |
| `with chain` | Parent→child | Child relative to parent |
| `with adaptive duration` | Adaptive series | Duration calculated and used |
| `with conditions` | Conditional pattern | Only active patterns in schedule |

### 10.2 Complex Scenarios

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `multiple chains` | A→B, C→D | Both chains scheduled |
| `overlapping constraints` | Multiple mustBefore | All satisfied |
| `near-conflict` | Tight fit | Solution found |

---

## 11. Stress Tests

| Test Name | Setup | Expected |
|-----------|-------|----------|
| `100+ series` | Many series | Completes in reasonable time |
| `complex constraint network` | Many constraints | Correct result |
| `deep chains` | 10-level chain | Correctly scheduled |
| `many flexible items` | Large domains | Solution found |

---

## 12. Known Answer Tests

| Scenario | Input Summary | Expected Output |
|----------|---------------|-----------------|
| Two non-overlapping | A 09:00, B 10:00 | Both at ideal times |
| Must reschedule B | A fixed 09:00-10:00, B ideal 09:30 | B moved to 10:00 |
| Chain at distance 0 | A→B, distance=0 | B starts when A ends |
| Unsolvable | A mustBeBefore B, B mustBeBefore A | Conflicts reported |

---

## 13. Performance Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `typical week window` | ~1 week of data | Fast | LAW 24 |
| `arc consistency reduces space` | Large domain pre-propagation | Smaller post | LAW 25 |
| `MRV finds conflicts early` | Unsolvable | Fast failure | LAW 26 |
| `manageable search space` | Typical calendar | Reasonable time | LAW 27 |
| `correctness over performance` | Any input | Correct result | LAW 28 |

---

## 14. Test Count Summary

| Category | Unit Tests | Property Tests | Total |
|----------|------------|----------------|-------|
| Phase 1: Generate | ~8 | 2 | ~10 |
| Phase 3: Domains | ~6 | 1 | ~7 |
| Phase 4: Propagation | ~6 | 1 | ~7 |
| Phase 5: Backtracking | ~8 | 2 | ~10 |
| Phase 6: No Solution | ~6 | 1 | ~7 |
| Constraint Functions | ~6 | 0 | ~6 |
| Workload Balancing | ~3 | 0 | ~3 |
| Soundness | ~2 | 4 | ~6 |
| Invariants | ~5 | 0 | ~5 |
| Integration | ~8 | 0 | ~8 |
| Stress | ~4 | 0 | ~4 |
| Known Answer | ~4 | 0 | ~4 |
| Performance | ~5 | 0 | ~5 |
| **Total** | **~71** | **~11** | **~82** |

---

## 15. Test Execution Notes

- Test each phase independently before integration
- Use deterministic inputs for reproducibility
- Verify soundness with known single-solution scenarios
- Test completeness by constructing solvable problems
- Stress test with progressively larger inputs
- Profile performance for typical use cases
- Verify all conflicts are reported (no silent failures)
- Test constraint propagation with specific constraint types
- Verify chain child domains update when parent assigned
