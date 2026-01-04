// ui/tooltip.js
export function createTooltip() {
  const tip = document.createElement('div');
  tip.dataset.vizUi = '1';
  Object.assign(tip.style, {
    position: 'fixed',
    padding: '4px 8px',
    // neutral gray background for tooltip
    background: 'rgba(60,60,60,0.9)',
    color: '#fff',
    font: '12px/1 sans-serif', borderRadius: '4px', pointerEvents: 'none',
    transform: 'translate(8px, 8px)', display: 'none',
  });
  document.body.appendChild(tip);
  return tip;
}
