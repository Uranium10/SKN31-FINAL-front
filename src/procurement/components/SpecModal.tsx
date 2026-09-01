import React, { useMemo } from 'react';
import { AlertCircle, FileText, X } from 'lucide-react';
import type { Item } from '../types';
import {
  formatSpecificationValue,
  getItemSpecificationFields,
  groupItemSpecifications,
} from '../utils/itemSpecifications';

interface SpecModalProps {
  item: Item | null;
  onClose: () => void;
}

export const SpecModal: React.FC<SpecModalProps> = ({ item, onClose }) => {
  const fields = useMemo(() => item ? getItemSpecificationFields(item) : [], [item]);
  const groups = useMemo(() => item ? groupItemSpecifications(item) : [], [item]);
  const missingRequiredCount = fields.filter((field) => (
    field.required && (field.value === null || field.value === '')
  )).length;

  if (!item) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content item-spec-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <FileText size={20} />
            <div>
              <h3>규격 상세 정보 ({item.itemCode})</h3>
              <p>{item.itemName} · {item.department}</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="규격 상세 닫기">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body item-spec-modal-body">
          <div className="item-spec-summary">
            <div>
              <span>기본 규격</span>
              <strong>{item.specSummary}</strong>
            </div>
            <span className="item-spec-count">규격 컬럼 {fields.length}개</span>
          </div>

          {missingRequiredCount > 0 && (
            <div className="item-spec-warning" role="status">
              <AlertCircle size={15} />
              필수 규격 {missingRequiredCount}개가 아직 입력되지 않았습니다.
            </div>
          )}

          {groups.length > 0 ? groups.map((group) => (
            <section className="item-spec-group" key={group.name}>
              <div className="item-spec-group-header">
                <h4>{group.name}</h4>
                <span>{group.fields.length}개 항목</span>
              </div>
              <div className="item-spec-grid">
                {group.fields.map((field) => {
                  const isMissing = field.required && (field.value === null || field.value === '');
                  return (
                    <div className={`item-spec-field${isMissing ? ' is-missing' : ''}`} key={field.key}>
                      <div className="item-spec-field-label">
                        <span>{field.label}</span>
                        {field.required && <em>필수</em>}
                      </div>
                      <strong>{formatSpecificationValue(field)}</strong>
                      <code>{field.key}</code>
                    </div>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="table-empty-state">등록된 상세 규격이 없습니다.</div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>확인 및 닫기</button>
        </div>
      </div>
    </div>
  );
};
