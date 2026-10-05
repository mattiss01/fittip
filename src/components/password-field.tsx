"use client";

import { useState } from "react";

/**
 * A password field that shows what is typed on request (owner, 5 Oct 2026).
 * It is a client component for the one reason that it holds that switch; the
 * form around it is still posted by the browser to a route handler.
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
          {shown ? "Hide" : "Show"}
        </button>
      </div>
    </>
  );
}
