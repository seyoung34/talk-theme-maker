# Runtime monitor Cloud Build deployment

The pipeline installs dependencies, runs monitor tests and type checking, validates the message template, builds and pushes a commit-tagged image, uploads the template, then updates only the Cloud Run image. Existing service environment and secret references are preserved. Steps run sequentially and stop on failure.

The monitor reads `monitor/messages-v1.json` from the state bucket at runtime and falls back to its built-in copy. Uploading before the image update makes the template available when the new revision starts; text-only edits can instead be applied without rebuilding. After validation, `npm run monitor:messages:push` uploads the template, and the next scheduled tick (every five minutes) reads it. The upload and deployment are separate operations: a failed deployment does not roll back the uploaded text. The repository file is the source of truth: every pipeline run overwrites the bucket copy, so a text edit made directly in the bucket (or with `monitor:messages:push` from an unmerged branch) is replaced at the next monitor deploy.

## One-time operator setup

These commands change production IAM and create a trigger; review and obtain explicit approval before running them. They assume the message-template changes and this pipeline are merged into `main`, the APIs and resources already exist, and the operator has the required permissions. Commands use Bash; replace `GITHUB_OWNER` and `GITHUB_REPO` with the connected repository owner and name.

```bash
PROJECT=project-78d94000-bff9-4358-821
REGION=asia-northeast3
BUILD_SA=runtime-monitor-build@$PROJECT.iam.gserviceaccount.com
RUNTIME_SA=runtime-monitor-run@$PROJECT.iam.gserviceaccount.com

gcloud iam service-accounts create runtime-monitor-build --project="$PROJECT" --display-name="Runtime monitor Cloud Build"
gcloud artifacts repositories add-iam-policy-binding runtime-monitor --project="$PROJECT" --location="$REGION" --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer
gcloud run services add-iam-policy-binding talktheme-runtime-monitor --project="$PROJECT" --region="$REGION" --member="serviceAccount:$BUILD_SA" --role=roles/run.developer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/iam.serviceAccountUser
# Write access only to the template object, never to monitor/state-v1.json.
gcloud storage buckets add-iam-policy-binding gs://kt-theme-runtime-monitor-state --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectAdmin --condition='expression=resource.name == "projects/_/buckets/kt-theme-runtime-monitor-state/objects/monitor/messages-v1.json",title=monitor-messages-template-only'
# gcloud storage cp lists the bucket first; this role lists names but cannot read object content.
gcloud storage buckets add-iam-policy-binding gs://kt-theme-runtime-monitor-state --member="serviceAccount:$BUILD_SA" --role=roles/storage.legacyBucketReader --condition=None
# Manual `gcloud builds submit` uploads source here; the build account must read it.
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT}_cloudbuild" --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --condition=None
# Cloud Build service agent stores the GitHub connection token in Secret Manager (Google-documented requirement).
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:service-779222832316@gcp-sa-cloudbuild.iam.gserviceaccount.com" --role=roles/secretmanager.admin --condition=None
```

`storage.objectAdmin` is needed because replacing an existing template requires delete as well as create permission (`storage.objectCreator` cannot overwrite it). An IAM condition limits it to `monitor/messages-v1.json`, so the build account cannot read or modify `monitor/state-v1.json`. The first production build (2026-11-16) failed at `upload-messages` with only the conditional grant: `gcloud storage cp` needs bucket-level `storage.objects.list`, hence `legacyBucketReader`. The service account running a manual build needs these same permissions; the operator creating or invoking a build must have the appropriate Cloud Build and service-account impersonation permissions.

The trigger uses a 2nd-gen Cloud Build GitHub connection. Creating the connection prints an OAuth link that a person must open while signed in to GitHub, then press **Authorize** (GitHub disables that button for automated clicks) and install the Google Cloud Build app for this repository. Production setup (2026-11-16): connection `talktheme-github`, repository `talk-theme-maker`, trigger `runtime-monitor-main`, all in asia-northeast3.

```bash
gcloud builds connections create github talktheme-github --region="$REGION" --project="$PROJECT"
# Open the printed link, authorize, then confirm stage COMPLETE:
gcloud builds connections describe talktheme-github --region="$REGION" --project="$PROJECT" --format="value(installationState.stage)"

gcloud builds repositories create talk-theme-maker --remote-uri=https://github.com/seyoung34/talk-theme-maker.git --connection=talktheme-github --region="$REGION" --project="$PROJECT"

gcloud builds triggers create github --project="$PROJECT" --region="$REGION" --name=runtime-monitor-main --repository="projects/$PROJECT/locations/$REGION/connections/talktheme-github/repositories/talk-theme-maker" --branch-pattern='^main$' --included-files='services/runtime-monitor/**' --build-config=services/runtime-monitor/cloudbuild.yaml --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA"
```

The path filter covers monitor files, not root dependency or shared configuration changes; assess and run a manual build when those affect the monitor.

## Manual fallback and build context

After production approval, from a clean checkout at the intended commit, this submits the same pipeline without local Docker:

```bash
gcloud builds submit --config services/runtime-monitor/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse HEAD) .
```

Select the intended project and ensure the submit build's service account has the scoped permissions above; the command deploys to production. Confirm the submitted working tree matches the commit used as the image tag.

The repository root `.gcloudignore` keeps local secrets and build output out of the uploaded source (`.env*`, `node_modules`, `.next`, `.open-next`, `.wrangler`, `dist`, `docs`, plus everything in `.gitignore`). Review the upload list with `gcloud meta list-files-for-upload` before the first manual submission.

## Rollback

List revisions and identify the previous healthy revision, then, after approval, route traffic to it:

```bash
gcloud run revisions list --service=talktheme-runtime-monitor --region=asia-northeast3 --project=project-78d94000-bff9-4358-821
gcloud run services update-traffic talktheme-runtime-monitor --region=asia-northeast3 --project=project-78d94000-bff9-4358-821 --to-revisions=<prev>=100
```

Replace `<prev>` with the actual revision name. Traffic rollback does not restore the GCS message template; restore an appropriate validated template separately if needed.
