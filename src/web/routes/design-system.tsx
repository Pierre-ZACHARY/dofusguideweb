import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Info, Sparkles } from "lucide-react";
import { ThemeController } from "../components/ThemeController.js";

export const Route = createFileRoute("/design-system")({ component: DesignSystemPage });

function DesignSystemPage() {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="badge badge-warning">Développement</span>
          <h1 className="mt-2 text-3xl font-bold">Design system</h1>
          <p className="opacity-70">Composants utilisés, vérifiables dans cupcake et coffee.</p>
        </div>
        <ThemeController />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Actions et statuts</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary">Primaire</button>
              <button className="btn btn-secondary">Secondaire</button>
              <button className="btn btn-ghost">Discret</button>
              <span className="badge badge-success">Terminé</span>
              <span className="badge badge-warning">Actif</span>
              <span className="status status-success" />
            </div>
            <progress className="progress progress-primary" value="62" max="100" />
          </div>
        </div>
        <div className="aura aura-gold w-full text-warning">
          <div className="card h-full bg-base-100">
            <div className="card-body"><Sparkles /><h2 className="card-title">Objectif majeur</h2><p>Aura est réservée aux boss et donjons importants.</p></div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="alert alert-info"><Info /><span>Information de voyage.</span></div>
        <div className="alert alert-success"><Check /><span>Progression enregistrée.</span></div>
        <div className="alert alert-warning"><Bell /><span>Prérequis important.</span></div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {["Checklist de quête", "Carte de chapitre", "Résumé du guide"].map((title) => (
          <div className="card border border-base-300 bg-base-100" key={title}>
            <div className="card-body"><div className="skeleton h-24 w-full" /><h3 className="card-title">{title}</h3><div className="card-actions"><span className="loading loading-dots loading-sm" /></div></div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Progressions</h2>
        <ul className="steps w-full"><li className="step step-success">Lancer</li><li className="step step-primary">Donjon</li><li className="step">Rendre</li></ul>
        <ul className="timeline timeline-vertical mt-8">
          <li><div className="timeline-middle"><span className="status status-success" /></div><div className="timeline-end timeline-box">Étape 28 · START</div><hr /></li>
          <li><hr /><div className="timeline-middle"><span className="status status-warning" /></div><div className="timeline-end timeline-box">Étape 31 · ACTIVE</div></li>
        </ul>
      </section>
    </div>
  );
}
