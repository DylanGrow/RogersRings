document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 860, H = 300, GY = 248;
  canvas.width = W; canvas.height = H;

  const SAVE_KEY = 'rogers_rings_final_v3';
  let save;
  try { save = JSON.parse(localStorage.getItem(SAVE_KEY)) || { hiScore: 0, coins: 50, topScores: [] }; }
  catch { save = { hiScore: 0, coins: 50, topScores: [] }; }
  const writeSave = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));

  let gs = 'idle', score = 0, frame = 0, spd = 6, lastTime = 0, spawnTimer = 0, sessionCoins = 0, lastCheerMilestone = -1;
  const P = { x:120, y:GY, vy:0, w:30, h:50, jumps:0, maxJ:2, sliding:false, slideT:0, shield:false };
  let obstacles = [], pickups = [];

  const AC = new (window.AudioContext || window.webkitAudioContext)();
  function playSFX(f, type, d) {
    if (AC.state === 'suspended') return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, AC.currentTime);
    g.gain.setValueAtTime(0.1, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.01, AC.currentTime + d);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  }
  function triggerCheer() {
    const cheer = document.getElementById('cheer-box');
    if (!cheer) return;
    cheer.classList.remove('cheer-anim'); void cheer.offsetWidth; cheer.classList.add('cheer-anim');
    playSFX(400, 'triangle', 0.5);
  }

  window.buyBuff = function(type, cost) {
    if (save.coins < cost) return;
    save.coins -= cost;
    if (type === 'shield') P.shield = true;
    if (type === 'cleats') P.maxJ = 3;
    writeSave(); updateHUD(); playSFX(880, 'sine', 0.1);
  };

  function resetGame() {
    score = 0; spd = 6; frame = 0; spawnTimer = 0; sessionCoins = 0; lastTime = 0; lastCheerMilestone = -1;
    Object.assign(P, { x:120, y:GY, vy:0, jumps:0, sliding:false, slideT:0, shield:false });
    obstacles = []; pickups = [];
  }

  function startGame() {
    AC.resume(); resetGame(); gs = 'playing';
    document.getElementById('start-screen')?.classList.add('hidden');
    document.getElementById('death-screen')?.classList.add('hidden');
  }

  function update(dt) {
    if (gs!== 'playing') return;
    const dtf = dt / 16.67;
    frame += dtf; score += 0.15 * (spd/6) * dtf; spd = Math.min(12, 6 + score/400);

    P.vy += 0.7 * dtf; P.y += P.vy * dtf;
    if (P.y > GY) { P.y = GY; P.vy = 0; P.jumps = 0; }
    if (P.sliding) { P.slideT -= dtf; if (P.slideT <= 0) P.sliding = false; }

    spawnTimer += dtf;
    if (spawnTimer > Math.max(40, 80 - score/20)) {
      const isHigh = Math.random() > 0.7;
      obstacles.push({ x:W, y:isHigh?GY-45:GY+10, w:25, h:isHigh?20:40, t:isHigh?'ball':'def', passed:false });
      if (Math.random() > 0.8) pickups.push({ x:W+50, y:GY-40, w:15, h:15 });
      spawnTimer = 0;
    }

    for (const o of obstacles) {
      o.x -= spd * dtf;
      const pY = P.sliding? P.y+25 : P.y;
      const pH = P.sliding? 25 : 50;
      const hit = P.x < o.x+o.w && P.x+P.w > o.x && pY < o.y+o.h && pY+pH > o.y;
      if (hit) {
        if (P.shield) { P.shield = false; o.x = -100; playSFX(200,'sawtooth',0.2); }
        else { endGame(); return; }
      }
      if (!o.passed && o.x + o.w < P.x) {
        o.passed = true;
        const milestone = Math.floor(score/50);
        if (milestone > 0 && milestone!== lastCheerMilestone) { lastCheerMilestone = milestone; triggerCheer(); }
      }
    }

    for (const p of pickups) {
      p.x -= spd * dtf;
      if (P.x < p.x+p.w && P.x+P.w > p.x && P.y < p.y+p.h && P.y+50 > p.y) {
        sessionCoins++; save.coins++; p.x = -100; playSFX(1200,'sine',0.1);
      }
    }
    obstacles = obstacles.filter(o => o.x > -50);
    pickups = pickups.filter(p => p.x > -50);
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#1a331a'; ctx.fillRect(0,GY,W,H-GY);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i=0;i<W+200;i+=100) ctx.fillRect(i-((score*15)%100), GY, 2, H-GY);

    obstacles.forEach(o => { ctx.fillStyle = o.t==='def'?'#A5ACAF':'#8B2500'; ctx.fillRect(o.x,o.y,o.w,o.h); });
    pickups.forEach(p => { ctx.fillStyle='#FFB612'; ctx.beginPath(); ctx.arc(p.x+7,p.y+7,7,0,Math.PI*2); ctx.fill(); });

    const pY = P.sliding? P.y+25 : P.y;
    ctx.fillStyle='#FFB612'; ctx.beginPath(); ctx.arc(P.x+15,pY+8,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#101820'; ctx.fillRect(P.x,pY+16,30,P.sliding?15:20);
    ctx.fillStyle='#A5ACAF'; if(!P.sliding) ctx.fillRect(P.x+5,pY+36,20,14);
  }

  function endGame() {
    if (gs === 'dead') return;
    gs = 'dead'; playSFX(100,'sawtooth',0.4);
    const final = Math.floor(score);
    if (final > save.hiScore) save.hiScore = final;
    save.topScores.push(final); save.topScores.sort((a,b)=>b-a); save.topScores = save.topScores.slice(0,5);
    writeSave();
    document.getElementById('final-stats').textContent = `DRIVE ENDED: ${final} YDS`;
    document.getElementById('death-screen')?.classList.remove('hidden');
  }

  function updateHUD() {
    document.getElementById('ui-score').textContent = Math.floor(score);
    document.getElementById('ui-best').textContent = save.hiScore;
    document.getElementById('ui-coins').textContent = save.coins;
  }

  function jump() { if (P.jumps < P.maxJ) { P.vy = -13; P.jumps++; P.sliding = false; playSFX(600,'sine',0.1); } }

  window.addEventListener('keydown', e => {
    if (gs!== 'playing') return;
    if (e.code==='Space'||e.code==='ArrowUp') { e.preventDefault(); jump(); }
    if (e.code==='ArrowDown') { P.sliding = true; P.slideT = 30; }
  });

  let tsY = 0;
  window.addEventListener('touchstart', e => { tsY = e.touches[0].clientY; }, {passive:true});
  window.addEventListener('touchend', e => {
    if (gs!== 'playing') return;
    const teY = e.changedTouches[0].clientY;
    if (tsY - teY > 30) jump(); else if (teY - tsY > 30) { P.sliding = true; P.slideT = 30; } else jump();
  });

  document.getElementById('start-btn')?.addEventListener('click', startGame);
  document.getElementById('restart-btn')?.addEventListener('click', startGame);

  function loop(t) {
    const dt = lastTime? t - lastTime : 0; lastTime = t;
    update(dt); draw(); updateHUD(); requestAnimationFrame(loop);
  }
  document.getElementById('ui-leaderboard').textContent = save.topScores.length? save.topScores.join(' · ') : 'EMPTY';
  requestAnimationFrame(loop);
});
