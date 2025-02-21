import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Water } from 'three/examples/jsm/objects/Water';
import { Sky } from 'three/examples/jsm/objects/Sky';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import * as CANNON from 'cannon-es';

const App = () => {
  const mountRef = useRef(null);
  let windIntensity = 0.2;
  let windSpeed = 2.5;
  let time = 0;
  let trunkBendAmount = 0.05;
  let sphereRadius = 0;


  const trunkGeometry = new THREE.CylinderGeometry(1, 1, 20, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x228b22,
    side: THREE.DoubleSide,
  });

  const createEllipticalLeaf = (width, height) => {
    const leafShape = new THREE.Shape();
    leafShape.ellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2);
    const geometry = new THREE.ShapeGeometry(leafShape);
    return new THREE.Mesh(geometry, leafMaterial);
  };

  const leaf1 = createEllipticalLeaf(5, 15);
  const leaf2 = createEllipticalLeaf(5, 15);
  const leaf3 = createEllipticalLeaf(5, 15);
  const leaf4 = createEllipticalLeaf(5, 15);

  // Configurações iniciais de rotação das folhas (convertendo graus para radianos)
  leaf1.rotation.set(
    THREE.MathUtils.degToRad(20),
    THREE.MathUtils.degToRad(-4),
    THREE.MathUtils.degToRad(30)
  );
  leaf2.rotation.set(
    THREE.MathUtils.degToRad(-20),
    THREE.MathUtils.degToRad(-4),
    THREE.MathUtils.degToRad(-40)
  );
  leaf3.rotation.x = THREE.MathUtils.degToRad(20);
  leaf4.rotation.x = THREE.MathUtils.degToRad(-20);

  // Função que atualiza a posição do sol (influenciando o céu e a água)
  function updateSun(parameters, sun, sky, water, renderTarget, sceneEnv, pmremGenerator, scene) {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();

    if (renderTarget !== undefined) renderTarget.dispose();

    sceneEnv.add(sky);
    renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.add(sky);
    scene.environment = renderTarget.texture;
  }

  useEffect(() => {
    const container = mountRef.current;
    let camera, scene, renderer, controls, water, sun, islandMesh;
    let renderTarget;
    let lastTime = performance.now();
    const cocoInitialY = 22;
    const groundHeight = -2;
    // Raio original da ilha (antes da escala em Y)
    const islandRadius = 30;

    // Meshes dos cocos
    let coconut1, coconut2;
    // Corpos físicos dos cocos
    let coconutBody1 = null;
    let coconutBody2 = null;
    // Flags para controlar os comportamentos
    let coconutSliding = false;
    let coconut2Stopped = false; // flag para o segundo coco parar ao tocar a ilha

    // Criação do mundo físico do Cannon-es
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    // Aumenta as iterações para uma simulação mais precisa
    world.solver.iterations = 20;

    // Cria os materiais para o solo e para o coco
    const groundMaterial = new CANNON.Material('groundMaterial');
    const coconutMaterial = new CANNON.Material('coconutMaterial');

    // Corpo físico para o solo (plano)
    const groundBody = new CANNON.Body({
      mass: 0,
      material: groundMaterial,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.set(0, groundHeight, 0);
    world.addBody(groundBody);


    const coconutGroundContactMaterial = new CANNON.ContactMaterial(
      coconutMaterial,
      groundMaterial,
      {
        friction: 0.4,
        restitution: 0.6,
      }
    );
    world.addContactMaterial(coconutGroundContactMaterial);

    const parameters = {
      elevation: 90,
      azimuth: 180,
    };

    const sky = new Sky();
    renderer = new THREE.WebGLRenderer();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const sceneEnv = new THREE.Scene();

    const init = () => {
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(renderer.domElement);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.5;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
      camera.position.set(30, 30, 100);
      scene.add(camera);

      sun = new THREE.Vector3();

      
      const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
      water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('water.jpg', (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 3.7,
        fog: scene.fog !== undefined,
      });
      water.rotation.x = -Math.PI / 2;
      scene.add(water);

  
      sky.scale.setScalar(10000);
      scene.add(sky);
      const skyUniforms = sky.material.uniforms;
      skyUniforms['turbidity'].value = 10;
      skyUniforms['rayleigh'].value = 2;
      skyUniforms['mieCoefficient'].value = 0.005;
      skyUniforms['mieDirectionalG'].value = 0.8;

      updateSun(parameters, sun, sky, water, renderTarget, sceneEnv, pmremGenerator, scene);

      // Cria a ilha (mesh visual)
      const islandGeometry = new THREE.SphereGeometry(islandRadius, 32, 32);
      const islandMaterial = new THREE.MeshStandardMaterial({ color: 0xf4a261 });
      islandMesh = new THREE.Mesh(islandGeometry, islandMaterial);
    
      islandMesh.scale.set(1, 0.3, 1);
      islandMesh.position.y = groundHeight;
      scene.add(islandMesh);
      sphereRadius = islandGeometry.parameters.radius;

  
      trunk.position.set(0, 15, 0);
      scene.add(trunk);
      trunk.add(leaf1);
      trunk.add(leaf2);
      trunk.add(leaf3);
      trunk.add(leaf4);
      leaf1.position.set(-5, -8, 0);
      leaf2.position.set(5, -8, 0);
      leaf3.position.set(0, -10, 5);
      leaf4.position.set(0, -10, -5);

      // Cria os meshes dos cocos
      coconut1 = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      coconut1.position.set(-5, cocoInitialY, 0);
      scene.add(coconut1);

      coconut2 = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      coconut2.position.set(5, cocoInitialY, 0);
      scene.add(coconut2);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.target.set(0, 10, 0);
      controls.minDistance = 40.0;
      controls.maxDistance = 200.0;
      controls.update();

      const statsInstance = new Stats();
      container.appendChild(statsInstance.dom);

      window.addEventListener('resize', onWindowResize);

      // Adiciona o corpo físico para o primeiro coco após 5 segundos
      setTimeout(() => {
        coconutBody1 = new CANNON.Body({
          mass: 1,
          material: coconutMaterial,
          shape: new CANNON.Sphere(1.5),
          position: new CANNON.Vec3(-5, cocoInitialY, 0),
        });
        coconutBody1.linearDamping = 0.1;
        coconutBody1.angularDamping = 0.1;
        world.addBody(coconutBody1);
      }, 5000);

      // Adiciona o corpo físico para o segundo coco após 15 segundos
      setTimeout(() => {
        coconutBody2 = new CANNON.Body({
          mass: 1,
          material: coconutMaterial,
          shape: new CANNON.Sphere(1.5),
          position: new CANNON.Vec3(5, cocoInitialY, 0),
        });
        coconutBody2.linearDamping = 0.1;
        coconutBody2.angularDamping = 0.1;
        world.addBody(coconutBody2);
      }, 15000);
    };

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    let sunElevationAnimationStart = null;
    let sunElevationStartValue = parameters.elevation;
    const sunElevationDuration = 10; // duração da animação do sol (em segundos)

    const animate = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Animação do sol (reduzindo a elevação ao longo de 10 segundos)
      if (sunElevationAnimationStart !== null) {
        const elapsedTime = (currentTime - sunElevationAnimationStart) / 1000;
        if (elapsedTime < sunElevationDuration) {
          parameters.elevation = THREE.MathUtils.lerp(sunElevationStartValue, 5, elapsedTime / sunElevationDuration);
        } else {
          parameters.elevation = 5;
          sunElevationAnimationStart = null;
        }
      }
      updateSun(parameters, sun, sky, water, renderTarget, sceneEnv, pmremGenerator, scene);

      // Atualiza a simulação física
      const fixedTimeStep = 1 / 60;
      world.step(fixedTimeStep, deltaTime, 3);

      // Sincroniza a posição e rotação dos cocos com seus corpos físicos
      if (coconutBody1) {
        coconut1.position.copy(coconutBody1.position);
        coconut1.quaternion.copy(coconutBody1.quaternion);
      }
      if (coconutBody2) {
        coconut2.position.copy(coconutBody2.position);
        coconut2.quaternion.copy(coconutBody2.quaternion);
      }

      // Lógica para o deslize do primeiro coco sobre a ilha
      if (coconutBody1 && !coconutSliding) {
        if (coconutBody1.position.y < 8) {
          coconutSliding = true;
        }
      }
      if (coconutSliding && coconutBody1) {
        // Define velocidade horizontal desejada (diagonal em X e Z)
        const speed = 5;
        const vx = speed / Math.sqrt(2);
        const vz = speed / Math.sqrt(2);
        const x = coconutBody1.position.x;
        const z = coconutBody1.position.z;
        const r2 = x * x + z * z;
        // Altura ideal da ilha na posição (x,z)
        const islandY = groundHeight + 0.3 * Math.sqrt(Math.max(0, islandRadius * islandRadius - r2));
        // Calcula derivadas parciais para ajustar o componente vertical
        const denom = Math.sqrt(Math.max(0.0001, islandRadius * islandRadius - r2));
        const dYdx = -0.3 * x / denom;
        const dYdz = -0.3 * z / denom;
        const vy = dYdx * vx + dYdz * vz;
        coconutBody1.velocity.set(vx, vy, vz);
        coconutBody1.position.y = islandY;
        const horizontalDistance = Math.sqrt(r2);
        if (horizontalDistance >= (islandRadius - 1.5)) {
          coconutBody1.velocity.set(0, 0, 0);
          coconutSliding = false;
        }
      }

  
      if (coconutBody2 && !coconut2Stopped) {
        const x2 = coconutBody2.position.x;
        const z2 = coconutBody2.position.z;
        const r2_2 = x2 * x2 + z2 * z2;
        const islandY2 = groundHeight + 0.3 * Math.sqrt(Math.max(0, islandRadius * islandRadius - r2_2));
        if (coconutBody2.position.y <= islandY2 + 1.1) {
          coconutBody2.velocity.set(0, 0, 0);
          coconutBody2.position.y = islandY2;
          coconut2Stopped = true;
        }
      }

      // Efeito de vento para as folhas
      time += deltaTime * windSpeed;
      leaf1.position.x = -5 + Math.sin(time + 0) * windIntensity;
      leaf1.position.z = Math.sin(time + 0) * windIntensity;
      leaf2.position.x = 5 + Math.sin(time + 1) * windIntensity;
      leaf2.position.z = Math.sin(time + 1) * windIntensity;
      leaf3.position.x = Math.sin(time + 2) * windIntensity;
      leaf3.position.z = 5 + Math.sin(time + 2) * windIntensity;
      leaf4.position.x = Math.sin(time + 3) * windIntensity;
      leaf4.position.z = -5 + Math.sin(time + 3) * windIntensity;

      const trunkBend = Math.sin(currentTime * 0.001) * trunkBendAmount;
      trunk.rotation.x = 3.3 + trunkBend;

      // Rotação da ilha e atualização da água
      const islandRotationTime = performance.now() * 0.005;
      islandMesh.rotation.y = islandRotationTime * 0.1;
      water.material.uniforms['time'].value += 1.0 / 60.0;

      renderer.render(scene, camera);
      renderer.setAnimationLoop(animate);
    };

    init();

  
    setTimeout(() => {
      sunElevationAnimationStart = performance.now();
      sunElevationStartValue = parameters.elevation;
    }, 1000);

    const animationId = renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
};

export default App;
