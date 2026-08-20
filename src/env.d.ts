/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    auth(): {
      userId: string | null;
      sessionId: string | null;
    };
  }
}

declare global {
  interface Window {
    openPluginModal?: (plugin: any) => void;
    __preferences?: any;
    __favorites?: any;
    refreshFavoritesUI?: () => void;
  }
}

export {};
