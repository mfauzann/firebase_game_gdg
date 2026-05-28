import * as THREE from 'three';

export class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.labelContainer = document.getElementById('label-container');
    
    // Scene variables
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    
    // Players state
    this.localPlayer = null;
    this.localPlayerId = null;
    this.remotePlayers = {}; // id -> { data, mesh, labelEl, bubbleEl, targetPos, targetRot, emoteTimer }
    
    // Movement controls
    this.keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ' ': false };
    
    // Physics constants
    this.gravity = 25.0;
    this.jumpForce = 10.0;
    this.moveSpeed = 8.0;
    
    // Interactive environmental elements
    this.crystals = [];
    this.particles = []; // Array of active particle systems
    
    // Network callback
    this.onMoveCallback = null;

    this.init();
    this.setupEvents();
    this.animate();
  }

  init() {
    // 1. Scene Setup with Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080f);
    this.scene.fog = new THREE.FogExp2(0x07080f, 0.02);

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera starts above and behind the origin
    this.camera.position.set(0, 5, 10);

    // 3. Renderer Setup with Shadows
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(ambientLight);

    // Directional light representing a futuristic sun/moon, casting shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Grid Floor - Synthwave aesthetic
    const gridHelper = new THREE.GridHelper(80, 80, 0xff0055, 0x444444);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Solid dark floor for shadows
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c0d14,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Glowing Neon Boundaries
    this.createBoundaryWall();

    // Floating Crystal Obstacles to interact around
    this.createCrystals();
  }

  createBoundaryWall() {
    const size = 40; // Arena boundary half-size
    const thickness = 0.5;
    const height = 2.0;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.3
    });

    const positions = [
      [0, height/2, size],  // North
      [0, height/2, -size], // South
      [size, height/2, 0],  // East
      [-size, height/2, 0]  // West
    ];

    const sizes = [
      [size * 2, height, thickness],
      [size * 2, height, thickness],
      [thickness, height, size * 2],
      [thickness, height, size * 2]
    ];

    for (let i = 0; i < 4; i++) {
      const wallGeo = new THREE.BoxGeometry(...sizes[i]);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(...positions[i]);
      this.scene.add(wall);
    }
  }

  createCrystals() {
    const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const count = 16;
    const boundary = 30;

    for (let i = 0; i < count; i++) {
      // Choose a bright neon color
      const colors = [0x00ffcc, 0xff0055, 0x9900ff, 0xffdd00, 0x00ff33];
      const selectedColor = colors[Math.floor(Math.random() * colors.length)];

      const crystalMat = new THREE.MeshStandardMaterial({
        color: selectedColor,
        emissive: selectedColor,
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.9,
      });

      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      
      // Random coordinates, keeping away from middle slightly
      let x = (Math.random() - 0.5) * boundary * 2;
      let z = (Math.random() - 0.5) * boundary * 2;
      while (Math.sqrt(x*x + z*z) < 5) {
        x = (Math.random() - 0.5) * boundary * 2;
        z = (Math.random() - 0.5) * boundary * 2;
      }
      
      const y = 1.5 + Math.random() * 2.0;

      crystal.position.set(x, y, z);
      crystal.castShadow = true;
      crystal.receiveShadow = true;

      // Custom attributes for animation in game loop
      crystal.userData = {
        baseY: y,
        floatSpeed: 1 + Math.random() * 2,
        rotSpeed: 0.5 + Math.random() * 1.5,
        offset: Math.random() * Math.PI * 2
      };

      this.scene.add(crystal);
      this.crystals.push(crystal);

      // Add a neon ring on the ground underneath each crystal
      const ringGeo = new THREE.RingGeometry(0.1, 1.0, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: selectedColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.02, z);
      this.scene.add(ring);
    }
  }

  // Set up input key listeners
  setupEvents() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) || e.key === ' ') {
        // Prevent default spacebar scrolling
        if (e.key === ' ') e.preventDefault();
        
        // If chatting, don't capture movement keys
        if (document.activeElement === document.getElementById('chat-input')) return;
        
        this.keys[e.key === ' ' ? ' ' : key] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) || e.key === ' ') {
        this.keys[e.key === ' ' ? ' ' : key] = false;
      }
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Builder method for a player's 3D mesh
  createPlayerMesh(colorHex) {
    const group = new THREE.Group();

    // Body: capsule shape
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.4, 16);
    // Smooth caps on cylinder
    const capGeo = new THREE.SphereGeometry(0.5, 16, 8);
    
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.5
    });

    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.7;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const headCap = new THREE.Mesh(capGeo, mat);
    headCap.position.y = 1.4;
    headCap.castShadow = true;
    group.add(headCap);

    const bottomCap = new THREE.Mesh(capGeo, mat);
    bottomCap.position.y = 0.0;
    bottomCap.castShadow = true;
    group.add(bottomCap);

    // Glowing visor to show direction of mesh
    const visorGeo = new THREE.BoxGeometry(0.7, 0.2, 0.45);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      roughness: 0.1
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.1, 0.35); // placed in front (+z)
    group.add(visor);

    // Orbiting mini-spheres (hands) for futuristic effect
    const handGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const handMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: colorHex, emissiveIntensity: 0.3 });
    
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-0.75, 0.6, 0);
    leftHand.name = "leftHand";
    group.add(leftHand);

    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(0.75, 0.6, 0);
    rightHand.name = "rightHand";
    group.add(rightHand);

    return group;
  }

  // Create UI overlay label for name and speech bubble
  createPlayerLabel(id, name, colorHex) {
    const label = document.createElement('div');
    label.className = 'player-label';
    label.id = `label-${id}`;
    label.style.setProperty('--player-color', colorHex);

    const nametag = document.createElement('div');
    nametag.className = 'nametag';
    nametag.innerText = name;
    label.appendChild(nametag);

    this.labelContainer.appendChild(label);
    return label;
  }

  // Add the local player into the 3D scene
  addLocalPlayer(id, name, colorHex) {
    this.localPlayerId = id;
    
    const mesh = this.createPlayerMesh(colorHex);
    this.scene.add(mesh);

    this.localPlayer = {
      id: id,
      name: name,
      color: colorHex,
      mesh: mesh,
      velocity: new THREE.Vector3(),
      isGrounded: true,
      labelEl: this.createPlayerLabel(id, name, colorHex),
      actionState: 'idle'
    };

    // Position mesh at random start
    mesh.position.set((Math.random() - 0.5) * 15, 1.0, (Math.random() - 0.5) * 15);
  }

  // Add a remote player into the scene
  addRemotePlayer(id, data) {
    if (this.remotePlayers[id]) return;

    const mesh = this.createPlayerMesh(data.color);
    this.scene.add(mesh);
    mesh.position.copy(data.position);
    mesh.rotation.y = data.rotation.y;

    const labelEl = this.createPlayerLabel(id, data.name, data.color);

    this.remotePlayers[id] = {
      id: id,
      name: data.name,
      color: data.color,
      mesh: mesh,
      labelEl: labelEl,
      bubbleEl: null,
      targetPos: new THREE.Vector3().copy(data.position),
      targetRotY: data.rotation.y,
      actionState: data.actionState || 'idle',
      emoteTimer: 0
    };
  }

  // Remove remote player mesh and UI labels
  removeRemotePlayer(id) {
    const rp = this.remotePlayers[id];
    if (rp) {
      this.scene.remove(rp.mesh);
      if (rp.labelEl) {
        rp.labelEl.remove();
      }
      delete this.remotePlayers[id];
    }
  }

  // Sync positions from server
  updateRemotePlayerTarget(id, position, rotation, actionState) {
    const rp = this.remotePlayers[id];
    if (rp) {
      rp.targetPos.copy(position);
      rp.targetRotY = rotation.y;
      rp.actionState = actionState || 'idle';
    }
  }

  // Trigger speech bubble above player's head
  showChatBubble(id, message) {
    let labelEl;
    if (id === this.localPlayerId) {
      labelEl = this.localPlayer ? this.localPlayer.labelEl : null;
    } else {
      labelEl = this.remotePlayers[id] ? this.remotePlayers[id].labelEl : null;
    }

    if (!labelEl) return;

    // Remove existing bubble if any
    const existingBubble = labelEl.querySelector('.speech-bubble');
    if (existingBubble) {
      existingBubble.remove();
    }

    // Create new bubble
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.innerText = message;
    
    // Insert bubble before nametag so it sits on top
    labelEl.insertBefore(bubble, labelEl.firstChild);

    // Remove bubble after 4 seconds
    setTimeout(() => {
      if (bubble.parentNode) {
        bubble.classList.add('fade-out'); // Add transition if wanted, or just remove
        bubble.remove();
      }
    }, 4500);
  }

  // Sparkle / Shine particle effect generator
  spawnShineParticles(position, colorHex) {
    const particleCount = 40;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      // Start slightly above character ground level
      positions.push(position.x, position.y + 0.8, position.z);
      
      // Random directions going outwards and upwards
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const speed = 1.0 + Math.random() * 3.5;
      
      velocities.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi) * speed) + 1.0, // bias upwards
        Math.sin(phi) * Math.sin(theta) * speed
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Additive blending glow particles
    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.25,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(geometry, material);
    this.scene.add(particleSystem);

    this.particles.push({
      system: particleSystem,
      velocities: velocities,
      age: 0,
      maxAge: 1.0 // survives 1.0 second
    });
  }

  // Trigger emotes locally (local player trigged, or remote player synced)
  triggerEmote(id, emoteType) {
    let player;
    if (id === this.localPlayerId) {
      player = this.localPlayer;
    } else {
      player = this.remotePlayers[id];
    }

    if (!player) return;

    if (emoteType === 'jump') {
      // If remote, force a vertical bounce animation
      if (id !== this.localPlayerId) {
        player.emoteTimer = 0.5; // bounce duration
        player.actionState = 'jump-emote';
      } else {
        // Local player does actual physics jump
        if (this.localPlayer.isGrounded) {
          this.localPlayer.velocity.y = this.jumpForce;
          this.localPlayer.isGrounded = false;
        }
      }
    } else if (emoteType === 'wave') {
      // Spin animation trigger
      player.emoteTimer = 0.6; // duration
      player.actionState = 'spin-emote';
    } else if (emoteType === 'sparkle') {
      // Spawn magic particles
      this.spawnShineParticles(player.mesh.position, player.color);
    } else if (emoteType === 'wave_hand') {
      // Left-right tilt wobble animation
      player.emoteTimer = 0.8;
      player.actionState = 'wave-hand-emote';
    }
  }

  // Handle local player movement physics and camera tracking
  updateLocalPlayer(dt) {
    if (!this.localPlayer) return;

    const mesh = this.localPlayer.mesh;
    const pos = mesh.position;
    const vel = this.localPlayer.velocity;

    // A. Forward & Backward movement direction vectors based on Camera orientation
    // This makes WASD movement relative to where the camera is facing!
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    camDir.y = 0; // lock to floor plane
    camDir.normalize();

    const camRight = new THREE.Vector3(-camDir.z, 0, camDir.x); // orthogonal right vector

    const moveDirection = new THREE.Vector3(0, 0, 0);

    if (this.keys['w'] || this.keys['arrowup']) moveDirection.add(camDir);
    if (this.keys['s'] || this.keys['arrowdown']) moveDirection.sub(camDir);
    if (this.keys['d'] || this.keys['arrowright']) moveDirection.add(camRight);
    if (this.keys['a'] || this.keys['arrowleft']) moveDirection.sub(camRight);

    moveDirection.normalize();

    // Apply movement speeds
    vel.x = moveDirection.x * this.moveSpeed;
    vel.z = moveDirection.z * this.moveSpeed;

    // B. Jump Physics
    if (this.keys[' '] && this.localPlayer.isGrounded) {
      vel.y = this.jumpForce;
      this.localPlayer.isGrounded = false;
      this.localPlayer.actionState = 'jumping';
    }

    // Apply Gravity
    if (!this.localPlayer.isGrounded) {
      vel.y -= this.gravity * dt;
      this.localPlayer.actionState = 'jumping';
    } else {
      this.localPlayer.actionState = moveDirection.lengthSq() > 0 ? 'running' : 'idle';
    }

    // Apply velocities to coordinates
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    // Floor Boundary Collision
    if (pos.y <= 0.0) {
      pos.y = 0.0;
      vel.y = 0.0;
      this.localPlayer.isGrounded = true;
    }

    // Arena Outer Boundary collision (lock players in -40 to +40 grid)
    const limit = 39.0;
    if (pos.x < -limit) pos.x = -limit;
    if (pos.x > limit) pos.x = limit;
    if (pos.z < -limit) pos.z = -limit;
    if (pos.z > limit) pos.z = limit;

    // C. Mesh Rotation
    // Rotate character body to face the movement direction
    if (moveDirection.lengthSq() > 0) {
      const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
      // Interpolate rotation for smoothness
      mesh.rotation.y = this.interpolateAngle(mesh.rotation.y, targetAngle, 0.15);
    }

    // D. Orbiting hands animation
    const lHand = mesh.getObjectByName('leftHand');
    const rHand = mesh.getObjectByName('rightHand');
    if (lHand && rHand) {
      const time = this.clock.getElapsedTime();
      if (this.localPlayer.actionState === 'running') {
        // Swing hands back and forth
        lHand.position.z = Math.sin(time * 10) * 0.4;
        rHand.position.z = -Math.sin(time * 10) * 0.4;
        lHand.position.y = 0.6 + Math.abs(Math.cos(time * 10)) * 0.15;
        rHand.position.y = 0.6 + Math.abs(Math.sin(time * 10)) * 0.15;
      } else {
        // Subtle floating idle motion
        lHand.position.z = 0;
        rHand.position.z = 0;
        lHand.position.y = 0.6 + Math.sin(time * 2) * 0.08;
        rHand.position.y = 0.6 + Math.cos(time * 2) * 0.08;
      }
    }

    // E. Smooth Follow Camera setup
    // Camera is positioned at a target distance behind the player mesh, offset vertically
    const targetCamOffset = new THREE.Vector3(0, 4.5, 7.5);
    // Rotate camera offset relative to player looking direction if we want, or just static axis follow.
    // Static camera follow is simple, but orbital-follow is better. Let's do a smooth follow behind the player position.
    const targetCamPos = pos.clone().add(targetCamOffset);
    this.camera.position.lerp(targetCamPos, 0.08);
    
    // Always look at the player mesh (slightly above ground coordinates)
    const lookAtPos = pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.camera.lookAt(lookAtPos);

    // F. Fire Network Move Broadcast callback
    if (this.onMoveCallback) {
      this.onMoveCallback({
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { y: mesh.rotation.y },
        actionState: this.localPlayer.actionState
      });
    }
  }

  // Handle angle interpolation without 360-degree flip glitch
  interpolateAngle(current, target, step) {
    let diff = target - current;
    // Normalize to -PI to +PI
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return current + diff * step;
  }

  // Interpolate and animate remote players and spawn emotes animations
  updateRemotePlayers(dt) {
    const time = this.clock.getElapsedTime();

    for (const id in this.remotePlayers) {
      const rp = this.remotePlayers[id];
      const mesh = rp.mesh;

      // A. Movement interpolation (lerping)
      mesh.position.lerp(rp.targetPos, 0.15);
      mesh.rotation.y = this.interpolateAngle(mesh.rotation.y, rp.targetRotY, 0.15);

      // B. Emote animation handlers
      const lHand = mesh.getObjectByName('leftHand');
      const rHand = mesh.getObjectByName('rightHand');

      if (rp.emoteTimer > 0) {
        rp.emoteTimer -= dt;
        
        if (rp.actionState === 'jump-emote') {
          // Bounce local mesh up/down
          const progress = rp.emoteTimer / 0.5; // 1 to 0
          mesh.position.y = rp.targetPos.y + Math.sin(progress * Math.PI) * 3.0;
        } else if (rp.actionState === 'spin-emote') {
          // Spin around Y axis
          mesh.rotation.y += dt * 10;
        } else if (rp.actionState === 'wave-hand-emote') {
          // Wiggle left and right hands
          if (lHand && rHand) {
            lHand.position.y = 0.6 + Math.sin(time * 25) * 0.4;
            rHand.position.y = 0.6 + Math.cos(time * 25) * 0.4;
          }
        }
      } else {
        // Normal state animation
        if (rp.actionState === 'jump-emote' || rp.actionState === 'spin-emote' || rp.actionState === 'wave-hand-emote') {
          rp.actionState = 'idle'; // reset
        }

        // Animate hands for remote movement
        if (lHand && rHand) {
          if (rp.actionState === 'running') {
            lHand.position.z = Math.sin(time * 10) * 0.4;
            rHand.position.z = -Math.sin(time * 10) * 0.4;
            lHand.position.y = 0.6 + Math.abs(Math.cos(time * 10)) * 0.15;
            rHand.position.y = 0.6 + Math.abs(Math.sin(time * 10)) * 0.15;
          } else {
            lHand.position.z = 0;
            rHand.position.z = 0;
            lHand.position.y = 0.6 + Math.sin(time * 2) * 0.08;
            rHand.position.y = 0.6 + Math.cos(time * 2) * 0.08;
          }
        }
      }
    }
  }

  // Update floating crystals in scene
  updateEnvironment(dt) {
    const time = this.clock.getElapsedTime();
    this.crystals.forEach((crystal) => {
      const uData = crystal.userData;
      // Hover up/down floating effect
      crystal.position.y = uData.baseY + Math.sin(time * uData.floatSpeed + uData.offset) * 0.4;
      // Rotation spinning effect
      crystal.rotation.y += dt * uData.rotSpeed;
      crystal.rotation.x += dt * (uData.rotSpeed * 0.2);
    });
  }

  // Update particle system physics and transparency fade
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;

      if (p.age >= p.maxAge) {
        this.scene.remove(p.system);
        p.system.geometry.dispose();
        p.system.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Animate particles outward
      const positions = p.system.geometry.attributes.position.array;
      const v = p.velocities;

      for (let j = 0; j < positions.length / 3; j++) {
        positions[j * 3] += v[j * 3] * dt;
        positions[j * 3 + 1] += v[j * 3 + 1] * dt;
        positions[j * 3 + 2] += v[j * 3 + 2] * dt;
        
        // Apply slight gravity drag to particles
        v[j * 3 + 1] -= 4.0 * dt;
      }

      p.system.geometry.attributes.position.needsUpdate = true;
      // Fade out opacity over lifetime
      p.system.material.opacity = 1.0 - (p.age / p.maxAge);
    }
  }

  // Reposition HTML HUD floating nametags & bubbles based on 3D projections
  updateLabels() {
    const tempV = new THREE.Vector3();
    
    // Update local label position
    if (this.localPlayer) {
      this.updateLabelElement(this.localPlayer.labelEl, this.localPlayer.mesh.position, tempV);
    }

    // Update remote label positions
    for (const id in this.remotePlayers) {
      const rp = this.remotePlayers[id];
      this.updateLabelElement(rp.labelEl, rp.mesh.position, tempV);
    }
  }

  updateLabelElement(element, playerPos, tempV) {
    if (!element) return;

    // Set height offset: slightly above character visor
    tempV.copy(playerPos);
    tempV.y += 2.1; 

    // Project coordinates to normalized device space (-1 to +1)
    tempV.project(this.camera);

    // Is coordinate behind screen?
    const isBehindCamera = tempV.z > 1;

    if (isBehindCamera) {
      element.style.display = 'none';
      return;
    }

    element.style.display = 'block';
    
    // Map device space coordinates to pixel canvas boundaries
    const x = (tempV.x * .5 + .5) * window.innerWidth;
    const y = (tempV.y * -.5 + .5) * window.innerHeight;

    element.style.transform = `translate(-50%, -100%) translate(${x}px,${y}px)`;
  }

  // Game Render Loop running at monitor refresh rate
  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1); // cap elapsed delta time to prevent physics clipping

    // Update parts
    this.updateLocalPlayer(dt);
    this.updateRemotePlayers(dt);
    this.updateEnvironment(dt);
    this.updateParticles(dt);
    this.updateLabels();

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}
