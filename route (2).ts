import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { startAuth, listBanks } from "@/lib/enablebanking";
import { db } from "@/lib/db";

// GET /api/auth/start?bank=ABN%20AMRO&country=NL
export async function GET(req: NextRequest) {
  const bank = req.nextUrl.searchParams.get("bank");
  const country = req.nextUrl.searchParams.get("country") ?? "PT";

  if (!bank) {
    // No bank chosen yet — return the pickable list for this country.
    return NextResponse.json(await listBanks(country));
  }

  const meta = (await listBanks(country)).find((b) => b.name === bank);
  if (!meta) return NextResponse.json({ error: "unknown bank" }, { status: 400 });

  // Ask for the longest consent the bank allows, minus a minute of slack.
  const validUntil = new Date(Date.now() + (meta.maximum_consent_validity - 60) * 1000);

  const state = randomUUID();
  await db.query(
    "insert into auth_state (state, bank, country, created_at) values ($1,$2,$3,now())",
    [state, bank, country],
  );

  const { url } = await startAuth({
    bank,
    country,
    redirectUrl: `${process.env.APP_URL}/api/auth/callback`,
    state,
    validUntil,
  });

  return NextResponse.redirect(url);
}
