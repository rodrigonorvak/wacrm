"use client";

import { useState } from "react";

export function UserAvatar({
  name,
  src,
  size = 64,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] || "?").toUpperCase();

  if (!src || failed) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#fde7f4] text-lg font-semibold text-[#e10c8c]"
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
