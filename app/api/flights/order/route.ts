import type { CreateOrder } from "@duffel/api/types";
import { NextRequest, NextResponse } from "next/server";
import { createFlightOrder, getFlightOffer } from "@/lib/duffel";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateOrder;

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

    if (normalizedPayload.passengers.some((passenger) => !passenger.id)) {
      return NextResponse.json(
        { error: "Each passenger needs a Duffel passenger id before the order can be created." },
        { status: 400 }
      );
    }

    const order = await createFlightOrder(normalizedPayload);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create flight order" },
      { status: 400 }
    );
  }
}
