// api/proxy.js — проксирует запросы к Gamma API Polymarket
// Нужен чтобы обойти CORS браузера
//
// CS2 sport metadata (из gamma-api.polymarket.com/sports):
//   sport slug : cs2
//   tag_id     : 100780  (основной тег Counter-Strike)
//   series     : 10310
//   resolution : https://hltv.org

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { limit = '100' } = req.query;

  try {
    // Используем tag_id=100780 — точный тег CS2 из /sports API
    // related_tags=true — включает все под-турниры CS2
    const url = `https://gamma-api.polymarket.com/events?tag_id=100780&related_tags=true&limit=${limit}&active=true&closed=false&order=startDate&ascending=true`;

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
