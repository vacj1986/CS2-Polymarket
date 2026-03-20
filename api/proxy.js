// api/proxy.js — проксирует запросы к Gamma API Polymarket
// Нужен чтобы обойти CORS браузера

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { tag, limit = '50' } = req.query;
  const tagSlug = tag || 'cs2';

  try {
    const url = `https://gamma-api.polymarket.com/events?tag_slug=${tagSlug}&limit=${limit}&active=true&closed=false`;
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'cs2-polymarket-tracker/1.0' }
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Upstream error', status: upstream.status });
      return;
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
