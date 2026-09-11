import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/enablebanking";
import { db } from "@/lib/db";

// The bank redirects here with ?code=...&state=... (or ?error=...).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const error = p.get("error");
  if (error) {
    const detail = p.get("error_description") ?? error;
    return NextResponse.redirect(
      `${process.env.APP_URL}/settings?error=${encodeURIComponent(detail)}`,
    );
  }

  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "missing code/state" }, { status: 400 });
  }

  const { rowCount } = await db.query(
    "delete from auth_state where state = $1 and created_at > now() - interval '30 minutes'",
    [state],
  );
  if (!rowCount) return NextResponse.json({ error: "bad state" }, { status: 400 });

  const session = await createSession(code);

  await db.query(
    `insert into bank_session (id, aspsp_name, aspsp_country, valid_until)
     values ($1,$2,$3,$4)`,
    [session.session_id, session.aspsp.name, session.aspsp.country, session.access.valid_until],
  );

  // In restricted production only accounts you whitelisted come back here.
  // An empty array almost always means "you forgot to link that account".
  for (const a of session.accounts) {
    const type =
      a.cash_account_type === "SVGS" ? "savings"
      : a.cash_account_type === "CARD" ? "card"
      : a.cash_account_type === "CACC" ? "current"
      : "other";

    await db.query(
      `insert into account (id, session_id, uid, name, iban, type, liquid, currency)
       values ($1,$2,$3,$4,$5,$6,true,$7)
       on conflict (id) do update
         set session_id = excluded.session_id, uid = excluded.uid`,
      [
        a.identification_hash,
        session.session_id,
        a.uid,
        a.name ?? a.product ?? "Account",
        a.account_id?.iban ?? null,
        type,
        a.currency,
      ],
    );
  }

  return NextResponse.redirect(`${process.env.APP_URL}/settings?linked=1`);
}
