// components/legend.js
import { turboGradient } from './color_map.js';
export function createColorLegend({
  min = 0,
  max = 10,
  width = 18,          // bar width (px)
  height = 240,        // bar height (px)
  topLabel = 'most used',
  bottomLabel = 'least used',
  position = { right: '12px', top: '60px' },
  container = document.body,
  initialLo = min,     // bottom handle (min)
  initialHi = max,     // top handle (max)
  onRangeChange = () => {},
} = {}) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const range = () => Math.max(1, max - min); 

  const HANDLE = 4; // handle height (px)

  // map value <-> handle top (keep whole handle inside)
  const valueToTop = (v) => {
    const t = (v - min) / range();              // 0..1
    const yCenter = height * (1 - t);           // 0(top)..height(bottom)
    const yTop = Math.round(yCenter - HANDLE / 2);
    return clamp(yTop, 0, height - HANDLE);
  };
  const topToValue = (yTop) => {
    const yCenter = clamp(yTop + HANDLE / 2, 0, height);
    const t = 1 - (yCenter / height);
    return Math.round(min + t * range());
  };

  // root ui
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    ...position,
  });

  const labelTop = document.createElement('div');
  labelTop.textContent = `${topLabel} (${max})`;
  Object.assign(labelTop.style, { font: '12px sans-serif', color: '#333' });

  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    border: '1px solid #ccc',
    borderRadius: '6px',
    overflow: 'visible',
    background: '#eee',
  });

  // gradient
  const steps = 32, stops = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // stops.push(`${viridis(1 - t)} ${t * 100}%`);
    stops.push(`${turboGradient(1 - t)} ${t * 100}%`);
  }
  const grad = `linear-gradient(to bottom, ${stops.join(',')})`;
const bar = document.createElement('div');
Object.assign(bar.style, {
  position: 'absolute',
  inset: 0,
  background: grad,
  zIndex: 0,
  pointerEvents: 'none',
});

// gray masks to dim OUTSIDE the selected band
const maskTop = document.createElement('div');
const maskBot = document.createElement('div');
for (const m of [maskTop, maskBot]) {
  Object.assign(m.style, {
    position: 'absolute',
    left: 0,
    right: 0,
    background: 'rgba(130,130,130,1)',
    zIndex: 1,
    pointerEvents: 'none',
  });
}

  // draggable handles (only these receive events)
  const mkHandle = () => {
    const h = document.createElement('div');
    Object.assign(h.style, {
      position: 'absolute',
      left: '-4px',
      right: '-4px',
      height: `${HANDLE}px`,
      background: '#111',
      boxShadow: '0 0 0 2px #fff, 0 0 0 3px #111',
      borderRadius: '2px',
      cursor: 'ns-resize',
      zIndex: 2,
      touchAction: 'none',
      userSelect: 'none',
    });
    return h;
  };
  const handleTop = mkHandle();    // HI
  const handleBottom = mkHandle(); // LO

  // value tags (LEFT of bar), shown only on hover/drag
  const mkTag = () => {
    const s = document.createElement('div');
    Object.assign(s.style, {
      position: 'absolute',
      left: 'auto',
      right: 'calc(100% + 8px)',          // to the LEFT of bar
      transform: 'translateY(-50%)',
      padding: '2px 6px',
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '8px',
      font: '11px sans-serif',
      color: '#333',
      boxShadow: '0 1px 2px rgba(0,0,0,.08)',
      pointerEvents: 'none',
      zIndex: 3,
      whiteSpace: 'nowrap',
      minWidth: '22px',
      textAlign: 'center',
      display: 'none',                    // hidden by default
    });
    return s;
  };
  const tagTop = mkTag();
  const tagBottom = mkTag();

  const labelBottom = document.createElement('div');
  labelBottom.textContent = `${bottomLabel} (${min})`;
  Object.assign(labelBottom.style, { font: '12px sans-serif', color: '#333' });

  wrap.append(bar, maskTop, maskBot, handleTop, handleBottom, tagTop, tagBottom);

  root.append(labelTop, wrap, labelBottom);
  container.appendChild(root);

  let topVal = Math.round(initialHi);   
  let bottomVal = Math.round(initialLo);
  let dragging = null; // 'top' | 'bottom' | null

  function render() {
    topVal = clamp(topVal, min, max);
    bottomVal = clamp(bottomVal, min, max);

    const yTop = valueToTop(topVal);
    const yBot = valueToTop(bottomVal);

    handleTop.style.top = `${yTop}px`;
    handleBottom.style.top = `${yBot}px`;

    // color band between handle centers
    const bandTop = yTop + HANDLE / 2;
    const bandBot = yBot + HANDLE / 2;
    const yMin = Math.min(bandTop, bandBot);
    const yMax = Math.max(bandTop, bandBot);

    // gray above min(handle centers)
    maskTop.style.top = `0px`;
    maskTop.style.height = `${yMin}px`;

    // gray below max(handle centers)
    maskBot.style.top = `${yMax}px`;
    maskBot.style.height = `${Math.max(0, height - yMax)}px`;

    // move/update tags (visibility handled by hover/drag events)
    tagTop.style.top = `${bandTop}px`;
    tagTop.textContent = String(topVal);

    tagBottom.style.top = `${bandBot}px`;
    tagBottom.textContent = String(bottomVal);

    const loVal = Math.min(topVal, bottomVal);
    const hiVal = Math.max(topVal, bottomVal);
    onRangeChange(loVal, hiVal);
  }

  const show = el => (el.style.display = 'block');
  const hide = el => (el.style.display = 'none');

  // show on hover
  handleTop.addEventListener('pointerenter', () => show(tagTop));
  handleTop.addEventListener('pointerleave', () => { if (dragging !== 'top') hide(tagTop); });

  handleBottom.addEventListener('pointerenter', () => show(tagBottom));
  handleBottom.addEventListener('pointerleave', () => { if (dragging !== 'bottom') hide(tagBottom); });

  // ----- drag logic-----
  function onPointerDown(which, ev) {
    dragging = which;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    if (which === 'top') show(tagTop);
    else show(tagBottom);
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    const yTop = clamp(ev.clientY - rect.top, 0, rect.height - HANDLE);
    const v = topToValue(yTop);
    if (dragging === 'top') topVal = v;
    else                    bottomVal = v;
    render();
  }

  function onPointerUp(ev) {
    // hide tags after drag ends unless the cursor is still hovering the handle
    if (dragging === 'top' && !handleTop.matches(':hover')) hide(tagTop);
    if (dragging === 'bottom' && !handleBottom.matches(':hover')) hide(tagBottom);
    dragging = null;
  }

  handleTop.addEventListener('pointerdown', onPointerDown.bind(null, 'top'));
  handleBottom.addEventListener('pointerdown', onPointerDown.bind(null, 'bottom'));
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // init
  render();

  // -API
  return {
    root,
    setRange(newMin, newMax) {
      min = newMin;
      max = newMax;
      labelTop.textContent = `${topLabel} (${max})`;
      labelBottom.textContent = `${bottomLabel} (${min})`;
      bottomVal = clamp(bottomVal, min, max);
      topVal = clamp(topVal, min, max);
      render();
    },
    setSelection(newLo, newHi) {
      bottomVal = Math.round(newLo);
      topVal = Math.round(newHi);
      render();
    },
    remove() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      root.remove();
    },
  };
}
