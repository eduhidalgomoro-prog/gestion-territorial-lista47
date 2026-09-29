"use client";

import {
  createContext, startTransition, useActionState, useContext, useEffect, useRef,
  type ComponentProps, type FormEvent, type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";
import { btn, cx } from "./ui";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const FormCtx = createContext<ActionResult>({ ok: true });
const PendingCtx = createContext(false);

/**
 * Envía el formulario a la acción SIN el reseteo automático de React 19,
 * para que si hay un error la persona no pierda lo que escribió.
 */
export function useSubmitWithoutReset(formAction: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
}

/**
 * Formulario conectado a una Server Action: muestra errores por campo y un mensaje general,
 * sin perder lo que la persona escribió.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true });
  const ref = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitWithoutReset(formAction);
  useEffect(() => {
    if (state.ok && state.message && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <FormCtx.Provider value={state}>
      <PendingCtx.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={className} id={id} noValidate>
        {state.message && (
          <div
            role={state.ok ? "status" : "alert"}
            className={cx("mb-4 rounded-xl px-4 py-3 text-[15px]", state.ok ? "bg-ok-50 text-ok" : "bg-peligro-50 text-peligro")}
          >
            {state.message}
          </div>
        )}
        {children}
      </form>
      </PendingCtx.Provider>
    </FormCtx.Provider>
  );
}

export function useFieldError(name: string) {
  return useContext(FormCtx).fields?.[name];
}

export function Field({ label, name, hint, children, optional }: { label: string; name: string; hint?: string; children: ReactNode; optional?: boolean }) {
  const error = useFieldError(name);
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1.5 block text-[15px] font-medium text-tinta">
        {label} {optional && <span className="font-normal text-gris/60">(opcional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-gris/70">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "block w-full rounded-xl border border-linea bg-white px-3.5 py-3 text-tinta placeholder:text-gris/40 focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro";

export function Input({ name, className, ...p }: ComponentProps<"input"> & { name: string }) {
  const error = useFieldError(name);
  return (
    <input
      id={name}
      name={name}
      aria-invalid={!!error}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cx(inputCls, "h-12", className)}
      {...p}
    />
  );
}

export function Textarea({ name, className, ...p }: ComponentProps<"textarea"> & { name: string }) {
  const error = useFieldError(name);
  return <textarea id={name} name={name} aria-invalid={!!error} rows={3} className={cx(inputCls, className)} {...p} />;
}

export function Select({
  name,
  options,
  placeholder,
  className,
  ...p
}: ComponentProps<"select"> & { name: string; options: readonly (readonly [string, string])[]; placeholder?: string }) {
  const error = useFieldError(name);
  return (
    <select id={name} name={name} aria-invalid={!!error} className={cx(inputCls, "h-12 pr-8", className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Opciones grandes tipo "chip" (más fáciles de tocar en el celular que un desplegable). */
export function ChoiceChips({
  name,
  options,
  defaultValue,
  required,
}: {
  name: string;
  options: readonly (readonly [string, string])[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map(([v, l]) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={name} value={v} defaultChecked={defaultValue === v} required={required} className="peer sr-only" />
          <span className="inline-flex min-h-11 items-center rounded-full border border-linea bg-white px-4 text-[15px] peer-checked:border-marca peer-checked:bg-verde-50 peer-checked:text-marca-600 peer-focus-visible:outline-3 peer-focus-visible:outline-petroleo">
            {l}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Checkbox({ name, label, defaultChecked, value = "on" }: { name: string; label: ReactNode; defaultChecked?: boolean; value?: string }) {
  const error = useFieldError(name);
  return (
    <div className="mb-3">
      <label className="flex cursor-pointer items-start gap-3 text-[15px]">
        <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-[#3f742c]" />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-sm font-medium text-peligro">{error}</p>}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant = "primario",
  size = "lg",
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Parameters<typeof btn>[0];
  size?: Parameters<typeof btn>[1];
  className?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const pending = useContext(PendingCtx) || status.pending;
  return (
    <button type="submit" disabled={pending} name={name} value={value} className={cx(btn(variant, size), className)}>
      {pending ? pendingText : children}
    </button>
  );
}
