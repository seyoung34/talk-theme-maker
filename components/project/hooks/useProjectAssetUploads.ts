"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { inferAdminAssetKind, listRecommendedAssetCandidatePage, type AdminAssetCandidate, type AdminAssetKind } from "@/lib/theme/adminAssets";
import { getAdminAssetRecommendationPool } from "@/lib/theme/adminAssetWorkspace";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

const recommendedPoolCacheTtlMs = 5 * 60 * 1000;
const recommendedPoolRequestTimeoutMs = 30 * 1000;
const recommendedPoolCacheMaxEntries = 12;

type RecommendedAdminAsset = AdminAssetCandidate & {
  readonly thumbnailUrl?: string;
  readonly recommendationContext?: AdminAssetLoadContext;
};

type ProjectNotice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

type UseProjectAssetUploadsOptions = {
  platform: ThemePlatform;
  selectedSlot: ThemeAssetSlot | undefined;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
};

type AdminAssetLoadContext = {
  readonly poolKey: string;
  readonly platform: ThemePlatform;
  readonly assetKind: AdminAssetKind;
  readonly slotRole: ThemeResourceRole;
};

type AdminAssetPoolEntry = {
  readonly context: AdminAssetLoadContext;
  readonly items: readonly RecommendedAdminAsset[];
  readonly nextCursor?: string;
  readonly status: "loading" | "ready" | "error";
  readonly loadedAt: number;
  readonly lastAccessedAt: number;
  readonly requestStartedAt?: number;
  readonly requestId: number;
};

function isReusablePoolEntry(entry: AdminAssetPoolEntry | undefined, now: number): entry is AdminAssetPoolEntry {
  if (!entry || entry.status === "error") return false;
  if (entry.status === "loading") return now - (entry.requestStartedAt ?? 0) < recommendedPoolRequestTimeoutMs;
  return now - entry.loadedAt < recommendedPoolCacheTtlMs;
}

function pruneRecommendedPoolCache(cache: Map<string, AdminAssetPoolEntry>, protectedKey: string) {
  while (cache.size > recommendedPoolCacheMaxEntries) {
    const oldest = [...cache.entries()]
      .filter(([key, entry]) => key !== protectedKey && (entry.status !== "loading" || !isReusablePoolEntry(entry, Date.now())))
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0];
    if (!oldest) return;
    cache.delete(oldest[0]);
  }
}

export function useProjectAssetUploads({ platform, selectedSlot, setNotice }: UseProjectAssetUploadsOptions) {
  const poolCacheRef = useRef(new Map<string, AdminAssetPoolEntry>());
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const currentPoolKeyRef = useRef<string | undefined>(undefined);
  const setNoticeRef = useRef(setNotice);
  const [, setCacheRevision] = useState(0);

  useEffect(() => {
    setNoticeRef.current = setNotice;
  }, [setNotice]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selectedSlotRole = selectedSlot?.role;
  const selectedAssetKind = selectedSlot && selectedSlot.kind !== "color" ? inferAdminAssetKind(selectedSlot) : undefined;
  const currentLoadContext = useMemo<AdminAssetLoadContext | null>(() => {
    if (!selectedAssetKind || !selectedSlotRole) return null;
    const pool = getAdminAssetRecommendationPool({ role: selectedSlotRole, kind: selectedAssetKind }, platform);
    return { poolKey: pool.key, platform, assetKind: selectedAssetKind, slotRole: selectedSlotRole };
  }, [platform, selectedAssetKind, selectedSlotRole]);
  /**
   * 비동기 오류가 슬롯 전환 직후 도착해도 현재 풀에만 알림을 띄우기 위한 latest-value ref다.
   *
   * 렌더 중에 쓰면 커밋되지 않은 렌더(중단된 concurrent 렌더, StrictMode 이중 호출)의 풀 키가
   * 남아 알림이 엉뚱한 풀로 간다. 그렇다고 passive effect로 미루면 커밋과 effect flush 사이가
   * 비는데, 방금 떠난 풀의 요청이 하필 그 틈에 실패하면 여전히 엉뚱한 풀 키로 판정한다.
   * 커밋 직후 동기적으로 도는 layout effect가 그 창을 닫는다.
   */
  useLayoutEffect(() => {
    currentPoolKeyRef.current = currentLoadContext?.poolKey;
  }, [currentLoadContext]);

  const currentEntry = currentLoadContext ? poolCacheRef.current.get(currentLoadContext.poolKey) : undefined;
  const visibleEntry = currentEntry?.status !== "error" ? currentEntry : undefined;
  const adminAssetsWithPreview = useMemo(
    () => visibleEntry?.items.map((asset) => ({ ...asset, previewUrl: asset.previewUrl ?? "" })) ?? [],
    [visibleEntry],
  );
  const adminAssetCursor = visibleEntry?.nextCursor;
  const isLoadingAdminAssets = visibleEntry?.status === "loading";

  useEffect(() => {
    if (!currentLoadContext) return;

    const now = Date.now();
    const cached = poolCacheRef.current.get(currentLoadContext.poolKey);
    if (isReusablePoolEntry(cached, now)) {
      poolCacheRef.current.set(currentLoadContext.poolKey, { ...cached, context: currentLoadContext, lastAccessedAt: now });
      return;
    }

    const requestId = ++requestIdRef.current;
    poolCacheRef.current.set(currentLoadContext.poolKey, {
      context: currentLoadContext,
      items: [],
      status: "loading",
      loadedAt: 0,
      lastAccessedAt: now,
      requestStartedAt: now,
      requestId,
    });
    setCacheRevision((current) => current + 1);

    listRecommendedAssetCandidatePage({
      platform: currentLoadContext.platform,
      assetKind: currentLoadContext.assetKind,
      slotRole: currentLoadContext.slotRole,
      limit: 24,
    })
      .then((page) => {
        if (!mountedRef.current) return;
        const entry = poolCacheRef.current.get(currentLoadContext.poolKey);
        if (!entry || entry.requestId !== requestId) return;
        const completedAt = Date.now();
        poolCacheRef.current.set(currentLoadContext.poolKey, {
          context: currentLoadContext,
          items: page.items.map((item) => ({ ...item, recommendationContext: currentLoadContext })),
          nextCursor: page.nextCursor,
          status: "ready",
          loadedAt: completedAt,
          lastAccessedAt: completedAt,
          requestId,
        });
        pruneRecommendedPoolCache(poolCacheRef.current, currentLoadContext.poolKey);
        setCacheRevision((current) => current + 1);
      })
      /**
       * 실패는 풀에 기록만 하고 여기서 다시 요청하지 않는다.
       *
       * 같은 풀 안에서 슬롯만 바뀐 경우 클라이언트는 `slotRole`을 풀 대표 역할로 정규화해 보내므로,
       * 재요청 URL이 방금 실패한 것과 바이트단위로 같다. 그래서 거의 항상 같이 실패하고 똑같은 알림만
       * 한 번 더 띄운다. error 풀은 재사용 대상이 아니므로, 다음 슬롯 전환이나 풀 재진입이
       * 자연스럽게 다시 요청한다.
       */
      .catch((error) => {
        if (!mountedRef.current) return;
        const entry = poolCacheRef.current.get(currentLoadContext.poolKey);
        if (!entry || entry.requestId !== requestId) return;
        console.error(error);
        poolCacheRef.current.set(currentLoadContext.poolKey, { ...entry, status: "error" });
        if (currentPoolKeyRef.current === currentLoadContext.poolKey) {
          setNoticeRef.current({ tone: "error", message: "추천 에셋을 불러오지 못했습니다." });
        }
        setCacheRevision((current) => current + 1);
      });
  }, [currentLoadContext]);

  const loadMoreAdminAssets = useCallback(async () => {
    if (!currentLoadContext) return;
    const entry = poolCacheRef.current.get(currentLoadContext.poolKey);
    if (!entry || entry.status !== "ready" || !entry.nextCursor) return;

    const requestId = ++requestIdRef.current;
    const cursor = entry.nextCursor;
    const requestStartedAt = Date.now();
    poolCacheRef.current.set(currentLoadContext.poolKey, { ...entry, status: "loading", requestId, requestStartedAt, lastAccessedAt: requestStartedAt });
    setCacheRevision((current) => current + 1);
    try {
      const page = await listRecommendedAssetCandidatePage({
        platform: currentLoadContext.platform,
        assetKind: currentLoadContext.assetKind,
        slotRole: currentLoadContext.slotRole,
        cursor,
        limit: 24,
      });
      if (!mountedRef.current) return;
      const pending = poolCacheRef.current.get(currentLoadContext.poolKey);
      if (!pending || pending.requestId !== requestId) return;
      const existingIds = new Set(pending.items.map((item) => item.id));
      const completedAt = Date.now();
      poolCacheRef.current.set(currentLoadContext.poolKey, {
        ...pending,
        context: currentLoadContext,
        items: [
          ...pending.items,
          ...page.items
            .filter((item) => !existingIds.has(item.id))
            .map((item) => ({ ...item, recommendationContext: currentLoadContext })),
        ],
        nextCursor: page.nextCursor,
        status: "ready",
        loadedAt: completedAt,
        lastAccessedAt: completedAt,
      });
      pruneRecommendedPoolCache(poolCacheRef.current, currentLoadContext.poolKey);
      setCacheRevision((current) => current + 1);
    } catch (error) {
      if (!mountedRef.current) return;
      const pending = poolCacheRef.current.get(currentLoadContext.poolKey);
      if (!pending || pending.requestId !== requestId) return;
      console.error(error);
      poolCacheRef.current.set(currentLoadContext.poolKey, { ...pending, status: "ready" });
      if (currentPoolKeyRef.current === currentLoadContext.poolKey) {
        setNoticeRef.current({ tone: "error", message: "추천 에셋을 더 불러오지 못했습니다." });
      }
      setCacheRevision((current) => current + 1);
    }
  }, [currentLoadContext]);

  return {
    adminAssetCursor,
    adminAssetsWithPreview,
    isLoadingAdminAssets,
    loadMoreAdminAssets,
  };
}
