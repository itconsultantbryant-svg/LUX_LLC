/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_AI_ENGINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
