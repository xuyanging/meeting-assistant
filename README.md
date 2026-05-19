# 面试助手 (Interview Assistant)

基于 Gemini 的 macOS 悬浮面试辅助工具。窗口半透明、置顶显示，**屏幕共享/录屏时完全不可见**。

## 功能

- 悬浮在所有窗口之上，包括全屏应用
- 屏幕共享时窗口自动隐藏（macOS 内容保护机制）
- 支持 Gemini 流式对话
- 可调节透明度
- 全局快捷键控制显隐

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+\` | 显示 / 隐藏窗口 |
| `Cmd+Shift+Enter` | 聚焦输入框 |

## 环境要求

- macOS
- [Node.js](https://nodejs.org)（LTS 版本）

## 安装

```bash
# 1. 安装 Node.js（如果没有）
brew install node

# 2. 克隆项目
git clone https://github.com/xuyanging/interview-assistant.git
cd interview-assistant

# 3. 安装依赖
npm install
```

## 运行

```bash
npm start
```

带日志输出：

```bash
npm run dev
```

## 配置

首次运行后，点击设置图标，填入你的 **Gemini API Key**。

获取 API Key：[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
