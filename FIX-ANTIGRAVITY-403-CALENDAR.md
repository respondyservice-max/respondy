# 🔴 INSTRUCCIÓN URGENTE - Fijar Error 403 Google Calendar

## Problema
El código está intentando escribir en el calendar de FERIADOS (`en.cl#holiday@group.v.calendar.google.com`) en lugar del calendar PRINCIPAL del usuario.

Error exacto:
```
You need to have writer access to this calendar.
URL: calendars/en.cl%23holiday%40group.v.calendar.google.com/events
```

## Causa
En `app/api/calendar/callback/route.ts`, la línea:
```typescript
const primaryCalendar = calendarList.items?.[0]; // Toma el PRIMER calendar (que es feriados)
```

Debería obtener el calendar PRINCIPAL (el que tiene `primary: true`)

---

## Solución - Cambios EXACTOS a hacer

### Archivo: `app/api/calendar/callback/route.ts`

**ENCUENTRA esta sección:**
```typescript
// Obtener info del calendar
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
const { data: calendarList } = await calendar.calendarList.list();

const primaryCalendar = calendarList.items?.[0];
if (!primaryCalendar) {
  throw new Error('No se encontró calendar');
}
```

**REEMPLÁZALO POR:**
```typescript
// Obtener info del calendar
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
const { data: calendarList } = await calendar.calendarList.list();

console.log('📋 Calendars disponibles:');
calendarList.items?.forEach((cal, idx) => {
  console.log(`${idx}: ${cal.summary} (primary: ${cal.primary})`);
});

// Obtener SOLO el calendar principal (primary = true)
const primaryCalendar = calendarList.items?.find(cal => cal.primary === true);

if (!primaryCalendar) {
  console.error('❌ No se encontró calendar principal');
  console.error('Calendars encontrados:', calendarList.items?.map(c => ({ summary: c.summary, primary: c.primary })));
  throw new Error('No se encontró calendar principal. El usuario debe tener al menos un calendar primario.');
}

console.log('✅ Calendar principal encontrado:', primaryCalendar.summary);
```

---

## Verificación después del cambio

Después de hacer el cambio:

1. **Desconecta Google Calendar** desde la app (Settings → Integraciones → Desconectar)
2. **Reconecta** (Settings → Integraciones → "Autorizar Google Calendar")
3. **Intenta agendar de nuevo:**
   ```
   Cliente: "Quiero agendar blanqueamiento el lunes a las 5PM"
   ```
4. **Verifica logs** en Vercel para confirmar que se encontró el calendar correcto

---

## Qué debería verse en logs ahora

```
📋 Calendars disponibles:
0: Feriados Chile (primary: false)
1: Tu Email (primary: true)
✅ Calendar principal encontrado: Tu Email
✓ Cita agendada para lunes a las 17:00 para blanqueamiento dental.
✅ Cita confirmada por el bot. Creando evento en Google Calendar...
✅ Evento creado exitosamente en Calendar
```

---

## Si sigue fallando

Si el usuario NO tiene un calendar primario (caso muy raro), hacer:

```typescript
// ALTERNATIVA si no hay primary calendar
const primaryCalendar = calendarList.items?.find(cal => 
  cal.summary && !cal.summary.includes('Feriados')
) || calendarList.items?.[1]; // Usa el segundo (no feriados)

if (!primaryCalendar) {
  throw new Error('No se encontró un calendar válido para escribir eventos');
}
```

---

## Testing para confirmar que funciona

1. ✅ Logs muestren "Calendar principal encontrado: [nombre correcto]"
2. ✅ Evento aparezca en Google Calendar del usuario
3. ✅ El evento tenga el título correcto: "Servicio - Paciente (+numero)"
4. ✅ En Settings → Calendario, aparezca la cita agendada

---

## Estado esperado después del fix

- ✅ Bot agenda citas
- ✅ Eventos se crean en Calendar PRINCIPAL (no feriados)
- ✅ Citas aparecen en Settings
- ✅ Flujo completo funcionando

**Una vez hecho, reportar:**
- ¿Se conectó Google Calendar?
- ¿Se creó el evento en Calendar?
- ¿Aparece en Settings → Calendario?
