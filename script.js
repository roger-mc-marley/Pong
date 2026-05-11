const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const playerScoreEl = document.querySelector("#playerScore");
const cpuScoreEl = document.querySelector("#cpuScore");
const statusText = document.querySelector("#statusText");
const serveButton = document.querySelector("#serveButton");
const soundToggle = document.querySelector("#soundToggle");
const levelButtons = document.querySelectorAll(".level");

const levels = {
  easy: {
    label: "facile",
    ballSpeed: 320,
    cpuSpeed: 310,
    acceleration: 1.03,
    cpuDeadZone: 34,
  },
  medium: {
    label: "medio",
    ballSpeed: 360,
    cpuSpeed: 390,
    acceleration: 1.05,
    cpuDeadZone: 14,
  },
  hard: {
    label: "difficile",
    ballSpeed: 430,
    cpuSpeed: 480,
    acceleration: 1.08,
    cpuDeadZone: 4,
  },
};

const state = {
  running: false,
  paused: false,
  keys: new Set(),
  lastTime: 0,
  playerScore: 0,
  cpuScore: 0,
  maxScore: 7,
  soundOn: true,
  level: "medium",
};

let audioContext;

const field = {
  width: canvas.width,
  height: canvas.height,
  paddleWidth: 14,
  paddleHeight: 92,
  ballSize: 14,
};

const player = {
  x: 38,
  y: field.height / 2 - field.paddleHeight / 2,
  speed: 520,
};

const cpu = {
  x: field.width - 38 - field.paddleWidth,
  y: field.height / 2 - field.paddleHeight / 2,
  speed: levels.medium.cpuSpeed,
};

const ball = {
  x: field.width / 2,
  y: field.height / 2,
  vx: 0,
  vy: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getLevel() {
  return levels[state.level];
}

function ensureAudio() {
  if (!state.soundOn) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playHitSound(pitch = 520) {
  if (!state.soundOn || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(pitch, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.075);
}

function resetRound(servingToPlayer = Math.random() > 0.5) {
  const level = getLevel();
  const direction = servingToPlayer ? -1 : 1;

  ball.x = field.width / 2 - field.ballSize / 2;
  ball.y = field.height / 2 - field.ballSize / 2;
  ball.vx = direction * level.ballSpeed;
  ball.vy = (Math.random() * 220 - 110) || 90;
  player.y = field.height / 2 - field.paddleHeight / 2;
  cpu.y = field.height / 2 - field.paddleHeight / 2;
  cpu.speed = level.cpuSpeed;
}

function startRound() {
  ensureAudio();

  if (state.playerScore >= state.maxScore || state.cpuScore >= state.maxScore) {
    state.playerScore = 0;
    state.cpuScore = 0;
    updateScore();
  }

  state.running = true;
  state.paused = false;
  resetRound();
  statusText.textContent = `In gioco: ${getLevel().label}`;
  serveButton.textContent = "Pausa";
}

function togglePause() {
  if (!state.running) {
    startRound();
    return;
  }

  state.paused = !state.paused;
  statusText.textContent = state.paused ? "Pausa" : `In gioco: ${getLevel().label}`;
  serveButton.textContent = state.paused ? "Riprendi" : "Pausa";
}

function updateScore() {
  playerScoreEl.textContent = state.playerScore;
  cpuScoreEl.textContent = state.cpuScore;
}

function endPoint(winner) {
  if (winner === "player") {
    state.playerScore += 1;
    statusText.textContent = "Punto tuo";
  } else {
    state.cpuScore += 1;
    statusText.textContent = "Punto CPU";
  }

  updateScore();
  state.running = false;
  serveButton.textContent = "Servi";

  if (state.playerScore >= state.maxScore || state.cpuScore >= state.maxScore) {
    statusText.textContent = state.playerScore > state.cpuScore ? "Hai vinto" : "CPU vince";
  }
}

function movePaddles(delta) {
  const up = state.keys.has("ArrowUp") || state.keys.has("w");
  const down = state.keys.has("ArrowDown") || state.keys.has("s");

  if (up) {
    player.y -= player.speed * delta;
  }

  if (down) {
    player.y += player.speed * delta;
  }

  player.y = clamp(player.y, 16, field.height - field.paddleHeight - 16);

  const cpuCenter = cpu.y + field.paddleHeight / 2;
  const ballCenter = ball.y + field.ballSize / 2;
  const cpuDirection = Math.sign(ballCenter - cpuCenter);
  const cpuDeadZone = getLevel().cpuDeadZone;

  if (Math.abs(ballCenter - cpuCenter) > cpuDeadZone) {
    cpu.y += cpuDirection * cpu.speed * delta;
  }

  cpu.y = clamp(cpu.y, 16, field.height - field.paddleHeight - 16);
}

function hitPaddle(paddle) {
  return (
    ball.x < paddle.x + field.paddleWidth &&
    ball.x + field.ballSize > paddle.x &&
    ball.y < paddle.y + field.paddleHeight &&
    ball.y + field.ballSize > paddle.y
  );
}

function bounceFrom(paddle, direction) {
  const paddleCenter = paddle.y + field.paddleHeight / 2;
  const ballCenter = ball.y + field.ballSize / 2;
  const offset = (ballCenter - paddleCenter) / (field.paddleHeight / 2);
  const level = getLevel();

  ball.vx = Math.abs(ball.vx) * direction * level.acceleration;
  ball.vy = offset * 360;
  ball.x = direction > 0 ? paddle.x + field.paddleWidth + 1 : paddle.x - field.ballSize - 1;
  playHitSound(direction > 0 ? 420 : 560);
}

function update(delta) {
  if (!state.running || state.paused) {
    return;
  }

  movePaddles(delta);
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;

  if (ball.y <= 12 || ball.y + field.ballSize >= field.height - 12) {
    ball.vy *= -1;
    ball.y = clamp(ball.y, 12, field.height - field.ballSize - 12);
  }

  if (hitPaddle(player) && ball.vx < 0) {
    bounceFrom(player, 1);
  }

  if (hitPaddle(cpu) && ball.vx > 0) {
    bounceFrom(cpu, -1);
  }

  if (ball.x + field.ballSize < 0) {
    endPoint("cpu");
  }

  if (ball.x > field.width) {
    endPoint("player");
  }
}

function drawNet() {
  ctx.fillStyle = "rgba(243, 234, 209, 0.5)";
  for (let y = 18; y < field.height - 18; y += 34) {
    ctx.fillRect(field.width / 2 - 2, y, 4, 18);
  }
}

function draw() {
  ctx.clearRect(0, 0, field.width, field.height);
  ctx.fillStyle = "#0c0d09";
  ctx.fillRect(0, 0, field.width, field.height);

  ctx.strokeStyle = "rgba(156, 255, 143, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, field.width - 24, field.height - 24);

  drawNet();

  ctx.fillStyle = "#f3ead1";
  ctx.fillRect(player.x, player.y, field.paddleWidth, field.paddleHeight);
  ctx.fillRect(cpu.x, cpu.y, field.paddleWidth, field.paddleHeight);

  if (state.running) {
    ctx.fillStyle = "#9cff8f";
    ctx.fillRect(ball.x, ball.y, field.ballSize, field.ballSize);
  }

  if (!state.running) {
    ctx.fillStyle = "rgba(243, 234, 209, 0.08)";
    ctx.fillRect(field.width / 2 - 118, field.height / 2 - 20, 236, 40);
    ctx.fillStyle = "#f3ead1";
    ctx.font = "18px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("SPAZIO PER SERVIRE", field.width / 2, field.height / 2 + 7);
  }
}

function loop(time) {
  const delta = Math.min((time - state.lastTime) / 1000 || 0, 0.03);
  state.lastTime = time;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (["ArrowUp", "ArrowDown", " ", "p", "r", "w", "s"].includes(key)) {
    event.preventDefault();
  }

  if (key === " ") {
    startRound();
    return;
  }

  if (key === "p") {
    togglePause();
    return;
  }

  if (key === "r") {
    state.playerScore = 0;
    state.cpuScore = 0;
    updateScore();
    state.running = false;
    state.paused = false;
    resetRound();
    statusText.textContent = "Premi Spazio o Servi";
    serveButton.textContent = "Servi";
    return;
  }

  state.keys.add(key);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  state.keys.delete(key);
});

serveButton.addEventListener("click", togglePause);

soundToggle.addEventListener("change", () => {
  state.soundOn = soundToggle.checked;

  if (state.soundOn) {
    ensureAudio();
    playHitSound(620);
  }
});

levelButtons.forEach((button) => {
  button.setAttribute("aria-pressed", button.dataset.level === state.level ? "true" : "false");

  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    cpu.speed = getLevel().cpuSpeed;

    levelButtons.forEach((levelButton) => {
      const isActive = levelButton.dataset.level === state.level;
      levelButton.classList.toggle("is-active", isActive);
      levelButton.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    statusText.textContent = state.running && !state.paused
      ? `In gioco: ${getLevel().label}`
      : `Livello ${getLevel().label}`;
  });
});

resetRound();
draw();
requestAnimationFrame(loop);
