/**
 * CLOUDFLARE WORKER GRATUITO (SIN COMPRAR DOMINIO)
 * Subdominio fijo gratuito: https://carta-digital.basty46.workers.dev
 *
 * Actúa como Proxy Inverso + Borde de Seguridad HTTPS (TLS 1.3) en Cloudflare
 * apuntando hacia tu instancia AWS EC2 Ubuntu con Docker (OWASP ASVS v5.0 Nivel 3).
 */

function normalizeEc2Origin(rawOrigin) {
  let origin = String(rawOrigin || '').trim();
  if (!origin || origin.includes('TU_IP_PUBLICA_EC2')) {
    return null;
  }
  if (!/^https?:\/\//i.test(origin)) {
    origin = 'http://' + origin;
  }
  // Cloudflare Workers bloquea fetch() directo a IPs numéricas con Error 1003.
  // Convertimos automáticamente http://A.B.C.D a http://A.B.C.D.sslip.io (DNS comodín gratuito que resuelve a la misma IP)
  return origin.replace(
    /^(https?:\/\/)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/i,
    '$1$2.sslip.io$3$4'
  );
}

export default {
  async fetch(request, env) {
    const rawOrigin = env.EC2_ORIGIN_URL || 'http://TU_IP_PUBLICA_EC2';
    const ec2Origin = normalizeEc2Origin(rawOrigin);

    if (!ec2Origin) {
      return new Response(
        'Falta configurar la IP publica de tu AWS EC2 en EC2_ORIGIN_URL (Settings -> Variables and Secrets o en la linea 27 de worker.js).',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const incomingUrl = new URL(request.url);

    // Regla WAF de Borde (ASVS v5.0 V14): Bloquear acceso a rutas ocultas o escáneres
    const blockedPaths = ['/.env', '/.git', '/wp-admin', '/phpmyadmin'];
    if (blockedPaths.some((p) => incomingUrl.pathname.toLowerCase().includes(p))) {
      return new Response('Forbidden by Cloudflare ASVS 5.0 Edge Filter', { status: 403 });
    }

    // Construir URL hacia el contenedor Front-End en AWS EC2
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ec2Origin);

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.delete('Host');
    modifiedHeaders.set('X-Forwarded-Proto', 'https');
    modifiedHeaders.set('X-Forwarded-Host', incomingUrl.host);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: modifiedHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      redirect: 'manual'
    });

    const response = await fetch(proxyRequest);

    // Reforzar Cabeceras de Seguridad OWASP ASVS v5.0 Nivel 3 en el borde de Cloudflare
    const secureHeaders = new Headers(response.headers);
    secureHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    secureHeaders.set('X-Frame-Options', 'DENY');
    secureHeaders.set('X-Content-Type-Options', 'nosniff');
    secureHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Si el servidor redirige a /carta o /carrito, mantener el dominio del Worker
    const location = secureHeaders.get('Location');
    if (location && location.startsWith('/')) {
      secureHeaders.set('Location', `${incomingUrl.origin}${location}`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: secureHeaders
    });
  }
};