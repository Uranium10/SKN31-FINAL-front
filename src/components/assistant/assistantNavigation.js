// A shortcut only changes the displayed tab/search. Existing workspace and API
// permission checks still own access; this must never invoke a business action.
export const ASSISTANT_TARGETS = Object.freeze([
  'dashboard', 'item-register', 'mr-list', 'vendor-select', 'po-manage',
  'company-policy', 'ai-decision-log',
]);

// A precise MR destination uses the existing focused-row filter, not a global
// text search (the supplier/PO tables have their own independent filters).
export function focusedMRReference(target, reference) {
  if (!['mr-list', 'vendor-select', 'po-manage'].includes(target)
    || typeof reference !== 'string') return null;
  const value = reference.trim().toUpperCase();
  return /^MAT-MR-\d{4}-\d+$/.test(value) ? value : null;
}

export function assistantNavigationCommand(action) {
  if (!action || !['navigate', 'navigate_with_filters'].includes(action.type)
    || !ASSISTANT_TARGETS.includes(action.target)) return null;
  const search = action.search_query || action.highlight_reference || '';
  const focusedMrNo = focusedMRReference(action.target, action.highlight_reference)
    || focusedMRReference(action.target, search);
  return {
    type: 'navigate',
    value: action.target,
    searchQuery: typeof search === 'string' ? search : '',
    ...(focusedMrNo ? { focusedMrNo } : {}),
  };
}
