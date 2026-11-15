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
gcloud storage buckets add-iam-policy-binding gs://kt-theme-runtime-monitor-state --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter
```

`storage.objectAdmin` is scoped to the dedicated state bucket because replacing an existing template requires delete as well as create permission; `storage.objectCreator` cannot overwrite it. The build account can therefore also modify the monitor state object in that bucket. The service account running a manual build needs these same permissions; the operator creating or invoking a build must have the appropriate Cloud Build and service-account impersonation permissions.

Connect the GitHub repository to Cloud Build first using the supported GitHub connection for the selected trigger; the command below uses the GitHub trigger integration and requires that connection and access to the repository. Verify the project and connection in the Cloud Build console before creating the trigger.

```bash
gcloud builds triggers create github \
  --project="$PROJECT" --region="$REGION" \
  --name=runtime-monitor-main \
  --repo-owner=GITHUB_OWNER --repo-name=GITHUB_REPO \
  --branch-pattern='^main$' \
  --included-files='services/runtime-monitor/**' \
  --build-config=services/runtime-monitor/cloudbuild.yaml \
  --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA"
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
