import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const app = new Hono();
const prisma = new PrismaClient();
const secret = "mySecretKey"; // JWT secret key

// Middleware to enable CORS
app.use("/*", cors());

// Middleware to authenticate JWT token
const authenticateToken = async (c: any, next: any) => {
  const authHeader = c.req.headers.get("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return c.json({ message: "Unauthorized" }, 401);

  try {
    const user = await verify(token, secret);
    c.req.user = user;
    await next();
  } catch (error) {
    return c.json({ message: "Forbidden" }, 403);
  }
};

// Registration route
app.post("/signup", async (c) => {
  try {
    const body = await c.req.json();

    const bcryptHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        hashedPassword: bcryptHash,
        username: body.username,
        fullName: body.fullName,
      },
    });

    return c.json({ message: "User registered successfully" });
  } catch (error: any) {
    console.error("Error occurred during user registration:", error);

    if (error.code === "P2002") {
      return c.json({ message: "Email or username already exists" }, 409);
    } else {
      return c.json({ message: "Internal server error" }, 500);
    }
  }
});

// Login endpoint
app.post("/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, hashedPassword: true },
    });

    if (!user) {
      return c.json({ message: "User not found" }, 404);
    }

    const match = await bcrypt.compare(password, user.hashedPassword);
    if (match) {
      const payload = {
        sub: user.id,
        username: user.username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      };
      const token = sign(payload, secret);
      return c.json({
        message: "Login successful",
        token,
        username: user.username,
      });
    } else {
      return c.json({ message: "Invalid credentials" }, 401);
    }
  } catch (error) {
    console.error("Error during login:", error);
    return c.json({ message: "Login failed" }, 401);
  }
});

// Feed endpoint
app.get("/api/feed", authenticateToken, async (c) => {
  try {
    const feedData = await prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: true,
      },
    });
    return c.json(feedData);
  } catch (error) {
    console.error("Error fetching feed:", error);
    return c.json({ message: "Failed to fetch feed" }, 500);
  }
});

// Like count endpoint
app.post("/post/:id/like", async (c) => {
  const { id } = c.req.param();

  try {
    const postId = parseInt(id); // Convert id to a number if necessary

    const post = await prisma.post.update({
      where: { id: postId },
      data: {
        likes: {
          increment: 1,
        },
      },
    });

    return c.json(post); // Return the updated post in JSON format
  } catch (error) {
    console.error("Error liking post:", error);
    return c.json({ error: "Could not like the post" }, 500);
  }
});

// Comments endpoint
app.get("/feeds/post/:id/comments", authenticateToken, async (c) => {
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
    console.error("Error fetching comments:", error);
    return c.json({ message: "Failed to fetch comments" }, 500);
  }
});

// Profile endpoint
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
      },
    });
    return c.json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return c.json({ message: "Failed to fetch profile" }, 500);
  }
});

// Followers endpoint
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
    console.error("Error fetching followers:", error);
    return c.json({ message: "Failed to fetch followers" }, 500);
  }
});

// Following endpoint
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
    console.error("Error fetching following:", error);
    return c.json({ message: "Failed to fetch following" }, 500);
  }
});

// Edit profile information endpoint
app.patch("/profile/:username/editpf", authenticateToken, async (c) => {
  const { username } = c.req.param();
  try {
    const body = await c.req.json();
    const updatedProfile = await prisma.user.update({
      where: {
        username,
      },
      data: body,
    });
    return c.json(updatedProfile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return c.json({ message: "Failed to update profile" }, 500);
  }
});

// Create post endpoint
app.post("/NavBar/create", async (c) => {
  try {
    const body = await c.req.json();

    // Example: Assuming logged-in user's ID is passed in the body
    const userId = body.userId;

    const newPost = await prisma.post.create({
      data: {
        content: body.content, // Assuming your post has a 'content' field
        author: { connect: { id: userId } }, // Connect post to the author
      },
    });

    return c.json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    return c.json({ error: "Could not create the post" }, 500);
  }
});

// Search username endpoint
app.get("/NavBar/search/:username", async (c) => {
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
      console.log("User not found");
      return c.json({ message: "User not found" }, 404); // 404 Not Found
    }

    console.log("User found", user);
    return c.json(user);
  } catch (error) {
    console.error("Error fetching user", error);
    return c.json({ error: "An error occurred while fetching the user" }, 500); // 500 Internal Server Error
  }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
