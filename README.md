# dsh-message-rail

[![npm version](https://img.shields.io/npm/v/dsh-message-rail)](https://www.npmjs.com/package/dsh-message-rail)
[![npm downloads](https://img.shields.io/npm/dm/dsh-message-rail)](https://www.npmjs.com/package/dsh-message-rail)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Codex 风格左侧消息导航轨道 —— 在 DeepSeek Harness Web UI 的长会话里快速定位历史提问。

> Left-side message navigation rail for the DeepSeek Harness Web UI: jump to any past user message in long sessions, Codex-style.

> 交互灵感来自 Codex 的消息导航栏（inspired by Codex's message rail）。本插件与 OpenAI 无关联。

## 效果预览

会话左侧的消息导航轨道（悬停刻度显示预览卡，点击跳转到对应消息）：

![轨道悬停预览](assets/rail-hover-preview.png)

轨道贴会话区左缘，与界面主题自适应：

![轨道整体效果](assets/rail-left-edge.png)

## 功能

- **等距刻度轨道**：会话左侧一条 42px 轨道，每条用户消息一个刻度（固定 11px 间距）；轨道默认高度 550px（约 50 条），屏幕不足时撑满
- **悬停预览**：相邻刻度逐级变长（23/17/12/9px 波纹），右侧浮出预览卡（序号 + 相对时间 + 消息文本）
- **点击跳转**：平滑滚动到对应消息并主题色描边高亮；目标尚未进入右侧窗口时才逐页加载，找到后立即停止
- **独立全量索引**：通过 DSH history API 在后台提取用户消息刻度，不把助手回复、工具调用和历史消息写入右侧 ChatView
- **轨道虚拟滚动**：无论索引多少刻度，都只渲染可见窗口 ±12 条缓冲，左侧 DOM 恒定、滚动流畅
- **稳定切换**：索引期间先显示右侧已经加载的刻度，不发布中间分页；完整索引完成后一次性切换，避免刻度持续重排闪动
- **按需分页**：点击未加载刻度时保护右侧当前阅读锚点，逐页寻找目标；后一次点击可取代前一次跳转
- **加载反馈**：根据刻度所在 history 分页预估剩余页数；等待超过 1 秒才显示加载进度和预计剩余秒数，快速跳转不打扰
- **当前位置**：视口 40% 线最近的消息刻度深色高亮，滚动即知读到哪
- **智能滚动**：轨道钉在最新刻度，手动滚动后停止跟随；隐藏滚动条、滚轮可用
- **细节**：少于 2 条用户消息自动隐藏；明暗主题自适应；`prefers-reduced-motion` 降级；键盘可悬停（focus 等价 hover）

## 兼容性

- DeepSeek Harness `0.1.0-rc.6` 或更高
- Node.js 22+
- 浏览器：Chrome / Edge / Safari / Firefox 最新版

## 安装

插件通过 DeepSeek Harness 的 `dsh` 命令安装。下面每个命令都给出两种等价写法：

- **dsh 形式**：适用于已全局安装 dsh（`npm install -g @deepseek-ai/dsh`）
- **npx 形式**：无需安装 dsh，临时调用，效果相同——**推荐**（dsh 尚在快速迭代，全局安装非必需）

### 从 npm 安装（推荐，免构建授权）

```bash
# dsh 形式
dsh plugin --profile web add dsh-message-rail

# npx 形式（无需安装 dsh）
npx @deepseek-ai/dsh plugin --profile web add dsh-message-rail
```

### 从 GitHub 安装

```bash
# dsh 形式
dsh plugin --profile web add github:wx-yss/dsh-message-rail

# npx 形式
npx @deepseek-ai/dsh plugin --profile web add github:wx-yss/dsh-message-rail
```

### 本地开发安装

```bash
git clone git@github.com:wx-yss/dsh-message-rail.git
cd dsh-message-rail
pnpm install
npx @deepseek-ai/dsh plugin --profile web add .
```

### 重启

安装后**完整重启** dsh web：

```bash
# dsh 形式
dsh web

# npx 形式
npx @deepseek-ai/dsh web
```

## 使用

打开包含至少两条用户消息的会话，左侧即出现导航轨道：

- **悬停**刻度 → 波纹展开 + 预览卡（序号 / 时间 / 文本）
- **点击**刻度 → 跳转到对应消息
- **滚轮**在轨道上滚动 → 浏览更早/更晚的刻度
- 滚动会话 → 当前位置刻度高亮

## 已知限制

- 后台索引通过独立 history API 每页读取 50 个表层消息边界；响应仍可能携带所属的 chunk、工具事件等原始记录，但不会进入右侧聊天状态或 DOM
- 索引页数上限为 400（约 2 万个表层消息）；超过上限时保留右侧当前已加载刻度，不展示不完整的全量索引
- 点击非常早的刻度时，DSH 的 `loadOlder()` 仍会把中间页面逐步加入右侧且不会自动卸载；这属于 DSH 聊天列表当前的累积渲染限制
- 剩余时间采用真实长会话测量值校准（固定定位开销约 1.8 秒、每页约 0.35 秒），属于体验预估而非完成时间承诺
- 轨道仅索引用户消息（`kind === 'user'`），不包含助手回复、工具调用、steering/注入上下文
- 轨道配色跟随 DSH 运行时主题（`--dsw-*` 设计令牌），不支持独立于 DSH 的配色偏好
- 轨道刻度为虚拟窗口渲染，键盘 Tab 可达（focus 等价悬停）；DOM 锚点（`data-chat-anchor-key` / `data-conversation-scroll`）为 DSH 内部契约，随 DSH 版本可能变化

## 文件结构

```
├── package.json         # dsh.client（Web 插件）+ dsh.bundle（profile patch）声明
├── cordis.patch.yml     # bundle patch：插入插件行
├── lib/
│   ├── index.js         # Host 半部：空 apply 占位
│   └── client.js        # Client 半部：独立索引 + 轨道 UI + 按需分页跳转
├── assets/              # README 效果截图
├── LICENSE              # MIT
└── README.md
```

## 实现要点

- 挂载：`shell.overlay` 声明会话级子 seat `message-rail.rail`（`SessionProvider` 桥接，每会话一个实例）
- 数据：当前窗口读取 `useSession` 的 `chat.order` + `chat.nodes`；完整刻度通过 `connection.api.sessions.history()`（子 Agent 使用 `subagents.history()`）独立建立
- 索引：只保留用户消息的 `messageId`、`seq`、时间和预览文本，并复现 next-step inbox 状态以排除 steering；中间分页不进入 React 状态
- 跳转加载：按 `messageId` 判断目标是否已进入右侧；未加载时才调用 `session.loadOlder()`，每页保护可见消息锚点并在命中目标后停止
- 进度：索引记录每条用户消息距最新页的 `historyPage`；结合右侧已加载深度估算剩余页数，一秒后才显示非阻塞提示并随实际分页更新
- 跳转：`[data-conversation-scroll]` + `[data-chat-anchor-key]` DOM 锚点，直接驱动滚动容器（贴底时先瞬时 kick 翻掉 ChatView 的贴底跟随位，再平滑 `scrollTo` + 有界重试），到位后描边闪烁
- 虚拟窗口：`floor(scrollTop / 11) - 12` 到 `ceil((scrollTop + 高度) / 11) + 12`，绝对定位刻度

## License

MIT
