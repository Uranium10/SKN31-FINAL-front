import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Clock3, Send } from 'lucide-react';
import type { PendingHumanTask } from '../types';

interface WorkflowInterruptFormProps {
  task: PendingHumanTask;
  onSubmit: (taskId: string, answer: Record<string, unknown>, version?: number) => Promise<void> | void;
}

interface ChoiceOption {
  label: string;
  value: string;
}

const choiceOptions = (schema: Record<string, unknown>): ChoiceOption[] => (
  Array.isArray(schema.options)
    ? schema.options.flatMap((option) => {
        if (!option || typeof option !== 'object') return [];
        const row = option as Record<string, unknown>;
        if (typeof row.value !== 'string') return [];
        return [{ label: typeof row.label === 'string' ? row.label : row.value, value: row.value }];
      })
    : []
);

/** 서버의 input_schema를 기반으로 공통 HITL 입력을 렌더링합니다.
 * 협력사 선택·견적 순위·Scorecard처럼 화면 맥락이 큰 작업은 각 전용 모달이
 * 담당하고, 단일 선택/확인/일반 입력은 이 폼으로 일관되게 처리합니다. */
export const WorkflowInterruptForm: React.FC<WorkflowInterruptFormProps> = ({ task, onSubmit }) => {
  const schemaType = String(task.inputSchema.type ?? 'json');
  const field = String(task.inputSchema.field ?? 'decision');
  const options = useMemo(() => choiceOptions(task.inputSchema), [task.inputSchema]);
  const [choice, setChoice] = useState(options[0]?.value ?? '');
  const [jsonText, setJsonText] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (answer: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(task.taskId, answer, task.version);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '입력 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (task.channel === 'ERP_NEXT' || task.audience === 'REQUESTER') {
    return (
      <div className="workflow-interrupt-form is-external">
        <Clock3 size={14} />
        <span><strong>{task.title}</strong>{task.description ? ` · ${task.description}` : ''}</span>
      </div>
    );
  }

  const specialized = ['supplier_selection', 'supplier_ranking_selection', 'scorecard'].includes(schemaType);
  if (specialized) {
    return (
      <div className="workflow-interrupt-form">
        <AlertCircle size={14} />
        <span><strong>{task.title}</strong>{task.description ? ` · ${task.description}` : ''}</span>
      </div>
    );
  }

  return (
    <form
      className="workflow-interrupt-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (schemaType === 'confirmation') {
          const confirmValue = String(task.inputSchema.confirm_value ?? 'confirm');
          void submit({ [field]: confirmValue });
          return;
        }
        if (schemaType === 'single_choice') {
          if (choice) void submit({ [field]: choice });
          return;
        }
        try {
          const parsed = JSON.parse(jsonText) as Record<string, unknown>;
          void submit(parsed);
        } catch {
          setError('올바른 JSON 형식으로 입력해주세요.');
        }
      }}
    >
      <div className="workflow-interrupt-copy">
        <strong>{task.title}</strong>
        {task.description && <span>{task.description}</span>}
      </div>
      {schemaType === 'single_choice' && (
        <select value={choice} onChange={(event) => setChoice(event.target.value)} disabled={submitting}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      {schemaType === 'json' && (
        <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={2} disabled={submitting} />
      )}
      <button type="submit" className="btn-sm btn-approve" disabled={submitting || (schemaType === 'single_choice' && !choice)}>
        {schemaType === 'confirmation' ? <Check size={13} /> : <Send size={13} />}
        {submitting ? '처리 중' : String(task.inputSchema.confirm_label ?? '제출')}
      </button>
      {error && <small className="workflow-interrupt-error">{error}</small>}
    </form>
  );
};
