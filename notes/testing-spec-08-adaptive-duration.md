# Segment 8: Adaptive Duration — Formal Specification

## 1. Overview

Adaptive duration calculates scheduled duration based on historical completion times rather than a fixed value.

---

## 2. Types

### 2.1 AdaptiveDuration Config

```
type AdaptiveDuration = {
  mode: 'lastN' | 'windowDays'
  value: number              // n completions or days
  multiplier: number         // default 1.0
  minimum?: Duration         // floor
  maximum?: Duration         // ceiling
  fallback: Duration         // when no history
}
```

---

## 3. Calculate Duration

```
calculateDuration(config: AdaptiveDuration, seriesId: SeriesId): Duration
```

### 3.1 Algorithm

```
calculateDuration(config, seriesId) =
  let durations = getRecentCompletionDurations(seriesId, config.mode, config.value)
  if durations.length = 0 then
    config.fallback
  else
    let avg = sum(durations) / durations.length
    let scaled = avg * config.multiplier
    let bounded = clamp(scaled, config.minimum ?? 0, config.maximum ?? ∞)
    round(bounded)
```

### 3.2 Properties

```
LAW 1 (Fallback): No completions → result = fallback
LAW 2 (Average): Result based on arithmetic mean of durations
LAW 3 (Multiplier): Multiplier applied after average
LAW 4 (Minimum): Result ≥ minimum (if specified)
LAW 5 (Maximum): Result ≤ maximum (if specified)
LAW 6 (Integer): Result is whole minutes (round to nearest)
LAW 7 (Positive): Result ≥ 1 (always, regardless of calculation)
LAW 8 (Floor clamp): If calculated result < 1 after all operations, clamp to 1
```

---

## 4. Mode Semantics

### 4.1 lastN

```
LAW 8: Uses most recent n completions by date
LAW 9: If fewer than n exist, uses all that exist
LAW 10: Order doesn't affect result (it's an average)
```

### 4.2 windowDays

```
LAW 11: Uses all completions in past windowDays days
LAW 12: Window includes today
LAW 13: Empty window → fallback
```

---

## 5. Boundary Conditions

```
B1: multiplier = 1.0 → no scaling
B2: multiplier = 1.25 → 25% padding
B3: minimum = maximum → result is exactly that value (if history exists)
B4: minimum > average * multiplier → result = minimum
B5: maximum < average * multiplier → result = maximum
B6: Single completion → average = that duration
B7: Zero-minute completion (start=end) → average = 0 → clamped to 1
B8: All zero-minute completions → result = 1 (floor clamp)
```

---

## 6. Invariants

```
INV 1: fallback ≥ 1
INV 2: minimum ≤ maximum (if both specified)
INV 3: multiplier > 0
INV 4: value ≥ 1
```

---

## 7. Verification Strategy

### 7.1 Fallback tests

```
TEST: No completions → fallback returned
```

### 7.2 Average tests

```
TEST: durations=[30,60,90] → avg=60
TEST: durations=[10,20] → avg=15
```

### 7.3 Multiplier tests

```
TEST: avg=60, multiplier=1.25 → 75
TEST: avg=60, multiplier=0.5 → 30
```

### 7.4 Bounds tests

```
TEST: avg=60, minimum=45, maximum=90 → 60 (in bounds)
TEST: avg=30, minimum=45 → 45 (clamped up)
TEST: avg=120, maximum=90 → 90 (clamped down)
```

---

## 8. Dependencies

- Segment 6: Completions (getRecentCompletionDurations)
