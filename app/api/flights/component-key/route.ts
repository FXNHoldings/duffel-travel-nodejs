import { NextResponse } from "next/server";
import { createComponentClientKey } from "@/lib/duffel";

export async function POST() {
  try {
    const componentClientKey = await createComponentClientKey();
    return NextResponse.json({ componentClientKey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create component client key" },
      { status: 400 }
    );
  }
}
