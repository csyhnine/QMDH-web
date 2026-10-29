type Question = { message: string; resolve: (answer: boolean) => void };
const questions: Question[] = [];
let showing = false;
let nextId = 0;

/** Native HTML dialog top layer, separate from browser-owned window.confirm prompts. */
export function confirmPlanning(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    questions.push({ message, resolve });
    showNext();
  });
}
function showNext() {
  if (showing || !questions.length) return;
  const question = questions.shift()!;
  if (typeof document === "undefined") {
    question.resolve(false);
    showNext();
    return;
  }
  showing = true;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement("dialog");
  dialog.className = "mp-confirm-dialog";
  const id = `mp-confirm-${++nextId}`;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-message`);
  dialog.setAttribute("aria-modal", "true");
  const heading = document.createElement("h2");
  heading.id = `${id}-title`;
  heading.textContent = "确认操作";
  const text = document.createElement("p");
  text.id = `${id}-message`;
  text.textContent = question.message;
  const actions = document.createElement("div");
  actions.className = "mp-confirm-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "mp-confirm-accept";
  accept.textContent = "确定";
  actions.append(cancel, accept);
  dialog.append(heading, text, actions);
  document.body.append(dialog);
  let finished = false;
  function finish(answer: boolean) {
    if (finished) return;
    finished = true;
    dialog.close();
    dialog.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    showing = false;
    question.resolve(answer);
    queueMicrotask(showNext);
  }
  cancel.addEventListener("click", () => finish(false));
  accept.addEventListener("click", () => finish(true));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish(false);
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancel) {
      event.preventDefault();
      accept.focus();
    } else if (!event.shiftKey && document.activeElement === accept) {
      event.preventDefault();
      cancel.focus();
    }
  });
  dialog.showModal();
  cancel.focus({ preventScroll: true });
}
