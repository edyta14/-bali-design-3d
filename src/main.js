import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================
// ILLUMINAZIONE
// ============================================================
const LIT = {
    overview: {
        hemisphere:  { sky: 0xffd6b0, ground: 0x8a6040, intensity: 1.8 },
        ambient:     { color: 0xfff8ee, intensity: 1.2 },
        main:        { color: 0xffd4a0, intensity: 3.5, range: 50, pos: [0, 10, 3] },
        fill1:       { color: 0xffe0bb, intensity: 1.2, range: 40, pos: [8, 5, -2] },
        fill2:       { color: 0xffcca8, intensity: 0.95, range: 40, pos: [-8, 4, 6] },
        dir1:        { color: 0xffd8b0, intensity: 2.5, pos: [5, 8, 6] },
        dir2:        { color: 0xffe0cc, intensity: 1.8, pos: [-6, 6, -4] },
        fogColor:    0x0a0806,
        fogDensity:  0.003,
        exposure:    1.45
    },
    detail: {
        hemisphere:  { intensity: 0.5 },
        ambient:     { intensity: 1.6 },
        main:        { intensity: 1.8 },
        direct:      { intensity: 2.0 },
        dir1:        { intensity: 0 },
        dir2:        { intensity: 0 },
        fill1:       { intensity: 0.3 },
        fill2:       { intensity: 0.3 },
        fogDensity:  0
    }
};

// ============================================================
// STATO
// ============================================================
let currentMode   = 'overview';   // 'overview' | 'detail' | 'fulldetail'
let selectedIndex = -1;
let hoveredIndex  = -1;
let products      = [];
const loadedModels = [];

const camTarget = {
    pos:    new THREE.Vector3(0, 7, 11),
    lookAt: new THREE.Vector3(0, 0, 0)
};
const camLookAt = new THREE.Vector3(0, 0, 0);

// ============================================================
// ROTAZIONE MANUALE (fulldetail)
// ============================================================
let isDragging  = false;
let lastMouseX  = 0;
let lastMouseY  = 0;
let orbitTheta  = 0;              // angolo orizzontale
let orbitPhi    = Math.PI / 2.8;  // angolo verticale (dall'asse Y)
const FULL_RADIUS = 7;            // distanza camera dal centro del modello

// ============================================================
// SCENA
// ============================================================
const container = document.getElementById('scene-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(LIT.overview.fogColor);
scene.fog = new THREE.FogExp2(LIT.overview.fogColor, LIT.overview.fogDensity);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.copy(camTarget.pos);
camera.lookAt(camTarget.lookAt);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LIT.overview.exposure;
container.appendChild(renderer.domElement);

// ============================================================
// LUCI
// ============================================================
const hemisphereLight = new THREE.HemisphereLight(
    LIT.overview.hemisphere.sky,
    LIT.overview.hemisphere.ground,
    LIT.overview.hemisphere.intensity
);
hemisphereLight.position.set(0, 10, 0);
scene.add(hemisphereLight);

const ambientLight = new THREE.AmbientLight(LIT.overview.ambient.color, LIT.overview.ambient.intensity);
scene.add(ambientLight);

const mainLight = new THREE.PointLight(LIT.overview.main.color, LIT.overview.main.intensity, LIT.overview.main.range);
mainLight.position.set(...LIT.overview.main.pos);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
scene.add(mainLight);

const fill1 = new THREE.PointLight(LIT.overview.fill1.color, LIT.overview.fill1.intensity, LIT.overview.fill1.range);
fill1.position.set(...LIT.overview.fill1.pos);
scene.add(fill1);

const fill2 = new THREE.PointLight(LIT.overview.fill2.color, LIT.overview.fill2.intensity, LIT.overview.fill2.range);
fill2.position.set(...LIT.overview.fill2.pos);
scene.add(fill2);

const overviewDir1 = new THREE.DirectionalLight(LIT.overview.dir1.color, LIT.overview.dir1.intensity);
overviewDir1.position.set(...LIT.overview.dir1.pos);
overviewDir1.target.position.set(0, 0, 0);
scene.add(overviewDir1);
scene.add(overviewDir1.target);

const overviewDir2 = new THREE.DirectionalLight(LIT.overview.dir2.color, LIT.overview.dir2.intensity);
overviewDir2.position.set(...LIT.overview.dir2.pos);
overviewDir2.target.position.set(0, 0, 0);
scene.add(overviewDir2);
scene.add(overviewDir2.target);

const detailLight = new THREE.DirectionalLight(0xffffff, 0);
detailLight.position.set(2, 7, 5);
scene.add(detailLight);

// ============================================================
// PIANO + TAPPETO
// ============================================================
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.92 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const rug = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.95 })
);
rug.rotation.x = -Math.PI / 2;
rug.position.y = 0.005;
rug.receiveShadow = true;
scene.add(rug);

const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1 })
);
shadowDisc.rotation.x = -Math.PI / 2;
shadowDisc.position.y = 0.01;
shadowDisc.visible = false;
scene.add(shadowDisc);

// ============================================================
// PARTICELLE
// ============================================================
const PARTICLE_COUNT = 150;
const particleGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PARTICLE_COUNT * 3);
const pOff = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
    pPos[i * 3]     = (Math.random() - 0.5) * 18;
    pPos[i * 3 + 1] =  Math.random()        *  9;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    pOff[i]         =  Math.random()        * Math.PI * 2;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));

const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: 0xc9a96e,
    size: 0.05,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
}));
scene.add(particles);

// ============================================================
// RAYCASTER — click/hover sui modelli (solo overview)
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

function createOutline(model) {
    const outline = model.clone();
    outline.traverse(child => {
        if (child.isMesh) {
            child.scale.setScalar(1.04);
            child.material = new THREE.MeshBasicMaterial({
                color: 0xc9a96e,
                side: THREE.BackSide,
                transparent: true,
                opacity: 0.0
            });
        }
    });
    return outline;
}

function getHitIndex() {
    raycaster.setFromCamera(mouse, camera);
    for (let i = 0; i < loadedModels.length; i++) {
        if (!loadedModels[i].model.visible) continue;
        const intersects = raycaster.intersectObject(loadedModels[i].model, true);
        if (intersects.length > 0) return i;
    }
    return -1;
}

function updateHover(index) {
    if (index === hoveredIndex) return;
    if (hoveredIndex >= 0 && loadedModels[hoveredIndex]) {
        setOutlineOpacity(loadedModels[hoveredIndex].outline, 0);
    }
    hoveredIndex = index;
    if (hoveredIndex >= 0) {
        setOutlineOpacity(loadedModels[hoveredIndex].outline, 0.7);
        renderer.domElement.style.cursor = 'pointer';
    } else {
        renderer.domElement.style.cursor = 'default';
    }
}

function setOutlineOpacity(outline, opacity) {
    outline.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.opacity = opacity;
        }
    });
}

// Hover (solo overview)
renderer.domElement.addEventListener('mousemove', (e) => {
    if (currentMode !== 'overview') return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    updateHover(getHitIndex());
});

// Click modello (solo overview)
renderer.domElement.addEventListener('click', (e) => {
    if (currentMode !== 'overview') return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const hitIndex = getHitIndex();
    if (hitIndex >= 0) enterDetail(hitIndex);
});

renderer.domElement.addEventListener('mouseleave', () => {
    if (currentMode === 'overview') updateHover(-1);
});

// ============================================================
// DRAG — rotazione manuale (solo fulldetail)
// ============================================================
function onDragStart(clientX, clientY) {
    if (currentMode !== 'fulldetail') return;
    isDragging = true;
    lastMouseX = clientX;
    lastMouseY = clientY;
    renderer.domElement.style.cursor = 'grabbing';
}

function onDragMove(clientX, clientY) {
    if (!isDragging || currentMode !== 'fulldetail') return;
    const dx = clientX - lastMouseX;
    const dy = clientY - lastMouseY;

    orbitTheta -= dx * 0.008;
    orbitPhi   -= dy * 0.008;
    orbitPhi   = Math.max(0.15, Math.min(Math.PI - 0.15, orbitPhi));

    lastMouseX = clientX;
    lastMouseY = clientY;
}

function onDragEnd() {
    isDragging = false;
    if (currentMode === 'fulldetail') {
        renderer.domElement.style.cursor = 'grab';
    }
}

// Mouse
renderer.domElement.addEventListener('mousedown', (e) => { onDragStart(e.clientX, e.clientY); });
renderer.domElement.addEventListener('mousemove', (e) => { onDragMove(e.clientX, e.clientY); });
renderer.domElement.addEventListener('mouseup',   ()  => { onDragEnd(); });

// Touch (mobile)
renderer.domElement.addEventListener('touchstart', (e) => {
    if (currentMode === 'fulldetail') e.preventDefault();
    if (e.touches.length === 1) onDragStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

renderer.domElement.addEventListener('touchmove', (e) => {
    if (currentMode === 'fulldetail') e.preventDefault();
    if (e.touches.length === 1) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

renderer.domElement.addEventListener('touchend', (e) => {
    if (currentMode === 'fulldetail') e.preventDefault();
    onDragEnd();
}, { passive: false });

// ============================================================
// CARICA MODELLI
// ============================================================
const gltfLoader = new GLTFLoader();

function normalizeModel(model, targetSize) {
    const box  = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const max = Math.max(size.x, size.y, size.z);
    if (max > 0.001) model.scale.setScalar(targetSize / max);
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y -= scaledBox.min.y;
}

// Calcola il centro geometrico del modello (usato per la rotazione manuale)
function getModelCenter(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return center;
}

function createProductCards(prods) {
    const overlay = document.getElementById('products-overlay');
    prods.forEach((product, i) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.animationDelay = `${i * 0.18 + 1}s`;
        card.addEventListener('click', () => enterDetail(i));
        card.innerHTML = `
            <p class="card-num">${String(i + 1).padStart(2, '0')}</p>
            <h3 class="card-name">${product.name}</h3>
            <p class="card-desc">${product.description}</p>
            <p class="card-link">View product →</p>
        `;
        overlay.appendChild(card);
    });
}

// ============================================================
// TRANSIZIONI TRA MODALITÀ
// ============================================================

// ---- OVERVIEW → DETAIL ----
function enterDetail(index) {
    currentMode   = 'detail';
    selectedIndex = index;
    updateHover(-1);

    // Rescale per scena detail/fulldetail
    const item        = loadedModels[index];
    const detailSize  = products[index].detailSize || products[index].size;
    const newScale    = item.originalScale * (detailSize / (products[index].size || 3));
    item.model.scale.setScalar(newScale);
    item.model.position.y = 0;
    const dBox = new THREE.Box3().setFromObject(item.model);
    item.model.position.y = -dBox.min.y;
    item.baseY = item.model.position.y;
    item.outline.scale.setScalar(newScale);
    item.outline.position.copy(item.model.position);

    const model = item.model;
    const mPos  = model.position;

    // Camera più lontana rispetto a prima
    const initR = window.innerWidth < 600 ? 14 : 9;
    camTarget.pos.set(mPos.x, mPos.y + 3.5, mPos.z + initR);
    camTarget.lookAt.set(mPos.x, mPos.y + 1, mPos.z);

    loadedModels.forEach((item, i) => {
        item.model.visible   = (i === index);
        item.outline.visible = false;
    });

    scene.background.setHex(0xf0ebe3);
    scene.fog.density = LIT.detail.fogDensity;

    floor.visible      = false;
    rug.visible        = false;
    shadowDisc.visible = true;
    shadowDisc.position.set(mPos.x, 0.01, mPos.z);
    particles.visible  = false;

    applyLighting('detail');

    // UI
    hideOverlay('ui');
    showOverlay('detail-overlay');

    document.getElementById('detail-num').textContent     = `Product ${String(index + 1).padStart(2, '0')}`;
    document.getElementById('detail-name').textContent    = products[index].name;
    document.getElementById('detail-desc').textContent    = products[index].detailDescription;
    document.getElementById('detail-material').textContent = products[index].material || '';
}

// ---- DETAIL → OVERVIEW ----
function backToOverview() {
    currentMode   = 'overview';
    selectedIndex = -1;

    loadedModels.forEach((item, i) => {
        // Ripristina scala e posizione overview
        item.model.scale.setScalar(item.originalScale);
        item.model.position.x = products[i].position[0];
        item.model.position.z = products[i].position[2];
        item.model.position.y = 0;
        const box = new THREE.Box3().setFromObject(item.model);
        item.model.position.y = -box.min.y;
        item.baseY = item.model.position.y;
        item.outline.scale.setScalar(item.originalScale);
        item.outline.position.copy(item.model.position);

        item.model.visible   = true;
        item.outline.visible = true;
    });

    scene.background.setHex(LIT.overview.fogColor);
    scene.fog.density = LIT.overview.fogDensity;

    floor.visible      = true;
    rug.visible        = true;
    shadowDisc.visible = false;
    particles.visible  = true;

    applyLighting('overview');

    // UI
    hideOverlay('detail-overlay');
    showOverlay('ui');
}

// ---- DETAIL → FULLDETAIL ----
function enterFullDetail() {
    currentMode = 'fulldetail';

    // Calcola angoli iniziali dalla posizione attuale della camera
    // così la camera non salta
    const model  = loadedModels[selectedIndex].model;
    const center = getModelCenter(model);
    const diff   = new THREE.Vector3().subVectors(camera.position, center);

    orbitTheta = Math.atan2(diff.x, diff.z);
    const lenXZ = Math.sqrt(diff.x * diff.x + diff.z * diff.z);
    orbitPhi   = Math.atan2(lenXZ, diff.y);

    renderer.domElement.style.cursor = 'grab';

    // UI
    hideOverlay('detail-overlay');
    showOverlay('fulldetail-overlay');
}

// ---- FULLDETAIL → DETAIL ----
function backToDetail() {
    currentMode = 'detail';
    renderer.domElement.style.cursor = 'default';
    isDragging = false;

    // Ripristina posizione camera dal centro del modello
    const model = loadedModels[selectedIndex].model;
    const mPos  = model.position;
    const backR = window.innerWidth < 600 ? 14 : 9;
    camTarget.pos.set(mPos.x, mPos.y + 3.5, mPos.z + backR);
    camTarget.lookAt.set(mPos.x, mPos.y + 1, mPos.z);

    // UI
    hideOverlay('fulldetail-overlay');
    showOverlay('detail-overlay');
}

// ============================================================
// HELPER: illuminazione + overlay
// ============================================================
function applyLighting(mode) {
    if (mode === 'detail') {
        hemisphereLight.intensity = LIT.detail.hemisphere.intensity;
        ambientLight.intensity    = LIT.detail.ambient.intensity;
        mainLight.intensity       = LIT.detail.main.intensity;
        detailLight.intensity     = LIT.detail.direct.intensity;
        overviewDir1.intensity    = LIT.detail.dir1.intensity;
        overviewDir2.intensity    = LIT.detail.dir2.intensity;
        fill1.intensity           = LIT.detail.fill1.intensity;
        fill2.intensity           = LIT.detail.fill2.intensity;
    } else {
        hemisphereLight.intensity = LIT.overview.hemisphere.intensity;
        ambientLight.intensity    = LIT.overview.ambient.intensity;
        mainLight.intensity       = LIT.overview.main.intensity;
        detailLight.intensity     = 0;
        overviewDir1.intensity    = LIT.overview.dir1.intensity;
        overviewDir2.intensity    = LIT.overview.dir2.intensity;
        fill1.intensity           = LIT.overview.fill1.intensity;
        fill2.intensity           = LIT.overview.fill2.intensity;
    }
}

function showOverlay(id) {
    const el = document.getElementById(id);
    el.style.display = 'flex';
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.classList.add('visible');
    });
}

function hideOverlay(id) {
    const el = document.getElementById(id);
    el.style.opacity = '0';
    el.classList.remove('visible');
    el.style.pointerEvents = 'none';
    setTimeout(() => {
        el.style.display = 'none';
        el.style.pointerEvents = '';
    }, 500);
}

// ============================================================
// INIT
// ============================================================
async function init() {
    try {
        const res = await fetch('./products.json');
        products  = await res.json();
        console.log(`📦 Prodotti trovati: ${products.length}`);

        createProductCards(products);

        for (const product of products) {
            try {
                const gltf = await gltfLoader.loadAsync(`./models/${product.file}`);
                const model = gltf.scene;

                normalizeModel(model, product.size || 3);

                model.position.x = product.position[0];
                model.position.z = product.position[2];
                model.rotation.y = product.rotation || 0;

                model.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow    = true;
                        child.receiveShadow = true;
                    }
                });

                scene.add(model);

                const outline = createOutline(model);
                outline.position.copy(model.position);
                outline.rotation.y = product.rotation || 0;
                scene.add(outline);

                loadedModels.push({ model, baseY: model.position.y, outline, originalScale: model.scale.x });
                console.log(`✅ Caricato: ${product.name}`);

            } catch (e) {
                console.error(`❌ Errore caricamento "${product.file}":`, e);
            }
        }

        document.getElementById('loading').classList.add('hidden');

        // Event listeners UI
        document.getElementById('back-btn').addEventListener('click', backToOverview);
        document.getElementById('fulldetail-btn').addEventListener('click', enterFullDetail);
        document.getElementById('back-detail-btn').addEventListener('click', backToDetail);

    } catch (e) {
        console.error('❌ Errore inizializzazione:', e);
    }
}

// ============================================================
// LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // ---- POSIZIONE CAMERA per modalità ----
    if (currentMode === 'overview') {
        const angle  = t * 0.065;
        const mobile = window.innerWidth < 600;
        const radius = mobile ? 22 : 16;
        const height = mobile ? 11 : 8.5;
        camTarget.pos.set(
            Math.sin(angle)  * radius,
            height + Math.sin(t * 0.18) * 1.2,
            Math.cos(angle)  * radius
        );
        camTarget.lookAt.set(0, 0, 0);

    } else if (currentMode === 'detail') {
        // Auto orbit attorno al modello selezionato
        const model  = loadedModels[selectedIndex].model;
        const mPos   = model.position;
        const dAngle = t * 0.07;
        const dR     = window.innerWidth < 600 ? 14 : 9;
        camTarget.pos.set(
            mPos.x + Math.sin(dAngle) * dR,
            mPos.y + 3.5,
            mPos.z + Math.cos(dAngle) * dR
        );
        camTarget.lookAt.set(mPos.x, mPos.y + 1, mPos.z);

    } else if (currentMode === 'fulldetail') {
        // Rotazione manuale — camera posizionata con coordinate sferiche
        const model  = loadedModels[selectedIndex].model;
        const center = getModelCenter(model);
        const fR     = window.innerWidth < 600 ? 11 : FULL_RADIUS;

        const x = fR * Math.sin(orbitPhi) * Math.sin(orbitTheta);
        const y = fR * Math.cos(orbitPhi);
        const z = fR * Math.sin(orbitPhi) * Math.cos(orbitTheta);

        camTarget.pos.set(center.x + x, center.y + y, center.z + z);
        camTarget.lookAt.copy(center);
    }

    // Lerp camera (più veloce in fulldetail per responsabilità)
    const lerpFactor = (currentMode === 'fulldetail') ? 0.12 : 0.04;
    camera.position.lerp(camTarget.pos, lerpFactor);
    camLookAt.lerp(camTarget.lookAt, lerpFactor);
    camera.lookAt(camLookAt);

    // ---- ANIMAZIONE MODELLI (float) ----
    loadedModels.forEach((item, i) => {
        if (item.model.visible) {
            const floatY = item.baseY + Math.sin(t * 0.38 + i * 2.1) * 0.035;
            item.model.position.y   = floatY;
            item.outline.position.y = floatY;
        }
    });

    // ---- OUTLINE HOVER (overview) ----
    if (hoveredIndex >= 0 && loadedModels[hoveredIndex] && currentMode === 'overview') {
        const pulseOpacity = 0.5 + Math.sin(t * 4) * 0.2;
        setOutlineOpacity(loadedModels[hoveredIndex].outline, pulseOpacity);
    }

    // ---- PARTICELLE ----
    if (particles.visible) {
        const pos = particleGeo.attributes.position.array;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            pos[i * 3]     += Math.sin(t * 0.20 + pOff[i])       * 0.0018;
            pos[i * 3 + 1] += Math.sin(t * 0.25 + pOff[i] * 1.3) * 0.0022;
            pos[i * 3 + 2] += Math.cos(t * 0.22 + pOff[i] * 0.9) * 0.0018;
            if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = 0.3;
            if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 8.7;
        }
        particleGeo.attributes.position.needsUpdate = true;
    }

    // ---- PULSAZIONE LUCE PRINCIPALE (overview) ----
    if (currentMode === 'overview') {
        mainLight.intensity = LIT.overview.main.intensity - 0.2 + Math.sin(t * 0.55) * 0.2;
    }

    renderer.render(scene, camera);
}

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// START
// ============================================================
init();
animate();