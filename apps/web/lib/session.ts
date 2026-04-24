export const TOKEN_KEY = "muse_user_token";
const LOCAL_API_URL = "http://localhost:4000";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type PersonalState = {
  watchlist: string[];
  progress: Record<string, number>;
};

export function getApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();

  // Hard-block known external Afri endpoint patterns for local autonomy.
  if (!raw || /afri/i.test(raw)) {
    return LOCAL_API_URL;
  }

  return raw.replace(/\/+$/, "");
}

