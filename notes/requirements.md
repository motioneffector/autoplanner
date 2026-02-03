# Autoplanner Requirements

## Overview
A calendar system unlike existing solutions.

## Design Philosophy
**Domain-agnostic.** The library has no concept of "exercise", "chore", "appointment", etc. It only knows:
- Series (definitions of when things happen)
- Instances (specific occurrences)
- Rules, patterns, and constraints
- Conditions and state

The semantic meaning lives entirely in the consumer's domain. The library provides primitives to build any scheduling system - workout routines, chore management, production schedules, whatever. It doesn't know or care what it's scheduling.

**Unified model**: Everything is a Series. A one-time event is a Series with a single instance. Consumer thinks in terms of Series and Instances.

## Core Concept: Recurrence-First Scheduling
- Centered around recurrence, not single events
- Auto-plans schedules from many recurring items
- Supports variety of patterns and conditions
- Two behaviors:
  - **Fixed**: Immovable anchors (never move)
  - **Flexible**: Reflow dynamically around fixed items
- Intelligent, adaptive scheduling - reflows when things change

## Technical Constraints
- Must work with a Bun server using SQL
- Prefer runtime-agnostic design (decoupled from Bun) if SQL functionality isn't compromised
- Consumer project uses bun:sqlite - library should work with it but not assume it
- Adapter pattern: consumer passes in their SQL driver, library works against an abstraction
- **Time zones**: UTC internally, API speaks local time (converts at boundary)
- **Reflow**: Happens on every change - real-time recalculation
- **Single calendar**: One calendar per instance, differentiation via behaviors and tags
