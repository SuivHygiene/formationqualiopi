// État partagé de l'application (utilisateur connecté, organisme).
export const state = { user: null, organisme: null };

export const canWrite = () => ['admin', 'gestionnaire'].includes(state.user?.role);
export const isAdmin = () => state.user?.role === 'admin';
