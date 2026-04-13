# Additional Features

The following contains some ideas on how to improve this project further

## Set Game Attributes
```
let min, max, target;
let attemptsLeft;
let maxAttempts = 5;
let score = 0;
```

## 1. Enable Reset of the Game

Use this to replace the initialization so that it can be  called multiple times to reset.

```
function initGame()
{
	min = Math.floor(Math.random() * 50) + 1;
	max = min + Math.floor(Math.random() * 50) + 10;
	target = Math.floor(Math.random() * (max - min + 1)) + min;
    // Generate range and target

	attemptsLeft = maxAttempts; // Reset attempts

	answerDiv.textContent = `Guess a number between ${min} and ${max}. Attempts left: ${attemptsLeft}`;

	console.log(`Debug: ${target}`);
}
```

Add a reset button in the HTML file:

```
<button id="restartBtn">Restart Game</button>
```

Add an Event Listener in the JavaScript file to respond to the reset button onclick:

```
restartBtn.addEventListener("click", initGame);
```

**Important:** Do not forget to add a line of code to call the function and initialize the game for the first time:

```
initGame();
```

## 2. Add attempts limit and scoring

Replace the submit logic with this ```handleGuess()``` function:

```
function handleGuess(guess)
{
	// User attempts to guess after game has ended
	if (attemptsLeft <= 0)
	{
		answerDiv.textContent = "No attempts left! Click restart.";
		return;
	}

	attemptsLeft--;

	if (guess < target)
	{
		answerDiv.textContent = `Too small! Attempts left: ${attemptsLeft}`;
	}
	else if (guess > target)
	{
		answerDiv.textContent = `Too big! Attempts left: ${attemptsLeft}`;
	}
	else
	{
		score += attemptsLeft + 1; // reward faster guesses
		answerDiv.textContent = `🎉 Correct! Score: ${score}`;
		attemptsLeft = 0; // end round
		return;
	}

	if (attemptsLeft === 0)
	{
		answerDiv.textContent = `Game over! The number was ${target}. Score: ${score}`;
	}
}
```

## Fixes

Base variables should be stated at the top of ```<script>```:

```
let min, max, target;
let attemptsLeft;
let maxAttempts = 10;
let score = 0;
```

Finally, you need to hook everything together with event listeners:

```
// Get the HTML elements

const form = document.querySelector("form");
const input = document.getElementById("userinput");
const answerDiv = document.getElementById("answer");
const restartBtn = document.getElementById("restartBtn");

form.addEventListener("submit", function(event) {
	event.preventDefault();

	const guess = Number(input.value);

	if (isNaN(guess)) {
		answerDiv.textContent = "Enter a valid number!";
		return;
	}

	handleGuess(guess);
	input.value = "";
});

restartBtn.addEventListener("click", initGame);
```

## Optional Upgrades (Not Covered)

If you want to go **EVEN FURTHER**, here are some ideas for you:

- Make the number of attempts adjust to the range

- Add difficulty levels

  - Easy: Allow inefficient strategies
  - Hard: Must be played perfectly
  - Impossible: Requires luck

- High score tracking using local storage

- Hints on distance to target

## Go To

[→ Hints](./hint.md)

[→ Solution](./solution.js)

[→ Final Version](./final.js)

[← Back to Home](../README.md)