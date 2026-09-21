(()=> {
  const C = window.MIRRORBALL_CONFIG || {};
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const esc = s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const SESSION_KEY = "mirrorball35_session";
  const AVATARS = ["🪩","✨","💃","🕺","⭐","🔟","👠","🎩","💜","🎶"];
  const state = { user:null, view:"home", sound:true, ballroom:null, game:null };

  if (window.MIRRORBALL_ASSETS?.trophy) {
    document.documentElement.style.setProperty("--trophy-image",'url("'+window.MIRRORBALL_ASSETS.trophy+'")');
  }

  async function rpc(name,args={}) {
    const r = await fetch(C.supabaseUrl + "/rest/v1/rpc/" + name,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":C.supabaseAnonKey,
        "Authorization":"Bearer " + C.supabaseAnonKey
      },
      body:JSON.stringify(args)
    });
    let data=null;
    try { data=await r.json(); } catch {}
    if (!r.ok) throw new Error(data?.message || data?.hint || "Something went wrong");
    return data;
  }

  const token=()=>localStorage.getItem(SESSION_KEY)||"";
  const setToken=t=>t?localStorage.setItem(SESSION_KEY,t):localStorage.removeItem(SESSION_KEY);
  const now=()=>Date.now();
  const dt=x=>x?new Date(x):null;
  const fmtDate=x=>x?new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}).format(new Date(x))+" ET":"";
  const avatar=v=>String(v||"🪩").startsWith("data:image")
    ? '<img alt="" src="'+v+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
    : esc(v||"🪩");

  function playSting() {
    if (!state.sound) return;
    try {
      const A=window.AudioContext||window.webkitAudioContext,a=new A(),g=a.createGain();
      g.connect(a.destination);
      g.gain.setValueAtTime(.0001,a.currentTime);
      g.gain.exponentialRampToValueAtTime(.2,a.currentTime+.03);
      g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+2.2);
      [0,.13,.29,.48,.72,.95].forEach((t,i)=>{
        const o=a.createOscillator();
        o.type=i%2?"triangle":"sine";
        o.frequency.value=[392,523.25,659.25,783.99,1046.5,1318.5][i];
        o.connect(g);o.start(a.currentTime+t);o.stop(a.currentTime+t+.58);
      });
      setTimeout(()=>a.close(),2800);
    } catch {}
  }

  $("#enterBtn").onclick=()=>{
    playSting();
    $("#splash").style.opacity="0";
    $("#splash").style.transition="opacity .45s";
    setTimeout(()=>{
      $("#splash").remove();
      $("#shell").classList.remove("hidden");
      start();
    },460);
  };
  $("#soundBtn").onclick=e=>{
    state.sound=!state.sound;
    e.currentTarget.textContent=state.sound?"♪ intro sound on":"♪ intro sound off";
  };

  async function start() {
    if (token()) {
      try { state.user=await rpc("get_me",{p_token:token()}); }
      catch { setToken(""); }
    }
    await render();
  }

  async function refreshBallroom() {
    if (!state.user) return;
    state.ballroom=await rpc("get_ballroom",{p_token:token()});
    const ep=state.ballroom?.episode;
    if (ep?.slug) {
      state.game=await rpc("get_my_game_state",{p_token:token(),p_episode_slug:ep.slug});
    } else state.game=null;
  }

  function nav(on) {
    $("#nav").classList.toggle("hidden",!on);
    $("#profileChip").classList.toggle("hidden",!on);
    if (!on) return;
    $("#profileChip").innerHTML='<span class="mini-avatar">'+avatar(state.user.avatar)+'</span> @'+esc(state.user.username);
    $$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  }

  $("#nav").onclick=e=>{
    const b=e.target.closest("[data-view]");
    if(!b)return;
    state.view=b.dataset.view;
    render();
  };
  $("#profileChip").onclick=()=>{state.view="profile";render()};

  async function render() {
    if (!state.user) { nav(false);auth();return; }
    nav(true);
    if (!state.user.onboarding_seen) { onboarding();return; }
    if (!state.ballroom) {
      try { await refreshBallroom(); }
      catch(e){ return showErr(e.message); }
    }
    const fn={home,picks,standings,results,profile}[state.view]||home;
    await fn();
  }

  function auth() {
    $("#main").innerHTML='<div class="auth-wrap"><section class="card auth"><div class="kicker">WELCOME TO THE BALLROOM</div><h2>Join the Mirrorball Pool</h2><p class="muted">Create your player once. After that, come back with your username and 4-digit PIN.</p><div class="tabs"><button id="newTab" class="active">First time</button><button id="returnTab">Returning</button></div><div id="authForm"></div></section></div>';
    const swap=mode=>{
      const first=mode==="new";
      $("#newTab").classList.toggle("active",first);
      $("#returnTab").classList.toggle("active",!first);
      $("#authForm").innerHTML=first?signupForm():loginForm();
      first?bindSignup():bindLogin();
    };
    $("#newTab").onclick=()=>swap("new");
    $("#returnTab").onclick=()=>swap("return");
    swap("new");
  }

  function signupForm() {
    return '<div class="row2"><div class="field"><label>First name</label><input id="first" autocomplete="given-name"></div><div class="field"><label>Last name</label><input id="last" autocomplete="family-name"></div></div><div class="field"><label>Username</label><input id="username" maxlength="24" autocomplete="username" placeholder="mirrorballjulia"></div><div class="field"><label>4-digit PIN</label><input id="pin" inputmode="numeric" maxlength="4" type="password" placeholder="••••"></div><div class="field"><label>Choose a profile picture</label><div id="avatarGrid" class="avatar-grid">'+AVATARS.map((a,i)=>'<button type="button" class="avatar '+(!i?"selected":"")+'" data-avatar="'+a+'">'+a+'</button>').join("")+'</div><div class="upload"><label for="photo">Or upload your own photo</label><input id="photo" type="file" accept="image/*"><span id="photoName" class="tiny muted">No file selected</span></div></div><button id="signup" class="btn primary" style="width:100%;margin-top:8px">Create my player</button><div id="authError" class="error"></div>';
  }

  function loginForm() {
    return '<div class="field"><label>Username</label><input id="loginUser" autocomplete="username"></div><div class="field"><label>4-digit PIN</label><input id="loginPin" inputmode="numeric" maxlength="4" type="password"></div><button id="login" class="btn primary" style="width:100%;margin-top:8px">Enter the Ballroom</button><div id="authError" class="error"></div>';
  }

  async function compressImage(file) {
    return await new Promise((resolve,reject)=>{
      const img=new Image(),url=URL.createObjectURL(file);
      img.onload=()=>{
        try {
          const max=320,scale=Math.min(1,max/Math.max(img.width,img.height));
          const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
          const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext("2d");
          ctx.drawImage(img,0,0,w,h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg",.78));
        } catch(e){reject(e)}
      };
      img.onerror=()=>reject(new Error("Could not read that image."));
      img.src=url;
    });
  }

  function bindSignup() {
    let chosen="🪩";
    $$(".avatar").forEach(b=>b.onclick=()=>{
      $$(".avatar").forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected");chosen=b.dataset.avatar;
    });
    $("#photo").onchange=async e=>{
      const f=e.target.files[0];if(!f)return;
      if(f.size>6_000_000){e.target.value="";return alert("Please choose a photo under 6 MB.");}
      $("#photoName").textContent="Preparing "+f.name+"…";
      try { chosen=await compressImage(f);$("#photoName").textContent=f.name; }
      catch(err){$("#photoName").textContent="Could not use that photo";alert(err.message);}
    };
    $("#signup").onclick=async()=>{
      const first=$("#first").value.trim(),last=$("#last").value.trim(),username=$("#username").value.trim(),pin=$("#pin").value.trim();
      if(!first||!last||!/^[A-Za-z0-9_.-]{3,24}$/.test(username)||!/^[0-9]{4}$/.test(pin)) {
        return $("#authError").textContent="Enter your first and last name, a 3–24 character username, and a 4-digit PIN.";
      }
      try {
        $("#signup").disabled=true;$("#signup").textContent="Creating your player…";
        const x=await rpc("register_player",{p_first_name:first,p_last_name:last,p_username:username,p_pin:pin,p_avatar:chosen});
        setToken(x.token);state.user=x.player;state.ballroom=null;state.game=null;await render();
      } catch(e) {
        $("#authError").textContent=e.message;$("#signup").disabled=false;$("#signup").textContent="Create my player";
      }
    };
  }

  function bindLogin() {
    $("#login").onclick=async()=>{
      try {
        $("#login").disabled=true;$("#login").textContent="Opening the ballroom…";
        const x=await rpc("login_player",{p_username:$("#loginUser").value.trim(),p_pin:$("#loginPin").value.trim()});
        setToken(x.token);state.user=x.player;state.ballroom=null;state.game=null;await render();
      } catch(e) {
        $("#authError").textContent=e.message;$("#login").disabled=false;$("#login").textContent="Enter the Ballroom";
      }
    };
  }

  function scoringMarkup() {
    return '<div class="score-grid"><div class="score-box"><b>5</b><span>Exact total</span></div><div class="score-box"><b>3</b><span>1 point away</span></div><div class="score-box"><b>1</b><span>2 points away</span></div><div class="score-box"><b>+1</b><span>Each exact judge</span></div><div class="score-box"><b>+5</b><span>Top couple</span></div><div class="score-box"><b>+5</b><span>Elimination</span></div></div>';
  }

  function onboarding() {
    $("#main").innerHTML='<div class="auth-wrap"><section class="card auth"><div class="kicker">HOW THE GAME WORKS</div><h2>Score your way to the Mirrorball 🪩</h2><p class="muted">For each couple, predict every judge’s paddle score. Your predicted total is calculated automatically.</p>'+scoringMarkup()+'<div class="rules"><p><strong>Lock means lock.</strong> Once you submit a couple’s scores, they cannot be edited.</p><p><strong>You can play during the episode.</strong> Any prediction that is still open can be submitted until the episode ends.</p><p><strong>No peeking.</strong> Everyone’s picks stay hidden until the episode ends. Then the full group reveal opens automatically.</p></div><button id="gotIt" class="btn primary" style="width:100%">Got it — take me to the ballroom</button></section></div>';
    $("#gotIt").onclick=async()=>{state.user=await rpc("set_onboarding_seen",{p_token:token()});await render();};
  }

  function current() {
    const ep=state.ballroom?.episode;
    const couples=state.ballroom?.couples||[];
    const judges=Array.isArray(ep?.judges)?ep.judges:["Carrie Ann","Derek","Bruno"];
    const preds=Object.fromEntries((state.game?.predictions||[]).map(p=>[p.couple_slug,p]));
    return {ep,couples,judges,preds,bonus:state.game?.bonus||null};
  }

  function episodeStatus(ep) {
    if(!ep)return {label:"Season complete",kind:"closed"};
    const start=dt(ep.starts_at)?.getTime(),end=dt(ep.ends_at)?.getTime(),t=now();
    if(t<start)return {label:"Picks open",kind:"open"};
    if(t<end)return {label:"LIVE · Picks still open",kind:"live"};
    return {label:"Closed · Verifying results",kind:"closed"};
  }

  async function home() {
    const {ep,couples,preds}=current();
    if(!ep)return seasonComplete();
    const st=episodeStatus(ep),locked=Object.keys(preds).length;
    $("#main").innerHTML='<section class="card hero"><div class="kicker">WEEK '+ep.week+' · '+esc(ep.title).toUpperCase()+'</div><h1>Race for the Mirrorball</h1><p>'+esc(fmtDate(ep.starts_at))+'</p><div class="pillrow"><span class="pill '+st.kind+'">'+esc(st.label)+'</span><span class="pill">'+locked+'/'+couples.length+' couples locked</span><span class="pill">🔒 friends’ picks hidden until the episode ends</span></div><button id="goPicks" class="btn primary">Make predictions</button> <button id="howBtn" class="btn ghost">How scoring works</button></section><div class="grid2"><section class="card quick"><div class="kicker">YOUR PROGRESS</div><div class="big">'+locked+'/'+couples.length+'</div><div class="muted tiny">couple predictions locked for Week '+ep.week+'</div></section><section class="card quick"><div class="kicker">OFFICIAL RESULTS</div><div class="big">Auto</div><div class="muted tiny">scores sync after the episode and recalculate the leaderboard</div></section></div><section class="card quick source-card"><div class="kicker">DATA SOURCES</div><p class="muted tiny">Weekly score tables are synced automatically from the structured Season 35 scorecard, with ABC, Parade, and Entertainment Weekly kept as reference sources.</p></section>';
    $("#goPicks").onclick=()=>{state.view="picks";render();};
    $("#howBtn").onclick=()=>showScoring();
  }

  function showScoring() {
    $("#modal").innerHTML='<div class="modal-back"><section class="card modal-card"><div class="kicker">SCORING</div><h2 class="display">How points work</h2>'+scoringMarkup()+'<p class="muted">Judge bonuses stack on top of the total-score points. Highest-score and elimination picks are separate 5-point bonuses.</p><button id="closeModal" class="btn primary">Got it</button></section></div>';
    $("#closeModal").onclick=()=>$("#modal").innerHTML="";
  }

  function scoreOptions(selected) {
    let s='<option value="">—</option>';
    for(let i=1;i<=10;i++)s+='<option value="'+i+'" '+(Number(selected)===i?"selected":"")+'>'+i+'</option>';
    return s;
  }

  async function refreshGame() {
    const ep=state.ballroom?.episode;
    if(!ep)return;
    state.game=await rpc("get_my_game_state",{p_token:token(),p_episode_slug:ep.slug});
  }

  async function picks() {
    const {ep,couples,judges,preds,bonus}=current();
    if(!ep)return seasonComplete();
    const closed=now()>=dt(ep.ends_at).getTime();
    $("#main").innerHTML='<div class="section-head"><div><div class="kicker">WEEK '+ep.week+'</div><h2 class="section-title">'+esc(ep.title)+'</h2><div class="muted tiny">'+esc(fmtDate(ep.starts_at))+'</div></div><div class="muted tiny">'+Object.keys(preds).length+'/'+couples.length+' locked</div></div>'+(closed?'<section class="card quick notice"><strong>🔒 This episode is closed.</strong><div class="muted tiny">Predictions can no longer be submitted. Results will populate automatically after verification.</div></section>':'<section class="card quick notice"><strong>Once you lock a prediction, it cannot be changed.</strong><div class="muted tiny">Open predictions stay available through the live episode until it ends.</div></section>')+'<div id="couples"></div><section class="card bonus"><div class="kicker">BONUS PICKS</div><h3>Top score + elimination</h3><p class="muted tiny">5 points each. These are permanent once locked.</p><div class="row2"><div class="field"><label>Highest-scoring couple</label><select id="highest" '+(bonus||closed?"disabled":"")+'><option value="">Choose…</option>'+couples.map(c=>'<option value="'+c.slug+'" '+(bonus?.highest_slug===c.slug?"selected":"")+'>'+esc(c.celebrity)+'</option>').join("")+'</select></div><div class="field"><label>Eliminated couple</label><select id="elim" '+(bonus||closed?"disabled":"")+'><option value="">Choose…</option>'+couples.map(c=>'<option value="'+c.slug+'" '+(bonus?.eliminated_slug===c.slug?"selected":"")+'>'+esc(c.celebrity)+'</option>').join("")+'</select></div></div>'+(bonus?'<div class="locked">✓ Bonus picks locked</div>':closed?'<div class="muted tiny">Bonus picks closed.</div>':'<button id="lockBonus" class="btn secondary">Lock bonus picks</button>')+'</section>';

    const box=$("#couples");
    couples.forEach(c=>{
      const p=preds[c.slug],el=document.createElement("section");
      el.className="card couple";
      const detail=[c.dance_style,c.song].filter(Boolean).join(" · ")||"Dance details coming soon";
      el.innerHTML='<div class="couple-head"><div class="names"><strong>'+esc(c.celebrity)+'</strong><small>with '+esc(c.pro)+'</small><div class="dance">'+esc(detail)+'</div></div>'+(p?'<span class="pill locked">🔒 '+p.predicted_total+'</span>':closed?'<span class="pill">CLOSED</span>':'<span class="pill">OPEN</span>')+'</div>'+(p?'<div class="result-row"><span>'+judges.map((j,i)=>esc(j)+" "+(p.judge_scores?.[i]??"—")).join(" · ")+'</span><strong>'+p.predicted_total+'</strong></div>':closed?'<p class="muted tiny">No prediction was locked for this couple.</p>':'<div class="judges">'+judges.map((j,i)=>'<div class="judge"><label>'+esc(j)+'</label><select data-score="'+i+'">'+scoreOptions()+'</select></div>').join("")+'</div><div class="total">Predicted total: <span data-total>—</span></div><button class="btn secondary" data-lock="'+c.slug+'">Lock this couple</button>');
      box.appendChild(el);
      if(!p&&!closed){
        const sels=$$("select[data-score]",el),total=$("[data-total]",el);
        const calc=()=>{
          const v=sels.map(s=>Number(s.value));
          total.textContent=v.every(Boolean)?v.reduce((a,b)=>a+b,0):"—";
        };
        sels.forEach(s=>s.onchange=calc);
        $("[data-lock]",el).onclick=async()=>{
          const scores=sels.map(s=>Number(s.value));
          if(!scores.every(Boolean))return alert("Choose a score for every judge first.");
          if(!confirm("Lock "+c.celebrity+"? You will not be able to change these scores."))return;
          try{
            await rpc("lock_prediction",{p_token:token(),p_episode_slug:ep.slug,p_couple_slug:c.slug,p_judge_scores:scores});
            await refreshGame();render();
          }catch(e){alert(e.message);}
        };
      }
    });

    if(!bonus&&!closed)$("#lockBonus").onclick=async()=>{
      const h=$("#highest").value,e=$("#elim").value;
      if(!h||!e)return alert("Choose both bonus picks first.");
      if(!confirm("Lock both bonus picks? You will not be able to change them."))return;
      try{
        await rpc("lock_bonus_picks",{p_token:token(),p_episode_slug:ep.slug,p_highest_slug:h,p_eliminated_slug:e});
        await refreshGame();render();
      }catch(err){alert(err.message);}
    };
  }

  async function standings() {
    const ep=state.ballroom?.episode;
    if(!ep)return seasonComplete();
    let rows=[];
    try{rows=await rpc("get_standings",{p_token:token(),p_episode_slug:ep.slug});}
    catch(e){return showErr(e.message);}
    $("#main").innerHTML='<div class="section-head"><div><div class="kicker">MIRRORBALL STANDINGS</div><h2 class="section-title">Season leaderboard</h2></div><button id="refreshStandings" class="btn ghost">Refresh</button></div><section class="card standings">'+(rows.length?rows.map((x,i)=>'<div class="stand-row"><div class="rank">'+(i===0?"👑":"#"+(i+1))+'</div><div class="stand-player"><span class="stand-avatar">'+avatar(x.avatar)+'</span><div><strong>@'+esc(x.username)+'</strong><div class="tiny muted">'+x.picks_locked+' current-week picks locked</div></div></div><div class="pts">'+x.total_points+' pts</div></div>').join(""):'<div class="quick muted">No players yet.</div>')+'</section>';
    $("#refreshStandings").onclick=()=>standings();
  }

  async function results() {
    let x;
    try{x=await rpc("get_latest_reveal",{p_token:token()});}
    catch(e){return showErr(e.message);}
    if(!x?.revealed){
      $("#main").innerHTML='<div class="section-head"><div><div class="kicker">RESULTS</div><h2 class="section-title">The ballroom reveal</h2></div></div><section class="card quick"><h3>Nothing to reveal yet 🪩</h3><p class="muted">After the first episode in the pool ends, everyone’s locked picks will appear here automatically.</p></section>';
      return;
    }

    const ep=x.episode,results=x.results||[],picks=x.picks||[],bonuses=x.bonus||[];
    const currentCouples=state.ballroom?.couples||[];
    const nameMap={};
    for(const c of currentCouples)nameMap[c.slug]=c.celebrity;
    for(const r of results)if(r.celebrity)nameMap[r.couple_slug]=r.celebrity;
    for(const p of picks)if(p.celebrity)nameMap[p.couple_slug]=p.celebrity;
    const resultMap=Object.fromEntries(results.map(r=>[r.couple_slug,r]));
    const grouped={};
    picks.forEach(p=>(grouped[p.username]??=[]).push(p));
    const userBonus=Object.fromEntries(bonuses.map(b=>[b.username,b]));

    $("#main").innerHTML='<div class="section-head"><div><div class="kicker">WEEK '+ep.week+' RESULTS</div><h2 class="section-title">'+esc(ep.title)+'</h2></div><span class="pill '+(ep.results_verified?"locked":"")+'">'+(ep.results_verified?"✓ Verified":"Syncing…")+'</span></div><section class="card quick"><h3>Friends’ picks are revealed ✨</h3><p class="muted">'+(results.length?"Official scores are in and points have been calculated.":"The episode is over, so picks are visible. Official scores are still syncing.")+'</p></section>'+(results.length?'<section class="card quick results-table"><div class="kicker">OFFICIAL SCORES</div>'+results.map(r=>'<div class="result-row"><span>'+esc(nameMap[r.couple_slug]||prettySlug(r.couple_slug))+(r.eliminated?' <span class="eliminated">· eliminated</span>':'')+'</span><strong>'+r.total+(r.highest?' 🏆':'')+'</strong></div>').join("")+'</section>':'')+Object.entries(grouped).map(([u,ps])=>'<section class="card quick player-reveal"><div class="reveal-head"><h3>@'+esc(u)+'</h3><strong>'+ps.reduce((a,p)=>a+Number(p.points||0),0)+' dance pts</strong></div>'+ps.sort((a,b)=>(nameMap[a.couple_slug]||a.couple_slug).localeCompare(nameMap[b.couple_slug]||b.couple_slug)).map(p=>{const r=resultMap[p.couple_slug];return '<div class="result-row"><span>'+esc(nameMap[p.couple_slug]||prettySlug(p.couple_slug))+' <small class="muted">'+(p.judge_scores||[]).join(" / ")+'</small></span><span><strong>'+p.predicted_total+'</strong>'+(r?' <small class="muted">vs '+r.total+'</small>':'')+' <span class="points-chip">+'+(p.points||0)+'</span></span></div>';}).join("")+(userBonus[u]?'<div class="bonus-reveal tiny muted">Bonus picks: highest '+esc(userBonus[u].highest_celebrity||nameMap[userBonus[u].highest_slug]||prettySlug(userBonus[u].highest_slug))+' · eliminated '+esc(userBonus[u].eliminated_celebrity||nameMap[userBonus[u].eliminated_slug]||prettySlug(userBonus[u].eliminated_slug))+' · <strong>+'+(userBonus[u].points||0)+' pts</strong></div>':'')+'</section>').join("")+(results[0]?.source_url?'<p class="tiny muted source-link">Official-score table source: <a href="'+esc(results[0].source_url)+'" target="_blank" rel="noopener">Season 35 weekly scorecard ↗</a></p>':'');
  }

  const prettySlug=s=>String(s||"").replace(/[-_]/g," ").replace(/\b\w/g,m=>m.toUpperCase());

  async function profile() {
    $("#main").innerHTML='<div class="section-head"><div><div class="kicker">PLAYER PROFILE</div><h2 class="section-title">'+esc(state.user.first_name)+' '+esc(state.user.last_name)+'</h2></div></div><section class="card quick"><div class="profile-avatar">'+avatar(state.user.avatar)+'</div><h3>@'+esc(state.user.username)+'</h3><p class="muted">Use your username and 4-digit PIN when you return. Your leaderboard name is your username.</p><button id="changeAvatar" class="btn ghost">Change profile picture</button> <button id="rulesBtn" class="btn ghost">Scoring rules</button> <button id="logout" class="btn danger">Log out</button></section>';
    $("#logout").onclick=()=>{setToken("");state.user=null;state.ballroom=null;state.game=null;state.view="home";render();};
    $("#changeAvatar").onclick=profileModal;
    $("#rulesBtn").onclick=showScoring;
  }

  function profileModal() {
    $("#modal").innerHTML='<div class="modal-back"><section class="card modal-card"><h2 class="display">Choose your profile picture</h2><div class="avatar-grid">'+AVATARS.map(a=>'<button class="avatar" data-a="'+a+'">'+a+'</button>').join("")+'</div><div class="upload"><label for="modalPhoto">Upload your own</label><input id="modalPhoto" type="file" accept="image/*"></div><button id="closeModal" class="btn ghost" style="margin-top:12px">Close</button></section></div>';
    $("#closeModal").onclick=()=>$("#modal").innerHTML="";
    $$("[data-a]").forEach(b=>b.onclick=()=>setAvatar(b.dataset.a));
    $("#modalPhoto").onchange=async e=>{
      const f=e.target.files[0];if(!f)return;
      if(f.size>6_000_000)return alert("Please choose a photo under 6 MB.");
      try{await setAvatar(await compressImage(f));}catch(err){alert(err.message);}
    };
  }

  async function setAvatar(a) {
    try{
      state.user=await rpc("update_player_avatar",{p_token:token(),p_avatar:a});
      $("#modal").innerHTML="";render();
    }catch(e){alert(e.message);}
  }

  function seasonComplete() {
    $("#main").innerHTML='<section class="card hero"><div class="kicker">SEASON 35</div><h1>The final scores are in 🪩</h1><p>Head to the standings and results to see who won the Mirrorball Pool.</p><button class="btn primary" id="toStandings">See standings</button></section>';
    $("#toStandings").onclick=()=>{state.view="standings";render();};
  }

  function showErr(message) {
    $("#main").innerHTML='<section class="card quick"><h3>Something went wrong</h3><p class="error">'+esc(message)+'</p><button id="retry" class="btn primary">Try again</button></section>';
    $("#retry").onclick=()=>{state.ballroom=null;state.game=null;render();};
  }
})();