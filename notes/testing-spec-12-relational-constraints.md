# Segment 12: Relational Constraints — Formal Specification

## 1. Overview

Relational constraints define rules about how instances of different series relate to each other in the schedule.

---

## 2. Types

### 2.1 Constraint

```
type RelationalConstraint = {
  id: ConstraintId
  type: ConstraintType
  sourceTarget: Target
  destTarget: Target
  withinMinutes?: number     // for 'mustBeWithin' only
}

type ConstraintType =
  | 'mustBeOnSameDay'
  | 'cantBeOnSameDay'
  | 'mustBeNextTo'
  | 'cantBeNextTo'
  | 'mustBeBefore'
  | 'mustBeAfter'
  | 'mustBeWithin'

type Target = { tag: string } | { seriesId: SeriesId }
```

---

## 3. Constraint Semantics

### 3.1 Day-Level Constraints

```
mustBeOnSameDay(source, dest):
  ∀ instance S matching source, ∃ instance D matching dest:
    dateOf(S.scheduledTime) = dateOf(D.scheduledTime)

cantBeOnSameDay(source, dest):
  ∀ instance S matching source, ∀ instance D matching dest:
    dateOf(S.scheduledTime) ≠ dateOf(D.scheduledTime)
```

### 3.2 Intra-Day Constraints

These only apply when instances are on the same day.

```
mustBeNextTo(source, dest):
  // S and D are adjacent (no other timed instance between them)
  ∀ S, D on same day:
    ¬∃ other instance O where S.end < O.start < D.start
    OR ¬∃ other instance O where D.end < O.start < S.start

cantBeNextTo(source, dest):
  // S and D have at least one other instance between them
  ∀ S, D on same day:
    ∃ other instance O between S and D

mustBeBefore(source, dest):
  ∀ S, D on same day:
    S.end ≤ D.start

mustBeAfter(source, dest):
  ∀ S, D on same day:
    S.start ≥ D.end

mustBeWithin(source, dest, minutes):
  ∀ S, D on same day:
    |S.start - D.end| ≤ minutes OR |D.start - S.end| ≤ minutes
```

---

## 4. Constraint CRUD

```
addConstraint(constraint: RelationalConstraint): ConstraintId
getConstraint(id: ConstraintId): RelationalConstraint | null
getAllConstraints(): RelationalConstraint[]
removeConstraint(id: ConstraintId): void
```

### 4.1 Properties

```
LAW 1: Constraints are global (not tied to specific series)
LAW 2: Constraints reference targets by tag or seriesId
LAW 3: Deleting series doesn't delete constraints (soft reference)
LAW 4: Constraint with non-existent target is a no-op (no instances to constrain)
LAW 5: Orphaned constraints (referencing deleted series) remain but match nothing
```

---

## 5. Target Resolution

```
resolveTarget(target: Target, instances: Instance[]): Instance[] =
  match target with
  | { tag: t } → instances.filter(i => t ∈ getSeries(i.seriesId).tags)
  | { seriesId: s } → instances.filter(i => i.seriesId = s)
```

### 5.1 Properties

```
LAW 6: Tag target matches all series with that tag
LAW 7: SeriesId target matches only that series
LAW 8: Non-existent tag → empty match (constraint is no-op)
LAW 9: Non-existent seriesId → empty match (constraint is no-op)
```

---

## 6. Constraint Satisfaction

### 6.1 Check Single Constraint

```
isSatisfied(constraint: RelationalConstraint, schedule: Schedule): boolean =
  let sourceInstances = resolveTarget(constraint.sourceTarget, schedule.instances)
  let destInstances = resolveTarget(constraint.destTarget, schedule.instances)

  match constraint.type with
  | 'mustBeOnSameDay' → checkMustBeOnSameDay(sourceInstances, destInstances)
  | 'cantBeOnSameDay' → checkCantBeOnSameDay(sourceInstances, destInstances)
  | 'mustBeBefore' → checkMustBeBefore(sourceInstances, destInstances)
  // ... etc
```

### 6.2 Properties

```
LAW 10: Empty source or dest → constraint satisfied (nothing to constrain)
LAW 11: Constraint checked per-day for intra-day types
LAW 12: All-day instances excluded from intra-day constraints
```

---

## 7. Constraint Violations

### 7.1 Violation Type

```
type ConstraintViolation = {
  constraintId: ConstraintId
  sourceInstance: Instance
  destInstance: Instance
  description: string
}
```

### 7.2 Properties

```
LAW 13: Violation identifies which instances conflict
LAW 14: Multiple violations possible for same constraint (different instance pairs)
```

---

## 8. Constraint Interactions

### 8.1 Contradictory Constraints

```
Example: mustBeBefore(A, B) AND mustBeBefore(B, A)
  → Unsatisfiable for instances on same day

Example: mustBeOnSameDay(A, B) AND cantBeOnSameDay(A, B)
  → Always unsatisfiable
```

### 8.2 Properties

```
LAW 15: System does not validate constraint consistency at creation time
LAW 16: Contradictory constraints detected during reflow
LAW 17: Unsatisfiable constraints produce conflicts (Segment 13)
```

---

## 9. Invariants

```
INV 1: withinMinutes specified iff type = 'mustBeWithin'
INV 2: withinMinutes >= 0 (note: 0 means "must be adjacent" per B2)
INV 3: Constraints are independent of series lifecycle
```

---

## 10. Boundary Conditions

```
B1: Source = dest (same target) → constraint about instances of same series
B2: mustBeWithin(minutes=0) → must be adjacent
B3: Single instance matching source → constraint trivially satisfied (no pairs)
B4: Tag matching no series → constraint trivially satisfied
```

---

## 11. Verification Strategy

### 11.1 CRUD tests

- Create, read, delete constraints

### 11.2 Satisfaction tests

For each constraint type:
- Satisfied case
- Violated case
- Empty target case

### 11.3 Target resolution tests

- Tag matches multiple series
- SeriesId matches one series
- Non-existent targets

---

## 12. Dependencies

- Segment 4: Adapter
- Segment 5: Series CRUD (for tags)
