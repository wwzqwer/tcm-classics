/* bianzheng.js — 辨证论治模块：证型浏览 + 症状向导 */
"use strict";

const BianZheng = (() => {
  let data = null;
  let state = { mode: "browse", cat: "全部", picked: new Set() };

  const SYMPTOMS = [
    "发热", "恶寒", "恶风", "寒热往来", "壮热", "潮热", "五心烦热", "午后潮热", "身热夜甚",
    "无汗", "自汗", "盗汗", "大汗出", "汗出恶风",
    "头痛", "头重", "眩晕", "耳鸣", "耳聋", "目眩", "目赤", "视物模糊", "咽干", "咽痛",
    "口苦", "口渴", "口渴喜冷饮", "口干不欲饮", "口淡不渴", "口腻", "口舌生疮",
    "咳嗽", "咳喘", "干咳少痰", "痰多色白", "痰黄黏稠", "喘息", "气短", "少气懒言", "胸闷", "胸痛", "心悸", "怔忡",
    "胁痛", "脘腹胀满", "腹满", "腹痛", "喜温喜按", "腹痛拒按", "少腹硬满", "腰膝酸软", "腰痛",
    "恶心", "呕吐", "干呕", "呃逆", "嗳气", "善太息", "吞酸", "纳呆", "食少", "饥不欲食", "消谷善饥",
    "大便干结", "大便秘结", "泄泻", "下利", "下利清谷", "五更泄泻", "便溏", "便血",
    "小便不利", "小便短赤", "小便清长", "夜尿频多", "尿血",
    "水肿", "黄疸", "面色萎黄", "面色晄白", "面色黧黑", "面红目赤", "潮热颧红",
    "失眠", "多梦", "嗜睡", "但欲寐", "健忘", "烦躁", "心烦", "易怒", "抑郁", "惊恐",
    "神疲乏力", "倦怠嗜卧", "肢体困重", "四肢厥冷", "手足心热", "手足麻木", "肢体震颤", "半身不遂",
    "肌肤甲错", "皮下瘀斑", "斑疹紫黑", "舌紫暗", "瘀点瘀斑", "舌红", "舌淡", "舌绛", "少苔", "苔黄", "苔白", "苔腻", "苔黄燥",
    "脉浮", "脉沉", "脉弦", "脉数", "脉细", "脉弱", "脉滑", "脉紧", "脉缓", "脉洪", "脉涩", "脉结代",
    "遗精", "阳痿", "月经不调", "痛经", "闭经", "崩漏", "带下",
  ];

  async function render(app, mode) {
    data = await App.loadJSON("data/syndromes.json");
    if (mode === "wizard") state.mode = "wizard";
    else if (mode === "browse") state.mode = "browse";

    app.appendChild(App.el("h2", { class: "page-title" }, ["辨证论治"]));
    app.appendChild(App.el("p", { class: "page-sub" },
      ["辨证论治是中医临床的灵魂。《伤寒论》立六经辨证，《温热论》立卫气营血辨证，《温病条辨》立三焦辨证，后世复有脏腑辨证与气血津液辨证。每证均附治法、代表方与经典条文依据。"]));

    const tabs = App.el("div", { class: "syndrome-cat-tabs" });
    const modes = [["browse", "按证型浏览"], ["wizard", "症状引导辨证"]];
    for (const [id, label] of modes) {
      const t = App.el("div", { class: "cat-tab" + (state.mode === id ? " active" : "") }, [label]);
      t.addEventListener("click", () => { state.mode = id; location.hash = "#/bianzheng/" + id; });
      tabs.appendChild(t);
    }
    app.appendChild(tabs);

    if (state.mode === "browse") renderBrowse(app);
    else renderWizard(app);
  }

  function renderBrowse(app) {
    const cats = ["全部"].concat(data.categories);
    const row = App.el("div", { class: "syndrome-cat-tabs" });
    for (const c of cats) {
      const t = App.el("div", { class: "cat-tab" + (state.cat === c ? " active" : "") }, [c]);
      t.addEventListener("click", () => {
        state.cat = c;
        const box = document.getElementById("syn-list");
        if (box) box.innerHTML = "";
        fillSynList(box);
      });
      row.appendChild(t);
    }
    app.appendChild(row);

    const list = App.el("div", { id: "syn-list" });
    app.appendChild(list);
    fillSynList(list);
  }

  function fillSynList(box) {
    const list = state.cat === "全部" ? data.syndromes : data.syndromes.filter(s => s.category === state.cat);
    for (const s of list) {
      const card = App.el("div", { class: "syn-card" }, [
        App.el("h4", {}, [s.name]),
        App.el("div", { class: "syn-cat" }, [s.category + " · 治法：" + s.treatment]),
      ]);
      const body = App.el("div", { class: "syn-body" });
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["主症："]), s.symptoms.join("、")]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["舌脉："]), s.tongue + "，" + s.pulse]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["病机："]), s.mechanism]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["代表方："]), App.el("b", {}, [s.formula])]));
      const cq = App.el("div", { class: "classic" });
      (s.classic || []).slice(0, 2).forEach(q => {
        cq.appendChild(App.el("div", { class: "q" }, ["《" + q.book + "》：" + q.quote]));
      });
      body.appendChild(cq);
      card.appendChild(body);
      box.appendChild(card);
    }
  }

  function renderWizard(app) {
    app.appendChild(App.el("p", { class: "wizard-note" },
      ["勾选患者所见的症状（可多选），系统将依据各证型主症进行匹配评分，按匹配度推荐证型，并给出治法、代表方与经典条文依据。"]));

    const cloud = App.el("div", { class: "symptom-cloud" });
    for (const s of SYMPTOMS) {
      const chip = App.el("div", { class: "sym-chip" + (state.picked.has(s) ? " on" : "") }, [s]);
      chip.addEventListener("click", () => {
        if (state.picked.has(s)) state.picked.delete(s);
        else state.picked.add(s);
        chip.classList.toggle("on");
        updateMatches();
      });
      cloud.appendChild(chip);
    }
    app.appendChild(cloud);

    const actionRow = App.el("div", { style: "margin-bottom:16px;display:flex;gap:10px;" });
    const clear = App.el("button", { class: "btn ghost" }, ["清空所选"]);
    clear.addEventListener("click", () => {
      state.picked.clear();
      document.querySelectorAll(".sym-chip.on").forEach(c => c.classList.remove("on"));
      updateMatches();
    });
    actionRow.appendChild(clear);
    app.appendChild(actionRow);

    app.appendChild(App.el("div", { class: "section-title" }, ["匹配结果"]));
    const box = App.el("div", { id: "match-box" });
    app.appendChild(box);
    updateMatches();
  }

  function updateMatches() {
    const box = document.getElementById("match-box");
    if (!box) return;
    box.innerHTML = "";
    if (!state.picked.size) {
      box.appendChild(App.el("div", { class: "empty-tip" }, ["尚未选择症状，请在症状中勾选。"]));
      return;
    }
    const scored = data.syndromes.map(s => {
      let hit = 0;
      for (const sym of state.picked) {
        if (s.symptoms.some(x => SearchEngine.normalize(x).includes(SearchEngine.normalize(sym)))) hit++;
      }
      const ratio = hit / s.symptoms.length;
      const score = hit * 2 + ratio * 2;
      return { s, hit, score };
    }).filter(x => x.hit > 0).sort((a, b) => b.score - a.score).slice(0, 8);

    if (!scored.length) {
      box.appendChild(App.el("div", { class: "empty-tip" }, ["所勾选症状与知识库证型匹配较少，请增删症状后再试。"]));
      return;
    }
    for (const { s, hit, score } of scored) {
      const card = App.el("div", { class: "match-card" }, [
        App.el("span", { class: "score" }, ["匹配 " + hit + " 项 · " + score.toFixed(1) + " 分"]),
        App.el("h4", {}, [s.name]),
        App.el("div", { class: "syn-cat" }, [s.category]),
      ]);
      const body = App.el("div", { class: "syn-body" });
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["主症："]), s.symptoms.join("、")]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["舌脉："]), s.tongue + "，" + s.pulse]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["治法："]), App.el("b", {}, [s.treatment])]));
      body.appendChild(App.el("div", {}, [App.el("span", { class: "lbl" }, ["代表方："]), App.el("b", { style: "color:var(--cinnabar);" }, [s.formula])]));
      const cq = App.el("div", { class: "classic" });
      (s.classic || []).slice(0, 2).forEach(q => {
        cq.appendChild(App.el("div", { class: "q" }, ["《" + q.book + "》：" + q.quote]));
      });
      body.appendChild(cq);
      card.appendChild(body);
      box.appendChild(card);
    }
  }

  return { render };
})();
