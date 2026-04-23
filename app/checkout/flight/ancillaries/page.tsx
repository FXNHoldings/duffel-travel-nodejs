"use client";

import type { CreateOrder } from "@duffel/api/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearCheckoutState,
  FlightSummary,
  buildBookingPayload,
  getInitialPassengers,
  isStaleDuffelReferenceError,
  loadCheckoutState,
  loadSelection,
  mergeCheckoutState,
  validatePassengers
} from "../shared";

const DuffelAncillaries = dynamic(
  () => import("@duffel/components").then((module) => module.DuffelAncillaries),
  { ssr: false }
);

function FlightAncillariesPageClient() {
  const router = useRouter();
  const [selection, setSelection] = useState<ReturnType<typeof loadSelection>>(null);
  const [checkoutState, setCheckoutState] = useState<ReturnType<typeof loadCheckoutState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerExpired, setOfferExpired] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const nextSelection = loadSelection();
    const nextCheckoutState = loadCheckoutState();
    setSelection(nextSelection);
    setCheckoutState(nextCheckoutState);
    setBootstrapped(true);

    const selectedOffer = nextSelection?.offer;
    const selectedOfferId = selectedOffer?.id;

    if (!selectedOfferId) {
      return;
    }

    const passengers = nextCheckoutState.passengers ?? getInitialPassengers(nextSelection);
    const validationError = validatePassengers(passengers, {
      showIdentityDocuments: true,
      identityDocumentsRequired: Boolean(selectedOffer?.passenger_identity_documents_required)
    });

    if (validationError) {
      router.replace("/checkout/flight/travellers");
      return;
    }

    if (nextCheckoutState.ancillariesContext) {
      return;
    }

    async function loadAncillaries() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/flights/ancillaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: selectedOfferId })
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load ancillaries");
        }

        const mergedState = mergeCheckoutState({
          passengers,
          ancillariesContext: payload,
          orderPayload: nextCheckoutState.orderPayload ?? null,
          payloadMetadata: nextCheckoutState.payloadMetadata ?? null
        });

        setCheckoutState(mergedState);
        setOfferExpired(false);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load ancillaries";
        const isExpiredOffer = isStaleDuffelReferenceError(message);
        setOfferExpired(isExpiredOffer);
        if (isExpiredOffer) {
          clearCheckoutState();
        }
        setError(
          isExpiredOffer
            ? "This fare has expired. Run the search again and choose a fresh flight before selecting bags or seats."
            : message
        );
      } finally {
        setLoading(false);
      }
    }

    loadAncillaries();
  }, [router]);

  if (!bootstrapped) {
    return (
      <main className="page">
        <section className="results-page">
          <div className="results-page-inner">
            <div className="status-card">Loading bags and seats...</div>
          </div>
        </section>
      </main>
    );
  }

  if (!selection?.offer) {
    return (
      <main className="page">
        <section className="results-page">
          <div className="results-page-inner">
            <div className="status-card">
              No flight selected yet. Go back to <Link href="/flights">results</Link> and choose an offer.
            </div>
          </div>
        </section>
      </main>
    );
  }

  const passengers = checkoutState.passengers ?? getInitialPassengers(selection);
  const ancillariesContext = checkoutState.ancillariesContext;
  const requiresInstantPayment = Boolean(selection.offer.payment_requirements?.requires_instant_payment);
  const bookingPayload = buildBookingPayload(
    checkoutState.orderPayload ?? null,
    passengers,
    requiresInstantPayment,
    true,
    Boolean(selection.offer.passenger_identity_documents_required)
  );
  const noOptionalAncillaries = Boolean(ancillariesContext && checkoutState.orderPayload && ((checkoutState.orderPayload as CreateOrder).services?.length ?? 0) === 0);

  function handleContinue() {
    if (!bookingPayload) {
      setError("Wait for the extras step to finish loading before continuing.");
      return;
    }

    mergeCheckoutState({
      ...checkoutState,
      passengers
    });
    router.push("/checkout/flight/payment");
  }

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flight checkout</p>
              <h1>{noOptionalAncillaries ? "Review extras" : "Bags and seats"}</h1>
            </div>
            <Link className="back-link" href="/checkout/flight/travellers">
              Back to travellers
            </Link>
          </div>

          <div className="checkout-grid">
            <FlightSummary selection={selection} />

            <div className="checkout-form">
              {loading ? <div className="checkout-note">Loading available bags and seats...</div> : null}
              {error ? <div className="checkout-inline-error">{error}</div> : null}
              {offerExpired ? (
                <div className="payload-actions">
                  <Link className="search-button" href="/flights">
                    Search again
                  </Link>
                </div>
              ) : null}

              {ancillariesContext ? (
                <>
                  {noOptionalAncillaries ? (
                    <div className="checkout-note">
                      No additional bags or seats are available for this flight. Your included baggage is already reflected in the fare.
                    </div>
                  ) : null}

                  <div className="ancillaries-card">
                    <DuffelAncillaries
                      debug={true}
                      offer={ancillariesContext.offer}
                      onPayloadReady={(data, metadata) => {
                        const nextState = mergeCheckoutState({
                          ...checkoutState,
                          orderPayload: data,
                          payloadMetadata: metadata as unknown as Record<string, unknown>
                        });
                        setCheckoutState(nextState);
                      }}
                      passengers={passengers.map((passenger) => ({
                        id: passenger.id,
                        title: passenger.title,
                        gender: passenger.gender,
                        given_name: passenger.given_name,
                        family_name: passenger.family_name,
                        born_on: passenger.born_on,
                        email: passenger.email,
                        phone_number: passenger.phone_number,
                        type: passenger.type === "adult" ? "adult" : undefined
                      }))}
                      seat_maps={ancillariesContext.seatMaps}
                      services={["bags", "seats"]}
                      styles={{
                        accentColor: "#ff690f",
                        buttonCornerRadius: "16px",
                        fontFamily: "Outfit, sans-serif"
                      }}
                    />
                  </div>

                  <div className="payload-actions">
                    <button className="search-button" onClick={handleContinue} type="button">
                      Continue to payment
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const FlightAncillariesPage = dynamic(() => Promise.resolve(FlightAncillariesPageClient), {
  ssr: false
});

export default FlightAncillariesPage;
