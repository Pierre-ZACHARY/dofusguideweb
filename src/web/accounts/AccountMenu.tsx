import { Check, ChevronDown, LogOut, Pencil, Plus, Share2, UserRound, Users, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useProgress } from "../progress/progressStore.js";
import { ClientPortal } from "../components/ClientPortal.js";
import { useAccount } from "./AccountProvider.js";
import { GoogleOneTap } from "./GoogleOneTap.js";
import { ProfileAvatarImage, ProfileEditor } from "./ProfileEditor.js";

export function AccountMenu() {
  const { profile: localProgress } = useProgress();
  const state = useAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [oneTapPending, setOneTapPending] = useState(false);
  const [googleButtonHost, setGoogleButtonHost] = useState<HTMLDivElement | null>(null);
  const active = state.activeProfile;
  const ownerPictureUrl = state.account?.user.pictureUrl ?? null;
  const defaultAvatar = state.avatars.find((avatar) => avatar.breedId === 9 && avatar.gender === "MALE") ?? state.avatars[0];
  const activeAvatar = useMemo(() => active?.avatarUrl
    ?? state.avatars.find((avatar) => avatar.breedId === active?.breedId && avatar.gender === active.gender)?.imageUrl
    ?? null, [active, state.avatars]);

  async function copyShareLink() {
    if (!active) return;
    const token = active.shareToken ?? await state.shareProfile(active.id);
    await navigator.clipboard.writeText(window.location.origin + "/shared/" + token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const oneTap = state.account === null ? (
    <GoogleOneTap
      localProgress={localProgress}
      onCredential={async (credential, progress) => {
        setOneTapPending(true);
        try {
          await state.signIn(credential, progress);
          setLoginOpen(false);
        } finally {
          setOneTapPending(false);
        }
      }}
      buttonHost={googleButtonHost}
    />
  ) : null;

  return (
    <>
      {oneTap}
      {state.account === null ? (
        <button className="btn btn-ghost btn-sm gap-2" type="button" onClick={() => setLoginOpen(true)}>
          <UserRound size={17} aria-hidden="true" />
          <span className="hidden sm:inline">Connexion</span>
        </button>
      ) : active && (
        <div className="dropdown dropdown-end">
          <button className="btn btn-ghost btn-sm gap-2" type="button" tabIndex={0}>
            <ProfileAvatarImage src={activeAvatar} name={active.name} className="h-9 w-9" ownerPictureUrl={ownerPictureUrl} online={active.isOnline} />
            <span className="hidden max-w-28 truncate sm:inline">{active.name}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <ul className="menu dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl" tabIndex={0}>
            <li className="menu-title">Mes personnages</li>
            {state.account.profiles.map((profile) => (
              <li key={profile.id}>
                <button type="button" onClick={() => void state.selectProfile(profile.id)}>
                  <ProfileAvatarImage src={profile.avatarUrl} name={profile.name} className="h-8 w-8" ownerPictureUrl={ownerPictureUrl} online={profile.isOnline} />
                  <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                  {profile.id === active.id && <Check size={16} className="text-success" aria-label="Profil actif" />}
                </button>
              </li>
            ))}
            {state.account.following.length > 0 && (
              <>
                <li className="menu-title">Profils suivis</li>
                {state.account.following.map((profile) => (
                  <li key={profile.id}>
                    {profile.shareToken ? <Link to="/shared/$shareToken" params={{ shareToken: profile.shareToken }}>
                      <ProfileAvatarImage src={profile.avatarUrl} name={profile.name} className="h-8 w-8" ownerPictureUrl={profile.ownerPictureUrl} online={profile.isOnline} />
                      <span className="min-w-0"><span className="block truncate">{profile.name}</span><span className="block text-xs opacity-60">{profile.ownerDisplayName}</span></span>
                      <span className="badge badge-ghost badge-xs">Lecture seule</span>
                    </Link> : <span>{profile.name}</span>}
                  </li>
                ))}
              </>
            )}
            <li><button type="button" onClick={() => setManageOpen(true)}><Pencil size={16} />Gérer les profils</button></li>
            <li><button type="button" onClick={() => void state.signOut()}><LogOut size={16} />Déconnexion</button></li>
          </ul>
        </div>
      )}

      {loginOpen && state.account === null && <ClientPortal>
        <div className="modal modal-open z-[80]" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div className="modal-box max-w-sm">
            <button className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3" type="button" onClick={() => setLoginOpen(false)} aria-label="Fermer"><X size={18} /></button>
            <h2 id="login-title" className="text-xl font-bold">Sauvegarder ma progression</h2>
            <p className="my-4 text-sm opacity-70">Votre sauvegarde locale deviendra le premier profil de ce compte Google.</p>
            {state.error && <div className="alert alert-error mb-4 text-sm" role="alert"><span>{state.error}</span></div>}
            <div ref={setGoogleButtonHost} className="flex min-h-10 justify-center" />
          </div>
          <button className="modal-backdrop" type="button" onClick={() => setLoginOpen(false)}>Fermer</button>
        </div>
      </ClientPortal>}

      {manageOpen && state.account && active && <ClientPortal>
        <div className="modal modal-open z-[80]" role="dialog" aria-modal="true" aria-labelledby="profiles-title">
          <div className="modal-box max-w-3xl">
            <button className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3" type="button" onClick={() => setManageOpen(false)} aria-label="Fermer"><X size={18} /></button>
            <h2 id="profiles-title" className="text-2xl font-bold">Mes personnages</h2>
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-box bg-base-200 p-4">
              <ProfileAvatarImage src={activeAvatar} name={active.name} className="h-16 w-16" ownerPictureUrl={ownerPictureUrl} online={active.isOnline} />
              <div className="min-w-0 flex-1"><p className="font-bold">{active.name}</p><p className="text-sm opacity-65">Profil actif</p></div>
              <button className="btn btn-sm gap-2" type="button" onClick={() => setEditing((value) => !value)}><Pencil size={15} />Modifier</button>
              <button className="btn btn-sm btn-primary gap-2" type="button" onClick={() => void copyShareLink()}>{copied ? <Check size={15} /> : <Share2 size={15} />}{copied ? "Lien copié" : "Partager"}</button>
            </div>
            <div className="alert alert-warning mt-3 text-sm">
              <span>Le lien de partage est public : toute personne qui le possède peut consulter cette progression en lecture seule.</span>
            </div>
            {editing && <div className="mt-5"><ProfileEditor profile={active} avatars={state.avatars} submitLabel="Enregistrer" onSave={async (name, breedId, gender) => {
              await state.updateProfile(active.id, name, breedId, gender);
              setEditing(false);
            }} /></div>}
            <div className="divider">Personnages</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {state.account.profiles.map((profile) => (
                <button className={"card border text-left " + (profile.id === active.id ? "border-primary bg-primary/5" : "border-base-300 bg-base-100")} type="button" onClick={() => void state.selectProfile(profile.id)} key={profile.id}>
                  <div className="card-body flex-row items-center p-4">
                    <ProfileAvatarImage src={profile.avatarUrl} name={profile.name} className="h-12 w-12" ownerPictureUrl={ownerPictureUrl} online={profile.isOnline} />
                    <div className="min-w-0"><p className="truncate font-bold">{profile.name}</p><p className="text-xs opacity-60">{state.avatars.find((avatar) => avatar.breedId === profile.breedId)?.breedName ?? "Classe"} {profile.gender === "MALE" ? "M" : "F"}</p></div>
                  </div>
                </button>
              ))}
            </div>
            <button className="btn btn-outline mt-5 gap-2" type="button" onClick={() => setCreating((value) => !value)}><Plus size={16} />Nouveau personnage</button>
            {creating && defaultAvatar && <div className="mt-5"><ProfileEditor profile={{ name: "Nouveau personnage", breedId: defaultAvatar.breedId, gender: defaultAvatar.gender }} avatars={state.avatars} submitLabel="Créer le personnage" onSave={async (name, breedId, gender) => {
              await state.createProfile(name, breedId, gender);
              setCreating(false);
            }} /></div>}
            {state.account.following.length > 0 && (
              <>
                <div className="divider"><Users size={16} />Profils suivis</div>
                <ul className="list rounded-box border border-base-300 bg-base-100">
                  {state.account.following.map((profile) => (
                    <li className="list-row items-center" key={profile.id}>
                      <ProfileAvatarImage src={profile.avatarUrl} name={profile.name} className="h-10 w-10" ownerPictureUrl={profile.ownerPictureUrl} online={profile.isOnline} />
                      <div><p className="font-semibold">{profile.name}</p><p className="text-xs opacity-60">{profile.ownerDisplayName}</p></div>
                      <button className="btn btn-ghost btn-square btn-sm" type="button" onClick={() => void state.unfollowProfile(profile.id)} aria-label={"Ne plus suivre " + profile.name}><X size={16} /></button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button className="modal-backdrop" type="button" onClick={() => setManageOpen(false)}>Fermer</button>
        </div>
      </ClientPortal>}

      {(oneTapPending || state.error) && <ClientPortal>
        <div className="toast toast-end toast-top z-[100]" role="status">
          {oneTapPending && <div className="alert alert-info"><span className="loading loading-spinner loading-sm" /><span>Connexion Google en cours…</span></div>}
          {state.error && <div className="alert alert-error"><span>{state.error}</span></div>}
        </div>
      </ClientPortal>}
    </>
  );
}
