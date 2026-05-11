# 拾光笔记 - 项目完整文档

## 项目概述

「拾光笔记」是一个私人知识库 Web 应用，博客阅读风格界面，支持 Markdown 写作、标签分类、云端同步。

- **前端框架**：React 18 + Vite
- **后端/数据库**：Supabase（PostgreSQL + Auth）
- **部署平台**：Vercel（自动部署）
- **代码仓库**：GitHub - https://github.com/lihpgit/my-notes
- **线上地址**：https://my-notes-brown-delta.vercel.app
- **开发者背景**：Android 开发者，熟悉 Java/Kotlin，Web 前端新手

---

## 技术栈详情

| 技术 | 用途 | 版本 |
|------|------|------|
| React | 前端框架 | 18.x |
| Vite | 构建工具 | 8.0.11 |
| Supabase JS | 数据库 + 认证客户端 | @supabase/supabase-js |
| marked | Markdown 渲染 | latest |
| Vercel | 静态托管 + 自动部署 | - |

---

## 项目目录结构

```
my-notes/
├── index.html
├── package.json
├── vite.config.js
├── public/
└── src/
    ├── main.jsx          # 入口文件
    ├── App.jsx           # 主应用（包含所有页面和逻辑）
    ├── supabase.js       # Supabase 客户端配置
    └── App.css           # （可选，当前样式写在 App.jsx 内联）
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

```sql
-- notes 表
create table notes (
  id text primary key,
  title text default '',
  content text default '',
  color jsonb,                                              -- 旧版字段，新版未使用
  tags jsonb default '[]',                                  -- 标签数组，如 ["Android", "学习"]
  banner integer default 0,                                 -- Banner 渐变色索引（0-7）
  created_at bigint,                                        -- 创建时间戳（毫秒）
  updated_at bigint,                                        -- 更新时间戳（毫秒）
  user_id uuid references auth.users(id) on delete cascade  -- 关联用户
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

### 认证配置

- 认证方式：邮箱 + 密码
- 邮箱确认：已关闭（Supabase → Authentication → Providers → Email → Confirm email 关闭）
- 用户注册后直接登录，无需邮箱验证

---

## 应用架构

### 页面/视图

应用有 4 个视图，通过 `view` state 切换（非路由）：

1. **登录页（AuthPage）**：邮箱密码登录/注册
2. **列表页（view="list"）**：文章卡片网格，标签筛选，搜索
3. **阅读页（view="read"）**：博客风格文章展示，Markdown 渲染
4. **编辑页（view="edit"）**：左右分屏，左 Markdown 编辑 + 右实时预览

### 数据流

```
浏览器（React App）
    ↕ supabase-js 直接通信
Supabase
    ├── Auth：用户登录/注册/会话管理
    └── Database：notes 表 CRUD
```

- Vercel 只负责托管静态前端文件，不经手数据
- 前端通过 supabase-js 直接与 Supabase API 通信
- 数据操作使用防抖（600ms），避免每次按键都请求

### 关键常量

```javascript
// 预设标签
const TAGS = ["Android", "iOS", "前端", "后端", "随笔", "学习", "工作", "生活"];

// 标签颜色映射
const TAG_COLORS = {
  Android: { bg: "#dcfce7", fg: "#166534" },
  iOS:     { bg: "#dbeafe", fg: "#1e40af" },
  前端:    { bg: "#ffedd5", fg: "#9a3412" },
  后端:    { bg: "#f3e8ff", fg: "#6b21a8" },
  随笔:    { bg: "#fce7f3", fg: "#9d174d" },
  学习:    { bg: "#ccfbf1", fg: "#115e59" },
  工作:    { bg: "#fef9c3", fg: "#854d0e" },
  生活:    { bg: "#f5f5f4", fg: "#44403c" },
};

// 文章卡片 Banner 渐变色（8种）
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

在 Supabase 控制台 → SQL Editor 中执行 ALTER TABLE 语句，与代码部署独立。

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

1. **所有代码在单文件 App.jsx 中**：应拆分为多个组件文件（AuthPage、NoteList、NoteReader、NoteEditor 等）
2. **样式全部内联**：应迁移到 CSS Modules 或 Tailwind CSS
3. **无路由**：使用 state 切换视图，无法通过 URL 直接访问某篇文章。应引入 react-router
4. **无图片上传**：Markdown 中的图片只能引用外部链接，应集成 Supabase Storage
5. **移动端适配不完善**：编辑页的左右分屏在手机上体验差，需要做响应式
6. **无目录导航（TOC）**：阅读页没有像博客那样的文章目录
7. **无代码语法高亮**：代码块只有深色背景，没有语法着色。可集成 highlight.js 或 Prism.js
8. **标签只有预设选项**：应支持用户自定义标签
9. **无文章排序选项**：目前只按更新时间倒序
10. **无导出功能**：应支持导出为 Markdown 文件

---

## 后续可开发的功能方向

### 高优先级
- [ ] 组件拆分 + 项目结构优化
- [ ] 移动端响应式适配
- [ ] 文章目录（TOC）自动生成
- [ ] 代码语法高亮（highlight.js）
- [ ] 图片上传（Supabase Storage）

### 中优先级
- [ ] 引入 react-router，支持 URL 直达文章
- [ ] 自定义标签（用户创建/删除标签）
- [ ] 文章置顶 / 收藏功能
- [ ] 暗黑模式
- [ ] 文章导出为 .md 文件

### 低优先级
- [ ] 全文搜索优化（Supabase Full Text Search）
- [ ] 文章版本历史 / 回收站
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
2. 主要修改的文件是 `src/App.jsx` 和 `src/supabase.js`
3. 数据库变更需要在 Supabase SQL Editor 中手动执行，Claude Code 无法直接操作
4. 推送代码后 Vercel 自动部署，不需要额外操作
5. 如果需要安装新的 npm 包，使用 `npm install 包名`
6. 本地预览用 `npm run dev`
7. 用户是 Android 开发者，对 Web 前端不太熟悉，请多用 Android 概念类比解释
