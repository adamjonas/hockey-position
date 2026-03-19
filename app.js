// ══════════════════════════════════════════════════════════════
// Hockey Position Hero — Game Engine
// ══════════════════════════════════════════════════════════════
// Extracted from index.html and enhanced with:
//   - Tier-based level progression (beginner / intermediate / advanced)
//   - Position badge display
//   - data-id attributes on players
//   - Puck position derived from hasPuck flag
//   - Sound effects via Web Audio API
//   - Play animation system (playSequence)
//   - Service worker registration
// ══════════════════════════════════════════════════════════════

// Rink is 2:1 aspect ratio — vertical distances are perceptually
// half as large as horizontal ones, so we scale y by 0.5 in
// distance calculations.
const RINK_ASPECT_CORRECTION = 0.5;

// Position code → friendly display name
const POSITION_NAMES = {
  C: "Center",
  LW: "Left Wing",
  RW: "Right Wing",
  LD: "Left Defense",
  RD: "Right Defense",
};

// Tier ordering and labels
const TIER_ORDER = ["beginner", "intermediate", "advanced"];
const TIER_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const TIER_PREV = {
  intermediate: "beginner",
  advanced: "intermediate",
};

// ══════════ STATE ══════════
let currentLevel = 0;
let starsByLevel = new Array(SCENARIOS.length).fill(0);
let attempts = 0;
let hintRevealed = false;

const rink = document.getElementById("rink");

// ══════════════════════════════════════════════════════════════
// AUDIO SYSTEM — Web Audio API
// ══════════════════════════════════════════════════════════════
//
//  initAudio()          — create AudioContext on first user click
//  playSkateSound()     — white noise burst on drag START
//  playWhistleSound()   — sine sweep on "Check Position" click
//  playCheerSound()     — sawtooth chord on SUCCESS
//  playBuzzerSound()    — square wave on MISS
//
//  ┌─────────────┐
//  │  AudioCtx   │
//  └──────┬──────┘
//         │
//    ┌────┴────────────────────────────┐
//    │  playSkateSound()              │
//    │  noise buffer ─► highpass ─► gain ─► destination
//    │  duration: 0.08s               │
//    ├────────────────────────────────┤
//    │  playWhistleSound()            │
//    │  sine osc ─► gain ─► destination
//    │  freq ramp: 800→1200→800 over 0.3s
//    ├────────────────────────────────┤
//    │  playCheerSound()              │
//    │  N sawtooth oscs (random 200-600Hz)
//    │  ─► gain envelope ─► destination
//    │  duration: 0.6s               │
//    ├────────────────────────────────┤
//    │  playBuzzerSound()             │
//    │  square osc 150Hz ─► gain ─► destination
//    │  duration: 0.2s               │
//    └────────────────────────────────┘
//
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn("Web Audio not supported");
  }
}

function playSkateSound() {
  if (!audioCtx) return;
  // Short white noise burst through a highpass filter
  const bufferSize = audioCtx.sampleRate * 0.08; // 80ms
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 3000;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

  source.connect(highpass);
  highpass.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function playWhistleSound() {
  if (!audioCtx) return;
  // Sine wave sweep 800 → 1200 → 800 Hz over 0.3s
  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
  osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.3);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

function playCheerSound() {
  if (!audioCtx) return;
  // Multiple sawtooth oscillators at random frequencies 200-600Hz
  const count = 5;
  const duration = 0.6;
  for (let i = 0; i < count; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 200 + Math.random() * 400;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.05);
    osc.stop(audioCtx.currentTime + duration);
  }
}

function playBuzzerSound() {
  if (!audioCtx) return;
  // Square wave at 150Hz for 0.2s
  const osc = audioCtx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 150;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

function playGoalHornSound() {
  if (!audioCtx) return;
  // Goal horn: low brass tone that swells and sustains
  const duration = 1.5;
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 110 + i * 5; // slightly detuned for thickness

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime + duration - 0.3);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }
}

// ══════════ SCREENS ══════════
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("feedback-overlay").classList.remove("show");
  closeVideo();
}

function startGame() {
  initAudio();
  showLevels();
}

// ══════════ TIER HELPERS ══════════

// Returns the indices into the flat SCENARIOS array for a given tier.
function scenariosForTier(tier) {
  const indices = [];
  SCENARIOS.forEach((s, i) => {
    if (s.tier === tier) indices.push(i);
  });
  return indices;
}

// Returns which tier a scenario index belongs to.
function tierForIndex(idx) {
  return SCENARIOS[idx].tier;
}

// Can the given tier be played?
// beginner — always unlocked
// intermediate — all beginner scenarios have >= 1 star
// advanced — all intermediate scenarios have >= 1 star
function canUnlock(tier) {
  if (tier === "beginner") return true;
  const prevTier = TIER_PREV[tier];
  if (!prevTier) return true;
  const prevIndices = scenariosForTier(prevTier);
  return prevIndices.length > 0 && prevIndices.every(i => starsByLevel[i] >= 1);
}

// ══════════ LEVEL SELECT (with tiers) ══════════
function showLevels() {
  showScreen("level-select");
  const grid = document.getElementById("level-grid");
  grid.innerHTML = "";

  TIER_ORDER.forEach(tier => {
    const indices = scenariosForTier(tier);
    if (indices.length === 0) return;

    const unlocked = canUnlock(tier);

    // Tier header
    const header = document.createElement("div");
    header.className = "tier-header";
    header.style.cssText = "grid-column: 1 / -1; margin-top: 1.2rem; margin-bottom: 0.4rem;";

    const tierTitle = document.createElement("h3");
    tierTitle.style.cssText = "font-size: 1.3rem; color: #6c5ce7; display: flex; align-items: center; gap: 0.5rem;";
    tierTitle.textContent = TIER_LABELS[tier];
    if (!unlocked) {
      const lockIcon = document.createElement("span");
      lockIcon.textContent = "🔒";
      lockIcon.style.fontSize = "1.1rem";
      tierTitle.appendChild(lockIcon);
    }
    header.appendChild(tierTitle);

    if (!unlocked) {
      const lockMsg = document.createElement("p");
      lockMsg.style.cssText = "font-size: 0.85rem; color: #b2bec3; margin-top: 0.2rem;";
      const prevLabel = TIER_LABELS[TIER_PREV[tier]];
      lockMsg.textContent = `Complete ${prevLabel} to unlock!`;
      header.appendChild(lockMsg);
    }

    grid.appendChild(header);

    // Level tiles
    indices.forEach(i => {
      const s = SCENARIOS[i];
      const tile = document.createElement("div");
      tile.className = "level-tile" + (starsByLevel[i] > 0 ? " completed" : "");

      if (!unlocked) {
        tile.style.cssText = "opacity: 0.45; pointer-events: none; filter: grayscale(0.6);";
      }

      const st = starStr(starsByLevel[i]);
      tile.innerHTML =
        `<div class="level-num">${i + 1}</div>` +
        `<div class="level-name">${s.title}</div>` +
        `<div class="level-stars">${st}</div>`;

      if (unlocked) {
        tile.addEventListener("click", () => loadLevel(i));
      }

      grid.appendChild(tile);
    });
  });
}

function starStr(n) {
  let s = "";
  for (let i = 0; i < 3; i++) s += i < n ? "⭐" : "☆";
  return s;
}

// ══════════ LOAD LEVEL ══════════
function loadLevel(idx) {
  showScreen("game-screen");
  currentLevel = idx;
  attempts = 0;
  hintRevealed = false;

  const s = SCENARIOS[idx];
  const tier = s.tier || "beginner";
  const tierIndices = scenariosForTier(tier);
  const posInTier = tierIndices.indexOf(idx);

  document.getElementById("level-badge").textContent =
    `Level ${posInTier + 1} of ${tierIndices.length}`;
  document.getElementById("scenario-title").textContent = s.title;
  document.getElementById("scenario-desc").innerHTML = s.desc;

  // Progress bar shows progress within the CURRENT TIER
  const tierProgress = tierIndices.length > 0
    ? (posInTier / tierIndices.length) * 100
    : 0;
  document.getElementById("progress-fill").style.width = tierProgress + "%";

  // Position badge
  const positionBadge = document.getElementById("position-badge");
  if (positionBadge && s.position) {
    const friendlyName = POSITION_NAMES[s.position] || s.position;
    positionBadge.textContent = "You're the: " + friendlyName;
    positionBadge.style.display = "";
  } else if (positionBadge) {
    positionBadge.style.display = "none";
  }

  document.getElementById("btn-hint").style.display = "none";
  document.getElementById("btn-check").style.display = "";

  renderStarsHeader();
  renderRink(s);
}

function renderStarsHeader() {
  const c = document.getElementById("stars-display");
  c.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "star" + (i < starsByLevel[currentLevel] ? " earned" : ""));
    svg.innerHTML =
      `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" ` +
      `fill="${i < starsByLevel[currentLevel] ? '#f1c40f' : '#ddd'}" stroke="#e2b100" stroke-width="0.5"/>`;
    c.appendChild(svg);
  }
}

// ══════════ RENDER RINK ══════════
function renderRink(scenario) {
  // Clear previous dynamic elements (players, target, puck anim)
  rink.querySelectorAll(".player, .target-zone, .puck-anim").forEach(el => el.remove());

  const toast = document.getElementById("rink-toast");
  toast.classList.remove("show");
  toast.textContent = "";

  // Hidden target zone (revealed by hint)
  const tz = document.createElement("div");
  tz.className = "target-zone";
  tz.id = "target-zone";
  tz.style.left = (scenario.target.x - scenario.target.radius) + "%";
  tz.style.top = (scenario.target.y - scenario.target.radius * 2) + "%";
  tz.style.width = (scenario.target.radius * 2) + "%";
  tz.style.height = (scenario.target.radius * 2 * 2) + "%"; // doubled for aspect ratio
  rink.appendChild(tz);

  // Team players
  scenario.teamPlayers.forEach(p => rink.appendChild(makePlayer(p, "team")));

  // Opponent players
  scenario.oppPlayers.forEach(p => rink.appendChild(makePlayer(p, "opp")));

  // YOU player
  const you = document.createElement("div");
  you.className = "player you";
  you.id = "player-you";
  you.setAttribute("data-id", "you");
  you.textContent = "YOU";
  you.style.left = scenario.youStart.x + "%";
  you.style.top = scenario.youStart.y + "%";
  rink.appendChild(you);
  setupDrag(you);
}

function makePlayer(data, type) {
  const el = document.createElement("div");
  el.className = "player " + type;
  el.textContent = data.label;
  el.style.left = data.x + "%";
  el.style.top = data.y + "%";

  // data-id: "team-LW", "opp-C", etc.
  el.setAttribute("data-id", type + "-" + data.label);

  if (data.hasPuck) {
    el.classList.add("has-puck");
    const d = document.createElement("div");
    d.className = "puck-icon";
    el.appendChild(d);
  }
  return el;
}

// ══════════ DERIVE PUCK POSITION ══════════
// Instead of reading scenario.puck, find the player with hasPuck: true.
function getPuckPosition(scenario) {
  const allPlayers = (scenario.teamPlayers || []).concat(scenario.oppPlayers || []);
  const carrier = allPlayers.find(p => p.hasPuck);
  if (carrier) return { x: carrier.x, y: carrier.y };
  // Fallback to legacy puck field if no hasPuck player found
  return scenario.puck || { x: 50, y: 50 };
}

// ══════════ DRAG ══════════
function setupDrag(el) {
  let sX, sY, eX, eY;

  function start(e) {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    sX = t.clientX;
    sY = t.clientY;
    eX = parseFloat(el.style.left);
    eY = parseFloat(el.style.top);

    // Play skate sound on drag START only
    playSkateSound();

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", end);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
  }

  function move(e) {
    e.preventDefault();
    const rect = rink.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const dx = ((t.clientX - sX) / rect.width) * 100;
    const dy = ((t.clientY - sY) / rect.height) * 100;
    el.style.left = Math.max(2, Math.min(98, eX + dx)) + "%";
    el.style.top = Math.max(2, Math.min(98, eY + dy)) + "%";

    // No proximity hints during drag — kid uses hockey knowledge
  }

  function end() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", end);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", end);
  }

  el.addEventListener("mousedown", start);
  el.addEventListener("touchstart", start, { passive: false });
}

// ══════════ PROXIMITY ══════════
function getDist() {
  const you = document.getElementById("player-you");
  const s = SCENARIOS[currentLevel];
  const dx = parseFloat(you.style.left) - s.target.x;
  const dy = (parseFloat(you.style.top) - s.target.y) * RINK_ASPECT_CORRECTION;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateProximityGlow() {
  const you = document.getElementById("player-you");
  const dist = getDist();
  const s = SCENARIOS[currentLevel];

  // Remove old glows
  you.classList.remove("glow-cold", "glow-warm", "glow-hot", "glow-fire");

  if (dist <= s.target.radius) {
    you.classList.add("glow-fire");
  } else if (dist < s.target.radius * 2) {
    you.classList.add("glow-hot");
  } else if (dist < s.target.radius * 3.5) {
    you.classList.add("glow-warm");
  } else {
    you.classList.add("glow-cold");
  }
}

function updateMeter(dist) {
  const s = SCENARIOS[currentLevel];
  const maxDist = 60; // max meaningful distance in %
  const pct = Math.max(0, Math.min(100, (1 - dist / maxDist) * 100));

  const meter = document.getElementById("proximity-meter");
  meter.classList.remove("hidden");
  const fill = document.getElementById("meter-fill");
  const label = document.getElementById("meter-label");

  fill.style.width = pct + "%";

  if (dist <= s.target.radius) {
    fill.style.background = "linear-gradient(90deg, #00b894, #55efc4)";
    label.textContent = "Perfect!";
    label.style.color = "#00b894";
  } else if (dist < s.target.radius * 2) {
    fill.style.background = "linear-gradient(90deg, #e17055, #fdcb6e)";
    label.textContent = "So close!";
    label.style.color = "#e17055";
  } else if (dist < s.target.radius * 3.5) {
    fill.style.background = "linear-gradient(90deg, #fdcb6e, #ffeaa7)";
    label.textContent = "Getting warm...";
    label.style.color = "#f39c12";
  } else {
    fill.style.background = "linear-gradient(90deg, #74b9ff, #a29bfe)";
    label.textContent = "Cold...";
    label.style.color = "#74b9ff";
  }
}

// ══════════════════════════════════════════════════════════════
// PLAY ANIMATION SYSTEM
// ══════════════════════════════════════════════════════════════
//
//  After the player finds the correct position, animate the
//  play sequence defined in scenario.playSequence.
//
//  Each step targets a DOM element by data-id and slides it
//  to new (toX, toY) coordinates after a delay.
//
//  Timeline:
//  ┌──────────┐    ┌──────────────────┐    ┌──────────┐
//  │ SUCCESS  │───►│  animatePlay     │───►│ confetti │
//  │ check    │    │  sequence        │    │ (after   │
//  │ (t=0)    │    │  (~0.6-2s)       │    │  anim)   │
//  └──────────┘    └──────────────────┘    └──────────┘
//
//  step = {target: "team-LW"|"opp-C"|"you"|"puck", toX, toY, delay}
//
//  "puck" creates or finds #anim-puck, a separate visual element.
//
function animatePlaySequence(scenario) {
  if (!scenario.playSequence || !scenario.playSequence.length) return;

  // Show a toast when animation starts
  showToast("Watch the play!");

  // Remove the has-puck indicator from all players so there's only one puck
  rink.querySelectorAll(".player.has-puck").forEach(p => {
    p.classList.remove("has-puck");
    const icon = p.querySelector(".puck-icon");
    if (icon) icon.remove();
  });

  // Create puck animation element starting at the current puck carrier's position
  const puckPos = getPuckPosition(scenario);
  let puckEl = document.getElementById("anim-puck");
  if (!puckEl) {
    puckEl = document.createElement("div");
    puckEl.id = "anim-puck";
    puckEl.className = "puck-anim";
    rink.appendChild(puckEl);
  }
  puckEl.style.left = puckPos.x + "%";
  puckEl.style.top = puckPos.y + "%";
  puckEl.style.display = "block";
  puckEl.style.transition = "none"; // no transition for initial position

  scenario.playSequence.forEach(step => {
    setTimeout(() => {
      let el;
      if (step.target === "puck") {
        el = puckEl;
      } else {
        el = rink.querySelector(`[data-id="${step.target}"]`);
      }
      if (el) {
        el.style.transition = "left 0.6s ease, top 0.6s ease";
        el.style.left = step.toX + "%";
        el.style.top = step.toY + "%";
      }
    }, step.delay);
  });
}

// Compute when the last animation step finishes (delay + transition time)
function getAnimationDuration(scenario) {
  if (!scenario.playSequence || !scenario.playSequence.length) return 0;
  const lastDelay = Math.max(...scenario.playSequence.map(s => s.delay));
  // Add extra time for goal celebration if applicable
  const goalExtra = scenario.endsWithGoal ? 1200 : 0;
  return lastDelay + 600 + goalExtra; // 600ms for the CSS transition
}

// ══════════ GOAL CELEBRATION ══════════
function showGoalCelebration() {
  playGoalHornSound();

  // Flash the rink red briefly
  const rinkEl = document.getElementById("rink");
  rinkEl.style.transition = "box-shadow 0.2s ease";
  rinkEl.style.boxShadow = "inset 0 0 80px rgba(255,0,0,0.4), 0 0 40px rgba(255,0,0,0.3)";

  // Show GOAL! text overlay on the rink
  const goalOverlay = document.createElement("div");
  goalOverlay.className = "goal-overlay";
  goalOverlay.textContent = "GOAL!";
  rinkEl.appendChild(goalOverlay);

  // Animate it in
  requestAnimationFrame(() => {
    goalOverlay.classList.add("show");
  });

  // Clean up after celebration
  setTimeout(() => {
    rinkEl.style.boxShadow = "";
    goalOverlay.classList.remove("show");
    setTimeout(() => goalOverlay.remove(), 500);
  }, 2000);
}

// ══════════ TOAST HELPER ══════════
function showToast(msg) {
  const toast = document.getElementById("rink-toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ══════════ CHECK ══════════
function checkPosition() {
  const dist = getDist();
  const s = SCENARIOS[currentLevel];
  attempts++;

  // Play whistle on check
  playWhistleSound();

  if (dist <= s.target.radius) {
    // ── SUCCESS ──
    playCheerSound();

    const you = document.getElementById("player-you");
    you.classList.add("correct");
    // Stars: 3 = first try no hint, 2 = 2-3 tries no hint, 1 = used hint or 4+ tries
    let earned = 1;
    if (!hintRevealed && attempts === 1) earned = 3;
    else if (!hintRevealed && attempts <= 3) earned = 2;

    starsByLevel[currentLevel] = Math.max(starsByLevel[currentLevel], earned);
    renderStarsHeader();

    // Animate stars in
    setTimeout(() => {
      document.querySelectorAll("#stars-display .star").forEach((star, i) => {
        if (i < earned) setTimeout(() => star.classList.add("earned"), i * 200);
      });
    }, 100);

    // Hide check and hint buttons after success
    document.getElementById("btn-check").style.display = "none";
    document.getElementById("btn-hint").style.display = "none";

    // Sequence: let kid see their correct position (600ms),
    // then animate the play, then fire confetti after animation.
    const hasAnimation = s.playSequence && s.playSequence.length > 0;
    const animDuration = getAnimationDuration(s);

    if (hasAnimation) {
      // Delay play animation so kid sees their correct position first
      setTimeout(() => {
        animatePlaySequence(s);
      }, 800);

      // If offensive scenario, show GOAL! celebration after puck hits the net
      if (s.endsWithGoal) {
        const lastPuckDelay = Math.max(...s.playSequence.filter(st => st.target === "puck").map(st => st.delay));
        setTimeout(() => {
          showGoalCelebration();
        }, 800 + lastPuckDelay + 600);
      }

      // Fire confetti AFTER the play animation (and goal celebration) completes
      setTimeout(() => {
        spawnConfetti();
      }, 800 + animDuration + 400);

      // Show feedback overlay after confetti starts
      setTimeout(() => {
        showFeedback(s);
      }, 800 + animDuration + 600);
    } else {
      // No play animation — original behavior
      spawnConfetti();
      setTimeout(() => showFeedback(s), 600);
    }

  } else {
    // ── MISS ──
    playBuzzerSound();

    let msg;
    if (dist < s.target.radius * 2) {
      msg = "Almost! Just a little more...";
    } else if (dist < s.target.radius * 3.5) {
      msg = s.hints[0];
    } else {
      msg = s.hints[0];
    }

    // After 2 misses show second hint text
    if (attempts >= 2 && s.hints[1]) {
      msg = s.hints[1];
    }

    // After 3 misses show the "Show Me" button
    if (attempts >= 3) {
      document.getElementById("btn-hint").style.display = "";
    }

    showToast(msg);
  }
}

function revealHint() {
  hintRevealed = true;
  const tz = document.getElementById("target-zone");
  if (tz) tz.classList.add("revealed");
  document.getElementById("btn-hint").style.display = "none";
  showToast("Drag to the green zone!");
}

// ══════════ FEEDBACK ══════════
function showFeedback(scenario) {
  document.getElementById("feedback-icon").textContent = "🎉";
  document.getElementById("feedback-title").textContent = "Great Positioning!";
  document.getElementById("feedback-text").textContent = scenario.successText;

  // Determine if this is the last level in the current tier
  const tier = scenario.tier || "beginner";
  const tierIndices = scenariosForTier(tier);
  const posInTier = tierIndices.indexOf(currentLevel);
  const isLastInTier = posInTier === tierIndices.length - 1;

  if (isLastInTier) {
    document.getElementById("fb-next").textContent = "Tier Complete!";
  } else {
    document.getElementById("fb-next").textContent = "Next Challenge";
  }

  document.getElementById("feedback-overlay").classList.add("show");
}

function nextLevel() {
  document.getElementById("feedback-overlay").classList.remove("show");

  const s = SCENARIOS[currentLevel];
  const tier = s.tier || "beginner";
  const tierIndices = scenariosForTier(tier);
  const posInTier = tierIndices.indexOf(currentLevel);

  if (posInTier < tierIndices.length - 1) {
    // Next scenario within the same tier
    loadLevel(tierIndices[posInTier + 1]);
  } else {
    // Last in the tier — celebrate and go to level select
    // (where the next tier may now be unlocked)
    const allComplete = starsByLevel.every(s => s >= 1);
    if (allComplete) {
      showComplete();
    } else {
      showToast("Tier Complete! 🎉");
      spawnConfetti();
      showLevels();
    }
  }
}

// ══════════ VIDEO ══════════
function showVideo() {
  const s = SCENARIOS[currentLevel];
  if (!s.video) return;
  document.getElementById("feedback-overlay").classList.remove("show");
  document.getElementById("video-title").textContent = s.video.title;
  document.getElementById("video-caption").textContent = s.video.caption;

  const wrap = document.getElementById("video-embed-wrap");
  const vid = s.video.id;
  const ytWatch = `https://www.youtube.com/watch?v=${vid}`;

  // Try iframe embed if served from http(s), otherwise use thumbnail + link
  if (location.protocol.startsWith("http")) {
    wrap.innerHTML =
      `<iframe src="https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1" ` +
      `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
      `allowfullscreen></iframe>`;
  } else {
    // file:// — use clickable thumbnail that opens YouTube in a new tab
    wrap.innerHTML =
      `<a class="video-thumb-link" href="${ytWatch}" target="_blank" rel="noopener">` +
      `<img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Video thumbnail"/>` +
      `<div class="video-play-btn"></div>` +
      `</a>`;
  }

  document.getElementById("video-modal").classList.add("show");
}

function closeVideo() {
  document.getElementById("video-modal").classList.remove("show");
  document.getElementById("video-embed-wrap").innerHTML = "";
}

// ══════════ COMPLETION ══════════
function showComplete() {
  showScreen("complete-screen");
  const total = starsByLevel.reduce((a, b) => a + b, 0);
  document.getElementById("total-stars").textContent =
    "⭐".repeat(total) + ` ${total} / ${SCENARIOS.length * 3}`;
  spawnConfetti();
}

// ══════════ CONFETTI ══════════
function spawnConfetti() {
  const colors = ["#e84393", "#6c5ce7", "#00b894", "#fdcb6e", "#e17055", "#0984e3", "#f1c40f"];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.top = "-10px";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    p.style.width = (Math.random() * 8 + 6) + "px";
    p.style.height = (Math.random() * 8 + 6) + "px";
    document.body.appendChild(p);
    const dur = Math.random() * 2000 + 1500;
    const xd = (Math.random() - 0.5) * 200;
    p.animate(
      [
        { transform: "translateY(0) translateX(0) rotate(0deg)", opacity: 1 },
        { transform: `translateY(100vh) translateX(${xd}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: "cubic-bezier(0.25,0.46,0.45,0.94)" }
    ).onfinish = () => p.remove();
  }
}

// ══════════ EVENT LISTENERS ══════════

// ESC closes modals
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (document.getElementById("video-modal").classList.contains("show")) {
      closeVideo();
    } else {
      document.getElementById("feedback-overlay").classList.remove("show");
    }
  }
});

// Click outside video modal to close
document.getElementById("video-modal").addEventListener("click", function (e) {
  if (e.target === this) closeVideo();
});

// Wire up buttons (no inline onclick in HTML)
document.querySelector("#title-screen .btn-play").addEventListener("click", startGame);
document.getElementById("btn-check").addEventListener("click", checkPosition);
document.getElementById("btn-hint").addEventListener("click", revealHint);
document.getElementById("btn-watch").addEventListener("click", showVideo);
document.getElementById("fb-next").addEventListener("click", nextLevel);

// "Back" button on game screen — find it among the check-btn-row
document.querySelectorAll(".check-btn-row .btn-back").forEach(btn => {
  btn.addEventListener("click", showLevels);
});

// "Back" button on level select screen
document.querySelectorAll("#level-select .btn-back").forEach(btn => {
  btn.addEventListener("click", () => showScreen("title-screen"));
});

// "Watch Real Hockey" button inside feedback overlay
document.querySelectorAll("#feedback-overlay .btn-video").forEach(btn => {
  btn.addEventListener("click", showVideo);
});

// Video close button
document.querySelectorAll(".video-close").forEach(btn => {
  btn.addEventListener("click", closeVideo);
});

// Completion screen buttons
document.querySelectorAll("#complete-screen .btn-play").forEach(btn => {
  btn.addEventListener("click", startGame);
});
document.querySelectorAll("#complete-screen .btn-video").forEach(btn => {
  btn.addEventListener("click", showLevels);
});

// ══════════ SERVICE WORKER ══════════
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(err => {
    console.warn("SW registration failed:", err);
  });
}
