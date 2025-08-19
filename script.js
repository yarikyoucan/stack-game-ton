"use strict";
console.clear();

/* ========= КОНСТАНТИ ========= */
const TASK_AD_COOLDOWN_MS = 60_000;   // завдання: 1 показ/хв
const ADS_COOLDOWN_MS_GLOBAL = 60_000; // глобальна затримка між показами
const GAMES_TARGET = 100;             // кожні 100 ігор
const GAMES_REWARD = 15;              // +15⭐ за 100 ігор
const WITHDRAW_CHUNK = 0.1;            // списуємо рівно 50⭐
const ADSGRAM_BLOCK_ID = "int-13961"; // твій Adsgram блок

// Куди відкрити користувача при виводі (щоб сам надіслав повідомлення)
const OPEN_MODE = "group"; // "group" → відкриває твою групу; "share" → системний діалог «Поділитися»
const GROUP_LINK = "https://t.me/+Z6PMT40dYClhOTQ6"; // твій інвайт у групу

/* ========= АЛФАВІТ ДЛЯ КОДІВ ========= */
// Без плутаних символів: I, O, 0, 1
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Літерна частина (24 літери без I та O)
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/* ========= СТАН ========= */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

/* ========= РЕКЛАМА ========= */
let AdController = null;
let lastGlobalAdAt = 0;
let lastTaskAdAt = 0;

/* ========= ХЕЛПЕРИ ========= */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1);
const setBalanceUI = () => $("balance").innerText = formatStars(balance);
function saveData(){
  localStorage.setItem("balance", String(balance));
  localStorage.setItem("subscribed", subscribed ? "true" : "false");
  localStorage.setItem("task50Completed", task50Completed ? "true" : "false");
  localStorage.setItem("highscore", String(highscore));
  localStorage.setItem("lastTaskAdAt", String(lastTaskAdAt));
  localStorage.setItem("gamesPlayedSinceClaim", String(gamesPlayedSinceClaim));
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
  // state
  balance = parseFloat(localStorage.getItem("balance") || "0");
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  highscore = parseInt(localStorage.getItem("highscore") || "0", 10);
  lastTaskAdAt = parseInt(localStorage.getItem("lastTaskAdAt") || "0", 10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0", 10);

  setBalanceUI();
  $("highscore").innerText = "🏆 " + highscore;
  updateGamesTaskUI();

  // tasks: subscribe
  const subBtn = $("subscribeBtn");
  if (subBtn){
    if (subscribed){ subBtn.innerText = "Виконано"; subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  // tasks: reach 50
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

  // tasks: ad once per minute
  const watchBtn = $("watchAdMinuteBtn");
  if (watchBtn) watchBtn.addEventListener("click", onWatchAdTaskClick);
  startTaskCooldownTicker();

  // tasks: 100 games
  const g100Btn = $("checkGames100Btn");
  if (g100Btn) g100Btn.addEventListener("click", onCheckGames100);

  // leaderboard
  initLeaderboard();

  // friends link
  const link = "https://t.me/Stacktongame_bot";
  if ($("shareLink")) $("shareLink").value = link;
  if ($("copyShareBtn")) $("copyShareBtn").addEventListener("click", ()=>copyToClipboard(link));

  // withdraw
  const withdrawBtn = $("withdrawBtn");
  if (withdrawBtn) withdrawBtn.addEventListener("click", withdraw50ShareToGroup);

  // ads
  initAds();

  // game
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
  if (!window.Adsgram){ console.warn("Adsgram SDK не завантажився"); return; }
  AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID, debug: true });
}
function inTelegramWebApp(){ return !!(window.Telegram && window.Telegram.WebApp); }
async function showInterstitialOnce(){
  if (!AdController) return { shown:false, reason:"no_controller" };
  if (!inTelegramWebApp()) return { shown:false, reason:"not_telegram" };
  const now = Date.now();
  if (now - lastGlobalAdAt < ADS_COOLDOWN_MS_GLOBAL) return { shown:false, reason:"global_cooldown" };
  try {
    const res = await AdController.show();
    lastGlobalAdAt = Date.now();
    if (res && res.done) return { shown:true };
    return { shown:false, reason:res?.description || res?.state || "no_fill" };
  } catch(e){ return { shown:false, reason:"exception" }; }
}

/* ========= Завдання: один показ реклами / хв ========= */
async function onWatchAdTaskClick(){
  const now = Date.now();
  const remaining = TASK_AD_COOLDOWN_MS - (now - lastTaskAdAt);
  if (remaining > 0) return;
  const res = await showInterstitialOnce();
  if (res.shown){ lastTaskAdAt = Date.now(); addBalance(0.2); saveData(); updateTaskCooldownUI(); }
}
let taskCooldownTimer = null;
function startTaskCooldownTicker(){ if (taskCooldownTimer) clearInterval(taskCooldownTimer); taskCooldownTimer=setInterval(updateTaskCooldownUI, 1000); updateTaskCooldownUI(); }
function updateTaskCooldownUI(){
  const btnWrap=$("taskAdOncePerMinute"), btn=$("watchAdMinuteBtn"), cdBox=$("taskAdStatus"), cdText=$("adCooldownText");
  if (!btnWrap||!btn||!cdBox||!cdText) return;
  const now=Date.now(), remaining=Math.max(0,TASK_AD_COOLDOWN_MS-(now-lastTaskAdAt));
  if (remaining>0){ btn.disabled=true; btnWrap.style.display="none"; cdBox.style.display="flex"; cdText.innerText=Math.ceil(remaining/1000)+"с"; }
  else { btn.disabled=false; btnWrap.style.display="flex"; cdBox.style.display="none"; }
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

/* ========= 20-символьний КОД-1 + «важка» трансформація в КОД-2 ========= */
// ядро 16 символів з випадковості + мікс userId і часу
function genCore16() {
  const rnd = new Uint8Array(12);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
  else rnd.fill(Date.now() % 256);

  const u = (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0;
  const mix = ((Number(u) ^ (Date.now() & 0xffffffff)) >>> 0);
  rnd[8]  ^= (mix       ) & 0xff;
  rnd[9]  ^= (mix >>>  8) & 0xff;
  rnd[10] ^= (mix >>> 16) & 0xff;
  rnd[11] ^= (mix >>> 24) & 0xff;

  // Base32 на нашому алфавіті (без 0/1/I/O)
  let bits=0, value=0, out="";
  for (let i=0;i<rnd.length;i++){
    let b=rnd[i]; if (b<0) b+=256;
    bits+=8; value=(value<<8)|b;
    while(bits>=5){ out+=ALPH[(value >>> (bits-5)) & 31]; bits-=5; }
  }
  if(bits>0) out+=ALPH[(value << (5-bits)) & 31];
  while(out.length<16) out+=ALPH[Math.floor(Math.random()*ALPH.length)];
  return out.slice(0,16);
}
function checksumState(core){
  let s=0;
  for(let i=0;i<core.length;i++){
    const v=ALPH.indexOf(core[i]);
    s=((s*37)+(v+7))%9677;
  }
  return s;
}
function versionCharFor(core){
  let sumEven=0,sumOdd=0;
  for(let i=0;i<core.length;i++){
    const v = LETTERS.indexOf(core[i]);
    if (v>=0){ if((i%2)===0) sumEven=(sumEven+v)%32; else sumOdd=(sumOdd+v)%32; }
  }
  const idx0 = Math.max(0, LETTERS.indexOf(core[0]));
  const idx15 = Math.max(0, LETTERS.indexOf(core[15]));
  const verIdx = ((sumEven*11)+(sumOdd*7)+(idx0*3)+(idx15*5)+13)%32;
  return ALPH[verIdx];
}
function checkTail(core){
  const s=checksumState(core);
  const ch1=ALPH[s%32], ch2=ALPH[(s*31+3)%32], ch3=ALPH[(s*17+5)%32];
  return ch1+ch2+ch3;
}
function generateCode20(){
  const core=genCore16();
  const ver=versionCharFor(core);
  const chk=checkTail(core);
  return core.slice(0,8)+ver+core.slice(8)+chk; // 8 + 1 + 8 + 3 = 20
}

/* ======= ВАЖКА ЗАКОНОМІРНІСТЬ ДЛЯ КОД2 =======
   1) Підстановка цифр (циклічна, «розкидана»):
      2→6, 6→3, 3→8, 8→5, 5→9, 9→4, 4→7, 7→2
   2) Підстановка літер (повна перестановка 24 літер без I/O):
      A→Q, B→T, C→M, D→R, E→K, F→X, G→A, H→V,
      J→C, K→Z, L→E, M→H, N→Y, P→S, Q→D, R→B,
      S→U, T→F, U→J, V→G, W→N, X→P, Y→W, Z→L
   3) Перестановка позицій (одна з двох складних перестановок),
      вибір залежить від самого коду (детерміновано).
*/
const DIGIT_MAP = {
  "2":"6","6":"3","3":"8","8":"5","5":"9","9":"4","4":"7","7":"2"
};
const LETTER_MAP = {
  "A":"Q","B":"T","C":"M","D":"R","E":"K","F":"X","G":"A","H":"V",
  "J":"C","K":"Z","L":"E","M":"H","N":"Y","P":"S","Q":"D","R":"B",
  "S":"U","T":"F","U":"J","V":"G","W":"N","X":"P","Y":"W","Z":"L"
};
// Перестановка: новий[i] = старий[PERM1[i]]
const PERM1 = [11, 2,17, 6,14,19, 0, 8, 4,16, 1,13, 9, 3,18, 5,12, 7,15,10];
const PERM2 = [15, 0, 9,13, 6,18, 3,11, 1,16, 4,14, 8, 2,19, 5,12, 7,17,10];

function transformCodeHeavy(code){
  if (typeof code!=="string" || code.length!==20) return "";
  // 1) підстановка символів
  const sub = Array.from(code).map(ch=>{
    if (DIGIT_MAP[ch]) return DIGIT_MAP[ch];
    if (LETTER_MAP[ch]) return LETTER_MAP[ch];
    return ch; // інше залишаємо як є (хоча у нашому алфавіті все покрито)
  });
  // 2) вибір перестановки (детерміновано за кодом)
  const i2 = ALPH.indexOf(code[2])  >>> 0;
  const i7 = ALPH.indexOf(code[7])  >>> 0;
  const i13= ALPH.indexOf(code[13]) >>> 0;
  const i19= ALPH.indexOf(code[19]) >>> 0;
  const choose = ((i2 + i7 + i13 + i19) % 2) === 0 ? PERM1 : PERM2;

  // 3) застосувати перестановку
  const out = new Array(20);
  for (let i=0;i<20;i++) out[i] = sub[ choose[i] ];
  return out.join("");
}
function isTransformedPair(code1, code2){ return transformCodeHeavy(code1) === code2; }

/* ========= Вивід: списуємо рівно 50⭐ + відкриваємо групу/«Поділитися» з кодами ========= */
function withdraw50ShareToGroup(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");

  if (balance < WITHDRAW_CHUNK) {
    if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; }
    return;
  }

  const code1 = generateCode20();
  const code2 = transformCodeHeavy(code1);

  const u = getTelegramUser();
  const tag = getUserTag();
  const text =
    `🔔 Заявка на вивід\n` +
    `👤 Гравець: ${tag}${u.id ? " (id"+u.id+")" : ""}\n` +
    `⭐ Сума: ${WITHDRAW_CHUNK}\n` +
    `🏆 Highscore: ${highscore}\n` +
    `🔐 Код1: ${code1}\n` +
    `🔁 Код2: ${code2}`;

  // списуємо рівно 50, решта лишається
  balance = Number((balance - WITHDRAW_CHUNK).toFixed(2));
  setBalanceUI(); saveData();

  if (OPEN_MODE === "group" && GROUP_LINK) {
    // копіюємо текст у буфер, відкриваємо групу — юзер вставляє і надсилає
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(()=>{});
    }
    if (window.Telegram?.WebApp?.openTelegramLink) {
      Telegram.WebApp.openTelegramLink(GROUP_LINK);
    } else {
      window.open(GROUP_LINK, "_blank");
    }
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Текст скопійовано. Встав у групі та надішли."; }
  } else {
    // системний діалог «Поділитися» — користувач вибирає чат
    const shareUrl = "https://t.me/share/url?text=" + encodeURIComponent(text);
    if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank");
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вибери групу у вікні «Поділитися» та надішли."; }
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

    document.addEventListener("keydown",(e)=>{ if(isPaused) return; if(e.keyCode===32) this.onAction(); });
    document.addEventListener("click",(e)=>{ if(isPaused) return; if($("game").classList.contains("active") && e.target.tagName.toLowerCase()==="canvas") this.onAction(); });
    $("start-button").addEventListener("click",()=>this.onAction());
    this.adShown=false;
  }
  showReady(){ $("ready").style.display="block"; $("gameOver").style.display="none"; this.state=this.STATES.READY; }
  showGameOver(){ $("gameOver").style.display="block"; $("ready").style.display="none"; this.state=this.STATES.ENDED; }
  hideOverlays(){ $("gameOver").style.display="none"; $("ready").style.display="none"; }
  onAction(){ switch(this.state){ case this.STATES.READY: this.startGame(); break; case this.STATES.PLAYING: this.placeBlock(); break; case this.STATES.ENDED: this.restartGame(); break; } }
  startGame(){ if(this.state===this.STATES.PLAYING) return; this.scoreEl.innerHTML="0"; this.hideOverlays(); this.state=this.STATES.PLAYING; this.addBlock(); this.adShown=false; }
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
  addBlock(){
    const last=this.blocks[this.blocks.length-1];
    if(last && last.state===last.STATES.MISSED) return this.endGame();
    this.scoreEl.innerHTML=String(this.blocks.length-1);
    const b=new Block(last); this.newBlocks.add(b.mesh); this.blocks.push(b);
    this.stage.setCamera(this.blocks.length*2);
    if(this.blocks.length>=5) $("instructions").classList.add("hide");
  }
  async endGame(){
    this.showGameOver();
    const currentScore=parseInt(this.scoreEl.innerText,10);
    updateHighscore(currentScore);
    gamesPlayedSinceClaim += 1; saveData(); updateGamesTaskUI();
    if(!this.adShown){ this.adShown=true; await showInterstitialOnce(); }
  }
  tick(){ if(!isPaused){ this.blocks[this.blocks.length-1].tick(); this.stage.render(); } requestAnimationFrame(()=>this.tick()); }
}

function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    localStorage.setItem("highscore", String(highscore));
    $("highscore").innerText="🏆 "+highscore;
  }
}
