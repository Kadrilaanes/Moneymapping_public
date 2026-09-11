import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { rows } = await db.query(`select name, kind from category order by kind, name`);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, kind } = await req.json();
  if (!name?.trim() || !["income", "expense", "transfer"].includes(kind)) {
    return NextResponse.json({ error: "name and a valid kind are required" }, { status: 400 });
  }

  await db.query(
    `insert into category (name, kind) values ($1, $2)
     on conflict (name) do update set kind = excluded.kind`,
    [name.trim(), kind],
  );
  return NextResponse.json({ ok: true });
}
