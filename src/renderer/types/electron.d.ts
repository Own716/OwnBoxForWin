import { api } from '../../preload';

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
