import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";

const DEFAULT_BASE_URL = "http://localhost:3000/api/v1";
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_OUTPUT_PATH = "scripts/backfill-content.missing.json";

const toTrimmedString = (value) => String(value ?? "").trim();

const parseBooleanFlag = (args, key) => args.includes(`--${key}`);

const parseValueFlag = (args, key, fallbackValue = "") => {
  const flag = `--${key}`;
  const flagIndex = args.indexOf(flag);

  if (flagIndex < 0) {
    return fallbackValue;
  }

  const rawValue = args[flagIndex + 1];
  return rawValue === undefined || rawValue.startsWith("--") ? fallbackValue : rawValue;
};

const parseIntegerFlag = (args, key, fallbackValue) => {
  const rawValue = parseValueFlag(args, key, String(fallbackValue));
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
};

const normalizeApiError = (error, fallbackMessage) => {
  const responseBody = error?.response?.data;
  const apiError = responseBody?.error;

  const details = Array.isArray(apiError?.details)
    ? apiError.details.map((item) => String(item))
    : [];

  const message =
    details[0] ||
    toTrimmedString(apiError?.message) ||
    toTrimmedString(responseBody?.message) ||
    toTrimmedString(error?.message) ||
    fallbackMessage;

  const normalized = new Error(message);
  normalized.code =
    toTrimmedString(apiError?.code) || toTrimmedString(error?.code) || "UNKNOWN";
  normalized.status = error?.response?.status ?? null;
  normalized.details = details;
  normalized.response = error?.response;

  return normalized;
};

const unwrapSuccessData = (response) => {
  const body = response?.data;

  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "success")) {
    if (body.success) {
      return body.data ?? null;
    }

    throw normalizeApiError(
      {
        response: {
          status: response?.status,
          data: body,
        },
      },
      "API returned success=false",
    );
  }

  return body?.data ?? body ?? null;
};

const ensureTrailingSlash = (value) => `${toTrimmedString(value).replace(/\/+$/u, "")}/`;

const loadMappingFile = async (filePath) => {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.items)) {
    return parsed.items;
  }

  throw new Error("Mapping file must be an array or an object with an items array.");
};

const fetchAllContentSummaries = async ({ apiClient, pageSize }) => {
  const summaries = [];
  let page = 1;

  while (true) {
    const response = await apiClient.get("content", {
      params: {
        page,
        limit: pageSize,
      },
    });

    const payload = unwrapSuccessData(response);
    const items = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    if (items.length === 0) {
      break;
    }

    summaries.push(...items);

    const totalPages = Number.parseInt(String(payload?.meta?.totalPages ?? "0"), 10);
    if (Number.isInteger(totalPages) && totalPages > 0) {
      if (page >= totalPages) {
        break;
      }
    } else if (items.length < pageSize) {
      break;
    }

    page += 1;
  }

  return summaries;
};

const fetchContentDetail = async ({ apiClient, contentId }) => {
  const encodedId = encodeURIComponent(String(contentId));
  const response = await apiClient.get(`content/${encodedId}`);
  return unwrapSuccessData(response);
};

const hasMissingUrls = (detail) => {
  const bodyUrl = toTrimmedString(detail?.body_url);
  const segmentedUrl = toTrimmedString(detail?.body_segmented_url);
  return !bodyUrl || !segmentedUrl;
};

const indexBodyMappingById = (mappingItems) => {
  const result = new Map();

  mappingItems.forEach((item) => {
    const id = toTrimmedString(item?.id);
    if (!id) return;

    const body = toTrimmedString(item?.body);
    result.set(id, {
      ...item,
      body,
    });
  });

  return result;
};

const updateContentBody = async ({ apiClient, contentId, token, body }) => {
  const encodedId = encodeURIComponent(String(contentId));
  const response = await apiClient.put(
    `content/${encodedId}`,
    { body },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return unwrapSuccessData(response);
};

const writeTemplateFile = async ({ outputPath, missingItems }) => {
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const dirPath = path.dirname(resolvedPath);

  await fs.mkdir(dirPath, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    itemCount: missingItems.length,
    items: missingItems.map((item) => ({
      id: item.id,
      title: item.title,
      difficulty: item.difficulty,
      age_group: item.age_group,
      word_count: item.word_count,
      body: "",
      note: "Paste raw story body text with at least 50 characters.",
    })),
  };

  await fs.writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return resolvedPath;
};

const run = async () => {
  const args = process.argv.slice(2);

  const applyMode = parseBooleanFlag(args, "apply");
  const baseUrl = parseValueFlag(args, "base-url", DEFAULT_BASE_URL);
  const inputPath = parseValueFlag(args, "input", "");
  const outputPath = parseValueFlag(args, "output", DEFAULT_OUTPUT_PATH);
  const token = parseValueFlag(args, "token", process.env.BACKFILL_CLINICIAN_TOKEN || "");
  const pageSize = parseIntegerFlag(args, "page-size", DEFAULT_PAGE_SIZE);

  const apiClient = axios.create({
    baseURL: ensureTrailingSlash(baseUrl),
    timeout: 20000,
  });

  console.log("[backfill] Fetching content summaries...");
  const summaries = await fetchAllContentSummaries({ apiClient, pageSize });
  console.log(`[backfill] Total content rows scanned: ${summaries.length}`);

  const missingItems = [];
  const detailErrors = [];

  for (const summary of summaries) {
    const contentId = toTrimmedString(summary?.id);
    if (!contentId) continue;

    try {
      const detail = await fetchContentDetail({ apiClient, contentId });

      if (hasMissingUrls(detail)) {
        missingItems.push({
          id: contentId,
          title: summary?.title || detail?.title || "",
          difficulty: summary?.difficulty || detail?.difficulty || "",
          age_group: summary?.age_group || detail?.age_group || "",
          word_count: summary?.word_count ?? detail?.word_count ?? null,
          body_url: detail?.body_url || null,
          body_segmented_url: detail?.body_segmented_url || null,
        });
      }
    } catch (error) {
      const normalizedError = normalizeApiError(error, "Failed to fetch content detail");
      detailErrors.push({
        id: contentId,
        title: summary?.title || "",
        status: normalizedError.status,
        code: normalizedError.code,
        message: normalizedError.message,
      });
    }
  }

  console.log(`[backfill] Missing URL rows: ${missingItems.length}`);
  if (detailErrors.length > 0) {
    console.log(`[backfill] Detail fetch errors: ${detailErrors.length}`);
    detailErrors.forEach((item) => {
      console.log(
        `[backfill] detail-error id=${item.id} status=${item.status ?? "?"} code=${item.code} msg=${item.message}`,
      );
    });
  }

  if (!applyMode) {
    const resolvedTemplatePath = await writeTemplateFile({ outputPath, missingItems });
    console.log(`[backfill] Template file written: ${resolvedTemplatePath}`);
    console.log("[backfill] Next steps:");
    console.log("  1) Fill body text for each item in the template file.");
    console.log(
      "  2) Re-run with --apply --input <file> --token <ROLE_CLINICIAN_JWT> to regenerate URLs.",
    );
    return;
  }

  if (!inputPath) {
    throw new Error("--input is required in --apply mode.");
  }

  if (!token) {
    throw new Error("--token is required in --apply mode (or set BACKFILL_CLINICIAN_TOKEN).");
  }

  const mappingItems = await loadMappingFile(inputPath);
  const mappingById = indexBodyMappingById(mappingItems);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const item of missingItems) {
    const mapped = mappingById.get(item.id);
    const body = toTrimmedString(mapped?.body);

    if (!body) {
      skippedCount += 1;
      console.log(`[backfill] skipped id=${item.id} reason=missing_body`);
      continue;
    }

    if (body.length < 50) {
      skippedCount += 1;
      console.log(`[backfill] skipped id=${item.id} reason=body_too_short`);
      continue;
    }

    try {
      await updateContentBody({
        apiClient,
        contentId: item.id,
        token,
        body,
      });

      const verifyDetail = await fetchContentDetail({ apiClient, contentId: item.id });
      const bodyUrl = toTrimmedString(verifyDetail?.body_url);
      const segmentedUrl = toTrimmedString(verifyDetail?.body_segmented_url);

      if (bodyUrl && segmentedUrl) {
        updatedCount += 1;
        console.log(`[backfill] updated id=${item.id}`);
      } else {
        failedCount += 1;
        console.log(`[backfill] failed id=${item.id} reason=url_still_missing_after_update`);
      }
    } catch (error) {
      const normalizedError = normalizeApiError(error, "Failed to backfill content");
      failedCount += 1;
      console.log(
        `[backfill] failed id=${item.id} status=${normalizedError.status ?? "?"} code=${normalizedError.code} msg=${normalizedError.message}`,
      );
    }
  }

  console.log("[backfill] Apply summary:");
  console.log(`  updated=${updatedCount}`);
  console.log(`  skipped=${skippedCount}`);
  console.log(`  failed=${failedCount}`);
};

run().catch((error) => {
  const normalizedError = normalizeApiError(error, "Backfill script failed");
  console.error(
    `[backfill] fatal status=${normalizedError.status ?? "?"} code=${normalizedError.code} msg=${normalizedError.message}`,
  );
  process.exit(1);
});
