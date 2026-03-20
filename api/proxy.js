// api/proxy.js — Polymarket CS2 Games Proxy (v3)
//
// Берём EVENTS (не markets) из CS2 series=10310.
// Один event = один матч (ShindeN vs Guarà).
// Внутри event много markets: "Game 1", "Game 2", "Map 1 Over/Under" etc.
// Нам нужен только ОДИН маркет на матч — тот что "Will X win?" (серия BO3).
// Признак главного маркета: outcomes = ["TeamA","TeamB"], question содержит "vs"
// ИЛИ это первый маркет с двумя исходами-командами.
//
// Возвращаем массив матчей со всеми нужными полями.
// Сортировка на стороне сервера: live → upcoming → past, внутри каждой группы по времени.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const BASE = 'https://gamma-api.polymarket.com';
  const H = { 'User-Agent': 'cs2-polymarket-tracker/1.0' };

  try {
    // Берём все события CS2 серии — и активные и завершённые (для раздела "прошлые")
    const [rActive, rClosed] = await Promise.all([
      fetch(`${BASE}/events?series_id=10310&closed=false&limit=100&order=startDate&ascending=false`, { headers: H }),
      fetch(`${BASE}/events?series_id=10310&closed=true&limit=50&order=startDate&ascending=false`,  { headers: H }),
    ]);

    const active = rActive.ok ? await rActive.json() : [];
    const closed = rClosed.ok ? await rClosed.json() : [];
    const allEvents = [...(Array.isArray(active) ? active : []), ...(Array.isArray(closed) ? closed : [])];

    const matches = allEvents.map(ev => eventToMatch(ev)).filter(Boolean);

    // Дедупликация по паре команд + дата (на случай если один матч дублируется)
    const seen = new Set();
    const deduped = matches.filter(m => {
      const key = [m.team1, m.team2, m.gameStartTime ? m.gameStartTime.slice(0,16) : m.id].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ source: 'events/series/10310', data: deduped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Превращает один event Polymarket → объект матча
function eventToMatch(ev) {
  if (!ev) return null;
  const mlist = Array.isArray(ev.markets) ? ev.markets : [];

  // Ищем главный маркет матча:
  // Критерии (по приоритету):
  //   1. question содержит " vs " и outcomes — две команды (не Over/Under, не Odd/Even)
  //   2. outcomes[0] и outcomes[1] — не "Over","Under","Odd","Even","Yes","No"
  //   3. Берём маркет с наибольшим volume среди подходящих

  const PROPS = /^(over|under|odd|even|yes|no|total|map \d|game \d|round|knife|pistol|overtime|first|ace)/i;

  let bestMarket = null;
  let bestVol = -1;

  for (const m of mlist) {
    const outcomes = tryJson(m.outcomes, []);
    if (outcomes.length < 2) continue;
    const o1 = String(outcomes[0]).trim();
    const o2 = String(outcomes[1]).trim();
    // Пропускаем пропс-маркеты
    if (PROPS.test(o1) || PROPS.test(o2)) continue;
    // Оба исхода должны быть реальными названиями команд (> 1 слова или > 3 символов)
    if (o1.length < 2 || o2.length < 2) continue;
    const vol = parseFloat(m.volume || 0);
    if (vol > bestVol) { bestVol = vol; bestMarket = m; }
  }

  // Fallback: берём просто первый маркет с двумя исходами не-пропсами
  if (!bestMarket) {
    for (const m of mlist) {
      const outcomes = tryJson(m.outcomes, []);
      if (outcomes.length >= 2 && !PROPS.test(String(outcomes[0]))) {
        bestMarket = m; break;
      }
    }
  }

  if (!bestMarket) return null;

  const outcomes = tryJson(bestMarket.outcomes, []);
  const prices   = tryJson(bestMarket.outcomePrices, []);
  const team1 = cleanTeam(outcomes[0] || '');
  const team2 = cleanTeam(outcomes[1] || '');
  if (!team1 || !team2) return null;

  const t1odds = Math.max(0.01, Math.min(0.99, parseFloat(prices[0]) || 0.5));
  const t2odds = Math.max(0.01, Math.min(0.99, parseFloat(prices[1]) || 0.5));

  // Объём — берём сумму по всем маркетам матча (более точно)
  const totalVol = mlist.reduce((s, m) => s + parseFloat(m.volume || 0), 0);

  const gameStartTime = bestMarket.gameStartTime || ev.startDate || null;
  const now = new Date();
  const startDate = gameStartTime ? new Date(gameStartTime) : null;
  const endDate = ev.endDate ? new Date(ev.endDate) : null;

  // Статус: live если startDate прошёл но endDate ещё нет или матч активен
  const isPast = !!(ev.closed || (endDate && endDate < now && !ev.active));
  const isLive = !isPast && !!(startDate && startDate < now && ev.active !== false);
  const isUpcoming = !isPast && !isLive;

  const eventTitle = ev.title || '';
  const eventSlug  = ev.slug  || '';

  return {
    id: ev.id || eventSlug,
    team1, team2,
    t1odds, t2odds,
    volume: totalVol,
    gameStartTime,
    startDate: startDate ? startDate.toISOString() : null,
    endDate:   endDate   ? endDate.toISOString()   : null,
    live: isLive,
    past: isPast,
    upcoming: isUpcoming,
    eventTitle,
    eventSlug,
    polyUrl: eventSlug
      ? `https://polymarket.com/event/${eventSlug}`
      : `https://polymarket.com/sports/counter-strike/games`,
    formatType: bestMarket.formatType || guessFormat(eventTitle),
  };
}

function tryJson(s, def) { try { return JSON.parse(s) || def; } catch { return def; } }

function cleanTeam(s) {
  return String(s).replace(/\s+(will win|to win).*/i, '').trim();
}

function guessFormat(title) {
  if (/bo5|best.of.5/i.test(title)) return 'BO5';
  if (/bo1|best.of.1/i.test(title)) return 'BO1';
  return 'BO3';
}
