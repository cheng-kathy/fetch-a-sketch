import * as THREE from 'three';
import { loadData, buildFeatureMap } from './deal_data.js';
import { makeDrawer } from './components/draw_lines.js';
import { colorForDependencies } from './components/color_map.js';
import { createViewCube } from './components/viewcube.js';
import {
  initRenderer,
  initScene,
  addLights,
  addAxisPlanes,
  initCameraControls,
  fitCameraToObject,
} from './core/scene.js';
import { bakeBaseColors, makeApplyRangeHighlight, initLegend } from './legend/legend_helpers.js';
import { createTooltip } from './ui/tooltip.js';
import { createDepsMenuRoot, showDependenciesMenu } from './ui/deps_menu.js';
import { attachOriginalColorsAndDeps } from './features/indexing.js';
import { grayOrRestoreForSet } from './features/highlight.js';
import { createFeatureSearchBox } from './features/feature_search_ui.js';
import { LineBasicMaterial, Color } from 'three';
import { setupPicking } from './picking/picking.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Box3, Vector3 } from 'three';

function buildEntityIndex(entities_dep) {
  const elementToEntities = new Map();
  const featureToEntities = new Map();

  for (const [entityId, deps] of Object.entries(entities_dep || {})) {
    for (const dep of deps) {
      const [did, , eid, fid] = dep;
      if (!did || !eid) continue;

      const eKey = `${did}|${eid}`;
      if (!elementToEntities.has(eKey)) elementToEntities.set(eKey, new Set());
      elementToEntities.get(eKey).add(entityId);

      if (fid) {
        const fKey = `${did}|${eid}|${fid}`;
        if (!featureToEntities.has(fKey)) featureToEntities.set(fKey, new Set());
        featureToEntities.get(fKey).add(entityId);
      }
    }
  }

  return { elementToEntities, featureToEntities };
}

function makeOverlayFromBaseLine(baseLine, linewidth, renderer) {
  const posAttr = baseLine.geometry?.attributes?.position;
  if (!posAttr) return null;

  const positions = Array.from(posAttr.array);
  const geo = new LineGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color: baseLine.material?.color?.getHex?.() ?? 0xffffff,
    linewidth,
    transparent: true,
    opacity: 1,
    depthTest: false,
  });

  const size = renderer.getSize(new THREE.Vector2());
  mat.resolution.set(size.x, size.y);

  const overlay = new Line2(geo, mat);
  overlay.computeLineDistances();
  overlay.renderOrder = 999;
  overlay.frustumCulled = false;

  overlay.position.copy(baseLine.position);
  overlay.quaternion.copy(baseLine.quaternion);
  overlay.scale.copy(baseLine.scale);

  baseLine.parent.add(overlay);
  return overlay;
}

function addOverlaysForSet(activeIds, group, renderer, selectionOverlays, linewidth = 4) {
  selectionOverlays.length = 0;
  group.traverse(obj => {
    const isLine = obj.isLine || obj.isLineLoop || obj.type === 'Line' || obj.type === 'LineLoop';
    if (!isLine || obj.isLine2 || !obj.userData?.label) return;
    if (!activeIds.has(obj.userData.label)) return;

    const overlay = makeOverlayFromBaseLine(obj, linewidth, renderer);
    if (overlay) selectionOverlays.push(overlay);
  });
}

function clearOverlays(selectionOverlays) {
  selectionOverlays.forEach(o => {
    o.geometry.dispose();
    o.material.dispose();
    o.parent?.remove(o);
  });
  selectionOverlays.length = 0;
}

function buildMaterials(depMin, depMax) {
  const matLineStraight = new LineBasicMaterial({ color: 0xff0000, linewidth: 10 });
  const matLineCircle = new LineBasicMaterial({ color: 0x0000ff, linewidth: 10 });
  const matLineSpline = new LineBasicMaterial({ color: 0x00aa00, linewidth: 10 });
  const getMaterialForEntity = (entity) => {
    const css = colorForDependencies(entity.dependencies ?? 0, depMin, depMax);
    return new LineBasicMaterial({ color: new Color(css) });
  };

  return { matLineStraight, matLineCircle, matLineSpline, getMaterialForEntity };
}

let activeApp = null;

export function initVisualizer({
  entities = [],
  entities_dep = {},
  doc_info = {},
  mount = document.body,
} = {}) {
  // clear any previous instance or stray UI/canvas nodes up front
  if (activeApp?.destroy) activeApp.destroy();
  document.querySelectorAll('[data-viz-ui],[data-viz-canvas]').forEach(el => el.remove());

  const SCALE = 1000;
  const depMin = Math.min(...entities.map(e => e.dependencies ?? 0));
  const depMax = Math.max(...entities.map(e => e.dependencies ?? 0));

  const renderer = initRenderer();
  if (mount && mount !== document.body) {
    mount.appendChild(renderer.domElement);
  }
  const scene = initScene();
  addLights(scene);
  addAxisPlanes(scene, 30);

  const { camera, controls } = initCameraControls(renderer);

  const model = new THREE.Group();
  scene.add(model);

  const viewCube = createViewCube(camera, controls, {
    size: 200,
    bottom: 20,
    right: 20,
    model: model,
    fitCameraFn: fitCameraToObject,
  });
  const group = new THREE.Group();
  group.name = 'entities-group';
  model.add(group);

  const { matLineStraight, matLineCircle, matLineSpline, getMaterialForEntity } = buildMaterials(depMin, depMax);
  const drawer = makeDrawer({
    group,
    SCALE,
    Z_PLANE: 0.0001,
    matLineStraight,
    matLineCircle,
    matLineSpline,
    getMaterialForEntity,
    renderer,
  });
  drawer.drawEntities(entities);
  bakeBaseColors(group, depMin, depMax);
  rescaleDots(group);

  let currentLegendRange = { lo: depMin, hi: depMax };
  const applyRangeHighlight = makeApplyRangeHighlight(group);
  const legend = initLegend(depMin, depMax, (lo, hi) => {
    currentLegendRange = { lo, hi };
    applyRangeHighlight(lo, hi);
  });
  applyRangeHighlight(depMin, depMax);

  const depsById = new Map(entities.map(e => [e.entityId, e.dependencies ?? 0]));
  attachOriginalColorsAndDeps(group, depsById);

  const selectionOverlays = [];

  const highlightSingleEntity = (entityId) => {
    const activeIds = new Set([entityId]);
    grayOrRestoreForSet(group, activeIds);
  };

  const tip = createTooltip();
  const ctxMenu = createDepsMenuRoot();

  const { elementToEntities, featureToEntities } = buildEntityIndex(entities_dep);
  const featMap = buildFeatureMap(entities, entities_dep, doc_info);

  const featureSearchUI = createFeatureSearchBox({
    doc_info,
    elementToEntities,
    featureToEntities,
    onHighlightEntities: (activeIds) => {
      clearOverlays(selectionOverlays);
      ctxMenu.style.display = 'none';
      tip.style.display = 'none';
      if (typeof applyRangeHighlight === 'function' && currentLegendRange) {
        applyRangeHighlight(currentLegendRange.lo, currentLegendRange.hi);
      }
      if (!activeIds || !activeIds.size) {
        clearOverlays(selectionOverlays);
        return;
      }
      grayOrRestoreForSet(group, activeIds);
      addOverlaysForSet(activeIds, group, renderer, selectionOverlays, 6);
    },
  });

  setupPicking({
    renderer,
    camera,
    group,
    tip,
    onSelect: (entityId, x, y, obj) => {
      clearOverlays(selectionOverlays);
      if (!entityId || !obj) {
        ctxMenu.style.display = 'none';
        if (typeof applyRangeHighlight === 'function' && currentLegendRange) {
          applyRangeHighlight(currentLegendRange.lo, currentLegendRange.hi);
        }
        return;
      }

      highlightSingleEntity(entityId);

      const overlay = makeOverlayFromBaseLine(obj, 4, renderer);
      if (overlay) selectionOverlays.push(overlay);

      showDependenciesMenu({
        ctxMenu,
        entityId,
        screenX: x,
        screenY: y,
        entities_dep,
        doc_info,
        onFeatureSelect: ({ did, eid, fid, name }) => {
          featureSearchUI.setPinnedFeatureAndSearch?.({ did, eid, fid, name });
        },
      });
    },
  });

  const axes = new THREE.AxesHelper(70); // shorter axes (was 1000)
  axes.traverse(o => { if (o.material?.color) o.material.color.set(0xbbbbbb); });
  scene.add(axes);

  fitCameraToObject(camera, model, controls, 1.3);

  let animId = null;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    viewCube.update();
  };
  animate();

  const onResize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    if (camera.isOrthographicCamera) {
      const frustumHeight = camera.top - camera.bottom;
      camera.left = -frustumHeight * aspect / 2;
      camera.right = frustumHeight * aspect / 2;
    } else {
      camera.aspect = aspect;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    viewCube.resize?.();
  };
  window.addEventListener('resize', onResize);

  const destroy = () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    clearOverlays(selectionOverlays);
    tip.remove();
    ctxMenu.remove();
    legend?.remove?.();
    featureSearchUI?.dispose?.();
    viewCube?.dispose?.();
    renderer.dispose();
    renderer.domElement?.remove();
  };

  activeApp = { destroy };

  return {
    destroy,
    highlightSingleEntity,
    featureSearchUI,
    refreshRange: (lo, hi) => applyRangeHighlight(lo, hi),
  };
}

function rescaleDots(group) {
  const box = new Box3().setFromObject(group);
  const size = box.getSize(new Vector3());
  const diag = size.length();
  if (!isFinite(diag) || diag <= 0) return;
  const targetRadius = Math.max(diag * 0.001, diag * 0.001); // ~0.01% of diag (with tiny floor)
  group.traverse(obj => {
    if (obj.isMesh && obj.userData?.__dotBaseRadius && obj.geometry?.parameters?.radius) {
      const base = obj.userData.__dotBaseRadius;
      const scale = targetRadius / base;
      obj.scale.setScalar(scale);
    }
  });
}

// boot once for the default data set (async load from backend, fallback to bundled JSON)
async function bootstrap() {
  try {
    const { entities, entities_dep, doc_info } = await loadData();
    return initVisualizer({ entities, entities_dep, doc_info });
  } catch (err) {
    console.error('Failed to initialize visualizer:', err);
    return null;
  }
}

let appInstancePromise = bootstrap();

export async function refreshDataAndReinit() {
  showLoading();
  const current = await appInstancePromise;
  current?.destroy?.();
  appInstancePromise = bootstrap().finally(hideLoading);
  return appInstancePromise;
}

// ----- Refresh UI helpers -----
let loadingEl = null;
function ensureLoadingEl() {
  if (loadingEl) return loadingEl;
  loadingEl = document.createElement('div');
  loadingEl.textContent = 'Analyzing references…';
  Object.assign(loadingEl.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    padding: '8px 12px',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    borderRadius: '6px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    zIndex: 2000,
    display: 'none',
  });
  document.body.appendChild(loadingEl);
  return loadingEl;
}

function showLoading() {
  ensureLoadingEl().style.display = 'block';
}
function hideLoading() {
  if (loadingEl) loadingEl.style.display = 'none';
}

export function wireUpdateButton(selector = '#update-btn') {
  const btn =
    document.querySelector(selector) || document.querySelector('[data-action="update"]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await refreshDataAndReinit();
    } finally {
      btn.disabled = false;
      hideLoading();
    }
  });
}

// auto-wire a default update/refresh button if present
// Handle both cases: DOM still loading OR already loaded (module scripts are deferred)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    wireUpdateButton();
    wireUpdateButton('#refresh-btn');
  });
} else {
  wireUpdateButton();
  wireUpdateButton('#refresh-btn');
}
