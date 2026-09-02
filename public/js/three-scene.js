import * as THREE from 'three';

const canvas = document.getElementById('hero-canvas');
if (canvas && window.WebGLRenderingContext) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  function resize() {
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const geo = new THREE.IcosahedronGeometry(1.15, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uNavy:    { value: new THREE.Color('#0e2238') },
      uMid:     { value: new THREE.Color('#1f5d6e') },
      uEmerald: { value: new THREE.Color('#2fa771') },
      uHigh:    { value: new THREE.Color('#a8e9c8') }
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPos;

      float wave(vec3 p, float t) {
        return sin(p.x * 1.4 + t) * 0.5
             + sin(p.y * 1.6 + t * 0.8) * 0.5
             + sin(p.z * 1.2 + t * 1.1) * 0.5;
      }

      void main() {
        vec3 p = position;
        float d = wave(p * 1.3, uTime * 0.35) * 0.06;
        p += normal * d;
        vNormal = normalize(normalMatrix * normal);
        vPos = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uNavy;
      uniform vec3 uMid;
      uniform vec3 uEmerald;
      uniform vec3 uHigh;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPos;

      void main() {
        // vertical gradient navy -> emerald
        float t = clamp((vPos.y + 1.0) * 0.5, 0.0, 1.0);
        vec3 base = mix(uNavy, uEmerald, smoothstep(0.0, 1.0, t));
        base = mix(base, uMid, 0.18);

        // fresnel rim light
        vec3 viewDir = normalize(-vPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);
        base += uHigh * fresnel * 0.55;

        // soft sheen sweep
        float sheen = sin(vPos.x * 2.5 + uTime * 0.6) * 0.5 + 0.5;
        base += vec3(sheen * 0.04);

        gl_FragColor = vec4(base, 1.0);
      }
    `
  });
  const sphere = new THREE.Mesh(geo, mat);
  scene.add(sphere);

  const ringGeo = new THREE.TorusGeometry(1.55, 0.005, 8, 128);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xa8e9c8, transparent: true, opacity: 0.25
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.4;
  scene.add(ring);

  const ring2 = ring.clone();
  ring2.rotation.x = -Math.PI / 3;
  ring2.scale.setScalar(1.18);
  ring2.material = new THREE.MeshBasicMaterial({ color: 0x2fa771, transparent: true, opacity: 0.15 });
  scene.add(ring2);

  const pCount = 36;
  const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 1.7 + Math.random() * 0.6;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xa8e9c8,
    size: 0.024,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 0.6;
    mouse.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 0.6;
  });
  canvas.addEventListener('pointerleave', () => { mouse.tx = 0; mouse.ty = 0; });

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    mat.uniforms.uTime.value = t;

    sphere.rotation.y = t * 0.18;
    sphere.rotation.x = Math.sin(t * 0.4) * 0.12;

    ring.rotation.z = t * 0.08;
    ring2.rotation.z = -t * 0.06;
    points.rotation.y = t * 0.05;

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    camera.position.x = mouse.x * 0.6;
    camera.position.y = -mouse.y * 0.4;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}
