import type { InspirationPost } from "../../api";

export function getInspirationPromptText(post: InspirationPost): string {
  const promptText = post.prompt_text?.trim();
  if (promptText) {
    return promptText;
  }
  return post.description?.trim() ?? "";
}

export async function copyInspirationPrompt(post: InspirationPost): Promise<boolean> {
  const text = getInspirationPromptText(post);
  if (!text) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}
