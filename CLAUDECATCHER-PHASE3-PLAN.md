# ClaudeCatcher Phase 3: Actual Value Verification

## Current State
- **Violations**: 300 (289 WEAK_ASSERTION, 11 LOOSE_ERROR)
- **Files affected**: 27
- **Top 10 files contain**: 205 violations (68%)

## Violation Categories

| Pattern | Count | Issue |
|---------|-------|-------|
| `expect.any(Type)` | 55 | Only verifies type, any value passes |
| `expect(x === null).toBe(true)` | ~120 | Hidden null check, doesn't verify data |
| `expect(x !== null).toBe(true)` | ~80 | Hidden existence check, doesn't verify data |
| `expect(x === undefined).toBe(true)` | ~30 | Hidden undefined check |
| `.not.toThrow()` | 11 | False positives (valid pattern) |

## Fix Strategies

### Strategy A: Null Checks for Deletion Verification (~120 violations)

**Current (weak):**
```typescript
await adapter.deleteSeries('series-1')
const series = await adapter.getSeries('series-1')
expect(series === null).toBe(true)
```

**Fixed (verifies world state):**
```typescript
await adapter.deleteSeries('series-1')
const allSeries = await adapter.getAllSeries()
expect(allSeries.map(s => s.id)).not.toContain('series-1')
```

**Why better:** Verifies the deletion actually affected the collection, not just that one lookup returns null.

### Strategy B: Existence + Property Checks (~80 violations)

**Current (weak):**
```typescript
const series = await adapter.getSeries('series-1')
expect(series !== null).toBe(true)
expect(series!.title).toBe('Test')
expect(series!.locked).toBe(false)
```

**Fixed (verifies exact data):**
```typescript
const series = await adapter.getSeries('series-1')
expect(series).toEqual({
  id: 'series-1',
  title: 'Test',
  locked: false,
  createdAt: expect.any(String),  // Only for truly dynamic fields
  updatedAt: expect.any(String),
})
```

**Or for partial matching:**
```typescript
expect(series).toEqual(expect.objectContaining({
  id: 'series-1',
  title: 'Test',
  locked: false,
}))
```

**Why better:** Would catch bugs where wrong data is returned, extra fields appear, or structure changes.

### Strategy C: expect.any() Replacements (~55 violations)

**Current (weak):**
```typescript
const result = await createSeries({ title: 'My Series' })
expect(result.value.id).toEqual(expect.any(String))
```

**Fixed (verifies actual value):**
```typescript
const seriesId = 'test-series-1'  // Define expected ID
const result = await createSeries({ id: seriesId, title: 'My Series' })
expect(result.value.id).toBe(seriesId)
```

**Or if ID is generated:**
```typescript
const result = await createSeries({ title: 'My Series' })
const createdId = result.value.id
// Verify the ID is usable
const retrieved = await getSeries(createdId)
expect(retrieved?.title).toBe('My Series')
```

**Why better:** Proves the code actually processes and returns the correct data, not just any string.

### Strategy D: Undefined Field Checks (~30 violations)

**Current (weak):**
```typescript
expect(series?.count === undefined).toBe(true)
```

**Fixed (verifies structure):**
```typescript
expect(series).toEqual(expect.objectContaining({
  title: 'Test',
  // count field should not be present
}))
expect(series).not.toHaveProperty('count')
```

**Or for optional fields:**
```typescript
expect('count' in series!).toBe(false)
```

### Strategy E: LOOSE_ERROR (.not.toThrow()) - 11 violations

**These are false positives.** The pattern:
```typescript
expect(() => someOperation()).not.toThrow()
```

Is valid for testing that an operation succeeds without error. No fix needed - these should be suppressed or the rule refined.

---

## Execution Plan

### Phase 3a: 04-adapter.test.ts (32 violations)
Highest impact file. Contains:
- Cascade deletion tests → Strategy A
- CRUD retrieval tests → Strategy B
- ID verification tests → Strategy C

### Phase 3b: fuzz/shrinking/shrinking.test.ts (32 violations)
Contains mostly `expect.any()` for generated values. Need to:
- Track generated values through the test
- Verify shrinkers produce expected transformations

### Phase 3c: 16-integration.test.ts (28 violations)
End-to-end tests. Contains:
- Schedule verification → Strategy B with full object matching
- State transition tests → Verify before/after state completely

### Phase 3d: 06-completions.test.ts (21 violations)
Contains:
- Completion retrieval → Strategy B
- Completion deletion → Strategy A
- Array bounds checks → Verify exact array contents

### Phase 3e: 10-reminders.test.ts (20 violations)
Contains:
- Reminder state verification → Strategy B
- Acknowledgment tests → Verify complete reminder object

### Phase 3f: Remaining files (167 violations across 22 files)
Apply strategies based on context. Use `--worst` to prioritize.

---

## Verification Commands

```bash
# Check specific file progress
./claudecatcher -e "**/node_modules/**" tests/04-adapter.test.ts

# Check overall progress
./claudecatcher -e "**/node_modules/**" --summary .

# Find next worst file
./claudecatcher -e "**/node_modules/**" --worst 5 --summary .

# Machine-readable for scripting
./claudecatcher -e "**/node_modules/**" -m . | wc -l
```

---

## Success Criteria

- **Target**: 11 violations (the LOOSE_ERROR false positives only)
- **All WEAK_ASSERTION violations resolved** with actual value verification
- **Tests would catch bugs** where:
  - Wrong data returned
  - Missing fields
  - Extra unexpected fields
  - Wrong IDs
  - Incorrect state transitions

---

## Key Principles for This Round

1. **Track test data**: Define expected values at test setup, verify them at assertion
2. **Verify complete objects**: Use `toEqual()` not existence checks
3. **Verify collections**: After deletion, check the collection doesn't contain the item
4. **No hidden checks**: No `=== null` or `=== undefined` inside `toBe(true)`
5. **Minimize expect.any()**: Only for truly unpredictable values (timestamps, auto-generated UUIDs)
