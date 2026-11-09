/* Кирпичный техцентр с красной машинкой на крыше заводится. Чистый WebGL, без библиотек, открывается двойным кликом. */
(function () {
  var cv = document.getElementById('gl3d');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.G3 = { set: function () {}, scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };


  /* ---------- общие детали: коробка, тело вращения, тор ---------- */
  Geo.prototype.box = function (w, h, d, m, M) {
    M = M || ident(); var x = w / 2, y = h / 2, z = d / 2, self = this;
    [[[1, 0, 0], [x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]], [[-1, 0, 0], [-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]],
     [[0, 1, 0], [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]], [[0, -1, 0], [-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]],
     [[0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [[0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]].forEach(function (f) {
      var n = f[0], q = f.slice(1).map(function (p) { return [[p[0], p[1], p[2], m], n]; });
      self.tri(q[0], q[1], q[2], M); self.tri(q[0], q[2], q[3], M);
    });
    return this;
  };
  function profAt(prof, v) {
    var f = v * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), t = f - i;
    return [prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t];
  }
  Geo.prototype.lathe = function (prof, seg, m, M, a0, a1) {
    a0 = a0 || 0; a1 = a1 === undefined ? 2 * PI : a1;
    this.surf(function (u, v) { var a = a0 + u * (a1 - a0), p = profAt(prof, v); return [Math.cos(a) * p[0], p[1], Math.sin(a) * p[0], typeof m === 'function' ? m(u, v) : m]; }, seg, (prof.length - 1) * 2, M);
    return this;
  };
  Geo.prototype.torus = function (R, r, nu, nv, m, M) {
    this.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, k = R + r * Math.cos(b); return [Math.cos(a) * k, r * Math.sin(b), Math.sin(a) * k, m]; }, nu, nv, M);
    return this;
  };
  Geo.prototype.tube = function (path, r, nu, nv, m, M) { // path(t) -> [x,y,z]
    this.surf(function (u, v) {
      var p = path(v), q = path(Math.min(1, v + .01)), p0 = path(Math.max(0, v - .01)), t = norm([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]);
      var up = Math.abs(t[1]) < .9 ? [0, 1, 0] : [1, 0, 0], a = norm(cross(t, up)), b = cross(t, a), w = u * 2 * PI, rr = typeof r === 'function' ? r(v) : r;
      return [p[0] + (a[0] * Math.cos(w) + b[0] * Math.sin(w)) * rr, p[1] + (a[1] * Math.cos(w) + b[1] * Math.sin(w)) * rr, p[2] + (a[2] * Math.cos(w) + b[2] * Math.sin(w)) * rr, m];
    }, nu, nv, M);
    return this;
  };
  function geo() { return new Geo(); }

  /* ---------- свет: рассеянный, блик, отражение неба для металла, кромка ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'uniform vec3 uE;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uGlow;uniform vec3 uL;uniform vec3 uSky;uniform vec3 uGnd;uniform float uFade;uniform float uMet;uniform float uRough;uniform float uA;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;vec3 L=normalize(uL);vec3 H=normalize(L+V);' +
    'vec3 base=mix(uC1,uC2,clamp(vM,0.,1.));float d=max(dot(N,L),0.);float fill=max(dot(N,normalize(vec3(-.7,.25,.55))),0.)*.28;' +
    'float sp=pow(max(dot(N,H),0.),mix(140.,10.,uRough));vec3 R=reflect(-V,N);' +
    'vec3 env=mix(uGnd,uSky,smoothstep(-.35,.65,R.y))+vec3(pow(max(dot(R,L),0.),30.))*.9;float fr=pow(1.-max(dot(N,V),0.),3.);' +
    'vec3 dif=base*(.2+d*.82+fill)+vec3(sp)*.3*(1.-uRough);vec3 met=base*(env*1.05+.08)+vec3(sp)*(1.3-uRough);' +
    'vec3 c=mix(dif,met,uMet)+fr*mix(uSky,base,.4)*.3+uGlow;gl_FragColor=vec4(min(c,vec3(1.2))*uFade*uA,uFade*uA);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uE', 'uC1', 'uC2', 'uGlow', 'uL', 'uSky', 'uGnd', 'uFade', 'uMet', 'uRough', 'uA'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });
  var ZERO = [0, 0, 0];
  /* mat: {c1, c2, met, rough, glow, a} */
  function draw(buf, W, mat) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, mat.c1); gl.uniform3fv(U.uC2, mat.c2 || mat.c1);
    gl.uniform1f(U.uMet, mat.met || 0); gl.uniform1f(U.uRough, mat.rough === undefined ? .5 : mat.rough); gl.uniform3fv(U.uGlow, mat.glow || ZERO);
    gl.uniform1f(U.uA, mat.a === undefined ? 1 : mat.a);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

  /* ---------- холст, указатель, камера, цикл кадров ---------- */
  var W = 0, H = 0, mx = 0, my = 0, tmx = 0, tmy = 0, drag = false, lx = 0, spin = 0, spinV = 0;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  cv.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - lx; lx = e.clientX; spin += dx * .01; spinV = dx * .6; kick(); });
  function up() { drag = false; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function camera(az, el, dist, tg, fov, light, sky, gnd) {
    var asp = W / H, eye = [tg[0] + Math.sin(az) * Math.cos(el) * dist, tg[1] + Math.sin(el) * dist, tg[2] + Math.cos(az) * Math.cos(el) * dist];
    var VP = mul(persp(fov || .6, asp, .1, 80), lookAt(eye, tg));
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3fv(U.uE, eye); gl.uniform3fv(U.uL, light || [.5, .8, .6]);
    gl.uniform3fv(U.uSky, sky || [.85, .88, .95]); gl.uniform3fv(U.uGnd, gnd || [.12, .12, .14]);
    return { VP: VP, eye: eye, asp: asp };
  }
  var live = true, last = 0, fade = 0, time = 0, pending = false, STEP = null, RENDER = null;
  function begin(alpha) { if (!W) resize(); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(U.uFade, fade); }
  function stepAll(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 2.5));
    mx += (tmx - mx) * k; my += (tmy - my) * k;
    if (!drag) { spinV *= Math.exp(-dt * 2.5); spin += spinV * dt; }
    if (STEP) STEP(dt);
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    stepAll(dt); RENDER();
    if (live) requestAnimationFrame(frame);
  }
  function kick() {
    if (!reduce || pending || !RENDER) return; pending = true;
    requestAnimationFrame(function () { pending = false; for (var i = 0; i < 40; i++) stepAll(.05); RENDER(); });
  }
  addEventListener('resize', function () { resize(); kick(); });
  function run(step, render, api) {
    STEP = step; RENDER = render;
    api.live = function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame); } };
    window.G3 = api; resize();
    if (reduce) { fade = 1; kick(); live = false; } else requestAnimationFrame(frame);
  }

  /* ---------- кирпичный техцентр с черепичной крышей и красной машинкой наверху; «Завести» – фары загораются, машинка вздрагивает, из трубы облачка ---------- */
  function se(c, n) { return (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n); }
  function endK(z, z0, len) { var e = Math.min(1, Math.max(0, Math.abs(z) - z0) / len); return Math.pow(1 - Math.pow(e, 2.4), 1 / 2.4); }
  var cube = geo().box(1, 1, 1, 0).upload();
  /* стена с кирпичной кладкой: m = 1 – шов */
  function wall(w, h) {
    var g = geo(); g.surf(function (u, v) {
      var x = (u - .5) * w, y = v * h, row = Math.floor(y / .12), xx = x / .26 + (row % 2) * .5;
      var seam = (y / .12 % 1) < .14 || (xx % 1 + 1) % 1 < .07 ? 1 : 0;
      return [x, y, 0, seam];
    }, Math.round(w / .26 * 4), Math.round(h / .12 * 3));
    return g.upload();
  }
  var wF = wall(4.2, 1.7), wS = wall(2.6, 1.7);
  /* скат крыши с рядами черепицы */
  var roofP = geo(); roofP.surf(function (u, v) { var x = (u - .5) * 4.6, s = v * 1.62, wav = Math.sin(u * PI * 46) * .018; return [x, s * .52 + wav * 0, -s * .86 + Math.abs(wav), (s / .18 % 1) > .78 ? 1 : 0]; }, 92, 36); roofP = roofP.upload();
  /* фронтон */
  var gable = geo(); gable.surf(function (u, v) { var x = (u - .5) * 2 * 1.42 * (1 - v), y = v * .82; return [x, y, 0, 0]; }, 8, 4); gable = gable.upload();
  /* машинка: короткий круглый кузов */
  var body = geo(); body.surf(function (u, v) {
    var t = u * 2 * PI, z = -.82 + v * 1.64, k = endK(z, .5, .34), a = .4 * (.6 + .4 * k), b = .2 * (.45 + .55 * k);
    return [se(Math.cos(t), 3.2) * a, .32 + se(Math.sin(t), 3) * b, z, 0];
  }, 44, 32); body = body.upload();
  var cab = geo(); cab.surf(function (u, v) {
    var t = u * 2 * PI, z = -.5 + v * .86, k = endK(z + .07, .22, .24), s = Math.sin(t), y = .58 + se(s, 3) * .2 * (.4 + .6 * k);
    return [se(Math.cos(t), 3) * .36 * (.7 + .3 * k), y, z, y > .52 && y < .74 ? 1 : 0];
  }, 40, 28); cab = cab.upload();
  var tyre = geo(); tyre.torus(.11, .055, 28, 12, 0); tyre = tyre.upload();
  var lamp = geo(); lamp.lathe([[0, .03], [.05, .028], [.065, .01], [.07, -.01]], 20, 0); lamp = lamp.upload();
  var puff = geo(); puff.lathe((function () { var p = []; for (var i = 0; i <= 10; i++) { var a = -PI / 2 + PI * i / 10; p.push([Math.cos(a) * .1 + 1e-4, Math.sin(a) * .1]); } return p; })(), 16, 0); puff = puff.upload();
  var disc = geo(); disc.lathe([[0, 0], [1, 0]], 64, 0); disc = disc.upload();

  var BRICK = { c1: hex('#b5442e'), c2: hex('#e9d6bf'), rough: .85 };
  var TILE = { c1: hex('#c6362a'), c2: hex('#7d1d15'), rough: .55, met: .05 };
  var NAVY = { c1: hex('#1d2a5c'), rough: .4 };
  var GATE = { c1: hex('#2456b8'), c2: hex('#183c85'), rough: .45, met: .2 };
  var GLASS = { c1: hex('#2b3a4f'), c2: hex('#111a26'), rough: .1, met: .5 };
  var CREAM = { c1: hex('#f4ead8'), rough: .6 };
  var PAINT = { c1: hex('#d92b23'), c2: hex('#1a1f29'), rough: .2, met: .35 };
  var T = 0, scr = 0, scrT = 0, on = 0, ont = 0, kickT = 9, puffs = [], pt = 0;
  function sm(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  function step(dt) {
    scr += (scrT - scr) * (1 - Math.exp(-dt * 6));
    on += (ont - on) * (reduce ? 1 : 1 - Math.exp(-dt * (ont ? 4 : 2)));
    if (!reduce) { T += dt; kickT += dt; }
    if (ont && !reduce) { pt -= dt; if (pt <= 0) { pt = kickT < 1 ? .12 : .45; puffs.push({ t: 0, s: kickT < 1 ? 1.4 : 1, x: (Math.random() - .5) * .05 }); } }
    for (var i = puffs.length - 1; i >= 0; i--) { puffs[i].t += dt; if (puffs[i].t > 1.6) puffs.splice(i, 1); }
  }
  function render() {
    if (!W) resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(U.uFade, fade);
    var wide = W / H > 1.1;
    camera(.62 + mx * .45 + spin + Math.sin(T * .17) * .06, .2 + my * .12 + scr * .12, (wide ? 9.6 : 12) + scr * 1.2, [wide ? .1 : 0, 1.55, 0], .6, [.45, .85, .55], [.98, .95, .9], [.42, .32, .26]);
    /* здание */
    draw(wF, trans(0, 0, 1.3), BRICK);
    draw(wF, chain(trans(0, 0, -1.3), rotY(PI)), BRICK);
    draw(wS, chain(trans(2.1, 0, 0), rotY(PI / 2)), BRICK);
    draw(wS, chain(trans(-2.1, 0, 0), rotY(-PI / 2)), BRICK);
    draw(cube, chain(trans(0, .85, 0), scl(4.16, 1.68, 2.56)), { c1: hex('#7a2a1d'), rough: .9 });
    /* ворота, окна, вывеска */
    draw(cube, chain(trans(1.05, .55, 1.32), scl(1.15, 1.1, .05)), GATE);
    for (var g = 0; g < 7; g++) draw(cube, chain(trans(1.05, .1 + g * .15, 1.35), scl(1.12, .015, .02)), { c1: hex('#163578'), rough: .5 });
    draw(cube, chain(trans(-.75, .72, 1.32), scl(1.25, .62, .05)), GLASS);
    draw(cube, chain(trans(-.75, .72, 1.345), scl(.04, .62, .03)), CREAM);
    draw(cube, chain(trans(-1.72, .5, 1.32), scl(.4, 1, .05)), { c1: hex('#f2f2ee'), rough: .3 });
    draw(cube, chain(trans(-.2, 1.42, 1.34), scl(3.1, .34, .06)), NAVY);
    draw(cube, chain(trans(-.2, 1.42, 1.375), scl(2.9, .07, .02)), CREAM);
    draw(cube, chain(trans(1.05, 1.18, 1.34), scl(1.15, .12, .05)), { c1: hex('#2456b8'), rough: .4 });
    /* крыша */
    draw(roofP, trans(0, 1.7, 1.42), TILE);
    draw(roofP, chain(trans(0, 1.7, -1.42), rotY(PI)), TILE);
    draw(gable, chain(trans(2.1, 1.7, 0), rotY(PI / 2)), BRICK);
    draw(gable, chain(trans(-2.1, 1.7, 0), rotY(-PI / 2)), BRICK);
    draw(cube, chain(trans(0, 2.55, 0), scl(4.62, .08, .1)), { c1: hex('#8f241b'), rough: .5 });
    /* площадка и машинка на коньке */
    draw(cube, chain(trans(-.3, 2.6, 0), scl(1.9, .06, .9)), NAVY);
    var shk = ont ? (Math.max(0, 1 - kickT * 1.4) * .05 + .006) * on : 0;
    var C = chain(trans(-.3, 2.63 + Math.abs(Math.sin(T * 37)) * shk, 0), rotY(PI / 2), rotZ(Math.sin(T * 29) * shk * .6));
    draw(body, C, PAINT);
    draw(cab, C, { c1: hex('#d92b23'), c2: hex('#1a2230'), rough: .15, met: .4 });
    draw(cube, chain(C, trans(0, .2, .84), scl(.7, .06, .05)), { c1: hex('#e1e5e8'), rough: .1, met: 1 });
    draw(cube, chain(C, trans(0, .2, -.84), scl(.7, .06, .05)), { c1: hex('#e1e5e8'), rough: .1, met: 1 });
    for (var h = -1; h <= 1; h += 2) {
      draw(lamp, chain(C, trans(h * .25, .36, .8), rotX(PI / 2)), { c1: hex('#fff3d0'), rough: .1, glow: [1.1 * on + .08, 1 * on + .07, .55 * on + .04] });
      draw(cube, chain(C, trans(h * .26, .34, -.81), scl(.12, .07, .03)), { c1: hex('#a3160f'), rough: .2, glow: [.5 * on, .03 * on, .02 * on] });
      for (var f = -1; f <= 1; f += 2) draw(tyre, chain(C, trans(h * .36, .13, f * .5), rotZ(PI / 2)), { c1: hex('#1b1b1d'), rough: .8 });
    }
    /* земля */
    draw(disc, chain(trans(0, -.02, 0), scl(4.4, 1, 3.4)), { c1: hex('#d9c9ae'), rough: .95 });
    gl.enable(gl.BLEND); gl.depthMask(false);
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i], q = p.t / 1.6;
      draw(puff, chain(C, trans(-.18 + p.x, .14 + q * .5, -.88 - q * .9), scl(p.s * (.6 + q * 2.4), p.s * (.6 + q * 2.2), p.s * (.6 + q * 2.4))), { c1: hex('#e9e6e1'), rough: 1, glow: [.15, .15, .15], a: .45 * (1 - q) });
    }
    draw(disc, chain(trans(0, 0, 0), scl(3, 1, 2.1)), { c1: hex('#000000'), a: .12 });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  run(step, render, {
    scroll: function (p) { scrT = p; kick(); },
    set: function (k, v) { if (k === 'start') { ont = v ? 1 : 0; if (v) kickT = 0; pt = 0; if (!v) puffs = []; kick(); } }
  });
})();
