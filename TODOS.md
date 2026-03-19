# TODOS

## P1 — LocalStorage Persistence
Save star ratings and tier unlock status across browser sessions. Without this, the kid loses all progress on page refresh.

**Implementation:** `JSON.stringify({starsByLevel, unlockedTiers})` → `localStorage.setItem('hockey-hero-progress', ...)` on each star earn. `JSON.parse(localStorage.getItem(...))` on page init with null fallback.

**Effort:** S (human) / S (CC ~5 min)
**Depends on:** Nothing — can be added any time
**Context:** Deferred from CEO review 2026-03-18. The app currently resets all state on refresh. This is the #1 most impactful improvement after the initial expansion ships.

## P2 — Achievement Badges
Themed badges earned for completing scenario groups or streaks:
- "Defensive Dynamo" — complete all defensive scenarios with 2+ stars
- "Playmaker" — complete all offensive scenarios with 2+ stars
- "Iron Player" — 3-star every scenario
- "Quick Learner" — 5 first-try successes in a row

Display in a trophy case section on the level select screen.

**Effort:** S (human) / S (CC ~10 min)
**Depends on:** LocalStorage persistence (badges need to be saved)
**Context:** Deferred from CEO review 2026-03-18. Kids love collecting things — adds replay motivation beyond stars.
