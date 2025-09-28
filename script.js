// script.js — ПОВНА версія: гра, завдання, батли, коди, Adsgram/Adexium
"use strict";
console.clear();

/* ========= КОНСТАНТИ ========= */
// Щоденні +0.1⭐ (окремі кнопки для Adsgram та Adexium)
const DAILY_CAP = 25;             // максимум переглядів на день для КОЖНОГО провайдера
const DAILY_COOLDOWN_MS = 0;      // БЕЗ кулдауна між показами

// Реклама після гри (локальний антиспам)
const GAME_AD_COOLDOWN_MS = 15_000;
// Загальний глобальний антиспам — НЕ використовуємо для щоденних +0.1⭐
const ANY_AD_COOLDOWN_MS  = 60_000;
// Мінімальна пауза між двома показами в одному контексті (крім daily)
const MIN_BETWEEN_SAME_CTX_MS = 10_000;

// Пауза перед новою гророю після реклами на екрані Game Over
const POST_AD_TIMER_MS = 15_000;

// Завдання «зіграй 100 ігор»
const GAMES_TARGET = 100;
const GAMES_REWARD = 5;  // +5⭐ за 100 ігор

// Вивід (рівно 50⭐)
const WITHDRAW_CHUNK = 50;

/* --- Adsgram блоки --- */
const ADSGRAM_BLOCK_ID_TASK_MINUTE = "int-13961"; // щоденний таск +0.1⭐ (Adsgram)
const ADSGRAM_BLOCK_ID_TASK_510    = "int-15276"; // завдання 5 і 10 реклам
const ADSGRAM_BLOCK_ID_GAMEOVER    = "int-15275"; // після завершення гри

/* --- Відкриття при виводі --- */
const OPEN_MODE = "group"; // "group" | "share"
const GROUP_LINK = "https://t.me/+Z6PMT40dYClhOTQ6";

/* --- Квести на рекламу 5 і 10 --- */
const TASK5_TARGET = 5;
const TASK10_TARGET = 10;
const TASK_DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // після отримання винагороди

/* ========= АЛФАВІТ ДЛЯ КОДІВ ========= */
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/* ========= ADEXIUM ========= */
// офіційний SDK з твого повідомлення
const ADEXIUM_SDK_URL = "https://cdn.tgads.space/assets/js/adexium-widget.min.js";
const ADEXIUM_WID = "8d2ce1f1-ae64-4fc3-ac46-41bc92683fae"; // твій wid
const ADEXIUM_FORMAT = "interstitial";

let __adexiumScriptLoading = null;

function loadAdexiumScriptOnce() {
  // Якщо SDK уже є вікні — не дублюємо підвантаження
  if (window.__adexium_loaded || typeof window.AdexiumWidget === "function" ||
      (window.Adexium && (typeof window.Adexium.showInterstitial === "function" || typeof window.Adexium.show === "function"))) {
    window.__adexium_loaded = true;
    return Promise.resolve();
  }
  if (__adexiumScriptLoading) return __adexiumScriptLoading;

  __adexiumScriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = ADEXIUM_SDK_URL;
    s.async = true;
    s.onload = () => setTimeout(() => { window.__adexium_loaded = true; resolve(); }, 250);
    s.onerror = () => reject(new Error("adexium_sdk_load_error"));
    document.head.appendChild(s);
  });
  return __adexiumScriptLoading;
}

function waitAdexiumReady(maxWaitMs = 6000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      const widgetC = typeof window.AdexiumWidget === "function";
      const factory = typeof window.__getAdexium === "function";
      const apiObj  = window.Adexium && (typeof window.Adexium.showInterstitial === "function" || typeof window.Adexium.show === "function");
      if (widgetC || factory || apiObj) { clearInterval(t); resolve({ widgetC, factory, apiObj }); }
      else if (Date.now() - start > maxWaitMs) { clearInterval(t); reject(new Error("adexium_not_ready")); }
    }, 150);
  });
}

// Єдиний публічний виклик (твоя кнопка "Переглянути" викликає onWatchExDaily -> showAdexiumInterstitial)
async function showAdexiumInterstitial() {
  try {
    await loadAdexiumScriptOnce();
    const ready = await waitAdexiumReady();

    // 1) офіційний об’єкт
    if (ready.apiObj) {
      try {
        if (typeof window.Adexium.showInterstitial === "function") {
          const p = window.Adexium.showInterstitial(ADEXIUM_WID, { format: ADEXIUM_FORMAT });
          if (p?.then) await p;
        } else {
          const p = window.Adexium.show({ wid: ADEXIUM_WID, adFormat: ADEXIUM_FORMAT });
          if (p?.then) await p;
        }
        return { shown: true };
      } catch (e) { console.warn("[Adexium] api show error:", e); }
    }

    // 2) фабрика у head (іноді так додають)
    if (ready.factory) {
      try {
        const w = window.__getAdexium();
        const p = (w.show && w.show({ wid: ADEXIUM_WID, adFormat: ADEXIUM_FORMAT })) ||
                  (w.open && w.open({ wid: ADEXIUM_WID, adFormat: ADEXIUM_FORMAT })) ||
                  (w.start && w.start({ wid: ADEXIUM_WID, adFormat: ADEXIUM_FORMAT }));
        if (p?.then) await p;
        return { shown: true };
      } catch (e) { console.warn("[Adexium] factory show error:", e); }
    }

    // 3) клас віджета з SDK (згідно документації)
    if (ready.widgetC) {
      try {
        const w = new window.AdexiumWidget({ wid: ADEXIUM_WID, adFormat: ADEXIUM_FORMAT });
        if (typeof w.show === "function") { const p = w.show(); if (p?.then) await p; }
        else if (typeof w.open === "function") { const p = w.open(); if (p?.then) await p; }
        else if (typeof w.start === "function") { const p = w.start(); if (p?.then) await p; }
        else if (typeof w.autoMode === "function") { await w.autoMode(); } // можна, але в нас показ по кліку
        return { shown: true };
      } catch (e) { console.warn("[Adexium] widget show error:", e); }
    }

    return { shown: false, reason: "adexium_show_unavailable" };
  } catch (err) {
    console.warn("[Adexium] not shown:", err?.message || err);
    return { shown: false, reason: err?.message || "adexium_error" };
  }
}

/* ========= СТАН ========= */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

/* --- лічильники квестів 5/10 --- */
let ad5Count = 0, ad10Count = 0;
let lastTask5RewardAt = 0, lastTask10RewardAt = 0;

/* --- щоденні лічильники +0.1⭐ окремо для провайдерів --- */
let gramCount = 0, exCount = 0;     // перегляди за сьогодні
let lastGramAt = 0, lastExAt = 0;   // не блокують покази (DAILY_COOLDOWN_MS = 0), лиш для статистики
let dailyStamp = "";                // 'YYYY-MM-DD' для авто-ресету

/* --- пострекламний таймер --- */
let postAdTimerActive = false;
let postAdInterval = null;

/* ========= РЕКЛАМА ========= */
let AdTaskMinute = null;   // Adsgram controller: daily +0.1⭐
let AdTask510    = null;   // Adsgram controller: 5/10 реклам
let AdGameover   = null;   // Adsgram controller: game over

let lastGameoverAdAt = 0;
let lastAnyAdAt = 0;

let adInFlightGameover = false;
let adInFlightTask5 = false;
let adInFlightTask10 = false;

/* ========= БАТЛ (виклик суперника) ========= */
let oppScorePending = null; // ЗБЕРІГАЄМО В localStorage
let challengeActive = false;
let challengeStartAt = 0;
let challengeDeadline = 0;
let challengeStake = 0;
let challengeOpp = 0;

/* ========= ХЕЛПЕРИ ========= */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(2);
const setBalanceUI = () => $("balance") && ($("balance").innerText = formatStars(balance));

function saveData(){
  localStorage.setItem("balance", String(balance));
  localStorage.setItem("subscribed", subscribed ? "true" : "false");
  localStorage.setItem("task50Completed", task50Completed ? "true" : "false");
  localStorage.setItem("highscore", String(highscore));
  localStorage.setItem("gamesPlayedSinceClaim", String(gamesPlayedSinceClaim));
  localStorage.setItem("lastAnyAdAt", String(lastAnyAdAt));

  // 5/10
  localStorage.setItem("ad5Count", String(ad5Count));
  localStorage.setItem("ad10Count", String(ad10Count));
  localStorage.setItem("lastTask5RewardAt", String(lastTask5RewardAt));
  localStorage.setItem("lastTask10RewardAt", String(lastTask10RewardAt));

  // daily +0.1
  localStorage.setItem("dailyGramCount", String(gramCount));
  localStorage.setItem("dailyExCount", String(exCount));
  localStorage.setItem("lastGramAt", String(lastGramAt));
  localStorage.setItem("lastExAt", String(lastExAt));
  localStorage.setItem("dailyStamp", dailyStamp);

  // батл
  localStorage.setItem("oppScorePending", oppScorePending==null ? "" : String(oppScorePending));
  localStorage.setItem("challengeActive", challengeActive ? "true" : "false");
  localStorage.setItem("challengeStartAt", String(challengeStartAt));
  localStorage.setItem("challengeDeadline", String(challengeDeadline));
  localStorage.setItem("challengeStake", String(challengeStake));
  localStorage.setItem("challengeOpp", String(challengeOpp));
}

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
function _todayStamp(){
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
let dailyUiTicker = null;
let challengeTicker = null;

window.onload = function(){
  // базові стейти
  balance = parseFloat(localStorage.getItem("balance") || "0");
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  highscore = parseInt(localStorage.getItem("highscore") || "0", 10);
  lastAnyAdAt      = parseInt(localStorage.getItem("lastAnyAdAt")  || "0", 10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0", 10);

  // 5/10
  ad5Count = parseInt(localStorage.getItem("ad5Count") || "0", 10);
  ad10Count = parseInt(localStorage.getItem("ad10Count") || "0", 10);
  lastTask5RewardAt = parseInt(localStorage.getItem("lastTask5RewardAt") || "0", 10);
  lastTask10RewardAt = parseInt(localStorage.getItem("lastTask10RewardAt") || "0", 10);

  // daily +0.1
  gramCount  = parseInt(localStorage.getItem('dailyGramCount')||'0',10);
  exCount    = parseInt(localStorage.getItem('dailyExCount')||'0',10);
  lastGramAt = parseInt(localStorage.getItem('lastGramAt')||'0',10);
  lastExAt   = parseInt(localStorage.getItem('lastExAt')||'0',10);
  dailyStamp = localStorage.getItem('dailyStamp') || _todayStamp();

  // авто-ресет на новий день
  const t = _todayStamp();
  if (dailyStamp !== t){
    gramCount = 0; exCount = 0;
    lastGramAt = 0; lastExAt = 0;
    dailyStamp = t;
  }

  setBalanceUI();
  const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
  updateGamesTaskUI();
  renderPayoutList();

  const subBtn = $("subscribeBtn");
  if (subBtn){
    if (subscribed){ subBtn.innerText = (document.documentElement.lang==='en'?"Done":"Виконано"); subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  const t50 = $("checkTask50");
  if (t50){
    if (task50Completed){ t50.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); t50.classList.add("done"); }
    t50.addEventListener("click", ()=>{
      if (highscore >= 75 && !task50Completed){
        addBalance(5.15);
        t50.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); t50.classList.add("done");
        task50Completed = true; saveData();
      } else {
        alert(document.documentElement.lang==='en' ? "❌ Highscore is too low (need 75+)" : "❌ Твій рекорд замалий (потрібно 75+)");
      }
    });
  }

  const g100Btn = $("checkGames100Btn");
  if (g100Btn) g100Btn.addEventListener("click", onCheckGames100);

  initLeaderboard(); // заглушка

  const link = "https://t.me/Stacktongame_bot";
  if ($("shareLink")) $("shareLink").value = link;
  if ($("copyShareBtn")) $("copyShareBtn").addEventListener("click", ()=>copyToClipboard(link));

  const withdrawBtn = $("withdrawBtn");
  if (withdrawBtn) withdrawBtn.addEventListener("click", withdraw50ShareToGroup);

  // таски 5/10
  if ($("watchAd5Btn"))  $("watchAd5Btn").addEventListener("click", onWatchAd5);
  if ($("watchAd10Btn")) $("watchAd10Btn").addEventListener("click", onWatchAd10);

  // ЩОДЕННІ +0.1⭐ — прив’язка до кнопок з HTML
  $("watchAdsgramDailyBtn")?.addEventListener("click", onWatchGramDaily);
  $("watchAdexiumDailyBtn")?.addEventListener("click", onWatchExDaily);

  // батл UI
  setupChallengeUI();

  // Ініт SDK Adsgram
  initAds();

  // 3D гра
  window.stackGame = new Game();

  // UI тікер
  startDailyPlusTicker();
  updateAdTasksUI(); // 5/10
  updateDailyUI();   // +0.1
};

function addBalance(n){ balance = parseFloat((balance + n).toFixed(2)); setBalanceUI(); saveData(); }
function subscribe(){
  if (subscribed) return;
  const url = "https://t.me/stackofficialgame";
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank");
  subscribed = true; addBalance(1);
  const btn = $("subscribeBtn"); if (btn){ btn.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); btn.classList.add("done"); }
  saveData();
}

/* ========= Навігація (якщо хочеш — можна забрати, бо є в index.html) ========= */
function showPage(id, btn){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".menu button").forEach(b=>b.classList.remove("active"));
  btn?.classList.add("active");
  isPaused = (id !== "game");
  if (id==='leaderboard'){ loadLeaderboard?.(); }
}
window.showPage = showPage;

/* ========= Лідерборд-заглушка ========= */
function initLeaderboard(){ /* no-op */ }

/* ========= Реклама: SDK Adsgram ========= */
function initAds(){
  const sdk = window.Adsgram || window.SAD || null;
  if (!sdk){
    console.warn("Adsgram SDK не завантажився");
    return;
  }
  try { AdTaskMinute = (sdk.init ? sdk.init({ blockId: ADSGRAM_BLOCK_ID_TASK_MINUTE }) : sdk.AdController?.create({blockId: ADSGRAM_BLOCK_ID_TASK_MINUTE})); }
  catch (e) { console.warn("Adsgram init (daily +0.1) error:", e); }

  try { AdTask510 = (sdk.init ? sdk.init({ blockId: ADSGRAM_BLOCK_ID_TASK_510 }) : sdk.AdController?.create({blockId: ADSGRAM_BLOCK_ID_TASK_510})); }
  catch (e) { console.warn("Adsgram init (5/10) error:", e); }

  try { AdGameover = (sdk.init ? sdk.init({ blockId: ADSGRAM_BLOCK_ID_GAMEOVER }) : sdk.AdController?.create({blockId: ADSGRAM_BLOCK_ID_GAMEOVER})); }
  catch (e) { console.warn("Adsgram init (gameover) error:", e); }
}

function inTelegramWebApp(){ return !!(window.Telegram && Telegram.WebApp); }

async function showAdsgram(controller){
  if (!controller) return { shown:false, reason:'adsgram_no_controller' };
  try{
    await controller.show();
    return { shown:true };
  }catch(err){
    return { shown:false, reason: err?.description || err?.state || "no_fill_or_error" };
  }
}

/* ========= ЩОДЕННІ +0.1⭐ (дві кнопки) ========= */
function startDailyPlusTicker(){
  if (dailyUiTicker) clearInterval(dailyUiTicker);
  dailyUiTicker = setInterval(()=>{
    updateDailyUI();
    updateAdTasksUI();
  }, 1000);
  updateDailyUI();
}

function updateDailyUI(){
  const g = $("adGramCounter");
  const e = $("adExCounter");
  if (g) g.textContent = String(Math.min(gramCount, DAILY_CAP));
  if (e) e.textContent = String(Math.min(exCount, DAILY_CAP));

  const gBtn = $("watchAdsgramDailyBtn");
  const eBtn = $("watchAdexiumDailyBtn");
  // БЕЗ кулдауна: блокуємо лише коли досягнуто денний ліміт
  if (gBtn) gBtn.disabled = (gramCount >= DAILY_CAP);
  if (eBtn) eBtn.disabled = (exCount >= DAILY_CAP);
}

async function onWatchGramDaily(){
  if (gramCount >= DAILY_CAP) return;

  const res = await showAdsgram(AdTaskMinute);
  if (!res.shown) return;

  lastGramAt = Date.now(); // статистика
  gramCount += 1;
  addBalance(0.1);
  saveData();
  updateDailyUI();
}

async function onWatchExDaily(){
  if (exCount >= DAILY_CAP) return;

  const res = await showAdexiumInterstitial();
  if (!res.shown) {
    console.warn('[Adexium] not shown, reason =', res.reason);
    return; // не зараховуємо перегляд, якщо показу не було
  }

  lastExAt = Date.now(); // статистика
  exCount += 1;
  addBalance(0.1);
  saveData();
  updateDailyUI();
}

/* ========= 5 і 10 реклам ========= */
function formatHMS(ms){
  ms = Math.max(0, ms|0);
  const s = Math.ceil(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  return (hh>0 ? String(hh).padStart(2,'0')+":" : "") + String(mm).padStart(2,'0')+":"+String(ss).padStart(2,'0');
}
function updateAdTasksUI(){
  const fiveWrap = $("taskWatch5");
  const fiveCD   = $("taskWatch5Cooldown");
  const fiveCnt  = $("ad5Counter");
  const fiveCDt  = $("ad5CooldownText");

  const now = Date.now();
  const left5 = TASK_DAILY_COOLDOWN_MS - (now - lastTask5RewardAt);

  if (fiveCnt) fiveCnt.textContent = `${Math.min(ad5Count, TASK5_TARGET)}/${TASK5_TARGET}`;

  if (left5 > 0){
    if (fiveWrap) fiveWrap.style.display = "none";
    if (fiveCD){ fiveCD.style.display = "flex"; }
    if (fiveCDt) fiveCDt.textContent = formatHMS(left5);
  }else{
    if (fiveWrap) fiveWrap.style.display = "flex";
    if (fiveCD) fiveCD.style.display = "none";
  }

  const tenWrap = $("taskWatch10");
  const tenCD   = $("taskWatch10Cooldown");
  const tenCnt  = $("ad10Counter");
  const tenCDt  = $("ad10CooldownText");

  const left10 = TASK_DAILY_COOLDOWN_MS - (now - lastTask10RewardAt);

  if (tenCnt) tenCnt.textContent = `${Math.min(ad10Count, TASK10_TARGET)}/${TASK10_TARGET}`;

  if (left10 > 0){
    if (tenWrap) tenWrap.style.display = "none";
    if (tenCD){ tenCD.style.display = "flex"; }
    if (tenCDt) tenCDt.textContent = formatHMS(left10);
  }else{
    if (tenWrap) tenWrap.style.display = "flex";
    if (tenCD) tenCD.style.display = "none";
  }
}
async function onWatchAd5(){
  const now = Date.now();
  if (now - lastTask5RewardAt < TASK_DAILY_COOLDOWN_MS) return;

  if (adInFlightTask5) return;
  adInFlightTask5 = true;
  try{
    const res = await showAdsgram(AdTask510);
    if (!res.shown) return;

    ad5Count += 1;
    if (ad5Count >= TASK5_TARGET){
      addBalance(1);
      ad5Count = 0;
      lastTask5RewardAt = Date.now();
    }
    saveData();
    updateAdTasksUI();
  } finally { adInFlightTask5 = false; }
}
async function onWatchAd10(){
  const now = Date.now();
  if (now - lastTask10RewardAt < TASK_DAILY_COOLDOWN_MS) return;

  if (adInFlightTask10) return;
  adInFlightTask10 = true;
  try{
    const res = await showAdsgram(AdTask510);
    if (!res.shown) return;

    ad10Count += 1;
    if (ad10Count >= TASK10_TARGET){
      addBalance(1.85);
      ad10Count = 0;
      lastTask10RewardAt = Date.now();
    }
    saveData();
    updateAdTasksUI();
  } finally { adInFlightTask10 = false; }
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

/* ========= КОДИ для виводу ========= */
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
  return core.slice(0,8)+ver+core.slice(8)+chk;
}

/* ======= Трансформ у КОД2 ======= */
const DIGIT_MAP = { "2":"6","6":"3","3":"8","8":"5","5":"9","9":"4","4":"7","7":"2" };
const LETTER_MAP = {
  "A":"Q","B":"T","C":"M","D":"R","E":"K","F":"X","G":"A","H":"V",
  "J":"C","K":"Z","L":"E","M":"H","N":"Y","P":"S","Q":"D","R":"B",
  "S":"U","T":"F","U":"J","V":"G","W":"N","X":"P","Y":"W","Z":"L"
};
const PERM1 = [11, 2,17, 6,14,19, 0, 8, 4,16, 1,13, 9, 3,18, 5,12, 7,15,10];
const PERM2 = [15, 0, 9,13, 6,18, 3,11, 1,16, 4,14, 8, 2,19, 5,12, 7,17,10];

function transformCodeHeavy(code){
  if (typeof code!=="string" || code.length!==20) return "";
  const sub = Array.from(code).map(ch=>{
    if (DIGIT_MAP[ch]) return DIGIT_MAP[ch];
    if (LETTER_MAP[ch]) return LETTER_MAP[ch];
    return ch;
  });
  const i2 = ALPH.indexOf(code[2])  >>> 0;
  const i7 = ALPH.indexOf(code[7])  >>> 0;
  const i13= ALPH.indexOf(code[13]) >>> 0;
  const i19= ALPH.indexOf(code[19]) >>> 0;
  const choose = ((i2 + i7 + i13 + i19) % 2) === 0 ? PERM1 : PERM2;

  const out = new Array(20);
  for (let i=0;i<20;i++) out[i] = sub[ choose[i] ];
  return out.join("");
}

/* ========= Вивід: 50⭐ + лог до списку ========= */
function withdraw50ShareToGroup(){
  const statusEl = $("withdrawStatus");

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

  balance = Number((balance - WITHDRAW_CHUNK).toFixed(2));
  setBalanceUI(); saveData();

  // лог у список виводів
  const entry = { ts: Date.now(), amount: WITHDRAW_CHUNK, code1, code2 };
  const arr = JSON.parse(localStorage.getItem("payouts") || "[]");
  arr.unshift(entry);
  localStorage.setItem("payouts", JSON.stringify(arr));
  renderPayoutList();

  if (OPEN_MODE === "group" && GROUP_LINK) {
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
    const shareUrl = "https://t.me/share/url?text=" + encodeURIComponent(text);
    if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank");
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вибери групу у «Поділитися» та надішли."; }
  }
}

function renderPayoutList(){
  const ul = $("payoutList");
  if (!ul) return;
  const arr = JSON.parse(localStorage.getItem("payouts") || "[]");
  ul.innerHTML = "";
  if (arr.length === 0){
    const li = document.createElement("li");
    li.textContent = "Ще немає виводів.";
    ul.appendChild(li);
    return;
  }
  arr.forEach(e=>{
    const d = new Date(e.ts);
    const li = document.createElement("li");
    li.innerHTML = `🗓 ${d.toLocaleString()} — 💸 ${e.amount}⭐<br><span class="muted">Код1: ${e.code1} • Код2: ${e.code2}</span>`;
    ul.appendChild(li);
  });
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

/* ========= БАТЛ: логіка ========= */
function weightedOppScore(){
  const r = Math.random();
  if (r < 0.15){
    return 83 + Math.floor(Math.random() * (100 - 83 + 1));
  }
  return 101 + Math.floor(Math.random() * (150 - 101 + 1));
}

function setupChallengeUI(){
  const scoreBox = $("opponentScore");
  const genBtn = $("genOpponentBtn");
  const startBtn = $("startChallengeBtn");
  const stakeInput = $("stakeInput");
  const checkBtn = $("checkChallengeBtn");
  const info = $("challengeInfo");
  const cdWrap = $("challengeCountdown");
  const leftEl = $("challengeLeft");
  const statusEl = $("challengeStatus");

  // Початковий стан (oppScorePending з localStorage)
  const storedOpp = localStorage.getItem("oppScorePending");
  if (storedOpp && !isNaN(+storedOpp)) oppScorePending = +storedOpp;
  if (scoreBox) scoreBox.textContent = oppScorePending!=null ? String(oppScorePending) : "—";

  genBtn.onclick = ()=>{
    if (challengeActive) return;
    if (oppScorePending == null){
      oppScorePending = weightedOppScore();
      if (scoreBox) scoreBox.textContent = String(oppScorePending);
      saveData();
    }
  };

  startBtn.onclick = ()=>{
    if (challengeActive) return;
    if (oppScorePending == null){
      alert("Спочатку згенеруй суперника.");
      return;
    }
    const stake = parseFloat(stakeInput.value || "0");
    if (!(stake>0)) return;
    if (balance < stake){
      alert("Недостатньо ⭐ для ставки.");
      return;
    }
    balance = parseFloat((balance - stake).toFixed(2));
    setBalanceUI();

    challengeActive = true;
    challengeStartAt = Date.now();
    challengeDeadline = challengeStartAt + 3*60*60*1000; // 3 години
    challengeStake = stake;
    challengeOpp = oppScorePending; // фіксуємо поточного суперника

    info.textContent = `Виклик активний! Твій суперник має рекорд ${challengeOpp}. Побий його до завершення таймера.`;
    checkBtn.disabled = false;
    cdWrap.style.display = "block";
    statusEl.textContent = "";
    saveData();

    if (challengeTicker) clearInterval(challengeTicker);
    challengeTicker = setInterval(()=>{
      const left = Math.max(0, challengeDeadline - Date.now());
      leftEl.textContent = formatHMS(left);
      if (left<=0){
        clearInterval(challengeTicker);
      }
    }, 1000);
  };

  checkBtn.onclick = ()=>{
    if (!challengeActive){
      statusEl.textContent = "Немає активного виклику.";
      return;
    }
    const now = Date.now();
    const won = (highscore > challengeOpp) && (now <= challengeDeadline);
    const expired = now > challengeDeadline;

    if (won){
      addBalance(challengeStake * 1.5); // виграш
      statusEl.textContent = "✅ Виконано! Нараховано " + (challengeStake*1.5).toFixed(2) + "⭐";
      checkBtn.disabled = true;
      finishChallenge();
    } else if (expired){
      statusEl.textContent = "❌ Час вичерпано. Ставка втрачена.";
      checkBtn.disabled = true;
      finishChallenge();
    } else {
      statusEl.textContent = "Ще не побито рекорд суперника. Спробуй підвищити свій рекорд!";
    }
  };

  // Якщо відновлювали зі сховища (активний виклик)
  const storedActive = localStorage.getItem("challengeActive")==="true";
  if (storedActive){
    challengeActive = true;
    challengeStartAt  = parseInt(localStorage.getItem("challengeStartAt") || "0", 10);
    challengeDeadline = parseInt(localStorage.getItem("challengeDeadline") || "0", 10);
    challengeStake    = parseFloat(localStorage.getItem("challengeStake") || "0");
    challengeOpp      = parseInt(localStorage.getItem("challengeOpp") || "0", 10);

    info.textContent = `Виклик активний! Твій суперник має рекорд ${challengeOpp}.`;
    checkBtn.disabled = false;
    cdWrap.style.display = "block";
    if (challengeTicker) clearInterval(challengeTicker);
    challengeTicker = setInterval(()=>{
      const left = Math.max(0, challengeDeadline - Date.now());
      leftEl.textContent = formatHMS(left);
      if (left<=0){
        clearInterval(challengeTicker);
      }
    }, 1000);
  }
}
function finishChallenge(){
  challengeActive = false;
  challengeStartAt = 0;
  challengeDeadline = 0;
  challengeStake = 0;
  challengeOpp = 0;
  oppScorePending = null; // очищаємо «рекорд суперника» після завершення
  const scoreBox = $("opponentScore");
  if (scoreBox) scoreBox.textContent = "—";
  $("challengeCountdown").style.display = "none";
  $("challengeInfo").textContent = "Немає активного виклику.";
  saveData();
}

/* ========= 3D Stack (гра) ========= */
class Stage{
  constructor(){
    this.container = document.getElementById("container");
    this.scene = new THREE.Scene();
    // прозорий рендерер, щоб CSS-фон було видно під грою
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
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

    document.addEventListener("keydown",(e)=>{ if(isPaused || postAdTimerActive) return; if(e.keyCode===32) this.onAction(); });
    document.addEventListener("click",(e)=>{ if(isPaused || postAdTimerActive) return; if($("game").classList.contains("active") && e.target.tagName.toLowerCase()==="canvas") this.onAction(); });
    $("start-button").addEventListener("click",()=>{ if (postAdTimerActive) return; this.onAction(); });
  }

  hardResetAfterEnd(){
    [this.newBlocks, this.placedBlocks, this.choppedBlocks].forEach(g=>{
      for(let i=g.children.length-1;i>=0;i--) g.remove(g.children[i]);
    });
    this.blocks = [];
    this.stage.setCamera(2, 0);
    this.scoreEl.innerHTML = "0";
    $("instructions").classList.remove("hide");
    this.addBlock();
  }

  showReady(){ $("ready").style.display="block"; $("gameOver").style.display="none"; $("postAdTimer").style.display="none"; this.state=this.STATES.READY; }
  showGameOver(){ $("gameOver").style.display="block"; $("ready").style.display="none"; $("postAdTimer").style.display="none"; this.state=this.STATES.ENDED; }
  hideOverlays(){ $("gameOver").style.display="none"; $("ready").style.display="none"; $("postAdTimer").style.display="none"; }

  onAction(){
    switch(this.state){
      case this.STATES.READY:   this.startGame(); break;
      case this.STATES.PLAYING: this.placeBlock(); break;
      case this.STATES.ENDED:   this.restartGame(); break;
    }
  }

  startGame(){
    if (this.blocks.length && this.blocks[this.blocks.length-1].state === 'missed'){
      this.hardResetAfterEnd();
    }
    if(this.state===this.STATES.PLAYING) return;
    this.scoreEl.innerHTML="0"; this.hideOverlays();
    this.state=this.STATES.PLAYING; this.addBlock();
  }

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

  async addBlock(){
    const last=this.blocks[this.blocks.length-1];
    if(last && last.state===last.STATES.MISSED) return this.endGame();
    this.scoreEl.innerHTML=String(this.blocks.length-1);
    const b=new Block(last); this.newBlocks.add(b.mesh); this.blocks.push(b);
    this.stage.setCamera(this.blocks.length*2);
    if(this.blocks.length>=5) $("instructions").classList.add("hide");
  }

  async endGame(){
    const currentScore=parseInt(this.scoreEl.innerText,10);
    updateHighscore(currentScore);
    gamesPlayedSinceClaim += 1; saveData(); updateGamesTaskUI();

    // показ реклами «gameover»: тільки Adsgram-блок для gameover
    const now = Date.now();
    if (!adInFlightGameover && (now - lastGameoverAdAt >= Math.max(MIN_BETWEEN_SAME_CTX_MS, GAME_AD_COOLDOWN_MS))){
      adInFlightGameover = true;
      try{
        const r = await showAdsgram(AdGameover);
        if (r.shown){
          lastGameoverAdAt = Date.now();
          lastAnyAdAt = lastGameoverAdAt;
          saveData();
        }
      } finally { adInFlightGameover = false; }
    }

    this.startPostAdCountdown();
  }

  startPostAdCountdown(){
    postAdTimerActive = true;
    this.state = this.STATES.ENDED;
    $("postAdTimer").style.display = "block";
    const el = $("postAdCountdown");
    let remain = POST_AD_TIMER_MS;
    if (postAdInterval) clearInterval(postAdInterval);
    el.textContent = Math.ceil(remain/1000);

    postAdInterval = setInterval(()=>{
      remain -= 1000;
      if (remain <= 0){
        clearInterval(postAdInterval);
        $("postAdTimer").style.display = "none";
        postAdTimerActive = false;
        this.hardResetAfterEnd();
        this.showReady();
      } else {
        el.textContent = Math.ceil(remain/1000);
      }
    }, 1000);
  }

  tick(){ if(!isPaused){ this.blocks[this.blocks.length-1].tick(); this.stage.render(); } requestAnimationFrame(()=>this.tick()); }
}

function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    localStorage.setItem("highscore", String(highscore));
    const hs=$("highscore"); if (hs) hs.innerText="🏆 "+highscore;
  }
}
