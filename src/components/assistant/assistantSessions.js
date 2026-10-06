// Account-mounted cache of server-owned conversations. No localStorage records.
export const MAX_SESSIONS = 20;
export const MAX_MESSAGES = 80;

export function createSession(id = crypto.randomUUID()) {
  return { id, title: '새 대화', updatedAt: new Date().toISOString(), messages: [], dialogue: null, draft: '' };
}

export function initialSessionState() {
  return { sessions: [], activeId: null, pendingId: null };
}

export function sessionReducer(state, action) {
  if (action.type === 'loadList') return { ...state, sessions: action.sessions.map(s => {
    const old = state.sessions.find(cached => cached.id === s.id);
    return old && (old.version ?? 0) > s.version ? old : { ...old, ...s, draft: old?.draft || '' };
  }) };
  if (action.type === 'hydrate') {
    const old = state.sessions.find(s => s.id === action.session.id);
    const keepPending = old && (state.pendingId === old.id || (old.version ?? 0) > action.session.version);
    return { ...state, activeId: action.session.id, sessions: [
      keepPending ? old : { ...action.session, draft: old?.draft || '' },
      ...state.sessions.filter(s => s.id !== action.session.id),
    ] };
  }
  if (action.type === 'delete') return { ...state,
    sessions: state.sessions.filter(s => s.id !== action.id),
    activeId: state.activeId === action.id ? null : state.activeId,
    pendingId: state.pendingId === action.id ? null : state.pendingId,
  };
  if (action.type === 'list') return { ...state, activeId: null };
  if (action.type === 'select') {
    return state.sessions.some((s) => s.id === action.id) ? { ...state, activeId: action.id } : state;
  }
  if (action.type === 'create') {
    if (state.sessions.length >= MAX_SESSIONS) return state;
    return { ...state, sessions: [action.session, ...state.sessions], activeId: action.session.id };
  }
  if (action.type === 'draft') {
    return { ...state, sessions: state.sessions.map((s) => s.id === action.id ? { ...s, draft: action.text } : s) };
  }
  if (action.type === 'send') {
    if (state.pendingId || !state.sessions.some((s) => s.id === action.id)) return state;
    return { ...state, pendingId: action.id, sessions: state.sessions.map((s) => s.id === action.id ? {
      ...s, draft: '', updatedAt: action.at,
      title: s.messages.length ? s.title : action.text.slice(0, 30),
      messages: [...s.messages, { sender: 'user', text: action.text }].slice(-MAX_MESSAGES),
    } : s) };
  }
  if (action.type === 'receive') {
    // Late/stale requests cannot write into a different session.
    if (state.pendingId !== action.id) return state;
    return { ...state, pendingId: null, sessions: state.sessions.map((s) => s.id === action.id ? {
      ...s, updatedAt: action.at,
      dialogue: action.response?.dialogue ?? s.dialogue,
      version: action.response?.meta?.session_version ?? s.version,
      messages: [...s.messages, { sender: 'agent', text: action.text, response: action.response, isError: action.isError }].slice(-MAX_MESSAGES),
    } : s) };
  }
  return state;
}
