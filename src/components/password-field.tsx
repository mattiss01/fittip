"use client";

import { useState } from "react";

/**
 * A password field that shows what is typed on request, by the eye at its
 * right edge (owner, 5 Oct 2026). It is a client component for the one reason
 * that it holds that switch; the form around it is still posted by the
 * browser to a route handler.
 */
export function PasswordField({
  id,
  label,
  name,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          autoComplete={autoComplete}
          id={id}
          minLength={minLength}
          name={name}
          required
          type={shown ? "text" : "password"}
        />
        <button
          aria-controls={id}
          aria-label={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="password-reveal"
          onClick={() => setShown((current) => !current)}
          type="button"
        >
          <EyeIcon crossed={shown} />
        </button>
      </div>
    </>
  );
}

/** An open eye shows; the same eye struck through hides again. */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="22"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}
