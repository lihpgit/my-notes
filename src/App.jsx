import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

/* ───────── 常量 ───────── */
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
const TAG_COLORS_DARK = {
  Android: { bg: "#064e3b", fg: "#6ee7b7" },
  iOS: { bg: "#1e3a5f", fg: "#93c5fd" },
  前端: { bg: "#431407", fg: "#fdba74" },
  后端: { bg: "#3b0764", fg: "#c4b5fd" },
  随笔: { bg: "#500724", fg: "#f9a8d4" },
  学习: { bg: "#042f2e", fg: "#5eead4" },
  工作: { bg: "#422006", fg: "#fde047" },
  生活: { bg: "#292524", fg: "#a8a29e" },
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

/* ───────── 树形工具 ───────── */
// 只用「文件夹」构建侧边栏目录树（笔记不进树）
function buildFolderTree(notes) {
  const folders = notes.filter((n) => n.is_folder);
  const folderSet = new Set(folders.map((f) => f.id));
  const map = {};
  const roots = [];
  folders.forEach((f) => { map[f.id] = { ...f, children: [] }; });
  folders.forEach((f) => {
    const pid = f.parent_id && folderSet.has(f.parent_id) ? f.parent_id : null;
    if (pid) map[pid].children.push(map[f.id]);
    else roots.push(map[f.id]);
  });
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh"));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// 沿 parent_id 链向上找祖先文件夹（遇到非文件夹即停止）
function getAncestors(notes, startParentId) {
  const path = [];
  const byId = {};
  notes.forEach((n) => { byId[n.id] = n; });
  let cur = startParentId;
  while (cur) {
    const note = byId[cur];
    if (!note || !note.is_folder) break;
    path.unshift(note);
    cur = note.parent_id;
  }
  return path;
}

const LIGHT = {
  bg: "#f8f9fa", card: "#fff", text: "#1a1a1a", textSub: "#666", textMuted: "#999", textFaint: "#aaa", textPlaceholder: "#bbb", textTag: "#ccc",
  border: "#eee", borderLight: "#f0f0f0", borderInput: "#e0e0e0", borderDashed: "#ddd",
  headerBg: "#fff", sidebarBg: "#fff", listHover: "#fafafa", activeFilter: "#f0f0f0",
  btnBg: "#1a1a1a", btnText: "#fff", btnOutline: "#999",
  inputBg: "#fff", editorBg: "#fff",
  shadow: "0 1px 4px rgba(0,0,0,.05)", shadowCard: "0 4px 24px rgba(0,0,0,.07)",
  deleteText: "#e53935", deleteBorder: "#e53935", deleteBg: "#fff",
  tabActive: "#333", tabBorder: "#333",
};
const DARK = {
  bg: "#141417", card: "#1e1f23", text: "#e4e4e7", textSub: "#a1a1aa", textMuted: "#71717a", textFaint: "#52525b", textPlaceholder: "#3f3f46", textTag: "#52525b",
  border: "#27272a", borderLight: "#27272a", borderInput: "#3f3f46", borderDashed: "#3f3f46",
  headerBg: "#1e1f23", sidebarBg: "#1e1f23", listHover: "#27272a", activeFilter: "#27272a",
  btnBg: "#e4e4e7", btnText: "#141417", btnOutline: "#71717a",
  inputBg: "#27272a", editorBg: "#1e1f23",
  shadow: "0 1px 4px rgba(0,0,0,.3)", shadowCard: "0 4px 24px rgba(0,0,0,.4)",
  deleteText: "#ef4444", deleteBorder: "#ef4444", deleteBg: "#1e1f23",
  tabActive: "#e4e4e7", tabBorder: "#e4e4e7",
};

const getCSS = (dark) => `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Fira+Code:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:${dark ? DARK.bg : LIGHT.bg};overflow-x:hidden;transition:background .3s}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-thumb{background:${dark ? "#3f3f46" : "#ccc"};border-radius:3px}
textarea:focus,input:focus{outline:none}

.article-body{font-size:16px;line-height:1.85;color:${dark ? "#d4d4d8" : "#374151"};word-break:break-word}
.article-body h1{font-size:1.75em;font-weight:700;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:1px solid ${dark ? "#3f3f46" : "#e5e7eb"};color:${dark ? "#f4f4f5" : "#111"}}
.article-body h2{font-size:1.45em;font-weight:700;margin:1.8em 0 .5em;padding-bottom:.25em;border-bottom:1px solid ${dark ? "#27272a" : "#f0f0f0"};color:${dark ? "#f4f4f5" : "#111"}}
.article-body h3{font-size:1.2em;font-weight:600;margin:1.4em 0 .4em;color:${dark ? "#e4e4e7" : "#1f2937"}}
.article-body p{margin:.8em 0}
.article-body ul,.article-body ol{padding-left:1.8em;margin:.8em 0}
.article-body li{margin:.3em 0}
.article-body blockquote{border-left:4px solid ${dark ? "#7c3aed" : "#a78bfa"};background:${dark ? "#1e1b2e" : "#f5f3ff"};padding:12px 16px;margin:1em 0;border-radius:0 8px 8px 0;color:${dark ? "#c4b5fd" : "#4c1d95"}}
.article-body code{font-family:'Fira Code',monospace;background:${dark ? "#27272a" : "#f1f5f9"};padding:2px 6px;border-radius:4px;font-size:.88em;color:${dark ? "#f472b6" : "#be185d"}}
.article-body pre{background:${dark ? "#0f0f12" : "#1e293b"};color:#e2e8f0;padding:16px 20px;border-radius:10px;overflow-x:auto;margin:1.2em 0;font-size:.88em;line-height:1.6}
.article-body pre code{background:none;color:inherit;padding:0;font-size:1em}
.article-body img{max-width:100%;border-radius:8px;margin:1em 0}
.article-body table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.92em}
.article-body th,.article-body td{border:1px solid ${dark ? "#3f3f46" : "#e5e7eb"};padding:8px 12px;text-align:left}
.article-body th{background:${dark ? "#27272a" : "#f9fafb"};font-weight:600}
.article-body hr{border:none;border-top:1px solid ${dark ? "#3f3f46" : "#e5e7eb"};margin:2em 0}
.article-body strong{color:${dark ? "#f4f4f5" : "#111827"}}

@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.card-anim{animation:fadeUp .4s ease both}
`;

/* ───────── 登录页 ───────── */
function AuthPage({ onAuth, dark, T }) {
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
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "'Noto Serif SC',serif" }}>
      <style>{getCSS(dark)}</style>
      <div style={{ width: 400, maxWidth: "92vw", background: T.card, borderRadius: 12, overflow: "hidden", boxShadow: T.shadowCard }}>
        <div style={{ height: 100, background: BANNERS[0] }} />
        <div style={{ padding: "28px 32px 36px" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: "center", color: T.text }}>拾光笔记</h1>
          <p style={{ fontSize: 13, color: T.textMuted, textAlign: "center", margin: "6px 0 24px" }}>你的私人知识库</p>
          <div style={{ display: "flex", marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
            {["登录", "注册"].map((l, i) => (
              <button key={l} onClick={() => { setIsLogin(i === 0); setMsg({ t: "", c: "" }); }}
                style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderBottom: (i === 0 ? isLogin : !isLogin) ? `2px solid ${T.tabBorder}` : "2px solid transparent", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", color: T.tabActive }}>{l}</button>
            ))}
          </div>
          <input type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "11px 14px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, marginBottom: 12, fontFamily: "'Noto Serif SC',serif", background: T.inputBg, color: T.text }} />
          <input type="password" placeholder="密码（至少6位）" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "11px 14px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, marginBottom: 12, fontFamily: "'Noto Serif SC',serif", background: T.inputBg, color: T.text }} />
          {msg.c && <p style={{ color: msg.t === "e" ? "#e53935" : "#2e7d32", fontSize: 13, marginBottom: 10, textAlign: "center" }}>{msg.c}</p>}
          <button onClick={go} disabled={loading || !email || !pw}
            style={{ width: "100%", padding: "12px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", opacity: loading ? .6 : 1 }}>
            {loading ? "请稍候..." : isLogin ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── 主应用 ───────── */
function NotesApp({ user, onLogout, dark, onToggleDark, T }) {
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const [filterTag, setFilterTag] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scriptEditor, setScriptEditor] = useState(null); // {name, ext, content}
  const [currentFolder, setCurrentFolder] = useState(null); // 当前目录 ID，null=根目录
  const [expanded, setExpanded] = useState({}); // 侧边栏树展开状态 {id: true/false}
  const [moveTarget, setMoveTarget] = useState(null); // 移动弹窗 {id}
  const [folderEditor, setFolderEditor] = useState(null); // 文件夹弹窗 {mode:'create'|'rename', id, parentId, name}
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [uploadingAtt, setUploadingAtt] = useState(false); // 附件上传中
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);
  const TC = dark ? TAG_COLORS_DARK : TAG_COLORS;

  // 响应式：窄屏（手机/小窗）时调整布局，保证标题始终可见
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 文件夹集合 + 有效父级（父级必须是文件夹，否则视为根目录）
  const folderSet = useMemo(() => new Set(notes.filter((n) => n.is_folder).map((n) => n.id)), [notes]);
  const parentOf = (n) => (n.parent_id && folderSet.has(n.parent_id) ? n.parent_id : null);

  // 侧边栏目录树（仅文件夹）
  const folderTree = useMemo(() => buildFolderTree(notes), [notes]);
  const breadcrumb = currentFolder ? getAncestors(notes, currentFolder) : [];
  const noteCount = useMemo(() => notes.filter((n) => !n.is_folder).length, [notes]);

  // 安全兜底：当前所在文件夹被删除后，自动回到根目录，避免卡在幽灵目录
  useEffect(() => {
    if (currentFolder && !folderSet.has(currentFolder)) {
      setCurrentFolder(null);
    }
  }, [folderSet, currentFolder]);

  /* ─── 浏览器历史管理（拦截返回键） ─── */
  const skipPopRef = useRef(false);

  useEffect(() => {
    window.history.replaceState({ view: "list", noteId: null, folderId: null }, "");
  }, []);

  useEffect(() => {
    function onPop(e) {
      if (skipPopRef.current) { skipPopRef.current = false; return; }
      const st = e.state;
      if (st) {
        setView(st.view || "list");
        setActiveId(st.noteId || null);
        if (st.folderId !== undefined) setCurrentFolder(st.folderId || null);
        if (st.view !== "list") window.scrollTo(0, 0);
      } else {
        setView("list");
        setActiveId(null);
        setCurrentFolder(null);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navPush(v, nid, fid) {
    window.history.pushState({ view: v, noteId: nid || null, folderId: fid !== undefined ? fid : currentFolder }, "");
    setView(v);
    setActiveId(nid || null);
  }

  function navToFolder(fid) {
    if (search) setSearch(""); // 进入文件夹时清空搜索，否则列表仍显示全局搜索结果
    window.history.pushState({ view: "list", noteId: null, folderId: fid }, "");
    setCurrentFolder(fid);
    setView("list");
    setActiveId(null);
    // 自动展开目标文件夹的父链
    if (fid) {
      const path = getAncestors(notes, fid);
      const exp = { ...expanded };
      path.forEach((n) => { exp[n.id] = true; });
      setExpanded(exp);
    }
  }

  useEffect(() => { loadNotes(); }, []);

  async function loadNotes() {
    setLoading(true);
    const { data } = await supabase.from("notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (data) setNotes(data);
    setLoading(false);
  }

  const activeNote = notes.find((n) => n.id === activeId);

  const filtered = useMemo(() => {
    let r;
    if (search) {
      // 搜索仅匹配笔记正文（不含文件夹），跨目录全局搜索
      r = notes.filter((n) => !n.is_folder && (n.title + (n.content || "")).toLowerCase().includes(search.toLowerCase()));
    } else {
      // 非搜索：显示当前文件夹下的直接子项（文件夹 + 笔记）
      r = notes.filter((n) => (n.parent_id && folderSet.has(n.parent_id) ? n.parent_id : null) === currentFolder);
    }
    if (filterTag) r = r.filter((n) => (n.tags || []).includes(filterTag));
    // 文件夹排前（按名称），笔记排后（按更新时间降序）
    const fs = r.filter((n) => n.is_folder).sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh"));
    const ds = r.filter((n) => !n.is_folder).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    return [...fs, ...ds];
  }, [notes, filterTag, search, currentFolder, folderSet]);

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

  async function addNote(parentId) {
    const pid = parentId !== undefined ? parentId : currentFolder;
    const n = { id: genId(), title: "", content: "", tags: [], scripts: [], attachments: [], is_folder: false, parent_id: pid || null, banner: Math.floor(Math.random() * BANNERS.length), created_at: Date.now(), updated_at: Date.now(), user_id: user.id };
    setNotes((p) => [n, ...p]);
    navPush("edit", n.id);
    await supabase.from("notes").insert(n);
  }

  async function deleteNote() {
    if (!confirm("确定删除这篇文章吗？")) return;
    const paths = (activeNote.attachments || []).map((a) => a.path).filter(Boolean);
    await supabase.from("notes").delete().eq("id", activeId);
    if (paths.length) await supabase.storage.from("attachments").remove(paths);
    setNotes((p) => p.filter((n) => n.id !== activeId));
    setActiveId(null);
    setView("list");
    window.history.pushState({ view: "list", noteId: null, folderId: currentFolder }, "");
  }

  /* ─── 文件夹增删改 ─── */
  async function addFolder(name, parentId) {
    const pid = parentId !== undefined ? parentId : currentFolder;
    const f = { id: genId(), title: name.trim(), content: "", tags: [], scripts: [], attachments: [], is_folder: true, parent_id: pid || null, banner: 0, created_at: Date.now(), updated_at: Date.now(), user_id: user.id };
    setNotes((p) => [f, ...p]);
    await supabase.from("notes").insert(f);
  }

  async function renameFolder(id, name) {
    const updated = notes.map((n) => n.id === id ? { ...n, title: name.trim(), updated_at: Date.now() } : n);
    setNotes(updated);
    await supabase.from("notes").update({ title: name.trim(), updated_at: Date.now() }).eq("id", id);
  }

  // 递归删除文件夹及其全部子内容
  async function deleteFolder(folderId) {
    const toDelete = [];
    const collect = (id) => { toDelete.push(id); notes.filter((n) => n.parent_id === id).forEach((c) => collect(c.id)); };
    collect(folderId);
    // 收集被删笔记的附件，一并从 Storage 清理
    const paths = notes.filter((n) => toDelete.includes(n.id)).flatMap((n) => (n.attachments || []).map((a) => a.path)).filter(Boolean);
    await supabase.from("notes").delete().in("id", toDelete);
    if (paths.length) await supabase.storage.from("attachments").remove(paths);
    setNotes((p) => p.filter((n) => !toDelete.includes(n.id)));
    // currentFolder 若被删，由兜底 useEffect 自动回根目录
  }

  function saveFolderEditor() {
    if (!folderEditor || !folderEditor.name.trim()) return;
    if (folderEditor.mode === "create") addFolder(folderEditor.name, folderEditor.parentId);
    else renameFolder(folderEditor.id, folderEditor.name);
    setFolderEditor(null);
  }

  function openNote(nid) { navPush("read", nid); window.scrollTo(0, 0); }
  function backToList() { window.history.back(); }
  function goToEdit(nid) { navPush("edit", nid); }

  /* ─── 移动笔记/文件夹到其他目录（目标只能是文件夹或根目录） ─── */
  async function moveNote(noteId, newParentId) {
    if (noteId === newParentId) return;
    // 不能移动到自己的子孙下
    const ancestors = getAncestors(notes, newParentId);
    if (ancestors.some((a) => a.id === noteId)) { alert("不能移动到自己的子文件夹下"); return; }
    const updated = notes.map((n) => n.id === noteId ? { ...n, parent_id: newParentId || null, updated_at: Date.now() } : n);
    setNotes(updated);
    await supabase.from("notes").update({ parent_id: newParentId || null, updated_at: Date.now() }).eq("id", noteId);
    setMoveTarget(null);
  }

  /* ─── 导入 .md 文件（支持批量） ─── */
  async function importMd(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newNotes = [];
    for (const file of files) {
      const text = await file.text();
      const m = text.match(/^#\s+(.+)$/m);
      const title = m ? m[1].trim() : file.name.replace(/\.(md|markdown|txt)$/i, "");
      const content = m ? text.replace(/^#\s+.+\n*/, "") : text;
      newNotes.push({ id: genId(), title, content, tags: [], scripts: [], attachments: [], is_folder: false, parent_id: currentFolder || null, banner: Math.floor(Math.random() * BANNERS.length), created_at: Date.now(), updated_at: Date.now(), user_id: user.id });
    }
    setNotes((p) => [...newNotes, ...p]);
    await supabase.from("notes").insert(newNotes);
    if (newNotes.length === 1) {
      navPush("edit", newNotes[0].id);
    }
    e.target.value = "";
  }

  /* ─── 导出 .md 文件 ─── */
  function exportMd(note) {
    const md = (note.title ? "# " + note.title + "\n\n" : "") + (note.content || "");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (note.title || "未命名笔记") + ".md";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── 脚本管理 ─── */
  const scriptInputRef = useRef(null);
  const textareaRef = useRef(null);
  const attInputRef = useRef(null);

  async function addScripts(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const existing = activeNote.scripts || [];
    const newScripts = [];
    for (const f of files) {
      const content = await f.text();
      newScripts.push({ name: f.name, content });
    }
    const allScripts = [...existing, ...newScripts];
    // 在光标位置插入脚本标记
    const ta = textareaRef.current;
    const pos = ta ? (ta.selectionStart || 0) : (activeNote.content || "").length;
    const text = activeNote.content || "";
    const markers = files.map(f => `{{script:${f.name}}}`).join("\n");
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const pad = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
    const newContent = before + pad + markers + padAfter + after;
    // 一次性更新 scripts 和 content
    const updated = notes.map((n) => n.id === activeId ? { ...n, scripts: allScripts, content: newContent, updated_at: Date.now() } : n);
    setNotes(updated);
    save(updated.find((n) => n.id === activeId));
    if (ta) {
      setTimeout(() => {
        const newPos = pos + pad.length + markers.length + padAfter.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }, 50);
    }
    e.target.value = "";
  }

  function removeScript(idx) {
    const s = (activeNote.scripts || [])[idx];
    const scripts = [...(activeNote.scripts || [])];
    scripts.splice(idx, 1);
    // 同时移除正文中该脚本的标记，一次性更新 scripts 和 content，避免状态覆盖
    let content = activeNote.content || "";
    if (s) {
      const marker = `{{script:${s.name}}}`;
      content = content.split(marker).join("").replace(/\n{3,}/g, "\n\n");
    }
    const updated = notes.map((n) => n.id === activeId ? { ...n, scripts, content, updated_at: Date.now() } : n);
    setNotes(updated);
    save(updated.find((n) => n.id === activeId));
  }

  function downloadScript(script) {
    const blob = new Blob([script.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = script.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── 附件管理（Supabase Storage） ─── */
  const ATT_BUCKET = "attachments";
  const MAX_ATT_SIZE = 20 * 1024 * 1024; // 20MB

  // 上传附件到 Storage，并在光标处插入 {{file:名字}} 标记
  async function addAttachments(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const oversize = files.find((f) => f.size > MAX_ATT_SIZE);
    if (oversize) { alert(`文件「${oversize.name}」超过 20MB，请压缩后再上传`); return; }
    setUploadingAtt(true);
    const newAtts = [];
    try {
      for (const f of files) {
        const ext = f.name.includes(".") ? "." + f.name.split(".").pop() : "";
        const path = `${user.id}/${genId()}${ext}`;
        const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
        if (error) { alert(`上传「${f.name}」失败：${error.message}`); continue; }
        const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
        newAtts.push({ name: f.name, type: f.type || "", path, url });
      }
    } finally {
      setUploadingAtt(false);
    }
    if (newAtts.length === 0) return;
    // 上传是异步网络操作，期间用户可能继续打字。用函数式更新读取最新 content，
    // 避免用 closure 里的旧 content 覆盖用户在上传期间输入的内容。
    const ta = textareaRef.current;
    const pos = ta ? (ta.selectionStart || 0) : null;
    const markers = newAtts.map((a) => `{{file:${a.name}}}`).join("\n");
    let savedNote = null;
    setNotes((prev) => prev.map((n) => {
      if (n.id !== activeId) return n;
      const text = n.content || "";
      const p = pos == null ? text.length : Math.min(pos, text.length);
      const before = text.slice(0, p);
      const after = text.slice(p);
      const pad = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      savedNote = { ...n, attachments: [...(n.attachments || []), ...newAtts], content: before + pad + markers + padAfter + after, updated_at: Date.now() };
      return savedNote;
    }));
    if (savedNote) save(savedNote);
  }

  // 移除附件：删 chip + 删正文标记 + 从 Storage 删文件
  async function removeAttachment(idx) {
    const a = (activeNote.attachments || [])[idx];
    const atts = [...(activeNote.attachments || [])];
    atts.splice(idx, 1);
    let content = activeNote.content || "";
    if (a) {
      const marker = `{{file:${a.name}}}`;
      content = content.split(marker).join("").replace(/\n{3,}/g, "\n\n");
    }
    const updated = notes.map((n) => n.id === activeId ? { ...n, attachments: atts, content, updated_at: Date.now() } : n);
    setNotes(updated);
    save(updated.find((n) => n.id === activeId));
    if (a && a.path) await supabase.storage.from(ATT_BUCKET).remove([a.path]);
  }

  // 下载附件：拉取为 blob 后按原文件名保存（跨域 download 属性无效，故走 blob）
  async function downloadAttachment(att) {
    try {
      const res = await fetch(att.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(att.url, "_blank");
    }
  }

  /* ─── 手动创建脚本 ─── */
  function saveManualScript() {
    if (!scriptEditor || !scriptEditor.name.trim() || !scriptEditor.content.trim()) return;
    const fileName = scriptEditor.name.trim() + scriptEditor.ext;
    const newScript = { name: fileName, content: scriptEditor.content };
    const newScripts = [...(activeNote.scripts || []), newScript];
    // 插入标记到光标位置
    const ta = textareaRef.current;
    const pos = ta ? (ta.selectionStart || 0) : (activeNote.content || "").length;
    const text = activeNote.content || "";
    const marker = `{{script:${fileName}}}`;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const pad = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const padAfter = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
    const newContent = before + pad + marker + padAfter + after;
    // 一次性更新 scripts 和 content，避免状态覆盖
    const updated = notes.map((n) => n.id === activeId ? { ...n, scripts: newScripts, content: newContent, updated_at: Date.now() } : n);
    setNotes(updated);
    save(updated.find((n) => n.id === activeId));
    setScriptEditor(null);
  }

  /* 渲染正文：将 {{script:xxx}} / {{file:xxx}} 替换为脚本链接 / 附件（图片内联，其他为下载链接） */
  function renderContent(content, scripts, attachments) {
    let html = marked.parse(content || "*暂无内容*");
    const bg = dark ? "#1e293b" : "#eef2ff";
    const border = dark ? "#334155" : "#c7d2fe";
    const color = dark ? "#60a5fa" : "#4338ca";
    // 脚本标记
    html = html.replace(/\{\{script:(.+?)\}\}/g, (_, name) => {
      const s = (scripts || []).find(x => x.name === name);
      if (!s) return `<span style="color:#999;font-size:13px">⚠️ 脚本未找到: ${name}</span>`;
      return `<span class="script-link" data-script="${name}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 14px;border-radius:8px;background:${bg};border:1px solid ${border};cursor:pointer;font-size:13px;color:${color};font-family:'Noto Serif SC',serif;transition:opacity .15s" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">📎 ${name} <span style="font-size:11px;opacity:.7">↓点击下载</span></span>`;
    });
    // 附件标记
    html = html.replace(/\{\{file:(.+?)\}\}/g, (_, name) => {
      const a = (attachments || []).find(x => x.name === name);
      if (!a) return `<span style="color:#999;font-size:13px">⚠️ 附件未找到: ${name}</span>`;
      const isImg = (a.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(a.name);
      if (isImg) {
        return `<span class="att-img" data-att="${name}" style="display:block;margin:10px 0"><img src="${a.url}" alt="${name}" style="max-width:100%;border-radius:8px;cursor:zoom-in;display:block" /><span style="font-size:12px;color:${dark ? "#71717a" : "#999"}">🖼 ${name} · 点击看大图</span></span>`;
      }
      return `<span class="att-link" data-att="${name}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 14px;border-radius:8px;background:${bg};border:1px solid ${border};cursor:pointer;font-size:13px;color:${color};font-family:'Noto Serif SC',serif;transition:opacity .15s" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">📎 ${name} <span style="font-size:11px;opacity:.7">↓点击下载</span></span>`;
    });
    return html;
  }

  const themeBtn = (
    <button onClick={onToggleDark}
      style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: "4px", lineHeight: 1 }}
      title={dark ? "切换亮色" : "切换暗色"}>
      {dark ? "☀️" : "🌙"}
    </button>
  );

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", background: T.bg }}>
      <style>{getCSS(dark)}</style>
      <p style={{ color: T.textMuted }}>加载中...</p>
    </div>
  );

  /* ── 侧边栏目录树节点（仅文件夹） ── */
  function TreeNode({ node, depth = 0 }) {
    const hasSubFolders = node.children && node.children.length > 0;
    const isExpanded = expanded[node.id];
    const isActive = currentFolder === node.id;
    const itemCount = notes.filter((n) => parentOf(n) === node.id).length; // 内含直接子项数
    return (
      <>
        <div
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: "pointer", background: isActive ? T.activeFilter : "transparent", transition: "background .12s", fontSize: 13, color: isActive ? T.text : T.textSub, fontWeight: isActive ? 600 : 400, minWidth: 0 }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.listHover; }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          onClick={() => navToFolder(node.id)}>
          {hasSubFolders ? (
            <span onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [node.id]: !p[node.id] })); }}
              style={{ width: 16, textAlign: "center", fontSize: 10, flexShrink: 0, color: T.textMuted, userSelect: "none" }}>
              {isExpanded ? "▼" : "▶"}
            </span>
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          <span style={{ flexShrink: 0 }}>📁</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {node.title || "未命名文件夹"}
          </span>
          {itemCount > 0 && <span style={{ fontSize: 10, color: T.textPlaceholder, flexShrink: 0 }}>{itemCount}</span>}
        </div>
        {hasSubFolders && isExpanded && node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
      </>
    );
  }

  /* ===== 列表视图 ===== */
  if (view === "list") return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Noto Serif SC',serif" }}>
      <style>{getCSS(dark)}</style>

      <header style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>📒</span>拾光笔记
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {themeBtn}
            <span style={{ fontSize: 12, color: T.textFaint }}>{user.email}</span>
            <button onClick={onLogout} style={{ fontSize: 12, color: T.btnOutline, background: "none", border: `1px solid ${T.borderDashed}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>退出</button>
          </div>
        </div>
      </header>

      <div style={{ background: BANNERS[0], padding: "14px 24px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,.15)" }}>我的知识库</span>
        <span style={{ fontSize: 13, opacity: .8 }}>·</span>
        <span style={{ fontSize: 13, opacity: .8 }}>共 {noteCount} 篇文章 · 记录学习与成长</span>
      </div>

      <div style={{ padding: narrow ? "16px 14px 60px" : "24px 24px 60px", display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 16 : 24 }}>
        {/* ── 左侧：文档目录树 + 标签 ── */}
        <aside style={{ width: narrow ? "100%" : 220, flexShrink: 0, position: narrow ? "static" : "sticky", top: 80, alignSelf: "flex-start", display: "flex", flexDirection: narrow ? "row" : "column", gap: 16, maxHeight: narrow ? 220 : "calc(100vh - 100px)", overflow: "auto" }}>
          {/* 目录树 */}
          <div style={{ background: T.sidebarBg, borderRadius: 10, padding: "12px", boxShadow: T.shadow, flex: narrow ? 1 : "none", minWidth: 0 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8, padding: "0 4px" }}>📂 文档目录</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: !currentFolder ? T.activeFilter : "transparent", fontSize: 13, color: !currentFolder ? T.text : T.textSub, fontWeight: !currentFolder ? 600 : 400, transition: "background .12s" }}
                onMouseEnter={(e) => { if (currentFolder) e.currentTarget.style.background = T.listHover; }}
                onMouseLeave={(e) => { if (currentFolder) e.currentTarget.style.background = "transparent"; }}
                onClick={() => navToFolder(null)}>
                <span style={{ width: 16, textAlign: "center", fontSize: 12 }}>🏠</span>
                <span>全部文档</span>
                <span style={{ fontSize: 10, color: T.textPlaceholder, marginLeft: "auto" }}>{noteCount}</span>
              </div>
              {folderTree.map((node) => <TreeNode key={node.id} node={node} />)}
              {folderTree.length === 0 && <p style={{ fontSize: 12, color: T.textTag, padding: "4px 8px" }}>暂无文件夹</p>}
            </div>
          </div>

          {/* 标签过滤 */}
          <div style={{ background: T.sidebarBg, borderRadius: 10, padding: "12px", boxShadow: T.shadow, flex: narrow ? 1 : "none", minWidth: 0 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8, padding: "0 4px" }}>🏷️ 标签</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => setFilterTag(null)}
                style={{ textAlign: "left", padding: "5px 8px", borderRadius: 6, border: "none", background: !filterTag ? T.activeFilter : "transparent", color: !filterTag ? T.text : T.textSub, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", fontWeight: !filterTag ? 600 : 400 }}>
                全部 <span style={{ fontSize: 11, color: T.textPlaceholder, marginLeft: 4 }}>{notes.length}</span>
              </button>
              {allTags.map((t) => {
                const c = TC[t] || { bg: dark ? "#27272a" : "#f5f5f5", fg: dark ? "#a1a1aa" : "#666" };
                const count = notes.filter((n) => (n.tags || []).includes(t)).length;
                return (
                  <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)}
                    style={{ textAlign: "left", padding: "5px 8px", borderRadius: 6, border: "none", background: filterTag === t ? c.bg : "transparent", color: filterTag === t ? c.fg : T.textSub, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", fontWeight: filterTag === t ? 600 : 400 }}>
                    {t} <span style={{ fontSize: 11, color: T.textPlaceholder, marginLeft: 4 }}>{count}</span>
                  </button>
                );
              })}
              {allTags.length === 0 && <p style={{ fontSize: 12, color: T.textTag, padding: "4px 8px" }}>暂无标签</p>}
            </div>
          </div>
        </aside>

        {/* ── 右侧：面包屑 + 文档列表 ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 面包屑导航 */}
          {(currentFolder || search) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13, color: T.textMuted, flexWrap: "wrap" }}>
              {search ? (
                <span>🔍 搜索结果：{filtered.length} 篇</span>
              ) : (
                <>
                  <span onClick={() => navToFolder(null)} style={{ cursor: "pointer", color: T.textSub, textDecoration: "underline" }}>🏠 根目录</span>
                  {breadcrumb.map((b, i) => (
                    <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: T.textPlaceholder }}>/</span>
                      {i < breadcrumb.length - 1 ? (
                        <span onClick={() => navToFolder(b.id)} style={{ cursor: "pointer", color: T.textSub, textDecoration: "underline" }}>{b.title || "无标题"}</span>
                      ) : (
                        <span style={{ color: T.text, fontWeight: 600 }}>{b.title || "无标题"}</span>
                      )}
                    </span>
                  ))}
                </>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textFaint }}>🔍</span>
              <input placeholder="搜索全部文章..." value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "10px 12px 10px 36px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, background: T.inputBg, fontFamily: "'Noto Serif SC',serif", color: T.text }} />
            </div>
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple onChange={importMd} style={{ display: "none" }} />
            <button onClick={() => setFolderEditor({ mode: "create", parentId: currentFolder, name: "" })}
              style={{ padding: "10px 16px", background: T.card, color: T.textSub, border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", whiteSpace: "nowrap" }}>
              📁 新建文件夹
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px 16px", background: T.card, color: T.textSub, border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", whiteSpace: "nowrap" }}>
              📄 导入
            </button>
            <button onClick={() => addNote()}
              style={{ padding: "10px 20px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", whiteSpace: "nowrap" }}>
              ＋ 写文章
            </button>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: T.textPlaceholder }}>
              <p style={{ fontSize: 48, marginBottom: 16 }}>{currentFolder ? "📂" : "📝"}</p>
              <p>{search || filterTag ? "没有找到匹配的文章" : currentFolder ? "此文件夹为空，可「写文章」或「新建文件夹」" : "还没有内容，点击「写文章」或「新建文件夹」开始"}</p>
            </div>
          )}

          <div style={{ background: T.card, borderRadius: 10, overflow: "hidden", boxShadow: T.shadow }}>
            {filtered.map((note, i) => {
              const isFolder = note.is_folder;
              const plain = (note.content || "").replace(/[#*`>\-\[\]()!~_|]/g, "").replace(/\n+/g, " ").trim();
              const itemCount = isFolder ? notes.filter((n) => parentOf(n) === note.id).length : 0;
              // 递归统计文件夹内全部后代数量（删除确认用）
              const descCount = isFolder ? (() => { let c = 0; const col = (id) => notes.filter((n) => n.parent_id === id).forEach((n) => { c++; col(n.id); }); col(note.id); return c; })() : 0;
              const aBtn = { padding: "6px 10px", fontSize: 12, background: "none", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", transition: "all .15s", opacity: .6 };
              return (
                <div key={note.id} className="card-anim"
                  style={{ display: "flex", alignItems: "center", borderBottom: i < filtered.length - 1 ? `1px solid ${T.borderLight}` : "none", animationDelay: i * .04 + "s", transition: "background .15s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = T.listHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <div onClick={() => isFolder ? navToFolder(note.id) : openNote(note.id)}
                    style={{ flex: 1, display: "flex", alignItems: "center", padding: narrow ? "12px 14px" : "12px 18px", cursor: "pointer", minWidth: 0, gap: 12 }}>
                    <div style={{ flex: narrow ? "1 1 auto" : "0 0 33%", minWidth: 0 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{isFolder ? "📁" : "📄"}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title || (isFolder ? "未命名文件夹" : "无标题")}</span>
                      </h3>
                      {!isFolder && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", overflow: "hidden", paddingLeft: 20 }}>
                          {(note.tags || []).map((t) => {
                            const c = TC[t] || { bg: dark ? "#27272a" : "#f5f5f5", fg: dark ? "#a1a1aa" : "#999" };
                            return <span key={t} style={{ fontSize: 12, color: c.fg, opacity: .75, whiteSpace: "nowrap" }}>{t}</span>;
                          })}
                          {(note.tags || []).length === 0 && <span style={{ fontSize: 12, color: T.textTag }}>无标签</span>}
                        </div>
                      )}
                      {isFolder && narrow && <div style={{ fontSize: 12, color: T.textMuted, paddingLeft: 20 }}>{itemCount} 个项目</div>}
                    </div>
                    {!narrow && (
                      <p style={{ flex: 1, fontSize: 13, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {isFolder ? `${itemCount} 个项目` : (plain || "暂无内容")}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginRight: 14, alignItems: "center" }}>
                    {isFolder && (
                      <button onClick={(e) => { e.stopPropagation(); setFolderEditor({ mode: "rename", id: note.id, name: note.title || "" }); }}
                        style={{ ...aBtn, color: T.textMuted }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                        重命名
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setMoveTarget({ id: note.id }); }}
                      style={{ ...aBtn, color: T.textMuted }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                      移动
                    </button>
                    {!isFolder && (
                      <button onClick={(e) => { e.stopPropagation(); exportMd(note); }}
                        style={{ ...aBtn, color: T.textMuted }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                        导出
                      </button>
                    )}
                    <button onClick={(e) => {
                      e.stopPropagation();
                      if (isFolder) {
                        if (confirm(descCount > 0 ? `「${note.title || "未命名文件夹"}」内含 ${descCount} 个项目，将一并删除且不可恢复。确定删除吗？` : `确定删除空文件夹「${note.title || "未命名文件夹"}」吗？`)) deleteFolder(note.id);
                      } else {
                        if (confirm(`确定删除「${note.title || "无标题"}」吗？`)) supabase.from("notes").delete().eq("id", note.id).then(() => setNotes((p) => p.filter((n) => n.id !== note.id)));
                      }
                    }}
                      style={{ ...aBtn, color: T.deleteText }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.deleteBorder; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 移动弹窗（目标只能是文件夹或根目录） ── */}
      {moveTarget && (() => {
        const movingNote = notes.find((n) => n.id === moveTarget.id);
        if (!movingNote) return null;
        // 排除自己及自己的全部后代（防止移进自己的子树）
        const selfAndDescendants = new Set();
        const collectDesc = (id) => { selfAndDescendants.add(id); notes.filter((n) => n.parent_id === id).forEach((n) => collectDesc(n.id)); };
        collectDesc(moveTarget.id);
        const targets = notes.filter((n) => n.is_folder && !selfAndDescendants.has(n.id));
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setMoveTarget(null); }}>
            <div style={{ width: 400, maxWidth: "90vw", maxHeight: "70vh", background: T.card, borderRadius: 12, boxShadow: T.shadowCard, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text }}>移动「{movingNote.title || (movingNote.is_folder ? "未命名文件夹" : "无标题")}」到...</h3>
                <button onClick={() => setMoveTarget(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.textMuted, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
                <div onClick={() => !(!movingNote.parent_id) && moveNote(moveTarget.id, null)}
                  style={{ padding: "10px 12px", borderRadius: 8, cursor: !movingNote.parent_id ? "default" : "pointer", fontSize: 14, color: !movingNote.parent_id ? T.textPlaceholder : T.text, display: "flex", alignItems: "center", gap: 8, transition: "background .12s" }}
                  onMouseEnter={(e) => { if (movingNote.parent_id) e.currentTarget.style.background = T.listHover; }}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  🏠 根目录 {!movingNote.parent_id && <span style={{ fontSize: 11, color: T.textPlaceholder }}>(当前)</span>}
                </div>
                {targets.map((t) => {
                  const isCurrent = movingNote.parent_id === t.id;
                  const depth = getAncestors(notes, t.id).length - 1;
                  return (
                    <div key={t.id} onClick={() => !isCurrent && moveNote(moveTarget.id, t.id)}
                      style={{ padding: "10px 12px", paddingLeft: 12 + depth * 16, borderRadius: 8, cursor: isCurrent ? "default" : "pointer", fontSize: 14, color: isCurrent ? T.textPlaceholder : T.text, display: "flex", alignItems: "center", gap: 8, transition: "background .12s" }}
                      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = T.listHover; }}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      📁 {t.title || "未命名文件夹"} {isCurrent && <span style={{ fontSize: 11, color: T.textPlaceholder }}>(当前)</span>}
                    </div>
                  );
                })}
                {targets.length === 0 && <p style={{ fontSize: 13, color: T.textMuted, padding: "12px", textAlign: "center" }}>暂无其他文件夹，可移到根目录或先新建文件夹</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 文件夹新建/重命名弹窗 ── */}
      {folderEditor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setFolderEditor(null); }}>
          <div style={{ width: 380, maxWidth: "90vw", background: T.card, borderRadius: 12, boxShadow: T.shadowCard, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{folderEditor.mode === "create" ? "📁 新建文件夹" : "✏️ 重命名文件夹"}</h3>
            </div>
            <div style={{ padding: "20px" }}>
              <input autoFocus placeholder="文件夹名称" value={folderEditor.name}
                onChange={(e) => setFolderEditor({ ...folderEditor, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveFolderEditor(); if (e.key === "Escape") setFolderEditor(null); }}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, background: T.inputBg, color: T.text, fontFamily: "'Noto Serif SC',serif" }} />
            </div>
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setFolderEditor(null)}
                style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${T.borderDashed}`, background: "transparent", color: T.textSub, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>取消</button>
              <button onClick={saveFolderEditor} disabled={!folderEditor.name.trim()}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: T.btnBg, color: T.btnText, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", opacity: !folderEditor.name.trim() ? .4 : 1 }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!activeNote) { setView("list"); return null; }

  /* ===== 阅读视图 ===== */
  if (view === "read") {
    const readAncestors = getAncestors(notes, activeNote.parent_id);
    return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Noto Serif SC',serif" }}>
      <style>{getCSS(dark)}</style>

      <header style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={backToList} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: T.textSub, fontFamily: "'Noto Serif SC',serif" }}>← 返回列表</button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {themeBtn}
            <button onClick={() => goToEdit(activeId)} style={{ padding: "5px 14px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>编辑</button>
            <button onClick={deleteNote} style={{ padding: "5px 14px", background: T.deleteBg, color: T.deleteText, border: `1px solid ${T.deleteBorder}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>删除</button>
          </div>
        </div>
      </header>

      {/* 面包屑 */}
      {(readAncestors.length > 0 || activeNote.parent_id) && (
        <div style={{ padding: "8px 24px", fontSize: 12, color: T.textMuted, background: T.card, borderBottom: `1px solid ${T.borderLight}`, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span onClick={() => { setCurrentFolder(null); setView("list"); setActiveId(null); window.history.pushState({ view: "list", noteId: null, folderId: null }, ""); }} style={{ cursor: "pointer", textDecoration: "underline" }}>🏠 根目录</span>
          {readAncestors.map((a) => (
            <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: T.textPlaceholder }}>/</span>
              <span onClick={() => navToFolder(a.id)} style={{ cursor: "pointer", textDecoration: "underline" }}>{a.title || "无标题"}</span>
            </span>
          ))}
          <span style={{ color: T.textPlaceholder }}>/</span>
          <span style={{ color: T.text, fontWeight: 600 }}>{activeNote.title || "无标题"}</span>
        </div>
      )}

      <div style={{ background: BANNERS[activeNote.banner || 0], padding: "16px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxHeight: 88, overflow: "hidden" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,.2)", lineHeight: 1.4, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>
          {activeNote.title || "无标题"}
        </h1>
        {(activeNote.tags || []).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(activeNote.tags || []).map((t) => {
              const c = TC[t] || { bg: "#f5f5f5", fg: "#666" };
              return <span key={t} style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,.88)", color: c.fg }}>{t}</span>;
            })}
          </div>
        )}
      </div>

      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: T.textMuted, paddingBottom: 20, borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
          <span>📅 {fmtDate(activeNote.created_at)}</span>
          <span>✏️ {fmtDate(activeNote.updated_at)}</span>
          <span>📖 {wordCount(activeNote.content)} 字</span>
          <span>⏱ {readTime(activeNote.content)}</span>
        </div>
      </div>

      <div style={{ padding: "28px 24px 20px" }}>
        <div className="article-body"
          onClick={(e) => {
            const sl = e.target.closest(".script-link");
            if (sl) { const s = (activeNote.scripts || []).find(x => x.name === sl.getAttribute("data-script")); if (s) downloadScript(s); return; }
            const al = e.target.closest(".att-link");
            if (al) { const a = (activeNote.attachments || []).find(x => x.name === al.getAttribute("data-att")); if (a) downloadAttachment(a); return; }
            const ai = e.target.closest(".att-img");
            if (ai) { const a = (activeNote.attachments || []).find(x => x.name === ai.getAttribute("data-att")); if (a) window.open(a.url, "_blank"); }
          }}
          dangerouslySetInnerHTML={{ __html: renderContent(activeNote.content || "*暂无内容*", activeNote.scripts, activeNote.attachments) }} />
      </div>
      <div style={{ height: 60 }} />
    </div>
  );}

  /* ===== 编辑视图 ===== */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Noto Serif SC',serif" }}>
      <style>{getCSS(dark)}</style>

      <header style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={() => { setView("list"); setActiveId(null); setCurrentFolder(null); window.history.pushState({ view: "list", noteId: null, folderId: null }, ""); }} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: T.textSub, fontFamily: "'Noto Serif SC',serif" }}>← 首页</button>
            <button onClick={() => window.history.back()} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: T.textSub, fontFamily: "'Noto Serif SC',serif" }}>← 返回阅读</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {themeBtn}
            {saving ? <span style={{ fontSize: 12, color: "#f59e0b" }}>保存中...</span> : <span style={{ fontSize: 12, color: "#22c55e" }}>已同步 ☁️</span>}
            <button onClick={deleteNote} style={{ padding: "5px 14px", background: T.deleteBg, color: T.deleteText, border: `1px solid ${T.deleteBorder}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>删除</button>
          </div>
        </div>
      </header>

      <div style={{ padding: "24px" }}>
        <input placeholder="文章标题..." value={activeNote.title} onChange={(e) => update("title", e.target.value)}
          style={{ width: "100%", border: "none", fontSize: 28, fontWeight: 700, color: T.text, background: "transparent", padding: "0 0 16px", fontFamily: "'Noto Serif SC',serif", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: T.textMuted }}>标签：</span>
          {allTags.map((t) => {
            const active = (activeNote.tags || []).includes(t);
            const c = TC[t] || { bg: dark ? "#27272a" : "#f0f0f0", fg: dark ? "#a1a1aa" : "#666" };
            return (
              <button key={t} onClick={() => {
                const tags = activeNote.tags || [];
                update("tags", active ? tags.filter((x) => x !== t) : [...tags, t]);
              }}
                style={{ padding: "4px 12px", borderRadius: 14, border: active ? `1px solid ${c.fg}` : `1px solid ${T.borderDashed}`, background: active ? c.bg : T.inputBg, color: active ? c.fg : T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", transition: "all .15s" }}>
                {t}
              </button>
            );
          })}
          <input
            placeholder="新标签回车添加"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                const tag = e.target.value.trim();
                if (!(activeNote.tags || []).includes(tag)) {
                  update("tags", [...(activeNote.tags || []), tag]);
                }
                e.target.value = "";
              }
            }}
            style={{ padding: "4px 10px", border: `1px solid ${T.borderDashed}`, borderRadius: 14, fontSize: 12, fontFamily: "'Noto Serif SC',serif", width: 120, background: T.inputBg, color: T.text }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: T.textMuted }}>附件脚本：</span>
          {(activeNote.scripts || []).map((s, idx) => (
            <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 14, background: dark ? "#1e293b" : "#eef2ff", border: `1px solid ${dark ? "#334155" : "#c7d2fe"}`, fontSize: 12 }}>
              <span style={{ color: dark ? "#93c5fd" : "#4338ca" }}>🐍 {s.name}</span>
              <button onClick={() => downloadScript(s)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: dark ? "#60a5fa" : "#6366f1", padding: 0, fontFamily: "'Noto Serif SC',serif" }}>下载</button>
              <button onClick={() => removeScript(idx)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.deleteText, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input ref={scriptInputRef} type="file" accept=".py,.sh,.js,.ts,.sql,.bat,.rb,.go,.java,.kt,.swift,.r,.pl,.lua,.yaml,.yml,.json,.xml,.toml,.cfg,.ini,.conf" multiple onChange={addScripts} style={{ display: "none" }} />
          <button onClick={() => scriptInputRef.current?.click()}
            style={{ padding: "4px 12px", borderRadius: 14, border: `1px dashed ${T.borderDashed}`, background: "transparent", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>
            ＋ 上传脚本
          </button>
          <button onClick={() => setScriptEditor({ name: "", ext: ".py", content: "" })}
            style={{ padding: "4px 12px", borderRadius: 14, border: `1px dashed ${dark ? "#334155" : "#c7d2fe"}`, background: "transparent", color: dark ? "#60a5fa" : "#4338ca", fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>
            ✏️ 编写脚本
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: T.textMuted }}>附件：</span>
          {(activeNote.attachments || []).map((a, idx) => {
            const isImg = (a.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(a.name);
            return (
              <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 14, background: dark ? "#1e293b" : "#eef2ff", border: `1px solid ${dark ? "#334155" : "#c7d2fe"}`, fontSize: 12 }}>
                <span style={{ color: dark ? "#93c5fd" : "#4338ca" }}>{isImg ? "🖼" : "📎"} {a.name}</span>
                <button onClick={() => downloadAttachment(a)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: dark ? "#60a5fa" : "#6366f1", padding: 0, fontFamily: "'Noto Serif SC',serif" }}>下载</button>
                <button onClick={() => removeAttachment(idx)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.deleteText, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            );
          })}
          <input ref={attInputRef} type="file" multiple onChange={addAttachments} style={{ display: "none" }} />
          <button onClick={() => attInputRef.current?.click()} disabled={uploadingAtt}
            style={{ padding: "4px 12px", borderRadius: 14, border: `1px dashed ${T.borderDashed}`, background: "transparent", color: T.textMuted, fontSize: 12, cursor: uploadingAtt ? "wait" : "pointer", fontFamily: "'Noto Serif SC',serif", opacity: uploadingAtt ? .6 : 1 }}>
            {uploadingAtt ? "上传中..." : "📎 添加附件"}
          </button>
        </div>

        {scriptEditor && (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setScriptEditor(null); }}>
            <div style={{ width: 600, maxWidth: "90vw", maxHeight: "85vh", background: T.card, borderRadius: 12, boxShadow: T.shadowCard, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.text }}>编写脚本</h3>
                <button onClick={() => setScriptEditor(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.textMuted, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1, overflow: "auto" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input placeholder="脚本名称" value={scriptEditor.name} onChange={(e) => setScriptEditor({ ...scriptEditor, name: e.target.value })}
                    style={{ flex: 1, padding: "8px 12px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, background: T.inputBg, color: T.text, fontFamily: "'Noto Serif SC',serif" }} />
                  <select value={scriptEditor.ext} onChange={(e) => setScriptEditor({ ...scriptEditor, ext: e.target.value })}
                    style={{ padding: "8px 12px", border: `1px solid ${T.borderInput}`, borderRadius: 8, fontSize: 14, background: T.inputBg, color: T.text, fontFamily: "'Fira Code',monospace", cursor: "pointer" }}>
                    <option value=".py">.py</option>
                    <option value=".sh">.sh</option>
                    <option value=".js">.js</option>
                    <option value=".ts">.ts</option>
                    <option value=".sql">.sql</option>
                    <option value=".java">.java</option>
                    <option value=".kt">.kt</option>
                    <option value=".go">.go</option>
                    <option value=".rb">.rb</option>
                    <option value=".yaml">.yaml</option>
                    <option value=".json">.json</option>
                    <option value=".xml">.xml</option>
                    <option value=".toml">.toml</option>
                    <option value=".bat">.bat</option>
                    <option value=".txt">.txt</option>
                  </select>
                </div>
                <textarea placeholder="在此输入脚本内容..." value={scriptEditor.content} onChange={(e) => setScriptEditor({ ...scriptEditor, content: e.target.value })}
                  style={{ flex: 1, minHeight: 280, border: `1px solid ${T.borderInput}`, borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.6, resize: "none", fontFamily: "'Fira Code',monospace", color: T.text, background: T.editorBg }} />
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setScriptEditor(null)}
                  style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${T.borderDashed}`, background: "transparent", color: T.textSub, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>
                  取消
                </button>
                <button onClick={saveManualScript} disabled={!scriptEditor.name.trim() || !scriptEditor.content.trim()}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: T.btnBg, color: T.btnText, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", opacity: (!scriptEditor.name.trim() || !scriptEditor.content.trim()) ? .4 : 1 }}>
                  完成
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, minHeight: "calc(100vh - 260px)" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>Markdown 编辑</span>
              <span>{wordCount(activeNote.content)} 字</span>
            </div>
            <textarea ref={textareaRef} value={activeNote.content} onChange={(e) => update("content", e.target.value)}
              placeholder={"开始写作...\n\n支持 Markdown 语法：\n# 标题\n## 二级标题\n**加粗** *斜体*\n- 列表项\n> 引用\n`代码`\n```代码块```"}
              style={{ flex: 1, border: `1px solid ${T.borderInput}`, borderRadius: 10, padding: "16px 18px", fontSize: 14, lineHeight: 1.8, resize: "none", fontFamily: "'Fira Code','Noto Serif SC',serif", color: T.text, background: T.editorBg }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>实时预览</div>
            <div style={{ flex: 1, border: `1px solid ${T.borderInput}`, borderRadius: 10, padding: "16px 18px", background: T.editorBg, overflowY: "auto" }}
              onClick={(e) => {
                const sl = e.target.closest(".script-link");
                if (sl) { const s = (activeNote.scripts || []).find(x => x.name === sl.getAttribute("data-script")); if (s) downloadScript(s); return; }
                const al = e.target.closest(".att-link");
                if (al) { const a = (activeNote.attachments || []).find(x => x.name === al.getAttribute("data-att")); if (a) downloadAttachment(a); return; }
                const ai = e.target.closest(".att-img");
                if (ai) { const a = (activeNote.attachments || []).find(x => x.name === ai.getAttribute("data-att")); if (a) window.open(a.url, "_blank"); }
              }}>
              <div className="article-body" dangerouslySetInnerHTML={{ __html: renderContent(activeNote.content || "*开始写作后这里会显示预览...*", activeNote.scripts, activeNote.attachments) }} />
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
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");

  const T = dark ? DARK : LIGHT;
  const onToggleDark = () => {
    setDark((d) => {
      localStorage.setItem("theme", !d ? "dark" : "light");
      return !d;
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", background: T.bg }}>
      <style>{getCSS(dark)}</style><p style={{ color: T.textMuted }}>加载中...</p>
    </div>
  );
  if (!user) return <AuthPage onAuth={setUser} dark={dark} T={T} />;
  return <NotesApp user={user} onLogout={() => supabase.auth.signOut().then(() => setUser(null))} dark={dark} onToggleDark={onToggleDark} T={T} />;
}
