/**
 * Electron entry for the always-on-top desktop pet overlay.
 * Loaded into its own frameless, transparent BrowserWindow by main (createPetWindow).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PetApp } from "./components/pet/PetApp.tsx";
import { applyDocumentTheme } from "./lib/theme.ts";
import "./styles.css";
import "./pet.css";

applyDocumentTheme("dark");

function boot(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root missing");
  createRoot(rootEl).render(
    <StrictMode>
      <PetApp />
    </StrictMode>,
  );
}

boot();
