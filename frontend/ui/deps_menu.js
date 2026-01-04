// ui/deps_menu.js
const linkIconUrl = new URL('./link_icon.png', import.meta.url).toString();
const searchIconUrl = new URL('./search_icon.png', import.meta.url).toString();
const ONSHAPE_BASE = 'https://cad.onshape.com';


export function createDepsMenuRoot() {
  const ctxMenu = document.createElement('div');
  ctxMenu.dataset.vizUi = '1';
  Object.assign(ctxMenu.style, {
    position: 'fixed', padding: '6px 10px', background: 'rgba(255,255,255,0.97)', color: '#222',
    font: '12px/1.3 sans-serif', borderRadius: '6px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    border: '1px solid #ccc', zIndex: 2000, display: 'none', maxWidth: '420px', maxHeight: '260px', overflow: 'auto',
  });
  document.body.appendChild(ctxMenu);

  ctxMenu.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-onshape-link]');
    if (!btn) return;
    const { did, wid, eid } = btn.dataset;
    if (!did || !wid || !eid) return;
    const url = `${ONSHAPE_BASE}/documents/${did}/w/${wid}/e/${eid}`;
    window.open(url, '_blank');
  });

  window.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (ctxMenu.contains(ev.target)) return;
    ctxMenu.style.display = 'none';
  });

  return ctxMenu;
}

export function showDependenciesMenu({ ctxMenu, entityId, screenX, screenY, entities_dep, doc_info, onFeatureSelect }) {
  const hide = () => (ctxMenu.style.display = 'none');

  const deps = entities_dep?.[entityId] || [];
  if (!deps.length) {
    ctxMenu.innerHTML = `
      <div><strong>Entity:</strong> ${entityId}</div>
      <div style="margin-top:4px;opacity:.6;">No dependent features found.</div>`;
    ctxMenu.style.left = `${screenX + 6}px`;
    ctxMenu.style.top  = `${screenY + 6}px`;
    ctxMenu.style.display = 'block';
    return { hide };
  }

  const grouped = new Map(); // did -> { did, wid, name, elements: Map<eid, {...}> }
  for (const [did, wid, eid, fid] of deps) {
    if (!grouped.has(did)) {
      const doc = doc_info?.[did] || {};
      grouped.set(did, { did, wid: doc.wid || wid, name: doc.name || did, elements: new Map() });
    }
    const docEntry = grouped.get(did);
    if (!docEntry.elements.has(eid)) {
      const elInfo = doc_info?.[did]?.elements?.[eid] || {};
      docEntry.elements.set(eid, { eid, name: elInfo.name || eid, features: [] });
    }
    const elEntry = docEntry.elements.get(eid);
    const featInfo = doc_info?.[did]?.elements?.[eid]?.features?.[fid] || {};
    elEntry.features.push({ fid, name: featInfo.name || fid, featureType: featInfo.featureType || '' });

    // also add elements that have no deps (to match your behavior)
    for (const [didX, docEntryX] of grouped) {
      const di = doc_info?.[didX];
      if (!di || !di.elements) continue;
      for (const [eidX, elInfo] of Object.entries(di.elements)) {
        if (!docEntryX.elements.has(eidX)) {
          docEntryX.elements.set(eidX, { eid: eidX, name: elInfo.name || eidX, features: [] });
        }
      }
    }
  }
  for (const [did, docEntry] of grouped) {
    const di = doc_info?.[did];
    if (!di || !di.elements) continue;
    for (const [eid, elInfo] of Object.entries(di.elements)) {
      if (!docEntry.elements.has(eid)) {
        docEntry.elements.set(eid, { eid, name: elInfo.name || eid, features: [] });
      }
    }
  }

  // Build 3 columns UI:
  ctxMenu.innerHTML = '';
  const title = document.createElement('div');
  title.innerHTML = `<strong>Entity:</strong> ${entityId}`;
  const subtitle = document.createElement('div');
  subtitle.textContent = 'Dependencies:'; subtitle.style.marginTop = '4px';

  const cols = document.createElement('div');
  Object.assign(cols.style, { display: 'flex', gap: '8px', marginTop: '6px' });

  const docCol  = document.createElement('div');
  const elemCol = document.createElement('div');
  const featCol = document.createElement('div');
  [docCol, elemCol, featCol].forEach(col => {
    Object.assign(col.style, { minWidth: '130px', maxWidth: '150px', borderRight: '1px solid #eee', paddingRight: '4px' });
  });
  featCol.style.borderRight = 'none';

  cols.append(docCol, elemCol, featCol);
  ctxMenu.append(title, subtitle, cols);

  let currentDocItem = null;
  let currentElemItem = null;
  const highlightItem = (div, active) => div.style.background = active ? 'rgba(0,0,0,0.06)' : 'transparent';

  function renderFeatures(elEntry) {
    featCol.innerHTML = '';
    const header = document.createElement('div');
    header.innerHTML = `<strong>Features</strong>`; header.style.marginBottom = '4px';
    featCol.appendChild(header);

    elEntry.features.forEach(f => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        margin: '2px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 4px',
        borderRadius: '4px',
        cursor: 'default',
      });

      // name + type (non-clickable)
      const nameWrap = document.createElement('div');
      nameWrap.style.flex = '1 1 auto';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = f.name;
      const typeSpan = document.createElement('span');
      typeSpan.style.opacity = '0.6';
      typeSpan.textContent = ` (${f.featureType})`;
      nameWrap.append(nameSpan, typeSpan);

      // button group: search icon (trigger search bar) + onshape link icon
      const btnWrap = document.createElement('div');
      Object.assign(btnWrap.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      });

      const searchBtn = document.createElement('button');
      Object.assign(searchBtn.style, {
        border: 'none',
        background: 'none',
        padding: '2px',
        margin: '0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      });
      const searchImg = document.createElement('img');
      searchImg.src = searchIconUrl;
      searchImg.alt = 'Search in panel';
      searchImg.width = 14;
      searchImg.height = 14;
      searchBtn.appendChild(searchImg);
      searchBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onFeatureSelect?.({ did: elEntry.did, wid: elEntry.wid, eid: elEntry.eid, fid: f.fid, name: f.name });
      });

      const linkBtn = document.createElement('button');
      Object.assign(linkBtn.style, {
        border: 'none',
        background: 'none',
        padding: '2px',
        margin: '0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      });
      linkBtn.setAttribute('data-onshape-link', '1');
      linkBtn.dataset.did = elEntry.did; linkBtn.dataset.wid = elEntry.wid; linkBtn.dataset.eid = elEntry.eid; linkBtn.dataset.fid = f.fid;
      const iconImg = document.createElement('img');
      iconImg.src = linkIconUrl;
      iconImg.alt = 'Open in Onshape';
      iconImg.width = 14;
      iconImg.height = 14;
      iconImg.setAttribute('data-onshape-link', '1');
      iconImg.dataset.did = elEntry.did; iconImg.dataset.wid = elEntry.wid; iconImg.dataset.eid = elEntry.eid;
      linkBtn.appendChild(iconImg);

      btnWrap.append(searchBtn, linkBtn);

      // hover highlight on the whole row
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(0,0,0,0.08)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      row.append(nameWrap, btnWrap);
      featCol.appendChild(row);
    });
  }
  function renderElements(docEntry) {
    elemCol.innerHTML = ''; featCol.innerHTML = '';
    const header = document.createElement('div');
    header.innerHTML = `<strong>Elements</strong>`; header.style.marginBottom = '4px';
    elemCol.appendChild(header);
    currentElemItem = null;

    for (const elEntry of docEntry.elements.values()) {
      elEntry.did = docEntry.did; elEntry.wid = docEntry.wid;
      const item = document.createElement('div'); item.textContent = elEntry.name;
      Object.assign(item.style, { padding: '2px 4px', cursor: 'pointer', borderRadius: '4px' });
      item.addEventListener('mouseenter', () => {
        if (currentElemItem && currentElemItem !== item) highlightItem(currentElemItem, false);
        currentElemItem = item; highlightItem(item, true); renderFeatures(elEntry);
      });
      elemCol.appendChild(item);
    }
  }
  function renderDocs() {
    docCol.innerHTML = '';
    const header = document.createElement('div');
    header.innerHTML = `<strong>Documents</strong>`; header.style.marginBottom = '4px';
    docCol.appendChild(header);

    for (const docEntry of grouped.values()) {
      const item = document.createElement('div'); item.textContent = docEntry.name;
      Object.assign(item.style, { padding: '2px 4px', cursor: 'pointer', borderRadius: '4px' });
      item.addEventListener('mouseenter', () => {
        if (currentDocItem && currentDocItem !== item) highlightItem(currentDocItem, false);
        currentDocItem = item; highlightItem(item, true); renderElements(docEntry);
      });
      docCol.appendChild(item);
    }
  }

  renderDocs();
  ctxMenu.style.left = `${screenX + 6}px`;
  ctxMenu.style.top  = `${screenY + 6}px`;
  ctxMenu.style.display = 'block';
  return { hide };
}
