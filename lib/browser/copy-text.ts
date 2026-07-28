export async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Insecure LAN origins can expose Clipboard without allowing writes.
  }

  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("aria-hidden", "true");
  field.setAttribute("readonly", "");
  field.tabIndex = -1;
  field.style.position = "fixed";
  field.style.inset = "0 auto auto -9999px";
  field.style.opacity = "0";
  document.body.append(field);
  let copied = false;
  try {
    field.select();
    copied =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
  } finally {
    field.remove();
    previousFocus?.focus();
  }

  if (!copied) {
    throw new Error("COPY_FAILED");
  }
}
