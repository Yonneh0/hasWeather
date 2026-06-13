// ===== DONKEY RUNNER MINIGAME =====
// A Chrome-dinosaur-style endless runner with a donkey character

const NEAR_MISS_COOLDOWN = 600; // ms

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
  JUMP_FORCE: -10,
  DOUBLE_JUMP_FORCE: -8,
  MAX_JUMPS: 2,
  GROUND_Y: 0,
  CEILING_Y: 5, // donkey can't go higher than this
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
    currentJumpCount: 0,  // tracks how many jumps used this jump cycle (0=grounded, 1=first jump, 2=double jump)
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

  // Air-based obstacle tracking
  fallingRockX: 0,
  fallingRockY: 0,
  fallingRockFallSpeed: 3,
  fallingRockActive: false,
  jetY: 0,
  jetActive: false,
  droneX: 0,
  droneY: 0,
  droneDir: 1,
  droneActive: false,
  droneWavePhase: 0,

  // Ground
  groundX: 0,
  groundLineY: 0,

  // Clouds (background decoration)
  clouds: [],

  // Stars (background decoration)
  stars: [],

  // Day/night cycle (60 second cycle)
  dayNightPhase: 0,

  // Particle system
  particles: [],

  // Score milestone tracking
  lastMilestoneScore: 0,

  // Property damage (obstacles destroyed while stumbling)
  propertyDamageCount: 0,

  // Obstacle count tracking (how many of each type were passed)
  obstacleCounts: {
    'cactus-small': 0,
    'cactus-large': 0,
    'rock': 0,
    'car': 0,
    'jet': 0,
    'falling-rock': 0,
    'drone': 0,
  },
  // Obstacle type that caused the game over (for red highlight)
  gameOverObstacleType: null,

  // Post-game stats tracking
  maxSpeed: 0,
  nearMissCount: 0,

  // Jump tracking
  totalJumps: 0,
  doubleJumps: 0,
  ignoredJumps: 0,

  // Time tracking
  airTime: 0,
  runTime: 0,

  // Score breakdown
  nearMissScore: 0,

  // DOM elements
  scoreEl: null,
  highScoreEl: null,
  startScreenEl: null,
  gameOverEl: null,
  nearMissEl: null,
  bonusTextEl: null,
  speedLinesEl: null,
  soundBtnEl: null,

  // Input
  keysDown: {},
  jumpCooldownTimer: 0,
  jumpCooldownDuration: 0.05,

  // Game over cooldown to prevent rapid-fire restart glitches
  gameOverCooldown: false,
  restartCooldown: false,
  gameOverActive: false,

  // Pause state
  paused: false,

  // Audio context for procedural sound effects
  audioCtx: null,
  soundEnabled: false,

  nearMissActive: false,

  // Fullscreen state
  isFullscreen: false,
  fullscreenScale: 1,
  fullscreenBtnEl: null,

  // Snarky message system
  snarkyMessages: {
    start: ["Time to run for your life!", "May the odds be ever in your favor"],
    jump: ["You call that a jump?", "Gravity is optional, apparently"],
    "double-jump": ["Fart power engaged!", "Mid-air desperation activates"],
    land: ["That was graceful", "404: Dignity not found"],
    "speed-increase": ["Speed boost! Good luck!", "You're not getting faster, just more desperate"],
    cactus: ["A cactus? Really?", "The simplest obstacle and you still can't dodge it"],
    rock: ["Rock you are?", "Geology is not your friend"],
    car: ["A car at this speed? Bold choice", "You're about to become roadkill"],
    "near-miss": ["NEAR MISS! Your survival instincts are... minimal", "That was close! Too close for comfort"],
    "property-damage": ["Property damage! +100 points for destruction", "You broke something! Good job"],
    "game-over": ["GAME OVER! Your donkey's story ends here", "RIP dignity", "That's not a jump, that's a cry for help"],
    "high-score": ["NEW HIGH SCORE! Shocking", "You broke your own record! Unbelievable"],
    stumble: ["Stumble time! Good luck recovering", "Your donkey just tripped over its own feet"],
    backflip: ["Backflip! Because regular jumping wasn't enough", "Oh look, a backflip! What a show-off"],
    ceiling: ["CEILING! Your donkey hit the ceiling", "Up up and... OUCH"],
    jet: ["A jet! Your donkey is not a bird", "Military aviation is not your ally today"],
    "falling-rock": ["Falling rock! Look both ways before running", "Gravity: 1, Donkey: 0"],
    drone: ["Drone incoming! Your donkey is not a spaceship", "Surveillance state meets incompetence"],
    milestone: ["MILESTONE! You survived a while!", "Another thousand points! The donkey is proud"],
    "ignored-jump": ["Jump ignored! Your donkey said no", "Not every jump is welcome here"],
    restart: ["Round two! Why do you keep doing this?", "Again? Really?"]
  },
  messageIndex: {},  // tracks which message was last shown per event type
  messageCooldown: 0,  // cooldown timer
  snarkyMessageEl: null,

  speedLineX: 0,
  speedLines: [],

  lastFrameTime: 0,
  dpr: 1,

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
          <span class="donkey-score" id="donkey-score">00000</span>
        </div>
        <span class="donkey-title">Half-Assed Solution: Donkey Runner</span>
        <div class="donkey-header-highscore">
          <span class="donkey-highscore" id="donkey-highscore">HI ${String(this.highScore).padStart(5, '0')}</span>
        </div>
        <button class="donkey-fullscreen-btn" id="donkey-fullscreen-btn" title="Toggle fullscreen">⛶</button>
        <button class="donkey-close-btn" title="Close game">✕</button>
      </div>
      <div class="donkey-panel-body">
          <div class="donkey-play-area">
          <canvas id="donkey-canvas" width="600" height="180"></canvas>
          <div class="donkey-speed-lines" id="donkey-speed-lines"></div>
          <div class="donkey-near-miss" id="donkey-near-miss">NEAR MISS!</div>
          <div class="donkey-bonus-text" id="donkey-bonus-text"></div>
          <div class="donkey-snarky-message" id="donkey-snarky-message"></div>
          <div class="donkey-startscreen" id="donkey-startscreen">
            <div class="ds-subtitle">dodge the crap, run the plains</div>
            <div class="ds-controls">
              <div class="ds-ctrl-row"><kbd>SPACE</kbd> / <kbd>↑</kbd> / <kbd>tap</kbd> &nbsp;start/jump</div>
            </div>
            <div class="ds-objective">
              survive as long as you can — score ticks up the longer you live.<br>
              obstacles get harder as speed increases<br>
              jump again while mid-air, to give donkey the beans
            </div>
            <div class="ds-prompt">press space or tap to start</div>
          </div>
          <div class="donkey-gameover hidden" id="donkey-gameover">
            <span class="donkey-gameover-text">GAME OVER</span>
            <span class="donkey-gameover-new hidden" id="donkey-gameover-new"><span class="donkey-gameover-new-label">NEW HIGH SCORE!</span><span class="donkey-gameover-new-score" id="donkey-gameover-new-score">00000</span></span>
            <!-- Obstacle count table across the top -->
            <div class="donkey-gameover-obstacle-table" id="donkey-gameover-obstacle-table"></div>
            <!-- Top-left stats — score-based block (4 items) -->
            <div class="donkey-gameover-stats-top-left" id="donkey-gameover-stats-top-left">
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">NEAR MISSES</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-nearmisses">0</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">PROPERTY DAMAGE</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-property-damage">0</span>
              </div>
            </div>
            <!-- Top-right stats — non-score block (4 items) -->
            <div class="donkey-gameover-stats-top-right" id="donkey-gameover-stats-top-right">
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">DISTANCE</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-distance">0</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">MAX SPEED</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-maxspeed">0</span>
              </div>
            </div>
            <!-- Bottom-left stats — time-based (3 items) -->
            <div class="donkey-gameover-stats-bottom-left" id="donkey-gameover-stats-bottom-left">
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">RUN TIME</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-runtime">0s</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">AIR TIME</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-airtime">0s</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">AIR %</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-airpercent">0%</span>
              </div>
            </div>
            <!-- Bottom-right stats — jump-based (3 items) -->
            <div class="donkey-gameover-stats-bottom-right" id="donkey-gameover-stats-bottom-right">
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">TOTAL JUMPS</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-totaljumps">0</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">DOUBLE JUMPS</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-doublejumps">0</span>
              </div>
              <div class="donkey-gameover-stat-row">
                <span class="donkey-gameover-stat-label">IGNORED JUMPS</span>
                <span class="donkey-gameover-stat-value" id="donkey-gameover-ignoredjumps">0</span>
              </div>
            </div>
            <span class="donkey-restart-text">press space or tap to restart</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.gamePanel);
    this.gamePanel.classList.add('donkey-hidden');

    // Set up canvas — scale for device pixel ratio to prevent blurry rendering on high-DPI screens
    this.dpr = window.devicePixelRatio || 1;
    this.canvas = document.getElementById('donkey-canvas');
    // Calculate display dimensions based on actual play area size
    const playArea = this.gamePanel.querySelector('.donkey-play-area');
    const displayWidth = Math.round(playArea.offsetWidth);
    const aspectRatio = 600 / 180; // original aspect ratio
    const displayHeight = Math.round(displayWidth / aspectRatio);
    // Set display size via CSS
    this.canvas.style.width = displayWidth + 'px';
    this.canvas.style.height = displayHeight + 'px';
    // Set internal resolution for DPR scaling
    this.canvas.width = displayWidth * this.dpr;
    this.canvas.height = displayHeight * this.dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.dpr, this.dpr);
    this.GROUND_Y = this.canvas.height / this.dpr - 20;

    // Score and UI elements
    this.scoreEl = document.getElementById('donkey-score');
    this.highScoreEl = document.getElementById('donkey-highscore');
    this.startScreenEl = document.getElementById('donkey-startscreen');
    this.gameOverEl = document.getElementById('donkey-gameover');
    this.nearMissEl = document.getElementById('donkey-near-miss');
    this.bonusTextEl = document.getElementById('donkey-bonus-text');
    this.speedLinesEl = document.getElementById('donkey-speed-lines');
    this.soundBtnEl = document.getElementById('donkey-sound-btn');
    this.snarkyMessageEl = document.getElementById('donkey-snarky-message');

    // High score on start screen
    const dsHighScoreVal = document.getElementById('ds-highscore-val');
    if (dsHighScoreVal) {
      dsHighScoreVal.textContent = String(this.highScore).padStart(5, '0');
    }

    // Fullscreen button handler
    this.fullscreenBtnEl = document.getElementById('donkey-fullscreen-btn');
    if (this.fullscreenBtnEl) {
      this.fullscreenBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      });
    }

    // Sound toggle button — check localStorage for saved preference
    if (this.soundBtnEl) {
      const savedSound = localStorage.getItem('donkeySoundEnabled');
      this.soundEnabled = savedSound === 'true';
      this.soundBtnEl.textContent = this.soundEnabled ? '\u{1F50A}' : '\u{1F507}'; // 🔊 or 🔇
      this.soundBtnEl.classList.toggle('muted', !this.soundEnabled);
      this.soundBtnEl.title = this.soundEnabled ? 'Mute sound' : 'Unmute sound';
      this.soundBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.soundEnabled = !this.soundEnabled;
        if (this.soundEnabled) {
          localStorage.setItem('donkeySoundEnabled', 'true');
        } else {
          localStorage.removeItem('donkeySoundEnabled');
        }
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
        // Skip browser auto-repeat events entirely — user must release the key to jump again
        if (e.repeat) return;
        this.keysDown[e.code] = true;
        this.handleInput();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        this.keysDown[e.code] = false;
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

        case 'land':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(150, now);
          oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.08);
          gainNode.gain.setValueAtTime(0.05, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          oscillator.start(now);
          oscillator.stop(now + 0.1);
          break;

        case 'fart':
          // Multi-layered fart sound: constriction + wet squelch + rumble + gurgles + hiss
          const fartDur = 0.45; // seconds
          const sampleRate = this.audioCtx.sampleRate;
          const bufLen = Math.round(sampleRate * fartDur);

          // === LAYER 1: Noise through constriction (air squeezing through narrowing passage) ===
          const constrictionBuf = this.audioCtx.createBuffer(1, bufLen, sampleRate);
          const constrData = constrictionBuf.getChannelData(0);
          for (let i = 0; i < bufLen; i++) {
            constrData[i] = (Math.random() * 2 - 1);
          }
          const constrSource = this.audioCtx.createBufferSource();
          constrSource.buffer = constrictionBuf;
          const constrFilter = this.audioCtx.createBiquadFilter();
          constrFilter.type = 'bandpass';
          constrFilter.frequency.setValueAtTime(800, now);
          constrFilter.frequency.exponentialRampToValueAtTime(60, now + fartDur);
          constrFilter.frequency.setValueAtTime(800, now + 0.05);
          constrFilter.frequency.exponentialRampToValueAtTime(60, now + 0.45);
          constrFilter.Q.setValueAtTime(1.5, now);
          constrFilter.Q.exponentialRampToValueAtTime(8, now + 0.1);
          constrFilter.Q.setValueAtTime(1.5, now + 0.1);
          constrFilter.Q.exponentialRampToValueAtTime(8, now + 0.35);
          constrFilter.Q.setValueAtTime(1.5, now + 0.35);
          constrFilter.Q.exponentialRampToValueAtTime(8, now + 0.45);
          const constrGain = this.audioCtx.createGain();
          constrGain.gain.setValueAtTime(0.3, now);
          constrGain.gain.exponentialRampToValueAtTime(0.005, now + fartDur);
          constrSource.connect(constrFilter);
          constrFilter.connect(constrGain);
          constrGain.connect(gainNode);
          constrSource.start(now);
          constrSource.stop(now + fartDur);

          // === LAYER 2: Wet squelch — gurgling noise with oscillating center frequency ===
          const squelchBuf = this.audioCtx.createBuffer(1, bufLen, sampleRate);
          const squelchData = squelchBuf.getChannelData(0);
          for (let i = 0; i < bufLen; i++) {
            squelchData[i] = (Math.random() * 2 - 1);
          }
          const squelchSource = this.audioCtx.createBufferSource();
          squelchSource.buffer = squelchBuf;
          const squelchFilter = this.audioCtx.createBiquadFilter();
          squelchFilter.type = 'bandpass';
          // Oscillate the center frequency back and forth — creates the gurgly wet sound
          squelchFilter.frequency.setValueAtTime(200, now);
          squelchFilter.frequency.linearRampToValueAtTime(500, now + 0.08);
          squelchFilter.frequency.linearRampToValueAtTime(150, now + 0.16);
          squelchFilter.frequency.linearRampToValueAtTime(450, now + 0.24);
          squelchFilter.frequency.linearRampToValueAtTime(100, now + 0.32);
          squelchFilter.frequency.linearRampToValueAtTime(400, now + 0.40);
          squelchFilter.frequency.linearRampToValueAtTime(80, now + fartDur);
          squelchFilter.Q.setValueAtTime(4, now);
          squelchFilter.Q.linearRampToValueAtTime(12, now + 0.06);
          squelchFilter.Q.linearRampToValueAtTime(3, now + 0.12);
          squelchFilter.Q.linearRampToValueAtTime(10, now + 0.18);
          squelchFilter.Q.linearRampToValueAtTime(4, now + 0.24);
          squelchFilter.Q.linearRampToValueAtTime(11, now + 0.30);
          squelchFilter.Q.linearRampToValueAtTime(5, now + 0.36);
          squelchFilter.Q.linearRampToValueAtTime(12, now + 0.42);
          squelchFilter.Q.linearRampToValueAtTime(6, now + fartDur);
          const squelchGain = this.audioCtx.createGain();
          squelchGain.gain.setValueAtTime(0.25, now);
          squelchGain.gain.exponentialRampToValueAtTime(0.008, now + fartDur * 0.9);
          squelchSource.connect(squelchFilter);
          squelchFilter.connect(squelchGain);
          squelchGain.connect(gainNode);
          squelchSource.start(now);
          squelchSource.stop(now + fartDur);

          // === LAYER 3: Deep sub-bass rumble with pulsing ===
          const subOsc1 = this.audioCtx.createOscillator();
          const subOsc2 = this.audioCtx.createOscillator();
          const subGain = this.audioCtx.createGain();
          // Pulsing amplitude — mimics the rhythmic contraction of a real fart
          const pulseLFO = this.audioCtx.createOscillator();
          const pulseGain = this.audioCtx.createGain();
          pulseLFO.frequency.setValueAtTime(18, now);
          pulseGain.gain.setValueAtTime(0.15, now);
          pulseGain.gain.exponentialRampToValueAtTime(0.02, now + fartDur);
          pulseLFO.connect(pulseGain);
          subOsc1.frequency.setValueAtTime(55, now);
          subOsc1.frequency.exponentialRampToValueAtTime(22, now + fartDur);
          subOsc2.frequency.setValueAtTime(35, now);
          subOsc2.frequency.exponentialRampToValueAtTime(15, now + fartDur);
          subGain.gain.setValueAtTime(0.2, now);
          subGain.gain.exponentialRampToValueAtTime(0.005, now + fartDur);
          subOsc1.connect(subGain);
          subOsc2.connect(subGain);
          subGain.connect(pulseGain);
          pulseGain.connect(gainNode);
          subOsc1.start(now);
          subOsc1.stop(now + fartDur);
          subOsc2.start(now);
          subOsc2.stop(now + fartDur);
          pulseLFO.start(now);
          pulseLFO.stop(now + fartDur);

          // === LAYER 4: Mid-range gurgly bubbles (multiple oscillators) ===
          const bubbleOsc1 = this.audioCtx.createOscillator();
          const bubbleOsc2 = this.audioCtx.createOscillator();
          const bubbleOsc3 = this.audioCtx.createOscillator();
          const bubbleGain1 = this.audioCtx.createGain();
          const bubbleGain2 = this.audioCtx.createGain();
          const bubbleGain3 = this.audioCtx.createGain();
          // Bubble oscillators — simulate air bubbles escaping through wet passage
          bubbleOsc1.frequency.setValueAtTime(120, now);
          bubbleOsc1.frequency.linearRampToValueAtTime(250, now + 0.12);
          bubbleOsc1.frequency.linearRampToValueAtTime(80, now + 0.24);
          bubbleOsc1.frequency.linearRampToValueAtTime(280, now + 0.36);
          bubbleOsc1.frequency.linearRampToValueAtTime(50, now + fartDur);
          bubbleOsc2.frequency.setValueAtTime(180, now);
          bubbleOsc2.frequency.linearRampToValueAtTime(90, now + 0.15);
          bubbleOsc2.frequency.linearRampToValueAtTime(320, now + 0.28);
          bubbleOsc2.frequency.linearRampToValueAtTime(60, now + 0.42);
          bubbleOsc2.frequency.linearRampToValueAtTime(150, now + fartDur);
          bubbleOsc3.frequency.setValueAtTime(250, now);
          bubbleOsc3.frequency.linearRampToValueAtTime(70, now + 0.18);
          bubbleOsc3.frequency.linearRampToValueAtTime(350, now + 0.30);
          bubbleOsc3.frequency.linearRampToValueAtTime(90, now + 0.42);
          bubbleOsc3.frequency.linearRampToValueAtTime(200, now + fartDur);
          bubbleGain1.gain.setValueAtTime(0.06, now);
          bubbleGain1.gain.exponentialRampToValueAtTime(0.005, now + fartDur * 0.7);
          bubbleGain2.gain.setValueAtTime(0.05, now);
          bubbleGain2.gain.exponentialRampToValueAtTime(0.005, now + fartDur * 0.65);
          bubbleGain3.gain.setValueAtTime(0.04, now);
          bubbleGain3.gain.exponentialRampToValueAtTime(0.005, now + fartDur * 0.6);
          bubbleOsc1.connect(bubbleGain1);
          bubbleGain1.connect(gainNode);
          bubbleOsc2.connect(bubbleGain2);
          bubbleGain2.connect(gainNode);
          bubbleOsc3.connect(bubbleGain3);
          bubbleGain3.connect(gainNode);
          bubbleOsc1.start(now);
          bubbleOsc1.stop(now + fartDur);
          bubbleOsc2.start(now);
          bubbleOsc2.stop(now + fartDur);
          bubbleOsc3.start(now);
          bubbleOsc3.stop(now + fartDur);

          // === LAYER 5: High-frequency air hiss (brief burst) ===
          const hissBuf = this.audioCtx.createBuffer(1, bufLen, sampleRate);
          const hissData = hissBuf.getChannelData(0);
          for (let i = 0; i < bufLen; i++) {
            hissData[i] = (Math.random() * 2 - 1);
          }
          const hissSource = this.audioCtx.createBufferSource();
          hissSource.buffer = hissBuf;
          const hissFilter = this.audioCtx.createBiquadFilter();
          hissFilter.type = 'highpass';
          hissFilter.frequency.setValueAtTime(3000, now);
          hissFilter.frequency.linearRampToValueAtTime(6000, now + 0.08);
          hissFilter.frequency.linearRampToValueAtTime(2000, now + 0.25);
          hissFilter.frequency.linearRampToValueAtTime(4000, now + 0.35);
          hissFilter.frequency.linearRampToValueAtTime(1500, now + fartDur);
          const hissGain = this.audioCtx.createGain();
          hissGain.gain.setValueAtTime(0.08, now);
          hissGain.gain.exponentialRampToValueAtTime(0.002, now + fartDur * 0.7);
          hissSource.connect(hissFilter);
          hissFilter.connect(hissGain);
          hissGain.connect(gainNode);
          hissSource.start(now);
          hissSource.stop(now + fartDur);

          // === Master gain envelope for the entire fart ===
          gainNode.gain.setValueAtTime(0.3, now);
          gainNode.gain.exponentialRampToValueAtTime(0.005, now + fartDur);

          break;

        case 'ceiling':
          // Metallic clang sound
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(800, now);
          oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.15);
          gainNode.gain.setValueAtTime(0.1, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;
      }
    } catch (e) {
      // Silently fail if audio context has issues
    }
  },

  handleInput() {
    // Initialize audio on first user interaction
    this.initAudio();

    if (!this.gameStarted) {
      this.start();
    } else if (!this.gameRunning && !this.gameOverActive) {
      // Between death and cooldown expiry — should not happen in normal flow, but be safe
      return;
    } else if (!this.gameRunning && this.gameOverActive) {
      // Game is dead and game over screen is showing — only restart if cooldown has expired
      if (this.restartCooldown) return;
      this.restart();
    } else if (this.donkey.grounded && !this.donkey.stumbling && !this.gameOverActive) {
      // First jump — from ground
      this.playSound('jump');
      this.totalJumps++;
      this.donkey.vy = this.JUMP_FORCE;
      this.donkey.jumping = true;
      this.donkey.grounded = false;
      this.donkey.currentJumpCount = 1;
      if (Math.random() < 0.08) {
        this.donkey.backflipping = true;
        this.donkey.backflipProgress = 0;
        this.showSnarkyMessage('backflip');
      }
      this.showSnarkyMessage('jump');
    } else if (!this.donkey.grounded && !this.donkey.stumbling && this.donkey.currentJumpCount < this.MAX_JUMPS && !this.gameOverActive) {
      // Only allow double jump if cooldown has expired (prevents held-key rapid-fire)
      if (this.jumpCooldownTimer <= 0) {
        // Change to fart sound for double-jump
        this.playSound('fart');
        this.totalJumps++;
        this.doubleJumps++;
        this.donkey.vy = this.DOUBLE_JUMP_FORCE;
        this.donkey.currentJumpCount++;
        // Spawn double-jump particles
        this.spawnDoubleJumpParticles();
        // Reset cooldown
        this.jumpCooldownTimer = this.jumpCooldownDuration;
        this.showSnarkyMessage('double-jump');
      } else {
        // Cooldown still active — jump attempted but rejected
        this.ignoredJumps++;
        this.showSnarkyMessage('ignored-jump');
      }
    } else if (!this.gameOverActive) {
      // Jump attempted but rejected for any reason:
      // - Donkey is stumbling (can't jump)
      // - Donkey is already airborne with both jumps used (currentJumpCount >= MAX_JUMPS)
      // - Jump cooldown still active while airborne
      this.ignoredJumps++;
      this.showSnarkyMessage('ignored-jump');
    }
  },

  start() {
    this.gameStarted = true;
    this.gameRunning = true;
    if (this.startScreenEl) this.startScreenEl.classList.add('hidden');
    if (this.gameOverEl) this.gameOverEl.classList.add('hidden');
    this.resetGame();
    this.restartCooldown = false; // Ensure cooldown is cleared when starting from idle state
    this.loop();
    // Show start message after a brief delay (so the overlay is gone first)
    setTimeout(() => {
      this.showSnarkyMessage('start');
    }, 200);
  },

  restart() {
    this.gameRunning = true;
    this.gameOverActive = false;
    this.gameOverCooldown = false;
    this.keysDown = {};
    if (this.gameOverEl) {
      this.gameOverEl.classList.add('hidden');
    }
    this.resetGame();
    this.loop();
    // Show restart message after a brief delay
    setTimeout(() => {
      this.showSnarkyMessage('restart');
    }, 200);
  },

  resetGame() {
    this.donkey.y = this.GROUND_Y - this.donkey.height;
    this.donkey.vy = 0;
    this.donkey.jumping = false;
    this.donkey.grounded = true;
    this.donkey.wasGrounded = true;
    this.donkey.currentJumpCount = 0;
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
    this.maxSpeed = 0;
    this.nearMissCount = 0;
    this.totalJumps = 0;
    this.doubleJumps = 0;
    this.ignoredJumps = 0;
    this.airTime = 0;
    this.runTime = 0;
    this.nearMissScore = 0;
    this.propertyDamageCount = 0;
    this.obstacles = [];
    this.obstacleTimer = 0;
    this.groundX = 0;
    // Reset air-based obstacles
    this.fallingRockActive = false;
    this.jetActive = false;
    this.droneActive = false;
    this.particles = [];
    this.dayNightPhase = 0;
    this.frameCount = 0;
    this.nearMissActive = false;
    this.lastFrameTime = 0; // Reset so first frame after restart gets default deltaTime

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
    // Exit fullscreen if active
    if (this.isFullscreen) {
      this.closeFullscreen();
    }
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

  toggleFullscreen() {
    if (this.isFullscreen) {
      this.closeFullscreen();
    } else {
      this.enterFullscreen();
    }
  },

  enterFullscreen() {
    if (this.isFullscreen) return;
    this.isFullscreen = true;
    this.gamePanel.classList.add('fullscreen');
    document.body.classList.add('donkey-fullscreen');
    this.updateFullscreenScale();
    // Update button icon to "exit fullscreen"
    if (this.fullscreenBtnEl) {
      this.fullscreenBtnEl.textContent = '⛶';
      this.fullscreenBtnEl.title = 'Exit fullscreen';
    }
    // Listen for window resize to recalculate scale
    window.addEventListener('resize', this._resizeHandler || (this._resizeHandler = () => this.updateFullscreenScale()));
  },

  closeFullscreen() {
    if (!this.isFullscreen) return;
    this.isFullscreen = false;
    this.gamePanel.classList.remove('fullscreen');
    document.body.classList.remove('donkey-fullscreen');
    this.gamePanel.style.removeProperty('--fullscreen-scale');
    this.gamePanel.style.removeProperty('transform');
    if (this.fullscreenBtnEl) {
      this.fullscreenBtnEl.textContent = '⛶';
      this.fullscreenBtnEl.title = 'Toggle fullscreen';
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  },

  updateFullscreenScale() {
    if (!this.isFullscreen) return;
    // Use full panel dimensions (including header) for scaling calculation
    const panelWidth = this.gamePanel.offsetWidth;
    const panelHeight = this.gamePanel.offsetHeight;
    const padding = 20; // 10px padding on each side
    const scaleX = (window.innerWidth - padding) / panelWidth;
    const scaleY = (window.innerHeight - padding) / panelHeight;
    this.fullscreenScale = Math.min(scaleX, scaleY);
    this.gamePanel.style.setProperty('--fullscreen-scale', this.fullscreenScale);
    this.gamePanel.style.transform = `scale(${this.fullscreenScale})`;
  },

  loop() {
    if (!this.gameRunning) return;

    try {
      const now = performance.now();
      const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60; // seconds
      this.lastFrameTime = now;

      this.update(deltaTime);
      this.draw();
    } catch (e) {
      console.warn('[donkey-runner] loop error:', e);
      this.gameOver();
      return;
    }

    this.animFrameId = requestAnimationFrame(() => this.loop());
  },

  update(deltaTime) {
    // Decrease jump cooldown timer
    if (this.jumpCooldownTimer > 0) {
      this.jumpCooldownTimer -= deltaTime;
    }

    // Decrease snarky message cooldown
    if (this.messageCooldown > 0) {
      this.messageCooldown -= deltaTime;
    }

    // Accumulate run time (total play time)
    this.runTime += deltaTime;

    // Accumulate air time (only while donkey is not grounded and not stumbling)
    if (!this.donkey.grounded && !this.donkey.stumbling) {
      this.airTime += deltaTime;
    }

    this.speed = Math.min(this.MAX_SPEED, this.speed + this.SPEED_INCREMENT * deltaTime * 60);

    // Keep max speed as float for display accuracy
    if (this.speed > this.maxSpeed) {
      this.maxSpeed = this.speed;
    }

    // Reduce score rate while airborne to 10% of ground rate
    const airborneMultiplier = this.donkey.grounded ? 1.0 : 0.1;
    this.distance += this.speed * 0.01 * deltaTime * 60 * airborneMultiplier;
    this.score = Math.floor(this.distance * 100);

    // Score milestone flash check
    const currentMilestone = Math.floor(this.score / 1000) * 1000;
    if (currentMilestone > this.lastMilestoneScore && this.lastMilestoneScore > 0) {
      this.triggerMilestoneFlash();
      this.showSnarkyMessage('milestone');
      this.lastMilestoneScore = currentMilestone;
    }

    // Update score display
    if (this.scoreEl) {
      this.scoreEl.textContent = String(this.score).padStart(5, '0');
    }

    this.groundX = (this.groundX - this.speed * deltaTime * 60) % 20;

    // Update speed lines visibility based on speed
    if (this.speedLinesEl) {
      if (this.speed > 7) {
        this.speedLinesEl.classList.add('visible');
        this.speedLines.forEach((line, i) => {
          const offset = (this.frameCount * (0.5 + i * 0.15) * deltaTime * 60) % 700;
          line.style.left = `${-offset + (i * 120)}px`;
          line.style.width = `${40 + (this.speed - 7) * 10}px`;
        });
      } else {
        this.speedLinesEl.classList.remove('visible');
      }
    }

    this.dayNightPhase += deltaTime / 60;
    if (this.dayNightPhase > 1) this.dayNightPhase -= 1;

    this.clouds.forEach(cloud => {
      cloud.x -= cloud.speed * (this.speed / this.INITIAL_SPEED) * 0.5 * deltaTime * 60;
      if (cloud.x + cloud.width < 0) {
        cloud.x = 600 + Math.random() * 100;
        cloud.y = 25 + Math.random() * 50;
      }
    });

    this.stars.forEach(star => {
      star.twinkle += deltaTime * 3;
    });

    this.donkey.frameTimer += deltaTime;
    if (this.donkey.frameTimer >= 0.1) {
      this.donkey.frame = (this.donkey.frame + 1) % 4;
      this.donkey.frameTimer = 0;
    }

    if (this.donkey.backflipping) {
      this.donkey.backflipProgress += deltaTime / this.donkey.backflipDuration;
      if (this.donkey.backflipProgress >= 1) {
        this.donkey.backflipping = false;
        this.donkey.backflipProgress = 0;
      }
    }

    this.frameCount++;

    // Stumble state management
    if (this.donkey.stumbling) {
      this.donkey.stumbleTimer += deltaTime;
      this.donkey.stumbleWobble = Math.sin(this.donkey.stumbleTimer * 30) * 0.25;
      if (this.donkey.stumbleTimer >= this.donkey.stumbleDuration) {
        this.donkey.stumbling = false;
        this.donkey.stumbleTimer = 0;
        this.donkey.stumbleWobble = 0;
        // Reschedule next stumble: every 30–60 seconds of gameplay (converted to frames at 60fps)
        this.donkey.stumbleNextTrigger = this.frameCount + this.randomFrameRange(1800, 3600);
      }
    } else if (!this.donkey.backflipping) {
      // Schedule next stumble: every 30–60 seconds of gameplay (converted to frames at 60fps)
      if (this.frameCount >= this.donkey.stumbleNextTrigger) {
        this.donkey.stumbling = true;
        this.donkey.stumbleTimer = 0;
        this.donkey.stumbleNextTrigger = this.frameCount + this.randomFrameRange(1800, 3600);
        this.showSnarkyMessage('stumble');
      }
    }

    if (!this.donkey.grounded) {
      this.donkey.vy += this.GRAVITY * deltaTime * 60;
      this.donkey.y += this.donkey.vy * deltaTime * 60;

      // Ceiling clamp — donkey can't go above CEILING_Y
      if (this.donkey.y < this.CEILING_Y) {
        this.donkey.y = this.CEILING_Y;
        this.donkey.vy = 3; // bounce down (positive = falling)
        // Trigger a short stumble from the impact
        if (!this.donkey.stumbling) {
          this.donkey.stumbling = true;
          this.donkey.stumbleTimer = 0;
          this.donkey.stumbleDuration = 0.8; // short stumble from ceiling impact
          // Spawn ceiling impact particles
          this.spawnCeilingParticles();
          this.playSound('ceiling');
        }
        this.showSnarkyMessage('ceiling');
      }

      if (this.donkey.y >= this.GROUND_Y - this.donkey.height) {
        this.donkey.y = this.GROUND_Y - this.donkey.height;
        this.donkey.vy = 0;
        this.donkey.grounded = true;
        this.donkey.jumping = false;
        // Reset jump count when landed
        this.donkey.currentJumpCount = 0;
        // Reset backflip when landed
        if (this.donkey.backflipping) {
          this.donkey.backflipping = false;
          this.donkey.backflipProgress = 0;
        }
        // Spawn landing dust particles
        if (this.donkey.wasGrounded === false) {
          this.spawnLandingParticles();
        }
        this.showSnarkyMessage('land');
      }
    }
    this.donkey.wasGrounded = this.donkey.grounded;

    this.obstacleTimer += deltaTime * 60;
    const targetInterval = 35 + Math.round(45 * Math.pow((12 - this.speed) / 7, 2));
    if (this.obstacleTimer >= targetInterval) {
      this.spawnObstacle();
      this.obstacleTimer = 0;
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed * deltaTime * 60;

      if (obs.x + obs.width < 0) {
        this.obstacleCounts[obs.type]++;
        this.obstacles.splice(i, 1);
        continue;
      }

      if (this.donkey.grounded || this.donkey.stumbling || this.nearMissActive) {
        // skip: donkey is on ground, stumbling (intentional knock), or already triggered near-miss
      } else {
        const donkeyBottom = this.donkey.y + this.donkey.height;
        const obstacleRight = obs.x + obs.width;
        // Horizontal: donkey's right edge just past obstacle's right edge (within 6px)
        const horizontalDist = (this.donkey.x + this.donkey.width) - obstacleRight;
        if (horizontalDist > 0 && horizontalDist < 6) {
          // Vertical: donkey's bottom just above obstacle's top (within 8px)
          if (donkeyBottom > obs.y - 8 && donkeyBottom < obs.y) {
            // Minimum obstacle height to avoid false positives from small cacti/rocks
            if (obs.height >= 30) {
              this.triggerNearMiss();
              this.showSnarkyMessage('near-miss');
            }
          }
        }
      }

      if (this.checkCollision(obs)) {
        if (this.donkey.stumbling) {
          // Knock aside: remove obstacle, spawn particles
          this.knockObstacle(obs, i);
          this.showSnarkyMessage('property-damage');
        } else {
          // Record the killer obstacle type for the table
          this.gameOverObstacleType = obs.type;
          this.gameOver();
          return;
        }
      }
    }

    // Jet — moves across the screen
    if (this.jetActive) {
      this.jetX -= this.speed * deltaTime * 60;
      if (this.jetX + this.jetWidth < 0) {
        this.obstacleCounts['jet']++;
        this.jetActive = false;
      } else {
        if (this.checkAirCollision('jet')) {
          this.gameOverObstacleType = 'jet';
          this.gameOver();
          return;
        }
        if (this.jetX > 600 - this.jetWidth - 30) {
          this.showSnarkyMessage('jet');
        }
      }
    }

    if (this.fallingRockActive) {
      this.fallingRockY += this.fallingRockFallSpeed * deltaTime * 60;
      if (this.fallingRockY + this.fallingRockHeight >= this.GROUND_Y) {
        this.obstacleCounts['falling-rock']++;
        this.fallingRockActive = false;
        this.spawnFallingRockLandingParticles(this.fallingRockX + this.fallingRockWidth / 2, this.GROUND_Y);
      } else {
        if (this.checkAirCollision('falling-rock')) {
          this.gameOverObstacleType = 'falling-rock';
          this.gameOver();
          return;
        }
        if (this.fallingRockY < -5) {
          this.showSnarkyMessage('falling-rock');
        }
      }
    }

    if (this.droneActive) {
      this.droneX -= this.speed * deltaTime * 60;
      this.droneWavePhase += deltaTime * 3;
      this.droneY += this.droneDir * deltaTime * 60 * 0.5;
      if (this.droneWavePhase >= Math.PI * 2) {
        this.droneWavePhase -= Math.PI * 2;
        this.droneDir *= -1;
      }
      if (this.droneX + this.droneWidth < 0) {
        this.obstacleCounts['drone']++;
        this.droneActive = false;
      } else {
        if (this.checkAirCollision('drone')) {
          if (this.donkey.stumbling) {
            this.knockDrone();
          } else {
            this.gameOverObstacleType = 'drone';
            this.gameOver();
            return;
          }
        }
        if (this.droneX > 600 - this.droneWidth - 30) {
          this.showSnarkyMessage('drone');
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime * 60;
      p.y += p.vy * deltaTime * 60;
      p.vy += 0.15 * deltaTime * 60; // gravity
      p.life -= deltaTime;
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
    // Track obstacle count (donkey survived the knock)
    this.obstacleCounts[obs.type]++;

    // Remove obstacle
    this.obstacles.splice(index, 1);

    // Spawn particles from obstacle position with obstacle-type-specific colors
    this.spawnKnockParticles(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.type);
    this.playSound('knock');

    // Add +100 bonus points for property damage
    this.propertyDamageCount++;
    const bonusScore = 100;
    this.score += bonusScore;

    // Show +100 bonus text animation at obstacle position
    const bonusX = obs.x + obs.width / 2;
    const bonusY = obs.y - 5;
    this.showPropertyDamageBonus(bonusX, bonusY);

    // Check for score milestone after bonus
    const currentMilestone = Math.floor(this.score / 1000) * 1000;
    if (currentMilestone > this.lastMilestoneScore && this.lastMilestoneScore > 0) {
      this.triggerMilestoneFlash();
      this.lastMilestoneScore = currentMilestone;
    }
  },

  // Show +100 bonus text animation at a specific position for property damage
  showPropertyDamageBonus(x, y) {
    const playArea = this.gamePanel ? this.gamePanel.querySelector('.donkey-play-area') : null;
    if (!playArea) return;

    // Remove any existing bonus element first
    const existing = playArea.querySelector('.property-damage-bonus');
    if (existing) {
      playArea.removeChild(existing);
    }

    const el = document.createElement('div');
    el.className = 'property-damage-bonus';
    el.textContent = '+100';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    playArea.appendChild(el);

    // Trigger animation
    void el.offsetWidth;
    el.classList.add('active');

    // Remove element after animation
    setTimeout(() => {
      if (el.parentNode) {
        playArea.removeChild(el);
      }
    }, 1200);
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

  // Spawn particles when donkey lands (after a double-jump or regular jump)
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

  spawnDoubleJumpParticles() {
    const buttX = this.donkey.x + 6;
    const buttY = this.donkey.y + 26;

    // Particles shoot backward and downward from donkey's rear
    const coneCenter = Math.PI + Math.PI / 18;  // ~190° (left + slightly down)
    const coneSpread = Math.PI * 0.44;           // ±40° spread

    for (let i = 0; i < 12; i++) {
      const angle = coneCenter + (Math.random() - 0.5) * coneSpread;
      const speed = 0.5 + Math.random() * 3;
      const vyBias = 0.5;
      this.particles.push({
        x: buttX + (Math.random() - 0.5) * 8,
        y: buttY + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + vyBias,
        size: 1.5 + Math.random() * 3,
        color: ['#7a8a3a', '#5a6a2a', '#6a7a4a', '#8a9a5a'][Math.floor(Math.random() * 4)],
        life: 0.3 + Math.random() * 0.5,
      });
    }
  },

  // Spawn particles when donkey hits the ceiling
  spawnCeilingParticles() {
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI; // spread upward from ceiling
      const speed = 0.5 + Math.random() * 2;
      this.particles.push({
        x: this.donkey.x + 20 + (Math.random() - 0.5) * 20,
        y: this.CEILING_Y + this.donkey.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        size: 1.5 + Math.random() * 2,
        color: ['#888888', '#aaa', '#666', '#999'][Math.floor(Math.random() * 4)],
        life: 0.2 + Math.random() * 0.3,
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
      this.bonusTextEl.textContent = '+50';
      this.bonusTextEl.classList.remove('flash');
      void this.bonusTextEl.offsetWidth;
      this.bonusTextEl.classList.add('flash');
      setTimeout(() => this.bonusTextEl.classList.remove('flash'), 700);
    }

    // Add bonus score
    this.score += 50;

    // Track score breakdown
    this.nearMissScore += 50;

    this.nearMissCount++;
    this.playSound('nearmiss');

    // Reset near-miss flag after delay
    setTimeout(() => {
      this.nearMissActive = false;
    }, NEAR_MISS_COOLDOWN);
  },

  triggerMilestoneFlash() {
    if (this.scoreEl) {
      this.scoreEl.classList.add('milestone-flash');
      setTimeout(() => {
        this.scoreEl.classList.remove('milestone-flash');
      }, 300);
    }
  },

  // Show a snarky message for a given event type
  showSnarkyMessage(eventType) {
    if (this.messageCooldown > 0) return; // still cooling down

    const messages = this.snarkyMessages[eventType];
    if (!messages || messages.length === 0) return;

    // Get next message (cycle through without repeating)
    if (!this.messageIndex[eventType]) this.messageIndex[eventType] = 0;
    this.messageIndex[eventType] = (this.messageIndex[eventType] + 1) % messages.length;

    const messageEl = this.snarkyMessageEl;
    if (!messageEl) return;

    messageEl.textContent = messages[this.messageIndex[eventType]];

    // Determine color variant based on event type
    messageEl.className = 'donkey-snarky-message'; // reset
    if (eventType === 'near-miss' || eventType === 'milestone') {
      messageEl.classList.add('snarky-green');
    } else if (eventType === 'game-over') {
      messageEl.classList.add('snarky-red');
    } else if (eventType === 'high-score') {
      messageEl.classList.add('snarky-yellow');
    } else if (eventType === 'jump' || eventType === 'double-jump' || eventType === 'ignored-jump') {
      messageEl.classList.add('snarky-blue');
    } else {
      messageEl.classList.add('snarky-orange');
    }

    // Trigger animation
    void messageEl.offsetWidth;
    messageEl.classList.add('active');

    // Set cooldown
    this.messageCooldown = 3; // 3 seconds cooldown

    // Remove after display
    setTimeout(() => {
      messageEl.classList.remove('active');
    }, 2000);
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

    // Air-based obstacles — spawn at higher speeds, more frequently
    if (this.speed > 7 && Math.random() < 0.15) {
      this.spawnJet();
    }
    if (this.speed > 6 && Math.random() < 0.1) {
      this.spawnFallingRock();
    }
    if (this.speed > 8 && Math.random() < 0.08) {
      this.spawnDrone();
    }
  },

  // Spawn a flying jet — fatal even during stumble
  spawnJet() {
    // Jet flies at mid-air height, donkey must duck under or jump over
    const jetHeight = 20;
    const jetWidth = 35;
    const jetY = this.GROUND_Y - 35 - Math.random() * 20; // ~35-55px above ground (donkey can jump under it)
    this.jetActive = true;
    this.jetY = jetY;
    this.jetWidth = jetWidth;
    this.jetHeight = jetHeight;
    this.jetX = 620;
  },

  // Spawn a falling rock — gives time to dodge
  spawnFallingRock() {
    this.fallingRockActive = true;
    this.fallingRockX = 200 + Math.random() * 300; // random x position
    this.fallingRockY = -20; // start above screen
    this.fallingRockWidth = 14 + Math.random() * 8;
    this.fallingRockHeight = 10 + Math.random() * 5;
    this.fallingRockFallSpeed = 2 + this.speed * 0.3; // faster at higher speeds
  },

  // Spawn a hovering drone — moves in a wave pattern
  spawnDrone() {
    this.droneActive = true;
    this.droneX = 620;
    this.droneY = this.GROUND_Y - 50 - Math.random() * 30;
    this.droneWidth = 18;
    this.droneHeight = 12;
    this.droneDir = 1;
    this.droneWavePhase = 0;
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

  // Check collision with air-based obstacles
  checkAirCollision(type) {
    const dx = this.donkey.x + 8;
    const dy = this.donkey.y + 4;
    const dw = this.donkey.width - 16;
    const dh = this.donkey.height - 8;

    let ox, oy, ow, oh;
    switch (type) {
      case 'jet':
        ox = this.jetX;
        oy = this.jetY;
        ow = this.jetWidth;
        oh = this.jetHeight;
        break;
      case 'falling-rock':
        ox = this.fallingRockX;
        oy = this.fallingRockY;
        ow = this.fallingRockWidth;
        oh = this.fallingRockHeight;
        break;
      case 'drone':
        ox = this.droneX;
        oy = this.droneY;
        ow = this.droneWidth;
        oh = this.droneHeight;
        break;
      default:
        return false;
    }

    const padding = 4;
    return (
      dx + dw > ox + padding &&
      dx < ox + ow - padding &&
      dy + dh > oy + padding &&
      dy < oy + oh - padding
    );
  },

  // Knock aside the drone during stumble
  knockDrone() {
    // Track obstacle count (donkey survived the knock)
    this.obstacleCounts['drone']++;
    // Remove drone
    this.droneActive = false;
    // Spawn particles from drone position
    this.spawnKnockParticles(this.droneX + this.droneWidth / 2, this.droneY + this.droneHeight / 2, 'drone');
    this.playSound('knock');
    // Add +100 bonus points for property damage
    this.propertyDamageCount++;
    const bonusScore = 100;
    this.score += bonusScore;
    // Show +100 bonus text animation at drone position
    const bonusX = this.droneX + this.droneWidth / 2;
    const bonusY = this.droneY - 5;
    this.showPropertyDamageBonus(bonusX, bonusY);
    // Check for score milestone after bonus
    const currentMilestone = Math.floor(this.score / 1000) * 1000;
    if (currentMilestone > this.lastMilestoneScore && this.lastMilestoneScore > 0) {
      this.triggerMilestoneFlash();
      this.lastMilestoneScore = currentMilestone;
    }
  },

  // Spawn dust particles when falling rock hits the ground
  spawnFallingRockLandingParticles(px, py) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI; // spread left and right
      const speed = 0.5 + Math.random() * 2;
      this.particles.push({
        x: px + (Math.random() - 0.5) * 10,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: -0.5 - Math.random() * 1.5,
        size: 2 + Math.random() * 3,
        color: '#6B6B6B',
        life: 0.3 + Math.random() * 0.4,
      });
    }
  },

  gameOver() {
    this.gameRunning = false;
    this.gameOverActive = true;

    // Play game over sound
    this.playSound('gameover');

    // Update high score
    const isNewHighScore = this.score > this.highScore;
    if (isNewHighScore) {
      this.highScore = this.score;
      localStorage.setItem('hasW_donkeyHighScore', this.highScore);
      if (this.highScoreEl) {
        this.highScoreEl.textContent = `HI ${String(this.highScore).padStart(5, '0')}`;
      }
    }

    // Show game over screen with score breakdown and stats
    if (this.gameOverEl) {
      // Show new high score badge if applicable
      const newBadgeEl = document.getElementById('donkey-gameover-new');
      if (newBadgeEl) {
        if (isNewHighScore) {
          const newScoreEl = document.getElementById('donkey-gameover-new-score');
          if (newScoreEl) {
            newScoreEl.textContent = String(this.highScore).padStart(5, '0');
          }
          newBadgeEl.classList.remove('hidden');
        } else {
          newBadgeEl.classList.add('hidden');
        }
      }

      // Populate obstacle count table
      const obstacleTableEl = document.getElementById('donkey-gameover-obstacle-table');
      if (obstacleTableEl) {
        obstacleTableEl.innerHTML = '';
        const obstacleLabels = {
          'cactus-small': 'Cactus',
          'cactus-large': 'L.Cactus',
          'rock': 'Rock',
          'car': 'Car',
          'jet': 'Jet',
          'falling-rock': 'F.Rock',
          'drone': 'Drone',
        };
        // Inline SVG icons for each obstacle type
        const obstacleIcons = {
          'cactus-small': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="11" y="4" width="6" height="20" rx="2" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="4" y="8" width="8" height="3" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="4" y="5" width="3" height="8" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="16" y="12" width="8" height="3" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="21" y="9" width="3" height="8" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
          </svg>`,
          'cactus-large': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="3" width="8" height="22" rx="2" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="2" y="8" width="10" height="3.5" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="2" y="4.5" width="3" height="10" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="16" y="12" width="10" height="3.5" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
            <rect x="23" y="9" width="3" height="10" rx="1.5" fill="#2D5A27" stroke="#1A3A16" stroke-width="0.5"/>
          </svg>`,
          'rock': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 4 L24 10 L22 24 L6 24 L4 10 Z" fill="#6B6B6B" stroke="#4A4A4A" stroke-width="0.5"/>
            <path d="M14 4 L24 10 L22 24 L6 24 L4 10 Z" fill="rgba(255,255,255,0.1)"/>
          </svg>`,
          'car': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="13" width="22" height="10" rx="2" fill="#D44" stroke="#A33" stroke-width="0.5"/>
            <rect x="7" y="7" width="14" height="8" rx="2" fill="#C33" stroke="#A33" stroke-width="0.5"/>
            <rect x="9" y="9" width="6" height="4" rx="1" fill="rgba(150,200,255,0.4)"/>
            <rect x="17" y="9" width="4" height="4" rx="1" fill="rgba(150,200,255,0.4)"/>
            <circle cx="8" cy="25" r="3" fill="#222"/>
            <circle cx="20" cy="25" r="3" fill="#222"/>
          </svg>`,
          'jet': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 14 L18 11 L18 10 L8 10 L4 14 L8 18 L18 18 L18 17 L24 14Z" fill="#555" stroke="#333" stroke-width="0.5"/>
            <path d="M18 11 L15 7 L18 10Z" fill="#666"/>
            <path d="M18 17 L15 21 L18 18Z" fill="#666"/>
            <path d="M8 10 L6 6 L8 10Z" fill="#555"/>
            <path d="M8 18 L6 22 L8 18Z" fill="#555"/>
            <ellipse cx="13" cy="14" rx="2" ry="1.5" fill="rgba(150,200,255,0.5)"/>
          </svg>`,
          'falling-rock': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 4 L18 4 L22 10 L16 24 L8 24 L4 10 Z" fill="#6B6B6B" stroke="#4A4A4A" stroke-width="0.5"/>
            <text x="14" y="18" text-anchor="middle" fill="#e8a838" font-size="8" font-weight="bold">!</text>
          </svg>`,
          'drone': `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="11" width="12" height="6" rx="3" fill="#444" stroke="#333" stroke-width="0.5"/>
            <circle cx="14" cy="14" r="3" fill="#555" stroke="#333" stroke-width="0.5"/>
            <line x1="10" y1="11" x2="10" y2="4" stroke="#555" stroke-width="0.5"/>
            <line x1="18" y1="17" x2="18" y2="24" stroke="#555" stroke-width="0.5"/>
            <circle cx="10" cy="4" r="2" fill="#666"/>
            <circle cx="18" cy="24" r="2" fill="#666"/>
            <circle cx="14" cy="14" r="1" fill="#e8a838"/>
          </svg>`,
        };
        for (const [type, label] of Object.entries(obstacleLabels)) {
          const itemEl = document.createElement('div');
          itemEl.className = 'obstacle-count-item';
          // Add red highlight if this was the obstacle that killed the donkey
          if (type === this.gameOverObstacleType) {
            itemEl.classList.add('obstacle-kill-highlight');
          }
          // Add obstacle icon
          const iconEl = document.createElement('span');
          iconEl.className = 'obstacle-count-icon';
          iconEl.innerHTML = obstacleIcons[type] || '';
          itemEl.appendChild(iconEl);
          const labelEl = document.createElement('span');
          labelEl.className = 'obstacle-count-label';
          labelEl.textContent = label;
          const valueEl = document.createElement('span');
          valueEl.className = 'obstacle-count-value';
          valueEl.textContent = String(this.obstacleCounts[type]);
          itemEl.appendChild(labelEl);
          itemEl.appendChild(valueEl);
          obstacleTableEl.appendChild(itemEl);
        }
      }

      // Populate time-based stats (bottom-left)
      const runtimeDisplay = document.getElementById('donkey-gameover-runtime');
      if (runtimeDisplay) {
        const minutes = Math.floor(this.runTime / 60);
        const seconds = Math.floor(this.runTime % 60);
        runtimeDisplay.textContent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }
      const airTimeDisplay = document.getElementById('donkey-gameover-airtime');
      if (airTimeDisplay) {
        const minutes = Math.floor(this.airTime / 60);
        const seconds = Math.floor(this.airTime % 60);
        airTimeDisplay.textContent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }
      const airPercentDisplay = document.getElementById('donkey-gameover-airpercent');
      if (airPercentDisplay) {
        const airPercent = this.runTime > 0 ? Math.round((this.airTime / this.runTime) * 100) : 0;
        airPercentDisplay.textContent = `${airPercent}%`;
      }
      // Populate jump-based stats (bottom-right)
      const totalJumpsDisplay = document.getElementById('donkey-gameover-totaljumps');
      if (totalJumpsDisplay) {
        totalJumpsDisplay.textContent = this.totalJumps;
      }
      const doubleJumpsDisplay = document.getElementById('donkey-gameover-doublejumps');
      if (doubleJumpsDisplay) {
        doubleJumpsDisplay.textContent = this.doubleJumps;
      }
      const ignoredJumpsDisplay = document.getElementById('donkey-gameover-ignoredjumps');
      if (ignoredJumpsDisplay) {
        ignoredJumpsDisplay.textContent = this.ignoredJumps;
      }
      // Populate side stats (middle edges)
      const distanceDisplay = document.getElementById('donkey-gameover-distance');
      if (distanceDisplay) {
        distanceDisplay.textContent = `${this.distance.toFixed(1)}km`;
      }
      const maxSpeedDisplay = document.getElementById('donkey-gameover-maxspeed');
      if (maxSpeedDisplay) {
        maxSpeedDisplay.textContent = this.maxSpeed.toFixed(1);
      }
      const nearMissesDisplay = document.getElementById('donkey-gameover-nearmisses');
      if (nearMissesDisplay) {
        nearMissesDisplay.textContent = this.nearMissCount;
      }
      // Populate property damage stat (top-left, now 4 items)
      const propertyDamageDisplay = document.getElementById('donkey-gameover-property-damage');
      if (propertyDamageDisplay) {
        propertyDamageDisplay.textContent = String(this.propertyDamageCount);
      }
      this.gameOverEl.classList.remove('hidden');
    }

    // Flash the canvas briefly
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 80, 60, 0.25)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    setTimeout(() => { this.draw(); }, 100);

    // Set restart cooldown — prevents held-key instant restart (300ms cooldown for all input methods)
    this.restartCooldown = true;
    setTimeout(() => {
      this.restartCooldown = false;
    }, 300);

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

    // Air-based obstacles
    if (this.jetActive) this.drawJet(ctx);
    if (this.fallingRockActive) this.drawFallingRock(ctx);
    if (this.droneActive) this.drawDrone(ctx);

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

  // Draw a flying jet — fatal even during stumble
  drawJet(ctx) {
    const x = this.jetX;
    const y = this.jetY;
    const w = this.jetWidth;
    const h = this.jetHeight;

    // Jet body (pointing right, flying left)
    ctx.fillStyle = '#555';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Main body (pointed nose facing left)
    ctx.beginPath();
    ctx.moveTo(x - 5, y + h / 2); // nose tip
    ctx.lineTo(x, y + h * 0.2);
    ctx.lineTo(x + w, y + h * 0.2);
    ctx.lineTo(x + w, y + h * 0.8);
    ctx.lineTo(x, y + h * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nose cone
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(x - 5, y + h / 2);
    ctx.lineTo(x + 3, y + h * 0.35);
    ctx.lineTo(x + 3, y + h * 0.65);
    ctx.closePath();
    ctx.fill();

    // Wings
    ctx.fillStyle = '#666';
    // Top wing
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.15);
    ctx.lineTo(x + w * 0.5, y - 3);
    ctx.lineTo(x + w * 0.7, y + h * 0.15);
    ctx.closePath();
    ctx.fill();
    // Bottom wing
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.85);
    ctx.lineTo(x + w * 0.5, y + h + 3);
    ctx.lineTo(x + w * 0.7, y + h * 0.85);
    ctx.closePath();
    ctx.fill();

    // Tail fins
    ctx.fillStyle = '#555';
    // Top tail fin
    ctx.beginPath();
    ctx.moveTo(x + w * 0.85, y + h * 0.2);
    ctx.lineTo(x + w + 4, y - 1);
    ctx.lineTo(x + w + 4, y + h * 0.3);
    ctx.closePath();
    ctx.fill();
    // Bottom tail fin
    ctx.beginPath();
    ctx.moveTo(x + w * 0.85, y + h * 0.8);
    ctx.lineTo(x + w + 4, y + h + 1);
    ctx.lineTo(x + w + 4, y + h * 0.7);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = 'rgba(150, 200, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.15, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine glow
    ctx.fillStyle = 'rgba(255, 150, 50, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w + 2, y + h * 0.5, 4, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  // Draw a falling rock
  drawFallingRock(ctx) {
    const x = this.fallingRockX;
    const y = this.fallingRockY;
    const w = this.fallingRockWidth;
    const h = this.fallingRockHeight;

    // Dark warning glow around rock
    ctx.fillStyle = 'rgba(255, 50, 30, 0.15)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w + 6, h + 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rock body
    ctx.fillStyle = '#6B6B6B';
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + w - 2, y + 1);
    ctx.lineTo(x + w, y + h - 2);
    ctx.lineTo(x + 1, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 3, h / 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Warning symbol
    ctx.fillStyle = '#e8a838';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!', x + w / 2, y + h / 2 + 4);
  },

  // Draw a hovering drone
  drawDrone(ctx) {
    const x = this.droneX;
    const y = this.droneY;
    const w = this.droneWidth;
    const h = this.droneHeight;

    // Drone body
    ctx.fillStyle = '#444';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Main body
    ctx.beginPath();
    ctx.roundRect(x + 2, y + h * 0.3, w - 4, h * 0.4, 2);
    ctx.fill();
    ctx.stroke();

    // Central hub
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, h * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Propeller arms
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    // Top arm
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + h * 0.3);
    ctx.lineTo(x + w * 0.35, y);
    ctx.stroke();
    // Bottom arm
    ctx.beginPath();
    ctx.moveTo(x + w * 0.65, y + h * 0.7);
    ctx.lineTo(x + w * 0.65, y + h);
    ctx.stroke();

    // Spinning propellers
    const propAngle = this.droneWavePhase * 2;
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
    ctx.lineWidth = 0.5;
    // Top propeller
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35 + Math.cos(propAngle) * 6, y - 2);
    ctx.lineTo(x + w * 0.35 - Math.cos(propAngle) * 6, y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35 + Math.sin(propAngle) * 6, y - 2);
    ctx.lineTo(x + w * 0.35 - Math.sin(propAngle) * 6, y - 2);
    ctx.stroke();
    // Bottom propeller
    ctx.beginPath();
    ctx.moveTo(x + w * 0.65 + Math.cos(propAngle) * 6, y + h + 2);
    ctx.lineTo(x + w * 0.65 - Math.cos(propAngle) * 6, y + h + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.65 + Math.sin(propAngle) * 6, y + h + 2);
    ctx.lineTo(x + w * 0.65 - Math.sin(propAngle) * 6, y + h + 2);
    ctx.stroke();

    // Propeller centers
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(x + w * 0.35, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.65, y + h, 2, 0, Math.PI * 2);
    ctx.fill();

    // Red light
    const lightAlpha = 0.5 + Math.sin(propAngle * 2) * 0.3;
    ctx.fillStyle = `rgba(255, 50, 50, ${lightAlpha})`;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.3, 1.5, 0, Math.PI * 2);
    ctx.fill();
  },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  DONKEY_RUNNER.init();
});
