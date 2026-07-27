import {
  ArrowRight,
  ScanLine,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

type IconProps = Omit<LucideProps, "aria-hidden" | "aria-label"> & {
  title?: string;
};

type AccessibleIconProps = IconProps & {
  icon: LucideIcon;
};

function AccessibleIcon({
  icon: Icon,
  title,
  ...props
}: AccessibleIconProps) {
  return (
    <Icon
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      role={title ? "img" : undefined}
      {...props}
    />
  );
}

export function ArrowRightIcon(props: IconProps) {
  return <AccessibleIcon icon={ArrowRight} {...props} />;
}

export function ScanIcon(props: IconProps) {
  return <AccessibleIcon icon={ScanLine} {...props} />;
}
