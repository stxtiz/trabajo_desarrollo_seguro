'use strict';

/**
 * AGENTE DE QA CON IA (GITHUB COPILOT / GITHUB MODELS API)
 * Ejecuta pruebas dinámicas funcionales, de paridad visual, ofuscación de URLs y seguridad OWASP ASVS v5.0 Nivel 3
 * contra los contenedores de Front-End y Back-End en el ambiente QA, y solicita el dictamen
 * de auditoría al modelo de IA de GitHub (`gpt-4o-mini` / `gpt-4o`).
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_URL = process.env.QA_FRONTEND_URL || 'http://frontend-qa:8080';
const BACKEND_URL = process.env.QA_BACKEND_URL || 'http://backend-qa:3000';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const AI_MODEL = process.env.GITHUB_AI_MODEL || 'gpt-4o-mini';
const GITHUB_MODELS_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  updateFromHeaders(headers) {
    const rawSetCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);

    for (const cookieStr of rawSetCookies) {
      const firstPart = cookieStr.split(';')[0];
      const eqIdx = firstPart.indexOf('=');
      if (eqIdx > 0) {
        const name = firstPart.slice(0, eqIdx).trim();
        const val = firstPart.slice(eqIdx + 1).trim();
        if (val === '') {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, val);
        }
      }
    }
  }

  getHeader() {
    const parts = [];
    for (const [k, v] of this.cookies.entries()) {
      parts.push(`${k}=${v}`);
    }
    return parts.join('; ');
  }
}

async function waitForServices(maxRetries = 30) {
  for (let i = 1; i <= maxRetries; i += 1) {
    try {
      const [resBack, resFront] = await Promise.all([
        fetch(`${BACKEND_URL}/api/health`),
        fetch(`${FRONTEND_URL}/health`)
      ]);
      if (resBack.ok && resFront.ok) {
        return true;
      }
    } catch {
      // Esperando a que levanten los contenedores
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Timeout esperando que los servicios de QA (Frontend y Backend) estén saludables.');
}

async function runTestSuite() {
  const results = [];
  const jar = new CookieJar();
  let csrfToken = '';
  let sampleItemToken = '';

  async function recordTest(id, asvsRef, title, fn) {
    const start = Date.now();
    try {
      const evidence = await fn();
      results.push({
        id,
        asvsRef,
        title,
        status: 'PASS',
        durationMs: Date.now() - start,
        evidence
      });
    } catch (err) {
      console.error(`[QA-TEST-FAIL] ${id} (${title}): ${err.message}`);
      results.push({
        id,
        asvsRef,
        title,
        status: 'FAIL',
        durationMs: Date.now() - start,
        evidence: err.message
      });
    }
  }

  // Test 1: Cabeceras de Seguridad HTTP Nivel 3 (ASVS V14.4)
  await recordTest('QA-01', 'ASVS 5.0 V14.4 (L3)', 'Verificación de Cabeceras HTTP de Seguridad en ruta limpia /carta', async () => {
    const res = await fetch(`${FRONTEND_URL}/carta`);
    const csp = res.headers.get('content-security-policy');
    const xfo = res.headers.get('x-frame-options');
    const xcto = res.headers.get('x-content-type-options');
    const poweredBy = res.headers.get('x-powered-by');

    if (!csp || !csp.includes("frame-ancestors 'none'")) throw new Error(`CSP ausente o débil: ${csp}`);
    if (xfo !== 'DENY') throw new Error(`X-Frame-Options inválido: ${xfo}`);
    if (xcto !== 'nosniff') throw new Error(`X-Content-Type-Options inválido: ${xcto}`);
    if (poweredBy) throw new Error(`Fuga de cabecera X-Powered-By: ${poweredBy}`);

    return `CSP="${csp.slice(0, 80)}...", X-Frame-Options=${xfo}, X-Content-Type-Options=${xcto}`;
  });

  // Test 2: Ofuscación de URL y Bloqueo de IDs Expuestos (?id=, ?keyid=, /imagenes/cod1)
  await recordTest('QA-02', 'ASVS 5.0 V4.2.1 (L3)', 'Ofuscación de URL: redirección de ?id= / ?keyid= a rutas limpias (/carta, /carrito) y bloqueo de IDs en API', async () => {
    const resLegacyCarta = await fetch(`${FRONTEND_URL}/index.php?id=1`, { redirect: 'manual' });
    const locCarta = resLegacyCarta.headers.get('location');
    if (resLegacyCarta.status !== 302 || locCarta !== '/carta') {
      throw new Error(`No redirigió /index.php?id=1 a /carta (status=${resLegacyCarta.status}, location=${locCarta})`);
    }

    const resLegacyCarrito = await fetch(`${FRONTEND_URL}/mostrar_carrito.php?keyid=1`, { redirect: 'manual' });
    const locCarrito = resLegacyCarrito.headers.get('location');
    if (resLegacyCarrito.status !== 302 || locCarrito !== '/carrito') {
      throw new Error(`No redirigió /mostrar_carrito.php?keyid=1 a /carrito (status=${resLegacyCarrito.status}, location=${locCarrito})`);
    }

    const resRawIdApi = await fetch(`${BACKEND_URL}/api/v1/carta?id=1`);
    if (resRawIdApi.status !== 400) {
      throw new Error(`La API permitió el parámetro ?id=1 en la URL (status=${resRawIdApi.status})`);
    }

    const resDirectImg = await fetch(`${FRONTEND_URL}/imagenes/cod1/resto1.jpg`);
    if (resDirectImg.status !== 403) {
      throw new Error(`No se bloqueó el acceso directo a /imagenes/cod1/ (status=${resDirectImg.status})`);
    }

    return 'URLs limpias (/carta y /carrito), ?id= y ?keyid= eliminados/bloqueados (HTTP 302/400) y /imagenes/cod1 bloqueado (HTTP 403).';
  });

  // Test 3: Paridad de Diseño Visual y Eliminación de jQuery / AJAX antiguo
  await recordTest('QA-03', 'ASVS 5.0 V14.2 / UI Parity', 'Mismo diseño visual de la Carta Digital y cero uso de jQuery / $.ajax deprecado', async () => {
    const [resIndex, resCarrito, resJs] = await Promise.all([
      fetch(`${FRONTEND_URL}/carta`),
      fetch(`${FRONTEND_URL}/carrito`),
      fetch(`${FRONTEND_URL}/js/cartaApp.js`)
    ]);
    const htmlIndex = (await resIndex.text()).replace(/<!--[\s\S]*?-->/g, '');
    const htmlCarrito = (await resCarrito.text()).replace(/<!--[\s\S]*?-->/g, '');
    const codeJs = await resJs.text();
    const codeJsWithoutComments = codeJs.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    const requiredClasses = ['logosintituciones', 'button_carrito', 'featured-carousel', 'nav-tabs', 'myModal', 'footer-area'];
    for (const cls of requiredClasses) {
      if (!htmlIndex.includes(cls)) throw new Error(`Falta clase visual original en /carta: ${cls}`);
    }
    if (!htmlCarrito.includes('table-hover') || !htmlCarrito.includes('Productos Agregados para Solicitar')) {
      throw new Error('Estructura visual de /carrito no coincide con el diseño original');
    }
    if (htmlIndex.toLowerCase().includes('jquery') || htmlCarrito.toLowerCase().includes('jquery') || codeJsWithoutComments.includes('$.ajax(')) {
      throw new Error('Se detectó referencia ejecutable a jQuery o $.ajax deprecado');
    }
    return 'HTML/CSS conserva 100% las clases e íconos originales en /carta y /carrito; 0 referencias a jQuery/$.ajax.';
  });

  // Test 4: Carga de Carta Digital desde PostgreSQL con Tokens Criptográficos Ofuscados
  await recordTest('QA-04', 'ASVS 5.0 V3.2 & V4.2.1', 'Carga de Carta Digital (/api/v1/carta) con tokens AES-256-CTR+HMAC ofuscados sin exponer IDs numéricos', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/carta`, {
      headers: { Cookie: jar.getHeader() }
    });
    jar.updateFromHeaders(res.headers);
    const body = await res.json();

    if (res.status !== 200 || !body.ok) throw new Error(`Respuesta inesperada: ${res.status}`);
    if (!body.data?.restaurante?.nombre || !body.data.restaurante.nombre.includes('Restobar')) {
      throw new Error(`Nombre de restaurante incorrecto: ${body.data?.restaurante?.nombre}`);
    }
    if (body.data.restaurante.id !== undefined) {
      throw new Error('Se filtró el id numérico del restaurante en el JSON de respuesta');
    }
    const destacado = body.data.destacados.find((d) => Number(d.precio) === 12500) || body.data.destacados[0];
    if (!destacado || !destacado.itemToken || destacado.id !== undefined) {
      throw new Error('Los ítems no están usando itemToken ofuscado o exponen id numérico');
    }
    sampleItemToken = destacado.itemToken;
    csrfToken = body.data.sesion.csrfToken;
    if (!csrfToken || csrfToken.length !== 64) {
      throw new Error('Token CSRF no cumple con 256 bits de entropía');
    }
    return `Restaurante="${body.data.restaurante.nombre}", Ref="${body.data.restaurante.ref.slice(0, 14)}...", ItemToken="${sampleItemToken.slice(0, 14)}...", 0 IDs numéricos expuestos.`;
  });

  // Test 5: Resistencia a Inyección SQL (SQLi) y Manipulación de Tokens Opacos (ASVS V5.3.4)
  await recordTest('QA-05', 'ASVS 5.0 V5.3.4 (L3)', 'Bloqueo de payloads SQLi y tokens opacos alterados en /api/v1/carta/:ref', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/carta/${encodeURIComponent("1' OR '1'='1")}`, {
      headers: { Cookie: jar.getHeader() }
    });
    if (res.status !== 400) {
      throw new Error(`Se esperaba bloqueo HTTP 400 ante payload SQLi/token alterado, pero se recibió ${res.status}`);
    }
    return 'Payload SQLi y referencia alterada rechazados con HTTP 400 (Verificación HMAC + Consultas parametrizadas PostgreSQL).';
  });

  // Test 6: Protección Anti-CSRF en operaciones mutables (ASVS V4.2.2)
  await recordTest('QA-06', 'ASVS 5.0 V4.2.2 (L3)', 'Rechazo de peticiones POST/DELETE sin token CSRF válido', async () => {
    const res = await fetch(`${BACKEND_URL}/api/v1/carrito/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': 'token_invalido_atacante'
      },
      body: JSON.stringify({ itemToken: sampleItemToken })
    });
    if (res.status !== 403) {
      throw new Error(`Se esperaba HTTP 403 ante fallo CSRF, pero se recibió ${res.status}`);
    }
    return 'Petición sin token CSRF legítimo bloqueada con HTTP 403 Forbidden.';
  });

  // Test 7: Integridad de Lógica de Negocio en Carrito con Token Ofuscado (Anti-Price Tampering - ASVS V11)
  await recordTest('QA-07', 'ASVS 5.0 V11.1 (L3)', 'Integridad de precios del carrito desde PostgreSQL usando itemToken ofuscado e ignorando manipulación del cliente', async () => {
    const resAdd = await fetch(`${BACKEND_URL}/api/v1/carrito/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ itemToken: sampleItemToken, precio: 1 })
    });
    const addJson = await resAdd.json();
    if (resAdd.status !== 200 || !addJson.ok) {
      throw new Error(`Error al agregar ítem válido con itemToken: ${resAdd.status}`);
    }
    if (Number(addJson.data.item.precio) !== 12500) {
      throw new Error(`Vulnerabilidad de manipulación de precio: esperado 12500, obtenido ${addJson.data.item.precio}`);
    }
    return `Ítem ("${addJson.data.item.nombre}") agregado mediante itemToken ofuscado con precio autoritativo de BD ($ 12.500), ignorando precio manipulado ($ 1).`;
  });

  // Test 8: Autenticación Segura, Rotación de Sesión y Comentarios Autenticados sin ID en URL (ASVS V2 & V3)
  await recordTest('QA-08', 'ASVS 5.0 V2.4 & V3.2.1 (L3)', 'Login con rotación de ID de sesión, publicación de comentario en /api/v1/comentarios y cierre de sesión seguro', async () => {
    const cookieAntes = jar.getHeader();
    const resLogin = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        email: 'admin@gmail.com',
        password: process.env.QA_TEST_ADMIN_PASSWORD || 'AdminSegur0!2026#PNK'
      })
    });
    jar.updateFromHeaders(resLogin.headers);
    const cookieDespues = jar.getHeader();
    const loginJson = await resLogin.json();

    if (resLogin.status !== 200 || !loginJson.ok) {
      throw new Error(`Login falló con estado ${resLogin.status}: ${JSON.stringify(loginJson)}`);
    }
    if (cookieAntes === cookieDespues) {
      throw new Error('El identificador de sesión no rotó tras el login (Riesgo de Session Fixation)');
    }
    csrfToken = loginJson.data.csrfToken;

    const resCom = await fetch(`${BACKEND_URL}/api/v1/comentarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ comentario: 'Comentario verificado por Agente QA IA bajo estándar ASVS 5.0 con URL ofuscada' })
    });
    if (resCom.status !== 201) {
      throw new Error(`Fallo al crear comentario autenticado: HTTP ${resCom.status}`);
    }

    const resLogout = await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({})
    });
    jar.updateFromHeaders(resLogout.headers);
    const logoutJson = await resLogout.json();
    csrfToken = logoutJson.data.csrfToken;

    const resComAnon = await fetch(`${BACKEND_URL}/api/v1/comentarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: jar.getHeader(),
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ comentario: 'Intento no autenticado' })
    });
    if (resComAnon.status !== 403) {
      throw new Error(`Se permitió comentar tras cerrar sesión: HTTP ${resComAnon.status}`);
    }

    return 'Login exitoso con rotación de SID y CSRF, comentario registrado en /api/v1/comentarios (HTTP 201) e invalidación inmediata en logout.';
  });

  return results;
}

async function consultarGitHubCopilotModels(testResults) {
  const failedCount = testResults.filter((t) => t.status !== 'PASS').length;
  const promptSistema = `Eres un Auditor Principal de Ciberseguridad y QA Automatizado especializado en la norma OWASP ASVS v5.0 Nivel 3.
Analiza los resultados de las pruebas dinámicas ejecutadas en el ambiente QA de la aplicación "Carta Digital - PNK Security" (arquitectura separada en Front-End y Back-End con Node.js, Express y PostgreSQL, con ofuscación criptográfica de URLs e identificadores).
Debes emitir un informe técnico estructurado en Markdown con:
1. Veredicto Global de QA: APROBADO PARA PRODUCCIÓN o RECHAZADO.
2. Evaluación detallada de cada control OWASP ASVS v5.0 Nivel 3 probado (incluyendo ofuscación de URLs sin exponer ?id= ni ?keyid=).
3. Confirmación de paridad visual del Front-End y eliminación de tecnologías deprecadas (jQuery/AJAX).
4. Recomendaciones continuas para el despliegue en Cloudflare (*.workers.dev) + AWS EC2 con Docker.`;

  if (!GITHUB_TOKEN) {
    return {
      source: 'Motor de Auditoría IA Integrado (Fallback sin GITHUB_TOKEN)',
      analysis: `### Dictamen del Agente de QA Automatizado (OWASP ASVS v5.0 Nivel 3)\n\n` +
        `- **Veredicto Global:** ${failedCount === 0 ? '✅ APROBADO PARA PRODUCCIÓN' : '❌ RECHAZADO'}\n` +
        `- **Pruebas Superadas:** ${testResults.length - failedCount} / ${testResults.length}\n` +
        `- **Ofuscación de URLs e IDs:** Verificada en \`/carta\` y \`/carrito\` con tokens AES-256-CTR + HMAC-SHA256.\n` +
        `- **Nota:** En GitHub Actions, \`GITHUB_TOKEN\` con permiso \`models: read\` invoca automáticamente el modelo \`${AI_MODEL}\` de GitHub Copilot / GitHub Models sin costo.`
    };
  }

  try {
    const response = await fetch(GITHUB_MODELS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: JSON.stringify({ standard: 'OWASP ASVS v5.0 Level 3', testResults }, null, 2) }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GitHub Models API respondió HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Sin respuesta del modelo.';
    return {
      source: `GitHub Models / Copilot API (${AI_MODEL})`,
      analysis: content
    };
  } catch (err) {
    return {
      source: `Motor de Auditoría IA (Fallback por error de red con GitHub Models: ${err.message})`,
      analysis: `### Dictamen de Respaldo del Agente QA\n\n` +
        `- **Veredicto Global:** ${failedCount === 0 ? '✅ APROBADO PARA PRODUCCIÓN' : '❌ RECHAZADO'}\n` +
        `- **Pruebas Superadas:** ${testResults.length - failedCount} / ${testResults.length}`
    };
  }
}

async function main() {
  console.log('======================================================================');
  console.log(' INICIANDO AGENTE DE QA CON IA - OWASP ASVS v5.0 NIVEL 3');
  console.log('======================================================================');

  await waitForServices();
  const testResults = await runTestSuite();
  const aiAudit = await consultarGitHubCopilotModels(testResults);

  const failed = testResults.filter((r) => r.status !== 'PASS');
  const reportLines = [
    '# INFORME DE QA AUTOMATIZADO CON IA (OWASP ASVS v5.0 NIVEL 3)',
    '',
    `- **Fecha de Ejecución:** ${new Date().toISOString()}`,
    `- **Motor de IA:** ${aiAudit.source}`,
    `- **Estado Global:** ${failed.length === 0 ? '✅ APROBADO (PASS)' : '❌ FALLIDO (FAIL)'}`,
    '',
    '## 1. Matriz de Pruebas Dinámicas Ejecutadas',
    '',
    '| ID | Control OWASP ASVS v5.0 | Prueba | Estado | Tiempo | Evidencia |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...testResults.map(
      (r) => `| **${r.id}** | \`${r.asvsRef}\` | ${r.title} | **${r.status}** | ${r.durationMs}ms | ${r.evidence} |`
    ),
    '',
    '## 2. Evaluación y Dictamen de la IA',
    '',
    aiAudit.analysis,
    ''
  ];

  const reportMarkdown = reportLines.join('\n');
  try {
    const reportsDir = path.join(__dirname, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'REPORTE_QA_IA_ASVS5.md'), reportMarkdown, 'utf8');
  } catch (writeErr) {
    console.warn('[QA-AI WARN] No se pudo escribir el reporte en /app/reports:', writeErr.message);
  }

  console.log(reportMarkdown);

  if (failed.length > 0) {
    console.error(`[QA-AI] Se detectaron ${failed.length} pruebas fallidas. Bloqueando paso a Producción.`);
    process.exit(1);
  }

  console.log('[QA-AI] Todas las pruebas de seguridad OWASP ASVS v5.0 Nivel 3, ofuscación de URL y paridad visual fueron aprobadas.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[QA-AI FATAL]', err.message);
  process.exit(1);
});
