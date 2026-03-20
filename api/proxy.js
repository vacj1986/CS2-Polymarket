// api/proxy.js — Polymarket CS2 Games Proxy
//
// Стратегия: две параллельных запроса к gamma-api:
//   1. /events?series_id=10310&closed=false  — события именно из CS2 серии
//      (series 10310 = CS2 из /sports API, это именно /sports/counter-strike/games)
//   2. Fallback: /markets?tag_id=100780&closed=false&gameStartTime=notnull
//
// Из маркета берём: outcomes (команды), outcomePrices (шансы), gameStartTime, volume
// Futures-маркеты ("Will FaZe win...") не имеют gameStartTime — отфильтруем их.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { limit = '100' } = req.query;
  const BASE = 'https://gamma-api.polymarket.com';
  const HEADERS = { 'User-Agent': 'cs2-polymarket-tracker/1.0' };

  try {
    // Стратегия 1: events через series_id=10310 (CS2 games series)
    // Каждый event содержит массив markets с outcomes + outcomePrices
    const r1 = await fetch(
      `${BASE}/events?series_id=10310&closed=false&active=true&limit=${limit}&order=startDate&ascending=true`,
      { headers: HEADERS }
    );

    if (r1.ok) {
      const events = await r1.json();
      if (Array.isArray(events) && events.length > 0) {
        // Из events извлекаем game-маркеты (у них gameStartTime или endDate скоро)
        const games = extractGamesFromEvents(events);
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
        res.status(200).json({ source: 'events/series', data: games });
        return;
      }
    }

    // Стратегия 2: /markets с tag_id=100780, фильтруем только game-маркеты
    const r2 = await fetch(
      `${BASE}/markets?tag_id=100780&closed=false&active=true&limit=${limit}&order=gameStartTime&ascending=true`,
      { headers: HEADERS }
    );

    if (!r2.ok) throw new Error('Both API strategies failed: HTTP ' + r2.status);

    const markets = await r2.json();
    // Оставляем только маркеты с gameStartTime (игры, не futures)
    const games = Array.isArray(markets)
      ? markets.filter(m => m.gameStartTime && m.gameStartTime !== '')
      : [];

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ source: 'markets/tag', data: games });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Разворачиваем events → массив game-объектов для фронтенда
function extractGamesFromEvents(events) {
  const games = [];
  for (const ev of events) {
    const mlist = Array.isArray(ev.markets) ? ev.markets : [];
    if (mlist.length === 0) continue;

    for (const m of mlist) {
      // Пропускаем futures: у них нет gameStartTime и question содержит "will win a tier"
      const q = (m.question || ev.title || '').toLowerCase();
      if (!m.gameStartTime && (q.includes('will win a') || q.includes('to win a') || q.includes('in 2026'))) continue;

      games.push({
        id: m.id || ev.id,
        question: m.question || ev.title || '',
        slug: ev.slug || m.slug || '',
        outcomes: m.outcomes || '[]',
        outcomePrices: m.outcomePrices || '[]',
        gameStartTime: m.gameStartTime || ev.startDate || null,
        endDate: m.endDate || ev.endDate || null,
        startDate: ev.startDate || m.startDate || null,
        volume: m.volume || '0',
        active: m.active ?? ev.active ?? true,
        closed: m.closed ?? false,
        // Турнир из родительского event
        eventTitle: ev.title || '',
        eventSlug: ev.slug || '',
        formatType: m.formatType || '',
        teamAID: m.teamAID || '',
        teamBID: m.teamBID || '',
      });
    }
  }
  return games;
}
