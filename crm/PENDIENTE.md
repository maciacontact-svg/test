# Pendiente de instalar (cuando acabemos los cambios)

Se hace **una sola vez al final**, con el código definitivo:

1. Copiar `crm/Code.gs` desde GitHub (botón «Copy raw file») → pegar en Apps Script → guardar.
2. Ejecutar `configurar` (añade las columnas ocultas nuevas y, en Ajustes, G6-G8).
3. Implementar → Gestionar implementaciones → ✏️ → **Nueva versión** → Implementar (la URL no cambia).
4. Ajustes:
   - **G6**: token de Calendly (Calendly → Integraciones → API y webhooks → Personal access tokens).
   - **G7/G8**: tu nombre y PIN de acceso maestro.
   - Renombrar el caller **MARIO** a **Mario.e** (columna A) y pasarle su PIN.
5. Prueba: formulario que cualifica → agendar → página «ATENCIÓN» → en el CRM, Autoagendado. Cancelar la reserva en Calendly.
