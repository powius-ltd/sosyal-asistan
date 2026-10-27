// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { CHAT_WINDOW_ATTRIBUTE, isEscapeForAnotherLayer } from "@/components/chat/escape-layer";

afterEach(() => {
  document.body.innerHTML = "";
});

function escapeOn(target: Element, { prevented = false } = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.addEventListener("keydown", (e) => prevented && e.preventDefault(), { once: true });
  target.dispatchEvent(event);
  return event;
}

describe("isEscapeForAnotherLayer", () => {
  it("olay yok ya da sayfadan geliyorsa false (sohbet kapanır)", () => {
    expect(isEscapeForAnotherLayer(undefined)).toBe(false);
    expect(isEscapeForAnotherLayer(escapeOn(document.body))).toBe(false);
  });

  it("olay zaten ele alındıysa (defaultPrevented) true", () => {
    expect(isEscapeForAnotherLayer(escapeOn(document.body, { prevented: true }))).toBe(true);
  });

  it("odak başka bir pencere / menü / listenin içindeyse true", () => {
    document.body.innerHTML = '<div role="dialog"><button id="in-dialog"></button></div><div role="listbox"><span id="in-list"></span></div>';
    expect(isEscapeForAnotherLayer(escapeOn(document.getElementById("in-dialog")!))).toBe(true);
    expect(isEscapeForAnotherLayer(escapeOn(document.getElementById("in-list")!))).toBe(true);
  });

  it("sohbet penceresinin kendisi de role=dialog olsa da içinden gelen Esc ona aittir (false)", () => {
    document.body.innerHTML = `<div role="dialog" ${CHAT_WINDOW_ATTRIBUTE}><textarea id="own"></textarea></div>`;
    expect(isEscapeForAnotherLayer(escapeOn(document.getElementById("own")!))).toBe(false);
  });
});
