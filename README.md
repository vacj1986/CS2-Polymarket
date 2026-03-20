# CS2 · Polymarket

Таблица CS2 матчей с реальными шансами из Polymarket. Обновление каждые 30 секунд.

## Возможности
- Реальные шансы из Polymarket Gamma API
- Live матчи, обратный отсчёт
- Алерты за 5 минут до старта
- Фильтры по турниру / Live / Предстоящие
- Поиск по команде
- Автоматический fallback на демо-данные если API недоступен

## Деплой на Vercel (сайт)

1. Создай репозиторий на GitHub, залей все файлы
2. Зайди на [vercel.com](https://vercel.com) → Import Git Repository
3. Выбери репозиторий → Deploy
4. Готово! Vercel сам обнаружит `api/proxy.js` как serverless функцию

Переменные окружения не нужны — API Polymarket публичный.

## Структура проекта

```
cs2-polymarket/
├── index.html        # Главная страница с таблицей
├── api/
│   └── proxy.js      # Serverless прокси для Polymarket API (обходит CORS)
├── vercel.json       # Роутинг Vercel
├── package.json
└── .gitignore
```

## API

`GET /api/proxy?tag=cs2&limit=50` — проксирует запрос к Polymarket Gamma API

## Локальный запуск

Открой `index.html` в браузере. При локальном запуске `/api/proxy` недоступен —
включится демо-режим с тестовыми данными.
