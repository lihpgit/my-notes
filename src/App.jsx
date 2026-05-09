import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ============ 常量 ============
const COLORS = [
  { bg: "#FFF9E3", border: "#F0D96B", dot: "#E8C840" },
  { bg: "#E8F5E9", border: "#81C784", dot: "#4CAF50" },
  { bg: "#E3F2FD", border: "#64B5F6", dot: "#2196F3" },
  { bg: "#FCE4EC", border: "#F48FB1", dot: "#E91E63" },
  { bg: "#F3E5F5", border: "#CE93D8", dot: "#9C27B0" },
  { bg: "#FFF3E0", border: "#FFB74D", dot: "#FF9800" },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ============ 登录/注册组件 ============
function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (isLogin) {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
      } else {
        onAuth(data.user);
      }
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) {
        setError(err.message);
      } else if (data.user) {
        setSuccess("注册成功！请查看邮箱确认（也可能直接登录成功）");
        // 有些 Supabase 配置不需要邮箱确认，直接登录
        if (data.session) {
          onAuth(data.user);
        }
      }
    }
    setLoading(false);
  }

  return (
    <div style={authStyles.wrapper}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        input:focus { outline: none; border-color: #E8C840 !important; }
      `}</style>
      <div style={authStyles.card}>
        <div style={authStyles.logoWrap}>
          <span style={{ fontSize: 40 }}>📒</span>
          <h1 style={authStyles.title}>拾光笔记</h1>
          <p style={authStyles.subtitle}>记录每一个灵感瞬间</p>
        </div>

        <div style={authStyles.tabRow}>
          <button
            onClick={() => { setIsLogin(true); setError(""); setSuccess(""); }}
            style={{
              ...authStyles.tab,
              borderBottom: isLogin ? "2px solid #E8C840" : "2px solid transparent",
              color: isLogin ? "#2D2D2D" : "#999",
            }}
          >
            登录
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(""); setSuccess(""); }}
            style={{
              ...authStyles.tab,
              borderBottom: !isLogin ? "2px solid #E8C840" : "2px solid transparent",
              color: !isLogin ? "#2D2D2D" : "#999",
            }}
          >
            注册
          </button>
        </div>

        <div>
          <input
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={authStyles.input}
          />
          <input
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={authStyles.input}
          />

          {error && <p style={authStyles.error}>{error}</p>}
          {success && <p style={authStyles.success}>{success}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            style={{
              ...authStyles.submitBtn,
              opacity: loading || !email || !password ? 0.6 : 1,
            }}
          >
            {loading ? "请稍候..." : isLogin ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  );
}

const authStyles = {
  wrapper: {
    height: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #F7F6F3 0%, #EDE9E3 100%)",
    fontFamily: "'Noto Serif SC', serif",
  },
  card: {
    width: 380,
    maxWidth: "90vw",
    background: "#fff",
    borderRadius: 16,
    padding: "40px 32px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  },
  logoWrap: {
    textAlign: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#2D2D2D",
    marginTop: 8,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#aaa",
    marginTop: 6,
  },
  tabRow: {
    display: "flex",
    marginBottom: 24,
    borderBottom: "1px solid #eee",
  },
  tab: {
    flex: 1,
    padding: "10px 0",
    background: "none",
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif",
    transition: "all 0.2s",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #E8E6E3",
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 14,
    fontFamily: "'Noto Serif SC', serif",
    color: "#333",
    transition: "border-color 0.2s",
  },
  submitBtn: {
    width: "100%",
    padding: "13px 0",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif",
    marginTop: 4,
    transition: "opacity 0.2s",
  },
  error: {
    color: "#E53935",
    fontSize: 13,
    marginBottom: 10,
    textAlign: "center",
  },
  success: {
    color: "#4CAF50",
    fontSize: 13,
    marginBottom: 10,
    textAlign: "center",
  },
};

// ============ 主笔记应用 ============
function NotesApp({ user, onLogout }) {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const editorRef = useRef(null);
  const saveTimerRef = useRef(null);

  // 从 Supabase 加载笔记
  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setNotes(data);
      if (data.length > 0) setActiveId(data[0].id);
    }
    setLoading(false);
  }

  // 防抖保存到 Supabase（打字时不会每个字都存，停顿 500ms 后自动保存）
  const saveToSupabase = useCallback(
    (noteToSave) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        const { id, ...rest } = noteToSave;
        await supabase.from("notes").upsert({ id, ...rest });
        setSaving(false);
      }, 500);
    },
    []
  );

  const activeNote = notes.find((n) => n.id === activeId);

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  async function addNote() {
    const color = COLORS[notes.length % COLORS.length];
    const newNote = {
      id: generateId(),
      title: "",
      content: "",
      color,
      created_at: Date.now(),
      updated_at: Date.now(),
      user_id: user.id,
    };

    // 先更新本地界面（快速响应）
    setNotes((prev) => [newNote, ...prev]);
    setActiveId(newNote.id);
    setSidebarOpen(false);

    // 再存到云端
    await supabase.from("notes").insert(newNote);

    setTimeout(() => editorRef.current?.querySelector("input")?.focus(), 100);
  }

  function updateNote(id, field, value) {
    const updatedNotes = notes.map((n) =>
      n.id === id ? { ...n, [field]: value, updated_at: Date.now() } : n
    );
    setNotes(updatedNotes);

    // 防抖保存
    const updatedNote = updatedNotes.find((n) => n.id === id);
    if (updatedNote) saveToSupabase(updatedNote);
  }

  async function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
    await supabase.from("notes").delete().eq("id", id);
  }

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingDot} />
        <p style={styles.loadingText}>加载笔记中...</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
        textarea:focus, input:focus { outline: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 1; } }
        .note-card { transition: all 0.2s ease; cursor: pointer; }
        .note-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; }
        .btn-icon { transition: all 0.15s ease; cursor: pointer; border: none; background: none; display: flex; align-items: center; justify-content: center; }
        .btn-icon:hover { transform: scale(1.1); }
      `}</style>

      {/* 侧边栏 */}
      <div
        style={{
          ...styles.sidebar,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          position: window.innerWidth < 768 ? "absolute" : "relative",
          zIndex: 10,
        }}
      >
        <div style={styles.sidebarHeader}>
          <h1 style={styles.logo}>
            <span style={{ fontSize: 28 }}>📒</span> 拾光笔记
          </h1>
          <button className="btn-icon" onClick={() => setSidebarOpen(false)} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {/* 用户信息 */}
        <div style={styles.userBar}>
          <span style={styles.userEmail}>{user.email}</span>
          <button onClick={onLogout} style={styles.logoutBtn}>退出</button>
        </div>

        {/* 搜索 */}
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            style={styles.searchInput}
            placeholder="搜索笔记..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* 新建按钮 */}
        <button style={styles.newBtn} onClick={addNote}>
          <span style={{ fontSize: 20 }}>＋</span> 新建笔记
        </button>

        {/* 笔记列表 */}
        <div style={styles.noteList}>
          {filteredNotes.length === 0 && (
            <p style={styles.emptyHint}>
              {search ? "没有找到匹配的笔记" : "还没有笔记，点击上方按钮创建"}
            </p>
          )}
          {filteredNotes.map((note, i) => (
            <div
              key={note.id}
              className="note-card"
              onClick={() => {
                setActiveId(note.id);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              style={{
                ...styles.noteCard,
                borderLeft: `4px solid ${note.color?.border || '#ccc'}`,
                background: activeId === note.id ? (note.color?.bg || '#f5f5f5') : "#fff",
                animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
              }}
            >
              <div style={styles.noteCardHeader}>
                <span style={{ ...styles.colorDot, background: note.color?.dot || '#999' }} />
                <span style={styles.noteTime}>{formatTime(note.updated_at)}</span>
              </div>
              <h3 style={styles.noteCardTitle}>{note.title || "无标题"}</h3>
              <p style={styles.noteCardPreview}>{(note.content || "").slice(0, 60) || "空笔记..."}</p>
            </div>
          ))}
        </div>

        <div style={styles.sidebarFooter}>
          <span style={{ fontSize: 12, color: "#999" }}>共 {notes.length} 篇笔记</span>
        </div>
      </div>

      {/* 主编辑区 */}
      <div style={styles.main} ref={editorRef}>
        <div style={styles.topBar}>
          {!sidebarOpen && (
            <button className="btn-icon" onClick={() => setSidebarOpen(true)} style={styles.menuBtn}>
              ☰
            </button>
          )}
          <div style={styles.topBarRight}>
            {saving && <span style={styles.savingHint}>保存中...</span>}
            {!saving && activeNote && <span style={styles.savedHint}>已同步 ☁️</span>}
            {activeNote && (
              <button
                className="btn-icon"
                onClick={() => { if (confirm("确定删除这篇笔记吗？")) deleteNote(activeNote.id); }}
                style={styles.deleteBtn}
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {activeNote ? (
          <div style={styles.editorWrap}>
            <div
              style={{
                ...styles.editorAccent,
                background: `linear-gradient(180deg, ${activeNote.color?.border || '#ccc'}, transparent)`,
              }}
            />
            <input
              style={styles.titleInput}
              placeholder="笔记标题..."
              value={activeNote.title}
              onChange={(e) => updateNote(activeNote.id, "title", e.target.value)}
            />
            <div style={styles.divider} />
            <textarea
              style={styles.contentInput}
              placeholder="开始写点什么吧..."
              value={activeNote.content}
              onChange={(e) => updateNote(activeNote.id, "content", e.target.value)}
            />
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📝</div>
            <h2 style={styles.emptyTitle}>开始记录你的想法</h2>
            <p style={styles.emptyDesc}>点击左侧「新建笔记」或下方按钮开始</p>
            <button style={styles.emptyBtn} onClick={addNote}>＋ 创建第一篇笔记</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 入口组件 ============
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // 检查是否已登录
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (checking) {
    return (
      <div style={styles.loadingWrap}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap');
          @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 1; } }
        `}</style>
        <div style={styles.loadingDot} />
        <p style={styles.loadingText}>加载中...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={setUser} />;
  }

  return <NotesApp user={user} onLogout={handleLogout} />;
}

// ============ 样式 ============
const styles = {
  root: {
    display: "flex",
    height: "100vh",
    width: "100%",
    fontFamily: "'Noto Serif SC', 'Georgia', serif",
    background: "#F7F6F3",
    overflow: "hidden",
    position: "relative",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100%",
    background: "#F7F6F3",
    fontFamily: "'Noto Serif SC', serif",
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#E8C840",
    animation: "pulse 1.2s ease infinite",
  },
  loadingText: { marginTop: 16, fontSize: 14, color: "#999" },
  sidebar: {
    width: 300,
    minWidth: 300,
    background: "#FDFCFA",
    borderRight: "1px solid #EDEBE8",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease",
    height: "100%",
  },
  sidebarHeader: {
    padding: "20px 20px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: "#2D2D2D",
    display: "flex",
    alignItems: "center",
    gap: 8,
    letterSpacing: 1,
  },
  closeBtn: { fontSize: 16, color: "#999", padding: 4 },
  userBar: {
    padding: "4px 20px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #EDEBE8",
    marginBottom: 12,
  },
  userEmail: { fontSize: 12, color: "#999", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 },
  logoutBtn: {
    fontSize: 12,
    color: "#E53935",
    background: "none",
    border: "1px solid #E53935",
    borderRadius: 6,
    padding: "3px 10px",
    cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif",
  },
  searchWrap: { margin: "0 16px 12px", position: "relative" },
  searchIcon: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 },
  searchInput: {
    width: "100%",
    padding: "10px 12px 10px 34px",
    border: "1px solid #E8E6E3",
    borderRadius: 10,
    fontSize: 13,
    background: "#F7F6F3",
    fontFamily: "'Noto Serif SC', serif",
    color: "#333",
  },
  newBtn: {
    margin: "0 16px 16px",
    padding: "10px 0",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontFamily: "'Noto Serif SC', serif",
  },
  noteList: { flex: 1, overflowY: "auto", padding: "0 16px" },
  noteCard: { padding: "12px 14px", borderRadius: 8, marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  noteCardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  colorDot: { width: 8, height: 8, borderRadius: "50%" },
  noteTime: { fontSize: 11, color: "#aaa" },
  noteCardTitle: { fontSize: 14, fontWeight: 600, color: "#2D2D2D", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  noteCardPreview: { fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sidebarFooter: { padding: "12px 20px", borderTop: "1px solid #EDEBE8", textAlign: "center" },
  emptyHint: { textAlign: "center", color: "#bbb", fontSize: 13, padding: "40px 0" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topBar: {
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #EDEBE8",
    minHeight: 52,
    background: "#FDFCFA",
  },
  menuBtn: { fontSize: 22, color: "#666", padding: 4 },
  topBarRight: { display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" },
  savingHint: { fontSize: 12, color: "#FFB74D" },
  savedHint: { fontSize: 12, color: "#81C784" },
  deleteBtn: { fontSize: 16, padding: 4, opacity: 0.6 },
  editorWrap: {
    flex: 1,
    padding: "0 40px 40px",
    overflowY: "auto",
    position: "relative",
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  editorAccent: { width: 3, height: 60, borderRadius: 2, position: "absolute", left: 20, top: 30 },
  titleInput: {
    width: "100%",
    border: "none",
    fontSize: 28,
    fontWeight: 700,
    color: "#2D2D2D",
    background: "transparent",
    padding: "30px 0 12px",
    fontFamily: "'Noto Serif SC', serif",
    letterSpacing: 0.5,
  },
  divider: { height: 1, background: "#EDEBE8", marginBottom: 20 },
  contentInput: {
    width: "100%",
    border: "none",
    fontSize: 15,
    lineHeight: 1.9,
    color: "#444",
    background: "transparent",
    resize: "none",
    minHeight: "calc(100vh - 200px)",
    fontFamily: "'Noto Serif SC', serif",
    letterSpacing: 0.3,
  },
  emptyState: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 20, animation: "fadeIn 0.6s ease" },
  emptyTitle: { fontSize: 22, fontWeight: 700, color: "#2D2D2D", marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: "#999", marginBottom: 24 },
  emptyBtn: {
    padding: "12px 28px",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Noto Serif SC', serif",
  },
};
