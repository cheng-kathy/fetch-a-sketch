// core/overlay.js
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
// create overlay of thick line behaviour
export function makeOverlayFromBaseLine(baseLine, renderer, linewidth = 5) {
  const posAttr = baseLine.geometry.attributes.position;
  const positions = Array.from(posAttr.array);
  const geo = new LineGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color: baseLine.material?.color?.getHex?.() ?? 0x333333,
    linewidth, transparent: true, opacity: 1,
  });
  const s = renderer.getSize(new THREE.Vector2());
  mat.resolution.set(s.x, s.y);

  const overlay = new Line2(geo, mat);
  overlay.computeLineDistances();
  overlay.renderOrder = 10;
  overlay.frustumCulled = false;

  overlay.position.copy(baseLine.position);
  overlay.quaternion.copy(baseLine.quaternion);
  overlay.scale.copy(baseLine.scale);

  baseLine.parent.add(overlay);
  return overlay;
}
