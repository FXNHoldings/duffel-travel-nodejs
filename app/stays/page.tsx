"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type StayResult = {
  id?: string;
  check_in_date?: string;
  check_out_date?: string;
  search_result_id?: string;
  cheapest_rate_total_amount?: string;
  cheapest_rate_currency?: string;
  accommodation?: {
    id?: string;
    name?: string;
    description?: string;
    rating?: number | string | null;
    location?: {
      address?: { city_name?: string; country_code?: string; line_one?: string };
      city_name?: string;
      country_code?: string;
    };
  };
};

const STORAGE_KEY = "selected-stay-result";

export default function StaysPage() {
  return (
    <Suspense fallback={<main className="page"><section className="results-page"><div className="results-page-inner"><div className="status-card">Loading stay search...</div></div></section></main>}>
      <StaysPageContent />
    </Suspense>
  );
}

function StaysPageContent() {
  const searchParams = useSearchParams();
  const params = searchParams ?? new URLSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StayResult[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function runSearch() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/stays/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destinationQuery: params.get("destinationQuery"),
            radiusKm: Number(params.get("radiusKm") ?? "10"),
            checkInDate: params.get("checkInDate"),
            checkOutDate: params.get("checkOutDate"),
            rooms: Number(params.get("rooms") ?? "1"),
            guests: Number(params.get("guests") ?? "2")
          }),
          signal: controller.signal
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Stay search failed");
        }

        setResults(payload.results ?? []);
      } catch (searchError) {
        if ((searchError as Error).name === "AbortError") {
          return;
        }

        setError(searchError instanceof Error ? searchError.message : "Stay search failed");
      } finally {
        setLoading(false);
      }
    }

    runSearch();

    return () => controller.abort();
  }, [searchParams]);

  function handleSelect(result: StayResult) {
    const payload = {
      result,
      search: {
        destinationQuery: params.get("destinationQuery"),
        checkInDate: params.get("checkInDate"),
        checkOutDate: params.get("checkOutDate"),
        rooms: params.get("rooms"),
        guests: params.get("guests")
      }
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    router.push("/checkout/stay");
  }

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Stays</p>
              <h1>Choose a hotel</h1>
              <p className="muted">
                {params.get("destinationQuery")} | {params.get("checkInDate")} to {params.get("checkOutDate")}
              </p>
            </div>
            <Link className="back-link" href="/">
              Back to search
            </Link>
          </div>

          {loading ? <div className="status-card">Loading hotel results...</div> : null}
          {error ? <div className="status-card">{error}</div> : null}

          {!loading && !error ? (
            <div className="results-listing">
              {results.map((result) => {
                const cityName = result.accommodation?.location?.city_name ?? result.accommodation?.location?.address?.city_name;
                const countryCode =
                  result.accommodation?.location?.country_code ?? result.accommodation?.location?.address?.country_code;

                return (
                  <article className="selection-card" key={result.id ?? result.search_result_id}>
                    <div>
                      <h2>{result.accommodation?.name ?? "Accommodation"}</h2>
                      <p className="muted">
                        {cityName ?? "Location"}
                        {countryCode ? ` | ${countryCode}` : ""}
                        {result.accommodation?.rating ? ` | ${result.accommodation.rating} stars` : ""}
                      </p>
                      <p className="selection-description">
                        {result.accommodation?.description?.slice(0, 180) ?? "Select this stay to continue into guest details and the next booking step."}
                      </p>
                    </div>
                    <div className="selection-side">
                      <div className="price">
                        {result.cheapest_rate_currency} {result.cheapest_rate_total_amount}
                      </div>
                      <button className="search-button" onClick={() => handleSelect(result)} type="button">
                        Select stay
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
