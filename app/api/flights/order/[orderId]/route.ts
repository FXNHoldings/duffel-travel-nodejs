import { NextRequest, NextResponse } from "next/server";
import { getFlightOrder } from "@/lib/duffel";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { orderId } = await context.params;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getFlightOrder(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load flight order" },
      { status: 400 }
    );
  }
}
