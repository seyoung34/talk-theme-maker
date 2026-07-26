// @testing-library/jest-dom의 커스텀 matcher(toBeInTheDocument 등)를 vitest expect에 등록한다.
import "@testing-library/jest-dom/vitest";
// happy-dom은 IndexedDB를 제공하지 않는다. 사용자 템플릿·복구 draft·자동 저장이 모두 IndexedDB에
// 있으므로, 저장소 계약을 실제 트랜잭션으로 검증할 수 있도록 in-memory 구현을 붙인다.
import "fake-indexeddb/auto";
