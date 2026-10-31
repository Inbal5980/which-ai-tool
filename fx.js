/* אפקטים: קונפטי (canvas) ומחיאות כפיים (WebAudio, נוצרות בדפדפן – בלי קבצים חיצוניים) */
(function(){
  'use strict';
  var FX = window.FX = { stats: { bursts: 0, sounds: 0, lastSound: null, errors: [] } };

  // ---------- קונפטי ----------
  var cv = null, ctx = null, parts = [], raf = null, rainUntil = 0, W = 0, H = 0;
  var COLORS = ['#f59e0b','#fde047','#22c55e','#3b82f6','#8b5cf6','#ec4899','#ef4444','#14b8a6','#a78bfa','#fb923c'];
  function size(){ if (!cv) return; var d = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; cv.width = W*d; cv.height = H*d; ctx.setTransform(d,0,0,d,0,0); }
  function ensure(){
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden','true'); document.body.appendChild(cv); ctx = cv.getContext('2d'); window.addEventListener('resize', size); }
    size();
  }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function piece(x, y, vx, vy){
    parts.push({ x:x, y:y, vx:vx, vy:vy, w:rnd(7,13), h:rnd(10,19), r:rnd(0,6.28), vr:rnd(-0.25,0.25), t:rnd(0,6.28), vt:rnd(0.08,0.2),
      c: COLORS[(Math.random()*COLORS.length)|0], round: Math.random() < 0.18 });
  }
  function burst(n){
    var k = Math.min(1.6, Math.max(0.7, W/1400));
    for (var i=0;i<n;i++){
      var side = i % 2 ? 1 : -1, x = side < 0 ? rnd(-10, W*0.05) : rnd(W*0.95, W+10);
      var ang = side < 0 ? rnd(-1.35, -0.55) : rnd(-2.6, -1.8), sp = rnd(13, 27)*k;
      piece(x, H + 10, Math.cos(ang)*sp, Math.sin(ang)*sp*1.25);
    }
  }
  function rain(n){ for (var i=0;i<n;i++) piece(rnd(0,W), rnd(-60,-10), rnd(-2,2), rnd(2,6)); }
  function tick(){
    raf = null;
    ctx.clearRect(0,0,W,H);
    if (performance.now() < rainUntil) rain(W > 900 ? 5 : 2);
    var keep = [];
    for (var i=0;i<parts.length;i++){
      var p = parts[i];
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; if (p.vy > 7.5) p.vy = 7.5;
      p.t += p.vt; p.x += p.vx + Math.sin(p.t)*1.2; p.y += p.vy; p.r += p.vr;
      if (p.y < H + 40 && p.x > -60 && p.x < W + 60) keep.push(p); else continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0,0,p.w*0.45,0,6.283); ctx.fill(); }
      else { ctx.scale(1, Math.cos(p.t)); ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); }
      ctx.restore();
    }
    parts = keep; FX.stats.particles = parts.length;
    if (parts.length || performance.now() < rainUntil) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0,0,W,H);
  }
  FX.confetti = function(o){
    o = o || {}; ensure();
    var n = o.count || 380, dur = o.duration || 5500;
    burst(Math.round(n*0.6));
    setTimeout(function(){ burst(Math.round(n*0.4)); }, 450);
    rainUntil = Math.max(rainUntil, performance.now() + dur*0.6);
    FX.stats.bursts++; FX.stats.lastBurst = Date.now();
    if (!raf) raf = requestAnimationFrame(tick);
  };
  FX.active = function(){ return parts.length; };

  // ---------- סאונד ----------
  var KEY = 'whichTool.mute', AC = null, applauseBuf = null;
  var muted = false; try { muted = localStorage.getItem(KEY) === '1'; } catch(e){}
  FX.muted = function(){ return muted; };
  FX.setMuted = function(m){ muted = !!m; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch(e){} if (muted && AC && master) master.gain.setTargetAtTime(0, AC.currentTime, 0.05); else if (AC && master) master.gain.setTargetAtTime(1, AC.currentTime, 0.05); };
  var master = null;
  function ac(){
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); master = AC.createGain(); master.connect(AC.destination); }
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch(e){ FX.stats.errors.push(String(e)); return null; }
  }
  FX.unlock = ac;
  // הדפדפן מאפשר סאונד רק אחרי לחיצה – פותחים את ערוץ השמע בלחיצה הראשונה של המנחה
  if (document.body && document.body.classList.contains('host')) ['pointerdown','keydown','touchstart'].forEach(function(ev){ document.addEventListener(ev, ac, true); });

  function makeApplause(c){
    var sr = c.sampleRate, dur = 5.2, len = Math.floor(sr*dur), buf = c.createBuffer(2, len, sr), peak = 0;
    function env(t){ return t < 0.35 ? t/0.35 : t < 3.0 ? 1 : Math.max(0, 1 - (t-3.0)/2.2); }
    for (var ch=0; ch<2; ch++){
      var d = buf.getChannelData(ch);
      for (var k=0; k<34; k++){
        var rate = 3.4 + Math.random()*2.4, t = Math.random()*0.25, tone = 0.25 + Math.random()*0.5;
        while (t < dur){
          var e = env(t);
          if (Math.random() < 0.15 + 0.85*e){
            var amp = (0.35 + Math.random()*0.65) * Math.sqrt(e), s0 = Math.floor(t*sr), L = Math.floor(sr*0.045), dec = sr*(0.0035 + Math.random()*0.006), prev = 0;
            for (var i=0; i<L && s0+i<len; i++){
              var nz = Math.random()*2 - 1; prev = prev*tone + nz*(1-tone); // צבע רעש שונה לכל מוחא/ת
              d[s0+i] += (nz - prev*0.6) * amp * Math.exp(-i/dec) * (i < 12 ? i/12 : 1);
            }
          }
          t += (1/rate) * (0.82 + Math.random()*0.36);
        }
      }
      for (var j=0;j<len;j++){ var a = Math.abs(d[j]); if (a > peak) peak = a; }
    }
    var g = peak ? 0.85/peak : 1;
    for (var ch2=0; ch2<2; ch2++){ var dd = buf.getChannelData(ch2); for (var q=0;q<len;q++) dd[q] *= g; }
    return buf;
  }
  function tone(c, f, t0, d, vol, type){
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.05);
  }
  FX.chime = function(level){
    if (muted) return false; var c = ac(); if (!c) return false;
    var t = c.currentTime + 0.02, base = level === 2 ? 659.25 : 523.25;
    tone(c, base, t, 0.5, 0.18); tone(c, base*1.5, t + 0.11, 0.7, 0.16);
    FX.stats.sounds++; FX.stats.lastSound = { kind: 'chime', at: Date.now(), state: c.state };
    return true;
  };
  FX.applause = function(){
    if (muted) { FX.stats.lastSound = { kind: 'muted', at: Date.now() }; return false; }
    var c = ac(); if (!c) return false;
    try {
      if (!applauseBuf) applauseBuf = makeApplause(c);
      var t = c.currentTime + 0.03;
      // פנפרה קצרה
      [523.25, 659.25, 783.99].forEach(function(f, i){ tone(c, f, t + i*0.12, 0.35, 0.16); });
      tone(c, 1046.5, t + 0.36, 1.1, 0.2); tone(c, 783.99, t + 0.36, 1.1, 0.12); tone(c, 659.25, t + 0.36, 1.1, 0.1);
      var src = c.createBufferSource(); src.buffer = applauseBuf;
      var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      var pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2200; pk.Q.value = 0.8; pk.gain.value = 4;
      var g = c.createGain(); g.gain.value = 0.9;
      src.connect(hp); hp.connect(pk); pk.connect(g); g.connect(master);
      src.start(t + 0.3);
      FX.stats.sounds++; FX.stats.lastSound = { kind: 'applause', at: Date.now(), state: c.state, seconds: applauseBuf.duration };
      return true;
    } catch(e){ FX.stats.errors.push(String(e)); return false; }
  };
  FX.celebrate = function(){ FX.confetti({ count: 420, duration: 6500 }); return FX.applause(); };
})();
