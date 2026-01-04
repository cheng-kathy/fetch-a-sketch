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
  scene.background = new THREE.Color(0xeeeeee);
  return scene;
}

export function initCameraControls(renderer) {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 10000);
  camera.up.set(0, 0, 1); // Z-up
  camera.position.set(2, 2, 5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.1; controls.maxDistance = 3000;
  return { camera, controls };
}

export function fitCameraToObject(camera, object, controls, offset = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const fitH = (maxSize/2) / Math.tan((camera.fov*Math.PI/180)/2);
  const fitW = fitH / camera.aspect;
  const distance = offset * Math.max(fitH, fitW);
  const dir = new THREE.Vector3().subVectors(camera.position, controls?.target || new THREE.Vector3()).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(distance));
  camera.near = Math.max(0.01, distance/100);
  camera.far  = distance*100;
  camera.updateProjectionMatrix();
  if (controls) { controls.target.copy(center); controls.update(); }
}
