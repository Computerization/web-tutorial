# Hints

## Step 1: Create a Random Number

Use JavaScript to generate random numbers:

```
Math.random() // random number between 0 and 1
```

To create an interger in the range (min, min + range):

```
Math.floor(Math.random() * range) + min
```

## Step 2 (optional): Create a Random Range

Instead of always generating a number from 1 to 100, try:

* Generate a **random minimum**
* Generate a **random maximum**

Make sure that:

```max > min``` and ```max - min >= range```

# Get User Input

Notice that there's already an ```<input>``` box in HTML

Useful syntax:

```
document.getElementById("html_id");
```

To get the value of HTML input:

```variableName.value```

**Tip:** The input from HTML returns a **string**, but you want a **number**

## Step 4: Compare the Guess

Use conditional statements:

```
if (condition 1)
{
    // too small
}
else if(condition 2)
{
    // too big
}
else 
{
    // correct
}
```

## Step 5: Display Messages

The ```<div id="answer></div>``` in HTML is left empty for you to output a message.

Select the element:

```
const variableName = document.getElementById("htmlId");
```

Update the text content of the selected HTML tag:

```
variableName.textContent = "Displayed Message";
```

## Listen for Submission

Add an event listener:

```
form.addEventListener("submit", function(event))
{
    // code to execute after event
}
```

## Go To

[→ Solution](./solution.js)

[→ Additional Features](./features.md)

[→ Final Version](./final.js)

[← Back to Home](../README.md)