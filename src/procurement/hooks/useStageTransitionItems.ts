import { useEffect, useRef, useState } from 'react';
import type { WorkflowTransitionPhase } from '../types';

type StageItem = {
  id: string;
  transitionPhase?: WorkflowTransitionPhase;
};
/**
 * 단계별 목록 사이를 이동하는 항목을 잠시 보존해 퇴장 애니메이션을 끝냅니다.
 * 새 항목은 왼쪽에서 들어오고, 현재 단계에서 빠진 항목은 오른쪽으로 나간 뒤
 * 실제 DOM에서 제거됩니다. 데이터 자체는 서버 응답을 그대로 유지합니다.
 */
export const useStageTransitionItems = <T extends StageItem>(
  items: T[],
  duration = 360,
): T[] => {
  const [displayed, setDisplayed] = useState<T[]>(() => items.map((item) => ({
    ...item,
    transitionPhase: 'entering',
  })));
  const previousIds = useRef(new Set(items.map((item) => item.id)));

  useEffect(() => {
    const nextIds = new Set(items.map((item) => item.id));
    setDisplayed((previous) => {
      const previousById = new Map(previous.map((item) => [item.id, item]));
      const active = items.map((item) => ({
        ...item,
        transitionPhase: previousIds.current.has(item.id) ? 'stable' : 'entering',
      } as T));
      const nextDisplayed = [...active];
      previous.forEach((item, previousIndex) => {
        if (nextIds.has(item.id) || item.transitionPhase === 'exiting') return;
        // 퇴장 항목을 목록 끝에 붙이지 않고 원래 인덱스에 남겨 두어
        // 슬라이드 아웃과 뒤이은 이동 안내가 같은 자리에서 이어지게 한다.
        nextDisplayed.splice(Math.min(previousIndex, nextDisplayed.length), 0, {
          ...(previousById.get(item.id) ?? item),
          transitionPhase: 'exiting',
        } as T);
      });
      return nextDisplayed;
    });
    previousIds.current = nextIds;

    const timer = window.setTimeout(() => {
      setDisplayed((previous) => previous
        .filter((item) => item.transitionPhase !== 'exiting')
        .map((item) => item.transitionPhase === 'entering'
          ? { ...item, transitionPhase: 'stable' }
          : item));
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, items]);

  return displayed;
};
