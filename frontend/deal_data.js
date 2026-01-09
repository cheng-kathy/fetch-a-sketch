import { callPython } from './get_data.js';
import fallbackData from '../backend/test_output_robot_bigger.json';

// Toggle backend vs local JSON. 
// True for reading from json, false for callin pythong API
const queryUseLocal = true;
function normalizeRaw(raw) {
  const [geoRaw = [], entities_dep = {}, doc_info = {}] = Array.isArray(raw) ? raw : [];
  const sketchGeos = Array.isArray(geoRaw) ? geoRaw : [geoRaw ?? {}];

  const entities = sketchGeos.flatMap((geo, sketchIndex) =>
    Object.entries(geo ?? {}).map(([entityId, data]) => {
      const { isConstruction = false, startParam, endParam, ...geometry } = data || {};
      const depList = Array.isArray(entities_dep?.[entityId]) ? entities_dep[entityId] : [];
      return {
        entityId,
        sketchIndex, // which master sketch this entity came from
        isConstruction: !!isConstruction,
        ...(startParam !== undefined ? { startParam } : {}),
        ...(endParam !== undefined ? { endParam } : {}),
        geometry,
        dependencies: depList.length,
        dependentFeatures: depList,
      };
    })
  );
  console.log(entities);
  return { entities, entities_dep, doc_info };
}

export async function loadData() {
  const useLocal = queryUseLocal;
  console.log('[data] loadData start', { useLocal });
  if (useLocal) {
    return normalizeRaw(fallbackData);
  }
  try {
    const raw = await callPython();
    console.log('[data] backend fetch succeeded');
    return normalizeRaw(raw);
  } catch (err) {
    console.warn(
      '[data] Backend fetch failed; using bundled test_output_robot.json instead.',
      err
    );
    return normalizeRaw(fallbackData);
  }
}

export const entities = [];
export const entities_dep = {};
export const doc_info = {};


export function buildFeatureMap(entities, entities_dep, doc_info) {
  const featMap = new Map(); // key = fid, value = { name, featureType, entityIds:Set }

  for (const ent of entities) {
    for (const dep of (ent.dependentFeatures || [])) {
      const [did, , eid, fid] = dep; 

      // pull human-readable info for this fid if available
      let featName = fid;
      let featType = '(unknown)';
      const doc = doc_info?.[did];
      const elem = doc?.elements?.[eid];
      const featEntry = elem?.features?.[fid];
      if (featEntry) {
        featName = featEntry.name ?? fid;
        featType = featEntry.featureType ?? '(unknown)';
      }

      // ensure record exists
      if (!featMap.has(fid)) {
        featMap.set(fid, {
          id: fid,
          name: featName,
          featureType: featType,
          entityIds: new Set(),
        });
      }

      // add this entityId to that feature
      featMap.get(fid).entityIds.add(ent.entityId);
    }
  }

  return featMap;
}
