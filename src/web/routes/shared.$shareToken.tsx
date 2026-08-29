import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { CheckCircle2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAccount } from "../accounts/AccountProvider.js";
import { DofusProfileStats } from "../accounts/DofusProfileIdentity.js";
import { useProfileEvents } from "../accounts/profileEventsClient.js";
import { ProfileAvatarImage } from "../accounts/ProfileEditor.js";
import { NotFoundPanel } from "../components/NotFoundPanel.js";
import { getSharedPlayerEmbed, getSharedPlayerProfile } from "../accounts/serverFunctions.js";
import {
  sharedProfileDescription,
  sharedProfileImageUrl,
  sharedProfileTitle,
  SITE_ORIGIN,
} from "../social/sharedProfileEmbed.js";

export const Route = createFileRoute("/shared/$shareToken")({
  loader: async ({ params }) => {
    if (params.shareToken.length < 20 || params.shareToken.length > 100) throw notFound();
    const embed = await getSharedPlayerEmbed({ data: { shareToken: params.shareToken } });
    if (embed === null) throw notFound();
    return embed;
  },
  head: ({ loaderData, params }) => {
    if (loaderData === undefined) return {};
    const title = sharedProfileTitle(loaderData);
    const description = sharedProfileDescription(loaderData);
    const image = sharedProfileImageUrl(loaderData);
    const url = `${SITE_ORIGIN}/shared/${encodeURIComponent(params.shareToken)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:locale", content: "fr_FR" },
        { property: "og:site_name", content: "DofusGuide Web" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `Progression DOFUS de ${loaderData.profile.name}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SharedProfilePage,
  notFoundComponent: () => <NotFoundPanel message="Ce lien de partage n’est plus disponible." />,
});

function SharedProfilePage() {
  const loadedEmbed = Route.useLoaderData();
  const loadedShared = loadedEmbed.profile;
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
          <div>
            <p className="text-sm opacity-65">Personnage de {shared.ownerDisplayName}</p>
            <h1 className="text-3xl font-bold">{shared.name}</h1>
          </div>
          <div className="stats stats-vertical bg-base-200 shadow-sm sm:stats-horizontal">
            <div className="stat px-6 py-4"><div className="stat-title">Étapes terminées</div><div className="stat-value text-primary">{completedSteps}</div></div>
            <DofusProfileStats profile={shared} />
          </div>
          <div className="alert alert-warning text-left text-sm">
            <span>Ce lien donne un accès public en lecture seule à la progression de ce personnage. Il ne permet jamais de la modifier.</span>
          </div>
          <div className="card-actions mt-3 justify-center">
            {account === null
              ? <div className="alert alert-info text-left">Connectez-vous avec Google depuis le header pour suivre ce personnage.</div>
              : followed
                ? <button className="btn btn-success gap-2" disabled><CheckCircle2 size={17} />Profil suivi</button>
                : <button className="btn btn-primary gap-2" type="button" onClick={() => void followShare(params.shareToken).then(() => setFollowed(true)).catch(() => undefined)}><UserPlus size={17} />Suivre ce personnage</button>}
            <Link className="btn btn-ghost" to="/">Retour au guide</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
