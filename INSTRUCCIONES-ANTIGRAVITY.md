# 📋 INSTRUCCIONES PARA ANTIGRAVITY - Sistema de Agendamiento con Google Calendar

## Objetivo Final
Crear un sistema donde el bot IA (Groq) consulte disponibilidad en Google Calendar ANTES de agendar, y luego cree automáticamente el evento.

---

## ARQUITECTURA

```
FLUJO COMPLETO:

1. Cliente envía WhatsApp: "Blanqueamiento el lunes a las 5PM"
                ↓
2. Zavu webhook recibe en: app/api/zavu-webhook/route.ts
                ↓
3. Backend llama a app/api/calendar/check-availability
                ↓
4. Backend obtiene: horarios ocupados + libres
                ↓
5. Backend crea prompt DINÁMICO para Groq con info actual
                ↓
6. Groq responde: "✓ Cita agendada" O "Ocupada, opciones: 2PM, 3PM"
                ↓
7. Si está confirmada, backend CREA evento en Google Calendar
                ↓
8. Backend GUARDA en tabla appointments
```

---

## COMPONENTES A CREAR

### 1. **app/api/calendar/check-availability/route.ts**
**Qué hace:** Lee Google Calendar y retorna horarios disponibles

**Entrada:**
```json
{
  "date": "2025-04-21", // Fecha solicitada
  "service": "blanqueamiento", // Tipo de servicio
  "duration": 45 // Duración en minutos
}
```

**Salida:**
```json
{
  "requested_slot": "17:00",
  "is_available": true,
  "occupied_times": ["09:00", "10:30", "14:00", "15:30"],
  "available_slots": ["09:30", "11:00", "12:00", "15:00", "16:00", "17:00", "18:00"],
  "suggested_alternatives": ["16:00", "17:00", "18:00"]
}
```

**Lógica:**
- Leer todos los eventos del Google Calendar del cliente
- Extraer horarios ocupados
- Comparar con horario de la clínica (9AM-6PM lunes-viernes, 9AM-1PM sábado)
- Restar duración del servicio (45 min) para gaps
- Retornar disponibilidad

---

### 2. **app/api/calendar/create-event/route.ts**
**Qué hace:** Crea evento en Google Calendar

**Entrada:**
```json
{
  "business_id": "uuid",
  "patient_name": "Juan Pérez",
  "patient_phone": "+56912345678",
  "service": "blanqueamiento",
  "date": "2025-04-21",
  "time": "17:00"
}
```

**Salida:**
```json
{
  "success": true,
  "event_id": "google_event_id_xyz",
  "event_link": "https://calendar.google.com/...",
  "message": "Evento creado exitosamente"
}
```

**Lógica:**
- Crear evento en Google Calendar usando tokens encriptados del cliente
- Título: "Blanqueamiento dental - Juan Pérez"
- Descripción: Número de teléfono del paciente
- Duración: según servicio (45 min aprox)
- Guardar event_id en tabla appointments para sincronización futura

---

### 3. **Actualizar app/api/zavu-webhook/route.ts**
**Cambios necesarios:**

```typescript
// ANTES:
const botResponse = await callGroq(messageText);
await sendViaZavu(botResponse);

// DESPUÉS:
// 1. Parsear mensaje del cliente
const { service, date, time } = parseClientMessage(messageText);

// 2. Verificar disponibilidad
const availability = await checkAvailability(business_id, date, service);

// 3. Crear prompt DINÁMICO para Groq
const dynamicPrompt = createDynamicPrompt(
  availability,
  targetBusiness.prompt_custom
);

// 4. Llamar Groq con prompt dinámico
const botResponse = await callGroq(messageText, dynamicPrompt);

// 5. Si bot confirmó, crear evento
if (botResponse.includes("✓ Cita agendada")) {
  await createCalendarEvent(business_id, service, date, time, phoneFrom);
}

// 6. Enviar respuesta
await sendViaZavu(botResponse);

// 7. Guardar en conversaciones
await saveConversation(...);
```

---

## TABLAS BD NECESARIAS

### Actualizar tabla `appointments`
```sql
ALTER TABLE appointments ADD COLUMN google_event_id VARCHAR;
ALTER TABLE appointments ADD COLUMN patient_phone VARCHAR;
ALTER TABLE appointments ADD COLUMN status VARCHAR DEFAULT 'confirmed'; -- confirmed, cancelled, rescheduled
```

### Nueva tabla `calendar_config` (opcional)
```sql
CREATE TABLE calendar_config (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  
  service_name VARCHAR,
  duration_minutes INT DEFAULT 45,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## FUNCIONES HELPER A CREAR

### **lib/calendar.ts**

```typescript
// 1. parseClientMessage(text: string)
// Extrae: servicio, fecha, hora del mensaje
// Ej: "Blanqueamiento el lunes a las 5PM" → {service, date, time}

// 2. checkAvailability(businessId, date, service)
// Consulta Google Calendar y retorna horarios libres

// 3. createCalendarEvent(businessId, service, date, time, patientPhone)
// Crea evento en Google Calendar del cliente

// 4. createDynamicPrompt(availability, basePrompt)
// Genera prompt para Groq incluyendo horarios disponibles
// Ej: "Los horarios disponibles el lunes son: 2PM, 3PM, 4PM"

// 5. extractConfirmationFromBotResponse(response)
// Verifica si el bot confirmó la cita
// Busca: "✓ Cita agendada" o similar
```

---

## PROMPT DINÁMICO PARA GROQ

**En lugar de prompt estático, debe incluir:**

```
Eres asistente de agendamiento para CLINICA SMILE.

[BASE PROMPT IGUAL AL ANTERIOR]

INFORMACIÓN IMPORTANTE - DISPONIBILIDAD EN VIVO:
Hoy es [FECHA ACTUAL]
Lunes 21 de abril: horarios OCUPADOS a las [09:00, 10:30, 14:00, 15:30]
Lunes 21 de abril: horarios LIBRES son [09:30, 11:00, 12:00, 15:00, 16:00, 17:00, 18:00]

IMPORTANTE:
- Si el paciente pide una hora OCUPADA (ej 14:00), di: "Esa hora está ocupada. Tengo disponible: 15:00, 16:00, 17:00"
- Si el paciente pide una hora LIBRE, confirma: "✓ Cita agendada"
- NUNCA confirmes una hora que NO está en la lista de LIBRES
```

---

## ERRORES COMUNES A EVITAR

❌ **No hacer:** Crear evento sin verificar disponibilidad primero
✅ **Hacer:** Siempre checkear Calendar → luego crear evento

❌ **No hacer:** Dejar el refresh_token de Google sin usar
✅ **Hacer:** Decryptar token, pasarlo a Google Calendar API

❌ **No hacer:** Crear evento sin guardar event_id en BD
✅ **Hacer:** Guardar event_id para sincronización futura

❌ **No hacer:** Parsear fecha/hora manualmente
✅ **Hacer:** Usar librería como `date-fns` o `moment`

---

## DEPENDENCIES NECESARIAS

```json
{
  "date-fns": "^3.x.x",
  "node-cron": "^3.x.x"
}
```

---

## TESTING

1. **Mock de Google Calendar:**
   - Crear 3 eventos de prueba en tu Calendar
   - Verificar que `checkAvailability` los detecta correctamente

2. **Test de flujo completo:**
   - Cliente envía: "Blanqueamiento el lunes a las 9:30AM"
   - Backend debe: verificar → está libre → crear → confirmar
   
3. **Test de hora ocupada:**
   - Cliente envía: "Blanqueamiento el lunes a las 9:00AM" (ocupado)
   - Backend debe: verificar → está ocupado → sugerir alternativas

---

## ORDEN DE IMPLEMENTACIÓN

1. ✅ Crear `app/api/calendar/check-availability/route.ts`
2. ✅ Crear `app/api/calendar/create-event/route.ts`
3. ✅ Crear funciones helper en `lib/calendar.ts`
4. ✅ Actualizar `app/api/zavu-webhook/route.ts`
5. ✅ Actualizar tabla `appointments` en Supabase
6. ✅ Crear prompt dinámico
7. ✅ Testing end-to-end

---

## RESULTADO ESPERADO

✅ Bot consulta Calendar ANTES de agendar
✅ Bot sugiere horarios libres si la hora pedida está ocupada
✅ Bot crea eventos automáticamente en Google Calendar del cliente
✅ Los eventos aparecen en Settings → Calendario
✅ Cliente puede editar/cancelar desde el panel

---

## NOTAS IMPORTANTES

- **Tokens de Google:** Están encriptados en BD. Decryptar antes de usar
- **Zonas horarias:** Todos los times en formato 24h, zona horaria Chile (UTC-3/-4)
- **Concurrencia:** Si dos clientes piden la misma hora, el primero gana
- **Notificaciones:** Después, integrar SMS a paciente con Zavu

---

**Cuando esté listo, reportar:**
- ✅ Endpoints funcionando
- ✅ Eventos creándose en Calendar
- ✅ Bot sugiriendo horarios disponibles
- ✅ Sin errores en logs
