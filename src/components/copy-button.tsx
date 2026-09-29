"use client";

import { useState } from "react";
import { IconLink } from "./icons";
import { btn } from "./ui";

export function CopyButton({ text, label = "Copiar enlace" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={btn("secundario", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          window.prompt("Copiá el enlace:", text);
        }
      }}
    >
      <IconLink size={18} /> {ok ? "¡Copiado!" : label}
    </button>
  );
}
