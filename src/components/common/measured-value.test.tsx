// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeasuredValue } from "@/components/common/measured-value";
import { fromNumber, measured, unmeasured } from "@/lib/domain/measured";

describe("MeasuredValue", () => {
  it("undefined → \"—\" gösterir ve sebebi erişilebilir etiket olarak taşır", () => {
    render(<MeasuredValue value={undefined} reason="Platform kaydetme sayısını vermedi" />);

    const dash = screen.getByText("—");
    expect(dash).toBeInTheDocument();
    expect(dash).toHaveAttribute("data-state", "unmeasured");
    expect(screen.getByLabelText("Ölçülemedi: Platform kaydetme sayısını vermedi")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("0 → \"0\" gösterir (ölçtük, sıfır) ve tire çizmez", () => {
    render(<MeasuredValue value={0} />);

    const zero = screen.getByText("0");
    expect(zero).toHaveAttribute("data-state", "measured");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("null ve sonlu olmayan sayı da \"—\" olur, sıfıra çevrilmez", () => {
    render(
      <>
        <span data-testid="null"><MeasuredValue value={null} /></span>
        <span data-testid="nan"><MeasuredValue value={Number.NaN} /></span>
      </>,
    );

    expect(screen.getByTestId("null")).toHaveTextContent("—");
    expect(screen.getByTestId("nan")).toHaveTextContent("—");
  });

  it("sebep verilmezse varsayılan sebep kullanılır", () => {
    render(<MeasuredValue value={undefined} />);
    expect(screen.getByLabelText("Ölçülemedi: Bu alan ölçülemedi.")).toBeInTheDocument();
  });

  it("`inline`: sebep tirenin yanında görünür yazılır (balon yok), asla 0 değil; ölçülmüş değeri etkilemez", () => {
    const { container } = render(
      <>
        <span data-testid="u"><MeasuredValue value={undefined} reason="Platform vermedi" inline /></span>
        <span data-testid="m"><MeasuredValue value={0} inline /></span>
      </>,
    );

    expect(screen.getByTestId("u")).toHaveTextContent("—Ölçülemedi: Platform vermedi");
    expect(screen.getByText("Platform vermedi")).toBeVisible();
    expect(container.querySelector('[data-state="unmeasured"]')).toHaveTextContent("—");
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
    expect(screen.getByTestId("u")).not.toHaveTextContent("0");
    expect(screen.getByTestId("m")).toHaveTextContent("0");
  });

  it("boş metin hiçbir şey çizmez", () => {
    const { container } = render(<MeasuredValue value="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sayıyı tr-TR biçimiyle, özel format fonksiyonunu olduğu gibi basar", () => {
    render(
      <>
        <span data-testid="plain"><MeasuredValue value={1234567} /></span>
        <span data-testid="custom"><MeasuredValue value={5.25} format={(v) => `${v}x`} /></span>
      </>,
    );

    expect(screen.getByTestId("plain")).toHaveTextContent("1.234.567");
    expect(screen.getByTestId("custom")).toHaveTextContent("5.25x");
  });

  it("boolean false \"Hayır\" olarak gösterilir (yokluk değil, ölçüm)", () => {
    render(<MeasuredValue value={false} />);
    expect(screen.getByText("Hayır")).toBeInTheDocument();
  });

  it("Measured<T> girdisini kabul eder: measured / unmeasured / fromNumber", () => {
    render(
      <>
        <span data-testid="m"><MeasuredValue measured={measured(42)} /></span>
        <span data-testid="u"><MeasuredValue measured={unmeasured<number>("Platform döndürmedi")} /></span>
        <span data-testid="z"><MeasuredValue measured={fromNumber(0)} /></span>
        <span data-testid="x"><MeasuredValue measured={fromNumber(undefined, "yok")} /></span>
      </>,
    );

    expect(screen.getByTestId("m")).toHaveTextContent("42");
    expect(screen.getByTestId("u")).toHaveTextContent("—");
    expect(screen.getByTestId("z")).toHaveTextContent("0");
    expect(screen.getByTestId("x")).toHaveTextContent("—");
  });

  it("shortReason: tirenin yanında kısa neden görünür, tam sebep etikette kalır", () => {
    render(<MeasuredValue value={undefined} reason="Platform bu sayıyı vermedi." shortReason="platform vermedi" />);
    expect(screen.getByText("platform vermedi")).toBeInTheDocument();
    expect(screen.getByLabelText("Ölçülemedi: Platform bu sayıyı vermedi.")).toHaveTextContent("—");
  });
});
