# Efficient Word Count — Obsidian Plugin

This plugin efficiently calculates and caches the word counts of all Markdown files in your vault, excluding configurable folders like Templates. It updates in real-time as files change, and caches results to disk to speed up startup and vault-wide statistics.

## Features

- Automatically builds a cache of word counts for all Markdown files.
- Excludes folders you specify (default: `Templates`, `.trash`).
- Listens to file create/modify/delete/rename events to update cache incrementally.
- Persists cache data on disk for fast startup.
- Exposes a global API (`window.wordCountCache`) with:
  - `get(path)` — word count for a specific file path
  - `total()` — total word count across all cached files

## Installation

Available via the Community Plugins browser. If you want to install it manually:

1. Clone or download this repository.
2. Copy the plugin folder into your Obsidian vault’s `.obsidian/plugins/efficient-wordcount/`.
3. Enable the plugin via **Settings > Community Plugins**.
4. Wait a few seconds on vault load for the cache to build.

## Usage

You can access the word counts in your DataviewJS scripts or custom scripts via the global object:

```js
// Get word count for a specific file path
const count = window.wordCountCache.get("Folder/Note.md");

// Get total word count in vault
const total = window.wordCountCache.total();
```