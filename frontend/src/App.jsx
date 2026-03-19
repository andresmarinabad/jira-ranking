import { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "/api";

function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function App() {
  const [dateFrom, setDateFrom] = useState(() => getDefaultRange().from);
  const [dateTo, setDateTo] = useState(() => getDefaultRange().to);
  const [projectKey, setProjectKey] = useState("");
  const [projects, setProjects] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/projects`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    if (projectKey) params.set("project", projectKey);
    fetch(`${API_BASE}/ranking/closed-this-month?${params}`)
      .then((res) => {
        if (!res.ok)
          return res
            .json()
            .then((d) => Promise.reject(new Error(d.error || res.statusText)));
        return res.json();
      })
      .then(setRanking)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, projectKey]);

  if (loading) {
    return (
      <div className="layout">
        <div className="loading">
          <div className="spinner" />
          <p>Cargando datos de Jira…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="layout">
        <div className="error-box">
          <h2>Error</h2>
          <p>{error}</p>
          <p className="hint">
            Comprueba que el backend esté en marcha y que <code>.env</code>{" "}
            tenga JIRA_DOMAIN, JIRA_EMAIL y JIRA_API_TOKEN.
          </p>
        </div>
      </div>
    );
  }

  const { start, end, ranking: data, totalIssues } = ranking;

  return (
    <div className="layout">
      <header className="header">
        <h1>Ranking Jira</h1>
        <p className="subtitle">Story points de tareas cerradas</p>
        <div className="filters">
          <div className="date-range">
            <label>
              <span className="date-label">Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                max={dateTo}
              />
            </label>
            <label>
              <span className="date-label">Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom}
              />
            </label>
          </div>
          <label className="team-select-wrap">
            <span className="date-label">Equipo</span>
            <select
              className="team-select"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
            >
              <option value="">Todos los equipos</option>
              {projects.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {totalIssues !== undefined && (
          <p className="meta">
            {totalIssues} tareas cerradas entre {start} y {end}
          </p>
        )}
      </header>

      {data.length === 0 ? (
        <section className="table-section">
          <p className="empty">
            No hay tareas cerradas en el periodo seleccionado.
          </p>
        </section>
      ) : (
        <section className="table-section">
          <h2>Podio</h2>
          <ul className="podium">
            {data.slice(0, 10).map((r, i) => (
              <li key={r.displayName} className="podium-item">
                <span className={`rank rank--${i + 1}`}>{i + 1}º</span>
                <span className="name">{r.displayName}</span>
                <span className="points">{r.storyPoints} pts</span>
                <span className="count">{r.count} tareas</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default App;
