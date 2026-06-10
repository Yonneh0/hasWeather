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
    frame: 0,
    frameTimer: 0,
  },

  // Game state
  speed: 5,
  score: 0,
  distance: 0,

  // Obstacles
  obstacles: [],
  obstacleTimer: 0,
  obstacleInterval: 90,

  // Ground
  groundX: 0,
  groundSegments: [],

  // Clouds (background decoration)
  clouds: [],

  // Stars (background decoration)
  stars: [],

  // DOM elements
  scoreEl: null,
  highScoreEl: null,
  instructionsEl: null,
  gameOverEl: null,

  // Input
  keys: {},

  init() {
    this.highScore = parseInt(localStorage.getItem('hasW_donkeyHighScore') || '0', 10);

    // Create game panel
    this.createPanel();
    this.bindInput();

    // Start paused with instructions visible
    this.gameStarted = false;
    this.gameRunning = false;
    this.resetGame();
    this.drawIdle();
  },

  createPanel() {
    // Create panel
    this.gamePanel = document.createElement('div');
    this.gamePanel.id = 'donkey-runner-panel';
    this.gamePanel.className = 'donkey-panel';
    this.gamePanel.innerHTML = `
      <div class="donkey-panel-header">
        <button class="donkey-minimize-btn" title="Minimize game">─</button>
        <span class="donkey-panel-title">🦓 Donkey Runner</span>
        <button class="donkey-close-btn" title="Close game">✕</button>
      </div>
      <div class="donkey-panel-body">
        <div class="donkey-score-bar">
          <span class="donkey-score" id="donkey-score">00000</span>
          <span class="donkey-highscore" id="donkey-highscore">HI ${String(this.highScore).padStart(5, '0')}</span>
        </div>
        <canvas id="donkey-canvas" width="600" height="180"></canvas>
        <div class="donkey-instructions" id="donkey-instructions">
          Press SPACE or tap to start & jump
        </div>
        <div class="donkey-gameover hidden" id="donkey-gameover">
          <span class="donkey-gameover-text">GAME OVER</span>
          <span class="donkey-restart-text">Press SPACE or tap to restart</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.gamePanel);
    this.gamePanel.classList.add('donkey-visible');

    // Set up canvas
    this.canvas = document.getElementById('donkey-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.GROUND_Y = this.canvas.height - 20;

    // Score elements
    this.scoreEl = document.getElementById('donkey-score');
    this.highScoreEl = document.getElementById('donkey-highscore');
    this.instructionsEl = document.getElementById('donkey-instructions');
    this.gameOverEl = document.getElementById('donkey-gameover');

    // Button handlers
    this.gamePanel.querySelector('.donkey-close-btn').addEventListener('click', () => this.close());
    this.gamePanel.querySelector('.donkey-minimize-btn').addEventListener('click', () => this.minimize());

    // Canvas click/tap
    this.canvas.addEventListener('click', () => this.handleInput());
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(); });

    // Generate stars
    this.generateStars();
    this.generateClouds();

    // Initial draw
    this.drawIdle();
  },

  generateStars() {
    this.stars = [];
    for (let i = 0; i < 20; i++) {
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
    for (let i = 0; i < 3; i++) {
      this.clouds.push({
        x: Math.random() * 600,
        y: 30 + Math.random() * 40,
        width: 40 + Math.random() * 30,
        speed: 0.3 + Math.random() * 0.5,
      });
    }
  },

  bindInput() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        // Only if game panel is visible and not minimized
        if (this.gamePanel && !this.gamePanel.classList.contains('donkey-hidden')) {
          e.preventDefault();
          this.handleInput();
        }
      }
    });
  },

  handleInput() {
    if (!this.gameStarted) {
      this.start();
    } else if (!this.gameRunning) {
      this.restart();
    } else if (this.donkey.grounded) {
      this.donkey.vy = this.JUMP_FORCE;
      this.donkey.jumping = true;
      this.donkey.grounded = false;
    }
  },

  start() {
    this.gameStarted = true;
    this.gameRunning = true;
    this.instructionsEl.classList.add('hidden');
    this.gameOverEl.classList.add('hidden');
    this.resetGame();
    this.loop();
  },

  autoStart() {
    // Called on initial load - starts game without instructions
    this.gameStarted = true;
    this.gameRunning = true;
    this.instructionsEl.classList.add('hidden');
    this.gameOverEl.classList.add('hidden');
    this.resetGame();
    this.loop();
  },

  restart() {
    this.gameRunning = true;
    this.gameOverEl.classList.add('hidden');
    this.resetGame();
    this.loop();
  },

  resetGame() {
    this.donkey.y = this.GROUND_Y - this.donkey.height;
    this.donkey.vy = 0;
    this.donkey.jumping = false;
    this.donkey.grounded = true;
    this.donkey.frame = 0;
    this.speed = this.INITIAL_SPEED;
    this.score = 0;
    this.distance = 0;
    this.obstacles = [];
    this.obstacleTimer = 0;
    this.groundX = 0;
  },

  close() {
    this.stop();
    this.gamePanel.classList.remove('donkey-visible');
    this.gamePanel.classList.add('donkey-hidden');
    // Notify network monitor to move outage panel down
    if (typeof adjustOutagePosition === 'function') adjustOutagePosition();
  },

  minimize() {
    this.stop();
    this.gamePanel.classList.remove('donkey-visible');
    this.gamePanel.classList.add('donkey-minimized');
    // Notify network monitor to move outage panel down
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
      // Start the game when reopening
      this.gameStarted = true;
      this.gameRunning = true;
      this.instructionsEl.classList.add('hidden');
      this.gameOverEl.classList.add('hidden');
      this.resetGame();
      this.loop();
      // Notify network monitor to move outage panel down
      if (typeof adjustOutagePosition === 'function') adjustOutagePosition();
    }
  },

  loop() {
    if (!this.gameRunning) return;

    this.update();
    this.draw();
    this.animFrameId = requestAnimationFrame(() => this.loop());
  },

  update() {
    // Increase speed over time
    this.speed = Math.min(this.MAX_SPEED, this.speed + this.SPEED_INCREMENT);

    // Update score
    this.distance += this.speed * 0.01;
    this.score = Math.floor(this.distance * 100);
    if (this.scoreEl) {
      this.scoreEl.textContent = String(this.score).padStart(5, '0');
    }

    // Update ground
    this.groundX = (this.groundX - this.speed) % 20;

    // Update clouds
    this.clouds.forEach(cloud => {
      cloud.x -= cloud.speed;
      if (cloud.x + cloud.width < 0) {
        cloud.x = 600 + Math.random() * 100;
        cloud.y = 30 + Math.random() * 40;
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

    // Donkey physics
    if (!this.donkey.grounded) {
      this.donkey.vy += this.GRAVITY;
      this.donkey.y += this.donkey.vy;

      if (this.donkey.y >= this.GROUND_Y - this.donkey.height) {
        this.donkey.y = this.GROUND_Y - this.donkey.height;
        this.donkey.vy = 0;
        this.donkey.grounded = true;
        this.donkey.jumping = false;
      }
    }

    // Spawn obstacles
    this.obstacleTimer++;
    if (this.obstacleTimer >= this.obstacleInterval) {
      this.spawnObstacle();
      this.obstacleTimer = 0;
      // Vary interval based on speed
      this.obstacleInterval = Math.max(40, 90 - this.speed * 3 + Math.random() * 30);
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

      // Collision detection
      if (this.checkCollision(obs)) {
        this.gameOver();
        return;
      }
    }
  },

  spawnObstacle() {
    const types = ['cactus-small', 'cactus-large', 'rock', 'car'];
    const weights = [0.35, 0.25, 0.25, 0.15];

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

    // Shrink hitbox slightly for fairness
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

    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('hasW_donkeyHighScore', this.highScore);
      if (this.highScoreEl) {
        this.highScoreEl.textContent = `HI ${String(this.highScore).padStart(5, '0')}`;
      }
    }

    // Show game over screen
    if (this.gameOverEl) {
      this.gameOverEl.classList.remove('hidden');
    }

    // Draw one final frame with collision flash
    this.draw();
  },

  drawIdle() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
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

    // Draw idle donkey
    this.drawDonkey(ctx, this.donkey.x, this.GROUND_Y - this.donkey.height, 0);

    // Instructions
    if (this.instructionsEl) {
      this.instructionsEl.classList.remove('hidden');
    }
  },

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(20, 25, 40, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Stars
    this.stars.forEach(star => {
      const alpha = 0.3 + Math.sin(star.twinkle) * 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Clouds
    this.clouds.forEach(cloud => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.width / 2, cloud.y, cloud.width / 2, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.width * 0.3, cloud.y - 5, cloud.width * 0.3, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ground
    this.drawGround(ctx);

    // Obstacles
    this.obstacles.forEach(obs => this.drawObstacle(ctx, obs));

    // Donkey
    this.drawDonkey(ctx, this.donkey.x, this.donkey.y, this.donkey.frame);
  },

  drawGround(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    // Main ground line
    ctx.beginPath();
    ctx.moveTo(0, this.GROUND_Y);
    ctx.lineTo(this.canvas.width, this.GROUND_Y);
    ctx.stroke();

    // Ground texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = this.groundX; x < this.canvas.width; x += 20) {
      ctx.fillRect(x, this.GROUND_Y + 3, 8, 1);
    }
    for (let x = this.groundX + 10; x < this.canvas.width; x += 25) {
      ctx.fillRect(x, this.GROUND_Y + 8, 5, 1);
    }
  },

  drawDonkey(ctx, x, y, frame) {
    ctx.save();

    // Donkey body colors
    const bodyColor = '#8B7355';
    const darkColor = '#6B5B45';
    const maneColor = '#4A3A2A';
    const eyeColor = '#1a1a2e';
    const noseColor = '#9B8B75';
    const hoovesColor = '#3A2A1A';

    const scale = 1.2;

    ctx.translate(x + this.donkey.width / 2, y + this.donkey.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(this.donkey.width / 2), -(this.donkey.height / 2));

    // Tail
    ctx.strokeStyle = maneColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 14);
    ctx.quadraticCurveTo(-4, 18, -2, 26);
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

    legOffsets.forEach((leg, i) => {
      const legX = leg.x;
      const legFrame = leg.frame % 4;
      const legOffset = this.donkey.grounded ? Math.sin(legFrame * Math.PI / 2) * 3 : (i < 2 ? -2 : 2);

      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(legX, 30);
      ctx.lineTo(legX + legOffset, 42);
      ctx.stroke();

      // Hoof
      ctx.fillStyle = hoovesColor;
      ctx.beginPath();
      ctx.arc(legX + legOffset, 42, 2, 0, Math.PI * 2);
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

    // Eye
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

    // Nostril
    ctx.fillStyle = noseColor;
    ctx.beginPath();
    ctx.arc(39, 9, 1, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(37, 12);
    ctx.quadraticCurveTo(39, 13, 40, 12);
    ctx.stroke();

    // White muzzle stripe
    ctx.fillStyle = 'rgba(210, 190, 170, 0.5)';
    ctx.beginPath();
    ctx.ellipse(37, 10, 4, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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

    // Main body
    const cx = obs.x + obs.width / 2;
    ctx.beginPath();
    ctx.roundRect(obs.x + 2, obs.y, obs.width - 4, obs.height, 3);
    ctx.fill();
    ctx.stroke();

    // Arms for larger cacti
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

    // Highlight
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