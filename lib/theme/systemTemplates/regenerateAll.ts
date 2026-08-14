export type RegenerateTarget = { id: string; title: string };

export type RegenerateAllResult = {
  total: number;
  done: number;
  /** 중단시킨 템플릿. 성공적으로 전부 끝나면 없다. */
  failed?: RegenerateTarget;
  error?: unknown;
};

/**
 * 시스템 템플릿 프리뷰 일괄 재생성.
 *
 * 순차 처리한다. 병렬로 돌리면 서명·업로드 요청이 한꺼번에 몰려 Worker/Storage 쪽 한도를
 * 더 쉽게 넘긴다.
 *
 * 하나라도 실패하면 **즉시 멈추고** 그때까지의 진행 상황을 돌려준다. 재생성 실패는 대부분
 * 서버/스토리지 쪽 문제라 다음 템플릿에서도 그대로 재현되고, 계속 돌리면 이미 한도를 넘긴
 * 서버에 템플릿 수만큼 요청을 더 얹게 된다. 던지는 대신 결과로 돌려주는 이유는 UI가
 * "몇 개까지 끝났고 어디서 멈췄는지"를 보여 줘야 하기 때문이다.
 */
export async function regenerateSystemTemplatePreviews(
  targets: RegenerateTarget[],
  regenerate: (id: string) => Promise<void>,
): Promise<RegenerateAllResult> {
  let done = 0;
  for (const target of targets) {
    try {
      await regenerate(target.id);
    } catch (error) {
      return { total: targets.length, done, failed: target, error };
    }
    done += 1;
  }
  return { total: targets.length, done };
}
