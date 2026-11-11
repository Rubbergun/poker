/**
 * Zoom Poker Bot Skeleton
 * 
 * Этот файл — заготовка. Он подключается к веб-приложению по Socket.IO
 * и готов принимать события раздачи карт + отправлять действия игроков.
 * 
 * Для реального Zoom нужно подключить Meeting SDK или сторонний сервис
 * (MeetStream, Recall.ai и т.п.), который умеет:
 *  - заходить в встречу
 *  - читать чат (общий + личный)
 *  - отправлять личные сообщения
 * 
 * Ниже — логика, которую нужно вызвать из реального Zoom-бота.
 */

const { io } = require('socket.io-client');

const GAME_ID = process.env.GAME_ID || '';
const BOT_SECRET = process.env.BOT_SECRET || 'poker-bot-secret';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

if (!GAME_ID) {
  console.error('Укажи GAME_ID (ID игры из веб-приложения)');
  process.exit(1);
}

const socket = io(SERVER_URL);

socket.on('connect', () => {
  console.log('Подключился к серверу');
  socket.emit('bot:join', { gameId: GAME_ID, secret: BOT_SECRET });
});

socket.on('state', (state) => {
  // Можно логировать состояние, если нужно
  // console.log('State update:', state.street, 'pot:', state.pot);
});

socket.on('bot:dealCards', ({ cards, handNumber }) => {
  console.log(`\n=== Раздача #${handNumber} ===`);
  cards.forEach(({ name, cards: hole }) => {
    const text = hole.map(c => c.code).join(' ');
    console.log(`→ ${name}: ${text}`);

    // ============================================
    // ЗДЕСЬ нужно отправить личное сообщение в Zoom
    // Пример (псевдокод):
    //   zoomBot.sendPrivateMessage(name, `Ваши карты: ${text}`);
    // ============================================
  });
});

socket.on('bot:reply', ({ message }) => {
  console.log('Ответ сервера:', message);
  // Можно отправить это сообщение обратно в чат Zoom
});

socket.on('error', (err) => {
  console.error('Ошибка:', err.message);
});

// ===== Функции, которые вызывает Zoom-бот при получении сообщений из чата =====

/**
 * Игрок написал в чат /join или "!join"
 */
function onPlayerJoin(playerName) {
  socket.emit('bot:joinPlayer', { name: playerName });
}

/**
 * Игрок написал действие: fold / check / call / raise 50 / allin
 */
function onPlayerAction(playerName, action, amount = 0) {
  const map = {
    fold: 'fold',
    сброс: 'fold',
    check: 'check',
    чек: 'check',
    call: 'call',
    колл: 'call',
    raise: 'raise',
    рейз: 'raise',
    bet: 'bet',
    бет: 'bet',
    allin: 'allin',
    'all-in': 'allin',
    вабанк: 'allin'
  };

  const act = map[action.toLowerCase()];
  if (!act) {
    console.log(`Неизвестное действие: ${action}`);
    return;
  }

  socket.emit('bot:playerAction', {
    playerName,
    action: act,
    amount: Number(amount) || 0
  });
}

// Пример парсинга сообщения из Zoom-чата
function parseChatMessage(senderName, text) {
  const cleaned = text.trim().toLowerCase();

  if (cleaned === '/join' || cleaned === '!join' || cleaned === 'join') {
    onPlayerJoin(senderName);
    return;
  }

  // raise 100 / рейз 50
  const raiseMatch = cleaned.match(/^(raise|рейз|bet|бет)\s+(\d+)/);
  if (raiseMatch) {
    onPlayerAction(senderName, raiseMatch[1], raiseMatch[2]);
    return;
  }

  // простые команды
  if (['fold', 'сброс', 'check', 'чек', 'call', 'колл', 'allin', 'all-in', 'вабанк'].includes(cleaned)) {
    onPlayerAction(senderName, cleaned);
  }
}

// Экспорт для использования в реальном Zoom-боте
module.exports = {
  onPlayerJoin,
  onPlayerAction,
  parseChatMessage,
  socket
};

console.log('Bot skeleton запущен. Ожидаю события раздачи...');
console.log('Для теста можешь вызывать parseChatMessage("ИмяИгрока", "fold")');
