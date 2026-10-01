# Conectarlo todo (una vez, con el código definitivo)

1. **Código**: GitHub → `crm/Code.gs` → «Copy raw file» → Apps Script: borrar todo, pegar, guardar.
2. Ejecutar **`configurar`** (añade columnas ocultas nuevas y Ajustes G6-G8; no borra leads).
3. **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar** (la URL no cambia).
4. **Ajustes**:
   - A/B: renombrar el caller **MARIO** a **Mario.e** (y darle su PIN).
   - G3: URL del CRM (`https://test-crm-app-eosin.vercel.app` o `https://crm.tudominio.com`).
   - G6: token de Calendly (Integraciones → API y webhooks → Personal access tokens → crear).
   - G7/G8: acceso maestro → **Mario** (fundador) + su PIN.
5. **Pruebas**:
   - Formulario que cualifica → agendar → página «ATENCIÓN» → CRM: Autoagendado, sin caller. Cancelar la reserva.
   - Entrar al CRM como Mario.e → asignarse un lead → nota «llamar a las HH:MM» → sale ⏰ y a esa hora sube y avisa Slack.
   - Entrar como Mario (maestro) → «KPIs del equipo».
