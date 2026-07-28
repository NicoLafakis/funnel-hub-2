# 0003. First Active Touch Owns Movement

**Status:** Accepted - **Date:** 2026-07-28

> Serves [PRD 0006](../requirements.md).

## Context

The shipped touch contract assigns the first touch by screen half: left moves,
right orbits. External mobile testing found that a normal right-handed
lower-right first gesture therefore moves the camera and reads as broken input.
The system already supports concurrent movement and orbit, explicit pointer
IDs, cancellation, and release damping; ownership is the defective decision.

## Decision

The first active non-UI touch owns movement regardless of position. A second
touch owns camera orbit. Roles remain stable for each pointer's lifetime and do
not transfer implicitly. If movement lifts while orbit remains, the orbit
pointer remains orbit and the next new touch may claim movement.

Desktop keyboard/mouse behavior remains unchanged. Optional pinch pitch may
continue when two touches are present. UI controls consume their pointer events
before the gameplay input machine.

## Alternatives considered

- Keep left/right halves: rejected because it reproduces the measured first-use failure.
- Promote the remaining orbit touch to movement when the movement touch lifts: rejected because it silently changes the meaning of a thumb already in motion.
- Require a fixed joystick: deferred because it adds a permanent UI surface and is not necessary to correct role ownership.
- Disable camera touch entirely: rejected because camera control is part of the intended game.

## Consequences

- One-handed first use becomes position-independent.
- Two-thumb movement/camera control stays possible.
- The state machine needs explicit movement and orbit owners plus transition tests.
- A one-finger camera gesture is no longer available unless a later visible camera control is explicitly approved.
- Existing game-design and tech-architecture text describing the half-screen scheme must change in the same implementation commit.
