import type { SystemTemplatePricingType, SystemTemplateStatus, SystemTemplateVisibility } from "@/lib/theme/systemTemplates";

export type ProjectNotice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
  /**
   * 스스로 사라지지 않고 사용자가 닫을 때까지 남는다.
   *
   * 자동 저장 실패처럼 "지금 작업이 보존되지 않고 있다"를 알리는 알림은 놓치면 편집 내용을
   * 잃는다. 띄운 쪽이 상황이 해소될 때 직접 걷어야 한다.
   */
  persistent?: boolean;
  /**
   * 알림에서 바로 실행할 수 있는 다음 행동.
   *
   * "왜 안 되는지"만 알려 주고 끝내면 사용자가 직접 길을 찾아야 한다. 막다른 길이 될 수 있는
   * 알림은 그 자리에서 갈 곳을 준다.
   *
   * 행동이 있는 알림은 자동으로 사라지지 않는다. 읽고 누를 시간이 필요하다.
   */
  action?: { label: string; onAct: () => void };
};

export type ActiveUserTemplate = {
  id: string;
  name: string;
  createdAt: number;
};

export type ActiveSystemTemplate = {
  id: string;
  bundleId?: string;
  title: string;
  description?: string;
  tags: string[];
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  pricingType: SystemTemplatePricingType;
  priceAmount?: number;
  creditCost?: number;
  createdAt: number;
};

export type InitialLoadState = {
  status: "idle" | "ready" | "loading" | "error";
  message?: string;
  detail?: string;
  current?: number;
  total?: number;
};
