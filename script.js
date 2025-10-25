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

const WITHDRAW_CHUNK = 50;

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

/* ========= CLOUDS ========= */
/* Main cloud — рекорд / баланс (в HTML можна встановити window.CLOUD_URL + window.CLOUD_API_KEY) */
const CLOUD = {
  url: (typeof window !== 'undefined' && window.CLOUD_URL) || 'https://script.google.com/macros/s/AKfycbxgak6ZgIqIY2mDkGUOCzYnksnSanjjM4UMryAdI1vV-ReFopFPoowg3muuvSBHrOILwA/exec',
  api: (typeof window !== 'undefined' && window.CLOUD_API_KEY) || 'cgdhggfgf45d6e45wsd6w3sd5',
};

/* Withdraw cloud — окрема WebApp для таблиці виводів.
   Якщо в HTML встановлено window.WITHDRAW_CLOUD_URL / window.WITHDRAW_API_KEY, вони будуть використані.
   Інакше — значення, які ти давав раніше.
*/
const WITHDRAW_CLOUD_URL = (typeof window !== 'undefined' && window.WITHDRAW_CLOUD_URL) || 'https://script.google.com/macros/s/AKfycbzD5GxjFHSD7KFosC33qNqGVqT4zcbxhGJ_QgR5pa8mVaIv-hc-ZoTK11nAksvtegZ9/exec';
const WITHDRAW_API_KEY   = (typeof window !== 'undefined' && window.WITHDRAW_API_KEY) || 'vgkgfghfgdxkyovbyuofyuf767f67ed54j';

/** масив на 15 клітин (J..X): сумісність зі старою логікою */
let serverWithdraws = [];
let payoutTag = '';

function firstFreeWithdrawIndex(){
  const arr = Array.isArray(serverWithdraws) ? serverWithdraws : [];
  for (let i = 0; i < 15; i++){
    if (!arr[i] || String(arr[i]) === '0') return i;
  }
  return -1;
}

/* ========= CloudStore (legacy for main cloud) ========= */
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
    st.username = (u?.username || [u?.first_name||'', u?.last_name||''].filter(Boolean).join(' ')) || '';
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
    return null;
  }

  async function pushRemote(partial){
    if (!st.enabled || (!st.uid && !makeTag())) return;
    const body = {
      api: CLOUD.api,
      user_id: st.uid || undefined,
      username: st.username.replace(/^@/,''), 
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
    }catch(_){ }
    finally { st.pushing = false; }
  }
  function queuePush(partial={}){ if (!st.enabled) return; clearTimeout(st.debounceTimer); st.debounceTimer=setTimeout(()=>pushRemote(partial),700); }

  function applyRemoteToState(rem){
    if (!rem) return;

    if (typeof rem.highscore === 'number' && rem.highscore > (highscore||0)){
      highscore = rem.highscore;
      const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
    }
    if (typeof rem.balance === 'number' && rem.balance !== balance){
      if (!(rem.balance === 0 && balance > 0)) {
        balance = parseFloat(rem.balance.toFixed(2));
        setBalanceUI();
      }
    }
    const localBattle = Number(localStorage.getItem('battle_record')||'0');
    const newBattle = Math.max(localBattle, Number(rem.battle_record||0));
    if (newBattle !== localBattle){ localStorage.setItem('battle_record', String(newBattle)); }

    if (rem.tg_tag && typeof rem.tg_tag === "string") payoutTag = rem.tg_tag.trim();

    if (Array.isArray(rem.withdraws)){
      serverWithdraws = rem.withdraws.slice(0,15).map(x => (x==null||x==='')?'0':String(x));
      while (serverWithdraws.length < 15) serverWithdraws.push('0');
    }
  }

  async function hydrate(){
    if (!st.enabled) return;
    identify();
    try{
      const rem = await getRemote();
      st.lastRemote = rem;
      if (rem) applyRemoteToState(rem);
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
    if (!st.enabled){ console.warn('[Cloud] disabled: CLOUD_URL / CLOUD_API_KEY'); return; }
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
  localStorage.setItem("balance", String(balance));
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

/* ========= HELP: showMessage ========= */
function showMessage(text, kind = "info", timeout = 3000){
  const el = $("withdrawStatus") || document.getElementById("message");
  if (!el) {
    alert(text);
    return;
  }
  el.className = kind === "err" ? "err" : (kind === "ok" ? "ok" : "muted");
  el.textContent = text;
  if (timeout > 0) setTimeout(()=>{ if (el.className) { el.className = ""; el.textContent = ""; } }, timeout);
}

/* ===================== WITHDRAW: submit / fetch rows (5-column sheet) ===================== */

/** POST → Withdraw GAS: запис у 5-колонний аркуш (№, tg_tag, time, amount, status) */
async function submitWithdrawalToSheet({ user_id, tag, username, amount, timeISO }) {
  if (!WITHDRAW_CLOUD_URL || !WITHDRAW_API_KEY) return { ok:false, error:"WITHDRAW_CLOUD_URL / WITHDRAW_API_KEY not set" };
  const payload = {
    api: WITHDRAW_API_KEY,
    action: "withdraw_row",
    user_id: user_id || "",
    tg_tag: tag || "",
    username: username || "",
    amount: Number(amount) || 0,
    time: timeISO || (new Date()).toISOString()
  };
  try{
    const r = await fetch(String(WITHDRAW_CLOUD_URL), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    let j=null; try { j = await r.json(); } catch {}
    if (r.ok && j && j.ok) {
      return { ok:true, row: j.row ?? null, number: j.number ?? null, stored: j.stored ?? null };
    }
    return { ok:false, error: (j?.error || `HTTP ${r.status}`) };
  } catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
}

/** GET → Withdraw GAS: отримати рядки для користувача (cmd=get_withdraw_rows&tg_tag=... або &user_id=...) */
async function fetchUserWithdrawRows({ user_id, tg_tag }) {
  if (!WITHDRAW_CLOUD_URL || !WITHDRAW_API_KEY) return [];
  const nocache = "&_=" + Date.now();
  const q = `${WITHDRAW_CLOUD_URL}?api=${encodeURIComponent(WITHDRAW_API_KEY)}&cmd=get_withdraw_rows${nocache}`
          + (user_id ? `&user_id=${encodeURIComponent(user_id)}` : "")
          + (tg_tag  ? `&tg_tag=${encodeURIComponent(tg_tag)}` : "");
  try{
    const r = await fetch(q, { method:'GET', headers:{'accept':'application/json'} });
    if (!r.ok) return [];
    const j = await r.json().catch(()=>null);
    if (!(j && j.ok && Array.isArray(j.rows))) return [];

    // нормалізація і клієнтська фільтрація по tg_tag / user_id
    const rows = j.rows.map(x => {
      return {
        number: x.number ?? x._sheetRow ?? null,
        tag: (x.tg_tag || x.tag || x['@tag'] || '').toString().trim(),
        user_id: (x.user_id || x.tg_id || x.id || '').toString().trim(),
        time: x.time || x.createdAt || x._time || '',
        amount: Number(x.amount || x.sum || 0),
        status: x.status || 'submitted',
        raw: x
      };
    });

    const wantedTag = (tg_tag||"").toString().trim();
    const wantedId  = (user_id||"").toString().trim();

    const filtered = rows.filter(r => {
      if (wantedId && r.user_id && String(r.user_id) === String(wantedId)) return true;
      if (wantedTag && r.tag && r.tag.toLowerCase() === wantedTag.toLowerCase()) return true;
      return false;
    });

    return filtered;
  }catch(_){
    return [];
  }
}

/* ========= LOCAL PENDING/HISTORY ========= */
function readPendingWithdrawals(){ try{ const arr=JSON.parse(localStorage.getItem("payouts_pending")||"[]"); return Array.isArray(arr)?arr:[]; }catch{ return []; } }
function writePendingWithdrawals(arr){ localStorage.setItem("payouts_pending", JSON.stringify(arr||[])); }
function readHistory(){ try{ const arr=JSON.parse(localStorage.getItem("payouts_history")||"[]"); return Array.isArray(arr)?arr:[]; }catch{ return []; } }
function writeHistory(arr){ localStorage.setItem("payouts_history", JSON.stringify(arr||[])); }

/* ========= RENDER: payout list (reads sheet rows) ========= */
async function renderPayoutList(){
  const container = $("payoutList");
  if (!container) return;
  container.innerHTML = "";

  const u = getTelegramUser();
  const tag = payoutTag || (u.username ? ("@"+u.username) : getUserTag());
  const user_id = u.id ? String(u.id) : "";

  container.innerHTML = '<div class="muted">Завантаження записів виводів…</div>';

  let serverRows = [];
  try { serverRows = await fetchUserWithdrawRows({ user_id, tg_tag: tag }); } catch(e){ serverRows = []; }

  const pending = readPendingWithdrawals();
  const combined = [];

  if (Array.isArray(serverRows) && serverRows.length > 0){
    for (let i = serverRows.length - 1; i >= 0; i--){
      const r = serverRows[i];
      combined.push({
        number: r.number || '—',
        tag: r.tag || tag,
        time: r.time || '',
        amount: r.amount || 0,
        status: r.status || 'submitted',
        source: 'sheet'
      });
    }
  }

  for (let i = pending.length - 1; i >= 0; i--){
    const p = pending[i];
    const pTag = (p.tag||"").toString().trim();
    const pTime = p.time || p.createdAt || "";
    const dup = combined.some(c => String(c.amount) === String(p.amount) && String(c.time) === String(pTime) && ( (c.tag||'') === (pTag||'') ));
    if (!dup && (pTag === tag || String(p.id||'') === String(user_id) || (!tag && !user_id))) {
      combined.unshift({
        number: p.number || '—',
        tag: pTag || tag,
        time: pTime,
        amount: p.amount || 0,
        status: p.status || (p.synced ? 'submitted' : 'processing'),
        source: 'pending',
        error: p.error || null
      });
    }
  }

  if (combined.length === 0){
    container.innerHTML = '<div class="muted">Немає записів виводів</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'withdraws-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>№</th><th>@</th><th>Час</th><th>Сума</th><th>Статус</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  for (let i = 0; i < combined.length; i++){
    const r = combined[i];
    const tr = document.createElement('tr');
    const num = r.number || (i+1);
    const tagCell = r.tag || tag;
    let timeStr = r.time || '';
    try { timeStr = (new Date(timeStr)).toLocaleString(); } catch(e){}
    const amount = (r.amount!=null) ? `${r.amount}⭐` : '—';
    const status = r.status || '—';
    tr.innerHTML = `<td>${num}</td><td>${tagCell}</td><td>${timeStr}</td><td>${amount}</td><td>${status}${r.error?(' <span class="err">'+r.error+'</span>'):''}</td>`;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

/* ========= RENDER: local pending list ========= */
function renderPendingList(){
  const wrap = $("pendingList");
  if (!wrap) return;
  const pending = readPendingWithdrawals();
  if (!pending || pending.length === 0){
    wrap.innerHTML = '<div class="muted">Немає локальних очікуючих виводів</div>';
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'pending-ul';
  for (let i = pending.length - 1; i >= 0; i--){
    const p = pending[i];
    let timeStr = p.time || '';
    try { timeStr = (new Date(timeStr)).toLocaleString(); } catch(e){}
    const li = document.createElement('li');
    li.innerHTML = `<strong>${p.tag}</strong> — ${p.amount}⭐ — ${timeStr} — <em>${p.status}</em>${p.error ? (' <span class="err">'+p.error+'</span>') : ''}`;
    ul.appendChild(li);
  }
  wrap.innerHTML = '';
  wrap.appendChild(ul);
}

/* ========= WITHDRAW ACTION ========= */
async function withdraw50LocalFirst(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");

  if (btn && btn.disabled) return;
  if (balance < WITHDRAW_CHUNK) {
    showMessage(`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`, "err");
    return;
  }

  if (btn) btn.disabled = true;

  const u = getTelegramUser();
  const tag = payoutTag || (u.username ? ("@"+u.username) : getUserTag());
  const id  = u.id ? String(u.id) : "";
  const uname = u.username || [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");

  const nowISO = (new Date()).toISOString();
  const pend = readPendingWithdrawals();
  const newPending = {
    id: id || null,
    tag: tag || "",
    username: uname || "",
    amount: WITHDRAW_CHUNK,
    time: nowISO,
    status: "processing",
    synced: false,
    sheet_row: null,
    createdAt: Date.now()
  };
  pend.push(newPending);
  writePendingWithdrawals(pend);
  renderPendingList();
  showMessage("Обробляється виводу…", "muted", 2000);

  const oldBalance = balance;
  balance = parseFloat((balance - WITHDRAW_CHUNK).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI(); saveData();

  try{
    const sheetRes = await submitWithdrawalToSheet({ user_id: id, tag, username: uname, amount: WITHDRAW_CHUNK, timeISO: nowISO });
    if (sheetRes.ok){
      const arr = readPendingWithdrawals();
      for (let i=arr.length-1;i>=0;i--){
        if (!arr[i].synced && arr[i].time === nowISO && arr[i].amount === WITHDRAW_CHUNK && arr[i].tag===tag){
          arr[i].synced = true;
          arr[i].sheet_row = sheetRes.row || sheetRes.number || null;
          arr[i].status = 'submitted';
          arr[i].submittedAt = Date.now();
          arr[i].number = sheetRes.number || null;
          break;
        }
      }
      writePendingWithdrawals(arr);
      const hist = readHistory();
      hist.push({ number: sheetRes.number || null, tag, time: nowISO, amount: WITHDRAW_CHUNK, status:'submitted', _sheetRow: sheetRes.row || null });
      writeHistory(hist);

      showMessage("Заявка успішно створена", "ok", 3500);
    } else {
      const arr = readPendingWithdrawals();
      for (let i=arr.length-1;i>=0;i--){
        if (!arr[i].synced && arr[i].time === nowISO && arr[i].amount === WITHDRAW_CHUNK && arr[i].tag===tag){
          arr[i].status = "failed";
          arr[i].error = sheetRes.error || "submit_failed";
          break;
        }
      }
      writePendingWithdrawals(arr);
      balance = oldBalance; setBalanceUI(); saveData();
      showMessage("Помилка запису в таблицю: " + (sheetRes.error || "невідома"), "err", 5000);
    }
  }catch(e){
    const arr = readPendingWithdrawals();
    for (let i=arr.length-1;i>=0;i--){
      if (!arr[i].synced && arr[i].time === nowISO && arr[i].amount === WITHDRAW_CHUNK && arr[i].tag===tag){
        arr[i].status = "processing";
        arr[i].error = String(e?.message||e);
        break;
      }
    }
    writePendingWithdrawals(arr);
    renderPendingList();
    showMessage("Мережа недоступна — запис залишено локально", "muted", 4000);
  } finally {
    if (btn) btn.disabled = false;
    try{ await renderPayoutList(); }catch(_){}
    renderPendingList();
  }
}

/* ========= SYNC pending ========= */
async function syncPendingWithdrawals(){
  const statusEl=$("withdrawStatus");
  let pend=readPendingWithdrawals();
  if (pend.length===0){ await renderPayoutList(); renderPendingList(); return; }
  let changed = false;
  for (let i=0;i<pend.length;i++){
    const it=pend[i]; if (it.synced) continue;
    try{
      const res = await submitWithdrawalToSheet({ user_id: it.id, tag: it.tag, username: it.username, amount: it.amount, timeISO: it.time });
      if (res.ok){
        it.synced=true; it.sheet_row = res.row || res.number || null; it.status = 'submitted'; it.submittedAt = Date.now();
        const hist = readHistory();
        hist.push({ number: res.number || null, tag: it.tag, time: it.time, amount: it.amount, status:'submitted', _sheetRow: it.sheet_row });
        writeHistory(hist);
        if (statusEl){ statusEl.className="ok"; statusEl.textContent="Поставлено на вивід"; }
        changed = true;
      } else {
        it.status = it.status || 'processing';
        it.error = res.error || it.error || "submit_failed";
        if (statusEl && !statusEl.textContent){ statusEl.className="muted"; statusEl.textContent="Очікуємо мережу…"; }
      }
    }catch(e){
      it.error = String(e?.message||e);
    }
    pend[i]=it; writePendingWithdrawals(pend); renderPendingList();
    await new Promise(r=>setTimeout(r, 250));
  }

  if (changed){
    try{
      const rem = await CloudStore.getRemote();
      if (rem) CloudStore.applyRemoteToState(rem);
    }catch(_){}
  }
  try{ await renderPayoutList(); }catch(_){}
}

/* ========= РЕКЛАМА (Adsgram) ========= */
function initAds(){
  const sdk = window.Adsgram || window.SAD || null;
  if (!sdk){ console.warn("Adsgram SDK не завантажився"); return; }
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

/* ========= ЩОДЕННІ +0.1 ========= */
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

  genBtn && (genBtn.onclick = ()=>{
    if (challengeActive) return;
    if (oppScorePending == null){
      oppScorePending = weightedOppScore();
      if (scoreBox) scoreBox.textContent = String(oppScorePending);
      saveData();
    }
  });

  startBtn && (startBtn.onclick = ()=>{
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
      if (left<=0) clearInterval(challengeTicker);
    }, 1000);
  });

  checkBtn && (checkBtn.onclick = ()=>{
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
  });

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
      if (left<=0) clearInterval(challengeTicker);
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
  const cd = $("challengeCountdown");
  if (cd) cd.style.display = "none";
  const info = $("challengeInfo");
  if (info) info.textContent = "Немає активного виклику.";
  saveData();
}

/* ========= 3D Stack (гра) ========= */
/* Тут вставлена логіка гри — як у твоєму оригіналі. Для стислості я залишаю класи Stage, Block, Game як у твоєму коді. */
class Stage{
  constructor(){
    this.container = document.getElementById("container");
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.container && this.container.appendChild(this.renderer.domElement);

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
class Block{ /* ... copy your Block implementation ... */ 
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
    this.scoreEl=$("score"); if (this.scoreEl) this.scoreEl.innerHTML="0";
    this.addBlock(); this.tick(); this.showReady();

    document.addEventListener("keydown",(e)=>{ if(isPaused || postAdTimerActive) return; if(e.keyCode===32) this.onAction(); });
    document.addEventListener("click",(e)=>{ if(isPaused || postAdTimerActive) return; if($("game")?.classList.contains("active") && e.target.tagName.toLowerCase()==="canvas") this.onAction(); });
    $("start-button")?.addEventListener("click",()=>{ if (postAdTimerActive) return; this.onAction(); });
  }

  hardResetAfterEnd(){
    [this.newBlocks, this.placedBlocks, this.choppedBlocks].forEach(g=>{ for(let i=g.children.length-1;i>=0;i--) g.remove(g.children[i]); });
    this.blocks = [];
    this.stage.setCamera(2, 0);
    if (this.scoreEl) this.scoreEl.innerHTML = "0";
    $("instructions")?.classList.remove("hide");
    this.addBlock();
  }

  showReady(){ if ($("ready")) $("ready").style.display="block"; if ($("gameOver")) $("gameOver").style.display="none"; if ($("postAdTimer")) $("postAdTimer").style.display="none"; this.state=this.STATES.READY; }
  showGameOver(){ if ($("gameOver")) $("gameOver").style.display="block"; if ($("ready")) $("ready").style.display="none"; if ($("postAdTimer")) $("postAdTimer").style.display="none"; this.state=this.STATES.ENDED; }
  hideOverlays(){ if ($("gameOver")) $("gameOver").style.display="none"; if ($("ready")) $("ready").style.display="none"; if ($("postAdTimer")) $("postAdTimer").style.display="none"; }

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
    if (this.scoreEl) this.scoreEl.innerHTML="0";
    this.hideOverlays();
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
    TweenMax.to(cd, camT, {v:0, onUpdate:()=>{ if (this.scoreEl) this.scoreEl.innerHTML=String(Math.round(cd.v)); }});
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
    if (this.scoreEl) this.scoreEl.innerHTML=String(this.blocks.length-1);
    const b=new Block(last); this.newBlocks.add(b.mesh); this.blocks.push(b);
    this.stage.setCamera(this.blocks.length*2);
    if(this.blocks.length>=6) $("instructions")?.classList.add("hide");
  }

  async endGame(){
    const currentScore=parseInt(this.scoreEl?.innerText||"0",10);
    updateHighscore(currentScore);
    gamesPlayedSinceClaim += 1; saveData(); updateGamesTaskUI();
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
    if ($("postAdTimer")) $("postAdTimer").style.display = "block";
    const el = $("postAdCountdown");
    let remain = POST_AD_TIMER_MS;
    if (postAdInterval) clearInterval(postAdInterval);
    if (el) el.textContent = Math.ceil(remain/1000);
    postAdInterval = setInterval(()=>{
      remain -= 1000;
      if (remain <= 0){
        clearInterval(postAdInterval);
        if ($("postAdTimer")) $("postAdTimer").style.display = "none";
        postAdTimerActive = false;
        this.hardResetAfterEnd();
        this.showReady();
      } else {
        if (el) el.textContent = Math.ceil(remain/1000);
      }
    }, 1000);
  }

  tick(){ if(!isPaused){ this.blocks[this.blocks.length-1].tick(); this.stage.render(); } requestAnimationFrame(()=>this.tick()); }
}

function updateHighscore(currentScore){
  if(currentScore>highscore){
    highscore=currentScore;
    const hs=$("highscore"); if (hs) hs.innerText="🏆 "+highscore;
  }
  CloudStore.queuePush({ highscore, last_score: currentScore });
}

/* ========= Інші допоміжні функції ========= */
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

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
let dailyUiTicker = null;
let challengeTicker = null;
let syncTimer = null;

window.onload = async function(){
  // load balance from localStorage to avoid reset to 0 on start
  const storedBalance = localStorage.getItem("balance");
  if (storedBalance != null && storedBalance !== "undefined"){
    const b = parseFloat(storedBalance);
    if (!isNaN(b)) balance = b;
  }

  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  lastAnyAdAt      = parseInt(localStorage.getItem("lastAnyAdAt")  || "0", 10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0", 10);
  ad5Count = parseInt(localStorage.getItem("ad5Count") || "0", 10);
  ad10Count = parseInt(localStorage.getItem("ad10Count") || "0", 10);
  lastTask5RewardAt = parseInt(localStorage.getItem("lastTask5RewardAt") || "0", 10);
  lastTask10RewardAt = parseInt(localStorage.getItem("lastTask10RewardAt") || "0", 10);
  gramCount  = parseInt(localStorage.getItem('dailyGramCount')||'0',10);
  exCount    = parseInt(localStorage.getItem('dailyExCount')||'0',10);
  lastGramAt = parseInt(localStorage.getItem('lastGramAt')||'0',10);
  lastExAt   = parseInt(localStorage.getItem('lastExAt')||'0',10);
  dailyStamp = localStorage.getItem('dailyStamp') || _todayStamp();

  ensureDailyReset();

  setBalanceUI();
  const hs = $("highscore"); if (hs) hs.innerText = "🏆 " + highscore;
  updateGamesTaskUI();

  renderPendingList();
  await renderPayoutList();

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

  $("watchAd5Btn")?.addEventListener("click", onWatchAd5);
  $("watchAd10Btn")?.addEventListener("click", onWatchAd10);
  $("watchAdsgramDailyBtn")?.addEventListener("click", onWatchGramDaily);

  setupChallengeUI();
  initAds();

  // 3D гра
  try { window.stackGame = new Game(); } catch(e){ console.warn('Game init failed', e); }

  startDailyPlusTicker();
  updateAdTasksUI();
  updateDailyUI();

  try { CloudStore.initAndHydrate(); } catch(e){ console.warn(e); }

  // hydrate withdraw history from Withdraw GAS into local history (non-destructive)
  try{
    const u = getTelegramUser();
    const user_id = u.id || '';
    const tg_tag = u.username ? ("@"+u.username) : '';
    const rows = await fetchUserWithdrawRows({ user_id, tg_tag });
    if (Array.isArray(rows) && rows.length > 0){
      const hist = readHistory();
      for (let r of rows){
        const keyRemote = String(r.number || r._sheetRow || '') + '|' + String(r.time || '') + '|' + String(r.amount || '');
        const exists = hist.some(h => (String(h.number||'') + '|' + String(h.time||'') + '|' + String(h.amount||'')) === keyRemote);
        if (!exists){
          hist.push({
            number: r.number || r._sheetRow || null,
            tag: r.tag || r.tg_tag || '',
            time: r.time || (new Date()).toISOString(),
            amount: r.amount || 0,
            status: r.status || 'submitted',
            _sheetRow: r._sheetRow || null
          });
        }
      }
      writeHistory(hist);
    }
  }catch(e){ console.warn('init withdraw history failed', e); }

  clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ syncPendingWithdrawals(); }, 20_000);
};






