# dsh-message-rail

DSH（DeepSeek Harness）Web 插件：Codex 风格左侧消息导航轨道。

## 功能

- 会话左侧一条 42px 轨道，每条用户消息一个等距刻度（固定 11px 间距，来自 Codex demo 的 45 条 / 492px 比例）
- **悬停**：相邻刻度逐级变长（23 / 17 / 12 / 9px 波纹），右侧浮出预览卡（序号 + 相对时间 + 消息文本）
- **点击**：平滑滚动跳转到对应消息并蓝色描边高亮；历史未加载时自动加载更早页
- **当前位置**：视口 40% 线最近的消息刻度深色高亮
- **全量历史**：挂载后后台自动 `loadOlder` 直到加载完整个会话，轨道显示全部用户消息
- 轨道满高、内容少时垂直居中、超出高度时内部滚动（默认钉在底部，手动滚动后停止跟随）
- 少于 2 条用户消息自动隐藏；明暗主题自适应；`prefers-reduced-motion` 降级

## 安装

```bash
dsh plugin --profile web add /path/to/dsh-message-rail
```

安装后重启 `dsh web`。

## 文件结构

```
├── package.json         # dsh.client（Web 插件）+ dsh.bundle（profile patch）声明
├── cordis.patch.yml     # bundle patch：插入插件行
├── lib/
│   ├── index.js         # Host 半部：空 apply 占位
│   └── client.js        # Client 半部：轨道 UI + 悬停预览 + 点击跳转 + 全量加载
```

## 实现要点

- 挂载：`shell.overlay` 声明会话级子 seat `message-rail.rail`（SessionProvider 桥接）
- 数据：`useSession` 快照 `chat.order` + `chat.nodes`，过滤 `node.kind === 'user'`
- 跳转：`[data-conversation-scroll]` + `[data-chat-anchor-key]` DOM 锚点 → `scrollIntoView` + flash
- 全量加载：`session.loadOlder()` 循环直到 `hasMore === false`（上限 2000 页）
