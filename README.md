# Agente de Cartera Personal

Envía automáticamente:
- **Lunes 8:00h** → Radar semanal (macro, earnings, eventos de sector)
- **Viernes 20:00h** → Revisión semanal (precios reales, PyG, acción sugerida)
- **Alertas puntuales** → cuando una empresa de tu cartera va a presentar earnings

---

## Despliegue en Railway (gratis, sin instalar nada)

### Paso 1 — Sube el código a GitHub

1. Ve a [github.com](https://github.com) y crea una cuenta si no tienes
2. Haz clic en **New repository** (botón verde)
3. Ponle nombre: `portfolio-agent`
4. Marca **Private** (para que nadie vea tu código)
5. Haz clic en **Create repository**
6. En la página del repo vacío, haz clic en **uploading an existing file**
7. Arrastra los tres archivos (`agent.js`, `package.json`, `README.md`) a la zona de subida
8. Haz clic en **Commit changes**

### Paso 2 — Despliega en Railway

1. Ve a [railway.app](https://railway.app) y haz clic en **Start a New Project**
2. Selecciona **Deploy from GitHub repo**
3. Autoriza a Railway a acceder a tu GitHub
4. Selecciona el repo `portfolio-agent`
5. Railway detectará automáticamente que es Node.js

### Paso 3 — Añade las variables de entorno (tus API keys)

En Railway, dentro de tu proyecto:
1. Ve a la pestaña **Variables**
2. Añade estas tres variables (una por una):

| Variable | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | tu key de Anthropic (sk-ant-...) |
| `RESEND_API_KEY` | tu key de Resend (re_...) |
| `RECIPIENT_EMAIL` | i.llanos45@gmail.com |
| `FROM_EMAIL` | onboarding@resend.dev |

3. Haz clic en **Deploy** — Railway arrancará el agente automáticamente

### Paso 4 — Verifica que funciona

En Railway, ve a la pestaña **Logs**. Deberías ver:
```
Agente de cartera activo.
  · Lunes 8:00h → Radar Semanal
  · Viernes 20:00h → Revisión Semanal
  · Mar/Jue 9:00h → Verificación Earnings
```

Si quieres forzar un envío de prueba inmediato:
1. En `agent.js`, al final del archivo, descomenta la línea `// runMonday();`
2. Guarda y vuelve a subir a GitHub — Railway redesplegará y enviará el email

---

## Actualizar la cartera

Cuando compres o vendas acciones, edita en `agent.js` el array `PORTFOLIO`:

```js
{ ticker: "GOOGL", name: "Alphabet", shares: 19.5725, avgPrice: 150.72, currency: "USD", exchange: "NASDAQ" },
```

Cambia `shares` y `avgPrice` con tus nuevos datos, guarda, y sube el archivo actualizado a GitHub.

---

## Coste estimado

- **Railway**: gratuito (plan Hobby, 500h/mes — suficiente para este agente)
- **Resend**: gratuito (3.000 emails/mes, tú usarás ~10/mes)
- **Anthropic API**: ~0.05-0.15€ por informe generado (menos de 2€/mes)

**Total estimado: menos de 2€/mes**
