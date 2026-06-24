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
    arr.sort(folderCmp);
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// 文件夹排序：手动顺序(sort_order)优先升序，未拖过的(null)按名称排前
function folderCmp(a, b) {
  const an = a.sort_order == null, bn = b.sort_order == null;
  if (an && bn) return (a.title || "").localeCompare(b.title || "", "zh");
  if (an !== bn) return an ? -1 : 1;
  return a.sort_order - b.sort_order;
}

/* 导入图片压缩：重编码为 WebP(质量0.82) 并限宽 1920px，Confluence/Word 截图常为全尺寸 PNG，
   通常可省 60~85%。护栏：压缩结果未小于原图 90% 则保留原图；gif/svg 等跳过（避免动图变静图） */
async function compressImageBlob(blob, mime) {
  try {
    if (!/^image\/(png|jpe?g|webp|bmp)$/i.test(mime)) return { blob, mime };
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 1920 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.82));
    if (out && out.size < blob.size * 0.9) return { blob: out, mime: "image/webp" };
  } catch { /* 解码失败按原图上传 */ }
  return { blob, mime };
}

// 解码 MIME quoted-printable（Confluence「导出 Word」的 MHTML 用它编码 HTML 部件）
function decodeQP(s, charset = "utf-8") {
  s = s.replace(/=\r?\n/g, ""); // 软换行
  const bytes = new Uint8Array(s.length);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes[n++] = parseInt(s.slice(i + 1, i + 3), 16);
      i += 2;
    } else bytes[n++] = s.charCodeAt(i) & 0xff;
  }
  try { return new TextDecoder(charset).decode(bytes.subarray(0, n)); }
  catch { return new TextDecoder("utf-8").decode(bytes.subarray(0, n)); }
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

// HTML 笔记在沙箱 iframe（无 allow-same-origin）里渲染，访问 localStorage/sessionStorage 会抛 SecurityError，
// 导致页面自带脚本（目录折叠、字号记忆等）从读 storage 那一行起整段崩溃。这里在 srcDoc 最前面注入一段内存版
// storage 垫片，让这类调用不再抛异常，从而保留沙箱隔离的同时让页面正常工作。
const STORAGE_SHIM = `<script>(function(){function mk(){var m=Object.create(null);return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[String(k)]=String(v)},removeItem:function(k){delete m[String(k)]},clear:function(){m=Object.create(null)},key:function(i){var a=Object.keys(m);return i>=0&&i<a.length?a[i]:null},get length(){return Object.keys(m).length}}}function inst(n){try{void window[n].length;return}catch(e){}try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(e){}}inst('localStorage');inst('sessionStorage')})();</script>`;

function withStorageShim(html) {
  const src = html || "";
  const head = src.match(/<head[^>]*>/i);
  if (head) return src.slice(0, head.index + head[0].length) + STORAGE_SHIM + src.slice(head.index + head[0].length);
  const htmlTag = src.match(/<html[^>]*>/i);
  if (htmlTag) return src.slice(0, htmlTag.index + htmlTag[0].length) + STORAGE_SHIM + src.slice(htmlTag.index + htmlTag[0].length);
  return STORAGE_SHIM + src;
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
  const [exportMenu, setExportMenu] = useState(null); // 导出格式选择菜单：当前笔记 id
  const [dragId, setDragId] = useState(null); // 正在拖拽的文档 id
  const [dragOverId, setDragOverId] = useState(null); // 拖拽悬停的目标文档 id
  const [dragTag, setDragTag] = useState(null); // 正在拖拽的标签
  const [dragOverTag, setDragOverTag] = useState(null); // 拖拽悬停的目标标签
  // 标签显示顺序（仅本机持久化；标签是从笔记聚合的派生数据，云端无实体）
  const [tagOrder, setTagOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tagOrder:" + user.id)) || []; } catch { return []; }
  });
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);
  const TC = dark ? TAG_COLORS_DARK : TAG_COLORS;

  // 响应式：窄屏（手机/小窗）时调整布局，保证标题始终可见
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 点击空白处关闭导出格式菜单
  useEffect(() => {
    if (!exportMenu) return;
    const close = () => setExportMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [exportMenu]);

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
    // 文件夹排前（手动顺序优先，未拖过的按名称），笔记排后：有手动排序(sort_order)按它升序，
    // 未排序的(null)视为最新置顶、按更新时间降序 —— 兼容老数据且新建文档仍出现在顶部
    const fs = r.filter((n) => n.is_folder).sort(folderCmp);
    const ds = r.filter((n) => !n.is_folder).sort((a, b) => {
      const an = a.sort_order == null, bn = b.sort_order == null;
      if (an && bn) return (b.updated_at || 0) - (a.updated_at || 0);
      if (an !== bn) return an ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
    return [...fs, ...ds];
  }, [notes, filterTag, search, currentFolder, folderSet]);

  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [notes]);

  // 侧边栏标签按用户拖拽过的顺序显示；新出现的标签补在末尾，已消失的自动剔除
  const orderedTags = useMemo(() => {
    const known = tagOrder.filter((t) => allTags.includes(t));
    const rest = allTags.filter((t) => !tagOrder.includes(t));
    return [...known, ...rest];
  }, [allTags, tagOrder]);

  // 仅在默认浏览（无搜索、无标签筛选）时允许拖拽排序，避免对子集重排的歧义
  const canDragRows = !search && !filterTag;
  // 正在拖拽的是否是文件夹（用于只高亮同类型的放置目标）
  const dragIsFolder = dragId ? !!(notes.find((n) => n.id === dragId) || {}).is_folder : null;

  /* 把 fromId 插到组内 toId 的位置，对整组重新编号(0..n-1)并持久化 */
  function commitReorder(group, fromId, toId) {
    const fi = group.findIndex((n) => n.id === fromId);
    const ti = group.findIndex((n) => n.id === toId);
    if (fi < 0 || ti < 0) return;
    const arr = [...group];
    const [moved] = arr.splice(fi, 1);
    arr.splice(ti, 0, moved);
    const orderMap = new Map(arr.map((n, i) => [n.id, i]));
    const changed = [];
    const updated = notes.map((n) => {
      const o = orderMap.get(n.id);
      if (o !== undefined && n.sort_order !== o) { const u = { ...n, sort_order: o }; changed.push(u); return u; }
      return n;
    });
    setNotes(updated);
    if (changed.length) {
      supabase.from("notes").upsert(changed).then(({ error }) => {
        if (error) alert("排序保存失败：" + error.message + "\n（若提示 sort_order 不存在，需先在 Supabase 执行 alter table notes add column sort_order double precision;）");
      });
    }
  }

  /* 主列表拖拽放下：文档对文档、文件夹对文件夹，组取当前视图的同类行 */
  function dropNoteOn(targetId) {
    const from = dragId;
    setDragId(null); setDragOverId(null);
    if (!from || from === targetId) return;
    const src = notes.find((n) => n.id === from);
    const dst = notes.find((n) => n.id === targetId);
    if (!src || !dst || !!src.is_folder !== !!dst.is_folder) return; // 文档与文件夹不互为放置目标
    commitReorder(filtered.filter((n) => !!n.is_folder === !!src.is_folder), from, targetId);
  }

  /* 侧边栏树拖拽放下：仅同一父级下的文件夹之间排序，跨级忽略 */
  function dropTreeFolderOn(targetId) {
    const from = dragId;
    setDragId(null); setDragOverId(null);
    if (!from || from === targetId) return;
    const src = notes.find((n) => n.id === from);
    const dst = notes.find((n) => n.id === targetId);
    if (!src || !dst || !src.is_folder || !dst.is_folder) return;
    if (parentOf(src) !== parentOf(dst)) return; // 仅同级
    const siblings = notes.filter((n) => n.is_folder && parentOf(n) === parentOf(src)).sort(folderCmp);
    commitReorder(siblings, from, targetId);
  }

  // 侧边栏树的放置目标校验：被拖的是文件夹且与目标同级
  function canTreeDropOn(dstNode) {
    if (!dragId || dragId === dstNode.id) return false;
    const src = notes.find((n) => n.id === dragId);
    return !!(src && src.is_folder && parentOf(src) === parentOf(dstNode));
  }

  /* 拖拽标签放下：调整本机标签顺序并写回 localStorage */
  function dropTagOn(target) {
    const from = dragTag;
    setDragTag(null); setDragOverTag(null);
    if (!from || from === target) return;
    const arr = [...orderedTags];
    const fi = arr.indexOf(from), ti = arr.indexOf(target);
    if (fi < 0 || ti < 0) return;
    arr.splice(fi, 1);
    arr.splice(ti, 0, from);
    setTagOrder(arr);
    try { localStorage.setItem("tagOrder:" + user.id, JSON.stringify(arr)); } catch { /* 存储不可用时仅本次会话生效 */ }
  }

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
    const n = { id: genId(), title: "", content: "", format: "md", tags: [], scripts: [], attachments: [], is_folder: false, parent_id: pid || null, banner: Math.floor(Math.random() * BANNERS.length), created_at: Date.now(), updated_at: Date.now(), user_id: user.id };
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

  /* 删除单条笔记并清理其 Storage 附件（列表卡片删除入口；修复原先直删行导致附件成孤儿文件的问题） */
  async function removeNote(note) {
    const paths = (note.attachments || []).map((a) => a.path).filter(Boolean);
    await supabase.from("notes").delete().eq("id", note.id);
    if (paths.length) await supabase.storage.from(ATT_BUCKET).remove(paths);
    setNotes((p) => p.filter((n) => n.id !== note.id));
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
  function goToEdit(nid) {
    const n = notes.find((x) => x.id === nid);
    if (n && ["html", "pdf"].includes(n.format)) { navPush("read", nid); return; } // html/pdf 笔记只读
    navPush("edit", nid);
  }

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

  /* ─── 导入文件（支持批量）：md/txt 可编辑；html/docx 转只读 HTML；pdf 存 Storage 原样预览 ─── */
  async function importMd(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newNotes = [];
    for (const file of files) {
      // 每条笔记的公共字段
      const base = { id: genId(), tags: [], scripts: [], attachments: [], is_folder: false, parent_id: currentFolder || null, banner: Math.floor(Math.random() * BANNERS.length), created_at: Date.now(), updated_at: Date.now(), user_id: user.id };
      // 按扩展名初判类型；.doc 额外按文件头嗅探 —— 不少工具导出的 ".doc" 实为 docx(zip) 或 HTML 换皮，
      // 只有真正的旧版二进制 .doc(OLE2) 才无法在浏览器解析
      let kind;
      if (/\.pdf$/i.test(file.name)) kind = "pdf";
      else if (/\.docx$/i.test(file.name)) kind = "docx";
      else if (/\.doc$/i.test(file.name)) {
        const headBuf = await file.slice(0, 256).arrayBuffer();
        const head = new Uint8Array(headBuf);
        const headText = new TextDecoder("utf-8").decode(headBuf).trimStart(); // TextDecoder 自动剥 BOM
        if (head[0] === 0x50 && head[1] === 0x4b) kind = "docx"; // PK → zip，实为 OOXML
        else if (headText.startsWith("<")) kind = "html"; // HTML 伪装的 .doc
        else if (/^(message-id|mime-version|content-type|subject|from)\s*:/im.test(headText.slice(0, 200))) kind = "mhtml"; // Confluence「导出 Word」实为 MHTML
        else {
          alert(`「${file.name}」是旧版二进制 .doc 格式，浏览器无法解析。建议导出为 .docx 或 PDF 后再导入。`);
          continue;
        }
      }
      else if (/\.(html?|htm)$/i.test(file.name)) kind = "html";
      else kind = "md";
      if (kind === "pdf") {
        // PDF：原文件传 Storage，笔记只存引用；文件记录放进笔记自身 attachments，
        // 这样 deleteNote/deleteFolder/removeNote 的清理逻辑直接覆盖
        if (file.size > MAX_ATT_SIZE) { alert(`「${file.name}」超过 20MB，请压缩后再导入`); continue; }
        const path = `${user.id}/${genId()}.pdf`;
        const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) { alert(`上传「${file.name}」失败：${error.message}`); continue; }
        const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
        newNotes.push({ ...base, title: file.name.replace(/\.pdf$/i, ""), content: "", format: "pdf", attachments: [{ name: file.name, type: "application/pdf", path, url }] });
      } else if (kind === "docx") {
        // Word：mammoth 纯前端转 HTML，走现有 html 只读管线。
        // 内嵌图片不做 base64 内联（企微文档截图多，会把笔记撑到数 MB 拖慢全量加载），
        // 而是逐张上传 Storage、HTML 里引 URL；图片记录挂进笔记 attachments，删除时自动清理
        const title = file.name.replace(/\.docx?$/i, "");
        const uploadedImgs = [];
        try {
          const m = await import("mammoth");
          const mammoth = m.default || m;
          const convertImage = mammoth.images.imgElement(async (image) => {
            const b64 = await image.read("base64");
            const rawType = image.contentType || "image/png";
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const { blob, mime } = await compressImageBlob(new Blob([bytes], { type: rawType }), rawType);
            const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
            const path = `${user.id}/${genId()}.${ext}`;
            const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
            if (error) throw new Error("内嵌图片上传失败：" + error.message);
            const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
            uploadedImgs.push({ name: `${title}-img${uploadedImgs.length + 1}.${ext}`, type: mime, path, url });
            return { src: url };
          });
          const { value: bodyHtml } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage });
          const safeTitle = title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
          const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>body{max-width:760px;margin:32px auto;padding:0 20px;font-family:-apple-system,"Noto Serif SC","Segoe UI",serif;line-height:1.8;color:#1f2937}img{max-width:100%}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left}p{margin:.6em 0}h1,h2,h3{line-height:1.3;margin:1.2em 0 .5em}</style>
</head><body>${bodyHtml}</body></html>`;
          if (html.length > 2 * 1024 * 1024) {
            alert(`「${file.name}」转换后约 ${(html.length / 1024 / 1024).toFixed(1)}MB（多为内嵌图片），可能超过云端单条上限导致保存失败。`);
          }
          newNotes.push({ ...base, title, content: html, format: "html", attachments: uploadedImgs });
        } catch (err) {
          // 转换失败时回滚已上传的图片，避免 Storage 留下孤儿文件
          if (uploadedImgs.length) await supabase.storage.from(ATT_BUCKET).remove(uploadedImgs.map((i) => i.path));
          alert(`解析「${file.name}」失败：${err.message || err}`);
          continue;
        }
      } else if (kind === "mhtml") {
        // Confluence「导出 Word」的 .doc 实为 MHTML：按 MIME boundary 拆部件，
        // HTML 部件解码（quoted-printable/base64）做正文，图片部件上传 Storage 并把引用改为 URL
        const uploadedImgs = [];
        try {
          const raw = await file.text();
          const bm = raw.match(/boundary="?([^"\r\n;]+)"?/i);
          let html = null;
          const imgMap = [];
          const parts = bm ? raw.split("--" + bm[1]) : [raw];
          for (const part of parts) {
            const headerEnd = part.search(/\r?\n\r?\n/);
            if (headerEnd < 0) continue;
            const headers = part.slice(0, headerEnd);
            const body = part.slice(headerEnd).replace(/^\s+/, "").replace(/\s+$/, "");
            const ct = ((headers.match(/content-type:\s*([^;\r\n]+)/i) || [])[1] || "").trim().toLowerCase();
            const charset = (headers.match(/charset="?([\w-]+)"?/i) || [])[1] || "utf-8";
            const enc = ((headers.match(/content-transfer-encoding:\s*(\S+)/i) || [])[1] || "").toLowerCase();
            const loc = ((headers.match(/content-location:\s*(\S+)/i) || [])[1] || "").trim();
            const cid = ((headers.match(/content-id:\s*<?([^>\r\n]+)>?/i) || [])[1] || "").trim();
            if (ct === "text/html" && html == null) {
              html = enc === "base64"
                ? new TextDecoder(charset).decode(Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0)))
                : decodeQP(body, charset);
            } else if (ct.startsWith("image/") && enc === "base64") {
              const bytes = Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0));
              const { blob, mime } = await compressImageBlob(new Blob([bytes], { type: ct }), ct);
              const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
              const path = `${user.id}/${genId()}.${ext}`;
              const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
              if (error) throw new Error("内嵌图片上传失败：" + error.message);
              const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
              uploadedImgs.push({ name: `${file.name.replace(/\.doc$/i, "")}-img${uploadedImgs.length + 1}.${ext}`, type: mime, path, url });
              imgMap.push({ loc, cid, url });
            }
          }
          if (html == null) throw new Error("未找到 HTML 内容部件，可能不是 Confluence 导出的格式");
          // 把正文里对图片部件的引用（Content-Location / cid:）替换为 Storage URL
          for (const im of imgMap) {
            if (im.loc) html = html.split(im.loc).join(im.url);
            if (im.cid) html = html.split("cid:" + im.cid).join(im.url);
          }
          const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = (tm && tm[1].trim()) || file.name.replace(/\.doc$/i, "");
          newNotes.push({ ...base, title, content: html, format: "html", attachments: uploadedImgs });
        } catch (err) {
          // 解析失败回滚已上传的图片，避免 Storage 留下孤儿文件
          if (uploadedImgs.length) await supabase.storage.from(ATT_BUCKET).remove(uploadedImgs.map((i) => i.path));
          alert(`解析「${file.name}」失败：${err.message || err}`);
          continue;
        }
      } else if (kind === "html") {
        // HTML 导入：原文存入 content，标记 format=html（只读，iframe 隔离渲染）。
        // 正文里较大的 base64 内嵌图片拆出来压缩上传 Storage、替换为 URL（瘦身正文，
        // 避免撑大笔记拖慢全量加载）；小图标保持内联；单张失败保留内联不影响导入
        let text = await file.text();
        const uploadedImgs = [];
        try {
          const seen = new Map(); // 相同图片去重
          for (const mt of [...text.matchAll(/data:image\/(png|jpe?g|webp|bmp|gif);base64,([A-Za-z0-9+/=]+)/g)]) {
            const dataUri = mt[0];
            if (dataUri.length < 12 * 1024 || seen.has(dataUri)) continue;
            const mimeRaw = "image/" + mt[1].toLowerCase();
            const bytes = Uint8Array.from(atob(mt[2]), (c) => c.charCodeAt(0));
            const { blob, mime } = await compressImageBlob(new Blob([bytes], { type: mimeRaw }), mimeRaw);
            const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
            const path = `${user.id}/${genId()}.${ext}`;
            const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
            if (error) continue; // 上传失败：该图保持内联
            const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
            uploadedImgs.push({ name: `${file.name.replace(/\.(html?|htm|doc)$/i, "")}-img${uploadedImgs.length + 1}.${ext}`, type: mime, path, url });
            seen.set(dataUri, url);
            text = text.split(dataUri).join(url);
          }
        } catch { /* 拆图异常则整体保持原文 */ }
        if (text.length > 2 * 1024 * 1024) {
          alert(`「${file.name}」体积约 ${(text.length / 1024 / 1024).toFixed(1)}MB，可能超过云端单条上限导致导入失败。建议精简后再试。`);
        }
        const tm = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = (tm && tm[1].trim()) || file.name.replace(/\.(html?|htm|doc)$/i, "");
        newNotes.push({ ...base, title, content: text, format: "html", attachments: uploadedImgs });
      } else {
        const text = await file.text();
        const m = text.match(/^#\s+(.+)$/m);
        const title = m ? m[1].trim() : file.name.replace(/\.(md|markdown|txt)$/i, "");
        const content = m ? text.replace(/^#\s+.+\n*/, "") : text;
        newNotes.push({ ...base, title, content, format: "md" });
      }
    }
    e.target.value = "";
    if (newNotes.length === 0) return;
    setNotes((p) => [...newNotes, ...p]);
    const { error } = await supabase.from("notes").insert(newNotes);
    if (error) { alert("导入保存失败：" + error.message); return; }
    if (newNotes.length === 1) {
      // 只读格式（html/pdf）→ 直接进阅读页；Markdown → 进编辑页
      navPush(["html", "pdf"].includes(newNotes[0].format) ? "read" : "edit", newNotes[0].id);
    }
  }

  /* ─── 通用：触发浏览器下载 ─── */
  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── 导出 .md 文件 ─── */
  function exportMd(note) {
    const md = (note.title ? "# " + note.title + "\n\n" : "") + (note.content || "");
    triggerDownload(md, (note.title || "未命名笔记") + ".md", "text/markdown;charset=utf-8");
  }

  /* ─── 导出 .html 文件 ───
     HTML 笔记：直接导出原文；Markdown 笔记：渲染为带内联样式、可独立打开的页面 */
  function exportHtml(note) {
    let doc;
    if (note.format === "html") {
      doc = note.content || "";
    } else {
      const body = renderContent(note.content || "", note.scripts, note.attachments);
      const safeTitle = (note.title || "未命名笔记").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
      doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
  body { max-width: 760px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, "Noto Serif SC", "Segoe UI", serif; line-height: 1.8; color: #1f2937; }
  h1, h2, h3, h4 { line-height: 1.3; margin: 1.4em 0 .6em; }
  h1 { font-size: 28px; } h2 { font-size: 22px; } h3 { font-size: 18px; }
  p { margin: .8em 0; } img { max-width: 100%; border-radius: 8px; }
  a { color: #4338ca; } blockquote { margin: 1em 0; padding: .4em 1em; border-left: 4px solid #c7d2fe; background: #f5f7ff; color: #4b5563; }
  pre { background: #1e293b; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .92em; }
  :not(pre) > code { background: #eef2ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
  th { background: #f9fafb; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${body}
</body>
</html>`;
    }
    triggerDownload(doc, (note.title || "未命名笔记") + ".html", "text/html;charset=utf-8");
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
        // 图片附件先压缩（WebP+限宽），转格式时同步改文件名后缀，保持下载体验一致
        let data = f, mimeType = f.type || "application/octet-stream", name = f.name;
        if ((f.type || "").startsWith("image/")) {
          const r = await compressImageBlob(f, f.type);
          if (r.mime !== f.type) name = name.replace(/\.[^.]+$/, "") + ".webp";
          data = r.blob;
          mimeType = r.mime;
        }
        const ext = name.includes(".") ? "." + name.split(".").pop() : "";
        const path = `${user.id}/${genId()}${ext}`;
        const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, data, { contentType: mimeType, upsert: false });
        if (error) { alert(`上传「${f.name}」失败：${error.message}`); continue; }
        const url = supabase.storage.from(ATT_BUCKET).getPublicUrl(path).data.publicUrl;
        newAtts.push({ name, type: mimeType, path, url });
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
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", node.id); setDragId(node.id); }}
          onDragOver={(e) => { if (canTreeDropOn(node)) { e.preventDefault(); setDragOverId(node.id); } }}
          onDrop={() => dropTreeFolderOn(node.id)}
          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: "pointer", background: isActive ? T.activeFilter : "transparent", transition: "background .12s", fontSize: 13, color: isActive ? T.text : T.textSub, fontWeight: isActive ? 600 : 400, minWidth: 0, opacity: dragId === node.id ? .4 : 1, boxShadow: dragOverId === node.id && dragId !== node.id ? `inset 0 2px 0 ${dark ? "#60a5fa" : "#6366f1"}` : "none" }}
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
              {orderedTags.map((t) => {
                const c = TC[t] || { bg: dark ? "#27272a" : "#f5f5f5", fg: dark ? "#a1a1aa" : "#666" };
                const count = notes.filter((n) => (n.tags || []).includes(t)).length;
                return (
                  <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t); setDragTag(t); }}
                    onDragOver={(e) => { if (dragTag && dragTag !== t) { e.preventDefault(); setDragOverTag(t); } }}
                    onDrop={() => dropTagOn(t)}
                    onDragEnd={() => { setDragTag(null); setDragOverTag(null); }}
                    style={{ textAlign: "left", padding: "5px 8px", borderRadius: 6, border: "none", background: filterTag === t ? c.bg : "transparent", color: filterTag === t ? c.fg : T.textSub, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", fontWeight: filterTag === t ? 600 : 400, opacity: dragTag === t ? .4 : 1, boxShadow: dragOverTag === t && dragTag !== t ? `inset 0 2px 0 ${dark ? "#60a5fa" : "#6366f1"}` : "none" }}>
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
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,.html,.htm,.pdf,.docx,.doc" multiple onChange={importMd} style={{ display: "none" }} />
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
              const plain = note.format === "pdf"
                ? "📕 PDF 文档"
                : note.format === "html"
                ? (note.content || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
                : (note.content || "").replace(/[#*`>\-\[\]()!~_|]/g, "").replace(/\n+/g, " ").trim();
              const itemCount = isFolder ? notes.filter((n) => parentOf(n) === note.id).length : 0;
              // 递归统计文件夹内全部后代数量（删除确认用）
              const descCount = isFolder ? (() => { let c = 0; const col = (id) => notes.filter((n) => n.parent_id === id).forEach((n) => { c++; col(n.id); }); col(note.id); return c; })() : 0;
              const aBtn = { padding: "6px 10px", fontSize: 12, background: "none", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", fontFamily: "'Noto Serif SC',serif", transition: "all .15s", opacity: .6 };
              return (
                <div key={note.id} className="card-anim"
                  draggable={canDragRows}
                  onDragStart={canDragRows ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", note.id); setDragId(note.id); } : undefined}
                  onDragOver={canDragRows ? (e) => { if (dragId && dragId !== note.id && dragIsFolder === !!isFolder) { e.preventDefault(); setDragOverId(note.id); } } : undefined}
                  onDrop={canDragRows ? () => dropNoteOn(note.id) : undefined}
                  onDragEnd={canDragRows ? () => { setDragId(null); setDragOverId(null); } : undefined}
                  style={{ display: "flex", alignItems: "center", borderBottom: i < filtered.length - 1 ? `1px solid ${T.borderLight}` : "none", animationDelay: i * .04 + "s", transition: "background .15s", opacity: dragId === note.id ? .4 : 1, boxShadow: dragOverId === note.id && dragId !== note.id ? `inset 0 2px 0 ${dark ? "#60a5fa" : "#6366f1"}` : "none" }}
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
                    {!isFolder && note.format === "pdf" && (
                      <button onClick={(e) => { e.stopPropagation(); const a = (note.attachments || [])[0]; if (a) downloadAttachment(a); }}
                        style={{ ...aBtn, color: T.textMuted }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                        下载
                      </button>
                    )}
                    {!isFolder && note.format === "html" && (
                      <button onClick={(e) => { e.stopPropagation(); exportHtml(note); }}
                        style={{ ...aBtn, color: T.textMuted }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                        导出
                      </button>
                    )}
                    {!isFolder && !["html", "pdf"].includes(note.format) && (
                      <div style={{ position: "relative" }}>
                        <button onClick={(e) => { e.stopPropagation(); setExportMenu(exportMenu === note.id ? null : note.id); }}
                          style={{ ...aBtn, color: T.textMuted }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = T.borderInput; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = ".6"; e.currentTarget.style.borderColor = "transparent"; }}>
                          导出 ▾
                        </button>
                        {exportMenu === note.id && (
                          <div onClick={(e) => e.stopPropagation()}
                            style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, background: T.card, border: `1px solid ${T.borderInput}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.15)", overflow: "hidden", minWidth: 120 }}>
                            <button onClick={(e) => { e.stopPropagation(); exportMd(note); setExportMenu(null); }}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.textSub, fontFamily: "'Noto Serif SC',serif" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = T.listHover}
                              onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                              📄 导出 .md
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); exportHtml(note); setExportMenu(null); }}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.textSub, fontFamily: "'Noto Serif SC',serif", borderTop: `1px solid ${T.borderLight}` }}
                              onMouseEnter={(e) => e.currentTarget.style.background = T.listHover}
                              onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                              🌐 导出 .html
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={(e) => {
                      e.stopPropagation();
                      if (isFolder) {
                        if (confirm(descCount > 0 ? `「${note.title || "未命名文件夹"}」内含 ${descCount} 个项目，将一并删除且不可恢复。确定删除吗？` : `确定删除空文件夹「${note.title || "未命名文件夹"}」吗？`)) deleteFolder(note.id);
                      } else {
                        if (confirm(`确定删除「${note.title || "无标题"}」吗？`)) removeNote(note);
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
            {!["html", "pdf"].includes(activeNote.format) && (
              <button onClick={() => goToEdit(activeId)} style={{ padding: "5px 14px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>编辑</button>
            )}
            {activeNote.format === "pdf" ? (
              <button onClick={() => { const a = (activeNote.attachments || [])[0]; if (a) downloadAttachment(a); }} style={{ padding: "5px 14px", background: T.card, color: T.textSub, border: `1px solid ${T.borderInput}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>下载 PDF</button>
            ) : (
              <button onClick={() => exportHtml(activeNote)} style={{ padding: "5px 14px", background: T.card, color: T.textSub, border: `1px solid ${T.borderInput}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Serif SC',serif" }}>导出 HTML</button>
            )}
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
          {activeNote.format === "pdf" ? (
            <span>📕 PDF 文档（只读）</span>
          ) : activeNote.format === "html" ? (
            <span>🌐 HTML 文档（只读）</span>
          ) : (
            <>
              <span>📖 {wordCount(activeNote.content)} 字</span>
              <span>⏱ {readTime(activeNote.content)}</span>
            </>
          )}
        </div>
      </div>

      {activeNote.format === "pdf" ? (
        // PDF 笔记：iframe 直连 Storage URL，浏览器原生 PDF 查看器渲染。
        // 不加 sandbox —— Chrome 的 PDF 查看器在沙箱 iframe 中会被禁用。
        // 部分环境（手机浏览器等）不支持 iframe 内联 PDF，提供新标签页打开的兜底入口。
        <div style={{ padding: "0 0 20px" }}>
          <div style={{ padding: "8px 24px", fontSize: 12, color: T.textMuted, display: "flex", gap: 12, alignItems: "center" }}>
            <span>📕 {((activeNote.attachments || [])[0] || {}).name || "PDF"}</span>
            <a href={(activeNote.attachments || [])[0]?.url} target="_blank" rel="noreferrer" style={{ color: dark ? "#60a5fa" : "#4338ca" }}>在新标签页打开 ↗</a>
            <span style={{ color: T.textPlaceholder }}>（若下方未显示预览，请用此链接或「下载 PDF」）</span>
          </div>
          <iframe
            title={activeNote.title || "PDF 文档"}
            src={(activeNote.attachments || [])[0]?.url}
            style={{ width: "100%", height: "calc(100vh - 260px)", minHeight: 400, border: "none", background: "#fff" }} />
        </div>
      ) : activeNote.format === "html" ? (
        // HTML 笔记：iframe 沙箱隔离渲染，原样保留页面自带样式。
        // sandbox 开 allow-scripts 但不开 allow-same-origin —— 脚本能跑，却访问不到父页/Supabase 会话，XSS 被隔离在 iframe 内。
        <div style={{ padding: "0 0 20px" }}>
          <iframe
            title={activeNote.title || "HTML 笔记"}
            srcDoc={withStorageShim(activeNote.content)}
            sandbox="allow-scripts allow-popups allow-forms"
            style={{ width: "100%", height: "calc(100vh - 230px)", minHeight: 400, border: "none", background: "#fff" }} />
        </div>
      ) : (
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
      )}
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
