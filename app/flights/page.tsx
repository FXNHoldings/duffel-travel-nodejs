"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type FlightOffer = {
  id: string;
  total_amount?: string;
  total_currency?: string;
  owner?: { name?: string; iata_code?: string };
  slices?: Array<{
    duration?: string;
    origin?: { iata_code?: string; city_name?: string };
    destination?: { iata_code?: string; city_name?: string };
    segments?: Array<{
      departing_at?: string;
      arriving_at?: string;
      duration?: string;
      aircraft?: { name?: string };
      destination?: { city_name?: string; iata_code?: string };
      origin?: { city_name?: string; iata_code?: string };
      marketing_carrier?: { name?: string };
      marketing_carrier_flight_number?: string;
      operating_carrier?: { name?: string };
      operating_carrier_flight_number?: string;
    }>;
  }>;
};

type FlightSearchResponse = {
  id?: string;
  clientKey?: string;
  offers?: FlightOffer[];
};

type SortMode = "best" | "cheapest" | "fastest";
type StopsFilter = "any" | "direct" | "one_stop";

type NormalizedOffer = {
  id: string;
  offer: FlightOffer;
  amount: number;
  currency: string;
  airline: string;
  durationMinutes: number;
  stops: number;
  routeLabel: string;
  departureLabel: string;
  arrivalLabel: string;
  departureDateLabel: string;
  arrivalDateLabel: string;
  originCity: string;
  destinationCity: string;
  nextDayArrival: boolean;
  flightNumber: string;
  operatingAirline: string;
  aircraftName: string;
  segmentDurationLabel: string;
  amenities: Array<{ label: string; value: string }>;
  score: number;
};

const STORAGE_KEY = "selected-flight-offer";

export default function FlightsPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <section className="results-page">
            <div className="results-page-inner">
              <div className="status-card">Loading flight search...</div>
            </div>
          </section>
        </main>
      }
    >
      <FlightsPageContent />
    </Suspense>
  );
}

function FlightsPageContent() {
  const searchParams = useSearchParams();
  const params = searchParams ?? new URLSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlightSearchResponse | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [stopsFilter, setStopsFilter] = useState<StopsFilter>("any");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [expandedOfferIds, setExpandedOfferIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function runSearch() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/flights/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: params.get("origin"),
            destination: params.get("destination"),
            departureDate: params.get("departureDate"),
            returnDate: params.get("returnDate"),
            adults: Number(params.get("adults") ?? "1"),
            cabinClass: params.get("cabinClass") ?? "economy"
          }),
          signal: controller.signal
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Flight search failed");
        }

        setResult(payload);
      } catch (searchError) {
        if ((searchError as Error).name === "AbortError") {
          return;
        }

        setError(searchError instanceof Error ? searchError.message : "Flight search failed");
      } finally {
        setLoading(false);
      }
    }

    runSearch();

    return () => controller.abort();
  }, [searchParams]);

  const normalizedOffers = useMemo(() => {
    return (result?.offers ?? []).map(normalizeOffer).filter((item): item is NormalizedOffer => item !== null);
  }, [result]);

  const airlineOptions = useMemo(() => {
    return Array.from(new Set(normalizedOffers.map((offer) => offer.airline))).sort((a, b) => a.localeCompare(b));
  }, [normalizedOffers]);

  const highestPrice = useMemo(() => {
    if (normalizedOffers.length === 0) {
      return 0;
    }

    return Math.ceil(Math.max(...normalizedOffers.map((offer) => offer.amount)));
  }, [normalizedOffers]);

  useEffect(() => {
    if (highestPrice > 0 && maxPrice === null) {
      setMaxPrice(highestPrice);
    }
  }, [highestPrice, maxPrice]);

  const filteredOffers = useMemo(() => {
    const activeMaxPrice = maxPrice ?? highestPrice;

    const filtered = normalizedOffers.filter((offer) => {
      const airlineMatch = selectedAirlines.length === 0 || selectedAirlines.includes(offer.airline);
      const priceMatch = offer.amount <= activeMaxPrice;
      const stopsMatch =
        stopsFilter === "any" ||
        (stopsFilter === "direct" && offer.stops === 0) ||
        (stopsFilter === "one_stop" && offer.stops <= 1);

      return airlineMatch && priceMatch && stopsMatch;
    });

    const sorted = [...filtered];

    if (sortMode === "cheapest") {
      sorted.sort((a, b) => a.amount - b.amount);
    } else if (sortMode === "fastest") {
      sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
    } else {
      sorted.sort((a, b) => b.score - a.score);
    }

    return sorted;
  }, [highestPrice, maxPrice, normalizedOffers, selectedAirlines, sortMode, stopsFilter]);

  function handleSelect(offer: FlightOffer) {
    const payload = {
      offer,
      offerRequestId: result?.id,
      clientKey: result?.clientKey,
      search: {
        origin: params.get("origin"),
        destination: params.get("destination"),
        departureDate: params.get("departureDate"),
        returnDate: params.get("returnDate"),
        adults: params.get("adults"),
        cabinClass: params.get("cabinClass")
      }
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    router.push("/checkout/flight");
  }

  function toggleAirline(airline: string) {
    setSelectedAirlines((current) =>
      current.includes(airline) ? current.filter((item) => item !== airline) : [...current, airline]
    );
  }

  function toggleExpandedOffer(offerId: string) {
    setExpandedOfferIds((current) =>
      current.includes(offerId) ? current.filter((item) => item !== offerId) : [...current, offerId]
    );
  }

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flights</p>
              <h1>Choose a flight</h1>
              <p className="muted">
                {params.get("origin")} to {params.get("destination")} | {params.get("departureDate")} to {params.get("returnDate")}
              </p>
            </div>
            <Link className="back-link" href="/">
              Back to search
            </Link>
          </div>

          {loading ? <div className="status-card">Loading flight offers...</div> : null}
          {error ? <div className="status-card">{error}</div> : null}

          {!loading && !error ? (
            <div className="flight-results-layout">
              <aside className="filter-panel">
                <div className="filter-card">
                  <h2>Sort</h2>
                  <div className="sort-pills">
                    <button className={sortMode === "best" ? "active" : ""} onClick={() => setSortMode("best")} type="button">
                      Best
                    </button>
                    <button className={sortMode === "cheapest" ? "active" : ""} onClick={() => setSortMode("cheapest")} type="button">
                      Cheapest
                    </button>
                    <button className={sortMode === "fastest" ? "active" : ""} onClick={() => setSortMode("fastest")} type="button">
                      Fastest
                    </button>
                  </div>
                </div>

                <div className="filter-card">
                  <h2>Max price</h2>
                  <input
                    className="range-input"
                    max={highestPrice || 1}
                    min={0}
                    onChange={(event) => setMaxPrice(Number(event.target.value))}
                    type="range"
                    value={maxPrice ?? highestPrice}
                  />
                  <p className="muted">
                    Up to {(normalizedOffers[0]?.currency ?? "AUD")} {maxPrice ?? highestPrice}
                  </p>
                </div>

                <div className="filter-card">
                  <h2>Stops</h2>
                  <div className="filter-options">
                    <button className={stopsFilter === "any" ? "active" : ""} onClick={() => setStopsFilter("any")} type="button">
                      Any
                    </button>
                    <button className={stopsFilter === "direct" ? "active" : ""} onClick={() => setStopsFilter("direct")} type="button">
                      Direct
                    </button>
                    <button
                      className={stopsFilter === "one_stop" ? "active" : ""}
                      onClick={() => setStopsFilter("one_stop")}
                      type="button"
                    >
                      1 stop max
                    </button>
                  </div>
                </div>

                <div className="filter-card">
                  <h2>Airlines</h2>
                  <div className="check-list">
                    {airlineOptions.map((airline) => (
                      <label className="check-item" key={airline}>
                        <input
                          checked={selectedAirlines.includes(airline)}
                          onChange={() => toggleAirline(airline)}
                          type="checkbox"
                        />
                        <span>{airline}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="results-stage">
                <div className="results-toolbar">
                  <div className="toolbar-chip">{filteredOffers.length} results</div>
                  <div className="toolbar-chip">
                    {selectedAirlines.length === 0 ? "All airlines" : `${selectedAirlines.length} airline filters`}
                  </div>
                  <div className="toolbar-chip">{stopsFilter === "any" ? "Any stops" : stopsFilter === "direct" ? "Direct only" : "Up to 1 stop"}</div>
                </div>

                <div className="results-listing">
                  {filteredOffers.map((item) => {
                    const firstSlice = item.offer.slices?.[0];
                    const firstSegment = firstSlice?.segments?.[0];
                    const isExpanded = expandedOfferIds.includes(item.id);

                    return (
                      <article className="selection-card flight-selection-card" key={item.id}>
                        <div className="flight-card-top">
                          <div className="flight-main">
                            <div className="flight-times">
                              <div>
                                <strong>{item.departureLabel}</strong>
                                <span>{firstSlice?.origin?.iata_code ?? "Origin"}</span>
                              </div>
                              <div className="flight-journey-line">
                                <span>{formatStops(item.stops)}</span>
                                <span>{formatDuration(item.durationMinutes)}</span>
                              </div>
                              <div>
                                <strong>{item.arrivalLabel}</strong>
                                <span>{firstSlice?.destination?.iata_code ?? "Destination"}</span>
                              </div>
                            </div>

                            <div className="flight-meta">
                              <p className="muted">
                                {item.airline}
                                {firstSegment?.operating_carrier?.name ? ` | ${firstSegment.operating_carrier.name}` : ""}
                              </p>
                              <div className="pill-row">
                                <span className="pill">{formatStops(item.stops)}</span>
                                <span className="pill">{formatDuration(item.durationMinutes)}</span>
                                <span className="pill">{sortMode === "best" ? `Score ${item.score}` : sortMode}</span>
                              </div>
                              <p className="code">{item.id}</p>
                            </div>
                          </div>
                          <div className="selection-side">
                            <div className="price">
                              {item.currency} {item.amount.toFixed(2)}
                            </div>
                            <button className="details-toggle" onClick={() => toggleExpandedOffer(item.id)} type="button">
                              {isExpanded ? "Hide details" : "More details"}
                            </button>
                            <button className="search-button" onClick={() => handleSelect(item.offer)} type="button">
                              Select flight
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="flight-expanded">
                            <div className="flight-expanded-head">
                              <strong>
                                {item.originCity} to {item.destinationCity}
                              </strong>
                              <span>{formatDuration(item.durationMinutes)}</span>
                            </div>
                            <div className="flight-expanded-body">
                              <div className="flight-expanded-time">
                                <strong>{item.departureLabel}</strong>
                                <span>{item.departureDateLabel}</span>
                              </div>
                              <div className="flight-expanded-center">
                                <div className="flight-expanded-line">
                                  <span className="flight-expanded-dot" />
                                  <span className="flight-expanded-airline">{item.airline}</span>
                                  <span className="flight-expanded-dot" />
                                </div>
                                <div className="flight-expanded-duration">{item.segmentDurationLabel}</div>
                              </div>
                              <div className="flight-expanded-time">
                                <strong>{item.arrivalLabel}</strong>
                                <span>{item.arrivalDateLabel}</span>
                              </div>
                            </div>
                            <div className="flight-expanded-info">
                              <div className="flight-info-group">
                                <h3>Connection info</h3>
                                <div className="flight-info-list">
                                  <div className="flight-info-row">
                                    <span>Airline</span>
                                    <strong>{item.airline}</strong>
                                  </div>
                                  <div className="flight-info-row">
                                    <span>Operating airline</span>
                                    <strong>{item.operatingAirline}</strong>
                                  </div>
                                  <div className="flight-info-row">
                                    <span>Flight no</span>
                                    <strong>{item.flightNumber}</strong>
                                  </div>
                                </div>
                              </div>
                              <div className="flight-info-group">
                                <h3>Seating info</h3>
                                <div className="flight-info-list">
                                  {item.amenities.map((amenity) => (
                                    <div className="flight-info-row" key={`${item.id}-${amenity.label}`}>
                                      <span>{amenity.label}</span>
                                      <strong>{amenity.value}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {item.nextDayArrival ? (
                              <div className="flight-alert">You&apos;ll arrive the next day</div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}

                  {filteredOffers.length === 0 ? (
                    <div className="status-card">No flights match the current filters. Try widening price, stops, or airline options.</div>
                  ) : null}
                </div>
              </div>

              <aside className="ad-panel">
                <div className="ad-card">
                  <div className="ad-media">Ad Space</div>
                  <h3>Travel partner placement</h3>
                  <p className="muted">
                    Reserved for sponsored fare content, upsell banners, insurance prompts, or partner campaigns.
                  </p>
                  <button className="ad-button" type="button">
                    Placeholder CTA
                  </button>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function normalizeOffer(offer: FlightOffer): NormalizedOffer | null {
  const firstSlice = offer.slices?.[0];
  const firstSegment = firstSlice?.segments?.[0];
  const amount = Number(offer.total_amount ?? "0");
  const durationMinutes = parseDurationToMinutes(firstSlice?.duration);
  const stops = Math.max((firstSlice?.segments?.length ?? 1) - 1, 0);
  const airline = offer.owner?.name ?? offer.owner?.iata_code ?? firstSegment?.operating_carrier?.name ?? "Airline";

  if (!firstSlice) {
    return null;
  }

  return {
    id: offer.id,
    offer,
    amount,
    currency: offer.total_currency ?? "",
    airline,
    durationMinutes,
    stops,
    routeLabel: `${firstSlice.origin?.iata_code ?? "Origin"}-${firstSlice.destination?.iata_code ?? "Destination"}`,
    departureLabel: formatTime(firstSegment?.departing_at),
    arrivalLabel: formatTime(firstSegment?.arriving_at),
    departureDateLabel: formatDate(firstSegment?.departing_at),
    arrivalDateLabel: formatDate(firstSegment?.arriving_at),
    originCity: firstSlice.origin?.city_name ?? firstSlice.origin?.iata_code ?? "Origin",
    destinationCity: firstSlice.destination?.city_name ?? firstSlice.destination?.iata_code ?? "Destination",
    nextDayArrival: isNextDayArrival(firstSegment?.departing_at, firstSegment?.arriving_at),
    flightNumber:
      firstSegment?.marketing_carrier_flight_number ??
      firstSegment?.operating_carrier_flight_number ??
      "Unavailable",
    operatingAirline:
      firstSegment?.operating_carrier?.name ??
      firstSegment?.marketing_carrier?.name ??
      airline,
    aircraftName: firstSegment?.aircraft?.name ?? "Aircraft details unavailable",
    segmentDurationLabel: formatDuration(parseDurationToMinutes(firstSegment?.duration ?? firstSlice.duration)),
    amenities: [
      { label: "Aircraft", value: firstSegment?.aircraft?.name ?? "Unavailable" },
      { label: "Cabin", value: "Included in fare" },
      { label: "Seat pitch", value: "Check after booking" },
      { label: "Seat width", value: "Check after booking" },
      { label: "Seat recline", value: "Check after booking" },
      { label: "In-seat power", value: "Varies by aircraft" },
      { label: "Wi-Fi on board", value: "Check airline policy" }
    ],
    score: calculateBestScore(amount, durationMinutes, stops)
  };
}

function calculateBestScore(amount: number, durationMinutes: number, stops: number) {
  const priceScore = Math.max(0, 1000 - amount);
  const durationScore = Math.max(0, 1000 - durationMinutes);
  const stopPenalty = stops * 120;
  return Math.round(priceScore * 0.55 + durationScore * 0.45 - stopPenalty);
}

function parseDurationToMinutes(duration?: string) {
  if (!duration) {
    return 0;
  }

  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
  return hours * 60 + minutes;
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatStops(stops: number) {
  if (stops === 0) {
    return "Direct";
  }

  if (stops === 1) {
    return "1 stop";
  }

  return `${stops} stops`;
}

function formatTime(dateTime?: string) {
  if (!dateTime) {
    return "--:--";
  }

  const date = new Date(dateTime);
  return date.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatDate(dateTime?: string) {
  if (!dateTime) {
    return "";
  }

  const date = new Date(dateTime);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function isNextDayArrival(departingAt?: string, arrivingAt?: string) {
  if (!departingAt || !arrivingAt) {
    return false;
  }

  const departureDate = new Date(departingAt);
  const arrivalDate = new Date(arrivingAt);

  return arrivalDate.toDateString() !== departureDate.toDateString();
}
