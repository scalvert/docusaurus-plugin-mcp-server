import React from 'react';
import registry from '@site/../videos/registry.json';
import styles from './styles.module.css';

/**
 * Look up an accepted, hosted video in videos/registry.json. The registry is
 * written by oncue in videos/ (`npx oncue registry --accept <id>`, then
 * `npx oncue deploy`), and holds each video's current media file names and the
 * media store's base URL.
 */
export function hostedVideo(id, data = registry) {
  const video = data.videos.find((v) => v.id === id);
  if (!video || !video.hosted || !data.mediaBaseUrl) return null;
  const base = data.mediaBaseUrl.replace(/\/+$/, '');
  return {
    src: `${base}/${video.media.file}`,
    poster: `${base}/${video.media.poster}`,
    seconds: Math.round(video.durationSeconds),
  };
}

/**
 * A short explainer video with a collapsed transcript (the children). `id` is
 * the video's id in videos/registry.json. A video that isn't accepted and
 * deployed yet renders nothing. Wrap it in <ForHumans> on a page, so agents
 * reading the page over MCP get the page's text, not a video they can't watch.
 */
export default function DocVideo({ id, title, children }) {
  const video = hostedVideo(id);
  if (!video) return null;
  return (
    <figure className={styles.figure}>
      <video
        className={styles.video}
        controls
        playsInline
        preload="metadata"
        poster={video.poster}
        width={1920}
        height={1080}
        aria-label={`${title} (${video.seconds}-second video)`}
      >
        <source src={video.src} type="video/mp4" />
        <a href={video.src}>Download the video</a>.
      </video>
      {children && (
        <details className={styles.transcript}>
          <summary>Transcript</summary>
          {children}
        </details>
      )}
    </figure>
  );
}
