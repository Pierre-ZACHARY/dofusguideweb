export interface DofusServer {
  id: number;
  name: string;
  category: "Épique" | "Monocompte" | "Classique" | "Pionnier monocompte" | "Pionnier";
}

// Snapshot of the official DOFUS achievement-ladder filters. Keeping this
// list in the application makes profile editing deterministic and avoids an
// external request during the static build.
export const DOFUS_SERVERS = [
  { id: 50, name: "Ombre", category: "Épique" },
  { id: 295, name: "Draconiros", category: "Monocompte" },
  { id: 290, name: "Tal Kasha", category: "Classique" },
  { id: 291, name: "Imagiro", category: "Classique" },
  { id: 292, name: "Orukam", category: "Classique" },
  { id: 293, name: "Tylezia", category: "Classique" },
  { id: 294, name: "Hell Mina", category: "Classique" },
  { id: 353, name: "Dakal", category: "Pionnier monocompte" },
  { id: 354, name: "Mikhal", category: "Pionnier monocompte" },
  { id: 355, name: "Kourial", category: "Pionnier monocompte" },
  { id: 350, name: "Rafal", category: "Pionnier" },
  { id: 351, name: "Brial", category: "Pionnier" },
  { id: 352, name: "Salar", category: "Pionnier" },
] as const satisfies readonly DofusServer[];

export function getDofusServer(serverId: number): DofusServer | null {
  return DOFUS_SERVERS.find((server) => server.id === serverId) ?? null;
}
