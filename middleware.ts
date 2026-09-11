import { NextRequest, NextResponse } from "next/server";

/**
 * Single-user gate. This app is publicly reachable and shows your bank
 * balances, so nothing gets through without either the session cookie or the
 * cron secret.
 *
 * Deliberately not a user system — there is one user. If you later want
 * something nicer, swap this for a passkey; don't add a password reset flow to
 * an app only you use.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The bank redirects here from its own domain, so it can't carry the cookie.
  // It's protected by the one-time `code` and the `state` check instead.
  if (pathname === "/api/auth/callback") return NextResponse.next();

  if (pathname === "/api/sync") {
    const ok = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
    return ok ? NextResponse.next() : new NextResponse("no", { status: 401 });
  }

  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (req.cookies.get("session")?.value !== process.env.AUTH_PASSWORD) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
