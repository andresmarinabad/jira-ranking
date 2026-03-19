# Jira Ranking – Story points del mes

Proyecto para conectar con Jira (token de API), agregar tareas cerradas en el mes actual y mostrar un **ranking** de story points por usuario en un frontend con gráficos.

## Requisitos

- Node.js 18+
- Cuenta en Jira Cloud y [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

### Con Nix (recomendado)

Si usas Nix, entra al entorno con Node 20 incluido:

```bash
nix develop
npm run install:all
```

Luego configura `.env` en `backend/` y ejecuta con `npm run dev`.

## Configuración

1. **Clonar / entrar en el proyecto**

   ```bash
   cd jira-automation
   ```

2. **Instalar dependencias**

   ```bash
   npm run install:all
   ```

   (o `npm install` en raíz, luego `npm install` en `backend` y en `frontend`).

3. **Variables de entorno (backend)**  
   En la carpeta `backend`, copia el ejemplo y rellena con tu dominio y token:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edita `backend/.env`:
   - `JIRA_DOMAIN`: dominio de tu Jira (ej. `mi-empresa.atlassian.net`), sin `https://`
   - `JIRA_EMAIL`: email de tu cuenta de Atlassian
   - `JIRA_API_TOKEN`: API token generado en el enlace de arriba
   - Opcional: `JIRA_STORY_POINTS_FIELD`: ID del campo de story points (por defecto `customfield_10016`; en tu Jira puede ser otro)

## Ejecución

- **Todo a la vez (backend + frontend):**
  ```bash
  npm run dev
  ```
- **Solo backend:** `npm run dev:backend` (puerto 3001)
- **Solo frontend:** `npm run dev:frontend` (puerto 5173; el proxy apunta al backend en 3001)

Abre el frontend en **http://localhost:5173**. Verás:

- **Ranking de story points** del mes actual: tareas con `resolutiondate` en el mes actual, agrupadas por asignado y sumando el campo de story points.
- Gráfico de barras horizontal (ranking) y una tabla tipo podio con los primeros puestos.

## APIs del backend

- `GET /api/health` – Comprueba que las variables de Jira estén configuradas.
- `GET /api/ranking/closed-this-month` – Ranking de story points cerrados en el mes actual por usuario.
- `GET /api/assigned` – Tareas actualmente asignadas (abiertas), agrupadas por usuario (opcional).

## Notas

- El ranking usa **resolutiondate** (fecha de resolución) dentro del mes actual; no depende del nombre del estado.
- Si en tu Jira el campo de story points tiene otro ID, configúralo en `JIRA_STORY_POINTS_FIELD` en `backend/.env`.
