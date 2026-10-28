/* fangyao.js — 方药检索模块 */
"use strict";

const FangYao = (() => {
  let formulas = null, herbs = null, bookAuthors = {};
  let state = { tab: "formula", q: "", filter: "", phys: "" };

  async function render(app, query) {
    [formulas, herbs, bookAuthors] = await Promise.all([
      App.loadJSON("data/formulas2.json"),
      App.loadJSON("data/herbs2.json"),
      App.loadJSON("data/book_authors.json").catch(() => ({})),
    ]);
    if (query) state.q = query;

    app.appendChild(App.el("h2", { class: "page-title" }, ["方药检索"]));
    app.appendChild(App.el("p", { class: "page-sub" },
      ["方剂 " + formulas.length + " 首：经方（《伤寒论》《金匮要略》）、温病方（《温病条辨》）、时方（《汤头歌诀》），另有医案处方统计方 " +
       formulas.filter(f => (f.sources || []).includes("rxkb")).length + " 首；本草 " + herbs.length + " 味：《神农本草经》349 味＋医案用药 " + (herbs.length - 349) + " 味。数据构建于 2026-10-27。"]));

    // 页签
    const tabs = App.el("div", { class: "syndrome-cat-tabs" });
    const tabDefs = [["formula", "方剂（" + formulas.length + "）"], ["herb", "本草（" + herbs.length + "）"]];
    for (const [id, label] of tabDefs) {
      const t = App.el("div", { class: "cat-tab" + (state.tab === id ? " active" : "") }, [label]);
      t.addEventListener("click", () => {
        state.tab = id;
        app.innerHTML = "";
        render(app, null);
      });
      tabs.appendChild(t);
    }
    app.appendChild(tabs);

    // 检索框
    const bar = App.el("div", { class: "search-bar" });
    const input = App.el("input", { type: "search", placeholder: state.tab === "formula" ? "检索方名、组成、出处或医家（如：桂枝汤 / 八味解郁汤 / 张仲景 / 泻心）" : "检索药名、性味或主治（如：甘草 / 辛温 / 咳嗽）" });
    input.value = state.q;
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        state.q = input.value.trim();
        rerenderResults(app);
      }
    });
    const btn = App.el("button", { class: "btn" }, ["检索"]);
    btn.addEventListener("click", () => { state.q = input.value.trim(); rerenderResults(app); });
    bar.append(input, btn);
    app.appendChild(bar);

    // 筛选（方剂按出处与医家）
    if (state.tab === "formula") {
      const filterRow = App.el("div", { class: "filter-row" });
      const sel = App.el("select");
      const srcs = [["", "全部出处"], ["shanghanlun", "伤寒论"], ["jinkui", "金匮要略"], ["wenbing", "温病条辨"], ["tangtou", "汤头歌诀"], ["rxkb", "医案处方统计"]];
      for (const [v, l] of srcs) {
        const o = App.el("option", { value: v }, [l]);
        if (state.filter === v) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => { state.filter = sel.value; rerenderResults(app); });
      filterRow.appendChild(sel);

      const physSel = App.el("select");
      physSel.appendChild(App.el("option", { value: "" }, ["全部医家"]));
      const physNames = [...new Set(formulas.map(f => (bookAuthors[f.book] || {}).physician).filter(Boolean))].sort();
      for (const n of physNames) {
        const o = App.el("option", { value: n }, [n + "（" + formulas.filter(f => (bookAuthors[f.book] || {}).physician === n).length + " 方）"]);
        if (state.phys === n) o.selected = true;
        physSel.appendChild(o);
      }
      physSel.addEventListener("change", () => { state.phys = physSel.value; rerenderResults(app); });
      filterRow.appendChild(physSel);
      app.appendChild(filterRow);
    }

    const results = App.el("div", { id: "fy-results" });
    app.appendChild(results);
    rerenderResults(app);
  }

  function rerenderResults(app) {
    const box = document.getElementById("fy-results");
    if (!box) return;
    box.innerHTML = "";
    const q = SearchEngine.normalize(state.q);
    const terms = SearchEngine.expandTerms(state.q);

    const andFilter = (list, fieldFn) => list.filter(o => {
      const norm = fieldFn(o);
      return terms.every(t => norm.includes(t));
    });
    const orRank = (list, fieldFn) => list.map(o => {
      const norm = fieldFn(o);
      let hit = 0;
      for (const t of terms) if (norm.includes(t)) hit++;
      return { o, hit, len: norm.length };
    }).filter(x => x.hit > 0).sort((a, b) => b.hit - a.hit || a.len - b.len).map(x => x.o);

    // 名称匹配优先级：完全相等 > 以关键词开头 > 包含 > 仅组成包含
    const nameRank = (name) => {
      const n = SearchEngine.normalize(name || "");
      const q0 = terms[0] || "";
      if (!q0) return 3;
      if (n === q0) return 0;
      if (n.startsWith(q0)) return 1;
      if (n.includes(q0)) return 2;
      return 3;
    };
    const sortByName = (list) => list.slice().sort((a, b) => nameRank(a.name) - nameRank(b.name));

    if (state.tab === "formula") {
      let list = formulas;
      if (state.filter) list = list.filter(f => (f.sources || []).includes(state.filter));
      if (state.phys) list = list.filter(f => (bookAuthors[f.book] || {}).physician === state.phys);
      if (q) {
        const fieldFn = f => SearchEngine.normalize((f.name || "") + " " + (f.composition || "") + " " +
          (f.book || "") + " " + ((bookAuthors[f.book] || {}).physician || ""));
        let picked = andFilter(list, fieldFn);
        if (!picked.length && terms.length > 1) picked = orRank(list, fieldFn);
        list = picked;
      }
      list = sortByName(list).slice(0, 80);
      if (!list.length) { box.appendChild(App.el("div", { class: "empty-tip" }, ["未找到匹配方剂。"])); return; }
      for (const f of list) {
        const ba = bookAuthors[f.book] || {};
        const src = App.el("div", { class: "fy-src" }, ["出自《" + f.book + "》"]);
        if (ba.physician) {
          src.appendChild(document.createTextNode(" · "));
          src.appendChild(App.el("a", {
            class: "book-link",
            href: "#/physicians/" + encodeURIComponent(ba.physician),
          }, [ba.physician_short || ba.physician]));
        }
        const card = App.el("div", { class: "fy-card" }, [
          App.el("h4", {}, [f.name]),
          src,
        ]);
        if (f.rx_count) {
          card.appendChild(App.el("span", { class: "fy-count" }, ["医案 " + f.rx_count + " 例"]));
        }
        if (f.syndromes && f.syndromes.length) {
          card.appendChild(App.el("div", { class: "fy-count" }, ["相关证型：" + f.syndromes.slice(0, 4).join("、")]));
        }
        if (f.composition) {
          const comp = App.el("div", { class: "fy-comp" });
          comp.innerHTML = highlightText(f.composition, q, terms);
          card.appendChild(comp);
        }
        box.appendChild(card);
      }
    } else {
      let list = herbs;
      if (q) {
        const fieldFn = h => SearchEngine.normalize((h.name || "") + " " + (h.flavor || "") + " " + (h.effect || ""));
        let picked = andFilter(list, fieldFn);
        if (!picked.length && terms.length > 1) picked = orRank(list, fieldFn);
        list = picked;
      }
      list = sortByName(list).slice(0, 100);
      if (!list.length) { box.appendChild(App.el("div", { class: "empty-tip" }, ["未找到匹配药物。"])); return; }
      for (const h of list) {
        const card = App.el("div", { class: "herb-card" }, [
          App.el("h4", {}, [h.name]),
          App.el("span", { class: "grade" }, [h.grade]),
          App.el("div", { class: "flavor" }, [h.flavor]),
          App.el("div", { class: "effect" }, [h.effect]),
          App.el("div", { class: "fy-src" }, ["出自《神农本草经》"]),
        ]);
        box.appendChild(card);
      }
    }
  }

  function highlightText(text, q, terms) {
    let out = App.esc(text);
    const targets = terms.slice(0, 10).filter(t => t.length >= 2);
    for (const t of targets) {
      try {
        const re = new RegExp(App.esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        out = out.replace(re, "<em>$&</em>");
      } catch (e) { /* ignore */ }
    }
    return out;
  }

  return { render };
})();

