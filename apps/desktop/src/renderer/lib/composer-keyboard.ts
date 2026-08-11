type NativeKeyboardEvent = Pick<KeyboardEvent, "isComposing" | "keyCode">;

export function isImeCompositionEvent(event: NativeKeyboardEvent): boolean {
  // keyCode 229 covers IMEs that clear isComposing before the confirming Enter keydown.
  return event.isComposing || event.keyCode === 229;
}
