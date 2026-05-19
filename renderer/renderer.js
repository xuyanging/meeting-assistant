// ============ DOM ============
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const inputDisplayEl = document.getElementById('input-display');
const inputTextEl = document.getElementById('input-text');
const inputCompEl = document.getElementById('input-comp');

const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const systemPromptInput = document.getElementById('system-prompt');
const cpToggle = document.getElementById('content-protection-toggle');
const saveSettingsBtn = document.getElementById('save-settings');
const openKeyLink = document.getElementById('open-key-link');

const opacityBtn = document.getElementById('opacity-btn');
const opacityPanel = document.getElementById('opacity-panel');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

const clearBtn = document.getElementById('clear-btn');
const hideBtn = document.getElementById('hide-btn');
const closeBtn = document.getElementById('close-btn');
const statusDot = document.getElementById('status-dot');

// ============ State ============
const STORAGE_KEY = 'interview-assistant-settings';
let settings = loadSettings();
let conversation = [];
let isStreaming = false;
let abortController = null;

function defaultSettings() {
  return {
    apiKey: '',
    model: 'gemini-3.1-pro-preview',
    systemPrompt: '',
    opacity: 0.92,
    contentProtection: true,
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) {
    console.warn('settings load failed', e);
  }
  return defaultSettings();
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings() {
  apiKeyInput.value = settings.apiKey || '';
  modelSelect.value = settings.model || 'gemini-3.1-pro-preview';
  systemPromptInput.value = settings.systemPrompt || '';
  cpToggle.checked = settings.contentProtection !== false;

  const op = settings.opacity || 0.92;
  opacitySlider.value = op;
  opacityValue.textContent = Math.round(op * 100) + '%';

  window.electronAPI.setOpacity(op);
  window.electronAPI.setContentProtection(cpToggle.checked);
  statusDot.classList.toggle('off', !cpToggle.checked);
  statusDot.title = cpToggle.checked
    ? '屏幕共享时此窗口不可见'
    : '⚠️ 屏幕共享保护已关闭 (对方可能看到)';
}

applySettings();

// ============ UI Events ============
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  opacityPanel.classList.add('hidden');
});

opacityBtn.addEventListener('click', () => {
  opacityPanel.classList.toggle('hidden');
  settingsPanel.classList.add('hidden');
});

opacitySlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  settings.opacity = v;
  opacityValue.textContent = Math.round(v * 100) + '%';
  window.electronAPI.setOpacity(v);
  persistSettings();
});

cpToggle.addEventListener('change', () => {
  window.electronAPI.setContentProtection(cpToggle.checked);
  statusDot.classList.toggle('off', !cpToggle.checked);
  statusDot.title = cpToggle.checked
    ? '屏幕共享时此窗口不可见'
    : '⚠️ 屏幕共享保护已关闭 (对方可能看到)';
});

saveSettingsBtn.addEventListener('click', () => {
  settings.apiKey = apiKeyInput.value.trim();
  settings.model = modelSelect.value;
  settings.systemPrompt = systemPromptInput.value;
  settings.contentProtection = cpToggle.checked;
  persistSettings();
  settingsPanel.classList.add('hidden');
  toast('设置已保存', 'success');
});

openKeyLink.addEventListener('click', (e) => {
  e.preventDefault();
  // Show inline hint instead of opening external browser (avoids losing focus)
  toast('访问 https://aistudio.google.com/apikey 创建 API Key', 'info', 3500);
});

clearBtn.addEventListener('click', () => {
  if (isStreaming && abortController) abortController.abort();
  conversation = [];
  messagesEl.innerHTML = '';
  messagesEl.appendChild(welcomeEl);
  welcomeEl.style.display = '';
  toast('对话已清空', 'info');
});

hideBtn.addEventListener('click', () => window.electronAPI.hide());
closeBtn.addEventListener('click', () => {
  if (confirm('退出面试助手?')) window.electronAPI.close();
});

// ============ 离屏输入同步 ============
function updateDisplay() {
  const text = inputEl.value;
  inputTextEl.textContent = text;
  if (!text && !inputCompEl.textContent) {
    inputDisplayEl.classList.add('empty');
  } else {
    inputDisplayEl.classList.remove('empty');
  }
  // 同步高度
  const lines = Math.max(1, (text || '').split('\n').length);
  const h = Math.min(lines * 19.5 + 18, 140);
  inputDisplayEl.style.minHeight = Math.max(38, h) + 'px';
}

inputDisplayEl.addEventListener('mousedown', (e) => {
  e.preventDefault();
  inputEl.focus();
});

inputEl.addEventListener('focus', () => inputDisplayEl.classList.add('focused'));
inputEl.addEventListener('blur', () => {
  inputDisplayEl.classList.remove('focused');
  inputCompEl.textContent = '';
  updateDisplay();
});

inputEl.addEventListener('compositionstart', () => {
  inputCompEl.textContent = '';
});
inputEl.addEventListener('compositionupdate', (e) => {
  inputCompEl.textContent = e.data || '';
  inputDisplayEl.classList.remove('empty');
});
inputEl.addEventListener('compositionend', () => {
  inputCompEl.textContent = '';
  updateDisplay();
});

// Input handling
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  updateDisplay();
});

sendBtn.addEventListener('click', send);

window.electronAPI.onFocusInput(() => {
  inputEl.focus();
});

// ============ Send ============
async function send() {
  if (isStreaming) {
    // Treat second click as stop
    if (abortController) abortController.abort();
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  if (!settings.apiKey) {
    settingsPanel.classList.remove('hidden');
    apiKeyInput.focus();
    toast('请先配置 Gemini API Key', 'error');
    return;
  }

  // Hide welcome
  if (welcomeEl.parentNode === messagesEl) {
    welcomeEl.style.display = 'none';
  }

  // Append user message
  conversation.push({ role: 'user', parts: [{ text }] });
  addMessage('user', text);

  inputEl.value = '';
  inputEl.style.height = 'auto';
  updateDisplay();

  // Placeholder for assistant
  const assistantEl = addMessage('assistant', '');
  const bubble = assistantEl.querySelector('.bubble');
  bubble.innerHTML = '<span class="typing">思考中</span>';

  isStreaming = true;
  sendBtn.disabled = false; // keep enabled so user can click to stop
  sendBtn.textContent = '■';
  sendBtn.title = '停止生成';

  abortController = new AbortController();
  let accumulated = '';

  try {
    await streamGemini(conversation, abortController.signal, (chunk) => {
      accumulated += chunk;
      bubble.textContent = accumulated;
      autoScroll();
    });

    if (accumulated) {
      conversation.push({ role: 'model', parts: [{ text: accumulated }] });
      renderRichInto(bubble, accumulated);
    } else {
      bubble.textContent = '(模型未返回内容)';
      bubble.classList.add('error-bubble');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (accumulated) {
        conversation.push({ role: 'model', parts: [{ text: accumulated }] });
        renderRichInto(bubble, accumulated);
        const stopMark = document.createElement('em');
        stopMark.style.cssText = 'opacity:0.6;font-size:11px;display:block;margin-top:4px;';
        stopMark.textContent = '[已停止]';
        bubble.appendChild(stopMark);
      } else {
        bubble.textContent = '[已停止]';
        bubble.classList.add('error-bubble');
      }
    } else {
      console.error(err);
      bubble.textContent = '错误: ' + err.message;
      bubble.classList.add('error-bubble');
    }
  } finally {
    isStreaming = false;
    abortController = null;
    sendBtn.disabled = false;
    sendBtn.textContent = '↑';
    sendBtn.title = '发送 (Enter)';
    autoScroll();
    inputEl.focus();
  }
}

function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const roleLabel = document.createElement('div');
  roleLabel.className = 'role';
  roleLabel.textContent = role === 'user' ? '你' : 'Gemini';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  messagesEl.appendChild(wrapper);
  autoScroll();
  return wrapper;
}

function autoScroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============ Gemini API ============
async function streamGemini(contents, signal, onChunk) {
  const model = settings.model || 'gemini-3.1-pro-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.apiKey)}`;

  const body = { contents };
  if (settings.systemPrompt && settings.systemPrompt.trim()) {
    body.systemInstruction = { parts: [{ text: settings.systemPrompt.trim() }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch (e) {}
    let msg = `HTTP ${resp.status}`;
    try {
      const j = JSON.parse(errText);
      if (j?.error?.message) msg += ` - ${j.error.message}`;
    } catch (e) {
      if (errText) msg += ` - ${errText.slice(0, 300)}`;
    }
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines separated by \n; data chunks may span lines
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last (possibly incomplete) line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const obj = JSON.parse(data);
        const parts = obj?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (typeof p.text === 'string') onChunk(p.text);
        }
        // Surface block reasons
        const blockReason = obj?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`内容被拦截: ${blockReason}`);
        }
      } catch (e) {
        if (e.message?.startsWith('内容被拦截')) throw e;
        // ignore json parse errors mid-stream
      }
    }
  }
}

// ============ Markdown + LaTeX rendering ============
// Configure marked once (gfm + breaks for natural newlines)
if (window.marked) {
  window.marked.setOptions({
    gfm: true,
    breaks: true,
  });
}

const KATEX_DELIMITERS = [
  { left: '$$',  right: '$$',  display: true  },
  { left: '\\[', right: '\\]', display: true  },
  { left: '\\(', right: '\\)', display: false },
  { left: '$',   right: '$',   display: false },
];

function renderMath(el) {
  if (!window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: KATEX_DELIMITERS,
      throwOnError: false,
      errorColor: '#ff8a82',
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    });
  } catch (e) {
    console.warn('katex render failed', e);
  }
}

function renderRichInto(el, text) {
  el.innerHTML = renderMarkdown(text);
  renderMath(el);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  if (!window.marked) return escapeHtml(text).replace(/\n/g, '<br>');
  try {
    return window.marked.parse(text);
  } catch (e) {
    console.warn('markdown parse failed', e);
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
}

// ============ Toast ============
function toast(msg, type = 'info', duration = 2000) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  t.style.animationDuration = `${duration}ms`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ============ Init ============
window.addEventListener('DOMContentLoaded', () => {
  inputEl.focus();
});

// Prevent page reload on Ctrl+R / drag-drop, etc.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
