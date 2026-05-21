// Build dict.js from mozillazg/pinyin-data + phrase-pinyin-data + rime-essay
// + OpenCC TSCharacters (for simplified conversion).
const fs = require('fs');
const path = require('path');

// Source data files live in .dict-tmp/ at repo root (gitignored).
// Run scripts/fetch-dict-sources.sh first to populate them.
const REPO_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, '.dict-tmp');
const charsTxt = fs.readFileSync(path.join(DATA_DIR, 'chars.txt'), 'utf8');
const wordsTxt = fs.readFileSync(path.join(DATA_DIR, 'words.txt'), 'utf8');
const essayTxt = fs.readFileSync(path.join(DATA_DIR, 'essay.txt'), 'utf8');
const tsCharsTxt = fs.readFileSync(path.join(DATA_DIR, 'ts-chars.txt'), 'utf8');

const stripTone = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'v');

const isCJK = (s) => /^[一-鿿]+$/.test(s);

// 1. char -> primary pinyin (no tone)
const charPinyin = new Map();
for (const line of charsTxt.split('\n')) {
  const m = line.match(/^U\+([0-9A-F]+):\s*([^#]+?)\s*#/);
  if (!m) continue;
  const ch = String.fromCodePoint(parseInt(m[1], 16));
  const list = m[2].trim().split(',').map((p) => stripTone(p.trim()));
  charPinyin.set(ch, list);
}

// 2. T -> S char map
const tsMap = new Map();
for (const line of tsCharsTxt.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  const simp = parts[1].split(' ')[0];
  if (simp) tsMap.set(parts[0], simp);
}
const t2s = (s) => [...s].map((c) => tsMap.get(c) || c).join('');

// 3. phrase-pinyin-data override (simplified words)
const wordPinyinOverride = new Map();
for (const line of wordsTxt.split('\n')) {
  const m = line.match(/^([^#:][^:]*?):\s*(.+)$/);
  if (!m) continue;
  const w = m[1].trim();
  if (!isCJK(w)) continue;
  const py = m[2].trim().split(/\s+/).map(stripTone);
  wordPinyinOverride.set(w, py);
}

// 4. essay.txt: word(trad)+freq -> simplified -> freq
//    Also collect single-char freq for character-level pinyin ranking.
const wordFreq = new Map();
const charDirectFreq = new Map();
for (const line of essayTxt.split('\n')) {
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  const f = parseInt(parts[1], 10);
  if (!f) continue;
  const tw = parts[0];
  if (!isCJK(tw)) continue;
  const len = [...tw].length;
  if (len > 6) continue;
  const sw = t2s(tw);
  if (len === 1) {
    charDirectFreq.set(sw, (charDirectFreq.get(sw) || 0) + f);
  } else {
    wordFreq.set(sw, (wordFreq.get(sw) || 0) + f);
  }
}

function pinyinOf(word) {
  if (wordPinyinOverride.has(word)) return wordPinyinOverride.get(word);
  const out = [];
  for (const c of word) {
    const py = charPinyin.get(c);
    if (!py || !py[0]) return null;
    out.push(py[0]);
  }
  return out;
}

// 5. Rank words, group by pinyin
const MIN_FREQ = 100;
const TOP_WORDS = 18000;

// Hard-include these regardless of essay frequency — tech/workplace vocabulary
// that gets ranked below 18k cutoff in a general-corpus frequency list.
const EXTRAS = [
  // 编程
  '软件','硬件','计算机','电脑','程序','代码','开发','设计','数据','网络',
  '系统','算法','接口','函数','变量','对象','方法','数组','字符串','整数',
  '浮点','指针','内存','堆栈','队列','排序','查找','查询','递归','迭代',
  '继承','多态','封装','框架','数据库','前端','后端','全栈','服务器','客户端',
  '异步','同步','线程','进程','操作系统','编译器','解释器','版本控制',
  '测试','调试','部署','发布','性能','优化','安全','加密','身份验证',
  '权限','日志','监控','报警','中间件','微服务','容器','云服务','负载均衡',
  '缓存','异步编程','并发','分布式','高可用','软件工程','面向对象','设计模式',
  '单一职责原则','开闭原则','依赖注入','控制反转','函数式编程','接口文档',
  '单元测试','集成测试','数据结构','二叉树','红黑树','哈希表','链表','图算法',
  '动态规划','贪心算法','时间复杂度','空间复杂度',
  // 职场常用
  '会议','汇报','纪要','议题','决议','讨论','协作','协同','跟进','复盘',
  '团队','合作','沟通','成长','简历','薪资','职位',
  '挑战','机会','规划','责任','成果','研究','分析','结果','效果','方向',
  '思路','流程','标准','规范','文档','报告','总结','反思','改进','完善',
  '创新','突破','价值','意义','优势','劣势','优点','缺点','原因','本质',
  '核心','关键',
];
const ranked = [...wordFreq.entries()]
  .filter(([, f]) => f >= MIN_FREQ)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_WORDS);

const wordGroups = {};
for (const [w, f] of ranked) {
  const py = pinyinOf(w);
  if (!py || py.length !== [...w].length) continue;
  if (py.some((p) => !p)) continue;
  const key = py.join(' ');
  (wordGroups[key] = wordGroups[key] || []).push([w, f]);
}

const wordDict = {};
for (const [k, arr] of Object.entries(wordGroups)) {
  arr.sort((a, b) => b[1] - a[1]);
  wordDict[k] = arr.slice(0, 8).map((x) => x[0]);
}

// Merge in EXTRAS: prepend to candidate list for their pinyin key
for (const w of EXTRAS) {
  const py = pinyinOf(w);
  if (!py || py.length !== [...w].length) {
    console.warn('  [skip extra, no pinyin]', w);
    continue;
  }
  const key = py.join(' ');
  const cur = wordDict[key] || [];
  if (!cur.includes(w)) {
    wordDict[key] = [w, ...cur].slice(0, 10);
  }
}

// 6. charDict: rank chars per pinyin using (a) single-char freq from essay,
//    plus (b) cumulative freq from the words that contain the char.
const charScore = {}; // pinyin -> { char -> score }

// (a) Direct single-char frequency from essay (most reliable signal —
//     captures common surnames like 薛/邓 that rarely appear in
//     multi-char essay phrases).
for (const [c, f] of charDirectFreq) {
  const py = charPinyin.get(c);
  if (!py || !py[0]) continue;
  const p = py[0];
  if (!charScore[p]) charScore[p] = {};
  charScore[p][c] = (charScore[p][c] || 0) + f;
}

// (b) Cumulative score from multi-char words.
for (const [w, f] of ranked) {
  const chars = [...w];
  const py = pinyinOf(w);
  if (!py || py.length !== chars.length) continue;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const p = py[i];
    if (!isCJK(c)) continue;
    if (!charScore[p]) charScore[p] = {};
    charScore[p][c] = (charScore[p][c] || 0) + f;
  }
}

// Fallback: include every basic-CJK char with its primary pinyin at score 0
// so rare chars still show up (just at the end of the candidate list).
for (const [c, list] of charPinyin) {
  if (!isCJK(c)) continue;
  if (c.codePointAt(0) > 0x9FA5) continue;
  const p = list[0];
  if (!p) continue;
  if (!charScore[p]) charScore[p] = {};
  if (!(c in charScore[p])) charScore[p][c] = 0;
}

const PER_PINYIN_CHAR_LIMIT = 60;
const charDictRaw = {};
for (const [p, m] of Object.entries(charScore)) {
  const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  charDictRaw[p] = sorted.slice(0, PER_PINYIN_CHAR_LIMIT).join('');
}

// 7. Emit dict.js
const head = `// 拼音词典：拼音 → 候选字/词
// 数据来源:
//   - 字: mozillazg/pinyin-data (MIT)
//   - 词频: rime/rime-essay (BSD-3) + OpenCC T->S (Apache-2.0)
//   - 词拼音覆盖: mozillazg/phrase-pinyin-data (MIT)
// 由 .dict-tmp/build-dict.js 生成，请勿手工编辑
window.IME_DICT = (() => {
  const RAW = {
`;
const tail = `  };
  const charDict = {};
  for (const [py, chars] of Object.entries(RAW)) charDict[py] = [...chars];
  const wordDict = WORDS;
  return { charDict, wordDict };
})();
`;

let body = '';
for (const p of Object.keys(charDictRaw).sort()) {
  body += `    '${p}':${JSON.stringify(charDictRaw[p])},\n`;
}

let wordsBody = '{\n';
for (const k of Object.keys(wordDict).sort()) {
  wordsBody += `    '${k}':${JSON.stringify(wordDict[k])},\n`;
}
wordsBody += '  }';

const out = head + body + tail.replace('WORDS', wordsBody);
const target = path.join(REPO_ROOT, 'renderer', 'ime', 'dict.js');
fs.writeFileSync(target, out);

const stats = fs.statSync(target);
console.log('written:', target, '(', (stats.size / 1024).toFixed(1), 'KB )');
console.log('char pinyin keys:', Object.keys(charDictRaw).length);
console.log('word pinyin keys:', Object.keys(wordDict).length);
const totalWords = Object.values(wordDict).reduce((a, b) => a + b.length, 0);
console.log('total word entries:', totalWords);
// Sanity checks
const tests = [
  ['jie shao', '介绍'],
  ['xi tong', '系统'],
  ['ruan jian', '软件'],
  ['xiang mu', '项目'],
  ['da xue', '大学'],
  ['gong cheng shi', '工程师'],
  ['ji shu', '技术'],
  ['ji suan ji', '计算机'],
  ['she ji mo shi', '设计模式'],
  ['wei fu wu', '微服务'],
  ['zhong jian jian', '中间件'],
  ['ha xi biao', '哈希表'],
  ['lian biao', '链表'],
  ['dong tai gui hua', '动态规划'],
  ['tan xin suan fa', '贪心算法'],
  ['shi jian fu za du', '时间复杂度'],
  ['yi lai zhu ru', '依赖注入'],
  ['mian xiang dui xiang', '面向对象'],
  ['dan yuan ce shi', '单元测试'],
  ['bian yi qi', '编译器'],
];
for (const [k, expect] of tests) {
  const cands = wordDict[k] || [];
  console.log(`  ${k} -> ${cands.join(',')} ${cands.includes(expect) ? '✓' : '✗ missing ' + expect}`);
}
