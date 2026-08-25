export type Sleep = (milliseconds: number) => Promise<void>;

export const sleep: Sleep = async (milliseconds) => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};
