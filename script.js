"use strict";
console.clear();

/* ====== КОНСТАНТИ ====== */
const TASK_AD_COOLDOWN_MS = 60_000; // 1 хвилина між показами у завданні
const ADS_COOLDOWN_MS_GLOBAL = 60_000; // перестраховка, щоб не спамити SDK

/* ====== СТАН КОРИСТУВАЧА ====== */
let balance = 0, subscribed = false, task50Completed = false, highscore = 0;
let isPaused = false;

/* ====== СТАН РЕКЛАМИ ====== */
let AdController = null;
let lastGlobalAdAt = 0;      // глобальний кулдаун (будь-який показ)
let lastTaskAdAt = 0;        // останній успішний показ у завданні (+0.2⭐)

/* ====== ХЕЛПЕРИ ====== */
function $(id){ return document.getElementById(id); }
function formatStars(val){
  // показуємо без зайвих нулів: 12 або 12.2
  const n = Number(val);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function setBalanceUI(){
  $("balance").innerText = formatStars(balance);
}

/* ====== ВІДНОВЛЕННЯ/ЗБЕРЕЖЕННЯ ====== */
window.onload = function () {
  balance = parseFloat(localStorage.getItem("balance") || "0");
  subscribed = localStorage.getItem("subscribed") === "true";
  task50Completed = localStorage.getItem("task50Completed") === "true";
  highscore = parseInt(localStorage.getItem("highscore") || "0", 10);
  lastTaskAdAt = parseInt(localStorage.getItem("lastTaskAdAt") || "0", 10);

  setBalanceUI();
  $("highscore").innerText = "🏆 " + highscore;

  // Завдання: підписка
  const subBtn = $("subscribeBtn");
  if (subBtn) {
    if (subscribed) { subBtn.innerText = "Виконано"; subBtn.classList.add("done"); }
    subBtn.addEventListener("click", subscribe);
  }

  // Завдання: рекорд 50
  const t50 = $("checkTask50");
  if (t50) {
    if (task50Completed) { t50.innerText = "Виконано"; t50.classList.add("done"); }
    t50.addEventListener("click", () => {
      if (highscore >= 50 && !task50Completed) {
        addBalance(10);
        t50.innerText = "Виконано"; t50.classList.add("done");
        task50Completed = true; saveData();
      } else if (highscore < 50) {
        alert("❌ Твій рекорд замалий (потрібно 50+)");
      }
    });
  }

  // Завдання: 1 показ реклами → +0.2⭐ (раз на хвилину)
  const watchBtn = $("watchAdMinuteBtn");
  if (watchBtn) {
    watchBtn.addEventListener("click", onWatchAdTaskClick);
  }
  // запускаємо тікер кулдауну для завдання
  startTaskCooldownTicker();

  initAds();
  window.game = new Game();
};
function saveData(){
  localStorage.setItem("balance", String(balance));
  localStorage.setItem("subscribed", subscribed ? "true" : "false");
  localStorage.setItem("task50Completed", task50Completed ? "true" : "false");
  localStorage.setItem("highscore", String(highscore));
  localStorage.setItem("lastTaskAdAt", String(lastTaskAdAt));
}
function addBalance(n){
  balance = parseFloat((balance + n).toFixed(2)); // акуратно з плаваючою крапкою
  setBalanceUI();
  saveData();
}

/* ====== Навігація по вкладках ====== */
function showPage(id, btn){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".menu button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  isPaused = (id !== "game");
}
window.showPage = showPage;

/* ====== ПІДПИСКА ====== */
function subscribe(){
  if (subscribed) return;
  const url = "https://t.me/stackofficialgame";
  if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank");
  subscribed = true; addBalance(1);
  const btn = $("subscribeBtn"); if (btn){ btn.innerText="Виконано"; btn.classList.add("done"); }
  saveData();
}

/* ====== Adsgram INIT (вписати свій blockId) ====== */
function initAds(){
  if (!window.Adsgram) { console.warn("Adsgram SDK не завантажився"); return; }
  AdController = window.Adsgram.init({
    blockId: "REPLACE_ME", // <-- ВПИШИ СВІЙ BLOCK ID (наприклад, int-13956)
    debug: true            // у проді постав false
    // debugBannerType: "FullscreenMedia" // (опц.) тестовий показ у debug
  });
}
function inTelegramWebApp() {
  return !!(window.Telegram && window.Telegram.WebApp);
}

/* ====== Загальний показ інтерстішала (без нарахувань) ====== */
async function showInterstitialOnce(){
  if (!AdController)            return { shown:false, reason:"no_controller" };
  if (!inTelegramWebApp())      return { shown:false, reason:"not_telegram" };
  const now = Date.now();
  if (now - lastGlobalAdAt < ADS_COOLDOWN_MS_GLOBAL) {
    return { shown:false, reason:"global_cooldown" };
  }
  try {
    const res = await AdController.show();   // { done, state, description, error }
    console.log("Interstitial result:", res);
    lastGlobalAdAt = Date.now();
    if (res && res.done) return { shown:true };
    return { shown:false, reason: res?.description || res?.state || "no_fill" };
  } catch (e) {
    console.warn("Реклама не показана:", e);
    return { shown:false, reason:"exception" };
  }
}

/* ====== ЛОГІКА ЗАВДАННЯ: 1 показ → +0.2⭐, раз на 1 хв ====== */
async function onWatchAdTaskClick(){
  const now = Date.now();
  const remaining = TASK_AD_COOLDOWN_MS - (now - lastTaskAdAt);
  if (remaining > 0) {
    // заблокуємо кнопку/оновимо UI через тікер, тут просто захист
    return;
  }

  const res = await showInterstitialOnce();
  if (res.shown) {
    lastTaskAdAt = Date.now();
    addBalance(0.2);   // +0.2⭐ за кожен успішний перегляд у ЗАВДАННІ
    saveData();
    // одразу оновимо UI кулдауну
    updateTaskCooldownUI();
  } else {
    console.log("Ad not shown (task):", res.reason);
    // alert("Зараз реклама недоступна. Спробуй пізніше.");
  }
}

/* Кулдаун-стікер: кожну секунду оновлюємо кнопку та таймер */
let taskCooldownTimer = null;
function startTaskCooldownTicker(){
  if (taskCooldownTimer) clearInterval(taskCooldownTimer);
  taskCooldownTimer = setInterval(updateTaskCooldownUI, 1000);
  updateTaskCooldownUI(); // миттєве оновлення при завантаженні
}
function updateTaskCooldownUI(){
  const btn = $("watchAdMinuteBtn");
  const cdBox = $("taskAdStatus");
  const cdText = $("adCooldownText");
  const now = Date.now();
  const remaining = Math.max(0, TASK_AD_COOLDOWN_MS - (now - lastTaskAdAt));

  if (!btn || !cdBox || !cdText) return;

  if (remaining > 0) {
    // показуємо бокс “очікуй…”, кнопку ховаємо
    btn.disabled = true;
    $("taskAdOncePerMinute").style.display = "none";
    cdBox.style.display = "flex";
    // форматування у секундах
    const sec = Math.ceil(remaining / 1000);
    cdText.innerText = sec + "с";
  } else {
    // можна дивитися знову
    btn.disabled = false;
    $("taskAdOncePerMinute").style.display = "flex";
    cdBox.style.display = "none";
  }
}

/* ====== 3D СЦЕНА + ЛОГІКА STACK ====== */
class Stage {
  constructor(){
    this.container = document.getElementById("container");
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor('#D0CBC7', 1);
    this.container.appendChild(this.renderer.domElement);

    const aspect = window.innerWidth / window.innerHeight, d = 20;
    this.camera = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, -100, 1000);
    this.camera.position.set(2,2,2);
    this.cameraTarget = new THREE.Vector3(0,0,0);
    this.camera.lookAt(this.cameraTarget);

    this.light = new THREE.DirectionalLight(0xffffff, 0.5); this.light.position.set(0,499,0);
    this.softLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.light); this.scene.add(this.softLight);

    window.addEventListener('resize', ()=>this.onResize());
    this.onResize();
  }
  add(o){ this.scene.add(o); }
  remove(o){ this.scene.remove(o); }
  render(){ this.camera.lookAt(this.cameraTarget); this.renderer.render(this.scene, this.camera); }
  setCamera(y, speed=0.3){
    TweenMax.to(this.camera.position, speed, { y: y+4, ease: Power1.easeInOut });
    TweenMax.to(this.cameraTarget,  speed, { y: y,   ease: Power1.easeInOut });
  }
  onResize(){
    const viewSize = 30;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.left = window.innerWidth / -viewSize;
    this.camera.right = window.innerWidth / viewSize;
    this.camera.top = window.innerHeight / viewSize;
    this.camera.bottom = window.innerHeight / -viewSize;
    this.camera.updateProjectionMatrix();
  }
}

class Block {
  constructor(prev){
    this.STATES = { ACTIVE:'active', STOPPED:'stopped', MISSED:'missed' };
    this.MOVE_AMOUNT = 12;

    this.targetBlock = prev;
    this.index = (prev ? prev.index : 0) + 1;
    this.workingPlane = this.index % 2 ? 'x' : 'z';
    this.workingDimension = this.index % 2 ? 'width' : 'depth';

    this.dimension = {
      width:  prev ? prev.dimension.width  : 10,
      height: prev ? prev.dimension.height : 2,
      depth:  prev ? prev.dimension.depth  : 10
    };
    this.position = {
      x: prev ? prev.position.x : 0,
      y: this.dimension.height * this.index,
      z: prev ? prev.position.z : 0
    };

    this.colorOffset = prev ? prev.colorOffset : Math.round(Math.random()*100);
    if (!prev){ this.color = 0x333344; }
    else {
      const o = this.index + this.colorOffset;
      const r = Math.sin(0.3*o)*55 + 200, g = Math.sin(0.3*o+2)*55 + 200, b = Math.sin(0.3*o+4)*55 + 200;
      this.color = new THREE.Color(r/255, g/255, b/255);
    }

    this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;
    this.speed = -0.1 - (this.index * 0.005); if (this.speed < -4) this.speed = -4;
    this.direction = this.speed;

    const geom = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    geom.translate(this.dimension.width/2, this.dimension.height/2, this.dimension.depth/2);
    this.material = new THREE.MeshToonMaterial({ color:this.color });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);

    if (this.state===this.STATES.ACTIVE){
      this.position[this.workingPlane] = Math.random()>0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
    }
  }
  reverseDirection(){ this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed); }
  place(){
    this.state = this.STATES.STOPPED;
    let overlap = this.targetBlock.dimension[this.workingDimension] - Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);
    const ret = { plane:this.workingPlane, direction:this.direction };

    if (this.dimension[this.workingDimension] - overlap < 0.3){
      overlap = this.dimension[this.workingDimension];
      ret.bonus = true;
      this.position.x = this.targetBlock.position.x;
      this.position.z = this.targetBlock.position.z;
      this.dimension.width = this.targetBlock.dimension.width;
      this.dimension.depth = this.targetBlock.dimension.depth;
    }
    if (overlap > 0){
      const choppedDim = { width:this.dimension.width, height:this.dimension.height, depth:this.dimension.depth };
      choppedDim[this.workingDimension] -= overlap;
      this.dimension[this.workingDimension] = overlap;

      const placedG = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
      placedG.translate(this.dimension.width/2, this.dimension.height/2, this.dimension.depth/2);
      const placed = new THREE.Mesh(placedG, this.material);

      const choppedG = new THREE.BoxGeometry(choppedDim.width, choppedDim.height, choppedDim.depth);
      choppedG.translate(choppedDim.width/2, choppedDim.height/2, choppedDim.depth/2);
      const chopped = new THREE.Mesh(choppedG, this.material);

      const choppedPos = { x:this.position.x, y:this.position.y, z:this.position.z };
      if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane]) {
        this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
      } else {
        choppedPos[this.workingPlane] += overlap;
      }

      placed.position.set(this.position.x, this.position.y, this.position.z);
      chopped.position.set(choppedPos.x, choppedPos.y, choppedPos.z);
      ret.placed = placed;
      if (!ret.bonus) ret.chopped = chopped;
    } else {
      this.state = this.STATES.MISSED;
    }
    this.dimension[this.workingDimension] = overlap;
    return ret;
  }
  tick(){
    if (this.state===this.STATES.ACTIVE){
      const v = this.position[this.workingPlane];
      if (v > this.MOVE_AMOUNT || v < -this.MOVE_AMOUNT) this.reverseDirection();
      this.position[this.workingPlane] += this.direction;
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
    }
  }
}

class Game {
  constructor(){
    this.STATES = { LOADING:'loading', PLAYING:'playing', READY:'ready', ENDED:'ended', RESETTING:'resetting' };
    this.state = this.STATES.LOADING;
    this.blocks = [];
    this.stage = new Stage();

    this.newBlocks = new THREE.Group();
    this.placedBlocks = new THREE.Group();
    this.choppedBlocks = new THREE.Group();
    this.stage.add(this.newBlocks); this.stage.add(this.placedBlocks); this.stage.add(this.choppedBlocks);

    this.scoreEl = $("score");
    this.scoreEl.innerHTML = "0";

    this.addBlock();
    this.tick();
    this.showReady();

    document.addEventListener("keydown", (e)=>{
      if (isPaused) return;
      if (e.keyCode === 32) this.onAction();
    });
    document.addEventListener("click", (e)=>{
      if (isPaused) return;
      if ($("game").classList.contains("active") && e.target.tagName.toLowerCase()==="canvas") this.onAction();
    });

    $("start-button").addEventListener("click", ()=>this.onAction());
    this.adShown = false; // (залишимо прапор, якщо захочеш автопоказ після Game Over)
  }

  showReady(){ $("ready").style.display = "block"; $("gameOver").style.display = "none"; this.state = this.STATES.READY; }
  showGameOver(){ $("gameOver").style.display = "block"; $("ready").style.display = "none"; this.state = this.STATES.ENDED; }
  hideOverlays(){ $("gameOver").style.display = "none"; $("ready").style.display = "none"; }

  onAction(){
    switch(this.state){
      case this.STATES.READY:   this.startGame(); break;
      case this.STATES.PLAYING: this.placeBlock(); break;
      case this.STATES.ENDED:   this.restartGame(); break;
    }
  }

  startGame(){
    if (this.state === this.STATES.PLAYING) return;
    this.scoreEl.innerHTML = "0";
    this.hideOverlays();
    this.state = this.STATES.PLAYING;
    this.addBlock();
    this.adShown = false;
  }

  restartGame(){
    this.state = this.STATES.RESETTING;
    const old = this.placedBlocks.children.slice();
    const removeSpeed = 0.2, delay = 0.02;
    for (let i=0;i<old.length;i++){
      TweenMax.to(old[i].scale, removeSpeed, { x:0,y:0,z:0, delay:(old.length-i)*delay, ease:Power1.easeIn, onComplete:()=>this.placedBlocks.remove(old[i]) });
      TweenMax.to(old[i].rotation, removeSpeed, { y:0.5, delay:(old.length-i)*delay, ease:Power1.easeIn });
    }
    const camT = removeSpeed*2 + (old.length * delay);
    this.stage.setCamera(2, camT);
    const countdown = { v:this.blocks.length - 1 };
    TweenMax.to(countdown, camT, { v:0, onUpdate:()=>{ this.scoreEl.innerHTML = String(Math.round(countdown.v)); } });
    this.blocks = this.blocks.slice(0,1);
    setTimeout(()=>this.startGame(), camT*1000);
  }

  placeBlock(){
    const cur = this.blocks[this.blocks.length-1];
    const res = cur.place();
    this.newBlocks.remove(cur.mesh);
    if (res.placed) this.placedBlocks.add(res.placed);
    if (res.chopped){
      this.choppedBlocks.add(res.chopped);
      const pos = { y:'-=30', ease:Power1.easeIn, onComplete:()=>this.choppedBlocks.remove(res.chopped) };
      const rnd = 10;
      const rot = {
        delay:0.05,
        x: res.plane==='z' ? ((Math.random()*rnd)-(rnd/2)) : 0.1,
        z: res.plane==='x' ? ((Math.random()*rnd)-(rnd/2)) : 0.1,
        y: Math.random()*0.1
      };
      if (res.chopped.position[res.plane] > res.placed.position[res.plane]) pos[res.plane] = '+=' + (40*Math.abs(res.direction));
      else pos[res.plane] = '-=' + (40*Math.abs(res.direction));
      TweenMax.to(res.chopped.position, 1, pos);
      TweenMax.to(res.chopped.rotation, 1, rot);
    }
    this.addBlock();
  }

  addBlock(){
    const last = this.blocks[this.blocks.length-1];
    if (last && last.state===last.STATES.MISSED) return this.endGame();

    this.scoreEl.innerHTML = String(this.blocks.length - 1);
    const b = new Block(last);
    this.newBlocks.add(b.mesh);
    this.blocks.push(b);
    this.stage.setCamera(this.blocks.length * 2);
    if (this.blocks.length >= 5) $("instructions").classList.add("hide");
  }

  async endGame(){
    this.showGameOver();
    const currentScore = parseInt(this.scoreEl.innerText, 10);
    updateHighscore(currentScore);

    // (опційно) якщо хочеш автопоказ після Game Over без бонусів:
    // if (!this.adShown){
    //   this.adShown = true;
    //   await showInterstitialOnce();
    // }
  }

  tick(){
    if (!isPaused){
      this.blocks[this.blocks.length-1].tick();
      this.stage.render();
    }
    requestAnimationFrame(()=>this.tick());
  }
}

/* ====== ХАЙСКОР ====== */
function updateHighscore(currentScore){
  if (currentScore > highscore){
    highscore = currentScore;
    localStorage.setItem("highscore", String(highscore));
    $("highscore").innerText = "🏆 " + highscore;
  }
}
