import asyncio, hashlib, hmac, json, os, sqlite3, time, secrets
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

load_dotenv()
BOT_TOKEN=os.getenv('BOT_TOKEN',''); APP_URL=os.getenv('APP_URL','https://example.com')
DATABASE_PATH=os.getenv('DATABASE_PATH','./game.sqlite3'); WEB_DIR=os.getenv('WEB_DIR','./web')
DEFAULT_REDEEM_CODES={'алмаз1000':{'resource':'diamonds','amount':1000},'монет4999':{'resource':'coins','amount':4999},'xp500':{'resource':'xp','amount':500},'дерево500':{'resource':'wood','amount':500},'пшеница500':{'resource':'wheat','amount':500}}
try: REDEEM_CODES=json.loads(os.getenv('REDEEM_CODES',json.dumps(DEFAULT_REDEEM_CODES,ensure_ascii=False)))
except Exception: REDEEM_CODES=DEFAULT_REDEEM_CODES
bot=Bot(BOT_TOKEN) if BOT_TOKEN else None; dp=Dispatcher()

def db():
    conn=sqlite3.connect(DATABASE_PATH, timeout=20); conn.row_factory=sqlite3.Row; return conn

def init_db():
    with db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS players(
          user_id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', coins INTEGER NOT NULL DEFAULT 80,
          wood INTEGER NOT NULL DEFAULT 20, wheat INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 1, hall_level INTEGER NOT NULL DEFAULT 1,
          harvests INTEGER NOT NULL DEFAULT 0, next_harvest_at REAL NOT NULL DEFAULT 0, updated_at REAL NOT NULL DEFAULT 0)''')
        existing={r['name'] for r in c.execute('PRAGMA table_info(players)').fetchall()}
        additions={'diamonds':'INTEGER NOT NULL DEFAULT 0','carrots':'INTEGER NOT NULL DEFAULT 0','potatoes':'INTEGER NOT NULL DEFAULT 0',
          'avatar_url':"TEXT NOT NULL DEFAULT ''",'username':"TEXT NOT NULL DEFAULT ''",'language':"TEXT NOT NULL DEFAULT 'ru'",'flag':"TEXT NOT NULL DEFAULT '🌍'",
          'frame':"TEXT NOT NULL DEFAULT 'none'",'nick_color':"TEXT NOT NULL DEFAULT '#49301f'",'vip':"INTEGER NOT NULL DEFAULT 0",'premium':"INTEGER NOT NULL DEFAULT 0",
          'created_at':'REAL NOT NULL DEFAULT 0','days_played':'INTEGER NOT NULL DEFAULT 1','plot_data':"TEXT NOT NULL DEFAULT '{}'"}
        for name, decl in additions.items():
            if name not in existing: c.execute(f'ALTER TABLE players ADD COLUMN {name} {decl}')
        c.execute('''CREATE TABLE IF NOT EXISTS redemption_uses(user_id INTEGER NOT NULL, code TEXT NOT NULL, used_at REAL NOT NULL, PRIMARY KEY(user_id,code))''')
        c.execute('''CREATE TABLE IF NOT EXISTS payment_orders(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,sku TEXT NOT NULL,amount_rub INTEGER NOT NULL,status TEXT NOT NULL,created_at REAL NOT NULL)''')

def ensure_player(user_id, user=None):
    user=user or {}; name=(user.get('first_name','Фермер')+' '+user.get('last_name','')).strip() or 'Фермер'; now=time.time()
    with db() as c:
        row=c.execute('SELECT * FROM players WHERE user_id=?',(user_id,)).fetchone()
        if row is None:
            c.execute('INSERT INTO players(user_id,name,username,avatar_url,created_at,updated_at,next_harvest_at) VALUES(?,?,?,?,?,?,?)',(user_id,name,user.get('username',''),user.get('photo_url',''),now,now,0))
            c.execute('UPDATE players SET plot_data=? WHERE user_id=?',(json.dumps({str(i):{'crop':'empty','planted_at':0} for i in range(6)}),user_id))
        else:
            c.execute('UPDATE players SET name=?,username=?,avatar_url=?,updated_at=? WHERE user_id=?',(name,user.get('username',row['username']),user.get('photo_url',row['avatar_url']),now,user_id))
        return c.execute('SELECT * FROM players WHERE user_id=?',(user_id,)).fetchone()

def safe_state(row):
    d=dict(row); d.pop('user_id',None); d.pop('updated_at',None); d.pop('plot_data',None)
    d['plots']=json.loads(row['plot_data'] or '{}'); d['created_at']=int(d.get('created_at') or time.time()); d['days_played']=max(1,int((time.time()-d['created_at'])//86400)+1)
    return d

def validate_init_data(init_data):
    if not BOT_TOKEN: raise HTTPException(503,'На сервере не задан BOT_TOKEN')
    if not init_data: raise HTTPException(401,'Откройте игру через Telegram')
    values=dict(parse_qsl(init_data,keep_blank_values=True)); received=values.pop('hash',None)
    if not received: raise HTTPException(401,'Не найдена подпись Telegram')
    try: auth_date=int(values.get('auth_date','0') or '0')
    except ValueError: auth_date=0
    if abs(time.time()-auth_date)>86400: raise HTTPException(401,'Сессия Telegram устарела. Закройте и откройте игру снова.')
    data_check='\n'.join(f'{k}={v}' for k,v in sorted(values.items())); secret=hmac.new(b'WebAppData',BOT_TOKEN.encode(),hashlib.sha256).digest(); expected=hmac.new(secret,data_check.encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,received): raise HTTPException(401,'Не удалось проверить подпись Telegram')
    try: return json.loads(values['user'])
    except Exception: raise HTTPException(401,'Нет данных пользователя Telegram')

def player_from_header(value):
    user=validate_init_data(value); ensure_player(int(user['id']),user); return user

@dp.message(CommandStart())
async def start(message: Message):
    keyboard=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text='🌾 Играть',web_app=WebAppInfo(url=APP_URL))]])
    await message.answer('🏰 <b>Добро пожаловать в King of Farmer!</b>\n\nРазвивайте своё королевство, выращивайте культуры, собирайте ресурсы и соревнуйтесь с другими игроками.\n\nНажмите «Играть», чтобы открыть свою землю.',reply_markup=keyboard,parse_mode='HTML')
@dp.message(Command('help'))
async def help_command(message: Message): await message.answer('Команды:\n/start — открыть игру\n/help — помощь\n\nИгровой прогресс хранится на сервере.')
@dp.message()
async def fallback(message: Message): await message.answer('Чтобы начать играть, отправьте /start и нажмите «Играть».')

class ActionRequest(BaseModel): action:str; plot_id:int|None=None; crop:str|None=None; code:str|None=None; item:str|None=None; value:str|None=None

@asynccontextmanager
async def lifespan(app:FastAPI):
    init_db(); task=None
    if bot: task=asyncio.create_task(dp.start_polling(bot,handle_signals=False))
    yield
    if task:
        await dp.stop_polling(); task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        await bot.session.close()
app=FastAPI(title='King of Farmer Telegram API',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_methods=['GET','POST','OPTIONS'],allow_headers=['*'])
@app.get('/health')
def health(): return {'ok':True,'service':'king-of-farmer'}
@app.get('/api/state')
def get_state(x_telegram_init_data:str=Header(default='')):
    user=player_from_header(x_telegram_init_data); return safe_state(ensure_player(int(user['id']),user))
@app.get('/api/leaderboard')
def leaderboard(x_telegram_init_data:str=Header(default='')):
    player_from_header(x_telegram_init_data)
    with db() as c: rows=c.execute('SELECT user_id,name,username,avatar_url,flag,frame,nick_color,level,hall_level,xp,harvests,diamonds,vip,premium,created_at FROM players ORDER BY xp DESC,level DESC,hall_level DESC LIMIT 100').fetchall()
    return {'players':[dict(r) for r in rows]}
@app.get('/api/player/{user_id}')
def player_profile(user_id:int,x_telegram_init_data:str=Header(default='')):
    player_from_header(x_telegram_init_data)
    with db() as c:
        row=c.execute('SELECT user_id,name,username,avatar_url,flag,frame,nick_color,level,hall_level,xp,harvests,diamonds,coins,wood,wheat,carrots,potatoes,vip,premium,created_at FROM players WHERE user_id=?',(user_id,)).fetchone()
        rank=c.execute('SELECT COUNT(*)+1 AS rank FROM players WHERE xp>(SELECT xp FROM players WHERE user_id=?)',(user_id,)).fetchone()
    if not row: raise HTTPException(404,'Игрок не найден')
    d=dict(row); d['rank']=rank['rank'] if rank else None; d['days_played']=max(1,int((time.time()-(d['created_at'] or time.time()))//86400)+1); d.pop('user_id',None); return d
@app.post('/api/action')
def do_action(payload:ActionRequest,x_telegram_init_data:str=Header(default='')):
    user=player_from_header(x_telegram_init_data); uid=int(user['id']); now=time.time(); ensure_player(uid,user)
    with db() as c:
        row=c.execute('SELECT * FROM players WHERE user_id=?',(uid,)).fetchone(); d=dict(row); action=payload.action; msg=''; plots=json.loads(d['plot_data'] or '{}')
        if action=='plant_plot':
            pid=payload.plot_id; crop=payload.crop
            costs={'wheat':(2,'Пшеница'),'carrot':(4,'Морковь'),'potato':(6,'Картофель')}
            if pid not in range(6) or crop not in costs: raise HTTPException(400,'Неверная грядка или культура')
            plot=plots.get(str(pid),{'crop':'empty','planted_at':0})
            if plot.get('crop')!='empty': raise HTTPException(400,'Эта грядка уже занята. Сначала соберите урожай.')
            cost,label=costs[crop]
            if d['coins']<cost: raise HTTPException(400,f'Не хватает монет: посадка стоит {cost}.')
            plots[str(pid)]={'crop':crop,'planted_at':now}; d['coins']-=cost; msg=f'{label} посажена на грядке №{pid+1}.'
        elif action=='harvest_plot':
            pid=payload.plot_id
            if pid not in range(6): raise HTTPException(400,'Неверная грядка')
            plot=plots.get(str(pid),{'crop':'empty','planted_at':0}); crop=plot.get('crop','empty')
            if crop=='empty': raise HTTPException(400,'Сначала посадите культуру на этой грядке.')
            duration={'wheat':30,'carrot':45,'potato':60}.get(crop,30)
            if now-float(plot.get('planted_at',0))<duration: raise HTTPException(400,f'Урожай ещё растёт. Осталось {int(duration-(now-float(plot.get("planted_at",0))))+1} сек.')
            key={'wheat':'wheat','carrot':'carrots','potato':'potatoes'}[crop]; amount={'wheat':5,'carrot':4,'potato':3}[crop]; d[key]+=amount; d['coins']+=5; d['xp']+=8; d['harvests']+=1; plots[str(pid)]={'crop':'empty','planted_at':0}; msg=f'Урожай собран: +{amount}. +5 монет и +8 XP.'
        elif action=='upgrade':
            cost=d['hall_level']*30
            if d['coins']<cost: raise HTTPException(400,f'Не хватает монет. Нужно {cost}.')
            d['coins']-=cost; d['hall_level']+=1; d['xp']+=25; msg=f'Ратуша улучшена до уровня {d["hall_level"]}! +25 XP.'
        elif action in ('buy_wheat','buy_wood','buy_diamonds'):
            if action=='buy_wheat': cost,field,amount=15,'wheat',10
            elif action=='buy_wood': cost,field,amount=20,'wood',5
            else: cost,field,amount=100,'diamonds',100
            if d['coins']<cost: raise HTTPException(400,f'Не хватает монет. Нужно {cost}.')
            d['coins']-=cost; d[field]+=amount; msg=f'Покупка успешна: +{amount} {field}.'
        elif action=='buy_item':
            item=payload.item or ''; catalog={'frame_bronze':(80,'frame','bronze'),'frame_royal':(300,'frame','royal'),'frame_diamond':(600,'frame','diamond'),'color_red':(120,'nick_color','#c83232'),'color_blue':(120,'nick_color','#2475cc'),'vip':(500,'vip',1),'premium':(1500,'premium',1)}
            if item not in catalog: raise HTTPException(400,'Предмет не найден')
            cost,field,value=catalog[item]
            if d['diamonds']<cost: raise HTTPException(400,f'Не хватает алмазов. Нужно {cost}.')
            if field in ('vip','premium') and d[field]: raise HTTPException(400,'Эта привилегия уже активна.')
            d['diamonds']-=cost; d[field]=value; msg='Покупка завершена! Предмет применён к профилю.'
        elif action=='redeem':
            code=(payload.code or '').strip().lower()
            rewards=REDEEM_CODES
            if code not in rewards or not isinstance(rewards[code],dict): raise HTTPException(400,'Код не найден или введён неверно.')
            try: c.execute('INSERT INTO redemption_uses(user_id,code,used_at) VALUES(?,?,?)',(uid,code,now))
            except sqlite3.IntegrityError: raise HTTPException(400,'Этот код уже использован на вашем аккаунте.')
            field=rewards[code].get('resource',''); amount=int(rewards[code].get('amount',0))
            if field not in ('diamonds','coins','xp','wood','wheat','carrots','potatoes') or amount<1 or amount>10000000: raise HTTPException(400,'Настройки награды для этого кода некорректны.')
            d[field]+=amount; msg=f'Код активирован: +{amount} {field}.'
        elif action=='set_profile':
            allowed_flags={'🌍','🇷🇺','🇺🇸','🇬🇧','🇩🇪','🇫🇷','🇪🇸','🇮🇹','🇵🇱','🇹🇷','🇺🇦','🇧🇷','🇯🇵','🇨🇳','🇰🇿','🇧🇾'}
            if payload.item=='flag':
                if payload.value not in allowed_flags: raise HTTPException(400,'Флаг недоступен')
                d['flag']=payload.value; msg='Флаг профиля обновлён.'
            elif payload.item=='language' and payload.value in ('ru','en'): d['language']=payload.value; msg='Язык сохранён. Полный перевод интерфейса будет добавлен отдельно.'
            else: raise HTTPException(400,'Неизвестная настройка')
        else: raise HTTPException(400,'Неизвестное действие')
        d['level']=max(1,1+d['xp']//100); d['updated_at']=now
        c.execute('''UPDATE players SET name=?,coins=?,wood=?,wheat=?,carrots=?,potatoes=?,diamonds=?,xp=?,level=?,hall_level=?,harvests=?,plot_data=?,flag=?,frame=?,nick_color=?,vip=?,premium=?,language=?,updated_at=? WHERE user_id=?''',
          (d['name'],d['coins'],d['wood'],d['wheat'],d['carrots'],d['potatoes'],d['diamonds'],d['xp'],d['level'],d['hall_level'],d['harvests'],json.dumps(plots),d['flag'],d['frame'],d['nick_color'],d['vip'],d['premium'],d['language'],now,uid))
        updated=c.execute('SELECT * FROM players WHERE user_id=?',(uid,)).fetchone()
    return {'message':msg,'state':safe_state(updated)}
@app.post('/api/payment/create')
def create_payment(payload:ActionRequest,x_telegram_init_data:str=Header(default='')):
    user=player_from_header(x_telegram_init_data); products={'diamonds_1000':(39,1000),'diamonds_3000':(99,3000),'diamonds_10000':(299,10000)}
    if payload.item not in products: raise HTTPException(400,'Пакет не найден')
    rub,diamonds=products[payload.item]; order=secrets.token_urlsafe(12)
    with db() as c: c.execute('INSERT INTO payment_orders(id,user_id,sku,amount_rub,status,created_at) VALUES(?,?,?,?,?,?)',(order,int(user['id']),payload.item,rub,'provider_not_configured',time.time()))
    return {'status':'provider_not_configured','order_id':order,'amount_rub':rub,'message':'Платёжный провайдер ещё не подключён. Алмазы не начислены.'}
if os.path.isdir(WEB_DIR): app.mount('/',StaticFiles(directory=WEB_DIR,html=True),name='web')
