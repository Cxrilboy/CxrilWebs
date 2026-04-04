/**
 * create-checkout-session.js — Netlify Serverless Function
 *
 * Crée une session Stripe Checkout dynamique pour n'importe quel montant.
 * La clé secrète Stripe est lue depuis les variables d'environnement Netlify.
 *
 * Variables à définir dans Netlify Dashboard → Site settings → Environment variables :
 *   STRIPE_SECRET_KEY = sk_live_XXXX (jamais dans le code source)
 *
 * Note : URL est injectée automatiquement par Netlify (variable réservée).
 */

const Stripe = require('stripe');

exports.handler = async (event) => {
  // Autoriser seulement POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CORS pour développement local
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Vérification de la clé Stripe
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[Stripe] STRIPE_SECRET_KEY non configurée dans les variables d\'environnement');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Configuration serveur incomplète — contactez le support' }),
    };
  }

  try {
    // Vérification du corps de la requête
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Corps de requête manquant' }) };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { amount, description, mode, currency = 'eur' } = JSON.parse(event.body);

    // Validation des entrées
    if (!amount || typeof amount !== 'number' || amount < 0.5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Montant invalide (minimum 0.50€)' }),
      };
    }
    if (!['payment', 'subscription'].includes(mode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Mode invalide (payment | subscription)' }),
      };
    }

    const siteUrl = process.env.URL || 'https://cxrilwebs.netlify.app';

    const lineItem = {
      price_data: {
        currency,
        product_data: {
          name: description || 'Prestation CxrilWebs',
          images: [], // Optionnel : ajouter une image produit
        },
        unit_amount: Math.round(amount * 100), // Stripe attend des centimes
        ...(mode === 'subscription' && {
          recurring: { interval: 'month' },
        }),
      },
      quantity: 1,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode: mode === 'subscription' ? 'subscription' : 'payment',
      success_url: `${siteUrl}/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/paiement`,
      locale: 'fr',
      // Paiements récurrents : permettre de futurs paiements
      ...(mode === 'payment' && {
        payment_intent_data: {
          description: description || 'Prestation CxrilWebs',
        },
      }),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url, session_id: session.id }),
    };
  } catch (error) {
    console.error('[Stripe Checkout Error]', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
