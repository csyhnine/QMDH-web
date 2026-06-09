import StudioFeedCardFooter from "./StudioFeedCardFooter";
import StudioFeedCardHeader from "./StudioFeedCardHeader";
import StudioFeedCardResult from "./StudioFeedCardResult";
import StudioFeedReferenceBadge from "./StudioFeedReferenceBadge";
import { buildStudioFeedCardLayoutProps } from "./studioFeedCardProps";
import type { StudioFeedCardProps } from "./studioFeedCardTypes";
import { useStudioFeedCardState } from "./useStudioFeedCardState";

export default function StudioFeedCard(props: StudioFeedCardProps) {
  const cardState = useStudioFeedCardState(props);
  const {
    footerProps,
    headerProps,
    referenceBadgeProps,
    resultProps,
  } = buildStudioFeedCardLayoutProps(props, cardState);

  return (
    <article className={cardState.articleClassName} ref={props.anchorRef}>
      <StudioFeedReferenceBadge {...referenceBadgeProps} />
      <StudioFeedCardHeader {...headerProps} />
      <StudioFeedCardResult {...resultProps} />
      <StudioFeedCardFooter {...footerProps} />
    </article>
  );
}
