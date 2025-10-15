// script.js — гра, таски, батли, Adsgram + Adexium, синхронізація з Google Sheets
"use strict";
console.clear();

/* ========= КОНСТАНТИ ========= */
const DAILY_CAP = 25;
const DAILY_COOLDOWN_MS = 0;

const GAME_AD_COOLDOWN_MS = 15_000;
const ANY_AD_COOLDOWN_MS  = 60_000;
const MIN_BETWEEN_SAME_CTX_MS = 10_000;

const POST_AD_TIMER_MS = 15_000;

const GAMES_TARGET = 100;
const GAMES_REWARD = 5;

// 👇 твоє значення (як було; коментар у тебе "рівно 50⭐")
const WITHDRAW_CHUNK = 0.1;

/* --- Adsgram блоки --- */
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

/* ========= ХМАРА (Google Sheets через GAS Web App) ========= */
const CLOUD = {
  url: (typeof window !== 'undefined' && window.CLOUD_URL) || '',
  api: (typeof window !== 'undefined' && window.CLOUD_API_KEY) || '',
};

const CloudStore = (() => {
  const st = {
    enabled: !!(CLOUD.url && CLOUD.api),
    uid: '',
    username: '',
    lastRemote: null,
    pollTimer: null,
    pollMs: 10_000,
    debounceTimer: null,
    pushing: false,
  };

  function tgUser(){
    return (window.Telegram?.WebApp?.initDataUnsafe?.user) || null;
  }
  function identify(){
    const u = tgUser() || {};
    st.uid = String(u.id || 'guest');
    st.username = (u.username || [u.first_name||'', u.last_name||''].filter(Boolean).join(' ') || 'Guest');
  }
  function makeTag(){
    if (st.username) return st.username.startsWith('@') ? st.username : '@'+st.username;
    return st.uid ? 'id'+st.uid : 'Guest';
  }

  async function getRemote(){
    if (!st.enabled || !st.uid) return null;
    const url = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get&user_id=${encodeURIComponent(st.uid)}`;
    const r = await fetch(url, { method:'GET', headers:{'accept':'application/json'} });
    if (!r.ok) return null;
    const j = await r.json().catch(()=>null);
    return (j && j.ok) ? (j.data || null) : null;
  }

  async function pushRemote(partial){
    if (!st.enabled || !st.uid) return;
    const body = {
      api: CLOUD.api,
      user_id: st.uid,
      username: st.username.replace(/^@/,''),
      tg_tag: makeTag(),
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
    }catch(_){}
    finally { st.pushing = false; }
  }
  function queuePush(partial={}){
    if (!st.enabled) return;
    clearTimeout(st.debounceTimer);
    st.debounceTimer = setTimeout(()=>pushRemote(partial), 700);
  }

  function applyRemoteToState(rem){
    if (!rem) return;
    // highscore — максимум
    if (typeof rem.highscore === 'number' && rem.highscore > (highscore||0)){
      highscore = rem.highscore;
      const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
    }
    // balance — істина з хмари
    if (typeof rem.balance === 'number' && rem.balance !== balance){
      balance = parseFloat(rem.balance.toFixed(2));
      setBalanceUI();
    }
    // battle_record — максимум (у LS)
    const localBattle = Number(localStorage.getItem('battle_record')||'0');
    const newBattle = Math.max(localBattle, Number(rem.battle_record||0));
    if (newBattle !== localBattle){
      localStorage.setItem('battle_record', String(newBattle));
    }
  }

  async function hydrate(){
    if (!st.enabled) return;
    identify();
    if (!st.uid) return;
    try{
      const rem = await getRemote();
      st.lastRemote = rem;
      if (rem) applyRemoteToState(rem);
      if (!rem) queuePush({}); // створити профіль тільки якщо його немає
    }catch(e){ console.warn('[Cloud] hydrate failed', e); }
  }

  function startPolling(){
    if (!st.enabled) return;
    clearInterval(st.pollTimer);
    st.pollTimer = setInterval(async()=>{
      try{
        const rem = await getRemote();
        if (rem) applyRemoteToState(rem);
      }catch(_){}
    }, st.pollMs);
  }

  function initAndHydrate(){
    if (!st.enabled){
      console.warn('[Cloud] disabled: CLOUD_URL / CLOUD_API_KEY не задані');
      return;
    }
    identify();
    hydrate().then(startPolling);
    // ❗ БЕЗ автопуша через 1.5с — щоб не перетирати баланс нулем
    window.addEventListener('beforeunload', ()=>{ try{ pushRemote({}); }catch(_){ } });
  }

  return { initAndHydrate, queuePush, tgUser };
})();

/* ========= ЄДИНА ТОЧКА ДОБОВОГО РЕСЕТУ ========= */
function ensureDailyReset() {
  const today = _todayStamp();
  const stored = localStorage.getItem('dailyStamp') || today;
  if (stored !== today) {
    gramCount = 0; exCount = 0;
    lastGramAt = 0; lastExAt = 0;
    dailyStamp = today;
    localStorage.setItem('dailyGramCount', '0');
    localStorage.setItem('dailyExCount', '0');
    localStorage.setItem('lastGramAt', '0');
    localStorage.setItem('lastExAt', '0');
    localStorage.setItem('dailyStamp', today);
    saveData();
    try { window.dispatchEvent(new CustomEvent('daily-reset', { detail: { day: today } })); } catch(e) {}
  }
}

/* ========= СТАН ========= */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let gamesPlayedSinceClaim = 0;
let isPaused = false;

/* --- лічильники квестів 5/10 --- */
let ad5Count = 0, ad10Count = 0;
let lastTask5RewardAt = 0, lastTask10RewardAt = 0;

/* --- щоденні лічильники +0.1⭐ --- */
let gramCount = 0, exCount = 0;
let lastGramAt = 0, lastExAt = 0;
let dailyStamp = "";

/* --- пострекламний таймер --- */
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

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
let dailyUiTicker = null;
let challengeTicker = null;

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

  initLeaderboard();

  const link = "https://t.me/Stacktongame_bot";
  if ($("shareLink")) $("shareLink").value = link;
  if ($("copyShareBtn")) $("copyShareBtn").addEventListener("click", ()=>copyToClipboard(link));

  const withdrawBtn = $("withdrawBtn");
  if (withdrawBtn) withdrawBtn.addEventListener("click", withdraw50ToCloud); // 👈 оновлено

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

  // Хмара
  try { CloudStore.initAndHydrate(); } catch(e){ console.warn(e); }
};

function addBalance(n){
  balance = parseFloat((balance + n).toFixed(2));
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
  dailyUiTicker = setInterval(()=>{
    updateDailyUI();
    updateAdTasksUI();
  }, 1000);
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

/* ========= Друзі / копіювання ========= */
async function copyToClipboard(text){
  try{
    if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); }
    else { const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    alert("Скопійовано ✅");
  }catch{ alert("Не вдалося копіювати 😕"); }
}

/* ======= Вивід у ОСНОВНУ таблицю (15 слотів J..X) ======= */
async function submitWithdrawalToCloud15({ user_id, tag, username, amount }) {
  if (!CLOUD.url || !CLOUD.api) {
    return { ok:false, error:"CLOUD_URL / CLOUD_API_KEY not set" };
  }
  const payload = {
    api: CLOUD.api,
    action: "withdraw",
    user_id,
    tg_tag: tag || "",
    username: username || "",
    amount: Number(amount) || 0,
    ts: Date.now()
  };

  try{
    // JSON POST
    const r = await fetch(String(CLOUD.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let j=null; try { j = await r.json(); } catch {}
    if (r.ok && j && j.ok) return { ok:true, data: j.data || null };

    // fallback GET
    const qs = new URLSearchParams({
      api: CLOUD.api,
      action: "withdraw",
      user_id: String(user_id||""),
      tg_tag: String(tag||""),
      username: String(username||""),
      amount: String(payload.amount),
      ts: String(payload.ts),
    }).toString();
    const r2 = await fetch(`${String(CLOUD.url)}?${qs}`, { method:"GET" });
    let j2=null; try { j2 = await r2.json(); } catch {}
    if (r2.ok && j2 && j2.ok) return { ok:true, data: j2.data || null };

    return { ok:false, error: (j?.error || j2?.error || `HTTP ${r.status}/${r2.status}`) };
  } catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
}

/* ========= Вивід (пише час у наступний вільний слот J..X) ========= */
async function withdraw50ToCloud(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");

  if (balance < WITHDRAW_CHUNK) {
    if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; }
    return;
  }

  if (btn) btn.disabled = true;
  if (statusEl){ statusEl.className="muted"; statusEl.textContent="Створюємо заявку…"; }

  const u = getTelegramUser();
  const tag = u.username ? ("@"+u.username) : getUserTag();
  const id  = u.id || "";
  const uname = u.username || [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");

  try{
    // 1) Запис у ОСНОВНУ таблицю: GAS поставить час у J..X (Windraw 1..15)
    const res = await submitWithdrawalToCloud15({
      user_id: id, tag, username: uname, amount: WITHDRAW_CHUNK
    });
    if (!res.ok) throw new Error(res.error || "write_failed");

    // 2) Локальний список — для UI
    const entry = { ts: Date.now(), amount: WITHDRAW_CHUNK, tag, id };
    const arr = JSON.parse(localStorage.getItem("payouts") || "[]");
    arr.unshift(entry);
    localStorage.setItem("payouts", JSON.stringify(arr));
    renderPayoutList();

    // 3) Списати з балансу (і записати в хмару)
    addBalance(-WITHDRAW_CHUNK);

    if (statusEl){ statusEl.className="ok"; statusEl.textContent="✅ Заявку створено"; }
  } catch (err){
    if (statusEl){ statusEl.className="err"; statusEl.textContent="❌ Помилка створення заявки: " + String(err?.message || err); }
  } finally {
    if (btn) btn.disabled = false;
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
    li.innerHTML = `🗓 ${d.toLocaleString()} — ${e.tag} (id:${e.id||"—"}) — 💸 ${e.amount}⭐`;
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

/* ========= ADEXIUM — ручний показ по кліку ========= */
(function () {
  const WID          = '8d2ce1f1-ae64-4fc3-ac46-41bc92683fae';
  const BTN_ID       = 'watchAdexiumDailyBtn';
  const COUNTER_ID   = 'adExCounter';
  const BALANCE_ID   = 'balance';

  const DAILY_CAP_LOCAL = 25;
  const CREDIT       = 0.1;
  const CREDIT_ON_CLOSE = false;

  const LS_EX_COUNT = 'dailyExCount';
  const LS_DAY      = 'dailyStamp';

  let inFlight = false;
  let creditedOnce = false;
  let adex = null;

  function todayStamp() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate() + 0).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  function loadDayAndCount() {
    let exCount = parseInt(localStorage.getItem(LS_EX_COUNT) || '0', 10);
    let day = localStorage.getItem(LS_DAY) || todayStamp();
    const t = todayStamp();
    if (day !== t) { exCount = 0; day = t; }
    return { exCount, day };
  }
  function saveDayAndCount(exCount, day) {
    localStorage.setItem(LS_EX_COUNT, String(exCount));
    localStorage.setItem(LS_DAY, day || todayStamp());
  }

  function setBalanceUI_LocalOnlyFallback(){
    const el = document.getElementById(BALANCE_ID);
    if (el) el.textContent = Number.isInteger(balance) ? String(balance) : balance.toFixed(2);
  }
  function addBalanceLocal(delta) {
    balance = parseFloat((balance + delta).toFixed(2));
    setBalanceUI_LocalOnlyFallback();
    CloudStore.queuePush({ balance });
  }

  function updateCounterUI(exCount) {
    const cnt = document.getElementById(COUNTER_ID);
    if (cnt) cnt.textContent = String(Math.min(exCount, DAILY_CAP_LOCAL));
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.disabled = (exCount >= DAILY_CAP_LOCAL) || inFlight;
  }

  function creditOnce() {
    if (creditedOnce) return;
    creditedOnce = true;

    let { exCount, day } = loadDayAndCount();
    const t = todayStamp();
    if (day !== t) { exCount = 0; day = t; }
    if (exCount >= DAILY_CAP_LOCAL) { inFlight = false; updateCounterUI(exCount); creditedOnce=false; return; }

    exCount += 1;
    saveDayAndCount(exCount, day);

    if (typeof window.addBalance === 'function') window.addBalance(CREDIT);
    else addBalanceLocal(CREDIT);

    updateCounterUI(exCount);
    if (typeof window.updateDailyUI === 'function') window.updateDailyUI();

    inFlight = false;
    setTimeout(() => { creditedOnce = false; }, 0);
  }

  function attachHandlers(instance){
    if (!instance) return;
    if (instance.__stackGameHandlersAttached) return;
    instance.__stackGameHandlersAttached = true;

    instance.on('adReceived', (ad) => {
      try { instance.displayAd(ad); }
      catch (e) {
        console.error('[Adexium] displayAd error:', e);
        inFlight = false;
        const { exCount } = loadDayAndCount();
        updateCounterUI(exCount);
      }
    });
    instance.on('noAdFound', () => {
      inFlight = false;
      const { exCount } = loadDayAndCount();
      updateCounterUI(exCount);
    });
    instance.on('adPlaybackCompleted', () => {
      creditOnce();
    });
    instance.on('adClosed', () => {
      if (CREDIT_ON_CLOSE) creditOnce();
      else {
        inFlight = false;
        const { exCount } = loadDayAndCount();
        updateCounterUI(exCount);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;

    const s = loadDayAndCount();
    saveDayAndCount(s.exCount, s.day);
    updateCounterUI(s.exCount);
    setBalanceUI_LocalOnlyFallback();

    window.addEventListener('daily-reset', (e) => {
      try {
        const day = (e && e.detail && e.detail.day) ? e.detail.day : todayStamp();
        saveDayAndCount(0, day);
      } catch (_) {}
      creditedOnce = false;
      inFlight = false;
      updateCounterUI(0);
    });

    if (typeof window.__getAdexium === 'function'){
      window.__getAdexium((inst)=>{
        adex = inst;
        attachHandlers(adex);
      });
    } else if (typeof window.AdexiumWidget === 'function'){
      try {
        adex = new AdexiumWidget({ wid: WID, adFormat: 'interstitial', debug: false });
        attachHandlers(adex);
      } catch (e) {
        console.error('[Adexium] SDK не ініціалізувався:', e);
      }
    } else {
      console.error('[Adexium] SDK не завантажився. Перевір підключення у index.html');
    }

    btn.addEventListener('click', () => {
      const { exCount } = loadDayAndCount();
      if (inFlight || exCount >= DAILY_CAP_LOCAL) return;
      inFlight = true; creditedOnce = false;
      updateCounterUI(exCount);
      try {
        if (!adex){
          console.warn('[Adexium] ще не готовий');
          inFlight = false;
          updateCounterUI(exCount);
          return;
        }
        adex.requestAd('interstitial');
      } catch (e) {
        console.error('[Adexium] requestAd error:', e);
        inFlight = false;
        updateCounterUI(exCount);
      }
    });
  });
})();

/* ========= 3D Stack (гра) ========= */
/* ... увесь твій клас Stage/Block/Game без змін, як у тебе вище ... */
class Stage{ /* ... */ }
class Block{ /* ... */ }
class Game{
  /* ... твоя реалізація як була ... (я лишив без змін) ... */
}

function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    const hs=$("highscore"); if (hs) hs.innerText="🏆 "+highscore;
  }
  CloudStore.queuePush({ highscore, last_score: currentScore });
}



