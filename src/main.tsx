import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthGate } from "@/components/auth-gate";
import { DataProvider } from "@/lib/data-store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <DataProvider>
        <App />
      </DataProvider>
    </AuthGate>
  </StrictMode>,
);
