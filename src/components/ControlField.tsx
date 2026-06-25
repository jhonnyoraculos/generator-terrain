import type { ReactNode } from 'react';

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
  integer?: boolean;
}

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="control-section">
      <h2>{title}</h2>
      <div className="control-section__body">{children}</div>
    </section>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  integer,
}: SliderFieldProps) {
  const displayValue = integer ? Math.round(value) : Number(value.toFixed(3));

  return (
    <label className="field">
      <span className="field__label">
        {label}
        <output>
          {displayValue}
          {suffix ?? ''}
        </output>
      </span>
      <span className="field__inputs">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          className="number-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={integer ? Math.round(value) : value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
    </label>
  );
}

export function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
