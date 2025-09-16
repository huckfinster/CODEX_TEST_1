const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const speedEl = document.getElementById('speed');

const car = {
    width: 64,
    height: 116,
    x: 0,
    y: 0,
    handling: 0.85
};

const road = {
    laneCount: 3,
    widthRatio: 0.62,
    left: 0,
    right: 0,
    laneWidth: 0
};

const state = {
    running: false,
    gameOver: false,
    score: 0,
    bestScore: 0,
    speed: 4.4,
    baseSpeed: 4.4,
    maxSpeed: 13.5,
    acceleration: 0.012
};

const input = {
    left: false,
    right: false,
    boost: false
};

const storageKey = 'neon-drive-best-score';
const obstacles = [];
const trails = [];
let spawnTimer = 0;
let trailTimer = 0;
let laneDashOffset = 0;
let lastTimestamp = 0;

function initialize() {
    setupRoad();
    loadBestScore();
    resetGame(false);
    requestAnimationFrame(loop);
}

function setupRoad() {
    const roadWidth = canvas.width * road.widthRatio;
    road.left = (canvas.width - roadWidth) / 2;
    road.right = road.left + roadWidth;
    road.laneWidth = roadWidth / road.laneCount;
    car.x = road.left + road.laneWidth + (road.laneWidth - car.width) / 2;
    car.y = canvas.height - car.height - 28;
}

function loadBestScore() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed)) {
            state.bestScore = parsed;
            bestScoreEl.textContent = parsed;
        }
    }
}

function saveBestScore() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return;
    }

    window.localStorage.setItem(storageKey, String(state.bestScore));
}

function resetGame(showOverlay = true) {
    state.running = false;
    state.gameOver = false;
    state.score = 0;
    state.speed = state.baseSpeed;
    spawnTimer = 0;
    trailTimer = 0;
    laneDashOffset = 0;
    obstacles.length = 0;
    trails.length = 0;
    setupRoad();
    updateHud();

    if (showOverlay) {
        overlayTitle.textContent = 'Retrowave Rush';
        overlayMessage.innerHTML = 'Slide into the neon highway.<br />Press <span class="key">SPACE</span> to start.';
        overlay.classList.remove('hidden');
    }
}

function startGame() {
    if (state.running) {
        return;
    }

    if (state.gameOver) {
        resetGame(false);
    }

    state.running = true;
    state.gameOver = false;
    overlay.classList.add('hidden');
}

function triggerGameOver() {
    state.running = false;
    state.gameOver = true;

    if (state.score > state.bestScore) {
        state.bestScore = state.score;
        bestScoreEl.textContent = state.bestScore;
        saveBestScore();
    }

    overlayTitle.textContent = 'Neon Crash';
    overlayMessage.innerHTML = `Score: <strong>${state.score}</strong><br />Press <span class="key">SPACE</span> to race again.`;
    overlay.classList.remove('hidden');
}

function updateHud() {
    scoreEl.textContent = state.score;
    bestScoreEl.textContent = state.bestScore;
    speedEl.textContent = Math.round(state.speed * 24);
}

function loop(timestamp) {
    if (!lastTimestamp) {
        lastTimestamp = timestamp;
    }

    const delta = Math.min((timestamp - lastTimestamp) / 16.666, 3);
    lastTimestamp = timestamp;

    update(delta);
    draw();

    requestAnimationFrame(loop);
}

function update(delta) {
    const effectiveSpeed = state.running ? state.speed : state.baseSpeed * 0.45;

    laneDashOffset = (laneDashOffset + effectiveSpeed * delta * 3.2) % 120;
    updateTrails(delta, effectiveSpeed);

    if (!state.running) {
        return;
    }

    const boostMultiplier = input.boost ? 1.35 : 1;
    const acceleration = state.acceleration * (input.boost ? 1.6 : 1);
    const maxSpeed = state.maxSpeed * boostMultiplier;
    state.speed = Math.min(state.speed + acceleration * delta, maxSpeed);

    const movement = car.handling * delta * state.speed * (input.boost ? 1.2 : 1);
    if (input.left) {
        car.x -= movement;
    }
    if (input.right) {
        car.x += movement;
    }

    const margin = 6;
    car.x = Math.max(road.left + margin, Math.min(car.x, road.right - car.width - margin));

    trailTimer += delta;
    if (trailTimer > 1.4) {
        createTrail();
        trailTimer = 0;
    }

    spawnTimer += delta * state.speed;
    const spawnInterval = Math.max(68 - state.speed * 2.8, 32);
    if (spawnTimer >= spawnInterval) {
        spawnObstacle();
        spawnTimer = 0;
    }

    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
        const obstacle = obstacles[i];
        obstacle.y += delta * state.speed * obstacle.speedFactor * (input.boost ? 1.15 : 1);

        if (obstacle.y > canvas.height + obstacle.height) {
            obstacles.splice(i, 1);
            addScore(Math.round(12 + state.speed * 2.2));
            continue;
        }

        if (isColliding(car, obstacle)) {
            triggerGameOver();
            break;
        }
    }

    updateHud();
}

function addScore(amount) {
    state.score += amount;
}

function updateTrails(delta, effectiveSpeed) {
    for (let i = trails.length - 1; i >= 0; i -= 1) {
        const trail = trails[i];
        trail.y += effectiveSpeed * delta * 2.4;
        trail.opacity -= delta * 0.04;
        trail.height += delta * 4;

        if (trail.opacity <= 0) {
            trails.splice(i, 1);
        }
    }
}

function createTrail() {
    trails.push({
        x: car.x + car.width / 2,
        y: car.y + car.height - 10,
        width: car.width * 0.55,
        height: car.height * 0.25,
        opacity: 0.75
    });
}

function spawnObstacle() {
    const availableLanes = [];
    for (let lane = 0; lane < road.laneCount; lane += 1) {
        const laneHasRecent = obstacles.some((obs) => obs.lane === lane && obs.y < obs.height * 2.4);
        if (!laneHasRecent) {
            availableLanes.push(lane);
        }
    }

    if (availableLanes.length === 0) {
        return;
    }

    const lane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
    const width = car.width * (0.85 + Math.random() * 0.25);
    const height = car.height * (0.65 + Math.random() * 0.25);
    const x = road.left + lane * road.laneWidth + (road.laneWidth - width) / 2;
    const y = -height - Math.random() * 160;
    const palette = ['#ff2d92', '#ff8f0f', '#34f5c5', '#836bff'];
    const color = palette[Math.floor(Math.random() * palette.length)];

    obstacles.push({
        lane,
        x,
        y,
        width,
        height,
        color,
        speedFactor: 0.85 + Math.random() * 0.35
    });
}

function isColliding(a, b) {
    return (
        a.x < b.x + b.width - 10 &&
        a.x + a.width - 10 > b.x &&
        a.y < b.y + b.height - 18 &&
        a.y + a.height - 18 > b.y
    );
}

function draw() {
    drawBackground();
    drawRoad();
    drawTrails();
    drawObstacles();
    drawCar();
    drawSpeedGlow();
}

function drawBackground() {
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2d0066');
    gradient.addColorStop(0.35, '#160037');
    gradient.addColorStop(1, '#03000a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sunY = canvas.height * 0.28;
    const sunRadius = canvas.height * 0.18;
    const sunGradient = ctx.createRadialGradient(canvas.width / 2, sunY, sunRadius * 0.15, canvas.width / 2, sunY, sunRadius);
    sunGradient.addColorStop(0, 'rgba(255, 217, 124, 0.95)');
    sunGradient.addColorStop(0.55, 'rgba(255, 64, 142, 0.75)');
    sunGradient.addColorStop(1, 'rgba(255, 0, 118, 0)');
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    const horizon = canvas.height * 0.52;
    const gridLines = 22;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(60, 247, 255, 0.22)';
    ctx.shadowColor = 'rgba(60, 247, 255, 0.35)';
    ctx.shadowBlur = 12;

    for (let i = 0; i < gridLines; i += 1) {
        const t = i / gridLines;
        const y = horizon + Math.pow(t, 2) * (canvas.height - horizon);
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.8;
    const verticalLines = 14;
    const centerX = canvas.width / 2;
    for (let i = -verticalLines; i <= verticalLines; i += 1) {
        const t = i / verticalLines;
        const xTop = centerX + t * canvas.width * 0.18;
        const xBottom = centerX + t * canvas.width * 0.7;
        ctx.beginPath();
        ctx.moveTo(xTop, horizon);
        ctx.lineTo(xBottom, canvas.height);
        ctx.stroke();
    }

    ctx.restore();
}

function drawRoad() {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 0, 18, 0.9)';
    ctx.fillRect(road.left, 0, road.right - road.left, canvas.height);

    ctx.strokeStyle = 'rgba(255, 0, 230, 0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(road.left, 0, road.right - road.left, canvas.height);

    const laneWidth = road.laneWidth;
    ctx.setLineDash([32, 24]);
    ctx.lineDashOffset = -laneDashOffset;
    ctx.strokeStyle = 'rgba(248, 255, 53, 0.65)';
    ctx.lineWidth = 4;

    for (let i = 1; i < road.laneCount; i += 1) {
        const x = road.left + laneWidth * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    ctx.restore();
}

function drawTrails() {
    ctx.save();
    trails.forEach((trail) => {
        const gradient = ctx.createLinearGradient(trail.x, trail.y - trail.height, trail.x, trail.y + trail.height);
        gradient.addColorStop(0, 'rgba(60, 247, 255, 0)');
        gradient.addColorStop(0.45, `rgba(60, 247, 255, ${trail.opacity})`);
        gradient.addColorStop(1, 'rgba(60, 247, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(trail.x, trail.y, trail.width, trail.height, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawObstacles() {
    obstacles.forEach((obstacle) => {
        ctx.save();
        ctx.shadowColor = obstacle.color;
        ctx.shadowBlur = 18;
        const gradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
        gradient.addColorStop(0, lightenColor(obstacle.color, 20));
        gradient.addColorStop(0.5, obstacle.color);
        gradient.addColorStop(1, darkenColor(obstacle.color, 25));
        ctx.fillStyle = gradient;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(6, 0, 18, 0.8)';
        ctx.fillRect(
            obstacle.x + obstacle.width * 0.2,
            obstacle.y + obstacle.height * 0.18,
            obstacle.width * 0.6,
            obstacle.height * 0.32
        );

        ctx.fillStyle = '#ffe66f';
        ctx.fillRect(obstacle.x + obstacle.width * 0.15, obstacle.y + obstacle.height - 12, obstacle.width * 0.25, 8);
        ctx.fillRect(
            obstacle.x + obstacle.width * 0.6,
            obstacle.y + obstacle.height - 12,
            obstacle.width * 0.25,
            8
        );
        ctx.restore();
    });
}

function drawCar() {
    ctx.save();
    ctx.shadowColor = 'rgba(60, 247, 255, 0.9)';
    ctx.shadowBlur = 24;
    const bodyGradient = ctx.createLinearGradient(car.x, car.y, car.x, car.y + car.height);
    bodyGradient.addColorStop(0, '#3cf7ff');
    bodyGradient.addColorStop(0.6, '#1b9bff');
    bodyGradient.addColorStop(1, '#0b2dff');
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(car.x, car.y, car.width, car.height);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(8, 0, 26, 0.85)';
    ctx.fillRect(car.x + car.width * 0.2, car.y + car.height * 0.18, car.width * 0.6, car.height * 0.32);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillRect(car.x + car.width * 0.18, car.y + car.height * 0.62, car.width * 0.64, car.height * 0.14);

    ctx.fillStyle = '#ff3df9';
    ctx.fillRect(car.x + car.width * 0.14, car.y + car.height - 14, car.width * 0.26, 10);
    ctx.fillRect(car.x + car.width * 0.6, car.y + car.height - 14, car.width * 0.26, 10);
    ctx.restore();
}

function drawSpeedGlow() {
    if (!state.running) {
        return;
    }

    const glowStrength = Math.min((state.speed - state.baseSpeed) / (state.maxSpeed - state.baseSpeed + 0.001), 1);
    const alpha = 0.2 + glowStrength * 0.35;

    const gradient = ctx.createRadialGradient(
        car.x + car.width / 2,
        car.y + car.height / 2,
        car.width * 0.2,
        car.x + car.width / 2,
        car.y + car.height / 2,
        car.width * 1.6
    );
    gradient.addColorStop(0, `rgba(60, 247, 255, ${alpha})`);
    gradient.addColorStop(1, 'rgba(60, 247, 255, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.fillRect(car.x - car.width, car.y - car.height, car.width * 3, car.height * 3);
    ctx.restore();
}

function lightenColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const lighten = (value) => Math.min(255, Math.floor(value + (amount / 100) * 255));
    return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
}

function darkenColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const darken = (value) => Math.max(0, Math.floor(value - (amount / 100) * 255));
    return `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`;
}

function hexToRgb(hex) {
    const parsed = hex.replace('#', '');
    const bigint = parseInt(parsed, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

function handleKeyDown(event) {
    switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
            input.left = true;
            event.preventDefault();
            break;
        case 'ArrowRight':
        case 'KeyD':
            input.right = true;
            event.preventDefault();
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            input.boost = true;
            break;
        case 'Space':
            startGame();
            event.preventDefault();
            break;
        default:
    }
}

function handleKeyUp(event) {
    switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
            input.left = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            input.right = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            input.boost = false;
            break;
        default:
    }
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
window.addEventListener('resize', setupRoad);

initialize();
