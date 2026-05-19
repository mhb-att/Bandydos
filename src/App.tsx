import { useEffect, useState } from "react";
import { Timer } from "./Timer";
import { Teams } from "./Teams";
import {
  detectPlatform,
  isStandalone,
  loadInstallHintDismissed,
  requestPersistentStorage,
  saveInstallHintDismissed,
} from "./persistence";

type Tab = "timer" | "teams";

const TAB_STORAGE = "bandydos.tab";

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_STORAGE);
    return saved === "teams" ? "teams" : "timer";
  });

  const [showInstallHint, setShowInstallHint] = useState<boolean>(() => {
    if (isStandalone()) return false;
    return !loadInstallHintDismissed();
  });

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE, tab);
  }, [tab]);

  // Ask the browser to mark our origin's storage as persistent so iOS
  // Safari's 7-day eviction doesn't wipe the user's settings.
  useEffect(() => {
    requestPersistentStorage();
  }, []);

  const dismissInstallHint = () => {
    saveInstallHintDismissed();
    setShowInstallHint(false);
  };

  const platform = detectPlatform();

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="brand-logo">
            <img src="/logo.png" alt="Bandydos" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Bandydos</div>
            <div className="brand-tag">
              {tab === "timer" ? "Runde-timer" : "Lag-trekkeren"}
            </div>
          </div>
        </div>
      </header>

      {showInstallHint && (
        <div className="install-hint" role="status">
          <div className="install-hint-text">
            <strong>Tips:</strong>{" "}
            {platform === "ios"
              ? "Trykk Del → Legg til på Hjem-skjerm for å beholde innstillinger over tid."
              : platform === "android"
                ? "Åpne menyen → Installer app for å beholde innstillinger over tid."
                : "Legg til på hjem-skjermen for å beholde innstillinger over tid."}
          </div>
          <button
            className="install-hint-close"
            onClick={dismissInstallHint}
            aria-label="Lukk tips"
          >
            ×
          </button>
        </div>
      )}

      <main>{tab === "timer" ? <Timer /> : <Teams />}</main>

      <nav className="tabbar" role="tablist" aria-label="Hovedmeny">
        <button
          className={`tab ${tab === "timer" ? "active" : ""}`}
          onClick={() => setTab("timer")}
          role="tab"
          aria-selected={tab === "timer"}
        >
          <span className="tab-ico" aria-hidden="true">
            ⏱
          </span>
          Timer
        </button>
        <button
          className={`tab ${tab === "teams" ? "active" : ""}`}
          onClick={() => setTab("teams")}
          role="tab"
          aria-selected={tab === "teams"}
        >
          <span className="tab-ico" aria-hidden="true">
            👥
          </span>
          Lag
        </button>
      </nav>
    </div>
  );
}
