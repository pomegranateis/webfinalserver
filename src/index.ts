import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { jwt } from "hono/jwt";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const app = new Hono();
const prisma = new PrismaClient();

app.use("/*", cors());

app.use(
  "/protected/*",
  jwt({
    secret: "mySecretKey",
  })
);

// Registration route
app.post("/signup", async (c) => {
  try {
    const body = await c.req.json();

    const bcryptHash = await bcrypt.hash(body.password, 10); // Using bcrypt with a cost factor of 10

    const user = await prisma.user.create({
      data: {
        email: body.email,
        hashedPassword: bcryptHash,
        username: body.username,
        fullName: body.fullName,
      },
    });

    return c.json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error occurred during user registration:", error);

    if (error instanceof Error && (error as any).code === "P2002") {
      return c.json({ message: "Email or username already exists" }, 409); // 409 Conflict
    } else {
      return c.json({ message: "Internal server error" }, 500); // 500 Internal Server Error
    }
  }
});

// Login route
app.post("/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true, hashedPassword: true },
    });

    if (!user) {
      return c.json({ message: "User not found" }, 404); // 404 Not Found
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
      throw new HTTPException(401, { message: "Invalid credentials" }); // 401 Unauthorized
    }
  } catch (error) {
    throw new HTTPException(401, { message: "Invalid credentials" }); // 401 Unauthorized
  }
});

// Latest post at top
app.get("/feeds", async (c) => {
  try {
    const feeds = await prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return c.json(feeds);
  } catch (error) {
    console.error("Error getting the posts", error);
  }
});

// Like count
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

// Comments
app.get("/feeds/post/:id/comments", async (c) => {
  const { id } = c.req.param();
  try {
    const comments = await prisma.comment.findMany({
      where: {
        postId: Number(id),
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return c.json(comments);
  } catch (error) {
    console.error("Error getting the comments", error);
  }
});

// Profile
app.get("/profile/:username", async (c) => {
  const { username } = c.req.param();
  try {
    const profile = await prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        username: true,
        bio: true,
        posts: true,
        followedBy: true,
        following: true,
      },
    });
    return c.json(profile);
    
  } catch (error) {
    console.error("Couldn't load the user profile", error);
  }

});

// Followers
app.get("/profile/:username/followers", async (c) => {
  const { username } = c.req.param();
  try {
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
  } catch (error) {
    console.error("Error occurred during user registration:", error);
  }
 
});

// Following
app.get("/profile/:username/following", async (c) => {
  const { username } = c.req.param();
  try {
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
  } catch (error) {
    console.error("Error getting the user followers", error);
  }
});

// View profile information
app.get("/profile/:username/editpf", async (c) => {
  const { username } = c.req.param();
  try {
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
  } catch (error) {
    console.error("Error loading the page. Try again", error);
  }
  
});

// Edit profile information
app.patch("/profile/:username/editpf", async (c) => {
  const { username } = c.req.param();
  const body = await c.req.json();
  const updatedProfile = await prisma.user.update({
    where: {
      username,
    },
    data: {
      bio: body.bio,
      username: body.username,
    }  
  });
  return c.json(updatedProfile);
});

// Search function
app.get('NavBar/search/:username', async (c) => {
  const { username } = c.req.param();

  try {
    console.log(`Searching for user with username: ${username}`);

    const user = await prisma.user.findUnique({
      where: {
        username: username,
      },
      include: {
        posts: true,
        comments: true,
        following: true,
        followedBy: true,
      },
    });

    if (!user) {
      console.log('User not found');
      return c.json({ message: 'User not found' }, 404); // 404 Not Found
    }

    console.log('User found', user);
    return c.json(user);
  } catch (error) {
    console.error('Error fetching user', error);
    return c.json({ error: 'An error occurred while fetching the user' }, 500); // 500 Internal Server Error
  }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
