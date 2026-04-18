const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'rogers_rings_v1';

let save = JSON.parse(localStorage.getItem(SAVE_KEY)) || { hiScore: 0, coins: 100 };
function writeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

let gameState = 'idle', score = 0, speed = 5, lastTime = 0, spawnTimer = 0;
const W = 800, H = 320, GROUND = 264;

const player = { x: 100, y: GROUND, w: 30, h: 50, vy: 0, jumps: 0, maxJumps: 2, shield: false };
let obstacles = [];

function drawPlayer() {
    ctx.fillStyle = '#FFB612'; // Helmet
    ctx.beginPath(); ctx.arc(player.x + 15, player.y + 8, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#101820'; // Jersey
    ctx.fillRect(player.x, player.y + 16, 30, 20);
    ctx.fillStyle = '#A5ACAF'; // Pants
    let leg = Math.sin(Date.now() * 0.01) * 8;
    ctx.fillRect(player.x + 4, player.y + 36, 8, 14 + leg);
    ctx.fillRect(player.x + 18, player.y + 36, 8, 14 - leg);
    if(player.shield) {
        ctx.strokeStyle = '#00f'; ctx.lineWidth = 3;
        ctx.strokeRect(player.x - 5, player.y - 5, 40, 60);
    }
}

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

function update(dt) {
    if (gameState !== 'playing') return;
    let dtf = dt / 16.67;
    score += 0.1 * dtf;
    speed = 5 + (score / 200);

    player.vy += 0.7 * dtf;
    player.y += player.vy * dtf;
    if (player.y > GROUND) { player.y = GROUND; player.vy = 0; player.jumps = 0; }

    spawnTimer += dtf;
    if (spawnTimer > 70) {
        obstacles.push({ x: W, y: GROUND + 10, w: 25, h: 40 });
        spawnTimer = 0;
    }

    obstacles.forEach(o => {
        o.x -= speed * dtf;
        if (player.x < o.x + o.w && player.x + 30 > o.x && player.y < o.y + o.h && player.y + 50 > o.y) {
            if (player.shield) { player.shield = false; o.x = -100; }
            else { gameState = 'dead'; showDeath(); }
        }
    });
    obstacles = obstacles.filter(o => o.x > -50);
    updateHUD();
}

function showDeath() {
    save.coins += Math.floor(score / 10);
    writeSave();
    document.getElementById('death-stats').textContent = `FINAL SCORE: ${Math.floor(score)}`;
    document.getElementById('death-overlay').classList.remove('hidden');
}

function loop(t) {
    let dt = t - lastTime;
    lastTime = t;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#333'; ctx.fillRect(0, GROUND+50, W, 2);
    update(dt);
    obstacles.forEach(o => { ctx.fillStyle = '#A5ACAF'; ctx.fillRect(o.x, o.y, o.w, o.h); });
    drawPlayer();
    requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && player.jumps < player.maxJumps) {
        player.vy = -12; player.jumps++;
    }
});

document.getElementById('startBtn').onclick = () => {
    gameState = 'playing';
    document.getElementById('start-overlay').classList.add('hidden');
};

updateHUD();
requestAnimationFrame(loop);
