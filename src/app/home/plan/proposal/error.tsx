"use client";

export default function PlanProposalError({ reset }: { reset: () => void }) {
  return (
    <main id="main-content">
      <h1>The proposal could not be loaded.</h1>
      <p>Nothing was accepted or changed.</p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
