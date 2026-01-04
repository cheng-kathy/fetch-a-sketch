// components/viewcube.js
import * as THREE from 'three';

export function createViewCube(mainCamera, controls, {
  size = 96,
  bottom = 12,
  right = 12,
  faceFont = 'bold 20px system-ui',
} = {}) {
  const WORLD_UP = new THREE.Vector3(0, 0, 1);
  // ----- overlay renderer -----
  const overlay = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  overlay.setPixelRatio(window.devicePixelRatio);
  overlay.setSize(size, size);
  Object.assign(overlay.domElement.style, {
    position: 'fixed',
    bottom: `${bottom}px`,
    right: `${right}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: 1002,
    cursor: 'grab',
  });
  document.body.appendChild(overlay.domElement);

  // new mini scene 
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  cam.position.set(0, 0, 3);

  //  pivot orientation = inverse(mainCamera.quaternion)
  const pivot = new THREE.Object3D();
  scene.add(pivot);

  // Cube with labeled faces
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const cube = new THREE.Mesh(geom, [
    faceMat('YZ', '#e74c3c', faceFont, Math.PI / 2),  // +X
    faceMat('YZ', '#c0392b', faceFont, Math.PI / 2),  // -X
    faceMat('XZ', '#2ecc71', faceFont, 0),            // +Y
    faceMat('XZ', '#27ae60', faceFont, 0),            // -Y
    faceMat('XY', '#3498db', faceFont, 0),            // +Z
    faceMat('XY', '#2980b9', faceFont, 0),            // -Z
  ]);
  pivot.add(cube);

  // Outline edges
  pivot.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x111111 })
  ));

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));

  // ----- picking/dragging state -----
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let dragging = false;
  let moved = false;
  let dragFrom = new THREE.Vector3();
  let clickFaceIndex = null;
  const savedControlsState = { enabled: true };

  overlay.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  function onPointerDown(e) {
    overlay.domElement.setPointerCapture?.(e.pointerId);
    overlay.domElement.style.cursor = 'grabbing';
    moved = false;

    // Disable OrbitControls while dragging cube
    if (controls) {
      savedControlsState.enabled = controls.enabled;
      controls.enabled = false;
    }

    const rect = overlay.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Record face for snap (if click)
    raycaster.setFromCamera(mouse, cam);
    const hit = raycaster.intersectObject(cube, true)[0];
    clickFaceIndex = hit?.face?.materialIndex ?? null;

    dragging = true;
    dragFrom = screenToArcball(mouse.x, mouse.y);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;

    const rect = overlay.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const vFrom = dragFrom;
    const vTo = screenToArcball(x, y);

    if (!moved && vFrom.distanceToSquared(vTo) < 1e-6) return;
    moved = true;

    const q = new THREE.Quaternion().setFromUnitVectors(vFrom, vTo);

    // rotate main camera around controls.target
    const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
    const camVec = new THREE.Vector3().subVectors(mainCamera.position, target);
    camVec.applyQuaternion(q);
    mainCamera.position.copy(target).add(camVec);

    // rotate camera up for natural feel
    mainCamera.up.applyQuaternion(q);
    mainCamera.lookAt(target);
    mainCamera.updateProjectionMatrix();
    if (controls) controls.update();
    dragFrom = vTo;
  }

  function onPointerUp() {
    overlay.domElement.style.cursor = 'grab';

    // Re-enable OrbitControls
    if (controls) controls.enabled = savedControlsState.enabled;

    // if it was a click (not a drag) and we hit a face -> snap
    if (dragging && !moved && clickFaceIndex != null) {
      const axis = faceAxisFromIndex(clickFaceIndex);
      if (axis) snapToAxis(axis);
    }

    dragging = false;
    clickFaceIndex = null;
  }

  // ----- helpers -----
  function snapToAxis(axis) {
    const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
    const dist = mainCamera.position.distanceTo(target);
    const dir = axis.clone().normalize();
    mainCamera.position.copy(target).addScaledVector(dir, dist);
    // Keep world Z as up for orthogonal views, if looking straight down/up Z, fall back to Y
    if (Math.abs(dir.dot(WORLD_UP)) < 0.99) {
      mainCamera.up.copy(WORLD_UP);
    } else {
      mainCamera.up.set(0, 1, 0);
    }
    mainCamera.lookAt(target);
    mainCamera.updateProjectionMatrix();
    if (controls) controls.update();
  }

  function faceAxisFromIndex(i) {
    // material order matches cube materials above
    switch (i) {
      case 0: return new THREE.Vector3( 1,  0,  0); // +X
      case 1: return new THREE.Vector3(-1,  0,  0); // -X
      case 2: return new THREE.Vector3( 0,  1,  0); // +Y
      case 3: return new THREE.Vector3( 0, -1,  0); // -Y
      case 4: return new THREE.Vector3( 0,  0,  1); // +Z
      case 5: return new THREE.Vector3( 0,  0, -1); // -Z
      default: return null;
    }
  }

  function screenToArcball(x, y) {
    const v = new THREE.Vector3(x, y, 0);
    const d = x * x + y * y;
    if (d <= 1) {
      v.z = Math.sqrt(1 - d);
    } else {
      v.normalize();
    }
    return v;
  }

  function faceMat(text, bg, fontSpec, rotation = 0) {
    const res = 128;
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const ctx = c.getContext('2d');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, res, res);

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, res - 4, res - 4);

    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, res / 2, res / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.center.set(0.5, 0.5);
    tex.rotation = rotation;
    tex.needsUpdate = true;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex });
  }

  // ----- public API -----
  function update() {
    // Mirror main camera orientation
    pivot.quaternion.copy(mainCamera.quaternion).invert();
    const q = new THREE.Quaternion();
    mainCamera.getWorldQuaternion(q);
    pivot.quaternion.copy(q).invert();
    overlay.render(scene, cam);
  }

  function resize(newSize = size) {
    overlay.setPixelRatio(window.devicePixelRatio);
    overlay.setSize(newSize, newSize);
    cam.aspect = 1;
    cam.updateProjectionMatrix();
  }

  function dispose() {
    overlay.dispose();
    overlay.domElement.remove();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  return { update, resize, dispose, dom: overlay.domElement };
}
