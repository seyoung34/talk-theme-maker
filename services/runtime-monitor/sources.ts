// 상태 모델과 문구 카탈로그가 함께 쓰는 감시 출처 목록. 서로를 import하지 않도록 따로 둔다.
export const sources = ["public_http", "session_http", "readiness", "cloudflare_runtime", "cloudflare_collector"] as const;
export type Source = typeof sources[number];
