"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type SearchMode = "flights" | "stays";

const today = new Date().toISOString().slice(0, 10);

function addDays(baseDate: string, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const languages = [
  ["en-AU", "🇦🇺"],
  ["en-US", "English (US)"],
  ["fr-FR", "Francais"],
  ["de-DE", "Deutsch"],
  ["es-ES", "Espanol"],
  ["ja-JP", "Japanese"]
] as const;

const currencies = [
  ["AUD", "AUD $"],
  ["USD", "USD $"],
  ["EUR", "EUR EUR"],
  ["GBP", "GBP PS"],
  ["SGD", "SGD $"],
  ["JPY", "JPY YEN"]
] as const;

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("flights");
  const [language, setLanguage] = useState<(typeof languages)[number][0]>("en-AU");
  const [currency, setCurrency] = useState<(typeof currencies)[number][0]>("AUD");
  const [flightForm, setFlightForm] = useState({
    origin: "PER",
    destination: "SIN",
    departureDate: addDays(today, 30),
    returnDate: addDays(today, 37),
    adults: "1",
    cabinClass: "economy"
  });
  const [stayForm, setStayForm] = useState({
    destinationQuery: "Perth",
    radiusKm: "10",
    checkInDate: addDays(today, 30),
    checkOutDate: addDays(today, 33),
    rooms: "1",
    guests: "2"
  });

  function handleFlightSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams({
      origin: flightForm.origin,
      destination: flightForm.destination,
      departureDate: flightForm.departureDate,
      returnDate: flightForm.returnDate,
      adults: flightForm.adults,
      cabinClass: flightForm.cabinClass,
      currency,
      language
    });

    router.push(`/flights?${params.toString()}`);
  }

  function handleStaySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams({
      destinationQuery: stayForm.destinationQuery,
      radiusKm: stayForm.radiusKm,
      checkInDate: stayForm.checkInDate,
      checkOutDate: stayForm.checkOutDate,
      rooms: stayForm.rooms,
      guests: stayForm.guests,
      currency,
      language
    });

    router.push(`/stays?${params.toString()}`);
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">Duffel Travel</span>
          </div>
          <nav className="top-links" aria-label="main navigation">
            <span className="chip-link">Flights</span>
            <span className="chip-link">Stays</span>
          </nav>
          <div className="utility-links">
            <div className="utility-select">
              <select
                aria-label="Language"
                id="language-select"
                value={language}
                onChange={(event) => setLanguage(event.target.value as (typeof languages)[number][0])}
              >
                {languages.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="utility-select">
              <select
                aria-label="Currency"
                id="currency-select"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as (typeof currencies)[number][0])}
              >
                {currencies.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <span className="utility-pill primary">Sign in</span>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-title">
            <h1>Search flights and stays from one clean travel front end.</h1>
          </div>

          <div className="search-shell">
            <div className="mode-tabs" aria-label="product search tabs">
              <button
                aria-label="Flights"
                className={mode === "flights" ? "active" : ""}
                onClick={() => setMode("flights")}
                title="Flights"
                type="button"
              >
                <FlightIcon />
              </button>
              <button
                aria-label="Stays"
                className={mode === "stays" ? "active" : ""}
                onClick={() => setMode("stays")}
                title="Stays"
                type="button"
              >
                <StayIcon />
              </button>
            </div>

            <div className="search-panel">
              {mode === "flights" ? (
                <form onSubmit={handleFlightSearch}>
                  <div className="search-topline">
                    <div />
                    <div className="muted">Return | {flightForm.adults} adult | {flightForm.cabinClass} | {currency}</div>
                  </div>
                  <div className="search-grid">
                    <Field
                      label="From"
                      onChange={(value) => setFlightForm((current) => ({ ...current, origin: value.toUpperCase() }))}
                      value={flightForm.origin}
                    />
                    <Field
                      label="To"
                      onChange={(value) => setFlightForm((current) => ({ ...current, destination: value.toUpperCase() }))}
                      value={flightForm.destination}
                    />
                    <Field
                      label="Departure"
                      onChange={(value) => setFlightForm((current) => ({ ...current, departureDate: value }))}
                      type="date"
                      value={flightForm.departureDate}
                    />
                    <Field
                      label="Return"
                      onChange={(value) => setFlightForm((current) => ({ ...current, returnDate: value }))}
                      type="date"
                      value={flightForm.returnDate}
                    />
                    <Field
                      label="Travellers"
                      min={1}
                      onChange={(value) => setFlightForm((current) => ({ ...current, adults: value }))}
                      type="number"
                      value={flightForm.adults}
                    />
                    <SelectField
                      label="Cabin"
                      onChange={(value) => setFlightForm((current) => ({ ...current, cabinClass: value }))}
                      options={[
                        ["economy", "Economy"],
                        ["premium_economy", "Premium economy"],
                        ["business", "Business"],
                        ["first", "First"]
                      ]}
                      value={flightForm.cabinClass}
                    />
                  </div>
                  <div className="search-actions">
                    <span className="muted">Search results open on a dedicated page.</span>
                    <button className="search-button" type="submit">
                      Search flights
                    </button>
                  </div>
                </form>
              ) : null}

              {mode === "stays" ? (
                <form onSubmit={handleStaySearch}>
                  <div className="search-topline">
                    <div />
                    <div className="muted">{stayForm.rooms} room | {stayForm.guests} guests | {currency}</div>
                  </div>
                  <div className="search-grid stays">
                    <Field
                      label="City or hotel"
                      onChange={(value) => setStayForm((current) => ({ ...current, destinationQuery: value }))}
                      value={stayForm.destinationQuery}
                    />
                    <Field
                      label="Radius (km)"
                      min={1}
                      onChange={(value) => setStayForm((current) => ({ ...current, radiusKm: value }))}
                      type="number"
                      value={stayForm.radiusKm}
                    />
                    <Field
                      label="Check-in"
                      onChange={(value) => setStayForm((current) => ({ ...current, checkInDate: value }))}
                      type="date"
                      value={stayForm.checkInDate}
                    />
                    <Field
                      label="Check-out"
                      onChange={(value) => setStayForm((current) => ({ ...current, checkOutDate: value }))}
                      type="date"
                      value={stayForm.checkOutDate}
                    />
                    <Field
                      label="Rooms"
                      min={1}
                      onChange={(value) => setStayForm((current) => ({ ...current, rooms: value }))}
                      type="number"
                      value={stayForm.rooms}
                    />
                    <Field
                      label="Guests"
                      min={1}
                      onChange={(value) => setStayForm((current) => ({ ...current, guests: value }))}
                      type="number"
                      value={stayForm.guests}
                    />
                  </div>
                  <div className="search-actions">
                    <span className="muted">Hotel results open on a dedicated page.</span>
                    <button className="search-button" type="submit">
                      Search stays
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FlightIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20">
      <path d="M2 19l20-7-20-7 5 7-5 7z" />
      <path d="M7 12h15" />
    </svg>
  );
}

function StayIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20">
      <path d="M3 11V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
      <path d="M3 18v-5h18v5" />
      <path d="M5 18v2" />
      <path d="M19 18v2" />
      <path d="M7 9h.01" />
      <path d="M11 9h8" />
    </svg>
  );
}

function Field({
  label,
  onChange,
  value,
  type = "text",
  min
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  type?: string;
  min?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input min={min} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
