# Mac Assistant

基于 Gemini 的 macOS 悬浮 AI 助手。窗口半透明、置顶显示，**屏幕共享/录屏时完全不可见**。

## 下载

到 [Releases](https://github.com/xuyanging/meeting-assistant/releases/latest) 下载最新版：

| 平台 | 文件 |
|---|---|
| macOS Apple Silicon | `MacAssistant-*-arm64.dmg` |
| macOS Intel | `MacAssistant-*-x64.dmg` |
| Windows x64 | `MacAssistant-*-win-x64.exe` |
| Windows ARM64 | `MacAssistant-*-win-arm64.exe` |

**macOS**：DMG 未代码签名，首次打开右键 `Mac Assistant.app` → 打开，或终端 `xattr -dr com.apple.quarantine /Applications/Mac\ Assistant.app`

**Windows**：安装包未代码签名，首次运行 SmartScreen 警告 →「更多信息」→「仍要运行」。屏幕共享不可见依赖 Win10 2004+ 的 `WDA_EXCLUDEFROMCAPTURE`。

## 功能

- 悬浮在所有窗口之上，包括全屏应用
- 屏幕共享时窗口自动隐藏（macOS 内容保护机制）
- 内置拼音输入法（万级词库），打字时的候选框也对屏幕录制不可见
- 支持 Gemini 流式对话（Markdown + 数学公式渲染）
- 内置可选的中继代理：本地无法直连 Google 时通过云服务器转发 Gemini 请求
- 可调节透明度
- 全局快捷键控制显隐

## 环境要求

- macOS
- [Node.js](https://nodejs.org)（LTS 版本）

## 安装

```bash
# 1. 安装 Node.js（如果没有）
brew install node

# 2. 克隆项目
git clone https://github.com/xuyanging/meeting-assistant.git
cd meeting-assistant

# 3. 安装依赖
npm install
```

## 运行

```bash
npm start
```

## 配置

首次运行后，点击右上角 **⚙** 图标，填入你的 **Gemini API Key**。

获取 API Key：[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+\` | 显示 / 隐藏窗口 |
| `Cmd+Shift+Enter` | 唤起并聚焦输入框 |

---

## 内置拼音输入法

屏幕共享时系统输入法的候选框会被录进去。App 内置了一套拼音输入法，候选框渲染在受保护的窗口内部，屏幕录制完全不可见。

### 使用步骤

**第一步：把系统输入法切到英文（ABC）**

点击 macOS 菜单栏右上角的输入法图标，选择 **ABC** 或 **英文**。这是关键步骤——系统必须处于英文模式，否则按键会被系统 IME 拦截，无法进入内置输入法。

**第二步：激活内置输入法**

点击 App 输入框右侧的 **`En`** 按钮，按钮变为蓝色 **`中`** 表示已激活。

**第三步：正常打拼音**

直接在输入框里打拼音字母，候选框会出现在输入框下方。

### 候选框操作

| 按键 | 功能 |
|------|------|
| `1` `2` `3` `4` `5` | 选择对应候选词 |
| `空格` | 选择第一个候选词 |
| `→` | 下一页候选 |
| `←` | 上一页候选 |
| `Backspace` | 删除最后一个拼音字母 |
| `Enter` | 上屏第一个候选词 |
| `Esc` | 取消当前输入 |

### 多字词输入

输入多音节拼音后会优先匹配词语。例如：

- 输入 `nihao` → 候选第一个为 **你好**
- 输入 `ruanjian` → 候选第一个为 **软件**
- 输入 `jisuanji` → 候选第一个为 **计算机**

词库基于开源数据生成（mozillazg/pinyin-data、rime/rime-essay、OpenCC），覆盖约 18k 常用词 + 5k+ 汉字，外加技术/职场场景的补充词表。

### 切回英文输入

再次点击 **`中`** 按钮，变回 **`En`**，即可正常输入英文。

### 重新生成词库

词典文件 `renderer/ime/dict.js` 由 `scripts/build-dict.js` 生成。源数据（`.dict-tmp/`，已 gitignored）需先拉取：

```bash
./scripts/fetch-dict-sources.sh     # 一次性下载 4 个数据源到 .dict-tmp/
node scripts/build-dict.js          # 生成 renderer/ime/dict.js
```

要新增技术/行业词汇，编辑 `scripts/build-dict.js` 里的 `EXTRAS` 数组重新生成即可。

---

## 中继代理

如果你所在的网络无法直接访问 `generativelanguage.googleapis.com`，可以走内置的 SOCKS5 隧道转发到云服务器。

### 开关

设置面板有一个「通过中继代理访问 Gemini」勾选项：

- **勾选**（默认）：所有 Gemini 请求经隧道到云服务器，再到 Google
- **不勾选**：直连，跟普通浏览器访问 Gemini 一样

切换无需重启。开关状态持久化在 `~/Library/Application Support/meeting-assistant/proxy-config.json`。

### 工作原理

App 启动时（如果代理开启）：

1. main 进程用内嵌的 SSH 凭证连接预配置的云服务器（基于 [`ssh2`](https://github.com/mscdex/ssh2)）
2. 本地起一个 SOCKS5 服务监听随机端口
3. 通过 `session.defaultSession.setProxy()` 让 Electron 所有网络请求都走这个 SOCKS5
4. SOCKS5 收到连接请求后通过 SSH `direct-tcpip` 转发到目标主机

SSH 凭证以 AES-256-GCM 加密形式内嵌在 `proxy.js`，运行时解密；服务端授权配置严格限制为 `permitopen="generativelanguage.googleapis.com:443"`、`command="/bin/false"`、`no-pty`，即使凭证泄露也只能用于转发 Gemini 请求。

### 自部署

如果你要换成自己的中继服务器：

1. 在你的服务器上生成一个新的受限授权（仅允许端口转发到 Gemini）：
   ```
   no-pty,no-X11-forwarding,no-agent-forwarding,no-user-rc,command="/bin/false",permitopen="generativelanguage.googleapis.com:443" ssh-ed25519 AAAA... your-key-comment
   ```
2. 修改 `proxy.js` 顶部的 `REMOTE_HOST` / `REMOTE_PORT` / `REMOTE_USER`
3. 重新生成 `PAYLOAD`（私钥的 AES-GCM 密文，用 `C1`–`C4` 和 `TAG_SALT` 派生 key）
