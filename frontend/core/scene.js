// core/scene.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// this file is mainly used to setup the scene and everythin
export const Z_PLANE = 0.0001;

export function addLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);
}

export function addAxisPlanes(scene, size = 0.1) {
  const planeSize = size * 2;
  function makePlaneMaterial(colorHex, opacity = 0.15) {
    return new THREE.MeshStandardMaterial({
      color: colorHex, transparent: true, opacity,
      side: THREE.DoubleSide, metalness: 0, roughness: 1, depthWrite: false,
    });
  }
  const geoXY = new THREE.PlaneGeometry(planeSize, planeSize);
  const meshXY = new THREE.Mesh(geoXY, makePlaneMaterial(0x3498db));
  meshXY.name = 'Plane_XY'; scene.add(meshXY);

  const geoXZ = new THREE.PlaneGeometry(planeSize, planeSize);
  const meshXZ = new THREE.Mesh(geoXZ, makePlaneMaterial(0x2ecc71));
  meshXZ.name = 'Plane_XZ'; meshXZ.rotation.x = -Math.PI/2; scene.add(meshXZ);

  const geoYZ = new THREE.PlaneGeometry(planeSize, planeSize);
  const meshYZ = new THREE.Mesh(geoYZ, makePlaneMaterial(0xe74c3c));
  meshYZ.name = 'Plane_YZ'; meshYZ.rotation.y =  Math.PI/2; scene.add(meshYZ);

  return { meshXY, meshXZ, meshYZ };
}

export function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.dataset.vizCanvas = '1';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function initScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  return scene;
}

export function initCameraControls(renderer) {
  // Orthographic camera for head-on views without perspective distortion
  const frustumSize = 5;
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.01, 10000
  );
  camera.up.set(0, 0, 1); // Z-up
  // Isometric view from front-right corner (matches reset button)
  const isoDist = 6;
  camera.position.set(isoDist * 0.577, -isoDist * 0.577, isoDist * 0.577); // normalized (1, -1, 1)
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.1; controls.maxDistance = 3000;
  return { camera, controls };
}

export function fitCameraToObject(camera, object, controls, offset = 1.2) {
  // Compute bounding box, handling Line2/LineGeometry specially
  const box = new THREE.Box3();
  object.traverse((child) => {
    child.updateMatrixWorld(true);
    
    // Handle Line2 with LineGeometry (uses instanceStart/instanceEnd)
    if (child.geometry?.getAttribute?.('instanceStart')) {
      const starts = child.geometry.getAttribute('instanceStart');
      const ends = child.geometry.getAttribute('instanceEnd');
      if (starts && ends) {
        for (let i = 0; i < starts.count; i++) {
          const p = new THREE.Vector3(starts.getX(i), starts.getY(i), starts.getZ(i));
          p.applyMatrix4(child.matrixWorld);
          box.expandByPoint(p);
        }
        for (let i = 0; i < ends.count; i++) {
          const p = new THREE.Vector3(ends.getX(i), ends.getY(i), ends.getZ(i));
          p.applyMatrix4(child.matrixWorld);
          box.expandByPoint(p);
        }
      }
    }
    // Handle regular geometries with position attribute
    else if (child.geometry?.getAttribute?.('position')) {
      const pos = child.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        p.applyMatrix4(child.matrixWorld);
        box.expandByPoint(p);
      }
    }
  });
  
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  
  // Get current camera direction (preserve isometric/orthogonal view direction)
  const currentDir = new THREE.Vector3().subVectors(camera.position, controls?.target || center);
  if (currentDir.lengthSq() < 0.001) currentDir.set(1, -1, 1);  // fallback to isometric
  currentDir.normalize();

  if (camera.isOrthographicCamera) {
    // For orthographic camera, adjust frustum to fit object
    const aspect = window.innerWidth / window.innerHeight;
    
    // Fit the model to fill most of the screen
    const fitSize = maxSize * offset;  // offset controls padding (1.2 = 20% padding)
    
    if (aspect >= 1) {
      // Landscape: fit by height
      camera.top = fitSize / 2;
      camera.bottom = -fitSize / 2;
      camera.left = -fitSize * aspect / 2;
      camera.right = fitSize * aspect / 2;
    } else {
      // Portrait: fit by width  
      camera.left = -fitSize / 2;
      camera.right = fitSize / 2;
      camera.top = fitSize / aspect / 2;
      camera.bottom = -fitSize / aspect / 2;
    }
    
    camera.near = 0.01;
    camera.far = maxSize * 200;
    
    // Position camera along current direction from model center
    camera.position.copy(center).addScaledVector(currentDir, maxSize * 3);
  } else {
    // Perspective camera
    const fitH = (maxSize / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
    const fitW = fitH / camera.aspect;
    const distance = offset * Math.max(fitH, fitW);
    camera.position.copy(center).addScaledVector(currentDir, distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 100;
  }
  
  // Update target to model center
  if (controls) controls.target.copy(center);
  
  camera.updateProjectionMatrix();
  if (controls) controls.update();
}
