import { Connection, IDatabaseDriver, EntityManager } from "@mikro-orm/core";
import { Request, Response } from "express";
import Redis from "ioredis";
import session from 'express-session';

export type MyContext = {
    em: EntityManager<IDatabaseDriver<Connection>>;
    req: Request & { session: session.Session & { userId: number }};
    res: Response;
    redis: Redis.Redis;
}