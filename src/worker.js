const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", ...extra },
});
const fail = (status, detail) => json({ detail }, status);
const now = () => Math.floor(Date.now() / 1000);
const DEFAULT_REDEEM = {
  "алмаз1000": { resource: "diamonds", amount: 1000 },
  "монет4999": { resource: "coins", amount: 4999 },
  "xp500": { resource: "xp", amount: 500 },
  "дерево500": { resource: "wood", amount: 500 },
  "пшеница500": { resource: "wheat", amount: 500 },
};
const TASKS = {
  first_harvest: { title: "Первый урожай", description: "Соберите хотя бы один урожай", reward: { coins: 30, xp: 10 }, condition: p => p.harvests >= 1 },
  hall_level_2: { title: "Развитие поселения", description: "Улучшите ратушу до 2 уровня", reward: { wood: 20, xp: 20 }, condition: p => p.hall_level >= 2 },
  experienced_farmer: { title: "Опытный фермер", description: "Наберите 100 XP", reward: { diamonds: 10, coins: 50 }, condition: p => p.xp >= 100 },
};
const ALLOWED_FLAGS = new Set(["🌍","🇷🇺","🇺🇸","🇬🇧","🇩🇪","🇫🇷","🇪🇸","🇮🇹","🇵🇱","🇹🇷","🇺🇦","🇧🇷","🇯🇵","🇨🇳","🇰🇿","🇧🇾"]);
const REDEEM_FIELDS = new Set(["diamonds","coins","xp","wood","wheat","carrots","potatoes"]);

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function validateInitData(raw, token) {
  if (!token) throw Object.assign(new Error("BOT_TOKEN ещё не добавлен в Cloudflare Secrets."), { status: 503 });
  if (!raw) throw Object.assign(new Error("Откройте игру из Telegram, используя кнопку /start."), { status: 401 });
  const params = new URLSearchParams(raw);
  const received = params.get("hash");
  if (!received) throw Object.assign(new Error("Не найдена подпись Telegram."), { status: 401 });
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || authDate <= 0 || now() - authDate > 86400 || authDate - now() > 60) {
    throw Object.assign(new Error("Сессия Telegram устарела. Закройте и откройте игру снова."), { status: 401 });
  }
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), token);
  const expected = hex(await hmac(secret, check));
  if (!constantTimeEqual(expected, received)) throw Object.assign(new Error("Не удалось проверить подпись Telegram."), { status: 401 });
  let user;
  try { user = JSON.parse(params.get("user") || "{}"); } catch { user = null; }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) throw Object.assign(new Error("Нет корректных данных пользователя Telegram."), { status: 401 });
  return user;
}
function publicPlayer(row) {
  const p = { ...row };
  delete p.user_id; delete p.updated_at;
  try { p.plots = JSON.parse(p.plot_data || "{}"); } catch { p.plots = {}; }
  delete p.plot_data;
  p.created_at = Number(p.created_at || now());
  p.days_played = Math.max(1, Math.floor((now() - p.created_at) / 86400) + 1);
  p.level = Math.max(1, Number(p.level || 1));
  return p;
}
async function ensurePlayer(env, user) {
  const uid = Number(user.id), timestamp = now();
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Фермер";
  const exists = await env.DB.prepare("SELECT user_id FROM players WHERE user_id = ?").bind(uid).first();
  if (!exists) {
    const plots = JSON.stringify(Object.fromEntries(Array.from({length:6}, (_,i)=>[String(i),{crop:"empty",planted_at:0}])));
    await env.DB.prepare(`INSERT INTO players (user_id,name,username,avatar_url,created_at,updated_at,next_harvest_at,plot_data)
      VALUES(?,?,?,?,?,?,0,?)`).bind(uid,name,String(user.username || ""),String(user.photo_url || ""),timestamp,timestamp,plots).run();
  } else {
    await env.DB.prepare("UPDATE players SET name=?, username=?, avatar_url=?, updated_at=? WHERE user_id=?")
      .bind(name,String(user.username || ""),String(user.photo_url || ""),timestamp,uid).run();
  }
  return env.DB.prepare("SELECT * FROM players WHERE user_id = ?").bind(uid).first();
}
async function authenticated(request, env) {
  const user = await validateInitData(request.headers.get("x-telegram-init-data") || "", env.BOT_TOKEN);
  const row = await ensurePlayer(env, user);
  return { user, row, uid: Number(user.id) };
}
async function stateWithRank(env, row) {
  const rank = await env.DB.prepare(`SELECT COUNT(*) + 1 AS rank FROM players WHERE
    xp > ? OR (xp = ? AND level > ?) OR (xp = ? AND level = ? AND hall_level > ?)`)
    .bind(row.xp,row.xp,row.level,row.xp,row.level,row.hall_level).first();
  return { ...publicPlayer(row), rank: Number(rank?.rank || 1) };
}
async function parseBody(request) {
  try { const b = await request.json(); if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error(); return b; }
  catch { throw Object.assign(new Error("Тело запроса должно быть корректным JSON."), { status: 400 }); }
}
async function telegramCall(env, method, payload) {
  if (!env.BOT_TOKEN) throw new Error("BOT_TOKEN не настроен");
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(`Telegram API ${method} failed`);
  return result.result;
}
async function telegramSend(env, chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try { await telegramCall(env, "sendMessage", payload); } catch { /* Telegram may retry; do not expose bot token or user data. */ }
}
async function handleWebhook(request, env, url) {
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!env.WEBHOOK_SECRET || !constantTimeEqual(supplied, env.WEBHOOK_SECRET)) return fail(401,"Webhook secret mismatch.");
  let update;
  try { update = await request.json(); } catch { return fail(400,"Invalid Telegram update."); }
  const message = update?.message;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (message?.chat?.id && text) {
    const chatId = message.chat.id;
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      const appUrl = env.APP_URL || url.origin;
      await telegramSend(env, chatId,
        "🌾 <b>Добро пожаловать в «Король Фермы»!</b>\n\nРазвивайте своё королевство, выращивайте культуры, собирайте ресурсы и соревнуйтесь с другими игроками.\n\nНажмите «Играть», чтобы открыть свою ферму.",
        { inline_keyboard: [[{ text: "🌾 Играть", web_app: { url: appUrl } }]] });
    } else if (/^\/help(?:@\w+)?(?:\s|$)/i.test(text)) {
      await telegramSend(env, chatId, "Команды:\n/start — открыть игру\n/help — помощь\n\nИгровой прогресс сохраняется на сервере.");
    } else if (!text.startsWith("/")) {
      await telegramSend(env, chatId, "Чтобы начать играть, отправьте /start и нажмите «Играть».");
    }
  }
  return json({ ok: true });
}

async function actionRoute(request, env) {
  const { uid } = await authenticated(request, env);
  const payload = await parseBody(request);
  const action = String(payload.action || "");
  if (!/^[a-z_]{1,32}$/.test(action)) return fail(400,"Неизвестное действие.");
  const timestamp = now();
  // Shared per-user limiter; D1 makes the limit persist across Worker instances.
  await env.DB.prepare("DELETE FROM action_events WHERE created_at < ?").bind(timestamp - 60).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM action_events WHERE user_id=? AND created_at>=?").bind(uid,timestamp-60).first();
  if (Number(count?.n || 0) >= 60) return fail(429,"Слишком много действий. Подождите минуту.");
  await env.DB.prepare("INSERT INTO action_events(user_id,created_at) VALUES(?,?)").bind(uid,timestamp).run();
  let row = await env.DB.prepare("SELECT * FROM players WHERE user_id=?").bind(uid).first();
  const d = { ...row };
  let plots; try { plots = JSON.parse(d.plot_data || "{}"); } catch { plots = {}; }
  let msg = "";
  const pid = Number(payload.plot_id);
  if (action === "plant_plot") {
    const crop = String(payload.crop || ""), costs = { wheat: [2,"Пшеница"], carrot: [4,"Морковь"], potato: [6,"Картофель"] };
    if (!Number.isInteger(pid) || pid < 0 || pid > 5 || !costs[crop]) return fail(400,"Неверная грядка или культура.");
    const plot = plots[String(pid)] || { crop:"empty", planted_at:0 };
    if (plot.crop !== "empty") return fail(400,"Эта грядка уже занята. Сначала соберите урожай.");
    const [cost,label] = costs[crop]; if (d.coins < cost) return fail(400,`Не хватает монет: посадка стоит ${cost}.`);
    plots[String(pid)] = { crop, planted_at: timestamp }; d.coins -= cost; msg = `${label} посажена на грядке №${pid+1}.`;
  } else if (action === "harvest_plot") {
    if (!Number.isInteger(pid) || pid < 0 || pid > 5) return fail(400,"Неверная грядка.");
    const plot = plots[String(pid)] || { crop:"empty", planted_at:0 }, crop = plot.crop;
    if (crop === "empty") return fail(400,"Сначала посадите культуру на этой грядке.");
    const durations = { wheat:30, carrot:45, potato:60 }, duration = durations[crop] || 30, remaining = duration - (timestamp - Number(plot.planted_at || 0));
    if (remaining > 0) return fail(400,`Урожай ещё растёт. Осталось ${Math.ceil(remaining)} сек.`);
    const field = { wheat:"wheat", carrot:"carrots", potato:"potatoes" }[crop], amount = { wheat:5, carrot:4, potato:3 }[crop];
    d[field] += amount; d.coins += 5; d.xp += 8; d.harvests += 1; plots[String(pid)] = { crop:"empty", planted_at:0 };
    msg = `Урожай собран: +${amount}. +5 монет и +8 XP.`;
  } else if (action === "upgrade") {
    const cost = Number(d.hall_level) * 30; if (d.coins < cost) return fail(400,`Не хватает монет. Нужно ${cost}.`);
    d.coins -= cost; d.hall_level += 1; d.xp += 25; msg = `Ратуша улучшена до уровня ${d.hall_level}! +25 XP.`;
  } else if (["buy_wheat","buy_wood","buy_diamonds"].includes(action)) {
    const catalog = { buy_wheat:[15,"wheat",10], buy_wood:[20,"wood",5], buy_diamonds:[100,"diamonds",100] };
    const [cost,field,amount] = catalog[action]; if (d.coins < cost) return fail(400,`Не хватает монет. Нужно ${cost}.`);
    d.coins -= cost; d[field] += amount; msg = `Покупка успешна: +${amount} ${field}.`;
  } else if (action === "buy_item") {
    const catalog = { frame_bronze:[80,"frame","bronze"], frame_royal:[300,"frame","royal"], frame_diamond:[600,"frame","diamond"], color_red:[120,"nick_color","#c83232"], color_blue:[120,"nick_color","#2475cc"], vip:[500,"vip",1], premium:[1500,"premium",1] };
    const item = String(payload.item || ""), entry = catalog[item]; if (!entry) return fail(400,"Предмет не найден.");
    const [cost,field,value] = entry; if (d.diamonds < cost) return fail(400,`Не хватает алмазов. Нужно ${cost}.`);
    if (["vip","premium"].includes(field) && d[field]) return fail(400,"Эта привилегия уже активна.");
    d.diamonds -= cost; d[field] = value; msg = "Покупка завершена! Предмет применён к профилю.";
  } else if (action === "redeem") {
    const code = String(payload.code || "").trim().toLowerCase(); let rewards = DEFAULT_REDEEM;
    if (env.REDEEM_CODES) { try { rewards = { ...DEFAULT_REDEEM, ...JSON.parse(env.REDEEM_CODES) }; } catch {} }
    const reward = rewards[code]; if (!reward || typeof reward !== "object") return fail(400,"Код не найден или введён неверно.");
    const field = String(reward.resource || ""), amount = Number(reward.amount || 0);
    if (!REDEEM_FIELDS.has(field) || !Number.isInteger(amount) || amount < 1 || amount > 10000000) return fail(400,"Настройки награды для этого кода некорректны.");
    try { await env.DB.prepare("INSERT INTO redemption_uses(user_id,code,used_at) VALUES(?,?,?)").bind(uid,code,timestamp).run(); }
    catch { return fail(400,"Этот код уже использован на вашем аккаунте."); }
    d[field] += amount; msg = `Код активирован: +${amount} ${field}.`;
  } else if (action === "claim_task") {
    const key = String(payload.item || ""), task = TASKS[key]; if (!task) return fail(400,"Задание не найдено.");
    if (!task.condition(d)) return fail(400,"Сначала выполните условия задания.");
    try { await env.DB.prepare("INSERT INTO task_claims(user_id,task_key,claimed_at) VALUES(?,?,?)").bind(uid,key,timestamp).run(); }
    catch { return fail(400,"Награда за это задание уже получена."); }
    for (const [field,amount] of Object.entries(task.reward)) d[field] += amount;
    msg = "Награда получена: " + Object.entries(task.reward).map(([field,amount])=>`+${amount} ${field}`).join(", ") + ".";
  } else if (action === "set_profile") {
    if (payload.item === "flag" && ALLOWED_FLAGS.has(String(payload.value || ""))) { d.flag = payload.value; msg = "Флаг профиля обновлён."; }
    else if (payload.item === "language" && ["ru","en"].includes(payload.value)) { d.language = payload.value; msg = "Язык сохранён. Полный перевод интерфейса будет добавлен отдельно."; }
    else return fail(400,"Неизвестная настройка.");
  } else return fail(400,"Неизвестное действие.");
  d.level = Math.max(1,1 + Math.floor(Number(d.xp || 0) / 100));
  const result = await env.DB.prepare(`UPDATE players SET coins=?,wood=?,wheat=?,carrots=?,potatoes=?,diamonds=?,xp=?,level=?,hall_level=?,harvests=?,plot_data=?,flag=?,frame=?,nick_color=?,vip=?,premium=?,language=?,updated_at=? WHERE user_id=?`)
    .bind(d.coins,d.wood,d.wheat,d.carrots,d.potatoes,d.diamonds,d.xp,d.level,d.hall_level,d.harvests,JSON.stringify(plots),d.flag,d.frame,d.nick_color,d.vip,d.premium,d.language,timestamp,uid).run();
  if (!result.success) return fail(500,"Не удалось сохранить действие. Повторите попытку.");
  row = await env.DB.prepare("SELECT * FROM players WHERE user_id=?").bind(uid).first();
  return json({ message: msg, state: await stateWithRank(env,row) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return new Response(null, { status:204, headers:{"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type,X-Telegram-Init-Data"} });
      if (url.pathname === "/health") return json({ ok:true, service:"king-of-farmer-cloudflare", mode:"game-api-v1", database:!!env.DB, botConfigured:!!env.BOT_TOKEN });
      if (url.pathname === "/telegram/webhook" && request.method === "POST") return await handleWebhook(request,env,url);
      if (url.pathname === "/admin/set-webhook" && request.method === "POST") {
        const supplied = request.headers.get("x-setup-secret") || "";
        if (!env.SETUP_SECRET || !constantTimeEqual(supplied,env.SETUP_SECRET)) return fail(401,"Setup secret mismatch.");
        if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) return fail(503,"Добавьте BOT_TOKEN и WEBHOOK_SECRET в Cloudflare Secrets.");
        const info = await telegramCall(env,"setWebhook",{url:`${url.origin}/telegram/webhook`,secret_token:env.WEBHOOK_SECRET,allowed_updates:["message"],drop_pending_updates:false});
        return json({ok:!!info,url:`${url.origin}/telegram/webhook`,message:"Webhook установлен. Старый polling у этого же токена должен быть остановлен."});
      }
      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return fail(503,"Не подключена база D1 (binding DB).");
        if (url.pathname === "/api/state" && request.method === "GET") {
          const { row } = await authenticated(request,env); return json(await stateWithRank(env,row));
        }
        if (url.pathname === "/api/action" && request.method === "POST") return await actionRoute(request,env);
        if (url.pathname === "/api/tasks" && request.method === "GET") {
          const { uid } = await authenticated(request,env);
          const p = await env.DB.prepare("SELECT * FROM players WHERE user_id=?").bind(uid).first();
          const claims = await env.DB.prepare("SELECT task_key FROM task_claims WHERE user_id=?").bind(uid).all();
          const claimed = new Set((claims.results || []).map(r=>r.task_key));
          return json({tasks:Object.entries(TASKS).map(([key,t])=>({key,title:t.title,description:t.description,reward:t.reward,completed:!!t.condition(p),claimed:claimed.has(key)}))});
        }
        if (url.pathname === "/api/leaderboard" && request.method === "GET") {
          await authenticated(request,env);
          const result = await env.DB.prepare("SELECT user_id,name,username,avatar_url,flag,frame,nick_color,level,hall_level,xp,harvests,vip,premium,created_at FROM players ORDER BY xp DESC,level DESC,hall_level DESC LIMIT 100").all();
          return json({players:result.results || []});
        }
        const playerMatch = url.pathname.match(/^\/api\/player\/(\d+)$/);
        if (playerMatch && request.method === "GET") {
          await authenticated(request,env);
          const uid = Number(playerMatch[1]);
          const p = await env.DB.prepare("SELECT user_id,name,username,avatar_url,flag,frame,nick_color,level,hall_level,xp,harvests,vip,premium,created_at,coins,diamonds FROM players WHERE user_id=?").bind(uid).first();
          if (!p) return fail(404,"Игрок не найден.");
          const rank = await env.DB.prepare("SELECT COUNT(*)+1 AS rank FROM players WHERE xp > (SELECT xp FROM players WHERE user_id=?)").bind(uid).first();
          const result = {...p,rank:Number(rank?.rank || 1),days_played:Math.max(1,Math.floor((now()-Number(p.created_at||now()))/86400)+1)}; delete result.user_id; return json(result);
        }
        if (url.pathname === "/api/payment/create" && request.method === "POST") {
          const { uid } = await authenticated(request,env); const payload = await parseBody(request);
          const products = { diamonds_1000:[39,1000], diamonds_3000:[99,3000], diamonds_10000:[299,10000] };
          const product = products[String(payload.item || "")]; if (!product) return fail(400,"Пакет не найден.");
          const id = crypto.randomUUID(), [rub] = product;
          await env.DB.prepare("INSERT INTO payment_orders(id,user_id,sku,amount_rub,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,uid,String(payload.item),rub,"provider_not_configured",now()).run();
          return json({status:"provider_not_configured",order_id:id,amount_rub:rub,message:"Платёжный провайдер ещё не подключён. Алмазы не начислены."});
        }
        return fail(404,"Игровой API не найден.");
      }
      } catch (error) {
    console.error("Worker request failed:", {
      message: String(error?.message || error),
      stack: String(error?.stack || ""),
      path: new URL(request.url).pathname
    });
    const status = Number(error?.status || 500);
    if (status >= 500) return fail(status, "Внутренняя ошибка сервера. Проверьте настройки Worker и D1.");
    return fail(status, error?.message || "Запрос не выполнен.");
  }
      const status = Number(error?.status || 500);
      if (status >= 500) return fail(status,"Внутренняя ошибка сервера. Проверьте настройки Worker и D1.");
      return fail(status,error?.message || "Запрос не выполнен.");
    }
  }
};
