import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";

type ScrollPosition = {
  previous: number;
  distance: number;
  direction: number;
  maxTop?: number;
};

export function useScrollHeader({
  headerRef,
  pinned,
  routeKey,
}: {
  headerRef: RefObject<HTMLElement | null>;
  pinned: boolean;
  routeKey: string;
}) {
  const [hidden, setHidden] = useState(false);
  const positions = useRef(new WeakMap<EventTarget, ScrollPosition>());
  const reveal = useCallback(() => setHidden(false), []);

  const update = useCallback(
    (source: EventTarget, top: number, maxTop?: number) => {
      const position = positions.current.get(source) ?? {
        previous: 0,
        distance: 0,
        direction: 0,
      };
      // Collapsing the header expands the panel viewport and clamps its bottom scroll offset.
      if (
        maxTop !== undefined &&
        position.maxTop !== undefined &&
        maxTop < position.maxTop &&
        position.previous >= maxTop &&
        Math.abs(top - maxTop) <= 1
      ) {
        positions.current.set(source, { ...position, previous: top, maxTop });
        return;
      }
      const delta = top - position.previous;
      const direction = Math.sign(delta);
      const distance =
        direction === position.direction
          ? position.distance + Math.abs(delta)
          : Math.abs(delta);
      positions.current.set(source, {
        previous: top,
        distance,
        direction,
        maxTop,
      });
      const header = headerRef.current;
      if (
        pinned ||
        header?.contains(document.activeElement) ||
        header?.querySelector('[aria-expanded="true"]')
      ) {
        setHidden(false);
        return;
      }
      if (top <= 8) {
        setHidden(false);
      } else if (delta !== 0 && distance >= 12) {
        setHidden(direction > 0);
      }
    },
    [headerRef, pinned],
  );

  useEffect(() => {
    positions.current = new WeakMap();
    setHidden(false);
  }, [routeKey]);

  useEffect(() => {
    if (pinned) setHidden(false);
  }, [pinned]);

  useEffect(() => {
    const onScroll = () => update(document, Math.max(0, window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [update]);

  const onScrollCapture = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.hasAttribute("data-header-scroll")
      )
        return;
      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
      update(target, Math.max(0, Math.min(target.scrollTop, maxTop)), maxTop);
    },
    [update],
  );

  return { hidden, onScrollCapture, reveal };
}
