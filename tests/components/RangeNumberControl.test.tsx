import { fireEvent, render, screen } from "@testing-library/react";
import { RangeNumberControl } from "../../src/components/RangeNumberControl";

describe("RangeNumberControl", () => {
  it("renders the label and optional help text", () => {
    render(
      <RangeNumberControl
        label="Depth gate"
        value={0.25}
        min={0}
        max={1}
        step={0.01}
        onChange={vi.fn()}
        help="Helpful copy"
      />
    );

    expect(screen.getByText("Depth gate")).toBeTruthy();
    expect(screen.getByText("Helpful copy")).toBeTruthy();
  });

  it("updates from the slider and numeric input with clamping", () => {
    const onChange = vi.fn();

    render(
      <RangeNumberControl
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole("slider");
    const input = screen.getByRole("spinbutton");

    fireEvent.change(slider, { target: { value: "0.55" } });
    expect(onChange).toHaveBeenCalledWith(0.55);

    fireEvent.change(input, { target: { value: "1.5" } });
    expect(onChange).toHaveBeenCalledWith(1);

    fireEvent.change(input, { target: { value: "-3" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("rounds values to a stable precision", () => {
    const onChange = vi.fn();

    render(
      <RangeNumberControl
        label="Width"
        value={1}
        min={0}
        max={2}
        step={0.1}
        onChange={onChange}
      />
    );

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1.123456789" } });
    expect(onChange).toHaveBeenCalledWith(1.123457);
  });
});
