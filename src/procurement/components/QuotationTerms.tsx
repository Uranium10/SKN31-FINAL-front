/** Already classified supplier conditions, display only; never HTML execution. */
export function QuotationTerms({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <details style={{ marginTop: '6px' }}>
      <summary style={{
        display: 'list-item', width: 'fit-content', cursor: 'pointer',
        padding: '5px 10px', border: '1px solid var(--border-color)',
        borderRadius: '6px', color: 'var(--text-main)', fontWeight: 600,
      }}>
        특약사항
      </summary>
      <div style={{
        marginTop: '6px', padding: '10px', border: '1px solid var(--border-color)',
        borderRadius: '6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        color: 'var(--text-main)', fontWeight: 400, lineHeight: 1.6,
      }}>
        {text}
      </div>
    </details>
  );
}
