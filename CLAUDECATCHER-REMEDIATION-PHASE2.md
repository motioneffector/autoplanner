# ClaudeCatcher Remediation Phase 2

## Current State
- **Errors**: 0 (all fixed in Phase 1)
- **Warnings**: 438

## Remaining Violations Breakdown

| Category | Count | Verdict |
|----------|-------|---------|
| `toBeDefined()` | 158 | **Needs work** - lazy assertions |
| `toBeNull()` | 115 | Mostly valid (testing deletion/not-found) |
| `toBeUndefined()` | 65 | Mostly valid (testing field absence) |
| `toHaveLength()` | 62 | **Needs work** - no content verification |
| `LOOSE_ERROR` | 32 | **Needs work** - unspecified error types |
| `toBeInstanceOf(Function)` | 6 | **Needs work** - too broad |

**Total requiring fixes: ~258 violations**

---

## Category 1: `toBeDefined()` - 158 violations

### Files by volume:
| File | Count |
|------|-------|
| `16-integration.test.ts` | 30 |
| `fuzz/shrinking/shrinking.test.ts` | 22 |
| `fuzz/integration/stress.test.ts` | 19 |
| `fuzz/properties/transactions.test.ts` | 16 |
| `13-reflow-algorithm.test.ts` | 16 |
| `fuzz/properties/series.test.ts` | 13 |
| `fuzz/properties/constraints.test.ts` | 8 |
| `fuzz/properties/reflow.test.ts` | 7 |
| `fuzz/properties/completions.test.ts` | 6 |
| `fuzz/generators/domain.test.ts` | 6 |
| `fuzz/properties/reminders.test.ts` | 5 |
| `12-relational-constraints.test.ts` | 4 |
| `fuzz/generators/patterns.test.ts` | 3 |
| `fuzz/properties/pattern-crud.test.ts` | 2 |
| `fuzz/state-machine/model-equivalence.test.ts` | 1 |

### Fix strategies by context:

**A. IDs (SeriesId, ConstraintId, etc.):**
```typescript
// Before
expect(result.id).toBeDefined()

// After
expect(result.id).toMatch(/^[a-z]+-[0-9a-f-]{36}$/)  // prefix-uuid format
// OR if just UUID:
expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
```

**B. Redundant (followed by stronger assertion):**
```typescript
// Before
expect(constraint.withinMinutes).toBeDefined()
expect(constraint.withinMinutes).toBeGreaterThanOrEqual(1)

// After - just remove the redundant line
expect(constraint.withinMinutes).toBeGreaterThanOrEqual(1)
```

**C. Objects with known structure:**
```typescript
// Before
expect(result.sourceTarget).toBeDefined()

// After
expect(result.sourceTarget).toEqual(expect.objectContaining({
  seriesId: expect.stringMatching(/^series-/),
  // ... other required fields
}))
```

**D. Return values from operations:**
```typescript
// Before
expect(shrunk).toBeDefined()

// After - verify it's the expected type/structure
expect(shrunk).toEqual(expect.objectContaining({
  value: expect.anything(),
  // or specific shape
}))
```

---

## Category 2: `toHaveLength()` - 62 violations

### Files by volume:
| File | Count |
|------|-------|
| `13-reflow-algorithm.test.ts` | 19 |
| `15-sqlite-adapter.test.ts` | 14 |
| `16-integration.test.ts` | 12 |
| `14-public-api.test.ts` | 8 |
| `fuzz/invariants/invariants.test.ts` | 5 |
| `fuzz/lib/harness.test.ts` | 2 |
| `fuzz/integration/stress.test.ts` | 2 |

### Fix strategy:
```typescript
// Before
expect(instances).toHaveLength(5)

// After - verify content too
expect(instances).toHaveLength(5)
expect(instances.map(i => i.seriesId)).toEqual([
  'series-1', 'series-1', 'series-1', 'series-1', 'series-1'
])
// OR for less rigid verification:
expect(instances.every(i => i.seriesId === expectedSeriesId)).toBe(true)
// OR
expect(instances).toEqual(expect.arrayContaining([
  expect.objectContaining({ date: '2024-01-01' }),
  expect.objectContaining({ date: '2024-01-02' }),
  // ...
]))
```

---

## Category 3: `LOOSE_ERROR` - 32 violations

### Files by volume:
| File | Count |
|------|-------|
| `fuzz/lib/harness.test.ts` | 16 |
| `14-public-api.test.ts` | 4 |
| `04-adapter.test.ts` | 4 |
| `fuzz/properties/transactions.test.ts` | 3 |
| `fuzz/invariants/invariants.test.ts` | 3 |
| `fuzz/properties/series.test.ts` | 2 |

### Fix strategy:
```typescript
// Before
expect(() => something()).toThrow()

// After
expect(() => something()).toThrow(SpecificError)
// OR
expect(() => something()).toThrow('expected message substring')
```

### Error types available:
- `InvalidPatternError`, `InvalidRangeError`, `InvalidConditionError`
- `ValidationError`, `NotFoundError`, `LockedSeriesError`
- `CompletionsExistError`, `LinkedChildrenExistError`
- `NonExistentInstanceError`, `AlreadyCancelledError`, `CancelledInstanceError`
- `CycleDetectedError`, `ChainDepthExceededError`, `DuplicateCompletionError`
- `DuplicateKeyError`, `ForeignKeyError`, `InvalidDataError`

---

## Category 4: `toBeInstanceOf(Function)` - 6 violations

Location: Likely in adapter/API tests checking that methods exist.

### Fix strategy:
```typescript
// Before
expect(adapter.transaction).toBeInstanceOf(Function)

// After - actually test the behavior
const result = await adapter.transaction(async () => 'test')
expect(result).toBe('test')
```

---

## Execution Plan

### Phase 2a: LOOSE_ERROR (32 fixes) - Highest value/effort ratio
1. `fuzz/lib/harness.test.ts` (16)
2. `14-public-api.test.ts` (4)
3. `04-adapter.test.ts` (4)
4. Remaining fuzz files (8)

### Phase 2b: toHaveLength (62 fixes) - Medium effort
1. `13-reflow-algorithm.test.ts` (19)
2. `15-sqlite-adapter.test.ts` (14)
3. `16-integration.test.ts` (12)
4. `14-public-api.test.ts` (8)
5. Fuzz files (9)

### Phase 2c: toBeDefined - Redundant removal (~30 estimated)
Scan for patterns like:
```typescript
expect(x).toBeDefined()
expect(x).toBeGreaterThan(...)  // or any assertion that implies defined
```
Remove the redundant `toBeDefined()`.

### Phase 2d: toBeDefined - ID patterns (~40 estimated)
Replace with UUID/ID pattern matching.

### Phase 2e: toBeDefined - Structure verification (~88 remaining)
Replace with actual structure checks. This requires understanding each test's intent.

### Phase 2f: toBeInstanceOf(Function) (6 fixes)
Replace with actual behavior verification.

---

## Verification

After each phase:
```bash
./claudecatcher -e "**/node_modules/**" . 2>&1 | tail -10
```

Target: 0 errors, <50 warnings (mostly legitimate toBeNull/toBeUndefined).

---

## Notes

### Why toBeNull/toBeUndefined are mostly valid:
- `toBeNull()` after delete operations = testing deletion worked
- `toBeUndefined()` for optional fields = testing field absence
- These ARE the expected values, not lazy assertions

### What makes toBeDefined lazy:
- "I know something should be there but I didn't bother to verify what"
- Often followed by assertions that would fail anyway if undefined
- Misses bugs where the wrong value is returned (but still defined)
