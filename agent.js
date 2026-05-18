// ============================================================
// QUALITY GROWTH PORTFOLIO AGENT — v2.3
// Fixes v2.3:
//   - Web search NATIVO activado en todas las llamadas a Claude
//     → precios y datos en tiempo real, sin alucinaciones
//   - Watchlist dividida en dos grupos:
//       GRUPO A: propuestas proactivas del agente (ASML, NVO, ADYEN, V...)
//       GRUPO B: acciones que el inversor pasa para seguimiento propio
//   - askClaude() maneja respuestas con bloques server_tool_use
//   - Bug ´´´html eliminado: instrucción explícita + limpieza defensiva
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import * as cron from "node-cron";
import http from "http";

// ============================================================
// SERVIDOR HTTP KEEPALIVE
// ============================================================

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Quality Growth Agent v2.3 — OK");
}).listen(PORT, () => {
  console.log(`🌐 Keepalive server escuchando en puerto ${PORT}`);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT = process.env.RECIPIENT_EMAIL || "i.llanos45@gmail.com";
const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";

// ============================================================
// CARTERA ACTUAL
// ============================================================

const PORTFOLIO = [
  { ticker: "MC.PA",  name: "LVMH",                 shares: 5.7097,  avgPrice: 569.9,   currency: "EUR" },
  { ticker: "FICO",   name: "Fair Isaac (FICO)",     shares: 0.3439,  avgPrice: 1020.62, currency: "USD" },
  { ticker: "AMD",    name: "Advanced Micro Devices",shares: 0.1,     avgPrice: 223.57,  currency: "USD" },
  { ticker: "MSFT",   name: "Microsoft",             shares: 2.9578,  avgPrice: 379.32,  currency: "USD" },
  { ticker: "CELH",   name: "Celsius Holdings",      shares: 61.6752, avgPrice: 43.81,   currency: "USD" },
  { ticker: "GOOGL",  name: "Alphabet",              shares: 19.5725, avgPrice: 150.72,  currency: "USD" },
  { ticker: "SATL",   name: "Satellogic",            shares: 130,     avgPrice: 3.75,    currency: "USD" },
];

// ============================================================
// WATCHLIST — GRUPO A: PROPUESTAS PROACTIVAS DEL AGENTE
// El agente busca semanalmente oportunidades en este universo
// y propone incorporaciones al inversor
// ============================================================

const WATCHLIST_AGENT = [
  {
    ticker: "ASML",
    name: "ASML Holding",
    currency: "USD",
    qualityScore: 10,
    targetEntryDiscount: 0.25,
    entryNotes: "Monopolio absoluto EUV. Única empresa capaz de fabricar litografía EUV en el mundo. Barrera de entrada imposible de replicar. Alerta si cotiza con descuento ≥25% desde máx 52s.",
  },
  {
    ticker: "V",
    name: "Visa",
    currency: "USD",
    qualityScore: 10,
    targetEntryDiscount: 0.20,
    entryNotes: "Red de pagos más grande del mundo, capital-light, márgenes >50%. Alerta si descuento ≥20% desde máx 52s.",
  },
  {
    ticker: "NVO",
    name: "Novo Nordisk",
    currency: "USD",
    qualityScore: 9,
    targetEntryDiscount: 0.25,
    entryNotes: "Liderazgo GLP-1 en mercado obesidad. Ozempic/Wegovy. Exposición farma/Europa. Alerta si descuento ≥25%.",
  },
  {
    ticker: "ADYEN.AS",
    name: "Adyen",
    currency: "EUR",
    qualityScore: 8,
    targetEntryDiscount: 0.30,
    entryNotes: "Fintech pagos superior, infraestructura end-to-end propia. Alerta solo con descuento ≥30%.",
  },
];

// ============================================================
// WATCHLIST — GRUPO B: SEGUIMIENTO PROPIO DEL INVERSOR
// Acciones que el inversor pasa para estudiar y decidir entrada
// El agente reporta su estado semanal pero no propone nuevas
// ============================================================

const WATCHLIST_INVESTOR = [
  {
    ticker: "MA",
    name: "Mastercard",
    currency: "USD",
    qualityScore: 10,
    targetEntryDiscount: 0.15,
    entryNotes: "Red pagos global asset-light. ~40% ingresos son servicios valor añadido. Cross-border crece doble dígito. Entrada si descuento ≥15% desde máx 52s.",
  },
  {
    ticker: "SPGI",
    name: "S&P Global",
    currency: "USD",
    qualityScore: 10,
    targetEntryDiscount: 0.20,
    entryNotes: "Duopolio ratings con Moody's. Dueña del índice S&P 500. Margen operativo ~43%. Entrada si descuento ≥20%.",
  },
  {
    ticker: "MCO",
    name: "Moody's Corporation",
    currency: "USD",
    qualityScore: 10,
    targetEntryDiscount: 0.15,
    entryNotes: "Duopolio ratings. Modelos embebidos regulatoriamente, menor riesgo IA. Retention ~97%. Entrada si descuento ≥15%.",
  },
  {
    ticker: "MELI",
    name: "MercadoLibre",
    currency: "USD",
    qualityScore: 9,
    targetEntryDiscount: 0.30,
    entryNotes: "Dominador ecommerce latinoamericano. Moat logístico + fintech Mercado Pago. Caída táctica por envío gratis Brasil. Entrada si descuento ≥30%.",
  },
  {
    ticker: "RACE",
    name: "Ferrari",
    currency: "USD",
    qualityScore: 9,
    targetEntryDiscount: 0.30,
    entryNotes: "Brand moat inigualable. Lista de espera estructural. Pricing power máximo. Crecimiento más moderado. Entrada si descuento ≥30%.",
  },
  {
    ticker: "ITX",
    name: "Inditex",
    currency: "EUR",
    qualityScore: 9,
    targetEntryDiscount: 0.20,
    entryNotes: "Líder mundial fast fashion. Ventaja en velocidad (2-3 semanas diseño→tienda vs 6+ meses industria). Alto ROIC. Entrada si descuento ≥20%.",
  },
];

// ============================================================
// PERFIL DEL INVERSOR
// ============================================================

const INVESTOR_PROFILE = `
PERFIL DEL INVERSOR:
- Filosofía: Quality Growth (Peter Seilern, "Solo los mejores lo logran")
- Horizonte: 10-20 años, cartera de largo plazo
- Aportación mensual: 200-300€/mes (julio-diciembre 2026)
- Aportaciones extra: pagas extra junio/diciembre + variable anual (~2.900€) en Q1
- Cash reserva: ~3.000€ (no tocar salvo emergencia real)
- Objetivo adicional: vivienda 400-500k€ en 5-10 años
- Convicción alta en: CELH (expansión Europa, precio objetivo ~60$), GOOGL (mayor posición)
- Preocupaciones: concentración GOOGL, recuperación LVMH, posición residual AMD

LAS 10 REGLAS QUALITY GROWTH:
1. Modelo de negocio escalable
2. Industrias en crecimiento estructural
3. Compañías líderes en su sector
4. Ventaja competitiva sostenible
5. Fuerte crecimiento orgánico de ventas
6. Baja concentración de clientes / presencia geográfica diversificada
7. Baja intensidad de capital y alta ROIC
8. Balance sólido
9. Cuentas transparentes
10. Excelente gestión y gobierno corporativo

CARTERA ACTUAL:
${PORTFOLIO.map(p => `- ${p.ticker} (${p.name}): ${p.shares} acciones a precio medio ${p.avgPrice}${p.currency === "EUR" ? "€" : "$"}`).join("\n")}

WATCHLIST GRUPO A — PROPUESTAS PROACTIVAS DEL AGENTE:
${WATCHLIST_AGENT.map(w => `- ${w.ticker} (${w.name}): Score QG ${w.qualityScore}/10. Descuento objetivo: ${w.targetEntryDiscount * 100}%. ${w.entryNotes}`).join("\n")}

WATCHLIST GRUPO B — SEGUIMIENTO PROPIO DEL INVERSOR:
${WATCHLIST_INVESTOR.map(w => `- ${w.ticker} (${w.name}): Score QG ${w.qualityScore}/10. Descuento objetivo: ${w.targetEntryDiscount * 100}%. ${w.entryNotes}`).join("\n")}
`;

// ============================================================
// INSTRUCCIÓN ANTI-MARKDOWN
// ============================================================

const HTML_INSTRUCTION = `
INSTRUCCIÓN CRÍTICA DE FORMATO:
- Responde ÚNICAMENTE con HTML puro listo para insertar en el body de un email.
- NUNCA uses bloques de código markdown. No escribas \`\`\`html ni \`\`\` en ningún momento.
- NUNCA uses asteriscos (*), almohadillas (#) ni ningún otro marcador markdown.
- Solo HTML con atributos style inline. Sin clases CSS externas ni hojas de estilo.
- No incluyas <html>, <head> ni <body>. Solo el contenido interior.
`;

// ============================================================
// LLAMADA A CLAUDE CON WEB SEARCH NATIVO + RETRY
// ============================================================

async function askClaude(prompt, maxTokens = 2500, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🤖 Llamando a Claude con web search (intento ${attempt}/${retries})...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Claude timeout (300s)")), 300000)
      );

      const claudePromise = anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: `Eres un analista de inversiones especializado en Quality Growth investing.
Analizas carteras basándote en los principios de Peter Seilern.
Respondes siempre en español, de forma directa y accionable.
Sin disclaimers legales excesivos. El inversor tiene perfil de largo plazo y tolerancia alta al riesgo.
Tienes acceso a búsqueda web en tiempo real — ÚSALA SIEMPRE para obtener precios actuales,
máximos de 52 semanas y noticias recientes. NUNCA inventes precios ni datos de mercado.
FORMATO: Responde SIEMPRE en HTML puro con inline styles. NUNCA uses markdown ni \`\`\`html.`,
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
          }
        ],
      });

      const response = await Promise.race([claudePromise, timeoutPromise]);

      // Extraer solo bloques de texto final (ignorar server_tool_use y resultados de búsqueda)
      let text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      // Limpieza defensiva de markdown residual
      text = text
        .replace(/^```html\s*/im, "")
        .replace(/^```\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();

      console.log(`✅ Claude respondió con web search (intento ${attempt})`);
      return text;

    } catch (error) {
      console.error(`❌ Error intento ${attempt}/${retries}: ${error.message}`);
      if (attempt === retries) throw new Error(`Claude falló tras ${retries} intentos: ${error.message}`);
      console.log(`⏳ Esperando 15s antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}

// ============================================================
// ENVÍO DE EMAIL
// ============================================================

async function sendEmail(subject, htmlContent) {
  try {
    const result = await resend.emails.send({
      from: FROM,
      to: RECIPIENT,
      subject: subject,
      html: wrapEmailHTML(subject, htmlContent),
    });
    console.log(`✅ Email enviado: ${subject} | ID: ${result.data?.id}`);
    return result;
  } catch (error) {
    console.error(`❌ Error enviando email: ${error.message}`);
    throw error;
  }
}

function wrapEmailHTML(title, content) {
  const fecha = new Date().toLocaleDateString("es-ES", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; background: #f9f9f7; color: #1a1a1a;">
  <div style="background: white; border-radius: 12px; padding: 28px; border: 0.5px solid #e5e5e0;">

    <div style="border-bottom: 1px solid #f0f0ec; padding-bottom: 16px; margin-bottom: 24px;">
      <p style="margin: 0 0 4px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.08em;">Quality Growth Portfolio</p>
      <h1 style="margin: 0 0 4px; font-size: 20px; font-weight: 500; color: #1a1a1a;">${title}</h1>
      <p style="margin: 0; font-size: 12px; color: #aaa;">${fecha}</p>
    </div>

    ${content}

    <div style="border-top: 1px solid #f0f0ec; padding-top: 16px; margin-top: 24px;">
      <p style="margin: 0; font-size: 11px; color: #bbb; line-height: 1.5;">
        Agente Quality Growth v2.3 · Datos en tiempo real con web search · No es asesoramiento financiero
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ============================================================
// RADAR SEMANAL — LUNES 8:00
// ============================================================

async function weeklyRadar() {
  console.log("📡 Generando radar semanal (lunes)...");

  const prompt = `
${INVESTOR_PROFILE}

${HTML_INSTRUCTION}

Es lunes por la mañana. Usa web search para obtener datos reales y genera el RADAR SEMANAL.
Busca precios actuales, máximos de 52 semanas y noticias recientes de todas las empresas.

SECCIÓN 1 — MACRO DE LA SEMANA
2-3 eventos macroeconómicos de esta semana (Fed, BCE, empleo, PMI, aranceles) que afecten a estas posiciones.
Formato: evento | día | impacto esperado en la cartera.

SECCIÓN 2 — EARNINGS PRÓXIMOS (21 días)
Busca qué empresas de cartera Y watchlist presentan resultados en los próximos 21 días.
Para cada una: fecha exacta, consenso EPS/revenue, métricas clave a seguir.

SECCIÓN 3 — ALERTA PRINCIPAL DE LA SEMANA
El único evento más importante a vigilar esta semana para esta cartera. Muy concreto.

SECCIÓN 4A — WATCHLIST GRUPO A: PROPUESTAS DEL AGENTE
Cabecera con fondo #1E3A5F texto blanco. Título: "🔍 Radar del agente — oportunidades detectadas"
Empresas: ASML, V, NVO, ADYEN
Para cada una busca en web el precio actual real y el máximo de 52 semanas real:
- Precio actual | Máximo 52s | % descuento calculado
- Estado: 🟢 OPORTUNIDAD (≥umbral objetivo) | 🟡 Cerca | ⚪ Sin señal
- Descuentos objetivo: ASML ≥25% | V ≥20% | NVO ≥25% | ADYEN ≥30%
- Una línea de contexto con novedades de la semana

SECCIÓN 4B — WATCHLIST GRUPO B: SEGUIMIENTO DEL INVERSOR
Cabecera con fondo #1A3A1A texto blanco. Título: "📋 Tu seguimiento — estado semanal"
Empresas: MA, SPGI, MCO, MELI, RACE, ITX
Para cada una busca en web el precio actual real y el máximo de 52 semanas real:
- Precio actual | Máximo 52s | % descuento calculado
- Estado: 🟢 OPORTUNIDAD (≥umbral objetivo) | 🟡 Cerca | ⚪ Sin señal
- Descuentos objetivo: MA ≥15% | SPGI ≥20% | MCO ≥15% | MELI ≥30% | RACE ≥30% | ITX ≥20%
- Una línea de contexto con novedades

SECCIÓN 5 — ACCIÓN RECOMENDADA
Con presupuesto 200-300€/mes disponible a partir de julio 2026:
¿Hay oportunidad clara ahora? → empresa concreta + precio máximo de entrada + razón.
Si no → cuál posición de cartera priorizar.

Colores: oportunidad activa #F0FDF4 borde #22C55E | aviso #FFF8E1 borde #F59E0B | riesgo #FEF2F2 borde #EF4444
Usa datos reales de web search. NUNCA inventes precios.
`;

  const content = await askClaude(prompt, 3000);
  await sendEmail("📡 Radar semanal — Quality Growth", content);
}

// ============================================================
// REVISIÓN SEMANAL — VIERNES 20:00
// ============================================================

async function weeklyReview() {
  console.log("📊 Generando revisión semanal (viernes)...");

  const prompt = `
${INVESTOR_PROFILE}

${HTML_INSTRUCTION}

Es viernes por la tarde. Usa web search para precios reales de cierre de hoy.
Genera la REVISIÓN SEMANAL:

SECCIÓN 1 — PRECIOS Y PyG ACTUALIZADA
Busca el precio actual real de CADA posición de la cartera.
Tabla HTML: Empresa | Precio compra | Precio actual (real) | PyG % | Var. semanal %
Fondo verde (#F0FDF4) en PyG positiva, rojo (#FEF2F2) en PyG negativa.

SECCIÓN 2 — NOTICIAS RELEVANTES
Las 2-3 noticias más importantes de la semana para empresas en cartera. Solo lo relevante para tesis LP.

SECCIÓN 3 — POSICIÓN DE LA SEMANA
La posición con movimiento más relevante. ¿Cambia algo en la tesis Quality Growth?

SECCIÓN 4 — WATCHLIST NOVEDADES (Grupos A y B separados visualmente)
Estado rápido. Solo las que tengan novedad relevante esta semana.

SECCIÓN 5 — ACCIÓN PARA LA SEMANA QUE VIENE
Una recomendación concreta: empresa + precio máximo de entrada o acción en cartera.
`;

  const content = await askClaude(prompt, 3000);
  await sendEmail("📊 Revisión semanal — Quality Growth", content);
}

// ============================================================
// ALERTA EARNINGS — MARTES Y JUEVES 9:00
// ============================================================

async function earningsAlert() {
  console.log("🔔 Verificando earnings próximos...");

  const prompt = `
${INVESTOR_PROFILE}

${HTML_INSTRUCTION}

Busca en web si alguna empresa de la cartera O de la watchlist presenta resultados en los próximos 14 días.

CARTERA: ${PORTFOLIO.map(p => p.ticker).join(", ")}
WATCHLIST A: ${WATCHLIST_AGENT.map(w => w.ticker).join(", ")}
WATCHLIST B: ${WATCHLIST_INVESTOR.map(w => w.ticker).join(", ")}

Si HAY earnings: fecha exacta, consenso EPS/revenue, métricas clave para la tesis QG.
Si NO hay ninguno en 14 días: responde ÚNICAMENTE con el texto: NO_EARNINGS
`;

  const content = await askClaude(prompt, 1500);
  if (content.trim().startsWith("NO_EARNINGS")) {
    console.log("ℹ️ Sin earnings próximos. No se envía email.");
    return;
  }
  await sendEmail("🔔 Earnings próximos — Quality Growth", content);
}

// ============================================================
// TEST MANUAL
// ============================================================

async function runManualTest(type = "radar") {
  console.log(`🧪 Ejecutando test manual: ${type}`);
  try {
    switch (type) {
      case "radar":    await weeklyRadar();   break;
      case "review":   await weeklyReview();  break;
      case "earnings": await earningsAlert(); break;
      default:         await weeklyRadar();
    }
    console.log("✅ Test completado.");
  } catch (err) {
    console.error("❌ Error en test:", err);
  }
}

// ============================================================
// CRON JOBS (UTC — Madrid verano = UTC+2)
// ============================================================

console.log("🚀 Quality Growth Portfolio Agent v2.3 iniciado");
console.log(`📧 Informes a: ${RECIPIENT}`);
console.log("📅 Lunes 8h (radar) | Viernes 20h (revisión) | Mar+Jue 9h (earnings)");
console.log("🌐 Web search NATIVO: ACTIVO — precios en tiempo real");

async function safeRun(fn, name) {
  try { await fn(); }
  catch (err) { console.error(`❌ Error en tarea "${name}": ${err.message}`); }
}

cron.schedule("0 6 * * 1",   () => safeRun(weeklyRadar,   "weeklyRadar"),   { timezone: "UTC" });
cron.schedule("0 18 * * 5",  () => safeRun(weeklyReview,  "weeklyReview"),  { timezone: "UTC" });
cron.schedule("0 7 * * 2,4", () => safeRun(earningsAlert, "earningsAlert"), { timezone: "UTC" });

// ============================================================
// ARRANQUE
// Railway: añade RUN_ON_START=test-radar en Variables
// Local:   node agent.js test-radar | test-review | test-earnings
// ============================================================

const arg = process.argv[2] || process.env.RUN_ON_START;
if (arg && arg.startsWith("test-")) {
  setTimeout(() => runManualTest(arg.replace("test-", "")), 2000);
} else {
  console.log("ℹ️  Modo espera. Cron jobs activos.");
  console.log("💡 Test: añade RUN_ON_START=test-radar en Railway → Variables");
}
