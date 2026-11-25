/** HTML/DOM live here; Lobby itself has no document dependency. */
export function createLobbyView(root, { onJoin, onRetry, onBack, onSound } = {}) {
  const $ = (selector) => root.querySelector(selector);
  const grid = $('#room-grid');
  const status = $('#lobby-message');
  const nameField = $('#pilot-name');
  const joinButton = $('#join-game');
  let selected = null;
  let rooms = [];

  function renderRooms(next) {
    rooms = next;
    if (!rooms.some((room) => room.id === selected && room.players < room.maxPlayers)) {
      selected = rooms.find((room) => room.players < room.maxPlayers)?.id ?? null;
    }
    grid.replaceChildren();
    for (const room of rooms) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-card' + (room.id === selected ? ' selected' : '');
      button.disabled = room.players >= room.maxPlayers;
      button.setAttribute('aria-pressed', String(room.id === selected));
      const top = document.createElement('span');
      top.className = 'room-card-top';
      const title = document.createElement('strong');
      title.textContent = room.name;
      const capacity = document.createElement('small');
      capacity.textContent = `${room.players}/${room.maxPlayers} PILOTS`;
      top.append(title, capacity);
      const description = document.createElement('span');
      description.className = 'room-description';
      description.textContent = room.description;
      button.append(top, description);
      button.addEventListener('click', () => {
        selected = room.id;
        renderRooms(rooms);
      });
      grid.append(button);
    }
    joinButton.disabled = !selected;
    status.textContent = `Rooms synced · ${rooms.length} sectors available · auto refresh every 5s`;
    status.classList.remove('lobby-error');
  }

  function error(message) {
    status.textContent = message;
    status.classList.add('lobby-error');
  }

  function show() {
    root.hidden = false;
    nameField.value = nameField.value || 'Pilot';
  }

  function hide() {
    root.hidden = true;
  }
  $('#lobby-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (selected) onJoin?.(nameField.value, selected);
  });
  $('#refresh-rooms').addEventListener('click', () => onRetry?.());
  $('#leave-arena').addEventListener('click', () => onBack?.());
  $('#sound-toggle').addEventListener('click', () => onSound?.());
  return {
    show,
    hide,
    error,
    renderRooms,
    get selected() {
      return selected;
    },
  };
}
