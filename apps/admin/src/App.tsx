import { useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import type { Environment } from "@nimbus/shared";
import { FlagList } from "./pages/FlagList.js";
import { FlagEditor } from "./pages/FlagEditor.js";

const ENV_STORAGE_KEY = "nimbus.admin.environment";

function loadStoredEnvironment(): Environment {
  const stored = localStorage.getItem(ENV_STORAGE_KEY);
  if (stored === "development" || stored === "staging" || stored === "production") {
    return stored;
  }
  return "development";
}

function AppLayout() {
  const [environment, setEnvironment] = useState<Environment>(loadStoredEnvironment);

  const handleEnvironmentChange = (env: Environment) => {
    setEnvironment(env);
    localStorage.setItem(ENV_STORAGE_KEY, env);
  };

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <NavLink to="/" className="app-nav__brand">
          Nimbus
        </NavLink>
        <div className="app-nav__links">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `app-nav__link ${isActive ? "app-nav__link--active" : ""}`
            }
          >
            Flags
          </NavLink>
        </div>
      </nav>
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <FlagList
                environment={environment}
                onEnvironmentChange={handleEnvironmentChange}
              />
            }
          />
          <Route path="/flags/:key" element={<FlagEditor />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
