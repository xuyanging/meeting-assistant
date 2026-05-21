// 内置拼音输入法引擎
// 前提：系统切到英文(ABC)输入法，本引擎接管中文转换
window.IMEEngine = (() => {
  const { charDict, wordDict } = window.IME_DICT;
  const SYLLABLES = new Set(Object.keys(charDict));

  let buffer = '';

  // DP 切音节：找一条全覆盖路径，避免贪心吞掉过长前缀（如 'jiang' 吃掉 'jian gong'）
  function parseSyllables(str) {
    const n = str.length;
    if (!n) return [];
    const reach = new Array(n + 1).fill(false);
    const parent = new Array(n + 1).fill(-1);
    reach[0] = true;
    for (let i = 0; i < n; i++) {
      if (!reach[i]) continue;
      for (let len = 1; len <= Math.min(6, n - i); len++) {
        if (SYLLABLES.has(str.slice(i, i + len)) && !reach[i + len]) {
          reach[i + len] = true;
          parent[i + len] = i;
        }
      }
    }
    let end = n;
    while (end > 0 && !reach[end]) end--;
    const result = [];
    for (let p = end; p > 0; p = parent[p]) result.unshift(str.slice(parent[p], p));
    if (end < n) result.push(str.slice(end));
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

    // 单字：第一个合法音节 — 显示该拼音下所有候选字（已按字频降序）
    const first = syllables[0];
    if (SYLLABLES.has(first)) {
      (charDict[first] || []).forEach(add);
    }

    return candidates;
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
