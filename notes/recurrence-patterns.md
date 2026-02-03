# Recurrence Pattern Model

## Base Patterns

### Interval-based
- **Daily**: Every day
- **Every N days**: Every 2 days, every 3 days, etc.
- **Weekly**: Every week on same weekday as start
- **Every N weeks**: Every 2 weeks, every 3 weeks, etc.
- **Monthly (by date)**: Same date each month (15th of every month)
- **Monthly (by position)**: Nth weekday of month (2nd Thursday, last Friday)
- **Yearly**: Same date each year

### Weekday-based
- **Specific weekdays**: Mon/Wed/Fri, Tue/Thu, weekdays only, weekends only
- **Every N weeks on weekday**: Every 5 weeks on Wednesday (interval-based, not calendar-month-based)

### Position-based (calendar-relative)
- **First of month**: 1st day of each month
- **Last of month**: Last day of each month (handles 28/29/30/31)
- **Nth weekday of month**: 1st Monday, 2nd Thursday, 3rd Friday, last Wednesday, etc.
- **Nth-to-last weekday of month**: 2nd-to-last Friday, etc. (if needed)

## Modifiers

### Exceptions (subtract from pattern)
- **Except pattern**: "Every day except every 2nd Thursday"
- Composable: base pattern minus exception pattern
- **Specific date exclusions**: Use `cancelInstance(seriesId, instanceDate)` — not a pattern concept

### Bounds
- **Start date**: When pattern begins (required)
- **End date**: When pattern stops (optional)
- **Count**: Stop after N occurrences (alternative to end date)

## Conditional Activation
Patterns can be gated by conditions (separate from the pattern itself):
- Pattern defines *when* something would occur
- Condition defines *whether* the pattern is currently active
- Example: "MWF weight training" pattern only active when state = Conditioned

---

## Resolved Questions

1. **"Every N weeks on weekday"** - Every 5 weeks on Wednesday = once every 5 weeks, on Wednesday.
   - Separate from "Nth weekday of month" (2nd Thursday of each month)

2. **Combining patterns** - Yes, single series can have multiple patterns (union).
   - "1st and 15th of every month" = one series with two patterns

3. **Pattern syntax** - Objects with params/tags. Possibly ECS-like structure. Object-oriented generally.

4. **Month-end edge cases** - Industry consensus (Google, Outlook, Apple, iCalendar RRULE):
   - **"31st of every month"**: Skips months without a 31st. Predictable, explicit.
   - **"Last day of month"**: Explicit separate option, fires every month (28/29/30/31).
   - Rationale: "31st" and "last day" are semantically different. Moving to 28th in February would be surprising and could conflict with other items. If you want every month, explicitly use "last day."
   - **Our approach**: Same. Skip missing dates. Provide "last day of month" as distinct pattern.
