import { createContext, useContext, useEffect, useState } from "react";

import { api, setTokenGetter } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithKeycloak: () => Promise<void>;
  logout: () => void;
  keycloakConfigured: boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM as string | undefined;
const KC_CLIENT = import.meta.env.VITE_KEYCLOAK_CLIENT as string | undefined;
const kcConfigured = !!(KC_URL && KC_REALM && KC_CLIENT);

async function newKeycloak() {
  const Keycloak = (await import("keycloak-js")).default;
  return new Keycloak({ url: KC_URL!, realm: KC_REALM!, clientId: KC_CLIENT! });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTokenGetter(() => localStorage.getItem("dkip_token"));

    async function boot() {
      // Complete a Keycloak redirect round-trip if one is in flight.
      if (sessionStorage.getItem("dkip_sso") && kcConfigured) {
        sessionStorage.removeItem("dkip_sso");
        try {
          const kc = await newKeycloak();
          const ok = await kc.init({ onLoad: "check-sso", pkceMethod: "S256", checkLoginIframe: false });
          if (ok && kc.token) {
            localStorage.setItem("dkip_token", kc.token);
            setMe(await api.get("/auth/me"));
            return;
          }
        } catch {
          /* fall through to local token / login screen */
        }
      }
      const t = localStorage.getItem("dkip_token");
      if (!t) return;
      try {
        setMe(await api.get("/auth/me"));
      } catch {
        localStorage.removeItem("dkip_token");
      }
    }

    boot().finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await api.post("/auth/login", { username, password });
    localStorage.setItem("dkip_token", res.access_token);
    setMe(await api.get("/auth/me"));
  }

  async function loginWithKeycloak() {
    if (!kcConfigured) throw new Error("SSO not configured");
    sessionStorage.setItem("dkip_sso", "1");
    const kc = await newKeycloak();
    await kc.init({ onLoad: "login-required", pkceMethod: "S256", checkLoginIframe: false });
    // login-required redirects away; execution resumes via boot() on return.
  }

  function logout() {
    localStorage.removeItem("dkip_token");
    setMe(null);
  }

  return (
    <Ctx.Provider value={{ me, loading, login, loginWithKeycloak, logout, keycloakConfigured: kcConfigured }}>
      {children}
    </Ctx.Provider>
  );
}
