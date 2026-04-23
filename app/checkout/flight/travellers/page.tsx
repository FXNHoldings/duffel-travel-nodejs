"use client";

import type { PassengerIdentityDocumentType } from "@duffel/api/types";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FlightSummary,
  PassengerFieldKey,
  PassengerForm,
  formatDocumentType,
  getDocumentNumberLabel,
  getInitialPassengers,
  loadCheckoutState,
  loadSelection,
  mergeCheckoutState,
  validatePassengers
} from "../shared";

function FlightTravellersPageClient() {
  const router = useRouter();
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const [selection, setSelection] = useState<ReturnType<typeof loadSelection>>(null);
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const nextSelection = loadSelection();
    const checkoutState = loadCheckoutState();

    setSelection(nextSelection);
    setPassengers(checkoutState.passengers ?? getInitialPassengers(nextSelection));
    setBootstrapped(true);
  }, []);

  if (!bootstrapped) {
    return (
      <main className="page">
        <section className="results-page">
          <div className="results-page-inner">
            <div className="status-card">Loading traveller details...</div>
          </div>
        </section>
      </main>
    );
  }

  function registerField(passengerIndex: number, fieldKey: PassengerFieldKey) {
    return (element: HTMLInputElement | HTMLSelectElement | null) => {
      fieldRefs.current[`${passengerIndex}-${fieldKey}`] = element;
    };
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

  function handleContinue() {
    const allowedDocumentTypes = selection?.offer?.allowed_passenger_identity_document_types ?? [];
    const identityDocumentsRequired = Boolean(selection?.offer?.passenger_identity_documents_required);
    const validationError = validatePassengers(passengers, {
      showIdentityDocuments: true,
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

    mergeCheckoutState({
      passengers,
      ancillariesContext: null,
      orderPayload: null,
      payloadMetadata: null
    });
    router.push("/checkout/flight/ancillaries");
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

  const allowedDocumentTypes = selection.offer.allowed_passenger_identity_document_types ?? [];
  const identityDocumentsRequired = Boolean(selection.offer.passenger_identity_documents_required);
  const documentTypeOptions: PassengerIdentityDocumentType[] =
    allowedDocumentTypes.length > 0 ? allowedDocumentTypes : ["passport", "tax_id"];

  return (
    <main className="page">
      <section className="results-page">
        <div className="results-page-inner">
          <div className="page-head">
            <div>
              <p className="eyebrow-text">Flight checkout</p>
              <h1>Traveller details</h1>
            </div>
            <Link className="back-link" href="/flights">
              Back to results
            </Link>
          </div>

          <div className="checkout-grid">
            <FlightSummary selection={selection} />

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
                        onChange={(value) => updatePassenger(index, "title", value as PassengerForm["title"])}
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
                        onChange={(value) => updatePassenger(index, "gender", value as PassengerForm["gender"])}
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
                      <SelectField
                        label="Travel document type"
                        onChange={(value) =>
                          updatePassengerDocument(index, "type", value as PassengerIdentityDocumentType | "")
                        }
                        options={documentTypeOptions.map((documentType) => [documentType, formatDocumentType(documentType)])}
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
                Complete traveller details before moving to bags, seats, and payment.
              </div>
              <div className="checkout-note">
                {identityDocumentsRequired
                  ? "This fare requires a passenger travel document before the booking can be created."
                  : "Passport and travel document fields are available here in case the airline needs them later in the flow."}
              </div>
              <div className="checkout-note">
                Frequent flyer details are optional. If you enter one field, complete both the airline code and account number.
              </div>

              {error ? <div className="checkout-inline-error">{error}</div> : null}

              <div className="payload-actions">
                <button className="search-button" onClick={handleContinue} type="button">
                  Continue to extras
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const FlightTravellersPage = dynamic(() => Promise.resolve(FlightTravellersPageClient), {
  ssr: false
});

export default FlightTravellersPage;

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
        <option value="">Select</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
