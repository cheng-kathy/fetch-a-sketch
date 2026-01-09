// features/feature_search_ui.js

/**
 * @param {Object} params
 * @param {Object} params.doc_info
 * @param {Map<string, Set<string>>} params.elementToEntities  
 * @param {Map<string, Set<string>>} params.featureToEntities  
 * @param {Function} params.onHighlightEntities         
 */
export function createFeatureSearchBox({
  doc_info,
  elementToEntities,
  featureToEntities,
  onHighlightEntities,
}) {
  // container: fixed at top-left 
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    left: '12px',
    top: '12px',
    zIndex: 1000,
    background: 'rgba(255,255,255,0.95)',
    padding: '6px 8px',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    font: '12px sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxWidth: '520px',
  });

  // search row: input and button
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  });

  const input = document.createElement('input');
  Object.assign(input.style, {
    flex: '1 1 auto',
    fontSize: '12px',
    padding: '2px 4px',
  });
  input.type = 'text';
  input.placeholder = 'Search document / element / feature (name or ID)…';

  const btn = document.createElement('button');
  btn.textContent = 'Search';
  Object.assign(btn.style, {
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 6px',
  });

  row.append(input, btn);

  //  results panel: 3 columns 
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    marginTop: '4px',
    paddingTop: '4px',
    borderTop: '1px solid #ddd',
    display: 'none',
  });

  const cols = document.createElement('div');
  Object.assign(cols.style, {
    display: 'flex',
    gap: '8px',
    maxHeight: '260px',
    overflow: 'auto',
  });

  const docCol = document.createElement('div');
  const elemCol = document.createElement('div');
  const featCol = document.createElement('div');

  [docCol, elemCol, featCol].forEach(col => {
    Object.assign(col.style, {
      minWidth: '150px',
      maxWidth: '180px',
      borderRight: '1px solid #eee',
      paddingRight: '4px',
    });
  });
  featCol.style.borderRight = 'none';

  panel.append(cols);
  cols.append(docCol, elemCol, featCol);

  const noResult = document.createElement('div');
  Object.assign(noResult.style, {
    marginTop: '4px',
    fontStyle: 'italic',
    opacity: 0.6,
    display: 'none',
  });
  noResult.textContent = 'No matches.';

  wrap.append(row, panel, noResult);
  document.body.appendChild(wrap);

  //some helpers

  function matches(str, q) {
    if (!str) return false;
    return String(str).toLowerCase().includes(q);
  }

  function clearColumns() {
    docCol.innerHTML = '';
    elemCol.innerHTML = '';
    featCol.innerHTML = '';
  }

  let currentDocItem = null;
  let currentElemItem = null;
  let pinnedFeature = null; // { did, eid, fid, name }
  
  // Track hovered items for cascading highlight
  let hoveredDocItem = null;
  let hoveredElemItem = null;
  let hoveredFeatItem = null;

  function highlightItem(div, isActive) {
    div.style.background = isActive ? 'rgba(0,0,0,0.06)' : 'transparent';
  }

  // Hide the dropdown panel
  function hideDropdown() {
    panel.style.display = 'none';
    noResult.style.display = 'none';
    clearColumns();
  }

  // Check if a name is a master sketch (should be hidden from results)
  function isMasterSketch(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes('master sketch') || lower === 'master sketch';
  }

  // Show all documents without filtering (used when clicking on empty search)
  function showAllDocs() {
    const allDocs = new Map();
    for (const [did, doc] of Object.entries(doc_info || {})) {
      const docName = doc.name || did;
      
      // Skip documents named "Master Sketch"
      if (isMasterSketch(docName)) continue;
      
      const elements = doc.elements || {};
      const filteredElements = new Map();
      
      for (const [eid, el] of Object.entries(elements)) {
        const elName = el.name || eid;
        
        // Skip elements named "Master Sketch"
        if (isMasterSketch(elName)) continue;
        
        const feats = el.features || {};
        // Filter out master sketch features
        const allFeatures = Object.entries(feats)
          .filter(([fid, feat]) => !isMasterSketch(feat.name || fid))
          .map(([fid, feat]) => ({
            fid,
            name: feat.name || fid,
            featureType: feat.featureType || '',
          }));
        
        filteredElements.set(eid, {
          did, wid: doc.wid, eid,
          name: elName,
          features: allFeatures,
        });
      }
      
      // Only add document if it has elements after filtering
      if (filteredElements.size > 0) {
        allDocs.set(did, {
          did, wid: doc.wid, name: docName,
          elements: filteredElements,
        });
      }
    }
    
    panel.style.display = 'block';
    noResult.style.display = 'none';
    clearColumns();
    renderDocs(allDocs);
  }

  function renderFeatures(elEntry) {
    featCol.innerHTML = '';

    const header = document.createElement('div');
    header.innerHTML = '<strong>Features</strong>';
    header.style.marginBottom = '4px';
    featCol.appendChild(header);

    elEntry.features.forEach(f => {
      const row = document.createElement('div');
      row.style.margin = '2px 0';

      const btn = document.createElement('button');
      Object.assign(btn.style, {
        border: 'none',
        background: 'none',
        padding: '0',
        margin: '0',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      });

      btn.innerHTML = `
        <span>${f.name}</span>
        <span style="opacity:0.6;"> (${f.featureType || 'feature'})</span><br/>
      `;

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(0,0,0,0.08)';
        hoveredFeatItem = btn;
        // Keep parent element and document highlighted
        if (currentElemItem) currentElemItem.style.background = 'rgba(0,0,0,0.06)';
        if (currentDocItem) currentDocItem.style.background = 'rgba(0,0,0,0.06)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        hoveredFeatItem = null;
        // Restore parent highlights if still hovered
        if (currentElemItem && currentElemItem === hoveredElemItem) {
          currentElemItem.style.background = 'rgba(0,0,0,0.08)';
        } else if (currentElemItem) {
          currentElemItem.style.background = 'rgba(0,0,0,0.06)';
        }
        if (currentDocItem && currentDocItem === hoveredDocItem) {
          currentDocItem.style.background = 'rgba(0,0,0,0.08)';
        } else if (currentDocItem) {
          currentDocItem.style.background = 'rgba(0,0,0,0.06)';
        }
      });

      btn.addEventListener('click', () => {
        const key = `${elEntry.did}|${elEntry.eid}|${f.fid}`;
        const set = featureToEntities.get(key);
        onHighlightEntities?.(set || new Set());
      });

      row.appendChild(btn);
      featCol.appendChild(row);
    });
  }

  function renderElements(docEntry) {
    elemCol.innerHTML = '';
    featCol.innerHTML = '';

    const header = document.createElement('div');
    header.innerHTML = '<strong>Elements</strong>';
    header.style.marginBottom = '4px';
    elemCol.appendChild(header);

    currentElemItem = null;

    for (const elEntry of docEntry.elements.values()) {
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '2px 4px',
        cursor: 'pointer',
        borderRadius: '4px',
      });

      item.innerHTML = `
        <div>${elEntry.name}</div>
      `;

      // hover , show features and highlight
      item.addEventListener('mouseenter', () => {
        if (currentElemItem && currentElemItem !== item) {
          currentElemItem.style.background = 'transparent';
        }
        currentElemItem = item;
        item.style.background = 'rgba(0,0,0,0.08)';
        hoveredElemItem = item;
        // Keep parent document highlighted
        if (currentDocItem) currentDocItem.style.background = 'rgba(0,0,0,0.06)';
        // Clear feature highlight when moving to element
        if (hoveredFeatItem) {
          hoveredFeatItem.style.background = 'transparent';
          hoveredFeatItem = null;
        }
        renderFeatures(elEntry);
      });
      item.addEventListener('mouseleave', () => { 
        item.style.background = 'transparent';
        hoveredElemItem = null;
        // Restore parent document highlight if still hovered
        if (currentDocItem && currentDocItem === hoveredDocItem) {
          currentDocItem.style.background = 'rgba(0,0,0,0.08)';
        } else if (currentDocItem) {
          currentDocItem.style.background = 'rgba(0,0,0,0.06)';
        }
      });

      // click element :highlight all entities under that element
      item.addEventListener('click', () => {
        const key = `${docEntry.did}|${elEntry.eid}`;
        const set = elementToEntities.get(key);
        onHighlightEntities?.(set || new Set());
      });

      elemCol.appendChild(item);
    }
  }

  function renderDocs(matchedDocs) {
    docCol.innerHTML = '';

    const header = document.createElement('div');
    header.innerHTML = '<strong>Documents</strong>';
    header.style.marginBottom = '4px';
    docCol.appendChild(header);

    currentDocItem = null;

    for (const docEntry of matchedDocs.values()) {
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '2px 4px',
        cursor: 'pointer',
        borderRadius: '4px',
      });

      item.innerHTML = `
        <div>${docEntry.name}</div>
      `;

      // hover : populate elements and highlight
      item.addEventListener('mouseenter', () => {
        if (currentDocItem && currentDocItem !== item) {
          currentDocItem.style.background = 'transparent';
        }
        currentDocItem = item;
        item.style.background = 'rgba(0,0,0,0.08)';
        hoveredDocItem = item;
        // Clear child highlights when moving to document
        if (hoveredElemItem) {
          hoveredElemItem.style.background = 'transparent';
          hoveredElemItem = null;
        }
        if (hoveredFeatItem) {
          hoveredFeatItem.style.background = 'transparent';
          hoveredFeatItem = null;
        }
        renderElements(docEntry);
      });
      item.addEventListener('mouseleave', () => { 
        item.style.background = 'transparent';
        hoveredDocItem = null;
      });

      // click document : highlight all entities in all its elements
      item.addEventListener('click', () => {
        const set = new Set();
        for (const elEntry of docEntry.elements.values()) {
          const key = `${docEntry.did}|${elEntry.eid}`;
          const s = elementToEntities.get(key);
          if (s) {
            s.forEach(id => set.add(id));
          }
        }
        onHighlightEntities?.(set);
      });

      docCol.appendChild(item);
    }
  }

  function runSearch() {
    const qRaw = input.value.trim();
    const q = qRaw.toLowerCase();

    // if user typed something different from the pinned feature, drop the pin
    if (pinnedFeature && qRaw && qRaw !== (pinnedFeature.name || '') && qRaw !== pinnedFeature.fid) {
      pinnedFeature = null;
    }

    // exact/pinned search path
    if (pinnedFeature) {
      const { did, eid, fid, name } = pinnedFeature;
      const matchedDocs = new Map();
      const doc = doc_info?.[did];
      if (doc) {
        const docName = doc.name || did;
        const el = doc.elements?.[eid];
        const elName = el?.name || eid;
        const featMeta = el?.features?.[fid];
        const featName = featMeta?.name || name || fid;
        const featType = featMeta?.featureType || '';

        const featuresArr = [{
          fid,
          name: featName,
          featureType: featType,
        }];

        const elEntry = {
          did,
          wid: doc.wid,
          eid,
          name: elName,
          features: featuresArr,
        };
        const elMap = new Map([[eid, elEntry]]);

        matchedDocs.set(did, {
          did,
          wid: doc.wid,
          name: docName,
          elements: elMap,
        });
      }

      if (!matchedDocs.size) {
        clearColumns();
        panel.style.display = 'block';
        noResult.style.display = 'block';
        onHighlightEntities?.(null);
        return;
      }

      noResult.style.display = 'none';
      panel.style.display = 'block';
      clearColumns();
      renderDocs(matchedDocs);
      const key = `${did}|${eid}|${fid}`;
      const set = featureToEntities.get(key);
      onHighlightEntities?.(set || new Set());
      return;
    }

    if (!q) {
      showAllDocs();
      return;
    }

    // build filtered doc -> element -> feature structure
    const matchedDocs = new Map();

    for (const [did, doc] of Object.entries(doc_info || {})) {
      const docName = doc.name || did;
      
      // Skip documents named "Master Sketch"
      if (isMasterSketch(docName)) continue;
      
      const docMatches = matches(docName, q) || matches(did, q);

      const filteredElements = new Map();

      const elements = doc.elements || {};
      for (const [eid, el] of Object.entries(elements)) {
        const elName = el.name || eid;
        
        // Skip elements named "Master Sketch"
        if (isMasterSketch(elName)) continue;
        
        const elemMatches = matches(elName, q) || matches(eid, q);

        const feats = el.features || {};
        const keptFeatures = [];

        for (const [fid, feat] of Object.entries(feats)) {
          const featName = feat.name || fid;
          const featMatches = matches(featName, q) || matches(fid, q);

          if (docMatches || elemMatches || featMatches) {
            // if doc or element matched, keep all features
            if (docMatches || elemMatches) {
              // push all features (except master sketches) and break
              for (const [fid2, feat2] of Object.entries(feats)) {
                const featName2 = feat2.name || fid2;
                if (!isMasterSketch(featName2)) {
                  keptFeatures.push({
                    fid: fid2,
                    name: featName2,
                    featureType: feat2.featureType || '',
                  });
                }
              }
              break;
            } else if (featMatches && !isMasterSketch(featName)) {
              keptFeatures.push({
                fid,
                name: featName,
                featureType: feat.featureType || '',
              });
            }
          }
        }

        if (docMatches || elemMatches || keptFeatures.length > 0) {
          const elEntry = {
            did,
            wid: doc.wid,
            eid,
            name: elName,
            features: keptFeatures,
          };
          filteredElements.set(eid, elEntry);
        }
      }

      if (docMatches || filteredElements.size > 0) {
        matchedDocs.set(did, {
          did,
          wid: doc.wid,
          name: docName,
          elements: filteredElements,
        });
      }
    }

    if (!matchedDocs.size) {
      clearColumns();
      panel.style.display = 'block';
      noResult.style.display = 'block';
      onHighlightEntities?.(null);
      return;
    }

    noResult.style.display = 'none';
    panel.style.display = 'block';
    clearColumns();
    renderDocs(matchedDocs);
  }

  btn.addEventListener('click', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  // Show dropdown with all documents when clicking on the search input
  input.addEventListener('focus', () => {
    if (!input.value.trim()) {
      showAllDocs();
    }
  });

  // Hide dropdown when clicking outside the search box
  function handleClickOutside(e) {
    if (!wrap.contains(e.target)) {
      hideDropdown();
    }
  }
  document.addEventListener('click', handleClickOutside);

  return {
    dispose() {
      document.removeEventListener('click', handleClickOutside);
      wrap.remove();
    },
    flashNotFound() {
      wrap.style.boxShadow = '0 0 0 2px #e74c3c';
      setTimeout(() => {
        wrap.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      }, 600);
    },
    setPinnedFeatureAndSearch(params = {}) {
      pinnedFeature = params;
      input.value = params.name || params.fid || '';
      runSearch();
    },
  };
}
