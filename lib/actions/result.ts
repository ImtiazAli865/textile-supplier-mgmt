export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : { data: T }))
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function fail(error: unknown): ActionResult<never> {
  if (error && typeof error === "object" && "issues" in error) {
    // ZodError
    const zodError = error as { issues: { path: (string | number)[]; message: string }[] };
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { success: false, error: message };
}
