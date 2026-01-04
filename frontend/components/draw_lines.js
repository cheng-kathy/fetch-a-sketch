// components/draw_lines.js
import * as THREE from 'three';
import { Line2 }        from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

const INCH = 0.0254;

export function makeDrawer({
  group, SCALE, Z_PLANE,
  matLineStraight, matLineCircle, matLineSpline,
  getMaterialForEntity = null,
}) {
  // hard-coded mate connector transforms 
  const mateTransforms = {
  // Drivebase Top
  FeYY7te4TFnwGwq_0: { tx: 0 * INCH, ty: 0 * INCH, tz: (2.75 + 1) * INCH, rotAxis: 'z', rotDeg: 0 },
  // Claw Sketch
  FHqEgo9hc2sdLj4_0: { tx: 0 * INCH, ty: -7.5 * INCH, tz: 30.75 * INCH, rotAxis: 'x', rotDeg: 90 },
  // Front Home Coral
  F7FCFhbyFYnhzJV_0: { tx: -2.864 * INCH, ty: -7.5 * INCH, tz: 10.75 * INCH, rotAxis: 'x', rotDeg: 90 },
};

  const mateMatrices = new Map(
    Object.entries(mateTransforms).map(([fid, t]) => {
      const m = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      const rad = (t.rotDeg || 0) * Math.PI / 180;
      if (t.rotAxis === 'x') rot.makeRotationX(rad);
      else if (t.rotAxis === 'y') rot.makeRotationY(rad);
      else if (t.rotAxis === 'z') rot.makeRotationZ(rad);
      // translations are in the same units as incoming geometr
      const trans = new THREE.Matrix4().makeTranslation(t.tx * SCALE, t.ty * SCALE, t.tz * SCALE);
      // apply translation in world, then rotate local sketch: M = T * R
      m.multiply(trans).multiply(rot);
      return [fid, m];
    })
  );

  function resolveFeatureId(entity, geometry) {
    return entity?.featureId || geometry?.featureId || entity?.fid || null;
  }

  function applyMate(vec3, featureId) {
    if (!featureId) return vec3;
    const m = mateMatrices.get(featureId);
    if (!m) return vec3;
    return vec3.applyMatrix4(m);
  }

  function matePlaneFor(featureId) {
    const t = mateTransforms[featureId];
    if (!t) return null;
    const deg = ((t.rotDeg % 360) + 360) % 360;
    if (t.rotAxis === 'x' && (Math.abs(deg - 90) < 1e-3 || Math.abs(deg - 270) < 1e-3)) {
      return 'front'; // XZ
    }
    if (t.rotAxis === 'y' && (Math.abs(deg - 90) < 1e-3 || Math.abs(deg - 270) < 1e-3)) {
      return 'right'; // YZ
    }
    return 'top'; // default
  }

  // basis per plane (world X/Y horizontal, Z vertical)
  const planeBases = {
    top:   { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) }, // XY
    front: { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, 1) }, // XZ, normal +Y
    right: { x: new THREE.Vector3(0, 1, 0), y: new THREE.Vector3(0, 0, 1) }, // YZ, normal +X
  };

  function planeSideFor(entity, geometry) {
    const fid = resolveFeatureId(entity, geometry);
    const matePlane = matePlaneFor(fid);
    if (matePlane) return matePlane;
    const p = (geometry && geometry.plane_side) || entity?.plane_side;
    if (p === 'front' || p === 'right' || p === 'top') return p;
    return 'top';
  }

  function toPlaneVec3(vec2, plane) {
    const basis = planeBases[plane] || planeBases.top;
    const out = new THREE.Vector3();
    out.copy(basis.x).multiplyScalar(vec2.x);
    out.addScaledVector(basis.y, vec2.y);
    if (plane === 'top') out.z = Z_PLANE; // keep top slightly above base plane
    return out;
  }

  function addLine3(A3, B3, material, meta) {
    const g = new THREE.BufferGeometry().setFromPoints([A3, B3]);
    const line = new THREE.Line(g, material);
    line.renderOrder = 1;
    line.userData = { ...(line.userData||{}), ...meta };
    group.add(line);
    return line;
  }

  function addPolyline3(points3, closed, material, meta) {
    const g = new THREE.BufferGeometry().setFromPoints(points3);
    const obj = closed ? new THREE.LineLoop(g, material) : new THREE.Line(g, material);
    obj.renderOrder = 1;
    obj.userData = { ...(obj.userData||{}), ...meta };
    group.add(obj);
    return obj;
  }

  function drawEntity(entity) {
    const g = entity?.geometry;
    if (!g?.btType) return;
    const meta = { label: entity.entityId, dependencies: entity.dependencies ?? 0 };
    const plane = planeSideFor(entity, g);
    const fid = resolveFeatureId(entity, g);
    const hasMate = mateMatrices.has(fid);
    const mapPoint = (p2) => {
      if (hasMate) {
        // mate connector: treat local sketch as XY plane at z=0, then apply mate matrix
        return applyMate(new THREE.Vector3(p2.x, p2.y, 0), fid);
      }
      return toPlaneVec3(p2, plane);
    };

    if (g.btType === 'BTMSketchPoint-158') {
      const P3 = mapPoint(new THREE.Vector2((g.x ?? 0) * SCALE, (g.y ?? 0) * SCALE));
      const size = SCALE * 0.00003; // base radius; may be rescaled later
      const geo = new THREE.SphereGeometry(size, 12, 12);
      const mat = getMaterialForEntity?.(entity) ?? matLineStraight;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: mat.color || 0x333333 }));
      mesh.position.copy(P3);
      mesh.renderOrder = 2;
      mesh.userData = { ...(mesh.userData || {}), ...meta, __dotBaseRadius: size };
      group.add(mesh);
      return;
    }

    if (entity.isConstruction && g.btType === 'BTCurveGeometryLine-117') {
      const P = new THREE.Vector2(g.pntX * SCALE, g.pntY * SCALE);
      const dir = new THREE.Vector2(g.dirX, g.dirY).normalize();
      const t0 = (entity.startParam ?? 0) * SCALE, t1 = (entity.endParam ?? 0) * SCALE;
      const A2 = P.clone().addScaledVector(dir, t0);
      const B2 = P.clone().addScaledVector(dir, t1);

      const gg = new THREE.BufferGeometry().setFromPoints([
        mapPoint(A2),
        mapPoint(B2),
      ]);
      const dashed = new THREE.LineDashedMaterial({ color: 0x333333, dashSize: 2, gapSize: 2 });
      const line = new THREE.Line(gg, dashed);
      line.computeLineDistances();
      line.renderOrder = 1;
      line.userData = { ...(line.userData||{}), ...meta };
      group.add(line);
      return;
    }

    if (g.btType === 'BTCurveGeometryLine-117') {
      const P = new THREE.Vector2(g.pntX * SCALE, g.pntY * SCALE);
      const dir = new THREE.Vector2(g.dirX, g.dirY).normalize();
      const t0 = (entity.startParam ?? 0) * SCALE, t1 = (entity.endParam ?? 0) * SCALE;
      const A2 = P.clone().addScaledVector(dir, t0);
      const B2 = P.clone().addScaledVector(dir, t1);
      const mat = getMaterialForEntity?.(entity) ?? matLineStraight;
      addLine3(
        mapPoint(A2),
        mapPoint(B2),
        mat,
        meta
      );
      return;
    }

    if (g.btType === 'BTCurveGeometryCircle-115') {
      const cx = (g.xCenter ?? g.centerX) * SCALE;
      const cy = (g.yCenter ?? g.centerY) * SCALE;
      const r  = g.radius * SCALE;
      const a0 = entity.startParam ?? 0, a1 = entity.endParam ?? 2*Math.PI, cw = !!g.clockwise;
      const full = Math.abs(a1 - a0) >= 2*Math.PI - 1e-6;
      const mat  = getMaterialForEntity?.(entity) ?? matLineCircle;

      const curve = new THREE.EllipseCurve(cx, cy, r, r, a0, a1, cw, 0);
      const pts2  = curve.getPoints(full ? 128 : 96);
      const pts3  = pts2.map(p => mapPoint(new THREE.Vector2(p.x, p.y)));
      addPolyline3(pts3, full, mat, meta);
      return;
    }

    if (g.btType === 'BTCurveGeometryInterpolatedSpline-116') {
      const a = g.interpolationPoints;
      if (!Array.isArray(a) || a.length < 4) return;
      const mat = getMaterialForEntity?.(entity) ?? matLineSpline;

      const hasHandles = [g.startHandleX, g.startHandleY, g.endHandleX, g.endHandleY]
        .every(v => typeof v === 'number');
      const isTwoPointSpline = a.length === 4;

      if (hasHandles && isTwoPointSpline) {
        const p0 = mapPoint(new THREE.Vector2(a[0] * SCALE, a[1] * SCALE));
        const p3 = mapPoint(new THREE.Vector2(a[2] * SCALE, a[3] * SCALE));
        const p1 = mapPoint(new THREE.Vector2(g.startHandleX * SCALE, g.startHandleY * SCALE));
        const p2 = mapPoint(new THREE.Vector2(g.endHandleX   * SCALE, g.endHandleY   * SCALE));

        const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
        const pts   = curve.getPoints(64);
        addPolyline3(pts, false, mat, meta);
        return;
      }

      const v = [];
      for (let i = 0; i < a.length; i += 2) {
        v.push(mapPoint(new THREE.Vector2(a[i] * SCALE, a[i + 1] * SCALE)));
      }
      const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal', 0.5);
      const pts   = curve.getPoints(Math.max(96, v.length * 12));
      addPolyline3(pts, false, mat, meta);
    }
  }

  function makeLine2FromPoints(points3, material, meta, { closed = false } = {}, group) {
    const pts = closed ? [...points3, points3[0]] : points3;
    const pos = [];
    pts.forEach(p => pos.push(p.x, p.y, p.z));

    const geo = new LineGeometry();
    geo.setPositions(pos);
    const mat2 = material instanceof LineMaterial ? material : new LineMaterial({
      color: (material && material.color) ? material.color : 0xffffff,
      linewidth: (material && material.linewidth) ? material.linewidth : 2,
      transparent: material?.transparent ?? false,
      opacity: material?.opacity ?? 1,
      depthTest: material?.depthTest ?? true,
    });
    mat2.resolution.set(window.innerWidth, window.innerHeight);

    const line2 = new Line2(geo, mat2);
    line2.computeLineDistances();
    line2.frustumCulled = false;
    line2.renderOrder = 1;
    line2.userData = { ...(line2.userData || {}), ...meta };
    group.add(line2);
    return line2;
  }

  return { drawEntity, drawEntities: (list) => list.forEach(drawEntity) };
}
