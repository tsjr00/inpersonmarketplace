"use client";

import { use, useEffect, useState } from "react";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
};

export default function VendorSignup({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params);

  const [title, setTitle] = useState<string>("Vendor Signup");
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/vertical/${vertical}`);
      const cfg = await res.json();

      const vendorFields: Field[] = cfg.vendor_fields ?? [];
      setFields(vendorFields);

      const prettyTitle =
        cfg?.vertical_name_public && cfg?.nouns?.vendor_singular
          ? `${cfg.vertical_name_public} — ${cfg.nouns.vendor_singular} Signup`
          : `${vertical} — Vendor Signup`;

      setTitle(prettyTitle);

      const initial: Record<string, any> = {};
      for (const f of vendorFields) {
        if (f.type === "multi_select") initial[f.key] = [];
        else if (f.type === "boolean") initial[f.key] = false;
        else if (f.type === "date_range") initial[f.key] = { start: "", end: "" };
        else initial[f.key] = "";
      }
      setValues(initial);
    }
    load();
  }, [vertical]);

  function setVal(key: string, val: any) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  const payload = {
    kind: "vendor_signup",
    vertical,
    data: values
  };

  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("Save failed. Check the terminal for errors.");
    return;
  }

  setSubmitted(payload);
}

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>{title}</h1>
      <p style={{ marginTop: 10, opacity: 0.8 }}>
        Generated from <code>config/verticals/{vertical}.json</code>
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginTop: 20 }}>
        {fields.map((f) => {
          const value = values[f.key];

          if (f.type === "textarea") {
            return (
              <div key={f.key}>
                <label style={{ fontWeight: 600 }}>
                  {f.label} {f.required ? "(required)" : ""}
                </label>
                <textarea
                  value={value ?? ""}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  rows={4}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
            );
          }

          if (f.type === "select") {
            return (
              <div key={f.key}>
                <label style={{ fontWeight: 600 }}>
                  {f.label} {f.required ? "(required)" : ""}
                </label>
                <select
                  value={value ?? ""}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  style={{ width: "100%", padding: 10 }}
                >
                  <option value="">Select…</option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (f.type === "multi_select") {
            const current: string[] = Array.isArray(value) ? value : [];
            return (
              <div key={f.key}>
                <div style={{ fontWeight: 600 }}>
                  {f.label} {f.required ? "(required)" : ""}
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  {(f.options ?? []).map((opt) => {
                    const checked = current.includes(opt);
                    return (
                      <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...current, opt]
                              : current.filter((x) => x !== opt);
                            setVal(f.key, next);
                          }}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (f.type === "file") {
            return (
              <div key={f.key}>
                <label style={{ fontWeight: 600 }}>
                  {f.label} {f.required ? "(required)" : ""}
                </label>
                <input
                  type="file"
                  onChange={(e) => setVal(f.key, e.target.files?.[0]?.name ?? "")}
                  style={{ width: "100%", padding: 10 }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  (Phase 0: storing filename only)
                </div>
              </div>
            );
          }

          const inputType =
            f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text";

          return (
            <div key={f.key}>
              <label style={{ fontWeight: 600 }}>
                {f.label} {f.required ? "(required)" : ""}
              </label>
              <input
                type={inputType}
                value={value ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                style={{ width: "100%", padding: 10 }}
              />
            </div>
          );
        })}

        <button
          type="submit"
          style={{
            padding: "12px 14px",
            fontWeight: 800,
            cursor: "pointer",
            border: "1px solid #333",
            borderRadius: 8
          }}
        >
          Submit
        </button>
      </form>

      {submitted ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Submitted JSON (preview)</h2>
          <pre style={{ marginTop: 10, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
      ) : null}
    </main>
  );
}
