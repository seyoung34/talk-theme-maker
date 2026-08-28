"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { listAdminAssetLibrary, type AdminAssetKind } from "@/lib/theme/adminAssets";
import {
  filterAdminAssetListItems,
  sortAdminAssetListItems,
  type AdminAssetListItem,
  type AdminAssetListSortKey,
} from "@/lib/theme/adminAssetList";

/**
 * `/admin/assets` 목록의 조회·검색·정렬 상태.
 *
 * 화면이 아니라 **데이터**만 다룬다. 경고 문구나 카드 배지처럼 슬롯 맥락이 필요한 계산은
 * 호출부에 남겨 두어야 이 훅이 manifest와 UI 문구에 묶이지 않는다.
 *
 * 정렬·검색이 훅 안에 있는 이유는 그것이 **전체 집합** 위에서 돌아야 하기 때문이다. 목록을
 * 페이지로 잘라 받던 시절에는 "이름순"이 로드된 페이지 안에서만 성립해 목록이 거짓말을 했다.
 * 종류 전체를 한 번에 받는 지금 구조와 정렬은 한 몸이라 같은 자리에 둔다.
 */
export type AdminAssetLibrary = {
  /** 서버가 준 원본 순서 그대로. 총 개수 표시와 낙관적 갱신이 이 배열을 본다. */
  readonly assets: readonly AdminAssetListItem[];
  /** 저장·삭제 직후 목록을 다시 받지 않고 그 자리만 고치기 위해 노출한다. */
  readonly setAssets: Dispatch<SetStateAction<AdminAssetListItem[]>>;
  /** 정렬·검색을 거친 결과. 카드가 그리는 순서다. */
  readonly visibleAssets: readonly AdminAssetListItem[];
  /**
   * 상한에 걸려 전체를 담지 못했는가.
   *
   * `true`면 화면은 총 개수와 정렬을 "전체 기준"으로 설명하면 안 된다.
   */
  readonly truncated: boolean;
  readonly isLoading: boolean;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly sort: AdminAssetListSortKey;
  readonly setSort: (value: AdminAssetListSortKey) => void;
  readonly refresh: () => Promise<void>;
};

export function useAdminAssetLibrary(input: {
  readonly assetKind: AdminAssetKind;
  readonly onError: (message: string) => void;
}): AdminAssetLibrary {
  const { assetKind, onError } = input;
  const [assets, setAssets] = useState<AdminAssetListItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AdminAssetListSortKey>("updated");
  const requestSeqRef = useRef(0);

  /**
   * 알림 콜백은 매 렌더 새 함수로 올 수 있다.
   *
   * `refresh`의 의존성에 그대로 두면 렌더마다 새 `refresh`가 만들어지고, 그걸 보는 effect가
   * 종류를 바꾸지 않았는데도 목록을 다시 받는다.
   */
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const refresh = useCallback(async () => {
    if (!assetKind) return;
    const seq = ++requestSeqRef.current;
    // 종류를 바꾸는 순간 이전 종류의 카드가 새 제목 아래 잠깐 보이지 않게 한다.
    setAssets([]);
    setTruncated(false);
    try {
      setIsLoading(true);
      const page = await listAdminAssetLibrary({ assetKind });
      // 종류를 빠르게 오갈 때 늦게 도착한 이전 응답이 현재 목록을 덮어쓰지 않게 한다.
      if (seq !== requestSeqRef.current) return;
      setAssets([...page.items]);
      setTruncated(page.truncated);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      console.error(error);
      onErrorRef.current("관리 후보를 불러오지 못했습니다.");
    } finally {
      if (seq === requestSeqRef.current) setIsLoading(false);
    }
  }, [assetKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleAssets = useMemo(
    () => filterAdminAssetListItems(sortAdminAssetListItems(assets, sort), search),
    [assets, search, sort],
  );

  return { assets, setAssets, visibleAssets, truncated, isLoading, search, setSearch, sort, setSort, refresh };
}
