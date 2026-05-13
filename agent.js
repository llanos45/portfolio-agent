const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");
const cron = require("node-cron");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || "i.llanos45@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

const PORTFOLIO = [
  { ticker: "MC.PA", name: "LVMH", shares: 5.7097, avgPrice: 569.9, currency: "EUR", exchange: "Euronext París" },
  { ticker: "FICO",  name: "Fair Isaac", shares: 0.3439, avgPrice: 1020.62, currency: "USD", exchange: "NYSE" },
  { ticker: "AMD",   name: "AMD", shares: 0.1, avgPrice: 223.57, currency: "USD", exchange: "NASDAQ" },
  { ticker: "MSFT",  name: "Microsoft", shares: 2.9578, avgPrice: 379.32, currency: "USD", exchange: "NASDAQ" },
  { ticker: "CELH",  name: "Celsius Holdings", shares: 61.6752, avgPrice: 43.81, currency: "USD", exchange: "NASDAQ" },
  { ticker: "GOOGL", name: "Alphabet", shares: 19.5725, avgPrice: 150.72, currency: "USD", exchange: "NASDAQ" },
  { ticker: "SATL",  name: "Satellogic", shares: 130, avgPrice: 3.75, currency: "USD", exchange: "NASDAQ" },
];

const INVESTOR_PROFILE = `
Inversor con perfil quality growth (metodología Peter Seilern "Solo los mejores lo logran").
Horizonte temporal: 10-20 años. Objetivo: hacer crecer ahorros para comprar vivienda en 5-10 años.
Aportaciones: 200-300€/mes a partir de julio.
Perfil de riesgo: tiene el 90% de sus ahorros invertidos, ~3000€ de cash de reserva.
Filosofía: busca empresas con modelo escalable, líderes en sector, ventaja competitiva sostenible, bajo capex, balance sólido.
Posiciones en pérdidas conocidas: CELH (confianza alta, expansión a Europa) y LVMH (sector lujo afectado por aranceles Trump, espera recuperación en 2 años).
Posiciones ganadoras clave: GOOGL (mayor ganancia), SATL (ya recuperó inversión inicial, solo tiene ganancias).
`;

async function callClaude(prompt) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function generateMondayReport() {
  console.log("Generando informe del lunes...");

  const portfolioStr = PORTFOLIO.map(
    (p) => `- ${p.ticker} (${p.name}): ${p.shares} acciones, precio medio ${p.avgPrice} ${p.currency}`
  ).join("\n");

  const prompt = `Eres un asesor financiero personal experto. Analiza la siguiente cartera y genera el INFORME RADAR SEMANAL del lunes.

CARTERA:
${portfolioStr}

PERFIL DEL INVERSOR:
${INVESTOR_PROFILE}

HOY ES LUNES. Genera un informe HTML completo y profesional con estas secciones:

1. MACRO DE LA SEMANA: eventos económicos importantes esta semana (IPC, empleo, reuniones Fed/BCE, PIB). Busca el calendario económico real de esta semana.

2. EARNINGS EN CARTERA: ¿presenta resultados esta semana alguna empresa de la cartera? Si es así, cuándo exactamente y qué espera el mercado.

3. ALERTAS POR PRÓXIMOS EARNINGS: avisa con al menos 2 semanas de antelación si alguna empresa va a presentar resultados próximamente.

4. EVENTOS DE SECTOR: noticias relevantes para los sectores de la cartera (lujo/LVMH, bebidas energéticas/CELH, semiconductores/AMD, big tech/MSFT+GOOGL, satélites/SATL, fintech/FICO).

5. LA SEÑAL DE LA SEMANA: una sola cosa, la más importante a vigilar esta semana.

6. SENTIMIENTO DE MERCADO: ¿cómo arranca la semana? ¿hay miedo o codicia? ¿VIX elevado?

Busca información REAL y ACTUAL. El informe debe ser accionable y conciso. Formato HTML limpio con estilos inline.`;

  const content = await callClaude(prompt);
  return wrapInEmailTemplate("Radar Semanal", "lunes", content);
}

async function generateFridayReport() {
  console.log("Generando informe del viernes...");

  const portfolioStr = PORTFOLIO.map(
    (p) => `- ${p.ticker} (${p.name}): ${p.shares} acciones, precio medio ${p.avgPrice} ${p.currency}`
  ).join("\n");

  const prompt = `Eres un asesor financiero personal experto. Analiza la siguiente cartera y genera el INFORME DE CIERRE SEMANAL del viernes.

CARTERA:
${portfolioStr}

PERFIL DEL INVERSOR:
${INVESTOR_PROFILE}

HOY ES VIERNES, los mercados americanos acaban de cerrar. Genera un informe HTML completo con estas secciones:

1. TABLA DE POSICIONES: precio actual de cada valor, PyG en euros/dólares y en %, variación vs. semana pasada. Busca precios reales de cierre de HOY para cada ticker.

2. MOVIMIENTOS DESTACADOS DE LA SEMANA: qué ha subido más, qué ha bajado más y por qué. Solo lo relevante.

3. RESUMEN DE NOTICIAS: las 3-5 noticias más importantes de la semana para las empresas de la cartera.

4. ANÁLISIS RÁPIDO DE CADA POSICIÓN: una línea por empresa con el estado actual.

5. ACCIÓN SUGERIDA PARA LA SEMANA QUE VIENE: ¿hay algo a considerar? ¿alguna posición vigilar de cerca? ¿momento de promediar CELH o seguir esperando? Sé concreto y da niveles si los hay.

6. PUNTUACIÓN DE LA SEMANA: de 1 a 10 cómo ha ido la semana para esta cartera y por qué.

Busca precios REALES de cierre de hoy. Sé directo y accionable. Formato HTML limpio con estilos inline.`;

  const content = await callClaude(prompt);
  return wrapInEmailTemplate("Revisión Semanal", "viernes", content);
}

async function checkEarningsAlert() {
  console.log("Verificando earnings próximos...");

  const tickers = PORTFOLIO.map((p) => p.ticker).join(", ");

  const prompt = `Revisa el calendario de resultados (earnings) para estas empresas: ${tickers}

¿Alguna de estas empresas va a presentar resultados en los próximos 14 días?

Si hay earnings próximos, responde SOLO con este JSON (sin markdown, sin explicación):
{
  "hasEarnings": true,
  "companies": [
    {"ticker": "AAPL", "name": "Apple", "date": "2025-05-15", "daysUntil": 3}
  ]
}

Si NO hay earnings próximos, responde SOLO con:
{"hasEarnings": false}`;

  const raw = await callClaude(prompt);

  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const data = JSON.parse(clean);

    if (data.hasEarnings && data.companies?.length > 0) {
      const html = generateEarningsAlertHtml(data.companies);
      await sendEmail(
        "⚠️ Earnings próximos en tu cartera",
        html
      );
      console.log("Alerta de earnings enviada.");
    } else {
      console.log("No hay earnings próximos.");
    }
  } catch (e) {
    console.log("No se pudo parsear respuesta de earnings:", e.message);
  }
}

function generateEarningsAlertHtml(companies) {
  const rows = companies
    .map(
      (c) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;">${c.ticker}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${c.name}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${c.date}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#d97706;font-weight:600;">en ${c.daysUntil} días</td>
    </tr>`
    )
    .join("");

  return wrapInEmailTemplate(
    "Alerta: Earnings Próximos",
    "alerta",
    `<p style="font-size:15px;color:#374151;margin-bottom:20px;">Las siguientes empresas de tu cartera van a presentar resultados próximamente:</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Ticker</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Empresa</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Fecha</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Tiempo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:13px;color:#6b7280;margin-top:16px;">Revisa las expectativas del mercado antes de que presenten para no llevarte sorpresas.</p>`
  );
}

function wrapInEmailTemplate(title, type, content) {
  const typeConfig = {
    lunes: { color: "#1d4ed8", label: "Radar Semanal · Lunes 8:00h", icon: "📡" },
    viernes: { color: "#059669", label: "Revisión Semanal · Viernes 20:00h", icon: "📊" },
    alerta: { color: "#d97706", label: "Alerta de Cartera", icon: "⚠️" },
  };
  const cfg = typeConfig[type] || typeConfig.lunes;
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background:${cfg.color};padding:28px 32px;">
      <div style="font-size:12px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${cfg.label}</div>
      <div style="font-size:22px;font-weight:600;color:#ffffff;">${cfg.icon} ${title}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;">${today}</div>
    </div>

    <div style="padding:28px 32px;">
      ${content}
    </div>

    <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Agente de cartera personal · i.llanos45@gmail.com<br>
        Este informe es generado automáticamente por IA y no constituye asesoramiento financiero profesional.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(subject, html) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject,
      html,
    });
    console.log("Email enviado:", result.data?.id);
  } catch (err) {
    console.error("Error enviando email:", err.message);
  }
}

async function runMonday() {
  const html = await generateMondayReport();
  await sendEmail("📡 Radar Semanal — " + new Date().toLocaleDateString("es-ES"), html);
  await checkEarningsAlert();
}

async function runFriday() {
  const html = await generateFridayReport();
  await sendEmail("📊 Revisión Semanal — " + new Date().toLocaleDateString("es-ES"), html);
}

// Lunes 8:00h (hora Madrid, UTC+2 en verano)
cron.schedule("0 6 * * 1", runMonday, { timezone: "Europe/Madrid" });

// Viernes 20:00h (hora Madrid)
cron.schedule("0 20 * * 5", runFriday, { timezone: "Europe/Madrid" });

// Verificación earnings: martes y jueves a las 9h (para pillarlo siempre con ~14 días de antelación)
cron.schedule("0 9 * * 2,4", checkEarningsAlert, { timezone: "Europe/Madrid" });

console.log("Agente de cartera activo.");
console.log("  · Lunes 8:00h → Radar Semanal");
console.log("  · Viernes 20:00h → Revisión Semanal");
console.log("  · Mar/Jue 9:00h → Verificación Earnings");

// Para test manual: descomenta la línea que quieras probar
// runMonday();
// runFriday();
// checkEarningsAlert();
