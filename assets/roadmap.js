
(function(){
  const data = JSON.parse(document.getElementById('data').textContent);
  const STORAGE_KEY = 'roadmap:' + data.title;
  const DRAWER_WIDTH_KEY = 'learning-roadmap:drawerWidth';
  const DRAWER_MIN_WIDTH = 360;
  const DRAWER_EDGE_GAP = 28;
  const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const EDIT = data.edit || {};
  const EDIT_ENABLED = !!EDIT.enabled;
  const SAVE_ENDPOINT = EDIT.endpoint || '/__learning_roadmap_save';

  const root = document.getElementById('roadmap');
  let totalCount = 0;

  data.parts.forEach((part, pi) => {
    const partEl = document.createElement('section');
    partEl.className = 'part';
    partEl.innerHTML = `
      <div class="part-head">
        <div class="part-num">${pi+1}</div>
        <h2 class="part-title">${escapeHtml(part.title)}</h2>
        <div class="part-bar"></div>
      </div>
      <div class="sections"></div>
    `;
    const grid = partEl.querySelector('.sections');
    part.sections.forEach((sec, si) => {
      totalCount++;
      const id = `${pi}-${si}`;
      const status = state[id] || 'todo';
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = id;
      card.dataset.status = status;
      card.dataset.title = sec.title.toLowerCase();
      const subCount = (sec.subs || []).length;
      card.innerHTML = `
        <div class="status" title="点击切换状态"></div>
        <div class="ttl">${escapeHtml(sec.title)}</div>
        ${subCount ? `<span class="badge" title="${subCount} 个知识点">${subCount}</span>` : ''}
      `;
      card.addEventListener('click', e => {
        if (e.target.classList.contains('status')) {
          cycleStatus(id);
        } else {
          openDrawer(pi, si);
        }
      });
      grid.appendChild(card);
    });
    root.appendChild(partEl);
  });

  const drawer = document.getElementById('drawer');
  const drawerResizer = document.getElementById('drawer-resizer');
  const backdrop = document.getElementById('backdrop');
  const dTitle = document.getElementById('d-title');
  const dBody = document.getElementById('d-body');
  const editButton = document.getElementById('edit-section');
  const editTitle = document.getElementById('edit-title');
  const editContent = document.getElementById('edit-content');
  const saveButton = document.getElementById('save-section');
  const cancelEditButton = document.getElementById('cancel-edit');
  const saveState = document.getElementById('save-state');
  const diagramBackdrop = document.getElementById('diagram-backdrop');
  const diagramModal = document.getElementById('diagram-modal');
  const diagramBody = document.getElementById('diagram-body');
  const diagramCanvas = document.getElementById('diagram-canvas');
  const diagramInner = document.getElementById('diagram-inner');
  const diagramZoom = document.getElementById('diagram-zoom');
  const diagramZoomOut = document.getElementById('diagram-zoom-out');
  const diagramZoomIn = document.getElementById('diagram-zoom-in');
  let diagramScale = 1;
  let diagramBaseWidth = 1;
  let diagramBaseHeight = 1;
  let currentId = null;
  let currentPi = null;
  let currentSi = null;
  if (EDIT_ENABLED) drawer.classList.add('editable');
  setupDrawerResize();

  const dTags = document.getElementById('d-tags');
  function pillColor(i){
    // 黄金角分布，柔和粉彩，深色 ink 字看得清
    const h = (i * 47) % 360;
    return `hsl(${h}, 72%, 86%)`;
  }
  function renderTags(subs){
    const MAX = 12;
    if (!subs || !subs.length) { dTags.className = 'tags-bar empty'; dTags.innerHTML = ''; return; }
    dTags.className = 'tags-bar';
    const visible = subs.slice(0, MAX);
    const rest = subs.slice(MAX);
    dTags.innerHTML = visible.map((s, i) =>
      `<span class="pill" style="background:${pillColor(i)}">${escapeHtml(s)}</span>`
    ).join('') + (rest.length
      ? `<span class="pill more" title="${escapeHtml(rest.join(' · '))}">+${rest.length}</span>`
      : '');
  }
  function openDrawer(pi, si){
    const sec = data.parts[pi].sections[si];
    cancelEdit();
    currentId = `${pi}-${si}`;
    currentPi = pi;
    currentSi = si;
    updateDrawerTitle(sec);
    renderTags(sec.subs);
    renderSectionBody(sec);
    dBody.scrollTop = 0;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    syncStatusButtons();
  }
  function renderSectionBody(sec){
    dBody.innerHTML = marked.parse(sec.content || '*（此小节没有正文）*');
    dBody.querySelectorAll('pre > code.language-mermaid').forEach((code, idx) => {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.id = 'mmd-' + Date.now() + '-' + idx;
      div.title = '点击放大图表';
      div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
    });
    dBody.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    if (window.__mermaid) {
      window.__mermaid.run({nodes: dBody.querySelectorAll('.mermaid')}).catch(()=>{});
    }
    typesetMath(dBody);
  }
  function typesetMath(root){
    if (!window.MathJax) return;
    const run = () => window.MathJax.typesetPromise ? window.MathJax.typesetPromise([root]).catch(()=>{}) : null;
    if (window.MathJax.startup && window.MathJax.startup.promise) {
      window.MathJax.startup.promise.then(run).catch(()=>{});
    } else {
      run();
    }
  }
  function closeDrawer(){
    cancelEdit();
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    currentId = null;
    currentPi = null;
    currentSi = null;
  }
  document.getElementById('d-close').onclick = closeDrawer;
  backdrop.onclick = closeDrawer;
  document.getElementById('diagram-close').onclick = closeDiagram;
  diagramBackdrop.onclick = closeDiagram;
  diagramZoomOut.onclick = () => setDiagramScale(diagramScale / 1.2);
  diagramZoomIn.onclick = () => setDiagramScale(diagramScale * 1.2);
  dBody.addEventListener('click', e => {
    const diagram = e.target.closest('.mermaid');
    if (diagram) openDiagram(diagram);
  });
  editButton.onclick = startEdit;
  cancelEditButton.onclick = cancelEdit;
  saveButton.onclick = saveEdit;

  function getCurrentSection(){
    if (currentPi === null || currentSi === null) return null;
    const part = data.parts[currentPi];
    return part && part.sections[currentSi] ? part.sections[currentSi] : null;
  }
  function updateDrawerTitle(sec){
    if (!sec || currentPi === null || currentSi === null) return;
    // 若小节标题已含 "N.N " 或 "N.N.N " 编号，去掉避免与自动编号重复
    const cleanTitle = sec.title.replace(/^\d+(\.\d+)*\s+/, '');
    dTitle.textContent = `${currentPi+1}.${currentSi+1}  ${cleanTitle}`;
  }
  function startEdit(){
    if (!EDIT_ENABLED || currentId === null) return;
    const sec = getCurrentSection();
    if (!sec) return;
    editTitle.value = sec.title;
    editContent.value = sec.content || '';
    saveState.textContent = '';
    drawer.classList.add('editing');
    editContent.focus();
  }
  function cancelEdit(){
    if (!drawer) return;
    drawer.classList.remove('editing');
    if (saveState) saveState.textContent = '';
  }
  async function saveEdit(){
    if (!EDIT_ENABLED || currentId === null) return;
    if (location.protocol === 'file:') {
      saveState.textContent = '需要通过 --serve --editable 打开';
      return;
    }
    const title = editTitle.value.trim();
    if (!title) {
      saveState.textContent = '标题不能为空';
      editTitle.focus();
      return;
    }
    saveButton.disabled = true;
    saveState.textContent = '保存中...';
    try {
      const response = await fetch(SAVE_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          source: EDIT.source,
          roadmap: EDIT.roadmap || location.pathname.replace(/^\/+/, ''),
          sectionId: currentId,
          title,
          content: editContent.value,
          shift: EDIT.shift || 0,
          backHref: EDIT.backHref || null
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || '保存失败');
      }
      applySavedSection(result.section || {title, content: editContent.value, subs: []});
      drawer.classList.remove('editing');
      saveState.textContent = '已保存';
    } catch (err) {
      saveState.textContent = err.message || '保存失败';
    } finally {
      saveButton.disabled = false;
    }
  }
  function applySavedSection(section){
    if (currentPi === null || currentSi === null) return;
    const sec = data.parts[currentPi].sections[currentSi];
    sec.title = section.title;
    sec.content = section.content || '';
    sec.subs = section.subs || [];
    updateDrawerTitle(sec);
    renderTags(sec.subs);
    renderSectionBody(sec);
    refreshCard(currentId, sec);
  }
  function refreshCard(id, sec){
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    card.dataset.title = sec.title.toLowerCase();
    const titleEl = card.querySelector('.ttl');
    if (titleEl) titleEl.textContent = sec.title;
    const subCount = (sec.subs || []).length;
    let badge = card.querySelector('.badge');
    if (!subCount && badge) {
      badge.remove();
      return;
    }
    if (subCount && !badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      card.appendChild(badge);
    }
    if (badge) {
      badge.textContent = subCount;
      badge.title = `${subCount} 个知识点`;
    }
  }
  function setupDrawerResize(){
    if (!drawer || !drawerResizer) return;
    let resizing = false;
    applySavedDrawerWidth();

    drawerResizer.addEventListener('pointerdown', e => {
      if (isCompactDrawer()) return;
      resizing = true;
      drawer.classList.add('resizing');
      document.body.classList.add('drawer-resizing');
      drawerResizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    drawerResizer.addEventListener('pointermove', e => {
      if (!resizing) return;
      const nextWidth = applyDrawerWidth(window.innerWidth - e.clientX);
      updateDrawerResizeValue(nextWidth);
    });
    drawerResizer.addEventListener('pointerup', e => finishDrawerResize(e.pointerId));
    drawerResizer.addEventListener('pointercancel', e => finishDrawerResize(e.pointerId));
    drawerResizer.addEventListener('keydown', e => {
      if (isCompactDrawer() || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? 32 : -32;
      const nextWidth = applyDrawerWidth(drawer.getBoundingClientRect().width + delta);
      saveDrawerWidth(nextWidth);
      updateDrawerResizeValue(nextWidth);
    });
    window.addEventListener('resize', applySavedDrawerWidth);

    function finishDrawerResize(pointerId){
      if (!resizing) return;
      resizing = false;
      drawer.classList.remove('resizing');
      document.body.classList.remove('drawer-resizing');
      try { drawerResizer.releasePointerCapture(pointerId); } catch (_) {}
      saveDrawerWidth(drawer.getBoundingClientRect().width);
    }
  }
  function applySavedDrawerWidth(){
    if (isCompactDrawer()) {
      drawer.style.removeProperty('--drawer-width');
      return;
    }
    const savedWidth = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      const nextWidth = applyDrawerWidth(savedWidth);
      updateDrawerResizeValue(nextWidth);
    }
  }
  function applyDrawerWidth(width){
    const maxWidth = Math.max(DRAWER_MIN_WIDTH, window.innerWidth - DRAWER_EDGE_GAP);
    const nextWidth = clamp(width, DRAWER_MIN_WIDTH, maxWidth);
    drawer.style.setProperty('--drawer-width', Math.round(nextWidth) + 'px');
    return nextWidth;
  }
  function saveDrawerWidth(width){
    const nextWidth = applyDrawerWidth(width);
    localStorage.setItem(DRAWER_WIDTH_KEY, String(Math.round(nextWidth)));
  }
  function updateDrawerResizeValue(width){
    drawerResizer.setAttribute('aria-valuenow', String(Math.round(width)));
  }
  function isCompactDrawer(){
    return window.matchMedia('(max-width:640px)').matches;
  }
  window.addEventListener('resize', () => {
    if (diagramModal.classList.contains('open')) fitDiagramToViewport();
  });
  // 按渲染顺序扁平化所有小节，供方向键顺序切换（跨主章节连续）
  const flatIds = [];
  data.parts.forEach((part, pi) => {
    part.sections.forEach((sec, si) => flatIds.push(`${pi}-${si}`));
  });
  function navigateDrawer(delta){
    if (currentId === null) return;
    const next = flatIds.indexOf(currentId) + delta;
    if (next < 0 || next >= flatIds.length) return;  // 到头/到尾不循环
    const [pi, si] = flatIds[next].split('-').map(Number);
    openDrawer(pi, si);
    const card = document.querySelector(`.card[data-id="${flatIds[next]}"]`);
    if (card) card.scrollIntoView({block:'nearest'});
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (diagramModal.classList.contains('open')) closeDiagram();
      else closeDrawer();
      return;
    }
    // 抽屉打开时（且未在放大图表），←/→ 切换上一/下一小节（↑/↓ 留给正文滚动）
    if (currentId !== null && !diagramModal.classList.contains('open')
        && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      navigateDrawer(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  function openDiagram(diagram){
    diagramInner.innerHTML = '';
    resetDiagramViewport();
    const clone = diagram.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('title');
    rewriteSvgIds(clone, 'zoom-' + Date.now() + '-');
    normalizeDiagramSvg(clone);
    diagramInner.appendChild(clone);
    diagramModal.classList.add('open');
    diagramBackdrop.classList.add('open');
    requestAnimationFrame(() => {
      relaxDiagramNodeLabels(clone);
      normalizeDiagramSvg(clone);
      const size = measureDiagram(clone);
      diagramBaseWidth = size.width;
      diagramBaseHeight = size.height;
      fitDiagramToViewport();
    });
  }
  function closeDiagram(){
    diagramModal.classList.remove('open');
    diagramBackdrop.classList.remove('open');
    diagramInner.innerHTML = '';
  }
  function resetDiagramViewport(){
    diagramScale = 1;
    diagramCanvas.style.width = '';
    diagramCanvas.style.height = '';
    diagramInner.style.transform = 'scale(1)';
    diagramZoom.textContent = '100%';
  }
  function fitDiagramToViewport(){
    const bodyBox = diagramBody.getBoundingClientRect();
    const roomW = Math.max(1, bodyBox.width - 32);
    const roomH = Math.max(1, bodyBox.height - 32);
    const fit = Math.min(roomW / diagramBaseWidth, roomH / diagramBaseHeight);
    const readableMin = window.innerWidth < 700 ? 0.55 : 0.75;
    setDiagramScale(clamp(fit, readableMin, 1.5));
  }
  function setDiagramScale(scale){
    diagramScale = clamp(scale, 0.1, 3);
    const pad = 32;
    diagramCanvas.style.width = Math.ceil(diagramBaseWidth * diagramScale + pad) + 'px';
    diagramCanvas.style.height = Math.ceil(diagramBaseHeight * diagramScale + pad) + 'px';
    diagramInner.style.transform = `scale(${diagramScale})`;
    diagramZoom.textContent = Math.round(diagramScale * 100) + '%';
    requestAnimationFrame(() => {
      diagramBody.scrollLeft = Math.max(0, (diagramCanvas.scrollWidth - diagramBody.clientWidth) / 2);
      diagramBody.scrollTop = Math.max(0, (diagramCanvas.scrollHeight - diagramBody.clientHeight) / 2);
    });
  }
  function measureDiagram(root){
    const svg = root.querySelector('svg');
    if (svg) {
      const viewBox = svg.viewBox && svg.viewBox.baseVal;
      if (viewBox && viewBox.width && viewBox.height) {
        return {width: viewBox.width, height: viewBox.height};
      }
      const rect = svg.getBoundingClientRect();
      if (rect.width && rect.height) return {width: rect.width, height: rect.height};
    }
    const rect = root.getBoundingClientRect();
    return {width: Math.max(1, rect.width), height: Math.max(1, rect.height)};
  }
  function normalizeDiagramSvg(root){
    const svg = root.querySelector('svg');
    if (!svg) return;
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
      svg.setAttribute('width', viewBox.width);
      svg.setAttribute('height', viewBox.height);
      svg.style.maxWidth = 'none';
    }
  }
  function relaxDiagramNodeLabels(root){
    const svg = root.querySelector('svg');
    if (!svg) return;
    let changed = false;
    svg.querySelectorAll('g.node').forEach(node => {
      const shape = node.querySelector('rect,polygon,circle,ellipse,path');
      const foreignObject = node.querySelector('foreignObject');
      const htmlLabel = foreignObject && foreignObject.querySelector('div,span');
      if (!shape || !foreignObject || !htmlLabel) return;

      const foBox = foreignObject.getBBox();
      const foRect = foreignObject.getBoundingClientRect();
      const labelRect = htmlLabel.getBoundingClientRect();
      if (!foBox.width || !foBox.height || !foRect.width || !foRect.height) return;

      const scaleX = foRect.width / foBox.width;
      const scaleY = foRect.height / foBox.height;
      const labelWidth = labelRect.width / scaleX;
      const labelHeight = labelRect.height / scaleY;
      const nextFoWidth = Math.ceil(Math.max(foBox.width, labelWidth + 10));
      const nextFoHeight = Math.ceil(Math.max(foBox.height, labelHeight + 8));
      const dx = nextFoWidth - foBox.width;
      const dy = nextFoHeight - foBox.height;
      if (dx <= 1 && dy <= 1) return;

      centerForeignObject(foreignObject, dx, dy);
      foreignObject.setAttribute('width', nextFoWidth);
      foreignObject.setAttribute('height', nextFoHeight);
      expandNodeShape(shape, nextFoWidth + 24, nextFoHeight + 18);
      changed = true;
    });
    if (changed) refreshSvgViewBox(svg);
  }
  function centerForeignObject(foreignObject, dx, dy){
    const labelGroup = foreignObject.closest('g.label');
    if (labelGroup && labelGroup !== foreignObject.ownerSVGElement) {
      const shifted = shiftTranslate(labelGroup, -dx / 2, -dy / 2);
      if (shifted) return;
    }
    const x = parseFloat(foreignObject.getAttribute('x') || foreignObject.getBBox().x || 0);
    const y = parseFloat(foreignObject.getAttribute('y') || foreignObject.getBBox().y || 0);
    foreignObject.setAttribute('x', x - dx / 2);
    foreignObject.setAttribute('y', y - dy / 2);
  }
  function shiftTranslate(el, dx, dy){
    const transform = el.getAttribute('transform') || '';
    const match = transform.match(/translate\(\s*([-0-9.]+)(?:[ ,]+([-0-9.]+))?\s*\)/);
    if (!match) return false;
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2] || '0');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    el.setAttribute('transform', transform.replace(match[0], `translate(${x + dx}, ${y + dy})`));
    return true;
  }
  function expandNodeShape(shape, minWidth, minHeight){
    const box = shape.getBBox();
    const targetWidth = Math.max(box.width, minWidth);
    const targetHeight = Math.max(box.height, minHeight);
    if (targetWidth <= box.width + 1 && targetHeight <= box.height + 1) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const tag = shape.tagName.toLowerCase();
    if (tag === 'rect') {
      shape.setAttribute('x', cx - targetWidth / 2);
      shape.setAttribute('y', cy - targetHeight / 2);
      shape.setAttribute('width', targetWidth);
      shape.setAttribute('height', targetHeight);
    } else if (tag === 'ellipse') {
      shape.setAttribute('rx', targetWidth / 2);
      shape.setAttribute('ry', targetHeight / 2);
    } else if (tag === 'circle') {
      shape.setAttribute('r', Math.max(targetWidth, targetHeight) / 2);
    } else if (tag === 'polygon') {
      expandPolygon(shape, box, targetWidth, targetHeight);
    }
  }
  function expandPolygon(shape, box, targetWidth, targetHeight){
    const sx = box.width ? targetWidth / box.width : 1;
    const sy = box.height ? targetHeight / box.height : 1;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const points = (shape.getAttribute('points') || '').trim().split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return pair;
      return `${cx + (x - cx) * sx},${cy + (y - cy) * sy}`;
    });
    shape.setAttribute('points', points.join(' '));
  }
  function refreshSvgViewBox(svg){
    try {
      const box = svg.getBBox();
      const pad = 8;
      svg.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
    } catch (_) {}
  }
  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }
  function rewriteSvgIds(root, prefix){
    const idMap = new Map();
    root.querySelectorAll('[id]').forEach(el => {
      const oldId = el.id;
      const newId = prefix + oldId;
      idMap.set(oldId, newId);
      el.id = newId;
    });
    if (!idMap.size) return;
    const replacements = [...idMap.entries()].sort((a, b) => b[0].length - a[0].length);
    root.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        let value = attr.value;
        replacements.forEach(([oldId, newId]) => {
          value = value.replaceAll(`#${oldId}`, `#${newId}`);
        });
        if (value !== attr.value) el.setAttribute(attr.name, value);
      }
    });
    root.querySelectorAll('style').forEach(style => {
      let css = style.textContent || '';
      replacements.forEach(([oldId, newId]) => {
        css = css.replaceAll(`#${oldId}`, `#${newId}`);
      });
      style.textContent = css;
    });
  }

  drawer.querySelectorAll('.toggle-group button').forEach(btn => {
    btn.onclick = () => {
      if (!currentId) return;
      setStatus(currentId, btn.dataset.status);
      syncStatusButtons();
    };
  });
  function syncStatusButtons(){
    const cur = state[currentId] || 'todo';
    drawer.querySelectorAll('.toggle-group button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === cur);
    });
  }

  function cycleStatus(id){
    const order = ['todo','doing','done'];
    const cur = state[id] || 'todo';
    const next = order[(order.indexOf(cur)+1) % order.length];
    setStatus(id, next);
  }
  function setStatus(id, status){
    if (status === 'todo') delete state[id]; else state[id] = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) card.dataset.status = status;
    if (currentId === id) syncStatusButtons();
    updateProgress();
  }

  function updateProgress(){
    const done = Object.values(state).filter(v => v === 'done').length;
    document.getElementById('bar').style.width = (done / totalCount * 100) + '%';
    document.getElementById('progress-text').textContent = `${done} / ${totalCount}`;
  }
  updateProgress();

  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach(c => {
      c.classList.toggle('hidden', q && !c.dataset.title.includes(q));
    });
    document.querySelectorAll('.part').forEach(p => {
      const anyVisible = [...p.querySelectorAll('.card')].some(c => !c.classList.contains('hidden'));
      p.classList.toggle('hidden', !anyVisible);
    });
  });

  document.getElementById('reset').onclick = () => {
    if (!confirm('重置所有进度？')) return;
    for (const k of Object.keys(state)) delete state[k];
    localStorage.removeItem(STORAGE_KEY);
    document.querySelectorAll('.card').forEach(c => c.dataset.status = 'todo');
    updateProgress();
  };

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();


/* --- shared enhancements (added on top of the generated template) --- */
(function () {
  'use strict';
  var dataEl = document.getElementById('data');
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (error) { return; }
  var STORAGE_KEY = 'roadmap:' + (data.title || '');

  /* Accessibility fixes for markup the drawer renderer inserts at runtime. */
  function fixAccessibility(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('table th:not([scope])').forEach(function (th) {
      th.setAttribute('scope', 'col');
    });
    root.querySelectorAll('img:not([alt])').forEach(function (img) {
      img.setAttribute('alt', '');
    });
    root.querySelectorAll('a[target="_blank"]:not([rel])').forEach(function (a) {
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }

  function addProgressTools() {
    var reset = document.getElementById('reset');
    if (!reset || document.getElementById('export-progress')) return;

    var exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.id = 'export-progress';
    exportButton.className = reset.className;
    exportButton.textContent = '导出进度';
    exportButton.title = '把本页学习进度保存为 JSON 文件';

    var importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.id = 'import-progress';
    importButton.className = reset.className;
    importButton.textContent = '导入进度';
    importButton.title = '从 JSON 文件恢复学习进度，导入后会刷新页面';

    var file = document.createElement('input');
    file.type = 'file';
    file.id = 'import-file';
    file.accept = 'application/json,.json';
    file.hidden = true;

    reset.insertAdjacentElement('afterend', exportButton);
    exportButton.insertAdjacentElement('afterend', importButton);
    importButton.insertAdjacentElement('afterend', file);

    exportButton.addEventListener('click', function () {
      var payload = {
        version: 1,
        note: data.title,
        exportedAt: new Date().toISOString(),
        state: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = String(data.title || 'roadmap').replace(/[\\/:*?"<>|]+/g, '-') + '.progress.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    importButton.addEventListener('click', function () { file.click(); });

    file.addEventListener('change', function () {
      var selected = file.files && file.files[0];
      if (!selected) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          var state = parsed && typeof parsed === 'object' ? (parsed.state || parsed) : null;
          if (!state || typeof state !== 'object' || Array.isArray(state)) {
            throw new Error('缺少 state 字段');
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          window.alert('进度已导入，页面将刷新以应用。');
          window.location.reload();
        } catch (error) {
          window.alert('导入失败：' + error.message);
        }
      };
      reader.readAsText(selected);
      file.value = '';
    });
  }

  function enhance() {
    fixAccessibility(document);
    var search = document.getElementById('search');
    if (search && !search.hasAttribute('aria-label')) {
      search.setAttribute('aria-label', '搜索小节');
    }
    var progressText = document.getElementById('progress-text');
    if (progressText && !progressText.hasAttribute('role')) {
      progressText.setAttribute('role', 'status');
      progressText.setAttribute('aria-live', 'polite');
    }
    addProgressTools();
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) fixAccessibility(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
})();
