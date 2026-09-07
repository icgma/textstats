// stats — 稿件统计的纯函数
// 与界面分离，便于用 node 直接测试（见 test.js）。

(() => {
  "use strict";

  const CJK = /[一-鿿㐀-䶿]/g;
  const CJK_RUN = /[一-鿿㐀-䶿]+/g;

  // 中文按字算，不能按空格分词——这是与英文统计的根本差别。
  function analyze(text) {
    const chars = [...text];
    const charCount = chars.length;
    const noSpace = chars.filter((c) => !/\s/.test(c)).length;
    const cjk = (text.match(CJK) || []).length;
    // 拉丁词：稿件里的英文与数字
    const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
    const punct = (text.match(/[，。！？；：、,.!?;:]/g) || []).length;

    // 段落以空行分隔
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    // 句子以句末标点切分，保留标点在句尾
    const sentences = text
      .split(/(?<=[。！？!?])/)
      .map((s) => s.trim())
      .filter(Boolean);

    const sentenceCjk = sentences.map((s) => (s.match(CJK) || []).length);

    return {
      charCount, noSpace, cjk, words, punct,
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      sentences_raw: sentences,
      sentenceCjk,
    };
  }

  // 时长格式化：秒 / 分 / 分+秒
  function fmtTime(totalMin) {
    if (!isFinite(totalMin) || totalMin <= 0) return "0 秒";
    const totalSeconds = Math.round(totalMin * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s} 秒`;
    return s ? `${m} 分 ${s} 秒` : `${m} 分`;
  }

  // 超过阈值的长句，编辑改稿时最常用
  function longSentences(a, limit) {
    const out = [];
    a.sentences_raw.forEach((s, i) => {
      if (a.sentenceCjk[i] >= limit) out.push({ s, n: a.sentenceCjk[i] });
    });
    return out;
  }

  // 虚词与常见搭配不算重复
  const STOP = new Set([
    "的话", "的是", "一个", "一些", "一种", "可以", "我们", "他们", "这个", "那个",
    "这是", "那是", "就是", "这样", "那样", "已经", "正在", "应当", "应该", "可能",
    "或者", "但是", "因为", "所以", "虽然", "然而", "不仅", "而且", "于是", "因此",
  ]);

  // 2-4 字连续汉字片段的频次；被更长高频词包含的短词会被剔除
  function topRepeats(text, minCount = 3, limit = 20) {
    const runs = text.match(CJK_RUN) || [];
    const freq = new Map();
    for (const seg of runs) {
      const arr = [...seg];
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i + len <= arr.length; i++) {
          const w = arr.slice(i, i + len).join("");
          if (STOP.has(w)) continue;
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }
    }
    const ranked = [...freq.entries()]
      .filter(([, n]) => n >= minCount)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, limit)
      .map(([w, n]) => ({ w, n }));

    return ranked.filter((x, _i, arr) =>
      !arr.some((y) => y !== x && y.w.length > x.w.length && y.w.includes(x.w) && y.n >= x.n)
    );
  }

  const API = { analyze, fmtTime, longSentences, topRepeats, STOP };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else globalThis.Stats = API;
})();
