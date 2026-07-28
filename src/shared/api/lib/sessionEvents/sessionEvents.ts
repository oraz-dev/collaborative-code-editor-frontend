type SessionListener = () => void;

const expiryListeners = new Set<SessionListener>();

/**
 * Raised when a refresh attempt fails for good, i.e. the refresh cookie is gone
 * or rejected. The app provider listens and drops the user back to sign-in.
 * Kept as an event so the transport layer never has to import routing or state.
 */
export function emitSessionExpired(): void {
  expiryListeners.forEach((listener) => listener());
}

export function onSessionExpired(listener: SessionListener): () => void {
  expiryListeners.add(listener);
  return () => {
    expiryListeners.delete(listener);
  };
}
