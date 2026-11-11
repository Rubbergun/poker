const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { PokerGame } = require('../shared/poker-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// gameId → PokerGame
const games = new Map();

// gameId → Map(maxUserId → { name, playerId })
const maxLinks = new Map();

// ========== REST ==========
app.post('/api/games', (req, res) => {
  const {
    maxPlayers = 9,
    startingStack = 1000,
    smallBlind = 5,
    bigBlind = 10,
    useBlinds = true
  } = req.body;

  const game = new PokerGame({
    maxPlayers: Math.min(10, Math.max(6, maxPlayers)),
    startingStack,
    smallBlind,
    bigBlind,
    useBlinds
  });

  games.set(game.id, game);
  maxLinks.set(game.id, new Map());
  console.log(`Game created: ${game.id}`);
  res.json({ ok: true, gameId: game.id, state: game.getPublicState('host') });
});

app.get('/api/games/:id', (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ ok: false, error: 'Игра не найдена' });
  res.json({ ok: true, state: game.getPublicState('host') });
});

// ========== Socket.IO ==========
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Host
  socket.on('host:join', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Игра не найдена' });
      return;
    }
    socket.join(gameId);
    socket.gameId = gameId;
    socket.role = 'host';
    socket.emit('state', game.getPublicState('host'));
    console.log(`Host joined ${gameId}`);
  });

  // Bot (Max)
  socket.on('bot:join', ({ gameId, secret }) => {
    if (secret !== process.env.BOT_SECRET && secret !== 'poker-bot-secret') {
      socket.emit('error', { message: 'Неверный секрет бота' });
      return;
    }
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Игра не найдена' });
      return;
    }
    socket.join(gameId);
    socket.gameId = gameId;
    socket.role = 'bot';
    socket.emit('state', game.getPublicState('host'));
    console.log(`Max-bot joined ${gameId}`);
  });

  // ===== Host controls =====
  socket.on('host:addPlayer', ({ name }) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;
    const result = game.addPlayer(name);
    if (result.ok) {
      broadcast(game);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('host:removePlayer', ({ playerId }) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;
    game.removePlayer(playerId);
    // clean links
    const links = maxLinks.get(socket.gameId);
    if (links) {
      for (const [uid, link] of links.entries()) {
        if (link.playerId === playerId) links.delete(uid);
      }
    }
    broadcast(game);
  });

  socket.on('host:startHand', () => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;

    const result = game.startHand();
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }

    broadcast(game);

    // Карты боту
    const privateCards = game.players
      .filter(p => p.holeCards.length === 2)
      .map(p => ({
        playerId: p.id,
        name: p.name,
        cards: p.holeCards
      }));
    io.to(socket.gameId).emit('bot:dealCards', {
      cards: privateCards,
      handNumber: game.handNumber
    });

    // Сообщаем первому игроку о ходе
    notifyTurn(game);
  });

  socket.on('host:action', ({ playerId, action, amount }) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;
    doAction(game, playerId, action, amount || 0, socket);
  });

  socket.on('host:nextHand', () => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;
    game.status = 'lobby';
    game.street = 'waiting';
    broadcast(game);
  });

  socket.on('host:updateSettings', (settings) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'host') return;
    if (settings.useBlinds !== undefined) game.useBlinds = settings.useBlinds;
    if (settings.smallBlind) game.smallBlind = settings.smallBlind;
    if (settings.bigBlind) game.bigBlind = settings.bigBlind;
    if (settings.startingStack) game.startingStack = settings.startingStack;
    broadcast(game);
  });

  // ===== Max Bot events =====

  // Игрок хочет сесть: /join Ник
  socket.on('bot:joinPlayer', ({ name, maxUserId, maxName }) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'bot') return;

    const links = maxLinks.get(socket.gameId) || new Map();

    // Уже привязан?
    if (links.has(String(maxUserId))) {
      socket.emit('bot:linked', {
        maxUserId,
        success: false,
        message: 'Ты уже за столом'
      });
      return;
    }

    // Пробуем добавить
    let result = game.addPlayer(name);
    if (!result.ok) {
      // Возможно ник уже есть — пробуем привязать к существующему
      const existing = game.players.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        links.set(String(maxUserId), {
          name: existing.name,
          playerId: existing.id,
          maxName
        });
        maxLinks.set(socket.gameId, links);
        socket.emit('bot:linked', {
          maxUserId,
          name: existing.name,
          playerId: existing.id,
          success: true
        });
        broadcast(game);
        return;
      }
      socket.emit('bot:linked', {
        maxUserId,
        success: false,
        message: result.error
      });
      return;
    }

    // Успешно добавили
    links.set(String(maxUserId), {
      name: result.player.name,
      playerId: result.player.id,
      maxName
    });
    maxLinks.set(socket.gameId, links);

    socket.emit('bot:linked', {
      maxUserId,
      name: result.player.name,
      playerId: result.player.id,
      success: true
    });
    broadcast(game);
  });

  // Действие от игрока через Max
  socket.on('bot:playerAction', ({ maxUserId, action, amount }) => {
    const game = games.get(socket.gameId);
    if (!game || socket.role !== 'bot') return;

    const links = maxLinks.get(socket.gameId);
    if (!links) {
      socket.emit('bot:actionResult', {
        maxUserId,
        success: false,
        message: 'Нет привязки к игре'
      });
      return;
    }

    const link = links.get(String(maxUserId));
    if (!link) {
      socket.emit('bot:actionResult', {
        maxUserId,
        success: false,
        message: 'Сначала напиши /join ТвойНик'
      });
      return;
    }

    const result = doAction(game, link.playerId, action, amount || 0, socket, maxUserId);
    if (!result) return;
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

function doAction(game, playerId, action, amount, socket, maxUserId = null) {
  const result = game.playerAction(playerId, action, amount);
  if (!result.ok) {
    if (maxUserId) {
      socket.emit('bot:actionResult', {
        maxUserId,
        success: false,
        message: result.error
      });
    } else {
      socket.emit('error', { message: result.error });
    }
    return false;
  }

  broadcast(game);

  if (maxUserId) {
    socket.emit('bot:actionResult', {
      maxUserId,
      success: true,
      message: `Действие принято: ${action}${amount ? ' ' + amount : ''}`
    });
  }

  // Если игра ещё идёт — уведомляем следующего
  if (game.status === 'playing') {
    notifyTurn(game);
  }

  return true;
}

function notifyTurn(game) {
  if (game.currentPlayerIndex < 0 || game.status !== 'playing') return;

  const player = game.players[game.currentPlayerIndex];
  if (!player || player.folded || player.allIn) return;

  const toCall = Math.max(0, game.currentBet - player.bet);
  const canCheck = toCall === 0;

  io.to(game.id).emit('bot:yourTurn', {
    playerName: player.name,
    playerId: player.id,
    canCheck,
    toCall,
    minRaise: game.minRaise || game.bigBlind || 10
  });
}

function broadcast(game) {
  io.to(game.id).emit('state', game.getPublicState('host'));
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Poker Host server → http://localhost:${PORT}`);
  console.log(`BOT_SECRET: ${process.env.BOT_SECRET || 'poker-bot-secret'}`);
});
