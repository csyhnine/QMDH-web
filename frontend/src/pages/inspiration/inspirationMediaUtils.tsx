import type { InspirationPost } from "../../api";

export function isVideoInspirationPost(post: InspirationPost): boolean {
  return post.media_type === "video";
}

export function hasInspirationComparePreview(post: InspirationPost): boolean {
  return post.source_type === "user" && Boolean(post.source_image_path) && Boolean(post.image_path);
}

type InspirationMediaPreviewProps = {
  post: InspirationPost;
  imgClassName?: string;
  videoClassName?: string;
  alt?: string;
};

export function InspirationMainMediaPreview({
  post,
  imgClassName,
  videoClassName,
  alt,
}: InspirationMediaPreviewProps) {
  const label = alt ?? post.title;
  if (isVideoInspirationPost(post)) {
    return (
      <video
        src={post.image_path}
        className={videoClassName ?? imgClassName}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={post.image_path} alt={label} className={imgClassName} loading="lazy" />;
}

export function inspirationFinalMediaCaption(post: InspirationPost): string {
  return isVideoInspirationPost(post) ? "最终视频" : "最终图";
}
