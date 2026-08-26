import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { CheckCircle2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAccount } from "../accounts/AccountProvider.js";
import { useProfileEvents } from "../accounts/profileEventsClient.js";
import { ProfileAvatarImage } from "../accounts/ProfileEditor.js";
import { NotFoundPanel } from "../components/NotFoundPanel.js";
import { getSharedPlayerProfile } from "../accounts/serverFunctions.js";

export const Route = createFileRoute("/shared/$shareToken")({
  loader: async ({ params }) => {
    if (params.shareToken.length < 20 || params.shareToken.length > 100) throw notFound();
    const profile = await getSharedPlayerProfile({ data: { shareToken: params.shareToken } });
    if (profile === null) throw notFound();
    return profile;
  },
  component: SharedProfilePage,
  notFoundComponent: () => <NotFoundPanel message="Ce lien de partage n’est plus disponible." />,
});

function SharedProfilePage() {
  const loadedShared = Route.useLoaderData();
  const params = Route.useParams();
  const { account, followShare } = useAccount();
  const [shared, setShared] = useState(loadedShared);
  const [followed, setFollowed] = useState(account?.following.some((profile) => profile.id === shared.id) ?? false);
  useProfileEvents([shared.id], () => {
    void getSharedPlayerProfile({ data: { shareToken: params.shareToken } }).then((next) => {
      if (next !== null) setShared(next);
    });
  });
  const completedSteps = Object.values(shared.progress.steps).filter((status) => status === "COMPLETED").length;
  return (
    <div className="mx-auto max-w-xl">
      <section className="card border border-base-300 bg-base-100 shadow-md">
        <div className="card-body items-center text-center">
          <ProfileAvatarImage src={shared.avatarUrl} name={shared.name} className="h-28 w-28" ownerPictureUrl={shared.ownerPictureUrl} online={shared.isOnline} />
          <div><p className="text-sm opacity-65">Personnage de {shared.ownerDisplayName}</p><h1 className="text-3xl font-bold">{shared.name}</h1></div>
          <div className="stats bg-base-200 shadow-sm">
            <div className="stat px-6 py-4"><div className="stat-title">Étapes terminées</div><div className="stat-value text-primary">{completedSteps}</div></div>
          </div>
          <div className="alert alert-warning text-left text-sm">
            <span>Ce lien donne un accès public en lecture seule à la progression de ce personnage. Il ne permet jamais de la modifier.</span>
          </div>
          <div className="card-actions mt-3 justify-center">
            {account === null
              ? <div className="alert alert-info text-left">Connectez-vous avec Google depuis le header pour suivre ce personnage.</div>
              : followed
                ? <button className="btn btn-success gap-2" disabled><CheckCircle2 size={17} />Profil suivi</button>
                : <button className="btn btn-primary gap-2" type="button" onClick={() => void followShare(params.shareToken).then(() => setFollowed(true))}><UserPlus size={17} />Suivre ce personnage</button>}
            <Link className="btn btn-ghost" to="/">Retour au guide</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
