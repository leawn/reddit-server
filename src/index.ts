import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { __prod__, COOKIE_NAME } from './constants';
import mikroConfig from "./mikro-orm.config";

import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql"
import { HelloResolver } from './resolvers/hello';
import { PostResolver } from './resolvers/post';
import { UserResolver } from './resolvers/user';

import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";
import { MyContext } from './types';{ origin: "http://localhost:3000"}
import cors from "cors";
import { User } from "./entities/User";

const main = async () => {
    const orm = await MikroORM.init(mikroConfig);
    await orm.em.nativeDelete(User, {});
    // const user = orm.em.create(User, {username: "leon", email: "leonrubner@gmail.com", password: "leon", id: 1});
    // await orm.em.persistAndFlush(user);
    await orm.getMigrator().up();

    const app = express();

    const RedisStore = connectRedis(session);
    const redis = new Redis();

    app.use(cors({
        origin: "http://localhost:3000",
        credentials: true,
    }));

    app.use(
        session({
            name: COOKIE_NAME,
            store: new RedisStore({
                client: redis,
                disableTouch: true,
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                httpOnly: true,
                sameSite: "lax", // csrf
                secure: __prod__ // cookie only works in https
            },
            secret: "fasaflaafdfa",
            resave: false,
            saveUninitialized: false,
        })
    );

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [HelloResolver, PostResolver, UserResolver],
            validate: false,
        }),
        context: ({ req, res }): MyContext => ({ em: orm.em, req, res, redis }),
    });

    apolloServer.applyMiddleware({ app, cors: false });

    app.listen(4000, () => {
        console.log("server started on localhost:4000")
    });
    // const post = orm.em.create(Post, {title: "my first post"});
    // await orm.em.persistAndFlush(post);

    // const posts = await orm.em.find(Post, {});
    // console.log(posts);
}

main().catch(err => {
    console.log(err);
});