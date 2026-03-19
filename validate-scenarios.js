#!/usr/bin/env node
// Hockey Position Hero — Scenario Validation Script
// Run: node validate-scenarios.js
// Validates all scenarios have required fields and cross-references are correct.

const fs = require('fs');
const path = require('path');

// Load scenarios.js by evaluating it (it defines a global SCENARIOS const)
const code = fs.readFileSync(path.join(__dirname, 'scenarios.js'), 'utf8');
const fn = new Function(code + '; return SCENARIOS;');
const SCENARIOS = fn();

const VALID_TIERS = ['beginner', 'intermediate', 'advanced'];
const VALID_POSITIONS = ['C', 'LW', 'RW', 'LD', 'RD'];
const TIER_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

let errors = 0;
let warnings = 0;

function error(id, msg) {
  console.error(`  ERROR [Scenario ${id}]: ${msg}`);
  errors++;
}

function warn(id, msg) {
  console.warn(`  WARN  [Scenario ${id}]: ${msg}`);
  warnings++;
}

console.log(`\nValidating ${SCENARIOS.length} scenarios...\n`);

// Check we have scenarios
if (!Array.isArray(SCENARIOS) || SCENARIOS.length === 0) {
  console.error('FATAL: SCENARIOS is not a non-empty array');
  process.exit(1);
}

// Track IDs and tiers
const seenIds = new Set();
let lastTier = -1;

SCENARIOS.forEach((s, idx) => {
  const id = s.id || `index-${idx}`;

  // Required fields
  const required = ['id', 'tier', 'position', 'title', 'desc', 'teamPlayers', 'oppPlayers', 'youStart', 'target', 'successText', 'hints', 'video', 'playSequence'];
  required.forEach(field => {
    if (s[field] === undefined || s[field] === null) {
      error(id, `Missing required field: ${field}`);
    }
  });

  // ID uniqueness
  if (seenIds.has(s.id)) {
    error(id, `Duplicate ID: ${s.id}`);
  }
  seenIds.add(s.id);

  // Tier validity
  if (!VALID_TIERS.includes(s.tier)) {
    error(id, `Invalid tier: "${s.tier}" (must be one of: ${VALID_TIERS.join(', ')})`);
  }

  // Tier ordering
  const tierIdx = TIER_ORDER[s.tier];
  if (tierIdx !== undefined && tierIdx < lastTier) {
    error(id, `Tier order violation: "${s.tier}" appears after a higher tier`);
  }
  if (tierIdx !== undefined) lastTier = tierIdx;

  // Position validity
  if (!VALID_POSITIONS.includes(s.position)) {
    error(id, `Invalid position: "${s.position}" (must be one of: ${VALID_POSITIONS.join(', ')})`);
  }

  // teamPlayers and oppPlayers
  if (Array.isArray(s.teamPlayers)) {
    s.teamPlayers.forEach((p, pi) => {
      if (p.x === undefined || p.y === undefined || !p.label) {
        error(id, `teamPlayers[${pi}] missing x, y, or label`);
      }
    });
  }
  if (Array.isArray(s.oppPlayers)) {
    s.oppPlayers.forEach((p, pi) => {
      if (p.x === undefined || p.y === undefined || !p.label) {
        error(id, `oppPlayers[${pi}] missing x, y, or label`);
      }
    });
  }

  // Exactly one hasPuck
  const allPlayers = [...(s.teamPlayers || []), ...(s.oppPlayers || [])];
  const puckHolders = allPlayers.filter(p => p.hasPuck);
  if (puckHolders.length === 0) {
    error(id, 'No player has hasPuck: true');
  } else if (puckHolders.length > 1) {
    error(id, `Multiple players have hasPuck: true (${puckHolders.length})`);
  }

  // No separate puck field (DRY check)
  if (s.puck !== undefined) {
    warn(id, 'Has a "puck" field — should be derived from hasPuck player');
  }

  // Target
  if (s.target) {
    if (s.target.x === undefined || s.target.y === undefined || s.target.radius === undefined) {
      error(id, 'Target missing x, y, or radius');
    }
  }

  // youStart
  if (s.youStart) {
    if (s.youStart.x === undefined || s.youStart.y === undefined) {
      error(id, 'youStart missing x or y');
    }
  }

  // Hints
  if (Array.isArray(s.hints) && s.hints.length < 2) {
    warn(id, `Only ${s.hints.length} hint(s) — recommend at least 2`);
  }

  // Video
  if (s.video) {
    if (!s.video.id || !s.video.title || !s.video.caption) {
      error(id, 'Video missing id, title, or caption');
    }
  }

  // PlaySequence
  if (Array.isArray(s.playSequence)) {
    if (s.playSequence.length < 2) {
      warn(id, `playSequence has only ${s.playSequence.length} step(s) — recommend at least 2`);
    }

    // Build valid data-ids for this scenario
    const validIds = new Set(['you', 'puck']);
    (s.teamPlayers || []).forEach(p => validIds.add(`team-${p.label}`));
    (s.oppPlayers || []).forEach(p => validIds.add(`opp-${p.label}`));

    s.playSequence.forEach((step, si) => {
      if (!step.target) {
        error(id, `playSequence[${si}] missing target`);
      } else if (!validIds.has(step.target)) {
        error(id, `playSequence[${si}] target "${step.target}" does not match any player data-id (valid: ${[...validIds].join(', ')})`);
      }
      if (step.toX === undefined || step.toY === undefined) {
        error(id, `playSequence[${si}] missing toX or toY`);
      }
      if (step.delay === undefined) {
        error(id, `playSequence[${si}] missing delay`);
      }
    });
  }
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Scenarios: ${SCENARIOS.length}`);
console.log(`  Beginner:     ${SCENARIOS.filter(s => s.tier === 'beginner').length}`);
console.log(`  Intermediate: ${SCENARIOS.filter(s => s.tier === 'intermediate').length}`);
console.log(`  Advanced:     ${SCENARIOS.filter(s => s.tier === 'advanced').length}`);
console.log(`Errors:   ${errors}`);
console.log(`Warnings: ${warnings}`);
console.log(`${'='.repeat(50)}\n`);

if (errors > 0) {
  console.error('VALIDATION FAILED');
  process.exit(1);
} else {
  console.log('VALIDATION PASSED');
  process.exit(0);
}
