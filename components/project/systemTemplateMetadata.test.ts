import { describe, expect, it } from "vitest";
import {
  createDefaultSystemTemplateMetadata,
  getSystemTemplateDialogInitialization,
} from "@/components/project/systemTemplateMetadata";
import type { ActiveSystemTemplate } from "@/components/project/editorTypes";

const savedTemplate: ActiveSystemTemplate = {
  id: "system-template-1",
  bundleId: "bundle-1",
  title: "저장된 제목",
  description: "저장된 설명",
  tags: ["saved", "tag"],
  status: "published",
  visibility: "public",
  pricingType: "paid",
  priceAmount: 0,
  creditCost: 0,
  createdAt: 1,
};

describe("getSystemTemplateDialogInitialization", () => {
  it("자동 저장에서 복원했거나 이미 열었던 폼은 저장된 메타데이터로 덮어쓰지 않는다", () => {
    const restored = {
      ...createDefaultSystemTemplateMetadata("복원된 제목"),
      description: "저장 전 설명",
      tags: "draft, metadata",
      priceAmount: "1200",
    };

    expect(
      getSystemTemplateDialogInitialization({
        activeSystemTemplate: savedTemplate,
        current: restored,
        fallbackTitle: "기본 제목",
        initialized: true,
      }),
    ).toBeNull();
  });

  it("처음 여는 기존 시스템 템플릿은 저장된 값을 폼 초기값으로 쓴다", () => {
    expect(
      getSystemTemplateDialogInitialization({
        activeSystemTemplate: savedTemplate,
        current: createDefaultSystemTemplateMetadata(""),
        fallbackTitle: "기본 제목",
        initialized: false,
      }),
    ).toEqual({
      title: "저장된 제목",
      description: "저장된 설명",
      tags: "saved, tag",
      status: "published",
      visibility: "public",
      pricingType: "paid",
      priceAmount: "0",
      creditCost: "0",
    });
  });

  it("새 시스템 템플릿은 현재 입력값을 유지하고 빈 제목만 기본 제목으로 채운다", () => {
    const current = {
      ...createDefaultSystemTemplateMetadata(""),
      description: "작성 중인 설명",
      tags: "new",
    };

    expect(
      getSystemTemplateDialogInitialization({
        activeSystemTemplate: null,
        current,
        fallbackTitle: "기본 테마",
        initialized: false,
      }),
    ).toEqual({ ...current, title: "기본 테마" });
  });
});
