import * as THREE from "../../node_modules/three/build/three.module.js";
import { createNoise3D } from "../../node_modules/simplex-noise/dist/esm/simplex-noise.js";
import {
  DEFAULT_PET_SCALE,
  clampSqueezeRaw,
  resolveSqueezeScaleTarget
} from "../shared/squeeze-scale.mjs";

const STATUS_PALETTES = {
  Disconnected: ["#f1d8d8", "#d7dce8", "#d9cde2", "#ebdfd9"],
  Idle: ["#dfe6ff", "#d5e0ff", "#d9d0ff", "#eef1ff"],
  Ready: ["#d7e4ff", "#cad8ff", "#d9d3ff", "#edf1ff"],
  Support: ["#d8e3ff", "#d5d6ff", "#d0e1ff", "#eef1ff"],
  Focusing: ["#cfe6ff", "#c9dcff", "#d8d9ff", "#ebefff"],
  Away: ["#d8dfef", "#ccd3e6", "#d7d7e9", "#ecedf6"],
  Completed: ["#ffe4a7", "#ffd0a8", "#fff1ba", "#ffe6c9"]
};

const STATUS_MOTION = {
  Disconnected: {
    floatStrength: 0.024,
    floatDamping: 0.968,
    bobbingSpeed: 0.0012,
    bobbingRange: 0.22,
    noiseSpeed: 0.00055,
    noiseStrength: 0.08,
    deformImpact: 1.2,
    alpha: 0.78
  },
  Idle: {
    floatStrength: 0.042,
    floatDamping: 0.956,
    bobbingSpeed: 0.00135,
    bobbingRange: 0.56,
    noiseSpeed: 0.0007,
    noiseStrength: 0.13,
    deformImpact: 1.8,
    alpha: 1
  },
  Ready: {
    floatStrength: 0.046,
    floatDamping: 0.952,
    bobbingSpeed: 0.00155,
    bobbingRange: 0.64,
    noiseSpeed: 0.00078,
    noiseStrength: 0.145,
    deformImpact: 1.95,
    alpha: 1
  },
  Support: {
    floatStrength: 0.036,
    floatDamping: 0.96,
    bobbingSpeed: 0.00112,
    bobbingRange: 0.4,
    noiseSpeed: 0.00062,
    noiseStrength: 0.12,
    deformImpact: 1.55,
    alpha: 0.96
  },
  Focusing: {
    floatStrength: 0.028,
    floatDamping: 0.972,
    bobbingSpeed: 0.00095,
    bobbingRange: 0.2,
    noiseSpeed: 0.00056,
    noiseStrength: 0.072,
    deformImpact: 1.35,
    alpha: 0.98
  },
  Away: {
    floatStrength: 0.02,
    floatDamping: 0.972,
    bobbingSpeed: 0.00095,
    bobbingRange: 0.14,
    noiseSpeed: 0.0005,
    noiseStrength: 0.045,
    deformImpact: 1.1,
    alpha: 0.88
  },
  Completed: {
    floatStrength: 0.054,
    floatDamping: 0.948,
    bobbingSpeed: 0.0019,
    bobbingRange: 0.78,
    noiseSpeed: 0.00092,
    noiseStrength: 0.17,
    deformImpact: 2.05,
    alpha: 1
  }
};

const SQUEEZE_ACCENTS = {
  steady: ["#d7e2ff", "#e6dcff", "#dbe7ff", "#efe9ff"],
  active: ["#d6ddff", "#d7f0ff", "#e4dcff", "#dce6ff"],
  intense: ["#cfd8ff", "#ddd1ff", "#dce5ff", "#e6dbff"]
};

class RoviaBlobController {
  constructor(root) {
    this.root = root;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.blob = null;
    this.frameId = 0;
    this.isDragging = false;
    this.pointer = new THREE.Vector2();
    this.targetMouse = new THREE.Vector2();
    this.currentPos = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.noise3D = createNoise3D();
    this.status = "Idle";
    this.baseColors = this.createColorSet("Idle");
    this.targetColors = this.createColorSet("Idle");
    this.currentColors = this.createColorSet("Idle");
    this.squeezeActivity = 0;
    this.squeezePressureRaw = 0;
    this.previousSqueezePressureRaw = null;
    this.lastSqueezeChangedAt = 0;
    this.currentSqueezeScale = DEFAULT_PET_SCALE;
    this.squeezeRegulation = "steady";
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.init();
  }

  createColorSet(status) {
    const palette = STATUS_PALETTES[status] || STATUS_PALETTES.Idle;
    return palette.map((value) => new THREE.Color(value));
  }

  init() {
    const width = this.root.clientWidth || 140;
    const height = this.root.clientHeight || 140;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    this.camera.position.z = 7.2;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.root.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    this.scene.add(ambient);

    const keyLight = new THREE.PointLight(0xffffff, 1.8, 100);
    keyLight.position.set(6, 7, 10);
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xbfd9ff, 0.8, 100);
    fillLight.position.set(-7, -4, 8);
    this.scene.add(fillLight);

    this.createBlob();
    this.addListeners();
    this.animate();
  }

  createBlob() {
    const geometry = new THREE.SphereGeometry(2.2, 100, 100);
    geometry.userData.origPos = geometry.attributes.position.array.slice();

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: this.currentColors[0].clone() },
        uColor2: { value: this.currentColors[1].clone() },
        uColor3: { value: this.currentColors[2].clone() },
        uColor4: { value: this.currentColors[3].clone() },
        uAlpha: { value: 1 }
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
        uniform float uAlpha;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec3 uColor4;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          vec3 lightDir = normalize(vec3(-0.45, 0.72, 0.52));

          float fTerm = 1.0 - max(0.0, dot(normal, viewDir));
          float fresnel = pow(fTerm, 2.1);
          float rim = pow(fTerm, 3.6);
          float diffuse = max(0.0, dot(normal, lightDir));
          float specular = pow(max(0.0, dot(reflect(-lightDir, normal), viewDir)), 14.0);
          float softSpecular = pow(max(0.0, dot(reflect(-lightDir, normal), viewDir)), 5.2);

          float iridescencePhase = fTerm * 3.5;
          float t = uTime * 0.4;

          vec3 c1 = mix(uColor1, uColor2, sin(vUv.x * 4.0 + t + iridescencePhase) * 0.5 + 0.5);
          vec3 c2 = mix(uColor3, uColor4, cos(vUv.y * 4.0 - t - iridescencePhase) * 0.5 + 0.5);
          vec3 baseColor = mix(c1, c2, sin(t * 0.3 + fTerm) * 0.5 + 0.5);

          vec3 pearlSheen = vec3(0.98, 0.97, 1.0);
          vec3 coolSheen = vec3(0.83, 0.88, 1.0);
          vec3 warmLight = vec3(1.0, 0.985, 0.99);
          vec3 skinColor = mix(baseColor, pearlSheen, fresnel * 0.58);
          skinColor += coolSheen * rim * 0.12;
          skinColor += warmLight * specular * 0.22;
          skinColor += pearlSheen * softSpecular * 0.08;
          skinColor += baseColor * diffuse * 0.045;

          float topGlow = smoothstep(0.14, 0.88, vUv.y) * 0.12;
          float sideGloss = smoothstep(0.0, 0.35, 1.0 - abs(vUv.x - 0.5) * 2.0) * 0.035;
          skinColor += vec3(0.95, 0.96, 1.0) * topGlow;
          skinColor += vec3(0.82, 0.87, 1.0) * sideGloss;
          skinColor = clamp(skinColor, 0.0, 1.0);

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
          vec3 finalColor = mix(vec3(0.09, 0.10, 0.13), skinColor, eyeMask);

          gl_FragColor = vec4(finalColor, uAlpha);
        }
      `
    });

    this.blob = new THREE.Mesh(geometry, material);
    this.scene.add(this.blob);
  }

  addListeners() {
    this.root.addEventListener("pointerdown", (event) => {
      this.isDragging = true;
      this.handlePointerMove(event);
      this.root.setPointerCapture(event.pointerId);
    });

    this.root.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("resize", this.handleResize);
  }

  handlePointerMove(event) {
    const rect = this.root.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.targetMouse.set(x, y);
  }

  handlePointerUp() {
    this.isDragging = false;
  }

  handleResize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = this.root.clientWidth || 140;
    const height = this.root.clientHeight || 140;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateColors() {
    const accentPalette = SQUEEZE_ACCENTS[this.squeezeRegulation] || SQUEEZE_ACCENTS.steady;
    this.targetColors = this.baseColors.map((color, index) =>
      color.clone().lerp(new THREE.Color(accentPalette[index]), this.squeezeActivity * 0.56)
    );

    const uniforms = this.blob.material.uniforms;
    for (let index = 0; index < this.currentColors.length; index += 1) {
      this.currentColors[index].lerp(this.targetColors[index], 0.08);
      uniforms[`uColor${index + 1}`].value.copy(this.currentColors[index]);
    }
  }

  updateMotion(time) {
    const motion = STATUS_MOTION[this.status] || STATUS_MOTION.Idle;
    const now = performance.now();
    const squeezeBoost = 1 + this.squeezeActivity * (this.squeezeRegulation === "intense" ? 0.48 : 0.26);
    const bobbingY =
      Math.sin(now * motion.bobbingSpeed * squeezeBoost) *
      (motion.bobbingRange * (1 + this.squeezeActivity * 0.32));
    const bobbingX =
      Math.cos(now * motion.bobbingSpeed * 0.8 * squeezeBoost) *
      (motion.bobbingRange * (0.6 + this.squeezeActivity * 0.18));

    this.pointer.lerp(this.targetMouse, this.isDragging ? 0.28 : 0.1);

    if (this.isDragging) {
      const dragTarget = new THREE.Vector3(this.pointer.x * 6, this.pointer.y * 4, 0);
      this.velocity.add(dragTarget.sub(this.currentPos).multiplyScalar(0.075));
    } else {
      const homeTarget = new THREE.Vector3(bobbingX, bobbingY, 0);
      this.velocity.add(
        homeTarget
          .sub(this.currentPos)
          .multiplyScalar(motion.floatStrength * (1 + this.squeezeActivity * 0.2))
      );
    }

    this.velocity.multiplyScalar(motion.floatDamping);
    this.currentPos.add(this.velocity);

    this.blob.position.copy(this.currentPos);
    this.blob.rotation.z = this.velocity.x * 0.3;
    this.blob.rotation.x = -this.velocity.y * 0.3;
    this.blob.rotation.y =
      Math.sin(time * (0.6 + this.squeezeActivity * 0.5)) *
      (0.035 + this.squeezeActivity * 0.024);
    const squeezeScaleTarget = resolveSqueezeScaleTarget({
      pressureRaw: this.squeezePressureRaw,
      lastChangedAt: this.lastSqueezeChangedAt,
      nowMs: now
    });
    this.currentSqueezeScale +=
      (squeezeScaleTarget - this.currentSqueezeScale) * 0.12;
    const scalePulse =
      1 +
      Math.sin(time * (2.2 + this.squeezeActivity * 3.6)) *
        (0.009 + this.squeezeActivity * 0.024);
    this.blob.scale.setScalar(scalePulse * this.currentSqueezeScale);
  }

  updateSurface(time) {
    const motion = STATUS_MOTION[this.status] || STATUS_MOTION.Idle;
    const positionAttr = this.blob.geometry.attributes.position;
    const orig = this.blob.geometry.userData.origPos;
    const surfaceTime = performance.now() * motion.noiseSpeed;

    for (let index = 0; index < positionAttr.count; index += 1) {
      const baseIndex = index * 3;
      const x = orig[baseIndex];
      const y = orig[baseIndex + 1];
      const z = orig[baseIndex + 2];

      const noise =
        this.noise3D(x * 0.45 + surfaceTime, y * 0.45 + surfaceTime, z * 0.45) *
        (motion.noiseStrength * (1 + this.squeezeActivity * 0.46));

      let deformation = 0;
      if (this.isDragging) {
        const worldPoint = new THREE.Vector3(x, y, z).applyMatrix4(
          this.blob.matrixWorld
        );
        const pointerPoint = new THREE.Vector3(this.pointer.x * 6, this.pointer.y * 4, 0);
        const distance = worldPoint.distanceTo(pointerPoint);
        deformation =
          Math.max(0, (4 - distance) * 0.12) * motion.deformImpact;
      }

      const ratio = 1 + noise + deformation;
      positionAttr.setXYZ(index, x * ratio, y * ratio, z * ratio);
    }

    positionAttr.needsUpdate = true;
    this.blob.geometry.computeVertexNormals();
  }

  animate() {
    this.frameId = window.requestAnimationFrame(() => this.animate());

    if (!this.blob) {
      return;
    }

    const time = performance.now() * 0.001;
    this.blob.material.uniforms.uTime.value = time;
    this.updateColors();
    this.updateMotion(time);
    this.updateSurface(time);
    this.renderer.render(this.scene, this.camera);
  }

  setStatus(status) {
    this.status = status;
    this.baseColors = this.createColorSet(status);
    this.targetColors = this.createColorSet(status);
    const motion = STATUS_MOTION[status] || STATUS_MOTION.Idle;
    this.blob.material.uniforms.uAlpha.value = motion.alpha;
  }

  setSqueezeActivity({ ratePerMinute = 0, pressurePercent = 0, pressureRaw = 0 } = {}) {
    const nextActivity = Math.min(
      1,
      Math.max((Number(ratePerMinute) || 0) / 10, (Number(pressurePercent) || 0) / 100)
    );

    this.squeezeActivity = nextActivity;
    const nextRaw = clampSqueezeRaw(pressureRaw);
    if (nextRaw !== this.previousSqueezePressureRaw) {
      this.lastSqueezeChangedAt = performance.now();
      this.previousSqueezePressureRaw = nextRaw;
    }
    this.squeezePressureRaw = nextRaw || 0;
    if ((Number(ratePerMinute) || 0) >= 8 || (Number(pressurePercent) || 0) >= 78) {
      this.squeezeRegulation = "intense";
      return;
    }

    if ((Number(ratePerMinute) || 0) >= 3 || (Number(pressurePercent) || 0) >= 34) {
      this.squeezeRegulation = "active";
      return;
    }

    this.squeezeRegulation = "steady";
  }

  destroy() {
    window.cancelAnimationFrame(this.frameId);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("resize", this.handleResize);
    this.root.replaceChildren();
    this.renderer?.dispose();
    this.blob?.geometry?.dispose();
    this.blob?.material?.dispose();
  }
}

const root = document.getElementById("pet-blob-root");
if (root) {
  window.roviaBlob = new RoviaBlobController(root);
}
