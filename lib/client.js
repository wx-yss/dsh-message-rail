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
      ".dshmr-tick::before{content:'';position:absolute;left:12px;top:50%;transform:translateY(-50%);width:var(--dshmr-tick-width,6px);height:2px;border-radius:2px;background:var(--dshmr-tick-color,#c9c9c7);transition:width 160ms cubic-bezier(0.2,0.75,0.25,1),background-color 120ms ease,opacity 120ms ease}" +
      ".dshmr-rail .dshmr-tick.dshmr-current::before{--dshmr-tick-color:#171717}" +
      ".dshmr-rail[data-previewing='true'] .dshmr-tick.dshmr-current:not(.dshmr-hovered)::before{--dshmr-tick-color:#c9c9c7}" +
      ".dshmr-rail .dshmr-tick.dshmr-hovered::before{--dshmr-tick-color:#171717}" +
      ".dshmr-preview{position:fixed;z-index:61;width:min(390px,calc(100vw - 60px));box-sizing:border-box;padding:9px 10px 10px;border:1px solid #e3e3df;border-radius:13px;background:#ffffff;box-shadow:0 5px 16px rgba(0,0,0,0.12);opacity:0;transform:translateX(-5px) scale(0.985);transform-origin:left center;pointer-events:none;transition:opacity 110ms ease,transform 150ms cubic-bezier(0.2,0.75,0.25,1),top 130ms ease}" +
      ".dshmr-preview[data-visible='true']{opacity:1;transform:translateX(0) scale(1)}" +
      ".dshmr-preview-line{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#7d7d79;line-height:1.55;font-size:13px}" +
      ".dshmr-preview-line:first-child{color:#242424;font-weight:500;font-size:13px}" +
      "@media (prefers-color-scheme:dark){.dshmr-tick::before{--dshmr-tick-color:#676765}.dshmr-rail .dshmr-tick.dshmr-current::before{--dshmr-tick-color:#f2f2ef}.dshmr-rail[data-previewing='true'] .dshmr-tick.dshmr-current:not(.dshmr-hovered)::before{--dshmr-tick-color:#676765}.dshmr-rail .dshmr-tick.dshmr-hovered::before{--dshmr-tick-color:#f2f2ef}.dshmr-preview{border-color:#3c3c39;background:#171717;box-shadow:0 5px 16px rgba(0,0,0,0.42)}.dshmr-preview-line{color:#a1a19c}.dshmr-preview-line:first-child{color:#eeeeeb}}" +
      ".dshmr-preview-line:nth-child(n+2){-webkit-line-clamp:1}" +
      "[data-chat-anchor-key].dshmr-flash{outline:2px solid rgba(122,152,255,0.85);outline-offset:-2px;border-radius:8px}" +
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
    /** Extra ticks rendered above/below the visible window (scroll smoothness). */
    const SCROLL_BUFFER = 12;
    /** Default rail height: at most 50 visible ticks; fills the scrollport when smaller. */
    const RAIL_HEIGHT = 50 * TICK_STEP;

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

    /** Find a chat row by its node key. */
    function findRow(key) {
      for (const row of document.querySelectorAll("[data-chat-anchor-key]")) {
        if (row.dataset.chatAnchorKey === key) return row;
      }
      return null;
    }

    /**
     * Jump to the chat row of the given node key. When the node is not yet in
     * the loaded window, keep loading older pages until it appears (or there
     * is no more history). Once the data is present, the DOM row may lag the
     * snapshot commit (React commits asynchronously), so poll for it with a
     * bounded budget before scrolling.
     */
    function createJump(sessionsService, sessionId) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      return async (key) => {
        const binding = sessionsService.binding(sessionId);
        const session = binding === undefined ? undefined : binding.session;
        if (session === undefined) return false;
        let guard = 0;
        while (guard++ < 120) {
          const snapshot = session.getSnapshot();
          if (snapshot && snapshot.chat && snapshot.chat.nodes && snapshot.chat.nodes.get(key) !== undefined) break;
          if (snapshot === undefined || snapshot.hasMore !== true) return false;
          if (snapshot.loadingOlder === true) {
            await delay(50);
            continue;
          }
          try {
            await session.loadOlder();
          } catch (error) {
            await delay(200);
          }
        }
        let row = null;
        for (let attempt = 0; attempt < 20 && row === null; attempt += 1) {
          row = findRow(key);
          if (row === null) await delay(50);
        }
        if (row === null) return false;
        const reducedMotion =
          typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        row.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        row.classList.add("dshmr-flash");
        setTimeout(() => row.classList.remove("dshmr-flash"), 1400);
        return true;
      };
    }

    /**
     * Background full-history load: keep calling loadOlder until hasMore is
     * false, so the rail shows every user message of the session (the runtime
     * window only keeps the latest page around). Bounded by a page cap and a
     * disposed flag so a session switch never leaves a stale loader running.
     */
    const MAX_PAGES = 400;
    function createLoadAll(sessionsService, sessionId) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      return async (disposed) => {
        const binding = sessionsService.binding(sessionId);
        const session = binding === undefined ? undefined : binding.session;
        if (session === undefined) return;
        let guard = 0;
        while (guard++ < MAX_PAGES) {
          if (disposed()) return;
          const snapshot = session.getSnapshot();
          if (snapshot === undefined || snapshot.hasMore !== true) return;
          if (snapshot.loadingOlder === true) {
            await delay(50);
            continue;
          }
          try {
            await session.loadOlder();
          } catch (error) {
            await delay(200);
          }
        }
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
      const loadAll = props.loadAll;

      const order = useSession((s) => s.chat.order);
      const nodes = useSession((s) => s.chat.nodes);
      const hasMore = useSession((s) => s.hasMore);

      const [railRect, setRailRect] = React.useState(null);
      const [hoverIndex, setHoverIndex] = React.useState(null);
      const [activeIndex, setActiveIndex] = React.useState(-1);
      const [scrollTop, setScrollTop] = React.useState(0);
      const railRef = React.useRef(null);
      const programmaticScrollRef = React.useRef(false);
      const autoScrollRef = React.useRef(true);

      /** Ordered user-message marks (node.kind === 'user' only). */
      const marks = React.useMemo(() => {
        const result = [];
        for (const key of order || []) {
          const node = nodes && nodes.get(key);
          if (node === undefined || node.kind !== "user") continue;
          const data = node.data || {};
          result.push({
            key,
            time: typeof data.time === "number" ? data.time : 0,
            text: userTextOf(data.content),
          });
        }
        return result;
      }, [order, nodes]);

      /** Drop a stale hover index when marks shrink (resync/compaction). */
      React.useEffect(() => {
        if (hoverIndex !== null && hoverIndex >= marks.length) setHoverIndex(null);
      }, [marks.length, hoverIndex]);

      /** Kick off the background full-history load once per session.
       * Re-trigger whenever hasMore flips (the session snapshot may arrive
       * after the rail mounts, so the first run can no-op on hasMore=false);
       * an in-flight loader is never duplicated, and a stale loader is
       * cancelled when the rail unmounts or the session switches. */
      const loadAllInFlightRef = React.useRef(null);
      const loadAllDisposedRef = React.useRef(false);
      React.useEffect(() => {
        loadAllDisposedRef.current = false;
        if (loadAll === undefined) return;
        if (loadAllInFlightRef.current !== null) return;
        loadAllInFlightRef.current = loadAll(() => loadAllDisposedRef.current).finally(() => {
          loadAllInFlightRef.current = null;
        });
        return () => {
          loadAllDisposedRef.current = true;
        };
      }, [sessionId, hasMore, loadAll]);

      /**
       * Keep the rail pinned to the newest ticks while history loads in, until
       * the user scrolls the rail manually. The programmatic flag is cleared
       * shortly after assignment so a scrollTop that never fired a scroll
       * event (already at max) cannot misclassify the user's next scroll.
       */
      React.useEffect(() => {
        const el = railRef.current;
        if (el !== null && autoScrollRef.current) {
          programmaticScrollRef.current = true;
          el.scrollTop = el.scrollHeight;
          const timer = setTimeout(() => {
            programmaticScrollRef.current = false;
          }, 100);
          return () => clearTimeout(timer);
        }
      }, [marks.length]);

      /** Measure the conversation scrollport and anchor the rail to its left edge. */
      React.useEffect(() => {
        const measure = () => {
          const el = document.querySelector("[data-conversation-scroll]");
          if (el === null) {
            setRailRect(null);
            return;
          }
          const r = el.getBoundingClientRect();
          setRailRect({ left: r.left + 8, top: r.top + 14, height: Math.max(120, r.height - 28) });
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

      /** Track the user message nearest the 40% line of the scrollport. */
      React.useEffect(() => {
        if (marks.length === 0) return;
        const keyToIndex = new Map(marks.map((m, i) => [m.key, i]));
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
          setActiveIndex(best);
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
      }, [marks, sessionId]);

      if (railRect === null) return null;

      /** Rail height: 50 ticks by default, capped by the scrollport when smaller.
       * Vertically centered inside the scrollport. */
      const railHeight = Math.min(RAIL_HEIGHT, railRect.height);

      /**
       * Render gate: the rail appears only once it is worth looking at —
       * either the loaded marks already fill the visible capacity, or the
       * whole history is in (hasMore=false). While history streams in below
       * the capacity, nothing renders (no half-grown rail).
       */
      const visibleLimit = Math.floor(railHeight / TICK_STEP);
      const readyToRender =
        marks.length >= visibleLimit || (hasMore === false && marks.length >= MIN_MARKS);
      if (!readyToRender) return null;

      const railTop = railRect.top + Math.max(0, Math.floor((railRect.height - railHeight) / 2));
      const contentHeight = marks.length * TICK_STEP;
      const padTop = Math.max(0, Math.floor((railHeight - contentHeight) / 2));

      const previewing = hoverIndex !== null;
      const hoveredMark =
        previewing && hoverIndex !== null && marks[hoverIndex] !== undefined ? marks[hoverIndex] : null;

      /** Preview card top: follow the hovered tick's center (rail-scrolled), clamped to the stage. */
      let previewTop = 0;
      if (hoveredMark !== null) {
        const index = hoverIndex;
        const tickCenter = padTop + TICK_STEP * (index + 0.5) - scrollTop;
        const desired = railTop + tickCenter - PREVIEW_HEIGHT / 2;
        previewTop = Math.max(8, Math.min(railTop + railHeight - PREVIEW_HEIGHT - 8, desired));
      }

      const previewText = hoveredMark === null ? "" : hoveredMark.text.slice(0, PREVIEW_LENGTH);

      /**
       * Virtual window: only render ticks inside the visible range plus a
       * buffer (and always the hovered one, when it still exists), regardless
       * of total history size.
       */
      let windowStart = Math.max(0, Math.floor(scrollTop / TICK_STEP) - SCROLL_BUFFER);
      let windowEnd = Math.min(marks.length, Math.ceil((scrollTop + railHeight) / TICK_STEP) + SCROLL_BUFFER);
      if (hoverIndex !== null && hoverIndex < marks.length) {
        windowStart = Math.min(windowStart, hoverIndex);
        windowEnd = Math.max(windowEnd, hoverIndex + 1);
      }
      const visibleTicks = [];
      for (let index = windowStart; index < windowEnd; index += 1) {
        visibleTicks.push({ index, mark: marks[index] });
      }

      return React.createElement(
        "div",
        {
          className: "dshmr-rail",
          "data-previewing": previewing ? "true" : undefined,
          style: { left: railRect.left, top: railTop, height: railHeight, overflowY: "auto" },
          role: "list",
          "aria-label": "用户消息位置",
          ref: railRef,
          onScroll: (event) => {
            if (programmaticScrollRef.current) {
              programmaticScrollRef.current = false;
            } else {
              autoScrollRef.current = false;
            }
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
              key: mark.key,
              type: "button",
              className: "dshmr-tick" + (isCurrent ? " dshmr-current" : "") + (isHovered ? " dshmr-hovered" : ""),
              style: {
                position: "absolute",
                top: padTop + index * TICK_STEP,
                "--dshmr-tick-width": width + "px",
              },
              "aria-label": "第 " + (index + 1) + " 条用户消息" + (isCurrent ? "，当前位置" : ""),
              onMouseEnter: () => setHoverIndex(index),
              onFocus: () => setHoverIndex(index),
              onMouseLeave: (event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHoverIndex(null);
              },
              onBlur: () => setHoverIndex(null),
              onClick: () => {
                if (jump !== undefined) jump(mark.key);
              },
            });
          }),
        ),
        hoveredMark !== null &&
          React.createElement(
            "div",
            {
              className: "dshmr-preview",
              "data-visible": "true",
              style: { left: railRect.left + 48, top: previewTop },
              role: "tooltip",
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
                previewText.slice(lineIndex * 27, (lineIndex + 1) * 27) || "",
              ),
            ),
          ),
      );
    }

    /** Services required by the client half. */
    const inject = ["slots", "sessions"];

    /** Mounts the rail overlay and the session-scoped rail. */
    function apply(ctx) {
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
            inject: (sessionId) => ({
              jump: createJump(ctx.sessions, sessionId),
              loadAll: createLoadAll(ctx.sessions, sessionId),
            }),
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
