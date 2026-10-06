export const ASSISTANT_TARGETS: readonly string[];
export function focusedMRReference(target: string, reference: unknown): string | null;
export function assistantNavigationCommand(action: unknown): {
  type: 'navigate'; value: string; searchQuery: string; focusedMrNo?: string;
} | null;
