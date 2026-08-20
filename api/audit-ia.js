// api/audit-ia.js
// Route serverless Vercel : analyse RÉELLEMENT l'URL soumise (pas de simulation).
// Vérifie des signaux concrets de préparation "IA-ready" : balises, données
// structurées schema.org, accessibilité aux robots IA via robots.txt.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  let { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL manquante' });
  }

  url = url.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL invalide' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TechRepairContent-AuditBot/1.0 (+https://www.techrepaircontent.com)' },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(422).json({ error: `Le site a répondu avec une erreur (code ${response.status}).` });
    }

    const html = await response.text();
    const checks = [];

    // ── Balise <title> ──
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    checks.push({
      label: 'Balise <title>',
      passed: !!title && title.length > 0,
      detail: title ? `« ${title.slice(0, 70)}${title.length > 70 ? '…' : ''} » (${title.length} caractères)` : 'Absente',
    });

    // ── Meta description ──
    const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const metaDesc = metaMatch ? metaMatch[1] : null;
    checks.push({
      label: 'Meta description',
      passed: !!metaDesc && metaDesc.length > 0,
      detail: metaDesc ? `${metaDesc.length} caractères` : 'Absente',
    });

    // ── JSON-LD / schema.org ──
    const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const hasJsonLd = jsonLdMatches.length > 0;
    const schemaTypes = new Set();
    jsonLdMatches.forEach((m) => {
      const typeMatches = [...m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)];
      typeMatches.forEach((tm) => schemaTypes.add(tm[1]));
    });
    checks.push({
      label: 'Données structurées (JSON-LD)',
      passed: hasJsonLd,
      detail: hasJsonLd
        ? `Détectées, type(s) : ${[...schemaTypes].join(', ') || 'non identifiable'}`
        : 'Aucune donnée structurée détectée',
    });

    // ── FAQPage ──
    const hasFaq = schemaTypes.has('FAQPage');
    checks.push({
      label: 'Balisage FAQPage',
      passed: hasFaq,
      detail: hasFaq ? 'Détecté' : 'Non détecté',
    });

    // ── Product / Offer (pertinent surtout pour de l'e-commerce) ──
    const hasProduct = schemaTypes.has('Product') || schemaTypes.has('Offer') || schemaTypes.has('AggregateOffer');
    checks.push({
      label: 'Balisage Product / Offer',
      passed: hasProduct,
      detail: hasProduct ? 'Détecté' : 'Non détecté (pertinent surtout pour un site e-commerce)',
    });

    // ── H1 ──
    const h1Matches = [...html.matchAll(/<h1[^>]*>/gi)];
    checks.push({
      label: 'Balise H1',
      passed: h1Matches.length === 1,
      detail: `${h1Matches.length} balise(s) H1 détectée(s)` + (h1Matches.length > 1 ? ' (idéalement une seule par page)' : ''),
    });

    // ── Texte alternatif des images ──
    const imgMatches = [...html.matchAll(/<img[^>]*>/gi)];
    const imgsWithAlt = imgMatches.filter((m) => /alt=["'][^"']+["']/.test(m[0])).length;
    const altRatio = imgMatches.length > 0 ? Math.round((imgsWithAlt / imgMatches.length) * 100) : 100;
    checks.push({
      label: 'Texte alternatif des images',
      passed: altRatio >= 80,
      detail: imgMatches.length > 0 ? `${imgsWithAlt}/${imgMatches.length} images avec texte alternatif (${altRatio}%)` : 'Aucune image détectée',
    });

    // ── robots.txt : accessibilité aux robots IA ──
    let robotsInfo = 'Non vérifié';
    let aiBotsBlocked = false;
    try {
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      const robotsRes = await fetch(robotsUrl, { headers: { 'User-Agent': 'TechRepairContent-AuditBot/1.0' } });
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        const bots = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot'];
        const blockedBots = bots.filter((bot) => {
          const regex = new RegExp(`User-agent:\\s*${bot}[^\\n]*\\n(?:[^\\n]*\\n)*?\\s*Disallow:\\s*/\\s*(?:\\n|$)`, 'i');
          return regex.test(robotsTxt);
        });
        aiBotsBlocked = blockedBots.length > 0;
        robotsInfo = aiBotsBlocked ? `Bloqués dans robots.txt : ${blockedBots.join(', ')}` : 'Aucun robot IA majeur bloqué dans robots.txt';
      } else {
        robotsInfo = 'robots.txt introuvable (donc aucun blocage explicite)';
      }
    } catch {
      robotsInfo = "Impossible de vérifier robots.txt (site injoignable sur ce point)";
    }
    checks.push({
      label: 'Accessibilité aux robots IA',
      passed: !aiBotsBlocked,
      detail: robotsInfo,
    });

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    return res.status(200).json({ url, score, checks });
  } catch (err) {
    console.error('Erreur audit:', err);
    return res.status(422).json({ error: "Impossible d'analyser ce site. Vérifiez l'URL (le site doit être accessible publiquement) et réessayez." });
  }
}
