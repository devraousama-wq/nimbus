import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Environment } from "@nimbus/shared";
import { listFlags, ApiRequestError, type FlagSummary } from "../api/client.js";
import { EnvironmentSwitcher } from "./EnvironmentSwitcher.js";

type FlagListProps = {
  environment: Environment;
  onEnvironmentChange: (env: Environment) => void;
};

export function FlagList({ environment, onEnvironmentChange }: FlagListProps) {
  const [flags, setFlags] = useState<FlagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listFlags(environment);
      setFlags(response.flags);
    } catch (err) {
      const message = err instanceof ApiRequestError
        ? `${err.body.error}${err.body.message ? `: ${err.body.message}` : ""}`
        : "Failed to load flags";
      setError(message);
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedFilter = filter.trim().toLowerCase();
  const visible = flags.filter((flag) => {
    if (!normalizedFilter) {
      return true;
    }
    return (
      flag.key.toLowerCase().includes(normalizedFilter)
      || flag.name.toLowerCase().includes(normalizedFilter)
    );
  });

  return (
    <div className="flag-list">
      <header className="page-header">
        <div>
          <h1>Flags</h1>
          <p className="page-header__subtitle">
            {environment} environment
          </p>
        </div>
        <EnvironmentSwitcher value={environment} onChange={onEnvironmentChange} />
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search flags..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search flags"
        />
        <button type="button" className="btn btn--secondary" onClick={() => void load()}>
          Refresh
        </button>
        <Link to="/flags/new" className="btn btn--primary">
          New flag
        </Link>
      </div>

      {loading && <p className="status-message">Loading flags...</p>}
      {error && <p className="status-message status-message--error">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="status-message">No flags match your filter.</p>
      )}

      {!loading && !error && visible.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Version</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((flag) => (
              <tr key={flag.key}>
                <td>
                  <code>{flag.key}</code>
                </td>
                <td>{flag.name}</td>
                <td>{flag.type}</td>
                <td>
                  <span className={`badge ${flag.enabled ? "badge--on" : "badge--off"}`}>
                    {flag.enabled ? "enabled" : "disabled"}
                  </span>
                </td>
                <td>v{flag.version}</td>
                <td className="data-table__actions">
                  <Link to={`/flags/${flag.key}`} className="link">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
