import { createApi, fetchBaseQuery, type BaseQueryFn } from "@reduxjs/toolkit/query/react";

// All API routes respond with { ok: true, data } or { ok: false, error: { message, code } }
// (see lib/api.ts). This base query unwraps that envelope so endpoint definitions
// can work with plain data/error shapes.
type ApiEnvelope<T> =
  { ok: true; data: T } | { ok: false; error: { message: string; code?: string; details?: Record<string, unknown> } };

const rawBaseQuery = fetchBaseQuery({ baseUrl: "/api" });

const unwrappingBaseQuery: BaseQueryFn<
  Parameters<typeof rawBaseQuery>[0],
  unknown,
  { message: string; code?: string; status?: number; details?: Record<string, unknown> }
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error) {
    const data = result.error.data as ApiEnvelope<unknown> | undefined;
    const message = data && !data.ok ? data.error?.message : undefined;
    const code = data && !data.ok ? data.error?.code : undefined;
    const details = data && !data.ok ? data.error?.details : undefined;
    const status = typeof result.error.status === "number" ? result.error.status : undefined;
    return {
      error: {
        message: message ?? (status ? `Request failed (${status})` : "Request failed"),
        code,
        details,
        status,
      },
    };
  }
  const body = result.data as ApiEnvelope<unknown> | undefined;
  if (!body || !body.ok) {
    const message = body && !body.ok ? body.error?.message : undefined;
    return {
      error: {
        message: message ?? "Unexpected response from server",
        code: body && !body.ok ? body.error?.code : undefined,
      },
    };
  }
  return { data: body.data };
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: unwrappingBaseQuery,
  tagTypes: [
    "Organisation",
    "OrganisationList",
    "Profile",
    "AiSetting",
    "Educator",
    "Exam",
    "Question",
    "Licence",
    "Attempt",
    "Result",
    "Certificate",
    "Candidate",
    "Category",
    "Brand",
    "AdminSetting",
    "AdminOverview",
    "AdminOrganisation",
    "AdminUser",
    "AdminExam",
    "AdminAttempt",
    "AdminLog",
    "AdminReport",
    "DashboardOverview",
    "DashboardReport",
    "PublicExam",
    "Payment",
    "PublicExamOrder",
    "MediaAsset",
    "QuestionReview",
    "CandidateReport",
    "AttemptComment",
    "AttemptViolation",
    "RevisionChat",
    "PendingReviewCount",
    "Notification",
    "NotificationCount",
    "ExamRegistry",
  ],
  endpoints: () => ({}),
});
