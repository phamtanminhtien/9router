"use client";

import PropTypes from "prop-types";
import { Button, Input } from "@/shared/components";

/**
 * Repeater editor for custom HTTP headers attached to a compatible provider node.
 * Values support `$VAR` substitution at request time (currently `$API_KEY`).
 */
export default function CustomHeadersEditor({ value, onChange, label = "Custom Headers" }) {
  const rows = Array.isArray(value) ? value : [];

  const update = (next) => onChange(next);
  const setRow = (idx, patch) => update(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => update([...rows, { key: "", value: "" }]);
  const removeRow = (idx) => update(rows.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-main">{label}</label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon="add"
          onClick={addRow}
        >
          Add header
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">
          Optional. Use <code>$API_KEY</code> in values to reference the connection&apos;s API key, e.g. <code>Bearer $API_KEY</code>.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <Input
                placeholder="Header name"
                value={row.key || ""}
                onChange={(e) => setRow(idx, { key: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="Bearer $API_KEY"
                value={row.value || ""}
                onChange={(e) => setRow(idx, { value: e.target.value })}
                className="flex-[2]"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                aria-label="Remove header"
                className="mt-1 p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          ))}
          <p className="text-xs text-text-muted">
            Use <code>$API_KEY</code> to inject the connection&apos;s API key. Custom values override defaults like <code>Authorization</code>.
          </p>
        </div>
      )}
    </div>
  );
}

CustomHeadersEditor.propTypes = {
  value: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string,
      value: PropTypes.string,
    })
  ),
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
};
