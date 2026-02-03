# Test Plan: Segment 12 — Relational Constraints

## Overview

Relational constraints define rules about how instances of different series relate to each other in the schedule. Constraint types include day-level constraints and intra-day ordering constraints.

**Test file**: `tests/12-relational-constraints.test.ts`

**Dependencies**: Segment 4 (Adapter), Segment 5 (Series CRUD)

---

## 1. Constraint CRUD

### 1.1 Add Constraint Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `add constraint returns ID` | addConstraint | ID returned | - |
| `constraints are global` | add constraint | Not tied to specific series | LAW 1 |
| `constraints reference targets` | add by tag or seriesId | Target stored | LAW 2 |

### 1.2 Get Constraint Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `get existing constraint` | add, get | Returns constraint | - |
| `get non-existent constraint` | get unknown ID | null | - |
| `get all constraints` | add 3 | Returns all 3 | - |

### 1.3 Delete Constraint Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `delete constraint` | add, delete | Removed | - |
| `series delete doesn't delete constraint` | delete series | Constraint remains | LAW 3 |
| `constraint with non-existent target` | reference deleted series | Constraint is no-op | LAW 4, LAW 5 |

---

## 2. Target Resolution

### 2.1 Tag Target Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `tag matches all series` | 3 series with tag | All 3 matched | LAW 6 |
| `tag excludes non-tagged` | 2 with tag, 1 without | Only 2 matched | LAW 6 |
| `non-existent tag empty match` | query unknown tag | [] | LAW 8 |

### 2.2 SeriesId Target Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `seriesId matches only one` | target specific series | Only that series | LAW 7 |
| `seriesId excludes others` | target A, B exists | Only A matched | LAW 7 |
| `non-existent seriesId empty` | deleted series ID | [] | LAW 9 |

---

## 3. Day-Level Constraints

### 3.1 mustBeOnSameDay

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `both on same day` | A Mon, B Mon | Satisfied | ✅ |
| `on different days` | A Mon, B Tue | Violated | ❌ |
| `source empty` | no A instances | Satisfied | ✅ (LAW 10) |

### 3.2 cantBeOnSameDay

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `on different days` | A Mon, B Tue | Satisfied | ✅ |
| `both on same day` | A Mon, B Mon | Violated | ❌ |
| `source empty` | no A instances | Satisfied | ✅ (LAW 10) |

---

## 4. Intra-Day Constraints

### 4.1 mustBeNextTo

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `adjacent instances` | A 09:00, B 10:00 | Satisfied | ✅ |
| `instance between` | A 09:00, C 10:00, B 11:00 | Violated | ❌ |
| `on different days` | A Mon, B Tue | N/A (not same day) | ✅ |

### 4.2 cantBeNextTo

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `instance between` | A 09:00, C 10:00, B 11:00 | Satisfied | ✅ |
| `adjacent instances` | A 09:00, B 10:00 | Violated | ❌ |

### 4.3 mustBeBefore

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `A before B` | A 09:00, B 10:00 | Satisfied | ✅ |
| `A after B` | A 11:00, B 10:00 | Violated | ❌ |
| `A equals B time` | A 09:00-10:00, B 10:00 | Satisfied (end ≤ start) | ✅ |

### 4.4 mustBeAfter

| Test Name | Schedule Setup | Expected | Constraint Satisfied |
|-----------|----------------|----------|---------------------|
| `A after B` | A 11:00, B 10:00 | Satisfied | ✅ |
| `A before B` | A 09:00, B 10:00 | Violated | ❌ |

### 4.5 mustBeWithin

| Test Name | Schedule Setup | minutes | Expected | Constraint Satisfied |
|-----------|----------------|---------|----------|---------------------|
| `within time` | A 09:00, B 09:20 | 30 | Satisfied | ✅ |
| `outside time` | A 09:00, B 10:00 | 30 | Violated | ❌ |
| `exactly at boundary` | A 09:00-09:30, B 10:00 | 30 | Satisfied | ✅ |

---

## 5. Constraint Satisfaction

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `empty source satisfied` | no source instances | Satisfied | LAW 10 |
| `empty dest satisfied` | no dest instances | Satisfied | LAW 10 |
| `intra-day checked per day` | different days | Each day separate | LAW 11 |
| `all-day instances excluded` | all-day instance | Excluded from intra-day | LAW 12 |

---

## 6. Constraint Violations

### Unit Tests

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `violation identifies instances` | violation detected | Source and dest identified | LAW 13 |
| `multiple violations same constraint` | 3 pairs violate | 3 violations | LAW 14 |
| `violation includes description` | violation | Human-readable description | LAW 13 |

---

## 7. Constraint Interactions

### 7.1 Contradictory Constraints

| Test Name | Constraints | Expected | Laws Verified |
|-----------|-------------|----------|---------------|
| `mutual before contradiction` | mustBefore(A,B), mustBefore(B,A) | Unsatisfiable | LAW 17 |
| `sameDay + notSameDay` | mustBeOnSameDay, cantBeOnSameDay | Unsatisfiable | LAW 17 |

### 7.2 Validation Timing

| Test Name | Scenario | Expected | Laws Verified |
|-----------|----------|----------|---------------|
| `no validation at creation` | add contradictory | Created without error | LAW 15 |
| `detected during reflow` | reflow with contradiction | Conflict reported | LAW 16 |

---

## 8. Invariants

| Invariant | Test Name | Verification Method |
|-----------|-----------|---------------------|
| INV 1 | `withinMinutes only for mustBeWithin` | Add mustBeBefore with withinMinutes |
| INV 2 | `withinMinutes > 0` | Attempt withinMinutes=0 or negative |
| INV 3 | `constraints independent of series` | Delete series, verify constraint exists |

---

## 9. Boundary Conditions

| Test Name | Scenario | Expected | Boundary |
|-----------|----------|----------|----------|
| `source equals dest` | same target both sides | Constrains same series instances | B1 |
| `withinMinutes 0` | must be adjacent | withinMinutes=0 works | B2 |
| `single instance source` | only one A | Trivially satisfied | B3 |
| `tag matches nothing` | non-existent tag | Trivially satisfied | B4 |

---

## 10. Constraint Type Tests

### 10.1 All Constraint Types

| Type | Satisfied Example | Violated Example |
|------|-------------------|------------------|
| mustBeOnSameDay | A Mon, B Mon | A Mon, B Tue |
| cantBeOnSameDay | A Mon, B Tue | A Mon, B Mon |
| mustBeNextTo | A 09:00, B 10:00 (adjacent) | A 09:00, C 10:00, B 11:00 |
| cantBeNextTo | A 09:00, C 10:00, B 11:00 | A 09:00, B 10:00 |
| mustBeBefore | A 09:00, B 10:00 | A 11:00, B 10:00 |
| mustBeAfter | A 11:00, B 10:00 | A 09:00, B 10:00 |
| mustBeWithin(30) | A 09:00, B 09:20 | A 09:00, B 10:00 |

---

## 11. Test Count Summary

| Category | Unit Tests | Total |
|----------|------------|-------|
| Constraint CRUD | ~8 | ~8 |
| Target Resolution | ~6 | ~6 |
| Day-Level Constraints | ~6 | ~6 |
| Intra-Day Constraints | ~15 | ~15 |
| Constraint Satisfaction | ~4 | ~4 |
| Constraint Violations | ~3 | ~3 |
| Constraint Interactions | ~4 | ~4 |
| Invariants | ~3 | ~3 |
| Boundary Conditions | ~4 | ~4 |
| **Total** | **~53** | **~53** |

---

## 12. Test Execution Notes

- Create series and instances with predictable schedules before testing
- Test each constraint type with satisfied, violated, and empty cases
- Verify target resolution with both tag and seriesId targets
- Test intra-day constraints only with timed instances (not all-day)
- Verify violations include both source and dest instances
- Test orphaned constraints (reference deleted series)
- Test contradictory constraints are not validated at creation
