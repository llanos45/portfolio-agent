// ============================================================
// QUALITY GROWTH PORTFOLIO AGENT — v2.1
// Autor: Generado para cartera personal Quality Growth
// Stack: Node.js + Anthropic API + Resend + Railway
// Fixes v2.1: HTTP keepalive server + retry automático + timeout
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import * as cron from "node-cron";
import http from "http";

// ============================================================
// SERVIDOR HTTP KEEPALIVE — impide que Railway mate el proceso
// Railway necesita un servidor HTTP activo o mata el contenedor
// ============================================================

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Quality Growth Agent v2.1 — OK");
}).listen(PORT, () => {
  console.log(`🌐 Keepalive server escuchando en puerto ${PORT}`);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT = process.env.RECIPIENT_EMAIL || "i.llanos45@gmail.com";
const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";

// ============================================================
// CONFIGURACIÓN DE CARTERA
// ============================================================

const PORTFOLIO = [
  { ticker: "MC.PA", name: "LVMH", shares: 5.7097, avgPrice: 569.9, currency: "EUR", exchange: "Euronext" },
  { ticker: "FICO", name: "Fair Isaac", shares: 0.3439, avgPrice: 1020.62, currency: "USD", exchange: "NYSE" },
  { ticker: "AMD", name: "Advanced Micro Devices", shares: 0.1, avgPrice: 223.57, currency: "USD", exchange: "NASDAQ" },
  { ticker: "MSFT", name: "Microsoft", shares: 2.9578, avgPrice: 379.32, currency: "USD", exchange: "NASDAQ" },
  { ticker: "CELH", name: "Celsius Holdings", shares: 61.6752, avgPrice: 43.81, currency: "USD", exchange: "NASDAQ" },
  { ticker: "GOOGL", name: "Alphabet", shares: 19.5725, avgPrice: 150.72, currency: "USD", exchange: "NASDAQ" },
  { ticker: "SATL", name: "Satellogic", shares: 130, avgPrice: 3.75, currency: "USD", exchange: "NASDAQ" },
];

// ============================================================
// CANDIDATOS A VIGILAR (watchlist quality growth)
// Umbral de alerta: precio actual ≤ precio de entrada sugerido
// O distancia al máximo 52 semanas ≥ 25%
// ============================================================

const WATCHLIST = [
  {
    ticker: "ASML",
    name: "ASML Holding",
    exchange: "NASDAQ",
    currency: "USD",
    qualityScore: 10,
    entryNotes: "Monopolio EUV. Entrada atractiva si cae >20% desde máx 52s o PER forward < media histórica",
    targetEntryDiscount: 0.25, // alerta si está 25%+ bajo el máx de 52 semanas
  },
  {
    ticker: "V",
    name: "Visa",
    exchange: "NYSE",
    currency: "USD",
    qualityScore: 10,
    entryNotes: "Capital-light, márgenes 50%+. Entrada atractiva en correcciones de mercado",
    targetEntryDiscount: 0.2,
  },
  {
    ticker: "MA",
    name: "Mastercard",
    exchange: "NYSE",
    currency: "USD",
    qualityScore: 10,
    entryNotes: "Gemelo de Visa. Añadir si V ya está en cartera y queda presupuesto",
    targetEntryDiscount: 0.2,
  },
  {
    ticker: "NVO",
    name: "Novo Nordisk",
    exchange: "NYSE",
    currency: "USD",
    qualityScore: 9,
    entryNotes: "Liderazgo GLP-1. Mercado obesidad en expansión masiva. Exposición farma/Europa",
    targetEntryDiscount: 0.25,
  },
  {
    ticker: "ADYEN.AS",
    name: "Adyen",
    exchange: "Euronext",
    currency: "EUR",
    qualityScore: 8,
    entryNotes: "Fintech pagos superior. Añadir solo si cotiza con descuento significativo",
    targetEntryDiscount: 0.3,
  },
];

// ============================================================
// CONTEXTO DEL INVERSOR (para prompts de Claude)
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
6. Baja concentración de clientes o presencia geográfica diversificada
7. Baja intensidad de capital y alta rentabilidad sobre el capital invertido (ROIC)
8. Balance sólido
9. Cuentas transparentes
10. Excelente gestión y gobierno corporativo

POSICIONES ACTUALES:
${PORTFOLIO.map(p => `- ${p.ticker} (${p.name}): ${p.shares} acciones a precio medio ${p.avgPrice}${p.currency === "EUR" ? "€" : "$"}`).join("\n")}

CANDIDATOS EN VIGILANCIA:
${WATCHLIST.map(w => `- ${w.ticker} (${w.name}): Score QG ${w.qualityScore}/10. ${w.entryNotes}`).join("\n")}
`;

// ============================================================
// FUNCIÓN PRINCIPAL: LLAMADA A CLAUDE CON WEB SEARCH
// Incluye retry automático (3 intentos) y timeout de 4 minutos
// ============================================================

async function askClaude(prompt, maxTokens = 1500, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🤖 Llamando a Claude (intento ${attempt}/${retries})...`);

      // Timeout de 4 minutos — Claude con web search puede tardar ~60-90s
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Claude timeout (240s)")), 240000)
      );

      const claudePromise = anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `Eres un analista de inversiones especializado en Quality Growth investing. 
Analizas carteras basándote en los principios de Peter Seilern. 
Respondes siempre en español, de forma directa y accionable. 
Sin disclaimers legales excesivos. El inversor tiene perfil de largo plazo y tolerancia alta al riesgo.
Formato de respuesta: HTML limpio para email (sin CSS externo, solo inline styles básicos).`,
        messages: [{ role: "user", content: prompt }],
      });

      const response = await Promise.race([claudePromise, timeoutPromise]);

      // Extraer texto de bloques de contenido (puede incluir tool_use de web_search)
      const textBlocks = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      console.log(`✅ Claude respondió correctamente (intento ${attempt})`);
      return textBlocks;

    } catch (error) {
      console.error(`❌ Error en intento ${attempt}/${retries}: ${error.message}`);
      if (attempt === retries) {
        throw new Error(`Claude falló tras ${retries} intentos: ${error.message}`);
      }
      // Esperar 15s antes del siguiente intento
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
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; background: #f9f9f7; color: #1a1a1a;">
  <div style="background: white; border-radius: 12px; padding: 28px; border: 0.5px solid #e5e5e0;">
    <div style="border-bottom: 1px solid #f0f0ec; padding-bottom: 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.06em;">Quality Growth Portfolio</p>
      <h1 style="margin: 4px 0 0; font-size: 20px; font-weight: 500;">${title}</h1>
      <p style="margin: 4px 0 0; font-size: 12px; color: #888;">${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
    </div>
    ${content}
    <div style="border-top: 1px solid #f0f0ec; padding-top: 16px; margin-top: 20px;">
      <p style="margin: 0; font-size: 11px; color: #aaa;">Agente Quality Growth · Análisis generado con Claude + web search · No es asesoramiento financiero</p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// INFORME LUNES 8:00 — RADAR SEMANAL
// ============================================================

async function weeklyRadar() {
  console.log("📡 Generando radar semanal (lunes)...");

  const prompt = `
${INVESTOR_PROFILE}

Es lunes por la mañana. Genera un RADAR SEMANAL para esta cartera Quality Growth.

Busca en web la información más reciente y cubre:

1. **MACRO DE LA SEMANA**: 2-3 eventos macroeconómicos relevantes esta semana (Fed, BCE, datos de empleo, PMI, aranceles) que puedan afectar a estas posiciones.

2. **EARNINGS EN CARTERA**: ¿Alguna empresa de la cartera presenta resultados esta semana o en los próximos 14 días? Si es así, fecha exacta y qué métricas seguir.

3. **SEÑAL DE ALERTA PRINCIPAL**: El evento o dato más importante a vigilar esta semana para esta cartera concreta. Sé específico.

4. **WATCHLIST — OPORTUNIDADES**: Para cada empresa de la watchlist (ASML, V, MA, NVO, ADYEN), busca:
   - Precio actual vs máximo de 52 semanas
   - Si está a más del descuento objetivo del umbral (ver perfil), señálalo claramente como OPORTUNIDAD DE ENTRADA
   - Cualquier noticia relevante que cambie la tesis

Formato HTML para email. Usa colores de fondo suaves para destacar alertas (#FFF3CD para avisos, #D4EDDA para positivo, #F8D7DA para negativo). Sé directo y concreto.
`;

  const content = await askClaude(prompt, 2000);
  await sendEmail("📡 Radar semanal — Quality Growth", content);
}

// ============================================================
// INFORME VIERNES 20:00 — REVISIÓN SEMANAL
// ============================================================

async function weeklyReview() {
  console.log("📊 Generando revisión semanal (viernes)...");

  const prompt = `
${INVESTOR_PROFILE}

Es viernes por la tarde. Genera la REVISIÓN SEMANAL de la cartera.

Busca los precios actuales de cierre de todas las posiciones y cubre:

1. **PRECIOS Y PyG ACTUALIZADA**: Para cada posición de la cartera, busca el precio de cierre de hoy y calcula:
   - Precio actual vs precio medio de compra
   - PyG no realizada en € o $
   - Variación semanal (%)

2. **RESUMEN DE NOTICIAS**: Las 2-3 noticias más relevantes de la semana para las empresas en cartera. Solo lo que realmente importa para la tesis de largo plazo.

3. **POSICIÓN CRÍTICA DE LA SEMANA**: ¿Qué posición ha tenido el movimiento más relevante? ¿Cambia algo en la tesis?

4. **ACCIÓN SUGERIDA PARA LA SEMANA QUE VIENE**: 
   - ¿Hay que hacer algo? (promediar, revisar, mantener)
   - Si el presupuesto mensual (200-300€) está disponible, ¿cuál es la mejor oportunidad esta semana entre cartera y watchlist?
   - Sé muy específico: empresa concreta, por qué, a qué precio máximo entrar.

5. **WATCHLIST UPDATE**: Estado rápido de ASML, V, MA, NVO. ¿Alguna ha alcanzado umbral de entrada esta semana?

Formato HTML para email. Tabla simple para los precios. Usa colores de fondo para PyG positiva/negativa.
`;

  const content = await askClaude(prompt, 2000);
  await sendEmail("📊 Revisión semanal — Quality Growth", content);
}

// ============================================================
// ALERTA DE EARNINGS (martes y jueves 9:00)
// ============================================================

async function earningsAlert() {
  console.log("🔔 Verificando earnings próximos...");

  const prompt = `
${INVESTOR_PROFILE}

Busca si alguna empresa de esta cartera presenta resultados en los próximos 14 días:
${PORTFOLIO.map(p => `- ${p.ticker} (${p.name})`).join("\n")}

También revisa la watchlist:
${WATCHLIST.map(w => `- ${w.ticker} (${w.name})`).join("\n")}

Si HAY earnings próximos en los próximos 14 días:
- Fecha exacta y hora (mercado USA o europeo)
- Estimaciones del consenso (EPS y revenue esperado)
- Qué métricas son más importantes para la tesis Quality Growth de esa empresa
- Si hay alguna sorpresa reciente o guía que haya cambiado expectativas

Si NO hay earnings próximos: responde SOLO con el texto "NO_EARNINGS" sin nada más.
`;

  const content = await askClaude(prompt, 1000);

  // Solo enviar email si hay earnings próximos
  if (content.includes("NO_EARNINGS")) {
    console.log("ℹ️ Sin earnings próximos. No se envía email.");
    return;
  }

  await sendEmail("🔔 Alerta earnings próximos — Quality Growth", content);
}

// ============================================================
// ALERTA DE OPORTUNIDAD EN WATCHLIST
// Se ejecuta los lunes junto al radar, pero también se puede lanzar manualmente
// ============================================================

async function watchlistOpportunityAlert() {
  console.log("🎯 Analizando oportunidades en watchlist...");

  const prompt = `
${INVESTOR_PROFILE}

ANÁLISIS DE OPORTUNIDADES DE ENTRADA — WATCHLIST

Para cada empresa de la watchlist, busca datos actuales y evalúa si es momento de entrar:

CRITERIOS DE OPORTUNIDAD (al menos uno debe cumplirse):
A) Precio actual ≤ (máximo 52 semanas × (1 - descuento objetivo))
   - ASML: descuento objetivo 25%
   - V / MA: descuento objetivo 20%  
   - NVO: descuento objetivo 25%
   - ADYEN: descuento objetivo 30%

B) PER forward actual < PER forward histórico promedio 5 años de esa empresa (señal de infravaloración relativa)

C) Noticia negativa temporal (no estructural) que haya causado caída >10% sin cambiar la tesis

Para cada empresa indica:
- Precio actual y máximo 52 semanas
- % de descuento actual desde máximo
- Si cumple criterio A, B o C → marcar como "🟢 OPORTUNIDAD DE ENTRADA"
- Si no cumple ninguno → marcar como "⚪ Vigilar, sin señal aún"
- Contexto breve (1-2 frases) sobre por qué sube/baja

Con presupuesto de 200-300€/mes, ¿cuál sería la primera posición a iniciar y por qué?

Formato HTML para email. Destaca claramente las oportunidades activas.
`;

  const content = await askClaude(prompt, 1500);

  // Verificar si hay oportunidades reales antes de enviar
  if (content.includes("OPORTUNIDAD DE ENTRADA")) {
    await sendEmail("🎯 Oportunidad detectada en watchlist — Quality Growth", content);
  } else {
    console.log("ℹ️ Sin oportunidades de entrada detectadas esta semana.");
  }
}

// ============================================================
// FUNCIÓN DE PRUEBA — Lanzar manualmente
// ============================================================

async function runManualTest(type = "radar") {
  console.log(`🧪 Ejecutando test manual: ${type}`);
  try {
    switch (type) {
      case "radar": await weeklyRadar(); break;
      case "review": await weeklyReview(); break;
      case "earnings": await earningsAlert(); break;
      case "watchlist": await watchlistOpportunityAlert(); break;
      default: await weeklyRadar();
    }
    console.log("✅ Test completado.");
  } catch (err) {
    console.error("❌ Error en test:", err);
  }
}

// ============================================================
// PROGRAMACIÓN DE TAREAS (CRON — hora Madrid UTC+2 en verano)
// Railway ejecuta en UTC. Madrid en verano = UTC+2
// Lunes 8:00 Madrid = lunes 6:00 UTC → "0 6 * * 1"
// Viernes 20:00 Madrid = viernes 18:00 UTC → "0 18 * * 5"
// Martes/Jueves 9:00 Madrid = 7:00 UTC → "0 7 * * 2,4"
// ============================================================

console.log("🚀 Quality Growth Portfolio Agent v2.1 iniciado");
console.log(`📧 Informes a: ${RECIPIENT}`);
console.log("📅 Horario: Lunes 8h (radar) | Viernes 20h (revisión) | Mar+Jue 9h (earnings)");

// Wrapper para capturar errores en cron sin matar el proceso
async function safeRun(fn, name) {
  try {
    await fn();
  } catch (err) {
    console.error(`❌ Error en tarea "${name}": ${err.message}`);
  }
}

// Radar semanal — lunes 8:00 Madrid
cron.schedule("0 6 * * 1", async () => {
  await safeRun(weeklyRadar, "weeklyRadar");
  await safeRun(watchlistOpportunityAlert, "watchlistOpportunityAlert");
}, { timezone: "UTC" });

// Revisión semanal — viernes 20:00 Madrid  
cron.schedule("0 18 * * 5", () => safeRun(weeklyReview, "weeklyReview"), { timezone: "UTC" });

// Alertas earnings — martes y jueves 9:00 Madrid
cron.schedule("0 7 * * 2,4", () => safeRun(earningsAlert, "earningsAlert"), { timezone: "UTC" });

// ============================================================
// ARRANQUE: TEST INMEDIATO SI SE PASA ARGUMENTO
// Uso: node agent.js test-radar | test-review | test-earnings | test-watchlist
// ============================================================

// ============================================================
// ARRANQUE: test por argumento CLI o por variable de entorno
// En Railway: añade variable RUN_ON_START=test-review en Variables
// En local:   node agent.js test-review
// ============================================================

const arg = process.argv[2] || process.env.RUN_ON_START;

if (arg && arg.startsWith("test-")) {
  const type = arg.replace("test-", "");
  // Esperar 2s a que el servidor HTTP arranque antes de lanzar el test
  setTimeout(() => runManualTest(type), 2000);
} else {
  console.log("ℹ️  Agente en modo espera. Cron jobs activos.");
  console.log("💡 Para test: añade variable RUN_ON_START=test-review en Railway → Variables");
}
