import { Link, useParams } from "react-router-dom";

export function FlagEditor() {
  const { key } = useParams<{ key: string }>();
  const isNew = key === "new";

  return (
    <div className="flag-editor">
      <header className="page-header">
        <div>
          <h1>{isNew ? "New flag" : `Edit ${key}`}</h1>
          <p className="page-header__subtitle">
            Flag editor coming in a follow-up change
          </p>
        </div>
        <Link to="/" className="btn btn--secondary">
          Back to list
        </Link>
      </header>

      <section className="editor-stub">
        <p>
          Configure rules, rollout percentage, variants, and prerequisites here.
        </p>
        {!isNew && (
          <dl className="meta-list">
            <dt>Flag key</dt>
            <dd><code>{key}</code></dd>
          </dl>
        )}
      </section>
    </div>
  );
}
