# Segment 13: Reflow Algorithm — Formal Specification

## 1. Overview

The reflow algorithm computes a valid schedule by placing instances such that all constraints are satisfied. It uses constraint satisfaction with backtracking to guarantee finding a solution if one exists.

**Critical**: This is life-critical software. If a valid arrangement exists, we MUST find it.

---

## 2. Problem Definition

### 2.1 Input

```
type ReflowInput = {
  series: Series[]
  range: DateRange
  completions: Completion[]
  constraints: RelationalConstraint[]
  links: Link[]
}
```

### 2.2 Output

```
type ReflowOutput = {
  schedule: ScheduledInstance[]
  conflicts: Conflict[]
}

type ScheduledInstance = {
  seriesId: SeriesId
  instanceDate: LocalDate
  scheduledStart: LocalDateTime
  scheduledEnd: LocalDateTime
  title: string
  status: 'scheduled' | 'completed' | 'cancelled'
  idealTime: LocalDateTime      // before reflow
  deviation: Duration           // from ideal
}
```

---

## 3. Phase 1: Generate Instances

```
generateInstances(series: Series[], range: DateRange): RawInstance[]

RawInstance = {
  seriesId: SeriesId
  instanceDate: LocalDate
  idealTime: LocalDateTime
  duration: Duration
  fixed: boolean
  wiggle: WiggleConfig | null
  link: Link | null
}
```

### 3.1 Algorithm

```
for each series s:
  dates = expandPatterns(s.patterns, range, s.startDate)
  dates = applyExceptions(dates, s.exceptions, range, s.startDate)
  dates = applyBounds(dates, s.bounds)

  for each date d in dates:
    if isCancelled(s.id, d): continue
    exception = getInstanceException(s.id, d)

    time = if exception?.type = 'rescheduled' then exception.newTime
           else makeDateTime(d, s.timeOfDay)

    duration = if s.duration is AdaptiveDuration then calculateDuration(s.duration, s.id)
               else s.duration

    yield { seriesId: s.id, instanceDate: d, idealTime: time, duration, fixed: s.fixed, wiggle: s.wiggle, link: getLink(s.id) }
```

### 3.2 Condition Evaluation

```
// Only include instances from patterns whose conditions are satisfied
for each pattern p in s.patterns:
  if p.conditionId ≠ null:
    condition = getCondition(p.conditionId)
    if not evaluateCondition(condition, completionStore, today):
      // pattern not active, skip its instances
```

### 3.3 Properties

```
LAW 1: Deterministic (same inputs → same instances)
LAW 2: Instances respect series bounds
LAW 3: Cancelled instances excluded
LAW 4: Rescheduled instances use new time as ideal
LAW 5: Conditions evaluated as of current date
LAW 6: Duration calculated once per instance at start of reflow (not re-evaluated)
```

---

## 4. Phase 2: Build Constraint Graph

```
buildConstraintGraph(instances: RawInstance[], constraints: RelationalConstraint[]): ConstraintGraph

ConstraintGraph = {
  nodes: Map<InstanceKey, InstanceNode>
  edges: ConstraintEdge[]
}

InstanceNode = {
  instance: RawInstance
  domain: TimeSlot[]         // possible placements
}

ConstraintEdge = {
  type: ConstraintType
  source: InstanceKey
  dest: InstanceKey
  params: any                // e.g., withinMinutes
}
```

### 4.1 Overlap Constraints

```
// Implicit constraint: timed instances cannot overlap (unless both fixed)
for each pair (A, B) where A ≠ B:
  if A.fixed AND B.fixed:
    // Allow overlap, will generate warning
  else:
    add edge: noOverlap(A, B)
```

### 4.2 Relational Constraints

```
for each constraint c:
  sourceInstances = resolveTarget(c.sourceTarget, instances)
  destInstances = resolveTarget(c.destTarget, instances)
  for each (s, d) in sourceInstances × destInstances:
    add edge: c.type(s, d, c.params)
```

### 4.3 Chain Constraints

```
for each link l:
  parentInstances = instances.filter(i => i.seriesId = l.parentSeriesId)
  childInstances = instances.filter(i => i.seriesId = l.childSeriesId)
  for each (p, c) where sameDay(p, c):  // or corresponding dates
    add edge: chainConstraint(p, c, l.targetDistance, l.earlyWobble, l.lateWobble)
```

---

## 5. Phase 3: Compute Domains

```
computeDomains(instances: RawInstance[]): Map<InstanceKey, TimeSlot[]>
```

### 5.1 Fixed Instances

```
domain(fixed instance) = [instance.idealTime]  // single value
```

### 5.2 Flexible Instances

```
domain(flexible instance) =
  let validDays = [instance.instanceDate - wiggle.daysBefore,
                   instance.instanceDate + wiggle.daysAfter]
  let validTimes = wiggle.timeWindow ?? [instance.idealTime, instance.idealTime]

  discretize(validDays × validTimes, granularity=5min)
```

### 5.3 Chain Children

```
domain(chain child) = computed dynamically based on parent's assigned slot
  // Initially: full possible range
  // Narrowed when parent assigned
```

### 5.4 All-Day Instances

```
domain(all-day instance) = EXCLUDED
  // All-day items don't participate in reflow
  // They're banners, not timed events
```

### 5.5 Properties

```
LAW 6: Fixed domain has exactly one slot
LAW 7: Flexible domain bounded by wiggle config
LAW 8: Domain discretized to 5-minute increments (configurable)
LAW 9: All-day excluded from reflow entirely
```

---

## 6. Phase 4: Constraint Propagation (Arc Consistency)

```
propagate(graph: ConstraintGraph): boolean

// AC-3 algorithm
queue = all edges
while queue not empty:
  edge = queue.pop()
  if revise(edge):
    if domain(edge.source).isEmpty():
      return false  // no solution possible
    queue.addAll(edges involving edge.source)
return true

revise(edge): boolean =
  removed = false
  for slot in domain(edge.source):
    if no slot in domain(edge.dest) satisfies edge.constraint:
      domain(edge.source).remove(slot)
      removed = true
  return removed
```

### 6.1 Properties

```
LAW 10: Propagation prunes impossible values
LAW 11: If any domain becomes empty, no solution exists
LAW 12: Propagation is sound (doesn't remove valid solutions)
LAW 13: Propagation may not achieve full consistency (backtracking still needed)
```

---

## 7. Phase 5: Backtracking Search

```
solve(graph: ConstraintGraph, assignment: Assignment): Assignment | null

if all instances assigned:
  return assignment

instance = selectUnassigned(graph, assignment)  // variable ordering

for slot in orderDomainValues(instance, graph):  // value ordering
  if isConsistent(instance, slot, assignment, graph):
    assignment[instance] = slot

    if instance.hasChildren:
      computeChildDomains(instance, slot, graph)

    savedDomains = saveDomains(graph)
    if propagate(graph):
      result = solve(graph, assignment)
      if result ≠ null:
        return result

    restoreDomains(graph, savedDomains)
    assignment.remove(instance)

return null
```

### 7.1 Variable Ordering (MRV + Degree)

```
selectUnassigned(graph, assignment) =
  // Most constrained variable first (fail-fast)
  unassigned = instances not in assignment

  // Priority:
  // 1. Fixed items (domain size = 1)
  // 2. Chain roots (before their children)
  // 3. Smallest domain
  // 4. Most constraints (tiebreaker)

  sort(unassigned, by: [isFixed desc, isChainRoot desc, domainSize asc, constraintCount desc])
  return first(unassigned)
```

### 7.2 Value Ordering (LCV)

```
orderDomainValues(instance, graph) =
  // Most likely to succeed first
  sort(instance.domain, by: [
    distanceFromIdeal asc,      // prefer closer to ideal time
    dayLoad asc                 // prefer less loaded days
  ])
```

### 7.3 Properties

```
LAW 14 (Soundness): If returns assignment, it satisfies all constraints
LAW 15 (Completeness): If valid assignment exists, algorithm finds one
LAW 16 (Termination): Algorithm always terminates (finite domains, no cycles)
```

---

## 8. Phase 6: Handle No Solution

```
handleNoSolution(graph: ConstraintGraph, instances: RawInstance[]): ReflowOutput

// If search returns null, some constraints are unsatisfiable
// Fall back to best-effort placement

// 1. Place all fixed items (they never move)
for fixed in instances.filter(isFixed):
  schedule.add(fixed at fixed.idealTime)

// 2. Attempt to place flexible items
for flex in instances.filter(not isFixed):
  slot = findBestSlot(flex, schedule)  // may overlap
  if slot = null:
    slot = flex.idealTime  // place at ideal anyway
    conflicts.add(noValidSlot(flex))
  if overlaps(slot, schedule):
    conflicts.add(overlap(flex, existingAt(slot)))
  schedule.add(flex at slot)

// 3. Check all constraints, report violations
for constraint in allConstraints:
  if not satisfied(constraint, schedule):
    conflicts.add(constraintViolation(constraint))

return { schedule, conflicts }
```

### 8.1 Conflict Types

```
type Conflict = {
  type: 'overlap' | 'constraintViolation' | 'chainCannotFit' | 'noValidSlot'
  severity: 'warning' | 'error'
  involvedSeries: SeriesId[]
  instanceDates: LocalDate[]
  description: string
  date: LocalDate
}
```

| Type | Cause | Severity |
|------|-------|----------|
| `overlap` | Two fixed items overlap | warning |
| `chainCannotFit` | Chain exceeds distance bounds | error |
| `constraintViolation` | Relational constraint unsatisfiable | error |
| `noValidSlot` | No slot exists in wiggle range | warning |

### 8.2 Properties

```
LAW 17: Fixed items ALWAYS placed at their time
LAW 18: Fixed-fixed overlaps allowed (warning generated)
LAW 19: Best-effort for flexible items
LAW 20: All conflicts reported
```

---

## 9. Constraint Checking Functions

### 9.1 No Overlap

```
noOverlap(A, B, schedule) =
  A.end ≤ B.start OR B.end ≤ A.start
```

### 9.2 Chain Constraint

```
chainConstraint(parent, child, targetDist, earlyWobble, lateWobble, schedule) =
  let parentEnd = getParentEndTime(parent, schedule)
  let target = parentEnd + targetDist
  let earliest = target - earlyWobble
  let latest = target + lateWobble
  schedule[child].start ∈ [earliest, latest]

getParentEndTime(parent, schedule) =
  let completion = getCompletionByInstance(parent.seriesId, parent.instanceDate)
  if completion ≠ null then
    completion.endTime  // actual end time from logged completion
  else
    schedule[parent].end  // scheduled end time (start + duration from Phase 1)
```

**Duration clarification**: `schedule[parent].end` uses the duration calculated during Phase 1 (Generate Instances). For adaptive duration series, this is computed once at the start of reflow from historical completions and used consistently throughout. If a task is underway but not completed, child scheduling uses the originally scheduled duration until actual completion is logged.

### 9.3 Relational Constraints

```
mustBeOnSameDay(A, B, schedule) = dateOf(schedule[A]) = dateOf(schedule[B])
cantBeOnSameDay(A, B, schedule) = dateOf(schedule[A]) ≠ dateOf(schedule[B])
mustBeBefore(A, B, schedule) = schedule[A].end ≤ schedule[B].start
mustBeAfter(A, B, schedule) = schedule[A].start ≥ schedule[B].end
// etc.
```

---

## 10. Workload Balancing

```
calculateDayLoad(day: LocalDate, schedule: Schedule): Duration =
  sum(instance.duration for instance in schedule where dateOf(instance) = day)

dayLoadScore(slot: TimeSlot, instance: RawInstance, schedule: Schedule): number =
  let day = dateOf(slot)
  let currentLoad = calculateDayLoad(day, schedule)
  return -currentLoad  // prefer less loaded days
```

### 10.1 Properties

```
LAW 21: Day with less scheduled time gets bonus
LAW 22: Balancing only affects flexible items with day wiggle
LAW 23: Balancing is secondary to constraint satisfaction
```

---

## 11. Soundness Guarantee

**THEOREM**: If a valid arrangement exists that satisfies all hard constraints, the algorithm finds it.

**Proof sketch**:
1. Arc consistency prunes only values that cannot be part of any solution
2. Backtracking explores all remaining possibilities
3. Variable/value ordering affects performance, not correctness
4. Algorithm terminates because domains are finite and we never revisit states

**Corollary**: Only when NO valid arrangement exists do we fall back to best-effort with conflicts.

---

## 12. Performance Considerations

```
LAW 24: Typical case is ~1 week window
LAW 25: Arc consistency dramatically reduces search space
LAW 26: MRV ordering finds conflicts early
LAW 27: For typical calendar data, search space is manageable
LAW 28: Correctness over performance (life-critical)
```

---

## 13. Invariants

```
INV 1: Fixed items never moved
INV 2: All-day items excluded from reflow
INV 3: Chain bounds are hard constraints
INV 4: Schedule deterministic for same inputs
INV 5: All conflicts reported (no silent failures)
```

---

## 14. Verification Strategy

### 14.1 Unit tests

- Domain computation for each item type
- Constraint checking functions
- Arc consistency propagation

### 14.2 Property tests

```
PROPERTY: For randomly generated valid schedules, algorithm finds a solution
PROPERTY: For schedules with known conflicts, algorithm reports them
PROPERTY: Fixed items always at their scheduled time
PROPERTY: Chain bounds never violated (unless conflict reported)
```

### 14.3 Stress tests

- 100+ series
- Complex constraint networks
- Deep chains

### 14.4 Soundness tests

- Construct scenarios with exactly one valid solution
- Verify algorithm finds it

---

## 15. Dependencies

- Segment 1: Time & Date Utilities
- Segment 2: Pattern Expansion
- Segment 3: Condition Evaluation
- Segment 8: Adaptive Duration
- Segment 9: Instance Exceptions
- Segment 11: Links
- Segment 12: Relational Constraints
