import { User } from "../entities/User";
import { MyContext } from "../types";
import { Field, Resolver, Arg, Ctx, Mutation, ObjectType, Query } from 'type-graphql';
import argon2 from "argon2";
import { EntityManager } from "@mikro-orm/postgresql";
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from '../constants';
import { UsernamePasswordInput } from "../util/UsernamePasswordInput";
import { validateRegister } from '../util/validateRegister';
import { sendEmail } from "src/util/sendEmail";
import {v4} from "uuid";

@ObjectType()
class FieldError {
    @Field()
    field: string;

    @Field()
    message: string;
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], { nullable: true })
    errors?: FieldError[]

    @Field(() => User, { nullable: true })
    user?: User
}

@Resolver()
export class UserResolver {
    @Mutation(() => UserResponse)
    async changePassword(
        @Arg("token") token: string,
        @Arg("newPassword") newPassword: string,
        @Ctx() { redis, em, req }: MyContext
    ): Promise<UserResponse> {
        if (newPassword.length <= 2) {
            return {
                errors: [
                    {
                        field: "newPassword",
                        message: "length must be greater than 2"
                    }
                ]
            }
        }

        const key = `${FORGET_PASSWORD_PREFIX}${token}`;
        const userId = await redis.get(key);
        if (!userId) {
            return {
                errors: [
                    {
                        field: "token",
                        message: "token expired"
                    }
                ]
            }
        }

        const user = await em.findOne(User, {id: parseInt(userId)});

        if (!user) {
            return {
                errors: [
                    {
                        field: "token",
                        message: "user no longer exists"
                    }
                ]
            }
        }

        user.password = await argon2.hash(newPassword);
        await em.persistAndFlush(user);

        await redis.del(key);

        // log in user after change password
        req.session.userId= user.id;

        return { user };
    }


    @Mutation(() => Boolean)
    async forgotPassword(
        @Arg("email") email: string,
        @Ctx() { em, redis } : MyContext
    ) {
        const user = await em.findOne(User, { email })
        if (!user) {
            // the email is not in the database
            return true;
        }

        const token = v4();

        await redis.set(`${FORGET_PASSWORD_PREFIX}${token}`, user.id, "ex", 1000 * 60 * 60 * 24 * 1);

        const text = `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
        await sendEmail(email, text);

        return true;
    }

    @Query(() => User, {nullable: true})
    async me(
        @Ctx() { req, em }: MyContext
    ) {
        // you are not logged in
        if (!req.session.userId) {
            return null
        }

        const user = await em.findOne(User, { id: req.session.userId});
        return user;
    }
    @Mutation(() => UserResponse)
    async register(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() { req, em }: MyContext
    ): Promise<UserResponse> {

        const errors = validateRegister(options);

        if (errors) {
            return { errors };
        }

        const hashedPassword = await argon2.hash(options.password);
        let user;
        try {
            const result = await (em as EntityManager)
                .createQueryBuilder(User)
                .getKnexQuery()
                .insert({
                    username: options.username,
                    password: hashedPassword,
                    email: options.email,
                    created_at: new Date(),
                    updated_at: new Date(),
                })
                .returning("*");
            user = result[0];
        } catch(err) {
            if (err.code === "23505") {
                // duplicate username error
                return {
                    errors: [
                        {
                            field: "username",
                            message: "username was already taken",
                        },
                    ],
                };
            }
            else {
                return {
                    errors: [
                        {
                            field: "error",
                            message: `add a new error code ${err.code}`
                        }
                    ]
                }
            }
        }

        // after register keep logged in
        req.session.userId = user.id

        return { user };
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg("usernameOrEmail") usernameOrEmail: string,
        @Arg("password") password: string,
        @Ctx() { em, req }: MyContext
    ): Promise<UserResponse> {
        const user = await em.findOne(
            User,
            usernameOrEmail.includes("@") ? { email: usernameOrEmail } : { username: usernameOrEmail }
        )
        if (!user) {
            return {
                errors: [
                    {
                        field: "usernameOrEmail",
                        message: "that account doesn't exist",
                    },
                ],
            }
        }
        const valid = await argon2.verify(user.password, password);
        if (!valid) {
            return {
                errors: [
                    {
                        field: "password",
                        message: "incorrect password",
                    },
                ],
            };
        }

        req.session.userId = user.id;

        return {
            user
        };
    }

    @Mutation(() => Boolean)
    logout(
        @Ctx() { req, res }: MyContext
    ) {
        return new Promise(resolve => req.session.destroy(err => {
            res.clearCookie(COOKIE_NAME); // only clear the cookie if resolved to true?
            if (err) {
                console.log(err);
                resolve(false);
                return;
            }
            resolve(true);
        }));
    }
}