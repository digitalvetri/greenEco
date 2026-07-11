import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-border-strong bg-card text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-10 px-3", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-20 p-3 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("mb-1 block text-xs font-medium text-muted", className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, "h-10 px-3 pr-8", className)} {...props} />;
}

/**
 * Labelled field with automatic label↔input association (WCAG 1.3.1 / 4.1.2).
 * Generates an id, wires the <label htmlFor> to it, and injects the same id into
 * the single form-control child — so `getByLabel` works and screen readers
 * announce the label. Pass a plain <Input/>/<Select/>/<Textarea/> as the child.
 */
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;
  return (
    <div>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {control}
      {error ? (
        <p id={describedBy} className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={describedBy} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
