import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="container section">
      <span className="eyebrow">LUX HealthPay</span>
      <h1>That page isn’t here.</h1>
      <p>Return to the public website or your organization workspace.</p>
      <div className="button-row">
        <Link className="button" href="/">
          Go home
        </Link>
        <Link className="text-link" href="/app">
          Open workspace
        </Link>
      </div>
    </main>
  );
}
