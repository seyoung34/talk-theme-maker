import { prepareAndroidProject, runGradle, writeAndroidLocalProperties } from "../../lib/theme/android/buildCore.js";

const prepared = await prepareAndroidProject([], {
  applicationId: "com.kakaotalk.theme.builderwarm",
  versionName: "1.0.0",
});

try {
  await writeAndroidLocalProperties(prepared.projectRoot);
  await runGradle(prepared.projectRoot, ["assembleDebug", "--console=plain"]);
} finally {
  await prepared.cleanup();
}
