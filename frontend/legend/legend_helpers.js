// // legend/legend_helpers.js
// import { createColorLegend } from '../components/legend.js';

// export const OUT_GRAY = 0xB3B3B3;

// /** Returns a function with the exact same logic you had for range-based coloring. */
// export function makeApplyRangeHighlight(group) {
//   return function applyRangeHighlight(lo, hi) {
//     group.traverse(obj => {
//       const isLine = obj.isLine || obj.isLineLoop || obj.type === 'Line' || obj.type === 'LineLoop';
//       if (!isLine || obj.isLine2) return;

//       const dep = obj.userData?.dependencies;
//       if (dep == null || !obj.material?.isMaterial || !obj.material.color) return;

//       const match = dep >= lo && dep <= hi;
//       if (match) {
//         if (obj.userData.__origColorHex !== undefined) {
//           obj.material.color.setHex(obj.userData.__origColorHex);
//         }
//         obj.material.transparent = false;
//         obj.material.opacity = 1.0;
//         obj.renderOrder = 5;
//       } else {
//         obj.material.color.setHex(OUT_GRAY);
//         obj.material.transparent = true;
//         obj.material.opacity = 0.85;
//         obj.renderOrder = 1;
//       }
//     });
//   };
// }

// /** Creates the legend UI, wiring your applyRangeHighlight callback. */
// export function initLegend(depMin, depMax, applyRangeHighlight) {
//   const legend = createColorLegend({
//     min: depMin,
//     max: depMax,
//     initialLo: depMin,
//     initialHi: depMax,
//     onRangeChange: applyRangeHighlight,
//   });
//   // initial paint
//   applyRangeHighlight(depMin, depMax);
//   return legend;
// }
// legend/legend_helpers.js
import * as THREE from 'three';
import { createColorLegend } from '../components/legend.js';
import { colorForDependencies } from '../components/color_map.js';

// export this so other modules (e.g., features/highlight.js) can import it
export const OUT_GRAY = 0xc0c0c0;

export function bakeBaseColors(group, globalMin, globalMax) {
  group.traverse(o => {
    const isLine =
      o.isLine || o.isLineLoop || o.type === 'Line' || o.type === 'LineLoop';
    const isDot = o.isMesh && o.userData?.label; // treat BTMSketchPoint dots as selectable
    if ((!isLine && !isDot) || !o.material?.color) return;

    const dep = o.userData?.dependencies ?? 0;
    const css = colorForDependencies(dep, globalMin, globalMax);
    const hex = new THREE.Color(css).getHex();

    // freeze color used for restoration
    o.userData.__baseColorHex = hex;

    // set initial material color to baked color
    o.material.color.setHex(hex);

    // keep original if other code expects it
    if (o.userData.__origColorHex === undefined) {
      o.userData.__origColorHex = hex;
    }
  });
}

/** Build range-highlighter that restores baked color in-range and grays out-of-range */
export function makeApplyRangeHighlight(group) {
  return function applyRangeHighlight(lo, hi) {
    group.traverse(obj => {
      const isLine =
        obj.isLine || obj.isLineLoop || obj.type === 'Line' || obj.type === 'LineLoop';
      const isDot = obj.isMesh && obj.userData?.label;
      if ((!isLine && !isDot) || obj.isLine2 || !obj.material?.color) return;

      const dep = obj.userData?.dependencies;
      if (dep == null) return;

      const inRange = dep >= lo && dep <= hi;
      if (inRange) {
        const base = obj.userData.__baseColorHex;
        if (base !== undefined) obj.material.color.setHex(base);
        obj.material.transparent = false;
        obj.material.opacity = 1.0;
        obj.renderOrder = 5;
      } else {
        obj.material.color.setHex(OUT_GRAY);
        obj.material.transparent = true;
        obj.material.opacity = 0.85;
        obj.renderOrder = 1;
      }
    });
  };
}

/** Fixed-domain legend that only drives filtering (never rescales the gradient) */
export function initLegend(depMin, depMax, applyRangeHighlight) {
  const legend = createColorLegend({
    min: depMin,
    max: depMax,
    initialLo: depMin,
    initialHi: depMax,
    onRangeChange: applyRangeHighlight,
  });
  // initial paint
  applyRangeHighlight(depMin, depMax);
  return legend;
}
