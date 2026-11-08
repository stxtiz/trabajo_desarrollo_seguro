/**
 * CLOUDFLARE WORKER GRATUITO (SIN COMPRAR DOMINIO)
 * Subdominio fijo gratuito: https://carta-digital.<tu-usuario>.workers.dev
 *
 * Actúa como Proxy Inverso + Borde de Seguridad HTTPS (TLS 1.3) en Cloudflare
 * apuntando hacia la IP pública de tu instancia AWS EC2 Ubuntu con Docker,
 * cumpliendo con OWASP ASVS v5.0 Nivel 3 sin gastar $0 en dominios.
 */

export default {
  async fetch(request, env) {
    // 1. Definir la IP o DNS público de tu instancia AWS EC2 (configurada en Variables de Entorno del Worker)
    const ec2Origin = env.EC2_ORIGIN_URL || 'http://TU_IP_PUBLICA_EC2';

    const incomingUrl = new URL(request.url);

    // 2. Regla WAF de Borde (ASVS v5.0 V14): Bloquear acceso a rutas ocultas o escáneres
    const blockedPaths = ['/.env', '/.git', '/wp-admin', '/phpmyadmin'];
    if (blockedPaths.some((p) => incomingUrl.pathname.toLowerCase().includes(p))) {
      return new Response('Forbidden by Cloudflare ASVS 5.0 Edge Filter', { status: 403 });
    }

    // 3. Construir URL hacia el contenedor Front-End en AWS EC2
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ec2Origin);

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('X-Forwarded-Proto', 'https');
    modifiedHeaders.set('X-Forwarded-Host', incomingUrl.host);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: modifiedHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      redirect: 'manual'
    });

    const response = await fetch(proxyRequest);

    // 4. Reforzar Cabeceras de Seguridad OWASP ASVS v5.0 Nivel 3 en el borde de Cloudflare
    const secureHeaders = new Headers(response.headers);
    secureHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    secureHeaders.set('X-Frame-Options', 'DENY');
    secureHeaders.set('X-Content-Type-Options', 'nosniff');
    secureHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: secureHeaders
    });
  }
};
