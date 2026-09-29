import { generateCodeVerifier, generateState, type Google } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { googleClient } from "@/lib/auth/google";

const tmpCookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };

export async function GET(request: NextRequest) {
  let google: Google;
  try {
    google = googleClient();
  } catch {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");
  const next = request.nextUrl.searchParams.get("next") ?? "";
  const res = NextResponse.redirect(url);
  res.cookies.set("gt47_oauth_state", state, tmpCookie);
  res.cookies.set("gt47_oauth_verifier", verifier, tmpCookie);
  if (next.startsWith("/") && !next.startsWith("//")) res.cookies.set("gt47_oauth_next", next, tmpCookie);
  return res;
}
