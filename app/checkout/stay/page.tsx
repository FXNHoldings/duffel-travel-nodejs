"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StoredStaySelection = {
  result?: {
    id?: string;
    cheapest_rate_total_amount?: string;
    cheapest_rate_currency?: string;
    accommodation?: {
      name?: string;
      rating?: number | string | null;
      location?: {
        address?: { city_name?: string; country_code?: string };
      };
    };
  };
};

const STORAGE_KEY = "selected-stay-result";

export default function StayCheckoutPage() {
  const [selection, setSelection] = useState<StoredStaySelection | null>(null);

  useEffect(() => {
    const rawValue = sessionStorage.getItem(STORAGE_KEY);

    if (rawValue) {
      setSelection(JSON.parse(rawValue) as StoredStaySelection);
    }
  }, []);

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Stay checkout</p>
              <h1>Guest details</h1>
            </div>
            <Link className="back-link" href="/stays">
              Back to results
            </Link>
          </div>

          {!selection?.result ? (
            <div className="status-card">No stay selected yet. Go back to the results page and choose a hotel.</div>
          ) : (
            <div className="checkout-grid">
              <article className="selection-card">
                <h2>{selection.result.accommodation?.name ?? "Accommodation"}</h2>
                <p className="muted">
                  {selection.result.accommodation?.location?.address?.city_name ?? "Location"}
                  {selection.result.accommodation?.location?.address?.country_code
                    ? ` | ${selection.result.accommodation.location.address.country_code}`
                    : ""}
                  {selection.result.accommodation?.rating ? ` | ${selection.result.accommodation.rating} stars` : ""}
                </p>
                <div className="price">
                  {selection.result.cheapest_rate_currency} {selection.result.cheapest_rate_total_amount}
                </div>
                <p className="code">{selection.result.id}</p>
              </article>

              <form className="checkout-form">
                <h2>Primary guest</h2>
                <div className="form-two-col">
                  <Field label="First name" />
                  <Field label="Last name" />
                  <Field label="Email" type="email" />
                  <Field label="Phone" />
                </div>
                <div className="checkout-note">
                  Next step after this page is room rate selection, quote creation, and stay booking creation on the server.
                </div>
                <button className="search-button" type="button">
                  Continue to rate details
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  type = "text"
}: {
  label: string;
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input defaultValue="" type={type} />
    </div>
  );
}
