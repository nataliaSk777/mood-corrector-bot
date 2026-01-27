'use strict';

const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('Ошибка: переменная окружения BOT_TOKEN не задана');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// db.json рядом с index.js/cron.js
const DB_PATH = path.join(__dirname, 'db.json');

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: {} };
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Ошибка чтения db.json:', e);
    return { users: {} };
  }
}

function dailyPromptText() {
  return 'Ежедневный чек-ин.\n\nСделай один спокойный вдох.\nКогда будешь готова — выбери режим:';
}

async function run() {
  const db = loadDb();
  const users = db?.users || {};

  const targets = Object.values(users)
    .filter(u => u && u.daily && u.daily.enabled === true && u.chatId);

  if (targets.length === 0) {
    console.log('Нет пользователей для daily-рассылки.');
    return;
  }

  console.log(`Daily-рассылка: ${targets.length} чатов`);

  for (const u of targets) {
    try {
      await bot.telegram.sendMessage(u.chatId, dailyPromptText());
    } catch (e) {
      console.error(`Не удалось отправить в chatId=${u.chatId}:`, e?.message || e);
    }
  }
}

process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection:', e);
  process.exit(1);
});

process.on('uncaughtException', (e) => {
  console.error('uncaughtException:', e);
  process.exit(1);
});

run()
  .then(() => {
    console.log('Cron done');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Cron failed:', e);
    process.exit(1);
  });
