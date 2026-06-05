import brandIconUrl from "../../assets/brand/qmdh-logo-icon.png";
import brandWordmarkUrl from "../../assets/brand/qmdh-logo-full.png";

type BrandIconProps = {
  className?: string;
  alt?: string;
};

type BrandWordmarkProps = {
  className?: string;
  alt?: string;
};

export function BrandIcon(props: BrandIconProps) {
  return <img className={props.className} src={brandIconUrl} alt={props.alt ?? "清美道合图标"} />;
}

export function BrandWordmark(props: BrandWordmarkProps) {
  return <img className={props.className} src={brandWordmarkUrl} alt={props.alt ?? "清美道合"} />;
}

