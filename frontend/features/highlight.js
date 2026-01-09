// features/highlight.js
import { OUT_GRAY } from '../legend/legend_helpers.js';

export function grayOrRestoreForSet(group, activeEntityIds) {
  group.traverse(obj => {
    const isLine = obj.isLine || obj.isLineLoop || obj.type === 'Line' || obj.type === 'LineLoop';
    const isLine2 = obj.isLine2 || obj.type === 'Line2';
    const isDot = (obj.isPoints || obj.type === 'Points') && obj.userData?.label;
    if ((!isLine && !isDot && !isLine2) || !obj.material?.color) return;

    const entId = obj.userData?.label;
    if (entId == null) return;

    const match = activeEntityIds.has(entId);
    if (match) {
      const base = obj.userData.__baseColorHex;
      if (base !== undefined) obj.material.color.setHex(base);
      obj.material.transparent = false;
      obj.material.opacity = 1.0;
      obj.renderOrder = 5;
    } else {
      obj.material.color.setHex(OUT_GRAY);
      obj.material.transparent = true;
      obj.material.opacity = 0.3;  // Same fade level as slidebar
      obj.renderOrder = 1;
    }
  });
}
function highlightSingleEntity(entityId) {
  const s = new Set([entityId]);
  grayOrRestoreForSet(s);
}
