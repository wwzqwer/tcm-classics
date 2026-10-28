/* app.js — 杏林溯源 核心应用：路由、数据加载、首页、古籍检索/阅读、历代医家 */
"use strict";

const App = (() => {
  const cache = {};
  const state = {
    route: { page: "home" },
    booksIndex: null,
    currentBook: null,
    currentBookData: null,
  };

  async function loadJSON(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error("加载失败: " + url);
    cache[url] = await res.json();
    return cache[url];
  }

  /* ---------- 渲染工具 ---------- */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  /* ---------- 路由 ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    return { page: parts[0] || "home", args: parts.slice(1) };
  }

  /* 古籍页的三类意图：检索 / 阅读 / 书目 */
  function decideBooksRoute(args) {
    if (!args || !args.length) return { mode: "list" };
    const qarg = args.find(a => a.startsWith("q="));
    if (qarg) {
      let q = qarg.slice(2);
      try { q = decodeURIComponent(q); } catch (e) { /* 保留原值 */ }
      return { mode: "search", query: q.trim() };
    }
    let book = args[0], chapter = args[1] || "";
    try { book = decodeURIComponent(book); } catch (e) { /* 保留原值 */ }
    try { chapter = chapter ? decodeURIComponent(chapter) : ""; } catch (e) { /* 保留原值 */ }
    return { mode: "reader", book, chapter };
  }

  async function route() {
    const r = parseHash();
    state.route = r;
    document.querySelectorAll(".main-nav a").forEach(a => {
      a.classList.toggle("active", a.dataset.route === (r.page || "home"));
    });
    const app = document.getElementById("app");
    try {
      switch (r.page) {
        case "home": app.innerHTML = ""; renderHome(app); break;
        case "books": {
          app.innerHTML = "";
          const decided = decideBooksRoute(r.args);
          if (decided.mode === "search") await renderBooks(app, decided.query);
          else if (decided.mode === "reader") await renderReader(app, decided.book, decided.chapter);
          else await renderBooks(app, null);
          break;
        }
        case "fangyao": app.innerHTML = ""; await FangYao.render(app, r.args[0] ? decodeURIComponent(r.args[0]) : null); break;
        case "bianzheng": app.innerHTML = ""; await BianZheng.render(app, r.args[0] || null); break;
        case "prescribe": app.innerHTML = ""; await Prescribe.render(app, r.args[0] || null); break;
        case "physicians": app.innerHTML = ""; await renderPhysicians(app, r.args[0] ? decodeURIComponent(r.args[0]) : null); break;
        default: app.innerHTML = ""; renderHome(app);
      }
    } catch (e) {
      app.innerHTML = "";
      app.appendChild(el("div", { class: "empty-tip", html: "数据加载失败：" + esc(e.message) }));
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 首页 ---------- */
  async function renderHome(app) {
    const [books, herbs, formulas, syndromes, physicians, rx] = await Promise.all([
      loadJSON("data/books/index.json"),
      loadJSON("data/herbs2.json"),
      loadJSON("data/formulas2.json"),
      loadJSON("data/syndromes.json"),
      loadJSON("data/physicians.json"),
      loadJSON("data/rx_kb.json"),
    ]);
    const modules = [
      { icon: "📜", title: "古籍检索", desc: "《内经》《伤寒论》《金匮要略》《温病条辨》等 " + books.length + " 部经典的全文检索与阅读", hash: "#/books" },
      { icon: "🌿", title: "方药检索", desc: formulas.length + " 首经方时方 · " + herbs.length + " 味《神农本草经》药物", hash: "#/fangyao" },
      { icon: "⚖️", title: "辨证论治", desc: syndromes.syndromes.length + " 个经典证型 · 六经、卫气营血、三焦、脏腑、气血津液辨证", hash: "#/bianzheng" },
      { icon: "🩺", title: "智能处方", desc: "输入病情即时辨证，生成参考处方，并列出最可能的 5 个原方（" + rx.meta.pairs + " 个证型-方剂组合）", hash: "#/prescribe" },
      { icon: "👤", title: "历代医家", desc: "战国至现代，" + physicians.length + " 位医家的学派、学术思想与馆藏著作", hash: "#/physicians" },
    ];
    app.appendChild(el("div", { class: "hero" }, [
      el("div", { class: "seal", html: "辨证论治" }),
      el("h2", {}, ["杏 林 溯 源"]),
      el("p", {}, ["上溯《黄帝内经》医理之渊薮，中承仲景《伤寒》《金匮》辨证论治之圭臬，下及金元四家、温病学派与清代瘀血、血证诸家。以历代医家之著作与思想，指导临床辨证、立法、处方、用药。"]),
    ]));
    const grid = el("div", { class: "module-grid" });
    for (const m of modules) {
      const a = el("a", { class: "module-card", href: m.hash }, [
        el("div", { class: "mod-icon" }, [m.icon]),
        el("h3", {}, [m.title]),
        el("p", {}, [m.desc]),
      ]);
      grid.appendChild(a);
    }
    app.appendChild(grid);
    app.appendChild(el("div", { class: "stat-row" }, [
      el("div", { class: "stat" }, [el("b", {}, [String(books.length)]), el("span", {}, ["部典籍全文"])]),
      el("div", { class: "stat" }, [el("b", {}, [String(formulas.length)]), el("span", {}, ["首方剂"])]),
      el("div", { class: "stat" }, [el("b", {}, [String(herbs.length)]), el("span", {}, ["味本草"])]),
      el("div", { class: "stat" }, [el("b", {}, [String(syndromes.syndromes.length)]), el("span", {}, ["个经典证型"])]),
      el("div", { class: "stat" }, [el("b", {}, [String(rx.meta.pairs)]), el("span", {}, ["个证型-方剂组合"])]),
      el("div", { class: "stat" }, [el("b", {}, [String(physicians.length)]), el("span", {}, ["位医家"])]),
    ]));
  }

  /* ---------- 古籍列表 ---------- */
  async function renderBooks(app, query) {
    const [books, bookAuthors] = await Promise.all([
      loadJSON("data/books/index.json"),
      loadJSON("data/book_authors.json").catch(() => ({})),
    ]);
    app.appendChild(el("h2", { class: "page-title" }, ["古籍检索"]));
    app.appendChild(el("p", { class: "page-sub" }, ["典籍底本取自公有领域开放数据（维基文库与 GitHub 公开古籍仓库）。支持全文检索，检索兼容繁简与古籍异体字。"]));
    const bar = el("div", { class: "search-bar" });
    const input = el("input", { type: "search", placeholder: "输入关键词，检索全部古籍正文…（如：桂枝汤 / 阴阳 / 痞证）" });
    if (query) input.value = query;
    const doSearch = () => {
      const v = input.value.trim();
      if (!v) return;
      const target = "#/books/q=" + encodeURIComponent(v);
      if (location.hash === target) route();
      else location.hash = target;
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") doSearch();
    });
    const btn = el("button", { class: "btn" }, ["全文检索"]);
    btn.addEventListener("click", doSearch);
    bar.append(input, btn);
    app.appendChild(bar);

    if (query) {
      app.appendChild(el("div", { class: "section-title" }, ["检索结果"]));
      const tip = el("div", { class: "empty-tip" }, ["正在检索全部 " + books.length + " 部典籍…"]);
      app.appendChild(tip);
      const results = await SearchEngine.searchAll(query, 60);
      tip.remove();
      const metaRow = el("div", { class: "search-meta" });
      metaRow.appendChild(el("span", {}, ["关键词「" + query + "」共命中 " + results.length + " 条"]));
      const back = el("button", { class: "btn ghost small" }, ["返回书目"]);
      back.addEventListener("click", () => { location.hash = "#/books"; });
      metaRow.appendChild(back);
      app.appendChild(metaRow);
      const list = el("div", { class: "result-list" });
      if (!results.length) {
        list.appendChild(el("div", { class: "empty-tip" }, ["未检索到相关条文，请更换关键词。"]));
      }
      for (const r of results) {
        const item = el("div", { class: "result-item" });
        item.appendChild(el("div", { class: "ri-title" }, [r.bookTitle + " · " + r.chapter]));
        item.appendChild(el("div", { class: "ri-snippet", html: highlight(r.snippet, query) }));
        item.addEventListener("click", () => location.hash = "#/books/" + r.bookId + "/" + encodeURIComponent(r.chapter));
        list.appendChild(item);
      }
      app.appendChild(list);
      return;
    }

    app.appendChild(el("div", { class: "section-title" }, ["书目"]));
    const physNames = [...new Set(Object.values(bookAuthors).map(v => v.physician).filter(Boolean))].sort();
    const filterRow = el("div", { class: "filter-row" });
    const sel = el("select");
    sel.appendChild(el("option", { value: "" }, ["全部医家（" + books.length + " 部馆藏）"]));
    for (const n of physNames) sel.appendChild(el("option", { value: n }, [n + "（" + books.filter(b => (bookAuthors[b.title] || {}).physician === n).length + " 部）"]));
    filterRow.appendChild(sel);
    app.appendChild(filterRow);

    const grid = el("div", { class: "book-grid" });
    app.appendChild(grid);
    let curPhys = "";
    const buildGrid = () => {
      grid.innerHTML = "";
      let n = 0;
      for (const b of books) {
        const ba = bookAuthors[b.title] || {};
        if (curPhys && ba.physician !== curPhys) continue;
        n++;
        const authorLine = el("div", { class: "bk-author" }, [b.dynasty + " · " + b.author]);
        if (ba.physician) {
          const a = el("a", { class: "book-link", href: "#/physicians/" + encodeURIComponent(ba.physician) }, ["（" + (ba.physician_short || ba.physician) + "）"]);
          a.addEventListener("click", ev => ev.stopPropagation());
          authorLine.appendChild(a);
        }
        const card = el("div", { class: "book-card" }, [
          el("h3", {}, [b.title]),
          authorLine,
          el("div", { class: "bk-intro" }, [b.intro]),
          el("div", { class: "bk-chaps" }, ["共 " + b.chapters + " 篇"]),
        ]);
        card.addEventListener("click", () => location.hash = "#/books/" + b.id);
        grid.appendChild(card);
      }
      if (!n) grid.appendChild(el("div", { class: "empty-tip" }, ["该医家暂无馆藏全文。"]));
    };
    sel.addEventListener("change", () => { curPhys = sel.value; buildGrid(); });
    buildGrid();
  }

  /* ---------- 阅读器 ---------- */
  async function renderReader(app, bookId, chapterName) {
    if (!state.booksIndex) state.booksIndex = await loadJSON("data/books/index.json");
    const meta = state.booksIndex.find(b => b.id === bookId);
    if (!meta) { app.appendChild(el("div", { class: "empty-tip" }, ["未找到该典籍"])); return; }
    const book = await loadJSON("data/books/" + bookId + ".json");

    const head = el("div", { class: "reader-head" });
    const backBar = el("div", { class: "reader-back" });
    const backBtn = el("button", { class: "btn ghost small" }, ["← 返回书目"]);
    backBtn.addEventListener("click", () => { location.hash = "#/books"; });
    const findBtn = el("button", { class: "btn ghost small" }, ["在本书中检索"]);
    findBtn.addEventListener("click", () => {
      location.hash = "#/books/q=" + encodeURIComponent(book.title);
    });
    backBar.append(backBtn, findBtn);
    head.appendChild(backBar);
    head.appendChild(el("h2", {}, [book.title]));
    const metaLine = el("div", { class: "meta" }, [book.dynasty + " · " + book.author + "　　" + book.intro]);
    try {
      const bookAuthors = await loadJSON("data/book_authors.json");
      const ba = bookAuthors[book.title];
      if (ba && ba.physician) {
        const a = el("a", { class: "book-link", href: "#/physicians/" + encodeURIComponent(ba.physician) }, ["【医家：" + (ba.physician_short || ba.physician) + "】"]);
        metaLine.appendChild(a);
      }
    } catch (e) { /* 无映射 */ }
    head.appendChild(metaLine);
    app.appendChild(head);

    // 目录
    const toc = el("div", { class: "toc-panel" });
    let activeIdx = 0;
    book.chapters.forEach((ch, i) => {
      const chip = el("div", { class: "toc-chip" }, [ch.title]);
      const hit = chapterName && (ch.title === chapterName ||
        ch.title.includes(chapterName) || chapterName.includes(ch.title));
      if (hit) { chip.classList.add("active"); activeIdx = i; }
      chip.addEventListener("click", () => {
        const target = document.getElementById("ch-" + i);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      toc.appendChild(chip);
    });
    app.appendChild(toc);

    // 正文
    const body = el("div", { class: "reader-body" });
    book.chapters.forEach((ch, i) => {
      const block = el("div", { class: "chapter-block", id: "ch-" + i });
      block.appendChild(el("h3", {}, [ch.title]));
      for (const p of ch.paras) {
        if (/^【.+?方】/.test(p)) {
          const f = el("div", { class: "formula-block" });
          f.innerHTML = p.replace(/^【(.+?方)】/, '<span class="fname">【$1】</span>');
          block.appendChild(f);
        } else {
          block.appendChild(el("div", { class: "para" }, [p]));
        }
      }
      body.appendChild(block);
    });
    app.appendChild(body);
    if (activeIdx > 0) {
      setTimeout(() => {
        const t = document.getElementById("ch-" + activeIdx);
        if (t) t.scrollIntoView({ block: "start" });
      }, 60);
    }
  }

  /* ---------- 历代医家 ---------- */
  async function renderPhysicians(app, focusName) {
    const [phys, bookAuthors] = await Promise.all([
      loadJSON("data/physicians.json"),
      loadJSON("data/book_authors.json").catch(() => ({})),
    ]);
    app.appendChild(el("h2", { class: "page-title" }, ["历代医家"]));
    app.appendChild(el("p", { class: "page-sub" }, [
      "自战国至近现代共 " + phys.length + " 位医家，诸家各立学说、各有著述。点击「馆藏」可直接阅读其著作全文。",
    ]));

    // 搜索
    const bar = el("div", { class: "search-bar" });
    const input = el("input", { type: "search", placeholder: "检索医家姓名、著作、学派或学说…（如：叶天士 / 脾胃论 / 温病）" });
    bar.appendChild(input);
    app.appendChild(bar);

    // 朝代筛选
    const dyns = ["全部", ...new Set(phys.map(p => p.dynasty))];
    let curDyn = "全部", kw = "";
    const chipRow = el("div", { class: "syndrome-cat-tabs" });
    const chips = dyns.map(d => {
      const c = el("div", { class: "cat-tab" + (d === "全部" ? " active" : "") }, [d]);
      c.addEventListener("click", () => {
        curDyn = d;
        chips.forEach(x => x.classList.remove("active"));
        c.classList.add("active");
        build();
      });
      chipRow.appendChild(c);
      return c;
    });
    app.appendChild(chipRow);

    const meta = el("div", { class: "search-meta" });
    const grid = el("div", { class: "phys-grid" });
    app.appendChild(meta);
    app.appendChild(grid);

    function build() {
      grid.innerHTML = "";
      meta.innerHTML = "";
      const q = kw.trim();
      const list = phys.filter(p => (curDyn === "全部" || p.dynasty === curDyn) &&
        (!q || p.name.includes(q) || (p.school || "").includes(q) ||
          (p.works || []).some(w => w.includes(q)) || (p.thought || "").includes(q) ||
          (p.title || "").includes(q)));
      meta.appendChild(el("span", {}, ["当前显示 " + list.length + " 位医家" +
        (curDyn === "全部" ? "" : "（" + curDyn + "）")]));
      for (const p of list) {
        const idx = phys.indexOf(p);
        const card = el("div", { class: "phys-card", id: "phy-" + idx });
        const h = el("div", { class: "phys-head" });
        h.appendChild(el("h3", {}, [p.name]));
        h.appendChild(el("span", { class: "dyn-tag" }, [p.dynasty]));
        if (p.school) h.appendChild(el("span", { class: "school-tag" }, [p.school]));
        card.appendChild(h);
        card.appendChild(el("div", { class: "pt" }, [p.title || ""]));
        if (p.works && p.works.length) {
          const wrow = el("div", { class: "pw pw-works" });
          wrow.appendChild(el("span", { class: "lbl" }, ["著作："]));
          p.works.forEach(w => {
            const st = (p.works_status || []).find(x => x.name === w) || {};
            if (st.bookId) {
              wrow.appendChild(el("a", {
                class: "work-chip",
                href: "#/books/" + st.bookId,
                title: "馆藏全文可读：《" + w + "》",
              }, ["《" + w + "》"]));
            } else {
              wrow.appendChild(el("a", {
                class: "work-chip missing",
                href: "https://zh.wikisource.org/wiki/Special:Search?search=" + encodeURIComponent(w),
                target: "_blank",
                rel: "noopener",
                title: "馆藏暂未收录，点击到维基文库查阅",
              }, ["《" + w + "》"]));
            }
          });
          card.appendChild(wrow);
        }
        if (p.books && p.books.length) {
          const bw = el("div", { class: "pw pw-books" });
          bw.appendChild(el("span", { class: "lbl" }, ["馆藏 " + p.books.length + " 部："]));
          p.books.forEach(b => {
            const a = el("a", { class: "book-link", href: "#/books/" + b.id }, [b.title]);
            bw.appendChild(a);
          });
          card.appendChild(bw);
        }
        if (p.thought) card.appendChild(el("div", { class: "pth" }, [p.thought]));
        if (p.contribution) card.appendChild(el("div", { class: "pth pth-sub" }, [p.contribution]));
        if (p.classic) card.appendChild(el("div", { class: "pq" }, ["「" + p.classic + "」"]));
        grid.appendChild(card);
      }
      if (!list.length) grid.appendChild(el("div", { class: "empty-tip" }, ["未找到匹配的医家。"]));
    }

    input.addEventListener("input", () => { kw = input.value; build(); });
    build();

    // 从其他页面定位到某位医家
    if (focusName) {
      const idx = phys.findIndex(p => p.name === focusName || p.name.includes(focusName));
      if (idx >= 0) {
        const target = document.getElementById("phy-" + idx);
        if (target) {
          target.classList.add("focus");
          setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
        }
      }
    }
  }

  return { route, loadJSON, el, esc, decideBooksRoute };
})();

/* 高亮工具：对查询词（支持繁简变体）在摘要中高亮 */
function highlight(text, query) {
  const terms = SearchEngine.expandTerms(query);
  let out = App.esc(text);
  for (const t of terms.slice(0, 8)) {
    try {
      const re = new RegExp(App.esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      out = out.replace(re, "<em>$&</em>");
    } catch (e) { /* ignore */ }
  }
  return out;
}

window.addEventListener("hashchange", () => App.route());
window.addEventListener("DOMContentLoaded", async () => {
  try { await SearchEngine.init(); } catch (e) { /* 使用内置繁简表 */ }
  App.route();
});



