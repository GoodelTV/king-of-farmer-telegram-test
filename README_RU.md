# King of Farmer — Cloudflare migration scaffold (не production)

Этот архив исправлен и содержит реальные файлы исходного проекта плюс начальный каркас Cloudflare Workers + Static Assets + D1.

## ВАЖНО

Это **не готовая замена работающей игре**. Существующий проект в `original-python/` сохранён без удаления. Веб-интерфейс находится в `public/`. `src/worker.js` пока проверяет `/health`, обслуживает тестовый маршрут Telegram webhook и намеренно отвечает `501` на `/api/*`, потому что игровая логика из `original-python/bot/main.py` ещё не перенесена. Не указывайте production-бота на этот Worker и не заменяйте Render.

D1 схема в `migrations/0001_init.sql` — стартовая схема для теста, а не автоматическая миграция существующей SQLite базы. Архив не переносит данные и не подключает платежи.

## Содержимое

- `public/` — оригинальные `index.html`, `style.css`, `app.js` из присланного проекта.
- `original-python/` — исходные Python-файлы и исходные инструкции для возврата к текущему варианту.
- `src/worker.js` — минимальный Worker-каркас с health check.
- `migrations/0001_init.sql` — начальная D1-схема.
- `wrangler.toml` — конфигурация Worker, статических файлов и D1.
- `.dev.vars.example` — пример локальных секретов без настоящих токенов.

## Безопасный порядок

1. Не удаляйте Render service и не меняйте текущий Telegram webhook.
2. Создайте отдельный приватный GitHub-репозиторий для этого теста.
3. Создайте Worker из GitHub и задайте D1 binding `DB`.
4. Замените `REPLACE_WITH_YOUR_D1_DATABASE_ID` в `wrangler.toml` на ID созданной тестовой D1 базы.
5. Выполните `migrations/0001_init.sql` в SQL Console D1.
6. Установите secret `WEBHOOK_SECRET` только для теста. `BOT_TOKEN` пока не нужен для проверки `/health`.
7. После публикации откройте `https://<worker-url>/health`. Ожидается JSON с `ok: true`.
8. Откройте корневой адрес и убедитесь, что загружается статический интерфейс.
9. Остановитесь и проверьте результат прежде чем переходить к переносу API.

## Что ещё нужно реализовать до переноса игры

- Переписать игровые `/api/state`, `/api/action`, `/api/leaderboard`, `/api/player/...`, `/api/payment/create` под D1.
- Перенести проверку подписи Telegram Mini App `initData` и добавить тесты.
- Переделать Telegram-бота с aiogram long polling на webhook Worker, включая `/start` и `/help`.
- Согласовать API_BASE в `public/app.js` с адресом Worker.
- Проверить авторизацию, игровые действия, обработку ошибок, защиту от повторных промокодов и ограничения запросов.
- Не подключать реальные платежи, пока нет проверенного провайдера и серверной проверки платежных уведомлений.

## Официальная документация

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Python Workers (для понимания отличий среды): https://developers.cloudflare.com/workers/languages/python/
- D1: https://developers.cloudflare.com/d1/
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
