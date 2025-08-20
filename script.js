"use strict";
console.clear();

/* ===== Константи ===== */
const WITHDRAW_CHUNK = 50;          // вивід
const GAMES_TARGET = 100;           // за 100 ігор +10⭐
const GAMES_REWARD = 10;
const POST_AD_LOCK_MS = 15_000;     // 15 сек блок після реклами

// Adsgram (той самий блок для всього)
const ADSGRAM_BLOCK_ID = "int-13961";

// Завдання на 5 і 10 реклам (ізольовані)
const REWARD_5 = 5;                 // +5⭐ за 5 переглядів
const REWARD_10 = 10;               // +10⭐ за 10 переглядів
const COOLDOWN_24H = 24 * 60 * 60 * 1000;

/* ===== Допоміжні ===== */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1);

/* ===== Стан ===== */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

// Після реклами — блок
let playLockUntil = 0;
let playLockTimer = null;

// Adsgram контролери
let AdGameover = null;
let Ad5 = null;
let Ad10 = null;

// Ізольовані лічильники задач
let ads5Count = 0;
let ads5CooldownUntil = 0;

let ads10Count = 0;
let ads10CooldownUntil = 0;

function saveData(){
  localStorage.setItem("balance", String(balance));
  localStorage.setItem("subscribed", subscribed ? "true":"false");
  localStorage.setItem("task50Completed", task50Completed ? "true":"false");
  localStorage.setItem("highscore", String(highscore));
  localStorage.setItem("gamesPlayedSinceClaim", String(gamesPlayedSinceClaim));

  localStorage.setItem("ads5Count", String(ads5Count));
  localStorage.setItem("ads5CooldownUntil", String(ads5CooldownUntil));
  localStorage.setItem("ads10Count", String(ads10Count));
  localStorage.setItem("ads10CooldownUntil", String(ads10CooldownUntil));

  localStorage.setItem("playLockUntil", String(playLockUntil));
}

function setBalanceUI(){ $("balance").innerText = formatStars(balance); }
function addBalance(n){ balance = parseFloat((balance + n).toFixed(2)); setBalanceUI(); saveData(); }

/* ===== Telegram user/tag (для виводу) ===== */
function getTelegramUser(){
  const u = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) || null;
  if (!u) return { id:"", username:"", first_name:"", last_name:"" };
  return { id:u.id||"", username:u.username||"", first_name:u.first_name||"", last_name:u.last_name||"" };
}
function getUserTag(){
  const u = getTelegramUser();
  if (u.username) return "@"+u.username;
  const name = [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");
  if (name) return name;
  if (u.id) return "id"+u.id;
  return "Гравець";
}

/* ===== 20-символьні коди для «Вивести» (як і було) ===== */
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function genCore16() {
  const rnd = new Uint8Array(12);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
  else rnd.fill(Date.now() % 256);
  const u = (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0;
  const mix = ((Number(u) ^ (Date.now() & 0xffffffff)) >>> 0);
  rnd[8]^=(mix)&0xff; rnd[9]^=(mix>>>8)&0xff; rnd[10]^=(mix>>>16)&0xff; rnd[11]^=(mix>>>24)&0xff;
  let bits=0,value=0,out="";
  for(let i=0;i<rnd.length;i++){
    let b=rnd[i]; if (b<0) b+=256;
    bits+=8; value=(value<<8)|b;
    while(bits>=5){ out+=ALPH[(value >>> (bits-5)) & 31]; bits-=5; }
  }
  if(bits>0) out+=ALPH[(value << (5-bits)) & 31];
  while(out.length<16) out+=ALPH[Math.floor(Math.random()*ALPH.length)];
  return out.slice(0,16);
}
function checksumState(core){ let s=0; for(let i=0;i<core.length;i++){ const v=ALPH.indexOf(core[i]); s=((s*37)+(v+7))%9677; } return s; }
function versionCharFor(core){
  let sumEven=0,sumOdd=0;
  for(let i=0;i<core.length;i++){ const v=LETTERS.indexOf(core[i]); if (v>=0){ if((i%2)===0) sumEven=(sumEven+v)%32; else sumOdd=(sumOdd+v)%32; } }
  const idx0=Math.max(0,LETTERS.indexOf(core[0])), idx15=Math.max(0,LETTERS.indexOf(core[15]));
  const verIdx=((sumEven*11)+(sumOdd*7)+(idx0*3)+(idx15*5)+13)%32;
  return ALPH[verIdx];
}
function checkTail(core){ const s=checksumState(core); return ALPH[s%32]+ALPH[(s*31+3)%32]+ALPH[(s*17+5)%32]; }
function generateCode20(){ const core=genCore16(); const ver=versionCharFor(core); const chk=checkTail(core); return core.slice(0,8)+ver+core.slice(8)+chk; }

const DIGIT_MAP = { "2":"6","6":"3","3":"8","8":"5","5":"9","9":"4","4":"7","7":"2" };
const LETTER_MAP = {"A":"Q","B":"T","C":"M","D":"R","E":"K","F":"X","G":"A","H":"V","J":"C","K":"Z","L":"E","M":"H","N":"Y","P":"S","Q":"D","R":"B","S":"U","T":"F","U":"J","V":"G","W":"N","X":"P","Y":"W","Z":"L"};
const PERM1 = [11,2,17,6,14,19,0,8,4,16,1,13,9,3,18,5,12,7,15,10];
const PERM2 = [15,0,9,13,6,18,3,11,1,16,4,14,8,2,19,5,12,7,17,10];
function transformCodeHeavy(code){
  if (typeof code!=="string" || code.length!==20) return "";
  const sub=Array.from(code).map(ch=> DIGIT_MAP[ch] || LETTER_MAP[ch] || ch );
  const i2=ALPH.indexOf(code[2])>>>0, i7=ALPH.indexOf(code[7])>>>0, i13=ALPH.indexOf(code[13])>>>0, i19=ALPH.indexOf(code[19])>>>0;
  const choose=((i2+i7+i13+i19)%2)===0?PERM1:PERM2;
  const out=new Array(20); for(let i=0;i<20;i++) out[i]=sub[choose[i]]; return out.join("");
}

/* ===== Ініціалізація ===== */
window.onload = function(){
  // збереження
  balance = parseFloat(localStorage.getItem("balance") || "0");
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  highscore = parseInt(localStorage.getItem("highscore") || "0", 10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0", 10);

  ads5Count = parseInt(localStorage.getItem("ads5Count") || "0", 10);
  ads5CooldownUntil = parseInt(localStorage.getItem("ads5CooldownUntil") || "0", 10);
  ads10Count = parseInt(localStorage.getItem("ads10Count") || "0", 10);
  ads10CooldownUntil = parseInt(localStorage.getItem("ads10CooldownUntil") || "0", 10);

  playLockUntil = parseInt(localStorage.getItem("playLockUntil") || "0", 10);

  setBalanceUI();
  $("highscore").innerText = "🏆 " + highscore;
  updateGamesTaskUI();

  // підписка
  const subBtn=$("subscribeBtn");
  if (subBtn){
    if (subscribed){ subBtn.innerText="Виконано"; subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  // рекорд 50
  const t50=$("checkTask50");
  if (t50){
    if (task50Completed){ t50.innerText="Виконано"; t50.classList.add("done"); }
    t50.addEventListener("click", ()=>{
      if (highscore>=50 && !task50Completed){
        addBalance(10);
        t50.innerText="Виконано"; t50.classList.add("done");
        task50Completed = true; saveData();
      } else if (highscore<50){
        alert("❌ Твій рекорд замалий (потрібно 50+)");
      }
    });
  }

  // завдання 5/10 реклам
  $("watchAds5Btn").addEventListener("click", onWatchAds5);
  $("watchAds10Btn").addEventListener("click", onWatchAds10);
  startDailyTasksTicker();

  // 100 ігор
  $("checkGames100Btn").addEventListener("click", onCheckGames100);

  // друзі
  const link="https://t.me/Stacktongame_bot";
  $("shareLink").value=link;
  $("copyShareBtn").addEventListener("click", ()=>copyToClipboard(link));
  $("withdrawBtn").addEventListener("click", withdraw50ShareToGroup);

  // таблиця ТОП-50
  initLeaderboard();

  // Adsgram
  initAds();

  // відновити лок
  updatePlayLockUI();

  // старт гри
  window.stackGame = new Game();
};

/* ===== Навігація ===== */
function showPage(id, btn){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".menu button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  isPaused = (id !== "game");
  if (id === "game"){ updatePlayLockUI(); }
}
window.showPage = showPage;

/* ===== Підписка ===== */
function subscribe(){
  if (subscribed) return;
  const url="https://t.me/stackofficialgame";
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank");
  subscribed=true; addBalance(1);
  const btn=$("subscribeBtn"); if (btn){ btn.innerText="Виконано"; btn.classList.add("done"); }
  saveData();
}

/* ===== Копіювання ===== */
async function copyToClipboard(text){
  try{
    if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); }
    else { const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    alert("Скопійовано ✅");
  }catch{ alert("Не вдалося копіювати 😕"); }
}

/* ===== Вивід 50⭐ (відкриває групу і копіює текст) ===== */
const GROUP_LINK = "https://t.me/+Z6PMT40dYClhOTQ6";
function withdraw50ShareToGroup(){
  const statusEl=$("withdrawStatus");
  if (balance < WITHDRAW_CHUNK){ if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; } return; }
  const code1=generateCode20(), code2=transformCodeHeavy(code1);
  const u=getTelegramUser(), tag=getUserTag();
  const text = `🔔 Заявка на вивід\n👤 Гравець: ${tag}${u.id? " (id"+u.id+")":""}\n⭐ Сума: ${WITHDRAW_CHUNK}\n🏆 Highscore: ${highscore}\n🔐 Код1: ${code1}\n🔁 Код2: ${code2}`;
  balance = Number((balance - WITHDRAW_CHUNK).toFixed(2)); setBalanceUI(); saveData();
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(()=>{}); }
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(GROUP_LINK);
  else window.open(GROUP_LINK,"_blank");
  if (statusEl){ statusEl.className="ok"; statusEl.textContent="Текст скопійовано. Встав у групі та надішли."; }
}

/* ===== ТОП-50 пустий ===== */
function initLeaderboard(){
  const tbody=document.querySelector("#leaderboard tbody");
  if (!tbody) return;
  tbody.innerHTML="";
  for (let i=1;i<=50;i++){
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i}</td><td>—</td><td>—</td>`;
    tbody.appendChild(tr);
  }
}

/* ===== Adsgram ===== */
function initAds(){
  if (!window.Adsgram){ console.warn("Adsgram SDK не завантажився"); return; }
  try { AdGameover = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID }); } catch(e){ console.warn("Adsgram gameover init error:", e); }
  try { Ad5        = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID }); } catch(e){ console.warn("Adsgram 5 init error:", e); }
  try { Ad10       = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID }); } catch(e){ console.warn("Adsgram 10 init error:", e); }
}
function inTelegramWebApp(){ return !!(window.Telegram && window.Telegram.WebApp); }
async function showAd(controller){
  if (!controller) return { shown:false, reason:"no_controller" };
  if (!inTelegramWebApp()) return { shown:false, reason:"not_telegram" };
  try{ await controller.show(); return { shown:true }; }
  catch(err){ return { shown:false, reason: err?.description || err?.state || "no_fill_or_error" }; }
}

/* ===== Завдання 5/10 реклам (ізольовані) ===== */
function startDailyTasksTicker(){
  setInterval(()=>{ updateDailyTaskUI('5'); updateDailyTaskUI('10'); }, 1000);
  updateDailyTaskUI('5'); updateDailyTaskUI('10');
}
function updateDailyTaskUI(which){
  if (which==='5'){
    const onCd = Date.now() < ads5CooldownUntil;
    $("ads5Progress").textContent = String(Math.min(ads5Count, 5));
    $("taskAds5").style.display = onCd? "none":"flex";
    $("taskAds5Status").style.display = onCd? "flex":"none";
    if (onCd){ $("ads5CooldownText").textContent = fmtHMS(ads5CooldownUntil - Date.now()); }
  } else {
    const onCd = Date.now() < ads10CooldownUntil;
    $("ads10Progress").textContent = String(Math.min(ads10Count, 10));
    $("taskAds10").style.display = onCd? "none":"flex";
    $("taskAds10Status").style.display = onCd? "flex":"none";
    if (onCd){ $("ads10CooldownText").textContent = fmtHMS(ads10CooldownUntil - Date.now()); }
  }
}
function fmtHMS(ms){
  let s = Math.max(0, Math.ceil(ms/1000));
  const hh=Math.floor(s/3600); s-=hh*3600;
  const mm=Math.floor(s/60);   s-=mm*60;
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(hh)}:${pad(mm)}:${pad(s)}`;
}
async function onWatchAds5(){
  if (Date.now() < ads5CooldownUntil) return;
  const res = await showAd(Ad5);
  if (res.shown){
    ads5Count += 1;
    if (ads5Count >= 5){
      ads5Count = 0;
      ads5CooldownUntil = Date.now() + COOLDOWN_24H;
      addBalance(REWARD_5);
    }
    saveData(); updateDailyTaskUI('5');
  } else {
    console.warn("Ad not shown (5):", res.reason);
  }
}
async function onWatchAds10(){
  if (Date.now() < ads10CooldownUntil) return;
  const res = await showAd(Ad10);
  if (res.shown){
    ads10Count += 1;
    if (ads10Count >= 10){
      ads10Count = 0;
      ads10CooldownUntil = Date.now() + COOLDOWN_24H;
      addBalance(REWARD_10);
    }
    saveData(); updateDailyTaskUI('10');
  } else {
    console.warn("Ad not shown (10):", res.reason);
  }
}

/* ===== 100 ігор ===== */
function updateGamesTaskUI(){ const c=$("gamesPlayedCounter"); if (c) c.textContent=String(Math.min(gamesPlayedSinceClaim, GAMES_TARGET)); }
function onCheckGames100(){
  if (gamesPlayedSinceClaim >= GAMES_TARGET){
    gamesPlayedSinceClaim = 0; addBalance(GAMES_REWARD); saveData(); updateGamesTaskUI();
    const btn=$("checkGames100Btn"); if (btn){ btn.classList.add("done"); setTimeout(()=>btn.classList.remove("done"), 1200); }
  } else {
    const left = GAMES_TARGET - gamesPlayedSinceClaim;
    alert(`Ще потрібно зіграти ${left} ігор(и), щоб отримати ${GAMES_REWARD}⭐`);
  }
}

/* ===== Post-блок 15с після реклами ===== */
function isPlayLocked(){ return Date.now() < playLockUntil; }
function setPlayLock(ms){
  playLockUntil = Date.now() + ms; saveData(); updatePlayLockUI();
  if (playLockTimer) clearInterval(playLockTimer);
  playLockTimer = setInterval(()=>{
    updatePlayLockUI();
    if (!isPlayLocked()){ clearInterval(playLockTimer); playLockTimer=null; }
  }, 300);
}
function updatePlayLockUI(){
  const box=$("playLock"), span=$("playLockCountdown");
  if (!box) return;
  const remaining=Math.max(0, playLockUntil - Date.now());
  if (remaining>0){
    box.style.display="block";
    if (span) span.textContent=String(Math.ceil(remaining/1000));
    isPaused = true;
  } else {
    box.style.display="none";
  }
}

/* ====== ГРА (оригінальна механіка, лише гачок у endGame) ====== */
class Stage{
  constructor(){
    this.container=document.getElementById("container");
    this.scene=new THREE.Scene();
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor('#D0CBC7', 1);
    this.container.appendChild(this.renderer.domElement);
    const aspect=window.innerWidth/window.innerHeight, d=20;
    this.camera=new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, -100, 1000);
    this.camera.position.set(2,2,2);
    this.cameraTarget=new THREE.Vector3(0,0,0);
    this.camera.lookAt(this.cameraTarget);
    this.light=new THREE.DirectionalLight(0xffffff,0.5); this.light.position.set(0,499,0);
    this.softLight=new THREE.AmbientLight(0xffffff,0.4);
    this.scene.add(this.light); this.scene.add(this.softLight);
    window.addEventListener('resize', ()=>this.onResize()); this.onResize();
  }
  add(o){ this.scene.add(o); } remove(o){ this.scene.remove(o); }
  render(){ this.camera.lookAt(this.cameraTarget); this.renderer.render(this.scene,this.camera); }
  setCamera(y, t=0.3){
    TweenMax.to(this.camera.position, t, {y:y+4, ease:Power1.easeInOut});
    TweenMax.to(this.cameraTarget, t, {y:y, ease:Power1.easeInOut});
  }
  onResize(){
    const viewSize=30;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.left = window.innerWidth / -viewSize;
    this.camera.right = window.innerWidth / viewSize;
    this.camera.top = window.innerHeight / viewSize;
    this.camera.bottom = window.innerHeight / -viewSize;
    this.camera.updateProjectionMatrix();
  }
}

class Block{
  constructor(prev){
    this.STATES={ACTIVE:'active',STOPPED:'stopped',MISSED:'missed'};
    this.MOVE_AMOUNT=12;
    this.targetBlock=prev;
    this.index=(prev?prev.index:0)+1;
    this.workingPlane=this.index%2 ? 'x' : 'z';
    this.workingDimension=this.index%2 ? 'width' : 'depth';
    this.dimension={ width: prev?prev.dimension.width:10, height: prev?prev.dimension.height:2, depth: prev?prev.dimension.depth:10 };
    this.position={ x: prev?prev.position.x:0, y: this.dimension.height*this.index, z: prev?prev.position.z:0 };
    this.colorOffset=prev?prev.colorOffset:Math.round(Math.random()*100);
    if(!prev){ this.color=0x333344; }
    else {
      const o=this.index+this.colorOffset;
      const r=Math.sin(0.3*o)*55+200, g=Math.sin(0.3*o+2)*55+200, b=Math.sin(0.3*o+4)*55+200;
      this.color=new THREE.Color(r/255,g/255,b/255);
    }
    this.state=this.index>1?this.STATES.ACTIVE:this.STATES.STOPPED;
    this.speed=-0.1-(this.index*0.005); if(this.speed<-4) this.speed=-4;
    this.direction=this.speed;

    const geom=new THREE.BoxGeometry(this.dimension.width,this.dimension.height,this.dimension.depth);
    geom.translate(this.dimension.width/2,this.dimension.height/2,this.dimension.depth/2);
    this.material=new THREE.MeshToonMaterial({color:this.color});
    this.mesh=new THREE.Mesh(geom,this.material);
    this.mesh.position.set(this.position.x,this.position.y,this.position.z);
    if(this.state===this.STATES.ACTIVE){
      this.position[this.workingPlane] = Math.random()>0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
    }
  }
  reverseDirection(){ this.direction = this.direction>0 ? this.speed : Math.abs(this.speed); }
  place(){
    this.state=this.STATES.STOPPED;
    let overlap=this.targetBlock.dimension[this.workingDimension]-Math.abs(this.position[this.workingPlane]-this.targetBlock.position[this.workingPlane]);
    const ret={plane:this.workingPlane,direction:this.direction};
    if(this.dimension[this.workingDimension]-overlap<0.3){
      overlap=this.dimension[this.workingDimension]; ret.bonus=true;
      this.position.x=this.targetBlock.position.x; this.position.z=this.targetBlock.position.z;
      this.dimension.width=this.targetBlock.dimension.width; this.dimension.depth=this.targetBlock.dimension.depth;
    }
    if(overlap>0){
      const choppedDim={width:this.dimension.width,height:this.dimension.height,depth:this.dimension.depth};
      choppedDim[this.workingDimension]-=overlap; this.dimension[this.workingDimension]=overlap;

      const placedG=new THREE.BoxGeometry(this.dimension.width,this.dimension.height,this.dimension.depth);
      placedG.translate(this.dimension.width/2,this.dimension.height/2,this.dimension.depth/2);
      const placed=new THREE.Mesh(placedG,this.material);

      const choppedG=new THREE.BoxGeometry(choppedDim.width,choppedDim.height,choppedDim.depth);
      choppedG.translate(choppedDim.width/2,choppedDim.height/2,choppedDim.depth/2);
      const chopped=new THREE.Mesh(choppedG,this.material);

      const choppedPos={x:this.position.x,y:this.position.y,z:this.position.z};
      if(this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]){
        this.position[this.workingPlane]=this.targetBlock.position[this.workingPlane];
      } else {
        choppedPos[this.workingPlane]+=overlap;
      }

      placed.position.set(this.position.x,this.position.y,this.position.z);
      chopped.position.set(choppedPos.x,choppedPos.y,choppedPos.z);
      ret.placed=placed;
      if(!ret.bonus) ret.chopped=chopped;
    } else {
      this.state=this.STATES.MISSED;
    }
    this.dimension[this.workingDimension]=overlap;
    return ret;
  }
  tick(){
    if(this.state===this.STATES.ACTIVE){
      const v=this.position[this.workingPlane];
      if(v>this.MOVE_AMOUNT || v<-this.MOVE_AMOUNT) this.reverseDirection();
      this.position[this.workingPlane]+=this.direction;
      this.mesh.position[this.workingPlane]=this.position[this.workingPlane];
    }
  }
}

class Game{
  constructor(){
    this.STATES={LOADING:'loading',PLAYING:'playing',READY:'ready',ENDED:'ended',RESETTING:'resetting'};
    this.state=this.STATES.LOADING; this.blocks=[];
    this.stage=new Stage();
    this.newBlocks=new THREE.Group(); this.placedBlocks=new THREE.Group(); this.choppedBlocks=new THREE.Group();
    this.stage.add(this.newBlocks); this.stage.add(this.placedBlocks); this.stage.add(this.choppedBlocks);
    this.scoreEl=$("score"); this.scoreEl.innerHTML="0";
    this.addBlock(); this.tick(); this.showReady();

    document.addEventListener("keydown",(e)=>{ 
      if(isPaused || isPlayLocked()) { updatePlayLockUI(); return; } 
      if(e.keyCode===32) this.onAction(); 
    });
    document.addEventListener("click",(e)=>{ 
      if(isPaused || isPlayLocked()) { updatePlayLockUI(); return; } 
      if($("game").classList.contains("active") && e.target.tagName.toLowerCase()==="canvas") this.onAction(); 
    });
    $("start-button").addEventListener("click",()=>{ 
      if(isPlayLocked()) { updatePlayLockUI(); return; } 
      this.onAction(); 
    });
  }
  showReady(){ $("ready").style.display="block"; $("gameOver").style.display="none"; this.state=this.STATES.READY; }
  showGameOver(){ $("gameOver").style.display="block"; $("ready").style.display="none"; this.state=this.STATES.ENDED; }
  hideOverlays(){ $("gameOver").style.display="none"; $("ready").style.display="none"; }
  onAction(){ 
    if (isPlayLocked()) { updatePlayLockUI(); return; }
    switch(this.state){ 
      case this.STATES.READY: this.startGame(); break; 
      case this.STATES.PLAYING: this.placeBlock(); break; 
      case this.STATES.ENDED: this.restartGame(); break; 
    } 
  }
  startGame(){ if(this.state===this.STATES.PLAYING) return; this.scoreEl.innerHTML="0"; this.hideOverlays(); this.state=this.STATES.PLAYING; this.addBlock(); }
  restartGame(){
    this.state=this.STATES.RESETTING;
    const old=this.placedBlocks.children.slice();
    const removeSpeed=0.2, delay=0.02;
    for(let i=0;i<old.length;i++){
      TweenMax.to(old[i].scale, removeSpeed, {x:0,y:0,z:0, delay:(old.length-i)*delay, ease:Power1.easeIn, onComplete:()=>this.placedBlocks.remove(old[i])});
      TweenMax.to(old[i].rotation, removeSpeed, {y:0.5, delay:(old.length-i)*delay, ease:Power1.easeIn});
    }
    const camT=removeSpeed*2+(old.length*delay);
    this.stage.setCamera(2,camT);
    const cd={v:this.blocks.length-1};
    TweenMax.to(cd, camT, {v:0, onUpdate:()=>{ this.scoreEl.innerHTML=String(Math.round(cd.v)); }});
    this.blocks=this.blocks.slice(0,1);
    setTimeout(()=>this.startGame(), camT*1000);
  }
  placeBlock(){
    const cur=this.blocks[this.blocks.length-1];
    const res=cur.place();
    this.newBlocks.remove(cur.mesh);
    if(res.placed) this.placedBlocks.add(res.placed);
    if(res.chopped){
      this.choppedBlocks.add(res.chopped);
      const pos={y:'-=30', ease:Power1.easeIn, onComplete:()=>this.choppedBlocks.remove(res.chopped)};
      const rnd=10;
      const rot={delay:0.05, x: res.plane==='z'?((Math.random()*rnd)-(rnd/2)):0.1, z: res.plane==='x'?((Math.random()*rnd)-(rnd/2)):0.1, y: Math.random()*0.1};
      if(res.chopped.position[res.plane] > res.placed.position[res.plane]) pos[res.plane] = '+=' + (40*Math.abs(res.direction)); else pos[res.plane] = '-=' + (40*Math.abs(res.direction));
      TweenMax.to(res.chopped.position, 1, pos);
      TweenMax.to(res.chopped.rotation, 1, rot);
    }
    this.addBlock();
  }
  async endGame(){
    this.showGameOver();
    const currentScore=parseInt(this.scoreEl.innerText,10);
    updateHighscore(currentScore);
    gamesPlayedSinceClaim += 1; saveData(); updateGamesTaskUI();

    // ► Показ реклами одразу після Game Over
    const res = await showAd(AdGameover);
    // ► Після показу — блокуємо гру на 15 сек
    if (res.shown) setPlayLock(POST_AD_LOCK_MS);
  }
  addBlock(){
    const last=this.blocks[this.blocks.length-1];
    if(last && last.state===last.STATES.MISSED) return this.endGame();
    this.scoreEl.innerHTML=String(this.blocks.length-1);
    const b=new Block(last); this.newBlocks.add(b.mesh); this.blocks.push(b);
    this.stage.setCamera(this.blocks.length*2);
    if(this.blocks.length>=5) $("instructions").classList.add("hide");
  }
  tick(){ 
    if(!isPaused && !isPlayLocked()){ 
      this.blocks[this.blocks.length-1].tick(); 
      this.stage.render(); 
    } 
    requestAnimationFrame(()=>this.tick()); 
  }
}

function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    localStorage.setItem("highscore", String(highscore));
    $("highscore").innerText="🏆 "+highscore;
  }
}
