interface RangeNumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  help?: string;
  className?: string;
}

export function RangeNumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  help,
  className
}: Readonly<RangeNumberControlProps>) {
  const applyValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const clamped = Math.min(max, Math.max(min, nextValue));
    onChange(Number(clamped.toFixed(6)));
  };

  return (
    <label className={className}>
      <span>{label}</span>
      <div className="range-number-row">
        <input
          className="range-number-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => applyValue(Number(event.target.value))}
        />
        <input
          className="range-number-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => applyValue(Number(event.target.value))}
        />
      </div>
      {help ? <small className="settings-help">{help}</small> : null}
    </label>
  );
}
