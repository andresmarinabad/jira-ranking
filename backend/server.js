import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const {
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_STORY_POINTS_FIELD = "customfield_10016",
  PORT = 3001,
} = process.env;

// Dominio sin protocolo ni barra final (ej. aistechspace.atlassian.net)
const JIRA_DOMAIN = process.env.JIRA_DOMAIN
  ? process.env.JIRA_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")
  : "";

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

// IDs habituales del campo Story Points en Jira Cloud (puede variar por instancia)
const STORY_POINTS_FIELD_IDS = [
  JIRA_STORY_POINTS_FIELD,
  "customfield_10016",
  "customfield_10020",
  "customfield_10004",
  "customfield_10005",
].filter((id, i, arr) => arr.indexOf(id) === i);

function getStoryPointsFromIssue(issue) {
  const fields = issue.fields || {};
  const toNum = (v) => {
    if (v == null) return null;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "object" && "value" in v) return toNum(v.value);
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return null;
  };
  for (const fieldId of STORY_POINTS_FIELD_IDS) {
    const n = toNum(fields[fieldId]);
    if (n != null && n >= 0) return n;
  }
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("customfield_")) {
      const n = toNum(value);
      if (n != null && n > 0) return n;
    }
  }
  return 0;
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    monthName: start.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    }),
  };
}

function buildSearchUrl(jql, fields, startAt = 0, maxResults = 100) {
  const fieldList = [...new Set([...fields, ...STORY_POINTS_FIELD_IDS])];
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
  });
  fieldList.forEach((f) => params.append("fields", f));
  return `https://${JIRA_DOMAIN}/rest/api/3/search/jql?${params.toString()}`;
}

async function fetchJiraSearch(
  jql,
  fields = ["summary", "assignee", "status", "resolutiondate"],
) {
  const url = buildSearchUrl(jql, fields, 0, 500);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllIssues(jql, fields) {
  let startAt = 0;
  const maxResults = 100;
  let total = 1;
  const allIssues = [];

  while (startAt < total) {
    const url = buildSearchUrl(jql, fields, startAt, maxResults);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    total = data.total;
    allIssues.push(...data.issues);
    startAt += maxResults;
  }

  return allIssues;
}

app.get("/api/health", (_, res) => {
  if (!JIRA_DOMAIN || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return res.status(503).json({
      ok: false,
      message: "Configura JIRA_DOMAIN, JIRA_EMAIL y JIRA_API_TOKEN en .env",
    });
  }
  res.json({ ok: true });
});

/**
 * Lista de proyectos (equipos) para el selector.
 */
app.get("/api/projects", async (_, res) => {
  try {
    if (!JIRA_DOMAIN || !JIRA_EMAIL || !JIRA_API_TOKEN) {
      return res.status(503).json({
        error:
          "Faltan variables de entorno: JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN",
      });
    }
    const url = `https://${JIRA_DOMAIN}/rest/api/3/project`;
    const apiRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });
    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`Jira API error ${apiRes.status}: ${text}`);
    }
    const projects = await apiRes.json();
    const list = (Array.isArray(projects) ? projects : []).map((p) => ({
      key: p.key,
      name: p.name || p.key,
    }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Error al obtener proyectos",
    });
  }
});

/**
 * Ranking: story points de tareas cerradas en un rango de fechas.
 * Query: from, to (YYYY-MM-DD), project (clave de proyecto = equipo). Por defecto: mes actual, todos los proyectos.
 */
app.get("/api/ranking/closed-this-month", async (req, res) => {
  try {
    if (!JIRA_DOMAIN || !JIRA_EMAIL || !JIRA_API_TOKEN) {
      return res.status(503).json({
        error:
          "Faltan variables de entorno: JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN",
      });
    }

    const defaultRange = getMonthRange();
    const start =
      req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
        ? req.query.from
        : defaultRange.start;
    const end =
      req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
        ? req.query.to
        : defaultRange.end;

    const projectKey =
      typeof req.query.project === "string" && req.query.project.trim() !== ""
        ? req.query.project.trim()
        : null;

    let jql = `resolutiondate >= "${start}" AND resolutiondate <= "${end}" AND resolution IS NOT EMPTY`;
    if (projectKey) {
      jql += ` AND project = "${projectKey}"`;
    }
    jql += " ORDER BY resolutiondate DESC";
    const fields = [
      "summary",
      "assignee",
      "status",
      "resolutiondate",
      "resolution",
    ];

    const issues = await fetchAllIssues(jql, fields);

    const byUser = new Map();

    for (const issue of issues) {
      const assignee = issue.fields.assignee;
      const name = assignee
        ? assignee.displayName || assignee.emailAddress || "Sin asignar"
        : "Sin asignar";
      const num = getStoryPointsFromIssue(issue);

      if (!byUser.has(name)) {
        byUser.set(name, { displayName: name, storyPoints: 0, count: 0 });
      }
      const u = byUser.get(name);
      u.storyPoints += num;
      u.count += 1;
    }

    const ranking = Array.from(byUser.values())
      .sort((a, b) => b.storyPoints - a.storyPoints)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    res.json({
      start,
      end,
      ranking,
      totalIssues: issues.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Error al conectar con Jira",
    });
  }
});

/**
 * Tareas asignadas actualmente a usuarios (opcional, para contexto).
 */
app.get("/api/assigned", async (req, res) => {
  try {
    if (!JIRA_DOMAIN || !JIRA_EMAIL || !JIRA_API_TOKEN) {
      return res.status(503).json({
        error:
          "Faltan variables de entorno: JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN",
      });
    }

    const jql =
      "assignee IS NOT EMPTY AND status NOT IN (Done, Closed, Resolved) ORDER BY updated DESC";
    const fields = ["summary", "assignee", "status", "updated"];
    const data = await fetchJiraSearch(jql, fields);

    const byUser = new Map();
    for (const issue of data.issues) {
      const assignee = issue.fields.assignee;
      const name = assignee
        ? assignee.displayName || assignee.emailAddress
        : "Sin asignar";
      if (!byUser.has(name)) byUser.set(name, []);
      byUser.get(name).push({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name,
      });
    }

    res.json({
      byUser: Object.fromEntries(byUser),
      total: data.total,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: err.message || "Error al conectar con Jira" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend Jira escuchando en http://localhost:${PORT}`);
});
