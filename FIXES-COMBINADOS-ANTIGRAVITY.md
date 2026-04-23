# 🔧 FIXES COMBINADOS - Google Calendar (Antigravity)

## Resumen
Dos problemas corregidos en `app/api/calendar/callback/route.ts` y `app/api/calendar/create-event/route.ts`:

1. ❌ **Error 403:** Escribiendo en calendar de FERIADOS en lugar del PRINCIPAL
2. ❌ **Zona horaria:** Las citas se guardan en UTC (13:00) en lugar de hora Chile (17:00)

---

## FIX 1: Usar Calendar PRINCIPAL (error 403)

### Archivo: `app/api/calendar/callback/route.ts`

**ENCUENTRA esta sección (línea ~45-55):**

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

console.log('📋 Calendars encontrados:');
calendarList.items?.forEach((cal, idx) => {
  console.log(`  ${idx}: ${cal.summary} (primary: ${cal.primary})`);
});

// Obtener SOLO el calendar principal (primary = true)
// Esto evita escribir en calendar de feriados
const primaryCalendar = calendarList.items?.find(cal => cal.primary === true);

if (!primaryCalendar) {
  console.error('❌ No se encontró calendar principal');
  console.error('Calendars encontrados:', 
    calendarList.items?.map(c => ({ summary: c.summary, primary: c.primary }))
  );
  throw new Error('No se encontró calendar principal. El usuario debe tener un calendar primario activo.');
}

console.log('✅ Calendar principal encontrado:', primaryCalendar.summary);
```

---

## FIX 2: Zona horaria correcta (17:00 no 13:00)

### Archivo: `app/api/calendar/create-event/route.ts`

**ENCUENTRA esta sección (línea ~30-50, donde crea el evento):**

```typescript
const eventBody = {
  summary: `${service} - Paciente (${phone})`,
  description: `Paciente: ${patientName}\nTeléfono: ${phone}\nServicio: ${service}`,
  start: {
    dateTime: `${date}T${time}:00.000Z`, // ❌ INCORRECTO: Z = UTC
    timeZone: "America/Santiago"
  },
  end: {
    dateTime: `${date}T${endTime}:00.000Z`, // ❌ INCORRECTO: Z = UTC
    timeZone: "America/Santiago"
  }
};
```

**REEMPLÁZALO POR:**

```typescript
const eventBody = {
  summary: `${service} - Paciente (${phone})`,
  description: `Paciente: ${patientName}\nTeléfono: ${phone}\nServicio: ${service}`,
  start: {
    dateTime: `${date}T${time}:00`, // ✅ CORRECTO: SIN .Z (es hora local Chile)
    timeZone: "America/Santiago"
  },
  end: {
    dateTime: `${date}T${endTime}:00`, // ✅ CORRECTO: SIN .Z
    timeZone: "America/Santiago"
  }
};
```

**Explicación:**
- `.000Z` = UTC (Zulu time) → 17:00 Chile se convierte a 13:00 UTC ❌
- SIN `.Z` = Hora local → 17:00 se guarda como 17:00 ✅

---

## ✅ VERIFICACIÓN DESPUÉS DE HACER LOS FIXES

### Test 1: Verificar Calendar correcto
1. Desconecta Google Calendar en la app
2. Reconecta
3. Mira los logs en Vercel
4. **Debe verse:**
```
✅ Calendar principal encontrado: [tu email]
```
**NO debe verse:**
```
Feriados Chile
```

### Test 2: Verificar zona horaria
1. Cliente envía: "Quiero agendar para mañana a las 5PM"
2. Bot responde: "✓ Cita agendada para mañana a las 17:00"
3. **En Google Calendar debe aparecer:**
```
17:00 (5PM) ← CORRECTO
```
**NO:**
```
13:00 ← INCORRECTO
```

### Test 3: Verificar en Settings
1. Dashboard → Settings → Calendario
2. **Debe verse la cita a las 17:00**

---

## 🎯 RESUMEN DE CAMBIOS

| Problema | Causa | Fix |
|----------|-------|-----|
| Error 403 | Escribe en calendar de feriados | Usar `.find(cal => cal.primary === true)` |
| Hora incorrecta | Usa formato UTC `.000Z` | Remover `.000Z`, solo `T17:00:00` |

---

## 📋 CHECKLIST ANTES DE ENTREGAR

- [ ] ¿Cambié el `.find()` en callback/route.ts?
- [ ] ¿Remití el `.000Z` de ambas líneas (start y end)?
- [ ] ¿Probé desconectando y reconectando Google Calendar?
- [ ] ¿Agendar una cita y verificar que aparezca a la hora correcta?
- [ ] ¿Los logs muestran "Calendar principal encontrado"?

---

## 🚀 RESULTADO ESPERADO

✅ Bot agenda citas sin error 403
✅ Las citas aparecen a la hora CORRECTA en Google Calendar
✅ Cliente ve las citas en Settings a la hora pedida

**Si algo sigue fallando, reportar:**
- Logs exactos de error
- Qué hora pidió el cliente
- Qué hora se guardó en Calendar
