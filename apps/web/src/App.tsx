import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Frame } from "./components/Frame";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { Admin } from "./screens/Admin";
import { Ask } from "./screens/Ask";
import { Audit } from "./screens/Audit";
import { Dashboards } from "./screens/Dashboards";
import { Ingestion } from "./screens/Ingestion";
import { Login } from "./screens/Login";
import { Reports } from "./screens/Reports";
import { Settings } from "./screens/Settings";
import { Sources } from "./screens/Sources";
import { Summarize } from "./screens/Summarize";

function AnimatedRoutes() {
  const location = useLocation();
  const { me, loading } = useAuth();

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );

  if (!me) return <Login />;

  const admin = me.role === "admin";

  return (
    <Frame>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/ask" element={<Ask />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/summarize" element={<Summarize />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dashboards" element={<Dashboards />} />
          <Route path="/ingestion" element={admin ? <Ingestion /> : <Navigate to="/ask" />} />
          <Route path="/audit" element={admin ? <Audit /> : <Navigate to="/ask" />} />
          <Route path="/admin" element={admin ? <Admin /> : <Navigate to="/ask" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/ask" />} />
        </Routes>
      </AnimatePresence>
    </Frame>
  );
}

export default function App() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="h-full"
    >
      <AnimatedRoutes />
    </motion.div>
  );
}
