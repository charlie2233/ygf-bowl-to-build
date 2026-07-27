import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "quiet";
type ButtonSize = "small" | "medium";

type ButtonStyleProps = {
  children: ReactNode;
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStyleProps;

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonStyleProps;

function getButtonClassName({
  className,
  size = "medium",
  variant = "primary",
}: Pick<ButtonStyleProps, "className" | "size" | "variant">) {
  return [
    "button",
    `button--${variant}`,
    `button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  className,
  size,
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      className={getButtonClassName({ className, size, variant })}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  size,
  variant,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={getButtonClassName({ className, size, variant })}
      {...props}
    >
      {children}
    </a>
  );
}
