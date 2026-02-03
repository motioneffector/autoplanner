# Reflow Algorithm

**Critical context**: This is life-critical software. If a valid arrangement exists, we must find it. Greedy placement is not acceptable.

## Approach: Constraint Satisfaction with Backtracking

This is a constraint satisfaction problem (CSP):
- **Variables**: Instances to be placed
- **Domains**: Valid time slots for each instance (within wiggle range)
- **Constraints**: No overlaps, relational constraints, chain bounds

## Phase 1: Generate Instances

For the requested date range:
1. For each series, expand patterns into candidate instances
2. Subtract exception patterns
3. Apply instance exceptions (cancelled → remove, rescheduled → use new time as ideal)
4. Evaluate conditions to determine which patterns are active
5. Result: list of instances with ideal times

Pattern expansion is procedural and deterministic. Same inputs → same raw instances.

## Phase 2: Build Constraint Graph

Identify all constraints between instances:

**Overlap constraints**:
- Timed items can't occupy the same time slot
- Exception: fixed-fixed overlaps are allowed (warn but don't prevent)

**Relational constraints**:
- Day-level: mustBeOnSameDay, cantBeOnSameDay
- Intra-day: mustBeNextTo, cantBeNextTo, mustBeBefore, mustBeAfter, mustBeWithin

**Chain constraints**:
- Child must be within [targetDistance - earlyWobble, targetDistance + lateWobble] of parent end
- These bounds are inviolable

Represent as graph: nodes = instances, edges = constraints

## Phase 3: Compute Domains

For each instance, compute valid placements:

**Fixed items**: Domain = single value (exact scheduled time)

**Flexible items**: Domain = set of valid slots based on:
- Ideal date ± daysBefore/daysAfter
- Time window (earliest to latest) on each valid day
- Discretize into intervals (e.g., 5-minute increments)

**Chain children**: Domain computed dynamically based on parent's assigned slot

**All-day items**: Excluded from reflow. They're banners, not timed events. No domain, no constraints.

## Phase 4: Constraint Propagation (Arc Consistency)

Before searching, prune impossible values:

```
function propagate():
    queue = all constraint edges
    while queue not empty:
        (instance, constraint) = queue.pop()
        if revise(instance, constraint):
            if instance.domain is empty:
                return false  // No solution
            // Re-check all constraints involving this instance
            queue.add(constraints involving instance)
    return true

function revise(instance, constraint):
    removed = false
    for value in instance.domain:
        if no value in other.domain satisfies constraint:
            instance.domain.remove(value)
            removed = true
    return removed
```

If any domain becomes empty, no valid solution exists.

## Phase 5: Backtracking Search

```
function solve(instances, assignment):
    if all instances assigned:
        return assignment

    instance = selectUnassigned(instances, assignment)

    for slot in orderDomainValues(instance):
        if isConsistent(instance, slot, assignment):
            assignment[instance] = slot

            // For chain parents: compute children's domains now
            if instance.hasChildren:
                computeChildDomains(instance, slot)

            savedDomains = saveDomains()
            if propagate():
                result = solve(instances, assignment)
                if result != null:
                    return result

            restoreDomains(savedDomains)
            unassign(instance)

    return null
```

## Phase 6: Handle No Solution

If search returns null, some constraints are unsatisfiable:

1. Place all fixed items (they never move)
2. Re-run search with relaxed constraints:
   - Try to place as many items as possible
   - When an item can't be placed, place at ideal time anyway
   - Flag as conflict
3. Return schedule with conflicts marked

Conflicts indicate the consumer configured something impossible. The system did its best.

## Ordering Heuristics

### Variable Ordering (which instance to assign next)

Most constrained first (fail-fast):

1. **Fixed items**: Domain size = 1, assign first
2. **Chain roots**: Before their children (children depend on parent placement)
3. **Smallest domain**: Fewer options = assign earlier
4. **Most constraints**: Tiebreaker — more edges in constraint graph = assign earlier

### Value Ordering (which slot to try first)

Most likely to succeed:

1. **Closest to ideal time**: Minimize deviation
2. **Lower day load**: For items with day wiggle, prefer less loaded days (balances workload)

## Chain Handling

Chains are placed as units:

1. When assigning a chain root, compute children's concrete domains based on parent's slot
2. Children's domains = [parent_end + targetDistance - earlyWobble, parent_end + targetDistance + lateWobble]
3. If any child's domain becomes empty (chain can't fit), parent's slot is invalid → try next slot
4. Recursively handle grandchildren, etc.

If parent has a logged completion with actual end time, use that instead of scheduled end time.

## Workload Balancing

When scoring slots for items with day wiggle:

```
score(slot) = -distance_from_ideal + balance_bonus

balance_bonus = (max_day_load - this_day_load) * balance_weight
```

Days with less scheduled time get a bonus, spreading work across days.

## Conflict Types

| Type | Cause | Severity |
|------|-------|----------|
| `overlap` | Two fixed items overlap | warning |
| `chainCannotFit` | Chain exceeds distance bounds | error |
| `constraintViolation` | Relational constraint unsatisfiable | error |
| `noValidSlot` | No slot exists in wiggle range | warning |

## Soundness Guarantee

**If a valid arrangement exists that satisfies all constraints, the algorithm finds it.**

Only when no valid arrangement exists do we fall back to best-effort placement with conflicts flagged.

## Performance Notes

- Mostly computing ~1 week at a time
- Arc consistency prunes domains before search, reducing backtracking
- Variable ordering (most constrained first) finds conflicts early
- For typical calendar data, search space is manageable
- Correctness over performance — this is life-critical
