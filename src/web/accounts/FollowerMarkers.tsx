import { Link } from "@tanstack/react-router";
import type { FollowedProfile } from "../../accounts/types.js";
import { ProfileAvatarImage } from "./ProfileEditor.js";

export interface FollowerDestination {
  guideId: number;
  stepNumber: number;
}

export function FollowerAvatar({
  profile,
  className = "h-7 w-7",
  destination,
}: Readonly<{ profile: FollowedProfile; className?: string; destination?: FollowerDestination | null | undefined }>) {
  const avatar = (
    <span className="follower-tooltip tooltip relative z-[70] overflow-visible" data-tip={profile.name + " · " + profile.ownerDisplayName + (profile.isOnline ? " · En ligne" : "")}>
      <span className="avatar">
        <ProfileAvatarImage
          src={profile.avatarUrl}
          name={profile.name}
          className={className}
          ownerPictureUrl={profile.ownerPictureUrl}
          online={profile.isOnline}
        />
      </span>
    </span>
  );
  return destination === undefined || destination === null
    ? avatar
    : <Link
      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      to="/guides/$guideId/steps/$stepNumber"
      params={{ guideId: String(destination.guideId), stepNumber: String(destination.stepNumber) }}
      aria-label={`Voir l’étape actuelle de ${profile.name}`}
    >{avatar}</Link>;
}

export function FollowerAvatarStack({ profiles, destinationFor }: Readonly<{
  profiles: FollowedProfile[];
  destinationFor?: (profile: FollowedProfile) => FollowerDestination | null;
}>) {
  if (profiles.length === 0) return null;
  return (
    <span className="relative z-[60] flex -space-x-2 overflow-visible" aria-label={profiles.map((profile) => profile.name).join(", ")}>
      {profiles.slice(0, 4).map((profile) => <FollowerAvatar key={profile.id} profile={profile} destination={destinationFor?.(profile)} />)}
      {profiles.length > 4 && <span className="badge badge-secondary badge-sm z-10 self-center">+{profiles.length - 4}</span>}
    </span>
  );
}

export function FollowerProgressMarkers({
  profiles,
  percentFor,
  destinationFor,
}: Readonly<{
  profiles: FollowedProfile[];
  percentFor: (profile: FollowedProfile) => number;
  destinationFor?: (profile: FollowedProfile) => FollowerDestination | null;
}>) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-11 overflow-visible" aria-label={profiles.length > 0 ? "Position des profils suivis" : undefined}>
      {profiles.map((profile, index) => (
        <span
          className="pointer-events-auto absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: Math.max(2, Math.min(98, percentFor(profile))) + "%", zIndex: 40 + index }}
          key={profile.id}
        >
          <FollowerAvatar profile={profile} className="h-8 w-8" destination={destinationFor?.(profile)} />
          <span className="h-1.5 w-px bg-primary" aria-hidden="true" />
          <span className="h-2 w-2 rounded-full bg-primary ring-2 ring-base-100" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}
