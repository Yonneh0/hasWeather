// ===== DONKEY RUNNER MINIGAME =====
// A Chrome-dinosaur-style endless runner with a donkey character

const DONKEY_RUNNER = {
  canvas: null,
  ctx: null,
  gamePanel: null,
  gameRunning: false,
  gameStarted: false,
  animFrameId: null,
  highScore: 0,

  // Game constants
  GRAVITY: 0.6,
  JUMP_FORCE: -12,
  GROUND_Y: 0,
  INITIAL_SPEED: 5,
  MAX_SPEED: 12,
  SPEED_INCREMENT: 0.001,

  // Donkey state
  donkey: {
    x: 60,
    y: 0,
    width: 40,
    height: 44,
    vy: 0,
    jumping: false,
    grounded: true,
    wasGrounded: true,  // tracks if donkey was grounded last frame (for landing particles)
    frame: 0,
    frameTimer: 0,
    // Backflip state
    backflipping: false,
    backflipProgress: 0,
    backflipDuration: 0.6,
    // Stumble state
    stumbling: false,
    stumbleTimer: 0,
    stumbleDuration: 2.0,
    stumbleWobble: 0,
    stumbleNextTrigger: 0,  // frame count when next stumble will trigger
  },

  // Game state
  speed: 5,
  score: 0,
  distance: 0,
  frameCount: 0,

  // Obstacles
  obstacles: [],
  obstacleTimer: 0,
  baseObstacleInterval: 80,

  // Ground
  groundX: 0,
  groundLineY: 0,

  // Clouds (background decoration)
  clouds: [],

  // Stars (background decoration)
  stars: [],

  // Day/night cycle
  dayNightPhase: 0,
  dayNightDuration: 60, // seconds for full cycle

  // Particle system
  particles: [],

  // Score milestone tracking
  lastMilestoneScore: 0,

  // Combo / multiplier system
  comboCount: 0,
  comboMultiplier: 1,

  // DOM elements
  scoreEl: null,
  highScoreEl: null,
  startScreenEl: null,
  gameOverEl: null,
  speedBarEl: null,
  nearMissEl: null,
  bonusTextEl: null,
  speedLinesEl: null,
  comboEl: null,

  // Input
  keysDown: {},
  // Tracks whether the jump key was released after the game over event (prevents held-key restart)
  jumpReleasedAfterDeath: false,

  // Game over cooldown to prevent rapid-fire restart glitches
  gameOverCooldown: false,
  // Tracks whether game is in the "dead" state (game over screen visible, not playing)
  gameOverActive: false,

  // Audio context for procedural sound effects
  audioCtx: null,
  soundEnabled: false,

  // Near-miss tracking
  nearMissThreshold: 5, // pixels — donkey must be nearly touching the obstacle
  nearMissActive: false,

  // Speed lines (ground effect lines)
  speedLineX: 0,
  speedLines: [],

  init() {
    this.highScore = parseInt(localStorage.getItem('hasW_donkeyHighScore') || '0', 10);

    // Create game panel
    this.createPanel();
    this.bindInput();

    // Start paused with start screen visible
    this.gameStarted = false;
    this.gameRunning = false;
    this.resetGame();
    this.drawIdle();
  },

  createPanel() {
    // Create game panel
    this.gamePanel = document.createElement('div');
    this.gamePanel.id = 'donkey-runner-panel';
    this.gamePanel.className = 'donkey-panel';
    this.gamePanel.innerHTML = `
      <div class="donkey-panel-header">
        <button class="donkey-sound-btn" id="donkey-sound-btn" title="Toggle sound">🔇</button>
        <div class="donkey-header-score">
          <span class="donkey-header-score-label">CURRENT SCORE</span>
          <span class="donkey-score" id="donkey-score">00000</span>
        </div>
        <span class="donkey-title">Half-Assed Solution: Donkey Runner</span>
        <div class="donkey-header-highscore">
          <span class="donkey-header-highscore-label">HIGH SCORE</span>
          <span class="donkey-highscore" id="donkey-highscore">${String(this.highScore).padStart(5, '0')}</span>
        </div>
        <button class="donkey-close-btn" title="Close game">✕</button>
      </div>
      <div class="donkey-panel-body">
        <div class="donkey-combo" id="donkey-combo">COMBO x1</div>
        <div class="donkey-speed-bar" id="donkey-speed-bar">
          <span class="donkey-speed-label">SPD</span>
          <div class="donkey-speed-track">
            <div class="donkey-speed-fill" id="donkey-speed-fill"></div>
          </div>
        </div>
        <div class="donkey-play-area">
          <canvas id="donkey-canvas" width="600" height="180"></canvas>
          <div class="donkey-speed-lines" id="donkey-speed-lines"></div>
          <div class="donkey-near-miss" id="donkey-near-miss">NEAR MISS!</div>
          <div class="donkey-bonus-text" id="donkey-bonus-text"></div>
          <div class="donkey-startscreen" id="donkey-startscreen">
            <div class="ds-subtitle">dodge the crap, run the plains</div>
            <div class="ds-controls">
              <div class="ds-ctrl-row"><kbd>SPACE</kbd> / <kbd>↑</kbd> &nbsp;jump</div>
              <div class="ds-ctrl-row"><kbd>tap</kbd> &nbsp;jump (mobile)</div>
            </div>
            <div class="ds-objective">obstacles come faster as you go. score ticks up the longer you survive. stumble sometimes and knock stuff out of the way!</div>
            <div class="ds-prompt">press space or tap to start</div>
          </div>
          <div class="donkey-gameover hidden" id="donkey-gameover">
            <span class="donkey-gameover-text">GAME OVER</span>
            <span class="donkey-gameover-score" id="donkey-gameover-score">SCORE: 00000</span>
            <span class="donkey-restart-text">press space or tap to restart</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.gamePanel);
    this.gamePanel.classList.add('donkey-hidden');

    // Set up canvas
    this.canvas = document.getElementById('donkey-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.GROUND_Y = this.canvas.height - 20;

    // Score elements
    this.scoreEl = document.getElementById('donkey-score');
    this.highScoreEl = document.getElementById('donkey-highscore');
    this.startScreenEl = document.getElementById('donkey-startscreen');
    this.gameOverEl = document.getElementById('donkey-gameover');
    this.speedBarEl = document.getElementById('donkey-speed-fill');
    this.nearMissEl = document.getElementById('donkey-near-miss');
    this.bonusTextEl = document.getElementById('donkey-bonus-text');
    this.speedLinesEl = document.getElementById('donkey-speed-lines');
    this.comboEl = document.getElementById('donkey-combo');
    this.soundBtnEl = document.getElementById('donkey-sound-btn');

    // Sound toggle button — starts muted by default
    if (this.soundBtnEl) {
      this.soundBtnEl.textContent = '\u{1F507}'; // muted icon
      this.soundBtnEl.classList.add('muted');
      this.soundBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.soundEnabled = !this.soundEnabled;
        this.soundBtnEl.textContent = this.soundEnabled ? '\u{1F50A}' : '\u{1F507}';
        this.soundBtnEl.classList.toggle('muted', !this.soundEnabled);
        this.soundBtnEl.title = this.soundEnabled ? 'Mute sound' : 'Unmute sound';
      });
    }

    // Create speed lines (horizontal lines for high-speed visual effect)
    this.buildSpeedLines();

    // Button handler — close only (minimize removed)
    this.gamePanel.querySelector('.donkey-close-btn').addEventListener('click', () => this.close());

    // Canvas click/tap
    this.canvas.addEventListener('click', () => this.handleInput());
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(); });

    // Start screen overlay click/tap
    if (this.startScreenEl) {
      this.startScreenEl.addEventListener('click', () => this.handleInput());
      this.startScreenEl.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(); });
    }

    // Generate stars
    this.generateStars();
    this.generateClouds();

    // Initial draw
    this.drawIdle();
  },

  // Build speed line elements (for high-speed visual effect)
  buildSpeedLines() {
    this.speedLines = [];
    const container = this.speedLinesEl;
    if (!container) return;
    for (let i = 0; i < 6; i++) {
      const line = document.createElement('div');
      line.style.cssText = `
        position: absolute;
        bottom: ${5 + i * 8}px;
        left: 0;
        width: ${30 + Math.random() * 60}px;
        height: 1px;
        background: rgba(255, 255, 255, ${0.05 + Math.random() * 0.08});
        pointer-events: none;
      `;
      container.appendChild(line);
      this.speedLines.push(line);
    }
  },

  generateStars() {
    this.stars = [];
    for (let i = 0; i < 25; i++) {
      this.stars.push({
        x: Math.random() * 600,
        y: Math.random() * 80,
        size: Math.random() * 1.5 + 0.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  },

  generateClouds() {
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        x: Math.random() * 600,
        y: 25 + Math.random() * 50,
        width: 35 + Math.random() * 40,
        speed: 0.2 + Math.random() * 0.6,
      });
    }
  },

  bindInput() {
    // Track which keys are pressed down
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!this.gamePanel || this.gamePanel.classList.contains('donkey-hidden')) return;
        e.preventDefault();
        this.keysDown[e.code] = true;
        this.handleInput();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        this.keysDown[e.code] = false;
        // Mark jump as released after death - enables restart input
        if (this.gameOverActive || this.gameOverCooldown) {
          this.jumpReleasedAfterDeath = true;
        }
      }
    });
  },

  // Initialize audio context on first user interaction
  initAudio() {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.soundEnabled = false;
    }
  },

  // Play a short procedural sound effect
  playSound(type) {
    if (!this.soundEnabled || !this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const oscillator = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      switch (type) {
        case 'jump':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(400, now);
          oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.08);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          oscillator.start(now);
          oscillator.stop(now + 0.1);
          break;

        case 'knock':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(200, now);
          oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.12);
          gainNode.gain.setValueAtTime(0.08, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          oscillator.start(now);
          oscillator.stop(now + 0.15);
          break;

        case 'gameover':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(400, now);
          oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.5);
          gainNode.gain.setValueAtTime(0.12, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
          oscillator.start(now);
          oscillator.stop(now + 0.6);
          break;

        case 'milestone':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(523, now);
          oscillator.frequency.setValueAtTime(659, now + 0.08);
          oscillator.frequency.setValueAtTime(784, now + 0.16);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;

        case 'nearmiss':
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(800, now);
          oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
          oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.15);
          gainNode.gain.setValueAtTime(0.08, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;

        case 'combo':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(600, now);
          oscillator.frequency.setValueAtTime(800, now + 0.06);
          oscillator.frequency.setValueAtTime(1000, now + 0.12);
          gainNode.gain.setValueAtTime(0.08, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          oscillator.start(now);
          oscillator.stop(now + 0.25);
          break;

        case 'land':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(150, now);
          oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.08);
          gainNode.gain.setValueAtTime(0.05, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          oscillator.start(now);
          oscillator.stop(now + 0.1);
          break;
      }
    } catch (e) {
      // Silently fail if audio context has issues
    }
  },

  handleInput() {
    // Block jump input during game over cooldown while game is still running
    if (this.gameOverCooldown && this.gameRunning) return;

    // Initialize audio on first user interaction
    this.initAudio();

    if (!this.gameStarted) {
      this.start();
    } else if (!this.gameRunning && !this.gameOverActive) {
      // Between death and cooldown expiry — should not happen in normal flow, but be safe
      return;
    } else if (!this.gameRunning && this.gameOverActive) {
      // Game is dead and game over screen is showing — only restart if:
      // 1. The jump key has been released since death (new press, not held)
      // 2. At least 200ms have passed since game over (visual flash time)
      if (!this.jumpReleasedAfterDeath) return;
      this.restart();
    } else if (this.donkey.grounded && !this.donkey.stumbling && !this.gameOverActive) {
      this.playSound('jump');
      this.donkey.vy = this.JUMP_FORCE;
      this.donkey.jumping = true;
      this.donkey.grounded = false;
      if (Math.random() < 0.08) {
        this.donkey.backflipping = true;
        this.donkey.backflipProgress = 0;
      }
    }
  },

  start() {
    this.gameStarted = true;
    this.gameRunning = true;
    if (this.startScreenEl) this.startScreenEl.classList.add('hidden');
    if (this.gameOverEl) this.gameOverEl.classList.add('hidden');
    this.resetGame();
    this.loop();
  },

  restart() {
    const now = performance.now();
    // Only allow restart if at least 200ms have passed since last game over event
    // This prevents held-key auto-restart while still allowing responsive restart
    if (now - (this.gameOverTimestamp || 0) < 200) return;
    this.gameRunning = true;
    this.gameOverActive = false;
    this.gameOverCooldown = false;
    this.jumpReleasedAfterDeath = false;
    this.keysDown = {};
    if (this.gameOverEl) {
      this.gameOverEl.classList.add('hidden');
    }
    this.resetGame();
    this.loop();
  },

  resetGame() {
    this.donkey.y = this.GROUND_Y - this.donkey.height;
    this.donkey.vy = 0;
    this.donkey.jumping = false;
    this.donkey.grounded = true;
    this.donkey.wasGrounded = true;
    this.donkey.frame = 0;
    this.donkey.backflipping = false;
    this.donkey.backflipProgress = 0;
    this.donkey.stumbling = false;
    this.donkey.stumbleTimer = 0;
    this.donkey.stumbleWobble = 0;
    // Initialize stumble trigger with a grace period (5-8 seconds = 3000-4800 frames at 60fps)
    this.donkey.stumbleNextTrigger = this.frameCount + this.randomFrameRange(3000, 4800);

    this.speed = this.INITIAL_SPEED;
    this.score = 0;
    this.distance = 0;
    this.lastMilestoneScore = 0;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.obstacles = [];
    this.obstacleTimer = 0;
    this.groundX = 0;
    this.particles = [];
    this.dayNightPhase = 0;
    this.frameCount = 0;
    this.nearMissActive = false;

    // Regenerate clouds for fresh start
    this.generateClouds();
  },

  close() {
    this.stop();
    this.gameStarted = false;
    this.gameRunning = false;
    this.score = 0;
    this.distance = 0;
    if (this.scoreEl) {
      this.scoreEl.textContent = '00000';
    }
    this.obstacles = [];
    this.gamePanel.classList.remove('donkey-visible');
    this.gamePanel.classList.add('donkey-hidden');
    if (typeof adjustOutagePosition === 'function') adjustOutagePosition();
  },

  stop() {
    this.gameRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  },

  toggle() {
    if (this.gamePanel.classList.contains('donkey-hidden')) {
      this.gamePanel.classList.remove('donkey-hidden');
      this.gamePanel.classList.add('donkey-visible');
      this.gameStarted = false;
      this.gameRunning = false;
      if (this.startScreenEl) this.startScreenEl.classList.remove('hidden');
      if (this.gameOverEl) this.gameOverEl.classList.add('hidden');
      this.resetGame();
      this.drawIdle();
      if (typeof adjustOutagePosition === 'function') adjustOutagePosition();
    }
  },

  loop() {
    if (!this.gameRunning) return;

    try {
      this.update();
      this.draw();
    } catch (e) {
      console.warn('[donkey-runner] loop error:', e);
      this.gameOver();
      return;
    }

    this.animFrameId = requestAnimationFrame(() => this.loop());
  },

  update() {
    // Increase speed over time
    this.speed = Math.min(this.MAX_SPEED, this.speed + this.SPEED_INCREMENT);

    // Update score
    this.distance += this.speed * 0.01;
    this.score = Math.floor(this.distance * 100);

    // Score milestone flash check
    const currentMilestone = Math.floor(this.score / 1000) * 1000;
    if (currentMilestone > this.lastMilestoneScore && this.lastMilestoneScore > 0) {
      this.triggerMilestoneFlash();
      // Increment combo multiplier
      this.comboCount++;
      this.comboMultiplier = Math.min(5, 1 + Math.floor(this.comboCount / 3)); // Max 5x at 15 milestones
      this.updateComboDisplay();
      this.playSound('milestone');
      if (this.comboCount % 3 === 0) {
        this.playSound('combo');
      }
      this.lastMilestoneScore = currentMilestone;
    }

    if (this.scoreEl) {
      this.scoreEl.textContent = String(this.score).padStart(5, '0');
    }

    // Update speed bar display
    if (this.speedBarEl) {
      const speedPercent = ((this.speed - this.INITIAL_SPEED) / (this.MAX_SPEED - this.INITIAL_SPEED)) * 100;
      this.speedBarEl.style.width = `${Math.max(10, speedPercent)}%`;
    }

    // Update ground
    this.groundX = (this.groundX - this.speed) % 20;

    // Update speed lines visibility based on speed
    if (this.speedLinesEl) {
      if (this.speed > 7) {
        this.speedLinesEl.classList.add('visible');
        // Animate speed line positions
        this.speedLines.forEach((line, i) => {
          const offset = (this.frameCount * (0.5 + i * 0.15)) % 700;
          line.style.left = `${-offset + (i * 120)}px`;
          line.style.width = `${40 + (this.speed - 7) * 10}px`;
        });
      } else {
        this.speedLinesEl.classList.remove('visible');
      }
    }

    // Update day/night cycle
    this.dayNightPhase += (1 / 60) / 60; // 60 second cycle
    if (this.dayNightPhase > 1) this.dayNightPhase -= 1;

    // Update clouds
    this.clouds.forEach(cloud => {
      cloud.x -= cloud.speed * (this.speed / this.INITIAL_SPEED) * 0.5;
      if (cloud.x + cloud.width < 0) {
        cloud.x = 600 + Math.random() * 100;
        cloud.y = 25 + Math.random() * 50;
      }
    });

    // Update stars twinkle
    this.stars.forEach(star => {
      star.twinkle += 0.05;
    });

    // Update donkey animation
    this.donkey.frameTimer++;
    if (this.donkey.frameTimer >= 6) {
      this.donkey.frame = (this.donkey.frame + 1) % 4;
      this.donkey.frameTimer = 0;
    }

    // --- Backflip update ---
    if (this.donkey.backflipping) {
      this.donkey.backflipProgress += (1 / 60) / this.donkey.backflipDuration;
      if (this.donkey.backflipProgress >= 1) {
        this.donkey.backflipping = false;
        this.donkey.backflipProgress = 0;
      }
    }

    // Increment frame counter
    this.frameCount++;

    // --- Stumble update ---
    if (this.donkey.stumbling) {
      this.donkey.stumbleTimer += 1 / 60;
      this.donkey.stumbleWobble = Math.sin(this.donkey.stumbleTimer * 30) * 0.25;
      if (this.donkey.stumbleTimer >= this.donkey.stumbleDuration) {
        this.donkey.stumbling = false;
        this.donkey.stumbleTimer = 0;
        this.donkey.stumbleWobble = 0;
        // Reschedule next stumble
        this.donkey.stumbleNextTrigger = this.frameCount + this.randomFrameRange(1800, 3600);
      }
    } else if (!this.donkey.backflipping) {
      // Schedule next stumble: every 30–60 seconds of gameplay (~1800–3600 frames at 60fps)
      if (this.frameCount >= this.donkey.stumbleNextTrigger) {
        this.donkey.stumbling = true;
        this.donkey.stumbleTimer = 0;
        this.donkey.stumbleNextTrigger = this.frameCount + this.randomFrameRange(1800, 3600);
      }
    }

    // Donkey physics
    if (!this.donkey.grounded) {
      this.donkey.vy += this.GRAVITY;
      this.donkey.y += this.donkey.vy;

      if (this.donkey.y >= this.GROUND_Y - this.donkey.height) {
        this.donkey.y = this.GROUND_Y - this.donkey.height;
        this.donkey.vy = 0;
        this.donkey.grounded = true;
        this.donkey.jumping = false;
        // Reset backflip when landed
        if (this.donkey.backflipping) {
          this.donkey.backflipping = false;
          this.donkey.backflipProgress = 0;
        }
        // Spawn landing dust particles
        if (this.donkey.wasGrounded === false) {
          this.spawnLandingParticles();
        }
      }
    }
    this.donkey.wasGrounded = this.donkey.grounded;

    // Spawn obstacles
    this.obstacleTimer++;
    const targetInterval = Math.max(35, this.baseObstacleInterval - this.speed * 4);
    if (this.obstacleTimer >= targetInterval) {
      this.spawnObstacle();
      this.obstacleTimer = 0;
    }

    // Update obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed;

      // Remove off-screen
      if (obs.x + obs.width < 0) {
        this.obstacles.splice(i, 1);
        continue;
      }

      // Near-miss detection (only check when donkey is not stumbling — allow during jumps)
      if (!this.donkey.stumbling) {
        const dist = (this.donkey.x + this.donkey.width) - obs.x;
        if (dist > 0 && dist < this.nearMissThreshold && !this.nearMissActive) {
          this.triggerNearMiss();
        }
      }

      // Collision detection
      if (this.checkCollision(obs)) {
        if (this.donkey.stumbling) {
          // Knock aside: remove obstacle, spawn particles
          this.knockObstacle(obs, i);
        } else {
          this.gameOver();
          return;
        }
      }
    }

    // Update particles — use swap-with-last for O(1) deletion
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // gravity
      p.life -= 1 / 60;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }
  },

  randomFrameRange(min, max) {
    return min + Math.random() * (max - min);
  },

  knockObstacle(obs, index) {
    // Remove obstacle
    this.obstacles.splice(index, 1);

    // Spawn particles from obstacle position with obstacle-type-specific colors
    this.spawnKnockParticles(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.type);
    this.playSound('knock');
  },

  spawnKnockParticles(px, py, type) {
    let colors = ['#e8a838', '#d4763a', '#8B7355', '#c4a97d'];

    // Obstacle-type-specific particle colors
    switch (type) {
      case 'cactus-small':
      case 'cactus-large':
        colors = ['#2D5A27', '#4A8A3F', '#1A3A16', '#5A9A4F'];
        break;
      case 'rock':
        colors = ['#6B6B6B', '#4A4A4A', '#888888', '#555555'];
        break;
      case 'car':
        colors = ['#D44', '#C33', '#AA3333', '#882222'];
        break;
    }

    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.4 + Math.random() * 0.6,
      });
    }
  },

  // Spawn landing dust particles
  spawnLandingParticles() {
    this.playSound('land');
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI; // spread left and right
      const speed = 0.5 + Math.random() * 2;
      this.particles.push({
        x: this.donkey.x + 20 + (Math.random() - 0.5) * 20,
        y: this.GROUND_Y,
        vx: Math.cos(angle) * speed,
        vy: -0.5 - Math.random() * 1.5,
        size: 1.5 + Math.random() * 2,
        color: 'rgba(200, 180, 150, 0.6)',
        life: 0.3 + Math.random() * 0.3,
      });
    }
  },

  triggerNearMiss() {
    this.nearMissActive = true;

    // Flash "NEAR MISS!" text
    if (this.nearMissEl) {
      this.nearMissEl.classList.remove('flash');
      void this.nearMissEl.offsetWidth; // Force reflow for re-trigger
      this.nearMissEl.classList.add('flash');
      setTimeout(() => this.nearMissEl.classList.remove('flash'), 500);
    }

    // Show bonus text "+50"
    if (this.bonusTextEl) {
      const bonusAmount = 50 * this.comboMultiplier;
      this.bonusTextEl.textContent = `+${bonusAmount}`;
      this.bonusTextEl.classList.remove('flash');
      void this.bonusTextEl.offsetWidth; // Force reflow for re-trigger
      this.bonusTextEl.classList.add('flash');
      setTimeout(() => this.bonusTextEl.classList.remove('flash'), 700);
    }

    // Add bonus score with multiplier
    const bonusScore = Math.floor(50 * this.comboMultiplier);
    this.distance += bonusScore / 100;
    this.score = Math.floor(this.distance * 100);

    this.playSound('nearmiss');

    // Reset near-miss flag after delay
    setTimeout(() => {
      this.nearMissActive = false;
    }, 600);
  },

  updateComboDisplay() {
    if (this.comboEl) {
      this.comboEl.textContent = `COMBO x${this.comboMultiplier}`;
      if (this.comboMultiplier > 1) {
        this.comboEl.classList.add('active');
      } else {
        this.comboEl.classList.remove('active');
      }
    }
  },

  triggerMilestoneFlash() {
    if (this.scoreEl) {
      this.scoreEl.classList.add('milestone-flash');
      setTimeout(() => {
        this.scoreEl.classList.remove('milestone-flash');
      }, 300);
    }
  },

  spawnObstacle() {
    // Obstacle type weights change based on speed
    let weights = [0.35, 0.25, 0.25, 0.15];

    // At higher speeds, increase rock frequency (harder to jump over)
    if (this.speed > 7) {
      weights = [0.25, 0.15, 0.45, 0.15];
    }
    // At even higher speeds, introduce "car" more frequently
    if (this.speed > 9) {
      weights = [0.20, 0.10, 0.40, 0.30];
    }

    const types = ['cactus-small', 'cactus-large', 'rock', 'car'];

    // Pick type based on weights
    let r = Math.random();
    let type = types[0];
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { type = types[i]; break; }
    }

    let obs = { type, x: 620, width: 0, height: 0 };

    switch (type) {
      case 'cactus-small':
        obs.width = 12;
        obs.height = 25 + Math.random() * 10;
        break;
      case 'cactus-large':
        obs.width = 18;
        obs.height = 35 + Math.random() * 8;
        break;
      case 'rock':
        obs.width = 16 + Math.random() * 8;
        obs.height = 12 + Math.random() * 6;
        break;
      case 'car':
        obs.width = 36;
        obs.height = 18;
        break;
    }

    obs.y = this.GROUND_Y - obs.height;
    this.obstacles.push(obs);
  },

  checkCollision(obs) {
    const dx = this.donkey.x + 8;
    const dy = this.donkey.y + 4;
    const dw = this.donkey.width - 16;
    const dh = this.donkey.height - 8;

    const padding = 4;
    return (
      dx + dw > obs.x + padding &&
      dx < obs.x + obs.width - padding &&
      dy + dh > obs.y + padding &&
      dy < obs.y + obs.height - padding
    );
  },

  gameOver() {
    this.gameRunning = false;
    this.gameOverActive = true;

    // Play game over sound
    this.playSound('gameover');

    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('hasW_donkeyHighScore', this.highScore);
      if (this.highScoreEl) {
        this.highScoreEl.textContent = `HI ${String(this.highScore).padStart(5, '0')}`;
      }
    }

    // Show game over screen with score
    if (this.gameOverEl) {
      const scoreDisplay = document.getElementById('donkey-gameover-score');
      if (scoreDisplay) {
        scoreDisplay.textContent = `SCORE: ${String(this.score).padStart(5, '0')}`;
      }
      this.gameOverEl.classList.remove('hidden');
    }

    // Flash the canvas briefly
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 80, 60, 0.25)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    setTimeout(() => { this.draw(); }, 100);

    // Record timestamp for restart cooldown (prevents held-key instant restart)
    this.gameOverTimestamp = performance.now();

    this.gameOverCooldown = true;
    setTimeout(() => {
      this.gameOverCooldown = false;
      this.keysDown = {};
    }, 1000);
  },

  drawIdle() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(20, 25, 40, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Ground line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.GROUND_Y);
    ctx.lineTo(w, this.GROUND_Y);
    ctx.stroke();

    this.drawDonkey(ctx, this.donkey.x, this.GROUND_Y - this.donkey.height, 0, 0);

    if (this.startScreenEl) this.startScreenEl.classList.remove('hidden');
  },

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Day/night background
    this.drawDayNightBackground(ctx, w, h);

    // Stars
    this.drawStars(ctx);

    // Clouds
    this.drawClouds(ctx);

    // Ground
    this.drawGround(ctx);

    // Obstacles
    this.obstacles.forEach(obs => this.drawObstacle(ctx, obs));

    // Particles
    this.drawParticles(ctx);

    // Donkey
    let donkeyRotation = 0;
    if (this.donkey.backflipping) {
      donkeyRotation = this.donkey.backflipProgress * Math.PI * 2;
    } else if (this.donkey.stumbling) {
      donkeyRotation = this.donkey.stumbleWobble;
    }
    this.drawDonkey(ctx, this.donkey.x, this.donkey.y, this.donkey.frame, donkeyRotation);
  },

  drawDayNightBackground(ctx, w, h) {
    // Phase 0 = midnight, 0.5 = noon-ish, cycle back
    const phase = this.dayNightPhase;
    let topR, topG, topB, botR, botG, botB;

    if (phase < 0.25) {
      // Night → Dusk
      const t = phase / 0.25;
      topR = 20 + t * 15;
      topG = 25 + t * (-5);
      topB = 40 + t * 10;
      botR = 30 + t * 10;
      botG = 35 + t * (-15);
      botB = 50 + t * 0;
    } else if (phase < 0.5) {
      // Dusk → Night
      const t = (phase - 0.25) / 0.25;
      topR = 35 - t * 15;
      topG = 20 + t * 5;
      topB = 50 - t * 10;
      botR = 40 - t * 10;
      botG = 20 + t * 15;
      botB = 50 - t * 0;
    } else if (phase < 0.75) {
      // Night → Dawn
      const t = (phase - 0.5) / 0.25;
      topR = 20 + t * 20;
      topG = 25 + t * 5;
      topB = 40 + t * (-5);
      botR = 30 + t * 10;
      botG = 35 + t * 0;
      botB = 50 + t * (-15);
    } else {
      // Dawn → Night
      const t = (phase - 0.75) / 0.25;
      topR = 40 - t * 20;
      topG = 30 - t * 5;
      topB = 35 + t * 5;
      botR = 40 - t * 10;
      botG = 35 - t * 0;
      botB = 35 + t * 15;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgb(${Math.round(topR)},${Math.round(topG)},${Math.round(topB)})`);
    grad.addColorStop(1, `rgb(${Math.round(botR)},${Math.round(botG)},${Math.round(botB)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  drawStars(ctx) {
    const alpha = this.getStarAlpha();
    if (alpha <= 0) return;

    this.stars.forEach(star => {
      const twinkleAlpha = 0.3 + Math.sin(star.twinkle) * 0.3;
      const finalAlpha = twinkleAlpha * alpha;
      ctx.fillStyle = `rgba(255, 255, 255, ${finalAlpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  getStarAlpha() {
    const phase = this.dayNightPhase;
    if (phase < 0.2) return 1;
    if (phase < 0.35) return 1 - (phase - 0.2) / 0.15 * 0.6;
    if (phase < 0.5) return 0.4;
    if (phase < 0.65) return 0.4 + (phase - 0.5) / 0.15 * 0.6;
    if (phase < 0.8) return 1;
    return 1;
  },

  drawClouds(ctx) {
    const alpha = 0.06 + (1 - this.getStarAlpha()) * 0.04;
    this.clouds.forEach(cloud => {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.width / 2, cloud.y, cloud.width / 2, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.width * 0.3, cloud.y - 5, cloud.width * 0.3, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  drawGround(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, this.GROUND_Y);
    ctx.lineTo(this.canvas.width, this.GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = this.groundX; x < this.canvas.width; x += 20) {
      ctx.fillRect(x, this.GROUND_Y + 3, 8, 1);
    }
    for (let x = this.groundX + 10; x < this.canvas.width; x += 25) {
      ctx.fillRect(x, this.GROUND_Y + 8, 5, 1);
    }
  },

  drawDonkey(ctx, x, y, frame, rotation) {
    ctx.save();

    // Translate to donkey center, then scale, then offset by half-size for drawing
    ctx.translate(x + this.donkey.width / 2, y + this.donkey.height / 2);

    // Apply rotation for backflip/stumble
    if (rotation) {
      ctx.rotate(rotation);
    }

    const scale = 1.2;
    ctx.scale(scale, scale);
    ctx.translate(-this.donkey.width / 2, -this.donkey.height / 2);

    // Donkey colors
    const bodyColor = '#8B7355';
    const darkColor = '#6B5B45';
    const maneColor = '#4A3A2A';
    const eyeColor = '#1a1a2e';
    const noseColor = '#9B8B75';
    const hoovesColor = '#3A2A1A';

    // Animated tail wag using frame counter instead of Date.now()
    const tailWag = this.donkey.grounded && !this.donkey.stumbling
      ? Math.sin(frame * Math.PI / 2 + this.frameCount * 0.15) * 3
      : 0;

    // Tail - now properly connected to rear body
    ctx.strokeStyle = maneColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 22);
    ctx.quadraticCurveTo(2 + tailWag, 28, -2 + tailWag * 0.5, 34);
    ctx.stroke();

    // Body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(20, 26, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = bodyColor;
    const legOffsets = [
      { x: 10, frame: frame },
      { x: 15, frame: frame + 2 },
      { x: 22, frame: frame + 1 },
      { x: 27, frame: frame + 3 },
    ];

    legOffsets.forEach((leg) => {
      const legX = leg.x;
      const legFrame = leg.frame % 4;
      let legAnimOffset = 0;

      if (this.donkey.stumbling) {
        // Tumble: legs flail randomly
        legAnimOffset = Math.sin(legFrame * Math.PI / 2 + this.donkey.stumbleTimer * 20) * 5;
      } else if (this.donkey.grounded) {
        legAnimOffset = Math.sin(legFrame * Math.PI / 2) * 3;
      }

      // If mid-air during backflip, legs tuck up
      if (this.donkey.backflipping && !this.donkey.grounded) {
        legAnimOffset = -4;
      }

      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(legX, 30);
      ctx.lineTo(legX + legAnimOffset, 42);
      ctx.stroke();

      // Hoof
      ctx.fillStyle = hoovesColor;
      ctx.beginPath();
      ctx.arc(legX + legAnimOffset, 42, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Neck
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(28, 18);
    ctx.quadraticCurveTo(36, 10, 34, 4);
    ctx.lineTo(30, 4);
    ctx.quadraticCurveTo(28, 12, 24, 20);
    ctx.closePath();
    ctx.fill();

    // Mane
    ctx.fillStyle = maneColor;
    ctx.beginPath();
    ctx.moveTo(30, 2);
    ctx.lineTo(28, 8);
    ctx.lineTo(30, 8);
    ctx.lineTo(28, 14);
    ctx.lineTo(30, 14);
    ctx.lineTo(28, 20);
    ctx.lineTo(30, 20);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(34, 8, 7, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Ear
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(32, 3);
    ctx.lineTo(30, -4);
    ctx.lineTo(35, 1);
    ctx.closePath();
    ctx.fill();

    // Inner ear
    ctx.fillStyle = noseColor;
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(31, -2);
    ctx.lineTo(34, 1);
    ctx.closePath();
    ctx.fill();

    // Eye - big and expressive
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(36, 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(36.5, 6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(37, 5.5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Stumble eyes (X eyes when stumbling)
    if (this.donkey.stumbling) {
      ctx.strokeStyle = '#e8a838';
      ctx.lineWidth = 0.8;
      // X marks
      ctx.beginPath();
      ctx.moveTo(35, 4.5);
      ctx.lineTo(37.5, 6.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(37.5, 4.5);
      ctx.lineTo(35, 6.5);
      ctx.stroke();
    }

    // Nostril
    ctx.fillStyle = noseColor;
    ctx.beginPath();
    ctx.arc(39, 9, 1, 0, Math.PI * 2);
    ctx.fill();

    // Mouth - worried expression when stumbling
    if (this.donkey.stumbling) {
      ctx.strokeStyle = darkColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(38, 14, 2, Math.PI * 0.8, Math.PI * 0.2, true);
      ctx.stroke();
    } else {
      ctx.strokeStyle = darkColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(37, 12);
      ctx.quadraticCurveTo(39, 13, 40, 12);
      ctx.stroke();
    }

    // White muzzle stripe
    ctx.fillStyle = 'rgba(210, 190, 170, 0.5)';
    ctx.beginPath();
    ctx.ellipse(37, 10, 4, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  drawParticles(ctx) {
    this.particles.forEach(p => {
      const alpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },

  drawObstacle(ctx, obs) {
    switch (obs.type) {
      case 'cactus-small':
      case 'cactus-large':
        this.drawCactus(ctx, obs);
        break;
      case 'rock':
        this.drawRock(ctx, obs);
        break;
      case 'car':
        this.drawCar(ctx, obs);
        break;
    }
  },

  drawCactus(ctx, obs) {
    ctx.fillStyle = '#2D5A27';
    ctx.strokeStyle = '#1A3A16';
    ctx.lineWidth = 1;

    const cx = obs.x + obs.width / 2;
    ctx.beginPath();
    ctx.roundRect(obs.x + 2, obs.y, obs.width - 4, obs.height, 3);
    ctx.fill();
    ctx.stroke();

    if (obs.type === 'cactus-large') {
      // Left arm
      ctx.beginPath();
      ctx.roundRect(obs.x - 4, obs.y + 8, 8, 4, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(obs.x - 4, obs.y + 4, 4, 12, 2);
      ctx.fill();

      // Right arm
      ctx.beginPath();
      ctx.roundRect(obs.x + obs.width - 4, obs.y + 12, 8, 4, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(obs.x + obs.width, obs.y + 8, 4, 10, 2);
      ctx.fill();
    }

    // Spines
    ctx.fillStyle = '#4A8A3F';
    for (let i = 0; i < 3; i++) {
      const sy = obs.y + 4 + i * (obs.height / 3);
      ctx.fillRect(obs.x, sy, 2, 1);
      ctx.fillRect(obs.x + obs.width - 2, sy, 2, 1);
    }
  },

  drawRock(ctx, obs) {
    ctx.fillStyle = '#6B6B6B';
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(obs.x, obs.y + obs.height);
    ctx.lineTo(obs.x + 3, obs.y + 3);
    ctx.quadraticCurveTo(obs.x + obs.width / 2, obs.y - 2, obs.x + obs.width - 3, obs.y + 3);
    ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 3, obs.height / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  drawCar(ctx, obs) {
    // Car body
    ctx.fillStyle = '#D44';
    ctx.strokeStyle = '#A33';
    ctx.lineWidth = 1;

    // Lower body
    ctx.beginPath();
    ctx.roundRect(obs.x, obs.y + 6, obs.width, 12, 3);
    ctx.fill();
    ctx.stroke();

    // Upper body (cabin)
    ctx.fillStyle = '#C33';
    ctx.beginPath();
    ctx.roundRect(obs.x + 8, obs.y, 20, 10, 3);
    ctx.fill();
    ctx.stroke();

    // Windows
    ctx.fillStyle = 'rgba(150, 200, 255, 0.4)';
    ctx.beginPath();
    ctx.roundRect(obs.x + 10, obs.y + 2, 8, 6, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(obs.x + 20, obs.y + 2, 6, 6, 1);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(obs.x + 8, obs.y + 18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(obs.x + obs.width - 8, obs.y + 18, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wheel hubs
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(obs.x + 8, obs.y + 18, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(obs.x + obs.width - 8, obs.y + 18, 1.5, 0, Math.PI * 2);
    ctx.fill();
  },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  DONKEY_RUNNER.init();
});