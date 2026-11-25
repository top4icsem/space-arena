/** Web Audio is exclusively a UI concern: Game publishes events and knows no sound API. */
export function createAudioController(events) {
  let context = null;
  let buffers = {};
  let muted = false;

  function unlock() {
    // Must be called synchronously from Join / Unmute / first pointer gesture.
    if (!context) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
    return true;
  }

  function play(name, volume = 0.18) {
    if (!context || muted || !buffers[name] || context.state !== 'running') return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers[name];
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  events.addEventListener('fired', (event) => {
    if (event.detail.team === 'player') play('fire', event.detail.guided ? 0.19 : 0.13);
  });
  events.addEventListener('hit', () => play('hit', 0.12));
  events.addEventListener('exploded', () => play('explosion', 0.17));
  return {
    setBuffers(next) {
      buffers = next;
    },
    unlock,
    setMuted(value) {
      muted = Boolean(value);
    },
    get muted() {
      return muted;
    },
    get unlocked() {
      return context?.state === 'running';
    },
    close() {
      if (context) void context.close();
      context = null;
    },
  };
}
