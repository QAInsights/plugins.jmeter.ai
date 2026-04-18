/// <reference types="astro/client" />

declare global {
    interface Window {
        openPluginModal?: (plugin: any) => void;
    }
}

export {};
