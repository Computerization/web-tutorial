// ==========================
// Number Guessing Game
// ==========================

// Game variables set

let min, max, target;
let attemptsLeft;
let maxAttempts = 10;
let score = 0;

// Fetch HTML elements

const form = document.querySelector("form");
const input = document.getElementById("userinput");
const answerDiv = document.getElementById("answer");

// Create restart button dynamically

const restartBtn = document.createElement("button");
restartBtn.textContent = "Restart Game";
document.body.appendChild(restartBtn);

// Initialize Game

function initGame() {
	min = Math.floor(Math.random() * 50) + 1;
	max = min + Math.floor(Math.random() * 50) + 10;
	target = Math.floor(Math.random() * (max - min + 1)) + min;

	attemptsLeft = maxAttempts;

	answerDiv.textContent = `Guess a number between ${min} and ${max}. Attempts left: ${attemptsLeft}`;

	console.log(`Debug: target = ${target}`);
}

// Handle Guess

function handleGuess(guess) {
	if (attemptsLeft <= 0) {
		answerDiv.textContent = "No attempts left! Click restart for a new game.";
		return;
	}

	attemptsLeft--;

	if (guess < target) {
		answerDiv.textContent = `Too small! Attempts left: ${attemptsLeft}`;
	} else if (guess > target) {
		answerDiv.textContent = `Too big! Attempts left: ${attemptsLeft}`;
	} else {
		score += attemptsLeft + 1; // reward efficiency
		answerDiv.textContent = `🎉 Correct! The number was ${target}. Score: ${score}`;
		attemptsLeft = 0;
		return;
	}

	if (attemptsLeft === 0) {
		answerDiv.textContent = `Game over! The number was ${target}. Final score: ${score}`;
	}
}

// Event Listeners

form.addEventListener("submit", function(event) {
	event.preventDefault();

	const guess = Number(input.value);

	if (isNaN(guess)) {
		answerDiv.textContent = "Please enter a valid number!";
		return;
	}

	handleGuess(guess);
	input.value = "";
});

restartBtn.addEventListener("click", initGame);

initGame();