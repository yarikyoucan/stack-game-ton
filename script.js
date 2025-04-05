import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js';
import { getDatabase, ref, set, get, child, onValue } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js';

// Налаштування Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC-lyjuHWsbLgYsygynLnt4dZxSKcpsdsk",
    authDomain: "stack-game-ton.firebaseapp.com",
    databaseURL: "https://stack-game-ton-default-rtdb.firebaseio.com",
    projectId: "stack-game-ton",
    storageBucket: "stack-game-ton.appspot.com",
    messagingSenderId: "203011584430",
    appId: "1:203011584430:web:bd52f827472d130e87583f"
};

// Ініціалізація Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Елементи DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('start-button');
const scoreDisplay = document.getElementById('score');
const highscoreDisplay = document.getElementById('highscore');
const leaderboardList = document.getElementById('leaderboard');

// Налаштування гри
const canvasWidth = 400;
const canvasHeight = 400;
canvas.width = canvasWidth;
canvas.height = canvasHeight;

let stack = [];
let currentBlock = null;
let gameInterval = null;
let score = 0;
let highscore = 0;

// Завантаження рекорду з локального сховища
if (localStorage.getItem('highscore')) {
    highscore = parseInt(localStorage.getItem('highscore'));
    highscoreDisplay.textContent = Рекорд: ${highscore};
}

// Функція для створення нового блоку
function createBlock() {
    const width = stack.length > 0 ? stack[stack.length - 1].width : canvasWidth;
    const x = Math.random() * (canvasWidth - width);
    return { x, y: 0, width, height: 20, speed: 2 };
}

// Функція для оновлення позиції блоку
function updateBlock(block) {
    block.y += block.speed;
    if (block.y + block.height >= canvasHeight) {
        block.y = canvasHeight - block.height;
        stack.push(block);
        score++;
        scoreDisplay.textContent = Рахунок: ${score};
        if (score > highscore) {
            highscore = score;
            highscoreDisplay.textContent = Рекорд: ${highscore};
            localStorage.setItem('highscore', highscore);
        }
        currentBlock = createBlock();
    }
}

// Функція для відображення блоку
function drawBlock(block) {
    ctx.fillStyle = '#3498db';
    ctx.fillRect(block.x, block.y, block.width, block.height);
}

// Функція для відображення стеку блоків
function drawStack() {
    stack.forEach(block => drawBlock(block));
}

// Функція для оновлення гри
function updateGame() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    updateBlock(currentBlock);
    drawBlock(currentBlock);
    drawStack();
}

// Функція для завершення гри
function endGame() {
    clearInterval(gameInterval);
    saveScoreToFirebase(score);
    loadLeaderboard();
}

// Функція для збереження рахунку в Firebase
function saveScoreToFirebase(score) {
    const userId = user_${Math.random().toString(36).substr(2, 9)};
    set(ref(db, 'leaderboard/' + userId), {
        score: score
    });
}

// Функція для завантаження лідерборду з Firebase
function loadLeaderboard() {
    const leaderboardRef = ref(db, 'leaderboard');
    onValue(leaderboardRef, (snapshot) => {
        const scores = [];
        snapshot.forEach((childSnapshot) => {
            scores.push(childSnapshot.val().score);
        });
        scores.sort((a, b) => b - a);
        displayLeaderboard(scores);
    });
}

// Функція для відображення лідерборду
function displayLeaderboard(scores) {
    leaderboardList.innerHTML = '';
    scores.slice(0, 10).forEach((score, index) => {
        const li = document.createElement('li0
