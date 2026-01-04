// picking/picking.js
import * as THREE from 'three';
import { Z_PLANE } from '../core/scene.js';

/**
 * setupPicking
 *  - Hover: shows tooltip and slightly fades the hovered line
 *  - Click: calls onSelect(entityId, screenX, screenY, object)
 *
 * @param {Object} params
 * @param {THREE.WebGLRenderer} params.renderer
 * @param {THREE.Camera} params.camera
 * @param {THREE.Group} params.group     // root group containing entity lines
 * @param {HTMLElement} params.tip       // tooltip div from createTooltip()
 * @param {Function} params.onSelect     // (entityId, x, y, obj|null) => void
 */
export function setupPicking({ renderer, camera, group, tip, onSelect }) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Keep hover state to restore opacity
  let hovered = null;

  // --- helper: NDC from event ---
  function normalizePointer(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // --- helper: world-units-per-pixel at the sketch plane (Z_PLANE) ---
  function distanceToSketchPlane() {
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_PLANE);
    const ray = new THREE.Ray(camera.position, camDir);
    return ray.distanceToPlane(plane);
  }

  function worldUnitsPerPixelAt(dist) {
    const h = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
    return h / renderer.domElement.clientHeight;
  }

  // Baseline camera distance to sketch plane; used so pick width scales with zoom
  const baseDistToPlane = distanceToSketchPlane() || 1;
  const HITBOX_SCALE = 0.0001; // 5% of the previous hitbox size

  function setLinePickWidthPixels(px = 6) {
    const distNow = distanceToSketchPlane();
    const scale = distNow / baseDistToPlane; // zoom in => smaller dist => smaller hitbox
    const scaledPx = Math.max(px * HITBOX_SCALE * scale, 0.2); // keep a tiny minimum so picking still works
    const wpp = worldUnitsPerPixelAt(distNow);
    raycaster.params.Line = raycaster.params.Line || {};
    raycaster.params.Line.threshold = Math.max(wpp * scaledPx, 0.05);
  }

  // --- HOVER: pointermove → highlight + tooltip ---
  function onPointerMove(ev) {
    normalizePointer(ev);
    setLinePickWidthPixels(8); // tighter hitbox for hover

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(group.children, true);

    if (hits.length) {
      const obj = hits[0].object;

      if (hovered !== obj) {
        // restore previous
        if (hovered?.material && hovered.material.isMaterial) {
          hovered.material.opacity = 1;
          hovered.material.transparent = false;
        }

        hovered = obj;

        // fade hovered a bit
        if (obj.material && obj.material.isMaterial) {
          obj.material.transparent = true;
          obj.material.opacity = 0.7;
        }
      }

      // tooltip
      tip.textContent = obj.userData.label || '(unnamed)';
      tip.style.left = ev.clientX + 'px';
      tip.style.top = ev.clientY + 'px';
      tip.style.display = 'block';
    } else {
      // no hit → clear hover + tooltip
      if (hovered?.material && hovered.material.isMaterial) {
        hovered.material.opacity = 1;
        hovered.material.transparent = false;
      }
      hovered = null;
      tip.style.display = 'none';
    }
  }

  function onPointerLeave() {
    if (hovered?.material && hovered.material.isMaterial) {
      hovered.material.opacity = 1;
      hovered.material.transparent = false;
    }
    hovered = null;
    tip.style.display = 'none';
  }

  // --- CLICK: pointerdown → call onSelect + let main.js thicken line ---
  function onPointerDown(ev) {
    if (ev.button !== 0) return; // left only
    ev.stopPropagation();        // don't let window-level handlers eat this

    normalizePointer(ev);
    setLinePickWidthPixels(6);  // smaller hitbox for click

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(group.children, true);

    if (!hits.length) {
      // click on empty space
      onSelect(null, ev.clientX, ev.clientY, null);
      return;
    }

    const obj = hits[0].object;
    const id = obj.userData?.label ?? null;

    onSelect(id, ev.clientX, ev.clientY, obj);
  }

  // --- attach listeners ---
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // optional cleanup API
  function dispose() {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);

    if (hovered?.material && hovered.material.isMaterial) {
      hovered.material.opacity = 1;
      hovered.material.transparent = false;
    }
    hovered = null;
    tip.style.display = 'none';
  }

  return {
    raycaster,
    setLinePickWidthPixels,
    dispose,
  };
}
