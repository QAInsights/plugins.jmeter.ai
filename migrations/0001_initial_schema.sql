-- Migration: 0001_initial_schema.sql
-- Description: Sets up tables for Users, Favorites, Collections, Reviews, Ratings, and Watchers

-- 1. Users Table (Maps Clerk Auth to D1)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,               -- Clerk User ID (e.g. user_2N...)
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 2. User Favorites (Replaces client-only localStorage)
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, plugin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_fav_plugin ON user_favorites(plugin_id);

-- 3. User Custom Collections
CREATE TABLE IF NOT EXISTS user_collections (
    id TEXT PRIMARY KEY,               -- UUID / slug
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,       -- 0: private, 1: shareable public
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_plugins (
    collection_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    added_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (collection_id, plugin_id),
    FOREIGN KEY (collection_id) REFERENCES user_collections(id) ON DELETE CASCADE
);

-- 4. Community Ratings & Reviews
CREATE TABLE IF NOT EXISTS plugin_reviews (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    is_recommended INTEGER CHECK(is_recommended IN (0, 1)),
    title TEXT,
    body TEXT,
    jmeter_version_used TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_plugin ON plugin_reviews(plugin_id);

-- 5. Plugin Watchers & Release Notification Subscriptions
CREATE TABLE IF NOT EXISTS plugin_watchers (
    user_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    notify_email INTEGER DEFAULT 1,
    notify_abandoned_alert INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, plugin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Plugin Historical Statistics
CREATE TABLE IF NOT EXISTS plugin_stats_history (
    plugin_id TEXT NOT NULL,
    date TEXT NOT NULL,                 -- YYYY-MM-DD
    downloads INTEGER NOT NULL,
    weekly_delta INTEGER DEFAULT 0,
    health_score INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (plugin_id, date)
);
CREATE INDEX IF NOT EXISTS idx_stats_date ON plugin_stats_history(date);

-- 7. Automated Ingestion & Sync Logs
CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    plugins_processed INTEGER,
    new_versions_detected INTEGER,
    execution_time_ms INTEGER,
    error_message TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);
