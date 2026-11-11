/**
 * Texas Hold'em Poker Engine
 * Supports 6-10 players, with/without blinds
 */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, code: rank + suit });
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Hand ranking
const HAND_RANKS = {
  HIGH_CARD: 1,
  PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

function getRankValue(card) {
  return RANK_VALUES[card.rank];
}

function evaluateHand(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) return null;

  // Generate all 5-card combinations
  const combos = getCombinations(all, 5);
  let best = null;

  for (const combo of combos) {
    const score = scoreFiveCards(combo);
    if (!best || compareScores(score, best) > 0) {
      best = score;
    }
  }
  return best;
}

function getCombinations(arr, k) {
  const result = [];
  function helper(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return result;
}

function scoreFiveCards(cards) {
  const sorted = [...cards].sort((a, b) => getRankValue(b) - getRankValue(a));
  const ranks = sorted.map(c => getRankValue(c));
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(ranks);
  const rankCounts = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

  let rankType, tiebreakers;

  if (isFlush && isStraight) {
    if (ranks[0] === 14 && ranks[4] === 10) {
      rankType = HAND_RANKS.ROYAL_FLUSH;
    } else {
      rankType = HAND_RANKS.STRAIGHT_FLUSH;
    }
    tiebreakers = [ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0]]; // wheel
  } else if (counts[0] === 4) {
    rankType = HAND_RANKS.FOUR_OF_A_KIND;
    const four = uniqueRanks.find(r => rankCounts[r] === 4);
    const kicker = uniqueRanks.find(r => rankCounts[r] === 1);
    tiebreakers = [four, kicker];
  } else if (counts[0] === 3 && counts[1] === 2) {
    rankType = HAND_RANKS.FULL_HOUSE;
    const three = uniqueRanks.find(r => rankCounts[r] === 3);
    const pair = uniqueRanks.find(r => rankCounts[r] === 2);
    tiebreakers = [three, pair];
  } else if (isFlush) {
    rankType = HAND_RANKS.FLUSH;
    tiebreakers = ranks;
  } else if (isStraight) {
    rankType = HAND_RANKS.STRAIGHT;
    tiebreakers = [ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0]];
  } else if (counts[0] === 3) {
    rankType = HAND_RANKS.THREE_OF_A_KIND;
    const three = uniqueRanks.find(r => rankCounts[r] === 3);
    const kickers = uniqueRanks.filter(r => rankCounts[r] === 1);
    tiebreakers = [three, ...kickers];
  } else if (counts[0] === 2 && counts[1] === 2) {
    rankType = HAND_RANKS.TWO_PAIR;
    const pairs = uniqueRanks.filter(r => rankCounts[r] === 2).sort((a, b) => b - a);
    const kicker = uniqueRanks.find(r => rankCounts[r] === 1);
    tiebreakers = [...pairs, kicker];
  } else if (counts[0] === 2) {
    rankType = HAND_RANKS.PAIR;
    const pair = uniqueRanks.find(r => rankCounts[r] === 2);
    const kickers = uniqueRanks.filter(r => rankCounts[r] === 1);
    tiebreakers = [pair, ...kickers];
  } else {
    rankType = HAND_RANKS.HIGH_CARD;
    tiebreakers = ranks;
  }

  return { rankType, tiebreakers, name: getHandName(rankType, tiebreakers) };
}

function checkStraight(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length < 5) return false;
  // Normal straight
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return true;
  }
  // Wheel (A-5)
  if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
    return true;
  }
  return false;
}

function getHandName(rankType, tiebreakers) {
  const names = {
    1: 'Старшая карта',
    2: 'Пара',
    3: 'Две пары',
    4: 'Сет',
    5: 'Стрит',
    6: 'Флеш',
    7: 'Фулл-хаус',
    8: 'Каре',
    9: 'Стрит-флеш',
    10: 'Роял-флеш'
  };
  return names[rankType] || 'Неизвестно';
}

function compareScores(a, b) {
  if (a.rankType !== b.rankType) return a.rankType - b.rankType;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] || 0;
    const bv = b.tiebreakers[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Game state
class PokerGame {
  constructor(options = {}) {
    this.id = options.id || generateId();
    this.maxPlayers = options.maxPlayers || 9;
    this.startingStack = options.startingStack || 1000;
    this.smallBlind = options.smallBlind || 5;
    this.bigBlind = options.bigBlind || 10;
    this.useBlinds = options.useBlinds !== false;
    this.players = [];
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = 0;
    this.dealerIndex = -1;
    this.currentPlayerIndex = -1;
    this.street = 'waiting'; // waiting, preflop, flop, turn, river, showdown
    this.handNumber = 0;
    this.history = [];
    this.status = 'lobby'; // lobby, playing, finished
  }

  addPlayer(name, id = null) {
    if (this.players.length >= this.maxPlayers) return { ok: false, error: 'Стол полный' };
    if (this.players.find(p => p.name === name)) return { ok: false, error: 'Такой ник уже есть' };
    if (this.status !== 'lobby' && this.status !== 'playing') return { ok: false, error: 'Игра уже идёт' };

    const player = {
      id: id || generateId(),
      name,
      stack: this.startingStack,
      holeCards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      sittingOut: false,
      isDealer: false,
      isSB: false,
      isBB: false
    };
    this.players.push(player);
    return { ok: true, player };
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return false;
    this.players.splice(idx, 1);
    return true;
  }

  startHand() {
    if (this.players.filter(p => p.stack > 0).length < 2) {
      return { ok: false, error: 'Нужно минимум 2 игрока с фишками' };
    }

    this.handNumber++;
    this.deck = shuffle(createDeck());
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = this.useBlinds ? this.bigBlind : 0;
    this.street = 'preflop';
    this.status = 'playing';

    // Reset players
    this.players.forEach(p => {
      p.holeCards = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = p.stack <= 0;
      p.allIn = false;
      p.isDealer = false;
      p.isSB = false;
      p.isBB = false;
    });

    // Move dealer
    const active = this.players.filter(p => p.stack > 0);
    if (this.dealerIndex === -1) {
      this.dealerIndex = 0;
    } else {
      do {
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
      } while (this.players[this.dealerIndex].stack <= 0);
    }

    this.players[this.dealerIndex].isDealer = true;

    // Blinds
    if (this.useBlinds) {
      const sbIdx = this.nextActiveIndex(this.dealerIndex);
      const bbIdx = this.nextActiveIndex(sbIdx);
      this.players[sbIdx].isSB = true;
      this.players[bbIdx].isBB = true;

      this.postBlind(sbIdx, this.smallBlind);
      this.postBlind(bbIdx, this.bigBlind);
      this.currentBet = this.bigBlind;
      this.minRaise = this.bigBlind;

      this.currentPlayerIndex = this.nextActiveIndex(bbIdx);
    } else {
      this.currentPlayerIndex = this.nextActiveIndex(this.dealerIndex);
    }

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        if (p.stack > 0 && !p.folded) {
          p.holeCards.push(this.deck.pop());
        }
      }
    }

    this.log(`Раздача #${this.handNumber} началась`);
    return { ok: true };
  }

  postBlind(playerIndex, amount) {
    const p = this.players[playerIndex];
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.bet = actual;
    p.totalBet = actual;
    this.pot += actual;
    if (p.stack === 0) p.allIn = true;
  }

  nextActiveIndex(fromIndex) {
    let idx = fromIndex;
    do {
      idx = (idx + 1) % this.players.length;
    } while (
      (this.players[idx].folded || this.players[idx].stack <= 0 || this.players[idx].allIn) &&
      idx !== fromIndex
    );
    return idx;
  }

  getActivePlayers() {
    return this.players.filter(p => !p.folded && p.stack >= 0);
  }

  playerAction(playerId, action, amount = 0) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра не идёт' };
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { ok: false, error: 'Игрок не найден' };
    if (this.players[this.currentPlayerIndex].id !== playerId) {
      return { ok: false, error: 'Сейчас не ваш ход' };
    }
    if (player.folded || player.allIn) return { ok: false, error: 'Вы уже не в раздаче' };

    const toCall = this.currentBet - player.bet;

    switch (action) {
      case 'fold':
        player.folded = true;
        this.log(`${player.name} сбросил карты`);
        break;

      case 'check':
        if (toCall > 0) return { ok: false, error: 'Нельзя чекнуть, нужно уравнять' };
        this.log(`${player.name} чек`);
        break;

      case 'call':
        if (toCall === 0) return { ok: false, error: 'Нечего уравнивать, можно чекнуть' };
        const callAmount = Math.min(toCall, player.stack);
        player.stack -= callAmount;
        player.bet += callAmount;
        player.totalBet += callAmount;
        this.pot += callAmount;
        if (player.stack === 0) player.allIn = true;
        this.log(`${player.name} колл ${callAmount}`);
        break;

      case 'raise':
      case 'bet':
        if (amount < this.minRaise && player.stack > toCall) {
          return { ok: false, error: `Минимальный рейз: ${this.minRaise}` };
        }
        const totalNeeded = toCall + amount;
        const actualRaise = Math.min(totalNeeded, player.stack);
        player.stack -= actualRaise;
        player.bet += actualRaise;
        player.totalBet += actualRaise;
        this.pot += actualRaise;
        if (player.stack === 0) player.allIn = true;

        const raiseSize = player.bet - this.currentBet;
        this.currentBet = player.bet;
        this.minRaise = Math.max(this.minRaise, raiseSize);
        this.log(`${player.name} ${action === 'bet' ? 'бет' : 'рейз'} до ${player.bet}`);
        break;

      case 'allin':
        const allInAmount = player.stack;
        player.bet += allInAmount;
        player.totalBet += allInAmount;
        this.pot += allInAmount;
        player.stack = 0;
        player.allIn = true;
        if (player.bet > this.currentBet) {
          const raiseSize = player.bet - this.currentBet;
          this.currentBet = player.bet;
          this.minRaise = Math.max(this.minRaise, raiseSize);
        }
        this.log(`${player.name} ва-банк (${allInAmount})`);
        break;

      default:
        return { ok: false, error: 'Неизвестное действие' };
    }

    // Move to next player or next street
    this.advance();
    return { ok: true };
  }

  advance() {
    // Check if only one player left
    const remaining = this.players.filter(p => !p.folded);
    if (remaining.length === 1) {
      this.endHand(remaining[0]);
      return;
    }

    // Check if betting round is over
    const canAct = this.players.filter(p => !p.folded && !p.allIn && p.stack > 0);
    const allMatched = canAct.every(p => p.bet === this.currentBet);

    // Find next player who can act
    let nextIdx = this.nextActiveIndex(this.currentPlayerIndex);
    let found = false;
    const start = this.currentPlayerIndex;

    do {
      const p = this.players[nextIdx];
      if (!p.folded && !p.allIn && p.stack > 0 && (p.bet < this.currentBet || !allMatched)) {
        found = true;
        break;
      }
      nextIdx = this.nextActiveIndex(nextIdx);
    } while (nextIdx !== start);

    if (found && !allMatched) {
      this.currentPlayerIndex = nextIdx;
      return;
    }

    // Betting round finished → next street
    this.nextStreet();
  }

  nextStreet() {
    // Collect bets into pot already done, reset bets
    this.players.forEach(p => { p.bet = 0; });
    this.currentBet = 0;
    this.minRaise = this.useBlinds ? this.bigBlind : 0;

    if (this.street === 'preflop') {
      this.street = 'flop';
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.log('Флоп: ' + this.communityCards.map(c => c.code).join(' '));
    } else if (this.street === 'flop') {
      this.street = 'turn';
      this.communityCards.push(this.deck.pop());
      this.log('Тёрн: ' + this.communityCards[3].code);
    } else if (this.street === 'turn') {
      this.street = 'river';
      this.communityCards.push(this.deck.pop());
      this.log('Ривер: ' + this.communityCards[4].code);
    } else if (this.street === 'river') {
      this.street = 'showdown';
      this.showdown();
      return;
    }

    // Set first player to act (after dealer)
    this.currentPlayerIndex = this.nextActiveIndex(this.dealerIndex);

    // If everyone is all-in, auto-run remaining streets
    const canAct = this.players.filter(p => !p.folded && !p.allIn && p.stack > 0);
    if (canAct.length <= 1) {
      while (this.street !== 'showdown' && this.street !== 'waiting') {
        this.nextStreet();
      }
    }
  }

  showdown() {
    const contenders = this.players.filter(p => !p.folded);
    const results = contenders.map(p => {
      const hand = evaluateHand(p.holeCards, this.communityCards);
      return { player: p, hand };
    });

    results.sort((a, b) => compareScores(b.hand, a.hand));

    // Simple pot distribution (no side pots for MVP complexity, can enhance later)
    const winners = [];
    const bestScore = results[0].hand;
    for (const r of results) {
      if (compareScores(r.hand, bestScore) === 0) winners.push(r);
    }

    const winAmount = Math.floor(this.pot / winners.length);
    winners.forEach(w => {
      w.player.stack += winAmount;
      this.log(`${w.player.name} выигрывает ${winAmount} с рукой: ${w.hand.name}`);
    });

    this.pot = 0;
    this.status = 'hand_over';
    this.currentPlayerIndex = -1;
  }

  endHand(winner) {
    winner.stack += this.pot;
    this.log(`${winner.name} забирает банк ${this.pot} (все сбросили)`);
    this.pot = 0;
    this.status = 'hand_over';
    this.street = 'waiting';
    this.currentPlayerIndex = -1;
  }

  log(msg) {
    this.history.push({ time: Date.now(), msg });
    if (this.history.length > 50) this.history.shift();
  }

  // Public state for clients (hide hole cards of others)
  getPublicState(forPlayerId = null) {
    return {
      id: this.id,
      status: this.status,
      street: this.street,
      handNumber: this.handNumber,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      communityCards: this.communityCards,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      useBlinds: this.useBlinds,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      startingStack: this.startingStack,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        isDealer: p.isDealer,
        isSB: p.isSB,
        isBB: p.isBB,
        // Only show hole cards to the owner or to host (forPlayerId === 'host')
        holeCards: (forPlayerId === p.id || forPlayerId === 'host') ? p.holeCards : []
      })),
      history: this.history.slice(-15)
    };
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

module.exports = {
  PokerGame,
  createDeck,
  shuffle,
  evaluateHand,
  HAND_RANKS,
  SUITS,
  RANKS
};
