import { NextRequest, NextResponse } from "next/server";
import { searchFlights } from "@/lib/duffel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await searchFlights(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search flights" },
      { status: 400 }
    );
  }
}
