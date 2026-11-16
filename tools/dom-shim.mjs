/*
  tools/dom-shim.mjs

  The minimum browser surface app_rebuild.js touches, so the engine can be
  loaded in plain Node for headless determinism testing.

  Deliberately dumb: every element is the same stub, every canvas call is a
  no-op, and requestAnimationFrame does nothing. The engine's rAF loop
  therefore never starts, and the harness drives the simulation explicitly
  through SWARM_LAB. Nothing here can influence simulation state.

  This shim CANNOT measure FPS or heap. There is no renderer and no
  performance.memory. Those numbers have to come from a real browser.
*/

const noop = () => {};

function makeStubElement(id) {
  const el = {
    id,
    textContent: '',
    value: '1.0',
    checked: true,
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    appendChild: noop,
    setAttribute: noop,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
    focus: noop,
    blur: noop,
    width: 800,
    height: 600
  };

  // Canvas surface
  el.getContext = () => ctx2d;
  return el;
}

const ctx2d = {
  canvas: null,
  fillStyle: '#000',
  strokeStyle: '#000',
  font: '10px sans-serif',
  textAlign: 'left',
  textBaseline: 'top',
  globalAlpha: 1,
  lineWidth: 1,
  setTransform: noop,
  resetTransform: noop,
  save: noop,
  restore: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  fillText: noop,
  strokeText: noop,
  measureText: () => ({ width: 0 }),
  beginPath: noop,
  closePath: noop,
  moveTo: noop,
  lineTo: noop,
  arc: noop,
  rect: noop,
  fill: noop,
  stroke: noop,
  clip: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
  drawImage: noop,
  putImageData: noop,
  getImageData: () => ({ data: new Uint8ClampedArray(4) })
};

export function installDomShim(target = globalThis) {
  const elements = new Map();

  const document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, makeStubElement(id));
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeStubElement('created:' + tag),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeStubElement('body'),
    documentElement: makeStubElement('html')
  };

  target.document = document;
  target.innerWidth = 1280;
  target.innerHeight = 800;
  target.devicePixelRatio = 1;
  target.addEventListener = noop;
  target.removeEventListener = noop;
  // No-op rAF: the engine's render loop never runs. The harness steps the
  // simulation itself, so frame scheduling must not advance anything.
  target.requestAnimationFrame = () => 0;
  target.cancelAnimationFrame = noop;
  target.window = target;
  target.self = target;

  return { document, elements };
}
