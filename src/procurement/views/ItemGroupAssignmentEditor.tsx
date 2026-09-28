import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import {
  getItemGroupAssignments,
  saveItemGroupAssignments,
  type ItemGroupAssignmentOptions,
} from '../api/companyPolicy';

const messageOf = (error: unknown) => error instanceof Error ? error.message : '담당자 설정을 처리하지 못했습니다.';

export function ItemGroupAssignmentEditor() {
  const [data, setData] = useState<ItemGroupAssignmentOptions | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await getItemGroupAssignments();
      setData(next);
      setDraft(Object.fromEntries(next.assignments.map((row) => [row.item_group, row.manager_user_id])));
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const changed = Boolean(data && data.groups.some(
    (group) => (draft[group] ?? '') !== (data.assignments.find((row) => row.item_group === group)?.manager_user_id ?? ''),
  ));

  async function save() {
    if (!data || busy || !changed) return;
    setBusy(true);
    setError('');
    setMessage('');
    const assignments = data.groups.flatMap((item_group) => {
      const manager_user_id = draft[item_group]?.trim();
      return manager_user_id ? [{ item_group, manager_user_id }] : [];
    });
    try {
      const saved = await saveItemGroupAssignments(assignments, data.revision);
      const next = { ...data, revision: saved.revision, assignments: saved.assignments };
      setData(next);
      setDraft(Object.fromEntries(saved.assignments.map((row) => [row.item_group, row.manager_user_id])));
      setMessage('담당자 설정을 저장했습니다. 진행 중인 MR도 새 담당자에게 즉시 재배정됩니다.');
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="policy-section category-assignment-editor" aria-busy={busy}>
      <header className="category-assignment-heading">
        <div>
          <h3>아이템 그룹별 담당자</h3>
          <p>ERPNext에서 아이템 그룹과 활성 시스템 사용자를 불러옵니다. 미지정 그룹의 MR은 담당자 화면에 표시되지 않습니다.</p>
        </div>
        <div className="policy-actions">
          <button type="button" disabled={busy} onClick={() => void load()} aria-label="ERP 정보 다시 불러오기">
            <RefreshCw size={15} /> 다시 불러오기
          </button>
          <button type="button" className="policy-primary" disabled={busy || !changed} onClick={() => void save()}>
            <Save size={15} /> 담당자 저장
          </button>
        </div>
      </header>
      {error && <p role="alert" className="policy-error">{error}</p>}
      {message && <p role="status" className="policy-success">{message}</p>}
      {!data && !error && <p role="status">ERPNext 사용자와 아이템 그룹을 불러오는 중입니다.</p>}
      {data && (
        <div className="category-assignment-list">
          <div className="category-assignment-row category-assignment-labels" aria-hidden="true">
            <strong>아이템 그룹</strong><strong>담당 사용자</strong>
          </div>
          {data.groups.map((group) => {
            const manager = draft[group] ?? '';
            const knownManager = data.users.some((user) => user.id === manager);
            return (
              <label className="category-assignment-row" key={group}>
                <strong>{group}</strong>
                <select value={manager} onChange={(event) => setDraft({ ...draft, [group]: event.target.value })}>
                  <option value="">담당자 미지정</option>
                  {manager && !knownManager && <option value={manager} disabled>{manager} (ERP 사용자 확인 필요)</option>}
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}</option>
                  ))}
                </select>
              </label>
            );
          })}
          {data.groups.length === 0 && <p>ERPNext에서 아이템 그룹을 찾지 못했습니다.</p>}
        </div>
      )}
      {data && <small className="category-assignment-revision">설정 리비전 {data.revision} · 비워두면 일반 담당자에게 배정되지 않습니다.</small>}
    </section>
  );
}