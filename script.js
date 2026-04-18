// --- PERSISTENCE ---
const SAVE_KEY = 'rogers_rings_final';
let save = JSON.parse(localStorage.getItem(SAVE_KEY)) || { hiScore: 0, coins: 50, topScores: [] };
function writeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

// --- AUDIO (Stadium Drumline) ---
let AC = null, playing = false, beatTimer = null, stepIndex = 0;
let onBeat = false;

// Drumline pattern: Heavy kicks, snappy marching snares
const pattern = {
    k: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], // Kick
    s: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0], // Snare
    c: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1]  // Crash/Whistle
};

function initAC() {
    if(AC) return;
    AC = new (window.AudioContext || window.webkitAudioContext)();
}

function playDrum(type, t) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    
    if (type === 'kick') {
        o.frequency.setValueAtTime(100, t);
        o.frequency.exponentialRampToValueAtTime(10, t + 0.3);
        g.gain.setValueAtTime(1, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        o.start(t); o.stop(t + 0.3);
        beatPulseAmt = 1; // Trigger visual pulse
    } else if (type === 'snare') {
        o.type = 'triangle';
        o.frequency.setValueAtTime(250, t);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        o.start(t); o.stop(t + 0.1);
        
        // Noise layer for snare
        const ns = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain();
        const len = AC.sampleRate * 0.1; const buf = AC.createBuffer(1, len, AC.sampleRate);
        const d = buf.getChannelData(0); for(let i=0; i<len; i++) d[i] = Math.random()*2-1;
        ns.buffer = buf; nf.type = 'highpass'; nf.frequency.value = 1000;
        ns.connect(nf); nf.connect(ng); ng.connect(AC.destination);
        ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        ns.start(t);
    }
}

function startBeat() {
    initAC(); if (AC.state === 'suspended') AC.resume();
    playing = true;
    let nextTime = AC.currentTime + 0.1;
    let stepDur = 60 / 105 / 4; // 105 BPM

    function tick() {
        if(!playing) return;
        while(nextTime < AC.currentTime + 0.1) {
            let i = stepIndex % 16;
            setTimeout(() => { onBeat = (pattern.k[i] || pattern.s[i]) === 1; }, Math.max(0, (nextTime - AC.currentTime)*1000 - 50));
            
            if(pattern.k[i]) playDrum('kick', nextTime);
            if(pattern.s[i]) playDrum('snare', nextTime);
            
            stepIndex++; nextTime += stepDur;
        }
        beatTimer = setTimeout(tick, 30);
    }
    tick();
}

function playFX(type) {
    if(!AC) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if(type === 'jump') {
        o.type = 'sine'; o.frequency.setValueAtTime(300, AC.currentTime);
        o.frequency.exponentialRampToValueAtTime(600, AC.currentTime + 0.1);
        g.gain.setValueAtTime(0.3, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.1);
        o.start(); o.stop(AC.currentTime + 0.1);
    } else if (type === 'coin') {
        o.type = 'square'; o.frequency.setValueAtTime(880, AC.currentTime);
        g.gain.setValueAtTime(0.1, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.1);
        o.start(); o.stop(AC.currentTime + 0.1);
    } else if (type === 'hit') {
        o.type = 'sawtooth'; o.frequency.setValueAtTime(100, AC.currentTime);
        o.frequency.exponentialRampToValueAtTime(10, AC.currentTime + 0.3);
        g.gain.setValueAtTime(0.5, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + 0.3);
        o.start(); o.stop(AC.currentTime + 0.3);
    }
}

// --- GAME ENGINE ---
const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const W = 860, H = 300, GY = H - 52;

let gs = 'idle', score = 0, frame = 0, spd = 5, coins = 0;
let combo = 1, maxCombo = 1, comboTimer = 0, rhythmScore = 0;
let beatPulseAmt = 0, worldX = 0, lastTime = 0, spawnTimer = 0;

const P = {
    x: 110, y: GY, vy: 0, w: 26, h: 48,
    jumps: 0, maxJ: 2, sliding: false, slideT: 0,
    shield: false, beastMode: false, beastT: 0
};

let obstacles = [], pickups = [], particles = [];

// --- SHOP LOGIC ---
window.buyBuff = function(type, cost) {
    if (save.coins >= cost) {
        save.coins -= cost;
        if(type === 'shield') { P.shield = true; notif("SHIELD EQUIPPED"); }
        if(type === 'cleats') { P.maxJ = 3; notif("TRIPLE JUMP READY"); }
        writeSave(); updateHUD();
        if(AC) playFX('coin');
    } else {
        notif("NOT ENOUGH COINS");
    }
};

// --- DRAWING ---
function drawWorld(dtf) {
    const isMNF = score > 500; // Monday Night Football lights on
    
    // Sky
    ctx.fillStyle = isMNF ? '#050a0f' : '#1A2A3A';
    ctx.fillRect(0, 0, W, GY);
    
    // Stadium Lights (MNF)
    if (isMNF) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath(); ctx.moveTo(W*0.3, 0); ctx.lineTo(W*0.1, GY); ctx.lineTo(W*0.5, GY); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W*0.7, 0); ctx.lineTo(W*0.5, GY); ctx.lineTo(W*0.9, GY); ctx.fill();
    }

    // Turf
    ctx.fillStyle = varTurf = isMNF ? '#061406' : '#0a1c0a';
    ctx.fillRect(0, GY, W, H - GY);

    // Yard Lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
    let offset = worldX % 100;
    for(let i = -offset; i < W; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, GY); ctx.lineTo(i, H); ctx.stroke();
    }
    
    // Beat Line
    ctx.strokeStyle = beatPulseAmt > 0.5 ? '#FFB612' : '#555'; 
    ctx.lineWidth = 2 + beatPulseAmt*2;
    ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();
}

function drawPlayer() {
    const py = P.sliding ? P.y + 24 : P.y;
    const ph = P.sliding ? 24 : 48;
    ctx.save();
    
    if(P.beastMode) {
        ctx.shadowColor = '#FFB612'; ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(frame*0.5);
    }

    // Helmet
    ctx.fillStyle = '#FFB612';
    ctx.beginPath(); ctx.arc(P.x + P.w/2, py + 8, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#101820'; ctx.fillRect(P.x + P.w/2 - 2, py, 4, 10); // Stripe

    // Jersey
    ctx.fillStyle = P.beastMode ? '#FFB612' : '#101820';
    if(P.sliding) {
        ctx.fillRect(P.x - 10, py + 10, P.w + 20, 14);
    } else {
        ctx.fillRect(P.x, py + 16, P.w, 20);
    }

    // Pants
    ctx.fillStyle = '#A5ACAF';
    if (!P.sliding) {
        let leg = Math.sin(frame * 0.2) * 8;
        if(P.y < GY) leg = 0; // Freeze legs in air
        ctx.fillRect(P.x + 4, py + 36, 6, 12 + leg);
        ctx.fillRect(P.x + 16, py + 36, 6, 12 - leg);
    }
    
    if(P.shield && !P.beastMode) {
        ctx.strokeStyle = '#00f'; ctx.lineWidth = 2;
        ctx.strokeRect(P.x - 4, py - 4, P.w + 8, ph + 8);
    }
    
    ctx.restore();
}

// --- UPDATE ---
function update(dt) {
    if (gs !== 'playing') return;
    let dtf = dt / 16.67;
    frame += dtf;
    
    score += (0.15 * (spd / 5) * combo) * dtf;
    
    // Difficulty Tiers
    let spawnLimit = 70;
    if (score > 1000) { spd = 9.5; spawnLimit = 45; }      // HOF
    else if (score > 500) { spd = 8; spawnLimit = 55; }     // Veteran
    else { spd = 6 + (score / 250); spawnLimit = 70; }      // Rookie
    
    worldX += spd * dtf;

    // Rhythm logic
    if(onBeat && playing) rhythmScore = Math.min(200, rhythmScore + 2*dtf);
    else rhythmScore = Math.max(0, rhythmScore - 0.5*dtf);
    
    if(comboTimer > 0) comboTimer -= dtf;
    else if(combo > 1) combo = Math.max(1, combo - 1);
    
    if(P.beastMode) {
        P.beastT -= dtf;
        if(P.beastT <= 0) P.beastMode = false;
    }

    // Physics
    let grav = (P.vy < 0 && P.jumpHeld) ? 0.45 : 0.7; // Variable jump height
    P.vy += grav * dtf;
    P.y += P.vy * dtf;
    if (P.y >= GY) { P.y = GY; P.vy = 0; P.jumps = 0; }
    if (P.sliding) { P.slideT -= dtf; if (P.slideT <= 0) P.sliding = false; }

    // Spawning
    spawnTimer += dtf;
    if (spawnTimer > spawnLimit) {
        let type = Math.random();
        if (type < 0.6) {
            // Defender (moves up/down if Vet+)
            let moveY = score > 500 ? Math.sin(frame*0.05)*10 : 0;
            obstacles.push({ x: W, y: GY - moveY, w: 24, h: 45, t: 'def' });
        } else if (type < 0.8) {
            // Low Pass (forces slide)
            obstacles.push({ x: W, y: GY - 35, w: 20, h: 12, t: 'ball' });
        } else {
            // Coin
            pickups.push({ x: W, y: GY - 40 - Math.random()*20, w: 14, h: 14, t: 'coin' });
        }
        
        // Golden Pack Spawner (5x Combo Req)
        if (combo >= 5 && Math.random() > 0.8 && !P.beastMode) {
             pickups.push({ x: W, y: GY - 60, w: 20, h: 25, t: 'pack' });
        }
        spawnTimer = 0;
    }

    // Move & Collide
    obstacles.forEach(o => {
        o.x -= spd * dtf;
        let pTop = P.sliding ? P.y+24 : P.y;
        let pHt = P.sliding ? 24 : 48;
        if (P.x < o.x + o.w && P.x + P.w > o.x && pTop < o.y + o.h && pTop + pHt > o.y) {
            if (P.beastMode) {
                o.x = -100; score += 50; // Smash!
                playFX('hit');
            } else if (P.shield) {
                P.shield = false; o.x = -100;
                playFX('hit');
            } else {
                die();
            }
        }
    });
    obstacles = obstacles.filter(o => o.x > -50);
    
    pickups.forEach(p => {
        p.x -= spd * dtf;
        let pTop = P.sliding ? P.y+24 : P.y;
        let pHt = P.sliding ? 24 : 48;
        if (P.x < p.x + p.w && P.x + P.w > p.x && pTop < p.y + p.h && pTop + pHt > p.y) {
            if(p.t === 'coin') { coins++; save.coins++; score += 10*combo; playFX('coin'); }
            if(p.t === 'pack') { P.beastMode = true; P.beastT = 300; combo = 8; notif("BEAST MODE!"); playFX('jump'); }
            p.x = -100;
        }
    });
    pickups = pickups.filter(p => p.x > -50);

    if(beatPulseAmt > 0) beatPulseAmt = Math.max(0, beatPulseAmt - 0.05*dtf);
    updateHUD();
}

function draw() {
    ctx.clearRect(0,0,W,H);
    drawWorld();
    
    obstacles.forEach(o => {
        if(o.t === 'def') {
            ctx.fillStyle = '#A5ACAF'; ctx.fillRect(o.x, o.y, o.w, o.h);
            ctx.fillStyle = '#101820'; ctx.fillRect(o.x+4, o.y+5, 16, 12); // Helmet hole
        } else {
            ctx.fillStyle = '#8B2500'; ctx.beginPath(); ctx.ellipse(o.x+10, o.y+6, 12, 6, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(o.x+8, o.y+4, 4, 4); // Laces
        }
    });
    
    pickups.forEach(p => {
        if(p.t === 'coin') {
            ctx.fillStyle = '#FFB612'; ctx.beginPath(); ctx.arc(p.x+7, p.y+7, 7, 0, Math.PI*2); ctx.fill();
        } else if (p.t === 'pack') {
            ctx.fillStyle = '#FFD700'; ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.strokeStyle = '#fff'; ctx.strokeRect(p.x+2, p.y+2, p.w-4, p.h-4);
        }
    });
    
    drawPlayer();
}

function loop(t) {
    let dt = t - lastTime || 0;
    lastTime = t;
    update(dt);
    if(gs === 'playing') draw();
    requestAnimationFrame(loop);
}

// --- INPUT & TOUCH ---
let touchStartX = 0, touchStartY = 0;
window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: false});

window.addEventListener('touchend', e => {
    if (gs !== 'playing') return;
    let dx = Math.abs(e.changedTouches[0].screenX - touchStartX);
    let dy = Math.abs(e.changedTouches[0].screenY - touchStartY);

    if (dx > 30 || dy > 30) {
        if (dy > dx) {
            if (e.changedTouches[0].screenY < touchStartY) handleJump();
            else if (!P.sliding) { P.sliding = true; P.slideT = 30; }
        }
    } else {
        if (e.changedTouches[0].screenX > window.innerWidth / 2) handleJump();
        else if (!P.sliding) { P.sliding = true; P.slideT = 30; }
    }
});

const keys = {};
window.addEventListener('keydown', e => { 
    keys[e.code] = true; P.jumpHeld = true;
    if((e.code === 'Space' || e.code === 'ArrowUp')) handleJump();
    if(e.code === 'ArrowDown' && !P.sliding) { P.sliding = true; P.slideT = 30; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; if(e.code === 'Space' || e.code === 'ArrowUp') P.jumpHeld = false; });

function handleJump() {
    if(P.jumps < P.maxJ) {
        if(onBeat && playing) {
            combo = Math.min(combo + 1, 8); comboTimer = 100;
            if(combo > 1) notif("ON BEAT x" + combo);
        } else if(playing && combo > 1) { combo = 1; }
        maxCombo = Math.max(maxCombo, combo);
        
        P.vy = -13; P.jumps++; P.sliding = false;
        playFX('jump');
    }
}

// --- SYSTEM ---
function notif(txt) {
    const el = document.createElement('div'); el.className = 'notif'; el.textContent = txt;
    document.getElementById('notifs').appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function updateHUD() {
    document.getElementById('s-score').textContent = Math.floor(score);
    document.getElementById('s-best').textContent = save.hiScore;
    document.getElementById('s-coins').textContent = save.coins;
    document.getElementById('rhythm-fill').style.width = (rhythmScore*100/200) + '%';
    
    const cd = document.getElementById('combo-display');
    if(combo > 1) { cd.style.opacity = '1'; document.getElementById('combo-num').textContent = combo; }
    else cd.style.opacity = '0';
}

function die() {
    gs = 'dead'; playing = false; clearTimeout(beatTimer); playFX('hit');
    save.coins += coins;
    
    save.topScores.push(Math.floor(score));
    save.topScores.sort((a,b) => b-a);
    save.topScores = save.topScores.slice(0, 5);
    
    if(score > save.hiScore) save.hiScore = Math.floor(score);
    writeSave();
    
    document.getElementById('d-score').textContent = Math.floor(score);
    document.getElementById('d-coins').textContent = coins;
    document.getElementById('d-combo').textContent = "x" + maxCombo;
    document.getElementById('ov-dead').classList.remove('gone');
}

document.getElementById('btn-start').onclick = () => {
    gs = 'playing'; score = 0; coins = 0; combo = 1; maxCombo = 1; obstacles = []; pickups = [];
    P.jumps = 0; P.sliding = false; P.beastMode = false;
    document.getElementById('ov-start').classList.add('gone');
    startBeat();
};

// Init UI
if(!("ontouchstart" in window)) document.getElementById('desk-hint').style.display = 'block';
const lb = document.getElementById('lb-display');
lb.innerHTML = save.topScores.length > 0 ? "HALL OF FAME:<br>" + save.topScores.join(' · ') : "NO STATS YET";
updateHUD();
requestAnimationFrame(loop);
