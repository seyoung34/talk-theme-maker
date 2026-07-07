export class AndroidValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AndroidValidationError";
  }
}

export function validateAndroidApplicationId(value: string) {
  if (!/^[a-z0-9_.]+$/.test(value)) {
    throw new AndroidValidationError("invalid_application_id", "applicationId 형식이 올바르지 않습니다.");
  }

  const segments = value.split(".");
  if (segments.length < 2) {
    throw new AndroidValidationError("invalid_application_id", "applicationId는 두 개 이상의 패키지 구간이 필요합니다.");
  }

  for (const segment of segments) {
    if (!segment || !/^[a-z_][a-z0-9_]*$/.test(segment) || androidPackageSegmentReservedWords.has(segment)) {
      throw new AndroidValidationError("invalid_application_id", `applicationId 구간이 올바르지 않습니다: ${segment || "(비어 있음)"}`);
    }
  }
}

export function validateAndroidVersionName(value: string) {
  if (value.length > 40 || !/^\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    throw new AndroidValidationError("invalid_version_name", "versionName은 숫자와 점을 사용한 버전 형식이어야 합니다.");
  }
}

const androidPackageSegmentReservedWords = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
]);
