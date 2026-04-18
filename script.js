const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'rogers_rings_v1';

// PERSISTENCE
let save = JSON.parse(localStorage.getItem(SAVE_KEY)) || { hiScore: 0, coins: 0 };
function writeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

// GAME STATE
let gameState = 'idle';
let score = 0, speed = 5, lastTime = 0;
const W = 800, H = 320, GROUND = 264;

const player = {
    x: 100, y: GROUND, w: 30, h: 50, vy: 0,
    jumps: 0, maxJumps: 2, sliding: false, slideTimer: 0,
    shield: false, trail: []
};

let obstacles = [], pickups = [], particles = [];
let spawnTimer = 0;

// PLAYER DRAWING (FOOTBALL PLAYER)
function drawPlayer() {
    const py = player.sliding ? player.y + 25 : player.y;
    const ph = player.sliding ? 25 : 50;

    // Helmet (Gold)
    ctx.fillStyle = '#FFB612';
    ctx.beginPath();
    ctx.arc(player.x + 15, py + 8, 10, 0, Math.PI * 2);
    ctx.fill();
    // Stripe
    ctx.fillStyle = '#101820';
    ctx.fillRect(player.x + 13, py, 4, 10);

    // Jersey (Black)
    ctx.fillStyle = '#101820';
    ctx.fillRect(player.x, py + 16, 30, 20);

    // Pants (Silver)
    ctx.fillStyle = '#A5ACAF';
    if (!player.sliding) {
        let legMove = Math.sin(Date.now() * 0.01) * 8;
        ctx.fillRect(player.x + 4, py + 36, 8, 14 + legMove);
        ctx.fillRect(player.x + 18, py + 36, 8, 14 - legMove);
    } else {
        ctx.fillRect(player.x - 5, py + 16, 15, 10);
    }
}

// SHOP LOGIC
window.buyBuff = function(type, cost) {
    if (save.coins >= cost) {
        save.coins -= cost;
        if(type === 'shield') player.shield = true;
        writeSave();
        updateHUD();
    }
};

function updateHUD() {
    document.getElementById('score-display').textContent = 'SCORE: ' + Math.floor(score);
    document.getElementById('coins-display').textContent = '🪙 ' + save.coins;
}

// GAME LOOP WITH DELTA TIME
function update(dt) {
    if (gameState !== 'playing') return;

    // Fair scoring & movement regardless of refresh rate
    const dtf = dt / 16.67; 
    score += (0.1 * (speed / 5)) * dtf;
    speed = 5 + (score / 150);

    // Physics
    player.vy += 0.7 * dtf;
    player.y += player.vy * dtf;
    if (player.y > GROUND) {
        player.y = GROUND;
        player.vy = 0;
        player.jumps = 0;
    }

    // Obstacle Spawning
    spawnTimer += dtf;
    if (spawnTimer > 60) {
        obstacles.push({ x: W, y: GROUND + 10, w: 20, h: 40 }); // Simple tackle dummy
        spawnTimer = 0;
    }

    obstacles.forEach(o => {
        o.x -= speed * dtf;
        // Collision
        if (player.x < o.x + o.w && player.x + 30 > o.x && player.y < o.y + o.h && player.y + 50 > o.y) {
            if (player.shield) {
                player.shield = false;
                o.x = -100;
            } else {
                gameOver();
            }
        }
    });
    
    // Cleanup
    obstacles = obstacles.filter(o => o.x > -50);
    updateHUD();
}

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    
    // Yard Lines
    ctx.strokeStyle = '#333';
    for(let i=0; i<W; i+=50) {
        ctx.beginPath();
        ctx.moveTo(i - (score % 50), GROUND + 50);
        ctx.lineTo(i - (score % 50), H);
        ctx.stroke();
    }

    ctx.fillStyle = '#222';
    ctx.fillRect(0, GROUND + 50, W, 2);

    obstacles.forEach(o => {
        ctx.fillStyle = '#A5ACAF';
        ctx.fillRect(o.x, o.y, o.w, o.h);
    });

    drawPlayer();
}

function gameOver() {
    gameState = 'dead';
    if (score > save.hiScore) save.hiScore = Math.floor(score);
    writeSave();
    document.getElementById('death-stats').innerHTML = `SCORE: ${Math.floor(score)}<br>BEST: ${save.hiScore}`;
    document.getElementById('death-overlay').classList.remove('hidden');
}

function loop(t) {
    let dt = t - lastTime;
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}

// INPUTS
window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (player.jumps < player.maxJumps) {
            player.vy = -12;
            player.jumps++;
        }
    }
});

document.getElementById('startBtn').onclick = () => {
    gameState = 'playing';
    score = 0;
    obstacles = [];
    document.getElementById('start-overlay').classList.add('hidden');
};

document.getElementById('restartBtn').onclick = () => {
    location.reload();
};

requestAnimationFrame(loop);
