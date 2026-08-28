"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { inferAdminAssetKind, listRecommendedAssetCandidatePage, type AdminAssetCandidate, type AdminAssetKind } from "@/lib/theme/adminAssets";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

/**
 * 추천 API 응답 항목.
 *
 * `thumbnailUrl`은 R2 축소본이 있을 때만 붙는다. 타일은 이걸 그리고, 원본(`previewUrl`)은
 * 이미지 편집기를 열 때만 받는다. 없으면 화면이 기존대로 `previewUrl`로 그린다.
 */
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
  readonly platform: ThemePlatform;
  readonly assetKind: AdminAssetKind;
  readonly slotRole: string;
};

function isSameAdminAssetLoadContext(left: AdminAssetLoadContext | null, right: AdminAssetLoadContext) {
  if (!left || left.platform !== right.platform || left.assetKind !== right.assetKind) return false;
  // 네 기본 말풍선은 하나의 추천 풀을 공유한다. 그 밖의 kind는 slotRole까지 일치해야
  // 이전 요청의 결과를 다른 슬롯에 재사용하지 않는다.
  return right.assetKind === "bubble" || left.slotRole === right.slotRole;
}

export function useProjectAssetUploads({ platform, selectedSlot, setNotice }: UseProjectAssetUploadsOptions) {
    // thumbnailUrl은 추천 API가 R2 축소본이 있을 때만 붙인다. 없으면 화면이 previewUrl로 그린다.
  const [adminAssets, setAdminAssets] = useState<RecommendedAdminAsset[]>([]);
  const [adminAssetCursor, setAdminAssetCursor] = useState<string>();
  const [isLoadingAdminAssets, setIsLoadingAdminAssets] = useState(false);
  /** 마지막으로 성공적으로 완료된 추천 요청의 컨텍스트. pending/실패 요청은 기록하지 않는다. */
  const [loadedFor, setLoadedFor] = useState<AdminAssetLoadContext | null>(null);
  const setNoticeRef = useRef(setNotice);

  useEffect(() => {
    setNoticeRef.current = setNotice;
  }, [setNotice]);

  const selectedSlotRole = selectedSlot?.role;
  const selectedAssetKind = selectedSlot && selectedSlot.kind !== "color" ? inferAdminAssetKind(selectedSlot) : undefined;
  const currentLoadContext = useMemo(
    () => selectedAssetKind && selectedSlotRole
      ? { platform, assetKind: selectedAssetKind, slotRole: selectedSlotRole }
      : null,
    [platform, selectedAssetKind, selectedSlotRole],
  );
  const hasLoadedCurrentContext = Boolean(currentLoadContext && isSameAdminAssetLoadContext(loadedFor, currentLoadContext));

  const adminAssetsWithPreview = useMemo(
    () => hasLoadedCurrentContext ? adminAssets.map((asset) => ({ ...asset, previewUrl: asset.previewUrl ?? "" })) : [],
    [adminAssets, hasLoadedCurrentContext],
  );

  useEffect(() => {
    let active = true;
    if (!currentLoadContext) {
      setLoadedFor(null);
      setAdminAssets([]);
      setAdminAssetCursor(undefined);
      setIsLoadingAdminAssets(false);
      return () => { active = false; };
    }

    if (hasLoadedCurrentContext) {
      setIsLoadingAdminAssets(false);
      return () => { active = false; };
    }

    // 슬롯이 바뀌면 새 응답이 올 때까지 이전 후보와 cursor를 노출하지 않는다.
    setAdminAssets([]);
    setAdminAssetCursor(undefined);
    setIsLoadingAdminAssets(true);
    listRecommendedAssetCandidatePage({
      platform: currentLoadContext.platform,
      assetKind: currentLoadContext.assetKind,
      slotRole: currentLoadContext.slotRole,
      limit: 24,
    })
      .then((page) => {
        if (!active) return;
        setAdminAssets(page.items.map((item) => ({ ...item, recommendationContext: currentLoadContext })));
        setAdminAssetCursor(page.nextCursor);
        setLoadedFor(currentLoadContext);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        setLoadedFor(null);
        setAdminAssets([]);
        setAdminAssetCursor(undefined);
        setNoticeRef.current({ tone: "error", message: "추천 에셋을 불러오지 못했습니다." });
      })
      .finally(() => { if (active) setIsLoadingAdminAssets(false); });
    return () => { active = false; };
  }, [currentLoadContext, hasLoadedCurrentContext]);

  const loadMoreAdminAssets = useCallback(async () => {
    if (!currentLoadContext || !hasLoadedCurrentContext || !adminAssetCursor || isLoadingAdminAssets) return;
    try {
      setIsLoadingAdminAssets(true);
      const page = await listRecommendedAssetCandidatePage({
        platform: currentLoadContext.platform,
        assetKind: currentLoadContext.assetKind,
        slotRole: currentLoadContext.slotRole,
        cursor: adminAssetCursor,
        limit: 24,
      });
      setAdminAssets((current) => [
        ...current,
        ...page.items
          .filter((item) => !current.some((existing) => existing.id === item.id))
          .map((item) => ({ ...item, recommendationContext: currentLoadContext })),
      ]);
      setAdminAssetCursor(page.nextCursor);
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "추천 에셋을 더 불러오지 못했습니다." });
    } finally {
      setIsLoadingAdminAssets(false);
    }
  }, [adminAssetCursor, currentLoadContext, hasLoadedCurrentContext, isLoadingAdminAssets, setNotice]);

  return {
    adminAssetCursor,
    adminAssetsWithPreview,
    isLoadingAdminAssets,
    loadMoreAdminAssets,
  };
}
