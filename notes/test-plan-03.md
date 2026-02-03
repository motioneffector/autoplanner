# Test Plan: Segment 03 — Condition Evaluation

## Overview

Condition evaluation takes a condition definition and completion history, returning a boolean indicating whether the condition is satisfied. Conditions gate pattern activation for state-based scheduling.

**Test file**: `tests/03-condition-evaluation.test.ts`

**Dependencies**: Segment 1 (Time & Date Utilities)

---

## 1. Count Condition

### 1.1 Operator Tests

#### Greater Than or Equal (>=)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count >= 0 with 0 completions` | 0 | >= | 0 | true | LAW 3 |
| `count >= 1 with 0 completions` | 0 | >= | 1 | false | - |
| `count >= 1 with 1 completion` | 1 | >= | 1 | true | - |
| `count >= 5 with 7 completions` | 7 | >= | 5 | true | - |
| `count >= 7 with 7 completions` | 7 | >= | 7 | true | LAW 12 |

#### Greater Than (>)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count > 0 with 0 completions` | 0 | > | 0 | false | - |
| `count > 0 with 1 completion` | 1 | > | 0 | true | - |
| `count > 5 with 5 completions` | 5 | > | 5 | false | - |
| `count > 5 with 6 completions` | 6 | > | 5 | true | - |

#### Less Than or Equal (<=)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count <= 5 with 3 completions` | 3 | <= | 5 | true | - |
| `count <= 5 with 5 completions` | 5 | <= | 5 | true | - |
| `count <= 5 with 6 completions` | 6 | <= | 5 | false | - |

#### Less Than (<)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count < 7 with 5 completions` | 5 | < | 7 | true | - |
| `count < 7 with 7 completions` | 7 | < | 7 | false | - |
| `count < 7 with 8 completions` | 8 | < | 7 | false | - |

#### Equal (==)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count == 5 with 5 completions` | 5 | == | 5 | true | - |
| `count == 5 with 4 completions` | 4 | == | 5 | false | - |
| `count == 5 with 6 completions` | 6 | == | 5 | false | - |

#### Not Equal (!=)

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `count != 5 with 4 completions` | 4 | != | 5 | true | - |
| `count != 5 with 5 completions` | 5 | != | 5 | false | - |
| `count != 5 with 6 completions` | 6 | != | 5 | true | - |

### 1.2 Operator Complement Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `>= complement of <` | (a >= v) = !(a < v) | LAW 9 |
| `> complement of <=` | (a > v) = !(a <= v) | LAW 10 |
| `== complement of !=` | (a == v) = !(a != v) | LAW 11 |
| `>= splits to > or ==` | (a >= v) = (a > v) \|\| (a == v) | LAW 12 |

### 1.3 Window Tests

| Test Name | Setup | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `completion on first day of window` | window=14, completion on asOf-13 | counted | B1, LAW 1 |
| `completion on last day of window` | window=14, completion on asOf | counted | B2, LAW 2 |
| `completion one day before window` | window=14, completion on asOf-14 | not counted | B3 |
| `completion after asOf (future)` | completion on asOf+1 | not counted | B4 |
| `window includes today` | window=1, completion today | counted | LAW 2 |
| `14-day window` | window=14, asOf=Jan 15 | covers Jan 2-15 | LAW 1 |

### 1.4 Zero Completions Tests

| Test Name | Count | Operator | Value | Expected | Laws Verified |
|-----------|-------|----------|-------|----------|---------------|
| `zero completions >= 0` | 0 | >= | 0 | true | B5, B6 |
| `zero completions > 0` | 0 | > | 0 | false | B7 |
| `zero completions == 0` | 0 | == | 0 | true | B5 |

---

## 2. Days Since Condition

### 2.1 Basic Days Since Tests

| Test Name | Days Since | Operator | Value | Expected | Laws Verified |
|-----------|------------|----------|-------|----------|---------------|
| `completion today` | 0 | >= | 0 | true | LAW 5, B8 |
| `completion yesterday` | 1 | >= | 1 | true | LAW 6 |
| `completion yesterday >= 0` | 1 | >= | 0 | true | LAW 7 |
| `daysSince == 0 with today` | 0 | == | 0 | true | LAW 5 |
| `daysSince > 7 with 10 days` | 10 | > | 7 | true | - |
| `daysSince < 7 with 3 days` | 3 | < | 7 | true | - |

### 2.2 Null Handling (Never Completed)

| Test Name | Days Since | Operator | Value | Expected | Laws Verified |
|-----------|------------|----------|-------|----------|---------------|
| `never completed, > any value` | null | > | 7 | true | LAW 8 |
| `never completed, >= any value` | null | >= | 7 | true | LAW 8 |
| `never completed, != any value` | null | != | 7 | true | LAW 8 |
| `never completed, < any value` | null | < | 7 | false | LAW 8 |
| `never completed, <= any value` | null | <= | 7 | false | LAW 8 |
| `never completed, == any value` | null | == | 7 | false | LAW 8 |

### 2.3 Multiple Completions

| Test Name | Completions | Expected | Laws Verified |
|-----------|-------------|----------|---------------|
| `uses most recent completion` | days 5, 3, 10 ago | daysSince=3 | B10 |

---

## 3. And Condition

### Unit Tests

| Test Name | Conditions | Expected | Laws Verified |
|-----------|------------|----------|---------------|
| `singleton and` | [true] | true | LAW 14 |
| `singleton and false` | [false] | false | LAW 14 |
| `all true` | [true, true, true] | true | - |
| `one false` | [true, false, true] | false | LAW 17 |
| `all false` | [false, false] | false | - |
| `and with identity true` | [c, true] | same as c | LAW 18 |
| `and with annihilator false` | [c, false] | false | LAW 19 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `and commutativity` | and([a, b]) = and([b, a]) | LAW 15 |
| `and associativity` | and([a, and([b, c])]) = and([a, b, c]) | LAW 16 |

---

## 4. Or Condition

### Unit Tests

| Test Name | Conditions | Expected | Laws Verified |
|-----------|------------|----------|---------------|
| `singleton or` | [true] | true | LAW 21 |
| `singleton or false` | [false] | false | LAW 21 |
| `all false` | [false, false, false] | false | - |
| `one true` | [false, true, false] | true | LAW 24 |
| `all true` | [true, true] | true | - |
| `or with identity false` | [c, false] | same as c | LAW 25 |
| `or with annihilator true` | [c, true] | true | LAW 26 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `or commutativity` | or([a, b]) = or([b, a]) | LAW 22 |
| `or associativity` | or([a, or([b, c])]) = or([a, b, c]) | LAW 23 |

---

## 5. Not Condition

### Unit Tests

| Test Name | Condition | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `not true` | not(true) | false | - |
| `not false` | not(false) | true | - |
| `double negation` | not(not(c)) | same as c | LAW 27 |

### De Morgan's Laws

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `not(and) = or(not)` | not(and([a, b])) = or([not(a), not(b)]) | LAW 28 |
| `not(or) = and(not)` | not(or([a, b])) = and([not(a), not(b)]) | LAW 29 |

---

## 6. Nested Conditions

### Unit Tests

| Test Name | Structure | Expected | Laws Verified |
|-----------|-----------|----------|---------------|
| `and inside or` | or([and([t,t]), and([f,f])]) | true | - |
| `or inside and` | and([or([t,f]), or([f,t])]) | true | - |
| `not inside and` | and([not(f), t]) | true | - |
| `deeply nested and` | and([and([and([t])])]) | true | B11 |
| `deeply nested or` | or([or([or([t])])]) | true | B11 |

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `deep nesting doesn't overflow` | 100 levels of nesting | completes | B12 |

---

## 7. Target Resolution

### 7.1 By Tag

| Test Name | Setup | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `tag matches single series` | series A has tag 'walk', complete A | count=1 | - |
| `tag matches multiple series` | A and B have tag 'walk', complete both | count=2 | LAW 37 |
| `completion counted once` | series has tags ['walk', 'exercise'], target='walk' | count=1 | LAW 38 |
| `tag matching is case-sensitive` | series has 'Walk', target='walk' | count=0 | LAW 39 |
| `unknown tag` | target='nonexistent' | count=0 | CONTRACT 5 |

### 7.2 By Series ID

| Test Name | Setup | Expected | Laws Verified |
|-----------|-------|----------|---------------|
| `exact series match` | target=seriesA, complete seriesA | count=1 | LAW 40 |
| `different series not matched` | target=seriesA, complete seriesB | count=0 | LAW 40 |
| `unknown series ID` | target='nonexistent-uuid' | count=0 | CONTRACT 4 |
| `series ID is opaque string` | UUID format target | works correctly | LAW 41 |

---

## 8. Boolean Algebra Properties

### Property-Based Tests

| Test Name | Property | Laws Verified |
|-----------|----------|---------------|
| `evaluation is total` | Always returns true or false | LAW 30 |
| `boolean algebra` | Conditions form Boolean algebra | LAW 31 |
| `determinism` | Same inputs → same result | LAW 32 |
| `pure evaluation` | No side effects | LAW 33 |

---

## 9. Store Sensitivity

### Unit Tests

| Test Name | Action | Expected | Laws Verified |
|-----------|--------|----------|---------------|
| `adding completion changes result` | count >= 1, add completion | false → true | LAW 34 |
| `removing completion changes result` | count >= 1, remove completion | true → false | LAW 35 |
| `completion outside window` | window=7, add completion 10 days ago | no change | LAW 36 |

---

## 10. Invariants

| Invariant | Description | Verification Method |
|-----------|-------------|---------------------|
| INV 1 | Evaluation always terminates | Deep nesting test |
| INV 2 | Evaluation is deterministic | Multiple calls same result |
| INV 3 | Store not mutated | Verify store unchanged |
| INV 4 | Condition not mutated | Verify condition unchanged |
| INV 5 | Result is boolean | Type check |

---

## 11. Error Handling

### Unit Tests

| Test Name | Input | Expected |
|-----------|-------|----------|
| `empty and conditions` | and([]) | InvalidConditionError |
| `empty or conditions` | or([]) | InvalidConditionError |
| `negative windowDays` | windowDays=-1 | InvalidConditionError |
| `negative value` | value=-1 | InvalidConditionError |

---

## 12. Real-World Scenario Tests

### 12.1 Deconditioned State

```typescript
// < 7 walks in 14 days
condition = { type: 'count', target: { tag: 'walk' }, operator: '<', value: 7, windowDays: 14 }
```

| Test Name | Completions | Expected |
|-----------|-------------|----------|
| `0 walks → deconditioned` | 0 walks | true |
| `6 walks → deconditioned` | 6 walks | true |
| `7 walks → not deconditioned` | 7 walks | false |

### 12.2 Conditioning State

```typescript
// 7+ walks AND < 4 weight sessions
condition = {
  type: 'and',
  conditions: [
    { type: 'count', target: { tag: 'walk' }, operator: '>=', value: 7, windowDays: 14 },
    { type: 'count', target: { tag: 'weights' }, operator: '<', value: 4, windowDays: 14 }
  ]
}
```

| Test Name | Walks | Weights | Expected |
|-----------|-------|---------|----------|
| `6 walks, 0 weights` | 6 | 0 | false (walks) |
| `7 walks, 0 weights` | 7 | 0 | true |
| `7 walks, 3 weights` | 7 | 3 | true |
| `7 walks, 4 weights` | 7 | 4 | false (weights) |

### 12.3 Regression Check

```typescript
// No workout in 7+ days
condition = { type: 'daysSince', target: { tag: 'workout' }, operator: '>=', value: 7 }
```

| Test Name | Days Since | Expected |
|-----------|------------|----------|
| `worked out 3 days ago` | 3 | false |
| `worked out 7 days ago` | 7 | true |
| `never worked out` | null | true |

---

## 13. Test Count Summary

| Category | Unit Tests | Property-Based Tests | Total |
|----------|------------|---------------------|-------|
| Count Condition | ~25 | 4 | ~29 |
| Days Since | ~12 | 0 | ~12 |
| And Condition | ~7 | 2 | ~9 |
| Or Condition | ~7 | 2 | ~9 |
| Not Condition | ~3 | 2 | ~5 |
| Nested Conditions | ~5 | 1 | ~6 |
| Target Resolution | ~8 | 0 | ~8 |
| Boolean Algebra | 0 | 4 | 4 |
| Store Sensitivity | ~3 | 0 | ~3 |
| Error Handling | ~4 | 0 | ~4 |
| Scenario Tests | ~10 | 0 | ~10 |
| **Total** | **~84** | **~15** | **~99** |

---

## 14. Test Execution Notes

- Use mock CompletionStore for unit tests
- Property-based tests should generate:
  - Random condition trees (all types)
  - Random completion histories
  - Random asOf dates
- Verify determinism by calling evaluation multiple times
- Test deeply nested conditions up to 100 levels for stack safety
- Verify store and condition immutability after evaluation
