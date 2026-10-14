# «Король Фермы» — перенос на Cloudflare Workers + D1

Этот пакет содержит перенос фронтенда и игровых API на Cloudflare Worker, D1-схему, проверку подписи Telegram Mini App и обработчик webhook для `/start` и `/help`.

## Важно перед запуском

- Текущий production на Render не удалять и не отключать до завершения проверок.
- Сначала использовать отдельного тестового Telegram-бота, созданного через `@BotFather`. Не ставить webhook на токен бота, который ещё обслуживается polling на Render.
- Реальные платежи НЕ включены: `/api/payment/create` только создаёт заказ со статусом `provider_not_configured`. Он не начисляет алмазы. Для реальных оплат требуется договор/аккаунт у платёжного провайдера, webhook провайдера и проверка подписи его уведомлений.
- Эта версия реализует текущую экономику из предоставленного Python-проекта, а не переносит существующую SQLite-базу Render автоматически. Старые сохранения требуют отдельного экспорта/импорта.

## Что реализовано

1. Worker URL `/health` с диагностикой окружения.
2. D1-совместимая схема: игроки, грядки, коды, задания, платежные заказы, события ограничения частоты действий.
3. API: `/api/state`, `/api/action`, `/api/tasks`, `/api/leaderboard`, `/api/player/:id`, `/api/payment/create`.
4. Проверка `X-Telegram-Init-Data` по HMAC-SHA-256, срок действия данных — 24 часа.
5. Telegram webhook `/telegram/webhook` с проверкой `WEBHOOK_SECRET`, командами `/start`, `/help` и кнопкой открытия Mini App.
6. Защищённый endpoint установки webhook `/admin/set-webhook`, доступный только с `SETUP_SECRET`.
7. GitHub Actions workflow для установки webhook без локального терминала: `.github/workflows/configure-webhook.yml`.

## A. Обновление файлов в уже подключённом GitHub-репозитории

1. Распакуйте архив на компьютере только для просмотра файлов; запускать Python или Terminal не нужно.
2. В GitHub откройте репозиторий `GoodelTV/king-of-farmer-telegram-test`.
3. Замените содержимое `src/worker.js` на файл из этого пакета.
4. Замените `wrangler.toml`, `migrations/0001_init.sql`, `public/app.js`, `public/index.html`, `public/style.css` файлами из этого пакета (если интерфейс уже изменялся вручную, не перезаписывайте его без сравнения).
5. Добавьте `migrations/0002_upgrade_existing.sql` и `.github/workflows/configure-webhook.yml`.
6. В `wrangler.toml` замените `PASTE_REAL_D1_DATABASE_ID_HERE` на настоящий D1 Database ID: Cloudflare → Storage & databases → D1 SQL Database → `king_test` → Overview/Settings. Это не имя `king_test`, а длинный ID базы.
7. Нажмите Commit changes. Дождитесь успешного деплоя в Cloudflare → Workers & Pages → `king-of-farmer-telegram-test` → Deployments.

## B. Обновление существующей D1-базы `king_test`

Таблица `players` уже создана старой миграцией, поэтому повторный запуск `0001_init.sql` не добавит новые столбцы. Откройте D1 → `king_test` → Console и выполните каждую строку из `migrations/0002_upgrade_existing.sql` отдельно, по одной за раз. Если конкретная команда сообщает, что столбец уже существует, не выполняйте её повторно; переходите к следующей. Все команды `CREATE TABLE/INDEX IF NOT EXISTS` можно повторять.

Проверить после выполнения можно запросом:

```sql
PRAGMA table_info(players);
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
```

Должны существовать столбцы `next_harvest_at`, `flag`, `frame`, `nick_color`, `vip`, `premium`, `days_played`, `plot_data` и таблицы `task_claims`, `action_events`.

## C. Секреты Worker

Cloudflare → Worker `king-of-farmer-telegram-test` → Settings → Variables and Secrets → Add variable → выберите тип **Secret** для каждого секрета:

- `BOT_TOKEN` — токен отдельного тестового бота из `@BotFather`.
- `WEBHOOK_SECRET` — случайная строка не короче 32 символов, латиница/цифры/`_`/`-`.
- `SETUP_SECRET` — другая отдельная случайная строка не короче 32 символов.

Добавьте обычную переменную (Text) `APP_URL` со значением `https://king-of-farmer-telegram-test.alexdeli.workers.dev`.

Нажмите Save/Deploy, если Dashboard предлагает это. Не помещайте реальные секреты в GitHub-файлы, чат, скриншоты или URL. Секреты Worker и GitHub Actions — разные хранилища.

## D. Настроить установку webhook без терминала

1. В GitHub-репозитории откройте Settings → Secrets and variables → Actions → New repository secret.
2. Создайте secret `SETUP_SECRET` с тем же значением, которое добавили в Cloudflare Worker.
3. Откройте Actions → `Configure Telegram test webhook` → Run workflow → Run workflow.
4. Откройте выполненный запуск и убедитесь, что шаг завершился зелёным. Не отправляйте никому значения секретов.
5. Проверьте тестового бота: отправьте `/start`, затем нажмите кнопку «Играть».

Если в репозитории Actions отключены, включите разрешение GitHub Actions в Settings → Actions. Workflow вызывает только endpoint установки webhook; токен Telegram хранится в Cloudflare.

## E. Проверка Mini App

- `https://king-of-farmer-telegram-test.alexdeli.workers.dev/health` — ожидается `ok: true`, `mode: game-api-v1`, `database: true`, `botConfigured: true` после добавления секретов.
- Откройте игру только кнопкой из Telegram: API специально отклоняет пустой/поддельный `initData`.
- Проверьте создание игрока, посадку пшеницы, ожидание созревания, сбор урожая, обновление монет/XP после перезагрузки, рейтинг и профиль.
- `/api/payment/create` должен явно сообщать `provider_not_configured`; это ожидаемо, пока не интегрирован реальный провайдер.

## F. Переход с Render

Не переключайте существующего бота до прохождения проверок. Когда тестовый бот и Mini App стабильно работают, отдельно согласуйте перенос production-токена. Перед сменой polling на webhook нужно остановить polling-процесс Render для этого токена; иначе Telegram не позволит корректно использовать оба способа получения обновлений одновременно. Сначала экспортируйте/импортируйте существующую SQLite-базу, если требуется сохранить старые игровые аккаунты.
