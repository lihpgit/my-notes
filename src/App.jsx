import { useState, useEffect, useRef } from "react";

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

const STORAGE_KEY = "notes-data";

export default function NotesApp() {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const editorRef = useRef(null);

  // Load from persistent storage
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          setNotes(parsed);
          if (parsed.length > 0) setActiveId(parsed[0].id);
        }
      } catch {
        // No data yet
      }
      setLoaded(true);
    })();
  }, []);

  // Save to persistent storage on change
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(notes));
      } catch (e) {
        console.error("Save failed:", e);
      }
    })();
  }, [notes, loaded]);

  const activeNote = notes.find((n) => n.id === activeId);

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  function addNote() {
    const color = COLORS[notes.length % COLORS.length];
    const newNote = {
      id: generateId(),
      title: "",
      content: "",
      color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes((prev) => [newNote, ...prev]);
    setActiveId(newNote.id);
    setSidebarOpen(false);
    setTimeout(() => editorRef.current?.querySelector("input")?.focus(), 100);
  }

  function updateNote(id, field, value) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, [field]: value, updatedAt: Date.now() } : n
      )
    );
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  if (!loaded) {
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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
        textarea:focus, input:focus { outline: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .note-card { transition: all 0.2s ease; cursor: pointer; }
        .note-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; }
        .btn-icon { transition: all 0.15s ease; cursor: pointer; border: none; background: none; display: flex; align-items: center; justify-content: center; }
        .btn-icon:hover { transform: scale(1.1); }
      `}</style>

      {/* Sidebar */}
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

        {/* Search */}
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            style={styles.searchInput}
            placeholder="搜索笔记..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* New Note Button */}
        <button style={styles.newBtn} onClick={addNote}>
          <span style={{ fontSize: 20 }}>＋</span> 新建笔记
        </button>

        {/* Note List */}
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
                borderLeft: `4px solid ${note.color.border}`,
                background: activeId === note.id ? note.color.bg : "#fff",
                animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
              }}
            >
              <div style={styles.noteCardHeader}>
                <span
                  style={{ ...styles.colorDot, background: note.color.dot }}
                />
                <span style={styles.noteTime}>{formatTime(note.updatedAt)}</span>
              </div>
              <h3 style={styles.noteCardTitle}>
                {note.title || "无标题"}
              </h3>
              <p style={styles.noteCardPreview}>
                {note.content.slice(0, 60) || "空笔记..."}
              </p>
            </div>
          ))}
        </div>

        <div style={styles.sidebarFooter}>
          <span style={{ fontSize: 12, color: "#999" }}>
            共 {notes.length} 篇笔记
          </span>
        </div>
      </div>

      {/* Main Editor */}
      <div style={styles.main} ref={editorRef}>
        {/* Top Bar */}
        <div style={styles.topBar}>
          {!sidebarOpen && (
            <button
              className="btn-icon"
              onClick={() => setSidebarOpen(true)}
              style={styles.menuBtn}
            >
              ☰
            </button>
          )}
          {activeNote && (
            <div style={styles.topBarRight}>
              <span style={{ fontSize: 12, color: "#aaa" }}>
                {new Date(activeNote.updatedAt).toLocaleString("zh-CN")}
              </span>
              <button
                className="btn-icon"
                onClick={() => {
                  if (confirm("确定删除这篇笔记吗？")) deleteNote(activeNote.id);
                }}
                style={styles.deleteBtn}
              >
                🗑️
              </button>
            </div>
          )}
        </div>

        {activeNote ? (
          <div style={styles.editorWrap}>
            <div
              style={{
                ...styles.editorAccent,
                background: `linear-gradient(180deg, ${activeNote.color.border}, transparent)`,
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
              onChange={(e) =>
                updateNote(activeNote.id, "content", e.target.value)
              }
            />
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📝</div>
            <h2 style={styles.emptyTitle}>开始记录你的想法</h2>
            <p style={styles.emptyDesc}>
              点击左侧「新建笔记」或下方按钮开始
            </p>
            <button style={styles.emptyBtn} onClick={addNote}>
              ＋ 创建第一篇笔记
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  // Loading
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100%",
    background: "#F7F6F3",
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#E8C840",
    animation: "pulse 1.2s ease infinite",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: "#999",
    fontFamily: "'Noto Serif SC', serif",
  },
  // Sidebar
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
    padding: "20px 20px 12px",
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
  closeBtn: {
    fontSize: 16,
    color: "#999",
    padding: 4,
  },
  searchWrap: {
    margin: "0 16px 12px",
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 14,
  },
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
    transition: "background 0.2s",
  },
  noteList: {
    flex: 1,
    overflowY: "auto",
    padding: "0 16px",
  },
  noteCard: {
    padding: "12px 14px",
    borderRadius: 8,
    marginBottom: 8,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  noteCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  noteTime: {
    fontSize: 11,
    color: "#aaa",
  },
  noteCardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#2D2D2D",
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  noteCardPreview: {
    fontSize: 12,
    color: "#888",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarFooter: {
    padding: "12px 20px",
    borderTop: "1px solid #EDEBE8",
    textAlign: "center",
  },
  emptyHint: {
    textAlign: "center",
    color: "#bbb",
    fontSize: 13,
    padding: "40px 0",
  },
  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  topBar: {
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #EDEBE8",
    minHeight: 52,
    background: "#FDFCFA",
  },
  menuBtn: {
    fontSize: 22,
    color: "#666",
    padding: 4,
  },
  topBarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
  },
  deleteBtn: {
    fontSize: 16,
    padding: 4,
    opacity: 0.6,
  },
  // Editor
  editorWrap: {
    flex: 1,
    padding: "0 40px 40px",
    overflowY: "auto",
    position: "relative",
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  editorAccent: {
    width: 3,
    height: 60,
    borderRadius: 2,
    position: "absolute",
    left: 20,
    top: 30,
  },
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
  divider: {
    height: 1,
    background: "#EDEBE8",
    marginBottom: 20,
  },
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
  // Empty State
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    animation: "fadeIn 0.6s ease",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#2D2D2D",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#999",
    marginBottom: 24,
  },
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
