import type { Environment } from "@nimbus/shared";
import { ENVIRONMENTS } from "@nimbus/shared";

type EnvironmentSwitcherProps = {
  value: Environment;
  onChange: (env: Environment) => void;
};

const LABELS: Record<Environment, string> = {
  development: "Development",
  staging: "Staging",
  production: "Production",
};

export function EnvironmentSwitcher({ value, onChange }: EnvironmentSwitcherProps) {
  return (
    <div className="env-switcher" role="group" aria-label="Environment">
      {ENVIRONMENTS.map((env) => (
        <button
          key={env}
          type="button"
          className={`env-switcher__btn ${value === env ? "env-switcher__btn--active" : ""}`}
          onClick={() => onChange(env)}
          aria-pressed={value === env}
        >
          {LABELS[env]}
        </button>
      ))}
    </div>
  );
}
