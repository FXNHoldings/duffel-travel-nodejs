import { NextRequest, NextResponse } from "next/server";
import { createFlightOrder, getFlightOffer } from "@/lib/duffel";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      errors?: Array<{ message?: string; title?: string; code?: string }>;
      meta?: { message?: string };
      response?: { data?: { errors?: Array<{ message?: string; title?: string; code?: string }> } };
    };

    const nestedErrors =
      candidate.errors ??
      candidate.response?.data?.errors ??
      [];

    if (nestedErrors.length > 0) {
      return nestedErrors
        .map((item) => item.message ?? item.title ?? item.code)
        .filter(Boolean)
        .join(", ");
    }

    if (candidate.meta?.message) {
      return candidate.meta.message;
    }
  }

  return "Unable to create flight order";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      selected_offers?: string[];
      passengers?: Array<{ id?: string } & Record<string, unknown>>;
      type?: string;
      [key: string]: unknown;
    };

    if (!Array.isArray(body.selected_offers) || body.selected_offers.length !== 1) {
      return NextResponse.json({ error: "Order payload must include exactly one selected offer." }, { status: 400 });
    }

    if (!Array.isArray(body.passengers) || body.passengers.length === 0) {
      return NextResponse.json({ error: "Order payload must include at least one passenger." }, { status: 400 });
    }

    let normalizedPayload = body;

    if (body.passengers.some((passenger) => !passenger.id)) {
      const offer = await getFlightOffer(body.selected_offers[0]);
      normalizedPayload = {
        ...body,
        passengers: body.passengers.map((passenger, index) => ({
          ...passenger,
          id: passenger.id ?? offer.passengers?.[index]?.id
        }))
      };
    }

    if (!normalizedPayload.passengers || normalizedPayload.passengers.some((passenger) => !passenger.id)) {
      return NextResponse.json(
        { error: "Each passenger needs a Duffel passenger id before the order can be created." },
        { status: 400 }
      );
    }

    const order = await createFlightOrder(normalizedPayload as never);
    return NextResponse.json({
      orderId: order.id,
      bookingReference: order.booking_reference ?? null
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Flight order creation failed:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
