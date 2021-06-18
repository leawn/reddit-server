import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { Field, ObjectType } from "type-graphql";

@ObjectType()
@Entity()
export class User {
  @Field()
  @PrimaryKey()
  id!: number;

  @Field(() => String)
  @Property({ type: "date" })
  createdAt: Date = new Date();

  @Field(() => String)
  @Property({type: "date", onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Field() // can choose to hide from graphql schema, not exposing everything what our database has
  @Property({ type: "text", unique: true })
  username!: string;

  // not public for graphql
  @Property({ type: "text" })
  password!: string;
}