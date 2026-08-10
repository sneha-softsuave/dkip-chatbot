import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Frame } from "./components/Frame";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AdminConsole } from "./screens/AdminConsole";
import { Categories } from "./screens/Categories";
import { Chat } from "./screens/Chat";
import { Documents } from "./screens/Documents";
import { KnowledgeBase } from "./screens/KnowledgeBase";
import { Login } from "./screens/Login";
import { PeopleScreen } from "./screens/People";
import { ReportView } from "./screens/ReportView";
import { Reports } from "./screens/Reports";

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
        {/* Keyed on location.key, not pathname: React Router mints a fresh key
            for every navigation entry, so "New chat" from /chat remounts Chat
            and starts a new session. Keying on pathname made that a no-op. */}
        <Routes location={location} key={location.key}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:sessionId" element={<Chat />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<ReportView />} />
          <Route path="/knowledge" element={admin ? <KnowledgeBase /> : <Navigate to="/chat" />} />
          <Route path="/admin" element={admin ? <AdminConsole /> : <Navigate to="/chat" />} />
          <Route path="/people" element={admin ? <PeopleScreen /> : <Navigate to="/chat" />} />
          <Route path="/categories" element={admin ? <Categories /> : <Navigate to="/chat" />} />
          <Route path="*" element={<Navigate to="/chat" />} />
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
