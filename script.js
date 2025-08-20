"use strict";
console.clear();

/* ========= КОНСТАНТИ ========= */
const TASK_AD_COOLDOWN_MS = 60_000;   // 1 реклама / хв у завданні (+0.2⭐)
const POST_AD_LOCK_MS     = 15_000;   // ⏳ 15с після реклами — блок на гру
const MIN_BETWEEN_SAME_CTX_MS = 10_000;

const GAMES_TARGET = 100;
const GAMES_REWARD = 10;              // +10⭐ за 100 ігор
const WITHDRAW_CHUNK = 50;

const ADSGRAM_BLOCK_ID_TASK     = "int-13961";
const ADSGRAM_BLOCK_ID_GAMEOVER = "int-13961"; // той самий блок, як просив
const ADSGRAM_BLOCK_ID_5        = "int-13961"; // 5-рекл завдання
const ADSGRAM_BLOCK_ID_10       = "int-13961"; // 10-рекл завдання

/* ========= ЩОДЕННІ ЗАВДАННЯ 5/10 ========= */
const REWARD_5  = 1.2;
const REWARD_10 = 2.5;
const COOLDOWN_24H = 24 * 60 * 60 * 1000;

/* ========= ПОСИЛАННЯ ========= */
const OPEN_MODE = "group"; // "group" | "share"
const GROUP_LINK = "https://t.me/+Z6PMT40dYClhOTQ6";

/* ========= АЛФАВІТ ДЛЯ КОДІВ ========= */
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/1/I/O
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/* ========= СТАН ========= */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

/* Реклама: контролери та кулдауни */
let AdTask = null;
let AdGameover = null;
let Ad5 = null;
let Ad10 = null;

let lastAdAtTask = 0;
let adInFlightTask = false;
let adInFlightGameover = false;
let adInFlight5 = false;
let adInFlight10 = false;

/* Post-таймер у грі */
let playLockUntil = 0;
let playLockTimer = null;

/* Лічильники для нових щоденних завдань (окремі та ізольовані) */
let ads5Count = 0;
let ads5CooldownUntil = 0;

let ads10Count = 0;
let ads10CooldownUntil = 0;

/* ========= ХЕЛПЕРИ ========= */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1);
const setBalanceUI = () => $("balance").innerText = formatStars(balance);

function saveData(){
  localStorage.setItem("balance", String(balance));
  localStorage.setItem("subscribed", subscribed ? "true" : "false");
  localStorage.setItem("task50Completed", task50Completed ? "true" : "false");
  localStorage.setItem("highscore", String(highscore));
  localStorage.setItem("lastTaskAdAt", String(lastAdAtTask));
  localStorage.setItem("gamesPlayedSinceClaim", String(gamesPlayedSinceClaim));

  localStorage.setItem("ads5Count", String(ads5Count));
  localStorage.setItem("ads5CooldownUntil", String(ads5CooldownUntil));
  localStorage.setItem("ads10Count", String(ads10Count));
  localStorage.setItem("ads10CooldownUntil", String(ads10CooldownUntil));

  localStorage.setItem("playLockUntil", String(playLockUntil));
}

/* ========= TELEGRAM USER ========= */
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

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
window.onload = function(){
  balance = parseFloat(localStorage.getItem("balance") || "0");
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  highscore = parseInt(localStorage.getItem("highscore") || "0", 10);
  lastAdAtTask = parseInt(localStorage.getItem("lastTaskAdAt") || "0", 10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0", 10);

  ads5Count = parseInt(localStorage.getItem("ads5Count") || "0", 10);
  ads5CooldownUntil = parseInt(localStorage.getItem("ads5CooldownUntil") || "0", 10);
  ads10Count = parseInt(localStorage.getItem("ads10Count") || "0", 10);
  ads10CooldownUntil = parseInt(localStorage.getItem("ads10CooldownUntil") || "0", 10);

  playLockUntil = parseInt(localStorage.getItem("playLockUntil") || "0", 10);

  setBalanceUI();
  $("highscore").innerText = "🏆 " + highscore;
  updateGamesTaskUI();

  const subBtn = $("subscribeBtn");
  if (subBtn){
    if (subscribed){ subBtn.innerText = "Виконано"; subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  const t50 = $("checkTask50");
  if (t50){
    if (task50Completed){ t50.innerText="Виконано"; t50.classList.add("done"); }
    t50.addEventListener("click", ()=>{
      if (highscore >= 50 && !task50Completed){
        addBalance(10);
        t50.innerText="Виконано"; t50.classList.add("done");
        task50Completed = true; saveData();
      } else if (highscore < 50){
        alert("❌ Твій рекорд замалий (потрібно 50+)");
      }
    });
  }

  $("watchAdMinuteBtn").addEventListener("click", onWatchAdTaskClick);
  startTaskCooldownTicker();

  $("watchAds5Btn").addEventListener("click", onWatchAds5);
  $("watchAds10Btn").addEventListener("click", onWatchAds10);
  startDailyTasksTicker();

  $("checkGames100Btn").addEventListener("click", onCheckGames100);

  initLeaderboard();

  const link = "https://t.me/Stacktongame_bot";
  $("shareLink").value = link;
  $("copyShareBtn").addEventListener("click", ()=>copyToClipboard(link));

  $("withdrawBtn").addEventListener("click", withdraw50ShareToGroup);

  initAds();

  updatePlayLockUI();

  window.stackGame = new Game();
};

function addBalance(n){ balance = parseFloat((balance + n).toFixed(2)); setBalanceUI(); saveData(); }
function subscribe(){
  if (subscribed) return;
  const url = "https://t.me/stackofficialgame";
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank");
  subscribed = true; addBalance(1);
  const btn = $("subscribeBtn"); if (btn){ btn.innerText="Виконано"; btn.classList.add("done"); }
  saveData();
}

/* ========= Навігація ========= */
function showPage(id, btn){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".menu button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  isPaused = (id !== "game");
  if (id === "game"){ updatePlayLockUI(); }
}
window.showPage = showPage;

/* ========= Лідерборд (50 пустих) ========= */
function initLeaderboard(){
  const tbody = document.querySelector("#leaderboard tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i=1;i<=50;i++){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i}</td><td>—</td><td>—</td>`;
    tbody.appendChild(tr);
  }
}

/* ========= Реклама Adsgram ========= */
function initAds(){
  if (!window.Adsgram){
    console.warn("Adsgram SDK не завантажився");
    return;
  }
  try { AdTask     = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_TASK }); }     catch(e){ console.warn("Adsgram init task error:", e); }
  try { AdGameover = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_GAMEOVER }); } catch(e){ console.warn("Adsgram init gameover error:", e); }
  try { Ad5        = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_5 }); }        catch(e){ console.warn("Adsgram init 5 error:", e); }
  try { Ad10       = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_10 }); }       catch(e){ console.warn("Adsgram init 10 error:", e); }
}
function inTelegramWebApp(){ return !!(window.Telegram && window.Telegram.WebApp); }

/* ========= Показ реклами з різними контекстами ========= */
async function showAdController(controller, busyFlagRef){
  if (!controller) return { shown:false, reason:"no_controller" };
  if (!inTelegramWebApp()) return { shown:false, reason:"not_telegram" };
  if (busyFlagRef.value) return { shown:false, reason:"busy" };
  busyFlagRef.value = true;
  try {
    await controller.show();
    return { shown:true };
  } catch (err) {
    return { shown:false, reason: err?.description || err?.state || "no_fill_or_error" };
  } finally {
    busyFlagRef.value = false;
  }
}

/* ========= Завдання: один показ реклами / хв (дає +0.2⭐) ========= */
async function onWatchAdTaskClick(){
  const now = Date.now();
  const remainingTask = TASK_AD_COOLDOWN_MS - (now - lastAdAtTask);
  if (remainingTask > 0) return;

  const res = await showAdController(AdTask, { get value(){return adInFlightTask;}, set value(v){adInFlightTask=v;} });
  if (res.shown){
    lastAdAtTask = Date.now();
    addBalance(0.2);
  } else {
    console.warn("Ad not shown (task):", res.reason);
  }
  updateTaskCooldownUI();
}
let taskCooldownTimer = null;
function startTaskCooldownTicker(){ if (taskCooldownTimer) clearInterval(taskCooldownTimer); taskCooldownTimer=setInterval(updateTaskCooldownUI, 1000); updateTaskCooldownUI(); }
function updateTaskCooldownUI(){
  const btnWrap=$("taskAdOncePerMinute"), btn=$("watchAdMinuteBtn"), cdBox=$("taskAdStatus"), cdText=$("adCooldownText");
  if (!btnWrap||!btn||!cdBox||!cdText) return;
  const now=Date.now();
  const remaining=Math.max(0, TASK_AD_COOLDOWN_MS-(now-lastAdAtTask));
  if (remaining>0){ btn.disabled=true; btnWrap.style.display="none"; cdBox.style.display="flex"; cdText.innerText=Math.ceil(remaining/1000)+"с"; }
  else { btn.disabled=false; btnWrap.style.display="flex"; cdBox.style.display="none"; }
}

/* ========= НОВІ ЩОДЕННІ ЗАВДАННЯ (ізольовані лічильники) ========= */
function startDailyTasksTicker(){
  setInterval(()=>{
    updateDailyTaskUI('5');
    updateDailyTaskUI('10');
  }, 1000);
  updateDailyTaskUI('5');
  updateDailyTaskUI('10');
}
function updateDailyTaskUI(which){
  if (which==='5'){
    const onCooldown = Date.now() < ads5CooldownUntil;
    $("ads5Progress").textContent = String(Math.min(ads5Count, 5));
    $("taskAds5").style.display = onCooldown ? "none" : "flex";
    $("taskAds5Status").style.display = onCooldown ? "flex" : "none";
    if (onCooldown){
      const remain = ads5CooldownUntil - Date.now();
      $("ads5CooldownText").textContent = fmtHMS(remain);
    }
  } else {
    const onCooldown = Date.now() < ads10CooldownUntil;
    $("ads10Progress").textContent = String(Math.min(ads10Count, 10));
    $("taskAds10").style.display = onCooldown ? "none" : "flex";
    $("taskAds10Status").style.display = onCooldown ? "flex" : "none";
    if (onCooldown){
      const remain = ads10CooldownUntil - Date.now();
      $("ads10CooldownText").textContent = fmtHMS(remain);
    }
  }
}
function fmtHMS(ms){
  let s = Math.max(0, Math.ceil(ms/1000));
  const hh = Math.floor(s/3600); s-=hh*3600;
  const mm = Math.floor(s/60);   s-=mm*60;
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(hh)}:${pad(mm)}:${pad(s)}`;
}
async function onWatchAds5(){
  if (Date.now() < ads5CooldownUntil) return;
  const res = await showAdController(Ad5, { get value(){return adInFlight5;}, set value(v){adInFlight5=v;} });
  if (res.shown){
    ads5Count += 1;
    if (ads5Count >= 5){
      ads5Count = 0;
      ads5CooldownUntil = Date.now() + COOLDOWN_24H;
      addBalance(REWARD_5);
    }
    saveData();
    updateDailyTaskUI('5');
  } else {
    console.warn("Ad not shown (5):", res.reason);
  }
}
async function onWatchAds10(){
  if (Date.now() < ads10CooldownUntil) return;
  const res = await showAdController(Ad10, { get value(){return adInFlight10;}, set value(v){adInFlight10=v;} });
  if (res.shown){
    ads10Count += 1;
    if (ads10Count >= 10){
      ads10Count = 0;
      ads10CooldownUntil = Date.now() + COOLDOWN_24H;
      addBalance(REWARD_10);
    }
    saveData();
    updateDailyTaskUI('10');
  } else {
    console.warn("Ad not shown (10):", res.reason);
  }
}

/* ========= Друзі / копіювання ========= */
function openBotLink(e){ e.preventDefault(); const url="https://t.me/Stacktongame_bot"; if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url); else window.open(url,"_blank"); }
async function copyToClipboard(text){
  try{
    if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); }
    else { const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    alert("Скопійовано ✅");
  }catch{ alert("Не вдалося копіювати 😕"); }
}

/* ========= 20-символьні коди для «Вивести» ========= */
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
function checksumState(core){
  let s=0; for(let i=0;i<core.length;i++){ const v=ALPH.indexOf(core[i]); s=((s*37)+(v+7))%9677; } return s;
}
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

/* ========= Вивід 50⭐ ========= */
function withdraw50ShareToGroup(){
  const statusEl = $("withdrawStatus");
  if (balance < WITHDRAW_CHUNK) { if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; } return; }
  const code1=generateCode20(), code2=transformCodeHeavy(code1);
  const u=getTelegramUser(), tag=getUserTag();
  const text = `🔔 Заявка на вивід\n👤 Гравець: ${tag}${u.id? " (id"+u.id+")":""}\n⭐ Сума: ${WITHDRAW_CHUNK}\n🏆 Highscore: ${highscore}\n🔐 Код1: ${code1}\n🔁 Код2: ${code2}`;
  balance = Number((balance - WITHDRAW_CHUNK).toFixed(2)); setBalanceUI(); saveData();
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(()=>{}); }
  if (OPEN_MODE==="group" && GROUP_LINK){
    if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(GROUP_LINK);
    else window.open(GROUP_LINK,"_blank");
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Текст скопійовано. Встав у групі та надішли."; }
  } else {
    const shareUrl = "https://t.me/share/url?text=" + encodeURIComponent(text);
    if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank");
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вибери групу у «Поділитися» та надішли."; }
  }
}

/* ========= Завдання 100 ігор ========= */
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

/* ========= Post-блок у грі (15с після реклами) ========= */
function isPlayLocked(){ return Date.now() < playLockUntil; }
function setPlayLock(ms){
  playLockUntil = Date.now() + ms; saveData(); updatePlayLockUI();
  if (playLockTimer) clearInterval(playLockTimer);
  playLockTimer = setInterval(()=>{
    updatePlayLockUI();
    if (!isPlayLocked()){
      clearInterval(playLockTimer); playLockTimer=null;
    }
  }, 300);
}
function updatePlayLockUI(){
  const box = $("playLock"), span = $("playLockCountdown");
  if (!box) return;
  const remaining = Math.max(0, playLockUntil - Date.now());
  if (remaining > 0){
    box.style.display = "block";
    if (span) span.textContent = String(Math.ceil(remaining/1000));
    isPaused = true;
  } else {
    box.style.display = "none";
  }
}

/* ========= 3D Stack (гра) ========= */
class Stage{
  constructor(){
    this.container = document.getElementById("container");
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor('#D0CBC7', 1);
    this.container.appendChild(this.renderer.domElement);
    const aspect = window.innerWidth / window.innerHeight, d = 20;
    this.camera = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, -100, 1000);
    this.camera.position.set(2,2,2);
    this.cameraTarget = new THREE.Vector3(0,0,0);
    this.camera.lookAt(this.cameraTarget);
    this.light = new THREE.DirectionalLight(0xffffff,0.5); this.light.position.set(0,499,0);
    this.softLight = new THREE.AmbientLight(0xffffff,0.4);
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
    this.targetBlock = prev;
    this.index = (prev?prev.index:0)+1;
    this.workingPlane = this.index%2 ? 'x' : 'z';
    this.workingDimension = this.index%2 ? 'width' : 'depth';
    this.dimension = { width: prev?prev.dimension.width:10, height: prev?prev.dimension.height:2, depth: prev?prev.dimension.depth:10 };
    this.position = { x: prev?prev.position.x:0, y: this.dimension.height*this.index, z: prev?prev.position.z:0 };
    this.colorOffset = prev?prev.colorOffset:Math.round(Math.random()*100);
    if(!prev){ this.color=0x333344; } else {
      const o=this.index+this.colorOffset;
      const r=Math.sin(0.3*o)*55+200, g=Math.sin(0.3*o+2)*55+200, b=Math.sin(0.3*o+4)*55+200;
      this.color=new THREE.Color(r/255,g/255,b/255);
    }
    this.state = this.index>1 ? this.STATES.ACTIVE : this.STATES.STOPPED;
    this.speed = -0.1 - (this.index*0.005); if (this.speed<-4) this.speed=-4;
    this.direction = this.speed;

    const geom = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    geom.translate(this.dimension.width/2, this.dimension.height/2, this.dimension.depth/2);
    this.material = new THREE.MeshToonMaterial({color:this.color});
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    if (this.state===this.STATES.ACTIVE) {
      this.position[this.workingPlane] = Math.random()>0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
    }
  }
  reverseDirection(){ this.direction = this.direction>0 ? this.speed : Math.abs(this.speed); }
  place(){
    this.state=this.STATES.STOPPED;
    let overlap = this.targetBlock.dimension[this.workingDimension] - Math.abs(this.position[this.workingPlane]-this.targetBlock.position[this.workingPlane]);
    const ret={plane:this.workingPlane,direction:this.direction};
    if (this.dimension[this.workingDimension]-overlap<0.3){
      overlap=this.dimension[this.workingDimension]; ret.bonus=true;
      this.position.x=this.targetBlock.position.x; this.position.z=this.targetBlock.position.z;
      this.dimension.width=this.targetBlock.dimension.width; this.dimension.depth=this.targetBlock.dimension.depth;
    }
    if (overlap>0){
      const choppedDim={width:this.dimension.width,height:this.dimension.height,depth:this.dimension.depth};
      choppedDim[this.workingDimension]-=overlap; this.dimension[this.workingDimension]=overlap;

      const placedG=new THREE.BoxGeometry(this.dimension.width,this.dimension.height,this.dimension.depth);
      placedG.translate(this.dimension.width/2,this.dimension.height/2,this.dimension.depth/2);
      const placed=new THREE.Mesh(placedG,this.material);

      const choppedG=new THREE.BoxGeometry(choppedDim.width,choppedDim.height,choppedDim.depth);
      choppedG.translate(choppedDim.width/2,choppedDim.height/2,choppedDim.depth/2);
      const chopped=new THREE.Mesh(choppedG,this.material);

      const choppedPos={x:this.position.x,y:this.position.y,z:this.position.z};
      if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]) {
        this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
      } else {
        choppedPos[this.workingPlane] += overlap;
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
    if (this.state===this.STATES.ACTIVE){
      const v=this.position[this.workingPlane];
      if (v>this.MOVE_AMOUNT || v<-this.MOVE_AMOUNT) this.reverseDirection();
      this.position[this.workingPlane] += this.direction;
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
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

    // 1) Показ реклами одразу
    const res = await showAdController(AdGameover, { get value(){return adInFlightGameover;}, set value(v){adInFlightGameover=v;} });
    // 2) Якщо реклама показалась — 15с блок на гру
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

