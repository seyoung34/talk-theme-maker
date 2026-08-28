"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, ChevronDown, Edit3, ImagePlus, Library, LoaderCircle, PanelLeftClose, PanelLeftOpen, Pencil, Save, Search, SlidersHorizontal, X, Trash2 } from "lucide-react";
import { ImageEditDialog } from "@/components/image-editor/ImageEditDialog";
import { MobileBubbleEditor } from "@/components/editor/MobileBubbleEditor";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import { BubbleBuilderEditor } from "@/components/editor/BubbleBuilderDialog";
import AdminBubbleTextPreview from "@/components/admin/AdminBubbleTextPreview";
import {
  deleteAdminAssetCandidate,
  findSystemTemplatesUsingAdminAsset,
  getAdminAssetCandidate,
  listAdminAssetLibrary,
  adminAssetToFile,
  adminAssetBubbleDecorationToFile,
  bubbleAdjustmentToSpec,
  createDefaultBubbleAdjustment,
  describeAdminAssetAnalysis,
  getAdminAssetKindLabel,
  inferAdminAssetKind,
  legacyRoleFromKind,
  saveAdminAssetCandidate,
  saveAdminBubbleBuilderCandidate,
  updateAdminAssetCandidate,
  withAdminAssetPlatformVariant,
  type AdminAssetAnalysis,
  type AdminBubbleAdjustment,
  type AdminAssetCandidate,
  type AdminAssetKind,
  type AdminAssetTargetInput,
  type AdminBubbleSpec,
} from "@/lib/theme/adminAssets";
import { adminAssetListTileUrl, describeAdminAssetScope, filterAdminAssetListItems, getAdminAssetScopeLabel, isAdminAssetListSortKey, sortAdminAssetListItems, toAdminAssetListItem, type AdminAssetListItem, type AdminAssetListSortKey } from "@/lib/theme/adminAssetList";
import { bubbleSlotFromRole } from "@/lib/theme/project/state";
import { generateBubbleAsset, type BubbleFamilyDesignSpec, type GeneratedBubbleDesign } from "@/lib/theme/bubbleBuilder";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { BubbleGeometry, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

const assetKindOrder: AdminAssetKind[] = ["background", "icon", "bubble", "profile", "launcher", "passcode", "passcode_indicator"];

const ACCEPTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_LEFT_SIDEBAR_WIDTH = 208;
const MAX_LEFT_SIDEBAR_WIDTH = 420;
const MIN_RIGHT_SIDEBAR_WIDTH = 320;
const MAX_RIGHT_SIDEBAR_WIDTH = 560;

// 투명 영역을 흰색이 아닌 체커무늬로 표시하기 위한 배경 스타일.
const TRANSPARENCY_CHECKER_STYLE: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #dce1e5 25%, transparent 25%), linear-gradient(-45deg, #dce1e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #dce1e5 75%), linear-gradient(-45deg, transparent 75%, #dce1e5 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0",
};

type AdminBubbleBuilderDraft = {
  readonly recipe: BubbleFamilyDesignSpec;
  readonly decorations: Partial<Record<string, File>>;
  readonly variants: readonly GeneratedBubbleDesign[];
  readonly bubbleSpec: AdminBubbleSpec;
};

type AdminBubbleBuilderInitial = Pick<AdminBubbleBuilderDraft, "recipe" | "decorations">;
type BubbleWorkspaceMode = "library" | "adjust" | "builder";
type SidebarResize = { side: "left" | "right"; startX: number; startWidth: number };
type AdminBubblePreviewEdit = {
  geometry: BubbleGeometry;
  markers: Markers;
  insets: Insets;
  stretch: StretchPoint;
};

type PendingAdminAssetFileStatus = "queued" | "uploading" | "success" | "error";
type PendingAdminAssetFile = {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly status: PendingAdminAssetFileStatus;
  readonly error?: string;
};
type AdminAssetUploadProgress = {
  readonly total: number;
  readonly completed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly activeFileName?: string;
};

function pickValidImageFiles(files: FileList | File[] | null | undefined): { files: File[]; rejected: string[] } {
  const validFiles: File[] = [];
  const rejected: string[] = [];
  for (const file of Array.from(files ?? [])) {
    if (!file.type.startsWith("image/")) {
      rejected.push(`${file.name}: 이미지 파일만 추가할 수 있습니다.`);
      continue;
    }
    if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) {
      rejected.push(`${file.name}: PNG, JPEG, WebP 이미지만 지원합니다.`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push(`${file.name}: 이미지 용량은 20MB 이하만 추가할 수 있습니다.`);
      continue;
    }
    validFiles.push(file);
  }
  return { files: validFiles, rejected };
}

function createPendingAdminAssetFile(file: File): PendingAdminAssetFile {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "queued" };
}

function getAdminAssetFileKey(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export default function AdminAssetsClient() {
  const bubblePreviewPlatform: ThemePlatform = "android";
  const [assets, setAssets] = useState<AdminAssetListItem[]>([]);
  const [assetsTruncated, setAssetsTruncated] = useState(false);
  const [assetSort, setAssetSort] = useState<AdminAssetListSortKey>("updated");
  const [title, setTitle] = useState("");
  const [assetKind, setAssetKind] = useState<AdminAssetKind>("background");
  const [analysis, setAnalysis] = useState<AdminAssetAnalysis | null>(null);
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [bubbleGeometry, setBubbleGeometry] = useState<Partial<Record<ThemePlatform, BubbleGeometry>>>({});
  const [bubblePreviewEdits, setBubblePreviewEdits] = useState<Partial<Record<ThemePlatform, AdminBubblePreviewEdit>>>({});
  const [bubbleVariantFiles, setBubbleVariantFiles] = useState<Partial<Record<ThemePlatform, File>>>({});
  const [bubblePreviewText, setBubblePreviewText] = useState("안녕하세요! 말풍선 텍스트가 이렇게 보여요.");
  const [file, setFile] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingAdminAssetFile[]>([]);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<AdminAssetCandidate | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<AdminAssetListItem | null>(null);
  // 삭제 확인 창에 "이 에셋을 쓰는 템플릿"을 보여 준다. `null`은 아직 조회 중이라는 뜻이다.
  const [templatesUsingPendingDelete, setTemplatesUsingPendingDelete] = useState<string[] | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isLoadingEditAsset, setIsLoadingEditAsset] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<AdminAssetUploadProgress | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [imageEditOpen, setImageEditOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetGridColumns, setAssetGridColumns] = useState<3 | 4 | 5>(3);
  const [bubbleWorkspaceMode, setBubbleWorkspaceMode] = useState<BubbleWorkspaceMode>("library");
  const [bubbleBuilderDraft, setBubbleBuilderDraft] = useState<AdminBubbleBuilderDraft | null>(null);
  const [bubbleBuilderInitial, setBubbleBuilderInitial] = useState<AdminBubbleBuilderInitial | null>(null);
  const [bubbleGeometryMode, setBubbleGeometryMode] = useState<"generated" | "manual">("manual");
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(272);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(400);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<PendingAdminAssetFile[]>([]);
  const assetRequestSeqRef = useRef(0);
  const sidebarResizeRef = useRef<SidebarResize | null>(null);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => () => {
    for (const pending of pendingFilesRef.current) URL.revokeObjectURL(pending.previewUrl);
  }, []);

  const slots = useMemo(getUnifiedAdminAssetSlots, []);
  const slotGroups = useMemo(() => groupSlotsByAssetKind(slots), [slots]);
  const activeKindSlots = useMemo(() => slots.filter((slot) => inferAdminAssetKind(slot) === assetKind), [assetKind, slots]);
  // 등록 화면에서는 슬롯을 선택하지 않는다. 기존 저장 계약(slot_role)과 말풍선 편집기의
  // 기준 크기를 위해 kind별 첫 슬롯만 내부 대표값으로 사용한다.
  /**
   * 말풍선 편집기의 미리보기 기준 슬롯.
   *
   * **저장 값의 근거가 아니다.** 어느 슬롯에 적용될지는 target이 정하고(`selectedSaveTargets`),
   * `slot_role`은 아래 `saveSlotRole` 하나로 고정한다. 여기 남은 쓰임은 "내 말풍선 1"처럼
   * 편집기가 무엇을 그려 보일지 정하는 것뿐이다.
   */
  const bubbleAnchorSlot = activeKindSlots[0];
  /**
   * 저장할 `admin_assets.slot_role`.
   *
   * 슬롯 목록의 첫 항목을 쓰면 manifest에 슬롯이 추가·재정렬될 때 같은 kind의 저장값이 조용히
   * 바뀐다. kind마다 고정된 sentinel을 쓴다.
   */
  const saveSlotRole = legacyRoleFromKind(assetKind);
  // 말풍선 편집은 Android 9-patch 원본을 우선 기준으로 삼고, iOS 전용 원본만 있을 때만 iOS를 사용한다.
  // 저장 데이터에는 두 플랫폼의 geometry를 계속 보관하되, 화면에서 플랫폼을 번갈아 선택하게 하지 않는다.
  const bubbleEditorPlatform: ThemePlatform = bubbleVariantFiles.android ? "android" : bubbleVariantFiles.ios ? "ios" : "android";
  const adminBubbleSourceFile = bubbleVariantFiles[bubbleEditorPlatform] ?? file;
  const selectedBubbleSlot = bubbleAnchorSlot ? (bubbleSlotFromRole(bubbleAnchorSlot.role) ?? "me") : "me";
  const selectedBubbleEditorSlot = useMemo(
    () => bubbleAnchorSlot ? getThemeSlots(bubbleEditorPlatform).find((slot) => slot.role === bubbleAnchorSlot.role) ?? bubbleAnchorSlot : undefined,
    [bubbleEditorPlatform, bubbleAnchorSlot],
  );
  const selectedSaveTargets = useMemo(
    () => (bubbleBuilderDraft ? getAdminBubbleBuilderTargets() : getAdminAssetSaveTargets(assetKind)),
    [assetKind, bubbleBuilderDraft],
  );
  const effectiveBubbleAdjustment = useMemo<AdminBubbleAdjustment>(() => ({
    markers: bubblePreviewEdits.android?.markers ?? bubbleAdjustment.markers,
    insets: bubblePreviewEdits.ios?.insets ?? bubbleAdjustment.insets,
    stretch: bubblePreviewEdits.ios?.stretch ?? bubbleAdjustment.stretch,
  }), [bubbleAdjustment.insets, bubbleAdjustment.markers, bubbleAdjustment.stretch, bubblePreviewEdits]);
  const effectiveBubbleGeometry = useMemo(
    () => ({
      ...bubbleGeometry,
      ...(bubblePreviewEdits.android ? { android: bubblePreviewEdits.android.geometry } : {}),
      ...(bubblePreviewEdits.ios ? { ios: bubblePreviewEdits.ios.geometry } : {}),
    }),
    [bubbleGeometry, bubblePreviewEdits],
  );
  const bubbleSpec = useMemo(
    () => assetKind === "bubble" ? bubbleAdjustmentToSpec(effectiveBubbleAdjustment, effectiveBubbleGeometry) ?? bubbleBuilderDraft?.bubbleSpec : undefined,
    [assetKind, bubbleBuilderDraft, effectiveBubbleAdjustment, effectiveBubbleGeometry],
  );
  const bubblePreviewEdit = useMemo(() => ({
    geometry: effectiveBubbleGeometry[bubbleEditorPlatform],
    markers: effectiveBubbleAdjustment.markers,
    insets: effectiveBubbleAdjustment.insets,
    stretch: effectiveBubbleAdjustment.stretch,
  }), [bubbleEditorPlatform, effectiveBubbleAdjustment, effectiveBubbleGeometry]);
  const uploadableFiles = useMemo(() => pendingFiles.filter((pending) => pending.status !== "success"), [pendingFiles]);
  const uploadTotal = uploadProgress?.total ?? pendingFiles.length;
  const uploadCompleted = uploadProgress?.completed ?? 0;
  const uploadPercent = uploadTotal > 0 ? Math.min(100, Math.round((uploadCompleted / uploadTotal) * 100)) : 0;
  const showUploadProgress = pendingFiles.length > 1 || Boolean(uploadProgress);
  const canSaveAsset = Boolean(
    activeKindSlots.length > 0 &&
      !isSavingAsset &&
      (editingAsset ? title.trim() : bubbleBuilderDraft ? file : uploadableFiles.length > 0) &&
      (editingAsset || selectedSaveTargets.length > 0) &&
      (assetKind !== "bubble" || bubbleSpec),
  );
  /**
   * 목록 파생값.
   *
   * 서버가 이미 kind로 좁혀 **종류 전체**를 보내므로 여기서 다시 거르지 않는다. 정렬과 검색이
   * 전체 집합 위에서 도는 것이 이 화면의 요점이다 — 커서 페이지네이션 위에서는 "이름순"이
   * 로드된 페이지 안에서만 성립해 목록이 거짓말을 한다.
   */
  const sortedAssets = useMemo(() => sortAdminAssetListItems(assets, assetSort), [assets, assetSort]);
  const filteredAssets = useMemo(
    () =>
      filterAdminAssetListItems(sortedAssets, assetSearch).map((asset) => ({
        asset,
        warnings: getAdminAssetGuidanceForSlots(activeKindSlots, asset.assetKind ?? assetKind, asset.analysis ?? null, asset.fileName),
      })),
    [activeKindSlots, assetKind, assetSearch, sortedAssets],
  );
  const guidanceItems = useMemo(() => getAdminAssetGuidanceForSlots(activeKindSlots, assetKind, analysis, file?.name), [activeKindSlots, analysis, assetKind, file]);

  useEffect(() => {
    if (assetKind !== "bubble" || !analysis) return;
    setBubbleAdjustment((current) => current.markers || current.insets || current.stretch ? current : createDefaultBubbleAdjustment(analysis));
  }, [analysis, assetKind]);

  useEffect(() => {
    let active = true;
    if (!file) {
      setAnalysis(null);
      setFilePreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setFilePreviewUrl(previewUrl);
    analyzeImageFile(file)
      .then((next) => {
        if (active) setAnalysis(next);
      })
      .catch((error) => {
        console.error(error);
        if (active) setAnalysis({});
      });
    return () => {
      active = false;
      URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  useEffect(() => {
    void refreshAssets();
  }, [assetKind]);

  useEffect(() => {
    setBubbleBuilderDraft(null);
    setBubbleBuilderInitial(null);
    setEditingAsset(null);
    setBubbleGeometry({});
    setBubblePreviewEdits({});
    setBubbleVariantFiles({});
    setBubbleGeometryMode("manual");
    setBubbleWorkspaceMode("library");
  }, [bubbleAnchorSlot?.role]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = sidebarResizeRef.current;
      if (!resize) return;
      if (resize.side === "left") {
        setLeftSidebarWidth(Math.min(MAX_LEFT_SIDEBAR_WIDTH, Math.max(MIN_LEFT_SIDEBAR_WIDTH, resize.startWidth + event.clientX - resize.startX)));
      } else {
        setRightSidebarWidth(Math.min(MAX_RIGHT_SIDEBAR_WIDTH, Math.max(MIN_RIGHT_SIDEBAR_WIDTH, resize.startWidth - (event.clientX - resize.startX))));
      }
    };
    const stopResize = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const hasImage = Array.from(event.clipboardData?.files ?? []).some((item) => item.type.startsWith("image/"));
      if (!hasImage) return;
      event.preventDefault();
      const result = pickValidImageFiles(event.clipboardData?.files);
      const file = result.files[0];
      if (!file) {
        setNotice(result.rejected[0] ?? "이미지 파일만 추가할 수 있습니다.");
        return;
      }
      for (const pending of pendingFilesRef.current) URL.revokeObjectURL(pending.previewUrl);
      const pending = createPendingAdminAssetFile(file);
      setAnalysis(null);
      setBubbleAdjustment({});
      setBubbleGeometry({});
      setBubblePreviewEdits({});
      setBubbleVariantFiles({ android: file, ios: file });
      setPendingFiles([pending]);
      setUploadProgress(null);
      setFile(file);
      setNotice("클립보드 이미지를 추가했습니다.");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  /** 저장 직후에는 R2 축소본이 아직 없다. 그 한 장만 signed 원본으로 그리고 다음 조회에서 축소본으로 바뀐다. */
  const toListItem = (asset: AdminAssetCandidate) =>
    toAdminAssetListItem(asset, asset.previewUrl ? { previewUrl: asset.previewUrl } : {});

  const refreshAssets = async () => {
    if (!assetKind) return;
    const seq = ++assetRequestSeqRef.current;
    // 종류를 바꾸는 순간 이전 종류의 카드가 새 제목 아래 잠깐 보이지 않게 한다.
    setAssets([]);
    setAssetsTruncated(false);
    try {
      setIsLoadingAssets(true);
      const page = await listAdminAssetLibrary({ assetKind });
      // 종류를 빠르게 오갈 때 늦게 도착한 이전 응답이 현재 목록을 덮어쓰지 않게 한다.
      if (seq !== assetRequestSeqRef.current) return;
      setAssets([...page.items]);
      setAssetsTruncated(page.truncated);
    } catch (error) {
      if (seq !== assetRequestSeqRef.current) return;
      console.error(error);
      setNotice("관리 후보를 불러오지 못했습니다.");
    } finally {
      if (seq === assetRequestSeqRef.current) setIsLoadingAssets(false);
    }
  };

  const startSidebarResize = (side: SidebarResize["side"], event: React.PointerEvent<HTMLButtonElement>) => {
    if (side === "left" && isLeftSidebarCollapsed) return;
    event.preventDefault();
    sidebarResizeRef.current = { side, startX: event.clientX, startWidth: side === "left" ? leftSidebarWidth : rightSidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const requestSave = () => {
    if (canSaveAsset) setIsSaveConfirmOpen(true);
  };

  const submit = async () => {
    if (activeKindSlots.length === 0 || isSavingAsset || (!editingAsset && !bubbleBuilderDraft && uploadableFiles.length === 0 && !file)) return;
    if (editingAsset && bubbleBuilderDraft) {
      try {
        setIsSavingAsset(true);
        const updatedAsset = await saveAdminBubbleBuilderCandidate({
          id: editingAsset.id,
          title: title.trim() || editingAsset.title,
          slotRole: saveSlotRole,
          targets: getAdminBubbleBuilderTargets(),
          variants: bubbleBuilderDraft.variants.map((result) => ({ platform: result.asset.platform, file: result.asset.file, analysis: analysis ?? undefined })),
          bubbleSpec: bubbleSpec ?? bubbleBuilderDraft.bubbleSpec,
          recipe: bubbleBuilderDraft.recipe,
          decorations: bubbleBuilderDraft.decorations,
          geometryMode: bubbleGeometryMode,
          // 활성/비활성 토글은 제거했다. 기존 레코드를 다시 저장해도 후보로 유지한다.
          enabled: true,
        });
        setAssets((current) => current.map((asset) => (asset.id === updatedAsset.id ? toListItem(updatedAsset) : asset)));
        setEditingAsset(updatedAsset);
        setBubbleBuilderDraft(null);
        for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);
        setPendingFiles([]);
        setUploadProgress(null);
        setBubbleBuilderInitial({ recipe: updatedAsset.bubbleDesign?.recipe ?? bubbleBuilderDraft.recipe, decorations: bubbleBuilderDraft.decorations });
        setNotice("빌더 말풍선을 다시 생성했습니다.");
      } catch (error) {
        console.error(error);
        setNotice("빌더 말풍선을 저장하지 못했습니다.");
      } finally {
        setIsSavingAsset(false);
      }
      return;
    }
    if (editingAsset) {
      try {
        setIsSavingAsset(true);
        const updatedAsset = await updateAdminAssetCandidate(editingAsset.id, {
          title: title.trim() || editingAsset.title,
          bubbleAdjustment: assetKind === "bubble" ? bubbleAdjustment : undefined,
          bubbleSpec: assetKind === "bubble" ? bubbleSpec : undefined,
        });
        setAssets((current) => current.map((asset) => (asset.id === updatedAsset.id ? toListItem(updatedAsset) : asset)));
        setEditingAsset(updatedAsset);
        setNotice("에셋 정보를 저장했습니다.");
      } catch (error) {
        console.error(error);
        setNotice("에셋 정보를 저장하지 못했습니다.");
      } finally {
        setIsSavingAsset(false);
      }
      return;
    }
    const saveTargets = selectedSaveTargets;
    if (saveTargets.length === 0) {
      setNotice("적용되는 슬롯을 찾지 못했습니다.");
      return;
    }

    try {
      setIsSavingAsset(true);
      const representativeTarget = saveTargets[0];
      if (!representativeTarget) throw new Error("INVALID_ASSET_TARGET");
      if (bubbleBuilderDraft) {
        const savedAsset = await saveAdminBubbleBuilderCandidate({
          title: title.trim() || "말풍선 빌더 후보",
          slotRole: saveSlotRole,
          targets: saveTargets,
          variants: bubbleBuilderDraft.variants.map((result) => ({ platform: result.asset.platform, file: result.asset.file, analysis: analysis ?? undefined })),
          bubbleSpec: bubbleSpec ?? bubbleBuilderDraft.bubbleSpec,
          recipe: bubbleBuilderDraft.recipe,
          decorations: bubbleBuilderDraft.decorations,
          geometryMode: bubbleGeometryMode,
        });
        setTitle("");
        setFile(null);
        setBubbleGeometry({});
        setBubblePreviewEdits({});
        setBubbleVariantFiles({});
        setBubbleGeometryMode("manual");
        setAnalysis(null);
        setBubbleBuilderDraft(null);
        for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);
        setPendingFiles([]);
        setUploadProgress(null);
        setNotice("관리 후보를 추가했습니다.");
        setAssets((current) => [toListItem(savedAsset), ...current.filter((item) => item.id !== savedAsset.id)]);
        return;
      }

      const filesToSave = uploadableFiles;
      if (filesToSave.length === 0) return;
      setUploadProgress({ total: filesToSave.length, completed: 0, succeeded: 0, failed: 0 });
      setPendingFiles((current) => current.map((pending) => filesToSave.some((item) => item.id === pending.id) ? { ...pending, status: "queued", error: undefined } : pending));

      const savedAssets: AdminAssetCandidate[] = [];
      const failedItems: PendingAdminAssetFile[] = [];
      for (const pending of filesToSave) {
        setPendingFiles((current) => current.map((item) => item.id === pending.id ? { ...item, status: "uploading", error: undefined } : item));
        setUploadProgress((current) => current ? { ...current, activeFileName: pending.file.name } : current);
        try {
          const itemAnalysis = pending.file === file && analysis
            ? analysis
            : await analyzeImageFile(pending.file).catch(() => ({}));
          const savedAsset = await saveAdminAssetCandidate({
            slotRole: representativeTarget.slotRole ?? saveSlotRole,
            platform: representativeTarget.platform,
            assetKind,
            analysis: itemAnalysis,
            bubbleAdjustment: assetKind === "bubble" ? bubbleAdjustment : undefined,
            bubbleSpec: assetKind === "bubble" ? bubbleSpec : undefined,
            title: title.trim() || pending.file.name,
            note: getAdminAssetKindLabel(assetKind),
            tags: [],
            fileName: pending.file.name,
            mimeType: pending.file.type || "application/octet-stream",
            blob: pending.file,
            targets: saveTargets,
          });
          savedAssets.push(savedAsset);
          setPendingFiles((current) => current.map((item) => item.id === pending.id ? { ...item, status: "success", error: undefined } : item));
          setUploadProgress((current) => current ? { ...current, completed: current.completed + 1, succeeded: current.succeeded + 1, activeFileName: undefined } : current);
        } catch (error) {
          console.error(error);
          const message = error instanceof Error && error.message ? error.message : "저장하지 못했습니다.";
          failedItems.push({ ...pending, status: "error", error: message });
          setPendingFiles((current) => current.map((item) => item.id === pending.id ? { ...item, status: "error", error: message } : item));
          setUploadProgress((current) => current ? { ...current, completed: current.completed + 1, failed: current.failed + 1, activeFileName: undefined } : current);
        }
      }

      if (savedAssets.length > 0) {
        setAssets((current) => [...savedAssets.slice().reverse().map(toListItem), ...current.filter((item) => !savedAssets.some((saved) => saved.id === item.id))]);
      }

      if (failedItems.length === 0) {
        for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);
        setTitle("");
        setPendingFiles([]);
        setFile(null);
        setBubbleGeometry({});
        setBubblePreviewEdits({});
        setBubbleVariantFiles({});
        setBubbleGeometryMode("manual");
        setAnalysis(null);
        setBubbleBuilderDraft(null);
        setUploadProgress(null);
        setNotice(`${savedAssets.length}개 관리 후보를 추가했습니다.`);
      } else {
        const failedIds = new Set(failedItems.map((item) => item.id));
        for (const pending of filesToSave) {
          if (!failedIds.has(pending.id)) URL.revokeObjectURL(pending.previewUrl);
        }
        const retryFile = failedItems[0]?.file ?? null;
        setPendingFiles(failedItems);
        setFile(retryFile);
        setBubbleVariantFiles(retryFile ? { android: retryFile, ios: retryFile } : {});
        setAnalysis(null);
        setNotice(`${savedAssets.length}개 저장 완료 · ${failedItems.length}개 저장 실패. 실패한 파일을 다시 저장할 수 있습니다.`);
      }
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 저장하지 못했습니다.");
    } finally {
      setIsSavingAsset(false);
    }
  };

  useEffect(() => {
    if (!assetPendingDelete) {
      setTemplatesUsingPendingDelete(null);
      return;
    }
    let cancelled = false;
    setTemplatesUsingPendingDelete(null);
    void findSystemTemplatesUsingAdminAsset(assetPendingDelete.id).then((titles) => {
      if (!cancelled) setTemplatesUsingPendingDelete(titles);
    });
    return () => { cancelled = true; };
  }, [assetPendingDelete]);

  const remove = async (asset: AdminAssetListItem) => {
    if (deletingAssetId) return;
    try {
      setDeletingAssetId(asset.id);
      await deleteAdminAssetCandidate(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      if (editingAsset?.id === asset.id) {
        setEditingAsset(null);
        setTitle("");
        setFile(null);
        setBubbleGeometry({});
        setBubblePreviewEdits({});
        setBubbleVariantFiles({});
      }
      setAssetPendingDelete(null);
      setNotice("관리 후보를 삭제했습니다.");
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 삭제하지 못했습니다.");
    } finally {
      setDeletingAssetId(null);
    }
  };

  const applyDroppedFiles = (files: FileList | File[] | null) => {
    const result = pickValidImageFiles(files);
    if (result.files.length === 0) {
      setNotice(result.rejected[0] ?? "이미지 파일만 추가할 수 있습니다.");
      return;
    }
    const selectedFiles = assetKind === "bubble" ? result.files.slice(0, 1) : result.files;
    const append = !editingAsset && assetKind !== "bubble";
    const existingFiles = append ? pendingFiles.filter((pending) => pending.status !== "success") : [];
    const existingKeys = new Set(existingFiles.map((pending) => getAdminAssetFileKey(pending.file)));
    const nextFiles = selectedFiles.filter((item) => !existingKeys.has(getAdminAssetFileKey(item)));
    const nextPendingFiles = append
      ? [...existingFiles, ...nextFiles.map(createPendingAdminAssetFile)]
      : nextFiles.map(createPendingAdminAssetFile);

    if (!append) {
      for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);
    }
    if (editingAsset) {
      setEditingAsset(null);
      setTitle("");
      setNotice("기존 후보 원본은 바꾸지 않습니다. 새 후보 등록으로 전환했습니다.");
    }
    setBubbleBuilderDraft(null);
    setAnalysis(null);
    setBubbleAdjustment({});
    setBubbleGeometry({});
    setBubblePreviewEdits({});
    setBubbleVariantFiles(nextPendingFiles[0] ? { android: nextPendingFiles[0].file, ios: nextPendingFiles[0].file } : {});
    setPendingFiles(nextPendingFiles);
    setUploadProgress(null);
    setFile(nextPendingFiles[0]?.file ?? null);

    const notices: string[] = [];
    if (result.rejected.length > 0) notices.push(`${result.rejected.length}개 파일을 제외했습니다.`);
    if (assetKind === "bubble" && result.files.length > 1) notices.push("말풍선은 한 번에 한 장만 등록할 수 있습니다.");
    if (notices.length === 0) notices.push(`${nextPendingFiles.length}개 이미지를 등록 대기열에 추가했습니다.`);
    setNotice(notices.join(" "));
  };

  const removePendingFile = (id: string) => {
    if (isSavingAsset) return;
    const removed = pendingFiles.find((pending) => pending.id === id);
    if (!removed) return;
    URL.revokeObjectURL(removed.previewUrl);
    const nextPendingFiles = pendingFiles.filter((pending) => pending.id !== id);
    const nextFile = nextPendingFiles[0]?.file ?? null;
    setPendingFiles(nextPendingFiles);
    setUploadProgress(null);
    setFile(nextFile);
    setBubbleVariantFiles(nextFile ? { android: nextFile, ios: nextFile } : {});
    setAnalysis(null);
    if (!nextFile) {
      setBubbleBuilderDraft(null);
      setBubbleGeometry({});
      setBubblePreviewEdits({});
    }
  };

  const applyRecommendedBubbleAdjustment = () => {
    setBubbleAdjustment(createDefaultBubbleAdjustment(analysis));
    setBubbleGeometry({});
    setBubblePreviewEdits({});
    setBubbleGeometryMode("manual");
    setNotice("이미지 크기 기준으로 말풍선 조정값을 다시 맞췄습니다.");
  };

  const clearFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);

    setFile(null);
    setPendingFiles([]);
    setUploadProgress(null);
    setBubbleBuilderDraft(null);
    setBubbleGeometry({});
    setBubblePreviewEdits({});
    setBubbleVariantFiles({});

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * 목록 항목으로 편집을 시작한다.
   *
   * 목록 DTO에는 말풍선 spec/design, variant 원본, target 원문이 없다 — 카드 수십 장에 실어
   * 보내지 않으려고 뺀 값들이다. 편집은 한 건이므로 그때 그 하나만 온전히 받는다.
   */
  const beginInPlaceEdit = async (item: AdminAssetListItem) => {
    if (isSavingAsset || isLoadingEditAsset) return;
    let asset: AdminAssetCandidate;
    try {
      setIsLoadingEditAsset(true);
      asset = await getAdminAssetCandidate(item.id);
    } catch (error) {
      console.error(error);
      setNotice("후보 정보를 불러오지 못했습니다.");
      return;
    } finally {
      setIsLoadingEditAsset(false);
    }
    setEditingAsset(asset);
    setBubbleBuilderDraft(null);
    setBubbleBuilderInitial(null);
    setTitle(asset.title);
    setFile(null);
    setBubbleVariantFiles({});
    setBubbleGeometry(asset.bubbleSpec?.geometry ?? {});
    setBubblePreviewEdits({});
    setBubbleGeometryMode(asset.bubbleDesign?.geometryMode ?? "manual");
    setAnalysis(asset.analysis ?? null);
    setBubbleAdjustment(asset.bubbleAdjustment ?? createDefaultBubbleAdjustment(asset.analysis));
    setNotice(null);
    if (!(asset.assetKind === "bubble" || asset.slotRole.startsWith("bubble_"))) return;
    setBubbleWorkspaceMode("adjust");
    try {
      setIsLoadingEditAsset(true);
      // 플랫폼별로 따로 받는다. 한 번에 묶으면 iOS 원본 하나가 없거나 서명이 만료됐을 때
      // 배치 전체가 실패해, 멀쩡한 Android 원본으로도 geometry를 못 고친다.
      const loadedFiles = await Promise.all((['android', 'ios'] as const).map(async (platform) => {
        try {
          return [platform, await adminAssetToFile(withAdminAssetPlatformVariant(asset, platform))] as const;
        } catch (error) {
          console.error(error);
          return [platform, undefined] as const;
        }
      }));
      const platformFiles = Object.fromEntries(loadedFiles.filter(([, loaded]) => loaded)) as Partial<Record<ThemePlatform, File>>;
      const source = platformFiles.android ?? platformFiles.ios;
      if (!source) throw new Error("말풍선 원본을 어느 플랫폼에서도 받지 못했습니다.");
      if (!platformFiles.android || !platformFiles.ios) {
        setNotice("한쪽 플랫폼 원본을 받지 못했습니다. 받은 원본으로 편집을 이어갈 수 있습니다.");
      }
      setBubbleVariantFiles(platformFiles);
      setFile(source);
      if (asset.bubbleDesign) {
        const decorations = Object.fromEntries(await Promise.all(asset.bubbleDesign.decorations.map(async (decoration) => [decoration.layerId, await adminAssetBubbleDecorationToFile(decoration)] as const)));
        setBubbleBuilderInitial({ recipe: asset.bubbleDesign.recipe, decorations });
      }
    } catch (error) {
      console.error(error);
      setNotice("말풍선 원본을 불러오지 못했습니다. geometry 저장은 다시 시도할 수 있습니다.");
    } finally {
      setIsLoadingEditAsset(false);
    }
  };

  const exitInPlaceEdit = () => {
    if (isSavingAsset) return;
    setEditingAsset(null);
    setBubbleBuilderDraft(null);
    setBubbleBuilderInitial(null);
    setTitle("");
    clearFile();
    setBubbleWorkspaceMode("library");
    setNotice("새 후보 등록으로 돌아왔습니다.");
  };

  const applyBubbleBuilder = async (result: GeneratedBubbleDesign, decorations: Partial<Record<string, File>>) => {
    if (!bubbleAnchorSlot) return false;
    const variant = bubbleVariantFromRole(bubbleAnchorSlot.role);
    if (!variant) return false;
    try {
      // 저장된 geometryMode가 generated여도 현재 편집 세션에서 수동 조정했다면
      // 재생성 결과가 그 값을 덮어쓴다. 새 후보에서 아직 빌더 결과가 없는 첫 적용은 묻지 않는다.
      const hasManualGeometryToReplace = bubbleGeometryMode === "manual" && Boolean(editingAsset || bubbleBuilderDraft);
      if (hasManualGeometryToReplace && typeof window !== "undefined" && !window.confirm("빌더를 다시 적용하면 수동 geometry 조정값이 자동 계산값으로 바뀝니다. 계속할까요?")) return false;
      const results = await Promise.all((['android', 'ios'] as const).map((platform) => generateBubbleAsset({ spec: result.spec, platform, variant, decorationFiles: decorations })));
      const android = results.find((item) => item.asset.platform === "android")?.asset;
      const ios = results.find((item) => item.asset.platform === "ios")?.asset;
      if (!android?.markers || !ios?.insets || !ios.stretch) throw new Error("INVALID_BUBBLE_BUILDER_RESULT");
      const nextGeometry: Partial<Record<ThemePlatform, BubbleGeometry>> = {};
      for (const generated of results) {
        if (generated.asset.geometry) nextGeometry[generated.asset.platform] = generated.asset.geometry;
      }
      const nextSpec = { androidMarkers: android.markers, iosInsets: ios.insets, iosStretch: ios.stretch };
      setBubbleBuilderDraft({ recipe: result.spec, decorations, variants: results, bubbleSpec: { ...nextSpec, geometry: nextGeometry } });
      setBubbleBuilderInitial({ recipe: result.spec, decorations });
      setBubbleAdjustment({ markers: android.markers, insets: ios.insets, stretch: ios.stretch });
      setBubbleGeometry(nextGeometry);
      setBubblePreviewEdits({});
      setBubbleVariantFiles({ android: android.file, ios: ios.file });
      setBubbleGeometryMode("generated");
      for (const pending of pendingFiles) URL.revokeObjectURL(pending.previewUrl);
      setPendingFiles([]);
      setUploadProgress(null);
      setFile(android.file);
      setTitle((current) => current || "말풍선 빌더 후보");
      setBubbleWorkspaceMode("adjust");
      setNotice("Android/iOS 말풍선 결과를 만들었습니다. 저장하면 하나의 관리 후보로 등록됩니다.");
      return true;
    } catch (error) {
      console.error(error);
      setNotice("말풍선 빌더 결과를 준비하지 못했습니다.");
      return false;
    }
  };

  return (
    <main className="grid h-[100dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-slate-50 text-slate-950 [--color-background:#f8fafc] [--color-error-container:#fff1f2] [--color-info:#2563eb] [--color-info-container:#eff6ff] [--color-info-container-high:#dbeafe] [--color-info-outline:#93c5fd] [--color-info-outline-strong:#2563eb] [--color-info-strong:#1d4ed8] [--color-inverse-on-surface:#ffffff] [--color-inverse-surface:#1d4ed8] [--color-on-background:#0f172a] [--color-on-info-container:#172554] [--color-on-info-container-variant:#1e40af] [--color-on-surface:#0f172a] [--color-on-surface-variant:#475569] [--color-outline-variant:#dbeafe] [--color-surface-low:#f1f5f9]">
      <header className="flex min-h-12 items-center justify-between gap-4 border-b border-blue-100 bg-white px-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin" className="rounded-full px-2 py-1 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)] hover:text-[var(--color-on-surface)]">← 관리자</Link>
          <span className="h-4 w-px bg-[var(--color-outline-variant)]" aria-hidden="true" />
          <h1 className="truncate font-[var(--font-display)] text-base font-semibold text-[var(--color-on-surface)]">에셋 워크스페이스</h1>
          <button type="button" onClick={() => setIsLeftSidebarCollapsed((current) => !current)} aria-label={isLeftSidebarCollapsed ? "좌측 패널 열기" : "좌측 패널 접기"} title={isLeftSidebarCollapsed ? "좌측 패널 열기" : "좌측 패널 접기"} className="hidden size-8 place-items-center rounded-lg border border-blue-100 text-blue-700 transition hover:bg-blue-50 lg:grid">
            {isLeftSidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isSavingAsset ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-info-container)] px-3 py-1.5 text-xs font-black text-[var(--color-info-strong)]"><LoaderCircle size={13} className="animate-spin" /> 저장 중</span> : null}
          {notice ? <span className="max-w-[42vw] truncate rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-on-surface-variant)]">{notice}</span> : null}
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-y-contain [overflow-anchor:none] lg:overflow-hidden">
      <div className="grid min-h-full gap-0 lg:h-full lg:min-h-0 lg:grid-cols-[var(--admin-left)_minmax(0,1fr)_var(--admin-right)]" style={{ "--admin-left": isLeftSidebarCollapsed ? "0px" : `${leftSidebarWidth}px`, "--admin-right": `${rightSidebarWidth}px` } as CSSProperties}>
        <section className="grid min-h-0 gap-0 lg:contents">
          <aside className={`relative grid min-h-0 min-w-0 content-start gap-0 border-b border-[var(--color-outline-variant)] bg-white transition-[opacity] duration-200 [overflow-anchor:none] lg:col-start-1 lg:row-start-1 lg:h-full lg:overflow-y-auto lg:overscroll-y-contain lg:[scrollbar-gutter:stable] lg:border-b-0 lg:border-r ${isLeftSidebarCollapsed ? "lg:pointer-events-none lg:border-r-0 lg:opacity-0" : ""}`}>
            <div className="grid gap-2 border-b border-[var(--color-outline-variant)] p-4">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">에셋 분류</span>
              {slotGroups.map((group) => (
                <button
                  key={group.kind}
                  type="button"
                  className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${assetKind === group.kind ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface)] hover:bg-[var(--color-surface-low)]"}`}
                  onClick={() => setAssetKind(group.kind)}
                  aria-current={assetKind === group.kind ? "true" : undefined}
                >
                  <span className="text-sm font-black">{getAdminAssetKindLabel(group.kind)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${assetKind === group.kind ? "bg-white text-[var(--color-info-strong)]" : "bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]"}`}>{group.slots.length}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-2 p-4">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">적용되는 슬롯</span>
              <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-3 py-3">
                <p className="text-xs font-bold leading-5 text-[var(--color-on-surface-variant)]">
                  {formatAdminAssetScope(activeKindSlots)}
                </p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)]">
                  종류를 선택하면 해당 분류의 슬롯 전체에 후보로 등록됩니다.
                </p>
              </div>
            </div>
            {!isLeftSidebarCollapsed ? <button type="button" aria-label="좌측 패널 너비 조절" title="드래그하여 좌측 패널 너비 조절" onPointerDown={(event) => startSidebarResize("left", event)} className="group absolute inset-y-0 right-0 z-40 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent transition hover:bg-blue-500/30 lg:block"><span className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300 opacity-0 transition group-hover:opacity-100" /></button> : null}
          </aside>

          <section className="grid min-w-0 content-start gap-0 lg:contents">
            <div className="relative min-h-0 min-w-0 overflow-hidden border-b border-[var(--color-outline-variant)] bg-white [overflow-anchor:none] lg:col-start-3 lg:row-start-1 lg:h-full lg:overflow-y-auto lg:overscroll-y-contain lg:[scrollbar-gutter:stable] lg:border-b-0 lg:border-l">
              <button type="button" aria-label="우측 패널 너비 조절" title="드래그하여 우측 패널 너비 조절" onPointerDown={(event) => startSidebarResize("right", event)} className="absolute inset-y-0 left-0 z-40 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent transition hover:bg-blue-500/30 lg:block" />
              <div className="border-b border-[var(--color-outline-variant)] px-4 py-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[var(--color-on-surface)]">에셋 등록</span>
                    <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    {pendingFiles.length > 1 ? `${pendingFiles.length}개 이미지 선택됨` : file ? file.name : `${getAdminAssetKindLabel(assetKind)} · ${formatAdminAssetScope(activeKindSlots)}`}
                  </span>
                </span>
              </div>
              {editingAsset ? (
                <div className="flex items-center justify-between gap-2 border-t border-[var(--color-info-container-high)] bg-[var(--color-info-container)] px-4 py-2.5">
                  <span className="min-w-0 truncate text-xs font-black text-[var(--color-info-strong)]">편집 중 · {editingAsset.title}</span>
                  <button type="button" disabled={isSavingAsset} onClick={exitInPlaceEdit} className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-black text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50">새 후보</button>
                </div>
              ) : null}
              {isLoadingEditAsset ? <div className="inline-flex items-center gap-2 border-t border-[var(--color-outline-variant)] px-4 py-2.5 text-xs font-bold text-[var(--color-on-surface-variant)]"><LoaderCircle size={14} className="animate-spin" /> 원본 불러오는 중</div> : null}
                <div id="admin-asset-add-panel" className="relative grid gap-3 p-4" role="region" aria-label="에셋 등록">
                  {isSavingAsset ? (
                    <div className="absolute inset-0 z-10 grid place-items-center bg-white/72 backdrop-blur-[1px]" role="status" aria-live="polite">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-4 py-2 text-sm font-black text-[var(--color-info-strong)] shadow-sm">
                        <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                        {uploadTotal > 1 ? `${uploadCompleted}/${uploadTotal}개 완료` : selectedSaveTargets.length > 1 ? `${selectedSaveTargets.length}개 슬롯 저장 중` : "관리 후보 저장 중"}
                      </div>
                    </div>
                  ) : null}
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">후보 이름</span>
                <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={pendingFiles.length > 1 ? "예: 여름 테마" : file?.name ?? "예: 심플 말풍선"} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">에셋 분류</span>
                <select className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={assetKind} onChange={(event) => setAssetKind(event.currentTarget.value as AdminAssetKind)}>
                  {assetKindOrder.map((kind) => (
                    <option key={kind} value={kind}>
                      {getAdminAssetKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">
                  이미지 파일
                </span>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="이미지 파일 여러 개 선택 또는 끌어놓기"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`grid gap-2 rounded-2xl border-2 border-dashed px-4 py-5 transition ${dragActive
                    ? "border-[var(--color-info)] bg-[var(--color-info-container)] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]"
                    : "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)]"
                    }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    setDragActive(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    applyDroppedFiles(event.dataTransfer.files);
                  }}
                >
                  <strong className="text-sm font-black text-[var(--color-on-surface)]">
                    {dragActive
                      ? "여기에 놓으면 추가됩니다."
                      : pendingFiles.length > 1
                        ? `${pendingFiles.length}개 이미지 선택됨`
                        : file
                        ? file.name
                        : "이미지를 끌어오거나 선택하세요."}
                  </strong>

                  <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    PNG, JPEG, WebP · 여러 장 선택 · Ctrl+V 붙여넣기 지원
                  </span>

                  {pendingFiles.length > 0 ? (
                    <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto overscroll-y-contain [overflow-anchor:none] pr-1">
                      {pendingFiles.map((pending) => (
                        <div key={pending.id} className="flex items-center gap-2 rounded-xl border border-[var(--color-outline-variant)] bg-white p-2">
                          <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-[var(--color-outline-variant)]" style={TRANSPARENCY_CHECKER_STYLE}>
                            <div className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${pending.previewUrl})` }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black text-[var(--color-on-surface)]">{pending.file.name}</p>
                            <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold ${pending.status === "error" ? "text-red-600" : pending.status === "success" ? "text-emerald-700" : "text-[var(--color-on-surface-variant)]"}`}>
                              {pending.status === "uploading" ? <LoaderCircle size={11} className="animate-spin" aria-hidden="true" /> : pending.status === "success" ? <Check size={11} aria-hidden="true" /> : pending.status === "error" ? <AlertTriangle size={11} aria-hidden="true" /> : null}
                              {pending.status === "uploading" ? "저장 중" : pending.status === "success" ? "저장 완료" : pending.status === "error" ? "저장 실패" : "저장 대기"}
                            </p>
                          </div>
                          <button type="button" aria-label={`${pending.file.name} 제거`} disabled={isSavingAsset} onClick={() => removePendingFile(pending.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-on-surface-variant)] transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40">
                            <X size={15} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : filePreviewUrl ? (
                    <div
                      className="mt-2 aspect-[4/3] max-h-64 overflow-hidden rounded-2xl border border-[var(--color-outline-variant)]"
                      style={TRANSPARENCY_CHECKER_STYLE}
                    >
                      <div
                        className="size-full bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${filePreviewUrl})` }}
                      />
                    </div>
                  ) : null}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple={assetKind !== "bubble"}
                    className="hidden"
                    onChange={(event) => {
                      const files = event.currentTarget.files;
                      event.currentTarget.value = "";
                      applyDroppedFiles(files);
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-4 text-xs font-black text-[var(--color-info-strong)] shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--color-info-outline-strong)] hover:bg-[var(--color-info-container-high)] hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus
                        size={15}
                        aria-hidden="true"
                        className="transition duration-200 group-hover:scale-110 group-hover:rotate-3"
                      />
                      이미지 선택
                    </button>

                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 text-xs font-black text-[var(--color-on-surface-variant)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--color-info-outline)] hover:bg-[var(--color-info-container)] hover:text-[var(--color-info-strong)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!file || pendingFiles.length > 1}
                      onClick={() => setImageEditOpen(true)}
                    >
                      <Edit3 size={15} aria-hidden="true" />
                      이미지 편집
                    </button>

                    <button
                      type="button"
                      disabled={!file && pendingFiles.length === 0}
                      onClick={clearFile}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-xs font-black text-red-600 transition duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:text-red-700 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                      이미지 제거
                    </button>
                  </div>
                </div>
              </div>
              {showUploadProgress ? (
                <section className="grid gap-2 rounded-2xl border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-4 py-3" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-xs font-black text-[var(--color-info-strong)]">
                    <span>{uploadProgress ? `${uploadCompleted}/${uploadTotal}개 처리됨` : `${pendingFiles.length}개 선택됨`}</span>
                    {uploadProgress ? <span>성공 {uploadProgress.succeeded} · 실패 {uploadProgress.failed}</span> : <span>저장하면 파일별 후보로 등록됩니다.</span>}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-label="에셋 업로드 진행률" aria-valuemin={0} aria-valuemax={uploadTotal || 1} aria-valuenow={uploadCompleted}>
                    <div className="h-full rounded-full bg-[var(--color-info)] transition-[width] duration-300" style={{ width: `${uploadPercent}%` }} />
                  </div>
                  {isSavingAsset && uploadProgress?.activeFileName ? <p className="truncate text-[11px] font-semibold text-[var(--color-on-info-container)]">현재 저장 중: {uploadProgress.activeFileName}</p> : null}
                </section>
              ) : null}
              {file ? (
                <div className="rounded-2xl bg-[var(--color-surface-low)] px-4 py-3 text-xs font-bold text-[var(--color-on-surface-variant)]">
                  자동 분석: {describeAdminAssetAnalysis(analysis ?? undefined)}
                </div>
              ) : null}
              {guidanceItems.length > 0 ? (
                <div className="grid gap-2 px-4 py-3 border rounded-2xl border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2 text-sm font-black text-amber-950">
                    <AlertTriangle size={17} aria-hidden="true" />
                    저장 전 확인
                  </div>
                  <ul className="grid gap-1.5">
                    {guidanceItems.map((item) => (
                      <li key={item} className="text-xs font-semibold leading-5 text-amber-900">{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {assetKind === "bubble" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="rounded-lg bg-[var(--color-inverse-surface)] px-3 py-2 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:bg-[var(--color-on-surface)]" onClick={() => setBubbleWorkspaceMode("builder")}>말풍선 빌더 열기</button>
                  <button type="button" className="rounded-lg border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)]" onClick={() => { applyRecommendedBubbleAdjustment(); setBubbleWorkspaceMode("adjust"); }}>중앙에서 조정</button>
                </div>
              ) : null}
              <div className="grid gap-2 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3">
                <span className="text-sm font-black text-[var(--color-on-surface)]">적용되는 슬롯</span>
                <p className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                  {editingAsset
                    ? formatAdminAssetTargets(editingAsset, slots)
                    : `${formatAdminAssetScope(activeKindSlots)}에 후보로 등록됩니다.`}
                </p>
              </div>
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-inverse-surface)] px-4 py-2 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:bg-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!canSaveAsset} onClick={requestSave}>
                {isSavingAsset ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                {isSavingAsset ? "저장 중" : editingAsset ? "변경 저장" : bubbleBuilderDraft ? "빌더 후보 저장" : pendingFiles.length > 1 ? `${pendingFiles.length}개 후보 저장` : "관리 후보 저장"}
              </button>
              </div>
            </div>

            <section className="relative grid min-h-0 min-w-0 content-start gap-4 bg-[var(--color-background)] p-4 [overflow-anchor:none] lg:col-start-2 lg:row-start-1 lg:h-full lg:overflow-y-auto lg:overscroll-y-contain lg:[scrollbar-gutter:stable]">
              {assetKind === "bubble" ? (
                <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
                  <div className="pointer-events-auto inline-flex rounded-full border border-blue-200 bg-white/95 p-1 shadow-[0_8px_24px_rgba(37,99,235,0.16)] backdrop-blur">
                    <button type="button" onClick={() => setBubbleWorkspaceMode("library")} aria-label="말풍선 후보 라이브러리 보기" aria-pressed={bubbleWorkspaceMode === "library"} title="후보 라이브러리" className={`grid size-8 place-items-center rounded-full transition ${bubbleWorkspaceMode === "library" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}><Library size={15} aria-hidden="true" /></button>
                    <button type="button" onClick={() => setBubbleWorkspaceMode("adjust")} aria-label="말풍선 편집 화면 보기" aria-pressed={bubbleWorkspaceMode !== "library"} title="말풍선 편집" className={`grid size-8 place-items-center rounded-full transition ${bubbleWorkspaceMode !== "library" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}><SlidersHorizontal size={15} aria-hidden="true" /></button>
                  </div>
                </div>
              ) : null}
              {assetKind === "bubble" && bubbleWorkspaceMode !== "library" ? (
                <div className="grid min-h-full content-start gap-4">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-outline-variant)] pb-3">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-info-strong)]">Bubble workbench</span>
                      <h2 className="mt-1 text-lg font-black text-[var(--color-on-surface)]">{bubbleWorkspaceMode === "builder" ? "나만의 말풍선 만들기" : "말풍선 편집"}</h2>
                    </div>
                  </header>
                  {bubbleWorkspaceMode === "builder" ? (
                    <BubbleBuilderEditor
                      side={selectedBubbleSlot}
                      variant={bubbleVariantFromRole(bubbleAnchorSlot?.role ?? "") ?? "first"}
                      slotLabel="말풍선"
                      platform={bubblePreviewPlatform}
                      initialSpec={bubbleBuilderDraft?.recipe ?? bubbleBuilderInitial?.recipe}
                      initialDecorationFiles={bubbleBuilderDraft?.decorations ?? bubbleBuilderInitial?.decorations}
                      closeOnApply={false}
                      onClose={() => setBubbleWorkspaceMode("library")}
                      onApply={applyBubbleBuilder}
                    />
                  ) : (
                    <div className="grid gap-4">
                      {editingAsset ? <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-info-container-high)] bg-[var(--color-info-container)] px-4 py-3 text-xs font-bold text-[var(--color-info-strong)]"><span>편집 중 · {editingAsset.title}</span><button type="button" className="rounded-md bg-white px-2.5 py-1.5 font-black text-[var(--color-on-surface-variant)]" onClick={exitInPlaceEdit}>새 후보</button></div> : null}
                      {bubbleBuilderDraft ? <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-800">빌더 결과가 준비되었습니다. 우측 패널에서 저장하면 Android/iOS 후보가 함께 등록됩니다.</div> : null}
                      {selectedBubbleEditorSlot ? (
                        <MobileBubbleEditor
                          slot={selectedBubbleEditorSlot}
                          bubbleSlot={selectedBubbleSlot}
                          platform={bubbleEditorPlatform}
                          sourceFile={adminBubbleSourceFile ?? null}
                          geometry={bubbleGeometry[bubbleEditorPlatform]}
                          markers={bubbleAdjustment.markers}
                          insets={bubbleAdjustment.insets}
                          stretch={bubbleAdjustment.stretch}
                          showFlip={false}
                          resetGeometryOnSourceChange={!editingAsset && !bubbleBuilderDraft}
                          onApply={({ editedFile, geometry, markers, insets, stretch }) => {
                            const editorPlatform = bubbleEditorPlatform;
                            if (editedFile) {
                              setBubbleVariantFiles((current) => ({ ...current, [editorPlatform]: editedFile }));
                              if (editorPlatform === "android") setFile(editedFile);
                            }
                            // 공통 편집기에서 확정한 geometry는 두 플랫폼에 동일한 기준으로 저장한다.
                            setBubbleGeometry((current) => ({ ...current, android: geometry, ios: geometry }));
                            setBubblePreviewEdits((current) => {
                              const next = { ...current };
                              delete next.android;
                              delete next.ios;
                              return next;
                            });
                            setBubbleAdjustment((current) => ({ ...current, markers, insets, stretch }));
                            setBubbleGeometryMode("manual");
                          }}
                          onPreviewChange={({ geometry, markers, insets, stretch }) => {
                            setBubbleAdjustment((current) => current.markers && current.insets && current.stretch
                              ? current
                              : { ...current, markers: current.markers ?? markers, insets: current.insets ?? insets, stretch: current.stretch ?? stretch });
                            // onApply와 같은 규칙 — 공통 편집기가 만든 값은 두 플랫폼에 함께 반영한다.
                            // 편집기 플랫폼(사실상 android)에만 쓰면 `bubblePreviewEdits.ios`가
                            // 영영 비어, insets/stretch가 저장 시 옛 DB 값으로 되돌아간다.
                            const previewEdit = { geometry, markers, insets, stretch };
                            setBubblePreviewEdits((current) => ({ ...current, android: previewEdit, ios: previewEdit }));
                          }}
                        />
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--color-outline-variant)] bg-white px-4 py-6 text-center text-sm font-bold text-[var(--color-on-surface-variant)]">편집할 말풍선 원본을 선택하세요.</div>
                      )}
                      <AdminBubbleTextPreview
                        sourceFile={adminBubbleSourceFile}
                        platform={bubbleEditorPlatform}
                        slot={selectedBubbleSlot}
                        edit={bubblePreviewEdit}
                        text={bubblePreviewText}
                        onTextChange={setBubblePreviewText}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setBubbleWorkspaceMode("builder")} className="rounded-lg bg-[var(--color-inverse-surface)] px-3 py-2 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:bg-[var(--color-on-surface)]">빌더로 다시 만들기</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-[var(--color-on-surface)]">등록된 관리 후보</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    {getAdminAssetKindLabel(assetKind)} · {formatAdminAssetScope(activeKindSlots)} · {assetSearch.trim() ? `검색 결과 ${filteredAssets.length} / ` : ""}{assetsTruncated ? `${assets.length}개 이상` : `전체 ${assets.length}개`}
                  </p>
                </div>
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-on-surface-variant)]" aria-hidden="true" />
                  <input
                    type="search"
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.currentTarget.value)}
                    placeholder="이름, 파일명 검색"
                    className="h-11 w-full rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] pl-9 pr-4 text-sm font-semibold outline-none transition focus:border-[var(--color-info-outline-strong)] focus:bg-white focus:ring-3 focus:ring-[var(--color-info-container-high)]"
                    aria-label="관리 후보 검색"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <select
                      value={assetSort}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        if (isAdminAssetListSortKey(value)) setAssetSort(value);
                      }}
                      aria-label="정렬 기준"
                      className="h-[34px] appearance-none rounded-full border border-[var(--color-outline-variant)] bg-white pl-3 pr-8 text-xs font-black text-[var(--color-on-surface-variant)] outline-none transition hover:bg-[var(--color-surface-low)]"
                    >
                      <option value="updated">최근 수정순</option>
                      <option value="created">최근 등록순</option>
                      <option value="title">이름순</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-on-surface-variant)]" aria-hidden="true" />
                  </div>
                  {assetsTruncated ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1.5 text-[11px] font-black text-amber-800">
                      <AlertTriangle size={11} aria-hidden="true" /> 500개까지만 불러왔습니다
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <select
                    value={assetGridColumns}
                    onChange={(event) => setAssetGridColumns(Number(event.currentTarget.value) as 3 | 4 | 5)}
                    aria-label="열 개수"
                    className="h-[34px] appearance-none rounded-full border border-[var(--color-outline-variant)] bg-white pl-3 pr-8 text-xs font-black text-[var(--color-on-surface-variant)] outline-none transition hover:bg-[var(--color-surface-low)]"
                  >
                    <option value={3}>3열</option>
                    <option value={4}>4열</option>
                    <option value={5}>5열</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-on-surface-variant)]" aria-hidden="true" />
                </div>
              </div>
              {isLoadingAssets && filteredAssets.length === 0 ? (
                <AdminAssetSkeletonGrid columns={assetGridColumns} />
              ) : filteredAssets.length > 0 ? (
                <div className={`grid gap-3 sm:grid-cols-2 ${assetGridColumns === 3 ? "xl:grid-cols-3" : assetGridColumns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
                  {filteredAssets.map(({ asset, warnings }) => (
                    <AdminAssetCard key={asset.id} asset={asset} slots={slots} warnings={warnings} deleting={deletingAssetId === asset.id} onEdit={() => void beginInPlaceEdit(asset)} onDelete={() => setAssetPendingDelete(asset)} />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-40 place-items-center rounded-[22px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-5 py-8 text-center">
                  <div>
                    <strong className="text-sm font-black text-[var(--color-on-surface)]">표시할 관리 후보가 없습니다.</strong>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                      검색어 또는 필터를 지우거나, 현재 분류에 맞는 후보를 새로 추가하세요.
                    </p>
                  </div>
                </div>
              )}
                </>
              )}
            </section>
            </section>
            <aside className="hidden">
              <div>
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-info-strong)]">Inspector</span>
                <h2 className="mt-1 text-lg font-black text-[var(--color-on-surface)]">{getAdminAssetKindLabel(assetKind)}</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{formatAdminAssetScope(activeKindSlots)}</p>
              </div>
              {editingAsset ? <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-3 py-2.5"><span className="min-w-0 truncate text-xs font-black text-[var(--color-info-strong)]">편집 중 · {editingAsset.title}</span><button type="button" disabled={isSavingAsset} onClick={exitInPlaceEdit} className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[var(--color-on-surface-variant)] disabled:opacity-50">새로 만들기</button></div> : null}
              {isLoadingEditAsset ? <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-on-surface-variant)]"><LoaderCircle size={14} className="animate-spin" /> 원본 불러오는 중</div> : null}
              <label className="grid gap-2">
                <span className="text-xs font-black text-[var(--color-on-surface-variant)]">후보 이름</span>
                <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none focus:border-[var(--color-info)]" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={file?.name ?? "예: 심플 말풍선"} />
              </label>
              <section className="grid gap-2 rounded-2xl bg-[var(--color-surface-low)] p-3">
                <span className="text-xs font-black text-[var(--color-on-surface)]">적용되는 슬롯</span>
                <p className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{editingAsset ? formatAdminAssetTargets(editingAsset, slots) : formatAdminAssetTargetsFromInputs(selectedSaveTargets, slots, assetKind)}</p>
              </section>
              {file ? <section className="grid gap-2 rounded-2xl bg-[var(--color-surface-low)] p-3"><span className="text-xs font-black text-[var(--color-on-surface)]">자동 분석</span><p className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(analysis ?? undefined)}</p></section> : null}
              {guidanceItems.length > 0 ? <section className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3"><span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-950"><AlertTriangle size={14} /> 저장 전 확인</span><ul className="grid gap-1.5">{guidanceItems.map((item) => <li key={item} className="text-xs font-semibold leading-5 text-amber-900">{item}</li>)}</ul></section> : null}
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!canSaveAsset} onClick={requestSave}>
                {isSavingAsset ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
                {isSavingAsset ? "저장 중" : editingAsset ? "변경 저장" : bubbleBuilderDraft ? "빌더 후보 저장" : "관리 후보 저장"}
              </button>
            </aside>
          </section>
          <section className="hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-info-strong)]">Library</span><p className="mt-1 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{getAdminAssetKindLabel(assetKind)} · {assetSearch.trim() ? `검색 ${filteredAssets.length} / ` : ""}{assetsTruncated ? `${assets.length}개 이상` : `${assets.length}개`}</p></div>
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-on-surface-variant)]" aria-hidden="true" /><input type="search" value={assetSearch} onChange={(event) => setAssetSearch(event.currentTarget.value)} placeholder="후보 검색" className="h-10 w-full rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] pl-9 pr-4 text-xs font-semibold outline-none focus:bg-white" aria-label="관리 후보 검색" /></div>
              <div className="flex flex-wrap gap-1">{([["updated", "수정순"], ["created", "등록순"], ["title", "이름순"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setAssetSort(value)} aria-pressed={assetSort === value} className={`rounded-full px-2.5 py-1.5 text-[11px] font-black ${assetSort === value ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]"}`}>{label}</button>)}</div>
            </div>
            <div className="flex min-h-[132px] gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {isLoadingAssets && assets.length === 0 ? <span className="grid min-w-48 place-items-center rounded-2xl bg-[var(--color-surface-low)] text-xs font-bold text-[var(--color-on-surface-variant)]">후보를 불러오는 중</span> : null}
              {!isLoadingAssets && filteredAssets.length === 0 ? <span className="grid min-w-64 place-items-center rounded-2xl border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 text-center text-xs font-bold text-[var(--color-on-surface-variant)]">표시할 관리 후보가 없습니다.</span> : null}
              {filteredAssets.map(({ asset, warnings }) => <AdminAssetDockCard key={asset.id} asset={asset} slots={slots} warnings={warnings} onEdit={() => void beginInPlaceEdit(asset)} onDelete={() => setAssetPendingDelete(asset)} />)}
            </div>
          </section>
      </div>
      </div>

      <ImageEditDialog
        open={imageEditOpen}
        sourceFile={adminBubbleSourceFile}
        slotLabel={`${getAdminAssetKindLabel(assetKind)} 에셋`}
        onOpenChange={setImageEditOpen}
        onApply={(editedFile) => {
          // 작업대가 보는 원본은 `bubbleVariantFiles`가 먼저다. `file`만 갈면 편집기와 텍스트
          // 미리보기가 편집 전 비트맵을 계속 그리는데, 업로드되는 건 편집된 파일이라
          // 저장된 geometry가 저장된 이미지와 어긋난다. 편집기 자체의 onApply와 같은 규칙을 쓴다.
          setBubbleVariantFiles((current) => (current[bubbleEditorPlatform] ? { ...current, [bubbleEditorPlatform]: editedFile } : current));
          if (bubbleEditorPlatform === "android") {
            setFile(editedFile);
            if (pendingFiles.length === 1) {
              const current = pendingFiles[0];
              if (current) {
                URL.revokeObjectURL(current.previewUrl);
                setPendingFiles([{ ...current, file: editedFile, previewUrl: URL.createObjectURL(editedFile), status: "queued", error: undefined }]);
              }
            }
          }
          setNotice("편집된 이미지를 적용했습니다.");
        }}
      />
      <AdminAssetEditDialog asset={null} slots={slots} onClose={() => undefined} onSaved={() => undefined} />
      <Dialog.Root open={isSaveConfirmOpen} onOpenChange={(open) => { if (!isSavingAsset) setIsSaveConfirmOpen(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/35 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.22)] outline-none">
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Save size={20} aria-hidden="true" /></span>
            <Dialog.Title className="text-xl font-extrabold text-slate-950">관리 후보를 저장할까요?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-slate-600">아래 정보를 확인한 뒤 저장하세요. 여러 파일을 선택하면 파일마다 하나의 관리 후보로 등록됩니다.</Dialog.Description>
            <dl className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-start justify-between gap-4"><dt className="font-bold text-slate-500">후보 이름</dt><dd className="max-w-[65%] text-right font-black text-slate-900">{title.trim() || (pendingFiles.length > 1 ? `${pendingFiles.length}개 이미지` : file?.name) || getAdminAssetKindLabel(assetKind)}</dd></div>
              {pendingFiles.length > 1 ? <div className="flex items-start justify-between gap-4"><dt className="font-bold text-slate-500">등록 파일</dt><dd className="text-right font-black text-slate-900">{pendingFiles.length}개</dd></div> : null}
              <div className="flex items-start justify-between gap-4"><dt className="font-bold text-slate-500">에셋 분류</dt><dd className="text-right font-black text-slate-900">{getAdminAssetKindLabel(assetKind)}</dd></div>
              <div className="flex items-start justify-between gap-4"><dt className="font-bold text-slate-500">적용되는 슬롯</dt><dd className="max-w-[65%] text-right font-black leading-5 text-slate-900">{editingAsset ? formatAdminAssetTargets(editingAsset, slots) : formatAdminAssetTargetsFromInputs(selectedSaveTargets, slots, assetKind)}</dd></div>
              {bubbleBuilderDraft ? <div className="flex items-start justify-between gap-4"><dt className="font-bold text-slate-500">생성 방식</dt><dd className="text-right font-black text-blue-700">Android/iOS 빌더 결과</dd></div> : null}
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-extrabold text-slate-600 disabled:opacity-55" disabled={isSavingAsset}>취소</button>
              </Dialog.Close>
              <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:opacity-55" disabled={isSavingAsset} onClick={() => { setIsSaveConfirmOpen(false); void submit(); }}>
                {isSavingAsset ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
                {isSavingAsset ? "저장 중" : pendingFiles.length > 1 ? `${pendingFiles.length}개 저장하기` : "저장하기"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(assetPendingDelete)} onOpenChange={(open) => { if (!open && !deletingAssetId) setAssetPendingDelete(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none"
            onEscapeKeyDown={(event) => { if (deletingAssetId) event.preventDefault(); }}
            onPointerDownOutside={(event) => { if (deletingAssetId) event.preventDefault(); }}
          >
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 size={20} aria-hidden="true" /></span>
            <Dialog.Title className="text-xl font-extrabold text-[var(--color-on-surface)]">이 후보를 삭제할까요?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
              &ldquo;{assetPendingDelete?.title}&rdquo; 후보와 저장된 이미지가 영구히 삭제됩니다. 되돌릴 수 없습니다.
            </Dialog.Description>
            {templatesUsingPendingDelete && templatesUsingPendingDelete.length > 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-900">
                시스템 템플릿 {templatesUsingPendingDelete.length}개가 이 에셋을 쓰고 있습니다 ({templatesUsingPendingDelete.slice(0, 3).join(", ")}
                {templatesUsingPendingDelete.length > 3 ? ` 외 ${templatesUsingPendingDelete.length - 3}개` : ""}).
                {" "}이미 발행된 템플릿의 내보내기는 계속 동작하지만, 이 에셋은 피커에서 사라집니다.
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-11 rounded-xl border border-[var(--color-outline-variant)] px-4 py-2.5 text-sm font-extrabold text-[var(--color-on-surface-variant)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-55" disabled={Boolean(deletingAssetId)}>취소</button>
              </Dialog.Close>
              <button
                type="button"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-55"
                disabled={Boolean(deletingAssetId)}
                onClick={() => { if (assetPendingDelete) void remove(assetPendingDelete); }}
              >
                {deletingAssetId ? <><LoaderCircle className="animate-spin" size={17} aria-hidden="true" />삭제 중</> : "삭제"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function groupSlotsByAssetKind(slots: ThemeAssetSlot[]) {
  return assetKindOrder
    .map((kind) => ({
      kind,
      slots: slots.filter((slot) => inferAdminAssetKind(slot) === kind),
    }))
    .filter((group) => group.slots.length > 0);
}

function getUnifiedAdminAssetSlots(): ThemeAssetSlot[] {
  const seenRoles = new Set<string>();
  return (["android", "ios"] as const)
    .flatMap((platform) => getThemeSlots(platform))
    .filter((slot) => slot.kind === "image" || slot.kind === "ninepatch")
    .filter((slot) => {
      if (seenRoles.has(slot.role)) return false;
      seenRoles.add(slot.role);
      return true;
    });
}

function getAdminAssetSaveTargets(assetKind: AdminAssetKind): AdminAssetTargetInput[] {
  // 후보 등록은 특정 슬롯에 고정하지 않는다. 실제 템플릿에서 슬롯을 고르는 일은
  // admin/edit가 담당하고, 여기서는 kind 전체에 추천되는 후보로 저장한다.
  void assetKind;
  return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }];
}

/**
 * 편집기에서 말풍선을 비파괴로 좌우반전할 수 있으므로(`bubbleFlipX`), 빌더로 만든 말풍선도 슬롯을
 * exact로 고정하지 않고 네 기본 슬롯(`bubble_me_1/2`, `bubble_you_1/2`)이 공유하는 그룹 후보로
 * 등록한다. 일반 파일 업로드 경로(`getAdminAssetSaveTargets`)의 bubble 기본값과 동일하게 맞춘 것이다.
 */
function getAdminBubbleBuilderTargets(): AdminAssetTargetInput[] {
  return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }];
}

function bubbleVariantFromRole(role: string): "first" | "group" | null {
  if (!role.startsWith("bubble_")) return null;
  return role.endsWith("_2") ? "group" : "first";
}

function getSharedAdminAssetTargets(asset: AdminAssetCandidate): AdminAssetTargetInput[] {
  void asset;
  return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }];
}

/** 정사각으로 볼 비율 폭. 예전 `shapes`의 "square" 판정과 같은 경계다. */
const squareAspectRatioRange = { min: 0.85, max: 1.18 } as const;

/**
 * 업로드 이미지에 대한 경고.
 *
 * 크기와 파일명만 본다. 예전에는 캔버스 픽셀 스캔에서 얻은 형태·투명도도 함께 봤지만, 그
 * 비용을 업로드마다 치를 만한 경고가 아니었다. 정사각 여부는 비율로, 9-patch 여부는 파일명
 * 확장자로 같은 결론을 낼 수 있어 그대로 남긴다.
 *
 * **사라진 것은 투명 배경 경고 하나다.** 알파 채널 비율은 픽셀을 읽지 않으면 알 수 없다.
 */
function getAdminAssetGuidance(
  slot: ThemeAssetSlot | undefined,
  assetKind: AdminAssetKind,
  analysis: AdminAssetAnalysis | null,
  fileName?: string,
) {
  if (!slot || !analysis) return [];
  const items: string[] = [];
  const width = analysis.width ?? 0;
  const height = analysis.height ?? 0;

  if (!width || !height) {
    items.push("이미지 크기를 확인하지 못했습니다. 저장 후 실제 프리뷰에서 깨짐 여부를 확인하세요.");
    return items;
  }

  const aspectRatio = width / height;
  const isSquarish = aspectRatio > squareAspectRatioRange.min && aspectRatio < squareAspectRatioRange.max;
  const isNinePatchFile = Boolean(fileName?.toLowerCase().endsWith(".9.png"));

  if ((assetKind === "icon" || assetKind === "profile" || assetKind === "launcher" || assetKind === "passcode_indicator") && !isSquarish) {
    items.push("아이콘·프로필·암호 표시 이미지는 정사각형에 가까울수록 잘리지 않고 안정적으로 보입니다.");
  }
  if ((assetKind === "background" || assetKind === "passcode" || slot.role.includes("background")) && aspectRatio > 1.2) {
    items.push("배경 이미지는 세로 화면에서 사용됩니다. 가로형 이미지는 상하 영역이 비거나 잘릴 수 있습니다.");
  }
  if (assetKind === "bubble" && !isNinePatchFile && slot.platform === "android") {
    items.push("Android 말풍선은 9-patch 또는 stretch 조정값이 중요합니다. 저장 전 말풍선 조정값을 확인하세요.");
  }
  if (Math.min(width, height) < 48) {
    items.push("이미지 한쪽 변이 48px 미만입니다. 고해상도 기기에서 흐릿하게 보일 수 있습니다.");
  }
  if (assetKind === "background" && Math.max(width, height) < 720) {
    items.push("배경 이미지는 최소 720px 이상의 긴 변을 권장합니다.");
  }
  if (slot.platform === "android" && assetKind === "bubble" && !slot.fileName?.endsWith(".9.png")) {
    items.push("현재 슬롯 파일명이 9-patch가 아닙니다. export 결과에서 말풍선 늘어남을 반드시 확인하세요.");
  }

  return Array.from(new Set(items));
}

function getAdminAssetGuidanceForSlots(
  slots: readonly ThemeAssetSlot[],
  assetKind: AdminAssetKind,
  analysis: AdminAssetAnalysis | null,
  fileName?: string,
) {
  return Array.from(new Set(slots.flatMap((slot) => getAdminAssetGuidance(slot, assetKind, analysis, fileName))));
}

function BubblePlatformSummary({
  adjustment,
  activePlatform,
  onSelectPlatform,
}: {
  adjustment: AdminBubbleAdjustment;
  activePlatform: ThemePlatform;
  onSelectPlatform: (platform: ThemePlatform) => void;
}) {
  const markerText = adjustment.markers
    ? `stretch ${formatRange(adjustment.markers.top)} / text ${formatRange(adjustment.markers.bottom)}`
    : "기본 마커 추천값 사용";
  const insetText = adjustment.insets
    ? `여백 ${adjustment.insets.top}/${adjustment.insets.right}/${adjustment.insets.bottom}/${adjustment.insets.left}`
    : "기본 inset 추천값 사용";
  const stretchText = adjustment.stretch ? `stretch point ${adjustment.stretch.x}, ${adjustment.stretch.y}` : "기본 stretch point 사용";

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <BubblePlatformCard
        platform="android"
        active={activePlatform === "android"}
        title="Android 9-patch 기준"
        description="늘어나는 영역과 텍스트 영역을 마커로 저장합니다."
        detail={markerText}
        onSelect={() => onSelectPlatform("android")}
      />
      <BubblePlatformCard
        platform="ios"
        active={activePlatform === "ios"}
        title="iOS inset 기준"
        description="텍스트 여백과 stretch point를 CSS slicing 기준으로 저장합니다."
        detail={`${insetText} · ${stretchText}`}
        onSelect={() => onSelectPlatform("ios")}
      />
    </div>
  );
}

function BubblePlatformCard({
  platform,
  active,
  title,
  description,
  detail,
  onSelect,
}: {
  platform: ThemePlatform;
  active: boolean;
  title: string;
  description: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid gap-2 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 active:translate-y-0 ${active ? "border-[var(--color-info)] bg-[var(--color-info-container)]" : "border-[var(--color-outline-variant)] bg-white hover:bg-[var(--color-surface-low)]"}`}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <strong className="text-sm font-black text-[var(--color-on-surface)]">{title}</strong>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${active ? "bg-white text-[var(--color-info-strong)]" : "bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]"}`}>{platform}</span>
      </span>
      <span className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{description}</span>
      <span className="rounded-xl bg-[var(--color-surface-low)] px-3 py-2 text-[11px] font-bold leading-5 text-[var(--color-on-surface-variant)]">{detail}</span>
    </button>
  );
}

function formatRange(range: { start: number; end: number }) {
  return `${range.start}-${range.end}`;
}

function formatPlatformLabel(platform: "all" | ThemePlatform) {
  return platform === "all" ? "Android+iOS" : platform === "android" ? "Android" : "iOS";
}

function formatAdminAssetScope(slots: readonly ThemeAssetSlot[]) {
  const labels = Array.from(new Set(slots.map((slot) => slot.label)));
  if (labels.length === 0) return "적용 슬롯 없음";
  if (labels.length <= 3) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} 외 ${labels.length - 2}개`;
}

function getAdminAssetSlotLabel(role: string, slots: readonly ThemeAssetSlot[]) {
  return slots.find((slot) => slot.role === role)?.label ?? role;
}

type FormattableTarget = Pick<AdminAssetTargetInput, "platform" | "slotRole" | "targetKind">;

function formatAdminAssetTargetInput(target: FormattableTarget, slots: readonly ThemeAssetSlot[], assetKind?: AdminAssetKind) {
  const platformLabel = formatPlatformLabel(target.platform);
  if (target.slotRole) return `${platformLabel} · ${getAdminAssetSlotLabel(target.slotRole, slots)}`;
  if (target.targetKind === "asset_kind") return `${platformLabel} · ${assetKind ? getAdminAssetKindLabel(assetKind) : "해당 분류"} 전체`;
  if (target.targetKind === "shape_rule") return `${platformLabel} · 조건에 맞는 슬롯`;
  return `${platformLabel} · 적용 슬롯`;
}

function formatAdminAssetTargetsFromInputs(targets: readonly FormattableTarget[], slots: readonly ThemeAssetSlot[], assetKind?: AdminAssetKind) {
  if (targets.length < 1) return "적용 슬롯 없음";
  return targets.map((target) => formatAdminAssetTargetInput(target, slots, assetKind)).join(" / ");
}

function formatAdminAssetTargets(
  asset: Pick<AdminAssetCandidate, "platform" | "slotRole" | "assetKind"> & { readonly targets?: readonly FormattableTarget[] },
  slots: readonly ThemeAssetSlot[],
) {
  const targets = asset.targets ?? [];
  if (targets.length < 1) return `${formatPlatformLabel(asset.platform)} · ${getAdminAssetSlotLabel(asset.slotRole, slots)}`;
  return targets.map((target) => formatAdminAssetTargetInput(target, slots, asset.assetKind)).join(" / ");
}

function AdminAssetCard({
  asset,
  slots,
  warnings,
  deleting,
  onEdit,
  onDelete,
}: {
  asset: AdminAssetListItem;
  slots: readonly ThemeAssetSlot[];
  warnings: string[];
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tileUrl = adminAssetListTileUrl(asset);
  const scopeLabel = getAdminAssetScopeLabel(describeAdminAssetScope(asset.targets));
  return (
    <article className={`relative grid gap-3 overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)] transition duration-200 ${deleting ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(42,103,103,0.1)]"}`}>
      {deleting ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[1px]" role="status" aria-live="polite">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 shadow-sm">
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            삭제 중
          </span>
        </div>
      ) : null}
      <div className="aspect-[4/3] overflow-hidden rounded-[18px] border border-[var(--color-outline-variant)]" style={TRANSPARENCY_CHECKER_STYLE}>
        <div className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: tileUrl ? `url(${tileUrl})` : undefined }} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--color-inverse-surface)] px-2 py-0.5 text-[10px] font-black text-[var(--color-inverse-on-surface)]">{scopeLabel}</span>
          {asset.variantPlatforms.map((platform) => (
            <span key={platform} className="rounded-full bg-[var(--color-surface-low)] px-2 py-0.5 text-[10px] font-black text-[var(--color-on-surface-variant)]">{platform === "android" ? "Android 전용본" : "iOS 전용본"}</span>
          ))}
          {warnings.length > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800"><AlertTriangle size={11} aria-hidden="true" />확인 {warnings.length}</span> : null}
        </div>
        <strong className="block truncate text-sm font-black text-[var(--color-on-surface)]">{asset.title}</strong>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : getAdminAssetSlotLabel(asset.slotRole, slots)}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{formatAdminAssetTargets(asset, slots)}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(asset.analysis)}</span>
        {asset.hasBubbleAdjustment ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">말풍선 조정값 저장됨</span> : null}
        {warnings[0] ? <span className="mt-2 block rounded-xl bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-4 text-amber-900">{warnings[0]}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--color-inverse-surface)] px-3 py-2 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" disabled={deleting} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> 수정
        </button>
        <button type="button" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" disabled={deleting} onClick={onDelete}>
          {deleting ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
          {deleting ? "삭제 중" : "삭제"}
        </button>
      </div>
    </article>
  );
}

function AdminAssetDockCard({
  asset,
  slots,
  warnings,
  onEdit,
  onDelete,
}: {
  asset: AdminAssetListItem;
  slots: readonly ThemeAssetSlot[];
  warnings: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tileUrl = adminAssetListTileUrl(asset);
  return (
    <article className="grid min-w-48 max-w-48 grid-rows-[76px_auto] gap-2 rounded-2xl border border-[var(--color-outline-variant)] bg-white p-2.5 shadow-[0_8px_18px_rgba(42,103,103,0.06)]">
      <button type="button" onClick={onEdit} className="relative overflow-hidden rounded-xl border border-[var(--color-outline-variant)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]" style={TRANSPARENCY_CHECKER_STYLE} aria-label={`${asset.title} 수정`}>
        <span className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: tileUrl ? `url(${tileUrl})` : undefined }} aria-hidden="true" />
        {warnings.length > 0 ? <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">확인 {warnings.length}</span> : null}
      </button>
      <div className="min-w-0"><button type="button" onClick={onEdit} className="block w-full truncate text-left text-xs font-black text-[var(--color-on-surface)] hover:underline">{asset.title}</button><span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : getAdminAssetSlotLabel(asset.slotRole, slots)}</span><div className="mt-2 flex gap-1"><button type="button" onClick={onEdit} className="rounded-lg bg-[var(--color-surface-low)] px-2 py-1 text-[10px] font-black text-[var(--color-on-surface-variant)]">수정</button><button type="button" onClick={onDelete} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">삭제</button></div></div>
    </article>
  );
}

function AdminAssetSkeletonGrid({ columns = 3 }: { columns?: 3 | 4 | 5 }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : columns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.04)]">
          <span className="aspect-[4/3] animate-pulse rounded-[18px] bg-[var(--color-surface-low)]" />
          <span className="h-4 w-2/3 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
          <span className="h-3 w-full animate-pulse rounded-full bg-[var(--color-surface-low)]" />
          <span className="h-9 w-full animate-pulse rounded-full bg-[var(--color-surface-low)]" />
        </div>
      ))}
    </div>
  );
}

function AdminAssetEditDialog({
  asset,
  slots,
  onClose,
  onSaved,
}: {
  asset: AdminAssetCandidate | null;
  slots: readonly ThemeAssetSlot[];
  onClose: () => void;
  onSaved: (asset: AdminAssetCandidate) => void;
}) {
  const [title, setTitle] = useState("");
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [bubblePreviewPlatform, setBubblePreviewPlatform] = useState<ThemePlatform>("android");
  const [targetMode, setTargetMode] = useState<"keep" | "shared">("keep");
  const [bubbleFile, setBubbleFile] = useState<ThemeProjectFile>();
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBubble = asset?.assetKind === "bubble" || asset?.slotRole.startsWith("bubble_");
  const bubbleSlot = asset ? (bubbleSlotFromRole(asset.slotRole) ?? "me") : "me";

  useEffect(() => {
    let cancelled = false;
    setTitle(asset?.title ?? "");
    setBubbleAdjustment(asset?.bubbleAdjustment ?? createDefaultBubbleAdjustment(asset?.analysis));
    setBubblePreviewPlatform("android");
    setTargetMode("keep");
    setBubbleFile(undefined);
    setLoadingFile(false);
    setError(null);
    if (!asset || !isBubble) return;

    setLoadingFile(true);
    adminAssetToFile(asset)
      .then((file) => {
        if (!cancelled) setBubbleFile({ path: file.name, name: file.name, size: file.size, file });
      })
      .catch(() => {
        if (!cancelled) setError("말풍선 원본을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, isBubble]);

  const submitEdit = async () => {
    if (!asset || saving) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError("에셋 이름을 입력해 주세요.");
      return;
    }
    if (normalizedTitle.length > 100) {
      setError("에셋 이름은 100자 이내로 입력해 주세요.");
      return;
    }
    const nextBubbleSpec = isBubble ? bubbleAdjustmentToSpec(bubbleAdjustment) : undefined;
    if (isBubble && !nextBubbleSpec) {
      setError("Android 마커와 iOS inset/stretch 값을 모두 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedAsset = await updateAdminAssetCandidate(asset.id, {
        title: normalizedTitle,
        targets: targetMode === "shared" ? getSharedAdminAssetTargets(asset) : undefined,
        bubbleAdjustment: isBubble ? bubbleAdjustment : undefined,
        bubbleSpec: nextBubbleSpec,
      });
      onSaved(updatedAsset);
    } catch (updateError) {
      console.error(updateError);
      setError("수정 내용을 저장하지 못했습니다. 입력값과 네트워크 상태를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={Boolean(asset)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto grid max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-white shadow-2xl outline-none sm:inset-x-6 sm:bottom-auto sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:-translate-y-1/2"
          aria-describedby="admin-asset-edit-description"
          onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-outline-variant)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-black text-[var(--color-on-surface)]">에셋 정보 수정</Dialog.Title>
              <Dialog.Description id="admin-asset-edit-description" className="mt-1 truncate text-sm font-semibold text-[var(--color-on-surface-variant)]">
                {asset?.fileName}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" disabled={saving} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface-low)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)] disabled:opacity-40" aria-label="수정 창 닫기">
                <X size={19} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="grid content-start gap-5 px-5 py-5 overflow-y-auto sm:px-6">
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--color-on-surface)]">에셋 이름</span>
              <input
                autoFocus
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.currentTarget.value)}
                disabled={saving}
                className="h-11 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)] disabled:opacity-70"
                aria-invalid={Boolean(error && !title.trim())}
              />
              <span className="text-right text-xs font-semibold text-[var(--color-on-surface-variant)]">{title.length}/100</span>
            </label>

            {asset ? (
              <section className="grid gap-3 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3" aria-labelledby="asset-target-heading">
                <div>
                  <h3 id="asset-target-heading" className="text-sm font-black text-[var(--color-on-surface)]">적용되는 슬롯</h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{formatAdminAssetTargets(asset, slots)}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={targetMode === "keep"}
                    onClick={() => setTargetMode("keep")}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs font-bold leading-5 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 ${targetMode === "keep" ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                  >
                    기존 대상 유지
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={targetMode === "shared"}
                    onClick={() => setTargetMode("shared")}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs font-bold leading-5 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 ${targetMode === "shared" ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                  >
                    {isBubble ? "말풍선 전체에 적용" : "해당 분류 전체에 적용"}
                  </button>
                </div>
              </section>
            ) : null}

            {isBubble ? (
              <section className="grid gap-3" aria-labelledby="bubble-adjustment-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="bubble-adjustment-heading" className="text-sm font-black text-[var(--color-on-surface)]">말풍선 조정값</h3>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">이미지는 변경하지 않고 늘어나는 영역과 텍스트 여백만 수정합니다.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:-translate-y-0.5 hover:bg-[var(--color-surface-low)] active:translate-y-0"
                    disabled={saving}
                    onClick={() => setBubbleAdjustment(createDefaultBubbleAdjustment(asset?.analysis))}
                  >
                    공통 기준 자동 맞춤
                  </button>
                </div>
                {loadingFile ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-[22px] bg-[var(--color-surface-low)] text-sm font-bold text-[var(--color-on-surface-variant)]">
                    <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> 편집기 준비 중
                  </div>
                ) : (
                  <>
                    <BubblePlatformSummary adjustment={bubbleAdjustment} activePlatform={bubblePreviewPlatform} onSelectPlatform={setBubblePreviewPlatform} />
                  <InlineBubbleAdjuster
                    file={bubbleFile}
                    slot={bubbleSlot}
                    platform={bubblePreviewPlatform}
                    markers={bubbleAdjustment.markers}
                    insets={bubbleAdjustment.insets}
                    stretch={bubbleAdjustment.stretch}
                    onMarkersChange={(markers) => setBubbleAdjustment((current) => ({ ...current, markers }))}
                    onInsetsChange={(insets) => setBubbleAdjustment((current) => ({ ...current, insets }))}
                    onStretchChange={(stretch) => setBubbleAdjustment((current) => ({ ...current, stretch }))}
                  />
                  </>
                )}
              </section>
            ) : null}

            {error ? <p role="alert" className="rounded-xl bg-[var(--color-error-container)] px-4 py-3 text-sm font-bold text-[var(--color-on-error-container)]">{error}</p> : null}
          </div>

          <footer className="grid grid-cols-2 gap-2 border-t border-[var(--color-outline-variant)] bg-white px-5 py-4 sm:flex sm:justify-end sm:px-6">
            <Dialog.Close asChild>
              <button type="button" disabled={saving} className="min-h-11 rounded-full border border-[var(--color-outline-variant)] px-5 text-sm font-black text-[var(--color-on-surface-variant)] disabled:opacity-40">취소</button>
            </Dialog.Close>
            <button type="button" disabled={saving || loadingFile || (isBubble && !bubbleFile) || !title.trim()} onClick={() => void submitEdit()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-5 text-sm font-black text-[var(--color-inverse-on-surface)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)] disabled:cursor-not-allowed disabled:opacity-45">
              {saving ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
              {saving ? "저장 중" : "변경 저장"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * 업로드 이미지의 크기를 잰다.
 *
 * 브라우저 전용이다 — `Image`와 `URL.createObjectURL`을 쓰므로 서버 공용 `lib/theme`으로
 * 옮기지 않는다. 예전에는 캔버스에 그려 전 픽셀 알파까지 훑었지만, 그 결과(투명도·형태)를
 * 쓰는 곳이 화면 문구밖에 없어 업로드마다 치를 비용이 아니었다.
 */
async function analyzeImageFile(file: File): Promise<AdminAssetAnalysis> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 분석하지 못했습니다."));
      element.src = url;
    });
    return {
      width: image.naturalWidth || undefined,
      height: image.naturalHeight || undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
