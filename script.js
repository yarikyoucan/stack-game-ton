import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-lyjuHWsbLgYsygynLnt4dZxSKcpsdsk",
    authDomain: "stack-game-ton.firebaseapp.com",
    projectId: "stack-game-ton",
    storageBucket: "stack-game-ton.appspot.com",
    messagingSenderId: "203011584430",
    appId: "1:203011584430:web:bd52f827472d130e87583f",
    measurementId: "G-115HRS8HQ3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let record = localStorage.getItem("record") || 0;
document.getElementById("record").textContent = Record: ${record};

document.getElementById("startGame").addEventListener("click", startGame);

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });
    document.getElementById(screenId).classList.add("active");
}

function copyRefLink() {
    let refLink = document.getElementById("refLink");
    refLink.select();
    document.execCommand("copy");
    alert("Реферальне посилання скопійоване!");
}

// Гра Stack
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 300;
canvas.height = 500;

let tower = [];
let currentBlock = { x: 75, y: 50, width: 150 };
let speed = 2;
let score = 0;

function drawBlock(block) {
    ctx.fillStyle = "white";
    ctx.fillRect(block.x, block.y, block.width, 20);
}

function updateGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    tower.forEach(drawBlock);
    drawBlock(currentBlock);

    currentBlock.x += speed;
    if (currentBlock.x > canvas.width - currentBlock.width || currentBlock.x < 0) {
        speed = -speed;
    }
    
    requestAnimationFrame(updateGame);
}

function placeBlock() {
    tower.push({ ...currentBlock });
    score++;

    if (currentBlock.width < 20) {
        endGame();
    } else {
        currentBlock = {
            x: 75,
            y: tower[tower.length - 1].y - 25,
            width: currentBlock.width - 5
        };
    }
}

function startGame() {
    tower = [];
    score = 0;
    currentBlock = { x: 75, y: 50, width: 150 };
    updateGame();
}

canvas.addEventListener("click", placeBlock);

function endGame() {
    alert(Гра закінчена! Ваш рахунок: ${score});
    
    if (score > record) {
        record = score;
        localStorage.setItem("record", record);
    }

    const leaderboardRef = ref(db, "leaderboard");
    push(leaderboardRef, { name: "Гравець", score: score });

    updateLeaderboard();
}

function updateLeaderboard() {
    const leaderboardRef = ref(db, "leaderboard");

    onValue(leaderboardRef, (snapshot) => {
        let list = document.getElementById("leaderboard-list");
        list.innerHTML = "";
        let scores = [];

        snapshot.forEach((data) => {
            scores.push(data.val());
        });

        scores.sort((a, b) => b.score - a.score);
        scores.slice(0, 30).forEach((player, index) => {
            let li = document.createElement("li");
            li.textContent = ${index + 1}. ${player.name}: ${player.score};
            list.appendChild(li);
        });
    });
}

updateLeaderboard();
