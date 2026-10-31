(function(){
  'use strict';
  var G = window.GAME, CARDS = G.cards, OPTS = G.options;
  var LS = 'whichTool.v1';
  var st = load();
  if (!st.voter) { st.voter = uid(); save(); }
  if (!st.answers) st.answers = {};
  if (!st.opened) st.opened = {};
  var cur = 0, editMode = false;
  // מצב המנחה מהשרת: pace "host" = לפי המנחה (ברירת מחדל), "free" = קצב חופשי
  var S = { pace: 'host', stage: 'wait', card: null, locked: [], round: null };
  var known = false, started = false, joined = false;

  function uid(){
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
  }
  function load(){ try { return JSON.parse(localStorage.getItem(LS)) || {answers:{}}; } catch(e){ return {answers:{}}; } }
  function save(){ try { localStorage.setItem(LS, JSON.stringify(st)); } catch(e){} }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function optLabel(id){ for (var i=0;i<OPTS.length;i++) if (OPTS[i].id===id) return OPTS[i]; return null; }
  function paced(){ return S.pace !== 'free'; }
  function idxOf(cardId){ for (var i=0;i<CARDS.length;i++) if (CARDS[i].id===cardId) return i; return 0; }
  function isLocked(cardId){ return S.locked && S.locked.indexOf(cardId) >= 0; }

  var toastT;
  function toast(msg){ var t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('show');},2600); }

  function api(path, body){
    return fetch(path, { method: body ? 'POST' : 'GET', headers: body ? {'content-type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined, cache:'no-store' })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok){ var e=new Error('http '+r.status); e.status=r.status; e.body=j; throw e; } return j; }); });
  }
  // true when the presenter reset the votes since this device last voted
  function syncRound(round){
    if (!round) return false;
    if (st.round && st.round !== round) { st.answers = {}; st.opened = {}; st.display = ''; st.round = round; save(); return true; }
    if (!st.round) { st.round = round; save(); }
    return false;
  }
  function screen(){ var a = document.querySelector('.screen.active'); return a ? a.id : ''; }
  function show(id){
    var was = screen();
    ['s-start','s-card','s-done','s-fb'].forEach(function(s){ $(s).classList.toggle('active', s===id); });
    if (was !== id) window.scrollTo(0,0);
  }

  function setHint(){
    var c = CARDS[cur], h = $('hint'); h.className = 'hint';
    if (isLocked(c.id)) { h.textContent = '🔒 ההצבעה על התרחיש הזה נעולה'; h.classList.add('lock'); }
    else if (paced()) {
      if (st.answers[c.id]) { h.textContent = 'נבחר ✓ – אפשר לשנות עד המעבר הבא'; h.classList.add('ok'); }
      else h.textContent = 'בחרו את הכלי המתאים';
    } else h.textContent = 'אפשר לחזור ולשנות תשובה בכל רגע';
  }

  function markOpened(id){ if (!st.opened[id]) { st.opened[id] = Date.now(); save(); } }
  function renderCard(){
    var c = CARDS[cur], lock = isLocked(c.id);
    markOpened(c.id);
    $('prog').textContent = 'תרחיש ' + (cur+1) + ' מתוך ' + CARDS.length;
    $('cnum').textContent = 'תרחיש ' + c.id;
    $('crole').textContent = c.role;
    $('ctext').textContent = c.text.replace(/ – /g, '\u00a0– ');
    var d = '';
    if (!paced()) CARDS.forEach(function(cc,i){
      var cls = 'dot' + (i===cur ? ' cur' : (st.answers[cc.id] ? ' done' : ''));
      d += '<button class="'+cls+'" type="button" data-i="'+i+'" aria-label="תרחיש '+(i+1)+'"></button>';
    });
    $('dots').innerHTML = d;
    var o = '', sel = st.answers[c.id];
    OPTS.forEach(function(op){
      var on = sel===op.id;
      o += '<button type="button" class="opt'+(on?' sel':'')+'" data-o="'+op.id+'" aria-pressed="'+on+'"'+(lock?' disabled':'')+'>'+
           '<span class="ic" aria-hidden="true">'+op.icon+'</span><span class="lb"><bdi>'+esc(op.label)+'</bdi></span><span class="ck" aria-hidden="true">'+(on?'✓':'')+'</span></button>';
    });
    $('opts').innerHTML = o;
    $('navrow').style.display = paced() ? 'none' : '';
    $('prevBtn').disabled = cur===0;
    $('nextBtn').textContent = cur===CARDS.length-1 ? 'סיום ←' : 'הבא ←';
    setHint();
  }

  var advT;
  function choose(optId){
    var c = CARDS[cur];
    if (isLocked(c.id)) { toast('ההצבעה על התרחיש הזה נעולה'); return; }
    st.answers[c.id] = optId; save();
    renderCard();
    sendVote(c.id, optId, 0, Date.now() - (st.opened[c.id] || Date.now()));
    clearTimeout(advT);
    if (paced()) return; // לפי המנחה: נשארים על הכרטיס עד שהמנחה מתקדמת
    advT = setTimeout(function(){ if (editMode) { editMode=false; renderDone(); show('s-done'); } else next(); }, 650);
  }
  function sendVote(card, choice, attempt, ms){
    api('api/vote', {voter: st.voter, name: st.name || '', card: card, choice: choice, ms: ms})
      .then(function(r){
        joined = true;
        if (r && r.round && st.round && r.round !== st.round) { st.answers = {}; st.answers[card] = choice; st.round = r.round; save(); renderCurrent(); }
        else if (r && r.round && !st.round) { st.round = r.round; save(); }
      })
      .catch(function(e){
        if (st.answers[card] !== choice) return; // superseded
        if (e && e.status === 409) {
          // the presenter moved on or locked the card before the vote landed
          delete st.answers[card]; save();
          if (e.body && e.body.state) applyState(e.body.state);
          toast(e.body && e.body.error === 'locked' ? 'ההצבעה על התרחיש הזה נעולה' : 'המנחה כבר עברה לתרחיש הבא');
          renderCurrent();
          return;
        }
        if (attempt < 4) { toast('ההצבעה לא נשלחה, מנסים שוב…'); setTimeout(function(){ sendVote(card, choice, attempt+1, ms); }, 1500*(attempt+1)); }
        else toast('אין חיבור. נסו לבחור שוב בעוד רגע');
      });
  }
  function renderCurrent(){ var s = screen(); if (s==='s-card') renderCard(); else if (s==='s-done') renderDone(); else if (s==='s-fb') renderFb(S.me); }

  function next(){
    clearTimeout(advT);
    if (cur < CARDS.length-1) { cur++; renderCard(); window.scrollTo(0,0); }
    else { renderDone(); show('s-done'); }
  }
  function prev(){ clearTimeout(advT); editMode=false; if (cur>0){ cur--; renderCard(); } }

  function renderDone(){
    var h='', p = paced();
    CARDS.forEach(function(c,i){
      var a = st.answers[c.id], op = a && optLabel(a);
      h += '<li><span><span class="r">'+esc(c.role)+'</span><br><span class="a'+(op?'':' none')+'">'+(op?op.icon+' <bdi>'+esc(op.label)+'</bdi>':'לא נבחר')+'</span></span>'+
           (p ? '' : '<button type="button" data-i="'+i+'">'+(op?'שינוי':'לבחירה')+'</button>')+'</li>';
    });
    $('summary').innerHTML = h;
    $('doneSub').style.display = p ? 'none' : '';
  }

  // ===== משוב אישי בסוף =====
  var PLACES = {1:['🥇','מקום ראשון','gold'], 2:['🥈','מקום שני','silver'], 3:['🥉','מקום שלישי','bronze']};
  function band(score, total){
    var r = total ? score/total : 0;
    if (score === total && total) return 'מושלם! 🏆 שליטה מלאה בכלים';
    if (r >= 0.7) return 'כל הכבוד! 👏 תחושת כיוון מצוינת';
    if (r >= 0.4) return 'יפה מאוד! 💪 עוד קצת תרגול וזה בכיס';
    if (score > 0) return 'התחלה טובה! 🌱 עכשיו כבר ברור יותר מתי כל כלי';
    return 'הכי טוב ללמוד דרך משחק 🌱 עכשיו הכל מסודר';
  }
  var fbKey = '', lastPlace = null;
  function renderFb(me){
    var key = JSON.stringify(me || null);
    if (key === fbKey) return; fbKey = key;
    var h = '<p class="fb-look">תסתכלו על המסך 👀</p>';
    if (!me) {
      $('fb').innerHTML = '<div class="done-wrap"><div class="big-emoji">👀</div><h2>תודה! תסתכלו על המסך</h2></div>'; return;
    }
    var sg = me.suggestions || {}, total = me.total || CARDS.length;
    var pl = me.place && PLACES[me.place];
    h += '<div class="fb-hero">'+
         '<div class="fb-name">'+esc(me.name || '')+'</div>'+
         '<div class="fb-score" aria-label="'+me.score+' מתוך '+total+'"><b>'+me.score+'</b><span>/'+total+'</span></div>'+
         '<div class="fb-line">'+esc(band(me.score, total))+'</div>'+
         (pl ? '<div class="fb-place '+pl[2]+'">'+pl[0]+' '+pl[1]+' בלוח האליפות!</div>' : '')+
         '</div><h3 class="fb-h">התשובות שלך</h3><ol class="fb-list">';
    CARDS.forEach(function(c){
      var mine = me.answers && me.answers[c.id], s = sg[c.id] || {}, ok = !!mine && mine === s.answer;
      var mo = mine && optLabel(mine), so = optLabel(s.answer);
      h += '<li class="'+(ok?'ok':'bad')+'"><div class="fh"><span class="mk" aria-label="'+(ok?'נכון':'לא נכון')+'">'+(ok?'✓':'✗')+'</span><b>'+esc(c.role)+'</b></div>'+
           '<div class="fa">התשובה שלך: '+(mo ? mo.icon+' <bdi>'+esc(mo.label)+'</bdi>' : '<span class="none">לא נבחר</span>')+'</div>'+
           (ok ? '' : '<div class="fs">המומלץ: '+(so ? so.icon+' <bdi>'+esc(so.label)+'</bdi>' : '')+'</div>')+
           (s.why ? '<div class="fw">'+esc(s.why)+'</div>' : '')+'</li>';
    });
    h += '</ol>';
    $('fb').innerHTML = h;
    if (me.place && me.place !== lastPlace && window.FX) { try { window.FX.confetti({count: 160, duration: 3500}); } catch(e){} }
    lastPlace = me.place || null;
  }

  function saveName(){ st.name = ($('name').value || '').trim().slice(0,24); save(); }
  function join(){
    api('api/join', {voter: st.voter, name: st.name || ''}).then(function(r){
      joined = true;
      var reset = r && syncRound(r.round);
      if (r && r.display) { st.display = r.display; save(); }
      renderStart(); if (reset) renderCurrent();
    }).catch(function(){});
  }

  // what the participant sees, from the presenter's state
  function renderStart(){
    var p = paced();
    $('startBtn').style.display = (p && started) ? 'none' : '';
    $('startBtn').textContent = p ? 'מוכנים ✓' : 'מתחילים ←';
    $('waitbox').classList.toggle('show', p && known);
    $('waitTxt').textContent = started ? '✓ מחכים שהמנחה תתחיל…' : 'מחכים שהמנחה תתחיל…';
    var me = $('meName');
    if (started && st.display) { me.innerHTML = 'בלוח האליפות תופיעו בשם: <b>'+esc(st.display)+'</b>'; me.style.display = ''; }
    else me.style.display = 'none';
  }
  function follow(){
    if (S.stage === 'end' || S.stage === 'board') { renderFb(S.me); show('s-fb'); return; }
    if (screen() === 's-fb') { fbKey = ''; if (!paced()) { renderDone(); show('s-done'); } }
    if (!paced()) { renderStart(); renderCurrent(); return; }
    if (S.card) {
      var i = idxOf(S.card);
      if (screen() !== 's-card' || cur !== i) { saveName(); cur = i; renderCard(); show('s-card'); if (!joined) join(); }
      else renderCard();
      return;
    }
    renderStart(); show('s-start');
  }
  function applyState(d){
    if (!d || !d.stage) return;
    var paceChanged = known && d.pace !== S.pace;
    var reset = syncRound(d.round);
    S = d; known = true;
    if (reset) { editMode = false; joined = false; started = false; fbKey = ''; lastPlace = null; renderStart(); show('s-start'); join(); }
    if (paceChanged && !paced()) {
      // switched to free pace: keep the current card, open the dots and arrows
      if (screen() === 's-done') renderDone();
    }
    follow();
  }

  var pollT;
  function poll(){
    clearTimeout(pollT);
    api('api/state?voter=' + encodeURIComponent(st.voter)).then(applyState).catch(function(){})
      .then(function(){ pollT = setTimeout(poll, 1600); });
  }
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) poll(); });

  function start(){
    saveName(); join(); started = true;
    if (paced()) { follow(); return; }
    // continue where they left off
    cur = 0;
    for (var i=0;i<CARDS.length;i++){ if (!st.answers[CARDS[i].id]) { cur = i; break; } if (i===CARDS.length-1) cur = 0; }
    renderCard(); show('s-card');
  }

  $('startBtn').addEventListener('click', start);
  $('name').addEventListener('keydown', function(e){ if (e.key==='Enter') start(); });
  $('name').addEventListener('change', saveName);
  $('nextBtn').addEventListener('click', function(){ editMode=false; next(); });
  $('prevBtn').addEventListener('click', prev);
  $('opts').addEventListener('click', function(e){ var b=e.target.closest('.opt'); if (b && !b.disabled) choose(b.getAttribute('data-o')); });
  $('dots').addEventListener('click', function(e){ var b=e.target.closest('.dot'); if (b && !paced()){ clearTimeout(advT); cur=+b.getAttribute('data-i'); renderCard(); } });
  $('summary').addEventListener('click', function(e){ var b=e.target.closest('button'); if (b && !paced()){ editMode=true; cur=+b.getAttribute('data-i'); renderCard(); show('s-card'); } });

  if (st.name) $('name').value = st.name;
  renderStart();
  join(); // count this phone on the presenter screen right away
  poll();
})();
