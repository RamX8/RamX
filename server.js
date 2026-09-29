const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const ADMIN_USERNAME = "LOVEKUSH76";

function isAdmin(user) {
  return user && user.username === ADMIN_USERNAME;
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.static(__dirname));

app.disable("x-powered-by");

try {
  db.exec(`
    ALTER TABLE posts
    ADD COLUMN media TEXT DEFAULT ''
  `);
} catch (error) {
  // media column already exists
}

const db = new DatabaseSync(
  path.join(__dirname, "love-life.db")
);

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN referral_code TEXT DEFAULT ''
  `);
} catch (error) {
  // referral_code already exists
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN love_points INTEGER DEFAULT 0
  `);
} catch (error) {
  // love_points column already exists
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN referral_code TEXT
  `);
} catch (error) {
  // referral_code column already exists
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN referred_by TEXT
  `);
} catch (error) {
  // referred_by column already exists
}


db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  bio TEXT DEFAULT '',
  message_privacy TEXT DEFAULT 'everyone',
account_privacy TEXT DEFAULT 'public',
photo TEXT DEFAULT '',
love_points INTEGER DEFAULT 0,
referral_code TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  UNIQUE(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  UNIQUE(follower_id,following_id));

CREATE TABLE IF NOT EXISTS follow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sender_id,receiver_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  post_id INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  UNIQUE(blocker_id,blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  UNIQUE(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  referral_code TEXT DEFAULT '',
  referred_by TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const sessions = new Map();

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN last_seen TEXT DEFAULT ''
  `);

  try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN message_privacy TEXT DEFAULT 'everyone'
  `);
} catch (error) {
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN account_privacy TEXT DEFAULT 'public'
  `);
} catch (error) {
}
  db.prepare(`
    UPDATE users
    SET last_seen = CURRENT_TIMESTAMP
    WHERE last_seen = ''
  `).run();

} catch (error) {
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN last_seen TEXT DEFAULT CURRENT_TIMESTAMP
  `);
} catch (error) {
}

function getUser(token) {
  const userId = sessions.get(token);

  if (!userId) return null;

  return db.prepare(`
    SELECT
      id,
      username,
      bio,
      photo,
      message_privacy,
      account_privacy,
      referral_code
    FROM users
    WHERE id=?
  `).get(userId);
}

/* HOME */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* HEALTH */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "RamX"
  });
});

/* WAITLIST */

app.post("/api/waitlist", (req, res) => {
  try {
    const username = cleanText(
      req.body.username,
      30
    );

    const referralCode = cleanText(
      req.body.referralCode,
      30
    );

    if (username.length < 3) {
      return res.status(400).json({
        message:
          "Username at least 3 characters ka hona chahiye."
      });
    }

    const existing = db.prepare(
      "SELECT id FROM waitlist WHERE username=?"
    ).get(username);

    if (existing) {
      return res.status(400).json({
        message:
          "Ye username already waitlist mein hai."
      });
    }

    db.prepare(`
      INSERT INTO waitlist
      (username,referral_code,referred_by)
      VALUES (?,?,?)
    `).run(
      username,
      referralCode,
      referralCode
    );

    const total = db.prepare(
      "SELECT COUNT(*) AS count FROM waitlist"
    ).get().count;

    res.json({
      message:
        "Waitlist joined successfully ❤️",
      position: Number(total)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Waitlist error."
    });
  }
});

/* SIGNUP */

app.post("/api/signup", async (req, res) => {
  try {
    const username = cleanText(
      req.body.username,
      30
    );

    const password =
      String(req.body.password || "");

    if (username.length < 3) {
      return res.status(400).json({
        message:
          "Username at least 3 characters ka hona chahiye."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password at least 6 characters ka hona chahiye."
      });
    }

    const exists = db.prepare(
      "SELECT id FROM users WHERE username=?"
    ).get(username);

    if (exists) {
      return res.status(400).json({
        message:
          "Username already exists."
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

      const referralCode =
  crypto.randomBytes(4).toString("hex").toUpperCase();

    db.prepare(`
  INSERT INTO users
  (username,password_hash,referral_code)
  VALUES (?,?,?)
`).run(
  username,
  passwordHash,
  referralCode
);

    res.json({
      message:
        "Account created successfully ❤️"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Signup error."
    });
  }
});

/* LOGIN */

function cleanText(value, maxLength = 100) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

app.post("/api/login", async (req, res) => {
  try {
    const username = cleanText(
      req.body.username,
      30
    );

    const password =
      String(req.body.password || "");

    const user = db.prepare(
      "SELECT * FROM users WHERE username=?"
    ).get(username);

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        message:
          "Invalid username or password."
      });
    }

    const token =
      crypto.randomBytes(32).toString("hex");

    sessions.set(token, user.id);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        photo: user.photo
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login error."
    });
  }
});

/* PROFILE */

app.get("/api/profile", (req, res) => {

  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  let profile = db.prepare(`
    SELECT
      id,
      username,
      bio,
      message_privacy,
      account_privacy,
      photo,
      love_points,
      referral_code
    FROM users
    WHERE id=?
  `).get(user.id);

  if (!profile) {
    return res.status(404).json({
      message: "Profile not found."
    });
  }

  if (!profile.referral_code) {

    const referralCode =
      crypto.randomBytes(4).toString("hex").toUpperCase();

    db.prepare(`
      UPDATE users
      SET referral_code=?
      WHERE id=?
    `).run(referralCode, user.id);

    profile.referral_code = referralCode;
  }

  res.json(profile);
});

app.put("/api/account-privacy", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const privacy =
    String(req.body.account_privacy || "");

  if (
    privacy !== "public" &&
    privacy !== "private"
  ) {
    return res.status(400).json({
      message: "Invalid account privacy setting."
    });
  }

  db.prepare(`
    UPDATE users
    SET account_privacy=?
    WHERE id=?
  `).run(
    privacy,
    user.id
  );

  res.json({
    message: "Account privacy updated.",
    account_privacy: privacy
  });
});

/* POSTS */

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN message_privacy TEXT DEFAULT 'everyone'
  `);
} catch (error) {
}


app.post("/api/posts", (req, res) => {
  try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN message_privacy TEXT DEFAULT 'everyone'
  `);
} catch (error) {
}

try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN account_privacy TEXT DEFAULT 'public'
  `);
} catch (error) {
}
  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const content =
    cleanText(req.body.content, 500);
    const media =
  String(req.body.media || "").slice(0, 4000000);

  if (!content) {
    return res.status(400).json({
      message: "Post empty hai."
    });
  }

  db.prepare(`
  INSERT INTO posts
  (user_id,content,media)
  VALUES (?,?,?)
`).run(
  user.id,
  content,
  media
);
  

  res.json({
    message:
      "Post created ❤️"

  });
});

/* ADMIN / MODERATION */

app.get("/api/admin/reports", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  if (!isAdmin(user)) {
  return res.status(403).json({
    message: "Admin access required."
  });
}

  const reports = db.prepare(`
    SELECT
      reports.id,
      reports.target_type,
      reports.target_id,
      reports.reason,
      reports.created_at,
      users.username AS reporter
    FROM reports
    JOIN users
      ON users.id = reports.reporter_id
    ORDER BY reports.id DESC
  `).all();

  res.json(reports);
});

app.delete("/api/admin/reports/:id", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  if (!isAdmin(user)) {
  return res.status(403).json({
    message: "Admin access required."
  });
}

  const reportId = Number(req.params.id);

  db.prepare(`
    DELETE FROM reports
    WHERE id=?
  `).run(reportId);

  res.json({
    message: "Report handled."
  });
});

/* FEED */

app.get("/api/feed", (req, res) => {
  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const posts = db.prepare(`
    SELECT
      posts.id,
      posts.content,
      posts.media,
      posts.created_at,
      users.username,
      users.photo,

      (
        SELECT COUNT(*)
        FROM likes
        WHERE likes.post_id=posts.id
      ) AS likes,

      (
        SELECT COUNT(*)
        FROM comments
        WHERE comments.post_id=posts.id
      ) AS comments,

      EXISTS(
        SELECT 1
        FROM likes
        WHERE likes.post_id=posts.id
        AND likes.user_id=?
      ) AS liked

    FROM posts

    JOIN users
    ON users.id=posts.user_id

    ORDER BY
  (
    likes * 2 +
    comments * 3 +
    (SELECT COUNT(*)
     FROM follows
     WHERE follows.follower_id = ?
     AND follows.following_id = posts.user_id) * 5
  ) DESC,
  posts.id DESC

  `).all(user.id);

  res.json(posts);
});

/* EDIT POST */

app.put("/api/posts/:id", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);
  const content = cleanText(req.body.content, 500);

  if (!content) {
    return res.status(400).json({
      message: "Post empty hai."
    });
  }

  const post = db.prepare(
    "SELECT user_id FROM posts WHERE id=?"
  ).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  if (post.user_id !== user.id) {
    return res.status(403).json({
      message: "You can edit only your own post."
    });
  }

  db.prepare(`
    UPDATE posts
    SET content=?
    WHERE id=?
  `).run(content, postId);

  res.json({
    message: "Post updated ❤️"
  });
});


/* DELETE POST */

app.delete("/api/posts/:id", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);

  const post = db.prepare(
    "SELECT user_id FROM posts WHERE id=?"
  ).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  if (post.user_id !== user.id) {
    return res.status(403).json({
      message: "You can delete only your own post."
    });
  }

  db.prepare(
    "DELETE FROM posts WHERE id=?"
  ).run(postId);

  res.json({
    message: "Post deleted."
  });
  });
/* EDIT POST */


/* LIKE */

app.post("/api/posts/:id/like", (req, res) => {

  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);

  const post = db.prepare(`
    SELECT user_id
    FROM posts
    WHERE id=?
  `).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  const existing = db.prepare(`
    SELECT id
    FROM likes
    WHERE post_id=?
    AND user_id=?
  `).get(postId, user.id);

  if (existing) {

    db.prepare(`
      DELETE FROM likes
      WHERE post_id=?
      AND user_id=?
    `).run(postId, user.id);

    return res.json({
      liked: false
    });
  }

  db.prepare(`
    INSERT INTO likes
    (post_id,user_id)
    VALUES (?,?)
  `).run(postId, user.id);

  // Post owner gets +1 RamX Point
  if (post.user_id !== user.id) {

    db.prepare(`
      UPDATE users
      SET love_points = love_points + 1
      WHERE id=?
    `).run(post.user_id);

    db.prepare(`
      INSERT INTO notifications
      (user_id,from_user_id,type,post_id)
      VALUES (?,?,?,?)
    `).run(
      post.user_id,
      user.id,
      "like",
      postId
    );
  }

  res.json({
    liked: true
  });

});

/* SAVE / UNSAVE POST */

  app.post("/api/posts/:id/save", (req, res) => {

  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);

  const post = db.prepare(
    "SELECT id FROM posts WHERE id=?"
  ).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  const saved = db.prepare(
    "SELECT id FROM saved_posts WHERE post_id=? AND user_id=?"
  ).get(postId, user.id);

  if (saved) {
    db.prepare(
      "DELETE FROM saved_posts WHERE post_id=? AND user_id=?"
    ).run(postId, user.id);

    return res.json({
      message: "Post unsaved.",
      saved: false
    });
  }

  db.prepare(
    "INSERT INTO saved_posts (post_id,user_id) VALUES (?,?)"
  ).run(postId, user.id);

  res.json({
    message: "Post saved 🔖",
    saved: true
  });
});

app.post("/api/posts/:id/repost", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);

  const post = db.prepare(`
    SELECT content, media
    FROM posts
    WHERE id=?
  `).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  db.prepare(`
    INSERT INTO posts
    (user_id, content, media)
    VALUES (?, ?, ?)
  `).run(
    user.id,
    "🔁 Reposted: " + post.content,
    post.media || ""
  );

  res.json({
    message: "Post reposted 🔁"
  });
});

/* SAVED POSTS */

app.get("/api/saved-posts", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const posts = db.prepare(`
    SELECT
      posts.id,
      posts.user_id,
      posts.content,
      posts.media,
      posts.created_at,
      users.username
    FROM saved_posts
    JOIN posts ON saved_posts.post_id = posts.id
    JOIN users ON posts.user_id = users.id
    WHERE saved_posts.user_id=?
    ORDER BY saved_posts.id DESC
  `).all(user.id);

  res.json(posts);
});

/* COMMENTS */

app.get(
  "/api/posts/:id/comments",
  (req, res) => {

    const user =
      getUser(req.headers.authorization);

    if (!user) {
      return res.status(401).json({
        message: "Please login."
      });
    }

    const comments = db.prepare(`
      SELECT
        comments.id,
        comments.content,
        comments.created_at,
        users.username

      FROM comments

      JOIN users
      ON users.id=comments.user_id

      WHERE comments.post_id=?

      ORDER BY comments.id ASC
    `).all(
      Number(req.params.id)
    );

    res.json(comments);
  }
);

app.post(
  "/api/posts/:id/comments",
  (req, res) => {

    const user =
      getUser(req.headers.authorization);

    if (!user) {
      return res.status(401).json({
        message: "Please login."
      });
    }

    const postId =
      Number(req.params.id);

    const content =
      cleanText(req.body.content, 300);

    if (!content) {
      return res.status(400).json({
        message: "Comment empty hai."
      });
    }

    db.prepare(`
      INSERT INTO comments
      (post_id,user_id,content)
      VALUES (?,?,?)
    `).run(
      postId,
      user.id,
      content
    );

    const post = db.prepare(`
      SELECT user_id
      FROM posts
      WHERE id=?
    `).get(postId);

    if (post && post.user_id !== user.id) {

      db.prepare(`
        INSERT INTO notifications
        (user_id,from_user_id,type,post_id)
        VALUES (?,?,?,?)
      `).run(
        post.user_id,
        user.id,
        "comment",
        postId
      );

    }

    res.json({
      message:
        "Comment added 💬"
    });
  }
);

/* SEARCH */

app.get("/api/search", (req, res) => {
  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const q =
    cleanText(req.query.q, 30);

  const users = db.prepare(`
    SELECT
      id,
      username,
      bio,
      photo

    FROM users

    WHERE username LIKE ?

    LIMIT 20
  `).all(
    "%" + q + "%"
  );

  res.json(users);
});

app.get("/api/users/:id", (req, res) => {

  const userId = Number(req.params.id);

  const user = db.prepare(`
    SELECT
      id,
      username,
      bio,
      photo
    FROM users
    WHERE id=?
  `).get(userId);

  if (!user) {
    return res.status(404).json({
      message: "User not found."
    });
  }

  res.json(user);
});

app.get("/api/users/:id/posts", (req, res) => {

  const userId = Number(req.params.id);

  const posts = db.prepare(`
    SELECT
      posts.id,
      posts.user_id,
      posts.content,
      posts.media,
      posts.created_at,
      users.username
    FROM posts
    JOIN users
      ON posts.user_id = users.id
    WHERE posts.user_id = ?
    ORDER BY posts.id DESC
  `).all(userId);

  res.json(posts);
});


/* FOLLOW */

app.post(
  "/api/users/:id/follow",
  (req, res) => {

    const user =
      getUser(req.headers.authorization);

    if (!user) {
      return res.status(401).json({
        message: "Please login."
      });
    }

    const targetId =
      Number(req.params.id);

      const targetUser = db.prepare(`
  SELECT account_privacy
  FROM users
  WHERE id=?
`).get(targetId);

if (!targetUser) {
  return res.status(404).json({
    message: "User not found."
  });
}

    if (targetId === user.id) {
      return res.status(400).json({
        message:
          "You cannot follow yourself."
      });
    }

    const existing =
      db.prepare(`
        SELECT *
        FROM follows
        WHERE follower_id=?
        AND following_id=?
      `).get(
        user.id,
        targetId
      );

      if (targetUser.account_privacy === "private") {

  const existingRequest = db.prepare(`
  SELECT *
  FROM follow_requests
  WHERE sender_id=?
  AND receiver_id=?
  AND status='pending'
`).get(
  user.id,
  targetId
);

if (existingRequest) {
  return res.json({
    following: false,
    requested: true
  });
}

const rejectedRequest = db.prepare(`
  SELECT id
  FROM follow_requests
  WHERE sender_id=?
  AND receiver_id=?
  AND status='rejected'
`).get(
  user.id,
  targetId
);

if (rejectedRequest) {

  db.prepare(`
    UPDATE follow_requests
    SET status='pending',
        created_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(rejectedRequest.id);

  return res.json({
    following: false,
    requested: true,
    message: "Follow request sent."
  });
}

  if (existingRequest) {
    return res.json({
      following: false,
      requested: true
    });
  }

  console.log("FOLLOW REQUEST:", user.id, "→", targetId);

  db.prepare(`
  INSERT INTO follow_requests
  (sender_id,receiver_id)
  VALUES (?,?)
  ON CONFLICT(sender_id,receiver_id)
  DO UPDATE SET
    status='pending',
    created_at=CURRENT_TIMESTAMP
`).run(
  user.id,
  targetId
);

  return res.json({
    following: false,
    requested: true,
    message: "Follow request sent."
  });
}

    if (existing) {

      db.prepare(`
        DELETE FROM follows
        WHERE follower_id=?
        AND following_id=?
      `).run(
        user.id,
        targetId
      );

      return res.json({
        following: false
      });
    }

    db.prepare(`
      INSERT INTO follows
      (follower_id,following_id)
      VALUES (?,?)
    `).run(
      user.id,
      targetId
    );

    db.prepare(`
      INSERT INTO notifications
      (user_id,from_user_id,type)
      VALUES (?,?,?)
    `).run(
      targetId,
      user.id,
      "follow"
    );

    res.json({
      following: true
    });
  }
);

app.get("/api/notifications", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const notifications = db.prepare(`
    SELECT
      notifications.id,
      notifications.type,
      notifications.post_id,
      notifications.created_at,
      notifications.is_read,
      users.username
    FROM notifications
    JOIN users
      ON users.id = notifications.from_user_id
    WHERE notifications.user_id=?
    ORDER BY notifications.id DESC
  `).all(user.id);

  res.json(notifications);
});

app.get("/api/follow-requests", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const requests = db.prepare(`
    SELECT
      follow_requests.id,
      follow_requests.sender_id,
      users.username,
      users.bio
    FROM follow_requests
    JOIN users
      ON users.id = follow_requests.sender_id
    WHERE follow_requests.receiver_id=?
    AND follow_requests.status='pending'
    ORDER BY follow_requests.id DESC
  `).all(user.id);

  res.json(requests);
});


/* FOLLOWING */

app.get("/api/users/:id/following", (req, res) => {});

  

app.get("/api/users/:id/followers", (req, res) => {

  const userId = Number(req.params.id);

  const followers = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.bio
    FROM follows
    JOIN users
      ON follows.follower_id = users.id
    WHERE follows.following_id = ?
    ORDER BY users.username ASC
  `).all(userId);

  res.json(followers);
});

/* BLOCK */

app.post(
  "/api/users/:id/block",
  (req, res) => {

    const user =
      getUser(req.headers.authorization);

    if (!user) {
      return res.status(401).json({
        message: "Please login."
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO blocks
      (blocker_id,blocked_id)
      VALUES (?,?)
    `).run(
      user.id,
      Number(req.params.id)
    );

    res.json({
      message:
        "User blocked."
    });
  }
);

/* REPORT */

app.post("/api/report", (req, res) => {
  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const targetType =
    cleanText(
      req.body.targetType,
      30
    );

  const targetId =
    Number(req.body.targetId);

  const reason =
    cleanText(
      req.body.reason,
      200
    );

  if (
    !targetType ||
    !targetId ||
    !reason
  ) {
    return res.status(400).json({
      message:
        "Report details required."
    });
  }

  db.prepare(`
    INSERT INTO reports
    (reporter_id,target_type,target_id,reason)
    VALUES (?,?,?,?)
  `).run(
    user.id,
    targetType,
    targetId,
    reason
  );

  res.json({
    message:
      "Report submitted."
  });
});

/* CHANGE PASSWORD */

app.put("/api/change-password", async (req, res) => {
  try {
    const user =
      getUser(req.headers.authorization);

    if (!user) {
      return res.status(401).json({
        message: "Please login."
      });
    }

    const currentPassword =
      String(req.body.currentPassword || "");

    const newPassword =
      String(req.body.newPassword || "");

    const confirmPassword =
      String(req.body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "All password fields are required."
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password at least 6 characters ka hona chahiye."
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New passwords match nahi karte."
      });
    }

    const fullUser = db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(user.id);

    const valid =
      await bcrypt.compare(
        currentPassword,
        fullUser.password_hash
      );

    if (!valid) {
      return res.status(401).json({
        message: "Current password galat hai."
      });
    }

    const passwordHash =
      await bcrypt.hash(newPassword, 12);

    db.prepare(`
      UPDATE users
      SET password_hash=?
      WHERE id=?
    `).run(
      passwordHash,
      user.id
    );

    res.json({
      message: "Password changed successfully ❤️"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Change password error."
    });
  }
});



/* LOGOUT */

app.post("/api/logout", (req, res) => {

  const token =
    req.headers.authorization;

  if (token) {
    sessions.delete(token);
  }

  res.json({
    message:
      "Logged out."
  });
});

app.post("/api/posts/:id/repost", (req, res) => {
  const user = getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const postId = Number(req.params.id);

  const post = db.prepare(`
    SELECT content, media
    FROM posts
    WHERE id=?
  `).get(postId);

  if (!post) {
    return res.status(404).json({
      message: "Post not found."
    });
  }

  db.prepare(`
    INSERT INTO posts
    (user_id, content, media)
    VALUES (?, ?, ?)
  `).run(
    user.id,
    "🔁 Reposted: " + post.content,
    post.media || ""
  );

  res.json({
    message: "Post reposted 🔁"
  });
});


app.post("/api/messages", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const receiverId =
    Number(req.body.receiver_id);

  const content =
    cleanText(req.body.content, 1000);

  if (!receiverId || !content) {
    return res.status(400).json({
      message:
        "Receiver aur message required hai."
    });
  }

  const receiver = db.prepare(`
    SELECT id, message_privacy
    FROM users
    WHERE id=?
  `).get(receiverId);

  if (!receiver) {
    return res.status(404).json({
      message: "User not found."
    });
  }

  if (receiverId === user.id) {
    return res.status(400).json({
      message:
        "You cannot message yourself."
    });
  }

  if (receiver.message_privacy === "nobody") {
    return res.status(403).json({
      message:
        "This user does not accept messages."
    });
  }

  if (receiver.message_privacy === "following") {

    const follows = db.prepare(`
      SELECT 1
      FROM follows
      WHERE follower_id=?
      AND following_id=?
    `).get(
      receiverId,
      user.id
    );

    if (!follows) {
      return res.status(403).json({
        message:
          "This user only accepts messages from people they follow."
      });
    }
  }

  db.prepare(`
    INSERT INTO messages
    (sender_id, receiver_id, content)
    VALUES (?, ?, ?)
  `).run(
    user.id,
    receiverId,
    content
  );

  res.json({
    message: "Message sent 💬"
  });

});


app.get("/api/messages/:userId", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const otherUserId =
    Number(req.params.userId);

    db.prepare(`
  UPDATE messages
  SET is_read = 1
  WHERE sender_id = ?
  AND receiver_id = ?
  AND is_read = 0
`).run(
  otherUserId,
  user.id
);

  const messages = db.prepare(`
    SELECT
      messages.id,
      messages.sender_id,
      messages.receiver_id,
      messages.content,
      messages.created_at,
      users.username
    FROM messages
    JOIN users
      ON users.id = messages.sender_id
    WHERE
      (messages.sender_id = ? AND messages.receiver_id = ?)
      OR
      (messages.sender_id = ? AND messages.receiver_id = ?)
    ORDER BY messages.id ASC
  `).all(
    user.id,
    otherUserId,
    otherUserId,
    user.id
  );

  res.json(messages);
});

app.post("/api/heartbeat", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  db.prepare(`
    UPDATE users
    SET last_seen=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(user.id);

  res.json({
    online: true
  });
});

app.get("/api/users/:id/status", (req, res) => {

  const userId = Number(req.params.id);

  const user = db.prepare(`
    SELECT last_seen
    FROM users
    WHERE id=?
  `).get(userId);

  if (!user) {
    return res.status(404).json({
      message: "User not found."
    });
  }

  const lastSeen =
    new Date(user.last_seen + "Z").getTime();

  const now =
    Date.now();

  const online =
    (now - lastSeen) < 60000;

  res.json({
    online,
    last_seen: user.last_seen
  });
});

const typingUsers = new Map();

app.post("/api/messages/typing", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const receiverId =
    Number(req.body.receiver_id);

  if (!receiverId) {
    return res.status(400).json({
      message: "Receiver required."
    });
  }

  typingUsers.set(
    user.id + "_" + receiverId,
    Date.now()
  );

  res.json({
    typing: true
  });
});


app.get("/api/messages/:userId/typing", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const otherUserId =
    Number(req.params.userId);

  const key =
    otherUserId + "_" + user.id;

  const lastTyping =
    typingUsers.get(key) || 0;

  const typing =
    Date.now() - lastTyping < 3000;

  res.json({
    typing
  });
});

app.delete("/api/messages/:id", (req, res) => {

  const user =
    getUser(req.headers.authorization);

  if (!user) {
    return res.status(401).json({
      message: "Please login."
    });
  }

  const messageId =
    Number(req.params.id);

  const message = db.prepare(`
    SELECT id, sender_id
    FROM messages
    WHERE id=?
  `).get(messageId);

  if (!message) {
    return res.status(404).json({
      message: "Message not found."
    });
  }

  if (message.sender_id !== user.id) {
    return res.status(403).json({
      message: "You can delete only your own message."
    });
  }

  db.prepare(`
    DELETE FROM messages
    WHERE id=?
  `).run(messageId);

  res.json({
    message: "Message deleted."
  });
});


/* START SERVER */


app.listen(PORT, () => {
  console.log(`
    RamX server running at http://localhost:${PORT}`
  );
});