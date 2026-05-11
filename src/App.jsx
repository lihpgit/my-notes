import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

/* ───────── 常量 ───────── */
const TAGS = ["Android", "iOS", "前端", "后端", "随笔", "学习", "工作", "生活"];
const TAG_COLORS = {
  Android: { bg: "#dcfce7", fg: "#166534" },
  iOS: { bg: "#dbeafe", fg: "#1e40af" },
  前端: { bg: "#ffedd5", fg: "#9a3412" },
  后端: { bg: "#f3e8ff", fg: "#6b21a8" },
  随笔: { bg: "#fce7f3", fg: "#9d174d" },
  学习: { bg: "#ccfbf1", fg: "#115e59" },
  工作: { bg: "#fef9c3", fg: "#854d0e" },
  生活: { bg: "#f5f5f4", fg: "#44403c" },
};
const BANNERS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#fccb90,#d57eeb)",
  "linear-gradient(135deg,#89f7fe,#66a6ff)",
];
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (ts) => new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
const readTime = (t) => Math.max(1, Math.ceil((t || "").replace(/[#*`>\-\[\]()!]/g, "").length / 400)) + " min";
const wordCount = (t) => (t || "").replace(/\s/g, "").length.toLocaleString();

/* ───────── CSS ───────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Fira+Code:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f8f9fa;overflow-x:hidden}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}
textarea:focus,input:focus{outline:none}

.article-body{font-size:16px;line-height:1.85;color:#374151;word-break:break-word}
.article-body h1{font-size:1.75em;font-weight:700;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:1px solid #e5e7eb;color:#111}
.article-body h2{font-size:1.45em;font-weight:700;margin:1.8em 0 .5em;padding-bottom:.25em;border-bottom:1px solid #f0f0f0;color:#111}
.article-body h3{font-size:1.2em;font-weight:600;margin:1.4em 0 .4em;color:#1f2937}
.article-body p{margin:.8em 0}
.article-body ul,.article-body ol{padding-left:1.8em;margin:.8em 0}
.article-body li{margin:.3em 0}
.article-body blockquote{border-left:4px solid #a78bfa;background:#f5f3ff;padding:12px 16px;margin:1em 0;border-radius:0 8px 8px 0;color:#4c1d95}
.article-body code{font-family:'Fira Code',monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:.88em;color:#be185d}
.article-body pre{background:#1e293b;color:#e2e8f0;padding:16px 20px;border-radius:10px;overflow-x:auto;margin:1.2em 0;font-size:.88em;line-height:1.6}
.article-body pre code{background:none;color:inherit;padding:0;font-size:1em}
.article-body img{max-width:100%;border-radius:8px;margin:1em 0}
.article-body table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.92em}
.article-body th,.article-body td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}
.article-body th{background:#f9fafb;font-weight:600}
.article-body hr{border:none;border-top:1px solid #e5e7eb;margin:2em 0}
.article-body strong{color:#111827}

@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.card-anim{animation:fadeUp .4s ease both}
.hover-lift{transition:transform .2s,box-shadow .2s}
.hover-lift:hover{transform:translateY(-3px);box-shadow:0 8px 25px rgba(0,0,0,.08)!important}
`;

/* ───────── 登录页 ───────── */
function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ t: "", c: "" });

  async function go() {
    setLoading(true); setMsg({ t: "", c: "" });
    const { data, error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw });
    if (error) setMsg({ t: "e", c: error.message });
    else if (data.session) onAuth(data.user);
    else setMsg({ t: "s", c: "注册成功，请查看邮箱确认" });
    setLoading(false);
  }

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", fontFamily: "'Noto Serif SC',serif" }}>
      <style>{CSS}</style>
      <div style={{ width: 400, maxWidth: "92vw", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.07)" }}>
        <div style={{ height: 100, background: BANNERS[0] }} />
        <div style={{ padding: "28px 32px 36px" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: "center", color: "#1a1a1a" }}>拾光笔记</h1>
          <p style={{ fontSize: 13, color: "#999", textAlign: "center", margin: "6px 0 24px" }}>你的私人知识库</p>
          <div style={{ display: "flex", marginBottom: 20, borderBottom: "1px solid #eee" }}>
            {["登录", "注册"].map((l, i) => (
              <button key={l} onClick={() => { setIsLogin(i === 0); setMsg({ t: "", c: "" }); }}
                style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderBottom: (i === 0 ? isLogin : !isLogin) ? "2px solid #333" : "2px solid transparent", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", color: "#333" }}>{l}</button>
            ))}
          </div>
          <input type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "11px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, marginBottom: 12, fontFamily: "'Noto Serif SC',serif" }} />
          <input type="password" placeholder="密码（至少6位）" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "11px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, marginBottom: 12, fontFamily: "'Noto Serif SC',serif" }} />
          {msg.c && <p style={{ color: msg.t === "e" ? "#e53935" : "#2e7d32", fontSize: 13, marginBottom: 10, textAlign: "center" }}>{msg.c}</p>}
          <button onClick={go} disabled={loading || !email || !pw}
            style={{ width: "100%", padding: "12px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", opacity: loading ? .6 : 1 }}>
            {loading ? "请稍候..." : isLogin ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── 主应用 ───────── */
function NotesApp({ user, onLogout }) {
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const [filterTag, setFilterTag] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => { loadNotes(); }, []);

  async function loadNotes() {
    setLoading(true);
    const { data } = await supabase.from("notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (data) setNotes(data);
    setLoading(false);
  }

  const activeNote = notes.find((n) => n.id === activeId);

  const filtered = useMemo(() => {
    let r = notes;
    if (filterTag) r = r.filter((n) => (n.tags || []).includes(filterTag));
    if (search) r = r.filter((n) => (n.title + n.content).toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [notes, filterTag, search]);

  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [notes]);

  const save = useCallback((note) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await supabase.from("notes").upsert(note);
      setSaving(false);
    }, 600);
  }, []);

  function update(field, value) {
    const updated = notes.map((n) => n.id === activeId ? { ...n, [field]: value, updated_at: Date.now() } : n);
    setNotes(updated);
    save(updated.find((n) => n.id === activeId));
  }

  async function addNote() {
    const n = { id: genId(), title: "", content: "", tags: [], banner: Math.floor(Math.random() * BANNERS.length), created_at: Date.now(), updated_at: Date.now(), user_id: user.id };
    setNotes((p) => [n, ...p]);
    setActiveId(n.id);
    setView("edit");
    await supabase.from("notes").insert(n);
  }

  async function deleteNote() {
    if (!confirm("确定删除这篇文章吗？")) return;
    await supabase.from("notes").delete().eq("id", activeId);
    setNotes((p) => p.filter((n) => n.id !== activeId));
    setActiveId(null);
    setView("list");
  }

  function openNote(nid) { setActiveId(nid); setView("read"); window.scrollTo(0, 0); }
  function backToList() { setView("list"); setActiveId(null); }

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", background: "#f8f9fa" }}>
      <style>{CSS}</style>
      <p style={{ color: "#999" }}>加载中...</p>
    </div>
  );

  /* ===== 列表视图 ===== */
  if (view === "list") return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Noto Serif SC',serif" }}>
      <style>{CSS}</style>

      <header style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>📒</span>拾光笔记
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#aaa" }}>{user.email}</span>
            <button onClick={onLogout} style={{ fontSize: 12, color: "#999", background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>退出</button>
          </div>
        </div>
      </header>

      <div style={{ background: BANNERS[0], padding: "48px 24px 40px", textAlign: "center", color: "#fff" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, textShadow: "0 2px 8px rgba(0,0,0,.15)" }}>我的知识库</h2>
        <p style={{ fontSize: 14, opacity: .85 }}>共 {notes.length} 篇文章 · 记录学习与成长</p>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 60px", display: "flex", gap: 24 }}>
        {/* 左侧标签侧栏 */}
        <aside style={{ width: 180, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start" }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#999", marginBottom: 12 }}>标签</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => setFilterTag(null)}
                style={{ textAlign: "left", padding: "6px 10px", borderRadius: 6, border: "none", background: !filterTag ? "#f0f0f0" : "transparent", color: !filterTag ? "#1a1a1a" : "#666", fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", fontWeight: !filterTag ? 600 : 400 }}>
                全部 <span style={{ fontSize: 11, color: "#bbb", marginLeft: 4 }}>{notes.length}</span>
              </button>
              {allTags.map((t) => {
                const c = TAG_COLORS[t] || { bg: "#f5f5f5", fg: "#666" };
                const count = notes.filter((n) => (n.tags || []).includes(t)).length;
                return (
                  <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)}
                    style={{ textAlign: "left", padding: "6px 10px", borderRadius: 6, border: "none", background: filterTag === t ? c.bg : "transparent", color: filterTag === t ? c.fg : "#666", fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", fontWeight: filterTag === t ? 600 : 400 }}>
                    {t} <span style={{ fontSize: 11, color: "#bbb", marginLeft: 4 }}>{count}</span>
                  </button>
                );
              })}
              {allTags.length === 0 && <p style={{ fontSize: 12, color: "#ccc", padding: "4px 10px" }}>暂无标签</p>}
            </div>
          </div>
        </aside>

        {/* 右侧主内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#aaa" }}>🔍</span>
              <input placeholder="搜索文章..." value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, background: "#fff", fontFamily: "'Noto Serif SC',serif" }} />
            </div>
            <button onClick={addNote}
              style={{ padding: "10px 20px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", whiteSpace: "nowrap" }}>
              ＋ 写文章
            </button>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
              <p style={{ fontSize: 48, marginBottom: 16 }}>📝</p>
              <p>{search || filterTag ? "没有找到匹配的文章" : "还没有文章，点击「写文章」开始创作"}</p>
            </div>
          )}

          <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
            {filtered.map((note, i) => (
              <div key={note.id} className="card-anim" onClick={() => openNote(note.id)}
                style={{ padding: "14px 18px", cursor: "pointer", borderBottom: i < filtered.length - 1 ? "1px solid #f0f0f0" : "none", animationDelay: i * .04 + "s", transition: "background .15s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {note.title || "无标题"}
                </h3>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {(note.tags || []).map((t) => {
                    const c = TAG_COLORS[t] || { bg: "#f5f5f5", fg: "#999" };
                    return <span key={t} style={{ fontSize: 12, color: c.fg, opacity: .75 }}>{t}</span>;
                  })}
                  {(note.tags || []).length === 0 && <span style={{ fontSize: 12, color: "#ccc" }}>无标签</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (!activeNote) { setView("list"); return null; }

  /* ===== 阅读视图 ===== */
  if (view === "read") return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Noto Serif SC',serif" }}>
      <style>{CSS}</style>

      <header style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={backToList} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#666", fontFamily: "'Noto Serif SC',serif" }}>← 返回列表</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setView("edit")} style={{ padding: "5px 14px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>编辑</button>
            <button onClick={deleteNote} style={{ padding: "5px 14px", background: "#fff", color: "#e53935", border: "1px solid #e53935", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>删除</button>
          </div>
        </div>
      </header>

      <div style={{ height: 220, background: BANNERS[activeNote.banner || 0], display: "flex", alignItems: "flex-end" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 28px", width: "100%" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(activeNote.tags || []).map((t) => {
              const c = TAG_COLORS[t] || { bg: "#f5f5f5", fg: "#666" };
              return <span key={t} style={{ padding: "3px 12px", borderRadius: 14, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,.9)", color: c.fg }}>{t}</span>;
            })}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.2)", lineHeight: 1.3 }}>
            {activeNote.title || "无标题"}
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 24px 0" }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#999", paddingBottom: 20, borderBottom: "1px solid #eee", flexWrap: "wrap" }}>
          <span>📅 {fmtDate(activeNote.created_at)}</span>
          <span>✏️ {fmtDate(activeNote.updated_at)}</span>
          <span>📖 {wordCount(activeNote.content)} 字</span>
          <span>⏱ {readTime(activeNote.content)}</span>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 80px" }}>
        <div className="article-body" dangerouslySetInnerHTML={{ __html: marked.parse(activeNote.content || "*暂无内容*") }} />
      </div>
    </div>
  );

  /* ===== 编辑视图 ===== */
  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Noto Serif SC',serif" }}>
      <style>{CSS}</style>

      <header style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => setView("read")} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#666", fontFamily: "'Noto Serif SC',serif" }}>← 返回阅读</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {saving ? <span style={{ fontSize: 12, color: "#f59e0b" }}>保存中...</span> : <span style={{ fontSize: 12, color: "#22c55e" }}>已同步 ☁️</span>}
            <button onClick={deleteNote} style={{ padding: "5px 14px", background: "#fff", color: "#e53935", border: "1px solid #e53935", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>删除</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px" }}>
        <input placeholder="文章标题..." value={activeNote.title} onChange={(e) => update("title", e.target.value)}
          style={{ width: "100%", border: "none", fontSize: 28, fontWeight: 700, color: "#1a1a1a", background: "transparent", padding: "0 0 16px", fontFamily: "'Noto Serif SC',serif", borderBottom: "1px solid #eee", marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#999" }}>标签：</span>
          {(activeNote.tags || []).map((t) => {
            const c = TAG_COLORS[t] || { bg: "#f0f0f0", fg: "#666" };
            return (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 14, background: c.bg, color: c.fg, fontSize: 12, fontFamily: "'Noto Serif SC',serif" }}>
                {t}
                <span onClick={() => update("tags", (activeNote.tags || []).filter((x) => x !== t))}
                  style={{ cursor: "pointer", fontSize: 14, lineHeight: 1, opacity: .6 }}>×</span>
              </span>
            );
          })}
          <input
            placeholder="输入标签后回车"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                const tag = e.target.value.trim();
                if (!(activeNote.tags || []).includes(tag)) {
                  update("tags", [...(activeNote.tags || []), tag]);
                }
                e.target.value = "";
              }
            }}
            style={{ padding: "4px 10px", border: "1px solid #ddd", borderRadius: 14, fontSize: 12, fontFamily: "'Noto Serif SC',serif", width: 120, background: "#fff" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, minHeight: "calc(100vh - 220px)" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>Markdown 编辑</span>
              <span>{wordCount(activeNote.content)} 字</span>
            </div>
            <textarea value={activeNote.content} onChange={(e) => update("content", e.target.value)}
              placeholder={"开始写作...\n\n支持 Markdown 语法：\n# 标题\n## 二级标题\n**加粗** *斜体*\n- 列表项\n> 引用\n`代码`\n```代码块```"}
              style={{ flex: 1, border: "1px solid #e0e0e0", borderRadius: 10, padding: "16px 18px", fontSize: 14, lineHeight: 1.8, resize: "none", fontFamily: "'Fira Code','Noto Serif SC',serif", color: "#374151", background: "#fff" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>实时预览</div>
            <div style={{ flex: 1, border: "1px solid #e0e0e0", borderRadius: 10, padding: "16px 18px", background: "#fff", overflowY: "auto" }}>
              <div className="article-body" dangerouslySetInnerHTML={{ __html: marked.parse(activeNote.content || "*开始写作后这里会显示预览...*") }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── 入口 ───────── */
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif" }}>
      <style>{CSS}</style><p style={{ color: "#999" }}>加载中...</p>
    </div>
  );
  if (!user) return <AuthPage onAuth={setUser} />;
  return <NotesApp user={user} onLogout={() => supabase.auth.signOut().then(() => setUser(null))} />;
}
