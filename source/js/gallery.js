/* A small, dependency-free WebGL exhibition, progressively enhanced from HTML. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cards = $$('.work-card');
  const works = cards.map((card, index) => ({
    card, index, title: card.querySelector('h2').textContent,
    category: card.dataset.category, image: card.querySelector('img').src,
    subtitle: card.querySelector('.work-subtitle').textContent,
    details: card.querySelector('.work-details'), demo: card.dataset.demo === 'true'
  }));
  const stage = $('.gallery-stage');
  const canvas = $('#gallery-canvas');
  const grid = $('#works');
  const dialog = $('.work-dialog');
  let filtered = works.slice();
  let currentWork = null;
  let renderer = null;
  let spaceAvailable = false;
  let previousFocus = null;
  $('[data-total]').textContent = String(works.length).padStart(2, '0');
  $('[data-count]').textContent = String(works.length).padStart(2, '0');
  $('.sample-note').hidden = !works.some(work => work.demo);

  function openWork(work) {
    if (!work) return;
    currentWork = work;
    const art = $('.detail-art img');
    art.src = work.image;
    art.alt = work.subtitle || work.title;
    $('#detail-title').textContent = work.title;
    $('.detail-subtitle').textContent = work.subtitle;
    $('[data-detail-category]').textContent = `${work.category} / ${work.card.querySelector('.work-meta span:last-child').textContent}`;
    $('.detail-description').replaceChildren(...[...work.details.children].map(child => child.cloneNode(true)));
    $('.detail-demo').textContent = work.demo ? '示例展品 · 可替换' : '';
    $('[data-detail-index]').textContent = `${filtered.indexOf(work) + 1} / ${filtered.length}`;
    $('[data-detail-prev]').disabled = filtered.length < 2;
    $('[data-detail-next]').disabled = filtered.length < 2;
    if (!dialog.open) {
      previousFocus = document.activeElement;
      dialog.showModal();
      renderer?.pause();
    }
  }
  function nextWork(direction) {
    const index = filtered.indexOf(currentWork);
    openWork(filtered[(index + direction + filtered.length) % filtered.length]);
  }
  works.forEach(work => work.card.querySelector('[data-open-work]').addEventListener('click', event => {
    event.preventDefault();
    openWork(work);
  }));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); nextWork(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  dialog.addEventListener('close', () => {
    previousFocus?.focus({ preventScroll: true });
    renderer?.request();
  });
  $('[data-detail-prev]').addEventListener('click', () => nextWork(-1));
  $('[data-detail-next]').addEventListener('click', () => nextWork(1));

  function setView(view) {
    const space = view === 'space' && spaceAvailable;
    stage.hidden = !space;
    grid.hidden = space;
    $$('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === (space ? 'space' : 'grid'))));
    if (space) { renderer.resize(); renderer.request(); } else renderer?.pause();
  }
  $$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('.skip-link').addEventListener('click', () => setView('grid'));
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.filter;
    filtered = works.filter(work => category === 'all' || work.category === category);
    works.forEach(work => { work.card.hidden = !filtered.includes(work); });
    $$('[data-filter]').forEach(item => {
      item.classList.toggle('is-active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    $('[data-count]').textContent = String(filtered.length).padStart(2, '0');
    $('.gallery-status').textContent = filtered.length ? '' : '这个分类还没有作品。';
    renderer?.arrange(filtered);
  }));
  $('.filters').hidden = false;
  $('.collection-label').hidden = true;

  // Column-major matrices, shared by the renderer and CPU hit testing.
  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
    return out;
  };
  const normalize = vector => { const length = Math.hypot(...vector) || 1; return vector.map(value => value / length); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((value, part, index) => value + part * b[index], 0);
  function viewMatrix(eye, target) {
    const z = normalize(eye.map((value, i) => value - target[i]));
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function perspective(aspect) {
    const f = 1 / Math.tan(Math.PI / 8);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.004, -1, 0, 0, -.2004, 0]);
  }
  function model(x, y, z, width, height, angle = 0, flat = false) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return flat
      ? new Float32Array([width, 0, 0, 0, 0, 0, -height, 0, 0, 1, 0, 0, x, y, z, 1])
      : new Float32Array([c * width, 0, -s * width, 0, 0, height, 0, 0, s, 0, c, 0, x, y, z, 1]);
  }
  function project(matrix, x, y) {
    const w = matrix[3] * x + matrix[7] * y + matrix[15];
    return { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w,
      y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w,
      depth: (matrix[2] * x + matrix[6] * y + matrix[14]) / w, w };
  }
  function inside(point, corners) {
    let positive = false, negative = false;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const side = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      positive ||= side > 0; negative ||= side < 0;
    }
    return !(positive && negative);
  }

  class Exhibition {
    constructor(gl) {
      this.gl = gl;
      this.frame = 0;
      this.textures = new Map();
      this.items = [];
      this.camera = { pan: 0, pitch: 0, zoom: 8.8, x: 0, y: 0 };
      this.target = { ...this.camera };
      this.width = Math.max(document.documentElement.clientWidth * .9, 1); this.height = 1;
      this.selection = 0;
      this.pointer = null;
      this.drag = null;
      this.visible = true;
      this.initialize();
      this.arrange(filtered);
      this.bind();
    }
    initialize() {
      const gl = this.gl;
      const shader = (type, source) => {
        const value = gl.createShader(type);
        gl.shaderSource(value, source); gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
        return value;
      };
      const vertex = shader(gl.VERTEX_SHADER, `
        attribute vec3 aPosition;
        attribute vec2 aUV;
        uniform mat4 uMatrix;
        varying vec2 vUV;
        void main(){ vUV=aUV; gl_Position=uMatrix*vec4(aPosition,1.0); }
      `);
      const fragment = shader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying vec2 vUV;
        uniform sampler2D uTexture;
        uniform vec4 uColor;
        uniform float uTextured;
        void main(){
          vec4 tex = texture2D(uTexture,vUV);
          gl_FragColor = mix(vec4(1.0),tex,uTextured)*uColor;
        }
      `);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Unable to link gallery shaders.');
      gl.useProgram(this.program);
      this.positionLocation = gl.getAttribLocation(this.program, 'aPosition');
      this.uvLocation = gl.getAttribLocation(this.program, 'aUV');
      this.matrixLocation = gl.getUniformLocation(this.program, 'uMatrix');
      this.colorLocation = gl.getUniformLocation(this.program, 'uColor');
      this.texturedLocation = gl.getUniformLocation(this.program, 'uTextured');
      gl.uniform1i(gl.getUniformLocation(this.program, 'uTexture'), 0);
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -.5, -.5, 0, 0, 1, .5, -.5, 0, 1, 1, .5, .5, 0, 1, 0,
        -.5, -.5, 0, 0, 1, .5, .5, 0, 1, 0, -.5, .5, 0, 0, 0
      ]), gl.STATIC_DRAW);
      const lines = [];
      for (let i = -35; i <= 35; i++) {
        lines.push(i, -2.25, -30, 0, 0, i, -2.25, 12, 0, 0);
        if (i <= 12) lines.push(-35, -2.25, i, 0, 0, 35, -2.25, i, 0, 0);
      }
      this.floor = gl.createBuffer();
      this.floorCount = lines.length / 5;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.floor);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
      const white = document.createElement('canvas'); white.width = 1; white.height = 1;
      white.getContext('2d').fillRect(0, 0, 1, 1);
      this.white = this.texture(white);
      const shadow = document.createElement('canvas'); shadow.width = 128; shadow.height = 128;
      const ctx = shadow.getContext('2d');
      const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(68,49,73,.24)'); gradient.addColorStop(.45, 'rgba(68,49,73,.1)'); gradient.addColorStop(1, 'rgba(68,49,73,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      this.shadow = this.texture(shadow);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      works.forEach(work => {
        this.textures.set(work, this.artTexture(work));
        const image = new Image();
        if (new URL(work.image).origin !== location.origin) image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (!spaceAvailable || gl.isContextLost()) return;
          try { this.artTexture(work, image, this.textures.get(work)); this.request(); }
          catch { this.artTexture(work, null, this.textures.get(work), true); this.request(); }
        };
        image.onerror = () => {
          if (!spaceAvailable || gl.isContextLost()) return;
          this.artTexture(work, null, this.textures.get(work), true); this.request();
        };
        image.src = work.image;
      });
    }
    texture(source, existing) {
      const gl = this.gl, texture = existing || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return texture;
    }
    artTexture(work, image, existing, failed = false) {
      const art = document.createElement('canvas'); art.width = 640; art.height = 840;
      const ctx = art.getContext('2d');
      ctx.fillStyle = '#faf9f5'; ctx.fillRect(0, 0, 640, 840);
      ctx.fillStyle = '#e6e0eb'; ctx.fillRect(18, 18, 604, 730);
      if (image) {
        // Contain arbitrary aspect ratios without stretching or cropping portfolio work.
        const scale = Math.min(604 / image.naturalWidth, 730 / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        ctx.drawImage(image, 18 + (604 - w) / 2, 18 + (730 - h) / 2, w, h);
      } else {
        ctx.fillStyle = '#8e809a'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(failed ? '图片暂不可用 · 点击查看详情' : 'Loading artwork', 320, 380);
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = '#39313f'; ctx.font = '500 23px sans-serif';
      ctx.fillText(work.title, 24, 785, 490);
      ctx.fillStyle = '#9a90a1'; ctx.font = '14px sans-serif'; ctx.fillText(work.category.toUpperCase(), 24, 813);
      ctx.font = '17px monospace'; ctx.textAlign = 'right'; ctx.fillText(String(work.index + 1).padStart(2, '0'), 612, 790);
      return this.texture(art, existing);
    }
    arrange(list) {
      this.items = list.map((work, i) => {
        const column = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? -1 : 1);
        return { work, x: column * 3.05, y: i === 0 ? .15 : [.15, .4, -.05, .55][i % 4],
          z: i === 0 ? .65 : [-.8, -.8, -.35, -1.55][i % 4], angle: column * -.11, corners: null };
      });
      this.selection = 0;
      this.reset();
      this.caption(list[0]);
    }
    caption(work) {
      if (!work) { $('.stage-caption').hidden = true; return; }
      $('.stage-caption').hidden = false;
      $('[data-hover-number]').textContent = String(work.index + 1).padStart(2, '0');
      $('[data-hover-title]').textContent = work.title;
      $('[data-hover-category]').textContent = `${work.category}${work.demo ? ' / 示例展品' : ''}`;
    }
    reset() {
      this.selection = 0;
      this.hover = null;
      this.pointer = null;
      this.caption(this.items[0]?.work);
      this.target = { pan: 0, pitch: 0, zoom: this.width < 650 ? 11.8 : 8.8, x: 0, y: 0 };
      if (reducedMotion.matches) this.camera = { ...this.target };
      this.request();
    }
    resize() {
      if (stage.hidden) return;
      const rect = canvas.getBoundingClientRect();
      this.width = Math.max(rect.width, 1); this.height = Math.max(rect.height, 1);
      const ratio = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(this.width * ratio); canvas.height = Math.round(this.height * ratio);
      this.gl.viewport(0, 0, canvas.width, canvas.height);
      this.request();
    }
    bindBuffer(buffer) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(this.positionLocation); gl.enableVertexAttribArray(this.uvLocation);
      gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 20, 12);
    }
    draw(matrix, texture, color) {
      const gl = this.gl;
      gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
      gl.uniform4fv(this.colorLocation, color || [1, 1, 1, 1]);
      gl.uniform1f(this.texturedLocation, texture ? 1 : 0);
      gl.bindTexture(gl.TEXTURE_2D, texture || this.white);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    render() {
      this.frame = 0;
      if (stage.hidden || document.hidden || dialog.open || !this.visible || !spaceAvailable) return;
      let moving = false;
      for (const key of Object.keys(this.camera)) {
        const difference = this.target[key] - this.camera[key];
        if (Math.abs(difference) > .0005) moving = true;
        this.camera[key] += difference * (reducedMotion.matches ? 1 : .09);
      }
      const c = this.camera;
      const view = viewMatrix([c.pan + c.x * 1.4, 1.05 + c.y * .6 + c.pitch, c.zoom], [c.pan + c.x * .2, -.03 + c.y * .12 + c.pitch * .3, 0]);
      const vp = multiply(perspective(this.width / this.height), view);
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.bindBuffer(this.floor);
      gl.uniformMatrix4fv(this.matrixLocation, false, vp);
      gl.uniform4fv(this.colorLocation, [.62, .57, .66, .105]);
      gl.uniform1f(this.texturedLocation, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.drawArrays(gl.LINES, 0, this.floorCount);
      this.bindBuffer(this.quad);
      gl.depthMask(false);
      for (const item of this.items) this.draw(multiply(vp, model(item.x + .15, -2.24, item.z, 3.9, 3.1, 0, true)), this.shadow);
      gl.depthMask(true);
      for (const item of this.items) {
        const selected = this.hover === item || (document.activeElement === canvas && this.items[this.selection] === item);
        const width = 2.38, height = 3.124;
        const front = model(item.x, item.y, item.z, width, height, item.angle);
        // Two offset backing planes lend each floating frame a physical edge.
        this.draw(multiply(vp, model(item.x + .027, item.y - .027, item.z - .075, width + .07, height + .07, item.angle)), null, [.72, .69, .73, 1]);
        this.draw(multiply(vp, model(item.x, item.y, item.z - .01, width + .035, height + .035, item.angle)), null, selected ? [.64, .51, .79, 1] : [.92, .9, .91, 1]);
        const matrix = multiply(vp, front);
        this.draw(matrix, this.textures.get(item.work));
        item.corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => project(matrix, x, y));
      }
      if (this.pointer && !this.drag) this.pick(this.pointer);
      if (moving) this.request();
    }
    pick(point) {
      const candidates = this.items.filter(item => item.corners?.every(corner => corner.w > 0) && inside(point, item.corners));
      candidates.sort((a, b) => a.corners.reduce((sum, corner) => sum + corner.depth, 0) - b.corners.reduce((sum, corner) => sum + corner.depth, 0));
      const previous = this.hover;
      this.hover = candidates[0] || null;
      if (this.hover) this.caption(this.hover.work);
      canvas.style.cursor = this.hover ? 'pointer' : 'grab';
      if (previous !== this.hover) this.request();
      return this.hover;
    }
    panBounds(value) {
      const positions = this.items.map(item => item.x);
      return clamp(value, Math.min(0, ...positions) - .6, Math.max(0, ...positions) + .6);
    }
    zoom(amount) { this.target.zoom = clamp(this.target.zoom + amount, 6.5, 17); this.request(); }
    bind() {
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || this.drag) return;
        canvas.setPointerCapture(event.pointerId);
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: this.target.pan, pitch: this.target.pitch, distance: 0 };
        canvas.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove', event => {
        const rect = canvas.getBoundingClientRect();
        this.pointer = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 };
        if (this.drag && this.drag.id === event.pointerId) {
          const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
          this.drag.distance = Math.max(this.drag.distance, Math.hypot(dx, dy));
          this.target.pan = this.panBounds(this.drag.pan - dx / this.height * this.target.zoom * .8);
          this.target.pitch = clamp(this.drag.pitch + dy / this.height * 3, -.8, 1.1);
        } else if (!reducedMotion.matches && event.pointerType === 'mouse') {
          this.target.x = this.pointer.x; this.target.y = this.pointer.y;
        }
        this.request();
      });
      canvas.addEventListener('pointerup', event => {
        if (!this.drag || this.drag.id !== event.pointerId) return;
        const click = this.drag.distance < 6;
        this.drag = null;
        canvas.classList.remove('is-dragging');
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (click) {
          const rect = canvas.getBoundingClientRect();
          const item = this.pick({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 });
          if (item) openWork(item.work);
        }
        this.request();
      });
      const cancelDrag = () => { this.drag = null; canvas.classList.remove('is-dragging'); this.request(); };
      canvas.addEventListener('pointercancel', cancelDrag);
      canvas.addEventListener('lostpointercapture', cancelDrag);
      canvas.addEventListener('pointerleave', () => {
        if (this.drag) return;
        this.pointer = null; this.hover = null; this.target.x = 0; this.target.y = 0; this.request();
      });
      canvas.addEventListener('wheel', event => {
        event.preventDefault();
        const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          this.target.pan = this.panBounds(this.target.pan + (event.deltaX || event.deltaY) * multiplier * .012);
          this.request();
        } else this.zoom(event.deltaY * multiplier * .007);
      }, { passive: false });
      canvas.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home', '+', '=', '-', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
        if (event.key === 'Home') this.reset();
        if (['+', '=', 'ArrowUp'].includes(event.key)) this.zoom(-.8);
        if (['-', 'ArrowDown'].includes(event.key)) this.zoom(.8);
        if (!this.items.length) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          this.selection = (this.selection + (event.key === 'ArrowLeft' ? -1 : 1) + this.items.length) % this.items.length;
          const item = this.items[this.selection];
          this.target.pan = item.x; this.target.x = 0; this.pointer = null;
          this.caption(item.work); this.request();
          $('.gallery-status').textContent = `${item.work.title}，按回车查看作品。`;
        }
        if (event.key === 'Enter' || event.key === ' ') openWork(this.items[this.selection].work);
      });
      canvas.addEventListener('focus', () => this.request());
      canvas.addEventListener('blur', () => this.request());
      $('[data-reset]').addEventListener('click', () => this.reset());
      $$('[data-zoom]').forEach(button => button.addEventListener('click', () => this.zoom(button.dataset.zoom === 'in' ? -1 : 1)));
      new ResizeObserver(() => this.resize()).observe(stage);
      new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        if (this.visible) this.request(); else this.pause();
      }).observe(stage);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); else this.request(); });
      reducedMotion.addEventListener('change', () => {
        this.target.x = 0; this.target.y = 0; this.request();
      });
      window.addEventListener('pagehide', () => this.pause());
      window.addEventListener('pageshow', () => this.request());
    }
    request() {
      if (!this.frame && !stage.hidden && !document.hidden && !dialog.open && this.visible && spaceAvailable) {
        this.frame = requestAnimationFrame(() => this.render());
      }
    }
    pause() { cancelAnimationFrame(this.frame); this.frame = 0; }
    dispose() {
      this.pause();
      const gl = this.gl;
      this.textures.forEach(texture => gl.deleteTexture(texture));
      gl.deleteTexture(this.shadow); gl.deleteTexture(this.white);
      gl.deleteBuffer(this.quad); gl.deleteBuffer(this.floor); gl.deleteProgram(this.program);
    }
  }

  function fallback(message) {
    spaceAvailable = false;
    setView('grid');
    $('.view-switch').hidden = true;
    $('.gallery-status').textContent = message;
    renderer?.dispose();
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallback('3D 展厅暂时不可用，已切换为网格浏览。刷新页面可重试。');
  });
  if (!works.length) return;
  try {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL unavailable');
    spaceAvailable = true;
    renderer = new Exhibition(gl);
    $('.view-switch').hidden = false;
    // Motion-sensitive visitors begin with an equally complete, still view.
    setView(reducedMotion.matches ? 'grid' : 'space');
  } catch (error) {
    fallback('当前浏览器无法开启 3D 展厅，作品已切换为网格展示。');
    console.info('Gallery uses its HTML fallback:', error.message);
  }
})();
