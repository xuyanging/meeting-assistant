// 内置拼音输入法引擎
// 前提：系统切到英文(ABC)输入法，本引擎接管中文转换
window.IMEEngine = (() => {
  const { charDict, wordDict } = window.IME_DICT;
  const SYLLABLES = new Set(Object.keys(charDict));

  let buffer = '';

  // 贪心匹配：从 str[i] 开始尝试最长合法音节
  function parseSyllables(str) {
    const result = [];
    let i = 0;
    while (i < str.length) {
      let matched = false;
      for (let len = Math.min(6, str.length - i); len >= 1; len--) {
        const sub = str.slice(i, i + len);
        if (SYLLABLES.has(sub)) {
          result.push(sub);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result.push(str.slice(i)); // 剩余未匹配部分
        break;
      }
    }
    return result;
  }

  function getCandidates() {
    if (!buffer) return [];
    const syllables = parseSyllables(buffer);
    const candidates = [];
    const seen = new Set();

    function add(w) { if (!seen.has(w)) { seen.add(w); candidates.push(w); } }

    // 多音节词：从最长前缀向下尝试
    const validSyls = syllables.filter(s => SYLLABLES.has(s));
    for (let len = validSyls.length; len >= 2; len--) {
      const key = validSyls.slice(0, len).join(' ');
      if (wordDict[key]) wordDict[key].forEach(add);
    }

    // 单字：第一个合法音节
    const first = syllables[0];
    if (SYLLABLES.has(first)) {
      (charDict[first] || []).slice(0, 8).forEach(add);
    }

    return candidates.slice(0, 5);
  }

  function select(index) {
    const candidates = getCandidates();
    const word = candidates[index];
    if (!word) return null;

    // 计算该词消耗了几个音节
    const syllables = parseSyllables(buffer);
    const wordLen = [...word].length; // 汉字数
    let consumed = 0;
    let charCount = 0;
    for (const syl of syllables) {
      if (!SYLLABLES.has(syl)) break;
      charCount++;
      consumed += syl.length;
      if (charCount >= wordLen) break;
    }

    buffer = buffer.slice(consumed);
    return word;
  }

  function push(char) { buffer += char; }
  function pop() { buffer = buffer.slice(0, -1); }
  function reset() { buffer = ''; }
  function getBuffer() { return buffer; }

  // 显示用：已解析的音节用空格隔开，未匹配部分直接显示
  function getDisplay() {
    if (!buffer) return '';
    return parseSyllables(buffer).join(' ');
  }

  return { push, pop, select, reset, getBuffer, getDisplay, getCandidates };
})();
