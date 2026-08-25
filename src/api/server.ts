import Fastify, {
  type FastifyInstance,
  type FastifyReply,
} from "fastify";

import {
  QueryService,
  type SearchQuestOptions,
} from "../db/queryService.js";
import { normalizeName } from "../normalizer/index.js";

export interface BuildApiOptions {
  databasePath?: string;
  logger?: boolean;
}

class InvalidParameterError extends Error {}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: "Bad Request", message });
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: "Not Found", message });
}

function optionalString(
  value: unknown,
  name: string,
  options: { allowEmpty?: boolean } = {},
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new InvalidParameterError(name + " must be a string");
  }
  const trimmed = value.trim();
  if (trimmed === "" && options.allowEmpty !== true) {
    throw new InvalidParameterError(name + " must not be empty");
  }
  return trimmed;
}

function integerValue(
  value: unknown,
  name: string,
  options: { minimum?: number; maximum?: number } = {},
): number {
  if (typeof value !== "string" || !/^-?\d+$/u.test(value)) {
    throw new InvalidParameterError(name + " must be an integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidParameterError(name + " must be a safe integer");
  }
  if (options.minimum !== undefined && parsed < options.minimum) {
    throw new InvalidParameterError(name + " must be at least " + options.minimum);
  }
  if (options.maximum !== undefined && parsed > options.maximum) {
    throw new InvalidParameterError(name + " must be at most " + options.maximum);
  }
  return parsed;
}

function optionalInteger(
  value: unknown,
  name: string,
  options: { minimum?: number; maximum?: number } = {},
): number | undefined {
  return value === undefined ? undefined : integerValue(value, name, options);
}

function parseQuestSearch(query: Record<string, unknown>): SearchQuestOptions {
  const q = optionalString(query.q, "q");
  if (q !== undefined && normalizeName(q) === "") {
    throw new InvalidParameterError("q must contain letters or numbers");
  }
  const type = optionalString(query.type, "type");
  const guideId = optionalInteger(query.guideId, "guideId");
  const stepMin = optionalInteger(query.stepMin, "stepMin", { minimum: 1 });
  const stepMax = optionalInteger(query.stepMax, "stepMax", { minimum: 1 });
  const limit = optionalInteger(query.limit, "limit", { minimum: 1, maximum: 200 }) ?? 50;
  const offset = optionalInteger(query.offset, "offset", { minimum: 0 }) ?? 0;
  if (stepMin !== undefined && stepMax !== undefined && stepMin > stepMax) {
    throw new InvalidParameterError("stepMin must not be greater than stepMax");
  }
  return {
    ...(q === undefined ? {} : { q }),
    ...(type === undefined ? {} : { type }),
    ...(guideId === undefined ? {} : { guideId }),
    ...(stepMin === undefined ? {} : { stepMin }),
    ...(stepMax === undefined ? {} : { stepMax }),
    limit,
    offset,
  };
}

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const service = new QueryService(options.databasePath);
  const app = Fastify({ logger: options.logger ?? false });

  app.addHook("onClose", () => {
    service.close();
  });

  app.get("/guides", () => service.listGuides());

  app.get<{
    Params: { id: string; step: string };
  }>("/guides/:id/steps/:step", (request, reply) => {
    let guideId: number;
    let stepNumber: number;
    try {
      guideId = integerValue(request.params.id, "id");
      stepNumber = integerValue(request.params.step, "step", { minimum: 1 });
    } catch (error) {
      if (error instanceof InvalidParameterError) {
        return badRequest(reply, error.message);
      }
      throw error;
    }
    const step = service.getGuideStep(guideId, stepNumber);
    return step === undefined
      ? notFound(reply, "Guide step not found")
      : step;
  });

  app.get<{
    Querystring: Record<string, unknown>;
  }>("/quests", (request, reply) => {
    try {
      return service.searchQuests(parseQuestSearch(request.query));
    } catch (error) {
      if (error instanceof InvalidParameterError) {
        return badRequest(reply, error.message);
      }
      throw error;
    }
  });

  app.get<{
    Params: { questKey: string };
  }>("/quests/:questKey", (request, reply) => {
    const questKey = request.params.questKey.trim();
    if (questKey === "") {
      return badRequest(reply, "questKey must not be empty");
    }
    const quest = service.getQuest(questKey);
    return quest === undefined ? notFound(reply, "Quest not found") : quest;
  });

  app.get<{
    Params: { questKey: string };
  }>("/quests/:questKey/steps", (request, reply) => {
    const questKey = request.params.questKey.trim();
    if (questKey === "") {
      return badRequest(reply, "questKey must not be empty");
    }
    const steps = service.getQuestSteps(questKey);
    return steps === undefined ? notFound(reply, "Quest not found") : steps;
  });

  return app;
}
