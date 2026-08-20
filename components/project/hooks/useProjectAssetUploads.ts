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
type RecommendedAdminAsset = AdminAssetCandidate & { readonly thumbnailUrl?: string };

type ProjectNotice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

type UseProjectAssetUploadsOptions = {
  platform: ThemePlatform;
  selectedSlot: ThemeAssetSlot | undefined;
  setNotice: Dispatch<SetStateAction<ProjectNotice | null>>;
};

export function useProjectAssetUploads({ platform, selectedSlot, setNotice }: UseProjectAssetUploadsOptions) {
    // thumbnailUrl은 추천 API가 R2 축소본이 있을 때만 붙인다. 없으면 화면이 previewUrl로 그린다.
  const [adminAssets, setAdminAssets] = useState<RecommendedAdminAsset[]>([]);
  const [adminAssetCursor, setAdminAssetCursor] = useState<string>();
  const [isLoadingAdminAssets, setIsLoadingAdminAssets] = useState(false);
  /**
   * `bubble_me_1`/`bubble_me_2`/`bubble_you_1`/`bubble_you_2`는 추천 후보 풀을 공유한다 — recommend
   * API(`isCompatibleExactRole`)가 네 role을 서로 호환으로 취급해 같은 asset_kind="bubble" 행 집합을
   * 순서만 다르게 돌려준다. 이 안에서 슬롯만 바뀔 때 다시 요청하면 같은 이미지 집합을 새 signed URL로
   * 또 받아와, 목록이 매번 깜빡이며 다시 그려진다. 마지막으로 요청했던 (platform, assetKind)를 기억해
   * 두고 같은 조합이면 요청을 건너뛴다. bubble이 아닌 kind는 role별로 후보 집합이 실제로 달라질 수
   * 있으므로(예: theme_icon과 tab_icon_*는 같은 "icon" kind지만 서로 호환이 아니다) 이 단축은 bubble에만
   * 적용한다.
   */
  const fetchedForRef = useRef<{ platform: ThemePlatform; assetKind: AdminAssetKind } | null>(null);

  const adminAssetsWithPreview = useMemo(
    () => adminAssets.map((asset) => ({ ...asset, previewUrl: asset.previewUrl ?? "" })),
    [adminAssets],
  );

  useEffect(() => {
    let active = true;
    if (!selectedSlot || selectedSlot.kind === "color") {
      fetchedForRef.current = null;
      setAdminAssets([]);
      setAdminAssetCursor(undefined);
      return () => { active = false; };
    }

    const assetKind = inferAdminAssetKind(selectedSlot);
    const previous = fetchedForRef.current;
    if (assetKind === "bubble" && previous?.assetKind === "bubble" && previous.platform === platform) {
      return () => { active = false; };
    }

    fetchedForRef.current = { platform, assetKind };
    setIsLoadingAdminAssets(true);
    listRecommendedAssetCandidatePage({ platform, assetKind, slotRole: selectedSlot.role, limit: 24, enabledOnly: true })
      .then((page) => {
        if (!active) return;
        setAdminAssets(page.items);
        setAdminAssetCursor(page.nextCursor);
      })
      .catch((error) => console.error(error))
      .finally(() => { if (active) setIsLoadingAdminAssets(false); });
    return () => { active = false; };
  }, [platform, selectedSlot]);

  const loadMoreAdminAssets = useCallback(async () => {
    if (!selectedSlot || !adminAssetCursor || isLoadingAdminAssets) return;
    try {
      setIsLoadingAdminAssets(true);
      const page = await listRecommendedAssetCandidatePage({ platform, assetKind: inferAdminAssetKind(selectedSlot), slotRole: selectedSlot.role, cursor: adminAssetCursor, limit: 24, enabledOnly: true });
      setAdminAssets((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setAdminAssetCursor(page.nextCursor);
    } catch (error) {
      console.error(error);
      setNotice({ tone: "error", message: "추천 에셋을 더 불러오지 못했습니다." });
    } finally {
      setIsLoadingAdminAssets(false);
    }
  }, [adminAssetCursor, isLoadingAdminAssets, platform, selectedSlot, setNotice]);

  return {
    adminAssetCursor,
    adminAssetsWithPreview,
    isLoadingAdminAssets,
    loadMoreAdminAssets,
  };
}
