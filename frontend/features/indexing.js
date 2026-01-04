// features/indexing.js
export function attachOriginalColorsAndDeps(group, depsById) {
  group.traverse(o => {
    const isLine = o.isLine || o.isLineLoop || o.type === 'Line' || o.type === 'LineLoop';
    if (!isLine) return;
    const id = o.userData?.label;
    if (id != null && depsById.has(id)) {
      o.userData.dependencies = depsById.get(id);
    }
    if (o.material?.color && o.userData.__origColorHex === undefined) {
      o.userData.__origColorHex = o.material.color.getHex();
    }
  });
}
