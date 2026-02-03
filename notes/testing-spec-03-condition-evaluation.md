# Segment 3: Condition Evaluation — Formal Specification

## 1. Overview

Conditions are predicates over the completion history that determine whether patterns are active. This module evaluates conditions to boolean values.

```
evaluateCondition: (Condition, CompletionStore, AsOfDate) → bool
```

---

## 2. Types

### 2.1 Target

```
type Target =
  | { tag: string }      // completions of any series with this tag
  | { seriesId: string } // completions of specific series
```

### 2.2 Operator

```
type Operator = '>=' | '<=' | '==' | '>' | '<' | '!='
```

### 2.3 Condition (Recursive Union)

```
type Condition =
  | CountCondition
  | DaysSinceCondition
  | AndCondition
  | OrCondition
  | NotCondition

CountCondition = {
  type: 'count'
  target: Target
  operator: Operator
  value: int        // value ≥ 0
  windowDays: int   // windowDays ≥ 1
}

DaysSinceCondition = {
  type: 'daysSince'
  target: Target
  operator: Operator
  value: int          // value ≥ 0
}

AndCondition = {
  type: 'and'
  conditions: Condition[]  // non-empty
}

OrCondition = {
  type: 'or'
  conditions: Condition[]  // non-empty
}

NotCondition = {
  type: 'not'
  condition: Condition
}
```

### 2.4 CompletionStore (Abstract Interface)

```
interface CompletionStore {
  countInWindow(target: Target, windowDays: int, asOf: LocalDate): int
  daysSinceLast(target: Target, asOf: LocalDate): int | null  // null = never completed
}
```

---

## 3. Evaluation Semantics

### 3.1 Count Condition

```
evaluate(CountCondition { target, operator, value, windowDays }, store, asOf) =
  let count = store.countInWindow(target, windowDays, asOf)
  applyOperator(count, operator, value)
```

**Window definition**:
```
Window for windowDays W as of date D = [D - W + 1, D] inclusive
  // windowDays=14 as of Jan 15 → [Jan 2, Jan 15]
  // This is "past 14 days including today"
```

**Properties**:
```
LAW 1 (Window size): Window contains exactly windowDays days
LAW 2 (Includes today): asOf date is included in window
LAW 3 (Count non-negative): count ≥ 0
LAW 4 (Count bounded): count ≤ (number of completions in store for target)
```

---

### 3.2 Days Since Condition

```
evaluate(DaysSinceCondition { target, operator, value }, store, asOf) =
  let daysSince = store.daysSinceLast(target, asOf)
  if daysSince = null then
    // Never completed - treat as infinitely long ago
    operator ∈ {'>', '>=', '!='} → true   // "more than N days" or "not exactly N" is true if never
    operator ∈ {'<', '<=', '=='} → false  // "less than N days" or "exactly N" is false if never
  else
    applyOperator(daysSince, operator, value)
```

**Days since definition**:
```
daysSince(target, asOf) =
  let lastCompletion = mostRecentCompletionDate(target)
  if lastCompletion = null then null
  else daysBetween(lastCompletion, asOf)
```

**Properties**:
```
LAW 5 (Same day): Completion on asOf date → daysSince = 0
LAW 6 (Yesterday): Completion on asOf - 1 → daysSince = 1
LAW 7 (Non-negative): daysSince ≠ null → daysSince ≥ 0
LAW 8 (Never): No completions for target → daysSince = null
```

**Null handling rationale** (treat "never" as infinitely long ago):
- "It's been > 7 days since X" should be TRUE if X was never done
- "It's been >= 7 days since X" should be TRUE if X was never done
- "It's been != 7 days since X" should be TRUE if X was never done (infinity ≠ 7)
- "It's been < 7 days since X" should be FALSE if X was never done
- "It's been <= 7 days since X" should be FALSE if X was never done
- "It's been == 7 days since X" should be FALSE if X was never done

---

### 3.3 Operator Application

```
applyOperator(actual: int, op: Operator, expected: int): bool =
  match op with
  | '>=' → actual >= expected
  | '<=' → actual <= expected
  | '==' → actual == expected
  | '>'  → actual > expected
  | '<'  → actual < expected
  | '!=' → actual != expected
```

**Properties**:
```
LAW 9 (Complement): applyOperator(a, '>=', v) = ¬applyOperator(a, '<', v)
LAW 10 (Complement): applyOperator(a, '>', v) = ¬applyOperator(a, '<=', v)
LAW 11 (Complement): applyOperator(a, '==', v) = ¬applyOperator(a, '!=', v)
LAW 12 (Equality split): applyOperator(a, '>=', v) = applyOperator(a, '>', v) ∨ applyOperator(a, '==', v)
```

---

### 3.4 And Condition

```
evaluate(AndCondition { conditions }, store, asOf) =
  ∀c ∈ conditions: evaluate(c, store, asOf)
```

**Properties**:
```
LAW 13 (Empty and): conditions = [] → ERROR (precondition violation)
LAW 14 (Singleton and): conditions = [c] → evaluate(c, store, asOf)
LAW 15 (Commutativity): and([a, b]) ≡ and([b, a])
LAW 16 (Associativity): and([a, and([b, c])]) ≡ and([a, b, c])
LAW 17 (Short-circuit): First false → result is false (optimization, not semantic)
LAW 18 (Identity): and([c, true]) ≡ c
LAW 19 (Annihilator): and([c, false]) ≡ false
```

---

### 3.5 Or Condition

```
evaluate(OrCondition { conditions }, store, asOf) =
  ∃c ∈ conditions: evaluate(c, store, asOf)
```

**Properties**:
```
LAW 20 (Empty or): conditions = [] → ERROR (precondition violation)
LAW 21 (Singleton or): conditions = [c] → evaluate(c, store, asOf)
LAW 22 (Commutativity): or([a, b]) ≡ or([b, a])
LAW 23 (Associativity): or([a, or([b, c])]) ≡ or([a, b, c])
LAW 24 (Short-circuit): First true → result is true
LAW 25 (Identity): or([c, false]) ≡ c
LAW 26 (Annihilator): or([c, true]) ≡ true
```

---

### 3.6 Not Condition

```
evaluate(NotCondition { condition }, store, asOf) =
  ¬evaluate(condition, store, asOf)
```

**Properties**:
```
LAW 27 (Double negation): not(not(c)) ≡ c
LAW 28 (De Morgan): not(and([a, b])) ≡ or([not(a), not(b)])
LAW 29 (De Morgan): not(or([a, b])) ≡ and([not(a), not(b)])
```

---

## 4. Algebraic Laws (Combined)

### 4.1 Boolean Algebra

```
LAW 30: evaluate(c, store, asOf) ∈ {true, false}  // total function
LAW 31: Conditions form a Boolean algebra under and/or/not
```

### 4.2 Determinism

```
LAW 32: Same (condition, store state, asOf) → same result
LAW 33: Evaluation is pure (no side effects)
```

### 4.3 Store Sensitivity

```
LAW 34: Adding completion may change result
LAW 35: Removing completion may change result
LAW 36: Completion outside window doesn't affect count condition result
```

---

## 5. Target Resolution

### 5.1 By Tag

```
countInWindow({ tag }, windowDays, asOf) =
  count of completions C where:
    - C.date ∈ window(windowDays, asOf)
    - series(C.seriesId) has tag in its tags
```

**Properties**:
```
LAW 37: Series can have multiple tags
LAW 38: Completion counted once even if series has multiple matching tags
LAW 39: Tag matching is exact (case-sensitive)
```

### 5.2 By Series ID

```
countInWindow({ seriesId }, windowDays, asOf) =
  count of completions C where:
    - C.date ∈ window(windowDays, asOf)
    - C.seriesId = seriesId
```

**Properties**:
```
LAW 40: Only exact series ID match
LAW 41: Series ID is opaque string (UUID)
```

---

## 6. Boundary Conditions

### 6.1 Window Boundaries

```
B1: Completion on first day of window → counted
B2: Completion on last day of window (asOf) → counted
B3: Completion one day before window → not counted
B4: Completion one day after asOf → not counted (future)
```

### 6.2 Count Edge Cases

```
B5: Zero completions in window → count = 0
B6: count >= 0 always true if count is 0 (vacuous)
B7: count > 0 needs at least one completion
```

### 6.3 Days Since Edge Cases

```
B8: Completion today → daysSince = 0
B9: No completions ever → daysSince = null
B10: Multiple completions → use most recent
```

### 6.4 Deeply Nested Conditions

```
B11: and([and([and([...])...]]) → flattens logically
B12: Deeply nested should not stack overflow (tail recursion or iteration)
```

---

## 7. Invariants

```
INV 1: Evaluation always terminates
INV 2: Evaluation is deterministic given same inputs
INV 3: No mutation of store during evaluation
INV 4: No mutation of condition during evaluation
INV 5: Result is always boolean (no exceptions for valid input)
```

---

## 8. Error Handling

```
CONTRACT 1: Empty conditions array in and/or → InvalidConditionError
CONTRACT 2: Negative windowDays → InvalidConditionError
CONTRACT 3: Negative value → InvalidConditionError
CONTRACT 4: Unknown target (seriesId doesn't exist) → treat as zero completions
CONTRACT 5: Unknown tag → treat as zero completions
```

---

## 9. Example Conditions

### 9.1 Deconditioned State

```
{
  type: 'count',
  target: { tag: 'walk' },
  operator: '<',
  value: 7,
  windowDays: 14
}
// True when fewer than 7 walks in past 14 days
```

### 9.2 Conditioning State

```
{
  type: 'and',
  conditions: [
    { type: 'count', target: { tag: 'walk' }, operator: '>=', value: 7, windowDays: 14 },
    { type: 'count', target: { tag: 'weights' }, operator: '<', value: 4, windowDays: 14 }
  ]
}
// True when 7+ walks AND fewer than 4 weight sessions
```

### 9.3 Regression Check

```
{
  type: 'daysSince',
  target: { tag: 'workout' },
  operator: '>=',
  value: 7
}
// True when no workout in 7+ days (including never)
```

---

## 10. Verification Strategy

### 10.1 Property-based tests

- Generate random conditions
- Generate random completion histories
- Verify boolean algebra laws hold
- Verify determinism

### 10.2 Truth table tests

For each operator, verify all cases:
```
count=0, operator='>=', value=0 → true
count=0, operator='>=', value=1 → false
count=1, operator='>=', value=1 → true
... (exhaustive for small values)
```

### 10.3 Null handling tests

```
daysSince=null, operator='>' → true (for any value)
daysSince=null, operator='>=' → true
daysSince=null, operator='!=' → true
daysSince=null, operator='<' → false
daysSince=null, operator='<=' → false
daysSince=null, operator='==' → false
```

### 10.4 Combinator tests

- Nested and/or/not
- De Morgan equivalences
- Tautologies and contradictions

---

## 11. Dependencies

- Segment 1: Time & Date Utilities (date comparisons, daysBetween)

---

## 12. Non-Goals

- Condition optimization (simplification)
- Condition serialization (separate concern)
- Temporal logic beyond simple windows
- Probabilistic conditions
