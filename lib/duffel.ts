import { Duffel } from "@duffel/api";
import type { CreateOrder } from "@duffel/api/types";

type CabinClass = "economy" | "premium_economy" | "business" | "first";
const DUFFEL_API_BASE_URL = "https://api.duffel.com";

type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  cabinClass?: string;
};

type StaySearchInput = {
  destinationQuery?: string;
  latitude?: number;
  longitude?: number;
  radiusKm: number;
  checkInDate: string;
  checkOutDate: string;
  rooms: number;
  guests: number;
};

type ResolvedCoordinates = {
  latitude: number;
  longitude: number;
  label: string;
};

function getAccessToken() {
  const accessToken = process.env.DUFFEL_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Missing DUFFEL_ACCESS_TOKEN in environment configuration.");
  }

  return accessToken;
}

function getDuffelClient() {
  return new Duffel({
    token: getAccessToken(),
    apiVersion: "v2"
  });
}

export async function searchFlights(input: FlightSearchInput) {
  const duffel = getDuffelClient();
  const passengers = Array.from({ length: input.adults }, () => ({ type: "adult" as const }));

  const slices = [
    {
      origin: input.origin,
      destination: input.destination,
      departure_date: input.departureDate
    }
  ];

  if (input.returnDate) {
    slices.push({
      origin: input.destination,
      destination: input.origin,
      departure_date: input.returnDate
    });
  }

  const offerRequest = await duffel.offerRequests.create({
    slices,
    passengers,
    cabin_class: (input.cabinClass ?? "economy") as CabinClass
  });

  const offerRequestData = offerRequest.data as {
    id: string;
    offers?: unknown[];
    client_key?: string;
  };

  return {
    id: offerRequestData.id,
    clientKey: offerRequestData.client_key,
    offers: offerRequestData.offers ?? []
  };
}

export async function getFlightAncillariesContext(offerId: string) {
  const duffel = getDuffelClient();
  const [offerResponse, seatMapsResponse] = await Promise.all([
    duffel.offers.get(offerId, { return_available_services: true }),
    duffel.seatMaps.get({ offer_id: offerId })
  ]);

  return {
    offer: offerResponse.data,
    seatMaps: seatMapsResponse.data ?? []
  };
}

export async function getFlightOffer(offerId: string) {
  const duffel = getDuffelClient();
  const offerResponse = await duffel.offers.get(offerId);
  return offerResponse.data;
}

export async function createComponentClientKey() {
  const response = await fetch(`${DUFFEL_API_BASE_URL}/identity/component_client_keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({}),
    cache: "no-store"
  });

  const payload = (await response.json()) as {
    data?: { component_client_key?: string };
    errors?: Array<{ message?: string; title?: string }>;
  };

  if (!response.ok || !payload.data?.component_client_key) {
    const message = payload.errors?.map((item) => item.message ?? item.title).filter(Boolean).join(", ");
    throw new Error(message || "Unable to create Duffel component client key.");
  }

  return payload.data.component_client_key;
}

export async function createFlightOrder(orderPayload: CreateOrder) {
  const duffel = getDuffelClient();
  const orderResponse = await duffel.orders.create(orderPayload);
  return orderResponse.data;
}

export async function getFlightOrder(orderId: string) {
  const duffel = getDuffelClient();
  const orderResponse = await duffel.orders.get(orderId);
  return orderResponse.data;
}

export async function searchStays(input: StaySearchInput) {
  const coordinates = await resolveStayCoordinates(input);
  const guests = Array.from({ length: input.guests }, () => ({ type: "adult" as const }));

  const response = await fetch(`${DUFFEL_API_BASE_URL}/stays/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      data: {
        rooms: input.rooms,
        check_in_date: input.checkInDate,
        check_out_date: input.checkOutDate,
        guests,
        location: {
          radius: input.radiusKm,
          geographic_coordinates: {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          }
        }
      }
    }),
    cache: "no-store"
  });

  const responseText = await response.text();
  let payload: unknown = null;

  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (payload && typeof payload === "object" && "errors" in payload) {
      const errors = (payload as { errors?: Array<{ message?: string; title?: string }> }).errors ?? [];
      const message = errors.map((item) => item.message ?? item.title).filter(Boolean).join(", ");
      throw new Error(message || `Duffel stays search failed with status ${response.status}`);
    }

    throw new Error(responseText || `Duffel stays search failed with status ${response.status}`);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    const data = (payload as { data?: unknown }).data;

    if (Array.isArray(data)) {
      return data;
    }

    if (data && typeof data === "object" && "results" in data) {
      return (data as { results?: unknown[] }).results ?? [];
    }
  }

  return [];
}

async function resolveStayCoordinates(input: StaySearchInput): Promise<ResolvedCoordinates> {
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      label: "Coordinates"
    };
  }

  if (!input.destinationQuery?.trim()) {
    throw new Error("Enter a city or hotel name for the stay search.");
  }

  const geocodingUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodingUrl.searchParams.set("q", input.destinationQuery.trim());
  geocodingUrl.searchParams.set("format", "jsonv2");
  geocodingUrl.searchParams.set("limit", "1");
  geocodingUrl.searchParams.set("addressdetails", "1");

  const response = await fetch(geocodingUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DuffelTravelStarter/0.1"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Unable to resolve that stay destination right now.");
  }

  const results = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  const firstResult = results[0];

  if (!firstResult?.lat || !firstResult?.lon) {
    throw new Error("We could not find that city or hotel. Try a broader city or area name.");
  }

  return {
    latitude: Number(firstResult.lat),
    longitude: Number(firstResult.lon),
    label: firstResult.display_name ?? input.destinationQuery
  };
}
