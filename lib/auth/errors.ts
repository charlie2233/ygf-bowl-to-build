export function isIdentityAlreadyExistsError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "identity_already_exists"
  );
}
