import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { decode, sign, verify } from "hono/jwt";
import { jwt } from "hono/jwt";
import type { JwtVariables } from "hono/jwt";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const app = new Hono();
const prisma = new PrismaClient();

type Variables = JwtVariables;

app.use("/*", cors());

app.use(
  "/protected/*",
  jwt({
    secret: "mySecretKey",
  })
);

// registration route
app.post("/signup", async (c) => {
  try {
    const body = await c.req.json();

    const bcryptHash = await bcrypt.hash(body.password, 10); // Using bcrypt with a cost factor of 10

    const user = await prisma.user.create({
      data: {
        email: body.email,
        hashedPassword: bcryptHash,
      },
    });

    return c.json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error occurred during user registration:", error);

    if (error instanceof Error && (error as any).code === "P2002") {
      return c.json({ message: "Email already exists" });
    } else {
      return c.json({ message: "Internal server error" });
    }
  }
});

// login route
app.post("/auth", async (c) => {
  try {
    const body = await c.req.json();
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true, hashedPassword: true },
    });

    if (!user) {
      return c.json({ message: "User not found" });
    }

    const match = await bcrypt.compare(body.password, user.hashedPassword);
    if (match) {
      const payload = {
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expires in 60 minutes
      };
      const secret = "mySecretKey";
      const token = await sign(payload, secret);
      return c.json({ message: "Login successful", token: token });
    } else {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }
  } catch (error) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }
});

// this is for latest post to be at top
app.get("/feeds", async (c) => {
  const feeds = await prisma.post.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
  return c.json(feeds);
});

// like count
app.post("/feeds/post/:id/like", async (c) => {
  const { id } = c.req.param();
  const post = await prisma.post.update({
    where: { id: Number(id) },
    data: {
      likes: {
        increment: 1,
      },
    },
  });
  return c.json(post);
});

// comment
app.get("/feeds/post/:id/comments", async (c) => {
  const { id } = c.req.param();
  const comments = await prisma.comment.findMany({
    where: {
      postId: Number(id),
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return c.json(comments);
});

// endpoint for profile
app.get("/profile/:username", async (c) => {
  const { username } = c.req.param();
  const profile = await prisma.user.findUnique({
    where: {
      username,
    },
    select: {
      username: true,
      bio: true,
      Post: true,
    },
  });
  return c.json(profile);
});

// endpoint for followers on profile
app.get("/profile/:username/followers", async (c) => {
  const { username } = c.req.param();
  const followers = await prisma.user.findMany({
    where: {
      following: {
        some: {
          follower: {
            username: username,
          },
        },
      },
    },
  });
  return c.json(followers);
});

// endpoint for following on profile
app.get("/profile/:username/following", async (c) => {
  const { username } = c.req.param();
  const following = await prisma.user.findMany({
    where: {
      followedBy: {
        some: {
          following: {
            username: username,
          },
        },
      },
    },
  });
  return c.json(following);
});

// endpoint for viewing information on profile
app.get("/profile/:username/editpf", async (c) => {
  const { username } = c.req.param();
  const user = await prisma.user.findUnique({
    where: {
      username,
    },
    select: {
      username: true,
      bio: true,
    },
  });
  return c.json(user);
});

// endpoint for editing information on profile
app.patch("/profile/:username/editpf", async (c) => {
  const { username } = c.req.param();
  const body = await c.req.json();
  const updatedProfile = await prisma.user.update({
    where: {
      username,
    },
    data: body,
  });
  return c.json(updatedProfile);
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
