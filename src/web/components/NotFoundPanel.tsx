import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

export function NotFoundPanel({ message }: Readonly<{ message: string }>) {
  return (
    <section className="hero min-h-[55vh]">
      <div className="hero-content text-center">
        <div>
          <Compass className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden="true" />
          <h1 className="text-4xl font-bold">Chemin introuvable</h1>
          <p className="py-5">{message}</p>
          <Link className="btn btn-primary" to="/">Retour à l’accueil</Link>
        </div>
      </div>
    </section>
  );
}
