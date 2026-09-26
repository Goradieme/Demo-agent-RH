// api/audit-ia.js
// Route serverless Vercel : analyse RÉELLEMENT l'URL soumise (pas de simulation).
// Vérifie des signaux concrets de préparation "IA-ready" : balises, données
// structurées schema.org, accessibilité aux robots IA via robots.txt.


// ── Grille de priorisation ────────────────────────────────────────────
// urgence : 1 = à corriger en premier, 3 = confort
// Chaque entrée décrit l'effet du défaut et la correction concrète.
const CORRECTIFS = {
  'Balise <title>': {
    urgence: 1, effort: '5 min',
    pourquoi: "Le titre est le premier élément lu par Google et par les moteurs de réponse. Sans lui, la page est classée sur des signaux secondaires et son taux de clic s'effondre.",
    correction: "Ajoutez dans le <head> un titre de 50 à 60 caractères contenant le terme sur lequel vous voulez être trouvé.",
    code: '<title>Votre promesse principale | Votre marque</title>'
  },
  'Meta description': {
    urgence: 2, effort: '5 min',
    pourquoi: "Sans description, Google compose lui-même un extrait, souvent maladroit. À position égale, une description travaillée change nettement le nombre de clics.",
    correction: "Rédigez 150 à 160 caractères qui disent ce que le lecteur obtient concrètement.",
    code: '<meta name="description" content="Ce que le lecteur obtient, en une phrase claire de 150 à 160 caractères."/>'
  },
  'Données structurées (JSON-LD)': {
    urgence: 1, effort: '30 min',
    pourquoi: "C'est le format que les moteurs de réponse lisent en priorité pour comprendre de quoi parle une page. Sans lui, votre contenu doit être deviné à partir du texte, ce qui réduit fortement les chances d'être cité.",
    correction: "Ajoutez un bloc JSON-LD décrivant la nature de la page : Article pour un contenu éditorial, Service pour une offre, Product pour une page marchande.",
    code: '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Article","headline":"Titre","datePublished":"2026-01-01","author":{"@type":"Person","name":"Nom"}}\n</' + 'script>'
  },
  'Balisage FAQPage': {
    urgence: 3, effort: '20 min',
    pourquoi: "Une FAQ balisée peut s'afficher en accordéon dans Google et fournit aux IA des paires question-réponse directement réutilisables. C'est l'un des formats les plus repris dans les réponses générées.",
    correction: "Ajoutez trois à six questions réellement posées par vos clients, avec des réponses autonomes, puis balisez-les en FAQPage.",
    code: '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Votre question ?","acceptedAnswer":{"@type":"Answer","text":"Réponse complète."}}]}'
  },
  'Balisage Product / Offer': {
    urgence: 1, effort: '45 min',
    pourquoi: "Sur une page marchande, c'est ce balisage qui permet aux agents IA de lire le prix, la disponibilité et les avis. Sans lui, votre produit est absent des comparaisons générées automatiquement.",
    correction: "Ajoutez un bloc Product avec le prix, la devise et la disponibilité, sur chaque fiche produit.",
    code: '{"@context":"https://schema.org","@type":"Product","name":"Nom","offers":{"@type":"Offer","price":"49.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}'
  },
  'Balise H1': {
    urgence: 2, effort: '10 min',
    pourquoi: "Le H1 annonce le sujet de la page. Aucun H1, et la hiérarchie est illisible ; plusieurs H1, et le sujet devient ambigu pour les moteurs.",
    correction: "Un seul H1 par page, reprenant le sujet principal. Les autres titres passent en H2 et H3.",
    code: '<h1>Le sujet de la page, en une ligne</h1>'
  },
  'Texte alternatif des images': {
    urgence: 3, effort: '15 min',
    pourquoi: "Le texte alternatif rend les images compréhensibles par les moteurs et par les lecteurs d'écran. C'est aussi une obligation d'accessibilité.",
    correction: "Décrivez chaque image en une phrase utile. Évitez les descriptions vides du type « image1 ».",
    code: '<img src="schema.jpg" alt="Schéma du parcours d\'achat B2B en cinq étapes"/>'
  },
  'Accessibilité aux robots IA': {
    urgence: 1, effort: '10 min',
    pourquoi: "Si votre robots.txt bloque GPTBot, ClaudeBot, PerplexityBot ou Google-Extended, votre contenu ne peut pas être cité dans les réponses générées, quelle que soit sa qualité.",
    correction: "Décidez explicitement quels robots IA vous autorisez, puis ajustez le robots.txt en conséquence.",
    code: 'User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /'
  }
};

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

    // ── Product / Offer ──
    // Ce balisage n'a de sens que sur une page marchande. Sur une page de service,
    // d'article ou de présentation, l'exiger fausserait le diagnostic : le critère
    // devient alors une simple information, sans effet sur le score.
    const hasProduct = schemaTypes.has('Product') || schemaTypes.has('Offer') || schemaTypes.has('AggregateOffer');
    const looksEditorial = schemaTypes.has('Article') || schemaTypes.has('BlogPosting')
      || schemaTypes.has('Service') || schemaTypes.has('FAQPage')
      || schemaTypes.has('WebPage') || schemaTypes.has('AboutPage');
    const looksCommercial = hasProduct
      || /(ajouter au panier|add to cart|mon panier|passer commande|itemprop=["']price)/i.test(html);

    if (looksCommercial) {
      checks.push({
        label: 'Balisage Product / Offer',
        passed: hasProduct,
        detail: hasProduct
          ? 'Détecté : les agents IA peuvent lire prix et disponibilité'
          : 'Absent alors que la page semble marchande : les agents IA ne peuvent ni lire le prix ni comparer l\'offre',
      });
    } else {
      checks.push({
        label: 'Balisage Product / Offer',
        passed: null,
        detail: looksEditorial
          ? 'Sans objet : cette page est éditoriale ou institutionnelle, pas une page produit'
          : 'Sans objet : aucun signal marchand détecté sur cette page',
      });
    }

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
    if (imgMatches.length === 0) {
      checks.push({
        label: 'Texte alternatif des images',
        passed: null,
        detail: 'Aucune image sur cette page. Une illustration et une image de partage social améliorent la lecture et le partage.',
      });
    } else {
      checks.push({
        label: 'Texte alternatif des images',
        passed: altRatio >= 80,
        detail: `${imgsWithAlt}/${imgMatches.length} image(s) avec texte alternatif (${altRatio}%)`,
      });
    }

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

    // Seuls les critères applicables entrent dans le score.
    // Un critère marqué « sans objet » (passed === null) n'est ni un succès ni un échec.
    const scored = checks.filter((c) => c.passed !== null);
    const passedCount = scored.filter((c) => c.passed).length;
    const score = scored.length ? Math.round((passedCount / scored.length) * 100) : 0;

    // Enrichissement : urgence, effet du défaut et correctif concret
    const checksEnrichis = checks.map((c) => {
      const g = CORRECTIFS[c.label] || {};
      return {
        ...c,
        urgence: c.passed === false ? (g.urgence || 2) : null,
        effort: c.passed === false ? (g.effort || null) : null,
        pourquoi: c.passed === false ? (g.pourquoi || null) : null,
        correction: c.passed === false ? (g.correction || null) : null,
        code: c.passed === false ? (g.code || null) : null,
      };
    });

    const aCorriger = checksEnrichis
      .filter((c) => c.passed === false)
      .sort((a, b) => a.urgence - b.urgence);

    return res.status(200).json({
      url,
      score,
      checks: checksEnrichis,
      aCorriger,
      summary: {
        applicables: scored.length,
        reussis: passedCount,
        sansObjet: checks.length - scored.length,
      },
    });
  } catch (err) {
    console.error('Erreur audit:', err);
    return res.status(422).json({ error: "Impossible d'analyser ce site. Vérifiez l'URL (le site doit être accessible publiquement) et réessayez." });
  }
}
