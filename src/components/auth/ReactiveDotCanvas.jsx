import { useEffect, useRef } from 'react';

const GRID_SPACING = 20;
const BASE_RADIUS = 0.3;
const ACTIVE_RADIUS = 4.15;
const INFLUENCE_RADIUS = 300;
const MAX_DOT_SHIFT = 2.4;
const SETTLE_EPSILON = 0.012;
const TARGET_FRAME_INTERVAL = 1000 / 60;

// 서로 다른 fBm 스케일·속도·시드로 겹치는 세 개의 유기적인 수면입니다.
// sampleX에 시간을 더하면 같은 노이즈 형태가 오른쪽에서 왼쪽으로 이동합니다.
const WAVE_DEFINITIONS = [
  {
    centerY: 0.61,
    noiseScale: 285,
    speed: 86,
    verticalAmplitude: 50,
    edgeSoftness: 13,
    dotRadiusBoost: 0.78,
    crestWidth: 17,
    crestRadiusBoost: 1.15,
    seed: 1729
  },
  {
    centerY: 0.73,
    noiseScale: 175,
    speed: 118,
    verticalAmplitude: 34,
    edgeSoftness: 11,
    dotRadiusBoost: 0.58,
    crestWidth: 13,
    crestRadiusBoost: 0.78,
    seed: 4093
  },
  {
    centerY: 0.82,
    noiseScale: 430,
    speed: 64,
    verticalAmplitude: 56,
    edgeSoftness: 17,
    dotRadiusBoost: 0.42,
    crestWidth: 20,
    crestRadiusBoost: 0.52,
    seed: 7919
  }
];

const hashNoise = (index, seed) => {
  let value = Math.imul(index ^ seed, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return ((value >>> 0) / 4294967295) * 2 - 1;
};

const valueNoise1D = (position, seed) => {
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  const smoothFraction = fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
  const lowerValue = hashNoise(lowerIndex, seed);
  const upperValue = hashNoise(lowerIndex + 1, seed);
  return lowerValue + (upperValue - lowerValue) * smoothFraction;
};

// 세 옥타브의 Value Noise를 합쳐 큰 굴곡과 잔물결을 동시에 만듭니다.
const fractalNoise1D = (position, seed) => {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < 3; octave += 1) {
    value += valueNoise1D(position * frequency, seed + octave * 1013) * amplitude;
    amplitudeSum += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }

  return value / amplitudeSum;
};

/**
 * 로그인 화면 전용 반응형 점 배경입니다.
 *
 * 포인터 좌표와 각 점의 애니메이션 값은 React state가 아니라 ref와
 * Float32Array에 보관합니다. 따라서 포인터가 움직여도 React 컴포넌트가
 * 다시 렌더링되지 않습니다. 파형은 점마다 계산하지 않고 각 세로 열의 높이를
 * 프레임당 한 번만 계산하며, 탭이 보이지 않거나 동작 줄이기 설정이면 멈춥니다.
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
    const allowInteraction = !reducedMotionQuery.matches && !coarsePointerQuery.matches;
    const animateWaves = !reducedMotionQuery.matches;

    const pointer = { x: -1000, y: -1000, active: false };
    let width = 0;
    let height = 0;
    let pointX = new Float32Array(0);
    let pointY = new Float32Array(0);
    let radius = new Float32Array(0);
    let offsetX = new Float32Array(0);
    let offsetY = new Float32Array(0);
    let waveActiveMasks = WAVE_DEFINITIONS.map(() => new Uint8Array(0));
    let pointColumns = new Uint16Array(0);
    let columnX = new Float32Array(0);
    let waveBoundaries = WAVE_DEFINITIONS.map(() => new Float32Array(0));
    let waveCenterPixels = WAVE_DEFINITIONS.map(() => 0);
    let animationFrame = 0;
    let previousTime = 0;
    let waveTime = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.beginPath();

      for (let index = 0; index < pointX.length; index += 1) {
        context.moveTo(pointX[index] + offsetX[index] + radius[index], pointY[index] + offsetY[index]);
        context.arc(
          pointX[index] + offsetX[index],
          pointY[index] + offsetY[index],
          radius[index],
          0,
          Math.PI * 2
        );
      }

      context.fillStyle = 'rgba(9, 9, 11, 0.5)';
      context.fill();
    };

    const animate = (time) => {
      // 120/144Hz 화면에서도 캔버스 계산은 최대 60fps까지만 수행합니다.
      if (previousTime && time - previousTime < TARGET_FRAME_INTERVAL - 0.5) {
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      animationFrame = 0;
      const elapsedSeconds = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      if (animateWaves) waveTime += elapsedSeconds;
      const smoothing = 1 - Math.exp(-17 * elapsedSeconds);
      const influenceSquared = INFLUENCE_RADIUS * INFLUENCE_RADIUS;
      let unsettled = false;

      if (animateWaves) {
        for (let waveIndex = 0; waveIndex < WAVE_DEFINITIONS.length; waveIndex += 1) {
          const wave = WAVE_DEFINITIONS[waveIndex];
          const timeOffset = waveTime * wave.speed;

          for (let column = 0; column < columnX.length; column += 1) {
            const sampleX = (columnX[column] + timeOffset) / wave.noiseScale;
            waveBoundaries[waveIndex][column] =
              waveCenterPixels[waveIndex] +
              fractalNoise1D(sampleX, wave.seed) * wave.verticalAmplitude;
          }
        }
      }

      for (let index = 0; index < pointX.length; index += 1) {
        let targetRadius = BASE_RADIUS;
        let targetOffsetX = 0;
        let targetOffsetY = 0;

        if (animateWaves) {
          for (let waveIndex = 0; waveIndex < WAVE_DEFINITIONS.length; waveIndex += 1) {
            if (waveActiveMasks[waveIndex][index] === 0) continue;

            const wave = WAVE_DEFINITIONS[waveIndex];
            const waveY = waveBoundaries[waveIndex][pointColumns[index]];
            const depth = pointY[index] - waveY;
            const edgeProgress = Math.max(
              0,
              Math.min(1, (depth + wave.edgeSoftness) / (wave.edgeSoftness * 2))
            );

            // 경계에서는 부드럽게 커지고, 파형 아래쪽은 같은 크기로 모두 채웁니다.
            const influence = edgeProgress * edgeProgress * (3 - 2 * edgeProgress);
            const crestProgress = Math.max(0, 1 - Math.abs(depth) / wave.crestWidth);
            const crestInfluence =
              crestProgress * crestProgress * (3 - 2 * crestProgress);
            targetRadius +=
              influence * wave.dotRadiusBoost + crestInfluence * wave.crestRadiusBoost;
          }
        }

        if (pointer.active) {
          const deltaX = pointX[index] - pointer.x;
          const deltaY = pointY[index] - pointer.y;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;

          if (distanceSquared < influenceSquared) {
            const distance = Math.sqrt(distanceSquared);
            const proximity = 1 - distance / INFLUENCE_RADIUS;
            const easedProximity = proximity * proximity * (3 - 2 * proximity);
            targetRadius = Math.max(
              targetRadius,
              BASE_RADIUS + (ACTIVE_RADIUS - BASE_RADIUS) * easedProximity
            );

            if (distance > 0.001) {
              const shift = easedProximity * MAX_DOT_SHIFT;
              targetOffsetX = (deltaX / distance) * shift;
              targetOffsetY += (deltaY / distance) * shift;
            }
          }
        }

        const radiusDifference = targetRadius - radius[index];
        const offsetXDifference = targetOffsetX - offsetX[index];
        const offsetYDifference = targetOffsetY - offsetY[index];

        radius[index] += radiusDifference * smoothing;
        offsetX[index] += offsetXDifference * smoothing;
        offsetY[index] += offsetYDifference * smoothing;

        if (
          Math.abs(radiusDifference) > SETTLE_EPSILON ||
          Math.abs(offsetXDifference) > SETTLE_EPSILON ||
          Math.abs(offsetYDifference) > SETTLE_EPSILON
        ) {
          unsettled = true;
        }
      }

      draw();

      // 물결은 계속 흐르되, 동작 줄이기 환경에서는 포인터 보간이 끝나면 쉽니다.
      if ((animateWaves || unsettled) && !document.hidden) {
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

      // 초고해상도 화면에서 픽셀 수가 과도하게 늘지 않도록 DPR을 제한합니다.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const spacing = width < 720 ? 25 : GRID_SPACING;
      const columns = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const pointCount = columns * rows;
      pointX = new Float32Array(pointCount);
      pointY = new Float32Array(pointCount);
      radius = new Float32Array(pointCount);
      offsetX = new Float32Array(pointCount);
      offsetY = new Float32Array(pointCount);
      waveActiveMasks = WAVE_DEFINITIONS.map(() => new Uint8Array(pointCount));
      pointColumns = new Uint16Array(pointCount);
      columnX = new Float32Array(columns);
      waveBoundaries = WAVE_DEFINITIONS.map(() => new Float32Array(columns));
      waveCenterPixels = WAVE_DEFINITIONS.map((wave) => height * wave.centerY);

      const start = spacing / 2;
      for (let column = 0; column < columns; column += 1) {
        columnX[column] = start + column * spacing;
      }

      let index = 0;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          pointX[index] = start + column * spacing;
          pointY[index] = start + row * spacing;
          pointColumns[index] = column;
          radius[index] = BASE_RADIUS;

          for (let waveIndex = 0; waveIndex < WAVE_DEFINITIONS.length; waveIndex += 1) {
            const wave = WAVE_DEFINITIONS[waveIndex];
            const highestReach =
              waveCenterPixels[waveIndex] - wave.verticalAmplitude - wave.edgeSoftness;

            // 파형보다 항상 위에 있는 행은 매 프레임 삼각함수를 계산하지 않습니다.
            waveActiveMasks[waveIndex][index] =
              pointY[index] >= highestReach ? 1 : 0;
          }
          index += 1;
        }
      }

      draw();
    };

    const handlePointerMove = (event) => {
      if (!allowInteraction || event.pointerType === 'touch') return;
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
      requestRender();
    };

    const deactivatePointer = () => {
      if (!pointer.active) return;
      pointer.active = false;
      requestRender();
    };

    const handleWindowPointerOut = (event) => {
      if (event.relatedTarget === null) deactivatePointer();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousTime = 0;
      } else {
        requestRender();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    if (animateWaves) requestRender();

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handleWindowPointerOut, { passive: true });
    window.addEventListener('blur', deactivatePointer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerout', handleWindowPointerOut);
      window.removeEventListener('blur', deactivatePointer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-dot-canvas" aria-hidden="true" />;
};

export default ReactiveDotCanvas;
