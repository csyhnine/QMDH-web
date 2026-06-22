export const BIGJPG_PROVIDER_NAME = "bigjpg";

export const BIGJPG_DEFAULT_BASE_URL = "https://bigjpg.com/api";

export const BIGJPG_DOCS_URL = "https://bigjpg.com/api";

export type IntegrationMenuKey = "bigjpg";

export const integrationMenuItems: Array<{
  key: IntegrationMenuKey;
  label: string;
  description: string;
}> = [
  {
    key: "bigjpg",
    label: "高清放大",
    description: "历史卡片「放大」按钮使用的 AI 超分服务。",
  },
];
