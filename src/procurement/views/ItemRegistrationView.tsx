import React, { useEffect, useMemo, useState } from 'react';
import type { Item } from '../types';
import {
  PackagePlus,
  ArrowUpDown,
  Eye,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  CheckCircle
} from 'lucide-react';
import { RejectReasonModal } from '../components/RejectReasonModal';
import { getSpecificationSearchText } from '../utils/itemSpecifications';

interface ItemRegistrationViewProps {
  items: Item[];
  searchQuery: string;
  onOpenSpecModal: (item: Item) => void;
  onAddItem: (item: Item) => void;
  onApproveItem: (id: string) => void;
  onRejectItem: (id: string, reason: string) => void;
}

const PAGE_SIZE = 25;

export const ItemRegistrationView: React.FC<ItemRegistrationViewProps> = ({
  items,
  searchQuery,
  onOpenSpecModal,
  onAddItem,
  onApproveItem,
  onRejectItem,
}) => {
  // 3-1) 아이템코드 별 오름차순/내림차순 정렬 상태
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [rejectingItem, setRejectingItem] = useState<{ id: string; itemCode: string } | null>(null);

  // New Item Form state
  const [newItemCode, setNewItemCode] = useState(`ITEM-00${items.length + 1}`);
  const [newDepartment, setNewDepartment] = useState('생산1팀');
  const [newItemName, setNewItemName] = useState('');
  const [newSpecSummary, setNewSpecSummary] = useState('');
  const [newMaintainStock, setNewMaintainStock] = useState(true);
  const [newIsFixedAsset, setNewIsFixedAsset] = useState(false);
  const [attrHeat, setAttrHeat] = useState(false);
  const [attrPressure, setAttrPressure] = useState(false);
  const [attrIso, setAttrIso] = useState(true);
  const [attrWater, setAttrWater] = useState(false);

  // 3-1) 아이템코드 정렬 적용
  const sortedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR');
    return items
      .filter((item) => !normalizedQuery || [
        item.itemCode,
        item.department,
        item.itemName,
        item.specSummary,
        getSpecificationSearchText(item),
        item.status,
      ].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery)))
      .sort((a, b) => sortAsc
        ? a.itemCode.localeCompare(b.itemCode)
        : b.itemCode.localeCompare(a.itemCode));
  }, [items, searchQuery, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedItems]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortAsc]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newSpecSummary.trim()) {
      alert('품목명과 규격을 모두 입력해 주세요.');
      return;
    }

    const created: Item = {
      id: `ITEM-${Date.now()}`,
      itemCode: newItemCode,
      department: newDepartment,
      itemName: newItemName,
      specSummary: newSpecSummary,
      specifications: [
        { key: 'specification_summary', label: '요청 규격', value: newSpecSummary, group: '기본 규격', order: 10, required: true, source: 'mock' },
        { key: 'material', label: '재질 / 소재', value: '표준 합금/스틸', group: '기본 규격', order: 20, source: 'mock' },
        { key: 'operating_temp', label: '작동 온도 범위', value: '-10 ~ 100', unit: '°C', group: '성능 조건', order: 30, source: 'mock' },
        { key: 'pressure_rating', label: '정격 압력 / 등급', value: '표준 10K', group: '성능 조건', order: 40, source: 'mock' },
        { key: 'manufacturer', label: '권장 제조사', value: 'SKN 인증 공급업체', group: '조달 정보', order: 50, source: 'mock' },
        { key: 'heat_resistant', label: '내열성', value: attrHeat, valueType: 'boolean', group: 'Item Attributes', order: 110, source: 'mock' },
        { key: 'high_pressure', label: '고압용', value: attrPressure, valueType: 'boolean', group: 'Item Attributes', order: 120, source: 'mock' },
        { key: 'iso_certified', label: 'ISO 인증', value: attrIso, valueType: 'boolean', group: 'Item Attributes', order: 130, source: 'mock' },
        { key: 'waterproof', label: '방수', value: attrWater, valueType: 'boolean', group: 'Item Attributes', order: 140, source: 'mock' },
      ],
      fullSpec: {
        dimensions: newSpecSummary,
        material: '표준 합금/스틸',
        operatingTemp: '-10°C ~ 100°C',
        pressureRating: '표준 10K',
        manufacturer: 'SKN 인증 공급업체',
        notes: '신규 등록 아이템. 자재 검수 필요.',
      },
      maintainStock: newMaintainStock,
      isFixedAsset: newIsFixedAsset,
      attributes: {
        heatResistant: attrHeat,
        highPressure: attrPressure,
        isoCertified: attrIso,
        waterproof: attrWater,
        customizable: false,
      },
      registeredDate: new Date().toISOString().split('T')[0],
      status: '승인대기',
    };

    onAddItem(created);
    setShowAddModal(false);
    setNewItemName('');
    setNewSpecSummary('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Controls */}
      <div className="filter-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-outline"
            onClick={() => setSortAsc(!sortAsc)}
          >
            <ArrowUpDown size={16} />
            <span>아이템코드 순서 정렬: {sortAsc ? '오름차순 (A-Z ▲)' : '내림차순 (Z-A ▼)'}</span>
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            표시 아이템: <strong style={{ color: 'var(--text-main)' }}>{sortedItems.length}</strong> / {items.length}건
          </span>
        </div>

        <button
          className="btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} />
          <span>신규 아이템 코드 등록</span>
        </button>
      </div>

      {/* 3-1 & 3-2) Item Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              {/* 3-1) 아이템코드 */}
              <th>아이템코드</th>
              {/* 3-2) 요청부서 */}
              <th>요청부서</th>
              {/* 품목명 */}
              <th>품목명</th>
              {/* 규격 (클릭 시 전체보기) */}
              <th>규격 (클릭 시 전체보기)</th>
              {/* Maintain Stock */}
              <th>Maintain Stock</th>
              {/* Is Fixed Asset */}
              <th>Is Fixed Asset</th>
              {/* Item Attributes */}
              <th>Item Attributes 체크 항목</th>
              {/* 승인 / 반려 단계 */}
              <th>단계 (승인 / 반려)</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.id}>
                {/* 3-1) 아이템코드 */}
                <td>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                    {item.itemCode}
                  </span>
                </td>
                {/* 3-2) 요청부서 */}
                <td>{item.department}</td>
                {/* 품목명 */}
                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.itemName}</td>
                {/* 규격: 클릭해서 전체 내용을 볼 수 있게 버튼화 */}
                <td>
                  <button className="spec-clickable-btn" onClick={() => onOpenSpecModal(item)}>
                    <Eye size={13} />
                    <span>{item.specSummary}</span>
                  </button>
                </td>
                {/* Maintain Stock 여부 */}
                <td>
                  {item.maintainStock ? (
                    <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Yes
                    </span>
                  ) : (
                    <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={12} /> No
                    </span>
                  )}
                </td>
                {/* Is Fixed Asset 여부 */}
                <td>
                  {item.isFixedAsset ? (
                    <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Yes
                    </span>
                  ) : (
                    <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={12} /> No
                    </span>
                  )}
                </td>
                {/* Item Attributes 체크 태그 목록 */}
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {item.attributes.heatResistant && (
                      <span className="badge badge-purple" style={{ fontSize: '10px' }}>내열성</span>
                    )}
                    {item.attributes.highPressure && (
                      <span className="badge badge-red" style={{ fontSize: '10px' }}>고압용</span>
                    )}
                    {item.attributes.isoCertified && (
                      <span className="badge badge-green" style={{ fontSize: '10px' }}>ISO인증</span>
                    )}
                    {item.attributes.waterproof && (
                      <span className="badge badge-blue" style={{ fontSize: '10px' }}>방수</span>
                    )}
                  </div>
                </td>
                {/* 승인 / 반려 행 & 사유 */}
                <td>
                  {item.status === '승인' && (
                    <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={13} /> 승인 완료
                    </span>
                  )}
                  {item.status === '반려' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <XCircle size={13} /> 반려됨
                      </span>
                      {item.rejectReason && (
                        <span
                          style={{ fontSize: '11px', color: 'var(--danger)', maxWidth: '160px', wordBreak: 'break-all' }}
                          title={`반려 사유: ${item.rejectReason}`}
                        >
                          사유: {item.rejectReason}
                        </span>
                      )}
                    </div>
                  )}
                  {item.status === '승인대기' && (
                    <div className="action-btn-group">
                      <button className="btn-sm btn-approve" onClick={() => onApproveItem(item.id)}>
                        승인
                      </button>
                      <button className="btn-sm btn-reject" onClick={() => setRejectingItem({ id: item.id, itemCode: item.itemCode })}>
                        반려
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty-state">
                  {searchQuery ? `“${searchQuery}”에 일치하는 아이템이 없습니다.` : '등록 검토할 아이템이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sortedItems.length > 0 && (
        <div className="pagination-bar" aria-label="아이템 목록 페이지 이동">
          <span>페이지 {currentPage} / {totalPages} · 페이지당 {PAGE_SIZE}건</span>
          <div>
            <button type="button" className="btn-outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>
              이전
            </button>
            <button type="button" className="btn-outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)}>
              다음
            </button>
          </div>
        </div>
      )}

      {/* Item Reject Reason Modal */}
      {rejectingItem && (
        <RejectReasonModal
          title="아이템 등록 반려"
          itemNo={rejectingItem.itemCode}
          onConfirm={(reason) => {
            onRejectItem(rejectingItem.id, reason);
            setRejectingItem(null);
          }}
          onClose={() => setRejectingItem(null)}
        />
      )}

      {/* Add New Item Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PackagePlus size={20} color="var(--primary)" />
                <h3>신규 아이템 코드 생성</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>아이템 코드</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newItemCode}
                      onChange={(e) => setNewItemCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>요청 부서</label>
                    <select
                      className="form-input"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                    >
                      <option value="생산1팀">생산1팀</option>
                      <option value="설비관리팀">설비관리팀</option>
                      <option value="전기제어팀">전기제어팀</option>
                      <option value="품질보증팀">품질보증팀</option>
                      <option value="자재관리팀">자재관리팀</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>품목명 (Item Name)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 고압 유압실린더 HSC-500"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>규격 (Specifications)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="예: stroke 400mm / 250bar 정격 / 특수 바이톤 씰"
                    value={newSpecSummary}
                    onChange={(e) => setNewSpecSummary(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Stock / Asset 관리 설정</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newMaintainStock}
                          onChange={(e) => setNewMaintainStock(e.target.checked)}
                        />
                        Maintain Stock (재고 관리 품목)
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newIsFixedAsset}
                          onChange={(e) => setNewIsFixedAsset(e.target.checked)}
                        />
                        Is Fixed Asset (고정 자산)
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Item Attributes 체크 항목</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={attrHeat} onChange={(e) => setAttrHeat(e.target.checked)} />
                        내열성 (Heat Resistant)
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={attrPressure} onChange={(e) => setAttrPressure(e.target.checked)} />
                        고압용 (High Pressure)
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={attrIso} onChange={(e) => setAttrIso(e.target.checked)} />
                        ISO 인증 (ISO Certified)
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={attrWater} onChange={(e) => setAttrWater(e.target.checked)} />
                        방수 (Waterproof)
                      </label>
                    </div>
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>
                  취소
                </button>
                <button type="submit" className="btn-primary">
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
