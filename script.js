"use strict";
console.clear();

/* ========================= CONFIG =========================
   - стара Cloud (рекорди/баланс) — в HTML/тегу: window.CLOUD_URL / window.CLOUD_API_KEY
   - нова Withdraw Cloud (тільки для виводів) — вказана нижче (тільки для записів A..E)
   ЗАМІНИть WITHDRAW_CLOUD_URL / WITHDRAW_API_KEY, якщо треба.
===========================================================*/

/* Withdraw GAS (твій URL, що ти дав) */
const WITHDRAW_CLOUD_URL = "https://script.google.com/macros/s/AKfycbzD5GxjFHSD7KFosC33qNqGVqT4zcbxhGJ_QgR5pa8mVaIv-hc-ZoTK11nAksvtegZ9/exec";
const WITHDRAW_API_KEY   = "vgkgfghfgdxkyovbyuofyuf767f67ed54j"; // SECRET_API для withdraw-GAS

/* Стара Cloud (може бути задана в HTML, залишаємо як є) */
const LEGACY_CLOUD_URL = window.CLOUD_URL || "";
const LEGACY_CLOUD_API = window.CLOUD_API_KEY || "";

/* ========= CONSTANTS ========= */
const WITHDRAW_CHUNK = 50;
const DAILY_CAP = 25;
const TASK5_TARGET = 5;
const TASK10_TARGET = 10;
const TASK_DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const POST_AD_TIMER_MS = 15_000;
const GAME_AD_COOLDOWN_MS = 15_000;
const ANY_AD_COOLDOWN_MS  = 60_000;
const MIN_BETWEEN_SAME_CTX_MS = 10_000;
const GAMES_TARGET = 100;
const GAMES_REWARD = 5;

/* ========= HELPERS ========= */
const $ = id => document.getElementById(id);
const formatStars = v => Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(2);

function nowISO(){ return (new Date()).toISOString(); }
function prettyTime(iso){ try { return new Date(iso).toLocaleString(); } catch(e) { return iso; } }

/* ========= LOCAL STORAGE KEYS ========= */
const KEY_PENDING = "payouts_pending";
const KEY_HISTORY = "payouts_history";

/* ========= PERSISTENCE (local) ========= */
function readPendingWithdrawals(){ try{ const arr=JSON.parse(localStorage.getItem(KEY_PENDING)||"[]"); return Array.isArray(arr)?arr:[]; }catch{ return []; } }
function writePendingWithdrawals(arr){ localStorage.setItem(KEY_PENDING, JSON.stringify(arr||[])); }
function readHistory(){ try{ const arr=JSON.parse(localStorage.getItem(KEY_HISTORY)||"[]"); return Array.isArray(arr)?arr:[]; }catch{ return []; } }
function writeHistory(arr){ localStorage.setItem(KEY_HISTORY, JSON.stringify(arr||[])); }

/* ========= STATE ========= */
let balance = 0;
let highscore = 0;
let subscribed = false;
let task50Completed = false;
let gamesPlayedSinceClaim = 0;
let lastAnyAdAt = 0;
let ad5Count = 0, ad10Count = 0;
let lastTask5RewardAt = 0, lastTask10RewardAt = 0;
let gramCount = 0, exCount = 0, dailyStamp = "";

/* ========= UI helpers ========= */
function setBalanceUI(){ const el = $("balance"); if (el) el.innerText = formatStars(balance); }

/* ========= HTTP helpers ========= */
async function postJSONto(url, body){
  try{
    const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await r.json().catch(()=>null);
    return { ok: r.ok, status: r.status, json: j };
  }catch(e){ return { ok:false, error: String(e) }; }
}

/* ========= Withdraw-specific functions (separate from legacy Cloud) ========= */

/** Відправка виводу на Withdraw-GAS */
async function submitWithdrawalToWithdrawGAS({ user_id, tag, username, amount, timeISO }){
  if (!WITHDRAW_CLOUD_URL || !WITHDRAW_API_KEY) return { ok:false, error:"WITHDRAW_CLOUD not configured" };
  const payload = {
    api: WITHDRAW_API_KEY,
    action: "withdraw_row",
    user_id: user_id || "",
    tg_tag: tag || "",
    username: username || "",
    amount: Number(amount) || 0,
    time: timeISO || nowISO()
  };
  const res = await postJSONto(WITHDRAW_CLOUD_URL, payload);
  if (!res.ok) return { ok:false, error: res.json?.error || res.error || `HTTP ${res.status}` };
  if (res.json && res.json.ok) return { ok:true, row: res.json.row || null, number: res.json.number || null, stored: res.json.stored || null, json: res.json };
  return { ok:false, error: res.json?.error || "no_json_ok" };
}

/** Отримати рядки виводів з Withdraw-GAS (фільтр за user_id або tg_tag) */
async function fetchWithdrawRowsFromWithdrawGAS({ user_id, tg_tag }){
  if (!WITHDRAW_CLOUD_URL || !WITHDRAW_API_KEY) return [];
  const q = `${WITHDRAW_CLOUD_URL}?api=${encodeURIComponent(WITHDRAW_API_KEY)}&cmd=get_withdraw_rows${user_id?`&user_id=${encodeURIComponent(user_id)}`:''}${tg_tag?`&tg_tag=${encodeURIComponent(tg_tag)}`:''}&_=${Date.now()}`;
  try{
    const r = await fetch(q, { method:'GET', headers:{ 'accept':'application/json' }});
    if (!r.ok) return [];
    const j = await r.json().catch(()=>null);
    if (j && j.ok && Array.isArray(j.rows)) return j.rows;
  }catch(e){ console.warn('fetchWithdrawRows error', e); }
  return [];
}

/* ========= Render payouts UI ========= */
function renderPayoutList(){
  const wrap = $("payoutList");
  if (!wrap) return;
  wrap.innerHTML = "";

  const pending = readPendingWithdrawals() || [];
  const history = readHistory() || [];

  const combined = [];

  // show pending newest first
  for (let i = pending.length -1; i >=0; i--){
    const p = pending[i];
    combined.push({
      number: p.number || '—',
      tag: p.tag || getUserTag(),
      time: p.time || p.createdAtISO || nowISO(),
      amount: p.amount || 0,
      status: p.status || (p.synced ? 'submitted' : 'processing'),
      source: 'pending',
      error: p.error || null
    });
  }
  // then history
  for (let h of history) {
    combined.push({
      number: h.number || h._sheetRow || '—',
      tag: h.tag || h.tg_tag || '—',
      time: h.time || h.createdAt || nowISO(),
      amount: h.amount || 0,
      status: h.status || 'submitted',
      source: 'history'
    });
  }

  if (combined.length === 0){
    wrap.innerHTML = '<div class="muted">Немає записів виводів</div>';
    return;
  }

  const tbl = document.createElement('table');
  tbl.className = 'withdraw-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>№</th><th>@</th><th>Час</th><th>Сума</th><th>Статус</th></tr>';
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  for (let r of combined){
    const tr = document.createElement('tr');
    const num = r.number ? r.number : '—';
    const tag = r.tag || '—';
    const time = prettyTime(r.time);
    const amount = (r.amount!=null) ? String(r.amount) : '—';
    const status = r.status || '—';
    tr.innerHTML = `<td>${num}</td><td>${tag}</td><td>${time}</td><td>${amount}⭐</td><td>${status}${r.error?(' <span class="err">'+r.error+'</span>'):''}</td>`;
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  wrap.appendChild(tbl);
}

/* ========= Withdraw action (button) ========= */
async function withdraw50LocalFirst(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");
  if (btn && btn.disabled) return;
  if (balance < WITHDRAW_CHUNK) {
    if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; }
    return;
  }

  if (btn) btn.disabled = true;

  const u = getTelegramUser();
  const id = u.id || "";
  const tag = getUserTag();
  const uname = u.username || [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");
  const now = nowISO();

  // optimistic: add local pending and reduce local balance
  const pending = readPendingWithdrawals();
  const item = {
    id: id || null,
    tag: tag,
    username: uname,
    amount: WITHDRAW_CHUNK,
    time: now,
    createdAtISO: now,
    status: 'processing',
    synced: false,
    number: null,
    error: null
  };
  pending.push(item);
  writePendingWithdrawals(pending);

  const oldBalance = balance;
  balance = parseFloat((balance - WITHDRAW_CHUNK).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI();
  saveData();

  if (statusEl){ statusEl.className="ok"; statusEl.textContent="Поставлено на вивід…"; }
  renderPayoutList();

  // send to Withdraw-GAS
  try{
    const res = await submitWithdrawalToWithdrawGAS({ user_id: id, tag: tag, username: uname, amount: WITHDRAW_CHUNK, timeISO: now });
    if (res.ok){
      // mark pending as synced
      const pend2 = readPendingWithdrawals();
      for (let i = pend2.length -1; i >=0; i--){
        const p = pend2[i];
        if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
          p.synced = true;
          p.number = res.number || res.row || p.number;
          p.status = 'submitted';
          p.sheet_row = res.row || null;
          p.submittedAt = nowISO();
          break;
        }
      }
      writePendingWithdrawals(pend2);

      // append to history
      const hist = readHistory();
      hist.push({
        number: res.number || res.row || null,
        tag: tag,
        time: now,
        amount: WITHDRAW_CHUNK,
        status: 'submitted',
        _sheetRow: res.row || null
      });
      writeHistory(hist);

      if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вивід зафіксовано"; }
    } else {
      // server error — mark pending failed and rollback balance
      const pend2 = readPendingWithdrawals();
      for (let i = pend2.length -1; i >=0; i--){
        const p = pend2[i];
        if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
          p.status = 'failed';
          p.error = res.error || 'submit_failed';
          break;
        }
      }
      writePendingWithdrawals(pend2);
      balance = oldBalance; setBalanceUI(); saveData();
      if (statusEl){ statusEl.className="err"; statusEl.textContent = "Помилка запису: " + (res.error || "невідома"); }
    }
  } catch(e){
    // network error — leave pending as processing/error, keep balance reduced (you may choose to rollback)
    const pend2 = readPendingWithdrawals();
    for (let i = pend2.length -1; i >=0; i--){
      const p = pend2[i];
      if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
        p.status = 'processing';
        p.error = 'network';
        break;
      }
    }
    writePendingWithdrawals(pend2);
    if (statusEl){ statusEl.className="muted"; statusEl.textContent="Мережа недоступна — запис залишено локально"; }
  } finally {
    if (btn) btn.disabled = false;
    renderPayoutList();
  }
}

/* ========= Periodic retry for pending items ========= */
async function syncPendingWithdrawals(){
  const pending = readPendingWithdrawals();
  if (!pending || pending.length === 0) return;
  for (let i=0;i<pending.length;i++){
    const it = pending[i];
    if (it.synced) continue;
    const res = await submitWithdrawalToWithdrawGAS({ user_id: it.id, tag: it.tag, username: it.username, amount: it.amount, timeISO: it.time });
    if (res.ok){
      it.synced = true; it.number = res.number || res.row || it.number; it.status = 'submitted'; it.sheet_row = res.row || null;
      // move to history
      const hist = readHistory();
      hist.push({ number: it.number, tag: it.tag, time: it.time, amount: it.amount, status: 'submitted', _sheetRow: it.sheet_row });
      writeHistory(hist);
    } else {
      it.error = res.error || it.error || 'submit_failed';
    }
    pending[i] = it;
    writePendingWithdrawals(pending);
    renderPayoutList();
    await new Promise(r => setTimeout(r, 200));
  }
}

/* ========= Initialize withdraw history from remote (merge without duplicates) ========= */
async function initWithdrawHistorySync(){
  try{
    const u = getTelegramUser();
    const user_id = u.id || '';
    const tg_tag = u.username ? ("@"+u.username) : '';
    const rows = await fetchWithdrawRowsFromWithdrawGAS({ user_id, tg_tag });
    if (!Array.isArray(rows) || rows.length === 0) return;
    const hist = readHistory() || [];
    for (let r of rows){
      const keyRemote = String(r.number || r._sheetRow || '') + '|' + String(r.time || '') + '|' + String(r.amount || '');
      const exists = hist.some(h => (String(h.number||'') + '|' + String(h.time||'') + '|' + String(h.amount||'')) === keyRemote);
      if (!exists){
        hist.push({
          number: r.number || r._sheetRow || null,
          tag: r.tag || r.tg_tag || '',
          time: r.time || nowISO(),
          amount: r.amount || 0,
          status: r.status || 'submitted',
          _sheetRow: r._sheetRow || null
        });
      }
    }
    writeHistory(hist);
    renderPayoutList();
  }catch(e){ console.warn('initWithdrawHistorySync error', e); }
}

/* ========= Debug helpers (call from console) ========= */
window.clearLocalPending = function(){ localStorage.removeItem(KEY_PENDING); renderPayoutList(); console.log('Local pending cleared'); };
window.fetchWithdrawRowsNow = async function(){ const u = getTelegramUser(); const rows = await fetchWithdrawRowsFromWithdrawGAS({ user_id: u.id || '', tg_tag: u.username ? '@'+u.username : '' }); console.log(rows); return rows; };

/* ========= TELEGRAM / USER helpers (same as before) ========= */
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

/* ========= Legacy CloudStore logic (не чіпати) ========= */
/* Тут повинна бути твоя стара реалізація CloudStore (як у початковому коді) --
   я не копіюю її сюди повністю, бо в твоєму проєкті вона вже була.
   Переконайся, що в script.js все ще є CloudStore.initAndHydrate(),
   яке пише/читає рекорд/баланс з LEGACY_CLOUD_URL / LEGACY_CLOUD_API.
   Якщо немає — додай оригінальну функцію CloudStore з попереднього коду.
*/

/* ========= INIT / window.onload ========= */
let syncTimer = null;
window.onload = async function(){
  // load balance from localStorage (do not reset to 0 on load)
  const storedBalance = localStorage.getItem("balance");
  if (storedBalance != null && storedBalance !== "undefined"){
    const b = parseFloat(storedBalance);
    if (!isNaN(b)) balance = b;
  }

  // load other saved states (simplified)
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  lastAnyAdAt = parseInt(localStorage.getItem("lastAnyAdAt") || "0",10);
  gamesPlayedSinceClaim = parseInt(localStorage.getItem("gamesPlayedSinceClaim") || "0",10);
  ad5Count = parseInt(localStorage.getItem("ad5Count") || "0",10);
  ad10Count = parseInt(localStorage.getItem("ad10Count") || "0",10);

  setBalanceUI();
  // render payouts (local)
  renderPayoutList();

  // try to sync withdraw history from remote Withdraw-GAS
  try { await initWithdrawHistorySync(); } catch(e){ console.warn(e); }

  // periodic retry for pending
  clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ syncPendingWithdrawals(); }, 20_000);

  // rest of your original onload logic: init ads, game, UI binds, CloudStore.initAndHydrate() etc.
  // make sure CloudStore.initAndHydrate() (if present) runs so legacy balance/highscore get synced.
};

/* ========= SAVE data (balance etc.) ========= */
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
}

/* ========= END OF FILE — виклики для ручного тестування ========= */

/*
  Debug / manual tests:

  1) Fetch all withdraw rows for current user (in console):
     fetchWithdrawRowsNow().then(r=>console.log(r));

  2) Clear local pending:
     clearLocalPending();

  3) Test direct POST (curl example shown below)

  Curl GET to list withdraw rows for tg_tag:
    curl -s "https://script.google.com/macros/s/AKfycbzD5GxjFHSD7KFosC33qNqGVqT4zcbxhGJ_QgR5pa8mVaIv-hc-ZoTK11nAksvtegZ9/exec?api=vgkgfghfgdxkyovbyuofyuf767f67ed54j&cmd=get_withdraw_rows&tg_tag=%40yourtag"

  Curl POST (test write):
    curl -s -X POST -H "Content-Type: text/plain;charset=utf-8" \
      -d '{"api":"vgkgfghfgdxkyovbyuofyuf767f67ed54j","action":"withdraw_row","user_id":"99999","tg_tag":"@curl_test","username":"CurlTester","amount":50,"time":"'"$(date -Iseconds)"'"}' \
      "https://script.google.com/macros/s/AKfycbzD5GxjFHSD7KFosC33qNqGVqT4zcbxhGJ_QgR5pa8mVaIv-hc-ZoTK11nAksvtegZ9/exec"

  Якщо потрібен — я дам готовий curl з твоїм tg_tag.
*/


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

/* ========= HTTP helpers ========= */
async function postJSON(url, body){
  try{
    const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await r.json().catch(()=>null);
    return { ok: r.ok, status: r.status, json: j };
  }catch(e){ return { ok:false, error: String(e) }; }
}

/* ========= ВІДПРАВКА ВИВОДУ В TАБЛИЦЮ (GAS) ========= */
async function submitWithdrawalToSheet({ user_id, tag, username, amount, timeISO }){
  if (!CLOUD.url || !CLOUD.api) return { ok:false, error:"CLOUD_URL / CLOUD_API_KEY not set" };
  const payload = {
    api: CLOUD.api,
    action: "withdraw_row",
    user_id: user_id || "",
    tg_tag: tag || "",
    username: username || "",
    amount: Number(amount) || 0,
    time: timeISO || (new Date()).toISOString()
  };
  const r = await postJSON(CLOUD.url, payload);
  if (!r.ok) return { ok:false, error: (r.json?.error || r.error || `HTTP ${r.status}`) };
  if (r.json && r.json.ok) return { ok:true, row: r.json.row || null, number: r.json.number || null, stored: r.json.stored || null, json: r.json };
  return { ok:false, error: r.json?.error || "no_json_ok" };
}

/* ========= Отримати рядки для користувача (GET) ========= */
async function fetchUserWithdrawRows({ user_id, tg_tag }){
  if (!CLOUD.url || !CLOUD.api) return [];
  const q = `${CLOUD.url}?api=${encodeURIComponent(CLOUD.api)}&cmd=get_withdraw_rows${user_id?`&user_id=${encodeURIComponent(user_id)}`:''}${tg_tag?`&tg_tag=${encodeURIComponent(tg_tag)}`:''}&_=${Date.now()}`;
  try{
    const r = await fetch(q, { method:'GET', headers:{ 'accept':'application/json' }});
    if (!r.ok) return [];
    const j = await r.json().catch(()=>null);
    if (j && j.ok && Array.isArray(j.rows)) return j.rows;
  }catch(e){}
  return [];
}

/* ========= UI: рендер списку (виводів) ========= */
function renderPayoutList(){
  // використовуємо id payoutList (як ти мав раніше)
  const wrap = $("payoutList");
  if (!wrap) return;
  wrap.innerHTML = "";

  // отримуємо pending та history
  const pending = readPendingWithdrawals() || [];
  const history = readHistory() || [];

  // комбінуємо: pend (новіші зверху), потім history
  const combined = [];
  for (let i = pending.length - 1; i >= 0; i--){
    const p = pending[i];
    combined.push({
      number: p.number || '—',
      tag: p.tag || getUserTag(),
      time: p.time || p.createdAtISO || (new Date()).toISOString(),
      amount: p.amount || 0,
      status: p.status || (p.synced ? 'submitted' : 'processing'),
      source: 'pending',
      error: p.error || null
    });
  }
  for (let h of history){
    combined.push({
      number: h.number || h._sheetRow || '—',
      tag: h.tag || h.tg_tag || '—',
      time: h.time || h.createdAt || (new Date()).toISOString(),
      amount: h.amount || 0,
      status: h.status || 'submitted',
      source: 'history'
    });
  }

  if (combined.length === 0){
    wrap.innerHTML = '<div class="muted">Немає записів виводів</div>';
    return;
  }

  const tbl = document.createElement('table');
  tbl.className = 'withdraw-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>№</th><th>@</th><th>Час</th><th>Сума</th><th>Статус</th></tr>';
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  for (let r of combined){
    const tr = document.createElement('tr');
    const num = r.number ? r.number : '—';
    const tag = r.tag || '—';
    const time = (new Date(r.time)).toLocaleString();
    const amount = (r.amount!=null) ? String(r.amount) : '—';
    const status = r.status || '—';
    tr.innerHTML = `<td>${num}</td><td>${tag}</td><td>${time}</td><td>${amount}⭐</td><td>${status}${r.error?(' <span class="err">'+r.error+'</span>'):''}</td>`;
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  wrap.appendChild(tbl);
}

/* ========= Головна функція: натискання на існуючу кнопку withdrawBtn ========= */
async function withdraw50LocalFirst(){
  const statusEl = $("withdrawStatus");
  const btn = $("withdrawBtn");

  if (btn && btn.disabled) return; // анти-даблклік
  if (balance < WITHDRAW_CHUNK) {
    if (statusEl){ statusEl.className="err"; statusEl.textContent=`Мінімум для виводу: ${WITHDRAW_CHUNK}⭐`; }
    return;
  }

  if (btn) btn.disabled = true;

  // підготовка даних
  const u = getTelegramUser();
  const id = u.id || "";
  const tag = getUserTag();
  const uname = u.username || [u.first_name||"", u.last_name||""].filter(Boolean).join(" ");
  const now = (new Date()).toISOString();

  // 1) оптимістично: додати pending у localStorage і UI (status=processing)
  const pend = readPendingWithdrawals();
  const newPending = {
    id: id || null,
    tag: tag,
    username: uname,
    amount: WITHDRAW_CHUNK,
    time: now,
    createdAtISO: now,
    status: 'processing',
    synced: false,
    number: null,
    error: null
  };
  pend.push(newPending);
  writePendingWithdrawals(pend);
  // 2) списати баланс локально (оптимістично)
  const oldBalance = balance;
  balance = parseFloat((balance - WITHDRAW_CHUNK).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI(); saveData();
  if (statusEl){ statusEl.className="ok"; statusEl.textContent="Поставлено на вивід…"; }

  renderPayoutList();

  // 3) надсилаємо у GAS
  try{
    const res = await submitWithdrawalToSheet({
      user_id: id, tag, username: uname, amount: WITHDRAW_CHUNK, timeISO: now
    });

    if (res.ok){
      // позначити pending як synced + проставити number
      const pend2 = readPendingWithdrawals();
      for (let i = pend2.length - 1; i >= 0; i--){
        const p = pend2[i];
        if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
          p.synced = true;
          p.number = res.number || res.row || p.number;
          p.status = 'submitted';
          p.sheet_row = res.row || null;
          p.submittedAt = (new Date()).toISOString();
          break;
        }
      }
      writePendingWithdrawals(pend2);

      // додати до локальної історії
      const hist = readHistory();
      hist.push({
        number: res.number || res.row || null,
        tag: tag,
        time: now,
        amount: WITHDRAW_CHUNK,
        status: 'submitted',
        _sheetRow: res.row || null
      });
      writeHistory(hist);

      if (statusEl){ statusEl.className="ok"; statusEl.textContent="Вивід зафіксовано"; }
    } else {
      // помилка від сервера — позначити pending як failed та відкотити баланс
      const pend2 = readPendingWithdrawals();
      for (let i = pend2.length - 1; i >= 0; i--){
        const p = pend2[i];
        if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
          p.status = 'failed';
          p.error = res.error || 'submit_failed';
          break;
        }
      }
      writePendingWithdrawals(pend2);
      balance = oldBalance; setBalanceUI(); saveData();
      if (statusEl){ statusEl.className="err"; statusEl.textContent = "Помилка запису в таблицю: " + (res.error || "невідома"); }
    }
  } catch(e){
    // мережевий фейл: залишаємо pending як processing + повідомляємо
    const pend2 = readPendingWithdrawals();
    for (let i = pend2.length - 1; i >= 0; i--){
      const p = pend2[i];
      if (!p.synced && p.time === now && p.amount === WITHDRAW_CHUNK && p.tag === tag){
        p.status = 'processing';
        p.error = 'network';
        break;
      }
    }
    writePendingWithdrawals(pend2);
    if (statusEl){ statusEl.className="muted"; statusEl.textContent="Очікуємо мережу…"; }
  } finally {
    if (btn) btn.disabled = false;
    renderPayoutList();
  }
}

/* ========= Повторна синхронізація pending (щоб намагатись ще раз) ========= */
async function syncPendingWithdrawals(){
  const pending = readPendingWithdrawals();
  if (!pending || pending.length === 0) return;
  let changed = false;
  for (let i = 0; i < pending.length; i++){
    const it = pending[i];
    if (it.synced) continue;
    const res = await submitWithdrawalToSheet({ user_id: it.id, tag: it.tag, username: it.username, amount: it.amount, timeISO: it.time });
    if (res.ok){
      it.synced = true; it.number = res.number || res.row || it.number; it.status = 'submitted'; it.sheet_row = res.row || null;
      // додати до історії
      const hist = readHistory();
      hist.push({ number: it.number, tag: it.tag, time: it.time, amount: it.amount, status: 'submitted', _sheetRow: it.sheet_row });
      writeHistory(hist);
      changed = true;
    } else {
      it.error = res.error || it.error || 'submit_failed';
    }
    pending[i] = it;
    writePendingWithdrawals(pending);
    renderPayoutList();
    await new Promise(r => setTimeout(r, 200)); // невелика затримка між запитами
  }
  return changed;
}

/* ========= ІНІЦІАЛІЗАЦІЯ ========= */
let dailyUiTicker = null;
let challengeTicker = null;
let syncTimer = null;

window.onload = async function(){
  // прочитати баланс з localStorage, якщо є — щоб не обнулявся при заході
  const storedBalance = localStorage.getItem("balance");
  if (storedBalance != null && storedBalance !== "undefined"){
    const b = parseFloat(storedBalance);
    if (!isNaN(b)) balance = b;
  }

  // інші стейти
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

  // render payout list from pending/history
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

  // синхронізація з GAS: отримати server rows для користувача та додати до history
  try{
    const u = getTelegramUser();
    const user_id = u.id || '';
    const tg_tag = u.username ? ("@"+u.username) : '';
    if (CLOUD.url && CLOUD.api){
      const rows = await fetchUserWithdrawRows({ user_id, tg_tag });
      if (Array.isArray(rows) && rows.length>0){
        // додаємо ті, які ще не в локальній історії
        const hist = readHistory();
        for (let r of rows){
          const exists = hist.some(h => String(h.number || h._sheetRow) === String(r.number || r._sheetRow));
          if (!exists){
            hist.push({
              number: r.number || r._sheetRow || null,
              tag: r.tag || r.tg_tag || r['@'] || '',
              time: r.time || (new Date()).toISOString(),
              amount: r.amount || 0,
              status: r.status || 'submitted',
              _sheetRow: r._sheetRow || null
            });
          }
        }
        writeHistory(hist);
        renderPayoutList();
      }
    }
  }catch(e){ console.warn(e); }

  // періодичний синк pending
  clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ syncPendingWithdrawals(); }, 20_000);
};

/* ========= Баланс / Підписка ========= */
function addBalance(n){
  balance = parseFloat((balance + n).toFixed(2));
  if (balance < 0) balance = 0;
  setBalanceUI();
  saveData();
  // якщо CloudStore існував — можна повідомити, але у нас синхронізація з GAS відбувається інакше
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

/* ========= Реклама (Adsgram) ========= */
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

  genBtn.onclick = ()=>{ if (challengeActive) return; if (oppScorePending == null){ oppScorePending = weightedOppScore(); if (scoreBox) scoreBox.textContent = String(oppScorePending); saveData(); } };

  startBtn.onclick = ()=>{ if (challengeActive) return; if (oppScorePending == null){ alert("Спочатку згенеруй суперника."); return; } const stake = parseFloat(stakeInput.value || "0"); if (!(stake>0)) return; if (balance < stake){ alert("Недостатньо ⭐ для ставки."); return; } balance = parseFloat((balance - stake).toFixed(2)); setBalanceUI(); saveData(); challengeActive = true; challengeStartAt = Date.now(); challengeDeadline = challengeStartAt + 3*60*60*1000; challengeStake = stake; challengeOpp = oppScorePending; info.textContent = `Виклик активний! Твій суперник має рекорд ${challengeOpp}. Побий його до завершення таймера.`; checkBtn.disabled = false; cdWrap.style.display = "block"; statusEl.textContent = ""; saveData(); if (challengeTicker) clearInterval(challengeTicker); challengeTicker = setInterval(()=>{ const left = Math.max(0, challengeDeadline - Date.now()); leftEl.textContent = formatHMS(left); if (left<=0){ clearInterval(challengeTicker); } }, 1000); };

  checkBtn.onclick = ()=>{ if (!challengeActive){ statusEl.textContent = "Немає активного виклику."; return; } const now = Date.now(); const won = (highscore > challengeOpp) && (now <= challengeDeadline); const expired = now > challengeDeadline; if (won){ addBalance(challengeStake * 1.5); statusEl.textContent = "✅ Виконано! Нараховано " + (challengeStake*1.5).toFixed(2) + "⭐"; checkBtn.disabled = true; const prevBattle = Number(localStorage.getItem('battle_record')||'0'); const newBattle = Math.max(prevBattle, challengeOpp); localStorage.setItem('battle_record', String(newBattle)); saveData(); finishChallenge(); } else if (expired){ statusEl.textContent = "❌ Час вичерпано. Ставка втрачена."; checkBtn.disabled = true; finishChallenge(); } else { statusEl.textContent = "Ще не побито рекорд суперника. Спробуй підвищити свій рекорд!"; } };

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
    challengeTicker = setInterval(()=>{ const left = Math.max(0, challengeDeadline - Date.now()); leftEl.textContent = formatHMS(left); if (left<=0){ clearInterval(challengeTicker); } }, 1000);
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
/* (Оригінальний код гри залишився без змін — скопійований з твого початкового script.js) */
class Stage{
  constructor(){
    this.container = document.getElementById("container");
    this.scene = new THREE.Scene();
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
    $("start-button")?.addEventListener("click",()=>{ if (postAdTimerActive) return; this.onAction(); });
  }

  hardResetAfterEnd(){
    [this.newBlocks, this.placedBlocks, this.choppedBlocks].forEach(g=>{ for(let i=g.children.length-1;i>=0;i--) g.remove(g.children[i]); });
    this.blocks = [];
    this.stage.setCamera(2, 0);
    this.scoreEl.innerHTML = "0";
    $("instructions")?.classList.remove("hide");
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
    if(this.blocks.length>=6) $("instructions")?.classList.add("hide");
  }

  async endGame(){
    const currentScore=parseInt(this.scoreEl.innerText,10);
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
    const hs=$("highscore"); if (hs) hs.innerText="🏆 "+highscore;
  }
  // queuePush in original CloudStore not used here; we keep local storage of highscore if needed
  saveData();
}

/* =================== КІНЕЦЬ КОДУ ГРИ =================== */

/* =================== ДОДАТКОВІ УТИЛІТИ / DEBUG =================== */
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

/* =================== Виклики для debug/ручного тесту =================== */
/* Можеш викликати з консолі: renderPayoutList(), syncPendingWithdrawals(), fetchUserWithdrawRows({user_id:'...', tg_tag:'@nick'}) */







 














 






