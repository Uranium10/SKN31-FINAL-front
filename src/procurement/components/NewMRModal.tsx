import React, { useMemo, useState } from 'react';
import { CalendarDays, FilePlus2, X } from 'lucide-react';
import type { Item, MaterialRequest } from '../types';

interface NewMRModalProps {
  items: Item[];
  onCreate: (request: MaterialRequest) => void;
  onClose: () => void;
}

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

export const NewMRModal: React.FC<NewMRModalProps> = ({ items, onCreate, onClose }) => {
  const defaultDueDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return formatDateInput(date);
  }, []);

  const [itemCode, setItemCode] = useState(items[0]?.itemCode ?? '');
  const [department, setDepartment] = useState(items[0]?.department ?? '구매팀');
  const [requester, setRequester] = useState('ERPNext 사용자');
  const [category, setCategory] = useState('일반 구매');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [isUrgent, setIsUrgent] = useState(false);
  const selectedItem = items.find((item) => item.itemCode === itemCode);

  const handleItemChange = (nextItemCode: string) => {
    const nextItem = items.find((item) => item.itemCode === nextItemCode);
    setItemCode(nextItemCode);
    if (nextItem) setDepartment(nextItem.department);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem || !requester.trim() || quantity < 1 || !dueDate) return;

    const now = new Date();
    const due = new Date(`${dueDate}T23:59:59`);
    const dDay = Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 86_400_000));
    const suffix = String(Date.now()).slice(-4);
    const mrNo = `MR-${now.getFullYear()}-${suffix}`;

    onCreate({
      id: mrNo,
      mrNo,
      department,
      requester: requester.trim(),
      itemCode: selectedItem.itemCode,
      category: category.trim() || '일반 구매',
      itemName: selectedItem.itemName,
      specSummary: selectedItem.specSummary,
      fullSpecText: [
        selectedItem.fullSpec.dimensions,
        selectedItem.fullSpec.material,
        selectedItem.fullSpec.operatingTemp,
        selectedItem.fullSpec.pressureRating,
        selectedItem.fullSpec.notes,
      ].filter(Boolean).join('\n'),
      hasAttachment: false,
      attachmentCount: 0,
      attachmentFiles: [],
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      dueDate,
      dDay,
      isUrgent,
      status: '승인대기',
      processStage: {
        approval: '진행중',
        quotationProgressPercent: 0,
        prSupplierApproved: '대기',
        poCreated: false,
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content new-mr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <FilePlus2 size={20} />
            <div>
              <h3>신규 MR 등록</h3>
              <p>ERPNext 자동 수신 전에도 시연할 수 있는 수동 등록 폼입니다.</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="신규 MR 창 닫기">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body new-mr-form">
            <div className="form-group form-span-2">
              <label htmlFor="new-mr-item">아이템</label>
              <select
                id="new-mr-item"
                className="form-input"
                value={itemCode}
                onChange={(event) => handleItemChange(event.target.value)}
                required
              >
                {items.map((item) => (
                  <option key={item.id} value={item.itemCode}>
                    {item.itemCode} · {item.itemName}
                  </option>
                ))}
              </select>
              {selectedItem && <small>{selectedItem.specSummary}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="new-mr-department">요청부서</label>
              <input id="new-mr-department" className="form-input" value={department} onChange={(event) => setDepartment(event.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="new-mr-requester">요청자</label>
              <input id="new-mr-requester" className="form-input" value={requester} onChange={(event) => setRequester(event.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="new-mr-category">카테고리</label>
              <input id="new-mr-category" className="form-input" value={category} onChange={(event) => setCategory(event.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="new-mr-quantity">수량</label>
              <input id="new-mr-quantity" className="form-input" type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required />
            </div>
            <div className="form-group">
              <label htmlFor="new-mr-price">예상 단가</label>
              <input id="new-mr-price" className="form-input" type="number" min="0" step="1000" value={unitPrice} onChange={(event) => setUnitPrice(Number(event.target.value))} />
            </div>
            <div className="form-group">
              <label htmlFor="new-mr-due-date">납기요청일</label>
              <div className="input-with-icon">
                <CalendarDays size={15} />
                <input id="new-mr-due-date" className="form-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </div>
            </div>
            <label className="checkbox-label form-span-2">
              <input type="checkbox" checked={isUrgent} onChange={(event) => setIsUrgent(event.target.checked)} />
              긴급 구매 요청으로 표시
            </label>
          </div>

          <div className="modal-footer">
            <div className="new-mr-total">
              예상 금액 <strong>₩{(unitPrice * quantity).toLocaleString()}</strong>
            </div>
            <button type="button" className="btn-outline" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary">MR 등록</button>
          </div>
        </form>
      </div>
    </div>
  );
};
