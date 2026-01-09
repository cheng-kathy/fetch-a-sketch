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

  // Keep hover and selected state to restore properties
  let hovered = null;
  let selected = null;
  const HOVER_LINEWIDTH_MULTIPLIER = 2;  // Make lines 2x thicker on hover
  const HOVER_POINT_SIZE_MULTIPLIER = 1.7;  // Make points 1.7x larger on hover
  const CLICK_LINEWIDTH_MULTIPLIER = 3;  // Make lines 3x thicker when clicked
  const CLICK_POINT_SIZE_MULTIPLIER = 2.5;  // Make points 2.5x larger when clicked

  // NDC for event
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

  // Helper to restore to base size (not click size)
  function restoreToBase(obj) {
    if (!obj?.material) return;
    
    // Restore opacity
    if (obj.material.isMaterial) {
      obj.material.opacity = 1;
      obj.material.transparent = false;
    }
    
    // Restore linewidth for Line2 to base
    if (obj.isLine2 && obj.material.linewidth !== undefined) {
      if (obj.userData.__originalLinewidth !== undefined) {
        obj.material.linewidth = obj.userData.__originalLinewidth;
      }
    }
    
    // Restore point size for Points to base
    if ((obj.isPoints || obj.type === 'Points') && obj.material.size !== undefined) {
      if (obj.userData.__originalPointSize !== undefined) {
        obj.material.size = obj.userData.__originalPointSize;
      }
    }
  }
  
  // Helper to restore hover (restore to base if not selected, or to click size if selected)
  function restoreHover(obj) {
    if (!obj) return;
    // If this object is selected, restore to click size, otherwise to base
    if (obj === selected) {
      applyClick(obj);
    } else {
      restoreToBase(obj);
    }
  }
  
  // Helper to apply hover effects (but don't override click effects)
  function applyHover(obj) {
    if (!obj?.material) return;
    
    // If object is selected, use click multiplier, otherwise use hover multiplier
    const isSelected = obj === selected;
    const lineMultiplier = isSelected ? CLICK_LINEWIDTH_MULTIPLIER : HOVER_LINEWIDTH_MULTIPLIER;
    const pointMultiplier = isSelected ? CLICK_POINT_SIZE_MULTIPLIER : HOVER_POINT_SIZE_MULTIPLIER;
    
    // Store original values if not already stored
    if (obj.isLine2 && obj.material.linewidth !== undefined) {
      if (obj.userData.__originalLinewidth === undefined) {
        obj.userData.__originalLinewidth = obj.material.linewidth;
      }
      obj.material.linewidth = obj.userData.__originalLinewidth * lineMultiplier;
    }
    
    if ((obj.isPoints || obj.type === 'Points') && obj.material.size !== undefined) {
      if (obj.userData.__originalPointSize === undefined) {
        obj.userData.__originalPointSize = obj.material.size;
      }
      obj.material.size = obj.userData.__originalPointSize * pointMultiplier;
    }
  }
  
  // Helper to apply click effects
  function applyClick(obj) {
    if (!obj?.material) return;
    
    // Store original values if not already stored
    if (obj.isLine2 && obj.material.linewidth !== undefined) {
      if (obj.userData.__originalLinewidth === undefined) {
        obj.userData.__originalLinewidth = obj.material.linewidth;
      }
      obj.material.linewidth = obj.userData.__originalLinewidth * CLICK_LINEWIDTH_MULTIPLIER;
    }
    
    if ((obj.isPoints || obj.type === 'Points') && obj.material.size !== undefined) {
      if (obj.userData.__originalPointSize === undefined) {
        obj.userData.__originalPointSize = obj.material.size;
      }
      obj.material.size = obj.userData.__originalPointSize * CLICK_POINT_SIZE_MULTIPLIER;
    }
  }

  // Helper to set Points threshold for better detection
  function setPointsThreshold() {
    if (!raycaster.params.Points) {
      raycaster.params.Points = {};
    }
    // For Points, threshold is in world units
    // Use a very large threshold to ensure points are easily clickable
    const distNow = distanceToSketchPlane();
    const wpp = worldUnitsPerPixelAt(distNow);
    // Convert point size (7px) to world units and multiply by 10 for generous hit area
    // This ensures points are easy to click even when small
    const pointSizeInWorld = wpp * 7;
    raycaster.params.Points.threshold = Math.max(pointSizeInWorld * 10, 2.0); // minimum 2.0 world units
  }

  // Helper to manually check Points if raycaster misses them
  function findNearestPoint(mouse, camera, group) {
    raycaster.setFromCamera(mouse, camera);
    const ray = raycaster.ray;
    
    let nearestPoint = null;
    let nearestDistance = Infinity;
    const threshold = raycaster.params.Points?.threshold || 2.0;
    
    group.traverse((obj) => {
      if ((obj.isPoints || obj.type === 'Points') && obj.geometry) {
        const pos = obj.geometry.getAttribute('position');
        if (pos) {
          const point = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
          point.applyMatrix4(obj.matrixWorld);
          
          const distance = ray.distanceToPoint(point);
          if (distance < threshold && distance < nearestDistance) {
            nearestDistance = distance;
            nearestPoint = obj;
          }
        }
      }
    });
    
    return nearestPoint;
  }

  // Hover
  function onPointerMove(ev) {
    normalizePointer(ev);
    setLinePickWidthPixels(8); // tighter hitbox for hover
    setPointsThreshold(); // better point detection

    raycaster.setFromCamera(mouse, camera);
    let hits = raycaster.intersectObjects(group.children, true);
    
    // If no hits, try manual point detection
    if (hits.length === 0) {
      const nearestPoint = findNearestPoint(mouse, camera, group);
      if (nearestPoint) {
        hits = [{ object: nearestPoint, distance: 0 }];
      }
    }

    if (hits.length) {
      const obj = hits[0].object;

      if (hovered !== obj) {
        // restore previous
        restoreHover(hovered);

        hovered = obj;

        // apply hover effects
        applyHover(obj);
      }

      // tooltip
      tip.textContent = obj.userData.label || '(unnamed)';
      tip.style.left = ev.clientX + 'px';
      tip.style.top = ev.clientY + 'px';
      tip.style.display = 'block';
    } else {
      // no hit : clear hover + tooltip
      restoreHover(hovered);
      hovered = null;
      tip.style.display = 'none';
    }
  }

  function onPointerLeave() {
    restoreHover(hovered);
    hovered = null;
    tip.style.display = 'none';
  }

  // CLICK: pointerdown : call onSelect + let main.js thicken line
  function onPointerDown(ev) {
    if (ev.button !== 0) return; // left only
    ev.stopPropagation();        // don't let window-level handlers eat this

    normalizePointer(ev);
    setLinePickWidthPixels(6);  // smaller hitbox for click
    setPointsThreshold(); // better point detection for clicking

    raycaster.setFromCamera(mouse, camera);
    let hits = raycaster.intersectObjects(group.children, true);
    
    // If no hits, try manual point detection
    if (hits.length === 0) {
      const nearestPoint = findNearestPoint(mouse, camera, group);
      if (nearestPoint) {
        hits = [{ object: nearestPoint, distance: 0 }];
      }
    }

    if (!hits.length) {
      // click on empty space - clear selection
      if (selected) {
        restoreToBase(selected);
        selected = null;
      }
      onSelect(null, ev.clientX, ev.clientY, null);
      return;
    }

    const obj = hits[0].object;
    const id = obj.userData?.label ?? null;

    // Restore previous selection
    if (selected && selected !== obj) {
      restoreToBase(selected);
    }
    
    // Set new selection and apply click effects
    selected = obj;
    applyClick(obj);
    
    // If this object was hovered, update hover to show click size
    if (hovered === obj) {
      applyHover(obj); // This will use click multiplier since obj === selected
    }

    onSelect(id, ev.clientX, ev.clientY, obj);
  }

  // --- attach listeners ---
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  // clean up everything
  function dispose() {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);

    restoreHover(hovered);
    hovered = null;
    if (selected) {
      restoreToBase(selected);
      selected = null;
    }
    tip.style.display = 'none';
  }

  return {
    raycaster,
    setLinePickWidthPixels,
    dispose,
  };
}
