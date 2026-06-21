# Half-Assed Solution: Donkey Runner

A Chrome-dinosaur-style endless runner minigame featuring a donkey dodging obstacles on a procedurally generated landscape.

## Overview

Survive as long as you can — your score ticks up the longer you live. Obstacles get progressively harder as speed increases, and special mechanics add depth beyond simple jumping.

## Controls

| Action | Input |
|--------|-------|
| Start / Jump | `Space`, `↑` (Arrow Up), or tap/click on canvas |
| Double Jump | Press jump again while mid-air |

**Note:** You can only double-jump if you have enough luck (see Luck Meter below). Holding the key will not trigger rapid-fire jumps.

## Objective

Dodge obstacles and survive as long as possible. Score is based on distance traveled, displayed in a 7-segment digital format. Beat your high score!

## Quick Rules

- **Jump over** ground obstacles (cacti, rocks, cars)
- **Dodge** air-based obstacles (jets, falling rocks, drones) — jump under or over them
- **Watch for warnings** — falling rocks display a `!` warning before they hit the ground and become rolling boulders
- **Score higher** by narrowly avoiding obstacles for near-miss bonuses (+50 points)
- **Use your luck wisely** — donkey has a 25% luck meter that can save you from fatal collisions but costs score

## Obstacle Types (Always Present)

| Obstacle | Description | Danger Level |
|----------|-------------|--------------|
| Cactus-small | Narrow, ~35-48px tall | Low |
| Cactus-large | Wider with side arms, ~43-51px tall | Medium |
| Rock | Small ground obstacle (~20-28px tall) | Medium |
| Car | Large wide obstacle (36x18px) | High |

## Obstacle Types (Appear at Higher Speeds)

| Obstacle | Unlocks At | Description | Danger Level |
|----------|-----------|-------------|--------------|
| Jet | Speed > 7 | Flying obstacle — jump under or over | High |
| Falling Rock / Rolling Boulder | Speed > 6 | Warning → falls → becomes rolling boulder on ground | High |
| Drone | Speed > 8 | Hovering drone moving in a wave pattern | High |

## Post-Game Stats

When your donkey dies, you'll see:
- **Score breakdown** by obstacle type (the killer obstacle is highlighted in red)
- **Near Misses** — how many close calls you scored
- **Property Damage** — obstacles destroyed while stumbling
- **Dumb Luck** — times luck saved you from death
- **Distance** traveled and **Max speed** reached
- **Run time**, **Air time**, and **Air percentage**
- **Jump stats** — total jumps, double jumps, and ignored jumps

## Tips

1. **Watch the speed increase** — obstacles change weight at different speeds, with rocks becoming more common as speed rises
2. **Near misses are worth +50 points** — they also give you a +25% luck boost, so lean into close calls
3. **Double jump costs luck** — if your meter is too low (below 5%), the game will reject your double-jump attempt
4. **Dumb Luck can save you** but halves your score — only works when NOT record-breaking
5. **You stumble every 30-60 seconds** — use it! Knock obstacles aside for +100 points each
6. **During record-breaking runs**, passive luck recharge stops and dumb luck is disabled — go all-in on skill