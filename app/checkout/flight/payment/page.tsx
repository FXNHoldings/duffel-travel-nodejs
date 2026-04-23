"use client";

import { createThreeDSecureSession, DuffelCardForm, useDuffelCardFormActions } from "@duffel/components";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearCheckoutState,
  FlightSummary,
  buildBookingPayload,
  getInitialPassengers,
  isStaleDuffelReferenceError,
  loadCheckoutState,
  loadSelection,
  mergeCheckoutState
} from "../shared";

function FlightPaymentPageClient() {
  const router = useRouter();
  const { ref: cardFormRef, createCardForTemporaryUse } = useDuffelCardFormActions();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<ReturnType<typeof loadSelection>>(null);
  const [checkoutState, setCheckoutState] = useState<ReturnType<typeof loadCheckoutState>>({});
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [componentClientKey, setComponentClientKey] = useState<string | null>(null);
  const [loadingComponentClientKey, setLoadingComponentClientKey] = useState(false);
  const [cardFormValid, setCardFormValid] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const isSuccessMessage = Boolean(bookingMessage && /(booking created|payment accepted)/i.test(bookingMessage));

  function extractCreatedOrderId(payload: unknown) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    if ("orderId" in payload && typeof payload.orderId === "string" && payload.orderId) {
      return payload.orderId;
    }

    if (
      "order" in payload &&
      payload.order &&
      typeof payload.order === "object" &&
      "id" in payload.order &&
      typeof payload.order.id === "string" &&
      payload.order.id
    ) {
      return payload.order.id;
    }

    return null;
  }

  useEffect(() => {
    const nextSelection = loadSelection();
    const nextCheckoutState = loadCheckoutState();
    setSelection(nextSelection);
    setCheckoutState(nextCheckoutState);
    setBootstrapped(true);

    if (!nextSelection?.offer) {
      return;
    }

    if (!nextCheckoutState.orderPayload) {
      router.replace("/checkout/flight/ancillaries");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!paymentError && !bookingMessage) {
      return;
    }

    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [bookingMessage, paymentError, successOrderId]);

  function navigateToConfirmation(orderId: string) {
    window.sessionStorage.setItem("latest-flight-order-id", orderId);
    router.replace(`/confirmation/flight?orderId=${orderId}`);
    window.setTimeout(() => {
      window.location.href = `/confirmation/flight?orderId=${orderId}`;
    }, 150);
  }

  function handleStaleBookingState(message: string) {
    clearCheckoutState();
    setPaymentError("This fare expired or its linked extras are no longer valid. Search again and choose a fresh flight.");
    setBookingMessage(null);
    setSuccessOrderId(null);
    window.sessionStorage.setItem("flight-search-error", message);
    window.setTimeout(() => {
      router.replace("/flights");
    }, 900);
  }

  const passengers = checkoutState.passengers ?? getInitialPassengers(selection);
  const requiresInstantPayment = Boolean(selection?.offer?.payment_requirements?.requires_instant_payment);
  const bookingPayload = buildBookingPayload(
    checkoutState.orderPayload ?? null,
    passengers,
    requiresInstantPayment,
    true,
    Boolean(selection?.offer?.passenger_identity_documents_required)
  );

  useEffect(() => {
    if (!requiresInstantPayment || componentClientKey || loadingComponentClientKey || !bookingPayload) {
      return;
    }

    let cancelled = false;

    async function loadComponentClientKey() {
      setLoadingComponentClientKey(true);
      setPaymentError(null);

      try {
        const response = await fetch("/api/flights/component-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to initialise payment form");
        }

        if (!cancelled) {
          setComponentClientKey(payload.componentClientKey);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPaymentError(loadError instanceof Error ? loadError.message : "Unable to initialise payment form");
        }
      } finally {
        if (!cancelled) {
          setLoadingComponentClientKey(false);
        }
      }
    }

    loadComponentClientKey();

    return () => {
      cancelled = true;
    };
  }, [bookingPayload, componentClientKey, loadingComponentClientKey, requiresInstantPayment]);

  if (!bootstrapped) {
    return (
      <main className="page">
        <section className="results-page">
          <div className="results-page-inner">
            <div className="status-card">Loading payment step...</div>
          </div>
        </section>
      </main>
    );
  }

  async function handleCreateHoldOrder() {
    if (!bookingPayload) {
      setPaymentError("Booking payload is not ready yet.");
      return;
    }

    setCreatingOrder(true);
    setPaymentError(null);
    setBookingMessage("Creating hold booking...");
    setSuccessOrderId(null);

    try {
      const response = await fetch("/api/flights/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bookingPayload,
          payments: undefined,
          type: "hold"
        })
      });

      const rawBody = await response.text();
      let payload: { orderId?: string; order?: { id?: string }; error?: string } | null = null;

      try {
        payload = rawBody ? (JSON.parse(rawBody) as { orderId?: string; order?: { id?: string }; error?: string }) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? rawBody ?? `Unable to create order (${response.status})`);
      }

      const createdOrderId = extractCreatedOrderId(payload);

      if (!createdOrderId) {
        throw new Error("Duffel created a response without an order id.");
      }
      setSuccessOrderId(createdOrderId);
      setBookingMessage("Booking created. Opening confirmation...");
      navigateToConfirmation(createdOrderId);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Unable to create order";
      if (isStaleDuffelReferenceError(message)) {
        handleStaleBookingState(message);
      } else {
        setPaymentError(message);
      }
      setBookingMessage(null);
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleInstantPayment(cardId: string) {
    if (!selection?.offer?.id || !bookingPayload || !componentClientKey) {
      setPaymentError("Payment form is not ready yet.");
      return;
    }

    const paymentAmount = bookingPayload.payments?.[0]?.amount ?? selection.offer.total_amount;
    const paymentCurrency = bookingPayload.payments?.[0]?.currency ?? selection.offer.total_currency;
    const servicesForThreeDS = (bookingPayload.services ?? []).map((service) => ({
      id: service.id,
      quantity: service.quantity ?? 1
    }));

    setCreatingOrder(true);
    setPaymentError(null);
    setBookingMessage("Processing payment...");
    setSuccessOrderId(null);

    try {
      const threeDSecureSession = await createThreeDSecureSession(
        componentClientKey,
        cardId,
        selection.offer.id,
        servicesForThreeDS,
        true
      );

      if (threeDSecureSession.status !== "ready_for_payment") {
        throw new Error("Card authentication was not completed. Please try again.");
      }

      const response = await fetch("/api/flights/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bookingPayload,
          type: "instant",
          payments: [
            {
              type: "card",
              amount: paymentAmount,
              currency: paymentCurrency,
              three_d_secure_session_id: threeDSecureSession.id
            }
          ]
        })
      });

      const rawBody = await response.text();
      let payload: { orderId?: string; order?: { id?: string }; error?: string } | null = null;

      try {
        payload = rawBody ? (JSON.parse(rawBody) as { orderId?: string; order?: { id?: string }; error?: string }) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? rawBody ?? `Unable to create paid order (${response.status})`);
      }

      const createdOrderId = extractCreatedOrderId(payload);

      if (!createdOrderId) {
        throw new Error("Duffel created a response without an order id.");
      }
      setSuccessOrderId(createdOrderId);
      setBookingMessage("Payment accepted. Opening confirmation...");
      navigateToConfirmation(createdOrderId);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Unable to complete payment";
      if (isStaleDuffelReferenceError(message)) {
        handleStaleBookingState(message);
      } else {
        setPaymentError(message);
      }
      setBookingMessage(null);
    } finally {
      setCreatingOrder(false);
    }
  }

  function handlePayAndBook() {
    if (!cardFormValid) {
      setPaymentError("Enter valid card details before continuing.");
      return;
    }

    setPaymentError(null);
    setBookingMessage("Submitting card details...");
    createCardForTemporaryUse();
  }

  async function handleReloadPaymentForm() {
    setComponentClientKey(null);
    setCardFormValid(false);
    setPaymentError(null);
    setBookingMessage(null);
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

  if (successOrderId) {
    return (
      <main className="page">
        <section className="results-page">
          <div className="results-page-inner">
            <div className="page-head">
              <div>
                <p className="eyebrow-text">Flight checkout</p>
                <h1>Booking created</h1>
              </div>
              <Link className="back-link" href={`/confirmation/flight?orderId=${successOrderId}`}>
                View confirmation
              </Link>
            </div>

            <div className="checkout-grid">
              <FlightSummary selection={selection} />

              <div className="checkout-form">
                <div className="checkout-inline-info">
                  {bookingMessage ?? "Your Duffel booking was created successfully."}
                </div>
                <div className="status-card">
                  <h3>Confirmation ready</h3>
                  <div className="confirmation-list">
                    <div className="flight-info-row">
                      <span>Order ID</span>
                      <strong>{successOrderId}</strong>
                    </div>
                  </div>
                  <p className="muted">
                    If the automatic redirect does not open, use the confirmation button below.
                  </p>
                  <div className="payload-actions">
                    <Link className="search-button" href={`/confirmation/flight?orderId=${successOrderId}`}>
                      Open confirmation
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flight checkout</p>
              <h1>{requiresInstantPayment ? "Payment" : "Review and book"}</h1>
            </div>
            <Link className="back-link" href="/checkout/flight/ancillaries">
              Back to extras
            </Link>
          </div>

          <div className="checkout-grid">
            <FlightSummary selection={selection} />

            <div className="checkout-form">
              {paymentError || (bookingMessage && !isSuccessMessage) ? (
                <div className={paymentError ? "checkout-inline-error" : "checkout-inline-info"} ref={feedbackRef}>
                  {paymentError ?? bookingMessage}
                </div>
              ) : null}

              {bookingPayload ? (
                <>
                  <div className="status-card">
                    <h3>Create order payload</h3>
                    <pre className="payload-pre">{JSON.stringify(bookingPayload, null, 2)}</pre>
                  </div>

                  {requiresInstantPayment ? (
                    <div className="status-card payment-card">
                      <p className="eyebrow-text">Payment</p>
                      <h2>Pay with card</h2>
                      {loadingComponentClientKey ? <div className="checkout-note">Preparing secure card form...</div> : null}
                      {paymentError ? <div className="checkout-inline-error">{paymentError}</div> : null}
                      {componentClientKey ? (
                        <div className="card-form-wrap">
                          <DuffelCardForm
                            clientKey={componentClientKey}
                            intent="to-create-card-for-temporary-use"
                            onCreateCardForTemporaryUseFailure={(cardError) => setPaymentError(cardError.message)}
                            onCreateCardForTemporaryUseSuccess={(card) => void handleInstantPayment(card.id)}
                            onValidateFailure={() => setCardFormValid(false)}
                            onValidateSuccess={() => {
                              setCardFormValid(true);
                              setPaymentError(null);
                            }}
                            ref={cardFormRef}
                            styles={{
                              input: {
                                default: {
                                  "border-radius": "16px",
                                  border: "1px solid #d0d5dd",
                                  "min-height": "54px",
                                  padding: "0 14px",
                                  "font-family": "Outfit, sans-serif",
                                  "font-size": "14px"
                                }
                              },
                              label: {
                                "font-family": "Outfit, sans-serif",
                                "font-size": "14px"
                              }
                            }}
                          />
                        </div>
                      ) : null}
                      {!componentClientKey && !loadingComponentClientKey ? (
                        <div className="checkout-note">
                          Secure card form is not ready yet.
                          <button className="text-link-button payment-retry" onClick={handleReloadPaymentForm} type="button">
                            Retry loading payment form
                          </button>
                        </div>
                      ) : null}
                      <div className="payload-actions">
                        <button
                          className="search-button"
                          disabled={!componentClientKey || loadingComponentClientKey || creatingOrder || Boolean(successOrderId)}
                          onClick={handlePayAndBook}
                          type="button"
                        >
                          {creatingOrder ? "Processing payment..." : "Pay and book"}
                        </button>
                      </div>
                      {successOrderId ? (
                        <div className="checkout-success-actions">
                          <span className="muted">Booking created successfully.</span>
                          <Link className="search-button" href={`/confirmation/flight?orderId=${successOrderId}`}>
                            View confirmation
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="status-card">
                      <p className="eyebrow-text">Payment</p>
                      <h2>No card payment required</h2>
                      <p className="muted">
                        This fare can be held without charging a card right now. Create the hold order and pay it later if needed.
                      </p>
                      {paymentError ? <div className="checkout-inline-error">{paymentError}</div> : null}
                      <div className="payload-actions">
                        <button
                          className="search-button"
                          disabled={creatingOrder || Boolean(successOrderId)}
                          onClick={handleCreateHoldOrder}
                          type="button"
                        >
                          {creatingOrder ? "Creating booking..." : "Continue to booking"}
                        </button>
                      </div>
                      {successOrderId ? (
                        <div className="checkout-success-actions">
                          <span className="muted">Booking created successfully.</span>
                          <Link className="search-button" href={`/confirmation/flight?orderId=${successOrderId}`}>
                            View confirmation
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="status-card">
                  No booking payload yet. Go back to <Link href="/checkout/flight/ancillaries">extras</Link> first.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const FlightPaymentPage = dynamic(() => Promise.resolve(FlightPaymentPageClient), {
  ssr: false
});

export default FlightPaymentPage;
