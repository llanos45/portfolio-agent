// ============================================================
// QUALITY GROWTH PORTFOLIO AGENT — v2.4
// Fix v2.4: rate limit 30k tokens/min resuelto
//   - Prompts drásticamente reducidos (perfil compacto)
//   - Llamadas divididas en pasos pequeños secuenciales
//   - Retry con backoff exponencial (30s, 60s, 120s)
//   - maxTokens reducido a 1500 por llamada
//   - Web search activo pero con prompts más cortos
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import * as cron from "node-cron";
import http from "http";

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Quality Growth Agent v2.4 — OK");
}).listen(PORT, () => console.log(`🌐 Puerto ${PORT} activo`));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const RECIPIENT = process.env.RECIPIENT_EMAIL || "i.llanos45@gmail.com";
const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";

// ============================================================
// CARTERA
// ============================================================

const PORTFOLIO = [
  { ticker: "MC.PA", name: "LVMH",       shares: 5.7097,  avg: 569.9,   cur: "€" },
  { ticker: "FICO",  name: "Fair Isaac",  shares: 0.3439,  avg: 1020.62, cur: "$" },
  { ticker: "AMD",   name: "AMD",         shares: 0.1,     avg: 223.57,  cur: "$" },
  { ticker: "MSFT",  name: "Microsoft",   shares: 2.9578,  avg: 379.32,  cur: "$" },
  { ticker: "CELH",  name: "Celsius",     shares: 61.6752, avg: 43.81,   cur: "$" },
  { ticker: "GOOGL", name: "Alphabet",    shares: 19.5725, avg: 150.72,  cur: "$" },
  { ticker: "SATL",  name: "Satellogic",  shares: 130,     avg: 3.75,    cur: "$" },
];

// GRUPO A — propuestas del agente
const WATCHLIST_A = [
  { ticker: "ASML",     name: "ASML Holding",  threshold: 25, cur: "$" },
  { ticker: "V",        name: "Visa",           threshold: 20, cur: "$" },
  { ticker: "NVO",      name: "Novo Nordisk",   threshold: 25, cur: "$" },
  { ticker: "ADYEN.AS", name: "Adyen",          threshold: 30, cur: "€" },
];

// GRUPO B — seguimiento propio del inversor
const WATCHLIST_B = [
  { ticker: "MA",   name: "Mastercard",         threshold: 15, cur: "$" },
  { ticker: "SPGI", name: "S&P Global",          threshold: 20, cur: "$" },
  { ticker: "MCO",  name: "Moody's",             threshold: 15, cur: "$" },
  { ticker: "MELI", name: "MercadoLibre",        threshold: 30, cur: "$" },
  { ticker: "RACE", name: "Ferrari",             threshold: 30, cur: "$" },
  { ticker: "ITX",  name: "Inditex",             threshold: 20, cur: "€" },
];

// ============================================================
// PERFIL COMPACTO (mínimo tokens posible)
// ============================================================

const PROFILE = `
Inversor Quality Growth (Seilern). Horizonte 10-20 años. Aportación 200-300€/mes desde jul-2026.
Cartera: ${PORTFOLIO.map(p => `${p.ticker}@${p.avg}${p.cur}`).join(", ")}.
Watchlist A (agente): ${WATCHLIST_A.map(w => `${w.ticker}(≥${w.threshold}%desc)`).join(", ")}.
Watchlist B (inversor): ${WATCHLIST_B.map(w => `${w.ticker}(≥${w.threshold}%desc)`).join(", ")}.
Reglas: moat sostenible, crecimiento orgánico, ROIC alto, balance sólido, gestión excelente.
`;

const FMT = `FORMATO: Solo HTML puro con inline styles. Sin markdown, sin \`\`\`html, sin asteriscos.`;

// ============================================================
// CLAUDE CON WEB SEARCH — retry exponencial
// ============================================================

async function askClaude(prompt, maxTokens = 1500, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🤖 Claude intento ${attempt}/${retries}...`);

      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout 270s")), 270000)
      );

      const call = anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: `Analista Quality Growth (Seilern). Responde en español, directo y accionable.
Usa web search para precios reales — NUNCA inventes cotizaciones.
${FMT}`,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20260209", name: "web_search" }],
      });

      const res = await Promise.race([call, timeout]);

      let text = res.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .replace(/^```html\s*/im, "")
        .replace(/^```\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();

      console.log(`✅ OK (intento ${attempt})`);
      return text;

    } catch (err) {
      console.error(`❌ Intento ${attempt}: ${err.message}`);
      if (attempt === retries) throw err;
      // Backoff exponencial: 30s, 60s, 120s
      const wait = 30000 * Math.pow(2, attempt - 1);
      console.log(`⏳ Esperando ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ============================================================
// EMAIL
// ============================================================

function wrapHTML(title, content) {
  const fecha = new Date().toLocaleDateString("es-ES", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#f9f9f7;color:#1a1a1a;">
<div style="background:white;border-radius:12px;padding:24px;border:0.5px solid #e5e5e0;">
  <div style="border-bottom:1px solid #f0f0ec;padding-bottom:14px;margin-bottom:20px;">
    <p style="margin:0 0 3px;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.08em;">Quality Growth Portfolio</p>
    <h1 style="margin:0 0 3px;font-size:19px;font-weight:500;">${title}</h1>
    <p style="margin:0;font-size:11px;color:#bbb;">${fecha}</p>
  </div>
  ${content}
  <div style="border-top:1px solid #f0f0ec;padding-top:14px;margin-top:20px;">
    <p style="margin:0;font-size:10px;color:#ccc;">Quality Growth Agent v2.4 · Web search activo · No es asesoramiento financiero</p>
  </div>
</div></body></html>`;
}

async function sendEmail(subject, html) {
  const result = await resend.emails.send({
    from: FROM, to: RECIPIENT, subject,
    html: wrapHTML(subject, html),
  });
  console.log(`📧 Enviado: ${subject} | ${result.data?.id}`);
}

// ============================================================
// RADAR SEMANAL — dividido en 3 llamadas pequeñas
// para no superar el rate limit de 30k tokens/min
// ============================================================

async function weeklyRadar() {
  console.log("📡 Radar semanal...");

  // Llamada 1: Macro + Earnings (prompt corto)
  const p1 = `${PROFILE}
${FMT}
Genera HTML para email con DOS secciones:

<h2>📊 Macro de la semana</h2>
Busca en web 2-3 eventos macro esta semana (Fed, BCE, empleo, PMI) relevantes para esta cartera. Formato: evento | día | impacto.

<h2>📅 Earnings próximos (21 días)</h2>
Busca qué empresas de cartera o watchlist presentan resultados en 21 días. Fecha, consenso EPS, métrica clave. Si no hay ninguna, indícalo.`;

  // Llamada 2: Watchlist A (4 empresas — agente)
  const p2 = `${FMT}
Busca en web el precio actual y máximo 52 semanas de: ASML, V (Visa), NVO (Novo Nordisk), ADYEN.
Genera HTML de una sección con cabecera azul oscuro (#1E3A5F, texto blanco):
"🔍 Radar del agente — oportunidades detectadas"
Para cada empresa: precio actual real | máx 52s real | % descuento calculado | estado (🟢 si supera umbral / 🟡 cerca / ⚪ sin señal).
Umbrales: ASML≥25% V≥20% NVO≥25% ADYEN≥30%.
Una línea de contexto con novedades de la semana si las hay.
Usa fondo #F0FDF4 con borde verde para 🟢, #FFF8E1 con borde naranja para 🟡, #F8FAFC para ⚪.`;

  // Llamada 3: Watchlist B (6 empresas — inversor)
  const p3 = `${FMT}
Busca en web el precio actual y máximo 52 semanas de: MA (Mastercard), SPGI (S&P Global), MCO (Moody's), MELI (MercadoLibre), RACE (Ferrari), ITX (Inditex BME).
Genera HTML de una sección con cabecera verde oscuro (#1A3A1A, texto blanco):
"📋 Tu seguimiento — estado semanal"
Para cada empresa: precio actual real | máx 52s real | % descuento calculado | estado (🟢 si supera umbral / 🟡 cerca / ⚪ sin señal).
Umbrales: MA≥15% SPGI≥20% MCO≥15% MELI≥30% RACE≥30% ITX≥20%.
Una línea de contexto con novedades si las hay.
Usa fondo #F0FDF4 con borde verde para 🟢, #FFF8E1 con borde naranja para 🟡, #F8FAFC para ⚪.`;

  console.log("📡 Paso 1/3: Macro + Earnings...");
  const s1 = await askClaude(p1, 1200);

  // Esperar 45s entre llamadas para respetar el rate limit
  console.log("⏳ Pausa 45s entre llamadas (rate limit)...");
  await new Promise(r => setTimeout(r, 45000));

  console.log("📡 Paso 2/3: Watchlist A (agente)...");
  const s2 = await askClaude(p2, 1200);

  console.log("⏳ Pausa 45s...");
  await new Promise(r => setTimeout(r, 45000));

  console.log("📡 Paso 3/3: Watchlist B (inversor)...");
  const s3 = await askClaude(p3, 1200);

  const combined = `
${s1}
<div style="margin:20px 0;border-top:1px solid #f0f0ec;"></div>
${s2}
<div style="margin:20px 0;border-top:1px solid #f0f0ec;"></div>
${s3}
<div style="margin:20px 0;border-top:1px solid #f0f0ec;"></div>
<div style="background:#F8FAFC;border-radius:8px;padding:14px;font-size:13px;color:#555;">
  <strong>💡 Recuerda:</strong> Presupuesto 200-300€/mes disponible desde julio 2026. Revisa las oportunidades 🟢 antes de la próxima aportación.
</div>`;

  await sendEmail("📡 Radar semanal — Quality Growth", combined);
}

// ============================================================
// REVISIÓN SEMANAL — VIERNES 20:00 (2 llamadas)
// ============================================================

async function weeklyReview() {
  console.log("📊 Revisión semanal...");

  const portList = PORTFOLIO.map(p => `${p.ticker}(compra:${p.avg}${p.cur})`).join(", ");

  const p1 = `${FMT}
Busca en web el precio actual de cierre de hoy de estas acciones: ${portList}.
Genera HTML con:
<h2>📈 Cartera — precios y PyG</h2>
Tabla con columnas: Empresa | Precio compra | Precio actual | PyG% | Var. semanal%
Calcula con los precios reales que encuentres. Fondo #F0FDF4 en filas con PyG positiva, #FEF2F2 en negativa.

<h2>📰 Noticias relevantes</h2>
Las 2-3 noticias más importantes esta semana para empresas en cartera. Solo lo que importa para la tesis de largo plazo.`;

  const p2 = `${FMT}
Busca en web el precio actual de: MA, SPGI, MCO, MELI, RACE, ITX, ASML, V, NVO, ADYEN.
Genera HTML con:
<h2>👁 Watchlist — novedades</h2>
Dos subsecciones (A: agente / B: inversor). Solo menciona las que tengan novedad relevante esta semana. Para el resto, una línea con "sin novedad relevante".

<h2>🎯 Acción recomendada</h2>
Con presupuesto 200-300€/mes disponible desde jul-2026: ¿hay oportunidad clara? Empresa concreta + precio máximo de entrada + razón en 2 frases. Si no: qué posición de cartera priorizar.`;

  console.log("📊 Paso 1/2: Cartera + noticias...");
  const s1 = await askClaude(p1, 1400);

  console.log("⏳ Pausa 45s...");
  await new Promise(r => setTimeout(r, 45000));

  console.log("📊 Paso 2/2: Watchlist + acción...");
  const s2 = await askClaude(p2, 1200);

  await sendEmail("📊 Revisión semanal — Quality Growth", `${s1}<div style="margin:20px 0;border-top:1px solid #f0f0ec;"></div>${s2}`);
}

// ============================================================
// ALERTA EARNINGS — MARTES Y JUEVES 9:00
// ============================================================

async function earningsAlert() {
  console.log("🔔 Earnings alert...");

  const all = [
    ...PORTFOLIO.map(p => p.ticker),
    ...WATCHLIST_A.map(w => w.ticker),
    ...WATCHLIST_B.map(w => w.ticker),
  ].join(", ");

  const prompt = `${FMT}
Busca en web earnings en los próximos 14 días para: ${all}.
Si HAY: genera HTML con fecha exacta, consenso EPS/revenue, métricas clave para tesis Quality Growth.
Si NO hay ninguno: responde solo con el texto: NO_EARNINGS`;

  const content = await askClaude(prompt, 1200);
  if (content.trim().startsWith("NO_EARNINGS")) {
    console.log("ℹ️ Sin earnings. No se envía email.");
    return;
  }
  await sendEmail("🔔 Earnings próximos — Quality Growth", content);
}

// ============================================================
// TEST MANUAL
// ============================================================

async function runManualTest(type = "radar") {
  console.log(`🧪 Test: ${type}`);
  try {
    if (type === "radar")    await weeklyRadar();
    else if (type === "review")   await weeklyReview();
    else if (type === "earnings") await earningsAlert();
    else await weeklyRadar();
    console.log("✅ Test OK");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// ============================================================
// CRON — UTC (Madrid verano = UTC+2)
// ============================================================

console.log("🚀 Quality Growth Agent v2.4 iniciado");
console.log(`📧 → ${RECIPIENT}`);
console.log("📅 Lunes 8h | Viernes 20h | Mar+Jue 9h");
console.log("🌐 Web search ACTIVO | Rate limit: llamadas divididas con pausa 45s");

const safeRun = async (fn, name) => {
  try { await fn(); }
  catch (e) { console.error(`❌ ${name}: ${e.message}`); }
};

cron.schedule("0 6 * * 1",   () => safeRun(weeklyRadar,   "radar"),    { timezone: "UTC" });
cron.schedule("0 18 * * 5",  () => safeRun(weeklyReview,  "review"),   { timezone: "UTC" });
cron.schedule("0 7 * * 2,4", () => safeRun(earningsAlert, "earnings"), { timezone: "UTC" });

// ============================================================
// ARRANQUE
// Railway: RUN_ON_START=test-radar en Variables
// Local:   node agent.js test-radar | test-review | test-earnings
// ============================================================

const arg = process.argv[2] || process.env.RUN_ON_START;
if (arg?.startsWith("test-")) {
  setTimeout(() => runManualTest(arg.replace("test-", "")), 2000);
} else {
  console.log("ℹ️ Modo espera. Cron activo.");
}
