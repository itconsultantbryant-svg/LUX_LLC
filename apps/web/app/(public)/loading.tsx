export default function PublicLoading() {
  return (
    <>
      <div className="navigation-progress" aria-hidden="true" />
      <div className="route-loading" role="status">
        <span className="eyebrow">LUX HealthPay</span>
        <p>Opening the next page…</p>
      </div>
    </>
  );
}
