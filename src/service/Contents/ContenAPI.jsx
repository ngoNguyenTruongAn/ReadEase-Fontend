import instance from "../instance";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIN_BODY_LENGTH = 50;
const DIFFICULTY_VALUES = new Set(["EASY", "MEDIUM", "HARD"]);
const CONTENT_DETAIL_DISABLE_KEY = "readease:content-detail-disabled-until";
const CONTENT_DETAIL_DISABLE_TTL_MS = 60 * 1000;

const hasOwn = (object, key) =>
  Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const toErrorDetails = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  const single = toTrimmedString(value);
  return single ? [single] : [];
};

const getSessionStorageSafe = () => {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getDisabledUntilTimestamp = () => {
  const storage = getSessionStorageSafe();
  if (!storage) return 0;

  const raw = storage.getItem(CONTENT_DETAIL_DISABLE_KEY);
  const parsed = Number.parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isContentDetailTemporarilyDisabled = () => getDisabledUntilTimestamp() > Date.now();

const disableContentDetailTemporarily = () => {
  const storage = getSessionStorageSafe();
  if (!storage) return;

  storage.setItem(
    CONTENT_DETAIL_DISABLE_KEY,
    String(Date.now() + CONTENT_DETAIL_DISABLE_TTL_MS),
  );
};

const clearContentDetailDisableFlag = () => {
  const storage = getSessionStorageSafe();
  if (!storage) return;

  storage.removeItem(CONTENT_DETAIL_DISABLE_KEY);
};

const shouldDisableContentDetailEndpoint = (error) => {
  const status = Number(error?.status);
  if (Number.isFinite(status) && status >= 500) {
    return true;
  }

  const haystack = [error?.message, ...(error?.details || [])]
    .map((item) => String(item ?? ""))
    .join(" ")
    .toLowerCase();

  return /column\s+.*body_url\s+does not exist/.test(haystack);
};

const normalizeApiError = (error, fallbackMessage = "Yeu cau that bai") => {
  const responseBody = error?.response?.data;
  const apiError =
    (isPlainObject(responseBody?.error) && responseBody.error) ||
    (isPlainObject(responseBody) && hasOwn(responseBody, "success") && !responseBody.success
      ? responseBody.error
      : null);

  const details = toErrorDetails(apiError?.details);
  const message =
    details[0] ||
    toTrimmedString(apiError?.message) ||
    toTrimmedString(responseBody?.message) ||
    toTrimmedString(error?.message) ||
    fallbackMessage;

  const normalizedError = new Error(message);
  normalizedError.response = error?.response;
  normalizedError.status = error?.response?.status ?? null;
  normalizedError.code =
    toTrimmedString(apiError?.code) || toTrimmedString(error?.code) || "UNKNOWN";
  normalizedError.details = details;

  return normalizedError;
};

const unwrapSuccessData = (response) => {
  const body = response?.data;

  if (isPlainObject(body) && hasOwn(body, "success")) {
    if (body.success === true) {
      return body.data ?? null;
    }

    throw normalizeApiError(
      {
        response: {
          status: response?.status,
          data: body,
        },
      },
      "API tra ve trang thai that bai",
    );
  }

  return body?.data ?? body ?? null;
};

const ensureContentId = (contentId) => {
  if (!contentId && contentId !== 0) {
    throw new Error("contentId is required to fetch reading detail.");
  }

  return encodeURIComponent(String(contentId));
};

const toValidatedPage = (value) => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_PAGE), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE;
};

const toValidatedLimit = (value) => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_LIMIT), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

const sanitizeListQuery = (query = {}) => {
  const safeQuery = isPlainObject(query) ? query : {};
  const normalized = {
    page: toValidatedPage(safeQuery.page),
    limit: toValidatedLimit(safeQuery.limit),
  };

  const difficulty = toTrimmedString(safeQuery.difficulty).toUpperCase();
  if (DIFFICULTY_VALUES.has(difficulty)) {
    normalized.difficulty = difficulty;
  }

  const ageGroup = toTrimmedString(safeQuery.age_group ?? safeQuery.ageGroup);
  if (ageGroup) {
    normalized.age_group = ageGroup;
  }

  return normalized;
};

const assertValidUriOrEmpty = (value, fieldName) => {
  if (value === "" || value === null || value === undefined) {
    return;
  }

  try {
    new URL(String(value));
  } catch {
    throw new Error(`${fieldName} must be a valid URI.`);
  }
};

const normalizeWritePayload = (inputPayload, { isUpdate = false } = {}) => {
  if (!isPlainObject(inputPayload)) {
    throw new Error("Payload must be an object.");
  }

  const payload = inputPayload;
  const normalizedPayload = {};
  const hasBody = hasOwn(payload, "body") || hasOwn(payload, "content");
  const hasAgeGroup = hasOwn(payload, "age_group") || hasOwn(payload, "ageGroup");
  const hasCover = hasOwn(payload, "cover_image_url") || hasOwn(payload, "coverImageUrl");

  if (!isUpdate || hasOwn(payload, "title")) {
    const title = toTrimmedString(payload.title);
    if (!title || title.length < 3 || title.length > 255) {
      throw new Error("Title must be between 3 and 255 characters.");
    }
    normalizedPayload.title = title;
  }

  if (!isUpdate || hasBody) {
    const body = toTrimmedString(payload.body ?? payload.content);
    if (body.length < MIN_BODY_LENGTH) {
      throw new Error("Body must be at least 50 characters.");
    }
    normalizedPayload.body = body;
  }

  if (!isUpdate || hasOwn(payload, "difficulty")) {
    const difficulty = toTrimmedString(payload.difficulty).toUpperCase();
    if (!DIFFICULTY_VALUES.has(difficulty)) {
      throw new Error("Difficulty must be one of EASY, MEDIUM, HARD.");
    }
    normalizedPayload.difficulty = difficulty;
  }

  if (!isUpdate || hasAgeGroup) {
    const ageGroup = toTrimmedString(payload.age_group ?? payload.ageGroup);
    if (!ageGroup) {
      throw new Error("age_group is required.");
    }
    normalizedPayload.age_group = ageGroup;
  }

  if (!isUpdate || hasCover) {
    const coverImageUrl = payload.cover_image_url ?? payload.coverImageUrl;
    const normalizedCover =
      coverImageUrl === null || coverImageUrl === undefined
        ? null
        : toTrimmedString(coverImageUrl);
    assertValidUriOrEmpty(normalizedCover, "cover_image_url");
    normalizedPayload.cover_image_url = normalizedCover;
  }

  if (isUpdate && Object.keys(normalizedPayload).length === 0) {
    throw new Error("At least one field is required to update content.");
  }

  return normalizedPayload;
};

const fetchTextFromUrl = async (url) => {
  const normalizedUrl = toTrimmedString(url);
  if (!normalizedUrl) {
    return null;
  }

  const response = await fetch(normalizedUrl, { method: "GET" });

  if (!response.ok) {
    const fetchError = new Error(`Failed to fetch content from URL (${response.status}).`);
    fetchError.code = "CONTENT_URL_FETCH_FAILED";
    fetchError.details = [`status=${response.status}`, `url=${normalizedUrl}`];
    throw fetchError;
  }

  const responseText = String(await response.text()).replace(/\r/g, "").trim();
  if (!responseText) {
    const emptyError = new Error("Content URL returned empty text.");
    emptyError.code = "CONTENT_URL_EMPTY";
    emptyError.details = [`url=${normalizedUrl}`];
    throw emptyError;
  }

  return responseText;
};

const buildUnavailableContentResult = ({ bodyUrl, bodySegmentedUrl, error }) => ({
  isAvailable: false,
  source: "none",
  bodyUrl: bodyUrl || null,
  bodySegmentedUrl: bodySegmentedUrl || null,
  bodyText: "",
  segmentedText: "",
  errorCode: error?.code || "CONTENT_UNAVAILABLE",
  errorMessage: error?.message || "Content is unavailable.",
  errorDetails: toErrorDetails(error?.details),
});

const resolveReadingStoryContent = async (contentDetail) => {
  const inlineBodyText = toTrimmedString(contentDetail?.body ?? contentDetail?.content);
  const inlineSegmentedText = toTrimmedString(
    contentDetail?.body_segmented ??
      contentDetail?.bodySegmented ??
      contentDetail?.segmented_body ??
      contentDetail?.segmentedBody,
  );

  if (inlineBodyText || inlineSegmentedText) {
    const resolvedBodyText = inlineBodyText || inlineSegmentedText;
    const resolvedSegmentedText = inlineSegmentedText || inlineBodyText;

    return {
      isAvailable: true,
      source: "inline_body",
      bodyUrl: null,
      bodySegmentedUrl: null,
      bodyText: resolvedBodyText,
      segmentedText: resolvedSegmentedText,
      errorCode: null,
      errorMessage: "",
      errorDetails: [],
    };
  }

  const bodySegmentedUrl = toTrimmedString(
    contentDetail?.body_segmented_url ?? contentDetail?.bodySegmentedUrl,
  );
  const bodyUrl = toTrimmedString(contentDetail?.body_url ?? contentDetail?.bodyUrl);

  if (!bodySegmentedUrl && !bodyUrl) {
    return buildUnavailableContentResult({
      bodyUrl,
      bodySegmentedUrl,
      error: {
        code: "CONTENT_URL_MISSING",
        message: "Missing body_url and body_segmented_url.",
        details: ["body_url and body_segmented_url are empty"],
      },
    });
  }

  if (bodySegmentedUrl) {
    try {
      const segmentedText = await fetchTextFromUrl(bodySegmentedUrl);
      let bodyText = segmentedText;

      if (bodyUrl && bodyUrl !== bodySegmentedUrl) {
        try {
          const fetchedBodyText = await fetchTextFromUrl(bodyUrl);
          if (fetchedBodyText) {
            bodyText = fetchedBodyText;
          }
        } catch (secondaryError) {
          console.warn(
            "Unable to fetch body_url, continuing with body_segmented_url content:",
            secondaryError,
          );
        }
      }

      return {
        isAvailable: true,
        source: "body_segmented_url",
        bodyUrl: bodyUrl || null,
        bodySegmentedUrl,
        bodyText,
        segmentedText,
        errorCode: null,
        errorMessage: "",
        errorDetails: [],
      };
    } catch (error) {
      return buildUnavailableContentResult({ bodyUrl, bodySegmentedUrl, error });
    }
  }

  try {
    const bodyText = await fetchTextFromUrl(bodyUrl);
    return {
      isAvailable: true,
      source: "body_url",
      bodyUrl,
      bodySegmentedUrl: null,
      bodyText,
      segmentedText: bodyText,
      errorCode: null,
      errorMessage: "",
      errorDetails: [],
    };
  } catch (error) {
    return buildUnavailableContentResult({ bodyUrl, bodySegmentedUrl, error });
  }
};

const getReadingStories = async (query = {}) => {
  try {
    const response = await instance.get("content", {
      params: sanitizeListQuery(query),
    });
    return unwrapSuccessData(response);
  } catch (error) {
    const normalizedError = normalizeApiError(error, "Khong the lay danh sach truyen.");
    console.warn("Error getting reading stories:", normalizedError);
    throw normalizedError;
  }
};

const getReadingStoryDetail = async (contentId) => {
  const id = ensureContentId(contentId);

  if (isContentDetailTemporarilyDisabled()) {
    const disabledError = new Error(
      "Content detail endpoint is temporarily unavailable due to backend schema mismatch.",
    );
    disabledError.code = "CONTENT_DETAIL_ENDPOINT_TEMPORARILY_DISABLED";
    disabledError.details = [
      "Temporarily skipped GET /content/:id to avoid repeated 500 responses.",
    ];
    throw disabledError;
  }

  try {
    const response = await instance.get(`content/${id}`);
    const payload = unwrapSuccessData(response);
    clearContentDetailDisableFlag();
    return payload;
  } catch (error) {
    const normalizedError = normalizeApiError(error, "Khong the lay chi tiet truyen.");

    if (shouldDisableContentDetailEndpoint(normalizedError)) {
      disableContentDetailTemporarily();
      normalizedError.code = "CONTENT_DETAIL_ENDPOINT_TEMPORARILY_DISABLED";
      normalizedError.details = [
        ...toErrorDetails(normalizedError.details),
        `endpoint_disabled_for_ms=${CONTENT_DETAIL_DISABLE_TTL_MS}`,
      ];
    }

    throw normalizedError;
  }
};

const createContent = async (payload) => {
  let requestPayload;

  try {
    requestPayload = normalizeWritePayload(payload, { isUpdate: false });
  } catch (validationError) {
    throw normalizeApiError(validationError, validationError.message);
  }

  try {
    const response = await instance.post("content", requestPayload);
    return unwrapSuccessData(response);
  } catch (error) {
    const normalizedError = normalizeApiError(error, "Khong the tao truyen moi.");
    console.warn("Error creating content:", normalizedError);
    throw normalizedError;
  }
};

const updateContent = async (contentId, payload) => {
  const id = ensureContentId(contentId);
  let requestPayload;

  try {
    requestPayload = normalizeWritePayload(payload, { isUpdate: true });
  } catch (validationError) {
    throw normalizeApiError(validationError, validationError.message);
  }

  try {
    const response = await instance.put(`content/${id}`, requestPayload);
    return unwrapSuccessData(response);
  } catch (error) {
    const normalizedError = normalizeApiError(error, "Khong the cap nhat truyen.");
    console.warn("Error updating content:", normalizedError);
    throw normalizedError;
  }
};

const deleteContent = async (contentId) => {
  const id = ensureContentId(contentId);

  try {
    const response = await instance.delete(`content/${id}`);
    return unwrapSuccessData(response);
  } catch (error) {
    const normalizedError = normalizeApiError(error, "Khong the xoa truyen.");
    console.warn("Error deleting content:", normalizedError);
    throw normalizedError;
  }
};

const postReadingStory = async (title, content, difficulty, ageGroup, coverImageUrl = null) =>
  createContent({
    title,
    body: content,
    difficulty,
    age_group: ageGroup,
    cover_image_url: coverImageUrl,
  });

export default {
  getReadingStories,
  getReadingStoryDetail,
  resolveReadingStoryContent,
  createContent,
  updateContent,
  deleteContent,
  postReadingStory,
};
