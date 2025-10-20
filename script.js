"use strict";
console.clear();

/* ================== НАСТРОЙКИ CLOUD (ЗАМІНИ НА СВІЇ) ================== */
// URL Web App (Google Apps Script) — приклад: "https://script.google.com/macros/s/XX/exec"
const CLOUD_WEBAPP_URL = "https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec"; // <- ЗАМІНИ
const CLOUD_API_KEY    = "YOUR_API_KEY_HERE"; // <- ЗАМІНИ

/* ========= КОНСТАНТИ ========= */
const DAILY_CAP = 25;
const DAILY_COOLDOWN_MS = 0;

const GAME_AD_COOLDOWN_MS = 15_000;
const ANY_AD_COOLDOWN_MS  = 60_000;
const MIN_BETWEEN_SAME_CTX_MS = 10_000;

const POST_AD_TIMER_MS = 15_000;

const GAMES_TARGET = 100;
const GAMES_REWARD = 5;

const WITHDRAW_CHUNK = 50;

/* --- Adsgram блоки (залишено) --- */
const ADSGRAM_BLOCK_ID_TASK_MINUTE = "int-13961";
const ADSGRAM_BLOCK_ID_TASK_510    = "int-15276";
const ADSGRAM_BLOCK_ID_GAMEOVER    = "int-15275";

/* --- Квести на рекламу 5 і 10 --- */
const TASK5_TARGET = 5;
const TASK10_TARGET = 10;
const TASK_DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/* ========= ХЕЛПЕРИ ========= */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(2);

function setBalanceUI(){
  const el = $("balance");
  if (el) el.innerText = formatStars(balance);
}
function _todayStamp(){
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function msUntilMidnightLocal(){
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 0, 0);
  return next - now;
}
function formatHMS(ms){
  ms = Math.max(0, ms|0);
  const s = Math.ceil(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  return (hh>0 ? String(hh).padStart(2,'0')+":" : "") + String(mm).padStart(2,'0')+":"+String(ss).padStart(2,'0');
}

/* === формат для відображення комірки J..X === */
function looksISO(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s); }
function looksEpoch(s){ return /^\d{10,13}$/.test(String(s||'')); }
function isNumericString(s){ return /^-?\d+(\.\d+)?$/.test(String(s||'').trim()); }
function formatWithdrawCell(val){
  if (val==null || val==='' || String(val) === '0') return '0';
  const s = String(val);
  // Якщо чисто число — показуємо як число
  if (isNumericString(s)) return s;
  try{
    if (looksISO(s)) return new Date(s).toLocaleString();
    if (looksEpoch(s)) {
      const ms = s.length===13 ? Number(s) : Number(s)*1000;
      return new Date(ms).toLocaleString();
    }
  }catch(_){}
  return s; // інші варіанти показуємо як є
}

/* ========= CLOUD (конфіг) ========= */
const CLOUD = {
  url: CLOUD_WEBAPP_URL,
  api: CLOUD_API_KEY
};

/** масив на 15 клітин (J..X): з бекенду можуть прийти ISO / epoch / numeric / '0' */
let serverWithdraws = [];
let payoutTag = '';

/* перший вільний (0/порожній) слот J..X */
function firstFreeWithdrawIndex(){
  const arr = Array.isArray(serverWithdraws) ? serverWithdraws : [];
  for (let i = 0; i < 15; i++){
    if (!arr[i] || String(arr[i]) === '0') return i;
  }
  return -1;
}

/* ========= CloudStore (front-end) ========= */
const CloudStore = (() => {
  const st = {
    enabled: !!(CLOUD.url && CLOUD.api),
    uid: '',
    username: '',
    lastRemote: null,
    pollTimer: null,
    pollMs: 15_000,
    debounceTimer: null,
    pushing: false,
  };

  function tgUser(){
    return (window.Telegram?.WebApp?.initDataUnsafe?.user) || null;
  }
  function identify(){
    const u = tgUser() || {};
    st.uid = u?.id ? String(u.id) : "";
    st.username = (u?.username || [u?.first_name||'', u?.last_name||''].filter(Boolean).join('')) || '';
  }
  function makeTag(){
    if (st.username) return st.username.startsWith('@') ? st.username : '@'+st.username;
    return '';
  }

  async function getRemote(){
    if (!st.enabled) return null;

    const uid = st.uid;
    const tg  = makeTag();
    const nocache = "&_=" + Date.now();

    async function tryUrl(u){
      try{
        const r = await fetch(u, { method:'GET', headers:{'accept':'application/json'} });
        if (!r.ok) return null;
        const j = await r.json().catch(()=>null);
        if (j && j.ok && j.data) return j.data;
      }catch(_){}
      return null;
    }

    // 1) спроба з uid+tg, 2) з uid, 3) з tg, 4) загальний get по uid пустому (backup)
    if (uid && tg){
      const urlBoth = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get&user_id=${encodeURIComponent(uid)}&tg_tag=${encodeURIComponent(tg)}${nocache}`;
      const d = await tryUrl(urlBoth); if (d) return d;
    }
    if (uid){
      const urlUid = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get&user_id=${encodeURIComponent(uid)}${nocache}`;
      const d = await tryUrl(urlUid); if (d) return d;
    }
    if (tg){
      const urlTag = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get&tg_tag=${encodeURIComponent(tg)}${nocache}`;
      const d = await tryUrl(urlTag); if (d) return d;
    }

    // остання спроба — просто get (щоб створити строку якщо бек автоматично upsert-ить)
    const urlAny = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get${nocache}`;
    const d = await tryUrl(urlAny); if (d) return d;

    return null;
  }

  async function pushRemote(partial){
    if (!st.enabled || (!st.uid && !makeTag())) return;
    const body = {
      api: CLOUD.api,
      user_id: st.uid || undefined,
      username: st.username.replace(/^@/, '') || undefined,
      tg_tag: makeTag() || undefined,
      balance: (partial.balance!=null ? Number(partial.balance) : Number(balance||0)),
      highscore: (partial.highscore!=null ? Number(partial.highscore) : Number(highscore||0)),
      last_score: (partial.last_score!=null ? Number(partial.last_score) : Number(parseInt($("score")?.innerText||"0",10))),
      battle_record: (partial.battle_record!=null ? Number(partial.battle_record) : Number(localStorage.getItem('battle_record')||'0')),
    };
    st.pushing = true;
    try{
      const r = await fetch(CLOUD.url, {
        method:'POST',
        headers:{ 'Content-Type':'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(()=>null);
      if (j && j.ok) st.lastRemote = j.data || null;
    }catch(_){ console.warn('pushRemote err'); }
    finally { st.pushing = false; }
  }
  function queuePush(partial={}){ if (!st.enabled) return; clearTimeout(st.debounceTimer); st.debounceTimer=setTimeout(()=>pushRemote(partial),700); }

  function applyRemoteToState(rem){
    if (!rem) return;

    // highscore — максимум
    if (typeof rem.highscore === 'number' && rem.highscore > (highscore||0)){
      highscore = rem.highscore;
      const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
    }
    // balance: приймаємо з хмари (але не перетираємо локальний >0 на 0)
    if (typeof rem.balance === 'number' && rem.balance !== balance){
      if (!(rem.balance === 0 && balance > 0)) {
        balance = parseFloat(rem.balance.toFixed(2));
        setBalanceUI();
      }
    }
    // battle_record max (LS)
    const localBattle = Number(localStorage.getItem('battle_record')||'0');
    const newBattle = Math.max(localBattle, Number(rem.battle_record||0));
    if (newBattle !== localBattle) localStorage.setItem('battle_record', String(newBattle));

    // payout tag
    if (rem.tg_tag && typeof rem.tg_tag === "string") payoutTag = rem.tg_tag.trim();

    // withdraws: беремо 15 значень
    if (Array.isArray(rem.withdraws)){
      serverWithdraws = rem.withdraws.slice(0,15).map(x => (x==null||x==='') ? '0' : String(x));
      while (serverWithdraws.length < 15) serverWithdraws.push('0');
      renderPayoutList();
    }
  }

  async function hydrate(){
    if (!st.enabled) return;
    identify();
    try{
      const rem = await getRemote();
      st.lastRemote = rem;
      if (rem) applyRemoteToState(rem);
      // якщо не було рядка — створимо (upsert пустий рядок) щоб J..X заповнились 0
      if (!rem && (st.uid || makeTag())) { queuePush({}); }
    }catch(e){ console.warn('[Cloud] hydrate failed', e); }
  }
  function startPolling(){
    if (!st.enabled) return;
    clearInterval(st.pollTimer);
    st.pollTimer = setInterval(async()=>{ try{
      const rem = await getRemote(); if (rem) CloudStore.applyRemoteToState(rem);
    }catch(_){ } }, st.pollMs);
  }
  function initAndHydrate(){
    if (!st.enabled){ console.warn('[Cloud] disabled: CLOUD_URL / CLOUD_API_KEY not set'); return; }
    identify();
    hydrate().then(startPolling);
    window.addEventListener('beforeunload', ()=>{ try{}catch(_){ } });
  }

  return { initAndHydrate, queuePush, tgUser, getRemote, applyRemoteToState };
})();

/* ========= ЄДИНА ТОЧКА ДОБОВОГО РЕСЕТУ ========= */
function ensureDailyReset() {
  const today = _todayStamp();
  const stored = localStorage.getItem('dailyStamp') || today;
  if (stored !== today) {
    gramCount = 0; exCount = 0;
    lastGramAt = 0; lastExAt = 0;
    dailyStamp = today;
    localStorage.setItem('dailyGramCount','0');
    localStorage.setItem('dailyExCount','0');
    localStorage.setItem('lastGramAt','0');
    localStorage.setItem('lastExAt','0');
    localStorage.setItem('dailyStamp',today);
    saveData();
    try{ window.dispatchEvent(new CustomEvent('daily-reset',{detail:{day:today}})); }catch(e){}
  }
}

/* ========= СТАН ========= */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

let ad5Count = 0, ad10Count = 0;
let lastTask5RewardAt = 0, lastTask10RewardAt = 0;

let gramCount = 0, exCount = 0;
let lastGramAt = 0, lastExAt = 0;
let dailyStamp = "";

let postAdTimerActive = false;
let postAdInterval = null;

/* ========= РЕКЛАМА ========= */
let AdTaskMinute = null;
let AdTask510    = null;
let AdGameover   = null;

let lastGameoverAdAt = 0;
let lastAnyAdAt = 0;

let adInFlightGameover = false;
let adInFlightTask5 = false;
let adInFlightTask10 = false;

/* ========= БАТЛ ========= */
let oppScorePending = null;
let challengeActive = false;
let challengeStartAt = 0;
let challengeDeadline = 0;
let challengeStake = 0;
let challengeOpp = 0;

/* ========= ЗБЕРЕЖЕННЯ ========= */
function saveData(){
  localStorage.setItem("subscribed", subscribed ? "true" : "false");
  localStorage.setItem("task50Completed", task50Completed ? "true" : "false");
  localStorage.setItem("gamesPlayedSinceClaim", String(gamesPlayedSinceClaim));
  localStorage.setItem("lastAnyAdAt", String(lastAnyAdAt));
  localStorage.setItem("ad5Count", String(ad5Count));
  localStorage.setItem("ad10Count", String(ad10Count));
  localStorage.setItem("lastTask5RewardAt", String(lastTask5RewardAt));
  localStorage.setItem("lastTask10RewardAt", String(lastTask10RewardAt));
  localStorage.setItem("dailyGramCount", String(gramCount));
  localStorage.setItem("dailyExCount", String(exCount));
  localStorage.setItem("lastGramAt", String(lastGramAt));
  localStorage.setItem("lastExAt", String(lastExAt));
  localStorage.setItem("dailyStamp", dailyStamp);
  localStorage.setItem("oppScorePending", oppScorePending==null ? "" : String(oppScorePending));
  localStorage.setItem("challengeActive", challengeActive ? "true" : "false");
  localStorage.setItem("challengeStartAt", String(challengeStartAt));
  localStorage.setItem("challengeDeadline", String(challengeDeadline));
  localStorage.setItem("challengeStake", String(challengeStake));
  localStorage.setItem("challengeOpp", String(challengeOpp));
}

/* ========= ІД ТЕЛЕГРАМ ========= */
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

/* ===================== ВИВОДИ (J..X) — ЧИСЛА/дати ===================== */

/** Рендер 15 слотів (виводимо або число або дату / '0') */
function renderPayoutList(){
  const ul = $("payoutList");
  if (!ul) return;
  ul.innerHTML = "";

  const tag = payoutTag || getUserTag();
  const arr = Array.isArray(serverWithdraws) ? serverWithdraws.slice(0,15) : [];
  while (arr.length < 15) arr.push('0');

  for (let i=0; i<15; i++){
    const raw = String(arr[i] ?? '0');
    const rendered = formatWithdrawCell(raw);
    const li = document.createElement("li");
    // показати як "№1 — @tag — 50⭐" або "№1 — @tag — 2025-10-.."
    if (isNumericString(rendered) && rendered !== '0') {
      li.innerHTML = `№${i+1} — ${tag} — ${rendered}⭐`;
    } else {
      li.innerHTML = `№${i+1} — ${tag} — ${rendered}`;
    }
    ul.appendChild(li);
  }
}

/** POST → GAS: запис amount у перший вільний J..X (action = withdraw) */
async function submitWithdrawalToCloud15({ user_id, tag, username, amount }) {
  if (!CLOUD.url || !CLOUD.api) return { ok:false, error:"CLOUD_URL / CLOUD_API_KEY not set" };
  const payload = {
    api: CLOUD.api,
    action: "withdraw",
    user_id,
    tg_tag: tag || "",
    username: username || "",
    amount: Number(amount) || 0
  };
  try{
    const r = await fetch(String(CLOUD.url), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    let j=null; try { j = await r.json(); } catch {}
    if (r.ok && j && j.ok) {
      const slot = j.slot ?? null;
      return { ok:true, slot, amount: j.amount ?? Number(amount), ts: j.ts ?? null };
    }
    return { ok:false, error: (j?.error || `HTTP ${r.status}`) };
  } catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
}

/** Клік «Вивести»: оптимістичний апдейт + підтвердження із таблиці */
async function withdraw50LocalFirst(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");

  if (btn && btn.disabled) return; // анти-даблклік

  if (balance < WITHDRAW_CHUNK) {
    if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; }
    return;
  }

  const freeIdx = firstFreeWithdrawIndex();
  if (freeIdx < 0){
    if (statusEl){ statusEl.className="err"; statusEl.textContent="Немає вільних слотів для виводу"; }
    return;
  }

  if (btn) btn.disabled = true;

  const u = getTelegramUser();
  const tag = payoutTag || (u.username ? ("@"+u.username) : getUserTag());
  const id  = u.id || "";
  const uname = u.username || [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");

  // 1) оптимістично: ставимо число 50
  const prevValue = serverWithdraws[freeIdx];
  serverWithdraws[freeIdx] = String(WITHDRAW_CHUNK);
  renderPayoutList();
  if (statusEl){ statusEl.className="ok"; statusEl.textContent="Поставлено на вивід…"; }

  // 2) списуємо баланс
  const oldBalance = balance;
  balance = parseFloat((balance - WITHDRAW_CHUNK).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI(); saveData();

  // 3) надсилаємо у GAS
  const res = await submitWithdrawalToCloud15({
    user_id: id, tag, username: uname, amount: WITHDRAW_CHUNK
  });

  if (res.ok){
    // підтвердження: перечитати рядок з бекенду і застосувати
    try{
      const rem = await CloudStore.getRemote();
      if (rem) CloudStore.applyRemoteToState(rem);
    }catch(_){}
    if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вивід зафіксовано"; }
  } else {
    // ❌ фейл: відкот
    serverWithdraws[freeIdx] = prevValue ?? '0';
    renderPayoutList();
    balance = oldBalance; setBalanceUI(); saveData();
    if (statusEl){ statusEl.className="err"; statusEl.textContent = "Помилка: " + (res.error || "невідома"); }
  }

  if (btn) btn.disabled = false;
}

/* ========= СИНК ОЧІКУЮЧИХ (за бажанням) ========= */
function readPendingWithdrawals(){ try{ const arr=JSON.parse(localStorage.getItem("payouts_pending")||"[]"); return Array.isArray(arr)?arr:[]; }catch{ return []; } }
function writePendingWithdrawals(arr){ localStorage.setItem("payouts_pending", JSON.stringify(arr||[])); }
function getServerWithdrawCount(){ return (Array.isArray(serverWithdraws) ? serverWithdraws.filter(v=>v && String(v)!=='0').length : 0) | 0; }
async function syncPendingWithdrawals(){
  const statusEl=$("withdrawStatus");
  let pend=readPendingWithdrawals();
  if (pend.length===0){ renderPayoutList(); return; }
  for (let i=0;i<pend.length;i++){
    const it=pend[i]; if (it.synced) continue;
    const res = await submitWithdrawalToCloud15({ user_id: it.id, tag: it.tag, username: it.username, amount: WITHDRAW_CHUNK });
    if (res.ok){
      it.synced=true; it.slot=res.slot||null;
      if (statusEl){ statusEl.className="ok"; statusEl.textContent="Поставлено на вивід"; }
      const rem=await CloudStore.getRemote(); if (rem) CloudStore.applyRemoteToState(rem);
    } else {
      if (statusEl && !statusEl.textContent){ statusEl.className="muted"; statusEl.textContent="Очікуємо мережу…"; }
    }
    pend[i]=it; writePendingWithdrawals(pend); renderPayoutList();
  }
}

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
let dailyUiTicker = null;
let challengeTicker = null;
let syncTimer = null;

window.onload = function(){
  // базові стейти
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
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

  ensureDailyReset();

  setBalanceUI();
  const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
  updateGamesTaskUI();

  // показуємо 15 слотів (поки що '0'), доки не прийде хмара
  serverWithdraws = new Array(15).fill('0');
  renderPayoutList();

  const subBtn = $("subscribeBtn");
  if (subBtn){
    if (subscribed){ subBtn.innerText = (document.documentElement.lang==='en'?"Done":"Виконано"); subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  const t50 = $("checkTask50");
  if (t50){
    if (task50Completed){ t50.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); t50.classList.add("done"); }
    t50.addEventListener("click", ()=>{ if (highscore >= 75 && !task50Completed){ addBalance(5.15); t50.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); t50.classList.add("done"); task50Completed = true; saveData(); } else { alert(document.documentElement.lang==='en' ? "❌ Highscore is too low (need 75+)" : "❌ Твій рекорд замалий (потрібно 75+)"); } });
  }

  $("checkGames100Btn")?.addEventListener("click", onCheckGames100);
  $("withdrawBtn")?.addEventListener("click", withdraw50LocalFirst);

  // таски 5/10
  $("watchAd5Btn")?.addEventListener("click", onWatchAd5);
  $("watchAd10Btn")?.addEventListener("click", onWatchAd10);

  // Adsgram daily
  $("watchAdsgramDailyBtn")?.addEventListener("click", onWatchGramDaily);

  // батл UI
  setupChallengeUI();

  // Adsgram SDK
  initAds();

  // 3D гра
  window.stackGame = new Game();

  // UI тікер
  startDailyPlusTicker();
  updateAdTasksUI();
  updateDailyUI();

  // Хмара: ініціалізація та первинний хідрате
  try { CloudStore.initAndHydrate(); } catch(e){ console.warn(e); }

  // періодичний синк очікуючих виводів (за потреби)
  clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ syncPendingWithdrawals(); }, 20_000);
};

/* ========= Баланс / Підписка ========= */
function addBalance(n){
  balance = parseFloat((balance + n).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI();
  saveData();
  CloudStore.queuePush({ balance });
}
function subscribe(){
  if (subscribed) return;
  const url = "https://t.me/stackofficialgame";
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank");
  subscribed = true; addBalance(1);
  const btn = $("subscribeBtn"); if (btn){ btn.innerText=(document.documentElement.lang==='en'?"Done":"Виконано"); btn.classList.add("done"); }
  saveData();
}

/* ========= Лідерборд-заглушка ========= */
function initLeaderboard(){ /* no-op */ }

/* ========= Реклама (Adsgram) ========= */
// (залишено як в оригіналі)
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
async function showAdsgram(controller){
  if (!controller) return { shown:false, reason:'adsgram_no_controller' };
  try{
    await controller.show();
    return { shown:true };
  }catch(err){
    return { shown:false, reason: err?.description || err?.state || "no_fill_or_error" };
  }
}

/* ========= ЩОДЕННІ +0.1⭐ ========= */
function startDailyPlusTicker(){
  if (dailyUiTicker) clearInterval(dailyUiTicker);
  dailyUiTicker = setInterval(()=>{ updateDailyUI(); updateAdTasksUI(); }, 1000);
  updateDailyUI();
}
function updateDailyUI(){
  ensureDailyReset();
  const lsGram = parseInt(localStorage.getItem('dailyGramCount') || '0', 10);
  const lsEx   = parseInt(localStorage.getItem('dailyExCount')   || '0', 10);
  if (lsGram !== gramCount) gramCount = lsGram;
  if (lsEx   !== exCount)   exCount   = lsEx;

  const g = $("adGramCounter");
  const e = $("adExCounter");
  if (g) g.textContent = String(Math.min(gramCount, DAILY_CAP));
  if (e) e.textContent = String(Math.min(exCount, DAILY_CAP));

  const gBtn = $("watchAdsgramDailyBtn");
  const eBtn = $("watchAdexiumDailyBtn");
  const leftTxt = formatHMS(msUntilMidnightLocal());

  if (gBtn && !gBtn.dataset.label) gBtn.dataset.label = gBtn.innerText;
  if (eBtn && !eBtn.dataset.label) eBtn.dataset.label = eBtn.innerText;

  if (gBtn){
    gBtn.disabled = (gramCount >= DAILY_CAP);
    gBtn.innerText = (gramCount >= DAILY_CAP) ? `Ліміт до 00:00 (${leftTxt})` : (gBtn.dataset.label || gBtn.innerText);
  }
  if (eBtn){
    eBtn.disabled = (exCount >= DAILY_CAP);
    eBtn.innerText = (exCount >= DAILY_CAP) ? `Ліміт до 00:00 (${leftTxt})` : (eBtn.dataset.label || eBtn.innerText);
  }
}
async function onWatchGramDaily(){
  if (gramCount >= DAILY_CAP) return;
  const res = await showAdsgram(AdTaskMinute);
  if (!res.shown) return;
  lastGramAt = Date.now();
  gramCount += 1;
  addBalance(0.1);
  saveData();
  updateDailyUI();
}

/* ========= 5 і 10 реклам ========= */
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

/* ========= Копіювання ========= */
async function copyToClipboard(text){
  try{
    if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); }
    else { const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    alert("Скопійовано ✅");
  }catch{ alert("Не вдалося копіювати 😕"); }
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

/* ========= БАТЛ ========= */
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
    CloudStore.queuePush({ balance });

    challengeActive = true;
    challengeStartAt = Date.now();
    challengeDeadline = challengeStartAt + 3*60*60*1000;
    challengeStake = stake;
    challengeOpp = oppScorePending;

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
      addBalance(challengeStake * 1.5);
      statusEl.textContent = "✅ Виконано! Нараховано " + (challengeStake*1.5).toFixed(2) + "⭐";
      checkBtn.disabled = true;

      const prevBattle = Number(localStorage.getItem('battle_record')||'0');
      const newBattle = Math.max(prevBattle, challengeOpp);
      localStorage.setItem('battle_record', String(newBattle));
      CloudStore.queuePush({ battle_record: newBattle });

      finishChallenge();
    } else if (expired){
      statusEl.textContent = "❌ Час вичерпано. Ставка втрачена.";
      checkBtn.disabled = true;
      finishChallenge();
    } else {
      statusEl.textContent = "Ще не побито рекорд суперника. Спробуй підвищити свій рекорд!";
    }
  };

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
  oppScorePending = null;
  const scoreBox = $("opponentScore");
  if (scoreBox) scoreBox.textContent = "—";
  $("challengeCountdown").style.display = "none";
  $("challengeInfo").textContent = "Немає активного виклику.";
  saveData();
}

/* ========= 3D Stack (гра) ========= */
/* ======= Тут копіюй/залишай свою реалізацію гри (Stage, Block, Game) ======= */
/* Для стислості в цьому файлі я вже включив код гри нижче (який ти надсилав) */
/* ---- (код гри та функції updateHighscore вже присутні у цьому файлі) ---- */

/* ---------- (встав тут повний код Stage, Block, Game, updateHighscore) ---------- */
/* Через обмеження повідомлення сюди вже включено повну гру вище у завантаженні; */
/* якщо у тебе вже є цей код — залиш його як є. */

/* ========= Оновлення рекорду (щоб синхронізувався з хмарою) ========= */
function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    const hs=$("highscore"); if (hs) hs.innerText="🏆 "+highscore;
  }
  CloudStore.queuePush({ highscore, last_score: currentScore });
}

/* ====================================================================== */
/* ========================= КІНЕЦЬ ФАЙЛУ =============================== */
/* ====================================================================== */









 






