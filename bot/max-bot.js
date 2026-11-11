/**
 * Max Messenger Poker Bot
 * Связывает игроков Max с веб-приложением Poker Host
 */

const { io } = require('socket.io-client');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ====== НАСТРОЙКИ ======
const MAX_TOKEN = process.env.MAX_TOKEN || 'f9LHodD0cOLKECKjh4Mcu7UrmmP8sd0kz5Ir7mgFVzYN6osIAcKM5hofpq6cGuzsPOdmYCpv0_Dw0J_HJTrj';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const BOT_SECRET = process.env.BOT_SECRET || 'poker-bot-secret';
const GAME_ID = process.env.GAME_ID || ''; // Укажи ID игры после создания стола

if (!GAME_ID) {
  console.error('❌ Укажи GAME_ID: GAME_ID=xxxxx node max-bot.js');
  process.exit(1);
}

const MAX_API = 'https://platform-api2.max.ru';

// Хранилище привязок: maxUserId → { name, playerId }
const links = new Map();

// ====== Max API helpers ======
async function maxRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': MAX_TOKEN,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${MAX_API}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Max API error:', res.status, data);
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

async function sendMessage(userId, text) {
  try {
    await maxRequest('POST', `/messages?user_id=${userId}`, { text });
    console.log(`→ Max [${userId}]: ${text.slice(0, 60)}...`);
  } catch (e) {
    console.error('Ошибка отправки в Max:', e.message);
  }
}

// ====== Socket.IO к покерному серверу ======
const socket = io(SERVER_URL, { reconnection: true });

socket.on('connect', () => {
  console.log('✅ Подключился к покерному серверу');
  socket.emit('bot:join', { gameId: GAME_ID, secret: BOT_SECRET });
});

socket.on('disconnect', () => {
  console.log('⚠️  Отключился от сервера, переподключаюсь...');
});

socket.on('error', (err) => {
  console.error('Ошибка сервера:', err.message);
});

// Раздача карт
socket.on('bot:dealCards', async ({ cards, handNumber }) => {
  console.log(`\n🃏 Раздача #${handNumber}`);
  for (const { name, cards: hole, playerId } of cards) {
    // Находим maxUserId по имени или playerId
    let maxUserId = null;
    for (const [uid, link] of links.entries()) {
      if (link.name.toLowerCase() === name.toLowerCase() || link.playerId === playerId) {
        maxUserId = uid;
        break;
      }
    }

    if (!maxUserId) {
      console.log(`  ⚠️  Нет привязки Max для игрока "${name}"`);
      continue;
    }

    const cardsText = hole.map(c => c.code).join('  ');
    const msg = `🃏 Ваши карты (раздача #${handNumber}):\n\n${cardsText}\n\nНикому не показывайте!`;
    await sendMessage(maxUserId, msg);
  }
});

// Уведомление о ходе
socket.on('bot:yourTurn', async ({ playerName, playerId, canCheck, toCall, minRaise }) => {
  let maxUserId = null;
  for (const [uid, link] of links.entries()) {
    if (link.name.toLowerCase() === playerName.toLowerCase() || link.playerId === playerId) {
      maxUserId = uid;
      break;
    }
  }
  if (!maxUserId) return;

  let actions = ['fold — сбросить'];
  if (canCheck) actions.push('check — проверить');
  if (toCall > 0) actions.push(`call — уравнять (${toCall})`);
  else actions.push('check — проверить');
  actions.push(`raise ${minRaise || 20} — поднять`);
  actions.push('allin — ва-банк');

  const msg = `⏰ Сейчас ваш ход, ${playerName}!\n\nДоступные действия:\n` +
    actions.map(a => `• ${a}`).join('\n') +
    `\n\nПросто напишите команду (например: call или raise 50)`;

  await sendMessage(maxUserId, msg);
});

socket.on('bot:reply', async ({ maxUserId, message }) => {
  if (maxUserId) await sendMessage(maxUserId, message);
});

// ====== Обработка сообщений из Max (Long Polling) ======
let marker = null;

async function pollUpdates() {
  try {
    const params = new URLSearchParams({
      limit: 100,
      timeout: 30
    });
    if (marker) params.set('marker', marker);

    const data = await maxRequest('GET', `/updates?${params}`);
    if (data.marker) marker = data.marker;

    const updates = data.updates || [];
    for (const update of updates) {
      await handleUpdate(update);
    }
  } catch (e) {
    console.error('Ошибка long polling:', e.message);
    await new Promise(r => setTimeout(r, 3000));
  }
  // Следующий запрос
  setImmediate(pollUpdates);
}

async function handleUpdate(update) {
  // Сообщение от пользователя
  if (update.update_type === 'message_created' || update.type === 'message_created') {
    const msg = update.message || update;
    const userId = String(msg.sender?.user_id || msg.from?.user_id || msg.user_id);
    const text = (msg.body?.text || msg.text || '').trim();
    const userName = msg.sender?.name || msg.from?.name || 'Игрок';

    if (!userId || !text) return;

    console.log(`← Max [${userId} ${userName}]: ${text}`);
    await processCommand(userId, userName, text);
  }
}

async function processCommand(maxUserId, maxName, text) {
  const lower = text.toLowerCase().trim();

  // /start или первый контакт
  if (lower === '/start' || lower === 'start' || lower === 'начать') {
    await sendMessage(maxUserId,
      `Привет! Я бот для развлекательного покера.\n\n` +
      `Чтобы сесть за стол, напиши:\n` +
      `/join ТвойНикИзЗума\n\n` +
      `Например: /join Вася`
    );
    return;
  }

  // /join Ник
  const joinMatch = lower.match(/^\/join\s+(.+)$/i) || lower.match(/^join\s+(.+)$/i);
  if (joinMatch) {
    const nick = joinMatch[1].trim();
    if (nick.length < 1) {
      await sendMessage(maxUserId, 'Укажи ник: /join Вася');
      return;
    }

    // Отправляем на сервер
    socket.emit('bot:joinPlayer', {
      name: nick,
      maxUserId,
      maxName
    });

    // Временно запоминаем
    links.set(maxUserId, { name: nick, playerId: null, maxName });
    await sendMessage(maxUserId, `Заявка на вход как «${nick}» отправлена ведущему. Жди подтверждения.`);
    return;
  }

  // Действия
  const actionMap = {
    'fold': 'fold', 'сброс': 'fold', 'фолд': 'fold',
    'check': 'check', 'чек': 'check', 'проверить': 'check',
    'call': 'call', 'колл': 'call', 'колл': 'call', 'уравнять': 'call',
    'allin': 'allin', 'all-in': 'allin', 'вабанк': 'allin', 'ва-банк': 'allin', 'all in': 'allin'
  };

  // raise / рейз
  const raiseMatch = lower.match(/^(raise|рейз|bet|бет)\s+(\d+)$/i);
  if (raiseMatch) {
    const amount = parseInt(raiseMatch[2], 10);
    socket.emit('bot:playerAction', {
      maxUserId,
      action: 'raise',
      amount
    });
    return;
  }

  const action = actionMap[lower];
  if (action) {
    socket.emit('bot:playerAction', {
      maxUserId,
      action,
      amount: 0
    });
    return;
  }

  // Неизвестная команда
  await sendMessage(maxUserId,
    `Не понял команду.\n\n` +
    `Доступно:\n` +
    `/join Ник — сесть за стол\n` +
    `fold / check / call / raise 50 / allin`
  );
}

// Обработка ответов от сервера о привязке
socket.on('bot:linked', async ({ maxUserId, name, playerId, success, message }) => {
  if (success) {
    links.set(String(maxUserId), { name, playerId, maxName: links.get(String(maxUserId))?.maxName });
    await sendMessage(maxUserId, `✅ Ты за столом как «${name}»!\nЖди раздачи карт.`);
  } else {
    await sendMessage(maxUserId, `❌ ${message || 'Не удалось сесть за стол'}`);
  }
});

socket.on('bot:actionResult', async ({ maxUserId, success, message }) => {
  if (maxUserId) {
    await sendMessage(maxUserId, success ? `✅ ${message}` : `❌ ${message}`);
  }
});

// ====== Запуск ======
console.log('🤖 Max Poker Bot запускается...');
console.log(`   GAME_ID: ${GAME_ID}`);
console.log(`   SERVER:  ${SERVER_URL}`);

// Проверяем токен
maxRequest('GET', '/me')
  .then(me => {
    console.log(`✅ Бот Max: ${me.name || me.username || me.user_id || 'OK'}`);
    pollUpdates();
  })
  .catch(err => {
    console.error('❌ Не удалось авторизоваться в Max. Проверь токен.');
    console.error(err.message);
    process.exit(1);
  });
