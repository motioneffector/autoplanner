# Condition Syntax

Conditions are queries against the **completions database** (not calendar entries) that gate pattern activation.

**Key principle**: Completions are separate from calendar entries. The scheduler plans the future; completions record the past. Conditions query completions to affect planning.

## Target Reference

Conditions target entries by tag or series ID:

```typescript
type Target =
  | { tag: string }
  | { seriesId: string }
```

## Condition Types

### Count in Window
"N completions of X in past Y days"

```typescript
{
  type: 'count',
  target: Target,
  operator: '>=' | '<=' | '==' | '>' | '<' | '!=',
  value: number,
  windowDays: number
}
```

Examples:
- "7+ walks in 14 days": `{ type: 'count', target: { tag: 'walk' }, operator: '>=', value: 7, windowDays: 14 }`
- "< 4 weight sessions in 14 days": `{ type: 'count', target: { tag: 'weights' }, operator: '<', value: 4, windowDays: 14 }`

### Days Since Last Completion
"It's been N days since X was completed"

```typescript
{
  type: 'daysSince',
  target: Target,
  operator: '>=' | '<=' | '==' | '>' | '<',
  value: number
}
```

## Combinators

### And
All conditions must be true:

```typescript
{
  type: 'and',
  conditions: Condition[]
}
```

### Or
At least one condition must be true:

```typescript
{
  type: 'or',
  conditions: Condition[]
}
```

### Not
Inverts a condition:

```typescript
{
  type: 'not',
  condition: Condition
}
```

## Full Example: Exercise State Machine

```typescript
const deconditioned: Condition = {
  type: 'count',
  target: { tag: 'walk' },
  operator: '<',
  value: 7,
  windowDays: 14
}

const conditioning: Condition = {
  type: 'and',
  conditions: [
    { type: 'count', target: { tag: 'walk' }, operator: '>=', value: 7, windowDays: 14 },
    { type: 'count', target: { tag: 'weights' }, operator: '<', value: 4, windowDays: 14 }
  ]
}

const conditioned: Condition = {
  type: 'count',
  target: { tag: 'weights' },
  operator: '>=',
  value: 4,
  windowDays: 14
}
```

## Removed Concepts

- ~~consecutiveMissed~~: "Missed" doesn't exist in this system. If something wasn't completed, it just wasn't completed.
- ~~consecutiveCompleted~~: Requires knowing the schedule to determine what's "consecutive." Use count in window instead.
- ~~daysInState~~: Doesn't fit this model. Staged progressions are modeled via count conditions.
