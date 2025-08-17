<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stack Game</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f4f4;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .page {
      flex: 1;
      display: none;
      overflow: auto;
      padding: 10px;
    }
    .page.active {
      display: block;
    }
    .menu {
      display: flex;
      justify-content: space-around;
      border-top: 1px solid #ccc;
      background: #fff;
      padding: 10px 0;
    }
    .menu button {
      flex: 1;
      background: none;
      border: none;
      font-size: 22px;
      cursor: pointer;
    }
    .menu button.active {
      color: green;
      font-weight: bold;
    }
    .task {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fff;
      padding: 15px;
      margin: 10px auto;
      border-radius: 10px;
      width: 90%;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .task button {
      background: #007bff;
      color: #fff;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .task button.done {
      background: #28a745;
    }
    .balance {
      font-size: 20px;
      margin-bottom: 20px;
      text-align: center;
    }
    #container canvas {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 100% !important;
      height: 100% !important;
      z-index: 1;
    }
    #scoreboard {
      position: absolute;
      top: 10px;
      left: 10px;
      display: flex;
      gap: 10px;
      z-index: 2;
    }
    #score, #highscore {
      background: rgba(0,0,0,0.5);
      color: #fff;
      padding: 5px 10px;
      border-radius: 6px;
    }
    #instructions {
      position: absolute;
      top: 50px;
      left: 10px;
      color: #000;
      font-size: 16px;
      background: rgba(255,255,255,0.7);
      padding: 4px 8px;
      border-radius: 6px;
      z-index: 2;
    }
    .game-over, .ready {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      background: rgba(255,255,255,0.95);
      padding: 20px;
      border-radius: 10px;
      display: none;
      z-index: 3;
    }
  </style>
</head>
<body>

  <div id="game" class="page active">
    <div id="container">
      <div id="scoreboard">
        <div id="score">0</div>
        <div id="highscore">🏆 0</div>
      </div>
      <div id="instructions">Клік або пробіл, щоб поставити блок, після завершення гри клацни по екрану, щоб зіграти ще</div>
      <div class="game-over">
        <h2>Гра закінчена</h2>
        <p>Ти молодець 👍</p>
        <p>Клікни або натисни пробіл, щоб почати знову</p>
      </div>
      <div class="ready">
        <div id="start-button">▶ Старт</div>
      </div>
    </div>
  </div>

  <div id="tasks" class="page">
    <h2>📋 Завдання</h2>
    <div class="task">
      <span>Підпишись на канал +1⭐</span>
      <button id="subscribeBtn" onclick="subscribe()">Перейти</button>
    </div>
    <div class="task" id="task50">
      <span>🎯 Досягни рекорду 50 (+10⭐)</span>
      <button id="checkTask50">Перевірити</button>
    </div>
  </div>

  <div id="tournaments" class="page">
    <h2>🏆 Турніри</h2>
    <p>Список топів👇(рекорд)</p>
  </div>

  <div id="friends" class="page">
    <div class="balance">Баланс ⭐ <span id="balance">0</span></div>
    <h2>👥 Друзі</h2>
    <p>Список друзів знизу 👇</p>
  </div>

  <div class="menu">
    <button onclick="showPage('game', this)" class="active">🎮</button>
    <button onclick="showPage('tasks', this)">✏️</button>
    <button onclick="showPage('tournaments', this)">🏆</button>
    <button onclick="showPage('friends', this)">👥</button>
  </div>

  <!-- Three.js + GSAP + Adsgram -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r83/three.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/latest/TweenMax.min.js"></script>
  <script src="https://adsgram.ai/js/v1.js"></script>
  <script src="./script.js"></script>

  <script>
    let balance = 0;
    let subscribed = false;
    let task50Completed = false;
    let highscore = 0;

    window.onload = function () {
      if (localStorage.getItem("balance")) {
        balance = parseInt(localStorage.getItem("balance"));
        document.getElementById("balance").innerText = balance;
      }
      if (localStorage.getItem("subscribed") === "true") {
        subscribed = true;
        let btn = document.getElementById("subscribeBtn");
        btn.innerText = "Виконано";
        btn.classList.add("done");
      }
      if (localStorage.getItem("task50Completed") === "true") {
        task50Completed = true;
        let btn = document.getElementById("checkTask50");
        btn.innerText = "Виконано";
        btn.classList.add("done");
      }
      if (localStorage.getItem("highscore")) {
        highscore = parseInt(localStorage.getItem("highscore"));
        document.getElementById("highscore").innerText = "🏆 " + highscore;
      }
    };

    function saveData() {
      localStorage.setItem("balance", balance);
      localStorage.setItem("subscribed", subscribed);
      localStorage.setItem("task50Completed", task50Completed);
      localStorage.setItem("highscore", highscore);
    }

    function showPage(id, btn) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    function subscribe() {
      if (!subscribed) {
        window.open("https://t.me/stackofficialgame", "_blank");
        let btn = document.getElementById("subscribeBtn");
        btn.innerText = "Виконано";
        btn.classList.add("done");
        subscribed = true;
        addBalance(1);
        saveData();
      }
    }

    function addBalance(amount) {
      balance += amount;
      document.getElementById("balance").innerText = balance;
      saveData();
    }

    document.getElementById("checkTask50").addEventListener("click", () => {
      let btn = document.getElementById("checkTask50");
      if (highscore >= 50 && !task50Completed) {
        addBalance(10);
        btn.innerText = "Виконано";
        btn.classList.add("done");
        task50Completed = true;
        saveData();
      } else if (highscore < 50) {
        alert("❌ Твій рекорд замалий (потрібно 50+)");
      }
    });

    function updateHighscore(currentScore) {
      if (currentScore > highscore) {
        highscore = currentScore;
        localStorage.setItem("highscore", highscore);
        document.getElementById("highscore").innerText = "🏆 " + highscore;
      }
    }

    // === Реклама після Game Over ===
    function showAd() {
      const adController = window.Adsgram.init({ blockId: "1718255", debug: true });
      adController.show()
        .then(result => console.log("Реклама показана:", result))
        .catch(err => console.warn("Реклама не показана:", err));
    }
  </script>
</body>
</html>
