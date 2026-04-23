"use client";

import type { CreateOrder, Offer, PassengerIdentityDocumentType, SeatMap } from "@duffel/api/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createThreeDSecureSession, useDuffelCardFormActions } from "@duffel/components";

const DuffelAncillaries = dynamic(
  () => import("@duffel/components").then((module) => module.DuffelAncillaries),
  { ssr: false }
);
const DuffelCardForm = dynamic(() => import("@duffel/components").then((module) => module.DuffelCardForm), {
  ssr: false
});

type StoredFlightSelection = {
  offer?: Offer;
  offerRequestId?: string;
  clientKey?: string;
  search?: {
    adults?: string | null;
  };
};

type AncillariesContext = {
  offer: Offer;
  seatMaps: SeatMap[];
};

type PassengerForm = {
  id: string;
  type?: string | null;
  title: "mr" | "ms" | "mrs" | "miss";
  gender: "m" | "f";
  given_name: string;
  family_name: string;
  born_on: string;
  email: string;
  phone_number: string;
  identity_document: {
    type: PassengerIdentityDocumentType | "";
    unique_identifier: string;
    issuing_country_code: string;
    expires_on: string;
  };
  loyalty_programme_account: {
    account_number: string;
    airline_iata_code: string;
  };
};

type PassengerFieldKey =
  | "title"
  | "gender"
  | "given_name"
  | "family_name"
  | "born_on"
  | "email"
  | "phone_number"
  | "identity_document.type"
  | "identity_document.unique_identifier"
  | "identity_document.issuing_country_code"
  | "identity_document.expires_on"
  | "loyalty_programme_account.account_number"
  | "loyalty_programme_account.airline_iata_code";

type PassengerValidationError = {
  message: string;
  fieldKey?: PassengerFieldKey;
  passengerIndex?: number;
};

const STORAGE_KEY = "selected-flight-offer";

export default function FlightCheckoutPage() {
  const router = useRouter();
  const ancillariesRef = useRef<HTMLElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const { ref: cardFormRef, createCardForTemporaryUse } = useDuffelCardFormActions();
  const [selection, setSelection] = useState<StoredFlightSelection | null>(null);
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [ancillariesContext, setAncillariesContext] = useState<AncillariesContext | null>(null);
  const [loadingAncillaries, setLoadingAncillaries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderPayload, setOrderPayload] = useState<CreateOrder | null>(null);
  const [payloadMetadata, setPayloadMetadata] = useState<Record<string, unknown> | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [componentClientKey, setComponentClientKey] = useState<string | null>(null);
  const [loadingComponentClientKey, setLoadingComponentClientKey] = useState(false);
  const [cardFormValid, setCardFormValid] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    const rawValue = sessionStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return;
    }

    const parsed = JSON.parse(rawValue) as StoredFlightSelection;
    setSelection(parsed);

    const offerPassengers = parsed.offer?.passengers ?? [];
    const passengerCount = Number(parsed.search?.adults ?? offerPassengers.length ?? 1);

    const initialPassengers: PassengerForm[] = Array.from({ length: Math.max(passengerCount, 1) }, (_, index) => {
      const offerPassenger = offerPassengers[index];
      const initialDocumentType = parsed.offer?.allowed_passenger_identity_document_types?.[0];

      return {
        id: offerPassenger?.id ?? `pas_local_${index + 1}`,
        type: offerPassenger?.type ?? "adult",
        title: "mr" as const,
        gender: "m" as const,
        given_name: "",
        family_name: "",
        born_on: "",
        email: "",
        phone_number: "",
        identity_document: {
          type: initialDocumentType === "passport" || initialDocumentType === "tax_id" ? initialDocumentType : "",
          unique_identifier: "",
          issuing_country_code: "",
          expires_on: ""
        },
        loyalty_programme_account: {
          account_number: "",
          airline_iata_code: parsed.offer?.owner?.iata_code ?? ""
        }
      };
    });

    setPassengers(initialPassengers);
  }, []);

  const requiresInstantPayment = Boolean(selection?.offer?.payment_requirements?.requires_instant_payment);
  const noOptionalAncillaries = Boolean(ancillariesContext && orderPayload && (orderPayload.services?.length ?? 0) === 0);
  const allowedDocumentTypes = selection?.offer?.allowed_passenger_identity_document_types ?? [];
  const identityDocumentsRequired = Boolean(selection?.offer?.passenger_identity_documents_required);
  const showIdentityDocuments = true;
  const documentTypeOptions: PassengerIdentityDocumentType[] =
    allowedDocumentTypes.length > 0 ? allowedDocumentTypes : ["passport", "tax_id"];
  const bookingPayload = orderPayload
    ? {
        ...orderPayload,
        type: requiresInstantPayment ? orderPayload.type : ("pay_later" as const),
        passengers: orderPayload.passengers.map((payloadPassenger, index) => ({
          ...payloadPassenger,
          loyalty_programme_accounts: buildLoyaltyProgrammeAccounts(passengers[index]),
          identity_documents: buildIdentityDocuments(passengers[index], {
            showIdentityDocuments,
            identityDocumentsRequired
          })
        }))
      }
    : null;
  const showPaymentStep = Boolean(bookingPayload && requiresInstantPayment);

  useEffect(() => {
    if (!showPaymentStep || componentClientKey || loadingComponentClientKey) {
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
  }, [componentClientKey, loadingComponentClientKey, showPaymentStep]);

  useEffect(() => {
    if (!ancillariesContext) {
      return;
    }

    ancillariesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ancillariesContext]);

  function registerField(passengerIndex: number, fieldKey: PassengerFieldKey) {
    return (element: HTMLInputElement | HTMLSelectElement | null) => {
      fieldRefs.current[`${passengerIndex}-${fieldKey}`] = element;
    };
  }

  async function handleLoadAncillaries() {
    if (!selection?.offer?.id) {
      setError("No selected offer found.");
      return;
    }

    const validationError = validatePassengers(passengers, {
      showIdentityDocuments,
      identityDocumentsRequired
    });

    if (validationError) {
      setError(validationError.message);
      const firstInvalidField =
        validationError.passengerIndex !== undefined && validationError.fieldKey
          ? fieldRefs.current[`${validationError.passengerIndex}-${validationError.fieldKey}`]
          : null;

      firstInvalidField?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalidField?.focus();
      return;
    }

    setLoadingAncillaries(true);
    setError(null);

    try {
      const response = await fetch("/api/flights/ancillaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selection.offer.id })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load ancillaries");
      }

      setAncillariesContext(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ancillaries");
    } finally {
      setLoadingAncillaries(false);
    }
  }

  function updatePassenger(index: number, key: keyof PassengerForm, value: string) {
    if (error) {
      setError(null);
    }

    setPassengers((current) =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index ? { ...passenger, [key]: value } : passenger
      )
    );
  }

  function updatePassengerDocument(
    index: number,
    key: keyof PassengerForm["identity_document"],
    value: string
  ) {
    if (error) {
      setError(null);
    }

    setPassengers((current) =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? {
              ...passenger,
              identity_document: {
                ...passenger.identity_document,
                [key]: key === "issuing_country_code" ? value.toUpperCase() : value
              }
            }
          : passenger
      )
    );
  }

  function updatePassengerLoyalty(
    index: number,
    key: keyof PassengerForm["loyalty_programme_account"],
    value: string
  ) {
    if (error) {
      setError(null);
    }

    setPassengers((current) =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? {
              ...passenger,
              loyalty_programme_account: {
                ...passenger.loyalty_programme_account,
                [key]: key === "airline_iata_code" ? value.toUpperCase() : value
              }
            }
          : passenger
      )
    );
  }

  async function handleCreateOrder() {
    if (!orderPayload) {
      setError("Load and complete ancillaries before creating the order.");
      return;
    }

    if (requiresInstantPayment) {
      setError("This offer requires instant payment. Payment collection is not wired yet for this flow.");
      return;
    }

    setCreatingOrder(true);
    setError(null);

    try {
      const createPayload = bookingPayload
        ? {
            ...bookingPayload,
            type: "pay_later" as const
          }
        : null;

      if (!createPayload) {
        throw new Error("Booking payload is not ready yet.");
      }

      const response = await fetch("/api/flights/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create order");
      }

      router.push(`/confirmation/flight?orderId=${payload.order.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create order");
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
    setError(null);
    setPaymentError(null);

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

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create paid order");
      }

      router.push(`/confirmation/flight?orderId=${payload.order.id}`);
    } catch (createError) {
      setPaymentError(createError instanceof Error ? createError.message : "Unable to complete payment");
    } finally {
      setCreatingOrder(false);
    }
  }

  function handlePayAndBook() {
    if (!cardFormValid) {
      setPaymentError("Enter valid card details before continuing.");
      return;
    }

    createCardForTemporaryUse();
  }

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flight checkout</p>
              <h1>Traveller details and ancillaries</h1>
            </div>
            <Link className="back-link" href="/flights">
              Back to results
            </Link>
          </div>

          {!selection?.offer ? (
            <div className="status-card">No flight selected yet. Go back to the results page and choose an offer.</div>
          ) : (
            <div className="checkout-grid">
              <article className="selection-card">
                <div className="checkout-flight-summary">
                  <div className="checkout-flight-top">
                    <div>
                      <h2>
                        {selection.offer.slices?.[0]?.origin?.iata_code} to {selection.offer.slices?.[0]?.destination?.iata_code}
                      </h2>
                      <p className="muted">
                        {selection.offer.owner?.name ?? selection.offer.owner?.iata_code}
                        {selection.offer.slices?.[0]?.duration ? ` | ${selection.offer.slices[0].duration}` : ""}
                      </p>
                    </div>
                    <div className="price">
                      {selection.offer.total_currency} {selection.offer.total_amount}
                    </div>
                  </div>
                  <div className="checkout-itinerary">
                    {selection.offer.slices?.map((slice, sliceIndex) => {
                      const firstSegment = slice.segments?.[0];
                      const lastSegment = slice.segments?.[slice.segments.length - 1];
                      const airlineLabel =
                        firstSegment?.operating_carrier?.name ??
                        firstSegment?.marketing_carrier?.name ??
                        selection.offer?.owner?.name ??
                        "Airline";

                      return (
                        <div className="checkout-slice" key={slice.id ?? `slice-${sliceIndex}`}>
                          <div className="checkout-slice-head">
                            <div>
                              <h3>
                                {getPlaceLabel(slice.origin)} to {getPlaceLabel(slice.destination)}
                              </h3>
                              <p className="muted">
                                {formatTime(firstSegment?.departing_at)} - {formatTime(lastSegment?.arriving_at)} (
                                {formatDuration(parseDurationToMinutes(slice.duration ?? undefined))},{` `}
                                {formatSliceStops(slice.segments?.length ?? 0)})
                              </p>
                              <p className="muted">
                                {airlineLabel} • {formatDate(firstSegment?.departing_at)}
                              </p>
                            </div>
                            <button className="text-link-button" type="button">
                              Change flight
                            </button>
                          </div>

                          {slice.segments?.map((segment) => (
                            <div className="checkout-segment" key={segment.id}>
                              <div className="checkout-segment-time">
                                <strong>{formatTime(segment.departing_at)}</strong>
                                <span>{formatDate(segment.departing_at)}</span>
                              </div>
                              <div className="checkout-segment-line">
                                <span className="checkout-dot" />
                                <span className="checkout-airline-pill">
                                  {segment.operating_carrier?.name ?? selection.offer?.owner?.name ?? "Airline"}
                                </span>
                                <span className="checkout-dot" />
                              </div>
                        <div className="checkout-segment-place">
                          <strong>{getPlaceLabel(segment.origin)}</strong>
                          <span>{segment.origin?.iata_code}</span>
                        </div>
                              <div className="checkout-segment-time">
                                <strong>{formatTime(segment.arriving_at)}</strong>
                                <span>{formatDate(segment.arriving_at)}</span>
                              </div>
                        <div className="checkout-segment-place">
                          <strong>{getPlaceLabel(segment.destination)}</strong>
                          <span>{segment.destination?.iata_code}</span>
                        </div>
                            </div>
                          ))}

                          <button className="text-link-button checkout-details-link" type="button">
                            Flight details
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="code">{selection.offer.id}</p>
                </div>
              </article>

              <div className="checkout-form">
                <h2>Passengers</h2>
                <div className="passenger-stack">
                  {passengers.map((passenger, index) => (
                    <section className="passenger-card" key={passenger.id}>
                      <div className="passenger-card-head">
                        <strong>Passenger {index + 1}</strong>
                        <span className="muted">{passenger.type ?? "adult"}</span>
                      </div>

                      <div className="form-two-col">
                        <SelectField
                          label="Title"
                          onChange={(value) => updatePassenger(index, "title", value)}
                          options={[
                            ["mr", "Mr"],
                            ["ms", "Ms"],
                            ["mrs", "Mrs"],
                            ["miss", "Miss"]
                          ]}
                          ref={registerField(index, "title")}
                          value={passenger.title}
                        />
                        <SelectField
                          label="Gender"
                          onChange={(value) => updatePassenger(index, "gender", value)}
                          options={[
                            ["m", "Male"],
                            ["f", "Female"]
                          ]}
                          ref={registerField(index, "gender")}
                          value={passenger.gender}
                        />
                        <Field
                          label="First name"
                          onChange={(value) => updatePassenger(index, "given_name", value)}
                          ref={registerField(index, "given_name")}
                          value={passenger.given_name}
                        />
                        <Field
                          label="Last name"
                          onChange={(value) => updatePassenger(index, "family_name", value)}
                          ref={registerField(index, "family_name")}
                          value={passenger.family_name}
                        />
                        <Field
                          label="Date of birth"
                          onChange={(value) => updatePassenger(index, "born_on", value)}
                          ref={registerField(index, "born_on")}
                          type="date"
                          value={passenger.born_on}
                        />
                        <Field
                          label="Email"
                          onChange={(value) => updatePassenger(index, "email", value)}
                          ref={registerField(index, "email")}
                          type="email"
                          value={passenger.email}
                        />
                        <Field
                          label="Phone"
                          onChange={(value) => updatePassenger(index, "phone_number", value)}
                          placeholder="+61412345678"
                          ref={registerField(index, "phone_number")}
                          value={passenger.phone_number}
                        />
                        {showIdentityDocuments ? (
                          <>
                            <SelectField
                              label="Travel document type"
                              onChange={(value) =>
                                updatePassengerDocument(index, "type", value as PassengerIdentityDocumentType | "")
                              }
                              options={documentTypeOptions.map((documentType) => [
                                documentType,
                                formatDocumentType(documentType)
                              ])}
                              ref={registerField(index, "identity_document.type")}
                              value={passenger.identity_document.type}
                            />
                            <Field
                              label={getDocumentNumberLabel(passenger.identity_document.type)}
                              onChange={(value) => updatePassengerDocument(index, "unique_identifier", value)}
                              ref={registerField(index, "identity_document.unique_identifier")}
                              value={passenger.identity_document.unique_identifier}
                            />
                            <Field
                              label="Issuing country code"
                              onChange={(value) => updatePassengerDocument(index, "issuing_country_code", value)}
                              placeholder="AU"
                              ref={registerField(index, "identity_document.issuing_country_code")}
                              value={passenger.identity_document.issuing_country_code}
                            />
                            <Field
                              label="Document expiry date"
                              onChange={(value) => updatePassengerDocument(index, "expires_on", value)}
                              ref={registerField(index, "identity_document.expires_on")}
                              type="date"
                              value={passenger.identity_document.expires_on}
                            />
                          </>
                        ) : null}
                        <Field
                          label="Frequent flyer number"
                          onChange={(value) => updatePassengerLoyalty(index, "account_number", value)}
                          ref={registerField(index, "loyalty_programme_account.account_number")}
                          value={passenger.loyalty_programme_account.account_number}
                        />
                        <Field
                          label="Frequent flyer airline code"
                          onChange={(value) => updatePassengerLoyalty(index, "airline_iata_code", value)}
                          placeholder="BA"
                          ref={registerField(index, "loyalty_programme_account.airline_iata_code")}
                          value={passenger.loyalty_programme_account.airline_iata_code}
                        />
                      </div>
                    </section>
                  ))}
                </div>

                <div className="checkout-note">
                  Once passenger details are complete, load Duffel ancillaries for bags and seats. The component will emit the
                  order creation payload you need for the next booking step.
                </div>

                {showIdentityDocuments ? (
                  <div className="checkout-note">
                    {identityDocumentsRequired
                      ? "This fare requires a passenger travel document before the booking can be created."
                      : "You can capture passenger passport or tax document details here when needed for the booking."}
                  </div>
                ) : null}

                <div className="checkout-note">
                  Frequent flyer details are optional. If you enter one field, complete both the airline code and account
                  number so the booking payload stays valid.
                </div>

                {requiresInstantPayment ? (
                  <div className="checkout-note">
                    This selected offer requires instant payment. The current flow supports pay-later orders only until card
                    payment is wired in.
                  </div>
                ) : null}

                <button
                  className="search-button"
                  disabled={!selection?.offer?.id || loadingAncillaries}
                  onClick={handleLoadAncillaries}
                  type="button"
                >
                  {loadingAncillaries ? "Loading ancillaries..." : "Load bags and seats"}
                </button>
                {error ? <div className="checkout-inline-error">{error}</div> : null}
              </div>
            </div>
          )}

          {ancillariesContext ? (
            <section className="ancillaries-section" ref={ancillariesRef}>
              <div className="page-head">
                <div>
                  <p className="eyebrow-text">Ancillaries</p>
                  <h2>{noOptionalAncillaries ? "Review extras" : "Select bags and seats"}</h2>
                </div>
              </div>

              {noOptionalAncillaries ? (
                <div className="checkout-note">
                  No additional bags or seats are available for this flight. Your included baggage is already reflected in
                  the Duffel review above.
                </div>
              ) : null}

              <div className="ancillaries-card">
                <DuffelAncillaries
                  debug={true}
                  offer={ancillariesContext.offer}
                  onPayloadReady={(data, metadata) => {
                    setOrderPayload(data);
                    setPayloadMetadata(metadata as unknown as Record<string, unknown>);
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
            </section>
          ) : null}

          {showPaymentStep ? (
            <section className="payload-section">
              <div className="page-head">
                <div>
                  <p className="eyebrow-text">Payment</p>
                  <h2>Pay with card</h2>
                  <p className="muted">Enter the traveller's card details, complete any required 3D Secure check, then create the booking.</p>
                </div>
              </div>

              <div className="status-card payment-card">
                {loadingComponentClientKey ? <div className="checkout-note">Preparing secure card form...</div> : null}
                {paymentError ? <div className="checkout-inline-error">{paymentError}</div> : null}
                {componentClientKey ? (
                  <div className="card-form-wrap">
                    <DuffelCardForm
                      clientKey={componentClientKey}
                      intent="to-create-card-for-temporary-use"
                      onCreateCardForTemporaryUseFailure={(cardError) => setPaymentError(cardError.message)}
                      onCreateCardForTemporaryUseSuccess={(card) => {
                        handleInstantPayment(card.id);
                      }}
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
                <div className="payload-actions">
                  <button
                    className="search-button"
                    disabled={!componentClientKey || loadingComponentClientKey || creatingOrder}
                    onClick={handlePayAndBook}
                    type="button"
                  >
                    {creatingOrder ? "Processing payment..." : "Pay and book"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {orderPayload ? (
            <section className="payload-section">
              <div className="page-head">
                <div>
                  <p className="eyebrow-text">Order payload</p>
                  <h2>{noOptionalAncillaries ? "Booking payload ready" : "Ancillaries payload ready"}</h2>
                  <p className="muted">
                    {noOptionalAncillaries
                      ? "No optional extras were available for this offer, so the payload is ready to continue straight to booking."
                      : "This payload can now be posted to your server for order creation with the selected offer and selected services."}
                  </p>
                </div>
              </div>

              <div className="payload-grid">
                <article className="status-card">
                  <h3>{noOptionalAncillaries ? "Included extras summary" : "Selected services summary"}</h3>
                  <pre className="payload-pre">{JSON.stringify(payloadMetadata, null, 2)}</pre>
                </article>
                <article className="status-card">
                  <h3>Create order payload</h3>
                  <pre className="payload-pre">{JSON.stringify(bookingPayload, null, 2)}</pre>
                  {!requiresInstantPayment ? (
                    <div className="payload-actions">
                      <button className="search-button" disabled={creatingOrder} onClick={handleCreateOrder} type="button">
                        {creatingOrder ? "Creating order..." : noOptionalAncillaries ? "Continue to booking" : "Book flight"}
                      </button>
                    </div>
                  ) : null}
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function formatTime(dateTime?: string) {
  if (!dateTime) {
    return "--:--";
  }

  return new Date(dateTime).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatDate(dateTime?: string) {
  if (!dateTime) {
    return "";
  }

  return new Date(dateTime).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
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

function formatSliceStops(segmentCount: number) {
  const stops = Math.max(segmentCount - 1, 0);
  if (stops === 0) {
    return "direct";
  }
  if (stops === 1) {
    return "1 stop";
  }
  return `${stops} stops`;
}

function getPlaceLabel(place?: { name?: string | null; iata_code?: string | null }) {
  return place?.name ?? place?.iata_code ?? "Place";
}

function validatePassengers(
  passengers: PassengerForm[],
  {
    showIdentityDocuments,
    identityDocumentsRequired
  }: {
    showIdentityDocuments: boolean;
    identityDocumentsRequired: boolean;
  }
): PassengerValidationError | null {
  if (passengers.length === 0) {
    return { message: "Add at least one passenger before loading ancillaries." };
  }

  for (const [index, passenger] of passengers.entries()) {
    if (!passenger.given_name.trim()) {
      return {
        message: `Complete Passenger ${index + 1}: first name.`,
        passengerIndex: index,
        fieldKey: "given_name"
      };
    }
    if (!passenger.family_name.trim()) {
      return {
        message: `Complete Passenger ${index + 1}: last name.`,
        passengerIndex: index,
        fieldKey: "family_name"
      };
    }
    if (!passenger.born_on) {
      return {
        message: `Complete Passenger ${index + 1}: date of birth.`,
        passengerIndex: index,
        fieldKey: "born_on"
      };
    }
    if (!passenger.email.trim()) {
      return {
        message: `Complete Passenger ${index + 1}: email.`,
        passengerIndex: index,
        fieldKey: "email"
      };
    }
    if (!passenger.phone_number.trim()) {
      return {
        message: `Complete Passenger ${index + 1}: phone.`,
        passengerIndex: index,
        fieldKey: "phone_number"
      };
    }

    if (showIdentityDocuments) {
      const hasAnyIdentityDocumentField = Boolean(
        passenger.identity_document.type ||
          passenger.identity_document.unique_identifier.trim() ||
          passenger.identity_document.issuing_country_code.trim() ||
          passenger.identity_document.expires_on
      );

      if (identityDocumentsRequired || hasAnyIdentityDocumentField) {
        if (!passenger.identity_document.type) {
          return {
            message: `Complete Passenger ${index + 1}: travel document type.`,
            passengerIndex: index,
            fieldKey: "identity_document.type"
          };
        }
        if (!passenger.identity_document.unique_identifier.trim()) {
          return {
            message: `Complete Passenger ${index + 1}: passport or document number.`,
            passengerIndex: index,
            fieldKey: "identity_document.unique_identifier"
          };
        }
        if (!passenger.identity_document.issuing_country_code.trim()) {
          return {
            message: `Complete Passenger ${index + 1}: issuing country code.`,
            passengerIndex: index,
            fieldKey: "identity_document.issuing_country_code"
          };
        }
        if (!passenger.identity_document.expires_on) {
          return {
            message: `Complete Passenger ${index + 1}: document expiry date.`,
            passengerIndex: index,
            fieldKey: "identity_document.expires_on"
          };
        }
      }
    }

    const hasAnyLoyaltyField = Boolean(
      passenger.loyalty_programme_account.account_number.trim() ||
        passenger.loyalty_programme_account.airline_iata_code.trim()
    );

    if (hasAnyLoyaltyField) {
      if (!passenger.loyalty_programme_account.account_number.trim()) {
        return {
          message: `Complete Passenger ${index + 1}: frequent flyer number.`,
          passengerIndex: index,
          fieldKey: "loyalty_programme_account.account_number"
        };
      }
      if (!passenger.loyalty_programme_account.airline_iata_code.trim()) {
        return {
          message: `Complete Passenger ${index + 1}: frequent flyer airline code.`,
          passengerIndex: index,
          fieldKey: "loyalty_programme_account.airline_iata_code"
        };
      }
    }
  }

  return null;
}

function buildIdentityDocuments(
  passenger: PassengerForm | undefined,
  {
    showIdentityDocuments,
    identityDocumentsRequired
  }: {
    showIdentityDocuments: boolean;
    identityDocumentsRequired: boolean;
  }
) {
  if (!passenger || !showIdentityDocuments) {
    return undefined;
  }

  const { identity_document } = passenger;
  const hasCompleteIdentityDocument = Boolean(
    identity_document.type &&
      identity_document.unique_identifier.trim() &&
      identity_document.issuing_country_code.trim() &&
      identity_document.expires_on
  );

  if (!hasCompleteIdentityDocument) {
    return identityDocumentsRequired ? [] : undefined;
  }

  return [
    {
      type: identity_document.type,
      unique_identifier: identity_document.unique_identifier.trim(),
      issuing_country_code: identity_document.issuing_country_code.trim().toUpperCase(),
      expires_on: identity_document.expires_on
    }
  ];
}

function buildLoyaltyProgrammeAccounts(passenger: PassengerForm | undefined) {
  if (!passenger) {
    return undefined;
  }

  const { loyalty_programme_account } = passenger;
  const hasCompleteLoyaltyProgrammeAccount = Boolean(
    loyalty_programme_account.account_number.trim() && loyalty_programme_account.airline_iata_code.trim()
  );

  if (!hasCompleteLoyaltyProgrammeAccount) {
    return undefined;
  }

  return [
    {
      account_number: loyalty_programme_account.account_number.trim(),
      airline_iata_code: loyalty_programme_account.airline_iata_code.trim().toUpperCase()
    }
  ];
}

function formatDocumentType(documentType: PassengerIdentityDocumentType) {
  if (documentType === "passport") {
    return "Passport";
  }

  if (documentType === "tax_id") {
    return "Tax ID";
  }

  return documentType;
}

function getDocumentNumberLabel(documentType: PassengerIdentityDocumentType | "") {
  if (documentType === "passport") {
    return "Passport number";
  }

  if (documentType === "tax_id") {
    return "Tax ID number";
  }

  return "Document number";
}

function Field({
  label,
  onChange,
  placeholder,
  ref,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ref?: (element: HTMLInputElement | null) => void;
  type?: string;
  value: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} ref={ref} type={type} value={value} />
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  ref,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  ref?: (element: HTMLSelectElement | null) => void;
  value: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select onChange={(event) => onChange(event.target.value)} ref={ref} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
