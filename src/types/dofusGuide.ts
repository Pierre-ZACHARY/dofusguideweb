export interface GuideMetadata {
  id: number;
  name: string;
  autheur?: string;
  image?: string;
  gif?: string;
  updated_at?: string;
  is_public?: number;
  user_id?: string;
  [key: string]: unknown;
}

export interface GuidePosition {
  pos_x: number;
  pos_y: number;
  hauteur?: number;
  largeur?: number;
  [key: string]: unknown;
}

export interface GuideElement {
  id: number;
  tuto_id: number;
  name: string;
  etape: number;
  font?: unknown;
  pos?: GuidePosition;
  type: string;
  valeur: unknown;
  [key: string]: unknown;
}

export interface RawJsonDocument<T> {
  body: Buffer;
  data: T;
}
