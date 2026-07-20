import { Navigate, Route, Routes } from "react-router-dom";

import { Frame } from "./components/Frame";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { Ask } from "./screens/Ask";
import { Audit } from "./screens/Audit";
import { Dashboards } from "./screens/Dashboards";
import { Ingestion } from "./screens/Ingestion";
import { Login } from "./screens/Login";
import { Reports } from "./screens/Reports";
import { Sources } from "./screens/Sources";
import { Summarize } from "./screens/Summarize";

export default function App() {
  const { me, loading } = useAuth();

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );

  if (!me) return <Login />;

  const admin = me.role === "admin";

  return (
    <Frame>
      <Routes>
        <Route path="/ask" element={<Ask />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/summarize" element={<Summarize />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/ingestion" element={admin ? <Ingestion /> : <Navigate to="/ask" />} />
        <Route path="/audit" element={admin ? <Audit /> : <Navigate to="/ask" />} />
        <Route path="*" element={<Navigate to="/ask" />} />
      </Routes>
    </Frame>
  );
}
