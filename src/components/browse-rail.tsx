"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";

type BrowseItem = {
  href: string;
  label: string;
  current?: boolean;
  symbol?: string;
  shopIcon?: boolean;
};

// One accessible set of links, plus a pointer-accessible visual repeat. Native
// scrolling and normal links remain usable before hydration and without JS.
export function BrowseRail({
  items,
  label,
  kind = "categories",
  id,
}: {
  items: BrowseItem[];
  label: string;
  kind?: "categories" | "departments";
  id?: string;
}) {
  const generatedId = useId(),
    viewportId = id ?? `browse-${generatedId}`,
    viewport = useRef<HTMLElement>(null),
    firstGroup = useRef<HTMLDivElement>(null),
    repeatedGroup = useRef<HTMLDivElement>(null),
    cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [overflow, setOverflow] = useState(false),
    [paused, setPaused] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false),
    [onScreen, setOnScreen] = useState(false),
    [pageVisible, setPageVisible] = useState(true),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [dragging, setDragging] = useState(false),
    [coolingDown, setCoolingDown] = useState(false);

  useEffect(() => {
    const element = viewport.current,
      group = firstGroup.current;
    if (!element || !group) return;
    const measure = () => {
      const next = group.getBoundingClientRect().width > element.clientWidth + 1;
      setOverflow(next);
      if (!next) element.scrollLeft = 0;
    };
    const size = new ResizeObserver(measure);
    size.observe(element);
    size.observe(group);
    const visibility = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting));
    visibility.observe(element);
    const preference = matchMedia("(prefers-reduced-motion: reduce)"),
      motion = () => setReducedMotion(preference.matches),
      visible = () => setPageVisible(!document.hidden);
    preference.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visible);
    motion();
    visible();
    measure();
    return () => {
      size.disconnect();
      visibility.disconnect();
      preference.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visible);
      clearTimeout(cooldownTimer.current);
    };
  }, []);

  const playing =
    overflow &&
    !paused &&
    !reducedMotion &&
    onScreen &&
    pageVisible &&
    !hovered &&
    !focused &&
    !dragging &&
    !coolingDown;
  useEffect(() => {
    const element = viewport.current,
      first = firstGroup.current,
      repeat = repeatedGroup.current;
    if (!playing || !element || !first || !repeat) return;
    const distance = repeat.offsetLeft - first.offsetLeft;
    if (distance <= 0) return;
    let frame = 0,
      previous = performance.now(),
      position = element.scrollLeft % distance;
    const advance = (now: number) => {
      // Accumulate fractional pixels, and bound the delta after a busy frame.
      position = (position + Math.min(now - previous, 64) * 0.024) % distance;
      element.scrollLeft = position;
      previous = now;
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, items]);

  const manualScroll = () => {
    setCoolingDown(true);
    clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setCoolingDown(false), 6000);
  };
  const links = (repeat: boolean) =>
    items.map((item, index) => (
      <Link
        key={`${item.href}-${index}`}
        href={item.href}
        prefetch={false}
        aria-current={item.current ? "page" : undefined}
        {...(repeat ? { tabIndex: -1 } : {})}
      >
        {item.shopIcon ? (
          <Icon name="shop" />
        ) : item.symbol ? (
          <span className="browse-rail-symbol" aria-hidden="true">
            {item.symbol}
          </span>
        ) : null}
        {item.label}
      </Link>
    ));
  return (
    <div
      className={`browse-rail browse-rail--${kind}`}
      data-overflow={overflow}
      data-playing={playing}
    >
      <nav
        id={viewportId}
        ref={viewport}
        aria-label={label}
        className="browse-rail-viewport"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          if (dragging) {
            setDragging(false);
            manualScroll();
          }
        }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => {
          setDragging(false);
          manualScroll();
        }}
        onPointerCancel={() => {
          setDragging(false);
          manualScroll();
        }}
        onWheel={manualScroll}
      >
        <div className="browse-rail-track">
          <div ref={firstGroup} className="browse-rail-group">
            {links(false)}
          </div>
          <div
            ref={repeatedGroup}
            className="browse-rail-group browse-rail-repeat"
            aria-hidden="true"
          >
            {links(true)}
          </div>
        </div>
      </nav>
      {overflow && !reducedMotion ? (
        <button
          type="button"
          className="browse-rail-toggle"
          aria-label={paused ? "Resume automatic scrolling" : "Pause automatic scrolling"}
          aria-pressed={paused}
          aria-controls={viewportId}
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume automatic scrolling" : "Pause automatic scrolling"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d={paused ? "m9 5 11 7-11 7V5Z" : "M8 5v14M16 5v14"} />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
