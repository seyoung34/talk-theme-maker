"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { inferAdminAssetKind, listRecommendedAssetCandidatePage, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

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
  const [adminAssets, setAdminAssets] = useState<AdminAssetCandidate[]>([]);
  const [adminAssetCursor, setAdminAssetCursor] = useState<string>();
  const [isLoadingAdminAssets, setIsLoadingAdminAssets] = useState(false);

  const adminAssetsWithPreview = useMemo(
    () => adminAssets.map((asset) => ({ ...asset, previewUrl: asset.previewUrl ?? "" })),
    [adminAssets],
  );

  useEffect(() => {
    let active = true;
    if (!selectedSlot || selectedSlot.kind === "color") {
      setAdminAssets([]);
      setAdminAssetCursor(undefined);
      return () => { active = false; };
    }
    setIsLoadingAdminAssets(true);
    listRecommendedAssetCandidatePage({ platform, assetKind: inferAdminAssetKind(selectedSlot), slotRole: selectedSlot.role, limit: 24, enabledOnly: true })
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
