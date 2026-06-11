// ===== NETWORK MONITOR =====
const OUTAGE_MESSAGES = [
  "🦓 The network has left the building.",
  "🌐 DNS said 'I don't know that one.'",
  "📡 Signal lost. Last known location: confusion.",
  "🔌 Even the cables are on strike.",
  "🤖 Error 418: I'm a teapot (but not a fun one).",
  "📶 The internet went to get a snack.",
  "🏜️ Nothing but digital silence and crickets.",
  "🦥 The packet snail is still en route.",
  "🌋 Your data got swallowed by a volcano.",
  "👽 Aliens intercepted your WiFi signal.",
  "🧊 Your connection froze. Literally.",
  "🎪 The router joined a circus. No return date.",
];

const RETRY_DELAYS = [2000, 4000, 8000, 15000];
let _outagePanel = null;
let _retryInterval = null;
let _outageVisible = false;
let _pendingRunFn = null;
let _donkeyAutoOpened = false;

// ===== PANEL =====
function createOutagePanel() {
  if (_outagePanel) return _outagePanel;

  const panel = document.createElement('div');
  panel.id = 'outage-panel';
  panel.className = 'outage-panel';
  panel.innerHTML = `
    <div class="outage-glass">
      <div class="outage-header">
        <div class="outage-donkey-icon">
          <svg viewBox="0 0 64 64" class="outage-donkey-svg">
            <ellipse cx="32" cy="28" rx="14" ry="12" class="donkey-head" />
            <line x1="22" y1="18" x2="18" y2="6" class="donkey-ear" />
            <line x1="42" y1="18" x2="46" y2="6" class="donkey-ear" />
            <line x1="22" y1="18" x2="20" y2="8" class="donkey-ear-inner" />
            <line x1="42" y1="18" x2="44" y2="8" class="donkey-ear-inner" />
            <circle cx="26" cy="26" r="2.5" class="donkey-eye" />
            <circle cx="38" cy="26" r="2.5" class="donkey-eye" />
            <circle cx="26.5" cy="25.5" r="0.8" fill="#fff" />
            <circle cx="38.5" cy="25.5" r="0.8" fill="#fff" />
            <circle cx="28" cy="32" r="1.2" class="donkey-nostril" />
            <circle cx="36" cy="32" r="1.2" class="donkey-nostril" />
            <path d="M 27 35 Q 32 38 37 35" class="donkey-mouth" />
            <line x1="24" y1="16" x2="28" y2="20" class="donkey-man" />
            <line x1="28" y1="14" x2="32" y2="18" class="donkey-man" />
            <line x1="32" y1="14" x2="36" y2="18" class="donkey-man" />
            <line x1="36" y1="16" x2="40" y2="20" class="donkey-man" />
          </svg>
        </div>
        <h2 class="outage-title">NO INTERNET, PARTNER</h2>
      </div>
      <div class="outage-body">
        <div class="outage-glitch" id="outage-glitch">
          <span class="glitch-text" id="glitch-text">...</span>
        </div>
        <div class="outage-status" id="outage-status">
          <span class="status-dot"></span>
          <span id="retry-text">Checking connection...</span>
        </div>
        <div class="outage-progress" id="outage-progress">
          <div class="progress-bar" id="progress-bar"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  _outagePanel = panel;
  return panel;
}

function removeOutagePanel() {
  if (_outagePanel) {
    _outagePanel.classList.add('outage-hidden');
    setTimeout(() => {
      if (_outagePanel && _outagePanel.parentNode) {
        _outagePanel.parentNode.removeChild(_outagePanel);
      }
      _outagePanel = null;
      _outageVisible = false;
      // Close auto-opened donkey panel
      if (_donkeyAutoOpened && typeof DONKEY_RUNNER !== 'undefined' && DONKEY_RUNNER.gamePanel) {
        DONKEY_RUNNER.close();
        _donkeyAutoOpened = false;
      }
      // Reset position for next time
      const panel = document.getElementById('outage-panel');
      if (panel) { panel.style.top = ''; panel.style.bottom = ''; }
    }, 500);
  }
}

function showOutagePanel() {
  const panel = createOutagePanel();
  _outageVisible = true;

  // Auto-open donkey panel if it's not already visible
  if (typeof DONKEY_RUNNER !== 'undefined' && DONKEY_RUNNER.gamePanel) {
    if (DONKEY_RUNNER.gamePanel.classList.contains('donkey-hidden')) {
      DONKEY_RUNNER.toggle();
      _donkeyAutoOpened = true;
    }
  }

  // Set position BEFORE the slide-in animation begins, so the panel animates
  // from the bottom of the screen to the correct target position.
  adjustOutagePositionImmediate();

  panel.classList.remove('outage-hidden');
  panel.classList.add('outage-visible');
  cycleOutageMessage();
}

// Immediately-set the outage panel position (no delay).
// Used when the panel first appears, before its slide-in animation begins.
function adjustOutagePositionImmediate() {
  const panel = document.getElementById('outage-panel');
  if (!panel) return;

  const donkeyVisible = DONKEY_RUNNER && DONKEY_RUNNER.gamePanel &&
    !DONKEY_RUNNER.gamePanel.classList.contains('donkey-hidden');

  if (donkeyVisible) {
    const donkeyRect = DONKEY_RUNNER.gamePanel.getBoundingClientRect();
    panel.style.top = (donkeyRect.bottom + 20) + 'px';
    panel.style.bottom = 'auto';
  } else {
    panel.style.top = '64px';
    panel.style.bottom = 'auto';
  }
}

// Delayed position adjustment (used when donkey game is toggled).
// Waits for the donkey panel's 400ms CSS transition to complete before measuring.
function adjustOutagePosition() {
  const panel = document.getElementById('outage-panel');
  if (!panel) return;

  const donkeyVisible = DONKEY_RUNNER && DONKEY_RUNNER.gamePanel &&
    !DONKEY_RUNNER.gamePanel.classList.contains('donkey-hidden');

  // The donkey panel has a 0.4s CSS transition on `top`. We must wait for it
  // to finish animating before calling getBoundingClientRect(), otherwise we
  // measure a mid-transition (incorrect) position.  450ms ≈ transition duration
  // plus a small safety margin.
  const transitionDelay = 450;

  // Also cancel any previously-scheduled adjustment so rapid toggles don't
  // leave stale timeouts firing and overwriting the correct position.
  if (adjustOutagePosition._timer) {
    clearTimeout(adjustOutagePosition._timer);
    adjustOutagePosition._timer = null;
  }

  adjustOutagePosition._timer = setTimeout(() => {
    adjustOutagePosition._timer = null;
    if (!document.getElementById('outage-panel')) return;
    const p = document.getElementById('outage-panel');

    if (donkeyVisible) {
      const donkeyRect = DONKEY_RUNNER.gamePanel.getBoundingClientRect();
      p.style.top = (donkeyRect.bottom + 20) + 'px';
      p.style.bottom = 'auto';
    } else {
      p.style.top = '64px';
      p.style.bottom = 'auto';
    }
  }, transitionDelay);
}

function cycleOutageMessage() {
  if (!_outageVisible) return;

  const textEl = document.getElementById('glitch-text');
  if (!textEl) return;

  const msg = OUTAGE_MESSAGES[Math.floor(Math.random() * OUTAGE_MESSAGES.length)];
  typeWriter(textEl, msg, 30, () => {
    setTimeout(() => {
      if (_outageVisible) cycleOutageMessage();
    }, 3000);
  });
}

function typeWriter(el, text, speed, callback, index) {
  index = index || 0;
  if (index <= text.length) {
    el.textContent = text.substring(0, index);
    setTimeout(() => typeWriter(el, text, speed, callback, index + 1), speed);
  } else if (callback) {
    callback();
  }
}

function updateRetryStatus(retryCount) {
  const statusDot = document.querySelector('.status-dot');
  const retryText = document.getElementById('retry-text');
  const progressBar = document.getElementById('progress-bar');

  if (statusDot) {
    statusDot.className = 'status-dot retrying';
  }

  if (retryText) {
    const labels = ['Initial', 'Secondary', 'Tertiary', 'Emergency'];
    retryText.textContent = `${labels[retryCount] || 'Continuous'} attempt...`;
  }

  if (progressBar) {
    const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
    // Force reflow for transition restart
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progressBar.style.transition = `width ${delay}ms linear`;
        progressBar.style.width = '100%';
      });
    });
  }
}

// ===== RETRY CYCLE =====
function stopRetryCycle() {
  if (_retryInterval) {
    clearTimeout(_retryInterval);
    _retryInterval = null;
  }
}

function startRetryCycle() {
  let retryCount = 0;

  function attempt() {
    updateRetryStatus(retryCount);
    const timeout = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];

    // Use a fast fetch with abort timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout, 8000));

    fetch('https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m&timezone=auto', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal
    })
      .then(res => {
        clearTimeout(timeoutId);
        if (res.ok || res.status === 0) {
          // Network is back!
          stopRetryCycle();
          removeOutagePanel();
          if (_pendingRunFn) {
            const fn = _pendingRunFn;
            _pendingRunFn = null;
            fn();
          }
        } else {
          throw new Error('Not OK');
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        retryCount++;
        const nextDelay = retryCount < RETRY_DELAYS.length
          ? RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)]
          : 30000;
        _retryInterval = setTimeout(attempt, nextDelay);
      });
  }

  _retryInterval = setTimeout(attempt, 800);
}

// ===== NETWORK CHECK =====
async function checkNetwork() {
  // Quick check 1: navigator.onLine (browser's offline flag)
  if (!navigator.onLine) return false;

  // Quick check 2: Use a simple HEAD request with AbortController timeout
  // Use google.com as it's extremely reliable
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return navigator.onLine;
  } catch (e) {
    clearTimeout(timeoutId);
    // Fallback: try a second endpoint
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 2500);
    try {
      await fetch('https://captive.apple.com/hotspot-detect.html', {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller2.signal
      });
      clearTimeout(timeoutId2);
      return true;
    } catch (e2) {
      clearTimeout(timeoutId2);
      return false;
    }
  }
}

// ===== PUBLIC API =====
function checkNetworkAndRun(runFn) {
  _pendingRunFn = runFn;

  checkNetwork().then((online) => {
    if (online) {
      runFn();
    } else {
      showOutagePanel();
      startRetryCycle();
    }
  });
}