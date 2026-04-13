# Neo-Enspire — 工作原理

---

## 目录

1. [概述](#1-概述)
2. [为什么需要代理？学校服务器的设计迫使我们这么做](#2-为什么需要代理学校服务器的设计迫使我们这么做)
3. [项目结构](#3-项目结构)
4. [如何运行](#4-如何运行)
5. [server.js 是如何执行的？](#5-serverjs-是如何执行的)
   - 5.1 [两个阶段：设置和监听](#51-两个阶段设置和监听)
   - 5.2 [app.get(...) 实际做什么 — 注册而非执行](#52-appget-实际做什么-注册而非执行)
   - 5.3 [回调函数 — 现在定义，以后运行](#53-回调函数-现在定义以后运行)
   - 5.4 [中间件 — 在处理器之前运行的函数](#54-中间件-在处理器之前运行的函数)
   - 5.5 [async (req, res) => — 这些参数是什么？](#55-async-req-res-这些参数是什么)
6. [server.js 是什么？（代码详解）](#6-serverjs-是什么代码详解)
   - 6.1 [导入和设置](#61-导入和设置)
   - 6.2 [会话存储](#62-会话存储)
   - 6.3 [辅助函数](#63-辅助函数)
   - 6.4 [路由（API 端点）](#64-路由api-端点)
7. [index.html 是什么？](#7-indexhtml-是什么)
   - 7.1 [HTML 结构](#71-html-结构)
   - 7.2 [JavaScript](#72-javascript)
8. [完整的登录 → 课表流程（逐步说明）](#8-完整的登录--课表流程逐步说明)
9. [会话和令牌如何工作](#9-会话和令牌如何工作)
10. [当学校会话过期时会发生什么](#10-当学校会话过期时会发生什么)
11. [关键概念 Glossary](#11-关键概念-glossary)

---

## 1. 概述

学校的网站（`101.227.232.33:8001`）最初是为桌面浏览器设计的。我们想构建一个移动端友好的应用。但我们不能直接从手机调用学校服务器 —— 存在技术障碍（见第 2 节）。所以我们构建了一个**代理服务器**，它位于中间：

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   浏览器     │ ──────> │   我们的代理      │ ──────> │  学校服务器       │
│ (index.html)│ <────── │   (server.js)    │ <────── │ 101.227.232.33   │
└─────────────┘         └──────────────────┘         └──────────────────┘
   localhost:3000          localhost:3000               Port 8001
   你看到的                在你的 Mac 上运行              真实数据
```

**简单来说：**
- 浏览器（你）通过 `localhost:3000` 与我们的代理通信
- 我们的代理代表你向学校服务器发送请求
- 学校服务器以为只是一个正常访问它的浏览器

---

## 2. 为什么需要代理？学校服务器的设计迫使我们这么做

学校服务器从未被设计为供第三方应用使用。它的架构造成了一些障碍 —— 但也给了我们一些幸运的便利。理解这些是理解这个项目结构的关键。

### 障碍：迫使我们使用代理的事情

#### 无 CORS 头文件 — 代理存在的首要原因

**什么是 CORS？**
当一个网页从一个域名加载（比如 `localhost:3000`），尝试向一个*不同的*域名（比如 `101.227.232.33:8001`）发送 HTTP 请求时，浏览器会检查："目标服务器是否明确表示允许？" 它通过查看服务器响应中的特殊头信息来做这个判断，比如 `Access-Control-Allow-Origin: *`。

**学校服务器的做法：**
学校的登录页面有一个 `<meta>` 标签，看起来像是允许跨域请求：
```html
<meta http-equiv="Access-Control-Allow-Origin" content="*">
```
但这**完全没用**。CORS 是通过实际的 HTTP *响应头* 来强制执行的，而不是 HTML meta 标签。学校服务器没有发送真正的 CORS 头。这意味着：

```
浏览器 (localhost:3000) ──GET timetable──> 学校服务器 (101.227.232.33)
                                            │
浏览器: "嘿学校，我能             │
         从不同的域名调用你吗？"    │
                                            │
学校: (没有发送 CORS 头)          │
                                            │
浏览器: "没有 CORS 头？被阻止。"
         ❌ 请求被浏览器拒绝
```

**我们的代理如何解决这个问题：**
CORS 是*仅限浏览器*的规则。服务器到服务器的请求没有这个限制。所以：

```
浏览器 ──> 我们的代理（同域名，无 CORS 问题！）
            │
            └──> 学校服务器（服务器间通信，无 CORS！）
```

浏览器与 `localhost:3000` 上的我们的代理通信，这是与网页相同的源 —— 没有 CORS 问题。然后我们的代理（一个 Node.js 进程，不是浏览器）与学校服务器通信 —— 也没有 CORS 问题，因为 CORS 在浏览器之外根本不存在。

**如果学校服务器有正确的 CORS 头**，从技术上我们可能不需要代理（仅就这个原因而言）。浏览器可以直接与学校服务器通信。但下面的其他障碍仍然存在。

#### 基于 Cookie 的会话 — 为什么浏览器不能直接"登录"

**Cookie 通常如何工作：**
当你登录一个网站时，服务器会发回 Cookie。你的浏览器存储它们，并在每次向同一域名的请求中自动发送回去。这就是服务器知道你仍然登录的方式。

**问题：**
学校服务器的 Cookie（`.AspNetCore.Session` 和 `tsi`）绑定到域名 `101.227.232.33`。一个在 `localhost:3000` 上运行的页面无法读取、存储或发送属于 `101.227.232.33` 的 Cookie。这是浏览器安全的基本规则，称为**同源策略** —— 与 CORS 完全分开。

即使 CORS 被修复，浏览器可以向学校服务器发送请求，但这些请求将**没有 Cookie** —— 意味着学校服务器会将每个请求视为"未登录"。

**我们的代理如何解决这个问题：**
我们的代理登录学校服务器并在服务器端捕获 Cookie。它将它们存储在内存中，与学生的代理令牌绑定。当浏览器请求课表时，代理会在学生的请求上附加学校 Cookie：

```
浏览器发送:                  代理添加 Cookie 并转发:
GET /api/timetable           POST school:8001/GetTimetableByStudent
X-Token: f7a3b1c9...  →     Cookie: .AspNetCore.Session=abc; tsi=xyz
(没有学校 Cookie)             (由代理附加的学校 Cookie)
```

这就是为什么我们必须发明自己的令牌系统。浏览器无法使用学校的 Cookie，所以我们给它一个不同的令牌，映射到我们代理中存储的学校 Cookie。

#### 纯 HTTP，无 HTTPS — 一个安全问题（不是我们能解决的）

学校服务器运行在 `http://`（端口 8001），而不是 `https://`。API 文档指出有 TLS 证书，但主机名不匹配，使其无效。这意味着：

- 我们代理和学校服务器之间的所有数据传输**未加密** —— 学生姓名、成绩，甚至登录密码对网络路径上的任何人都可见
- 如果学校*确实*强制使用 HTTPS 及其损坏的证书，我们的代理将无法连接（Node.js 默认拒绝无效证书）。我们需要要么禁用证书检查（糟糕的做法），要么要求学校 IT 修复它

对于我们的 MVP，纯 HTTP 实际上使连接更简单 —— `fetch("http://...")` 就可以工作，没有证书问题。但这是一个**安全问题**，不是特性。在生产中，你希望代理 ↔ 学校连接在可信网络上，而学生 ↔ 代理连接应该使用 HTTPS。

### 幸运的便利：帮助我们构建的东西

#### jQuery AJAX 的 JSON 响应 — 最大的幸运

这是对我们最有帮助的单一最重要的事情。

学校系统是一个服务器渲染的 ASP.NET MVC 应用 —— 它在服务器上生成完整的 HTML 页面并发送给浏览器。如果它只是*全部*这样做，构建这个项目将**非常痛苦**。我们需要：

1. 为每个数据片段获取完整的 HTML 页面
2. 解析数百行 HTML/CSS/JS 来找到实际数据
3. 每次学校更改页面布局时都会崩溃

但学校系统也使用 **jQuery AJAX (XHR) 调用**。这就是它的含义：

当你在浏览器中访问课表页面时，学校服务器会发送一个带有空表格的 HTML 页面。然后，该页面上的 JavaScript 会触发一个单独的 HTTP 请求，以**纯 JSON** 的形式获取实际的课表数据：

```
步骤 1: 浏览器加载页面
  GET /Stu/Timetable/Index → 完整 HTML 页面（布局、菜单、空表格）

步骤 2: 页面上的 JavaScript 获取数据
  POST /Stu/Timetable/GetTimetableByStudent → 纯 JSON 数据:
  {
    "ResultType": 0,
    "Data": {
      "TimetableList": [ ... 实际课程数据 ... ]
    }
  }
```

我们完全跳过步骤 1，直接进入步骤 2。学校本质上有一个**隐藏的 JSON API**，原本只是为它自己的 jQuery 前端准备的 —— 但我们也可以调用它。我们的代理调用相同的 XHR 端点并获得干净的、结构化的数据返回。

**如果学校不使用 jQuery AJAX**，我们的代理中的每个路由处理程序看起来都会像这个噩梦：

```js
// 假设：没有 JSON API，改用抓取 HTML
app.get("/api/timetable", auth, async (req, res) => {
  const html = await fetchSchoolPage("/Stu/Timetable/Index");
  // 在 500 行 HTML 中找到表格...
  // 解析每个 <tr> 和 <td>...
  // 希望他们不会改变 CSS 类名...
  // 处理 HTML 中的奇怪边缘情况...
  // 😭
});
```

相反，我们实际的代码只是：调用端点，获取 JSON，转发它。~10 行代码。

#### 所有请求都用 POST — 奇怪但无害

学校服务器对每个请求都使用 `POST`，即使只是读取数据（如获取成绩）。在正确的 REST API 设计中，读取数据应该使用 `GET`，写入数据应该使用 `POST`。学校不遵循这个约定。

**对我们的影响：** 基本没有。我们的代理只是发送学校期望的 POST 请求。它有点奇怪，但没有造成任何真正的问题。我们向浏览器暴露更干净的端点（我们这边是 `GET /api/timetable`，转换成学校那边的 `POST /Stu/Timetable/GetTimetableByStudent`）。

#### 无速率限制 — 开发友好

学校服务器似乎没有限制你可以发出多少请求。这意味着在开发和测试期间，我们可以反复访问服务器而不会被阻止。

**这是一把双刃剑。** 这对我们来说很方便，但如果 500 名学生使用我们的应用并且都在早上 8 点检查课表，我们的代理*不应该*将 500 个并发请求转发到学校服务器。这就是项目计划提到缓存的原因 —— 在生产中，代理应该本地存储课表/成绩数据，只定期刷新它。

#### 一致的响应包装器 — 使错误处理更容易

学校服务器上的每个 JSON 端点都将其响应包装在相同的结构中：

```json
{
  "ResultType": 0,
  "Message": "",
  "Data": { ... }
}
```

`ResultType: 0` = 成功，其他 = 错误。这意味着我们可以为所有端点编写一个一致的响应检查模式。如果不同的端点使用不同的错误格式，我们的代码会更加混乱。

### 总结

| 学校服务器特性 | 对我们的影响 | 我们如何处理 |
|---|---|---|
| **无 CORS 头** | 浏览器无法直接与学校通信 | 通过我们的服务器代理所有请求 |
| **基于 Cookie 的认证** | 浏览器无法持有学校会话 | 代理存储 Cookie，颁发自己的令牌 |
| **HTTP（无 HTTPS）** | 连接未加密，但易于连接 | 正常工作；生产安全问题 |
| **损坏的 TLS 证书** | 会阻止 HTTPS 连接 | 因为我们使用 HTTP 所以无关；否则需要解决方法 |
| **jQuery AJAX → JSON** | 给我们一个免费的、干净的 API 可以调用 | 直接调用 XHR 端点，跳过 HTML 页面 |
| **所有请求用 POST** | 非传统但无害 | 代理只是转发为 POST |
| **无速率限制** | 开发容易，但规模上有风险 | 必须在真正部署前添加缓存 |
| **一致的 JSON 包装器** | 简单、统一的错误处理 | 一个模式适用于所有端点 |

---

## 3. 项目结构

```
mvp/
├── package.json    ← 声明依赖（就像库的购物清单）
├── server.js       ← 代理服务器（Node.js 后端，~290 行）
├── index.html      ← 在浏览器中运行的 UI（~240 行）
└── node_modules/   ← 下载的库（由 `npm install` 创建，不要碰）
```

只有两个文件重要。

---

## 4. 如何运行

**前置条件：** Node.js 已安装（你有 v24.13.0）。

```bash
cd mvp
npm install   # 将 "express" 库下载到 node_modules/
npm start     # 运行 server.js
```

然后在浏览器中打开 `http://localhost:3000`。

**npm start 做什么：** 它运行 `node server.js`，这会在你的电脑上启动一个监听端口 3000 的 Web 服务器。只要这个终端打开，服务器就在运行。按 `Ctrl+C` 停止它。

---

## 5. server.js 是如何执行的？

JavaScript 按行执行，从上到下。但当你看到这样的代码时：

```js
app.get("/api/grades", auth, async (req, res) => {
  // ...
});
```

……它看起来像一个函数正在*被调用*。但 `{ ... }` 内的代码在那一刻不会运行。这是理解 Express（以及后端 JS 一般）如何工作的最重要概念。

### 5.1 两个阶段：设置和监听

当你运行 `node server.js` 时，文件在**两个阶段**中按顺序执行：

**阶段 1：设置（立即运行，逐行）**
```js
// 第 1-4 行: 导入库               ← 立即运行
// 第 8 行:   const app = express()           ← 立即运行（创建服务器）
// 第 9 行:   const PORT = 3000              ← 立即运行
// 第 12 行:  const sessions = new Map()     ← 立即运行
// 第 15-32 行: function extractInput(...)    ← 定义一个函数（不运行它）
// 第 35-92 行: async function schoolLogin()  ← 定义一个函数（不运行它）
// ...
// 第 139 行: app.get("/", ...)              ← 注册一个处理器（不运行处理器）
// 第 154 行: app.post("/api/login", ...)    ← 注册一个处理器（不运行处理器）
// 第 188 行: app.get("/api/timetable", ...) ← 注册一个处理器（不运行处理器）
// 第 231 行: app.get("/api/grades", ...)   ← 注册一个处理器（不运行处理器）
// ...
// 第 286 行: app.listen(PORT, ...)          ← 启动服务器（进入阶段 2）
```

从第 1 行到第 286 行的一切都立即按顺序运行，非常快（毫秒级）。最后，`app.listen()` 启动服务器，阶段 2 开始。

**阶段 2：监听（永远运行，响应传入请求）**
```
服务器现在在端口 3000 上等待...

  什么都不会发生，直到有人发出请求。

  → 浏览器发送 GET /api/timetable
    → Express 找到为 "GET /api/timetable" 注册的处理器
    → 现在处理器内的 async 函数运行

  → 浏览器发送 POST /api/login
    → Express 找到为 "POST /api/login" 注册的处理器
    → 现在处理器内的 async 函数运行

  → 服务器继续等待更多请求...
```

阶段 2 无限期运行（直到你按 `Ctrl+C`）。服务器只是坐在那里等待。每次请求进来时，Express 查找为该 URL 模式注册的处理程序并运行它。

### 5.2 app.get(...) 实际做什么 — 注册而非执行

让我们分解这一行：

```js
app.get("/api/grades", auth, async (req, res) => {
  const yearId = req.query.yearId || "31";
  // ... 从学校获取成绩 ...
  res.json(data);
});
```

这**不是**调用函数。它是在告诉 Express：

> "嘿 Express，当有人发送 GET 请求到 URL `/api/grades` 时，我想让你做的是：首先运行 `auth`，然后运行这个 `async` 函数。"

想象一下填写表格：

| 当... | 先做这个... | 然后做这个... |
|---|---|---|
| `GET /api/grades` | `auth` | `async (req, res) => { ... }` |
| `GET /api/timetable` | `auth` | `async (req, res) => { ... }` |
| `POST /api/login` | *(无)* | `async (req, res) => { ... }` |
| `POST /api/logout` | *(无)* | `(req, res) => { ... }` |

Express 在阶段 1 期间构建了一个像这样的内部表。在阶段 2 中，当请求进来时，它查找匹配的行并运行这些函数。

**一个真实的类比：** 想象一下开一家餐厅。在设置阶段（阶段 1），你给服务员一张菜单：
- "如果有人点披萨，去厨房做 X"
- "如果有人点沙拉，去厨房做 Y"

服务员还没有开始做饭。他们只是记住菜单。当顾客真的走进来点餐时（阶段 2），*然后*服务员去厨房。

`app.get(...)` = 写一个菜单项。顾客还没有点餐。

### 5.3 回调函数 — 现在定义，以后运行

`async (req, res) => { ... }` 部分称为**回调函数**。这个想法是：

1. 你**定义**一个函数
2. 你把它**交给别人**（这里是 Express）
3. 那个别人**稍后调用它**，当正确的事件发生时

这个模式在 JavaScript 中无处不在：

```js
// 浏览器: "当按钮被点击时，运行这个函数"
button.onclick = function() { alert("clicked!"); };

// Express: "当 GET /api/grades 被请求时，运行这个函数"
app.get("/api/grades", auth, async (req, res) => { /* ... */ });

// 定时器: "5 秒后，运行这个函数"
setTimeout(function() { console.log("5 seconds passed"); }, 5000);
```

在这三种情况下，你都不是在运行函数 —— 你把它交给某个东西，它会在正确的时间运行它。

`=>` 语法称为**箭头函数**。它只是一种写 `function(req, res) { ... }` 的更短方式。这两个（几乎）相同：

```js
// 传统函数
app.get("/api/grades", auth, async function(req, res) {
  // ...
});

// 箭头函数（同样的东西，更短）
app.get("/api/grades", auth, async (req, res) => {
  // ...
});
```

### 5.4 中间件 — 在处理器之前运行的函数

看这个路由：

```js
app.get("/api/grades", auth, async (req, res) => { ... });
//                      ^^^^
//                      这是中间件
```

这里**注册了两个**函数，不是一个：
1. `auth` — 首先运行
2. `async (req, res) => { ... }` — 第二运行（只有当 `auth` 说"继续"时）

中间件是一个可以：
- **检查**请求（用户登录了吗？）
- **修改**请求（附加会话数据）
- **阻止**请求（返回 401 错误）
- **传递控制**给下一个函数（通过调用 `next()`）

这是 `auth` 中间件：

```js
function auth(req, res, next) {
  const token = req.headers["x-token"];        // 从请求中读取令牌
  if (!token || !sessions.has(token)) {      // 它有效吗？
    return res.status(401).json({ error: "Not authenticated" });  // 否 → 阻止
  }
  req.session = sessions.get(token);           // 是 → 附加会话数据
  next();                                       // 传递控制给下一个函数
}
```

执行流程：

```
请求: GET /api/grades (X-Token: f7a3b1c9...)
  │
  ├─> auth(req, res, next) 运行
  │   ├─ 令牌有效？ 是
  │   ├─ 附加会话到 req
  │   └─ 调用 next()
  │         │
  │         ▼
  │   async (req, res) => { ... } 运行    ← 实际处理器
  │   └─ req.session 可用，因为 auth 附加了它
  │
  └─> 响应发送回浏览器

请求: GET /api/grades (无令牌)
  │
  ├─> auth(req, res, next) 运行
  │   ├─ 令牌有效？ 否
  │   └─ 返回 401 错误              ← 处理器永远不会运行
  │
  └─> 401 响应发送回浏览器
```

注意 `auth` 有三个参数（`req, res, next`），而最终处理器有两个（`req, res`）。`next` 参数是中间件如何将控制传递给链中的下一个函数。如果中间件不调用 `next()`，链就会停止 —— 实际处理器永远不会执行。

比较登录路由，它没有中间件：

```js
app.post("/api/login", async (req, res) => { ... });
//                     ^ 只有一个函数 — 不需要认证检查
//                       （你不能要求先登录才能...登录）
```

### 5.5 async (req, res) => — 这些参数是什么？

当 Express 调用你的处理器时，它传入两个对象：

**`req`（请求）** — 关于传入 HTTP 请求的一切：
```js
req.body          // POST 主体数据，例如 { code: "s20248319", password: "***" }
req.query         // URL 查询参数，例如对于 /api/grades?yearId=31 → { yearId: "31" }
req.headers       // HTTP 头，例如 { "x-token": "f7a3b1c9..." }
req.session       // （由我们的 auth 中间件添加）来自 Map 的会话数据
```

**`res`（响应）** — 发送响应的工具：
```js
res.json({ ok: true })       // 发送 JSON 数据（自动设置 Content-Type 头）
res.status(401)              // 设置 HTTP 状态码（401 = 未授权）
res.sendFile("index.html")   // 发送一个文件
res.type("html").send(text)  // 发送原始 HTML
```

你不需要自己创建这些对象 —— Express 为每个传入请求创建它们并将它们传给你的处理器。你的工作是从 `req` 读取并写入 `res`。

**一个完整的例子，注释：**

```js
app.get("/api/grades", auth, async (req, res) => {
//│       │              │     │      │    │
//│       │              │     │      │    └─ 响应对象（你写入这个）
//│       │              │     │      └─ 请求对象（你读取这个）
//│       │              │     └─ "async" 因为我们在内部使用 "await"（网络请求）
//│       │              └─ 中间件：先检查登录
//│       └─ 要匹配的 URL 模式
//└─ HTTP 方法（GET、POST 等）

  const yearId = req.query.yearId || "31";    // 从 URL 读取 ?yearId=XX
  // ... 从学校服务器获取 ...
  res.json(data);                              // 发送响应
});
```

---

## 6. server.js 是什么？（代码详解）

这个文件是一个 **Node.js 应用** —— 在你的电脑上运行（不是在浏览器中）的 JavaScript。它使用一个名为 **Express** 的库来创建一个可以接收 HTTP 请求并发送响应的 Web 服务器。

### 6.1 导入和设置

```js
import express from "express";       // Web 服务器库
import { fileURLToPath } from "url"; // 辅助函数来确定文件路径
import { dirname, join } from "path";
import crypto from "crypto";          // 用于生成随机令牌

const app = express();                // 创建 Web 服务器
const PORT = 3000;                    // 监听哪个端口
const SCHOOL = "http://101.227.232.33:8001";  // 学校服务器地址
```

**`express` 是什么？**
把 Express 想象成一个接待员。它监听传入的请求（比如"GET 我的课表"）并将它们路由到正确的处理函数。没有 Express，你需要写数百行低级别的网络代码。

**什么是端口？**
你的电脑可以同时运行许多服务器。每一个都需要一个唯一的端口号（就像建筑物中的公寓号码）。端口 3000 意味着你通过 `http://localhost:3000` 访问它。

### 6.2 会话存储

```js
const sessions = new Map();
```

这是一个 `Map` —— 想象它是一个字典/查找表：

```
{
  "a1b2c3d4..." → {
    cookies: ".AspNetCore.Session=abc; tsi=xyz",   // 学校服务器 Cookie
    studentId: "1152",                              // 学生内部 ID
    profile: { userName: "王思成", nickName: "Gavin", ... },
    credentials: { code: "s20248319", password: "***" }
  }
}
```

当学生登录时，我们生成一个随机令牌（键，如 `"a1b2c3d4..."`），并将他们的所有学校会话数据存储为值。浏览器只看到令牌 —— 从不看到学校 Cookie 或密码。

**"内存中"** 意味着这些数据存在于你的电脑 RAM 中。如果你重启服务器（`Ctrl+C` 然后 `npm start`），它就消失了 —— 每个人都必须重新登录。生产应用会改用数据库。

### 6.3 辅助函数

#### `extractInput(html, name)`
学校服务器没有一个干净的"获取用户 profile"的 API。相反，它呈现一个包含学生信息的 HTML 页面，嵌入在 `<input>` 标签中。这个函数使用**正则表达式**（模式匹配）从原始 HTML 中挖掘出 studentId、姓名等值。

例如：给定这个 HTML：
```html
<input type="hidden" name="id" value="1152" />
```
调用 `extractInput(html, "id")` 返回 `"1152"`。

#### `schoolLogin(code, password)`
这是最重要的函数。它做三件事：

1. **将学生的凭证发送到学校服务器**（`POST /Home/Login`）
2. **捕获学校服务器发回的 Cookie**（这些是登录成功的证明）
3. **抓取学生 profile 页面**获取 studentId、姓名、年级等

```
schoolLogin("s20248319", "mypassword")
  → 发送 POST 到学校服务器
  ← 学校服务器响应带 Cookie
  → 使用这些 Cookie 获取 /Home/UserInfo
  ← 学校服务器响应包含学生信息的 HTML
  → 解析出 studentId、姓名等
  ← 返回 { cookies, studentId: "1152", profile: { ... } }
```

`async` 关键字意味着这个函数做一些需要时间的事情（网络请求）。JavaScript 使用 `await` 来暂停并等待每个网络请求完成，然后再继续。

#### `isSessionDead(res)`
检查学校服务器的响应是否意味着"你不再登录了"。这有两种方式发生：
- **302 重定向** —— 服务器说"去登录页面"
- **HTML 响应** —— 服务器返回一个登录页面而不是 JSON 数据

#### `schoolFetch(session, url, options)`
一个围绕 `fetch()` 的包装器（Node.js 中内置的发送 HTTP 请求的方式）。它：

1. 发送请求到学校服务器，附加存储的 Cookie
2. 如果学校说"会话过期" → **自动重新登录**使用存储的凭证
3. 使用新的 Cookie 重试原始请求

这就是为什么学生不需要不断登录 —— 即使学校会话死亡，代理也会在后台静默刷新它。

### 6.4 路由（API 端点）

**路由**是一个服务器响应的 URL 模式。想象它像餐厅的菜单 —— 每个路由是一道你可以点的菜。

#### `GET /` → 提供网页
```js
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});
```
当你在浏览器中访问 `http://localhost:3000/` 时，这会发回 `index.html` 文件。

#### `auth` 中间件
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
**中间件**是在实际路由处理器之前运行的代码。这个检查："浏览器在 `X-Token` 头中发送了有效的令牌吗？" 如果没有 → 用 401（未授权）拒绝。如果是 → 将会话数据附加到请求并继续。

使用 `auth` 的路由（如 `/api/timetable`）需要已登录的用户。不使用 `auth` 的路由（如 `/api/login`）是公开的。

#### `POST /api/login`
1. 从浏览器接收 `{ code, password }`
2. 调用 `schoolLogin()` 与学校进行身份验证
3. 生成一个随机的 32 字符十六进制令牌（如 `"f7a3b1c9..."`）
4. 将会话（Cookie + profile + 凭证）存储在 `sessions` Map 中
5. 将令牌和 profile 返回给浏览器

#### `GET /api/timetable`
1. `auth` 中间件检查令牌
2. 使用存储的 `studentId` 并默认 `yearId=31`（当前学期）
3. 调用 `schoolFetch()` 发送 POST 到学校服务器的课表端点
4. 如果学校返回 JSON → 转发给浏览器
5. 如果学校返回垃圾 → 返回干净的错误消息

#### `GET /api/grades?yearId=31`
与课表相同的模式，但访问学校的成绩端点。`yearId` 参数选择哪个学期的成绩来获取。

#### `GET /api/debug/page?path=/Home/UserInfo`
一个开发工具 —— 从学校服务器获取任何页面并返回原始 HTML。对于发现新的 API 端点很有用。

#### `POST /api/logout`
从 Map 中删除会话。令牌变为无效。

---

## 7. index.html 是什么？

这是一个包含页面结构和使页面具有交互性的 JavaScript 的单 HTML 文件。没有框架，没有构建工具 —— 只是普通的 HTML 和 JS。

### 7.1 HTML 结构

页面有两个部分可以切换可见性：

```
┌──────────────────────────────────┐
│  #login-section                  │  ← 未登录时可见
│  ┌────────────────────────────┐  │
│  │ 学号: [________________]   │  │
│  │ 密码:     [________________] │  │
│  │ [登录]                     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  #main-section (隐藏)            │  ← 登录后可见
│                                  │
│  你好，Gavin (王思成)              │
│  ─────────────────────           │
│  课表                            │
│  [获取课表]                     │
│  ─────────────────────           │
│  成绩                            │
│  [▼ 2025-2026 学期 2 (当前)]    │  ← 学期下拉菜单
│  ─────────────────────           │
│  调试                            │
│  [获取页面: /___________]        │
│  ─────────────────────           │
│  [退出登录]                      │
└──────────────────────────────────┘
```

### 7.2 JavaScript

#### 会话持久化（localStorage）
```js
let token = localStorage.getItem("neo_token");
let studentId = localStorage.getItem("neo_sid");
let profile = JSON.parse(localStorage.getItem("neo_profile") || "null");
```

`localStorage` 是一个浏览器功能，可以存储在页面刷新和浏览器重启后仍然存在的小段文本。我们存储三样东西：
- `neo_token` —— 我们代理的会话令牌
- `neo_sid` —— 学生的内部 ID
- `neo_profile` —— 学生的姓名、年级等（作为 JSON 字符串）

页面加载时，它检查："localStorage 中有令牌吗？" 如果有 → 跳过登录屏幕，显示主部分。

#### `login()`
1. 从输入字段读取学号和密码
2. 将它们作为 JSON 发送到我们代理的 `/api/login` 端点
3. 如果成功 → 将令牌/profile 保存到 `localStorage` 并切换到主部分

**关键行：**
```js
const res = await fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, password }),
});
```
这是浏览器的 `fetch()` API —— 它向我们代理发送 HTTP 请求。注意它发送到 `/api/login`（我们的代理），而不是学校服务器。

#### `fetchTimetable()`
1. 发送 `GET /api/timetable` 到我们代理，令牌在 `X-Token` 头中
2. 获取带课表数据的 JSON
3. 构建一个 HTML `<table>`，行是课时，周一到周五是列
4. 将表格插入页面

#### `fetchGrades()`
1. 从 `<select>` 下拉菜单中读取所选学期
2. 发送 `GET /api/grades?yearId=31`（或任何学期）到我们代理
3. 构建一个表格，列：科目、A1、A2、A3、A4、作业、期末
4. 每个单元格显示原始百分比和 IB 成绩在括号中，例如 `82 (7)`

下拉菜单有 `onchange="fetchGrades()"` —— 意味着当你选择不同的学期时，成绩会自动刷新。

#### `logout()`
1. 告诉代理删除会话（`POST /api/logout`）
2. 清除 `localStorage`
3. 切换回登录屏幕

---

## 8. 完整的登录 → 课表流程（逐步说明）

以下是学生登录并查看课表时发生的一切：

```
浏览器                         代理 (server.js)                    学校服务器
──────                         ─────────────────                    ─────────────
1. 学生输入学号/密码
   并点击"登录"
       │
       ├─── POST /api/login ──────>
       │    { code, password }     │
       │                           ├─── POST /Home/Login ──────────>
       │                           │    code=s20248319&password=***
       │                           │                                 │
       │                           │<── 200 OK ─────────────────────┤
       │                           │    Set-Cookie: .AspNetCore...   │
       │                           │    { ResultType: 0 }            │
       │                           │                                 │
       │                           ├─── GET /Home/UserInfo ───────>
       │                           │    Cookie: .AspNetCore...; tsi= │
       │                           │                                 │
       │                           │<── 200 OK (HTML 页面) ─────────┤
       │                           │    <input name="id" value="1152">
       │                           │                                 │
       │                           │ (解析出 studentId、姓名等)
       │                           │ (生成令牌 "f7a3b2...")
       │                           │ (将会话存储在 Map 中)
       │                           │
       │<── 200 OK ────────────────┤
       │    { ok: true,            │
       │      token: "f7a3b1c9..", │
       │      studentId: "1152",    │
       │      profile: { ... } }   │
       │                           │
2. 浏览器保存令牌到
   localStorage，显示主 UI
       │
3. 学生点击"获取课表"
       │
       ├─── GET /api/timetable ──>
       │    X-Token: f7a3b1c9..    │
       │                           │ (auth 中间件检查令牌 ✓)
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
       │    (转发的相同 JSON)      │
       │
4. 浏览器将课表
   渲染为 HTML 表格
```

---

## 9. 会话和令牌如何工作

有**两层**会话：

### 第 1 层：学校服务器会话（Cookie）
学校服务器使用 Cookie 来跟踪谁已登录。登录后，它发送回来：
- `.AspNetCore.Session` —— 一个会话 ID（浏览器关闭时过期）
- `tsi` —— 一个"记住我"令牌（~30 天）

我们的代理捕获并存储这些。浏览器永远看不到它们。

### 第 2 层：我们的代理令牌
我们的代理生成自己的随机令牌并交给浏览器。浏览器将令牌存储在 `localStorage` 中，并在每个请求中在 `X-Token` 头中发送它。

**为什么两层？**
- 浏览器无法使用学校的 Cookie（不同域名、CORS 等）
- 我们的令牌更简单且由我们控制
- 我们可以在学生不知情的情况下刷新学校 Cookie

```
浏览器 ──(我们的令牌)──> 代理 ──(学校 Cookie)──> 学校服务器

"f7a3b1c9..."            ".AspNetCore.Session=abc;
                           tsi=xyz"
```

### 令牌生命周期

```
登录
  └─> 令牌创建，保存到 localStorage
        │
        ├─> 页面刷新？令牌仍在 localStorage 中，会话仍在代理内存中 ✓
        │
        ├─> 学校 Cookie 过期？代理自动重新认证 ✓
        │
        ├─> 代理重启？会话从内存中消失，令牌变得无效 ✗
        │   └─> 学生看到 401 错误，需要重新登录
        │
        └─> 退出登录？令牌从 localStorage 和代理内存中都删除 ✓
```

---

## 10. 当学校会话过期时会发生什么

这由 `schoolFetch()` 和 `isSessionDead()` 处理：

```
1. 代理发送请求到学校并附带存储的 Cookie
2. 学校响应 302 重定向或 HTML 登录页面
   （意思是："我不知道你是谁"）
3. isSessionDead() 检测到这一点
4. schoolFetch() 使用存储的凭证调用 schoolLogin()
5. 获取新的 Cookie
6. 重试原始请求
7. 将数据返回给浏览器，好像什么都没发生
```

学生永远看不到这个 —— 它是完全不可见的。从他们的角度来看，课表只是正常加载，可能会有一点点额外的延迟。

**这什么时候会失败？**
- 如果学生更改了他们的学校密码 → 重新认证失败 → 401 错误 → 他们需要通过我们的应用重新登录
- 如果学校服务器完全宕机 → 500 错误

---

## 11. 关键概念 Glossary

| 术语 | 简单解释 |
|------|----------|
| **回调函数** | 你交给别人在特定事件发生时稍后运行的函数。`app.get(...)`、`onclick`、`setTimeout` 等背后的核心模式 |
| **Express** | 一个 Node.js 库，可以轻松创建响应 HTTP 请求的 Web 服务器 |
| **中间件** | 在主要路由处理器之前运行的函数。可以检查、修改或阻止请求。有三个参数：`(req, res, next)` |
| **路由** | 服务器处理的 URL 模式，如 `GET /api/timetable` |
| **fetch()** | 一个内置函数（在浏览器和 Node.js 中都有）用于发送 HTTP 请求 |
| **async/await** | JavaScript 语法，用于处理需要时间（如网络请求）的操作。`await` 暂停直到操作完成 |
| **Cookie** | 服务器要求浏览器存储并随每个请求发回的一小段数据。用于登录会话 |
| **令牌** | 一个随机字符串，作为已认证会话的"密码"。比实际凭证更难窃取 |
| **localStorage** | 跨页面刷新和浏览器重启持续存在的浏览器存储 |
| **Map** | 一种 JavaScript 数据结构 like a dictionary：你通过键查找值 |
| **JSON** | 一种用于结构化数据的文本格式，如 `{ "name": "Gavin", "age": 17 }` |
| **302 重定向** | 一个 HTTP 响应，说"你想要的东西在不同的 URL" —— 学校服务器在会话过期时用它将你发送到登录页面 |
| **CORS** | 一个浏览器安全策略，防止网页向不同域名发送请求。只有浏览器强制执行，服务器不强制 |
| **代理** | 代表另一个客户端发出请求的服务器。我们的服务器是浏览器和学校服务器之间的代理 |
| **端口** | 标识计算机上特定服务的数字。就像建筑物中的公寓号码。端口 3000 = 我们的应用，端口 8001 = 学校服务器 |
| **正则表达式** | 一种用于在字符串中查找文本的模式匹配语言。这里用于从 HTML 中提取数据 |
| **npm** | Node 包管理器 —— 下载和管理 JavaScript 库。`npm install` 下载 package.json 中列出的内容 |

[← 回到上页](../README.md)