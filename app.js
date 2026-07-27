// textstats — 稿件字数与可读性
// 全部在浏览器本地计算，稿件不上传。

(() => {
  "use strict";

  const state = {
    readSpeed: 300,
    speakSpeed: 240,
    longLimit: 50,
  };

  const $ = (s) => document.querySelector(s);
  const els = {
    input: $("#input"),
    inputCount: $("#inputCount"),
    cards: $("#cards"),
    durations: $("#durations"),
    longList: $("#longList"),
    longCount: $("#longCount"),
    longNote: $("#longNote"),
    repeatList: $("#repeatList"),
    repeatCount: $("#repeatCount"),
    status: $("#status"),
    hint: $("#hint"),
    optRead: $("#optReadSpeed"),
    optSpeak: $("#optSpeakSpeed"),
    optLong: $("#optLongLimit"),
    themeToggle: $("#themeToggle"),
    themeLabel: $("#themeLabel"),
  };

  // ---------- 主题 ----------
  const THEME_KEY = "toolkit-theme";
  const root = document.documentElement;
  function applyTheme(theme) {
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (els.themeLabel) {
      const isLight = theme === "light" || (theme === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
      els.themeLabel.textContent = isLight ? "深色" : "浅色";
    }
  }
  function cycleTheme() {
    const cur = localStorage.getItem(THEME_KEY) || "auto";
    const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "auto");
  els.themeToggle.addEventListener("click", cycleTheme);

  // ---------- 核心统计 ----------
  function analyze(text) {
    const chars = [...text];
    const charCount = chars.length;
    const noSpace = chars.filter((c) => !/\s/.test(c)).length;
    const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
    // 拉丁单词数（新闻稿里的英文/数字）
    const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
    // 标点
    const punct = (text.match(/[，。！？；：、,.\!?;:]/g) || []).length;

    // 段落：以空行分隔
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    // 句子：以中文句末标点切分
    const sentences = text
      .split(/(?<=[。！？!?])/)
      .map((s) => s.trim())
      .filter(Boolean);

    // 每句汉字数，用于长句判断
    const sentenceCjk = sentences.map((s) => (s.match(/[一-鿿㐀-䶿]/g) || []).length);

    return {
      charCount, noSpace, cjk, words, punct,
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      sentences_raw: sentences,
      sentenceCjk,
    };
  }

  function fmtTime(totalMin) {
    if (!isFinite(totalMin) || totalMin <= 0) return "0 秒";
    const m = Math.floor(totalMin);
    const s = Math.round((totalMin - m) * 60);
    if (m === 0) return `${s} 秒`;
    return s ? `${m} 分 ${s} 秒` : `${m} 分`;
  }

  // ---------- 渲染 ----------
  function render(a) {
    // 顶部卡片
    const cards = [
      { label: "汉字", value: a.cjk.toLocaleString(), sub: `${a.words} 个英文/数字词` },
      { label: "字符（含空格）", value: a.charCount.toLocaleString(), sub: `不含空格 ${a.noSpace.toLocaleString()}` },
      { label: "段落", value: a.paragraphs.toLocaleString(), sub: `${a.sentences} 个句子` },
      { label: "标点", value: a.punct.toLocaleString(), sub: `平均每句 ${(a.sentences ? a.punct / a.sentences : 0).toFixed(1)} 个` },
    ];
    els.cards.innerHTML = cards.map((c) => `
      <div class="card card-stat">
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-sub">${c.sub}</div>
      </div>`).join("");

    // 时长
    const readMin = a.cjk / state.readSpeed;
    const speakMin = a.cjk / state.speakSpeed;
    els.durations.innerHTML = `
      <div class="dur-row"><span>默读</span><b>${fmtTime(readMin)}</b><span class="muted">@ ${state.readSpeed} 字/分</span></div>
      <div class="dur-row"><span>新闻播报</span><b>${fmtTime(speakMin)}</b><span class="muted">@ ${state.speakSpeed} 字/分</span></div>
      <div class="dur-row"><span>每段平均</span><b>${a.paragraphs ? fmtTime(readMin / a.paragraphs) : "—"}</b><span class="muted">汉字</span></div>`;

    // 长句
    const longs = [];
    a.sentences_raw.forEach((s, i) => {
      if (a.sentenceCjk[i] >= state.longLimit) longs.push({ s, n: a.sentenceCjk[i] });
    });
    els.longCount.textContent = longs.length;
    if (longs.length === 0) {
      els.longList.innerHTML = "";
      els.longNote.textContent = `没有超过 ${state.longLimit} 字的句子。`;
    } else {
      els.longList.innerHTML = longs.slice(0, 12).map((l, i) => `
        <li><span class="num">${l.n}字</span><span class="txt">${esc(l.s)}</span></li>`).join("");
      els.longNote.textContent = longs.length > 12 ? `仅显示前 12 句，共 ${longs.length} 句。` : `共 ${longs.length} 句偏长，建议拆分。`;
    }

    // 重复词组（2-4 字连续汉字片段）
    const reps = topRepeats(els.input.value);
    els.repeatCount.textContent = reps.length;
    if (reps.length === 0) {
      els.repeatList.innerHTML = `<li class="empty">无明显重复片段。</li>`;
    } else {
      els.repeatList.innerHTML = reps.map((r) => `
        <li><span class="num">×${r.n}</span><span class="txt">${esc(r.w)}</span></li>`).join("");
    }
  }

  // 2-4 字连续汉字片段频次，过滤掉单字、虚词、标点
  const STOP = new Set(["的话", "的是", "一个", "一些", "一种", "可以", "我们", "他们", "这个", "那个", "这是", "那是", "就是", "这样", "那样", "这是", "已经", "正在", "应当", "应该", "可能", "或者", "但是", "因为", "所以", "虽然", "然而", "不仅", "而且", "于是", "因此"]);
  function topRepeats(text) {
    const cjkOnly = text.match(/[一-鿿㐀-䶿]+/g) || [];
    const freq = new Map();
    for (const seg of cjkOnly) {
      const arr = [...seg];
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i + len <= arr.length; i++) {
          const w = arr.slice(i, i + len).join("");
          if (STOP.has(w)) continue;
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }
    }
    // 一个词若与更长词同源，倾向保留更长词；这里简单取频次≥3 的前 20
    return [...freq.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 20)
      .map(([w, n]) => ({ w, n }))
      .filter((x, _i, arr) => {
        // 去掉被更长高频词包含的短词
        return !arr.some((y) => y !== x && y.w.length > x.w.length && y.w.includes(x.w) && y.n >= x.n);
      });
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // ---------- 主流程 ----------
  function run() {
    const text = els.input.value;
    els.inputCount.textContent = `${(text.match(/[一-鿿㐀-䶿]/g) || []).length} 汉字 · ${[...text].length} 字符`;
    if (text.trim() === "") {
      els.cards.innerHTML = "";
      els.durations.innerHTML = "";
      els.longList.innerHTML = "";
      els.longCount.textContent = "0";
      els.repeatList.innerHTML = `<li class="empty">粘贴稿件后显示。</li>`;
      els.repeatCount.textContent = "0";
      setStatus("ready", "就绪");
      els.hint.textContent = "";
      return;
    }
    try {
      const a = analyze(text);
      render(a);
      setStatus("ok", "已统计");
      els.hint.textContent = "";
    } catch (e) {
      setStatus("error", "统计失败");
      els.hint.textContent = e.message || String(e);
    }
  }

  function setStatus(kind, text) {
    els.status.className = "status " + kind;
    els.status.textContent = text;
  }

  // ---------- 交互 ----------
  els.optRead.addEventListener("change", () => { state.readSpeed = +els.optRead.value; run(); });
  els.optSpeak.addEventListener("change", () => { state.speakSpeed = +els.optSpeak.value; run(); });
  els.optLong.addEventListener("change", () => { state.longLimit = +els.optLong.value; run(); });

  let debounce;
  els.input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 160);
  });

  const SAMPLE = `人工智能正在重塑新闻生产流程。多家媒体机构已部署大语言模型辅助编辑，用于初稿撰写、事实核查与多语言翻译。

记者的日常工具箱随之改变。过去需要数小时的资料检索，现在几分钟即可完成初步整理，但同时也带来了新的挑战。

业界普遍认为，AI 不会取代记者，但会取代不会使用 AI 的记者。掌握新工具的从业者，将在效率与深度上获得明显优势。然而，过度依赖自动化也可能削弱原创报道的独特性。`;

  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "clear-input") { els.input.value = ""; run(); els.input.focus(); }
    else if (act === "sample") { els.input.value = SAMPLE; run(); }
    else if (act === "paste") {
      navigator.clipboard.readText().then((t) => { els.input.value = t; run(); })
        .catch(() => { setStatus("error", "无法读取剪贴板"); els.hint.textContent = "请手动粘贴（Ctrl+V）"; });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.activeElement === els.input) { els.input.value = ""; run(); }
  });

  run();
})();
