import { UserRound } from "lucide-react";
import { useState } from "react";
import type { PlayerProfile, ProfileAvatar, ProfileGender } from "../../accounts/types.js";
import { DOFUS_SERVERS } from "../../dofus/servers.js";
import { ExternalImage } from "../components/ExternalImage.js";

export function ProfileAvatarImage({
  src,
  name,
  className = "h-10 w-10",
  ownerPictureUrl = null,
  online = false,
}: Readonly<{
  src: string | null;
  name: string;
  className?: string;
  ownerPictureUrl?: string | null;
  online?: boolean;
}>) {
  return (
    <span className={"relative inline-grid shrink-0 place-items-center " + className}>
      <span className={"grid h-full w-full place-items-center overflow-hidden rounded-box bg-base-200 " + (online ? "ring-2 ring-success ring-offset-2 ring-offset-base-100" : "")}>
        {src
          ? <ExternalImage src={src} alt={"Personnage " + name} className="h-full w-full origin-top scale-[2.15] object-contain object-top" />
          : <UserRound size={18} aria-hidden="true" />}
      </span>
      {ownerPictureUrl && (
        <ExternalImage
          src={ownerPictureUrl}
          alt={"Compte Google de " + name}
          className="absolute -bottom-1.5 -right-1.5 h-[52%] w-[52%] rounded-full border-2 border-base-100 bg-base-100 object-cover shadow-md"
          hideOnError
        />
      )}
    </span>
  );
}

export function ProfileEditor({
  profile,
  avatars,
  onSave,
  submitLabel,
}: Readonly<{
  profile: Pick<PlayerProfile, "name" | "breedId" | "gender" | "serverId">;
  avatars: ProfileAvatar[];
  onSave: (name: string, breedId: number, gender: ProfileGender, serverId: number) => Promise<void>;
  submitLabel: string;
}>) {
  const [name, setName] = useState(profile.name);
  const [selection, setSelection] = useState(profile.breedId + ":" + profile.gender);
  const [serverId, setServerId] = useState(profile.serverId === null ? "" : String(profile.serverId));
  const [saving, setSaving] = useState(false);
  const selected = avatars.find((avatar) => avatar.key === selection) ?? avatars[0];
  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const parsedServerId = Number(serverId);
      if (!selected || name.trim() === "" || !Number.isInteger(parsedServerId)) return;
      setSaving(true);
      void onSave(name.trim(), selected.breedId, selected.gender, parsedServerId)
        .catch(() => undefined)
        .finally(() => setSaving(false));
    }}>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Nom du personnage</legend>
        <input className="input w-full" value={name} maxLength={40} onChange={(event) => setName(event.currentTarget.value)} required />
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Serveur DOFUS</legend>
        <select className="select w-full" value={serverId} onChange={(event) => setServerId(event.currentTarget.value)} required>
          <option value="">Sélectionner un serveur…</option>
          {[...new Set(DOFUS_SERVERS.map((server) => server.category))].map((category) => (
            <optgroup label={category} key={category}>
              {DOFUS_SERVERS.filter((server) => server.category === category).map((server) => (
                <option value={server.id} key={server.id}>{server.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="label text-xs opacity-65">Le nom et le serveur seront vérifiés dans le ladder officiel avant l’enregistrement.</p>
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Apparence</legend>
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-box border border-base-300 bg-base-200 p-2 sm:grid-cols-5">
          {avatars.map((avatar) => {
            const active = selection === avatar.key;
            return (
              <button
                type="button"
                className={"btn h-auto min-h-24 flex-col gap-1 p-2 " + (active ? "btn-primary" : "btn-ghost bg-base-100")}
                onClick={() => setSelection(avatar.key)}
                aria-pressed={active}
                key={avatar.key}
              >
                <ProfileAvatarImage src={avatar.imageUrl} name={avatar.breedName} className="h-14 w-14" />
                <span className="max-w-full truncate text-xs">{avatar.breedName} {avatar.gender === "MALE" ? "M" : "F"}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <button className="btn btn-primary w-full" type="submit" disabled={saving || !selected || serverId === ""}>
        {saving && <span className="loading loading-spinner loading-xs" />}
        {submitLabel}
      </button>
    </form>
  );
}
