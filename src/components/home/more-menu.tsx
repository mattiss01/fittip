"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "./more-menu.module.css";

/**
 * ⋯: a disclosure button and the list it shows. It is not an ARIA `menu`,
 * whose arrow-key contract a plain list of buttons would only half keep; a
 * disclosure promises exactly what this does. Escape and a tap elsewhere
 * close it.
 */
export function MoreMenu({
  label = "More actions",
  children,
}: {
  /** The button's name; it shows only ⋯. */
  label?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Opens upward when the list would run under the bottom navigation, which
  // the page cannot scroll it out from under (owner, 19 Oct 2026: Delete was
  // out of reach below a long session).
  const [upward, setUpward] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const buttonId = useId();
  // Choosing an item unmounts the list under the focus, so it goes back to
  // the button that opened it rather than falling to the page. Found by id
  // because this runs from an item's handler, handed down during render.
  const close = useCallback(() => {
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  }, [buttonId]);

  useLayoutEffect(() => {
    if (!open || button.current === null || list.current === null) return;
    const below =
      window.innerHeight - button.current.getBoundingClientRect().bottom;
    // The navigation's height and a margin.
    setUpward(below < list.current.offsetHeight + 96);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.menu} ref={root}>
      <button
        ref={button}
        id={buttonId}
        className={styles.more}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open ? (
        <ul
          className={styles.menuList}
          id={listId}
          ref={list}
          data-upward={upward || undefined}
        >
          {children(close)}
        </ul>
      ) : null}
    </div>
  );
}

export function MenuItem({
  onSelect,
  danger = false,
  disabled = false,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        className={styles.menuItem}
        data-danger={danger || undefined}
        type="button"
        onClick={onSelect}
        disabled={disabled}
      >
        {children}
      </button>
    </li>
  );
}

export function MenuLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <li>
      <Link className={styles.menuItem} href={href}>
        {children}
      </Link>
    </li>
  );
}
