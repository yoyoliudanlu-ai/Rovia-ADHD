import * as THREE from "../../node_modules/three/build/three.module.js";
import { createNoise3D } from "../../node_modules/simplex-noise/dist/esm/simplex-noise.js";

const CONFIG = {
  floatStrength: 0.018,
  floatDamping: 0.925,
  bobbingSpeed: 0.0015,
  bobbingRange: 1.15,
  noiseSpeed: 0.00082,
  noiseStrength: 0.18,
  deformImpact: 1.65,
  separationDist: 3.6,
  separationForce: 0.012
};

const PALETTES = [
  ["#fadadd", "#cde1f5", "#d8c8f0", "#e8f2cc"],
  ["#ffecd2", "#fcb69f", "#ff9a9e", "#fecfef"],
  ["#a1c4fd", "#c2e9fb", "#e0c3fc", "#8ec5fc"],
  ["#d4fc79", "#96e6a1", "#84fab0", "#8fd3f4"],
  ["#fbc2eb", "#a6c1ee", "#fccb90", "#d57eeb"],
  ["#d7e5ff", "#d8d6fb", "#cee8f9", "#eef3ff"]
];

function buildLayouts(count) {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [new THREE.Vector3(0, 0, 0)];
  }

  const layouts = [];
  const orbitX = 4.9;
  const orbitY = 3.2;

  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const ringScale = 0.82 + (index % 3) * 0.08;
    layouts.push(
      new THREE.Vector3(
        Math.cos(angle) * orbitX * ringScale,
        Math.sin(angle) * orbitY * ringScale,
        ((index % 3) - 1) * 0.35
      )
    );
  }

  return layouts;
}

class FluidCharacter {
  constructor({ id, palette, homeOffset, baseGeometry, scene, noise3D }) {
    this.id = id;
    this.homeOffset = homeOffset.clone();
    this.currentPos = homeOffset.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.seed = Math.random() * 1000;
    this.speedMult = 0.82 + Math.random() * 0.34;
    this.noise3D = noise3D;
    this.geometry = baseGeometry.clone();
    this.geometry.userData.origPos = this.geometry.attributes.position.array.slice();
    this.material = this.createMaterial(palette);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.copy(this.currentPos);
    scene.add(this.mesh);
  }

  createMaterial(colors) {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(colors[0]) },
        uColor2: { value: new THREE.Color(colors[1]) },
        uColor3: { value: new THREE.Color(colors[2]) },
        uColor4: { value: new THREE.Color(colors[3]) }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec3 uColor4;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);

          float fTerm = 1.0 - max(0.0, dot(normal, viewDir));
          float fresnel = pow(fTerm, 2.5);
          float iridescencePhase = fTerm * 3.5;
          float t = uTime * 0.4;

          vec3 c1 = mix(uColor1, uColor2, sin(vUv.x * 4.0 + t + iridescencePhase) * 0.5 + 0.5);
          vec3 c2 = mix(uColor3, uColor4, cos(vUv.y * 4.0 - t - iridescencePhase) * 0.5 + 0.5);
          vec3 baseColor = mix(c1, c2, sin(t * 0.3 + fTerm) * 0.5 + 0.5);

          vec3 pearlSheen = vec3(0.98, 0.96, 0.99);
          vec3 skinColor = mix(baseColor, pearlSheen, fresnel * 0.7);

          vec2 leftEyePos = vec2(0.18, 0.55);
          vec2 rightEyePos = vec2(0.28, 0.55);
          float eyeRadius = 0.012;
          float eyeEdge = 0.003;

          vec2 uvL = vUv - leftEyePos;
          uvL.x *= 2.0;
          float dL = length(uvL);

          vec2 uvR = vUv - rightEyePos;
          uvR.x *= 2.0;
          float dR = length(uvR);

          float eyeMask = smoothstep(eyeRadius, eyeRadius + eyeEdge, min(dL, dR));
          vec3 finalColor = mix(vec3(0.1, 0.1, 0.12), skinColor, eyeMask);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });
  }

  updatePhysics(time, allChars, isDragging, dragTarget) {
    if (isDragging) {
      const dragVector = dragTarget
        .clone()
        .add(new THREE.Vector3(Math.sin(this.seed) * 1.35, Math.cos(this.seed) * 1.35, 0));
      this.velocity.add(dragVector.sub(this.currentPos).multiplyScalar(0.038 * this.speedMult));
    } else {
      const bobbingY =
        Math.sin(time * CONFIG.bobbingSpeed * this.speedMult + this.seed) *
        CONFIG.bobbingRange;
      const bobbingX =
        Math.cos(time * CONFIG.bobbingSpeed * 0.78 * this.speedMult + this.seed) *
        (CONFIG.bobbingRange * 0.68);
      const homeTarget = this.homeOffset
        .clone()
        .add(new THREE.Vector3(bobbingX, bobbingY, 0));
      this.velocity.add(homeTarget.sub(this.currentPos).multiplyScalar(CONFIG.floatStrength));
    }

    const separationForce = new THREE.Vector3();
    for (const other of allChars) {
      if (other.id === this.id) {
        continue;
      }

      const diff = this.currentPos.clone().sub(other.currentPos);
      const dist = diff.length();
      if (dist < CONFIG.separationDist && dist > 0.001) {
        diff.normalize();
        separationForce.add(
          diff.multiplyScalar((CONFIG.separationDist - dist) * CONFIG.separationForce)
        );
      }
    }

    this.velocity.add(separationForce);
    this.velocity.multiplyScalar(CONFIG.floatDamping);
    this.currentPos.add(this.velocity);
    this.mesh.position.copy(this.currentPos);
    this.mesh.rotation.z = this.velocity.x * 0.25;
    this.mesh.rotation.x = -this.velocity.y * 0.25;
    this.mesh.rotation.y = Math.sin(time * 0.0004 + this.seed) * 0.08;
  }

  updateSurface(time, isDragging, dragTarget) {
    this.material.uniforms.uTime.value = time * 0.001 + this.seed;

    const t = time * CONFIG.noiseSpeed;
    const posAttr = this.geometry.attributes.position;
    const orig = this.geometry.userData.origPos;

    for (let index = 0; index < posAttr.count; index += 1) {
      const offset = index * 3;
      const x = orig[offset];
      const y = orig[offset + 1];
      const z = orig[offset + 2];

      const noise =
        this.noise3D(
          x * 0.45 + t + this.seed,
          y * 0.45 + t + this.seed,
          z * 0.45
        ) * CONFIG.noiseStrength;

      let deformation = 0;
      if (isDragging) {
        const worldPos = new THREE.Vector3(x, y, z).applyMatrix4(this.mesh.matrixWorld);
        const dist = worldPos.distanceTo(dragTarget);
        deformation = Math.max(0, (3.8 - dist) * 0.11 * CONFIG.deformImpact);
      }

      const ratio = 1 + noise + deformation;
      posAttr.setXYZ(index, x * ratio, y * ratio, z * ratio);
    }

    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  destroy(scene) {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

class RoviaFriendMapController {
  constructor(root) {
    this.root = root;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.baseGeometry = null;
    this.noise3D = createNoise3D();
    this.characters = [];
    this.frameId = 0;
    this.visible = false;
    this.matchCount = 0;
    this.isDragging = false;
    this.targetMouse = new THREE.Vector2(0, 0);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.init();
  }

  init() {
    const width = this.root.clientWidth || 320;
    const height = this.root.clientHeight || 240;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 15;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.opacity = "0";
    this.renderer.domElement.style.transition = "opacity 220ms ease";
    this.root.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(10, 15, 10);
    this.scene.add(pointLight);

    this.baseGeometry = new THREE.SphereGeometry(2, 50, 50);

    this.root.addEventListener("pointerdown", (event) => {
      this.isDragging = true;
      this.handlePointerMove(event);
    });
    this.root.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("resize", this.handleResize);

    this.animate();
  }

  ensureAttached() {
    if (!this.renderer?.domElement) {
      return;
    }

    if (this.renderer.domElement.parentElement !== this.root) {
      this.root.prepend(this.renderer.domElement);
    }
  }

  handlePointerMove(event) {
    const rect = this.root.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
    this.targetMouse.set(x, y);
  }

  handlePointerUp() {
    this.isDragging = false;
  }

  handleResize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    this.ensureAttached();

    const width = this.root.clientWidth || 320;
    const height = this.root.clientHeight || 240;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setVisible(visible) {
    this.visible = visible;
    this.ensureAttached();
    if (this.renderer) {
      this.renderer.domElement.style.opacity = visible ? "1" : "0";
    }
  }

  rebuildCharacters(count) {
    for (const character of this.characters) {
      character.destroy(this.scene);
    }
    this.characters = [];

    const layouts = buildLayouts(count);
    for (let index = 0; index < count; index += 1) {
      this.characters.push(
        new FluidCharacter({
          id: index,
          palette: PALETTES[index % PALETTES.length],
          homeOffset: layouts[index],
          baseGeometry: this.baseGeometry,
          scene: this.scene,
          noise3D: this.noise3D
        })
      );
    }
  }

  setMatchCount(count) {
    const normalized = Math.max(0, Math.min(8, count));
    if (normalized === this.matchCount) {
      this.handleResize();
      return;
    }

    this.matchCount = normalized;
    this.rebuildCharacters(normalized);
    this.handleResize();
  }

  animate() {
    this.frameId = window.requestAnimationFrame(() => this.animate());

    const time = performance.now();
    const dragTarget = new THREE.Vector3(this.targetMouse.x * 8, this.targetMouse.y * 5, 0);

    for (const character of this.characters) {
      character.updatePhysics(time, this.characters, this.isDragging, dragTarget);
      character.updateSurface(time, this.isDragging, dragTarget);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const controllers = new WeakMap();

export function ensureFriendMap(root) {
  if (!root) {
    return null;
  }

  if (!controllers.has(root)) {
    controllers.set(root, new RoviaFriendMapController(root));
  }

  const controller = controllers.get(root);
  controller?.ensureAttached?.();
  return controller;
}
