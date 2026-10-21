export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let state: { prompt: InstallPromptEvent | null; installed: boolean } = {
  prompt: null,
  installed: false,
};
const serverState = state;
const listeners = new Set<() => void>();
export const installSnapshot = () => state;
export const serverInstallSnapshot = () => serverState;
export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function updateInstall(prompt: InstallPromptEvent | null, installed = state.installed) {
  state = { prompt, installed };
  for (const listener of listeners) listener();
}
