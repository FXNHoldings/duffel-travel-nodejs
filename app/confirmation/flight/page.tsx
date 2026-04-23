"use client";

import type { Order } from "@duffel/api/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function FlightConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <section className="results-page">
            <div className="results-page-inner">
              <div className="status-card">Loading booking confirmation...</div>
            </div>
          </section>
        </main>
      }
    >
      <FlightConfirmationContent />
    </Suspense>
  );
}

function FlightConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams?.get("orderId") ?? "";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setError("Missing orderId");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/flights/order/${orderId}`, {
          method: "GET",
          signal: controller.signal
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load order");
        }

        setOrder(payload.order);
      } catch (loadError) {
        if ((loadError as Error).name === "AbortError") {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load order");
      } finally {
        setLoading(false);
      }
    }

    loadOrder();

    return () => controller.abort();
  }, [orderId]);

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flight confirmation</p>
              <h1>Booking confirmed</h1>
            </div>
            <Link className="back-link" href="/">
              Back to home
            </Link>
          </div>

          {loading ? <div className="status-card">Loading booking confirmation...</div> : null}
          {error ? <div className="status-card">{error}</div> : null}

          {order ? (
            <div className="payload-grid">
              <article className="status-card">
                <h3>Booking summary</h3>
                <div className="confirmation-list">
                  <div className="flight-info-row">
                    <span>Order ID</span>
                    <strong>{order.id}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Booking reference</span>
                    <strong>{order.booking_reference ?? "Pending"}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Payment status</span>
                    <strong>{formatPaymentStatus(order.payment_status)}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Total</span>
                    <strong>
                      {order.total_currency} {order.total_amount}
                    </strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Airline</span>
                    <strong>{order.owner?.name}</strong>
                  </div>
                </div>
              </article>

              <article className="status-card">
                <h3>Passengers and services</h3>
                <div className="confirmation-list">
                  <div className="flight-info-row">
                    <span>Passengers</span>
                    <strong>{order.passengers?.length ?? 0}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Services</span>
                    <strong>{order.services?.length ?? 0}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Slices</span>
                    <strong>{order.slices?.length ?? 0}</strong>
                  </div>
                  <div className="flight-info-row">
                    <span>Created</span>
                    <strong>{new Date(order.created_at).toLocaleString("en-AU")}</strong>
                  </div>
                </div>
              </article>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function formatPaymentStatus(paymentStatus: Order["payment_status"]) {
  if (!paymentStatus || typeof paymentStatus !== "object") {
    return "Unknown";
  }

  if ("awaiting_payment" in paymentStatus && paymentStatus.awaiting_payment) {
    return "Awaiting payment";
  }

  if ("paid_at" in paymentStatus && paymentStatus.paid_at) {
    return "Paid";
  }

  return "Pending";
}
