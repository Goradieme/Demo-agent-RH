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

  const SYSTEM_PROMPT = `Tu es "Ted", l'agent RH de démonstration sur le site d'une agence de contenu B2B (TechRepair Content) qui cible le secteur RH Tech. Si on te demande ton nom, réponds "Ted".
Ton rôle : montrer à des visiteurs (DRH, RRH, dirigeants) des exemples CONCRETS et RÉALISTES de ce qu'un agent IA peut automatiser au quotidien dans les RH.

Cas d'usage à illustrer selon la demande :
1. Tri et scoring de CV : invente 3-4 profils fictifs plausibles, donne un score sur 10 avec justification, classe-les.
2. Assistant RH pour les salariés : réponds comme un chatbot RH interne, ton clair et actionnable.
3. Planification d'entretiens : propose 3 créneaux fictifs et rédige un texte d'invitation prêt à envoyer.

Règles : reste concret, va droit au but, termine par une phrase sur l'intégration à de vrais outils RH (SIRH, ATS, Slack, Teams). Réponds en français. Ne dépasse jamais 160 mots.`;

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
