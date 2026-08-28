export type NavigationTab = 'dashboard' | 'item-register' | 'mr-list' | 'vendor-select' | 'po-manage';

export interface Item {
  id: string;
  itemCode: string;
  department: string;
  itemName: string;
  specSummary: string;
  fullSpec: {
    dimensions: string;
    material: string;
    operatingTemp: string;
    pressureRating: string;
    manufacturer: string;
    notes: string;
  };
  maintainStock: boolean;
  isFixedAsset: boolean;
  attributes: {
    heatResistant: boolean;
    highPressure: boolean;
    isoCertified: boolean;
    waterproof: boolean;
    customizable: boolean;
  };
  registeredDate: string;
  status: '승인' | '승인대기' | '반려';
  rejectReason?: string;
}

export interface MaterialRequest {
  id: string;
  mrNo: string;
  department: string;
  requester: string;
  itemCode: string;
  category: string;
  itemName: string;
  specSummary: string;
  fullSpecText: string;
  hasAttachment: boolean;
  attachmentCount: number;
  attachmentFiles: string[];
  unitPrice: number;
  totalPrice: number;
  quantity?: number;
  dueDate: string; // YYYY-MM-DD
  dDay: number;
  isUrgent: boolean;
  status: '승인' | '승인대기' | '반려';
  rejectReason?: string;
  revisionRound?: number;
  returnedFromSupplier?: boolean;
  returnReason?: string;
  reviewHistory?: MRReviewHistoryEntry[];
  // Progress stages
  processStage: {
    approval: '완료' | '진행중' | '대기';
    quotationProgressPercent: number; // e.g. 75 (%)
    prSupplierApproved: '승인' | '거절' | '대기';
    poCreated: boolean;
  };
}

export type MRReviewHistoryType = 'buyer_rejection' | 'supplier_return';

export interface MRReviewHistoryEntry {
  id: string;
  round: number;
  type: MRReviewHistoryType;
  reason: string;
  source: string;
  occurredAt: string;
}

export interface SupplierQuotation {
  supplierId: string;
  supplierName: string;
  quoteUnitPrice: number;
  quoteTotalPrice: number;
  leadTimeDays: number;
  isResponded: boolean;
  resContent: string;
  resAttachments: string[];
  aiRank: number;
  aiScore: number;
  aiReason: string;
  isSelected: boolean;
}

export interface VendorSelectionHistoryEntry {
  id: string;
  round: number;
  supplierId: string;
  supplierName: string;
  prNo: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  selectedAt: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
}

export interface VendorSelectionGroup {
  id: string;
  mrNo: string;
  itemName: string;
  itemCode: string;
  department: string;
  quantity: number;
  unit: string;
  targetDueDate: string;
  deadlineDate: string; // YYYY-MM-DD
  deadlineTime: string; // HH:mm
  deadlineDDay: number;
  isExtended?: boolean;
  quotations: SupplierQuotation[];
  selectedSupplierId?: string;
  supplierApprovalStatus?: 'approved' | 'rejected' | 'pending';
  selectionRound?: number;
  selectionHistory?: VendorSelectionHistoryEntry[];
  prSent: boolean;
  prNo?: string;
}

export interface POItem {
  id: string;
  prNo: string;
  mrNo: string;
  itemName: string;
  itemCode: string;
  department: string;
  selectedSupplier: string;
  totalAmount: number;
  dueDate: string;
  supplierApprovalStatus: 'approved' | 'rejected' | 'pending';
  rejectReason?: string;
  poCreated: boolean;
  poNo?: string;
  createdDate?: string;
}

export interface AiLog {
  id: string;
  time: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  detail: string;
  mrNo?: string;
}

export interface ProcurementNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  targetTab: NavigationTab;
  reference?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

export interface GlobalSearchResult {
  id: string;
  type: 'item' | 'mr';
  title: string;
  subtitle: string;
  searchValue: string;
  targetTab: NavigationTab;
}
