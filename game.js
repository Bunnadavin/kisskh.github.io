(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    score: document.getElementById("score"),
    bestScore: document.getElementById("bestScore"),
    distance: document.getElementById("distance"),
    speed: document.getElementById("speed"),
    lives: document.getElementById("lives"),
    powerupStatus: document.getElementById("powerupStatus"),
    healthFill: document.getElementById("healthFill"),
    startScreen: document.getElementById("startScreen"),
    pauseScreen: document.getElementById("pauseScreen"),
    gameOverScreen: document.getElementById("gameOverScreen"),
    finalScore: document.getElementById("finalScore"),
    startBtn: document.getElementById("startBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    restartBtn: document.getElementById("restartBtn"),
    newGameOverBtn: document.getElementById("newGameOverBtn"),
    leftBtn: document.getElementById("leftBtn"),
    rightBtn: document.getElementById("rightBtn"),
    jumpBtn: document.getElementById("jumpBtn")
  };

  const WORLD = {
    gravity: 2550,
    floorY: 540,
    cameraLead: 210,
    cameraZoom: 1.12,
    platformMinWidth: 220,
    platformMaxWidth: 520,
    platformMinGap: 95,
    platformMaxGap: 260,
    minPlatformY: 290,
    maxPlatformY: 585,
    cleanupBehind: 900,
    generateAhead: 1800
  };

  const PLAYER = {
    width: 42,
    height: 58,
    acceleration: 3900,
    groundFriction: 0.86,
    airFriction: 0.96,
    maxSpeed: 485,
    autoRun: 175,
    jumpVelocity: -890,
    maxHealth: 100,
    startLives: 3,
    maxLives: 9,
    invulnerableTime: 1.15
  };

  const COLORS = {
    skyTop: "#74c9ff",
    skyBottom: "#d7f1ff",
    hillFar: "#7cc78a",
    hillNear: "#49ad70",
    platformTop: "#7a5132",
    platformSide: "#4f321f",
    grass: "#38c35a",
    player: "#ffcf33",
    playerTrim: "#2f3542",
    enemy: "#d94b4b",
    spike: "#dce3ec",
    letter: "#ffffff",
    letterShell: "#246bfe",
    life: "#ff4d7d",
    lifeShell: "#fff2f6",
    slow: "#52d1ff",
    invincible: "#b388ff",
    fly: "#38e6a3",
    boost: "#ff9f1c"
  };

  const KHMER_ALPHABET = [
    "ក", "ខ", "គ", "ឃ", "ង",
    "ច", "ឆ", "ជ", "ឈ", "ញ",
    "ដ", "ឋ", "ឌ", "ឍ", "ណ",
    "ត", "ថ", "ទ", "ធ", "ន",
    "ប", "ផ", "ព", "ភ", "ម",
    "យ", "រ", "ល", "វ", "ស",
    "ហ", "ឡ", "អ"
  ];

  const BEST_SCORE_KEY = "infiniteRunner.bestScore";

  const POWERUPS = {
    slow: {
      label: "Slow",
      shortLabel: "SLOW",
      icon: "S",
      duration: 7,
      color: COLORS.slow
    },
    invincible: {
      label: "Shield",
      shortLabel: "SHIELD",
      icon: "I",
      duration: 7,
      color: COLORS.invincible
    },
    fly: {
      label: "Fly",
      shortLabel: "FLY",
      icon: "F",
      duration: 6,
      color: COLORS.fly
    },
    boost: {
      label: "Boost",
      shortLabel: "BOOST",
      icon: "B",
      duration: 5,
      color: COLORS.boost
    }
  };

  const POWERUP_TYPES = Object.keys(POWERUPS);

  const input = {
    heldDirections: new Map(),
    directionHistory: [],
    jumpQueued: false,
    jumpHeld: false,

    pressDirection(source, direction) {
      if (this.heldDirections.get(source) === direction) return;
      this.releaseDirection(source);
      this.heldDirections.set(source, direction);
      this.directionHistory.push(source);
    },

    releaseDirection(source) {
      if (!this.heldDirections.has(source)) return;
      this.heldDirections.delete(source);
      this.directionHistory = this.directionHistory.filter((item) => item !== source);
    },

    getMovementAxis() {
      while (
        this.directionHistory.length > 0 &&
        !this.heldDirections.has(this.directionHistory[this.directionHistory.length - 1])
      ) {
        this.directionHistory.pop();
      }

      const source = this.directionHistory[this.directionHistory.length - 1];
      return source ? this.heldDirections.get(source) : 0;
    },

    queueJump() {
      this.jumpQueued = true;
    },

    pressJump() {
      this.jumpHeld = true;
      this.queueJump();
    },

    releaseJump() {
      this.jumpHeld = false;
    },

    consumeJump() {
      const queued = this.jumpQueued;
      this.jumpQueued = false;
      return queued;
    },

    isJumpHeld() {
      return this.jumpHeld;
    },

    reset() {
      this.heldDirections.clear();
      this.directionHistory = [];
      this.jumpQueued = false;
      this.jumpHeld = false;
    }
  };

  const game = {
    state: "start",
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    lastTime: 0,
    cameraX: 0,
    cameraY: 0,
    score: 0,
    bestScore: 0,
    bestX: 0,
    speedFactor: 1,
    letterIndex: 0,
    nextLifePickupX: 1450,
    nextPowerupX: 950,
    powerups: {
      slow: 0,
      invincible: 0,
      fly: 0,
      boost: 0
    },
    nextPlatformX: 0,
    nextPlatformY: WORLD.floorY,
    platforms: [],
    enemies: [],
    spikes: [],
    collectibles: [],
    particles: [],
    player: null
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function loadBestScore() {
    try {
      const storedScore = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
      return Number.isFinite(storedScore) && storedScore > 0 ? storedScore : 0;
    } catch {
      return 0;
    }
  }

  function saveBestScore(score) {
    try {
      localStorage.setItem(BEST_SCORE_KEY, Math.floor(score).toString());
    } catch {
    }
  }

  function clearBestScore() {
    game.bestScore = 0;
    try {
      localStorage.removeItem(BEST_SCORE_KEY);
    } catch {
    }
    updateHud();
  }

  function commitBestScore() {
    const score = Math.floor(game.score);
    if (score <= game.bestScore) return false;
    game.bestScore = score;
    saveBestScore(game.bestScore);
    return true;
  }

  function resetPowerups() {
    for (const type of POWERUP_TYPES) {
      game.powerups[type] = 0;
    }
  }

  function activatePowerup(type) {
    const powerup = POWERUPS[type];
    if (!powerup) return;
    game.powerups[type] = powerup.duration;
  }

  function updatePowerups(dt) {
    for (const type of POWERUP_TYPES) {
      game.powerups[type] = Math.max(0, game.powerups[type] - dt);
    }
  }

  function hasPowerup(type) {
    return game.powerups[type] > 0;
  }

  function isPlayerInvincible() {
    return hasPowerup("invincible") || hasPowerup("boost");
  }

  function getRunSpeedFactor() {
    let factor = game.speedFactor;
    if (hasPowerup("slow")) factor *= 0.62;
    if (hasPowerup("boost")) factor *= 1.75;
    return Math.max(0.45, factor);
  }

  function getPowerupStatusText() {
    const active = POWERUP_TYPES
      .filter((type) => game.powerups[type] > 0)
      .map((type) => `${POWERUPS[type].shortLabel} ${Math.ceil(game.powerups[type])}`);

    return active.length > 0 ? active.join(" ") : "None";
  }

  function setOverlay(target) {
    ui.startScreen.classList.toggle("hidden", target !== "start");
    ui.pauseScreen.classList.toggle("hidden", target !== "pause");
    ui.gameOverScreen.classList.toggle("hidden", target !== "gameover");
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    game.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    game.width = Math.max(320, rect.width);
    game.height = Math.max(320, rect.height);
    canvas.width = Math.floor(game.width * game.dpr);
    canvas.height = Math.floor(game.height * game.dpr);
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  }

  function createPlayer() {
    return {
      x: 110,
      y: 100,
      w: PLAYER.width,
      h: PLAYER.height,
      vx: PLAYER.autoRun,
      vy: 0,
      jumpsUsed: 0,
      grounded: false,
      health: PLAYER.maxHealth,
      lives: PLAYER.startLives,
      invulnerable: 0,
      hurtFlash: 0,
      facing: 1
    };
  }

  function createPlatform(x, y, w, seeded = false) {
    const platform = {
      x,
      y,
      w,
      h: 34,
      id: `${Math.round(x)}-${Math.round(y)}-${Math.round(w)}`
    };

    if (!seeded && w > 260) {
      const hazardRoll = Math.random();
      if (hazardRoll < 0.34) {
        const count = Math.random() < 0.35 ? 2 : 1;
        for (let i = 0; i < count; i += 1) {
          game.spikes.push({
            x: x + random(70, w - 70),
            y: y - 28,
            w: 34,
            h: 28
          });
        }
      } else if (hazardRoll < 0.62) {
        game.enemies.push({
          x: x + random(70, w - 90),
          y: y - 34,
          w: 38,
          h: 34,
          vx: Math.random() < 0.5 ? -75 : 75,
          minX: x + 18,
          maxX: x + w - 56,
          phase: Math.random() * Math.PI * 2
        });
      }

      const letterCount = clamp(Math.floor(w / 180), 1, 3);
      for (let i = 0; i < letterCount; i += 1) {
        const alphabetIndex = game.letterIndex % KHMER_ALPHABET.length;
        game.letterIndex += 1;
        game.collectibles.push({
          type: "letter",
          x: x + 70 + i * Math.min(120, (w - 140) / Math.max(1, letterCount - 1)),
          y: y - random(84, 145),
          w: 28,
          h: 28,
          letter: KHMER_ALPHABET[alphabetIndex],
          alphabetIndex,
          collected: false,
          bob: Math.random() * Math.PI * 2
        });
      }

      if (x > game.nextLifePickupX && w > 320) {
        game.collectibles.push({
          type: "life",
          x: x + w * 0.5 - 16,
          y: y - random(132, 175),
          w: 32,
          h: 32,
          collected: false,
          bob: Math.random() * Math.PI * 2
        });
        game.nextLifePickupX = x + random(1550, 2350);
      }

      if (x > game.nextPowerupX && w > 300) {
        const type = POWERUP_TYPES[Math.floor(random(0, POWERUP_TYPES.length))];
        game.collectibles.push({
          type: "powerup",
          powerup: type,
          x: x + random(80, w - 110),
          y: y - random(118, 165),
          w: 32,
          h: 32,
          collected: false,
          bob: Math.random() * Math.PI * 2
        });
        game.nextPowerupX = x + random(1050, 1750);
      }
    }

    game.platforms.push(platform);
    return platform;
  }

  function generatePlatforms(toX) {
    while (game.nextPlatformX < toX) {
      const gap = random(WORLD.platformMinGap, WORLD.platformMaxGap + game.speedFactor * 18);
      const width = random(WORLD.platformMinWidth, WORLD.platformMaxWidth);
      const yDelta = random(-105, 120);
      const y = clamp(game.nextPlatformY + yDelta, WORLD.minPlatformY, WORLD.maxPlatformY);
      const x = game.nextPlatformX + gap;

      createPlatform(x, y, width);

      game.nextPlatformX = x + width;
      game.nextPlatformY = y;
    }
  }

  function cleanWorld() {
    const minX = game.cameraX - WORLD.cleanupBehind;
    game.platforms = game.platforms.filter((item) => item.x + item.w > minX);
    game.enemies = game.enemies.filter((item) => item.x + item.w > minX);
    game.spikes = game.spikes.filter((item) => item.x + item.w > minX);
    game.collectibles = game.collectibles.filter((item) => item.x + item.w > minX && !item.collected);
    game.particles = game.particles.filter((item) => item.life > 0);
  }

  function resetGame() {
    game.time = 0;
    game.lastTime = performance.now();
    game.cameraX = 0;
    game.cameraY = 0;
    game.score = 0;
    game.bestX = 0;
    game.speedFactor = 1;
    game.letterIndex = 0;
    game.nextLifePickupX = 1450;
    game.nextPowerupX = 950;
    resetPowerups();
    game.platforms = [];
    game.enemies = [];
    game.spikes = [];
    game.collectibles = [];
    game.particles = [];
    game.player = createPlayer();
    input.jumpQueued = false;

    createPlatform(-220, WORLD.floorY, 720, true);
    createPlatform(610, WORLD.floorY - 45, 420, false);
    game.nextPlatformX = 1030;
    game.nextPlatformY = WORLD.floorY - 45;
    generatePlatforms(2600);
    updateHud();
  }

  function startGame() {
    resetGame();
    game.state = "running";
    setOverlay("none");
    game.lastTime = performance.now();
  }

  function startNewGame() {
    clearBestScore();
    startGame();
  }

  function pauseGame() {
    if (game.state !== "running") return;
    game.state = "pause";
    setOverlay("pause");
  }

  function resumeGame() {
    if (game.state !== "pause") return;
    game.state = "running";
    setOverlay("none");
    game.lastTime = performance.now();
  }

  function gameOver() {
    game.state = "gameover";
    const isNewBest = commitBestScore();
    ui.finalScore.textContent = isNewBest
      ? `New Best : ${game.bestScore}`
      : `Score : ${Math.floor(game.score)} | Best : ${game.bestScore}`;
    updateHud();
    setOverlay("gameover");
  }

  function queueJump() {
    if (game.state === "start") {
      startGame();
      return;
    }
    if (game.state !== "running") return;
    input.pressJump();
  }

  function performJump(player) {
    if (player.jumpsUsed >= 2) return;
    player.vy = PLAYER.jumpVelocity;
    player.grounded = false;
    player.jumpsUsed += 1;
    spawnDust(player.x + player.w / 2, player.y + player.h, player.jumpsUsed === 1 ? 7 : 11);
  }

  function damagePlayer(amount, knockback) {
    const player = game.player;
    if (player.invulnerable > 0 || isPlayerInvincible() || game.state !== "running") return;

    player.health -= amount;
    player.invulnerable = PLAYER.invulnerableTime;
    player.hurtFlash = 0.28;
    player.vx += knockback;
    player.vy = Math.min(player.vy, -520);

    if (player.health <= 0) {
      player.lives -= 1;
      if (player.lives < 1) {
        player.health = 0;
        updateHud();
        gameOver();
        return;
      }
      player.health = PLAYER.maxHealth;
      player.x = Math.max(80, game.cameraX + 120);
      player.y = 80;
      player.vx = PLAYER.autoRun;
      player.vy = 0;
      player.jumpsUsed = 0;
    }

    updateHud();
  }

  function collectItem(item) {
    item.collected = true;
    const isLifePickup = item.type === "life";
    const isPowerupPickup = item.type === "powerup";
    const powerup = isPowerupPickup ? POWERUPS[item.powerup] : null;
    const particleColor = isLifePickup
      ? COLORS.life
      : isPowerupPickup
        ? powerup.color
        : COLORS.letter;

    if (isLifePickup) {
      game.player.lives = Math.min(PLAYER.maxLives, game.player.lives + 1);
      game.player.health = Math.min(PLAYER.maxHealth, game.player.health + 30);
      game.score += 250;
    } else if (isPowerupPickup) {
      activatePowerup(item.powerup);
      game.score += item.powerup === "boost" ? 350 : 220;
    } else {
      game.score += 100 + (item.alphabetIndex + 1) * 3;
    }

    for (let i = 0; i < 9; i += 1) {
      game.particles.push({
        x: item.x + item.w / 2,
        y: item.y + item.h / 2,
        vx: random(-150, 150),
        vy: random(-260, -80),
        radius: random(2, 5),
        color: i % 2 ? COLORS.letterShell : particleColor,
        life: random(0.35, 0.75),
        maxLife: 0.75
      });
    }

    updateHud();
  }

  function spawnDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      game.particles.push({
        x,
        y,
        vx: random(-135, 80),
        vy: random(-90, 10),
        radius: random(2, 5),
        color: "rgba(255,255,255,0.85)",
        life: random(0.22, 0.45),
        maxLife: 0.45
      });
    }
  }

  function updatePlayer(dt) {
    const player = game.player;
    const movementAxis = input.getMovementAxis();

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);

    if (input.consumeJump()) {
      performJump(player);
    }

    const runSpeedFactor = getRunSpeedFactor();
    const autoRun = PLAYER.autoRun + (runSpeedFactor - 1) * 58;
    player.vx += movementAxis * PLAYER.acceleration * dt;
    player.vx += autoRun * dt * 1.45;
    player.vx *= player.grounded ? PLAYER.groundFriction : PLAYER.airFriction;
    player.vx = clamp(player.vx, -PLAYER.maxSpeed * 0.55, PLAYER.maxSpeed + runSpeedFactor * 55);

    if (hasPowerup("fly")) {
      if (input.isJumpHeld()) {
        player.vy -= 1850 * dt;
      }
      player.vy = Math.min(player.vy, 360);
    }

    if (movementAxis !== 0) {
      player.facing = movementAxis;
    } else if (Math.abs(player.vx) > 20) {
      player.facing = Math.sign(player.vx);
    }

    player.vy += WORLD.gravity * (hasPowerup("fly") ? 0.32 : 1) * dt;

    const prevY = player.y;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.grounded = false;

    for (const platform of game.platforms) {
      const withinX = player.x + player.w > platform.x + 6 && player.x < platform.x + platform.w - 6;
      const wasAbove = prevY + player.h <= platform.y + 8;
      const crossedTop = player.y + player.h >= platform.y && player.y + player.h <= platform.y + platform.h + 18;
      if (player.vy >= 0 && withinX && wasAbove && crossedTop) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.jumpsUsed = 0;
      }
    }

    if (player.y > game.cameraY + game.height + 220) {
      damagePlayer(PLAYER.maxHealth, 0);
    }

    const minX = game.cameraX - 90;
    if (player.x < minX) {
      player.x = minX;
      player.vx = Math.max(player.vx, PLAYER.autoRun * 0.65);
      damagePlayer(18, 220);
    }

    game.bestX = Math.max(game.bestX, player.x);
    game.speedFactor = 1 + Math.min(2.85, game.bestX / 5200);
    game.score += dt * (8 + getRunSpeedFactor() * 5);
  }

  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      enemy.phase += dt * 7;
      enemy.x += enemy.vx * dt * getRunSpeedFactor();
      if (enemy.x < enemy.minX) {
        enemy.x = enemy.minX;
        enemy.vx = Math.abs(enemy.vx);
      }
      if (enemy.x > enemy.maxX) {
        enemy.x = enemy.maxX;
        enemy.vx = -Math.abs(enemy.vx);
      }

      if (rectsOverlap(game.player, enemy)) {
        const playerBottom = game.player.y + game.player.h;
        if (game.player.vy > 80 && playerBottom - enemy.y < 28) {
          enemy.dead = true;
          game.player.vy = PLAYER.jumpVelocity * 0.58;
          game.score += 160;
          spawnDust(enemy.x + enemy.w / 2, enemy.y + enemy.h, 12);
        } else {
          const direction = game.player.x < enemy.x ? -360 : 360;
          damagePlayer(28, direction);
        }
      }
    }
    game.enemies = game.enemies.filter((enemy) => !enemy.dead);
  }

  function updateHazardsAndCollectibles() {
    for (const spike of game.spikes) {
      const hitBox = {
        x: spike.x + 5,
        y: spike.y + 7,
        w: spike.w - 10,
        h: spike.h - 7
      };
      if (rectsOverlap(game.player, hitBox)) {
        const direction = game.player.x < spike.x ? -300 : 300;
        damagePlayer(34, direction);
      }
    }

    for (const item of game.collectibles) {
      if (!item.collected && rectsOverlap(game.player, item)) {
        collectItem(item);
      }
    }
  }

  function updateCamera(dt) {
    const player = game.player;
    const targetX = Math.max(0, player.x - WORLD.cameraLead);
    const targetY = clamp(player.y - game.height * 0.48, -90, 160);
    game.cameraX = lerp(game.cameraX, targetX, 1 - Math.pow(0.001, dt));
    game.cameraY = lerp(game.cameraY, targetY, 1 - Math.pow(0.004, dt));
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 700 * dt;
    }
  }

  function updateHud() {
    const player = game.player;
    const healthRatio = player ? clamp(player.health / PLAYER.maxHealth, 0, 1) : 1;
    const displayScore = Math.floor(game.score);
    ui.score.textContent = Math.floor(game.score).toString();
    ui.bestScore.textContent = Math.max(game.bestScore, displayScore).toString();
    ui.distance.textContent = `${Math.floor(game.bestX / 10)}m`;
    ui.speed.textContent = `${getRunSpeedFactor().toFixed(1)}x`;
    ui.lives.textContent = player ? player.lives.toString() : PLAYER.startLives.toString();
    ui.powerupStatus.textContent = getPowerupStatusText();
    ui.healthFill.style.width = `${healthRatio * 100}%`;
    ui.healthFill.style.background =
      healthRatio < 0.28
        ? "linear-gradient(90deg,#ff4d4d,#c0392b)"
        : healthRatio < 0.58
          ? "linear-gradient(90deg,#ffd166,#f39c12)"
          : "linear-gradient(90deg,#2ecc71,#27ae60)";
    ui.healthFill.parentElement.parentElement.classList.toggle("lowHealth", healthRatio < 0.28);
  }

  function update(dt) {
    game.time += dt;
    updatePowerups(dt);
    generatePlatforms(game.cameraX + game.width + WORLD.generateAhead);
    updatePlayer(dt);
    updateEnemies(dt);
    updateHazardsAndCollectibles();
    updateCamera(dt);
    updateParticles(dt);
    cleanWorld();
    updateHud();
  }

  function screenX(x) {
    return Math.round(x - game.cameraX);
  }

  function screenY(y) {
    return Math.round(y - game.cameraY);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, game.height);
    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, game.width, game.height);

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    for (let i = 0; i < 8; i += 1) {
      const x = ((i * 330 - game.cameraX * 0.18) % (game.width + 420)) - 210;
      const y = 70 + (i % 3) * 48;
      drawCloud(x, y, 0.8 + (i % 4) * 0.15);
    }

    drawHills(0.18, COLORS.hillFar, game.height - 115, 95);
    drawHills(0.32, COLORS.hillNear, game.height - 75, 65);
  }

  function drawCloud(x, y, scale) {
    ctx.beginPath();
    ctx.ellipse(x, y + 14 * scale, 46 * scale, 20 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 36 * scale, y + 8 * scale, 32 * scale, 24 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 34 * scale, y + 10 * scale, 32 * scale, 22 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills(speed, color, baseY, amplitude) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, game.height);
    for (let x = 0; x <= game.width + 40; x += 40) {
      const worldX = x + game.cameraX * speed;
      const y = baseY + Math.sin(worldX * 0.006) * amplitude * 0.35 + Math.sin(worldX * 0.0027) * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(game.width, game.height);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlatforms() {
    for (const platform of game.platforms) {
      const x = screenX(platform.x);
      const y = screenY(platform.y);
      if (x > game.width + 80 || x + platform.w < -80) continue;

      ctx.fillStyle = COLORS.platformSide;
      ctx.fillRect(x, y + 12, platform.w, platform.h + 24);
      ctx.fillStyle = COLORS.platformTop;
      ctx.fillRect(x, y, platform.w, platform.h);
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(x, y, platform.w, 10);

      ctx.fillStyle = "rgba(255,255,255,0.16)";
      for (let px = x + 22; px < x + platform.w - 15; px += 54) {
        ctx.fillRect(px, y + 17, 24, 4);
      }
    }
  }

  function drawSpikes() {
    for (const spike of game.spikes) {
      const x = screenX(spike.x);
      const y = screenY(spike.y);
      if (x > game.width + 60 || x + spike.w < -60) continue;

      ctx.fillStyle = COLORS.spike;
      ctx.strokeStyle = "#9aa9b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + spike.h);
      ctx.lineTo(x + spike.w / 2, y);
      ctx.lineTo(x + spike.w, y + spike.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawCollectibles() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 20px Khmer UI, Noto Sans Khmer, DaunPenh, Segoe UI, Arial, sans-serif";

    for (const item of game.collectibles) {
      const bob = Math.sin(game.time * 4 + item.bob) * 6;
      const x = screenX(item.x);
      const y = screenY(item.y + bob);
      if (x > game.width + 60 || x + item.w < -60) continue;

      if (item.type === "powerup") {
        drawPowerupPickup(x + item.w / 2, y + item.h / 2, item.powerup);
        continue;
      }

      if (item.type === "life") {
        drawLifePickup(x + item.w / 2, y + item.h / 2);
        continue;
      }

      ctx.fillStyle = COLORS.letterShell;
      ctx.beginPath();
      ctx.arc(x + item.w / 2, y + item.h / 2, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.82)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = COLORS.letter;
      ctx.fillText(item.letter, x + item.w / 2, y + item.h / 2 + 1);
    }
  }

  function drawLifePickup(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = COLORS.lifeShell;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = COLORS.life;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-22, -3, -10, -18, 0, -8);
    ctx.bezierCurveTo(10, -18, 22, -3, 0, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(-6, -7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPowerupPickup(x, y, type) {
    const powerup = POWERUPS[type];
    if (!powerup) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = powerup.color;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.arc(5, 6, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 18px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(powerup.icon, 0, 1);
    ctx.restore();
  }

  function drawEnemies() {
    for (const enemy of game.enemies) {
      const x = screenX(enemy.x);
      const y = screenY(enemy.y + Math.sin(enemy.phase) * 2);
      if (x > game.width + 70 || x + enemy.w < -70) continue;

      ctx.fillStyle = COLORS.enemy;
      roundRect(x, y, enemy.w, enemy.h, 8);
      ctx.fill();

      ctx.fillStyle = "#661a1a";
      ctx.beginPath();
      ctx.arc(x + 12, y + 13, 4, 0, Math.PI * 2);
      ctx.arc(x + enemy.w - 12, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#661a1a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 25);
      ctx.lineTo(x + enemy.w - 12, y + 25);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const player = game.player;
    const x = screenX(player.x);
    const y = screenY(player.y);
    const powered = isPlayerInvincible();
    const flash = player.hurtFlash > 0 || ((player.invulnerable > 0 || powered) && Math.floor(game.time * 18) % 2 === 0);

    ctx.save();
    ctx.translate(x + player.w / 2, y + player.h / 2);
    ctx.scale(player.facing < 0 ? -1 : 1, 1);

    if (powered) {
      ctx.strokeStyle = hasPowerup("boost") ? COLORS.boost : COLORS.invincible;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = flash ? "#ffffff" : COLORS.player;
    roundRect(-player.w / 2, -player.h / 2, player.w, player.h, 10);
    ctx.fill();

    ctx.fillStyle = COLORS.playerTrim;
    ctx.fillRect(5, -11, 12, 5);
    ctx.beginPath();
    ctx.arc(10, -15, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f08c00";
    ctx.fillRect(-player.w / 2 + 5, player.h / 2 - 7, player.w - 10, 7);
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(screenX(particle.x), screenY(particle.y), particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawStartPreview() {
    if (game.state !== "start") return;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, game.height - 86, game.width, 86);
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, game.height - 86, game.width, 12);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw() {
    drawBackground();
    if (game.player) {
      ctx.save();
      ctx.translate(game.width / 2, game.height / 2);
      ctx.scale(WORLD.cameraZoom, WORLD.cameraZoom);
      ctx.translate(-game.width / 2, -game.height / 2);
      drawPlatforms();
      drawSpikes();
      drawCollectibles();
      drawEnemies();
      drawPlayer();
      drawParticles();
      ctx.restore();
    } else {
      drawStartPreview();
    }
  }

  function frame(now) {
    const elapsed = Math.min(0.033, (now - game.lastTime) / 1000 || 0);
    game.lastTime = now;

    if (game.state === "running") {
      update(elapsed);
    }
    draw();
    requestAnimationFrame(frame);
  }

  function getDirectionForKey(code) {
    if (code === "ArrowLeft" || code === "KeyA") return -1;
    if (code === "ArrowRight" || code === "KeyD") return 1;
    return 0;
  }

  function bindHoldButton(button, source, direction) {
    const press = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      input.pressDirection(source, direction);
    };
    const release = (event) => {
      event.preventDefault();
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      input.releaseDirection(source);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  function bindJumpButton(button) {
    const press = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      input.pressJump();
    };
    const release = (event) => {
      event.preventDefault();
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      input.releaseJump();
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  function bindEvents() {
    window.addEventListener("resize", resize);

    window.addEventListener("keydown", (event) => {
      if (event.repeat && event.code !== "KeyP") return;
      const direction = getDirectionForKey(event.code);
      if (direction !== 0) {
        input.pressDirection(`key:${event.code}`, direction);
      }
      if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
        event.preventDefault();
        queueJump();
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        if (game.state === "running") pauseGame();
        else if (game.state === "pause") resumeGame();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (getDirectionForKey(event.code) !== 0) {
        input.releaseDirection(`key:${event.code}`);
      }
      if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
        input.releaseJump();
      }
    });

    ui.startBtn.addEventListener("click", startGame);
    ui.newGameBtn.addEventListener("click", startNewGame);
    ui.resumeBtn.addEventListener("click", resumeGame);
    ui.restartBtn.addEventListener("click", startGame);
    ui.newGameOverBtn.addEventListener("click", startNewGame);

    bindHoldButton(ui.leftBtn, "touch:left", -1);
    bindHoldButton(ui.rightBtn, "touch:right", 1);
    bindJumpButton(ui.jumpBtn);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game.state === "running") pauseGame();
    });
  }

  function init() {
    resize();
    game.bestScore = loadBestScore();
    resetGame();
    game.state = "start";
    setOverlay("start");
    bindEvents();
    requestAnimationFrame((now) => {
      game.lastTime = now;
      requestAnimationFrame(frame);
    });
  }

  init();
})();
