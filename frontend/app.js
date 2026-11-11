const socket = io();

let currentGameId = null;
let state = null;

// DOM refs
const screenCreate = document.getElementById('screen-create');
const screenGame = document.getElementById('screen-game');
const btnCreate = document.getElementById('btnCreate');
const useBlindsCheck = document.getElementById('useBlinds');
const blindsSettings = document.getElementById('blindsSettings');

useBlindsCheck.addEventListener('change', () => {
  blindsSettings.style.display = useBlindsCheck.checked ? 'block' : 'none';
});

// Create game
btnCreate.addEventListener('click', async () => {
  const body = {
    maxPlayers: parseInt(document.getElementById('maxPlayers').value) || 9,
    startingStack: parseInt(document.getElementById('startingStack').value) || 1000,
    useBlinds: useBlindsCheck.checked,
    smallBlind: parseInt(document.getElementById('smallBlind').value) || 5,
    bigBlind: parseInt(document.getElementById('bigBlind').value) || 10
  };

  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    alert(data.error || 'Ошибка создания');
    return;
  }

  currentGameId = data.gameId;
  document.getElementById('gameIdDisplay').textContent = currentGameId;
  screenCreate.classList.add('hidden');
  screenGame.classList.remove('hidden');

  socket.emit('host:join', { gameId: currentGameId });
});

// Socket events
socket.on('state', (newState) => {
  state = newState;
  render();
});

socket.on('error', (err) => {
  alert(err.message || 'Ошибка');
});

socket.on('bot:dealCards', () => {
  // Visual feedback that cards were sent to bot
  console.log('Cards sent to bot for DM');
});

// ===== Host actions =====
document.getElementById('btnAddPlayer').addEventListener('click', () => {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) return;
  socket.emit('host:addPlayer', { name });
  document.getElementById('newPlayerName').value = '';
});

document.getElementById('newPlayerName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnAddPlayer').click();
});

document.getElementById('btnStartHand').addEventListener('click', () => {
  socket.emit('host:startHand');
});

document.getElementById('btnNextHand').addEventListener('click', () => {
  socket.emit('host:nextHand');
});

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const playerId = document.getElementById('actionPlayer').value;
    const amount = parseInt(document.getElementById('raiseAmount').value) || 0;
    if (!playerId) return;
    socket.emit('host:action', { playerId, action, amount });
  });
});

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  socket.emit('host:updateSettings', {
    useBlinds: document.getElementById('toggleBlinds').checked,
    smallBlind: parseInt(document.getElementById('setSB').value) || undefined,
    bigBlind: parseInt(document.getElementById('setBB').value) || undefined
  });
});

// ===== Render =====
function render() {
  if (!state) return;

  // Status
  const badge = document.getElementById('statusBadge');
  badge.textContent = {
    lobby: 'Лобби',
    playing: 'Идёт раздача',
    hand_over: 'Раздача окончена'
  }[state.status] || state.status;
  badge.className = 'status-badge ' + state.status;

  // Buttons
  document.getElementById('btnStartHand').classList.toggle('hidden', state.status === 'playing');
  document.getElementById('btnNextHand').classList.toggle('hidden', state.status !== 'hand_over');

  // Pot & street
  document.getElementById('potValue').textContent = state.pot;
  document.getElementById('streetLabel').textContent = {
    waiting: 'Ожидание',
    preflop: 'Префлоп',
    flop: 'Флоп',
    turn: 'Тёрн',
    river: 'Ривер',
    showdown: 'Шоудаун'
  }[state.street] || state.street;

  // Community cards
  const comm = document.getElementById('communityCards');
  comm.innerHTML = state.communityCards.map(c => cardHtml(c)).join('');

  // Players on table
  const row = document.getElementById('playersRow');
  row.innerHTML = state.players.map((p, idx) => {
    const isActive = state.currentPlayerIndex === idx && state.status === 'playing';
    const badges = [];
    if (p.isDealer) badges.push('D');
    if (p.isSB) badges.push('SB');
    if (p.isBB) badges.push('BB');
    if (p.allIn) badges.push('ALL-IN');

    return `
      <div class="player-seat ${isActive ? 'active' : ''} ${p.folded ? 'folded' : ''}">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="stack">${p.stack}</div>
        ${p.bet > 0 ? `<div class="bet">Ставка: ${p.bet}</div>` : ''}
        ${badges.length ? `<div class="badges">${badges.join(' · ')}</div>` : ''}
        <div class="cards">
          ${p.holeCards.map(c => cardHtml(c, true)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Players list (sidebar)
  const list = document.getElementById('playersList');
  list.innerHTML = state.players.map(p => `
    <li>
      <span>${escapeHtml(p.name)} <small>(${p.stack})</small></span>
      <button onclick="removePlayer('${p.id}')" title="Удалить">×</button>
    </li>
  `).join('');

  // Action select
  const select = document.getElementById('actionPlayer');
  const currentVal = select.value;
  select.innerHTML = state.players
    .filter(p => !p.folded)
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
  if (currentVal) select.value = currentVal;

  // History
  const hist = document.getElementById('history');
  hist.innerHTML = state.history.map(h => `<div>${escapeHtml(h.msg)}</div>`).join('');
  hist.scrollTop = hist.scrollHeight;

  // Settings
  document.getElementById('toggleBlinds').checked = state.useBlinds;
}

function cardHtml(card, small = false) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  return `<div class="card-face ${isRed ? 'red' : ''}">${card.rank}${card.suit}</div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.removePlayer = (playerId) => {
  if (confirm('Удалить игрока?')) {
    socket.emit('host:removePlayer', { playerId });
  }
};
