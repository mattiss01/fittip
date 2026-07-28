export default function PlanLoading() {
  return (
    <main className="plan-shell" aria-busy="true">
      <div className="plan-loading" role="status">
        <p className="eyebrow">FitTip / plan</p>
        <h1>Opening your training ledger…</h1>
        <div className="loading-rule" />
        <div className="loading-rule short" />
      </div>
    </main>
  );
}
