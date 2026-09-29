import { Google } from "arctic";
import { env } from "../env";

export function googleClient() {
  const id = env.oauthClientId();
  const secret = env.oauthClientSecret();
  if (!id || !secret) throw new Error("Falta GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.");
  return new Google(id, secret, `${env.appUrl()}/api/auth/callback`);
}
