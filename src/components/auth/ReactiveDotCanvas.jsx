import { useEffect, useRef } from 'react';

const GRID_SPACING = 20;
const MOBILE_GRID_SPACING = 18;
const BASE_RADIUS = 0.44;
const MAX_WAVE_RADIUS = 3.744;
const SETTLE_EPSILON = 0.012;
const TARGET_FRAME_INTERVAL = 1000 / 60;
const RADIUS_ATTACK_SPEED = 24;
const RADIUS_RELEASE_SPEED = 42;
const TWO_PI = Math.PI * 2;
const POINTER_KERNEL_RADIUS = 5;
const POINTER_MAX_SPEED_X = 1400;
const POINTER_MAX_SPEED_Y = 1000;
const POINTER_HORIZONTAL_STRENGTH = 0.1;
const POINTER_VERTICAL_STRENGTH = 0.14;
const POINTER_VELOCITY_SMOOTHING = 18;

const SURFACE = {
  centerY: 0.76,
  maxAmplitudeRatio: 0.144,
  edgeSoftnessInSpacings: 1.8,
  crestWidthInSpacings: 2,
  crestRadiusBoost: 4,
  coupling: 76,
  restoring: 1.9,
  damping: 0.82,
  driverAccelerationRatio: 0.348,
  travelingAmplitudeRatio: 0.051,
  travelingCycles: 1.15,
  travelingPhaseSpeed: 1.7,
  travelingSecondHarmonic: 0.28
};

/**
 * 로그인 화면 전용 고정 도트 수면입니다.
 *
 * 수면은 도트 열마다 높이와 속도 하나만 갖는 감쇠 파동 격자로 계산합니다.
 * 모든 배열은 리사이즈 때 한 번 할당하고 프레임마다 재사용하므로 React 렌더나
 * 객체 할당 없이 O(열 수 + 점 수) 비용으로 파동의 전파·반사·간섭을 표현합니다.
 */
export const ReactiveDotCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return undefined;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return undefined;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
    const animateWaves = !reducedMotionQuery.matches;
    const allowInteraction = animateWaves && !coarsePointerQuery.matches;

    let width = 0;
    let height = 0;
    let surfaceCenter = 0;
    let maxAmplitude = 0;
    let edgeSoftness = 0;
    let crestWidth = 0;
    let driverAcceleration = 0;
    let travelingAmplitude = 0;
    let gridSpacing = GRID_SPACING;
    let gridStart = GRID_SPACING / 2;
    let canvasLeft = 0;
    let canvasTop = 0;

    let pointX = new Float32Array(0);
    let pointY = new Float32Array(0);
    let pointColumns = new Uint16Array(0);
    let radius = new Float32Array(0);
    let activeMask = new Uint8Array(0);

    let surface = new Float32Array(0);
    let nextSurface = new Float32Array(0);
    let velocity = new Float32Array(0);
    let boundary = new Float32Array(0);
    let leftDriverWeight = new Float32Array(0);
    let rightDriverWeight = new Float32Array(0);
    let carrierSin = new Float32Array(0);
    let carrierCos = new Float32Array(0);
    let carrierSecondSin = new Float32Array(0);
    let carrierSecondCos = new Float32Array(0);
    let pointerGaussianKernel = new Float32Array(0);
    let pointerDerivativeKernel = new Float32Array(0);

    const pointer = {
      x: 0,
      y: 0,
      appliedX: 0,
      appliedY: 0,
      eventTime: 0,
      appliedTime: 0,
      smoothedVelocityX: 0,
      smoothedVelocityY: 0,
      active: false,
      dirty: false,
      hasSample: false
    };

    let animationFrame = 0;
    let previousTime = 0;
    let simulationTime = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.beginPath();

      for (let index = 0; index < pointX.length; index += 1) {
        context.moveTo(pointX[index] + radius[index], pointY[index]);
        context.arc(pointX[index], pointY[index], radius[index], 0, TWO_PI);
      }

      context.fillStyle = 'rgba(9, 9, 11, 0.62)';
      context.fill();
    };

    const updateBoundary = () => {
      // sin(kx + wt)는 위상이 감소하는 x 방향, 즉 오른쪽에서 왼쪽으로 진행합니다.
      // 공간 성분은 리사이즈 때 저장하고 여기서는 시간 성분만 네 번 계산합니다.
      const travelingPhase = simulationTime * SURFACE.travelingPhaseSpeed;
      const phaseSin = Math.sin(travelingPhase);
      const phaseCos = Math.cos(travelingPhase);
      const secondPhaseSin = Math.sin(travelingPhase * 2);
      const secondPhaseCos = Math.cos(travelingPhase * 2);

      for (let column = 0; column < boundary.length; column += 1) {
        const primaryCarrier =
          carrierSin[column] * phaseCos + carrierCos[column] * phaseSin;
        const secondaryCarrier =
          carrierSecondSin[column] * secondPhaseCos +
          carrierSecondCos[column] * secondPhaseSin;
        boundary[column] =
          surfaceCenter +
          surface[column] +
          travelingAmplitude *
            (primaryCarrier + secondaryCarrier * SURFACE.travelingSecondHarmonic);
      }
    };

    const stepSurface = (elapsedSeconds) => {
      const columnCount = surface.length;
      if (columnCount < 2) return;

      // 서로 다른 주기의 두 넓은 외력이 양쪽에서 파동을 만들고 간섭시킵니다.
      // sin 계산은 프레임당 네 번뿐이며 열별 가우시안 가중치는 미리 계산합니다.
      const leftDrive =
        (Math.sin(simulationTime * 0.95) +
          Math.sin(simulationTime * 1.83 + 1.2) * 0.34) *
        driverAcceleration * 0.18;
      const rightDrive =
        (Math.sin(simulationTime * 0.71 + 2.1) +
          Math.sin(simulationTime * 1.37 + 0.35) * 0.3) *
        driverAcceleration;
      const damping = Math.exp(-SURFACE.damping * elapsedSeconds);

      for (let column = 0; column < columnCount; column += 1) {
        // 가장자리 값을 반사해 파동이 되돌아오도록 합니다.
        const left = surface[column === 0 ? 1 : column - 1];
        const right = surface[column === columnCount - 1 ? columnCount - 2 : column + 1];
        const displacement = surface[column];
        const laplacian = left + right - displacement * 2;
        const forcing =
          leftDriverWeight[column] * leftDrive + rightDriverWeight[column] * rightDrive;
        const acceleration =
          laplacian * SURFACE.coupling - displacement * SURFACE.restoring + forcing;

        let nextVelocity = (velocity[column] + acceleration * elapsedSeconds) * damping;
        let nextHeight = displacement + nextVelocity * elapsedSeconds;

        if (nextHeight > maxAmplitude) {
          nextHeight = maxAmplitude;
          nextVelocity *= 0.2;
        } else if (nextHeight < -maxAmplitude) {
          nextHeight = -maxAmplitude;
          nextVelocity *= 0.2;
        }

        velocity[column] = nextVelocity;
        nextSurface[column] = nextHeight;
      }

      const previousSurface = surface;
      surface = nextSurface;
      nextSurface = previousSurface;
    };

    const applyPointerInteraction = () => {
      if (!allowInteraction || !pointer.active || !pointer.dirty || surface.length === 0) {
        return;
      }

      const sampleSeconds = Math.max(
        1 / 240,
        Math.min((pointer.eventTime - pointer.appliedTime) / 1000, 0.1)
      );
      const rawVelocityX = Math.max(
        -POINTER_MAX_SPEED_X,
        Math.min(POINTER_MAX_SPEED_X, (pointer.x - pointer.appliedX) / sampleSeconds)
      );
      const rawVelocityY = Math.max(
        -POINTER_MAX_SPEED_Y,
        Math.min(POINTER_MAX_SPEED_Y, (pointer.y - pointer.appliedY) / sampleSeconds)
      );
      const velocitySmoothing = 1 - Math.exp(-POINTER_VELOCITY_SMOOTHING * sampleSeconds);

      pointer.smoothedVelocityX +=
        (rawVelocityX - pointer.smoothedVelocityX) * velocitySmoothing;
      pointer.smoothedVelocityY +=
        (rawVelocityY - pointer.smoothedVelocityY) * velocitySmoothing;
      pointer.appliedX = pointer.x;
      pointer.appliedY = pointer.y;
      pointer.appliedTime = pointer.eventTime;
      pointer.dirty = false;

      if (
        pointer.smoothedVelocityX * pointer.smoothedVelocityX +
          pointer.smoothedVelocityY * pointer.smoothedVelocityY <
        25
      ) {
        return;
      }

      const centerColumn = Math.round((pointer.x - gridStart) / gridSpacing);
      if (centerColumn < 0 || centerColumn >= surface.length) return;

      const distanceFromSurface = Math.abs(pointer.y - boundary[centerColumn]);
      const proximityRange = Math.max(1, height * 0.45);
      const proximityProgress = Math.max(0, 1 - distanceFromSurface / proximityRange);
      const proximitySmooth =
        proximityProgress * proximityProgress * (3 - 2 * proximityProgress);
      // 로그인 폼 주변에서도 약하게 반응하고 수면 가까이에서는 최대 강도가 됩니다.
      const proximity = 0.2 + proximitySmooth * 0.8;
      const maximumInjectedVelocity = height * 0.58;

      for (let offset = -POINTER_KERNEL_RADIUS; offset <= POINTER_KERNEL_RADIUS; offset += 1) {
        const column = centerColumn + offset;
        if (column < 0 || column >= velocity.length) continue;

        const kernelIndex = offset + POINTER_KERNEL_RADIUS;
        const impulse =
          pointer.smoothedVelocityY *
            POINTER_VERTICAL_STRENGTH *
            pointerGaussianKernel[kernelIndex] +
          pointer.smoothedVelocityX *
            POINTER_HORIZONTAL_STRENGTH *
            pointerDerivativeKernel[kernelIndex];
        velocity[column] = Math.max(
          -maximumInjectedVelocity,
          Math.min(maximumInjectedVelocity, velocity[column] + impulse * proximity)
        );
      }
    };

    const getTargetRadius = (index) => {
      if (activeMask[index] === 0) return BASE_RADIUS;

      const waveY = boundary[pointColumns[index]];
      const depth = pointY[index] - waveY;
      const edgeProgress = Math.max(
        0,
        Math.min(1, (depth + edgeSoftness) / (edgeSoftness * 2))
      );
      const fillInfluence = edgeProgress * edgeProgress * (3 - 2 * edgeProgress);
      const crestProgress = Math.max(0, 1 - Math.abs(depth) / crestWidth);
      const crestSmooth = crestProgress * crestProgress * (3 - 2 * crestProgress);
      const crestInfluence = crestSmooth * crestSmooth;
      const targetRadius =
        BASE_RADIUS +
        fillInfluence * (MAX_WAVE_RADIUS - BASE_RADIUS) +
        crestInfluence * SURFACE.crestRadiusBoost;

      return Math.min(MAX_WAVE_RADIUS, targetRadius);
    };

    const setStaticRadii = () => {
      for (let index = 0; index < radius.length; index += 1) {
        radius[index] = getTargetRadius(index);
      }
    };

    const animate = (time) => {
      // 고주사율 화면에서도 물리와 캔버스 갱신은 최대 60fps로 제한합니다.
      if (previousTime && time - previousTime < TARGET_FRAME_INTERVAL - 0.5) {
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      animationFrame = 0;
      const elapsedSeconds = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 1 / 60;
      previousTime = time;
      simulationTime += elapsedSeconds;

      applyPointerInteraction();
      stepSurface(elapsedSeconds);
      updateBoundary();

      for (let index = 0; index < radius.length; index += 1) {
        const targetRadius = getTargetRadius(index);
        const difference = targetRadius - radius[index];
        const speed = difference < 0 ? RADIUS_RELEASE_SPEED : RADIUS_ATTACK_SPEED;
        const smoothing = 1 - Math.exp(-speed * elapsedSeconds);
        radius[index] += difference * smoothing;

        if (Math.abs(difference) < SETTLE_EPSILON) radius[index] = targetRadius;
      }

      draw();

      if (!document.hidden) {
        animationFrame = window.requestAnimationFrame(animate);
      } else {
        previousTime = 0;
      }
    };

    const requestRender = () => {
      if (!animationFrame && !document.hidden) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvasLeft = bounds.left;
      canvasTop = bounds.top;

      // 초고해상도 화면의 fill 비용을 제한하면서 CSS 좌표계는 그대로 유지합니다.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const spacing = width < 720 ? MOBILE_GRID_SPACING : GRID_SPACING;
      const columns = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const pointCount = columns * rows;
      const start = spacing / 2;
      gridSpacing = spacing;
      gridStart = start;

      surfaceCenter = height * SURFACE.centerY;
      maxAmplitude = height * SURFACE.maxAmplitudeRatio;
      edgeSoftness = spacing * SURFACE.edgeSoftnessInSpacings;
      crestWidth = spacing * SURFACE.crestWidthInSpacings;
      driverAcceleration = height * SURFACE.driverAccelerationRatio;
      travelingAmplitude = height * SURFACE.travelingAmplitudeRatio;

      pointX = new Float32Array(pointCount);
      pointY = new Float32Array(pointCount);
      pointColumns = new Uint16Array(pointCount);
      radius = new Float32Array(pointCount);
      activeMask = new Uint8Array(pointCount);

      surface = new Float32Array(columns);
      nextSurface = new Float32Array(columns);
      velocity = new Float32Array(columns);
      boundary = new Float32Array(columns);
      leftDriverWeight = new Float32Array(columns);
      rightDriverWeight = new Float32Array(columns);
      carrierSin = new Float32Array(columns);
      carrierCos = new Float32Array(columns);
      carrierSecondSin = new Float32Array(columns);
      carrierSecondCos = new Float32Array(columns);
      pointerGaussianKernel = new Float32Array(POINTER_KERNEL_RADIUS * 2 + 1);
      pointerDerivativeKernel = new Float32Array(POINTER_KERNEL_RADIUS * 2 + 1);

      const lastColumn = Math.max(1, columns - 1);
      const driverSigma = 0.085;
      const driverSigmaSquared = driverSigma * driverSigma;

      for (let offset = -POINTER_KERNEL_RADIUS; offset <= POINTER_KERNEL_RADIUS; offset += 1) {
        const normalizedOffset = offset / POINTER_KERNEL_RADIUS;
        const gaussian = Math.exp(-normalizedOffset * normalizedOffset * 2.5);
        const kernelIndex = offset + POINTER_KERNEL_RADIUS;
        pointerGaussianKernel[kernelIndex] = gaussian;
        pointerDerivativeKernel[kernelIndex] = -normalizedOffset * gaussian;
      }

      for (let column = 0; column < columns; column += 1) {
        const normalizedX = column / lastColumn;
        const primaryPhase = TWO_PI * (normalizedX * 1.05 + 0.08);
        const secondaryPhase = TWO_PI * (normalizedX * 2.25 + 0.31);
        const tertiaryPhase = TWO_PI * (normalizedX * 3.7 + 0.67);

        // 큰 저주파 굴곡으로 시작하고 이후에는 파동 방정식이 모양을 계속 변화시킵니다.
        surface[column] =
          maxAmplitude *
          (Math.sin(primaryPhase) * 0.43 +
            Math.sin(secondaryPhase) * 0.2 +
            Math.sin(tertiaryPhase) * 0.08);
        velocity[column] =
          maxAmplitude *
          (Math.cos(primaryPhase) * 0.2 - Math.cos(secondaryPhase) * 0.13);

        const leftDistance = normalizedX - 0.18;
        const rightDistance = normalizedX - 0.82;
        leftDriverWeight[column] = Math.exp(
          -(leftDistance * leftDistance) / (2 * driverSigmaSquared)
        );
        rightDriverWeight[column] = Math.exp(
          -(rightDistance * rightDistance) / (2 * driverSigmaSquared)
        );

        const carrierPhase = TWO_PI * normalizedX * SURFACE.travelingCycles;
        const carrierSecondPhase = carrierPhase * 2 + 0.65;
        carrierSin[column] = Math.sin(carrierPhase);
        carrierCos[column] = Math.cos(carrierPhase);
        carrierSecondSin[column] = Math.sin(carrierSecondPhase);
        carrierSecondCos[column] = Math.cos(carrierSecondPhase);
      }

      const carrierReach =
        travelingAmplitude * (1 + SURFACE.travelingSecondHarmonic);
      const highestReach = surfaceCenter - maxAmplitude - carrierReach - edgeSoftness;
      let index = 0;
      for (let row = 0; row < rows; row += 1) {
        const y = start + row * spacing;
        for (let column = 0; column < columns; column += 1) {
          pointX[index] = start + column * spacing;
          pointY[index] = y;
          pointColumns[index] = column;
          activeMask[index] = y >= highestReach ? 1 : 0;
          index += 1;
        }
      }

      updateBoundary();
      setStaticRadii();
      draw();

      // 리사이즈 직후 이전 좌표계의 속도가 수면에 주입되지 않게 합니다.
      pointer.hasSample = false;
      pointer.dirty = false;
      pointer.smoothedVelocityX = 0;
      pointer.smoothedVelocityY = 0;
    };

    const handlePointerMove = (event) => {
      if (!allowInteraction || event.pointerType === 'touch') return;

      const x = event.clientX - canvasLeft;
      const y = event.clientY - canvasTop;
      if (x < 0 || x > width || y < 0 || y > height) return;

      pointer.x = x;
      pointer.y = y;
      pointer.eventTime = event.timeStamp;
      pointer.active = true;

      if (!pointer.hasSample) {
        pointer.appliedX = x;
        pointer.appliedY = y;
        pointer.appliedTime = event.timeStamp;
        pointer.hasSample = true;
        pointer.dirty = false;
        return;
      }

      pointer.dirty = true;
    };

    const deactivatePointer = () => {
      pointer.active = false;
      pointer.dirty = false;
      pointer.hasSample = false;
      pointer.smoothedVelocityX = 0;
      pointer.smoothedVelocityY = 0;
    };

    const handleWindowPointerOut = (event) => {
      if (event.relatedTarget === null) deactivatePointer();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousTime = 0;
      } else if (animateWaves) {
        requestRender();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    if (animateWaves) requestRender();

    if (allowInteraction) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerout', handleWindowPointerOut, { passive: true });
      window.addEventListener('blur', deactivatePointer);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      if (allowInteraction) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerout', handleWindowPointerOut);
        window.removeEventListener('blur', deactivatePointer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-dot-canvas" aria-hidden="true" />;
};

export default ReactiveDotCanvas;
