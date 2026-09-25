# Agent Guidelines & Repository Rules (`AGENTS.md`)

Este archivo contiene las directrices, estándares de desarrollo y flujos de trabajo obligatorios para todos los agentes de IA (Antigravity, Cursor, Claude Code, etc.) que trabajen en este repositorio (`yt-dlp`).

---

## 1. Contexto del Proyecto

- **Nombre:** `yt-dlp` (con GUI web complementaria).
- **Lenguaje Principal:** Python 3.9+ (yt-dlp core), JavaScript/HTML/CSS (Web UI).
- **Componentes Clave:**
  - `yt_dlp/`: Núcleo del descargador, extractores (`yt_dlp/extractor/`), post-procesadores (`yt_dlp/postprocessor/`), y downloader engines (`yt_dlp/downloader/`).
  - `gui_server.py`: Servidor HTTP y WebSockets para la interfaz de usuario web.
  - `web_ui/`: Frontend interactivo (HTML, CSS, JS) para control y descargas visuales.
  - `run_gui.bat`: Script de inicio rápido de la interfaz gráfica.

---

## 2. Integración Obligatoria con GitNexus

Este repositorio está indexado con **GitNexus** (Knowledge Graph de código). Los agentes deben utilizar las herramientas MCP de GitNexus o la CLI (`npx gitnexus <comando>`) antes de realizar cambios estructurales o refactorizaciones complejas.

### 2.1 Flujo de Trabajo con GitNexus (Knowledge Graph)

1. **Exploración de conceptos y flujos de ejecución:**
   - Antes de modificar o añadir soporte para un extractor o componente, busca el flujo en el grafo:
     ```bash
     npx gitnexus query "<concepto o funcionalidad>"
     ```
2. **Contexto 360° de símbolos (Callers / Callees):**
   - Antes de modificar una función, método o clase crítica:
     ```bash
     npx gitnexus context <NombreDelSimbolo>
     ```
3. **Análisis de radio de impacto (Blast Radius):**
   - Antes de alterar firmas de métodos públicos o estructuras internas compartidas:
     ```bash
     npx gitnexus impact <NombreDelSimbolo>
     ```
4. **Trazabilidad de llamadas (Call Graph Tracing):**
   - Para entender cómo se conecta un punto de entrada con un handler:
     ```bash
     npx gitnexus trace <SimboloOrigen> <SimboloDestino>
     ```
5. **Verificación de cambios y Diff Mapping:**
   - Antes de finalizar una tarea o abrir un pull request:
     ```bash
     npx gitnexus detect-changes
     npx gitnexus check
     ```
6. **Actualización del grafo:**
   - Si se han añadido muchos archivos nuevos o reestructurado módulos:
     ```bash
     npx gitnexus analyze
     ```

---

## 3. Reglas de Desarrollo y Buenas Prácticas

### 3.1 Código Python (`yt_dlp` & `gui_server.py`)
- Mantener compatibilidad con los extractores base (`InfoExtractor`).
- No romper firmas existentes sin validar el impacto con GitNexus.
- Manejar excepciones de red y parsing de forma granular (`ExtractorError`, `DownloadError`).
- Preservar comentarios de copyright y licencias existentes.

### 3.2 Interfaz Web (`web_ui/`)
- Diseño estético, responsivo y sin dependencias externas pesadas innecesarias.
- Mantener comunicación fluida por WebSocket con `gui_server.py`.
- No alterar rutas estáticas sin actualizar el handler en `gui_server.py`.

### 3.3 Verificaciones y Testing
- Probar cambios ejecutando tests unitarios o validando extractores con URLs reales o fixtures:
  ```bash
  pytest test/test_download.py
  # O comprobaciones rápidas de sintaxis
  python -m py_compile gui_server.py
  ```

---

## 4. Checklist para el Agente

- [ ] ¿Consulté el contexto o impacto con GitNexus (`context` / `impact`) antes de refactorizar?
- [ ] ¿El código respeta las convenciones del proyecto y no introduce regresiones?
- [ ] ¿Se ejecutó `npx gitnexus detect-changes` o `npx gitnexus check` para validar consistencia?
- [ ] ¿Se documentaron los cambios realizados de forma clara y concisa?

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yt-dlp** (17723 symbols, 67536 relationships, 1244 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "master"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "master" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/yt-dlp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/yt-dlp/clusters` | All functional areas |
| `gitnexus://repo/yt-dlp/processes` | All execution flows |
| `gitnexus://repo/yt-dlp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
