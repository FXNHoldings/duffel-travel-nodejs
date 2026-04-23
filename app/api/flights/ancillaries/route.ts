import { NextRequest, NextResponse } from "next/server";
import { getFlightAncillariesContext } from "@/lib/duffel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const offerId = typeof body.offerId === "string" ? body.offerId : "";

    if (!offerId) {
      return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
    }

    const context = await getFlightAncillariesContext(offerId);
    return NextResponse.json(context);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load flight ancillaries" },
      { status: 400 }
    );
  }
}
