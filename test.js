// textstats 测试 — node test.js
// 按需求场景组织：正常稿件 / 边界 / 异常输入。

const S = require("./stats.js");

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
}
function ok(name, cond) {
  if (cond) pass++; else { fail++; console.log(`FAIL ${name}`); }
}

// ---------- 汉字计数 ----------
{
  const a = S.analyze("记者今天采访了三位专家。");
  eq("汉字数", a.cjk, 11);
  eq("标点计入 punct", a.punct, 1);
  eq("汉字不含标点", a.cjk, 11);
}

// 中文不按空格分词
{
  const a = S.analyze("人工智能");
  eq("无空格中文仍计 4 字", a.cjk, 4);
  eq("中文不算拉丁词", a.words, 0);
}

// 英文与数字
{
  const a = S.analyze("GDP 增长 5.2 个百分点");
  eq("拉丁词数 GDP/5/2", a.words, 3);
  eq("其中汉字", a.cjk, 6);
}

// ---------- 空格与字符 ----------
{
  const a = S.analyze("a b\tc\nd");
  eq("含空格字符数", a.charCount, 7);
  eq("不含空格字符数", a.noSpace, 4);
}

// ---------- 段落 ----------
{
  const t = "第一段。\n\n第二段。\n\n第三段。";
  eq("空行分段", S.analyze(t).paragraphs, 3);
}
{
  eq("单换行不分段", S.analyze("上句。\n下句。").paragraphs, 1);
  eq("首尾空行不产生空段", S.analyze("\n\n正文。\n\n").paragraphs, 1);
  eq("多个空行算一次分隔", S.analyze("甲。\n\n\n\n乙。").paragraphs, 2);
}

// ---------- 句子切分 ----------
{
  const a = S.analyze("第一句。第二句！第三句？");
  eq("中文句末标点切分", a.sentences, 3);
  eq("标点留在句尾", a.sentences_raw[0], "第一句。");
}
{
  eq("英文句末标点", S.analyze("One! Two? Three.").sentences, 3);
  eq("无句末标点算一句", S.analyze("没有标点的一句话").sentences, 1);
  eq("逗号不切句", S.analyze("上半句，下半句。").sentences, 1);
}

// ---------- 长句检测（编辑最常用） ----------
{
  const short = "短句。";
  const long = "这" + "个".repeat(60) + "。";
  const a = S.analyze(short + long);
  const longs = S.longSentences(a, 50);
  eq("检出 1 句长句", longs.length, 1);
  ok("长句字数 >= 50", longs[0].n >= 50);
  eq("阈值以下不报", S.longSentences(S.analyze(short), 50).length, 0);
}
{
  // 边界：正好等于阈值应算长句
  const a = S.analyze("字".repeat(50) + "。");
  eq("等于阈值即计入", S.longSentences(a, 50).length, 1);
  eq("阈值减一不计入", S.longSentences(S.analyze("字".repeat(49) + "。"), 50).length, 0);
}

// ---------- 时长格式化 ----------
{
  eq("0 分", S.fmtTime(0), "0 秒");
  eq("负数按 0", S.fmtTime(-5), "0 秒");
  eq("30 秒", S.fmtTime(0.5), "30 秒");
  eq("整分", S.fmtTime(2), "2 分");
  eq("分加秒", S.fmtTime(1.5), "1 分 30 秒");
  eq("NaN 按 0", S.fmtTime(NaN), "0 秒");
  eq("Infinity 按 0", S.fmtTime(Infinity), "0 秒");
}

// 播报时长符合常识：600 字约 2.5 分钟 @240字/分
{
  const a = S.analyze("字".repeat(600));
  eq("600 字汉字数", a.cjk, 600);
  eq("240字/分 播报时长", S.fmtTime(a.cjk / 240), "2 分 30 秒");
  eq("300字/分 默读时长", S.fmtTime(a.cjk / 300), "2 分");
}

// ---------- 重复片段 ----------
{
  const t = "改革开放改革开放改革开放";
  const reps = S.topRepeats(t);
  ok("检出重复片段", reps.length > 0);
  ok("保留较长片段", reps.some((r) => r.w.length >= 2 && r.n >= 3));
}
{
  eq("低于阈值不报", S.topRepeats("改革开放改革开放").length, 0);
  eq("无重复不报", S.topRepeats("每个字都不同的一段话").length, 0);
  ok("虚词被过滤", !S.topRepeats("我们我们我们").some((r) => r.w === "我们"));
}

// ---------- 空输入与异常 ----------
{
  const a = S.analyze("");
  eq("空文本汉字 0", a.cjk, 0);
  eq("空文本段落 0", a.paragraphs, 0);
  eq("空文本句子 0", a.sentences, 0);
  eq("空文本字符 0", a.charCount, 0);
  eq("空文本长句 0", S.longSentences(a, 50).length, 0);
  eq("空文本重复 0", S.topRepeats("").length, 0);
}
{
  const a = S.analyze("   \n\t  ");
  eq("纯空白汉字 0", a.cjk, 0);
  eq("纯空白无段落", a.paragraphs, 0);
  eq("纯空白 noSpace 0", a.noSpace, 0);
}

// ---------- 特殊字符 ----------
{
  // 与符号 = 3 个汉字；emoji 与 ★ 都不算
  const a = S.analyze("emoji 😀 与符号 ★");
  eq("emoji 不算汉字", a.cjk, 3);
  ok("emoji 计入字符数", a.charCount > 0);
}
{
  // 繁体字也应计为汉字
  eq("繁体计入汉字", S.analyze("繁體字").cjk, 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
