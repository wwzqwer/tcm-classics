/* prescribe.js — 智能处方：病情 → 辨证 → 生成处方 + 最可能 5 个原方 */
"use strict";

const Prescribe = (() => {
  let kb = null, formulas = null, classics = null, cases = [];
  let bookAuthors = {}, physNames = new Map();
  let formulaIndex = {};   // normalize(name) -> formula object
  let itemKW = [];         // [{item, kw:Set}]
  let vocabSet = null;
  let caseIdx = null;      // 医案索引
  let lastResult = null;

  const BOOK_ALIAS = {
    "素问": "黄帝内经·素问", "灵枢": "灵枢经", "内经": "黄帝内经·素问",
    "金匮": "金匮要略", "本经": "神农本草经", "难经": "难经（节选）",
    "伤寒": "伤寒论", "温病条辨": "温病条辨",
  };

  function resolveBook(name) {
    if (!name) return {};
    const key = BOOK_ALIAS[name] || name;
    return bookAuthors[key] || {};
  }

  async function ensure() {
    if (kb) return;
    const [k, f, s, c, ba, ph] = await Promise.all([
      App.loadJSON("data/rx_kb.json"),
      App.loadJSON("data/formulas2.json"),
      App.loadJSON("data/syndromes.json"),
      App.loadJSON("data/rx_cases.json").catch(() => []),
      App.loadJSON("data/book_authors.json").catch(() => ({})),
      App.loadJSON("data/physicians.json").catch(() => []),
    ]);
    kb = k; formulas = f; classics = s; cases = c || [];
    bookAuthors = ba || {};
    physNames = new Map((ph || []).map(p => [p.name, p]));
    for (const fm of formulas) {
      formulaIndex[SearchEngine.normalize(fm.name)] = fm;
    }
    vocabSet = new Set(kb.symptom_vocab.filter(v => v.length >= 2));
    // 处方条目已由数据侧预计算症状关键词 kw
    itemKW = kb.items.map(it => {
      const kw = new Set(it.kw || []);
      if (!kw.size && it.sample) {
        const text = SearchEngine.normalize(it.sample);
        for (const t of matchVocab(text, vocabSet)) kw.add(t);
      }
      return { item: it, kw };
    });
    // 医案索引
    caseIdx = { byCombo: new Map(), bySyn: new Map(), byForm: new Map(), all: cases };
    for (const c of cases) {
      const ck = c.s + "|" + c.f;
      if (!caseIdx.byCombo.has(ck)) caseIdx.byCombo.set(ck, []);
      caseIdx.byCombo.get(ck).push(c);
      if (!caseIdx.bySyn.has(c.s)) caseIdx.bySyn.set(c.s, []);
      caseIdx.bySyn.get(c.s).push(c);
      if (!caseIdx.byForm.has(c.f)) caseIdx.byForm.set(c.f, []);
      caseIdx.byForm.get(c.f).push(c);
    }
  }

  /* 选取最相近的 3 个医案 */
  function pickCases(rx, inputToks) {
    if (!caseIdx || !rx) return [];
    const out = [];
    const pushUnique = (c, tag) => {
      if (out.length >= 3) return;
      if (out.some(x => x.text === c.t)) return;
      out.push({ syndrome: c.s, formula: c.f, text: c.t, tag });
    };
    // 1) 同证同方
    for (const c of (caseIdx.byCombo.get(rx.syndrome + "|" + rx.formula) || [])) pushUnique(c, "同证同方");
    // 2) 同证异方
    if (out.length < 3) {
      const seenForm = new Set([rx.formula]);
      for (const c of (caseIdx.bySyn.get(rx.syndrome) || [])) {
        if (out.length >= 3) break;
        if (seenForm.has(c.f)) continue;
        seenForm.add(c.f);
        pushUnique(c, "同证异方");
      }
    }
    // 3) 同方异证
    if (out.length < 3) {
      for (const c of (caseIdx.byForm.get(rx.formula) || [])) {
        if (out.length >= 3) break;
        pushUnique(c, "同方·证型相近");
      }
    }
    // 4) 症状相近
    if (out.length < 3 && inputToks.length) {
      const scored = [];
      for (const c of caseIdx.all) {
        const norm = SearchEngine.normalize(c.t);
        let hit = 0;
        for (const t of inputToks) if (norm.includes(t)) hit++;
        if (hit >= 2) scored.push({ c, hit });
      }
      scored.sort((a, b) => b.hit - a.hit);
      for (const { c } of scored) {
        if (out.length >= 3) break;
        pushUnique(c, "症状相近");
      }
    }
    return out;
  }

  /* 词表最大匹配 */
  function matchVocab(text, vset) {
    const hits = new Set();
    const L = text.length;
    for (let i = 0; i < L; i++) {
      let matched = false;
      for (let len = 5; len >= 2; len--) {
        if (i + len > L) continue;
        const sub = text.substr(i, len);
        if (vset.has(sub)) { hits.add(sub); i += len - 1; matched = true; break; }
      }
      if (matched) continue;
    }
    return [...hits];
  }

  /* 核心：病情 → 辨证 + 处方 + Top5 原方 */
  function analyze(rawInput, extraSymptoms) {
    const inputText = SearchEngine.normalize((rawInput || "") + " " + (extraSymptoms || []).join(" "));
    const inputToks = new Set(matchVocab(inputText, vocabSet));
    const toks = [...inputToks];
    if (!toks.length) {
      return { inputToks: [], rankedCount: 0, conclusion: null, rx: null, top5: [] };
    }
    const scoreItem = (it, kw) => {
      let hit = 0;
      for (const t of toks) if (kw.has(t)) hit++;
      let s = hit * 6;
      for (const t of toks) if (it.syndrome.includes(t)) s += 3;
      if (it.formula && inputText.includes(SearchEngine.normalize(it.formula))) s += 14;
      s += Math.log10(1 + (it.count || 1)) * 0.8;
      return s;
    };
    const ranked = itemKW.map(({ item, kw }) => ({ item, score: scoreItem(item, kw) }))
      .filter(x => x.score >= 6)
      .sort((a, b) => b.score - a.score);

    // ---- 辨证：经典证型（主症精确匹配）+ 统计证型 ----
    const synScores = [];
    for (const s of classics.syndromes) {
      let sc = 0;
      const hitSyms = [];
      for (const sym of s.symptoms) {
        const ns = SearchEngine.normalize(sym);
        if (toks.some(t => ns.includes(t) || t.includes(ns))) {
          sc += 5 + (ns.length >= 3 ? 2 : 0) + (ns.length >= 4 ? 1 : 0);
          hitSyms.push(sym);
        }
      }
      const plain = SearchEngine.normalize(s.name.replace(/（.*?）/g, ""));
      if (inputText.includes(plain)) sc += 14;
      if (sc >= 10) synScores.push({ kind: "classic", name: s.name, score: sc, data: s, hits: hitSyms });
    }
    for (const s of kb.syndromes) {
      let sc = 0;
      for (const t of toks) if (s.name.includes(t)) sc += 3 + (t.length >= 3 ? 2 : 0);
      if (inputText.includes(s.name)) sc += 10;
      if (sc >= 6) synScores.push({ kind: "stats", name: s.name, score: sc + Math.log10(1 + s.count) * 0.8, data: s, hits: [] });
    }
    synScores.sort((a, b) => b.score - a.score);

    // ---- Top5 原方（按方名去重） ----
    const seen = new Set();
    const top5 = [];
    for (const r of ranked) {
      const fn = (r.item.formula || "").trim();
      const key = SearchEngine.normalize(fn);
      if (key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      const fm = formulaIndex[key] || null;
      top5.push({
        formula: fn,
        syndrome: r.item.syndrome,
        score: r.score,
        count: r.item.count,
        herbs: r.item.herbs,
        book: fm ? fm.book : "医案处方统计",
        composition: fm ? fm.composition : "",
      });
      if (top5.length >= 5) break;
    }

    // ---- 生成一个处方：经典证型代表方优先，其次最佳统计组合 ----
    const buildRx = (item, extra) => {
      const fm = formulaIndex[SearchEngine.normalize(item.formula)] || null;
      return Object.assign({
        formula: item.formula,
        syndrome: item.syndrome,
        herbs: (item.herbs || []).slice(0, 14).map(h => ({ name: h.n, dose: h.d, freq: h.c })),
        count: item.count,
        classicComposition: fm ? fm.composition : "",
        book: fm ? fm.book : "医案处方统计",
      }, extra || {});
    };
    let rx = null;
    const topClassic = synScores.find(s => s.kind === "classic") || null;
    if (topClassic) {
      const reps = (topClassic.data.formula || "").split(/[、，,]/).map(s => s.trim()).filter(Boolean);
      for (const rep of reps) {
        const repNorm = SearchEngine.normalize(rep);
        let hit = ranked.find(r => SearchEngine.normalize(r.item.formula) === repNorm);
        if (!hit) {
          hit = itemKW.find(x => SearchEngine.normalize(x.item.formula) === repNorm);
          hit = hit ? { item: hit.item } : null;
        }
        if (hit && hit.item) {
          rx = buildRx(hit.item, { syndrome: topClassic.name, classicRepresentative: true, rep: rep });
          break;
        }
        const fm = formulaIndex[repNorm];
        if (fm) {
          rx = {
            formula: rep, syndrome: topClassic.name, herbs: [], count: 0,
            classicComposition: fm.composition || "", book: fm.book || "经典方剂",
            classicRepresentative: true, rep: rep,
          };
          break;
        }
      }
    }
    if (!rx && ranked.length) {
      // 回退：优先证型名称相近的医案组合，其次全局最佳
      let best = null, bestScore = 0;
      if (topClassic) {
        const base = SearchEngine.normalize(topClassic.name.replace(/证$/, ""));
        for (const { item } of itemKW) {
          const ns = SearchEngine.normalize(item.syndrome);
          let overlap = 0;
          for (let i = 0; i + 2 <= base.length; i++) {
            if (ns.includes(base.substr(i, 2))) overlap++;
          }
          if (overlap >= 2) {
            const sc = overlap * 2 + Math.log10(1 + (item.count || 1));
            if (sc > bestScore) { bestScore = sc; best = item; }
          }
        }
      }
      rx = buildRx(best || ranked[0].item, best ? { fromConclusion: true } : null);
    }

    // ---- 辨证结论：优先经典证型，其次统计证型，最后回退到最佳组合所属证型 ----
    let conclusion = synScores.find(s => s.kind === "classic") || synScores[0] || null;
    if (!conclusion && ranked.length) {
      const bs = ranked[0].item.syndrome;
      const st = kb.syndromes.find(x => x.name === bs) || null;
      conclusion = { kind: "stats", name: bs, score: 0, data: st, hits: [] };
    }
    const conclusionData = conclusion && conclusion.kind === "classic" ? conclusion.data : null;

    // ---- Top5：若处方为经典证型代表方，确保其进入候选 ----
    if (rx && rx.classicRepresentative) {
      const repNorm = SearchEngine.normalize(rx.formula);
      const exist = top5.find(t => SearchEngine.normalize(t.formula) === repNorm);
      if (exist) {
        exist.representative = true;
      } else {
        const fm = formulaIndex[repNorm];
        top5.unshift({
          formula: rx.formula, syndrome: rx.syndrome, score: 999, count: rx.count || 0,
          herbs: rx.herbs, book: fm ? fm.book : "经典方剂",
          composition: fm ? fm.composition : rx.classicComposition, representative: true,
        });
        if (top5.length > 5) top5.pop();
      }
    }
    // 证型相近的候选前置（代表方始终第一）
    if (topClassic) {
      const base = SearchEngine.normalize(topClassic.name.replace(/证$/, ""));
      const sim = (t) => {
        const ns = SearchEngine.normalize(t.syndrome);
        let c = 0;
        for (let i = 0; i + 2 <= base.length; i++) {
          if (ns.includes(base.substr(i, 2))) c++;
        }
        return c;
      };
      const reps = top5.filter(t => t.representative);
      const rest = top5.filter(t => !t.representative).sort((a, b) => sim(b) - sim(a) || b.score - a.score);
      top5.length = 0;
      top5.push(...reps, ...rest);
    }

    return {
      inputToks: toks,
      rankedCount: ranked.length,
      conclusion: conclusion ? {
        name: conclusion.name,
        kind: conclusion.kind,
        score: conclusion.score,
        hits: conclusion.hits || [],
        mechanism: conclusionData ? conclusionData.mechanism : "",
        treatment: conclusionData ? conclusionData.treatment : "",
        tongue: conclusionData ? conclusionData.tongue : "",
        pulse: conclusionData ? conclusionData.pulse : "",
        classic: conclusionData ? (conclusionData.classic || []) : [],
        formulas: (conclusion.kind !== "classic" && conclusion.data) ? (conclusion.data.formulas || []) : [],
      } : null,
      rx,
      top5,
      nearCases: pickCases(rx, toks),
    };
  }

  /* ---------- 渲染 ---------- */
  async function render(app, query) {
    await ensure();
    app.appendChild(App.el("h2", { class: "page-title" }, ["智能处方 · 辨证论治"]));
    app.appendChild(App.el("p", { class: "page-sub" },
      ["依据 " + kb.meta.pairs + " 个「证型—方剂」组合（源自 12.6 万条医案处方统计）与历代经典辨证体系，输入病情后生成一个参考处方，并罗列最可能的 5 个原方。" +
       "证型-方药对应关系来自真实医案统计，仅供学习研究，不可直接用于临床。"]));

    const box = App.el("div", { class: "rx-panel" });
    const ta = App.el("textarea", {
      class: "rx-input",
      rows: "4",
      placeholder: "请描述病情，例如：反复胃脘胀痛半年，饭后加重，嗳气泛酸，口干口苦，大便偏干，舌红苔黄腻，脉弦滑。",
    });
    if (query) ta.value = decodeURIComponent(query);
    box.appendChild(ta);

    // 症状快捷标签
    const chipsWrap = App.el("div", { class: "sym-cloud" });
    const quick = kb.symptom_vocab.slice(0, 42);
    for (const v of quick) {
      const chip = App.el("div", { class: "sym-chip" }, [v]);
      chip.addEventListener("click", () => {
        ta.value = (ta.value ? ta.value.replace(/[，,、\s]*$/, "") + "，" : "") + v;
        chip.classList.toggle("on");
      });
      chipsWrap.appendChild(chip);
    }
    box.appendChild(App.el("div", { class: "rx-label" }, ["常见症状（点击追加）"]));
    box.appendChild(chipsWrap);

    const btnRow = App.el("div", { class: "rx-actions" });
    const btn = App.el("button", { class: "btn" }, ["辨证并生成处方"]);
    const clr = App.el("button", { class: "btn ghost" }, ["清空"]);
    clr.addEventListener("click", () => { ta.value = ""; document.getElementById("rx-result").innerHTML = ""; });
    btn.addEventListener("click", () => {
      const res = analyze(ta.value, []);
      lastResult = res;
      renderResult(document.getElementById("rx-result"), res);
      document.getElementById("rx-result").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    ta.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") btn.click();
    });
    btnRow.append(btn, clr);
    box.appendChild(btnRow);
    app.appendChild(box);

    const result = App.el("div", { id: "rx-result" });
    app.appendChild(result);
  }

  /* 与本处方/条文相关的医家 */
  function collectRelated(res) {
    const names = [];
    const add = (book) => {
      const ba = resolveBook(book);
      if (ba.physician && !names.includes(ba.physician)) names.push(ba.physician);
    };
    if (res.rx) add(res.rx.book);
    for (const t of res.top5 || []) add(t.book);
    for (const q of (res.conclusion && res.conclusion.classic) || []) add(q.book);
    return names.map(n => physNames.get(n)).filter(Boolean).slice(0, 5);
  }

  function renderResult(root, res) {
    root.innerHTML = "";
    if (!res.inputToks.length) {
      root.appendChild(App.el("div", { class: "empty-tip" }, ["未能从描述中识别到中医症状词，请补充具体症状、舌象、脉象。"]));
      return;
    }
    // 识别到的症状
    const tokRow = App.el("div", { class: "rx-tokens" });
    tokRow.appendChild(App.el("span", { class: "rx-label" }, ["识别到的症候："]));
    for (const t of res.inputToks.slice(0, 40)) tokRow.appendChild(App.el("span", { class: "tok" }, [t]));
    root.appendChild(tokRow);

    // 辨证结论
    if (res.conclusion) {
      const c = res.conclusion;
      const card = App.el("div", { class: "rx-card" });
      card.appendChild(App.el("h3", {}, ["一、辨证结论"]));
      card.appendChild(App.el("div", { class: "rx-syn" }, [c.name]));
      if (c.hits && c.hits.length) {
        card.appendChild(App.el("p", {}, [App.el("b", {}, ["辨证依据："]), "命中主症 " + c.hits.join("、")]));
      }
      if (c.mechanism) card.appendChild(App.el("p", {}, [App.el("b", {}, ["病机："]), c.mechanism]));
      if (c.treatment) card.appendChild(App.el("p", {}, [App.el("b", {}, ["治法："]), c.treatment]));
      if (c.tongue || c.pulse) card.appendChild(App.el("p", {}, [App.el("b", {}, ["舌脉："]), (c.tongue || "") + "，" + (c.pulse || "")]));
      if (c.formulas && c.formulas.length) {
        card.appendChild(App.el("p", {}, [App.el("b", {}, ["统计常用方："]),
          c.formulas.map(x => x.f + "（" + x.c + "）").join("、")]));
      }
      for (const q of (c.classic || []).slice(0, 2)) {
        const qb = resolveBook(q.book);
        const who = (qb.physician_short || qb.physician) ? (qb.physician_short || qb.physician) + " " : "";
        card.appendChild(App.el("div", { class: "classic" }, [who + "《" + q.book + "》：" + q.quote]));
      }
      root.appendChild(card);
    }

    // 生成处方
    if (res.rx) {
      const r = res.rx;
      const card = App.el("div", { class: "rx-card rx-main" });
      card.appendChild(App.el("h3", {}, ["二、参考处方"]));
      const head = App.el("div", { class: "rx-head" });
      head.appendChild(App.el("span", { class: "rx-fname" }, [r.formula]));
      if (r.classicRepresentative) head.appendChild(App.el("span", { class: "rx-tag" }, ["经典证型代表方"]));
      head.appendChild(App.el("span", { class: "rx-src" }, ["（对应证型：" + r.syndrome + (r.count ? "；同证医案 " + r.count + " 例" : "") + "）"]));
      card.appendChild(head);

      if (r.herbs && r.herbs.length >= 2) {
        const table = App.el("table", { class: "rx-table" });
        const tr0 = App.el("tr");
        tr0.appendChild(App.el("th", {}, ["药味"]));
        tr0.appendChild(App.el("th", {}, ["参考剂量"]));
        tr0.appendChild(App.el("th", {}, ["同证使用频次"]));
        table.appendChild(tr0);
        for (const h of r.herbs) {
          const tr = App.el("tr");
          tr.appendChild(App.el("td", {}, [h.name]));
          tr.appendChild(App.el("td", {}, [fmtDose(h.dose)]));
          tr.appendChild(App.el("td", {}, [String(h.freq) + " 次"]));
          table.appendChild(tr);
        }
        card.appendChild(table);
        card.appendChild(App.el("p", { class: "rx-note" },
          ["剂量为同证医案处方中位数，供参考；实际用量须由医师根据年龄、体质、病情加减。"]));
      } else if (r.classicComposition) {
        card.appendChild(App.el("p", {}, [App.el("b", {}, ["经典组成："]), r.classicComposition]));
      }

      // 用法
      const usage = /丸/.test(r.formula) ? "制丸内服，每次适量，按医嘱。" :
        /散/.test(r.formula) ? "研末为散，每次适量，温水送服或按医嘱。" :
        "水煎服，每日一剂，分早晚两次温服；具体煎服法遵医嘱。";
      card.appendChild(App.el("p", {}, [App.el("b", {}, ["用法："]), usage]));
      const srcPara = App.el("p", {});
      srcPara.appendChild(App.el("b", {}, ["出处："]));
      if (r.book && r.book !== "医案处方统计") {
        const rb = resolveBook(r.book);
        if (rb.physician) {
          srcPara.appendChild(App.el("a", {
            class: "book-link",
            href: "#/physicians/" + encodeURIComponent(rb.physician),
          }, [rb.physician_short || rb.physician]));
          srcPara.appendChild(document.createTextNode("　"));
        }
        srcPara.appendChild(document.createTextNode("《" + r.book + "》" +
          (r.classicComposition ? "；组成参考：" + r.classicComposition : "")));
      } else {
        srcPara.appendChild(document.createTextNode("证型-方剂对应关系来自医案处方统计" +
          (r.classicComposition ? "；经典组成：" + r.classicComposition : "")));
      }
      card.appendChild(srcPara);
      card.appendChild(App.el("div", { class: "rx-warn" },
        ["⚠ 本处方由知识库统计与辨证规则生成，仅供中医学习与研究参考，不构成医疗建议；用药须经执业医师辨证确认，并遵守现行药典与法规。"]));
      root.appendChild(card);
    } else {
      root.appendChild(App.el("div", { class: "empty-tip" }, ["未匹配到合适的证型-方剂组合，请补充更具体的症状。"]));
    }

    // Top5 原方
    if (res.top5.length) {
      const card = App.el("div", { class: "rx-card" });
      card.appendChild(App.el("h3", {}, ["三、最可能的 5 个原方"]));
      res.top5.forEach((t, i) => {
        const row = App.el("div", { class: "rx-cand" });
        const h = App.el("div", { class: "rx-cand-head" });
        h.appendChild(App.el("span", { class: "rx-cand-no" }, [String(i + 1)]));
        h.appendChild(App.el("span", { class: "rx-cand-name" }, [t.formula]));
        if (t.representative) h.appendChild(App.el("span", { class: "rx-tag" }, ["代表方"]));
        h.appendChild(App.el("span", { class: "rx-cand-score" }, [t.representative ? "经典证型" : "匹配 " + t.score.toFixed(1)]));
        h.appendChild(App.el("span", { class: "rx-cand-syn" }, [t.syndrome]));
        row.appendChild(h);
        const detail = App.el("div", { class: "rx-cand-body" });
        const comp = t.composition || (t.herbs || []).map(x => x.n + fmtDose(x.d)).join("　");
        if (comp) detail.appendChild(App.el("p", {}, [App.el("b", {}, ["组成："]), comp]));
        const metaP = App.el("p", { class: "rx-cand-meta" });
        metaP.appendChild(document.createTextNode("出处："));
        const tb = resolveBook(t.book);
        if (tb.physician) {
          metaP.appendChild(App.el("a", {
            class: "book-link",
            href: "#/physicians/" + encodeURIComponent(tb.physician),
          }, [tb.physician_short || tb.physician]));
          metaP.appendChild(document.createTextNode("　"));
        }
        metaP.appendChild(document.createTextNode((t.book ? "《" + t.book + "》" : "医案统计") +
          (t.count ? "；同证医案 " + t.count + " 例" : "")));
        detail.appendChild(metaP);
        row.appendChild(detail);
        card.appendChild(row);
      });
      root.appendChild(card);
    }

    // 最相近的医案
    if (res.nearCases && res.nearCases.length) {
      const card = App.el("div", { class: "rx-card" });
      card.appendChild(App.el("h3", {}, ["四、最相近的 3 个医案"]));
      res.nearCases.forEach((c, i) => {
        const row = App.el("div", { class: "rx-case" });
        const head = App.el("div", { class: "rx-case-head" });
        head.appendChild(App.el("span", { class: "rx-cand-no" }, [String(i + 1)]));
        head.appendChild(App.el("span", { class: "rx-case-tag" }, [c.tag]));
        head.appendChild(App.el("span", { class: "rx-case-meta" }, [c.syndrome + " · " + c.formula]));
        row.appendChild(head);
        const txt = App.el("div", { class: "rx-case-text" }, [c.text]);
        const toggle = App.el("span", { class: "rx-case-toggle" }, ["展开全文"]);
        let expanded = false;
        txt.style.maxHeight = "5.2em";
        txt.style.overflow = "hidden";
        toggle.addEventListener("click", () => {
          expanded = !expanded;
          txt.style.maxHeight = expanded ? "none" : "5.2em";
          toggle.textContent = expanded ? "收起" : "展开全文";
        });
        row.appendChild(txt);
        row.appendChild(toggle);
        card.appendChild(row);
      });
      card.appendChild(App.el("p", { class: "rx-note" },
        ["医案原文来自 SFT 数据集真实医案，已做匿名化处理；「同证同方」为同证型同方剂，「同证异方」为同证型他方，「症状相近」为症状高度重合的医案。"]));
      root.appendChild(card);
    }

    // 相关医家
    const related = collectRelated(res);
    if (related.length) {
      const card = App.el("div", { class: "rx-card" });
      card.appendChild(App.el("h3", {}, ["五、相关医家"]));
      for (const p of related) {
        const row = App.el("div", { class: "rx-phys" });
        row.appendChild(App.el("a", {
          class: "phys-name",
          href: "#/physicians/" + encodeURIComponent(p.name),
        }, [p.name]));
        row.appendChild(App.el("span", { class: "phys-dyn" }, [p.dynasty + (p.school ? " · " + p.school : "")]));
        if (p.works && p.works.length) {
          row.appendChild(App.el("span", { class: "phys-works" }, ["《" + p.works.slice(0, 3).join("》《") + "》"]));
        }
        if (p.books && p.books.length) {
          row.appendChild(App.el("a", {
            class: "book-link",
            href: "#/books/" + p.books[0].id,
          }, ["读其馆藏：", p.books[0].title]));
        }
        card.appendChild(row);
      }
      root.appendChild(card);
    }
  }

  function fmtDose(d) {
    if (d == null) return "";
    const n = Math.round(d * 10) / 10;
    return n + " g";
  }

  return { render, analyze, ensure };
})();



