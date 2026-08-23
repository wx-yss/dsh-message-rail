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
      ".dshmr-tick{position:relative;display:block;width:42px;height:10px;flex:none;padding:0;border:0;background:transparent;cursor:pointer;pointer-events:auto}" +
      ".dshmr-tick::before{content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);width:var(--dshmr-tick-width,6px);height:2px;border-radius:2px;background:var(--dshmr-tick-color,color-mix(in srgb,var(--dsw-alias-border-l2) 94%,var(--dsw-alias-label-primary) 6%));transition:width 160ms cubic-bezier(0.2,0.75,0.25,1)}" +
      ".dshmr-rail .dshmr-tick.dshmr-current::before{--dshmr-tick-color:var(--dsw-alias-label-primary)}" +
      ".dshmr-rail[data-previewing='true'] .dshmr-tick.dshmr-current:not(.dshmr-hovered)::before{--dshmr-tick-color:var(--dsw-alias-border-l2)}" +
      ".dshmr-rail .dshmr-tick.dshmr-hovered::before{--dshmr-tick-color:var(--dsw-alias-label-primary)}" +
      ".dshmr-tick:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:2px}" +
      ".dshmr-preview{position:fixed;z-index:61;width:min(390px,calc(100vw - 60px));box-sizing:border-box;padding:9px 10px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 3px 10px rgba(0,0,0,0.16);opacity:0;transform:translateX(-5px) scale(0.985);transform-origin:left center;pointer-events:none;transition:opacity 110ms ease,transform 150ms cubic-bezier(0.2,0.75,0.25,1),top 130ms ease}" +
      ".dshmr-preview[data-visible='true']{opacity:1;transform:translateX(0) scale(1)}" +
      ".dshmr-preview-line{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);line-height:1.55;font-size:13px}" +
      ".dshmr-preview-line:first-child{color:var(--dsw-alias-label-primary);font-weight:500;font-size:13px}" +
      ".dshmr-loading{position:fixed;z-index:62;box-sizing:border-box;width:min(330px,calc(100vw - 80px));padding:12px 14px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 82%,var(--dsw-alias-brand-primary) 18%);border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 94%,transparent);box-shadow:0 9px 28px rgba(0,0,0,.22);backdrop-filter:blur(12px);pointer-events:none;animation:dshmr-notice-in 160ms cubic-bezier(.2,.75,.25,1)}" +
      ".dshmr-loading-head{display:flex;align-items:center;gap:9px;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}" +
      ".dshmr-loading-spinner{width:14px;height:14px;flex:none;box-sizing:border-box;border:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 24%,transparent);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dshmr-spin .8s linear infinite}" +
      ".dshmr-loading-detail{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}" +
      ".dshmr-loading-track{height:3px;margin-top:9px;overflow:hidden;border-radius:3px;background:var(--dsw-alias-border-l2)}" +
      ".dshmr-loading-progress{height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary);transition:width 180ms ease}" +
      ".dshmr-flash{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 85%,transparent);outline-offset:-2px}" +
      "[data-chat-anchor-key].dshmr-flash{border-radius:8px}" +
      "@keyframes dshmr-spin{to{transform:rotate(360deg)}}" +
      "@keyframes dshmr-notice-in{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}" +
      "@media (prefers-reduced-motion:reduce){.dshmr-tick::before,.dshmr-preview,.dshmr-loading-progress{transition:none}.dshmr-loading,.dshmr-loading-spinner{animation:none}}";

    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-message-rail"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-message-rail";
      tag.dataset.pluginCss = "dsh-message-rail";
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    const MIN_MARKS = 2;
    const PREVIEW_LENGTH = 80;
    const PREVIEW_HEIGHT = 112;
    const PREVIEW_LINES = 3;
    /** 固定刻度中心距，与 Codex 消息轨道一致。 */
    const TICK_STEP = 10;
    /** Codex 悬停刻度宽度：中心向外递减，最后一级也是默认宽度。 */
    const TICK_WIDTHS = [26, 20, 14, 10, 6];
    /** Snap-back trigger: snap when the black tick reaches the 3rd tick from an edge. */
    const EDGE_MARGIN = TICK_STEP * 3;
    /** Minimum visible tick count for snap-back to make sense; below it, edge-follow only. */
    const SNAP_MIN_VISIBLE = 12;
    /** Extra ticks rendered above/below the visible window (scroll smoothness). */
    const SCROLL_BUFFER = 12;
    /** Default rail height: at most 50 visible ticks; fills the scrollport when smaller. */
    const RAIL_HEIGHT = 50 * TICK_STEP;
    /** 首尾存在更多刻度时，使用与 Codex 一致的 40px 渐隐范围。 */
    const RAIL_FADE_PX = 40;
    /** Rail gutters relative to the scrollport (left inset, top/bottom inset, min height). */
    const RAIL_GUTTER_LEFT = 8;
    const RAIL_EDGE_INSET = 14;
    const RAIL_MIN_HEIGHT = 120;
    /** Preview card offset right of the rail. */
    const PREVIEW_LEFT_OFFSET = 48;
    /** Preview text characters per line (PREVIEW_LENGTH split across PREVIEW_LINES). */
    const PREVIEW_CHARS_PER_LINE = Math.ceil(PREVIEW_LENGTH / PREVIEW_LINES);
    /** Target-message flash duration (ms). */
    const FLASH_MS = 800;
    /** 超高消息顶部留白，以及瞬时定位的像素容差。 */
    const JUMP_VIEW_INSET = 20;
    const JUMP_POSITION_EPSILON = 2;
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
    /** 历史加载提示阈值及耗时预估；不计入后续目标定位时间。 */
    const NOTICE_DELAY_MS = 1000;
    const NOTICE_TICK_MS = 250;
    const ETA_RENDER_MS = 200;
    const ETA_PAGE_MS = 450;

    function tickWidthAtDistance(distance) {
      if (distance < 0) return TICK_WIDTHS.at(-1);
      return TICK_WIDTHS[Math.min(distance, TICK_WIDTHS.length - 1)];
    }

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

    /** 用户消息的内容栈与操作区并列，优先高亮内容栈内最后一个气泡。 */
    function flashTargetOf(row) {
      const hoverRoot = row.querySelector("[data-time-hover-root]");
      const contentStack = hoverRoot === null ? null : hoverRoot.firstElementChild;
      if (contentStack === null) return row;
      return contentStack.lastElementChild || contentStack;
    }

    /** 从当前右侧窗口查找指定用户消息。 */
    function findUserNode(snapshot, messageId) {
      const chat = snapshot && snapshot.chat;
      if (chat === undefined || chat.nodes === undefined) return null;
      for (const key of chat.order || []) {
        const node = chat.nodes.get(key);
        if (node !== undefined && (node.kind === "user" || node.kind === "steering") && String(node.id) === messageId) return node;
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
        cancelJump: () => {
          activeJump = 0;
        },
        endJump: (token) => {
          if (activeJump === token) activeJump = 0;
        },
      };
    }

    /**
     * 跳转到指定用户消息。目标不在右侧窗口时才逐页 loadOlder；每页前插
     * 都恢复原阅读锚点，找到目标后停止分页并瞬时定位。
     */
    function createJump(sessionsService, sessionId, coordinator) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const nextFrame = () =>
        new Promise((resolve) => {
          if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
          else setTimeout(resolve, 16);
        });
      let flashedElement = null;
      let flashTimer = null;
      const clearFlash = () => {
        if (flashTimer !== null) clearTimeout(flashTimer);
        if (flashedElement !== null) flashedElement.classList.remove("dshmr-flash");
        flashTimer = null;
        flashedElement = null;
      };
      const flash = (row) => {
        clearFlash();
        flashedElement = flashTargetOf(row);
        flashedElement.classList.add("dshmr-flash");
        flashTimer = setTimeout(clearFlash, FLASH_MS);
      };
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
      return async (messageId, onProgress) => {
        const binding = sessionsService.binding(sessionId);
        const session = binding === undefined ? undefined : binding.session;
        if (session === undefined) return false;
        clearFlash();
        const report = (progress) => {
          if (typeof onProgress !== "function") return;
          try {
            onProgress(progress);
          } catch (error) {
            console.warn("[dsh-message-rail] 加载进度回调失败", error);
          }
        };
        const jumpToken = coordinator.beginJump();
        try {
          let loadedPages = 0;
          report({ phase: "loading", loadedPages });
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
              loadedPages += 1;
              report({
                phase: "loading",
                loadedPages,
              });
            }
          }
          if (targetNode === null) return false;
          const key = targetNode.key;
          let row = loadedPages === 0 ? findRow(key) : null;
          if (row === null) await waitForDomStable();
          for (let attempt = 0; attempt < DOM_POLL_ATTEMPTS && row === null; attempt += 1) {
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            row = findRow(key);
            if (row === null) await delay(DOM_POLL_DELAY);
          }
          if (row === null) return false;
          const sp = row.closest("[data-conversation-scroll]");
          report({ phase: "scrolling", loadedPages });
          // 让加载提示先完成一次 React 提交，再执行瞬时定位。
          await nextFrame();
          if (!coordinator.isCurrentJump(jumpToken)) return false;
          if (sp === null) {
            // 宿主 DOM 契约变化时退回浏览器原生跳转。
            row.scrollIntoView({ behavior: "instant", block: "center" });
            flash(row);
            return true;
          }
          /** 普通消息居中；超出视口的消息顶部留白。 */
          const positionTarget = () => {
            const spRect = sp.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            const offset =
              r.height > sp.clientHeight - JUMP_VIEW_INSET * 2
                ? JUMP_VIEW_INSET
                : (sp.clientHeight - r.height) / 2;
            const desired = sp.scrollTop + (r.top - spRect.top) - offset;
            return Math.max(0, Math.min(sp.scrollHeight - sp.clientHeight, desired));
          };
          const rowIsVisible = () => {
            const spRect = sp.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            return r.bottom > spRect.top && r.top < spRect.bottom;
          };

          if (!rowIsVisible()) {
            let target = positionTarget();
            sp.scrollTop = target;
            await nextFrame();
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            target = positionTarget();
            if (Math.abs(sp.scrollTop - target) > JUMP_POSITION_EPSILON) sp.scrollTop = target;
            await nextFrame();
            if (!coordinator.isCurrentJump(jumpToken)) return false;
            target = positionTarget();
            if (Math.abs(sp.scrollTop - target) > JUMP_POSITION_EPSILON) sp.scrollTop = target;
            if (!rowIsVisible()) {
              console.warn("[dsh-message-rail] 瞬时定位被宿主滚动状态覆盖", {
                key,
                scrollTop: sp.scrollTop,
                target,
              });
              return false;
            }
          }
          flash(row);
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
                historyPage: pages,
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

        const marks = [];
        const records = [...recordsBySeq.values()].sort((left, right) => left.seq - right.seq);
        for (const record of records) {
          if (record.kind === "user") marks.push(record);
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
      const cancelJump = props.cancelJump;
      const loadIndex = props.loadIndex;

      const order = useSession((s) => (s && s.chat ? s.chat.order : undefined));
      const nodes = useSession((s) => (s && s.chat ? s.chat.nodes : undefined));

      const [railRect, setRailRect] = React.useState(null);
      const [hoverIndex, setHoverIndex] = React.useState(null);
      const [scrollTop, setScrollTop] = React.useState(0);
      const [indexedMarks, setIndexedMarks] = React.useState(null);
      const [jumpNotice, setJumpNotice] = React.useState(null);
      const [noticeClock, setNoticeClock] = React.useState(0);
      const railRef = React.useRef(null);
      const jumpRequestRef = React.useRef(0);

      /** 当前右侧窗口中已经加载并可直接跳转的用户消息。 */
      const loadedMarks = React.useMemo(() => {
        const result = [];
        for (const key of order || []) {
          const node = nodes && nodes.get(key);
          if (node === undefined || (node.kind !== "user" && node.kind !== "steering") || node.id === undefined) continue;
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

      /** 当前右侧窗口已经覆盖到的最早 history 分页层级，用于估算剩余页数。 */
      const loadedHistoryPage = React.useMemo(() => {
        if (indexedMarks === null) return 0;
        const pages = new Map(indexedMarks.map((mark) => [mark.messageId, mark.historyPage]));
        let deepest = 0;
        for (const mark of loadedMarks) {
          const page = pages.get(mark.messageId);
          if (typeof page === "number" && page > deepest) deepest = page;
        }
        return deepest;
      }, [indexedMarks, loadedMarks]);

      /** 提示显示后按固定频率刷新倒计时；组件卸载会使未完成跳转失效。 */
      React.useEffect(() => {
        if (jumpNotice === null) return;
        setNoticeClock(Date.now());
        const timer = setInterval(() => setNoticeClock(Date.now()), NOTICE_TICK_MS);
        return () => clearInterval(timer);
      }, [jumpNotice === null]);
      React.useEffect(() => {
        return () => {
          jumpRequestRef.current += 1;
          cancelJump();
        };
      }, [cancelJump]);

      /** 提示只覆盖历史分页和目标 DOM 准备；目标组件就绪后立即结束。 */
      const runJump = (mark) => {
        if (jump === undefined) return;
        const requestId = jumpRequestRef.current + 1;
        jumpRequestRef.current = requestId;
        setJumpNotice(null);
        const loaded = loadedMarks.some((item) => item.messageId === mark.messageId);
        if (loaded) {
          // 已在右侧窗口中的消息只需滚动，不启动历史加载提示。
          jump(mark.messageId).catch(() => {});
          return;
        }
        const targetPage = typeof mark.historyPage === "number" ? mark.historyPage : loadedHistoryPage;
        const estimatedPages = Math.max(1, targetPage - loadedHistoryPage);
        const estimatedTotalMs = ETA_RENDER_MS + estimatedPages * ETA_PAGE_MS;
        const startedAt = Date.now();
        let visible = false;
        let latest = {
          phase: "loading",
          loadedPages: 0,
        };
        const publish = () => {
          if (jumpRequestRef.current !== requestId) return;
          setJumpNotice({
            requestId,
            startedAt,
            estimatedPages,
            ...latest,
          });
        };
        const show = () => {
          if (jumpRequestRef.current !== requestId || latest.phase !== "loading") return;
          visible = true;
          publish();
        };
        let showTimer = null;
        const startJump = () => {
          if (jumpRequestRef.current !== requestId) return;
          jump(mark.messageId, (progress) => {
            latest = { ...latest, ...progress };
            if (latest.phase === "scrolling") {
              if (showTimer !== null) clearTimeout(showTimer);
              if (jumpRequestRef.current === requestId) setJumpNotice(null);
              return;
            }
            if (visible) publish();
          })
            .catch(() => {})
            .finally(() => {
              if (showTimer !== null) clearTimeout(showTimer);
              if (jumpRequestRef.current === requestId) setJumpNotice(null);
            });
        };
        if (estimatedTotalMs > NOTICE_DELAY_MS) {
          show();
          // 先让 React 提交提示，再开始可能长时间占用主线程的宿主分页。
          if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(startJump);
          else setTimeout(startJump, 0);
        } else {
          // 预估较快时先不打扰；实际超过一秒目标仍未就绪则补充提示。
          showTimer = setTimeout(show, NOTICE_DELAY_MS);
          startJump();
        }
      };

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

      /**
       * 仅在可见的对话消息流中测量轨道。插件页面会保留会话 DOM，但把它隐藏为
       * 0×0；不能只按 data-chat-flow 是否存在判断，否则 fixed 轨道会落到左上角。
       */
      React.useEffect(() => {
        const el = document.querySelector("[data-conversation-scroll]");
        let chatViewActive = null;
        const hideRail = () => {
          if (chatViewActive === false) return;
          chatViewActive = false;
          jumpRequestRef.current += 1;
          cancelJump();
          setHoverIndex(null);
          setJumpNotice(null);
          setRailRect(null);
        };
        const measure = () => {
          const chatFlow = el === null ? null : el.querySelector("[data-chat-flow]");
          if (el === null || !el.isConnected || chatFlow === null) {
            hideRail();
            return;
          }
          const r = el.getBoundingClientRect();
          const flowRect = chatFlow.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || flowRect.width <= 0 || flowRect.height <= 0) {
            hideRail();
            return;
          }
          chatViewActive = true;
          const next = {
            left: r.left + RAIL_GUTTER_LEFT,
            top: r.top + RAIL_EDGE_INSET,
            height: Math.max(RAIL_MIN_HEIGHT, r.height - RAIL_EDGE_INSET * 2),
          };
          setRailRect((current) =>
            current !== null &&
            current.left === next.left &&
            current.top === next.top &&
            current.height === next.height
              ? current
              : next,
          );
        };
        const syncView = () => {
          measure();
        };
        syncView();
        window.addEventListener("resize", measure);
        let ro = null;
        let mo = null;
        const viewHost = el === null ? null : el.querySelector('[data-slot="conversation.view"]');
        if (typeof ResizeObserver !== "undefined" && el !== null) {
          ro = new ResizeObserver(measure);
          ro.observe(el);
        }
        if (typeof MutationObserver !== "undefined" && el !== null) {
          mo = new MutationObserver(syncView);
          // 视图容器只在“对话/轨迹”切换时替换直接子节点，避免监听流式消息的高频 DOM 变化。
          if (viewHost !== null) mo.observe(viewHost, { childList: true });
          else mo.observe(el, { childList: true, subtree: true });
        }
        return () => {
          window.removeEventListener("resize", measure);
          if (ro !== null) ro.disconnect();
          if (mo !== null) mo.disconnect();
        };
      }, [sessionId, cancelJump]);

      /** 仅用右侧已加载节点跟踪阅读位置；未加载刻度不会参与 DOM 几何计算。 */
      React.useEffect(() => {
        if (displayMarks.length === 0) return;
        const messageToIndex = new Map(displayMarks.map((mark, index) => [mark.messageId, index]));
        const keyToIndex = new Map();
        for (const key of order || []) {
          const node = nodes && nodes.get(key);
          if (
            node === undefined ||
            (node.kind !== "user" && node.kind !== "steering") ||
            node.id === undefined
          )
            continue;
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
          // 正文已经抵达可滚动区域顶部时，40% 阅读线仍可能命中第 2、3 条消息。
          // 此时强制选中当前已加载的第一条，确保轨道窗口能真正回到顶部。
          const maxScrollTop = Math.max(0, sp.scrollHeight - sp.clientHeight);
          if (maxScrollTop > JUMP_POSITION_EPSILON && sp.scrollTop <= JUMP_POSITION_EPSILON) {
            const earliestLoaded = loadedMarks[0];
            const earliestIndex = earliestLoaded === undefined
              ? undefined
              : messageToIndex.get(earliestLoaded.messageId);
            if (earliestIndex !== undefined) best = earliestIndex;
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
      const maxScroll = contentHeight + padTop - railHeight;
      const maskImage =
        "linear-gradient(to bottom, " +
        (scrollTop > 0 ? "transparent, black " + RAIL_FADE_PX + "px" : "black") +
        ", " +
        (scrollTop < maxScroll ? "black calc(100% - " + RAIL_FADE_PX + "px), transparent" : "black") +
        ")";

      const previewing = hoverIndex !== null;

      /**
       * Virtual window: only render ticks inside the visible range plus a
       * buffer (and always the hovered/active one, when it still exists),
       * regardless of total history size.
       */
      const windowStart = Math.max(0, Math.floor(scrollTop / TICK_STEP) - SCROLL_BUFFER);
      const windowEnd = Math.min(displayMarks.length, Math.ceil((scrollTop + railHeight) / TICK_STEP) + SCROLL_BUFFER);

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
      const visibleIndexes = new Set();
      for (let index = windowStart; index < windowEnd; index += 1) {
        visibleIndexes.add(index);
      }
      // 高亮和悬停刻度单独钉住，不能把它们与可见窗口之间的全部刻度一并渲染。
      if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayMarks.length) visibleIndexes.add(hoverIndex);
      if (activeIndex >= 0 && activeIndex < displayMarks.length) visibleIndexes.add(activeIndex);
      const visibleTicks = [...visibleIndexes]
        .sort((left, right) => left - right)
        .map((index) => ({ index, mark: displayMarks[index] }));

      let noticeDetail = "";
      let noticeProgress = 0;
      if (jumpNotice !== null) {
        const estimatedPages = Math.max(0, jumpNotice.estimatedPages || 0);
        const loadedPages = Math.max(0, jumpNotice.loadedPages || 0);
        const elapsedMs = Math.max(0, (noticeClock || Date.now()) - jumpNotice.startedAt);
        const estimatedTotalMs = ETA_RENDER_MS + estimatedPages * ETA_PAGE_MS;
        const remainingSeconds = Math.max(1, Math.round((estimatedTotalMs - elapsedMs) / 1000));
        if (estimatedPages > 0) {
          const currentPage = Math.min(estimatedPages, loadedPages + 1);
          noticeDetail =
            "正在加载第 " +
            currentPage +
            "/" +
            estimatedPages +
            " 页 · 预计还需约 " +
            remainingSeconds +
            " 秒";
          noticeProgress = Math.min(84, Math.max(8, Math.round((loadedPages / estimatedPages) * 84)));
        } else {
          noticeDetail = "正在准备目标消息 · 预计还需约 " + remainingSeconds + " 秒";
          noticeProgress = 18;
        }
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
            const width = tickWidthAtDistance(distance);
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
                runJump(mark);
              },
            });
            }),
          ),
        ),
        jumpNotice !== null &&
          React.createElement(
            "div",
            {
              className: "dshmr-loading",
              style: { left: railRect.left + PREVIEW_LEFT_OFFSET, top: railRect.top + 12 },
              role: "status",
              "aria-live": "polite",
            },
            React.createElement(
              "div",
              { className: "dshmr-loading-head" },
              React.createElement("span", { className: "dshmr-loading-spinner", "aria-hidden": "true" }),
              React.createElement("span", null, "正在加载历史消息"),
            ),
            React.createElement("div", { className: "dshmr-loading-detail" }, noticeDetail),
            React.createElement(
              "div",
              { className: "dshmr-loading-track", "aria-hidden": "true" },
              React.createElement("div", {
                className: "dshmr-loading-progress",
                style: { width: noticeProgress + "%" },
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
                cancelJump: coordinator.cancelJump,
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
