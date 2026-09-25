# GitNexus Agent Rules

Guía de integración de GitNexus para agentes en este espacio de trabajo.

## Comandos Esenciales de GitNexus

| Propósito | Comando CLI | Herramienta MCP |
| :--- | :--- | :--- |
| **Buscar flujos** | `npx gitnexus query "<término>"` | `gitnexus_query` |
| **Contexto de símbolo** | `npx gitnexus context <símbolo>` | `gitnexus_context` |
| **Análisis de impacto** | `npx gitnexus impact <símbolo>` | `gitnexus_impact` |
| **Trazar rutas** | `npx gitnexus trace <origen> <destino>` | `gitnexus_trace` |
| **Mapear cambios git** | `npx gitnexus detect-changes` | `gitnexus_detect_changes` |
| **Chequeos de integridad** | `npx gitnexus check` | `gitnexus_check` |
| **Reindexar proyecto** | `npx gitnexus analyze` | `gitnexus_analyze` |

## Regla de Decisión

1. **Antes de editar:** Usa `gitnexus impact` o `gitnexus context` en funciones compartidas.
2. **Durante la edición:** No rompas tipos o llamadas sin verificar referencias cruzadas.
3. **Al finalizar:** Ejecuta `gitnexus detect-changes` para revisar que los componentes afectados son los esperados.
