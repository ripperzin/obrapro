/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

// Carimbo dia/hora da build, injetado pelo vite.config (define). Aparece no
// cabeçalho do app pra dar pra ler qual versão está rodando no aparelho.
declare const __BUILD_ID__: string;
