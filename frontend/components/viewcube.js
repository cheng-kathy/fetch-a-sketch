// components/viewcube.js
import * as THREE from 'three';

export function createViewCube(mainCamera, controls, {
  size = 96,
  bottom = 12,
  right = 12,
  faceFont = 'bold 20px system-ui',
  model = null,
  fitCameraFn = null,
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

  // Reset view button (above the viewcube)
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '⌂';
  Object.assign(resetBtn.style, {
    position: 'fixed',
    bottom: `${bottom + size + 1}px`,
    right: `${right + size / 2 - 16}px`,
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '18px',
    zIndex: 1002,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  resetBtn.title = 'Reset to isometric view';
  resetBtn.addEventListener('click', () => {
    if (!model || !fitCameraFn) return;
    
    // Set camera to isometric direction first
    const currentTarget = controls?.target?.clone() ?? new THREE.Vector3();
    const currentDist = mainCamera.position.distanceTo(currentTarget) || 10;
    const isoDir = new THREE.Vector3(1, -1, 1).normalize();
    mainCamera.position.copy(currentTarget).addScaledVector(isoDir, currentDist);
    mainCamera.up.set(0, 0, 1);
    mainCamera.lookAt(currentTarget);
    mainCamera.updateProjectionMatrix();
    if (controls) controls.update();
    
    // Now call fitCameraFn which handles everything
    fitCameraFn(mainCamera, model, controls, 1.3);
  });
  document.body.appendChild(resetBtn);

  // new mini scene 
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  cam.position.set(0, 0, 3);

  //  pivot orientation = inverse(mainCamera.quaternion)
  const pivot = new THREE.Object3D();
  scene.add(pivot);

  // Cube with labeled faces (all grey)
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const grey = '#888888';
  const greyDark = '#777777';
  const cube = new THREE.Mesh(geom, [
    faceMat('Right', grey, faceFont, Math.PI / 2),       // +X
    faceMat('Left', greyDark, faceFont, -Math.PI / 2),   // -X
    faceMat('Back', grey, faceFont, Math.PI),            // +Y
    faceMat('Front', greyDark, faceFont, 0),             // -Y
    faceMat('Top', grey, faceFont, 0),                   // +Z
    faceMat('Bottom', greyDark, faceFont, Math.PI),      // -Z
  ]);
  pivot.add(cube);

  // Outline edges
  pivot.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x333333 })
  ));

  // Custom thick colored axes at corner with labels
  const axisLength = 1.2;  // 20% longer than cube side
  const axisRadius = 0.02; // thick lines
  const cornerPos = new THREE.Vector3(-0.5, -0.5, -0.5);

  function createAxis(dir, color, label) {
    const group = new THREE.Group();
    
    // Cylinder for the axis line
    const cylGeom = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8);
    const cylMat = new THREE.MeshBasicMaterial({ color });
    const cyl = new THREE.Mesh(cylGeom, cylMat);
    
    // Rotate and position cylinder to point along axis
    if (dir === 'x') {
      cyl.rotation.z = -Math.PI / 2;
      cyl.position.set(axisLength / 2, 0, 0);
    } else if (dir === 'y') {
      cyl.position.set(0, axisLength / 2, 0);
    } else {
      cyl.rotation.x = Math.PI / 2;
      cyl.position.set(0, 0, axisLength / 2);
    }
    group.add(cyl);

    // Cone arrowhead
    const coneGeom = new THREE.ConeGeometry(axisRadius * 2.5, axisRadius * 6, 8);
    const cone = new THREE.Mesh(coneGeom, cylMat);
    if (dir === 'x') {
      cone.rotation.z = -Math.PI / 2;
      cone.position.set(axisLength, 0, 0);
    } else if (dir === 'y') {
      cone.position.set(0, axisLength, 0);
    } else {
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0, axisLength);
    }
    group.add(cone);

    // Text label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.28, 0.28, 1);
    if (dir === 'x') sprite.position.set(axisLength + 0.25, 0, 0);
    else if (dir === 'y') sprite.position.set(0, axisLength + 0.25, 0);
    else sprite.position.set(0, 0, axisLength + 0.25);
    group.add(sprite);

    group.position.copy(cornerPos);
    return group;
  }

  pivot.add(createAxis('x', 0xff0000, 'X'));
  pivot.add(createAxis('y', 0x00cc00, 'Y'));
  pivot.add(createAxis('z', 0x0066ff, 'Z'));

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
    if (!model || !fitCameraFn) return;
    
    // Get current target or origin
    const currentTarget = controls?.target?.clone() ?? new THREE.Vector3();
    const currentDist = mainCamera.position.distanceTo(currentTarget) || 10;
    
    // Position camera along the axis direction
    const dir = axis.clone().normalize();
    mainCamera.position.copy(currentTarget).addScaledVector(dir, currentDist);
    
    // Set camera up vector
    if (Math.abs(dir.dot(WORLD_UP)) < 0.99) {
      mainCamera.up.copy(WORLD_UP);
    } else {
      mainCamera.up.set(0, 1, 0);
    }
    mainCamera.lookAt(currentTarget);
    mainCamera.updateProjectionMatrix();
    if (controls) controls.update();
    
    // Now call fitCameraFn which has the proper LineGeometry handling
    fitCameraFn(mainCamera, model, controls, 1.3);
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
    resetBtn.remove();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  return { update, resize, dispose, dom: overlay.domElement };
}
