"use client";

import type { CreateOrder, Offer, PassengerIdentityDocumentType, SeatMap } from "@duffel/api/types";

export const SELECTION_STORAGE_KEY = "selected-flight-offer";
export const CHECKOUT_STORAGE_KEY = "flight-checkout-state";

export type StoredFlightSelection = {
  offer?: Offer;
  offerRequestId?: string;
  clientKey?: string;
  search?: {
    adults?: string | null;
  };
};

export type AncillariesContext = {
  offer: Offer;
  seatMaps: SeatMap[];
};

export type PassengerForm = {
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

export type PassengerFieldKey =
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

export type PassengerValidationError = {
  message: string;
  fieldKey?: PassengerFieldKey;
  passengerIndex?: number;
};

export type CheckoutState = {
  passengers?: PassengerForm[];
  ancillariesContext?: AncillariesContext | null;
  orderPayload?: CreateOrder | null;
  payloadMetadata?: Record<string, unknown> | null;
};

function isPassengerIdentityDocumentType(value: unknown): value is PassengerIdentityDocumentType {
  return value === "passport" || value === "tax_id";
}

function normalizePassengerForm(rawPassenger: unknown, index: number, selection?: StoredFlightSelection | null): PassengerForm {
  const passenger = (rawPassenger ?? {}) as Partial<PassengerForm> & {
    identity_document?: Partial<PassengerForm["identity_document"]>;
    loyalty_programme_account?: Partial<PassengerForm["loyalty_programme_account"]>;
  };
  const initialDocumentType = selection?.offer?.allowed_passenger_identity_document_types?.[0];
  const fallbackDocumentType =
    initialDocumentType === "passport" || initialDocumentType === "tax_id" ? initialDocumentType : "";

  return {
    id: typeof passenger.id === "string" && passenger.id ? passenger.id : `pas_local_${index + 1}`,
    type: typeof passenger.type === "string" && passenger.type ? passenger.type : "adult",
    title:
      passenger.title === "mr" || passenger.title === "ms" || passenger.title === "mrs" || passenger.title === "miss"
        ? passenger.title
        : "mr",
    gender: passenger.gender === "f" ? "f" : "m",
    given_name: typeof passenger.given_name === "string" ? passenger.given_name : "",
    family_name: typeof passenger.family_name === "string" ? passenger.family_name : "",
    born_on: typeof passenger.born_on === "string" ? passenger.born_on : "",
    email: typeof passenger.email === "string" ? passenger.email : "",
    phone_number: typeof passenger.phone_number === "string" ? passenger.phone_number : "",
    identity_document: {
      type: isPassengerIdentityDocumentType(passenger.identity_document?.type)
        ? passenger.identity_document.type
        : fallbackDocumentType,
      unique_identifier:
        typeof passenger.identity_document?.unique_identifier === "string"
          ? passenger.identity_document.unique_identifier
          : "",
      issuing_country_code:
        typeof passenger.identity_document?.issuing_country_code === "string"
          ? passenger.identity_document.issuing_country_code
          : "",
      expires_on: typeof passenger.identity_document?.expires_on === "string" ? passenger.identity_document.expires_on : ""
    },
    loyalty_programme_account: {
      account_number:
        typeof passenger.loyalty_programme_account?.account_number === "string"
          ? passenger.loyalty_programme_account.account_number
          : "",
      airline_iata_code:
        typeof passenger.loyalty_programme_account?.airline_iata_code === "string"
          ? passenger.loyalty_programme_account.airline_iata_code
          : selection?.offer?.owner?.iata_code ?? ""
    }
  };
}

function normalizeCheckoutState(rawState: CheckoutState, selection?: StoredFlightSelection | null): CheckoutState {
  return {
    ...rawState,
    passengers: Array.isArray(rawState.passengers)
      ? rawState.passengers.map((passenger, index) => normalizePassengerForm(passenger, index, selection))
      : undefined
  };
}

export function loadSelection() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(SELECTION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as StoredFlightSelection;
}

export function loadCheckoutState() {
  if (typeof window === "undefined") {
    return {};
  }

  const selection = loadSelection();
  const rawValue = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  return normalizeCheckoutState(JSON.parse(rawValue) as CheckoutState, selection);
}

export function saveCheckoutState(nextState: CheckoutState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(nextState));
}

export function clearCheckoutState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}

export function mergeCheckoutState(partialState: CheckoutState) {
  const currentState = loadCheckoutState();
  const nextState = { ...currentState, ...partialState };
  saveCheckoutState(nextState);
  return nextState;
}

export function isStaleDuffelReferenceError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("no longer available") ||
    normalizedMessage.includes("linked record") ||
    normalizedMessage.includes("linked record(s) that were not found") ||
    normalizedMessage.includes("were not found in your account") ||
    normalizedMessage.includes("fare has expired")
  );
}

export function getInitialPassengers(selection: StoredFlightSelection | null): PassengerForm[] {
  const offerPassengers = selection?.offer?.passengers ?? [];
  const passengerCount = Number(selection?.search?.adults ?? offerPassengers.length ?? 1);
  const initialDocumentType = selection?.offer?.allowed_passenger_identity_document_types?.[0];

  return Array.from({ length: Math.max(passengerCount, 1) }, (_, index) => {
    const offerPassenger = offerPassengers[index];

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
        airline_iata_code: selection?.offer?.owner?.iata_code ?? ""
      }
    };
  });
}

export function formatTime(dateTime?: string) {
  if (!dateTime) {
    return "--:--";
  }

  return new Date(dateTime).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function formatDate(dateTime?: string) {
  if (!dateTime) {
    return "";
  }

  return new Date(dateTime).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

export function parseDurationToMinutes(duration?: string) {
  if (!duration) {
    return 0;
  }

  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
  return hours * 60 + minutes;
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function formatSliceStops(segmentCount: number) {
  const stops = Math.max(segmentCount - 1, 0);
  if (stops === 0) {
    return "direct";
  }
  if (stops === 1) {
    return "1 stop";
  }
  return `${stops} stops`;
}

export function getPlaceLabel(place?: { name?: string | null; iata_code?: string | null }) {
  return place?.name ?? place?.iata_code ?? "Place";
}

export function formatDocumentType(documentType: PassengerIdentityDocumentType) {
  if (documentType === "passport") {
    return "Passport";
  }

  if (documentType === "tax_id") {
    return "Tax ID";
  }

  return documentType;
}

export function getDocumentNumberLabel(documentType: PassengerIdentityDocumentType | "") {
  if (documentType === "passport") {
    return "Passport number";
  }

  if (documentType === "tax_id") {
    return "Tax ID number";
  }

  return "Document number";
}

export function validatePassengers(
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
    return { message: "Add at least one passenger before continuing." };
  }

  for (const [index, passenger] of passengers.entries()) {
    if (!passenger.given_name.trim()) {
      return { message: `Complete Passenger ${index + 1}: first name.`, passengerIndex: index, fieldKey: "given_name" };
    }
    if (!passenger.family_name.trim()) {
      return { message: `Complete Passenger ${index + 1}: last name.`, passengerIndex: index, fieldKey: "family_name" };
    }
    if (!passenger.born_on) {
      return { message: `Complete Passenger ${index + 1}: date of birth.`, passengerIndex: index, fieldKey: "born_on" };
    }
    if (!passenger.email.trim()) {
      return { message: `Complete Passenger ${index + 1}: email.`, passengerIndex: index, fieldKey: "email" };
    }
    if (!passenger.phone_number.trim()) {
      return { message: `Complete Passenger ${index + 1}: phone.`, passengerIndex: index, fieldKey: "phone_number" };
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

export function buildIdentityDocuments(
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

export function buildLoyaltyProgrammeAccounts(passenger: PassengerForm | undefined) {
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

export function buildBookingPayload(
  orderPayload: CreateOrder | null | undefined,
  passengers: PassengerForm[],
  requiresInstantPayment: boolean,
  showIdentityDocuments: boolean,
  identityDocumentsRequired: boolean
) {
  if (!orderPayload) {
    return null;
  }

  return {
    ...orderPayload,
    type: requiresInstantPayment ? orderPayload.type : "hold",
    passengers: orderPayload.passengers.map((payloadPassenger, index) => ({
      ...payloadPassenger,
      loyalty_programme_accounts: buildLoyaltyProgrammeAccounts(passengers[index]),
      identity_documents: buildIdentityDocuments(passengers[index], {
        showIdentityDocuments,
        identityDocumentsRequired
      })
    }))
  };
}

export function FlightSummary({ selection }: { selection: StoredFlightSelection }) {
  if (!selection.offer) {
    return null;
  }

  return (
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
                      {formatDuration(parseDurationToMinutes(slice.duration ?? undefined))}, {formatSliceStops(slice.segments?.length ?? 0)})
                    </p>
                    <p className="muted">
                      {airlineLabel} | {formatDate(firstSegment?.departing_at)}
                    </p>
                  </div>
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
              </div>
            );
          })}
        </div>
        <p className="code">{selection.offer.id}</p>
      </div>
    </article>
  );
}
