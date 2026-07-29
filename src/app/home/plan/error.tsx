"use client";

export default function PlanError({ reset }: { reset: () => void }) {
  return (
    <main className="plan-shell">
      <section className="plan-error-card" role="alert">
        <p className="eyebrow">FitTip / plan</p>
        <h1>Your plan stayed untouched.</h1>
        <p>
          We could not load the current version. Nothing was changed or
          accepted.
        </p>
        <button onClick={reset} type="button">
          Try loading again
        </button>
      </section>
    </main>
  );
}
