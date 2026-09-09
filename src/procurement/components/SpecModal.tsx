import React, { useMemo } from 'react';
import { AlertCircle, FileText, X } from 'lucide-react';
import type { Item } from '../types';
import {
  countParsedSpecificationItems,
  formatSpecificationValue,
  getItemSpecificationFields,
  groupItemSpecifications,
  parseSpecificationText,
  summarizeSpecificationText,
} from '../utils/itemSpecifications';

interface SpecModalProps {
  item: Item | null;
  onClose: () => void;
}

export const SpecModal: React.FC<SpecModalProps> = ({ item, onClose }) => {
  const fields = useMemo(() => item ? getItemSpecificationFields(item) : [], [item]);
  const groups = useMemo(() => item ? groupItemSpecifications(item) : [], [item]);
  const parsedFields = useMemo(() => new Map(fields.map((field) => {
    const formatted = formatSpecificationValue(field);
    const sections = typeof field.value === 'string' ? parseSpecificationText(formatted) : [];
    return [field.key, sections] as const;
  })), [fields]);
  const displayedItemCount = useMemo(() => fields.reduce((count, field) => {
    const parsedCount = countParsedSpecificationItems(parsedFields.get(field.key) ?? []);
    return count + Math.max(parsedCount, 1);
  }, 0), [fields, parsedFields]);
  const summary = useMemo(() => item ? summarizeSpecificationText(item.specSummary) : '', [item]);
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
              <span>규격 요약</span>
              <strong title={item.specSummary}>{summary}</strong>
            </div>
            <span className="item-spec-count">{displayedItemCount}개 항목</span>
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
                <span>
                  {group.fields.reduce((count, field) => (
                    count + Math.max(
                      countParsedSpecificationItems(parsedFields.get(field.key) ?? []),
                      1,
                    )
                  ), 0)}개 항목
                </span>
              </div>
              <div className="item-spec-grid">
                {group.fields.flatMap((field) => {
                  const isMissing = field.required && (field.value === null || field.value === '');
                  const parsedSections = parsedFields.get(field.key) ?? [];
                  const parsedParts = parsedSections.flatMap((section) => (
                    section.items.map((part) => ({ sectionTitle: section.title, part }))
                  ));
                  const shouldSplitIntoFields = (
                    parsedParts.length > 1
                    || parsedParts.some(({ sectionTitle, part }) => sectionTitle || part.label)
                  );

                  // ERPNext의 Description처럼 한 필드 안에 쉼표로 몰려 온
                  // 규격도 사용자가 한눈에 비교할 수 있도록 각각 독립된 칸으로
                  // 승격합니다. 원본 field key는 접두어로 유지해 React key와
                  // 추후 편집 API 매핑이 서로 충돌하지 않게 합니다.
                  if (shouldSplitIntoFields) {
                    return parsedParts.map(({ sectionTitle, part }, partIndex) => {
                      const explicitLabels = [sectionTitle, part.label]
                        .filter((label, index, labels): label is string => (
                          Boolean(label) && labels.indexOf(label) === index
                        ));
                      const label = explicitLabels.length > 0
                        ? explicitLabels.join(' · ')
                        : `${field.label} ${partIndex + 1}`;

                      return (
                        <div
                          className="item-spec-field is-parsed-field"
                          key={`${field.key}-part-${partIndex}`}
                        >
                          <div className="item-spec-field-label">
                            <span>{label}</span>
                            {field.required && partIndex === 0 && <em>필수</em>}
                          </div>
                          <strong>{part.value}</strong>
                        </div>
                      );
                    });
                  }

                  return [(
                    <div
                      className={`item-spec-field${isMissing ? ' is-missing' : ''}`}
                      key={field.key}
                    >
                      <div className="item-spec-field-label">
                        <span>{field.label}</span>
                        {field.required && <em>필수</em>}
                      </div>
                      <strong>{formatSpecificationValue(field)}</strong>
                    </div>
                  )];
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
