/* theme.js — 自定义配色：预设主题 + 原生色盘自选，localStorage 记忆 */
"use strict";

const Theme = (() => {
  const KEY = "tcm-theme-v1";
  const DEFAULTS = { "--paper": "#f7f1e3", "--cinnabar": "#b03a2e", "--gold": "#a8863c" };
  const PRESETS = [
    { name: "朱砂", vars: { "--paper": "#f7f1e3", "--cinnabar": "#b03a2e", "--gold": "#a8863c" } },
    { name: "青黛", vars: { "--paper": "#eef2f6", "--cinnabar": "#2f5d7c", "--gold": "#b98a2f" } },
    { name: "竹青", vars: { "--paper": "#eef3e4", "--cinnabar": "#3f6b4d", "--gold": "#a97b2f" } },
    { name: "绛紫", vars: { "--paper": "#f6eef2", "--cinnabar": "#7d3a6b", "--gold": "#b0833c" } },
    { name: "茶褐", vars: { "--paper": "#f4ecdf", "--cinnabar": "#8a5a2b", "--gold": "#b07c1f" } },
    { name: "黛蓝", vars: { "--paper": "#eaeff3", "--cinnabar": "#28475e", "--gold": "#a67c2e" } },
  ];

  let panel = null;

  function current() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s["--paper"]) return Object.assign({}, DEFAULTS, s);
    } catch (e) { /* 忽略损坏数据 */ }
    return Object.assign({}, DEFAULTS);
  }

  function apply(vars, save) {
    for (const [k, v] of Object.entries(vars)) {
      if (/^#[0-9a-fA-F]{6}$/.test(v)) document.documentElement.style.setProperty(k, v);
    }
    if (save) {
      try { localStorage.setItem(KEY, JSON.stringify(vars)); } catch (e) { /* 隐私模式等 */ }
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    apply(DEFAULTS, false);
    syncInputs();
    syncActive();
  }

  function toggle() {
    if (!panel) buildPanel();
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "theme-panel";
    panel.style.display = "none";

    const h = document.createElement("h4");
    h.textContent = "配色方案";
    panel.appendChild(h);

    const presets = document.createElement("div");
    presets.className = "theme-presets";
    PRESETS.forEach((p, i) => {
      const sw = document.createElement("div");
      sw.className = "theme-swatch";
      sw.title = p.name;
      sw.style.background =
        "linear-gradient(135deg, " + p.vars["--cinnabar"] + " 0 45%, " +
        p.vars["--gold"] + " 45% 75%, " + p.vars["--paper"] + " 75%)";
      sw.dataset.idx = i;
      const lbl = document.createElement("span");
      lbl.textContent = p.name;
      sw.appendChild(lbl);
      sw.addEventListener("click", () => {
        apply(p.vars, true);
        syncInputs();
        syncActive();
      });
      presets.appendChild(sw);
    });
    panel.appendChild(presets);

    const rows = [
      ["主色（标题 / 按钮）", "--cinnabar"],
      ["点缀色（标签 / 边框）", "--gold"],
      ["纸色（页面背景）", "--paper"],
    ];
    for (const [label, key] of rows) {
      const row = document.createElement("div");
      row.className = "theme-row";
      const lb = document.createElement("span");
      lb.textContent = label;
      const inp = document.createElement("input");
      inp.type = "color";
      inp.dataset.key = key;
      inp.value = current()[key] || DEFAULTS[key] || "#888888";
      inp.addEventListener("input", () => {
        const vars = current();
        vars[key] = inp.value;
        apply(vars, true);
        syncActive();
      });
      row.appendChild(lb);
      row.appendChild(inp);
      panel.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "theme-actions";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn ghost";
    resetBtn.textContent = "恢复默认";
    resetBtn.addEventListener("click", reset);
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn";
    closeBtn.textContent = "完成";
    closeBtn.addEventListener("click", () => { panel.style.display = "none"; });
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    panel.appendChild(actions);

    document.body.appendChild(panel);
    syncActive();
  }

  function syncInputs() {
    if (!panel) return;
    const cur = current();
    panel.querySelectorAll('input[type="color"]').forEach(inp => {
      const k = inp.dataset.key;
      if (cur[k]) inp.value = cur[k];
    });
  }

  function syncActive() {
    if (!panel) return;
    const cur = current();
    panel.querySelectorAll(".theme-swatch").forEach(sw => {
      const p = PRESETS[Number(sw.dataset.idx)];
      sw.classList.toggle("active",
        !!p && p.vars["--cinnabar"] === cur["--cinnabar"] &&
        p.vars["--gold"] === cur["--gold"] && p.vars["--paper"] === cur["--paper"]);
    });
  }

  function init() {
    apply(current(), false); // 页面渲染前恢复上次选择的配色
    const btn = document.getElementById("themeBtn");
    if (btn) {
      btn.addEventListener("click", e => { e.stopPropagation(); toggle(); });
    }
    document.addEventListener("click", e => {
      if (panel && panel.style.display !== "none" && !panel.contains(e.target) && e.target !== btn) {
        panel.style.display = "none";
      }
    });
  }

  return { init };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Theme.init);
} else {
  Theme.init();
}
