# Neo-Enspire — How It Works

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [Why a Proxy? What the School Server's Design Forces Us to Do](#2-why-a-proxy-what-the-school-servers-design-forces-us-to-do)
3. [Project Structure](#3-project-structure)
4. [How to Run It](#4-how-to-run-it)
5. [How Does `server.js` Actually Execute?](#5-how-does-serverjs-actually-execute)
   - 5.1 [Two Phases: Setup and Listening](#51-two-phases-setup-and-listening)
   - 5.2 [What `app.get(...)` Really Does — Registration, Not Execution](#52-what-appget-really-does--registration-not-execution)
   - 5.3 [Callbacks — Functions You Define Now, That Run Later](#53-callbacks--functions-you-define-now-that-run-later)
   - 5.4 [Middleware — Functions That Run Before Your Handler](#54-middleware--functions-that-run-before-your-handler)
   - 5.5 [`async (req, res) =>` — What Are These Arguments?](#55-async-req-res---what-are-these-arguments)
6. [What is `server.js`? (Code Walkthrough)](#6-what-is-serverjs-code-walkthrough)
   - 6.1 [Imports and Setup](#61-imports-and-setup)
   - 6.2 [The Session Store](#62-the-session-store)
   - 6.3 [Helper Functions](#63-helper-functions)
   - 6.4 [Routes (API Endpoints)](#64-routes-api-endpoints)
7. [What is `index.html`?](#7-what-is-indexhtml)
   - 7.1 [The HTML Structure](#71-the-html-structure)
   - 7.2 [The JavaScript](#72-the-javascript)
8. [The Full Login → Timetable Flow (Step by Step)](#8-the-full-login--timetable-flow-step-by-step)
9. [How Sessions and Tokens Work](#9-how-sessions-and-tokens-work)
10. [What Happens When the School Session Expires](#10-what-happens-when-the-school-session-expires)
11. [Key Concepts Glossary](#11-key-concepts-glossary)

---

## 1. The Big Picture

The school's website (`101.227.232.33:8001`) was built for desktop browsers only. We want to build a mobile-friendly app. But we can't just call the school server from a phone — there are technical barriers (see section 2). So we built a **proxy server** that sits in between:

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Browser   │ ──────> │   Our Proxy      │ ──────> │  School Server   │
│ (index.html)│ <────── │   (server.js)    │ <────── │ 101.227.232.33   │
└─────────────┘         └──────────────────┘         └──────────────────┘
   localhost:3000          localhost:3000               Port 8001
   You see this           Runs on your Mac             The real data
```

**In plain English:**
- The browser (you) talks to our proxy at `localhost:3000`
- Our proxy talks to the school server on your behalf
- The school server thinks it's just a normal browser visiting it

---

## 2. Why a Proxy? What the School Server's Design Forces Us to Do

The school server was never designed to be used by third-party apps. Its architecture creates several barriers — but also gives us a few lucky breaks. Understanding these is key to understanding why this project is shaped the way it is.

### Barriers: Things that FORCE us to use a proxy

#### No CORS Headers — The #1 Reason the Proxy Exists

**What is CORS?**
When a webpage loaded from one domain (say `localhost:3000`) tries to make an HTTP request to a *different* domain (say `101.227.232.33:8001`), the browser checks: "Did the target server explicitly say this is OK?" It does this by looking for special headers in the server's response, like `Access-Control-Allow-Origin: *`.

**What the school server does:**
The school's login page has a `<meta>` tag that looks like it allows cross-origin requests:
```html
<meta http-equiv="Access-Control-Allow-Origin" content="*">
```
But this is **completely useless**. CORS is enforced via actual HTTP *response headers*, not HTML meta tags. The school server does NOT send the real CORS header. This means:

```
Browser (localhost:3000) ──GET timetable──> School Server (101.227.232.33)
                                            │
Browser: "Hey school, can I call you        │
         from a different domain?"           │
                                            │
School: (sends no CORS header)              │
                                            │
Browser: "No CORS header? BLOCKED."         │
         ❌ Request rejected by browser     │
```

**How our proxy fixes this:**
CORS is a *browser-only* rule. Server-to-server requests don't have this restriction. So:

```
Browser ──> Our Proxy (same domain, no CORS issue!)
                │
                └──> School Server (server-to-server, no CORS!)
```

The browser talks to our proxy at `localhost:3000`, which is the same origin as the webpage itself — no CORS problem. Then our proxy (a Node.js process, not a browser) talks to the school server — also no CORS problem, because CORS simply doesn't exist outside of browsers.

**If the school server had proper CORS headers**, we technically wouldn't *need* a proxy for this reason alone. The browser could talk directly to the school server. But the other barriers below would still exist.

#### Cookie-Based Sessions — Why the Browser Can't Just "Be" Logged In

**How cookies normally work:**
When you log into a website, the server sends back cookies. Your browser stores them and automatically sends them back with every request to that same domain. This is how the server knows you're still logged in.

**The problem:**
The school server's cookies (`.AspNetCore.Session` and `tsi`) are tied to the domain `101.227.232.33`. A page running on `localhost:3000` cannot read, store, or send cookies belonging to `101.227.232.33`. This is a fundamental browser security rule called the **Same-Origin Policy** — completely separate from CORS.

Even if CORS were fixed, the browser could make requests to the school server, but those requests would arrive **without cookies** — meaning the school server would treat every request as "not logged in."

**How our proxy fixes this:**
Our proxy logs into the school server and captures the cookies server-side. It stores them in memory, tied to the student's proxy token. When the browser asks for the timetable, the proxy attaches the school cookies to the outgoing request on the student's behalf:

```
Browser sends:                  Proxy adds cookies and forwards:
GET /api/timetable              POST school:8001/GetTimetableByStudent
X-Token: f7a3b1c9...    →      Cookie: .AspNetCore.Session=abc; tsi=xyz
(no school cookies)             (school cookies attached by proxy)
```

This is why we had to invent our own token system. The browser can't use the school's cookies, so we give it a different token that maps to the school cookies stored in our proxy.

#### Plain HTTP, No HTTPS — A Security Problem (Not Ours to Fix)

The school server runs on `http://` (port 8001), not `https://`. The API doc notes there IS a TLS certificate but it has a hostname mismatch, making it invalid. This means:

- All data between our proxy and the school server travels **unencrypted** — student names, grades, even login passwords are visible to anyone on the network path
- If the school *did* enforce HTTPS with their broken certificate, our proxy would fail to connect (Node.js rejects invalid certificates by default). We'd have to either disable certificate checking (bad practice) or ask school IT to fix it

For our MVP, plain HTTP actually makes the connection simpler — `fetch("http://...")` just works, no cert issues. But this is a **security concern**, not a feature. In production, you'd want the proxy ↔ school connection on a trusted network, and the student ↔ proxy connection should use HTTPS.

### Lucky Breaks: Things that HELP us build this

#### JSON Responses from jQuery AJAX — The Biggest Lucky Break

This is the single most important thing working in our favor.

The school system is a server-rendered ASP.NET MVC app — it generates full HTML pages on the server and sends them to the browser. If that were ALL it did, building this project would be **extremely painful**. We'd have to:

1. Fetch the full HTML page for every piece of data
2. Parse through hundreds of lines of HTML/CSS/JS to find the actual data
3. Break every time the school changes their page layout

But the school system also uses **jQuery AJAX (XHR) calls**. Here's what that means:

When you visit the timetable page in a browser, the school server sends you an HTML page with an empty table. Then, JavaScript on that page fires a separate HTTP request to fetch the actual timetable data as **pure JSON**:

```
Step 1: Browser loads page
  GET /Stu/Timetable/Index → Full HTML page (layout, menus, empty table)

Step 2: JavaScript on the page fetches data
  POST /Stu/Timetable/GetTimetableByStudent → Pure JSON data:
  {
    "ResultType": 0,
    "Data": {
      "TimetableList": [ ... actual schedule data ... ]
    }
  }
```

We skip step 1 entirely and go straight to step 2. The school essentially has a **hidden JSON API** that was only meant for its own jQuery frontend — but we can call it too. Our proxy calls these same XHR endpoints and gets clean, structured data back.

**If the school didn't use jQuery AJAX**, every route handler in our proxy would look like this nightmare:

```js
// Hypothetical: no JSON API, scraping HTML instead
app.get("/api/timetable", auth, async (req, res) => {
  const html = await fetchSchoolPage("/Stu/Timetable/Index");
  // Find the table in 500 lines of HTML...
  // Parse each <tr> and <td>...
  // Hope they don't change the CSS class names...
  // Handle weird edge cases in the HTML...
  // 😭
});
```

Instead, our actual code is just: call the endpoint, get JSON, forward it. ~10 lines.

#### POST for Everything — Weird but Harmless

The school server uses `POST` for every request, even ones that just read data (like fetching grades). In proper REST API design, reading data should use `GET` and writing data should use `POST`. The school doesn't follow this convention.

**Impact on us:** Basically none. Our proxy just sends POST requests where the school expects POST. It's a little weird but it doesn't create any real problems. We expose cleaner endpoints to the browser (`GET /api/timetable` on our side, which translates to `POST /Stu/Timetable/GetTimetableByStudent` on the school side).

#### No Rate Limiting — Nice for Development

The school server doesn't appear to limit how many requests you can make. This means during development and testing, we can hit the server repeatedly without getting blocked.

**This is a double-edged sword.** It's convenient for us, but it also means we have a responsibility: if 500 students use our app and all check their timetable at 8am, our proxy should NOT forward 500 simultaneous requests to the school server. This is why the project plan mentions caching — in production, the proxy should store timetable/grade data locally and only refresh it periodically.

#### Consistent Response Envelope — Makes Error Handling Easy

Every JSON endpoint on the school server wraps its response in the same structure:

```json
{
  "ResultType": 0,
  "Message": "",
  "Data": { ... }
}
```

`ResultType: 0` = success, anything else = error. This means we can write one consistent pattern for checking responses across all endpoints. If different endpoints used different error formats, our code would be much messier.

### Summary

| School Server Trait | Effect on Us | How We Deal With It |
|---|---|---|
| **No CORS headers** | Browser can't talk to school directly | Proxy all requests through our server |
| **Cookie-based auth** | Browser can't hold school session | Proxy stores cookies, issues its own tokens |
| **HTTP (no HTTPS)** | Connection is unencrypted, but easy to connect to | Just works; security concern for production |
| **Broken TLS cert** | Would block HTTPS connections | Moot since we use HTTP; would need workaround otherwise |
| **jQuery AJAX → JSON** | Gives us a free, clean API to call | Call XHR endpoints directly, skip HTML pages |
| **POST for everything** | Unconventional but harmless | Proxy just forwards as POST |
| **No rate limiting** | Easy development, but risky at scale | Must add caching before real deployment |
| **Consistent JSON envelope** | Easy, uniform error handling | One pattern works for all endpoints |

---

## 3. Project Structure

```
mvp/
├── package.json    ← Declares dependencies (like a shopping list for libraries)
├── server.js       ← The proxy server (Node.js backend, ~290 lines)
├── index.html      ← The UI that runs in your browser (~240 lines)
└── node_modules/   ← Downloaded libraries (created by `npm install`, don't touch)
```

That's it. Two files that matter.

---

## 4. How to Run It

**Prerequisites:** Node.js installed (you have v24.13.0).

```bash
cd mvp
npm install   # Downloads the "express" library into node_modules/
npm start     # Runs server.js
```

Then open `http://localhost:3000` in your browser.

**What `npm start` does:** It runs `node server.js`, which starts a web server on your computer listening on port 3000. As long as this terminal is open, the server is running. Press `Ctrl+C` to stop it.

---

## 5. How Does `server.js` Actually Execute?

JavaScript executes line by line, top to bottom. But when you see code like this:

```js
app.get("/api/grades", auth, async (req, res) => {
  // ...
});
```

...it looks like a function is being *called*. But the code inside `{ ... }` doesn't run at that moment. This is the single most important concept to understand about how Express (and backend JS in general) works.

### 5.1 Two Phases: Setup and Listening

When you run `node server.js`, the file executes top-to-bottom in **two phases**:

**Phase 1: Setup (runs immediately, line by line)**
```js
// Line 1-4: Import libraries               ← runs immediately
// Line 8:   const app = express()           ← runs immediately (creates the server)
// Line 9:   const PORT = 3000              ← runs immediately
// Line 12:  const sessions = new Map()     ← runs immediately
// Line 15-32: function extractInput(...)    ← DEFINES a function (doesn't run it)
// Line 35-92: async function schoolLogin()  ← DEFINES a function (doesn't run it)
// ...
// Line 139: app.get("/", ...)              ← REGISTERS a handler (doesn't run the handler)
// Line 154: app.post("/api/login", ...)    ← REGISTERS a handler (doesn't run the handler)
// Line 188: app.get("/api/timetable", ...) ← REGISTERS a handler (doesn't run the handler)
// Line 231: app.get("/api/grades", ...)    ← REGISTERS a handler (doesn't run the handler)
// ...
// Line 286: app.listen(PORT, ...)          ← STARTS the server (enters Phase 2)
```

Everything from line 1 to 286 runs once, in order, very fast (milliseconds). At the end, `app.listen()` starts the server and Phase 2 begins.

**Phase 2: Listening (runs forever, responds to incoming requests)**
```
Server is now waiting on port 3000...

  Nothing happens until someone makes a request.

  → Browser sends GET /api/timetable
    → Express finds the handler registered for "GET /api/timetable"
    → NOW the async function inside that handler runs

  → Browser sends POST /api/login
    → Express finds the handler registered for "POST /api/login"
    → NOW the async function inside that handler runs

  → Server keeps waiting for more requests...
```

Phase 2 runs indefinitely (until you press `Ctrl+C`). The server just sits there, waiting. Every time a request comes in, Express looks up which handler was registered for that URL pattern and runs it.

### 5.2 What `app.get(...)` Really Does — Registration, Not Execution

Let's break down this line:

```js
app.get("/api/grades", auth, async (req, res) => {
  const yearId = req.query.yearId || "31";
  // ... fetch grades from school ...
  res.json(data);
});
```

This is **not** calling the function. It's telling Express:

> "Hey Express, when someone sends a GET request to the URL `/api/grades`, here's what I want you to do: first run `auth`, then run this `async` function."

Think of it like filling out a form:

| When... | Do this first... | Then do this... |
|---|---|---|
| `GET /api/grades` | `auth` | `async (req, res) => { ... }` |
| `GET /api/timetable` | `auth` | `async (req, res) => { ... }` |
| `POST /api/login` | *(nothing)* | `async (req, res) => { ... }` |
| `POST /api/logout` | *(nothing)* | `(req, res) => { ... }` |

Express builds an internal table like this during Phase 1. During Phase 2, when a request comes in, it looks up the matching row and runs those functions.

**A real-world analogy:** Imagine setting up a restaurant. During setup (Phase 1), you hand the waiter a menu:
- "If someone orders pizza, go to the kitchen and do X"
- "If someone orders salad, go to the kitchen and do Y"

The waiter doesn't start cooking anything yet. They just memorize the menu. When a customer actually walks in and orders (Phase 2), *then* the waiter goes to the kitchen.

`app.get(...)` = writing a menu item. The customer hasn't ordered yet.

### 5.3 Callbacks — Functions You Define Now, That Run Later

The `async (req, res) => { ... }` part is called a **callback function**. The idea is:

1. You **define** a function
2. You **hand it to someone else** (Express, in this case)
3. That someone else **calls it later**, when the right event happens

This pattern appears everywhere in JavaScript:

```js
// Browser: "when the button is clicked, run this function"
button.onclick = function() { alert("clicked!"); };

// Express: "when GET /api/grades is requested, run this function"
app.get("/api/grades", async (req, res) => { /* ... */ });

// Timer: "after 5 seconds, run this function"
setTimeout(function() { console.log("5 seconds passed"); }, 5000);
```

In all three cases, you're not running the function — you're giving it to something else that will run it at the right time.

The `=>` syntax is called an **arrow function**. It's just a shorter way to write `function(req, res) { ... }`. These two are (nearly) identical:

```js
// Traditional function
app.get("/api/grades", auth, async function(req, res) {
  // ...
});

// Arrow function (same thing, shorter)
app.get("/api/grades", auth, async (req, res) => {
  // ...
});
```

### 5.4 Middleware — Functions That Run Before Your Handler

Look at this route:

```js
app.get("/api/grades", auth, async (req, res) => { ... });
//                      ^^^^
//                      This is middleware
```

There are **two** functions being registered here, not one:
1. `auth` — runs first
2. `async (req, res) => { ... }` — runs second (only if `auth` says "proceed")

Middleware is a function that can:
- **Inspect** the request (is the user logged in?)
- **Modify** the request (attach session data)
- **Block** the request (return a 401 error)
- **Pass control** to the next function (by calling `next()`)

Here's the `auth` middleware:

```js
function auth(req, res, next) {
  const token = req.headers["x-token"];        // Read the token from the request
  if (!token || !sessions.has(token)) {        // Is it valid?
    return res.status(401).json({ error: "Not authenticated" });  // NO → block
  }
  req.session = sessions.get(token);           // YES → attach session data
  next();                                       // Pass control to the next function
}
```

The execution flow:

```
Request: GET /api/grades (X-Token: f7a3b1c9...)
  │
  ├─> auth(req, res, next) runs
  │   ├─ Token valid? YES
  │   ├─ Attach session to req
  │   └─ Call next()
  │         │
  │         ▼
  │   async (req, res) => { ... } runs    ← the actual handler
  │   └─ req.session is available because auth put it there
  │
  └─> Response sent back to browser

Request: GET /api/grades (no token)
  │
  ├─> auth(req, res, next) runs
  │   ├─ Token valid? NO
  │   └─ Return 401 error              ← handler NEVER runs
  │
  └─> 401 response sent back to browser
```

Notice that `auth` has three parameters (`req, res, next`) while the final handler has two (`req, res`). The `next` parameter is how middleware passes control to the next function in the chain. If middleware doesn't call `next()`, the chain stops — the actual handler never executes.

Compare the login route, which has NO middleware:

```js
app.post("/api/login", async (req, res) => { ... });
//                     ^ only one function — no auth check needed
//                       (you can't require login to... log in)
```

### 5.5 `async (req, res) =>` — What Are These Arguments?

When Express calls your handler, it passes in two objects:

**`req` (request)** — Everything about the incoming HTTP request:
```js
req.body          // POST body data, e.g. { code: "s20248319", password: "***" }
req.query         // URL query params, e.g. for /api/grades?yearId=31 → { yearId: "31" }
req.headers       // HTTP headers, e.g. { "x-token": "f7a3b1c9..." }
req.session       // (added by our auth middleware) the session data from the Map
```

**`res` (response)** — Tools to send a response back:
```js
res.json({ ok: true })       // Send JSON data (automatically sets Content-Type header)
res.status(401)               // Set the HTTP status code (401 = Unauthorized)
res.sendFile("index.html")   // Send a file
res.type("html").send(text)  // Send raw HTML
```

You don't create these objects yourself — Express creates them for each incoming request and passes them to your handler. Your job is to read from `req` and write to `res`.

**A complete example, annotated:**

```js
app.get("/api/grades", auth, async (req, res) => {
//│       │              │     │      │    │
//│       │              │     │      │    └─ response object (you write to this)
//│       │              │     │      └─ request object (you read from this)
//│       │              │     └─ "async" because we use "await" inside (network requests)
//│       │              └─ middleware: check login first
//│       └─ URL pattern to match
//└─ HTTP method (GET, POST, etc.)

  const yearId = req.query.yearId || "31";    // Read ?yearId=XX from the URL
  // ... fetch from school server ...
  res.json(data);                              // Send the response
});
```

---

## 6. What is `server.js`? (Code Walkthrough)

This file is a **Node.js application** — JavaScript that runs on your computer (not in a browser). It uses a library called **Express** to create a web server that can receive HTTP requests and send responses.

### 6.1 Imports and Setup

```js
import express from "express";       // The web server library
import { fileURLToPath } from "url"; // Helpers to figure out file paths
import { dirname, join } from "path";
import crypto from "crypto";          // For generating random tokens

const app = express();                // Create the web server
const PORT = 3000;                    // Which port to listen on
const SCHOOL = "http://101.227.232.33:8001";  // The school server address
```

**What's `express`?**
Think of Express as a receptionist. It listens for incoming requests (like "GET me the timetable") and routes them to the right handler function. Without Express, you'd have to write hundreds of lines of low-level networking code.

**What's a port?**
Your computer can run many servers at once. Each one needs a unique port number (like an apartment number in a building). Port 3000 means you access it at `http://localhost:3000`.

### 6.2 The Session Store

```js
const sessions = new Map();
```

This is a `Map` — think of it as a dictionary/lookup table:

```
{
  "a1b2c3d4..." → {
    cookies: ".AspNetCore.Session=abc; tsi=xyz",   // School server cookies
    studentId: "1152",                              // Internal student ID
    profile: { userName: "王思成", nickName: "Gavin", ... },
    credentials: { code: "s20248319", password: "***" }
  }
}
```

When a student logs in, we generate a random token (the key, like `"a1b2c3d4..."`), and store all their school session data as the value. The browser only ever sees the token — never the school cookies or password.

**"In-memory"** means this data lives in your computer's RAM. If you restart the server (`Ctrl+C` then `npm start`), it's gone — everyone has to log in again. A production app would use a database instead.

### 6.3 Helper Functions

#### `extractInput(html, name)`
The school server doesn't have a clean "get user profile" API. Instead, it renders an HTML page with the student's info embedded in `<input>` tags. This function uses **regex** (pattern matching) to dig out values like studentId, name, etc. from raw HTML.

Example: given this HTML:
```html
<input type="hidden" name="id" value="1152" />
```
Calling `extractInput(html, "id")` returns `"1152"`.

#### `schoolLogin(code, password)`
This is the most important function. It does three things:

1. **Sends the student's credentials to the school server** (`POST /Home/Login`)
2. **Captures the cookies** the school server sends back (these are the proof that login succeeded)
3. **Scrapes the student profile page** to get studentId, name, grade, etc.

```
schoolLogin("s20248319", "mypassword")
  → sends POST to school server
  ← school server responds with cookies
  → fetches /Home/UserInfo using those cookies
  ← school server responds with HTML containing student info
  → parses out studentId, name, etc.
  ← returns { cookies, studentId: "1152", profile: { ... } }
```

The `async` keyword means this function does things that take time (network requests). JavaScript uses `await` to pause and wait for each network request to finish before moving on.

#### `isSessionDead(res)`
Checks if the school server's response means "you're not logged in anymore." This happens in two ways:
- **302 redirect** — the server says "go to the login page"
- **HTML response** — the server returns a login page instead of JSON data

#### `schoolFetch(session, url, options)`
A wrapper around `fetch()` (the built-in way to make HTTP requests in Node.js). It:

1. Makes the request to the school server, attaching the stored cookies
2. If the school says "session expired" → **automatically re-logs in** using the stored credentials
3. Retries the original request with fresh cookies

This is why students don't have to keep logging in — even if the school session dies, the proxy silently refreshes it.

### 6.4 Routes (API Endpoints)

A **route** is a URL pattern that the server responds to. Think of it like a menu at a restaurant — each route is a dish you can order.

#### `GET /` → Serve the webpage
```js
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});
```
When you visit `http://localhost:3000/` in your browser, this sends back the `index.html` file.

#### `auth` middleware
```js
function auth(req, res, next) {
  const token = req.headers["x-token"];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.session = sessions.get(token);
  next();
}
```
**Middleware** is code that runs *before* the actual route handler. This one checks: "Did the browser send a valid token in the `X-Token` header?" If not → reject with 401 (Unauthorized). If yes → attach the session data to the request and proceed.

Routes that use `auth` (like `/api/timetable`) require a logged-in user. Routes that don't (like `/api/login`) are public.

#### `POST /api/login`
1. Receives `{ code, password }` from the browser
2. Calls `schoolLogin()` to authenticate with the school
3. Generates a random 32-character hex token (e.g. `"f7a3b1c9..."`)
4. Stores the session (cookies + profile + credentials) in the `sessions` Map
5. Returns the token and profile to the browser

#### `GET /api/timetable`
1. `auth` middleware checks the token
2. Uses the stored `studentId` and defaults to `yearId=31` (current semester)
3. Calls `schoolFetch()` which sends a POST to the school server's timetable endpoint
4. If the school returns JSON → forwards it to the browser
5. If the school returns garbage → returns a clean error message

#### `GET /api/grades?yearId=31`
Same pattern as timetable, but hits the school's grades endpoint. The `yearId` parameter selects which semester's grades to fetch.

#### `GET /api/debug/page?path=/Home/UserInfo`
A developer tool — fetches any page from the school server and returns the raw HTML. Useful for discovering new API endpoints.

#### `POST /api/logout`
Deletes the session from the Map. The token becomes invalid.

---

## 7. What is `index.html`?

This is a single HTML file that contains both the page structure AND the JavaScript that makes it interactive. No frameworks, no build tools — just plain HTML and JS.

### 7.1 The HTML Structure

The page has two sections that toggle visibility:

```
┌──────────────────────────────────┐
│  #login-section                  │  ← Visible when logged out
│  ┌────────────────────────────┐  │
│  │ Student code: [__________] │  │
│  │ Password:     [__________] │  │
│  │ [Login]                    │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  #main-section (hidden)          │  ← Visible when logged in
│                                  │
│  Hi, Gavin (王思成)              │
│  ─────────────────────           │
│  Timetable                       │
│  [Fetch Timetable]               │
│  ─────────────────────           │
│  Grades                          │
│  [▼ 2025-2026 Term 2 (Current)] │  ← Semester dropdown
│  ─────────────────────           │
│  Debug                           │
│  [Fetch page: /___________]      │
│  ─────────────────────           │
│  [Logout]                        │
└──────────────────────────────────┘
```

### 7.2 The JavaScript

#### Session Persistence (localStorage)
```js
let token = localStorage.getItem("neo_token");
let studentId = localStorage.getItem("neo_sid");
let profile = JSON.parse(localStorage.getItem("neo_profile") || "null");
```

`localStorage` is a browser feature that stores small pieces of text that survive page refreshes and browser restarts. We store three things:
- `neo_token` — our proxy's session token
- `neo_sid` — the student's internal ID
- `neo_profile` — the student's name, grade, etc. (as a JSON string)

When the page loads, it checks: "Is there a token in localStorage?" If yes → skip the login screen and show the main section.

#### `login()`
1. Reads the code and password from the input fields
2. Sends them to our proxy's `/api/login` endpoint as JSON
3. If successful → saves the token/profile to `localStorage` and switches to the main section

**Key line:**
```js
const res = await fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, password }),
});
```
This is the browser's `fetch()` API — it sends an HTTP request to our proxy. Note it goes to `/api/login` (our proxy), NOT to the school server.

#### `fetchTimetable()`
1. Sends `GET /api/timetable` to our proxy, with the token in the `X-Token` header
2. Gets back JSON with timetable data
3. Builds an HTML `<table>` with periods as rows and days (Mon–Fri) as columns
4. Inserts the table into the page

#### `fetchGrades()`
1. Reads the selected semester from the `<select>` dropdown
2. Sends `GET /api/grades?yearId=31` (or whichever semester) to our proxy
3. Builds a table with columns: Subject, A1, A2, A3, A4, HW, Final
4. Each cell shows the raw percentage and the IB grade in parentheses, e.g. `82 (7)`

The dropdown has `onchange="fetchGrades()"` — meaning grades auto-refresh whenever you pick a different semester.

#### `logout()`
1. Tells the proxy to delete the session (`POST /api/logout`)
2. Clears `localStorage`
3. Switches back to the login screen

---

## 8. The Full Login → Timetable Flow (Step by Step)

Here's everything that happens when a student logs in and views their timetable:

```
BROWSER                         PROXY (server.js)                    SCHOOL SERVER
───────                         ─────────────────                    ─────────────
1. Student types code/password
   and clicks "Login"
       │
       ├─── POST /api/login ──────>
       │    { code, password }     │
       │                           ├─── POST /Home/Login ──────────>
       │                           │    code=s20248319&password=***  │
       │                           │                                 │
       │                           │<── 200 OK ─────────────────────┤
       │                           │    Set-Cookie: .AspNetCore...   │
       │                           │    { ResultType: 0 }            │
       │                           │                                 │
       │                           ├─── GET /Home/UserInfo ────────>
       │                           │    Cookie: .AspNetCore...; tsi= │
       │                           │                                 │
       │                           │<── 200 OK (HTML page) ─────────┤
       │                           │    <input name="id" value="1152">
       │                           │                                 │
       │                           │ (extracts studentId, name, etc.)
       │                           │ (generates token "f7a3b1c9...")
       │                           │ (stores session in Map)
       │                           │
       │<── 200 OK ────────────────┤
       │    { ok: true,            │
       │      token: "f7a3b1c9..", │
       │      studentId: "1152",   │
       │      profile: { ... } }   │
       │                           │
2. Browser saves token to
   localStorage, shows main UI
       │
3. Student clicks "Fetch Timetable"
       │
       ├─── GET /api/timetable ──>
       │    X-Token: f7a3b1c9..    │
       │                           │ (auth middleware checks token ✓)
       │                           │
       │                           ├─── POST GetTimetableByStudent ─>
       │                           │    Cookie: .AspNetCore...; tsi= │
       │                           │    yearId=31&studentId=1152     │
       │                           │                                 │
       │                           │<── 200 OK (JSON) ──────────────┤
       │                           │    { ResultType: 0,             │
       │                           │      Data: { TimetableList...}} │
       │                           │
       │<── 200 OK ────────────────┤
       │    (same JSON forwarded)  │
       │
4. Browser renders the timetable
   as an HTML table
```

---

## 9. How Sessions and Tokens Work

There are **two layers** of sessions:

### Layer 1: School Server Sessions (cookies)
The school server uses cookies to track who's logged in. After login, it sends back:
- `.AspNetCore.Session` — a session ID (expires when browser closes)
- `tsi` — a "remember me" token (~30 days)

Our proxy captures and stores these. The browser never sees them.

### Layer 2: Our Proxy Tokens
Our proxy generates its own random tokens and gives them to the browser. The browser stores the token in `localStorage` and sends it in the `X-Token` header on every request.

**Why two layers?**
- The browser can't use the school's cookies (different domain, CORS, etc.)
- Our tokens are simpler and under our control
- We can refresh the school cookies behind the scenes without the student knowing

```
Browser ──(our token)──> Proxy ──(school cookies)──> School Server

"f7a3b1c9..."            ".AspNetCore.Session=abc;
                          tsi=xyz"
```

### Token Lifecycle

```
Login
  └─> Token created, saved to localStorage
        │
        ├─> Page refresh? Token still in localStorage, session still in proxy memory ✓
        │
        ├─> School cookies expire? Proxy re-auths automatically ✓
        │
        ├─> Proxy restarts? Session gone from memory, token becomes invalid ✗
        │   └─> Student sees 401 error, needs to log in again
        │
        └─> Logout? Token deleted from both localStorage and proxy memory ✓
```

---

## 10. What Happens When the School Session Expires

This is handled by `schoolFetch()` and `isSessionDead()`:

```
1. Proxy sends request to school with stored cookies
2. School responds with 302 redirect or HTML login page
   (meaning: "I don't know who you are")
3. isSessionDead() detects this
4. schoolFetch() calls schoolLogin() with stored credentials
5. Gets fresh cookies
6. Retries the original request
7. Returns the data to the browser as if nothing happened
```

The student never sees this — it's completely invisible. From their perspective, the timetable just loads normally, maybe with a tiny extra delay.

**When does this fail?**
- If the student changed their school password → re-auth fails → 401 error → they need to log in again through our app
- If the school server is completely down → 500 error

---

## 11. Key Concepts Glossary

| Term | Plain English |
|------|--------------|
| **Callback** | A function you hand to someone else to run later, when a specific event happens. The core pattern behind `app.get(...)`, `onclick`, `setTimeout`, etc. |
| **Express** | A Node.js library that makes it easy to create a web server that responds to HTTP requests |
| **Middleware** | A function that runs before the main route handler. Can inspect, modify, or block requests. Has three params: `(req, res, next)` |
| **Route** | A URL pattern that the server handles, like `GET /api/timetable` |
| **Middleware** | A function that runs before the route handler (e.g., checking if the user is logged in) |
| **fetch()** | A built-in function (in both browsers and Node.js) for making HTTP requests |
| **async/await** | JavaScript syntax for handling operations that take time (like network requests). `await` pauses until the operation finishes |
| **Cookie** | A small piece of data that a server asks the browser to store and send back with every request. Used for login sessions |
| **Token** | A random string that acts as a "password" for an already-authenticated session. Harder to steal than actual credentials |
| **localStorage** | Browser storage that persists across page refreshes and browser restarts |
| **Map** | A JavaScript data structure like a dictionary: you look up values by keys |
| **JSON** | A text format for structured data, like `{ "name": "Gavin", "age": 17 }` |
| **302 redirect** | An HTTP response that says "the thing you want is at a different URL" — the school server uses this to send you to the login page when your session expires |
| **CORS** | A browser security policy that prevents web pages from making requests to different domains. Only browsers enforce this, not servers |
| **Proxy** | A server that makes requests on behalf of another client. Our server is a proxy between the browser and the school server |
| **Port** | A number that identifies a specific service on a computer. Like apartment numbers in a building. Port 3000 = our app, port 8001 = school server |
| **Regex** | A pattern-matching language for finding text within strings. Used here to extract data from HTML |
| **npm** | Node Package Manager — downloads and manages JavaScript libraries. `npm install` downloads what's listed in `package.json` |

[← Back to Home](../README.md)