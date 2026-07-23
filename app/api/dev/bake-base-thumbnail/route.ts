import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// 개발 전용: 내장 기본 템플릿의 갤러리 카드 썸네일을 public/에 굽는다.
// 시스템 템플릿은 저장 시 자동 생성되지만 내장 템플릿은 저장 경로가 없어 이 라우트로 일회 생성한다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedFileNames = new Set(["card-preview.webp"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const fileName = String(formData.get("fileName") ?? "card-preview.webp");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }
  if (!allowedFileNames.has(fileName)) {
    return NextResponse.json({ error: "INVALID_FILE_NAME" }, { status: 400 });
  }

  const targetDir = path.join(process.cwd(), "public", "template-assets", "basic");
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, fileName);
  await writeFile(targetPath, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ path: `/template-assets/basic/${fileName}`, bytes: file.size });
}
