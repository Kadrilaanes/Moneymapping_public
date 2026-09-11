import { NextRequest, NextResponse } from "next/server";

// The whole app is gated by one shared secret — see middleware.ts. No user
// table, no password reset flow: there is exactly one user.
export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.AUTH_PASSWORD || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", process.env.AUTH_PASSWORD, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
