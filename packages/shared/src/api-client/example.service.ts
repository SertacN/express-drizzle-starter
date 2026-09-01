import type {
    Example,
    ExampleCreateInput,
    ExampleList,
    ExampleListQuery,
    ExampleUpdateInput,
} from "../validators/example.js";
import type { RequestFn } from "./http.js";

function toQuery(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : "";
}

export function createExampleService(request: RequestFn) {
    return {
        list: (query: Partial<ExampleListQuery> = {}) =>
            request<ExampleList>(`/api/v1/examples${toQuery(query)}`),
        get: (id: string) => request<Example>(`/api/v1/examples/${id}`),
        create: (input: ExampleCreateInput) =>
            request<Example>("/api/v1/examples", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        update: (id: string, input: ExampleUpdateInput) =>
            request<Example>(`/api/v1/examples/${id}`, {
                method: "PATCH",
                body: JSON.stringify(input),
            }),
        /** Soft delete — the row stays, `is_deleted` flips to true. */
        remove: (id: string) => request<void>(`/api/v1/examples/${id}`, { method: "DELETE" }),
        /** Anonymous surface: published rows only, no token needed. */
        listPublished: () => request<Example[]>("/api/v1/public/examples"),
    };
}
