import Link from "next/link";

export default function FlightCheckoutIndexPage() {
  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="status-card">
            Continue flight checkout from the traveller step.
            <div className="payload-actions">
              <Link className="search-button" href="/checkout/flight/travellers">
                Open traveller details
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
