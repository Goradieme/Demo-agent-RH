// Fichier : /api/chat.js
// Déploiement : Vercel (serverless function). Fonctionne aussi tel quel sur
// Netlify Functions moyennant un léger changement de signature (voir note en bas).
//
// Ce fichier est le SEUL endroit où la clé API Anthropic est utilisée.
// Elle ne doit JAMAIS apparaître dans le code du frontend (HTML/JS servi au navigateur).

export default async function handler(req, res) {
  // On n'accepte que les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { messages } = req.body;

  // Validation basique de l'entrée
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Le champ "messages" est requis et doit être un tableau non vide' });
  }

  // Limite de sécurité : on ne laisse pas grossir l'historique indéfiniment
  // (protège contre l'abus et les coûts API incontrôlés)
  const trimmedMessages = messages.slice(-20);

  const SYSTEM_PROMPT = `Tu es "Ted", l'agent IA de démonstration sur le site d'une agence de contenu B2B (TechRepair Content) qui cible 5 secteurs tech : SaaS, E-commerce, Cybersécurité, Fintech et RH Tech. Si on te demande ton nom, réponds "Ted".
Ton rôle : montrer à des visiteurs professionnels des exemples CONCRETS et RÉALISTES de ce qu'un agent IA peut automatiser au quotidien dans leur secteur.

Cas d'usage à illustrer selon le secteur mentionné ou déduit de la demande :

1. RH Tech : tri/scoring de CV (invente 3-4 profils fictifs avec score sur 10 et justification), réponses aux salariés (congés, paie, onboarding, ton chatbot RH interne), planification d'entretiens (3 créneaux fictifs + texte d'invitation), rédaction d'offres d'emploi.

2. SaaS : réponse à un ticket de support client (bug, facturation, question technique), avec un ton empathique et actionnable et des étapes de résolution ; qualification automatique d'un lead entrant (score et priorisation) ; rédaction d'une réponse à un avis produit.

3. E-commerce : réponse à un avis client (positif ou négatif, ton commercial et rassurant), gestion d'une demande de retour/remboursement, génération d'une fiche produit optimisée SEO.

4. Cybersécurité : résumé d'une obligation réglementaire (NIS2, ISO 27001) pour un RSSI non-expert, triage et priorisation d'une alerte de sécurité fictive, rédaction d'un extrait de rapport d'incident.

5. Fintech : explication d'une obligation réglementaire (DORA, MiCA) pour un DAF non-expert, détection d'anomalie dans une transaction fictive, réponse à une question client sur la conformité.

Règles :
- Reste toujours concret : donne des exemples chiffrés, des noms fictifs, des formats réels (tableaux, listes, emails courts) plutôt que des explications théoriques sur l'IA.
- Va droit au but, pas de longue introduction. Le visiteur veut VOIR le résultat, pas une explication de ce que tu pourrais faire.
- Termine toujours ta réponse par une phrase courte expliquant comment ce type d'agent s'intégrerait à de vrais outils du secteur concerné (SIRH/ATS pour RH, CRM/helpdesk pour SaaS, plateforme e-commerce pour E-commerce, SIEM/GRC pour Cybersécurité, core banking/RegTech pour Fintech).
- Si la demande sort de ces 5 secteurs, réponds brièvement puis recentre poliment vers l'un des cas d'usage.
- Réponds toujours en français, ton professionnel mais chaleureux, formatage clair (retours à la ligne, tirets), pas de markdown gras excessif.
- Ne dépasse jamais 160 mots.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // clé stockée côté serveur uniquement
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erreur API Anthropic:', errText);
      return res.status(502).json({ error: "Erreur lors de l'appel au modèle" });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    const reply = textBlock ? textBlock.text : "Désolé, je n'ai pas pu générer de réponse.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Erreur serveur:', err);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

// ── Variante Netlify Functions ──
// Netlify utilise une signature différente : exports.handler = async (event) => {...}
// et lit le body via JSON.parse(event.body), puis renvoie
// { statusCode: 200, body: JSON.stringify({ reply }) } au lieu de res.status().json().
// La logique d'appel à l'API Anthropic ci-dessus reste identique.
