// dsh-message-rail — web client half.
// Codex 风格左侧消息导航轨道：每条用户消息一个等距刻度，悬停时相邻刻度
// 逐级变长并显示预览浮层，点击跳转到对应消息（历史未加载时自动加载更早页）。
//
// Module format: window.__ModuleLoader__ factory bundle (see
// @deepseek-ai/dsh-client-modules). Pure JS plus require("react"), ships as-is.

window.__ModuleLoader__.load({
  id: "dsh-message-rail",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    const CSS =
      ".dshmr-rail{position:fixed;z-index:60;width:42px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;pointer-events:none;scrollbar-width:none}" +
      ".dshmr-rail::-webkit-scrollbar{display:none}" +
      ".dshmr-tick{position:relative;display:block;width:42px;height:11px;flex:none;padding:0;border:0;background:transparent;cursor:pointer;pointer-events:auto}" +
      ".dshmr-tick::before{content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);width:var(--dshmr-tick-width,6px);height:2px;border-radius:2px;background:var(--dshmr-tick-color,color-mix(in srgb,var(--dsw-alias-border-l2) 94%,var(--dsw-alias-label-primary) 6%));transition:width 160ms cubic-bezier(0.2,0.75,0.25,1)}" +
      ".dshmr-rail .dshmr-tick.dshmr-current::before{--dshmr-tick-color:var(--dsw-alias-label-primary)}" +
      ".dshmr-rail[data-previewing='true'] .dshmr-tick.dshmr-current:not(.dshmr-hovered)::before{--dshmr-tick-color:var(--dsw-alias-border-l2)}" +
      ".dshmr-rail .dshmr-tick.dshmr-hovered::before{--dshmr-tick-color:var(--dsw-alias-label-primary)}" +
      ".dshmr-tick:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:2px}" +
      ".dshmr-preview{position:fixed;z-index:61;width:min(390px,calc(100vw - 60px));box-sizing:border-box;padding:9px 10px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-overlay);box-shadow:0 5px 16px rgba(0,0,0,0.25);opacity:0;transform:translateX(-5px) scale(0.985);transform-origin:left center;pointer-events:none;transition:opacity 110ms ease,transform 150ms cubic-bezier(0.2,0.75,0.25,1),top 130ms ease}" +
      ".dshmr-preview[data-visible='true']{opacity:1;transform:translateX(0) scale(1)}" +
      ".dshmr-preview-line{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);line-height:1.55;font-size:13px}" +
      ".dshmr-preview-line:first-child{color:var(--dsw-alias-label-primary);font-weight:500;font-size:13px}" +
      "[data-chat-anchor-key].dshmr-flash{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 85%,transparent);outline-offset:-2px;border-radius:8px}" +
      "@media (prefers-reduced-motion:reduce){.dshmr-tick::before,.dshmr-preview{transition:none}}";

    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-message-rail"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-message-rail";
      tag.dataset.pluginCss = "dsh-message-rail";
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    const MIN_MARKS = 2;
    const PREVIEW_LENGTH = 80;
    const TICK_WIDTHS = [23, 17, 12, 9];
    const PREVIEW_HEIGHT = 112;
    const PREVIEW_LINES = 3;
    /** Fixed pitch per tick (px): demo 45 ticks over 492px ≈ 10.9px → 11px. */
    const TICK_STEP = 11;
    /** Snap-back trigger: snap when the black tick reaches the 3rd tick from an edge. */
    const EDGE_MARGIN = TICK_STEP * 3;
    /** Minimum visible tick count for snap-back to make sense; below it, edge-follow only. */
    const SNAP_MIN_VISIBLE = 12;
    /** Extra ticks rendered above/below the visible window (scroll smoothness). */
    const SCROLL_BUFFER = 12;
    /** Default rail height: at most 50 visible ticks; fills the scrollport when smaller. */
    const RAIL_HEIGHT = 50 * TICK_STEP;
    /** Rail gutters relative to the scrollport (left inset, top/bottom inset, min height). */
    const RAIL_GUTTER_LEFT = 8;
    const RAIL_EDGE_INSET = 14;
    const RAIL_MIN_HEIGHT = 120;
    /** Preview card offset right of the rail. */
    const PREVIEW_LEFT_OFFSET = 48;
    /** Preview text characters per line (PREVIEW_LENGTH split across PREVIEW_LINES). */
    const PREVIEW_CHARS_PER_LINE = Math.ceil(PREVIEW_LENGTH / PREVIEW_LINES);
    /** Target-message flash duration (ms). */
    const FLASH_MS = 1400;
    /**
     * Follow-bit kick: while the shell's chat view is pinned to the bottom,
     * the easing of a smooth scroll moves sub-pixel amounts per frame in its
     * first frames; the view's scroll handler reads those as "layout
     * movement" (not reader movement) and toBottom()s the scrollport, which
     * cancels the animation. One instant write this far off the floor makes
     * the first scroll event carry a real displacement (movedByReader=true)
     * and leave the bottom band (>25px ⇒ atBottom=false), so the smooth
     * scroll that follows can no longer be cancelled.
     */
    const JUMP_KICK_PX = 32;
    /** 跳转稳定检测：最长约 3 秒，期间仅在滚动被打断时重新发起。 */
    const JUMP_SETTLE_ATTEMPTS = 60;
    const JUMP_SETTLE_WAIT_MS = 50;
    const JUMP_REASSERT_LIMIT = 4;
    /** 跳转完成后短暂保持加载暂停，等待宿主提交最终滚动状态。 */
    const JUMP_RESUME_DELAY_MS = 100;
    /** 当前分页结束后，等待右侧滚动容器连续两次采样保持稳定。 */
    const DOM_STABLE_ATTEMPTS = 10;
    /** 历史索引和目标跳转共同使用的分页上限。 */
    const HISTORY_PAGE_LIMIT = 400;
    const JUMP_LOOP_CAP = HISTORY_PAGE_LIMIT;
    /** Bounded DOM poll after data is ready (React commits asynchronously). */
    const DOM_POLL_ATTEMPTS = 20;
    const DOM_POLL_DELAY = 50;
    /** Backoff after a failed loadOlder (avoid retry storms). */
    const RETRY_BACKOFF_MS = 200;
    /** Wait while the runtime reports loadingOlder. */
    const LOADING_WAIT_MS = 50;
    /** 独立历史索引有界执行，并在分页之间让出主线程。 */
    const INDEX_MAX_PAGES = HISTORY_PAGE_LIMIT;
    const INDEX_PAGE_MESSAGES = 50;
    const INDEX_PAGE_YIELD_MS = 16;
    const INDEX_RETRY_LIMIT = 3;

    /** Extract plain text from a user message's ContentBlock list. */
    function userTextOf(content) {
      if (!Array.isArray(content)) return "";
      let out = "";
      for (const block of content) {
        if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") out += block.text;
      }
      return out.trim();
    }

    /** Relative time label (刚刚 / N 分钟前 / N 小时前 / 昨天 / 具体时间). */
    function fmtRelative(ms) {
      if (typeof ms !== "number" || ms <= 0) return "";
      const diff = Date.now() - ms;
      if (diff < 60000) return "刚刚";
      if (diff < 3600000) return Math.max(1, Math.floor(diff / 60000)) + " 分钟前";
      if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
      const d = new Date(ms);
      const pad = (n) => String(n).padStart(2, "0");
      if (diff < 172800000) return "昨天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
      return d.getMonth() + 1 + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    /** 按消息 key 查找右侧消息行。 */
    function findRow(key) {
      for (const row of document.querySelectorAll("[data-chat-anchor-key]")) {
        if (row.dataset.chatAnchorKey === key) return row;
      }
      return null;
    }

    /** 从当前右侧窗口查找指定用户消息。 */
    function findUserNode(snapshot, messageId) {
      const chat = snapshot && snapshot.chat;
      if (chat === undefined || chat.nodes === undefined) return null;
      for (const key of chat.order || []) {
        const node = chat.nodes.get(key);
        if (node !== undefined && node.kind === "user" && String(node.id) === messageId) return node;
      }
      return null;
    }

    /** 记录右侧当前可见锚点，分页前插后用于恢复阅读位置。 */
    function captureScrollAnchor(sp) {
      const floor = Math.max(0, sp.scrollHeight - sp.clientHeight);
      if (floor - sp.scrollTop <= 25) return null;
      const spRect = sp.getBoundingClientRect();
      let bestRow = null;
      let bestDistance = Infinity;
      for (const row of sp.querySelectorAll("[data-chat-anchor-key]")) {
        const r = row.getBoundingClientRect();
        if (r.bottom <= spRect.top || r.top >= spRect.bottom) continue;
        const distance = Math.abs(r.top - spRect.top);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRow = row;
        }
      }
      if (bestRow === null || bestRow.dataset.chatAnchorKey === undefined) return null;
      return {
        key: bestRow.dataset.chatAnchorKey,
        top: bestRow.getBoundingClientRect().top - spRect.top,
        scrollHeight: sp.scrollHeight,
        rowCount: sp.querySelectorAll("[data-chat-anchor-key]").length,
      };
    }

    /** 等待分页 DOM 落地，并把分页前的可见消息恢复到原位置。 */
    async function restoreScrollAnchor(sp, anchor, delay) {
      if (anchor === null) return;
      for (let attempt = 0; attempt < DOM_POLL_ATTEMPTS; attempt += 1) {
        await delay(DOM_POLL_DELAY);
        const rowCount = sp.querySelectorAll("[data-chat-anchor-key]").length;
        const domChanged = rowCount !== anchor.rowCount || Math.abs(sp.scrollHeight - anchor.scrollHeight) > 0.5;
        if (!domChanged) continue;
        const row = findRow(anchor.key);
        if (row === null || row.closest("[data-conversation-scroll]") !== sp) continue;
        const spRect = sp.getBoundingClientRect();
        const delta = row.getBoundingClientRect().top - spRect.top - anchor.top;
        if (Math.abs(delta) > 0.5) sp.scrollTop += delta;
        return;
      }
    }

    /** 新点击取代旧点击，旧异步流程不能结束新点击。 */
    function createLoadCoordinator() {
      let jumpSequence = 0;
      let activeJump = 0;
      return {
        beginJump: () => {
          jumpSequence += 1;
          activeJump = jumpSequence;
          return activeJump;
        },
        isCurrentJump: (token) => activeJump === token,
        endJump: (token) => {
          if (activeJump === token) activeJump = 0;
        },
      };
    }

    /**
     * 跳转到指定用户消息。目标不在右侧窗口时才逐页 loadOlder；每页前插
     * 都恢复原阅读锚点，找到目标后停止分页并等待滚动真正到位。
     */
    function createJump(sessionsService, sessionId, coordinator) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitForDomStable = async () => {
        const sp = document.querySelector("[data-conversation-scroll]");
        if (sp === null) return;
        let lastHeight = sp.scrollHeight;
        let lastTop = sp.scrollTop;
        let stableSamples = 0;
        for (let attempt = 0; attempt < DOM_STABLE_ATTEMPTS; attempt += 1) {
          await delay(DOM_POLL_DELAY);
          const height = sp.scrollHeight;
          const top = sp.scrollTop;
          if (Math.abs(height - lastHeight) < 0.5 && Math.abs(top - lastTop) < 0.5) {
            stableSamples += 1;
            if (stableSamples >= 2) return;
          } else {
            stableSamples = 0;
          }
          lastHeight = height;
          lastTop = top;
        }
      };
      return async (messageId) => {
        const binding = sessionsService.binding(sessionId);
        const session = binding === undefined ? undefined : binding.session;
        if (session === undefined) return false;
        const jumpToken = coordinator.beginJump();
        try {
          // 用户可能已经手动触发分页；等当前页完成后再接管按需加载。
          let guard = 0;
          while (guard++ < JUMP_LOOP_CAP) {
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            const snapshot = session.getSnapshot();
            if (snapshot && snapshot.loadingOlder !== true) break;
            await delay(LOADING_WAIT_MS);
          }
          let stalls = 0;
          guard = 0;
          let targetNode = null;
          while (guard++ < JUMP_LOOP_CAP) {
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            const snapshot = session.getSnapshot();
            targetNode = findUserNode(snapshot, messageId);
            if (targetNode !== null) break;
            if (snapshot === undefined || snapshot.hasMore !== true) return false;
            if (snapshot.loadingOlder === true) {
              await delay(LOADING_WAIT_MS);
              continue;
            }
            const before = snapshot.chat ? snapshot.chat.order.length : 0;
            const sp = document.querySelector("[data-conversation-scroll]");
            let anchor = sp === null ? null : captureScrollAnchor(sp);
            const updateAnchor = () => {
              if (sp !== null) anchor = captureScrollAnchor(sp);
            };
            if (sp !== null) sp.addEventListener("scroll", updateAnchor, { passive: true });
            try {
              await session.loadOlder();
            } catch (error) {
              await delay(RETRY_BACKOFF_MS);
            } finally {
              if (sp !== null) sp.removeEventListener("scroll", updateAnchor);
            }
            const after = session.getSnapshot();
            const afterCount = after && after.chat ? after.chat.order.length : before;
            if (afterCount > before && sp !== null) await restoreScrollAnchor(sp, anchor, delay);
            if (afterCount === before) {
              // loadOlder 失败时运行时内部吞错（正常 resolve）：窗口无增长
              // 即静默失败，退避重试，连续无进展则放弃。
              stalls += 1;
              if (stalls >= 5) return false;
              await delay(RETRY_BACKOFF_MS);
            } else {
              stalls = 0;
            }
          }
          if (targetNode === null) return false;
          const key = targetNode.key;
          await waitForDomStable();
          let row = null;
          for (let attempt = 0; attempt < DOM_POLL_ATTEMPTS && row === null; attempt += 1) {
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            row = findRow(key);
            if (row === null) await delay(DOM_POLL_DELAY);
          }
          if (row === null) return false;
          const reducedMotion =
            typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const sp = row.closest("[data-conversation-scroll]");
          const flash = () => {
            row.classList.add("dshmr-flash");
            setTimeout(() => row.classList.remove("dshmr-flash"), FLASH_MS);
          };
          if (sp === null) {
            // 宿主 DOM 契约变化时退回浏览器原生跳转。
            row.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
            flash();
            return true;
          }
          /** 计算目标消息在宿主滚动容器中的居中位置。 */
          const centerTarget = () => {
            const spRect = sp.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            const desired = sp.scrollTop + (r.top - spRect.top) - (sp.clientHeight - r.height) / 2;
            return Math.max(0, Math.min(sp.scrollHeight - sp.clientHeight, desired));
          };
          const startScroll = () => {
            const target = centerTarget();
            const floor = Math.max(0, sp.scrollHeight - sp.clientHeight);
            const atBottom = floor - sp.scrollTop <= 25;
            if (atBottom && target < floor - 25 && floor > JUMP_KICK_PX) {
              sp.scrollTop = floor - JUMP_KICK_PX;
            }
            sp.scrollTo({ top: target, behavior: reducedMotion ? "auto" : "smooth" });
            return target;
          };

          let target = centerTarget();
          if (Math.abs(sp.scrollTop - target) >= 4) target = startScroll();
          let lastTop = sp.scrollTop;
          let stableFrames = 0;
          let reasserts = 0;
          let ok = false;
          for (let attempt = 0; attempt < JUMP_SETTLE_ATTEMPTS; attempt += 1) {
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            await delay(JUMP_SETTLE_WAIT_MS);
            target = centerTarget();
            const r = row.getBoundingClientRect();
            const pr = sp.getBoundingClientRect();
            const visible = r.bottom > pr.top && r.top < pr.bottom;
            const atTarget = Math.abs(sp.scrollTop - target) < 4;
            const moved = Math.abs(sp.scrollTop - lastTop);
            stableFrames = moved < 0.5 ? stableFrames + 1 : 0;
            if (atTarget || (visible && stableFrames >= 2)) {
              ok = true;
              break;
            }
            const floor = Math.max(0, sp.scrollHeight - sp.clientHeight);
            const snappedBack = floor - sp.scrollTop <= 25 && target < floor - 25;
            if (reasserts < JUMP_REASSERT_LIMIT && (snappedBack || stableFrames >= 4)) {
              target = startScroll();
              reasserts += 1;
              stableFrames = 0;
            }
            lastTop = sp.scrollTop;
          }
          if (!ok) {
            console.warn("[dsh-message-rail] 跳转滚动未稳定", {
              key,
              attempts: JUMP_SETTLE_ATTEMPTS,
              scrollTop: sp.scrollTop,
            });
            return false;
          }
          flash();
          await delay(JUMP_RESUME_DELAY_MS);
          return true;
        } finally {
          coordinator.endJump(jumpToken);
        }
      };
    }

    /**
     * 通过独立 history API 建立轻量用户消息索引。该流程不调用
     * session.loadOlder，也不会修改右侧 ChatView 的消息窗口。
     */
    function createHistoryIndex(connection, sessionsService, sessionId) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const readPage = (payload) => {
        const address = sessionsService.subagentAddress(sessionId);
        return address === undefined
          ? connection.api.sessions.history({ sessionId, ...payload })
          : connection.api.subagents.history({ ...address, ...payload });
      };
      return async (disposed) => {
        const recordsBySeq = new Map();
        let beforeSeq;
        let hasMore = true;
        let pages = 0;
        while (hasMore && pages < INDEX_MAX_PAGES) {
          if (disposed()) return null;
          let response = null;
          let lastError = null;
          for (let attempt = 0; attempt < INDEX_RETRY_LIMIT; attempt += 1) {
            try {
              response = await readPage({
                ...(beforeSeq === undefined ? {} : { beforeSeq }),
                maxMessages: INDEX_PAGE_MESSAGES,
              });
              break;
            } catch (error) {
              lastError = error;
              await delay(RETRY_BACKOFF_MS);
            }
          }
          if (response === null) throw lastError || new Error("历史索引请求失败");
          const result = response.result;
          if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error.message : "历史索引请求失败");
          }
          const entries = result.value.events || [];
          for (const entry of entries) {
            const event = entry && entry.event;
            if (event === undefined || recordsBySeq.has(event.seq)) continue;
            if (event.type === "agent/inbox/spliced" && event.data && event.data.target === "next-step") {
              recordsBySeq.set(event.seq, {
                kind: "splice",
                seq: event.seq,
                start: event.data.start,
                removedCount: event.data.removedCount,
                inserted: Array.isArray(event.data.inserted)
                  ? event.data.inserted.map((item) => ({ id: String(item.id) }))
                  : [],
                outcome: event.data.outcome,
              });
              continue;
            }
            if (
              event.type === "user/message" &&
              event.surfaceOp === "append" &&
              event.data &&
              event.data.source &&
              event.data.source.kind === "user"
            ) {
              recordsBySeq.set(event.seq, {
                kind: "user",
                seq: event.seq,
                messageId: String(event.data.id),
                time: typeof event.time === "number" ? event.time : 0,
                text: userTextOf(event.data.content).slice(0, PREVIEW_LENGTH),
              });
            }
          }
          hasMore = result.value.hasMore === true;
          if (!hasMore) break;
          const first = entries[0] && entries[0].event;
          if (first === undefined || typeof first.seq !== "number" || first.seq === beforeSeq) {
            throw new Error("历史索引分页游标未前进");
          }
          beforeSeq = first.seq;
          pages += 1;
          await delay(INDEX_PAGE_YIELD_MS);
        }
        if (hasMore) throw new Error("历史索引超过页数上限");

        // 复现 DSH 对 next-step inbox 的累计判断，排除 steering 消息。
        const pending = [];
        const claimed = new Set();
        const marks = [];
        const records = [...recordsBySeq.values()].sort((left, right) => left.seq - right.seq);
        for (const record of records) {
          if (record.kind === "splice") {
            const removed = pending.splice(record.start, record.removedCount || 0, ...record.inserted);
            for (const inserted of record.inserted) claimed.delete(inserted.id);
            if (record.outcome !== "canceled") {
              for (const item of removed) claimed.add(item.id);
            }
            continue;
          }
          if (!claimed.has(record.messageId)) marks.push(record);
        }
        return marks;
      };
    }

    /** Overlay entry: declares the session-scoped rail child and bridges it. */
    function Overlay(props) {
      return React.createElement(
        props.SessionProvider,
        { empty: () => null },
        () => props.renderSlot("message-rail.rail", {}),
      );
    }

    /** The session-scoped rail. */
    function Rail(props) {
      const useSession = props.useSession;
      const sessionId = props.sessionId;
      const jump = props.jump;
      const loadIndex = props.loadIndex;

      const order = useSession((s) => (s && s.chat ? s.chat.order : undefined));
      const nodes = useSession((s) => (s && s.chat ? s.chat.nodes : undefined));

      const [railRect, setRailRect] = React.useState(null);
      const [hoverIndex, setHoverIndex] = React.useState(null);
      const [scrollTop, setScrollTop] = React.useState(0);
      const [indexedMarks, setIndexedMarks] = React.useState(null);
      const railRef = React.useRef(null);

      /** 当前右侧窗口中已经加载并可直接跳转的用户消息。 */
      const loadedMarks = React.useMemo(() => {
        const result = [];
        for (const key of order || []) {
          const node = nodes && nodes.get(key);
          if (node === undefined || node.kind !== "user" || node.id === undefined) continue;
          const data = node.data || {};
          result.push({
            key,
            messageId: String(node.id),
            seq: typeof data.seq === "number" ? data.seq : 0,
            time: typeof data.time === "number" ? data.time : 0,
            text: userTextOf(data.content),
          });
        }
        return result;
      }, [order, nodes]);

      /** 后台索引不发布中间页；完成后一次性替换，避免刻度持续重排闪动。 */
      React.useEffect(() => {
        let disposed = false;
        setIndexedMarks(null);
        if (loadIndex === undefined) return () => {
          disposed = true;
        };
        loadIndex(() => disposed)
          .then((marks) => {
            if (!disposed && marks !== null) {
              setHoverIndex(null);
              setIndexedMarks(marks);
            }
          })
          .catch((error) => {
            if (!disposed) console.warn("[dsh-message-rail] 历史刻度索引失败", error);
          });
        return () => {
          disposed = true;
        };
      }, [sessionId, loadIndex]);

      /** 索引完成后仍合并当前窗口新增的实时用户消息。 */
      const displayMarks = React.useMemo(() => {
        if (indexedMarks === null) return loadedMarks;
        const merged = new Map(indexedMarks.map((mark) => [mark.messageId, mark]));
        for (const mark of loadedMarks) merged.set(mark.messageId, { ...merged.get(mark.messageId), ...mark });
        return [...merged.values()].sort((left, right) => left.seq - right.seq);
      }, [indexedMarks, loadedMarks]);

      const [readingMessageId, setReadingMessageId] = React.useState(null);
      const readingIndex = React.useMemo(() => {
        if (readingMessageId === null) return -1;
        return displayMarks.findIndex((mark) => mark.messageId === readingMessageId);
      }, [displayMarks, readingMessageId]);
      const activeIndex = readingIndex >= 0 ? readingIndex : displayMarks.length - 1;

      /** Drop a stale hover index when marks shrink (resync/compaction). */
      React.useEffect(() => {
        if (hoverIndex !== null && hoverIndex >= displayMarks.length) setHoverIndex(null);
      }, [displayMarks.length, hoverIndex]);

      /** 当前刻度接近窗口边缘时移动轨道窗口。 */
      React.useLayoutEffect(() => {
        const el = railRef.current;
        if (el === null) return;
        if (readingIndex < 0 || readingIndex >= displayMarks.length) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        // Snap-back: the black tick travels freely inside the window; when
        // it reaches the 3rd tick from an edge it snaps back to the 1/3
        // (scrolling up) or 2/3 (scrolling down) line, so it keeps moving
        // with visible progress. With no room to snap (no overflow, or a
        // very short rail), fall back to edge-follow.
        const blackTop = padTop + readingIndex * TICK_STEP;
        const maxTop = el.scrollHeight - el.clientHeight;
        const relPos = blackTop - el.scrollTop;
        const visibleCount = Math.floor(railHeight / TICK_STEP);
        if (maxTop <= 0 || visibleCount < SNAP_MIN_VISIBLE) {
          // Not enough room for snap-back (little content or a very short
          // rail): fall back to edge-follow — the window scrolls only when
          // the tick reaches the 3rd-from-edge position.
          if (relPos < EDGE_MARGIN) {
            el.scrollTop = Math.max(0, blackTop - EDGE_MARGIN);
          } else if (relPos > railHeight - EDGE_MARGIN) {
            el.scrollTop = Math.min(maxTop, blackTop - railHeight + EDGE_MARGIN);
          }
          return;
        }
        if (relPos < EDGE_MARGIN) {
          // Scrolling up: snap back to the top third of the window.
          el.scrollTop = Math.max(0, Math.min(maxTop, blackTop - railHeight / 3));
        } else if (relPos > railHeight - EDGE_MARGIN) {
          // Scrolling down: snap back to the bottom third of the window.
          el.scrollTop = Math.max(0, Math.min(maxTop, blackTop - railHeight * 2 / 3));
        }
        // Otherwise the window stays; the black tick moves freely inside it.
      }, [displayMarks.length, readingIndex, railRect]);

      /** Measure the conversation scrollport and anchor the rail to its left edge. */
      React.useEffect(() => {
        const measure = () => {
          const el = document.querySelector("[data-conversation-scroll]");
          if (el === null) {
            setRailRect(null);
            return;
          }
          const r = el.getBoundingClientRect();
          setRailRect({
            left: r.left + RAIL_GUTTER_LEFT,
            top: r.top + RAIL_EDGE_INSET,
            height: Math.max(RAIL_MIN_HEIGHT, r.height - RAIL_EDGE_INSET * 2),
          });
        };
        measure();
        window.addEventListener("resize", measure);
        const el = document.querySelector("[data-conversation-scroll]");
        let ro = null;
        if (typeof ResizeObserver !== "undefined" && el !== null) {
          ro = new ResizeObserver(measure);
          ro.observe(el);
        }
        return () => {
          window.removeEventListener("resize", measure);
          if (ro !== null) ro.disconnect();
        };
      }, [sessionId]);

      /** 仅用右侧已加载节点跟踪阅读位置；未加载刻度不会参与 DOM 几何计算。 */
      React.useEffect(() => {
        if (displayMarks.length === 0) return;
        const messageToIndex = new Map(displayMarks.map((mark, index) => [mark.messageId, index]));
        const keyToIndex = new Map();
        for (const key of order || []) {
          const node = nodes && nodes.get(key);
          if (node === undefined || node.kind !== "user" || node.id === undefined) continue;
          const index = messageToIndex.get(String(node.id));
          if (index !== undefined) keyToIndex.set(key, index);
        }
        const sp = document.querySelector("[data-conversation-scroll]");
        if (sp === null) return;
        const update = () => {
          const rect = sp.getBoundingClientRect();
          if (rect.height === 0) return;
          const line = rect.top + rect.height * 0.4;
          const rows = sp.querySelectorAll("[data-chat-anchor-key]");
          let best = -1;
          let bestDist = Infinity;
          for (const row of rows) {
            const key = row.getAttribute("data-chat-anchor-key");
            if (key === null) continue;
            const idx = keyToIndex.get(key);
            if (idx === undefined) continue;
            const r = row.getBoundingClientRect();
            const dist = Math.abs(r.top + r.height / 2 - line);
            if (dist < bestDist) {
              bestDist = dist;
              best = idx;
            }
          }
          // 最新消息与 40% 命中消息同时可见时，优先高亮最新消息。
          const latestLoaded = loadedMarks[loadedMarks.length - 1];
          if (best >= 0 && latestLoaded !== undefined) {
            const lastKey = latestLoaded.key;
            for (const row of rows) {
              if (row.getAttribute("data-chat-anchor-key") !== lastKey) continue;
              const lr = row.getBoundingClientRect();
              if (lr.bottom > rect.top && lr.top < rect.bottom) {
                const latestIndex = messageToIndex.get(latestLoaded.messageId);
                if (latestIndex !== undefined) best = latestIndex;
              }
              break;
            }
          }
          if (best >= 0) {
            const nextMessageId = displayMarks[best].messageId;
            setReadingMessageId((current) => (current === nextMessageId ? current : nextMessageId));
          }
        };
        /** rAF-throttled scroll handler: geometry is recomputed at most once per frame. */
        let rafId = null;
        const onScroll = () => {
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            update();
          });
        };
        update();
        sp.addEventListener("scroll", onScroll, { passive: true });
        return () => {
          sp.removeEventListener("scroll", onScroll);
          if (rafId !== null) cancelAnimationFrame(rafId);
        };
      }, [displayMarks, loadedMarks, nodes, order, sessionId]);

      if (railRect === null) return null;

      /** Rail height: 50 ticks by default, capped by the scrollport when smaller.
       * Vertically centered inside the scrollport. */
      const railHeight = Math.min(RAIL_HEIGHT, railRect.height);

      /** 当前窗口或完整索引至少有两个用户消息时显示轨道。 */
      if (displayMarks.length < MIN_MARKS) return null;

      const railTop = railRect.top + Math.max(0, Math.floor((railRect.height - railHeight) / 2));
      const contentHeight = displayMarks.length * TICK_STEP;
      const padTop = Math.max(0, Math.floor((railHeight - contentHeight) / 2));

      /**
       * Edge fade via CSS mask: ticks at the top fade out while there is
       * more content above (scrollTop > 0), and ticks at the bottom fade out
       * while there is more content below. The mask is rebuilt per render.
       */
      const FADE_PX = 28;
      const maxScroll = contentHeight + padTop - railHeight;
      const maskImage =
        "linear-gradient(to bottom, " +
        (scrollTop > 0 ? "transparent, black " + FADE_PX + "px" : "black") +
        ", " +
        (scrollTop < maxScroll ? "black calc(100% - " + FADE_PX + "px), transparent" : "black") +
        ")";

      const previewing = hoverIndex !== null;

      /**
       * Virtual window: only render ticks inside the visible range plus a
       * buffer (and always the hovered/active one, when it still exists),
       * regardless of total history size.
       */
      let windowStart = Math.max(0, Math.floor(scrollTop / TICK_STEP) - SCROLL_BUFFER);
      let windowEnd = Math.min(displayMarks.length, Math.ceil((scrollTop + railHeight) / TICK_STEP) + SCROLL_BUFFER);
      if (hoverIndex !== null && hoverIndex < displayMarks.length) {
        windowStart = Math.min(windowStart, hoverIndex);
        windowEnd = Math.max(windowEnd, hoverIndex + 1);
      }
      if (activeIndex >= 0 && activeIndex < displayMarks.length) {
        windowStart = Math.min(windowStart, activeIndex);
        windowEnd = Math.max(windowEnd, activeIndex + 1);
      }

      /**
       * Preview only while the hovered tick is VISUALLY inside the rail: the
       * virtual window is expanded to always keep the hovered tick rendered
       * (for the ripple effect), so visibility must be judged against the
       * real viewport range. 完整索引一次性切换后，静止鼠标对应的刻度如果
       * 已离开窗口就隐藏预览，避免浮层错误贴到顶部。
       */
      const viewStart = Math.floor(scrollTop / TICK_STEP);
      const viewEnd = Math.ceil((scrollTop + railHeight) / TICK_STEP);
      const hoverInWindow =
        previewing && hoverIndex !== null && hoverIndex >= viewStart && hoverIndex < viewEnd;
      const hoveredMark =
        hoverInWindow && displayMarks[hoverIndex] !== undefined ? displayMarks[hoverIndex] : null;

      /** Preview card top: follow the hovered tick's center (rail-scrolled), clamped to the stage. */
      let previewTop = 0;
      if (hoveredMark !== null) {
        const index = hoverIndex;
        const tickCenter = padTop + TICK_STEP * (index + 0.5) - scrollTop;
        const desired = railTop + tickCenter - PREVIEW_HEIGHT / 2;
        previewTop = Math.max(8, Math.min(railTop + railHeight - PREVIEW_HEIGHT - 8, desired));
      }

      const previewText = hoveredMark === null ? "" : hoveredMark.text.slice(0, PREVIEW_LENGTH);
      const visibleTicks = [];
      for (let index = windowStart; index < windowEnd; index += 1) {
        visibleTicks.push({ index, mark: displayMarks[index] });
      }

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          {
            className: "dshmr-rail",
            "data-previewing": previewing ? "true" : undefined,
            style: {
              left: railRect.left,
              top: railTop,
              height: railHeight,
              overflowY: "auto",
              maskImage,
              WebkitMaskImage: maskImage,
            },
            "aria-label": "用户消息位置",
            ref: railRef,
            onScroll: (event) => {
              setScrollTop(event.currentTarget.scrollTop);
            },
          },
        React.createElement(
          "div",
          { style: { position: "relative", height: contentHeight + padTop } },
          visibleTicks.map(({ index, mark }) => {
            const distance = previewing ? Math.abs(index - hoverIndex) : -1;
            const width = previewing && distance < TICK_WIDTHS.length ? TICK_WIDTHS[distance] : 6;
            const isCurrent = index === activeIndex;
            const isHovered = index === hoverIndex;
            return React.createElement("button", {
              key: mark.messageId,
              type: "button",
              className: "dshmr-tick" + (isCurrent ? " dshmr-current" : "") + (isHovered ? " dshmr-hovered" : ""),
              style: {
                position: "absolute",
                top: padTop + index * TICK_STEP,
                "--dshmr-tick-width": width + "px",
              },
              "aria-label":
                "第 " +
                (index + 1) +
                " 条用户消息" +
                (isCurrent ? "，当前位置" : "") +
                (mark.text ? "：" + mark.text.slice(0, 30) : ""),
              onMouseEnter: () => setHoverIndex(index),
              onFocus: () => setHoverIndex(index),
              onMouseLeave: (event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHoverIndex(null);
              },
              onBlur: () => setHoverIndex(null),
              onClick: () => {
                if (jump !== undefined) jump(mark.messageId).catch(() => {});
              },
            });
            }),
          ),
        ),
        hoveredMark !== null &&
          React.createElement(
            "div",
            {
              className: "dshmr-preview",
              "data-visible": "true",
              style: { left: railRect.left + PREVIEW_LEFT_OFFSET, top: previewTop },
              "aria-hidden": "true",
            },
            React.createElement(
              "div",
              { className: "dshmr-preview-line" },
              "第 " + (hoverIndex + 1) + " 条 · " + fmtRelative(hoveredMark.time),
            ),
            Array.from({ length: PREVIEW_LINES }, (_, lineIndex) =>
              React.createElement(
                "div",
                { className: "dshmr-preview-line", key: lineIndex },
                previewText.slice(
                  lineIndex * PREVIEW_CHARS_PER_LINE,
                  (lineIndex + 1) * PREVIEW_CHARS_PER_LINE,
                ) || "",
              ),
            ),
          ),
      );
    }

    /** Services required by the client half. */
    const inject = ["slots", "sessions", "connection"];

    /** Mounts the rail overlay and the session-scoped rail. */
    function apply(ctx) {
      const connection = ctx.get("connection");
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "message-rail",
            order: 100,
            children: { "message-rail.rail": { kind: "single", scope: "session" } },
          },
          Overlay,
        ),
      );
      ctx.slots.inject("message-rail.rail", () =>
        ctx.slots.register(
          {
            name: "message-rail.rail",
            inject: (sessionId) => {
              const coordinator = createLoadCoordinator();
              return {
                jump: createJump(ctx.sessions, sessionId, coordinator),
                loadIndex: createHistoryIndex(connection, ctx.sessions, sessionId),
              };
            },
          },
          Rail,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
