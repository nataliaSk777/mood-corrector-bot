'use strict';

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Ошибка: переменная окружения BOT_TOKEN не задана');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---- простое JSON-хранилище (подойдёт для MVP) ----
const DB_PATH = path.join(__dirname, 'db.json');

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: {} };
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function getUser(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      chatId: null,
      state: 'idle',          // idle | waiting_intensity | waiting_label | waiting_topic | waiting_choice
      mode: null,             // support | correct | clarity
      last: {
        intensity: null,      // 0..10
        label: null,
        topic: null,
        choice: null
      },
      daily: {
        enabled: false
      },
      history: []
    };
  }
  return db.users[userId];
}

function nowIso() {
  return new Date().toISOString();
}

// ---- UI ----
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🟢 Поддержка', 'mode_support')],
  [Markup.button.callback('🟡 Коррекция', 'mode_correct')],
  [Markup.button.callback('🔵 Ясность', 'mode_clarity')],
  [Markup.button.callback('🧾 Чек-ин', 'checkin')]
]);

function intensityKeyboard() {
  const row1 = [0,1,2,3,4].map(n => Markup.button.callback(String(n), `int_${n}`));
  const row2 = [5,6,7,8,9,10].map(n => Markup.button.callback(String(n), `int_${n}`));
  return Markup.inlineKeyboard([row1, row2, [Markup.button.callback('Отмена', 'cancel')]]);
}

const choiceKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Остаться с этим', 'choice_stay')],
  [Markup.button.callback('Сделать на 5% мягче', 'choice_soften')],
  [Markup.button.callback('Отмена', 'cancel')]
]);

function shortReflect(label, intensity) {
  const safe = (label || 'что-то').slice(0, 64);
  if (intensity >= 8) return `Сейчас это очень интенсивно: «${safe}» примерно на ${intensity}/10.`;
  if (intensity >= 5) return `Похоже на «${safe}» примерно на ${intensity}/10.`;
  return `Сейчас скорее тихое «${safe}» на ${intensity}/10.`;
}

function closingLine(mode) {
  if (mode === 'support') return 'На сейчас достаточно. Ты не обязана быть сильной.';
  if (mode === 'correct') return 'Микросдвиг сделан. Дальше можно жить шагом.';
  return 'Ясность на 1% — уже ясность. Хорошо.';
}

function dailyPromptText() {
  return 'Ежедневный чек-ин.\n\nСделай один спокойный вдох.\nКогда будешь готова — выбери режим:';
}

// ---- Команды ----
bot.start(async (ctx) => {
  // запомним chatId сразу, чтобы можно было писать в этот чат из cron
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;
  saveDb(db);

  await ctx.reply(
    'Я твой корректор настроения.\n\nКоманда: /checkin\nЕжедневный чек-ин: /daily_on и /daily_off',
    mainMenu
  );
});

bot.command('checkin', async (ctx) => {
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;
  u.state = 'idle';
  u.mode = null;
  saveDb(db);

  await ctx.reply(
    'Чек-ин. Сначала пауза.\n\nСделай один спокойный вдох.\nКогда будешь готова — выбери режим:',
    mainMenu
  );
});

bot.command('daily_on', async (ctx) => {
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;
  u.daily.enabled = true;
  saveDb(db);

  await ctx.reply('Ок. Включила ежедневный чек-ин ✅\nЧтобы выключить: /daily_off');
});

bot.command('daily_off', async (ctx) => {
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;
  u.daily.enabled = false;
  saveDb(db);

  await ctx.reply('Ок. Ежедневный чек-ин выключен ✅\nЧтобы включить: /daily_on');
});

bot.action('checkin', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;
  u.state = 'idle';
  u.mode = null;
  saveDb(db);

  await ctx.reply(dailyPromptText(), mainMenu);
});

// ---- Выбор режима ----
bot.action('mode_support', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  u.mode = 'support';
  u.state = 'waiting_intensity';
  saveDb(db);

  await ctx.reply('🟢 Поддержка.\nОцени интенсивность состояния от 0 до 10:', intensityKeyboard());
});

bot.action('mode_correct', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  u.mode = 'correct';
  u.state = 'waiting_intensity';
  saveDb(db);

  await ctx.reply('🟡 Коррекция.\nОцени интенсивность состояния от 0 до 10:', intensityKeyboard());
});

bot.action('mode_clarity', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  u.mode = 'clarity';
  u.state = 'waiting_intensity';
  saveDb(db);

  await ctx.reply('🔵 Ясность.\nОцени интенсивность состояния от 0 до 10:', intensityKeyboard());
});

// ---- Интенсивность ----
bot.action(/^int_(\d{1,2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  const intensity = Number(ctx.match[1]);

  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  if (u.state !== 'waiting_intensity') {
    await ctx.reply('Ок. Начни с /checkin');
    return;
  }

  u.last.intensity = intensity;
  u.state = 'waiting_label';
  saveDb(db);

  await ctx.reply(
    'Одним-двумя словами: как это называется сейчас?\nПримеры: тревога, усталость, злость, пустота, нежность.'
  );
});

// ---- Текстовые шаги ----
bot.on('text', async (ctx) => {
  const text = String(ctx.message.text || '').trim();
  if (!text) return;

  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  if (text.startsWith('/')) return;

  if (u.state === 'waiting_label') {
    u.last.label = text.slice(0, 64);
    u.state = 'waiting_topic';
    saveDb(db);
    await ctx.reply('Что произошло или что давит? Одной фразой.');
    return;
  }

  if (u.state === 'waiting_topic') {
    u.last.topic = text.slice(0, 180);
    const reflect = shortReflect(u.last.label || 'что-то', u.last.intensity ?? 0);

    if (u.mode === 'support') {
      u.state = 'idle';
      u.history.push({ at: nowIso(), mode: u.mode, intensity: u.last.intensity, label: u.last.label, topic: u.last.topic });
      if (u.history.length > 60) u.history.shift();
      saveDb(db);

      await ctx.reply(
        `${reflect}\n\nСейчас сделай так:\n1) Ноги в пол.\n2) Плечи вниз.\n3) Длинный выдох.\n\n${closingLine('support')}`,
        mainMenu
      );
      return;
    }

    if (u.mode === 'correct') {
      u.state = 'waiting_choice';
      saveDb(db);
      await ctx.reply(`${reflect}\n\nХочешь остаться с этим или сделать на 5% мягче?`, choiceKeyboard);
      return;
    }

    u.state = 'idle';
    u.history.push({ at: nowIso(), mode: u.mode, intensity: u.last.intensity, label: u.last.label, topic: u.last.topic });
    if (u.history.length > 60) u.history.shift();
    saveDb(db);

    await ctx.reply(
      `${reflect}\n\nОдин вопрос на ясность:\nЧто мне важно защитить или сохранить прямо сейчас?\n\n${closingLine('clarity')}`,
      mainMenu
    );
    return;
  }

  await ctx.reply('Я тут. Если хочешь — начни с /checkin', mainMenu);
});

// ---- Выбор в коррекции ----
bot.action('choice_stay', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  if (u.state !== 'waiting_choice' || u.mode !== 'correct') {
    await ctx.reply('Ок. Начни с /checkin');
    return;
  }

  u.last.choice = 'stay';
  u.state = 'idle';
  u.history.push({ at: nowIso(), mode: u.mode, intensity: u.last.intensity, label: u.last.label, topic: u.last.topic, choice: u.last.choice });
  if (u.history.length > 60) u.history.shift();
  saveDb(db);

  await ctx.reply(
    `Хорошо. Тогда без “чинить”.\n\nСделай 3 дыхания: вдох — короче, выдох — длиннее.\nИ скажи себе: «Я могу это выдержать без спешки».\n\n${closingLine('correct')}`,
    mainMenu
  );
});

bot.action('choice_soften', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  if (u.state !== 'waiting_choice' || u.mode !== 'correct') {
    await ctx.reply('Ок. Начни с /checkin');
    return;
  }

  u.last.choice = 'soften';
  u.state = 'idle';
  u.history.push({ at: nowIso(), mode: u.mode, intensity: u.last.intensity, label: u.last.label, topic: u.last.topic, choice: u.last.choice });
  if (u.history.length > 60) u.history.shift();
  saveDb(db);

  await ctx.reply(
    `Ок, делаем 5% мягче.\n\nМикро-действие на 60 секунд:\n1) Назови 3 предмета вокруг.\n2) Почувствуй опору под стопами.\n3) Один длинный выдох.\n\n${closingLine('correct')}`,
    mainMenu
  );
});

// ---- Отмена ----
bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDb();
  const u = getUser(db, String(ctx.from.id));
  u.chatId = ctx.chat.id;

  u.state = 'idle';
  u.mode = null;
  saveDb(db);

  await ctx.reply('Ок, отменили. Если надо — /checkin', mainMenu);
});

bot.launch().then(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
