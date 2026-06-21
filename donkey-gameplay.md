# Half-Assed Solution: Donkey Runner — Detailed Gameplay Mechanics

## Table of Contents
1. [Core Game Loop](#core-game-loop)
2. [Movement & Physics](#movement--physics)
3. [Obstacle System](#obstacle-system)
4. [Special Mechanics](#special-mechanics)
5. [Luck Meter](#luck-meter)
6. [Score System](#score-system)
7. [Environmental Effects](#environmental-effects)
8. [Audio System](#audio-system)
9. [Post-Game Statistics](#post-game-statistics)
10. [Game Balance & Difficulty Scaling](#game-balance--difficulty-scaling)

---

## Core Game Loop

The game operates on a single `loop()` function driven by `requestAnimationFrame`. Each frame:

1. **Time delta calculation** — the elapsed time since the previous frame is computed as milliseconds, then normalized to seconds for consistent physics
2. **Update** — all game state (position, obstacles, particles, luck meter) is updated based on deltaTime
3. **Draw** — the canvas is cleared and everything is rendered

The loop runs at approximately 60fps. All physics values are multiplied by `(deltaTime * 60)` to maintain consistent behavior regardless of frame rate.

---

## Movement & Physics

### Gravity
- Constant gravity: **0.6 per frame** (scaled by deltaTime)
- Donkey falls at an accelerating rate — velocity increases each frame while airborne

### Jump Force
- **First jump:** -10 (upward, from ground only)
- **Double jump:** -8 (reduced force, mid-air only)
- Jump force is applied instantly — no ramp-up animation

### Ceiling Clamp
- Donkey cannot rise above Y = 5px from the top of the canvas
- Hitting the ceiling triggers:
  - Velocity reset to +3 (forced downward bounce)
  - A short stumble (0.8 seconds)
  - Ceiling impact particles and sound
  - Snarky message: "CEILING! Your donkey hit the ceiling"

### Ground Detection
- Ground Y position is calculated as `canvas height - 20px`
- Donkey is considered grounded when `donkey.y >= GROUND_Y - donkey.height`
- Landing triggers dust particles and a sound effect

### Speed
- Starts at **5** (INITIAL_SPEED)
- Increases by **0.001 per frame** (approximately 60 per second of gameplay)
- Maximum speed: **12** (MAX_SPEED)
- Speed affects:
  - Obstacle approach rate
  - Obstacle spawn frequency
  - Air obstacle fall speeds
  - Rolling boulder speed (80% of game speed)
  - Visual speed lines appearance (above speed 7)

### Jump Cooldown
- 50ms cooldown between jump inputs to prevent held-key rapid-fire
- If a double-jump is attempted while the cooldown is active, it's rejected as an "ignored jump"

---

## Obstacle System

### Ground Obstacles

#### Cactus-small
- Width: 12px
- Height: 35–48px (randomly generated)
- Weight at base speed: 35% of spawns
- Weight at high speed (>7): 25%
- Weight at very high speed (>9): 20%

#### Cactus-large
- Width: 18px
- Height: 43–51px (randomly generated)
- Has side arms with spines for visual flair
- Weight at base speed: 25% of spawns
- Weight at high speed (>7): 15%
- Weight at very high speed (>9): 10%

#### Rock
- Width: 16–24px (randomly generated)
- Height: 12–18px (randomly generated)
- Small and low — harder to jump over at high speeds
- Weight at base speed: 25% of spawns
- Weight at high speed (>7): 45% (becomes the dominant obstacle)
- Weight at very high speed (>9): 40%

#### Car
- Width: 36px
- Height: 18px
- Large wide obstacle — must jump over it entirely
- Only appears at very high speeds (>9)
- Weight at very high speed (>9): 30% of spawns

### Air-Based Obstacles

#### Jet
- Unlocks at: Speed > 7
- Width: 35px
- Height: 20px
- Flies at a randomized mid-air height (35–55px above ground)
- Requires the player to time a jump to go under it OR jump over it
- **Always fatal** — even during a stumble

#### Falling Rock → Rolling Boulder
- Unlocks at: Speed > 6
- Width: 14–22px (randomly generated)
- Height: 10–15px (randomly generated)
- **Two-phase sequence:**
  1. **Falling phase** — appears with an orange warning glow and `!` symbol, falls from above the screen at a speed proportional to game speed
  2. **Rolling phase** — upon hitting the ground, transitions into a rolling boulder that travels along the ground
     - Rotating visual animation with cracks
     - Dust trail particles as it rolls
     - Spawns at the exact position where the falling rock landed
- Both phases are fatal if hit

#### Drone
- Unlocks at: Speed > 8
- Width: 18px
- Height: 12px
- Moves in a sinusoidal wave pattern (amplitude ~30px, period ~2 seconds)
- Has spinning propeller arms and a pulsing red light
- **Always fatal** — even during a stumble

### Spawn System

#### Interval Calculation
The base spawn interval is calculated dynamically based on speed:

```
baseInterval = 20 + 45 * pow((12 - speed) / 7, 2)
```

At speed 5: ~65 frames between spawns (about 1 second at 60fps)
At speed 9: ~30 frames between spawns (about 0.5 seconds at 60fps)
At speed 12: ~20 frames between spawns (about 0.33 seconds at 60fps)

#### Random Variance
A ±25% random variance is added to the interval, making obstacle spacing feel more natural and less predictable.

#### Weight-Based Type Selection
Obstacle types are selected using weighted random selection. The weights shift dramatically based on speed:

| Speed Range | Cactus-small | Cactus-large | Rock | Car | Jet | Falling Rock | Drone |
|-------------|-------------|-------------|------|-----|-----|-------------|-------|
| Base (5)    | 35%         | 25%         | 25%  | —   | —   | 10%         | —     |
| High (>7)   | 25%         | 15%         | 45%  | —   | 15% | 10%         | —     |
| Very High (>9)| 20%       | 10%         | 40%  | 30% | 15% | 8%          | 8%    |

---

## Special Mechanics

### Near-Miss System

**Trigger conditions:**
- Horizontal: Donkey's right edge has just passed the obstacle's right edge (within 6px)
- Vertical: Donkey's bottom is just above the obstacle's top (within 8px)
- Obstacle must be at least 30px tall to qualify (prevents false positives from small cacti/rocks)

**Rewards:**
- +50 bonus points
- Instant +25% luck meter boost
- Green "NEAR MISS!" text flash overlay
- Bonus "+50" text animation at the point of near-miss

**Cooldown:**
- 600ms cooldown prevents rapid-fire near-miss detection on the same obstacle

### Dumb Luck System

**Trigger conditions:**
- Donkey is about to die from a collision
- **Not** currently in a record-breaking run (score ≤ high score)
- Random roll succeeds: `Math.random() < (luckMeterValue / 100)`

**Effects:**
- Obstacle is knocked away with golden sparkle particles
- Score penalty: **-50% of current score** (half your progress is lost!)
- Luck meter resets to 0%
- Donkey stumbles briefly (0.5 seconds)
- "DUMB LUCK!" text flash with golden sparkle overlay

**Sound:** A comedic "bonk + golden ding" — low thud followed by a bright ascending chime and sparkle noise burst

### Double Jump System

**Trigger conditions:**
- Donkey is airborne (not grounded)
- Donkey has not yet used both jumps (currentJumpCount < 2)
- Donkey is not stumbling
- Jump cooldown has expired (>50ms since last jump input)
- Luck meter has at least 5% remaining

**Effects:**
- Reduced upward force (-8 vs. -10 for first jump)
- Costs **5% of luck meter** (clamped to floor)
- Particles shoot backward and downward from the donkey's rear (the "fart" particles)
- "Fart power engaged!" snarky message

**Rejection:**
- If luck is below 5%, the double jump is rejected with:
  - "Out of luck! Not enough beans!" message
  - Luck meter shake animation
  - Descending buzzer sound effect
  - No score penalty, no particles

### Stumble System

**Trigger conditions:**
- Every 30–60 seconds of gameplay (converted to frames: 1800–3600 frames at 60fps)
- Randomly scheduled with a grace period (5–8 seconds after game start before first stumble)

**Visual effects:**
- Donkey wobbles with a sinusoidal rotation (±0.25 radians)
- X-shaped eyes appear above the donkey's head
- Legs flail randomly during the stumble

**Duration:** 2 seconds of stumbling

**During stumble — obstacle interactions:**
- **Ground obstacles** (cactus-small, cactus-large, rock, car): Knocked aside for +100 points each, with obstacle-type-specific particle explosions
- **Air-based obstacles** (jet, falling-rock, drone): Always fatal — cannot knock these away
- Rolling boulder: Cannot knock this away (treated as falling-rock type)

### Backflip

**Trigger conditions:**
- 8% chance on the first jump from ground only

**Effects:**
- Donkey performs a full 360° backflip animation during the jump
- Purely cosmetic — no gameplay benefit
- Snarky message: "Backflip! Because regular jumping wasn't enough"

### Ceiling Impact

**Trigger conditions:**
- Donkey's upward movement would take it above Y = 5px from the top of the canvas

**Effects:**
- Velocity reset to +3 (forced downward)
- Short stumble (0.8 seconds)
- Ceiling impact particles (gray, from the ceiling point)
- Metallic clang sound effect
- Snarky message: "CEILING! Your donkey hit the ceiling"

### Record-Breaking State

**Trigger conditions:**
- Score exceeds the player's high score for the first time during a run

**Effects:**
- Passive luck meter recharge **stops completely** — no more free luck
- Dumb Luck survival chance is **disabled** — no more cheap saves
- Luck meter shakes visually
- Golden snarky message: "UNCHARTED TERRITORY! The donkey is fearless now"
- When the player eventually dies and this becomes the new high score, the state resets for the next run

---

## Luck Meter

### Overview
A horizontal green/orange/yellow/red meter at the bottom of the play area showing the donkey's current luck level (0–100 scale).

### Starting State
- Starts at **25%** of cap (orange color, labeled "luck-low")
- Actively recharging from the moment the game starts

### Color Gradient (based on value)

| Value Range | Color Name | Visual | Description |
|-------------|-----------|--------|-------------|
| 0–24%       | luck-danger | Red gradient | Danger zone — almost no luck |
| 25–34%      | luck-low    | Orange gradient | Building up |
| 35–49%      | luck-mid    | Yellow gradient | Moderate luck |
| 50–64%      | luck-high   | Yellow-green gradient | Good luck |
| 65–74%      | luck-excellent | Green gradient | Excellent luck |
| 75%+        | luck-cap    | Bright green with glow | Full cap — maximum luck |

### Recharge Rate (per second)
The recharge rate **decreases over time** since the last luck change:

| Time Since Last Change | Recharge Rate |
|----------------------|---------------|
| 0–5 seconds         | 3.0%/sec      |
| 5–10 seconds        | 2.0%/sec (linear interpolation) |
| 10–20 seconds       | 1.0%/sec (linear interpolation) |
| 20–30 seconds       | 0.5%/sec (linear interpolation) |
| 30+ seconds         | 0.5%/sec (steady state) |

**Sub-integer accumulator:** The system tracks fractional recharge amounts internally to avoid losing small increments when the value is below 1% of a full percentage point.

### Instant Boosts
- **Near miss:** +25% (clamped to cap at 100%)
- **Double jump attempt:** -5% (clamped to floor at 0%)
- **Dumb Luck trigger:** Resets to 0%

### Visual Feedback
- **Width animation** — smoothly transitions the fill width based on current value
- **Near-miss flash** — brief green pulse on instant +25% boost
- **Double-jump fail shake** — rapid shake animation with red flash when luck is too low for a double jump
- **Cap glow** — pulsing glow effect when at 75%+ (full cap)
- **Reduced transition** — faster transition (0.3s vs 2s) when the value is decreasing

### Record-Breaking Impact
When in record-breaking state, the recharge timer stops and passive recharge halts entirely. The meter will remain static until the run ends or luck is spent.

---

## Score System

### Primary Scoring
- Score = `floor(distance * 100) - dumbLuckPenalty`
- Distance increases by `speed * 0.01 * deltaTime * 60` per frame
- **Airborne penalty:** While airborne, the score rate drops to **10%** of normal (airborneMultiplier = 0.1)
- **Dumb Luck penalty:** Each dumb luck survival subtracts 50% of the current score from the total

### Score Milestones
- Triggered every **1,000 points**
- Visual flash: score turns green and scales up briefly (300ms animation)
- Snarky message: "MILESTONE! You survived a while!" or "Another thousand points! The donkey is proud"

### Near-Miss Bonus
- **+50 points** per near miss
- Score breakdown tracked separately (`nearMissScore`)

### Property Damage Bonus
- **+100 points** per obstacle knocked aside during stumble
- Floating "+100" text animation at the knock position
- Tracked in `propertyDamageCount`

### High Score
- Saved to localStorage as `"hasW_donkeyHighScore"`
- Displayed on start screen and game over screen
- When beaten: golden "NEW HIGH SCORE!" badge appears on the game over screen
- Record-breaking state triggers when score first exceeds high score

---

## Environmental Effects

### Day/Night Cycle
- **60-second full cycle** (0 = midnight, 0.5 = day, back to 0)

| Phase | Time Range | Effect |
|-------|-----------|--------|
| Night → Dusk | 0–25% | Background transitions from dark to lighter; stars fade out |
| Dusk → Day | 25–50% | Background lightens further; clouds become more visible |
| Day → Dusk | 50–75% | Background darkens again; stars begin to appear |
| Dusk → Night | 75–100% | Stars fully visible, clouds fade back out |

### Star System
- **25 twinkling stars** randomly distributed across the top of the canvas
- Each star has:
  - Random position (x, y)
  - Random size (0.5–2px)
  - Random twinkle phase
- Alpha varies based on day/night phase (0 = invisible during day, 1 = full at night)

### Cloud System
- **4 clouds** with random positions, widths (35–75px), and speeds (0.2–0.8)
- Move slower at higher game speeds (relative to the ground)
- Visible only during daytime phases (alpha based on star alpha)

### Speed Lines
- **6 horizontal lines** that appear when speed exceeds 7
- Lines scroll leftward from their current position
- Length increases with speed (base 30px + (speed - 7) * 10px)
- Opacity varies by line (0.05–0.13)

---

## Audio System

### Architecture
- Procedural sound effects using the Web Audio API
- No external audio files — all sounds are synthesized in real-time
- Toggle button in the header (🔇/🔊) — preference saved to localStorage

### Sound Effects

| Type | Description | Sound Design |
|------|-------------|--------------|
| `jump` | First jump from ground | Rising sine wave (400→600Hz, 100ms) |
| `fart` | Double jump mid-air | Multi-layered fart sound: constriction noise, wet squelch, sub-bass rumble, gurgling bubbles, and air hiss (450ms total) |
| `knock` | Obstacle destroyed during stumble | Square wave descending (200→80Hz, 150ms) |
| `gameover` | Death | Sawtooth wave descending (400→80Hz, 600ms) |
| `milestone` | Score milestone reached | Three-tone ascending chord (523→659→784Hz, 300ms) |
| `nearmiss` | Near miss scored | Triangle wave sweeping (800→1200→600Hz, 200ms) |
| `land` | Donkey lands on ground | Sine wave descending (150→50Hz, 100ms) |
| `ceiling` | Donkey hits ceiling | Square wave metallic clang (800→200Hz, 200ms) |
| `fail` | Double jump rejected (not enough luck) | Descending sawtooth buzzer (600→150Hz, 350ms) |
| `dumbluck` | Dumb Luck saves from death | Comedic bonk + golden ding: triangle thud (150→60Hz), sine chime (600→1400Hz), sparkle noise burst |

### Input Handling
- Keyboard: Space or Arrow Up keys
  - Browser auto-repeat is ignored — user must release the key to jump again
- Mouse/Touch: Click or tap on the canvas
  - First click/tap initializes the audio context (required by browsers)
- Sound toggle button in header

---

## Post-Game Statistics

### Game Over Screen Layout

```
┌─────────────────────────────────────────┐
│           [OBSTACLE COUNT TABLE]         │  ← Top center: icons + counts
│    NEAR MISSES   DISTANCE               │  ← Top-left / Top-right blocks
│ PROPERTY DAMAGE  MAX SPEED              │  ← (4 items each)
│  DUMB LUCK                                │
│                                           │
│              GAME OVER                    │  ← Center: big red text
│          [NEW HIGH SCORE BADGE]           │
│         ── Score breakdown ──             │
│                                           │
│    RUN TIME      TOTAL JUMPS            │  ← Bottom-left / Bottom-right blocks
│ AIR TIME        DOUBLE JUMPS              │  ← (3 items each)
│ AIR %           IGNORED JUMPS            │
└─────────────────────────────────────────┘
```

### Corner Blocks

**Top-Left (Score-based):**
| Stat | Description |
|------|-------------|
| Near Misses | Count of near-miss bonuses scored |
| Property Damage | Obstacles destroyed while stumbling |
| Dumb Luck | Times luck saved from death |

**Top-Right (Performance):**
| Stat | Description |
|------|-------------|
| Distance | Total distance traveled (formatted as X.Xkm) |
| Max Speed | Highest speed reached (formatted as X.X) |

**Bottom-Left (Time-based):**
| Stat | Description |
|------|-------------|
| Run Time | Total play time (formatted as Xm Ys or Ys) |
| Air Time | Total time airborne (formatted as Xm Ys or Ys) |
| Air % | Percentage of run time spent airborne |

**Bottom-Right (Jump-based):**
| Stat | Description |
|------|-------------|
| Total Jumps | Total jump inputs received |
| Double Jumps | Successful double jumps executed |
| Ignored Jumps | Jump inputs that were rejected (cooldown active, no luck, etc.) |

### Obstacle Count Table
- Displays **all obstacle types** as small icon + label + count rows
- Icons are inline SVGs matching the in-game visuals
- The **killer obstacle** (the one that caused the game over) is highlighted with a red background and text color
- Icon labels: Cactus, L.Cactus, Rock, Car, Jet, F.Rock, Drone

---

## Game Balance & Difficulty Scaling

### Speed Tiers

#### Tier 1 — Relaxed (Speed 5–6)
- Obstacles: Cacti-small, cacti-large, rocks
- Spacing: ~65–50 frames (~1.1–0.8 seconds)
- No air obstacles
- Player has time to react and build up luck meter

#### Tier 2 — Intense (Speed 7–8)
- Obstacles: Cacti-small, cacti-large, rocks (dominant), car, jet, falling rock
- Spacing: ~40–30 frames (~0.67–0.5 seconds)
- Air obstacles appear — must learn vertical positioning
- Luck meter recharge drops to 1%/sec after initial burst

#### Tier 3 — Brutal (Speed 9–12)
- Obstacles: Cacti-small, cacti-large, rocks, car (dominant), jet, falling rock, drone
- Spacing: ~30–20 frames (~0.5–0.33 seconds)
- Car appears frequently alongside rocks
- Drone introduces wave-pattern evasion
- Luck meter recharge drops to 0.5%/sec steady state
- Speed lines visible above speed 7

### Obstacle Weight Shifts by Speed

| Speed | Cactus-small | Cactus-large | Rock | Car | Jet | F.Rock | Drone |
|-------|-------------|-------------|------|-----|-----|--------|-------|
| 5     | 35%         | 25%         | 25%  | —   | —   | 10%    | —     |
| 7     | 25%         | 15%         | 45%  | —   | 15% | 10%    | —     |
| 9     | 20%         | 10%         | 40%  | 30% | 15% | 8%     | 8%    |

### Key Balance Decisions
1. **Airborne scoring penalty (10%)** — encourages staying on the ground, making near-misses more valuable for scoring
2. **Double jump costs luck** — prevents the game from being too easy; players must weigh risk vs reward
3. **Dumb Luck halves score** — saves you but at a steep cost, discouraging reliance on it during competitive play
4. **Stumble as opportunity** — transforms a moment of vulnerability into scoring potential (+100 per obstacle)
5. **Record-breaking state removes passive luck** — pure skill mode, making high-score runs genuinely challenging
6. **Near-miss cooldown (600ms)** — prevents spamming near-misses on the same obstacle for free score
7. **Falling rock → rolling boulder sequence** — provides visual warning before the danger arrives, giving the player a moment to react
8. **Air obstacles are always fatal** — even during stumble, they cannot be knocked aside, ensuring the game doesn't become too easy at high speeds