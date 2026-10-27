// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LabeledSelect } from "@/components/common/labeled-select";

const OPTIONS = [
  { value: "all", label: "Tüm hesaplar" },
  { value: "a", label: "@kahve" },
  { value: "b", label: "@cay" },
];

describe("LabeledSelect", () => {
  it("görünür etiket tetikleyiciye bağlıdır (etikete tıklamak odaklar; erişilebilir ad etiket metnidir)", () => {
    render(<LabeledSelect id="hesap" label="Hesap" value="all" options={OPTIONS} onChange={() => {}} className="w-44" />);
    const trigger = screen.getByRole("combobox", { name: "Hesap" });
    expect(trigger).toHaveAttribute("id", "hesap");
    expect(trigger).toHaveTextContent("Tüm hesaplar");
    expect(screen.getByText("Hesap").tagName).toBe("LABEL");
    expect(screen.getByLabelText("Hesap")).toBe(trigger);
  });

  it("kimlik verilmezse üretilir ve iki örnek çakışmaz", () => {
    render(
      <>
        <LabeledSelect label="Biçim" value="all" options={OPTIONS} onChange={() => {}} />
        <LabeledSelect label="Sıralama" value="a" options={OPTIONS} onChange={() => {}} />
      </>,
    );
    const ids = [screen.getByRole("combobox", { name: "Biçim" }), screen.getByRole("combobox", { name: "Sıralama" })].map((el) => el.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("hideLabel: etiket çizilmez, yalnız aria-label kalır", () => {
    render(<LabeledSelect hideLabel label="Haftalık özet günü" value="a" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Haftalık özet günü" })).toHaveTextContent("@kahve");
    expect(document.querySelector("label")).toBeNull();
  });

  it("seçim onChange'e seçeneğin değeri olarak gider; devre dışıyken açılmaz", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    const { rerender } = render(<LabeledSelect label="Hesap" value="all" options={OPTIONS} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Hesap" }));
    await user.click(await screen.findByRole("option", { name: "@cay" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("b");

    rerender(<LabeledSelect label="Hesap" value="all" options={OPTIONS} onChange={onChange} disabled />);
    expect(screen.getByRole("combobox", { name: "Hesap" })).toBeDisabled();
  });
});
