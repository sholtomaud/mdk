/* MDK Diagram Editor — migrated from gssk-dia, extended for Bond Graph domain.
 * Odum ESL editing is preserved from gssk-editor.js.
 * Bond Graph editing (T6.2) adds Se/Sf/R/C/I/TF/GY/J0/J1 palette + power_bond rendering. */

import styles from './styles.css?inline';
import { SYMBOLS } from './symbols.js';
import { validateModel } from './validator.js';

const BG_TYPES = ['Se', 'Sf', 'R', 'C', 'I', 'TF', 'GY', 'J0', 'J1'];
const BG_TYPE_ABBR = { Se: 'Se', Sf: 'Sf', R: 'R', C: 'C', I: 'I', TF: 'TF', GY: 'GY', J0: 'J0', J1: 'J1' };

export class MdkEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    /* Shared interaction state */
    this._gridSize = 20;
    this._selectedId = null;
    this._selectedType = null;
    this._isDragging = false;
    this._dragOffset = { x: 0, y: 0 };
    this._isPanning = false;
    this._lastMousePos = { x: 0, y: 0 };
    this._isWiring = false;
    this._wireStartElementId = null;
    this._wireStartPos = { x: 0, y: 0 };
    this._isResizing = false;
    this._isDraggingHandle = false;
    this._activeHandle = null;
    this._animationRequested = false;
    this._viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
    this._zoom = 1;
    this._readOnly = false;

    /* Domain state */
    this._domain = 'odum';

    /* Odum ESL model */
    this._value = { nodes: [], edges: [], boundaries: [] };

    /* Bond Graph model */
    this._bgValue = { schemaVersion: '1.0', domain: 'bondgraph', elements: [], bonds: [] };
    /* Visual positions for BG elements — stored separately so we don't pollute the model JSON */
    this._bgVisual = {};   /* id → { x, y, label } */
    this._bgNextId = 0;
    this._bgNextBondId = 0;

    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onDrop = this.onDrop.bind(this);
    this._onDoubleClick = this.onDoubleClick.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
  }

  static get observedAttributes() {
    return ['domain', 'readonly', 'grid', 'theme'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    switch (name) {
      case 'domain': this._domain = newValue || 'odum'; break;
      case 'readonly': this._readOnly = newValue !== null; break;
      case 'grid': this._gridSize = parseInt(newValue, 10) || 20; break;
    }
    this.update();
  }

  connectedCallback() {
    this.render();
    window.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ── Public API ───────────────────────────────────────────────── */

  get value() { return this.getJson(); }
  set value(val) { this.loadModel(val); }

  get domain() { return this._domain; }
  set domain(val) { this.setAttribute('domain', val); }

  loadModel(json) {
    if (!json) return;
    const m = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));

    if (m.domain === 'bondgraph') {
      this._domain = 'bondgraph';
      this._bgValue = { schemaVersion: '1.0', domain: 'bondgraph', elements: m.elements || [], bonds: m.bonds || [] };
      this._bgVisual = {};
      this._bgNextId = 0;
      this._bgNextBondId = 0;
      (m.elements || []).forEach(el => {
        const v = el.visual || {};
        this._bgVisual[el.id] = { x: v.x ?? 200 + el.id * 120, y: v.y ?? 300, label: v.label ?? el.name };
        if (el.id >= this._bgNextId) this._bgNextId = el.id + 1;
      });
      (m.bonds || []).forEach(b => {
        if (b.id >= this._bgNextBondId) this._bgNextBondId = b.id + 1;
      });
    } else {
      this._domain = 'odum';
      this._value = m;
      if (!this._value.nodes) this._value.nodes = [];
      if (!this._value.edges) this._value.edges = [];
      if (!this._value.boundaries) this._value.boundaries = [];
      this._value.nodes.forEach(n => { n.currentValue = n.value; });
    }

    this.validate();
    this.update();
    this._syncDomainButtons();
  }

  getJson() {
    if (this._domain === 'bondgraph') {
      const els = this._bgValue.elements.map(el => ({
        ...el,
        visual: { ...(this._bgVisual[el.id] || { x: 200, y: 200 }) },
      }));
      return { ...this._bgValue, elements: els };
    }
    return JSON.parse(JSON.stringify(this._value));
  }

  validate() {
    const result = validateModel(this.getJson());
    if (result.valid) this.removeAttribute('invalid');
    else this.setAttribute('invalid', '');
    this.dispatchEvent(new CustomEvent('validation', { detail: result }));
    return result.valid;
  }

  /* ── Rendering ────────────────────────────────────────────────── */

  render() {
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="editor-container">
        <div id="palette" class="panel palette">
          <div class="panel-header">Nodes</div>
          <button class="domain-btn ${this._domain === 'odum' ? 'active' : ''}" data-domain="odum">ESL</button>
          <button class="domain-btn ${this._domain === 'bondgraph' ? 'active' : ''}" data-domain="bondgraph">BG</button>
          <div class="domain-separator"></div>
          <div id="palette-items"></div>
        </div>
        <div id="canvas-container">
          <svg id="svg-canvas" viewBox="${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}">
            <defs id="symbol-defs"></defs>
            <g id="grid-layer"></g>
            <g id="boundaries-layer"></g>
            <g id="edges-layer"></g>
            <g id="nodes-layer"></g>
          </svg>
        </div>
        <div id="property-panel" class="panel property-panel hidden">
          <div class="panel-header">
            Properties
            <button class="toggle" id="close-props">&times;</button>
          </div>
          <div id="props-content"></div>
        </div>
      </div>
    `;
    this._renderPaletteItems();
    this.setupEventListeners();
    this.update();
  }

  _renderPaletteItems() {
    const container = this.shadowRoot.getElementById('palette-items');
    if (!container) return;
    if (this._domain === 'odum') {
      container.innerHTML = `
        <div class="palette-item" draggable="true" data-type="source" title="Source">Src</div>
        <div class="palette-item" draggable="true" data-type="storage" title="Storage">Sto</div>
        <div class="palette-item" draggable="true" data-type="sink" title="Sink">Snk</div>
        <div class="palette-item" draggable="true" data-type="constant" title="Constant">Con</div>
        <div class="palette-item" draggable="true" data-type="boundary" title="Boundary">Bnd</div>
      `;
    } else {
      container.innerHTML = BG_TYPES.map(t =>
        `<div class="palette-item" draggable="true" data-type="${t}" data-domain="bondgraph" title="${t}">${BG_TYPE_ABBR[t]}</div>`
      ).join('');
    }
    container.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('mdk-type', item.dataset.type);
        e.dataTransfer.setData('mdk-domain', item.dataset.domain || 'odum');
      });
    });
  }

  _syncDomainButtons() {
    const btns = this.shadowRoot.querySelectorAll('.domain-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.domain === this._domain);
    });
    this._renderPaletteItems();
  }

  update() {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    if (!svg) return;
    svg.setAttribute('viewBox', `${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}`);

    const defs = this.shadowRoot.getElementById('symbol-defs');
    if (defs) {
      defs.innerHTML = SYMBOLS.odum + SYMBOLS.generic + SYMBOLS.bondgraph;
    }

    if (this._domain === 'bondgraph') {
      this.shadowRoot.getElementById('boundaries-layer').innerHTML = '';
      this.renderBgBonds();
      this.renderBgElements();
    } else {
      this.renderBoundaries();
      this.renderEdges();
      this.renderNodes();
    }
  }

  /* ── Odum ESL rendering (preserved from gssk-editor.js) ────────── */

  renderBoundaries() {
    const layer = this.shadowRoot.getElementById('boundaries-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (!this._value.boundaries) return;
    this._value.boundaries.forEach(boundary => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', boundary.id);
      g.setAttribute('class', `boundary-group ${this._selectedId === boundary.id ? 'selected' : ''}`);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', boundary.x); rect.setAttribute('y', boundary.y);
      rect.setAttribute('width', boundary.w); rect.setAttribute('height', boundary.h);
      rect.setAttribute('rx', '15'); rect.setAttribute('ry', '15');
      rect.setAttribute('fill', 'rgba(100,116,139,0.05)');
      rect.setAttribute('stroke', this._selectedId === boundary.id ? 'var(--primary-color)' : 'var(--grid-color)');
      rect.setAttribute('stroke-width', '2'); rect.setAttribute('stroke-dasharray', '5,5');
      rect.style.cursor = 'grab';
      g.appendChild(rect);
      if (boundary.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', boundary.x + 10); text.setAttribute('y', boundary.y + 20);
        text.setAttribute('class', 'node-label'); text.style.fontStyle = 'italic';
        text.style.pointerEvents = 'none'; text.textContent = boundary.label;
        g.appendChild(text);
      }
      if (this._selectedId === boundary.id && !this._readOnly) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', boundary.x + boundary.w - 10); handle.setAttribute('y', boundary.y + boundary.h - 10);
        handle.setAttribute('width', '20'); handle.setAttribute('height', '20');
        handle.setAttribute('fill', 'var(--primary-color)'); handle.setAttribute('class', 'resize-handle');
        handle.style.cursor = 'nwse-resize';
        g.appendChild(handle);
      }
      layer.appendChild(g);
    });
  }

  renderNodes() {
    const layer = this.shadowRoot.getElementById('nodes-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._value.nodes.forEach(node => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${node.visual.x - 40},${node.visual.y - 40})`);
      g.setAttribute('data-id', node.id);
      g.setAttribute('class', `node-group ${this._selectedId === node.id ? 'selected' : ''}`);
      g.style.cursor = this._readOnly ? 'default' : 'grab';
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '80'); bg.setAttribute('height', '80'); bg.setAttribute('fill', 'transparent');
      g.appendChild(bg);
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#odum-${node.type}`);
      use.setAttribute('width', '80'); use.setAttribute('height', '80'); use.setAttribute('color', 'var(--text-color)');
      g.appendChild(use);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '40'); text.setAttribute('y', '95');
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('class', 'node-label');
      text.textContent = node.visual.label || node.id;
      g.appendChild(text);
      this._addPorts(g);
      layer.appendChild(g);
    });
  }

  _addPorts(g) {
    const ports = [{ x: 40, y: 10 }, { x: 70, y: 40 }, { x: 40, y: 70 }, { x: 10, y: 40 }];
    ports.forEach(p => {
      const portG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      portG.setAttribute('class', 'node-port');
      const vis = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      vis.setAttribute('cx', p.x); vis.setAttribute('cy', p.y); vis.setAttribute('r', '4');
      vis.setAttribute('fill', 'var(--bg-color)'); vis.setAttribute('stroke', 'var(--primary-color)');
      portG.appendChild(vis);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y); hit.setAttribute('r', '12');
      hit.setAttribute('fill', 'transparent'); hit.style.cursor = 'crosshair';
      portG.appendChild(hit);
      g.appendChild(portG);
    });
  }

  renderEdges() {
    const layer = this.shadowRoot.getElementById('edges-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._ensureArrowMarker();
    this._value.edges.forEach(edge => {
      const geo = this.getEdgeGeometry(edge);
      if (!geo) return;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', edge.id);
      g.setAttribute('class', `edge-group ${this._selectedId === edge.id ? 'selected' : ''}`);
      const d = `M ${geo.x1},${geo.y1} C ${geo.cx1},${geo.cy1} ${geo.cx2},${geo.cy2} ${geo.x2},${geo.y2}`;
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', d); hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent'); hitPath.setAttribute('stroke-width', '20');
      g.appendChild(hitPath);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--edge-color)'); path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', 'url(#arrowhead)'); path.setAttribute('class', 'main-path');
      if (edge.logic === 'interaction') path.setAttribute('stroke-dasharray', '5,5');
      g.appendChild(path);
      layer.appendChild(g);
    });
  }

  _ensureArrowMarker() {
    const defs = this.shadowRoot.getElementById('symbol-defs');
    if (this.shadowRoot.getElementById('arrowhead')) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead'); marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const ap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ap.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); ap.setAttribute('fill', 'var(--edge-color)');
    marker.appendChild(ap); defs.appendChild(marker);
  }

  /* ── Bond Graph rendering (T6.2) ─────────────────────────────── */

  renderBgElements() {
    const layer = this.shadowRoot.getElementById('nodes-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._bgValue.elements.forEach(el => {
      const vis = this._bgVisual[el.id] || { x: 200, y: 200, label: el.name };
      const cx = vis.x, cy = vis.y;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${cx - 40},${cy - 40})`);
      g.setAttribute('data-id', String(el.id));
      g.setAttribute('data-element-type', el.type);
      g.setAttribute('class', `node-group ${this._selectedId === String(el.id) ? 'selected' : ''}`);
      g.style.cursor = this._readOnly ? 'default' : 'grab';
      /* Hit area */
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '80'); bg.setAttribute('height', '80'); bg.setAttribute('fill', 'transparent');
      g.appendChild(bg);
      /* Symbol */
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#bg-${el.type}`);
      use.setAttribute('width', '80'); use.setAttribute('height', '80');
      use.setAttribute('color', 'var(--text-color)');
      g.appendChild(use);
      /* Label (name + parameter) */
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '40'); text.setAttribute('y', '98');
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('class', 'node-label');
      text.textContent = `${vis.label || el.name}${el.parameter != null ? ` (${el.parameter})` : ''}`;
      g.appendChild(text);
      /* Connection ports */
      this._addPorts(g);
      layer.appendChild(g);
    });
  }

  renderBgBonds() {
    const layer = this.shadowRoot.getElementById('edges-layer');
    if (!layer) return;
    layer.innerHTML = '';
    this._ensureBondMarker();
    this._bgValue.bonds.forEach(bond => {
      const srcVis = this._bgVisual[bond.source];
      const tgtVis = this._bgVisual[bond.target];
      if (!srcVis || !tgtVis) return;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', `bond-${bond.id}`);
      g.setAttribute('class', `bond-group ${this._selectedId === `bond-${bond.id}` ? 'selected' : ''}`);
      /* Simple straight bond line for MVP */
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', srcVis.x); line.setAttribute('y1', srcVis.y);
      line.setAttribute('x2', tgtVis.x); line.setAttribute('y2', tgtVis.y);
      line.setAttribute('class', 'bond-line');
      line.setAttribute('marker-end', 'url(#bond-arrow)');
      g.appendChild(line);
      /* Hit area */
      const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitLine.setAttribute('x1', srcVis.x); hitLine.setAttribute('y1', srcVis.y);
      hitLine.setAttribute('x2', tgtVis.x); hitLine.setAttribute('y2', tgtVis.y);
      hitLine.setAttribute('stroke', 'transparent'); hitLine.setAttribute('stroke-width', '16');
      hitLine.style.cursor = 'pointer';
      g.appendChild(hitLine);
      /* Causal stroke: perpendicular line near the target (effort-setting indicator) */
      this._addCausalStroke(g, srcVis, tgtVis);
      layer.appendChild(g);
    });
  }

  _addCausalStroke(g, src, tgt) {
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    /* Position causal stroke 20px from target, perpendicular to bond direction */
    const t = Math.max(0, len - 20) / len;
    const px = src.x + dx * t, py = src.y + dy * t;
    const nx = -dy / len, ny = dx / len;  /* unit normal */
    const cs = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    cs.setAttribute('x1', px + nx * 10); cs.setAttribute('y1', py + ny * 10);
    cs.setAttribute('x2', px - nx * 10); cs.setAttribute('y2', py - ny * 10);
    cs.setAttribute('class', 'causal-stroke');
    g.appendChild(cs);
  }

  _ensureBondMarker() {
    if (this.shadowRoot.getElementById('bond-arrow')) return;
    const defs = this.shadowRoot.getElementById('symbol-defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'bond-arrow'); marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7'); marker.setAttribute('refY', '4');
    marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 0 0 L 8 4 L 0 8 L 2 4 Z');
    p.setAttribute('fill', 'var(--bond-color)');
    marker.appendChild(p); defs.appendChild(marker);
  }

  /* ── Edge geometry (Odum ESL — from gssk-editor.js) ──────────── */

  getEdgeGeometry(edge) {
    const originNode = this._value.nodes.find(n => n.id === edge.origin);
    const targetNode = this._value.nodes.find(n => n.id === edge.target);
    if (!originNode || !targetNode) return null;
    const c1 = { x: originNode.visual.x, y: originNode.visual.y };
    const c2 = { x: targetNode.visual.x, y: targetNode.visual.y };
    const dx = c2.x - c1.x, dy = c2.y - c1.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    let cx1 = c1.x + Math.cos(angle - 0.2) * dist / 3;
    let cy1 = c1.y + Math.sin(angle - 0.2) * dist / 3;
    let cx2 = c2.x - Math.cos(angle + 0.2) * dist / 3;
    let cy2 = c2.y - Math.sin(angle + 0.2) * dist / 3;
    if (edge.visual?.ctrl1) { cx1 = c1.x + edge.visual.ctrl1.x; cy1 = c1.y + edge.visual.ctrl1.y; }
    if (edge.visual?.ctrl2) { cx2 = c2.x + edge.visual.ctrl2.x; cy2 = c2.y + edge.visual.ctrl2.y; }
    return { x1: c1.x, y1: c1.y, cx1, cy1, cx2, cy2, x2: c2.x, y2: c2.y };
  }

  /* ── Event handling ─────────────────────────────────────────── */

  setupEventListeners() {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    svg.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    svg.addEventListener('wheel', this._onWheel, { passive: false });
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', this._onDrop);
    this.shadowRoot.getElementById('close-props')?.addEventListener('click', () =>
      this.shadowRoot.getElementById('property-panel').classList.add('hidden'));
    this.shadowRoot.addEventListener('dblclick', this._onDoubleClick);

    /* Domain switcher buttons */
    this.shadowRoot.querySelectorAll('.domain-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._domain = btn.dataset.domain;
        this._syncDomainButtons();
        this.update();
        this.dispatchEvent(new CustomEvent('domain-change', { detail: { domain: this._domain } }));
      });
    });

    this._setupPanelDragging();
  }

  _setupPanelDragging() {
    this.shadowRoot.querySelectorAll('.panel').forEach(panel => {
      const header = panel.querySelector('.panel-header');
      if (!header) return;
      let dragging = false, sx = 0, sy = 0;
      header.addEventListener('mousedown', e => {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true; sx = e.clientX - panel.offsetLeft; sy = e.clientY - panel.offsetTop;
        e.preventDefault();
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        panel.style.left = `${e.clientX - sx}px`; panel.style.top = `${e.clientY - sy}px`;
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
      });
      window.addEventListener('mouseup', () => { dragging = false; });
    });
  }

  getSVGPoint(e) {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  onMouseDown(e) {
    if (this._readOnly) return;
    const svgP = this.getSVGPoint(e);
    const port = e.target.closest('.node-port');
    if (port) {
      this._isWiring = true;
      this._wireStartElementId = port.parentElement.dataset.id;
      this._wireStartPos = svgP;
      this._createTempWire(svgP);
      return;
    }
    const nodeTarget = e.target.closest('.node-group');
    const edgeTarget = e.target.closest('.edge-group, .bond-group');
    const boundaryTarget = e.target.closest('.boundary-group');
    if (nodeTarget) {
      this._isDragging = true;
      this._selectedId = nodeTarget.dataset.id;
      this._selectedType = 'node';
      if (this._domain === 'odum') {
        const node = this._value.nodes.find(n => n.id === this._selectedId);
        if (node) this._dragOffset = { x: svgP.x - node.visual.x, y: svgP.y - node.visual.y };
      } else {
        const id = parseInt(this._selectedId, 10);
        const vis = this._bgVisual[id] || { x: svgP.x, y: svgP.y };
        this._dragOffset = { x: svgP.x - vis.x, y: svgP.y - vis.y };
      }
    } else if (edgeTarget) {
      this._selectedId = edgeTarget.dataset.id;
      this._selectedType = 'edge';
    } else if (boundaryTarget) {
      this._isDragging = true;
      this._selectedId = boundaryTarget.dataset.id;
      this._selectedType = 'boundary';
      const b = this._value.boundaries.find(b => b.id === this._selectedId);
      if (b) this._dragOffset = { x: svgP.x - b.x, y: svgP.y - b.y };
    } else {
      this._selectedId = null; this._selectedType = null;
      this._isPanning = true; this._lastMousePos = { x: e.clientX, y: e.clientY };
    }
    if (this._selectedId) this.showPropertyPanel();
    else this.shadowRoot.getElementById('property-panel').classList.add('hidden');
    this.update();
  }

  onMouseMove(e) {
    const svgP = this.getSVGPoint(e);
    if (this._isWiring) {
      const tw = this.shadowRoot.getElementById('temp-wire');
      if (tw) { tw.setAttribute('x2', svgP.x); tw.setAttribute('y2', svgP.y); }
      return;
    }
    if (this._isPanning) {
      const dx = (e.clientX - this._lastMousePos.x) * this._zoom;
      const dy = (e.clientY - this._lastMousePos.y) * this._zoom;
      this._viewBox.x -= dx; this._viewBox.y -= dy;
      this._lastMousePos = { x: e.clientX, y: e.clientY };
      this.update(); return;
    }
    if (!this._isDragging) return;
    let x = Math.round((svgP.x - this._dragOffset.x) / this._gridSize) * this._gridSize;
    let y = Math.round((svgP.y - this._dragOffset.y) / this._gridSize) * this._gridSize;
    if (this._selectedType === 'node') {
      if (this._domain === 'odum') {
        const node = this._value.nodes.find(n => n.id === this._selectedId);
        if (node) { node.visual.x = x; node.visual.y = y; }
      } else {
        const id = parseInt(this._selectedId, 10);
        if (this._bgVisual[id]) { this._bgVisual[id].x = x; this._bgVisual[id].y = y; }
      }
    } else if (this._selectedType === 'boundary') {
      const b = this._value.boundaries.find(b => b.id === this._selectedId);
      if (b) { b.x = x; b.y = y; }
    }
    this.update();
    this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  onMouseUp(e) {
    if (this._isWiring) {
      this._isWiring = false;
      this.shadowRoot.getElementById('temp-wire')?.remove();
      const path = e.composedPath();
      const tgt = path[0];
      const targetEl = (tgt instanceof Element) ? tgt.closest('.node-group') : null;
      if (targetEl && targetEl.dataset.id !== this._wireStartElementId) {
        this._createConnection(this._wireStartElementId, targetEl.dataset.id);
      }
    }
    this._isDragging = false; this._isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const svgP = this.getSVGPoint(e);
    this._viewBox.x = svgP.x - (svgP.x - this._viewBox.x) * factor;
    this._viewBox.y = svgP.y - (svgP.y - this._viewBox.y) * factor;
    this._viewBox.w *= factor; this._viewBox.h *= factor;
    this._zoom = this._viewBox.w / this.offsetWidth;
    this.update();
  }

  _createTempWire(pos) {
    const svg = this.shadowRoot.getElementById('svg-canvas');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('id', 'temp-wire');
    line.setAttribute('x1', pos.x); line.setAttribute('y1', pos.y);
    line.setAttribute('x2', pos.x); line.setAttribute('y2', pos.y);
    line.setAttribute('stroke', 'var(--primary-color)');
    line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '5,5');
    line.style.pointerEvents = 'none';
    svg.appendChild(line);
  }

  _createConnection(fromId, toId) {
    if (this._domain === 'bondgraph') {
      const srcId = parseInt(fromId, 10);
      const tgtId = parseInt(toId, 10);
      if (isNaN(srcId) || isNaN(tgtId)) return;
      const bond = { id: this._bgNextBondId++, source: srcId, target: tgtId, type: 'power_bond' };
      this._bgValue.bonds.push(bond);
    } else {
      const id = `edge-${Date.now()}`;
      this._value.edges.push({ id, origin: fromId, target: toId, logic: 'linear', params: { k: 0.1 } });
    }
    this.validate(); this.update();
    this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('mdk-type');
    const domainHint = e.dataTransfer.getData('mdk-domain') || 'odum';
    if (!type) return;
    const svgP = this.getSVGPoint(e);
    const x = Math.round(svgP.x / this._gridSize) * this._gridSize;
    const y = Math.round(svgP.y / this._gridSize) * this._gridSize;
    if (domainHint === 'bondgraph') {
      const id = this._bgNextId++;
      this._bgValue.elements.push({ id, name: `${type}${id}`, type, parameter: 0 });
      this._bgVisual[id] = { x, y, label: `${type}${id}` };
    } else if (type === 'boundary') {
      this._value.boundaries.push({ id: `boundary-${Date.now()}`, x, y, w: 200, h: 200, label: 'System Boundary' });
    } else {
      const id = `${type}-${Date.now()}`;
      this._value.nodes.push({ id, type, value: type === 'storage' ? 10 : 0, visual: { x, y, label: type[0].toUpperCase() + type.slice(1), capacity: 100 } });
    }
    this.validate(); this.update();
    this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
  }

  onDoubleClick(e) {
    const target = e.target.closest('.node-label');
    if (!target) return;
    const parent = target.parentElement;
    const id = parent?.dataset?.id;
    if (!id) return;
    if (this._domain === 'bondgraph') {
      const numId = parseInt(id, 10);
      const vis = this._bgVisual[numId];
      if (!vis) return;
      const newLabel = prompt('Label:', vis.label);
      if (newLabel !== null) { vis.label = newLabel; this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() })); }
    } else {
      const node = this._value.nodes.find(n => n.id === id) || this._value.boundaries.find(b => b.id === id);
      if (!node) return;
      const cur = node.visual ? node.visual.label : node.label;
      const newLabel = prompt('Label:', cur);
      if (newLabel !== null) {
        if (node.visual) node.visual.label = newLabel; else node.label = newLabel;
        this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
      }
    }
  }

  onKeyDown(e) {
    if (this._readOnly) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedId) {
      const tgt = e.composedPath()[0];
      if (tgt && ['INPUT', 'SELECT', 'TEXTAREA'].includes(tgt.tagName)) return;
      if (this._domain === 'bondgraph') {
        if (this._selectedType === 'node') {
          const id = parseInt(this._selectedId, 10);
          this._bgValue.elements = this._bgValue.elements.filter(el => el.id !== id);
          this._bgValue.bonds = this._bgValue.bonds.filter(b => b.source !== id && b.target !== id);
          delete this._bgVisual[id];
        } else if (this._selectedType === 'edge') {
          const bondId = parseInt(this._selectedId.replace('bond-', ''), 10);
          this._bgValue.bonds = this._bgValue.bonds.filter(b => b.id !== bondId);
        }
      } else {
        if (this._selectedType === 'node') {
          this._value.nodes = this._value.nodes.filter(n => n.id !== this._selectedId);
          this._value.edges = this._value.edges.filter(e => e.origin !== this._selectedId && e.target !== this._selectedId);
        } else if (this._selectedType === 'edge') {
          this._value.edges = this._value.edges.filter(e => e.id !== this._selectedId);
        } else if (this._selectedType === 'boundary') {
          this._value.boundaries = this._value.boundaries.filter(b => b.id !== this._selectedId);
        }
      }
      this._selectedId = null; this._selectedType = null;
      this.shadowRoot.getElementById('property-panel').classList.add('hidden');
      this.validate(); this.update();
      this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
    }
  }

  showPropertyPanel() {
    const panel = this.shadowRoot.getElementById('property-panel');
    const content = this.shadowRoot.getElementById('props-content');
    if (!panel || !content) return;
    panel.classList.remove('hidden');
    if (this._domain === 'bondgraph' && this._selectedType === 'node') {
      const id = parseInt(this._selectedId, 10);
      const el = this._bgValue.elements.find(e => e.id === id);
      const vis = this._bgVisual[id];
      if (!el || !vis) return;
      content.innerHTML = `
        <div class="prop-group"><label>Name</label><input type="text" id="prop-bg-name" value="${el.name}"></div>
        <div class="prop-group"><label>Type</label><input type="text" readonly value="${el.type}"></div>
        <div class="prop-group"><label>Parameter</label><input type="number" id="prop-bg-param" step="any" value="${el.parameter}"></div>
        <div class="prop-group"><label>Label</label><input type="text" id="prop-bg-label" value="${vis.label || el.name}"></div>
      `;
      content.querySelector('#prop-bg-name').addEventListener('change', ev => {
        el.name = ev.target.value; this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
      });
      content.querySelector('#prop-bg-param').addEventListener('change', ev => {
        el.parameter = parseFloat(ev.target.value); this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
      });
      content.querySelector('#prop-bg-label').addEventListener('change', ev => {
        vis.label = ev.target.value; this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() }));
      });
    } else if (this._domain === 'odum' && this._selectedType === 'node') {
      const node = this._value.nodes.find(n => n.id === this._selectedId);
      if (!node) return;
      content.innerHTML = `
        <div class="prop-group"><label>ID</label><input type="text" id="prop-id" value="${node.id}"></div>
        <div class="prop-group"><label>Label</label><input type="text" id="prop-label" value="${node.visual.label || ''}"></div>
        <div class="prop-group"><label>Value</label><input type="number" id="prop-value" step="0.1" value="${node.value}"></div>
        <div class="prop-group"><label>Type</label>
          <select id="prop-type">
            ${['source','storage','sink','constant'].map(t => `<option ${node.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      `;
      const upd = (sel, fn) => content.querySelector(sel).addEventListener('change', e => { fn(e.target.value); this.validate(); this.update(); this.dispatchEvent(new CustomEvent('change', { detail: this.getJson() })); });
      upd('#prop-id', v => { this._value.edges.forEach(edge => { if (edge.origin === node.id) edge.origin = v; if (edge.target === node.id) edge.target = v; }); this._selectedId = v; node.id = v; });
      upd('#prop-label', v => { node.visual.label = v; });
      upd('#prop-value', v => { node.value = parseFloat(v); });
      upd('#prop-type', v => { node.type = v; });
    } else {
      content.innerHTML = `<div style="color:var(--panel-header-color);font-size:0.8rem">No properties</div>`;
    }
  }
}

customElements.define('mdk-dia', MdkEditor);
