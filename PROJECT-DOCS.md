# 拾光笔记 - 项目完整文档

> 最近核对时间：2026-06-24（新增 PDF/Word/MHTML 导入、图片压缩，对照 src/App.jsx 与 git 历史更新）

## 项目概述

「拾光笔记」是一个私人知识库 Web 应用，博客阅读风格界面，支持 Markdown 写作、文件夹目录树、附件上传、云端同步。

- **前端框架**：React 19 + Vite
- **后端/数据库**：Supabase（PostgreSQL + Auth + Storage）
- **部署平台**：Vercel（自动部署）
- **代码仓库**：GitHub - https://github.com/lihpgit/my-notes
- **线上地址**：https://my-notes-brown-delta.vercel.app
- **开发者背景**：Android 开发者，熟悉 Java/Kotlin，Web 前端新手

---

## 技术栈详情

| 技术 | 用途 | 版本 |
|------|------|------|
| React | 前端框架 | 19.x（package.json: ^19.2.5） |
| Vite | 构建工具 | 8.x（package.json: ^8.0.10） |
| Supabase JS | 数据库 + 认证 + 存储客户端 | @supabase/supabase-js ^2.105.4 |
| marked | Markdown 渲染 | ^18.0.3 |
| mammoth | Word .docx → HTML 转换（动态 import） | package.json 依赖 |
| Vercel | 静态托管 + 自动部署 | - |

---

## 项目目录结构

```
my-notes/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.jsx          # 入口文件
    ├── App.jsx           # 主应用（约 1650 行，包含所有页面和逻辑）
    ├── supabase.js       # Supabase 客户端配置（URL + anon key 硬编码在此）
    ├── App.css / index.css / assets/  # 脚手架遗留，实际样式写在 App.jsx 内联
```

---

## Supabase 配置

### 连接信息

```javascript
// src/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qzzpkhtonfucxjssvmux.supabase.co'
const supabaseAnonKey = '替换为你的 anon key（在 Supabase → Settings → API Keys → Legacy anon 标签页获取）'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 数据库表结构

notes 表是唯一的业务表，**笔记和文件夹共用此表**（用 `is_folder` 区分，文件夹是纯容器，不存正文）：

```sql
-- notes 表（当前完整结构）
create table notes (
  id text primary key,                                       -- 客户端生成的短 ID
  title text default '',
  content text default '',                                   -- Markdown 原文，或 HTML 笔记的完整 HTML
  color jsonb,                                               -- 旧版字段，新版未使用
  tags jsonb default '[]',                                   -- 旧标签数组列，标签功能已移除、UI 不再使用，列保留
  banner integer default 0,                                  -- Banner 渐变色索引（0-7）
  created_at bigint,                                         -- 创建时间戳（毫秒）
  updated_at bigint,                                         -- 更新时间戳（毫秒）
  user_id uuid references auth.users(id) on delete cascade,  -- 关联用户

  -- 以下为后续迭代新增字段（已在线上执行过 ALTER TABLE）
  parent_id text,                                            -- 父文件夹 ID，null = 根目录
  is_folder boolean default false,                           -- true = 文件夹（纯容器）
  scripts jsonb default '[]',                                -- 内嵌脚本数组 [{name, content}]
  attachments jsonb default '[]',                            -- 附件数组 [{name, type, path, url}]
  format text default 'md',                                  -- 'md' | 'html' | 'pdf'（html/pdf 笔记只读）
  sort_order double precision                                -- 手动拖拽排序序号，null = 未排序（按更新时间倒序置顶）
);

-- 行级安全策略（RLS）- 每个用户只能操作自己的数据
alter table notes enable row level security;

create policy "用户只能查看自己的笔记"
  on notes for select using (auth.uid() = user_id);

create policy "用户只能创建自己的笔记"
  on notes for insert with check (auth.uid() = user_id);

create policy "用户只能更新自己的笔记"
  on notes for update using (auth.uid() = user_id);

create policy "用户只能删除自己的笔记"
  on notes for delete using (auth.uid() = user_id);
```

### Storage（附件存储）

- Bucket 名称：`attachments`（公开 bucket，前端通过 `getPublicUrl` 取直链）
- 存储路径：`{user_id}/{随机ID}.{原始后缀}`
- 单文件大小限制：前端限制 20MB
- 删除笔记/文件夹时会一并清理其附件文件

### 认证配置

- 认证方式：邮箱 + 密码
- **邮箱确认：已开启**（Supabase → Authentication → Providers → Email → Confirm email 开启状态）
- 注册后需要先去邮箱点击确认链接才能登录，否则登录会报 `Email not confirmed`
- 前端已适配：注册成功但无 session 时，提示「注册成功，请查看邮箱确认」

---

## 应用架构

### 页面/视图

应用有 4 个视图，通过 `view` state 切换（非路由）：

1. **登录页（AuthPage）**：邮箱密码登录/注册
2. **列表页（view="list"）**：左侧文件夹目录树，右侧面包屑 + 文档列表，支持搜索、拖拽排序、导入导出
3. **阅读页（view="read"）**：博客风格文章展示，Markdown 渲染；HTML 笔记用 sandbox iframe 隔离渲染（只读）；PDF 笔记用 iframe 直接预览（只读，附「在新标签页打开」兜底链接）
4. **编辑页（view="edit"）**：左右分屏，左 Markdown 编辑 + 右实时预览；支持脚本、附件管理

虽然没有路由，但已通过 `history.pushState` / `popstate` 接管浏览器返回键，前进/后退可在视图间正常切换（仍无法通过 URL 直达某篇文章）。

### 已实现功能清单

- **文档目录树**（Confluence 式）：文件夹作为独立实体（纯容器），侧边栏树形导航、展开/折叠、面包屑导航、移动文档/文件夹（防止移入自己的子树）、递归删除
- **拖拽排序**：首页文档列表可拖拽排序（`sort_order` 持久化到云端，仅在无搜索时可拖）；侧边栏目录树的文件夹也可拖拽排序（同一父级下，`sort_order` 持久化）。原生 HTML5 DnD，零依赖；dragstart 已补 `dataTransfer.setData` 兼容 Firefox
- **暗黑模式**：🌙/☀️ 一键切换，localStorage 持久化，全套深色配色
- **阅读字号调节**：md 笔记阅读页右下角浮动 `A−/字号/A+` 控件，范围 13–28px，localStorage 持久化跨刷新保留。仅作用于 `.article-body` 根字号（内联 `fontSize` 覆盖），标题/代码/表格用 em 相对单位随之等比缩放；pdf/html 笔记是 iframe，不显示此控件
- **导入**：支持 .md / .markdown / .txt / .html / .htm / .pdf / .docx / .doc，可批量。导入逻辑（`importMd`）按文件头嗅探真实类型（`kind`）：
  - **md / txt**：Markdown 入库，自动提取一级标题作为笔记标题
  - **html / htm**：HTML 原文入库标记 `format='html'`（只读，超 2MB 给出体积警告）；内嵌 base64 图片 >12KB 的会被抽出、压缩为 WebP 上传 Storage 并替换为 URL，小图标保留内联
  - **pdf**：上传 Storage，`format='pdf'`，阅读页 iframe 预览（只读）
  - **docx**：用 mammoth.js 转 HTML（只读、可搜索），内嵌图片改传 Storage 并压缩
  - **doc**：按文件头区分——`PK` 头当 docx、`<` 头当 html、MIME 头（Confluence「导出 Word」实为 MHTML）走 MHTML 解析器（quoted-printable + base64 解码），旧版二进制 .doc 才提示不支持
- **导出**：Markdown 笔记可导出 .md 或渲染后的独立 .html；HTML 笔记直接导出原文
- **图片压缩**（`compressImageBlob`）：所有上传图片路径（docx / MHTML / HTML 导入内嵌图 / 编辑器手动附件）统一压缩为 WebP、限宽 1920px、质量 0.82；压缩后 ≥ 原图 90% 则保留原图；跳过 gif/svg；解码失败按原图上传。转换后文件名改 .webp
- **内嵌脚本**：编辑时上传脚本文件或弹窗手写脚本（选后缀），在光标处插入 `{{script:文件名}}` 标记，阅读时点击下载
- **附件（Supabase Storage）**：上传到 `attachments` bucket，光标处插入 `{{file:文件名}}` 标记；图片附件在阅读页内联显示（点击看大图），其他类型为下载链接；删除附件/笔记时同步清理 Storage
- **搜索**：跨目录全局搜索笔记标题+正文（不含文件夹）
- **响应式（列表页）**：窗口宽度 < 768px 时侧边栏改横排、布局调整，保证标题可见
- **浏览器返回键**：history 状态管理，返回/前进可用

### 数据流

```
浏览器（React App）
    ↕ supabase-js 直接通信
Supabase
    ├── Auth：用户登录/注册/会话管理（邮箱确认开启）
    ├── Database：notes 表 CRUD（含文件夹、排序、脚本、附件元数据）
    └── Storage：attachments bucket（附件文件本体）
```

- Vercel 只负责托管静态前端文件，不经手数据
- 前端通过 supabase-js 直接与 Supabase API 通信
- 正文/标题编辑使用防抖保存（600ms），避免每次按键都请求
- 拖拽排序对当前列表整批 upsert `sort_order`

### 关键常量

```javascript
// 注意：标签功能（侧边栏筛选/编辑输入/卡片展示/拖拽排序/配色 TAG_COLORS）
// 已于 2026-06 整体移除。数据库 notes.tags 列仍保留（新笔记默认 []），但 UI 不再使用。

// 文章卡片 Banner 渐变色（8种），与旧版一致
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

// 正文中的特殊标记（渲染时替换）
// {{script:文件名}} → 脚本下载链接
// {{file:文件名}}   → 附件（图片内联 / 其他下载链接）
```

---

## 部署流程

### 日常开发部署

```bash
cd my-notes
# 修改代码后
git add .
git commit -m "描述改动"
git push
# Vercel 自动检测 push 并重新部署，约 30 秒完成
```

### 数据库结构变更

在 Supabase 控制台 → SQL Editor 中执行 ALTER TABLE 语句，与代码部署独立。例如 sort_order 字段当初就是这样加的：

```sql
alter table notes add column sort_order double precision;
```

### 本地开发

```bash
cd my-notes
npm run dev
# 访问 http://localhost:5173
```

---

## Git 配置

- 远程仓库：git@github.com:lihpgit/my-notes.git（SSH 方式）
- SSH Key：~/.ssh/id_ed25519_github（个人 GitHub 专用，与公司 key 分开）
- SSH 配置（~/.ssh/config）中已配置 github.com 使用该 key

---

## 当前已知问题 & 待优化

1. **所有代码在单文件 App.jsx 中**（约 1650 行）：应拆分为多个组件文件（AuthPage、NoteList、NoteReader、NoteEditor、TreeNode 等）
2. **样式全部内联**：应迁移到 CSS Modules 或 Tailwind CSS
3. **无真正的路由**：已支持浏览器返回键（history 状态管理），但仍无法通过 URL 直接访问某篇文章，刷新后回到列表页。应引入 react-router
4. **编辑页移动端体验差**：列表页已做窄屏适配，但编辑页左右分屏仍是固定 1fr 1fr，手机上很挤
5. **无目录导航（TOC）**：阅读页没有像博客那样的文章目录
6. **无代码语法高亮**：代码块只有深色背景，没有语法着色。可集成 highlight.js 或 Prism.js
7. **附件 bucket 为公开访问**：知道 URL 即可访问文件，应改为私有 bucket + signed URL
8. **HTML 笔记体积风险**：HTML 原文整篇存入 content 字段，超大文件（>2MB）可能触发 Supabase 单条上限，目前只有前端警告
9. **拖拽排序整批 upsert**：对当前列表所有文档重新编号后整批写库，多端同时操作可能互相覆盖
10. **图片压缩只对新导入生效**：旧版本已上传的笔记不会自动压缩，需删除后重新导入才能享受压缩（用户已知悉）
11. **旧版二进制 .doc 不支持**：只支持 docx / MHTML（Confluence 导出 Word）；真正的旧版二进制 .doc 会提示不支持，需先用 Office 另存为 .docx

---

## 后续可开发的功能方向

### ✅ 已完成（从旧清单划掉）

- [x] 图片/文件上传（Supabase Storage 附件功能）
- [x] 文档目录（文件夹树 + 面包屑 + 移动）
- [x] 暗黑模式
- [x] 文章导出为 .md 文件（另支持导出 .html）
- [x] 导入 .md / .txt / .html（HTML 只读）
- [x] 导入 .pdf / .docx / .doc（企业微信导出 PDF/Word、Confluence 导出 Word 即 MHTML）
- [x] 上传图片自动压缩为 WebP、限宽 1920px（覆盖全部上传路径）
- [x] 文章排序（首页拖拽排序）
- [x] 浏览器返回键响应
- [x] 列表页移动端/窄屏适配
- [x] 内嵌脚本（上传/手写，阅读时下载）

### 高优先级

- [ ] 组件拆分 + 项目结构优化
- [ ] 编辑页移动端响应式适配（分屏改上下切换或 Tab）
- [ ] 文章目录（TOC）自动生成
- [ ] 代码语法高亮（highlight.js）

### 中优先级

- [ ] 引入 react-router，支持 URL 直达文章
- [ ] 文章置顶 / 收藏功能
- [ ] 附件私有化（私有 bucket + signed URL）
- [ ] 文章版本历史 / 回收站

### 低优先级

- [ ] 全文搜索优化（Supabase Full Text Search）
- [ ] 多设备实时同步（Supabase Realtime）
- [ ] PWA 支持（离线可用）
- [ ] 绑定自定义域名

---

## 开发环境信息

- **操作系统**：macOS（MacBook Pro，10 线程 CPU）
- **Node.js**：已安装（通过 nodejs.org）
- **包管理器**：npm
- **编辑器**：可用 VS Code（`code .` 打开项目）或 nano
- **代理**：需要代理才能访问 GitHub（已配置 http/https/socks5 代理，端口 7897）
- **终端**：zsh（macOS 默认）

---

## 给 Claude Code 的提示

当你在 Claude Code 中使用此项目时：

1. 项目根目录是 `my-notes`
2. 主要修改的文件是 `src/App.jsx`（约 1650 行单文件）和 `src/supabase.js`
3. 数据库变更需要在 Supabase SQL Editor 中手动执行，Claude Code 无法直接操作；改完后记得同步更新本文档的表结构
4. 推送代码后 Vercel 自动部署，不需要额外操作
5. 如果需要安装新的 npm 包，使用 `npm install 包名`
6. 本地预览用 `npm run dev`
7. 用户是 Android 开发者，对 Web 前端不太熟悉，请多用 Android 概念类比解释
8. 笔记和文件夹共用 notes 表（`is_folder` 区分）；正文里的 `{{script:xxx}}` / `{{file:xxx}}` 是渲染时替换的特殊标记，改渲染逻辑时注意保留
