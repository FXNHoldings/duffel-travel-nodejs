import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type AirlineSeedRecord = {
  iataCode?: string;
  icaoCode?: string;
  name: string;
  legalName?: string;
  alliance?: string;
  countryCode?: string;
  countryName?: string;
  callsign?: string;
  websiteUrl?: string;
  supportPhone?: string;
  logoUrl?: string;
  logoLocalPath?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Set it in your shell or .env.local before running the airline import.");
  }

  return databaseUrl;
}

function normalizeCode(value?: string) {
  return value?.trim().toUpperCase() || undefined;
}

function normalizeText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function loadSeedRecords(fileArg?: string) {
  const sourcePath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.resolve(process.cwd(), "data/airlines.seed.json");
  const raw = await readFile(sourcePath, "utf8");
  const parsed = JSON.parse(raw) as AirlineSeedRecord[];

  if (!Array.isArray(parsed)) {
    throw new Error("Airline seed file must contain an array of airline records.");
  }

  return { sourcePath, records: parsed };
}

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const { sourcePath, records } = await loadSeedRecords(process.argv[2]);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: ["warn", "error"]
  });

  let processed = 0;

  try {
    for (const record of records) {
      if (!normalizeText(record.name)) {
        throw new Error("Every airline record must include a name.");
      }

      const iataCode = normalizeCode(record.iataCode);
      const icaoCode = normalizeCode(record.icaoCode);

      if (!iataCode && !icaoCode) {
        throw new Error(`Airline '${record.name}' must include at least an IATA or ICAO code.`);
      }

      const data = {
        iataCode,
        icaoCode,
        name: normalizeText(record.name)!,
        legalName: normalizeText(record.legalName),
        alliance: normalizeText(record.alliance),
        countryCode: normalizeCode(record.countryCode),
        countryName: normalizeText(record.countryName),
        callsign: normalizeText(record.callsign),
        websiteUrl: normalizeText(record.websiteUrl),
        supportPhone: normalizeText(record.supportPhone),
        logoUrl: normalizeText(record.logoUrl),
        logoLocalPath: normalizeText(record.logoLocalPath),
        isActive: record.isActive ?? true,
        metadata: record.metadata ? JSON.parse(JSON.stringify(record.metadata)) : undefined
      };

      const existing = await prisma.airline.findFirst({
        where: {
          OR: [
            ...(iataCode ? [{ iataCode }] : []),
            ...(icaoCode ? [{ icaoCode }] : [])
          ]
        },
        select: { id: true }
      });

      if (existing) {
        await prisma.airline.update({
          where: { id: existing.id },
          data
        });
      } else {
        await prisma.airline.create({ data });
      }

      processed += 1;
    }

    console.log(`Imported ${processed} airline records from ${sourcePath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
